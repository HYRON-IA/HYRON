# HYRON V0.5.2 — Biblioteca de vozes na nuvem

## Antes de publicar

1. Faça backup do projeto e do banco D1. Este ZIP não inclui `.git`, `node_modules`, backups, arquivos de ambiente nem segredos.
2. No Cloudflare, confirme que sua conta pode criar um bucket R2 e que você concorda com eventuais exigências de faturamento e cotas. R2 não é garantidamente gratuito para todos os usos/contas.
3. Crie o bucket **hyron-voice-models** pelo painel Cloudflare R2 ou pelo terminal: `npx.cmd wrangler r2 bucket create hyron-voice-models`.
4. Execute a migração no banco remoto (faça backup primeiro):
   `npx.cmd wrangler d1 execute hyron-history --remote --file=database/0004_v052.sql`
5. Copie os arquivos desta versão por cima do seu projeto atual, preservando sua pasta `.git`, seus segredos e backups. NÃO copie a pasta do ZIP como uma pasta adicional dentro do projeto.
6. Execute `npm.cmd install` e `npm.cmd run check`.
7. Teste localmente com `npx.cmd wrangler dev --remote`, usando uma conta de teste e arquivos pequenos. Atenção: --remote pode acessar recursos reais.
8. Só então `git add .`, `git commit -m "feat: cloud voice library v0.5.2"` e `git push origin main`.

## Funcionalidades

- Biblioteca privada por conta, com listagem, download e exclusão.
- Upload em dois arquivos: RVC `.pth` + `.index`; Piper `.onnx` + `.onnx.json`.
- R2 guarda os arquivos; D1 guarda metadados; sessões existentes controlam acesso.
- Até 10 modelos por conta; até 100 MiB por arquivo principal e índice RVC; configuração Piper até 1 MiB.
- O RVC e o Piper ainda **não são executados**. Não existe síntese neural nesta versão.
- Biblioteca Piper antiga no IndexedDB permanece separada, sem migração automática.

## Limitações e atenção

- O upload é enviado pelo Worker ao R2 e pode esbarrar em limites do plano Cloudflare (tamanho da requisição, cotas de operações/armazenamento).
- O sistema valida extensão e tamanho, mas não atesta segurança, direitos ou compatibilidade interna do modelo. Não execute arquivos `.pth` de procedência desconhecida.
- Upload interrompido pode deixar um registro pendente, que ocupa uma das dez vagas; é possível removê-lo pela API DELETE, mas a interface só lista modelos completos.
- Para uso de produção em escala: adicionar expiração/limpeza de pendentes, varredura de arquivos, rate limit, quota total de bytes por usuário, upload multipart e observabilidade.
- Não conceda acesso público ao bucket R2. O acesso deve passar pela API autenticada.
