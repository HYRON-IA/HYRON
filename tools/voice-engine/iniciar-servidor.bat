@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js 24 ou superior nao foi encontrado.
  goto failure
)

node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 (
  echo ERRO: Instale Node.js 24 ou superior.
  goto failure
)

if not exist ".env" (
  echo ERRO: .env nao encontrado. Copie .env.example para .env e configure as chaves.
  goto failure
)

node --env-file=.env --input-type=module -e "import('./src/api/server.ts').then(({loadVoiceEngineConfig})=>loadVoiceEngineConfig()).catch(error=>{console.error('Configuracao invalida: '+error.message);process.exitCode=1})"
if errorlevel 1 goto failure

where curl.exe >nul 2>nul
if errorlevel 1 (
  echo ERRO: curl.exe nao foi encontrado para verificar a Voice Library.
  goto failure
)
curl.exe --fail --silent http://127.0.0.1:8790/health >nul
if errorlevel 1 (
  echo ERRO: Voice Library indisponivel. Inicie primeiro tools\voice-library.
  goto failure
)

echo Iniciando HYRON Voice Engine em 127.0.0.1...
npm.cmd start
if errorlevel 1 goto failure
exit /b 0

:failure
echo.
echo Inicializacao cancelada. Nenhuma chave ou segredo foi exibido.
pause
exit /b 1
