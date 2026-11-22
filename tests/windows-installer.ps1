param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][string]$InnoSetup,
    [Parameter(Mandatory = $true)][string]$VCRedist
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$VCRedist = (Resolve-Path -LiteralPath $VCRedist).Path
$filename = Split-Path -Leaf $Installer
if ($filename -notmatch '^microbit-studio-(\d+\.\d+\.\d+)-windows-x64-setup\.exe$') {
    throw "Unexpected installer filename: $filename"
}
$version = $Matches[1]
$registry = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ifilot.MicrobitStudio_is1'
if (Test-Path -LiteralPath $registry) {
    throw 'The installer test requires a machine without a registered Microbit Studio installation.'
}

function Run-Setup([string]$File, [string]$Arguments) {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "$File exited with code $($process.ExitCode)."
    }
}

$scratch = (New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid()))).FullName
$install = Join-Path $scratch 'Custom Microbit Studio'
$app = Join-Path $install 'bin\microbit-studio.exe'
$log = Join-Path $scratch 'setup.log'
$quiet = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOICONS'
$editor = $null
try {
    $previous = Join-Path $scratch 'previous'
    New-Item -ItemType Directory -Path (Join-Path $previous 'bin') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $previous 'bin\microbit-studio.exe') -Value 'previous installation fixture'
    & $InnoSetup /Q "/DAppVersion=0.4.0" "/DStageRoot=$previous" "/DVCRedist=$VCRedist" `
        "/O$scratch" (Join-Path $root 'packaging\microbit-studio.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Could not compile the previous-version fixture.' }
    $oldSetup = Join-Path $scratch 'microbit-studio-0.4.0-windows-x64-setup.exe'
    Run-Setup $oldSetup "$quiet /DIR=`"$install`" /LOG=`"$log`""
    if ((Get-ItemProperty -LiteralPath $registry).DisplayVersion -ne '0.4.0') {
        throw 'The previous installer did not register version 0.4.0.'
    }
    $oldHash = (Get-FileHash -LiteralPath $app).Hash
    $project = Join-Path $install 'my-project.microbit-project'
    Set-Content -LiteralPath $project -Value '{"format":1,"lessonStep":-1}'
    $projectHash = (Get-FileHash -LiteralPath $project).Hash

    Run-Setup $Installer "$quiet /LOG=`"$log`""
    $installedVersion = (Get-ItemProperty -LiteralPath $registry).DisplayVersion
    if ($installedVersion -ne $version) {
        throw "The installed version is $installedVersion, expected $version."
    }
    if ((Get-FileHash -LiteralPath $app).Hash -eq $oldHash -or (Get-FileHash -LiteralPath $project).Hash -ne $projectHash) {
        throw 'The upgrade did not replace the executable in place and preserve the project file.'
    }

    $data = Join-Path $install 'share\microbit-studio'
    $tools = Join-Path $install 'bin\tools'
    & (Join-Path $tools 'xz.exe') --version
    if ($LASTEXITCODE -ne 0) { throw 'The bundled XZ could not start.' }
    $source = Join-Path $scratch 'test.ts'
    $firmware = Join-Path $scratch 'test.hex'
    Set-Content -LiteralPath $source -Value 'game.createSprite(2, 2)'
    & (Join-Path $tools 'node.exe') (Join-Path $data 'compiler\compile.cjs') `
        (Join-Path $data 'assets\pxt') $source $firmware
    if ($LASTEXITCODE -ne 0 -or (Get-Content -LiteralPath $firmware -Raw) -notmatch ':0400000A9903C0DE') {
        throw 'The installed offline compiler did not produce V2 firmware.'
    }

    $stderr = Join-Path $scratch 'editor.log'
    $env:QT_FORCE_STDERR_LOGGING = '1'
    $env:QTWEBENGINE_CHROMIUM_FLAGS = '--disable-gpu'
    $editor = Start-Process -FilePath $app -PassThru -RedirectStandardError $stderr
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $editor.Refresh()
        $messages = Get-Content -LiteralPath $stderr -Raw
        if ($messages -match "Microbit Studio $([regex]::Escape($installedVersion)) started" -and
            $messages -match 'Block workspace ready') { break }
        if ($editor.HasExited -or [DateTime]::UtcNow -ge $deadline) {
            throw 'The installed Qt workspace did not start.'
        }
        Start-Sleep -Milliseconds 250
    } while ($true)

    Write-Output "Verified Windows $installedVersion upgrades the same install directory, preserves a project, starts Qt WebEngine, and compiles V2 firmware offline."
} catch {
    if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 35 }
    if ($stderr -and (Test-Path -LiteralPath $stderr)) { Get-Content -LiteralPath $stderr -Tail 35 }
    throw
} finally {
    if ($editor -and !$editor.HasExited) {
        if (!$editor.CloseMainWindow() -or !$editor.WaitForExit(5000)) { $editor.Kill() }
        $editor.WaitForExit()
    }
    $uninstaller = Join-Path $install 'unins000.exe'
    if (Test-Path -LiteralPath $uninstaller) { Run-Setup $uninstaller $quiet }
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
