<#
.SYNOPSIS
    Exportiert die Clean-Core.io Codebase als secret-freies, gehashtes ZIP.

.DESCRIPTION
    Quelle ist ausschliesslich "git archive HEAD" — also nur versionierte
    Dateien. Alles, was .gitignore schuetzt (.env*, .claude/, node_modules/,
    scratch/, migration/, Logs), kann damit gar nicht erst in das Archiv
    geraten. Das ist der entscheidende Unterschied zur frueheren Fassung, die
    das Dateisystem gelaufen ist und sich auf eine handgepflegte
    Ausschlussliste verlassen musste.

    Danach drei Schutzschichten:
      1. Deny-Liste  — loescht Schluesseldateien, falls je eine committed wurde.
      2. Secret-Scan — Regex ueber jede Textdatei; ein Treffer bricht ab und
                       es entsteht KEIN ZIP (fail closed). Zwei bekannte,
                       nachweislich harmlose Treffer sind namentlich mit
                       Begruendung allowlistet und werden immer mitprotokolliert.
      3. Manifest    — SHA-256 je Datei, Gesamt-Digest, optional HMAC-signiert.

.PARAMETER WorkingTree
    Exportiert die Arbeitskopie statt HEAD, ohne dafuer committen zu muessen:
    "git stash create" macht einen wegwerfbaren Snapshot der getrackten
    Aenderungen, aus dem dann archiviert wird. Unversionierte Dateien bleiben
    aussen vor — git kennt sie nicht, und genau das ist auch der Grund, warum
    kein Secret hineinrutschen kann.

.PARAMETER AllowDirty
    Exportiert HEAD, obwohl das Arbeitsverzeichnis unsauber ist. Ohne einen
    der beiden Schalter bricht das Skript ab, denn sonst zeigt das Archiv
    stillschweigend etwas anderes als die Arbeitskopie.

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

# ---------------------------------------------------------------- 0. Kontext
if (-not $SourceDir) {
    $SourceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$SourceDir = $SourceDir.TrimEnd('\')

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git nicht gefunden." }
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) { throw "tar nicht gefunden." }

Write-Step "Repository pruefen: $SourceDir"

$inside = & git -C $SourceDir rev-parse --is-inside-work-tree
if ($LASTEXITCODE -ne 0 -or "$inside".Trim() -ne 'true') {
    throw "$SourceDir ist kein Git-Arbeitsverzeichnis. Der Export braucht Git als Quelle der Wahrheit."
}

$commit      = "$(& git -C $SourceDir rev-parse HEAD)".Trim()
$shortCommit = "$(& git -C $SourceDir rev-parse --short HEAD)".Trim()
$branch      = "$(& git -C $SourceDir rev-parse --abbrev-ref HEAD)".Trim()
$dirtyLines  = @(& git -C $SourceDir status --porcelain)
$treeClean   = ($dirtyLines.Count -eq 0)

Write-Ok "HEAD $shortCommit auf '$branch'"

$archiveRef = "HEAD"
$sourceDesc = "git archive HEAD"

if (-not $treeClean) {
    # -like waere hier falsch: '?' ist dort ein Wildcard und matcht jede Zeile.
    $untracked = @($dirtyLines | Where-Object { $_.StartsWith('??') })

    if ($WorkingTree) {
        $snap = "$(& git -C $SourceDir stash create)".Trim()
        if ($LASTEXITCODE -ne 0) { throw "git stash create fehlgeschlagen (Exit $LASTEXITCODE)." }
        if ($snap) {
            $archiveRef = $snap
            $sourceDesc = "git archive (Arbeitskopie-Snapshot ueber $shortCommit)"
            Write-Warn "Unsauberer Baum: exportiert wird die Arbeitskopie, Snapshot $($snap.Substring(0,7)) ($($dirtyLines.Count) Aenderungen gegenueber HEAD)."
        } else {
            Write-Warn "Unsauberer Baum, aber keine getrackten Aenderungen zu snapshotten -- exportiert wird HEAD."
        }
        if ($untracked.Count -gt 0) {
            Write-Warn "$($untracked.Count) unversionierte Datei(en) bleiben aussen vor:"
            $untracked | Select-Object -First 10 | ForEach-Object { Write-Host "         $_" }
        }
    }
    elseif ($AllowDirty) {
        Write-Warn "Unsauberer Baum, -AllowDirty gesetzt: exportiert wird trotzdem HEAD ($($dirtyLines.Count) Aenderungen fehlen im ZIP)."
    }
    else {
        Write-Bad "Arbeitsverzeichnis ist nicht sauber ($($dirtyLines.Count) Aenderungen):"
        $dirtyLines | Select-Object -First 25 | ForEach-Object { Write-Host "         $_" }
        if ($dirtyLines.Count -gt 25) { Write-Host "         ... und $($dirtyLines.Count - 25) weitere" }
        Write-Host ""
        Write-Host "    Ohne Schalter bildet der Export HEAD ab. Diese Aenderungen waeren NICHT im ZIP," -ForegroundColor Yellow
        Write-Host "    das Archiv wuerde also stillschweigend etwas anderes zeigen als deine Arbeitskopie." -ForegroundColor Yellow
        Write-Host "      -WorkingTree  exportiert die Arbeitskopie (empfohlen)" -ForegroundColor Yellow
        Write-Host "      -AllowDirty   exportiert bewusst HEAD" -ForegroundColor Yellow
        exit 1
    }
}

# ------------------------------------------------------ 1. git archive HEAD
$work    = Join-Path ([System.IO.Path]::GetTempPath()) ("cc-export-" + [Guid]::NewGuid().ToString("N"))
$staging = Join-Path $work "src"
New-Item -ItemType Directory -Path $staging -Force | Out-Null

try {
    Write-Step "Versionierte Dateien extrahieren ($sourceDesc)"
    $tarPath = Join-Path $work "head.tar"
    & git -C $SourceDir archive --format=tar -o $tarPath $archiveRef
    if ($LASTEXITCODE -ne 0) { throw "git archive fehlgeschlagen (Exit $LASTEXITCODE)." }
    & tar -xf $tarPath -C $staging
    if ($LASTEXITCODE -ne 0) { throw "tar-Extraktion fehlgeschlagen (Exit $LASTEXITCODE)." }
    Remove-Item -LiteralPath $tarPath -Force

    $staged = @(Get-ChildItem -LiteralPath $staging -Recurse -File)
    Write-Ok "$($staged.Count) versionierte Dateien uebernommen (nichts aus .gitignore)"

    # ------------------------------------------- 2. Deny-Liste, in der Tiefe
    Write-Step "Deny-Liste anwenden (falls je Schluesselmaterial committed wurde)"
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
        Write-Ok "Nichts zu entfernen — im Git-Tree liegt kein Schluesselmaterial."
    } else {
        foreach ($r in $removed) { Write-Warn "entfernt: $r" }
    }

    # ------------------------------------------------------ 3. Secret-Scan
    Write-Step "Secret-Scan ueber jede Textdatei"

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

    # Treffer, die geprueft und nachweislich harmlos sind. Sie werden NICHT
    # verschwiegen, sondern bei jedem Lauf mit Begruendung ausgegeben.
    $allowlist = @(
        @{
            Path    = 'firebase-applet-config.json'
            Pattern = 'GoogleApiKey'
            Reason  = 'Firebase Web-API-Key — kein Geheimnis. Oeffentliche Projektkennung, wird in jedes Client-Bundle kompiliert und an jeden Browser ausgeliefert; die Absicherung leisten Firestore-Rules und App Check. lib/firebase.ts importiert die Datei, ein Entfernen braeche den Build.'
        }
        @{
            Path    = 'tests/unearned-verdicts-guard.spec.ts'
            Pattern = 'PrivateKeyBlock'
            Reason  = 'Literaler Eingabestring eines Guard-Specs, der prueft, dass der Scanner PEM-Bloecke blockt. Kein Schluesselmaterial, nur die Kopfzeile.'
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
        if ($text.IndexOf([char]0) -ge 0) { continue }   # Binaerdatei ohne bekannte Endung
        $scanned++

        # .env-artige Dateien duerfen keinen gefuellten Wert tragen
        if ($f.Name -like '.env*' -and $f.Name -ne '.env.example') {
            $blocking += [PSCustomObject]@{ Path = $rel; Pattern = 'EnvFile'; Excerpt = '(gesamte Datei)' }
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

    Write-Ok "$scanned Textdateien gescannt, $($patterns.Count) Musterklassen"

    foreach ($a in $allowed) {
        Write-Warn "bekannt und geprueft: $($a.Path):$($a.Line) [$($a.Pattern)]"
        Write-Host "         $($a.Reason)" -ForegroundColor DarkGray
    }

    if ($blocking.Count -gt 0) {
        Write-Host ""
        Write-Bad "ABBRUCH — moegliche Secrets im Export. Es wurde KEIN ZIP geschrieben:"
        foreach ($b in $blocking) {
            Write-Host "         $($b.Path)  [$($b.Pattern)]  $($b.Excerpt)" -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "    Pruefen, aus dem Git-Verlauf entfernen und den Schluessel rotieren," -ForegroundColor Yellow
        Write-Host "    oder — falls nachweislich harmlos — in der Allowlist mit Begruendung eintragen." -ForegroundColor Yellow
        exit 2
    }
    Write-Ok "Keine unbekannten Secret-Muster."

    # ---------------------------------------------------------- 4. Manifest
    Write-Step "Manifest bauen (SHA-256 je Datei)"

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

    Write-Ok "$($manifestFiles.Count) Dateien, Digest $($manifestHash.Substring(0,16))..."
    if ($signed) {
        Write-Ok "HMAC-signiert mit AUDIT_SIGNING_KEY"
    } else {
        Write-Warn "Unsigniert (AUDIT_SIGNING_KEY nicht in der Umgebung) — die Hashes sind trotzdem pruefbar."
    }

    # --------------------------------------------------------------- 5. ZIP
    if (-not $OutputZip) {
        $desktop   = [Environment]::GetFolderPath('Desktop')
        $OutputZip = Join-Path $desktop "clean-core-src-$platformVersion-$shortCommit.zip"
    }
    Write-Step "Archiv schreiben: $OutputZip"
    if (Test-Path -LiteralPath $OutputZip) { Remove-Item -LiteralPath $OutputZip -Force }

    # Bewusst nicht ZipFile::CreateFromDirectory: das .NET Framework schreibt dort
    # Backslashes als Pfadtrenner. Windows-Entpacker verzeihen das, die ZIP-Spec
    # kennt aber nur '/', und auf macOS/Linux entstehen dann Dateien, die woertlich
    # "app\page.tsx" heissen statt in einem Ordner zu liegen.
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
    Write-Host "Export fertig." -ForegroundColor Green
    Write-Host "  Datei    : $OutputZip"
    Write-Host "  Groesse  : $([math]::Round($zipInfo.Length / 1MB, 2)) MB"
    Write-Host "  Dateien  : $($manifestFiles.Count)"
    Write-Host "  Stand    : $platformVersion @ $shortCommit ($branch)"
    Write-Host "  SHA-256  : $zipHash"
    Write-Host ""
    Write-Host "  Pruefen mit:" -ForegroundColor Cyan
    Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\verify-export.ps1 -ZipPath `"$OutputZip`""
}
finally {
    if (Test-Path -LiteralPath $work) {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
