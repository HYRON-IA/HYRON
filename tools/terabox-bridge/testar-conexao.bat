@echo off
setlocal
pushd "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 24 ou superior.
  set "EXIT_CODE=1"
  goto :finish
)

if not exist ".env" (
  echo Arquivo .env nao encontrado.
  echo Copie .env.example para .env e preencha as credenciais oficiais.
  set "EXIT_CODE=1"
  goto :finish
)

node --env-file=.env src\terabox-auth-test.ts
set "EXIT_CODE=%ERRORLEVEL%"

:finish
popd
exit /b %EXIT_CODE%
