@echo off
setlocal
pushd "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 ou superior nao encontrado.
  set "EXIT_CODE=1"
  goto :finish
)

if not exist ".env" (
  echo Arquivo .env nao encontrado.
  echo Copie .env.example para .env e configure STORAGE_API_KEY.
  set "EXIT_CODE=1"
  goto :finish
)

npm.cmd start
set "EXIT_CODE=%ERRORLEVEL%"

:finish
popd
exit /b %EXIT_CODE%
