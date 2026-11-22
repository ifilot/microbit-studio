#define AppName "Microbit Studio"
#define RuntimeVersion GetFileVersion(VCRedist)

[Setup]
AppId=ifilot.MicrobitStudio
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Microbit Studio contributors
AppPublisherURL=https://github.com/ifilot/microbit-studio
DefaultDirName={autopf}\{#AppName}
UsePreviousAppDir=yes
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\bin\microbit-studio.exe
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
CloseApplications=yes
RestartApplications=no
OutputBaseFilename=microbit-studio-{#AppVersion}-windows-x64-setup
VersionInfoVersion={#AppVersion}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\resources\app\microbit-studio.ico

[Files]
Source: "{#StageRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#VCRedist}"; DestName: "vc_redist.x64.exe"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\bin\microbit-studio.exe"; WorkingDir: "{app}\bin"

[Run]
Filename: "{app}\bin\microbit-studio.exe"; Description: "Launch {#AppName}"; Flags: postinstall nowait skipifsilent

[Code]
function HasRuntime(RootKey: Integer): Boolean;
var
  Version: String;
  Installed, Required: Int64;
begin
  Result := False;
  if not RegQueryStringValue(RootKey, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64',
    'Version', Version) then
    Exit;
  if (Length(Version) > 0) and (Version[1] = 'v') then
    Delete(Version, 1, 1);
  if StrToVersion(Version, Installed) and StrToVersion('{#RuntimeVersion}', Required) then
    Result := ComparePackedVersion(Installed, Required) >= 0;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if HasRuntime(HKLM64) or HasRuntime(HKLM32) then
    Exit;

  ExtractTemporaryFile('vc_redist.x64.exe');
  if not Exec(ExpandConstant('{tmp}\vc_redist.x64.exe'), '/install /quiet /norestart', '',
    SW_HIDE, ewWaitUntilTerminated, ExitCode) then
    Result := 'Could not start the Microsoft Visual C++ Redistributable.'
  else if ExitCode = 3010 then
    NeedsRestart := True
  else if (ExitCode <> 0) and not (HasRuntime(HKLM64) or HasRuntime(HKLM32)) then
    Result := Format('Microsoft Visual C++ Redistributable setup failed with exit code %d.', [ExitCode]);
end;
