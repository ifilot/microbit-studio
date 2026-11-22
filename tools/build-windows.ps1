param(
    [Parameter(Mandatory = $true)][string]$QtRoot,
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory,
    [string]$CMake = 'cmake.exe',
    [string]$InnoSetup,
    [string]$VCRedist
)

$ErrorActionPreference = 'Stop'

function Invoke-Native([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Executable exited with code $LASTEXITCODE."
    }
}

$root = Split-Path -Parent $PSScriptRoot
$qt = (Resolve-Path -LiteralPath $QtRoot).Path
$runtime = (Resolve-Path -LiteralPath $RuntimeDirectory).Path
$deploy = Join-Path $qt 'bin\windeployqt.exe'
if ([bool]$InnoSetup -ne [bool]$VCRedist) {
    throw 'Supply both -InnoSetup and -VCRedist to build an installer.'
}
if ($VCRedist) {
    $VCRedist = (Resolve-Path -LiteralPath $VCRedist).Path
}
foreach ($file in @($deploy, (Join-Path $qt 'bin\Qt6WebEngineWidgets.dll'),
                    (Join-Path $runtime 'node.exe'), (Join-Path $runtime 'xz.exe'))) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Required Windows build file is missing: $file"
    }
}

$build = Join-Path $root 'build-windows'
Invoke-Native $CMake @('-S', $root, '-B', $build, '-G', 'Visual Studio 17 2022', '-A', 'x64',
                      "-DCMAKE_PREFIX_PATH=$qt")
Invoke-Native $CMake @('--build', $build, '--config', 'Release', '--parallel')

$version = (Select-String -LiteralPath (Join-Path $build 'CMakeCache.txt') `
    -Pattern '^CMAKE_PROJECT_VERSION:STATIC=(.+)$').Matches[0].Groups[1].Value
$stage = Join-Path $build ('portable-' + (Get-Date -Format 'yyyyMMdd-HHmmssfff'))
Invoke-Native $CMake @('--install', $build, '--config', 'Release', '--prefix', $stage)

$bin = Join-Path $stage 'bin'
Invoke-Native $deploy @('--release', '--no-compiler-runtime', (Join-Path $bin 'microbit-studio.exe'))
$tools = New-Item -ItemType Directory -Path (Join-Path $bin 'tools')
Get-ChildItem -LiteralPath $runtime -File | Copy-Item -Destination $tools.FullName
if ($VCRedist) {
    $licenses = Join-Path (Split-Path -Parent $runtime) 'licenses'
    $destination = Join-Path $stage 'share\microbit-studio\assets\licenses'
    if (Test-Path -LiteralPath $licenses -PathType Container) {
        Get-ChildItem -LiteralPath $licenses -File | Copy-Item -Destination $destination
    }
    $sbom = Join-Path $qt 'sbom'
    if (Test-Path -LiteralPath $sbom -PathType Container) {
        Get-ChildItem -LiteralPath $sbom -Filter '*.spdx' -File | Where-Object { $_.Name -notlike '*.source.spdx' } |
            Copy-Item -Destination $destination
    }
}

$packages = Join-Path $build 'packages'
New-Item -ItemType Directory -Path $packages -Force | Out-Null
if ($InnoSetup) {
    $script = Join-Path $root 'packaging\microbit-studio.iss'
    Invoke-Native $InnoSetup @('/Qp', "/DAppVersion=$version", "/DStageRoot=$stage",
                              "/DVCRedist=$VCRedist", "/O$packages", $script)
    Write-Output "Windows installer: $packages\microbit-studio-$version-windows-x64-setup.exe"
    return
}

$zip = Join-Path $packages "microbit-studio-$version-windows-x64.zip"
Push-Location $stage
try {
    Invoke-Native $CMake @('-E', 'tar', 'cf', $zip, '--format=zip', '.')
} finally {
    Pop-Location
}
Write-Output "Windows test build: $zip"
