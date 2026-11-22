param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$QtVersion
)

$ErrorActionPreference = 'Stop'
$root = (New-Item -ItemType Directory -Path $Destination -Force).FullName
$tools = (New-Item -ItemType Directory -Path (Join-Path $root 'tools') -Force).FullName
$licenses = (New-Item -ItemType Directory -Path (Join-Path $root 'licenses') -Force).FullName
$scratch = (New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid()))).FullName

function Expand-VerifiedArchive([string]$Url, [string]$Hash, [string]$Name) {
    $zip = Join-Path $scratch "$Name.zip"
    Invoke-WebRequest -Uri $Url -OutFile $zip
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $Hash) {
        throw "SHA-256 mismatch for $Url"
    }
    $directory = Join-Path $scratch $Name
    Expand-Archive -LiteralPath $zip -DestinationPath $directory
    return $directory
}

try {
    $nodeVersion = '22.23.5'
    $nodeArchive = "node-v$nodeVersion-win-x64"
    $node = Expand-VerifiedArchive "https://nodejs.org/dist/v$nodeVersion/$nodeArchive.zip" `
        '4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3' 'node'
    Copy-Item -LiteralPath (Join-Path $node "$nodeArchive\node.exe") -Destination $tools
    Copy-Item -LiteralPath (Join-Path $node "$nodeArchive\LICENSE") -Destination (Join-Path $tools 'Node-LICENSE.txt')

    $xz = Expand-VerifiedArchive 'https://github.com/tukaani-project/xz/releases/download/v5.8.4/xz-5.8.4-windows.zip' `
        'f31af7638391ecf286d48bc8555ce6e131691a1c52a9e44303bce57069e9de56' 'xz'
    Copy-Item -LiteralPath @((Join-Path $xz 'bin_x86-64\xz.exe'), (Join-Path $xz 'bin_x86-64\liblzma.dll')) `
        -Destination $tools
    Copy-Item -Path (Join-Path $xz 'doc\COPYING*.txt') -Destination $tools

    $redist = Join-Path $scratch 'vc_redist.x64.exe'
    Invoke-WebRequest -Uri 'https://aka.ms/vc14/vc_redist.x64.exe' -OutFile $redist
    $signature = Get-AuthenticodeSignature -LiteralPath $redist
    if ($signature.Status -ne 'Valid' -or
        $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -ne 'Microsoft Corporation') {
        throw 'The Visual C++ Redistributable does not have a valid Microsoft signature.'
    }
    Copy-Item -LiteralPath $redist -Destination $root

    foreach ($license in @('LGPL-3.0-only', 'GPL-3.0-only')) {
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/qt/qtbase/v$QtVersion/LICENSES/$license.txt" `
            -OutFile (Join-Path $licenses "Qt-$license.txt")
    }
    $qtSeries = ([version]$QtVersion).ToString(2)
    @"
Microbit Studio uses the shared libraries of Qt $QtVersion under LGPL version 3.
See the accompanying GNU LGPL and GPL license texts.

Qt corresponding source
https://download.qt.io/archive/qt/$qtSeries/$QtVersion/single/qt-everywhere-src-$QtVersion.tar.xz

Qt WebEngine and Chromium third-party notices
https://doc.qt.io/qt-$qtSeries/qtwebengine-3rdparty.html
"@ | Set-Content -LiteralPath (Join-Path $licenses 'Qt-Source.txt') -Encoding utf8
} finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
