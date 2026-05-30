@echo off
setlocal EnableExtensions

rem ---------------------------------------------------------------------------
rem  copy-project.bat — copy cat-ftx1 source tree to another folder
rem
rem  Usage:
rem    copy-project.bat DESTINATION
rem    copy-project.bat D:\Backups\cat-ftx1-laptop
rem
rem  Copies all project-relevant files and folder structure. Excludes build
rem  output, node_modules, .git, local SQLite data, secrets, and archives.
rem  On the destination machine run: npm install
rem ---------------------------------------------------------------------------

if "%~1"=="" (
  echo.
  echo Usage: %~nx0 DESTINATION_FOLDER
  echo.
  echo Example:
  echo   %~nx0 D:\Backups\cat-ftx1-laptop
  echo   %~nx0 "\\OTHER-PC\Share\cat-ftx1"
  echo.
  echo Excludes: node_modules, .nuxt, .output, .git, data\, logs, .env*
  echo.
  exit /b 1
)

set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

set "DEST=%~f1"
if "%DEST:~-1%"=="\" set "DEST=%DEST:~0,-1%"

if /i "%DEST%"=="%SRC%" (
  echo Error: destination cannot be the source folder.
  exit /b 1
)

if not exist "%DEST%" (
  echo Creating destination: %DEST%
  mkdir "%DEST%" 2>nul
  if errorlevel 1 (
    echo Error: could not create destination folder.
    exit /b 1
  )
)

echo.
echo Source:      %SRC%
echo Destination: %DEST%
echo.

robocopy "%SRC%" "%DEST%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NP ^
  /XD node_modules .nuxt .output .nitro .cache .data dist .git data logs .idea .vscode ^
  /XF *.log Thumbs.db desktop.ini dir.txt back.bat ^
  /XF .env .env.local .env.production .env.development .env.test ^
  /XF *.rar *.zip *.7z *.tar *.tar.gz *.tgz

set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo.
  echo Robocopy failed with exit code %RC%.
  exit /b %RC%
)

echo.
echo Copy finished successfully.
echo.
echo Next steps on the destination PC:
echo   1. cd "%DEST%"
echo   2. npm install
echo   3. npm rebuild better-sqlite3   ^(if the native module fails on Windows^)
echo   4. Apply SQL migrations if you have an existing data\cat-ftx1.db
echo   5. Start serial-server.mjs and npm run dev
echo.
exit /b 0
