param(
    [string]$ZipPath = "",
    [string]$SigningKey = $env:AUDIT_SIGNING_KEY
)

if (-not $ZipPath -or -not (Test-Path $ZipPath)) {
    Write-Error "Please specify a valid path to the exported zip file via -ZipPath"
    exit 1
}

# Create a temporary directory for extraction
$tempDir = Join-Path $PSScriptRoot ("tmp_verify_extract_" + (Get-Date -UFormat "%s"))
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

Write-Output "Extracting archive to: $tempDir"
Expand-Archive -Path $ZipPath -DestinationPath $tempDir -Force

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
foreach ($file in $sortedFiles) {
    $filePath = Join-Path $tempDir $file.path
    if (-not (Test-Path $filePath)) {
        Write-Warning "File missing: $($file.path)"
        $allPassed = $false
        continue
    }
    
    $localHash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()
    if ($localHash -ne $file.sha256) {
        Write-Warning "Hash mismatch for $($file.path): expected $($file.sha256), got $localHash"
        $allPassed = $false
    }
    
    $canonicalManifest += $file.path + ":" + $file.sha256 + ";"
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

# 3. Verify HMAC signature if key is supplied
if ($manifest.signed) {
    if ($SigningKey) {
        $hmac = New-Object System.Security.Cryptography.HMACSHA256
        $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($SigningKey)
        $sigBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($canonicalManifest))
        $localSignature = [System.BitConverter]::ToString($sigBytes).Replace("-", "").ToLower()
        
        if ($localSignature -eq $manifest.signature) {
            Write-Output "[OK] Cryptographic signature is valid and authentic."
        } else {
            Write-Error "Verification failed: Invalid signature! The manifest has been tampered with or signed with a different key."
            Remove-Item -Recurse -Force $tempDir
            exit 1
        }
    } else {
        Write-Warning "Archive is signed, but no -SigningKey or env:AUDIT_SIGNING_KEY was provided to verify authenticity."
    }
} else {
    Write-Output "Archive is not signed."
}

# Clean up
Remove-Item -Recurse -Force $tempDir
Write-Output "Verification complete: SUCCESS."
