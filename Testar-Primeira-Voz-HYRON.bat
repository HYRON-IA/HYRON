@echo off
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"
if not exist "%ROOT%tools\voice-engine\testar-rvc-v0515.py" (
  echo ERRO: extraia o pacote e instale os arquivos no projeto HYRON.
  pause
  exit /b 1
)
set /p "PTH=Caminho completo do checkpoint RVC .pth: "
set /p "SOURCE=URL/origem do modelo: "
set /p "LICENSE=Licenca/termos de uso verificados: "
set /p "AUTH=Evidencia de autorizacao para uso local: "
echo.
echo OBS: se o Piper nao estiver configurado, use no PowerShell o comando com --input-wav.
py -3.12 "%ROOT%tools\voice-engine\testar-rvc-v0515.py" --model-pth "%PTH%" --model-source "%SOURCE%" --model-license "%LICENSE%" --authorization-evidence "%AUTH%"
if errorlevel 1 (
  echo.
  echo Deu Red: veja o erro acima. Nenhuma conversao foi confirmada.
  pause
  exit /b 1
)
echo.
echo Concluido. Consulte o WAV de saida acima.
pause
