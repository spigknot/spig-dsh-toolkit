param(
  [string]$InstallDir = $PSScriptRoot,
  [string]$ProgramsDir,
  [string]$StateDir = '',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$InstallDir = [IO.Path]::GetFullPath($InstallDir.TrimEnd([IO.Path]::DirectorySeparatorChar))
if (-not $ProgramsDir) {
  $ProgramsDir = [Environment]::GetFolderPath('Programs')
}
if (-not $ProgramsDir) {
  throw 'The current-user Start Menu Programs folder could not be located.'
}

$shortcutPath = Join-Path $ProgramsDir 'DSH Control.lnk'

if ($Uninstall) {
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
  }
  Write-Output "Control shortcut removed: $shortcutPath"
  exit 0
}

$controlScript = Join-Path $InstallDir 'dsh-control.ps1'
if (-not (Test-Path -LiteralPath $controlScript -PathType Leaf)) {
  throw "Control script was not found: $controlScript"
}

New-Item -ItemType Directory -Force -Path $ProgramsDir | Out-Null
$powershell = Join-Path $PSHOME 'powershell.exe'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcutArgs = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $controlScript + '"'
if ($StateDir) { $shortcutArgs += ' -StateDir "' + [IO.Path]::GetFullPath($StateDir) + '"' }
$shortcut.Arguments = $shortcutArgs
$shortcut.WorkingDirectory = $InstallDir
$shortcut.Description = 'Open the on-demand DSH autostart control panel'
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Output "Control shortcut installed: $shortcutPath"
