# HYRON V-0.5.1 — Biblioteca local de modelos Piper (etapa 1)

Implementado: importação e validação básica de pares `.onnx`/`.onnx.json`, armazenamento em IndexedDB local por ID de usuário, listagem e exclusão. Sem migração D1 e sem upload ao servidor.

**Limitação importante:** modelos importados ainda NÃO são sintetizados. Para falar com eles será necessário integrar e validar ONNX Runtime Web + fonemizador Piper e o fluxo de leitura dos modelos locais. O botão Testar voz continua usando SpeechSynthesis. Esta etapa prepara a biblioteca sem prometer inferência inexistente.

## Instalação
Copie `public/`, `package.json`, `package-lock.json` e este README ao repositório. Execute `npm.cmd install` e `npm.cmd run check`. Teste em ambiente local antes do deploy. Não execute migração SQL.
