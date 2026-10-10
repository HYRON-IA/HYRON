# HYRON V-0.5.0 — Atualização incremental

Baseado no projeto V-0.4.2 enviado. O pacote **não contém** `.git`, `node_modules`, backups, tokens ou segredos.

## Recursos
- Administradores promovem e rebaixam usuários na interface. Alterações exigem confirmação e são verificadas no Worker.
- O último administrador **ativo** não pode ser rebaixado. Não é permitido rebaixar a própria conta pela interface.
- Alterações são registradas em `admin_audit`.
- Seleção de vozes `pt` instaladas/disponíveis via Web Speech API, velocidade e teste; preferências salvas **neste navegador**, não sincronizadas entre dispositivos.
- **Atenção:** a Web Speech API não garante vozes neurais. A naturalidade depende do navegador e do sistema; Microsoft Edge pode disponibilizar vozes melhores.

## Instalação
1. Execute `Copiar-HYRON-v0.5.bat` na mesma pasta de `HYRON-v0.5.zip` ou copie manualmente os arquivos para a pasta Git existente. Não substitua `.git` ou secrets.
2. `npm.cmd install` e `npm.cmd run check`.
3. Faça backup remoto: `npx.cmd wrangler d1 export hyron-history --remote --output=backup-pre-v05.sql`.
4. Confirme backup e execute: `npx.cmd wrangler d1 execute hyron-history --remote --file=database/0003_v05.sql`.
5. Verifique: `npx.cmd wrangler d1 execute hyron-history --remote --command="SELECT name FROM sqlite_master WHERE name='admin_audit';"`.
6. `git add src public database/0003_v05.sql package.json package-lock.json README-V0.5.md` e `git commit -m "feat(v0.5.0): permissoes de administradores e vozes configuraveis"` e `git push origin main`.

## Notas de segurança
- Backup `.sql` contém dados privados: não faça commit. Não publique o conteúdo da pasta `.git` enviada no ZIP original.
- Não há síntese neural garantida por API gratuita; esta versão usa síntese de fala do navegador.
- Como em V-0.4, ainda é recomendável implementar rate limiting no login e recuperação de senha.
