# HYRON v0.5.13 — Voice Library

## Resultado

Implementada a base vertical da Voice Library: metadados sincronizados pela
conta em D1, listagem, seleção padrão, remoção e importação/armazenamento local
de pacotes verificados no navegador. Nenhum modelo é enviado ao Worker,
desserializado ou carregado automaticamente.

## Arquitetura e alterações

- `database/0005_v0513_voice_library.sql` amplia `voice_models` com descrição,
  idioma, arquitetura/versão, taxa de amostragem, hashes, compatibilidade,
  prévia e seleção. Um índice parcial impede mais de uma voz padrão por conta.
- `src/voice-library.ts` valida os metadados recebidos pelo Worker.
- `src/index.ts` implementa listagem, consulta/atualização da seleção, cadastro
  validado e remoção autenticados pela sessão HYRON. Metadados continuam
  segregados por `user_id`.
- `wrangler.jsonc` e `Env` não declaram mais binding R2. Rotas antigas de upload
  e download binário foram removidas; D1 transporta apenas metadados.
- `public/index.html`, `public/app.js` e `public/voice-package.js` oferecem a
  interface My Voices/Add Voice, estado instalado local, preview WAV, seleção
  sincronizada e importação por arquivos avulsos para IndexedDB.
- `tests/voice-library.test.ts` e `tests/voice-package.test.js` cobrem validação
  de metadados, formatos, hashes, manifesto, arquivo ausente, caminhos indevidos,
  configuração Piper e arquitetura RVC.
- `README.md` documenta o formato e a execução da migração.

## Formato de importação e segurança

O pacote é selecionado como arquivos individuais, não como ZIP. O manifesto JSON
versão 1 descreve `name`, `description`, `language`, `engineType`, `architecture`,
`sampleRate`, `compatibility`, e os nomes/hashes SHA-256 de `model`, `support`
opcional e `preview` opcional. O importador aplica limites de tamanho e tipos,
rejeita nomes com separadores/caminhos, valida o cabeçalho WAV e compara os
hashes com os bytes locais. O runtime RVC aceito pela interface é `RVC-v1-40k`
a 40000 Hz; o modelo `.pth` é mantido como bytes opacos. Hash contra manifesto
não é assinatura de autor e não prova a procedência do pacote.

Arquivos locais e prévias usam IndexedDB, isolados pela identidade HYRON no
registro local. Metadados D1 são sincronizados entre sessões/dispositivos;
os arquivos binários e a prévia não são. O estado selecionado/default é de
conta, enquanto "instalada" é local.

## Integração e limites explícitos

- O chat existente usa `SpeechSynthesis` do navegador. A seleção da Voice Library
  sincroniza configuração, mas ainda não reconfigura a saída do chat nem o
  processo Piper do Windows.
- O Piper existente continua intacto e é a opção de fala local já disponível
  através do Voice Engine. A importação de pacote nesta tela não instala o ONNX
  no diretório que o Voice Engine consome.
- A conversão RVC permanece indisponível no `RVCEngine`; nenhum WAV convertido
  foi produzido nesta alteração. A saída TTS existente continua sem conversão,
  sem alegar resultado RVC. A proteção de checkpoint existente não foi alterada.
- Não há projeto Android neste repositório. A API autenticada permite que uma
  aplicação futura sincronize metadados, mas não foi possível implementar uma
  tela Android ou executar inferência Android.
- Como não existe backend de arquivos remoto aprovado, os botões de download
  estão explicitamente indisponíveis. Modelos cadastrados antes desta migração
  mantêm somente seus metadados; objetos binários em um bucket R2 preexistente
  não são removidos por esta alteração.
- Bluetooth e smart glasses seguem como consumidores futuros de uma abstração
  de saída de áudio; não foram adicionados adaptadores sem suporte na aplicação.

## Migração

Faça backup e aplique a migração depois de `0004_v052.sql`:

```powershell
npx.cmd wrangler d1 export hyron-history --remote --output=backup-hyron.sql
npx.cmd wrangler d1 execute hyron-history --remote --file=database/0005_v0513_voice_library.sql
```

A migração é incremental e não deve ser reaplicada, pois usa `ALTER TABLE ADD
COLUMN`. Não foi executada contra um banco remoto nesta tarefa.

## Testes

- `npm.cmd run check`: **passou** (TypeScript do Worker).
- `npm.cmd test`: **10 passaram, 0 falharam** (validação de metadados,
  pacote e migração em SQLite em memória).
- `npm.cmd test --prefix tools\voice-library`: **10 passaram, 0 falharam**;
  typecheck: **passou**.
- `npm.cmd test --prefix tools\voice-engine`: **9 passaram, 1 ignorado, 0
  falharam**; typecheck: **passou**. O teste ignorado é inferência Piper real
  pela condição existente do projeto.
- `node --check` em `public\app.js`, `public\voice-package.js` e nos testes JS:
  **passou**.
- Smoke visual com `wrangler dev --local --port 8787`: **passou**; HTML e
  módulo da tela carregaram e exibiram autenticação. O `401` inicial de
  `/api/auth/me` sem sessão é esperado.

Não houve deploy, migração remota, teste Android nem geração de WAV convertido
por RVC. O smoke test não autenticou usuário nem cobriu cliques da tela.
