@echo off
setlocal
set "SRC=%~dp0"

if /I "%~1"=="-stop" goto stop
if /I "%~1"=="-pause" goto pause
if /I "%~1"=="-start" goto start
if /I "%~1"=="-restart" goto restart
if /I "%~1"=="-status" goto status
if /I "%~1"=="-control" goto control
if /I "%~1"=="-uninstall" goto uninstall

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%install-supervisor.ps1" -Action Install
exit /b %errorlevel%

:stop
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Stop
exit /b %errorlevel%

:pause
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Pause
exit /b %errorlevel%

:start
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Start
exit /b %errorlevel%

:restart
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Restart
exit /b %errorlevel%

:status
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Status
exit /b %errorlevel%

:control
start "" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SRC%dsh-control.ps1"
exit /b 0

:uninstall
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%install-supervisor.ps1" -Action Remove
exit /b %errorlevel%
