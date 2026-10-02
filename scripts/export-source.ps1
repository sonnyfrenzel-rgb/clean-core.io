<#
.SYNOPSIS
    Exports the Clean-Core.io code base as a secret-free, hashed ZIP.

.DESCRIPTION
    The only source is "git archive HEAD" — that is, only versioned files.
    Anything .gitignore protects (.env*, .claude/, node_modules/, scratch/,
    migration/, logs) therefore cannot get into the archive in the first
    place. That is the decisive difference from the earlier version, which
    walked the file system and had to rely on a hand-maintained exclusion
    list.

    Then three layers of protection:
      1. Deny list   — deletes key files, in case one was ever committed.
      2. Secret scan — regex over every text file; a hit aborts and NO ZIP
                       is produced (fail closed). Two known hits, proven
                       harmless, are allowlisted by name with a reason and
                       are always logged.
      3. Manifest    — SHA-256 per file, overall digest, optionally HMAC-signed.

.PARAMETER WorkingTree
    Exports the working copy instead of HEAD, without having to commit:
    "git stash create" makes a throwaway snapshot of the tracked changes,
    which is then archived. Untracked files stay out — git does not know
    them, and that is exactly why no secret can slip in.

.PARAMETER AllowDirty
    Exports HEAD although the working directory is dirty. Without one of the
    two switches the script aborts, because otherwise the archive would
    silently show something other than the working copy.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\export-source.ps1
#>
param(
    [string]$SourceDir = "",
    [string]$OutputZip = "",
    [switch]$WorkingTree,
    [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Write-Bad($msg)  { Write-Host "    [X]  $msg" -ForegroundColor Red }

# ---------------------------------------------------------------- 0. Context
if (-not $SourceDir) {
    $SourceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$SourceDir = $SourceDir.TrimEnd('\')

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found." }
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) { throw "tar not found." }

Write-Step "Checking repository: $SourceDir"

$inside = & git -C $SourceDir rev-parse --is-inside-work-tree
if ($LASTEXITCODE -ne 0 -or "$inside".Trim() -ne 'true') {
    throw "$SourceDir is not a Git working directory. The export needs Git as the source of truth."
}

$commit      = "$(& git -C $SourceDir rev-parse HEAD)".Trim()
$shortCommit = "$(& git -C $SourceDir rev-parse --short HEAD)".Trim()
$branch      = "$(& git -C $SourceDir rev-parse --abbrev-ref HEAD)".Trim()
$dirtyLines  = @(& git -C $SourceDir status --porcelain)
$treeClean   = ($dirtyLines.Count -eq 0)

Write-Ok "HEAD $shortCommit on '$branch'"

$archiveRef = "HEAD"
$sourceDesc = "git archive HEAD"

if (-not $treeClean) {
    # -like would be wrong here: '?' is a wildcard there and matches every line.
    $untracked = @($dirtyLines | Where-Object { $_.StartsWith('??') })

    if ($WorkingTree) {
        $snap = "$(& git -C $SourceDir stash create)".Trim()
        if ($LASTEXITCODE -ne 0) { throw "git stash create failed (exit $LASTEXITCODE)." }
        if ($snap) {
            $archiveRef = $snap
            $sourceDesc = "git archive (working-copy snapshot on top of $shortCommit)"
            Write-Warn "Dirty tree: exporting the working copy, snapshot $($snap.Substring(0,7)) ($($dirtyLines.Count) changes against HEAD)."
        } else {
            Write-Warn "Dirty tree, but no tracked changes to snapshot -- exporting HEAD."
        }
        if ($untracked.Count -gt 0) {
            Write-Warn "$($untracked.Count) untracked file(s) left out:"
            $untracked | Select-Object -First 10 | ForEach-Object { Write-Host "         $_" }
        }
    }
    elseif ($AllowDirty) {
        Write-Warn "Dirty tree, -AllowDirty set: exporting HEAD anyway ($($dirtyLines.Count) changes are missing from the ZIP)."
    }
    else {
        Write-Bad "Working directory is not clean ($($dirtyLines.Count) changes):"
        $dirtyLines | Select-Object -First 25 | ForEach-Object { Write-Host "         $_" }
        if ($dirtyLines.Count -gt 25) { Write-Host "         ... and $($dirtyLines.Count - 25) more" }
        Write-Host ""
        Write-Host "    Without a switch the export reflects HEAD. These changes would NOT be in the ZIP," -ForegroundColor Yellow
        Write-Host "    so the archive would silently show something different from your working copy." -ForegroundColor Yellow
        Write-Host "      -WorkingTree  exports the working copy (recommended)" -ForegroundColor Yellow
        Write-Host "      -AllowDirty   deliberately exports HEAD" -ForegroundColor Yellow
        exit 1
    }
}

# ------------------------------------------------------ 1. git archive HEAD
$work    = Join-Path ([System.IO.Path]::GetTempPath()) ("cc-export-" + [Guid]::NewGuid().ToString("N"))
$staging = Join-Path $work "src"
New-Item -ItemType Directory -Path $staging -Force | Out-Null

try {
    Write-Step "Extracting versioned files ($sourceDesc)"
    $tarPath = Join-Path $work "head.tar"
    & git -C $SourceDir archive --format=tar -o $tarPath $archiveRef
    if ($LASTEXITCODE -ne 0) { throw "git archive failed (exit $LASTEXITCODE)." }
    & tar -xf $tarPath -C $staging
    if ($LASTEXITCODE -ne 0) { throw "tar extraction failed (exit $LASTEXITCODE)." }
    Remove-Item -LiteralPath $tarPath -Force

    $staged = @(Get-ChildItem -LiteralPath $staging -Recurse -File)
    Write-Ok "$($staged.Count) versioned files taken over (nothing from .gitignore)"

    # ------------------------------------------- 2. Deny list, in depth
    Write-Step "Applying deny list (in case key material was ever committed)"
    $denyGlobs = @(
        '.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', '*.jks',
        '*.keystore', 'id_rsa*', 'id_ed25519*', '*serviceAccount*.json',
        '*adminsdk*.json', '*credentials*.json', '*.log', '*.tsbuildinfo'
    )
    $keepExact = @('.env.example')

    $removed = @()
    foreach ($f in $staged) {
        $rel = $f.FullName.Substring($staging.Length + 1).Replace('\', '/')
        if ($keepExact -contains $rel) { continue }
        foreach ($g in $denyGlobs) {
            if ($f.Name -like $g) {
                $removed += $rel
                Remove-Item -LiteralPath $f.FullName -Force
                break
            }
        }
    }
    if ($removed.Count -eq 0) {
        Write-Ok "Nothing to remove — there is no key material in the Git tree."
    } else {
        foreach ($r in $removed) { Write-Warn "removed: $r" }
    }

    # ------------------------------------------------------ 3. Secret scan
    Write-Step "Secret scan over every text file"

    $patterns = @(
        @{ Name = 'GoogleApiKey';      Regex = 'AIza[0-9A-Za-z_\-]{30,}' }
        @{ Name = 'AnthropicKey';      Regex = 'sk-ant-[A-Za-z0-9_\-]{20,}' }
        @{ Name = 'OpenRouterKey';     Regex = 'sk-or-v1-[A-Za-z0-9]{20,}' }
        @{ Name = 'OpenAiKey';         Regex = 'sk-[A-Za-z0-9]{32,}' }
        @{ Name = 'xAiKey';            Regex = 'xai-[A-Za-z0-9]{20,}' }
        @{ Name = 'ResendKey';         Regex = 're_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}' }
        @{ Name = 'GitHubToken';       Regex = 'gh[pousr]_[A-Za-z0-9]{30,}' }
        @{ Name = 'GitHubPat';         Regex = 'github_pat_[A-Za-z0-9_]{50,}' }
        @{ Name = 'AwsAccessKey';      Regex = 'AKIA[0-9A-Z]{16}' }
        @{ Name = 'SlackToken';        Regex = 'xox[baprs]-[A-Za-z0-9\-]{10,}' }
        @{ Name = 'GoogleOAuthToken';  Regex = 'ya29\.[A-Za-z0-9_\-]{20,}' }
        @{ Name = 'StripeKey';         Regex = '[rs]k_live_[A-Za-z0-9]{20,}' }
        @{ Name = 'PrivateKeyBlock';   Regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' }
        @{ Name = 'GcpServiceAccount'; Regex = '"type"\s*:\s*"service_account"' }
        @{ Name = 'GcpPrivateKeyId';   Regex = '"private_key_id"\s*:\s*"[^"]+"' }
    )

    # Hits that have been checked and are proven harmless. They are NOT
    # hidden, but printed with their reason on every run.
    $allowlist = @(
        @{
            Path    = 'firebase-config.json'
            Pattern = 'GoogleApiKey'
            Reason  = 'Firebase web API key — not a secret. A public project identifier, compiled into every client bundle and shipped to every browser; protection comes from the Firestore rules and App Check. lib/firebase.ts imports the file, so removing it would break the build.'
        }
        @{
            Path    = 'tests/unearned-verdicts-guard.spec.ts'
            Pattern = 'PrivateKeyBlock'
            Reason  = 'Literal input string of a guard spec that checks the scanner blocks PEM blocks. No key material, only the header line.'
        }
    )

    $binaryExt = @(
        '.png','.jpg','.jpeg','.gif','.webp','.ico','.bmp','.avif','.pdf',
        '.woff','.woff2','.ttf','.otf','.eot','.zip','.gz','.tgz','.br',
        '.mp4','.webm','.mov','.mp3','.wav','.jar','.exe','.dll','.node'
    )

    $blocking = @()
    $allowed  = @()
    $scanned  = 0

    foreach ($f in @(Get-ChildItem -LiteralPath $staging -Recurse -File)) {
        $rel = $f.FullName.Substring($staging.Length + 1).Replace('\', '/')
        if ($binaryExt -contains $f.Extension.ToLower()) { continue }

        $text = [System.IO.File]::ReadAllText($f.FullName)
        if ($text.IndexOf([char]0) -ge 0) { continue }   # binary file without a known extension
        $scanned++

        # .env-like files must not carry a filled-in value
        if ($f.Name -like '.env*' -and $f.Name -ne '.env.example') {
            $blocking += [PSCustomObject]@{ Path = $rel; Pattern = 'EnvFile'; Excerpt = '(whole file)' }
        }

        foreach ($p in $patterns) {
            foreach ($m in [regex]::Matches($text, $p.Regex)) {
                $hit = $allowlist | Where-Object { $_.Path -eq $rel -and $_.Pattern -eq $p.Name }
                $excerpt = $m.Value
                if ($excerpt.Length -gt 14) {
                    $excerpt = $excerpt.Substring(0, 10) + "..." + $excerpt.Substring($excerpt.Length - 4)
                }
                $line = ($text.Substring(0, $m.Index).Split("`n")).Count
                if ($hit) {
                    $allowed += [PSCustomObject]@{ Path = $rel; Line = $line; Pattern = $p.Name; Reason = $hit.Reason }
                } else {
                    $blocking += [PSCustomObject]@{ Path = "${rel}:${line}"; Pattern = $p.Name; Excerpt = $excerpt }
                }
            }
        }
    }

    Write-Ok "$scanned text files scanned, $($patterns.Count) pattern classes"

    foreach ($a in $allowed) {
        Write-Warn "known and checked: $($a.Path):$($a.Line) [$($a.Pattern)]"
        Write-Host "         $($a.Reason)" -ForegroundColor DarkGray
    }

    if ($blocking.Count -gt 0) {
        Write-Host ""
        Write-Bad "ABORTED — possible secrets in the export. NO ZIP was written:"
        foreach ($b in $blocking) {
            Write-Host "         $($b.Path)  [$($b.Pattern)]  $($b.Excerpt)" -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "    Check it, remove it from the Git history and rotate the key," -ForegroundColor Yellow
        Write-Host "    or — if demonstrably harmless — add it to the allowlist with a reason." -ForegroundColor Yellow
        exit 2
    }
    Write-Ok "No unknown secret patterns."

    # ---------------------------------------------------------- 4. Manifest
    Write-Step "Building manifest (SHA-256 per file)"

    $platformVersion = "v0.0.0"
    $pkgPath = Join-Path $staging "package.json"
    if (Test-Path -LiteralPath $pkgPath) {
        $pkg = Get-Content -Raw -LiteralPath $pkgPath | ConvertFrom-Json
        if ($pkg.version) { $platformVersion = "v" + $pkg.version }
    }

    $manifestFiles = @()
    foreach ($f in @(Get-ChildItem -LiteralPath $staging -Recurse -File | Sort-Object FullName)) {
        $manifestFiles += [PSCustomObject]@{
            path      = $f.FullName.Substring($staging.Length + 1).Replace('\', '/')
            sha256    = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLower()
            sizeBytes = $f.Length
        }
    }

    $canonical = ""
    foreach ($file in ($manifestFiles | Sort-Object -Property path)) {
        $canonical += $file.path + ":" + $file.sha256 + ";"
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $manifestHash = [System.BitConverter]::ToString(
        $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($canonical))
    ).Replace("-", "").ToLower()

    $signature = ""
    $signed    = $false
    if ($env:AUDIT_SIGNING_KEY) {
        $hmac = New-Object System.Security.Cryptography.HMACSHA256
        $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($env:AUDIT_SIGNING_KEY)
        $signature = [System.BitConverter]::ToString(
            $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($manifestHash))
        ).Replace("-", "").ToLower()
        $signed = $true
    }

    $allowedForManifest = @($allowed | ForEach-Object {
        [PSCustomObject]@{ path = $_.Path; line = $_.Line; pattern = $_.Pattern; reason = $_.Reason }
    })

    [PSCustomObject]@{
        exportTimestamp = (Get-Date -Format "o")
        platformVersion = $platformVersion
        source          = $sourceDesc
        gitCommit       = $commit
        gitBranch       = $branch
        treeClean       = $treeClean
        exclusionRules  = $denyGlobs
        secretScan      = [PSCustomObject]@{
            filesScanned     = $scanned
            patternClasses   = $patterns.Count
            blockingFindings = 0
            allowlisted      = $allowedForManifest
        }
        filesCount      = $manifestFiles.Count
        manifestHash    = $manifestHash
        signature       = $signature
        signed          = $signed
        files           = $manifestFiles
    } | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $staging "manifest.json") -Encoding utf8

    Write-Ok "$($manifestFiles.Count) files, digest $($manifestHash.Substring(0,16))..."
    if ($signed) {
        Write-Ok "HMAC-signed with AUDIT_SIGNING_KEY"
    } else {
        Write-Warn "Unsigned (AUDIT_SIGNING_KEY not in the environment) — the hashes can still be verified."
    }

    # --------------------------------------------------------------- 5. ZIP
    if (-not $OutputZip) {
        $desktop   = [Environment]::GetFolderPath('Desktop')
        $OutputZip = Join-Path $desktop "clean-core-src-$platformVersion-$shortCommit.zip"
    }
    Write-Step "Writing archive: $OutputZip"
    if (Test-Path -LiteralPath $OutputZip) { Remove-Item -LiteralPath $OutputZip -Force }

    # Deliberately not ZipFile::CreateFromDirectory: the .NET Framework writes
    # backslashes as path separators there. Windows unzippers forgive that, but
    # the ZIP spec knows only '/', and on macOS/Linux this produces files that
    # are literally named "app\page.tsx" instead of sitting in a folder.
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $zipStream  = [System.IO.File]::Open($OutputZip, [System.IO.FileMode]::Create)
    $zipArchive = New-Object System.IO.Compression.ZipArchive(
        $zipStream, [System.IO.Compression.ZipArchiveMode]::Create, $false
    )
    try {
        foreach ($f in @(Get-ChildItem -LiteralPath $staging -Recurse -File | Sort-Object FullName)) {
            $entryName = $f.FullName.Substring($staging.Length + 1).Replace('\', '/')
            $entry = $zipArchive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = New-Object System.DateTimeOffset($f.LastWriteTime)
            $entryStream = $entry.Open()
            $fileStream  = [System.IO.File]::OpenRead($f.FullName)
            try { $fileStream.CopyTo($entryStream) }
            finally { $fileStream.Dispose(); $entryStream.Dispose() }
        }
    }
    finally {
        $zipArchive.Dispose()
        $zipStream.Dispose()
    }

    $zipInfo = Get-Item -LiteralPath $OutputZip
    $zipHash = (Get-FileHash -LiteralPath $OutputZip -Algorithm SHA256).Hash.ToLower()

    Write-Host ""
    Write-Host "Export done." -ForegroundColor Green
    Write-Host "  File     : $OutputZip"
    Write-Host "  Size     : $([math]::Round($zipInfo.Length / 1MB, 2)) MB"
    Write-Host "  Files    : $($manifestFiles.Count)"
    Write-Host "  Version  : $platformVersion @ $shortCommit ($branch)"
    Write-Host "  SHA-256  : $zipHash"
    Write-Host ""
    Write-Host "  Verify with:" -ForegroundColor Cyan
    Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\verify-export.ps1 -ZipPath `"$OutputZip`""
}
finally {
    if (Test-Path -LiteralPath $work) {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
