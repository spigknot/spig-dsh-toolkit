param(
  [ValidateSet('Install', 'Remove')]
  [string]$Action = 'Install'
)

$ErrorActionPreference = 'Stop'
$taskName = 'DeepSeek Harness'
$supervisorTaskName = 'DSH Browser Supervisor'
$taskPath = '\'
$launcher = Join-Path $PSScriptRoot 'dsh-web-launcher.ps1'
$controlInstaller = Join-Path $PSScriptRoot 'install-control-shortcut.ps1'
$backupDir = Join-Path $PSScriptRoot 'backup'
$projectRoot = Split-Path $PSScriptRoot -Parent
$shimDir = Join-Path $env:LOCALAPPDATA 'Programs\DSH-Web-Command'
$shimPath = Join-Path $shimDir 'dsh.cmd'
$shimMarker = 'REM DSH_FIXED_WEB_SHIM_V1'

function Set-UserDshPath([bool]$Install) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @($current -split ';' | Where-Object { $_.Trim() -and $_.Trim().TrimEnd('\') -ine $shimDir.TrimEnd('\') })
  if ($Install) { $parts = @($shimDir) + $parts }
  [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
  $env:Path = if ($Install) { "$shimDir;$env:Path" } else { ($env:Path -split ';' | Where-Object { $_.Trim().TrimEnd('\') -ine $shimDir.TrimEnd('\') }) -join ';' }
}

function Install-DshCommandShim([string]$RealDsh, [string]$Node, [string]$Wrapper) {
  New-Item -ItemType Directory -Force -Path $shimDir | Out-Null
  if ((Test-Path -LiteralPath $shimPath) -and -not (Get-Content -LiteralPath $shimPath -Raw).Contains($shimMarker)) {
    throw "Refusing to overwrite an unrelated command shim: $shimPath"
  }
  $content = @(
    '@echo off',
    'REM DSH_FIXED_WEB_SHIM_V1',
    'setlocal DisableDelayedExpansion',
    'set "REAL_DSH=__REAL_DSH__"',
    'if /I "%~1"=="web" goto :web',
    'call "%REAL_DSH%" %*',
    'exit /b',
    '',
    ':web',
    'if "%~2"=="" goto :web_open',
    'if /I "%~2"=="--no-open" if "%~3"=="" goto :web_no_open',
    'if /I "%~2"=="--help" if "%~3"=="" goto :web_help',
    'if /I "%~2"=="-h" if "%~3"=="" goto :web_help',
    'echo This launcher always uses port 3080 on all network interfaces without a browser login.',
    'echo Usage: dsh web [--no-open]',
    'exit /b 2',
    '',
    ':web_open',
    '"__NODE_EXE__" "__WRAPPER_MJS__"',
    'exit /b',
    '',
    ':web_no_open',
    '"__NODE_EXE__" "__WRAPPER_MJS__" --no-open',
    'exit /b',
    '',
    ':web_help',
    'echo Usage: dsh web [--no-open]',
    'echo Opens the fixed DSH browser endpoint on port 3080. The internal DSH token is handled by the local bridge.',
    'exit /b 0'
  ) -join "`r`n"
  $content = $content.Replace('__REAL_DSH__', $RealDsh).Replace('__NODE_EXE__', $Node).Replace('__WRAPPER_MJS__', $Wrapper)
  [IO.File]::WriteAllText($shimPath, $content, (New-Object Text.ASCIIEncoding))
  Set-UserDshPath $true
}

if ($Action -eq 'Remove') {
  & $launcher -Pause | Out-Null
  Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue
  $startupEntry = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)) 'start-dsh-web.vbs'
  if ((Test-Path -LiteralPath $startupEntry) -and (Get-Content -LiteralPath $startupEntry -Raw) -like "*$launcher*") {
    Remove-Item -LiteralPath $startupEntry -Force
  }
  $legacyVbs = Join-Path $projectRoot 'iniciar-harness.vbs'
  $legacyBackup = Join-Path $backupDir 'iniciar-harness.vbs.before'
  $legacyTaskStillExists = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
  if (-not $legacyTaskStillExists -and (Test-Path -LiteralPath $legacyBackup) -and (Test-Path -LiteralPath $legacyVbs)) {
    Copy-Item -LiteralPath $legacyBackup -Destination $legacyVbs -Force
  }
  if ((Test-Path -LiteralPath $shimPath) -and (Get-Content -LiteralPath $shimPath -Raw).Contains($shimMarker)) {
    Remove-Item -LiteralPath $shimPath -Force
    Set-UserDshPath $false
  }
  & $controlInstaller -Uninstall | Out-Null
  Write-Output 'Removed DSH logon task and browser command shim. A running DSH server was left alone.'
  exit 0
}

$profileRoot = [IO.Path]::GetFullPath($env:USERPROFILE)
$dshHome = if ($env:DSH_HOME) { [IO.Path]::GetFullPath($env:DSH_HOME) } else { Join-Path $profileRoot '.dsh' }
$localAppData = Join-Path $profileRoot 'AppData\Local'
$installDir = Join-Path $localAppData 'Programs\DeepSeek Harness'
$realDsh = Join-Path $installDir 'resources\runtime\cli\bin\dsh.cmd'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$tailscalePath = (Get-Command tailscale -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $installDir 'DeepSeek Harness.exe'))) { throw "DeepSeek Harness was not found in $installDir" }
if (-not (Test-Path -LiteralPath $realDsh)) { throw "The DSH command was not found: $realDsh" }
if (-not (Test-Path -LiteralPath $nodePath)) { throw "Node.js was not found: $nodePath" }
if (-not (Test-Path -LiteralPath $tailscalePath)) { throw "Tailscale CLI was not found: $tailscalePath" }

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$oldSupervisor = Get-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath -ErrorAction SilentlyContinue
if ($oldSupervisor) {
  $backup = Join-Path $backupDir 'DSH-Browser-Supervisor-task-before-boot.xml'
  if (-not (Test-Path -LiteralPath $backup)) {
    Export-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath | Set-Content -LiteralPath $backup -Encoding Unicode
  }
}
Install-DshCommandShim $realDsh $nodePath (Join-Path $projectRoot 'dsh-navegador.mjs')
& $controlInstaller -InstallDir $PSScriptRoot | Out-Null

$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$quote = { param([string]$value) '"' + $value.Replace('"', '""') + '"' }
$arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' + (& $quote $launcher) +
  ' -DshUserProfile ' + (& $quote $profileRoot) + ' -DshHome ' + (& $quote $dshHome) +
  ' -NodePath ' + (& $quote $nodePath) + ' -TailscalePath ' + (& $quote $tailscalePath)
$scheduledAction = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $PSScriptRoot

$legacyVbs = Join-Path $projectRoot 'iniciar-harness.vbs'
if (Test-Path -LiteralPath $legacyVbs) {
  $legacyBackup = Join-Path $backupDir 'iniciar-harness.vbs.before'
  if (-not (Test-Path -LiteralPath $legacyBackup)) { Copy-Item -LiteralPath $legacyVbs -Destination $legacyBackup }
  [IO.File]::WriteAllText($legacyVbs, 'Option Explicit:WScript.Quit 0', (New-Object Text.ASCIIEncoding))
}

try {
  if ($oldSupervisor -and $oldSupervisor.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
  Register-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath `
    -Action $scheduledAction -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Starts DSH when the user signs in, binds its browser bridge to all interfaces on port 3080, and restarts it after failures.' `
    -Force | Out-Null
  Remove-Item (Join-Path $PSScriptRoot 'run\pause.sentinel'),(Join-Path $PSScriptRoot 'run\stop.sentinel') -Force -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath
} catch {
  Write-Error "Could not register the DSH logon task. Details: $($_.Exception.Message)"
  exit 5
}

Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $supervisorTaskName -TaskPath $taskPath
$state = (Get-ScheduledTaskInfo -TaskName $supervisorTaskName -TaskPath $taskPath).LastTaskResult
Write-Output "Installed the DSH interactive logon task for $userId (task state: $($task.State); last result: $state)."
Write-Output 'It starts in the signed-in Windows session, uses the owner DSH profile, and exposes the no-login bridge on port 3080 across LAN and Tailscale interfaces.'
Write-Output "The dsh web command now opens the fixed bridge; shim: $shimPath"
