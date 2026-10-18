param(
    [string]$ZipPath = "",
    [string]$SigningKey = $env:AUDIT_SIGNING_KEY
)

if (-not $ZipPath -or -not (Test-Path -LiteralPath $ZipPath)) {
    Write-Error "Please specify a valid path to the exported zip file via -ZipPath"
    exit 1
}

# Create a temporary directory for extraction - one of its own per run. A name from the clock
# (Get-Date -UFormat "%s") was shared by two checks started together, and the second one removed
# and refilled the first one's files, so a check could read the other archive's files.
$tempDir = Join-Path $PSScriptRoot ("tmp_verify_extract_" + [guid]::NewGuid().ToString("N"))
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

Write-Output "Extracting archive to: $tempDir"
Expand-Archive -LiteralPath $ZipPath -DestinationPath $tempDir -Force

$manifestPath = Join-Path $tempDir "manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Error "Verification failed: manifest.json is missing in the archive."
    Remove-Item -Recurse -Force $tempDir
    exit 1
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json

Write-Output "Manifest metadata:"
Write-Output " - Timestamp: $($manifest.exportTimestamp)"
Write-Output " - Version: $($manifest.platformVersion)"
Write-Output " - Files count: $($manifest.filesCount)"
Write-Output " - Signed: $($manifest.signed)"

# 1. Verify individual file hashes
Write-Output "Verifying file integrity..."
$allPassed = $true
$canonicalManifest = ""

# Sort files by path to build the canonical representation
$sortedFiles = $manifest.files | Sort-Object -Property path
# SEC-c41f149-05.
$extractRoot = [System.IO.Path]::GetFullPath($tempDir).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$listed = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
foreach ($file in $sortedFiles) {
    $relPath = [string]$file.path
    $segments = @($relPath -split '[\\/]')
    if (-not $relPath -or [System.IO.Path]::IsPathRooted($relPath) -or $relPath.Contains(':') -or ($segments -contains '..')) {
        Write-Warning "Manifest path is not a file of this archive: $relPath"
        $allPassed = $false
        continue
    }
    $filePath = [System.IO.Path]::GetFullPath((Join-Path $tempDir $relPath))
    if (-not $filePath.StartsWith($extractRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Warning "Manifest path is not a file of this archive: $relPath"
        $allPassed = $false
        continue
    }
    # SEC-c41f149-02.
    if (-not $listed.Add($relPath.Replace('\', '/'))) {
        Write-Warning "Manifest lists a file twice: $relPath"
        $allPassed = $false
        continue
    }
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        Write-Warning "File missing: $relPath"
        $allPassed = $false
        continue
    }

    $localHash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLower()
    if ($localHash -ne $file.sha256) {
        Write-Warning "Hash mismatch for ${relPath}: expected $($file.sha256)"
        $allPassed = $false
    }

    $canonicalManifest += $file.path + ":" + $file.sha256 + ";"
}

# SEC-c41f149-02.
foreach ($entry in @(Get-ChildItem -LiteralPath $tempDir -Recurse -File -Force)) {
    $entryPath = $entry.FullName.Substring($extractRoot.Length).Replace('\', '/')
    if ($entryPath -eq 'manifest.json') { continue }
    if (-not $listed.Contains($entryPath)) {
        Write-Warning "File in the archive that the manifest does not list: $entryPath"
        $allPassed = $false
    }
}

if (-not $allPassed) {
    Write-Error "Verification failed: Individual file hashes did not match manifest records."
    Remove-Item -Recurse -Force $tempDir
    exit 1
}
Write-Output "[OK] All file hashes match manifest records successfully."

# 2. Verify manifest hash
$sha = [System.Security.Cryptography.SHA256]::Create()
$manifestHashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($canonicalManifest))
$localManifestHash = [System.BitConverter]::ToString($manifestHashBytes).Replace("-", "").ToLower()

if ($manifest.manifestHash -and $manifest.manifestHash -ne $localManifestHash) {
    Write-Error "Verification failed: Manifest hash mismatch (expected $($manifest.manifestHash), calculated $localManifestHash)."
    Remove-Item -Recurse -Force $tempDir
    exit 1
}
Write-Output "[OK] Manifest digest verified successfully ($localManifestHash)."

# 3. Authenticity. Checksums that agree with each other say the archive is
# internally consistent; they say nothing about who issued it. Only a verified
# signature does that, so only a verified signature ends in SUCCESS.
#
# Exit codes follow scripts/verify-pack.mjs, deliberately:
#   0  verified -- integrity and authenticity
#   1  verification failed -- something does not match
#   2  could not run the check -- "I could not tell" is not "it is forged"
#
# Until now every path here fell through to "Verification complete: SUCCESS.":
# an archive that carries no signature at all, and a signed archive whose
# signature nobody checked because no key was supplied, both ended in the same
# word as a fully verified one. That is the sentence a reader takes away.
if ($manifest.signed) {
    if ($SigningKey) {
        $hmac = New-Object System.Security.Cryptography.HMACSHA256
        $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($SigningKey)
        $sigBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($localManifestHash))
        $localSignature = [System.BitConverter]::ToString($sigBytes).Replace("-", "").ToLower()

        if ($localSignature -eq $manifest.signature) {
            Write-Output "[OK] Cryptographic signature is valid and authentic."
        } else {
            Write-Error "Verification failed: Invalid signature! The manifest has been tampered with or signed with a different key."
            Remove-Item -Recurse -Force $tempDir
            exit 1
        }
    } else {
        Remove-Item -Recurse -Force $tempDir
        Write-Warning "Contents and manifest agree, but authenticity was NOT checked: the archive is signed and no -SigningKey (or env:AUDIT_SIGNING_KEY) was supplied."
        Write-Output "Verification incomplete: INTEGRITY ONLY. Supply the signing key to establish who issued this archive."
        exit 2
    }
} else {
    Remove-Item -Recurse -Force $tempDir
    Write-Warning "This archive carries no signature, so nothing here establishes who produced it."
    Write-Output "Verification incomplete: INTEGRITY ONLY. An unsigned archive proves only that it is consistent with itself."
    exit 2
}

# Clean up
Remove-Item -Recurse -Force $tempDir
Write-Output "Verification complete: SUCCESS -- contents, manifest and signature all agree."
