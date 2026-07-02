param(
    [string]$SourceDir = "",
    [string]$OutputZip = ""
)

# Portable path resolution (Finding 9)
if (-not $SourceDir) {
    $SourceDir = Resolve-Path (Join-Path $PSScriptRoot "..")
}
if (-not $OutputZip) {
    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $OutputZip = Join-Path $desktopPath "clean-core-src.zip"
}

$tempDir = Join-Path $SourceDir "tmp_archive_src"

# Clean any existing temp dir or zip
if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
if (Test-Path -LiteralPath $OutputZip) { Remove-Item -LiteralPath $OutputZip -Force }

# Create temp dir
New-Item -ItemType Directory -Path $tempDir | Out-Null

# List of folders/files to exclude (Codex F-07 compliance + Finding 11 + env.example preservation)
$excludePatterns = @(
    "node_modules",
    ".git",
    ".next",
    ".agents",
    ".antigravity",
    "scratch",
    "playwright-report",
    "test-results",
    "dist",
    "tmp",
    "tmp_archive_src",
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    "*.log",
    "*.tsbuildinfo",
    "*.bak",
    "*.zip",
    "*.key",
    "*.pem",
    "*.p12",
    "*.crt",
    "*serviceAccount*.json",
    "*credentials*.json"
)

# Get all files, filter out the excluded directories and files
# CRITICAL: Use -LiteralPath to handle Next.js dynamic routes with square brackets
# e.g. [projectId] — PowerShell treats [] as wildcard globs with -Path
Get-ChildItem -LiteralPath $SourceDir -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($SourceDir.Length + 1)
    if ($relativePath -eq "") { return }
    
    # Check if this path should be excluded
    $exclude = $false
    foreach ($pattern in $excludePatterns) {
        if ($relativePath -like "$pattern" -or $relativePath -like "$pattern\*" -or $relativePath.Contains("\$pattern\")) {
            $exclude = $true
            break
        }
    }
    
    if (-not $exclude -and -not $_.PSIsContainer) {
        # Copy to temp directory maintaining folder structure
        $targetFile = Join-Path $tempDir $relativePath
        $targetSubDir = Split-Path $targetFile -Parent
        if (-not (Test-Path -LiteralPath $targetSubDir)) {
            New-Item -ItemType Directory -Path $targetSubDir | Out-Null
        }
        Copy-Item -LiteralPath $_.FullName -Destination $targetFile -Force
    }
}

# Read platform version dynamically from package.json (Finding P1)
$packageJsonPath = Join-Path $SourceDir "package.json"
$platformVersion = "v1.0.0"
if (Test-Path -LiteralPath $packageJsonPath) {
    $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
    if ($packageJson.version) {
        $platformVersion = "v" + $packageJson.version
    }
}

# Generate manifest.json (Finding 10)
$manifestFiles = @()
Get-ChildItem -LiteralPath $tempDir -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    $fileHash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()
    $fileSize = $_.Length
    $relPath = $_.FullName.Substring($tempDir.Length + 1).Replace("\", "/")
    
    $manifestFiles += [PSCustomObject]@{
        path = $relPath
        sha256 = $fileHash
        sizeBytes = $fileSize
    }
}

# Calculate canonical representation of files for hashing and signing (Finding P1)
$canonicalManifest = ""
$sortedManifestFiles = $manifestFiles | Sort-Object -Property path
foreach ($file in $sortedManifestFiles) {
    $canonicalManifest += $file.path + ":" + $file.sha256 + ";"
}

# Compute manifestHash
$sha = [System.Security.Cryptography.SHA256]::Create()
$manifestHashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($canonicalManifest))
$manifestHash = [System.BitConverter]::ToString($manifestHashBytes).Replace("-", "").ToLower()

# Check for signing key and generate HMAC signature
$signingKey = $env:AUDIT_SIGNING_KEY
$signatureHex = ""
$signedByKey = $false

if ($signingKey) {
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($signingKey)
    $sigBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($manifestHash))
    $signatureHex = [System.BitConverter]::ToString($sigBytes).Replace("-", "").ToLower()
    $signedByKey = $true
}

$manifestObj = [PSCustomObject]@{
    exportTimestamp = (Get-Date -Format "o")
    platformVersion = $platformVersion
    exclusionRules = $excludePatterns
    filesCount = $manifestFiles.Count
    manifestHash = $manifestHash
    signature = $signatureHex
    signed = $signedByKey
    files = $manifestFiles
}

$manifestJsonPath = Join-Path $tempDir "manifest.json"
$manifestObj | ConvertTo-Json -Depth 10 | Out-File -FilePath $manifestJsonPath -Encoding utf8

# Zip the temp directory
Compress-Archive -Path "$tempDir\*" -DestinationPath $OutputZip -Force

# Clean up temp directory
Remove-Item -LiteralPath $tempDir -Recurse -Force

Write-Output "Zip archive successfully created at: $OutputZip"
Write-Output "Platform version: $platformVersion"
Write-Output "Files exported: $($manifestFiles.Count)"
