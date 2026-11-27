@echo off
setlocal
set "SRC=%~dp0"
set "STATE_ARG="
if defined DSH_AUTOSTART_STATE_DIR set STATE_ARG=-StateDir "%DSH_AUTOSTART_STATE_DIR%"

if /I "%~1"=="-stop" goto stop
if /I "%~1"=="-pause" goto pause
if /I "%~1"=="-start" goto start
if /I "%~1"=="-restart" goto restart
if /I "%~1"=="-status" goto status
if /I "%~1"=="-control" goto control
if /I "%~1"=="-uninstall" goto uninstall

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%install-supervisor.ps1" -Action Install %STATE_ARG%
exit /b %errorlevel%

:stop
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Stop %STATE_ARG%
exit /b %errorlevel%

:pause
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Pause %STATE_ARG%
exit /b %errorlevel%

:start
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Start %STATE_ARG%
exit /b %errorlevel%

:restart
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Restart %STATE_ARG%
exit /b %errorlevel%

:status
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%dsh-web-launcher.ps1" -Status %STATE_ARG%
exit /b %errorlevel%

:control
start "" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SRC%dsh-control.ps1" %STATE_ARG%
exit /b 0

:uninstall
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SRC%install-supervisor.ps1" -Action Remove %STATE_ARG%
exit /b %errorlevel%
