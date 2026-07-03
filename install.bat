@echo off
setlocal enabledelayedexpansion
REM install.bat - install the SDLC harness (skills + agent personas) into Claude Code on Windows.
REM Mirror of install.sh. Directory junctions (mklink /J) need no admin and update on `git pull`;
REM individual agent files are copied (file symlinks need privilege). See --help.

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"
set "MODE=junction"
set "TARGET=%USERPROFILE%\.claude"
set "DO_UPDATE=0"

:parseargs
if "%~1"=="" goto afterargs
if /i "%~1"=="--copy"     ( set "MODE=copy"     & shift & goto parseargs )
if /i "%~1"=="--junction" ( set "MODE=junction" & shift & goto parseargs )
if /i "%~1"=="--project"  ( set "TARGET=%~f2\.claude" & shift & shift & goto parseargs )
if /i "%~1"=="--update"   ( set "DO_UPDATE=1"   & shift & goto parseargs )
if /i "%~1"=="--help"     goto help
if /i "%~1"=="-h"         goto help
echo unknown arg: %~1
exit /b 1

:afterargs
if "%DO_UPDATE%"=="1" (
  echo [sdlc-install] updating...
  git -C "%REPO%" pull --ff-only
)

REM --- grep gate: never ship personal / dogfood-specific refs ---
findstr /s /m /c:"com.rcforte" /c:"pmt-analytics" "%REPO%\skills\*" "%REPO%\agents\*" >nul 2>&1
if not errorlevel 1 (
  echo ABORT: personal/dogfood references found in shipped files:
  findstr /s /c:"com.rcforte" /c:"pmt-analytics" "%REPO%\skills\*" "%REPO%\agents\*"
  exit /b 1
)

if not exist "%TARGET%\skills" mkdir "%TARGET%\skills"
if not exist "%TARGET%\agents" mkdir "%TARGET%\agents"

REM --- skills: junction (default) or copy each skill directory ---
for /d %%d in ("%REPO%\skills\*") do (
  set "LINK=%TARGET%\skills\%%~nxd"
  if exist "!LINK!\" rmdir /s /q "!LINK!" 2>nul
  if exist "!LINK!"  del /q "!LINK!" 2>nul
  if /i "%MODE%"=="copy" (
    xcopy /e /i /q /y "%%~fd" "!LINK!" >nul
  ) else (
    mklink /J "!LINK!" "%%~fd" >nul
    if errorlevel 1 (
      echo   [warn] junction failed for %%~nxd - copying instead
      xcopy /e /i /q /y "%%~fd" "!LINK!" >nul
    )
  )
)

REM --- agents: copy each .md (file junctions don't exist; symlinks need privilege) ---
for %%f in ("%REPO%\agents\*.md") do (
  copy /y "%%~ff" "%TARGET%\agents\%%~nxf" >nul
)

echo [sdlc-install] installed skills (%MODE%) + agents (copied) into %TARGET%

REM --- prerequisite check ---
echo [sdlc-install] prerequisite check:
where git >nul 2>&1 && (echo   [ok] git) || (echo   [MISSING] git ^(required^))
for %%s in (setup-matt-pocock-skills to-prd to-issues review) do (
  if exist "%TARGET%\skills\%%s" (echo   [ok] Matt-Pocock skill: %%s) else (echo   [MISSING] Matt-Pocock skill: %%s)
)
echo   [?] Workflow tool - cannot be probed from a shell. Run '/sdlc status' in Claude Code:
echo       it reports 'Workflow tool present - fast path' or '- main-thread fallback' ^(older Claude Code^).
echo [sdlc-install] done. Next: open your repo in Claude Code and run '/sdlc onboard' ^(existing code^) or '/sdlc setup' ^(greenfield^).
exit /b 0

:help
echo install.bat - install the SDLC harness into Claude Code (Windows).
echo.
echo   install.bat                  junction skills + copy agents into %%USERPROFILE%%\.claude (default)
echo   install.bat --copy           copy everything (no junctions; robust, re-run to update)
echo   install.bat --junction       force directory junctions for skills (the default)
echo   install.bat --project DIR    install into DIR\.claude (team-vendored)
echo   install.bat --update         git pull, then re-install and re-check
echo.
echo Notes: directory junctions (mklink /J) need no admin and reflect `git pull`. Agent files are always
echo copied (Windows file symlinks need admin/Developer Mode); re-run with --update to refresh them.
exit /b 0
