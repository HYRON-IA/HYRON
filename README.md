# HYRON V-0.4 — multiusuário

Cloudflare Workers + D1, contas por convite, memórias por usuário, histórico isolado e roteador multi-LLM.

## HYRON v0.5.14 — Cloud Voice Storage (opcional)

O backend agora possui implementação **preparada** de sincronização dos binários da Voice Library via bucket privado Hugging Face Storage Buckets, preservando os metadados em D1. Para ativá-la, é necessário criar bucket/credenciais, executar `database/0006_v0514_cloud_voice_storage.sql`, configurar segredos no Worker e validar o fluxo end-to-end. Sem isso, a biblioteca continua funcionando localmente.

**Leia primeiro [`docs/HF-VOICE-STORAGE-SETUP.md`](docs/HF-VOICE-STORAGE-SETUP.md) e [`RELATORIO-V0514.md`](RELATORIO-V0514.md).** Os testes unitários não validam o serviço HF real. A importação não ativa inferência RVC nem compatibilidade Android nativa.

## Voice Library v0.5.13 (comportamento local)

A biblioteca sincroniza metadados e a seleção da voz na tabela D1 `voice_models`.
Execute `npx.cmd wrangler d1 execute hyron-history --remote --file=database/0005_v0513_voice_library.sql`
uma vez, depois de fazer backup do banco. A migração amplia a tabela criada em
`0004_v052.sql`; não a execute antes dessa migração.

Os arquivos do pacote permanecem no armazenamento local do navegador. A v0.5.13 não incluía
upload, download remoto, R2 ou extração de arquivos compactados. O armazenamento remoto é opcional na v0.5.14. Para importar,
selecione `manifest.json`, o modelo e os auxiliares opcionais. O manifesto usa
`schemaVersion: 1`, `engineType: "rvc" | "piper"`, `architecture`,
`sampleRate`, `compatibility`, `model: { file, sha256 }`, e `support`/`preview`
opcionais no mesmo formato. RVC é limitado aos metadados compatíveis com
`RVC-v1-40k` a 40000 Hz; Piper exige o par ONNX e `.onnx.json`. SHA-256 detecta
divergências em relação ao manifesto, mas não autentica quem o publicou.

Exemplo mínimo de manifesto Piper:

```json
{
  "schemaVersion": 1,
  "name": "Voz PT",
  "description": "Modelo local",
  "language": "pt-BR",
  "engineType": "piper",
  "architecture": "Piper",
  "sampleRate": 22050,
  "compatibility": ["windows", "web"],
  "model": { "file": "pt_BR.onnx", "sha256": "<64 hex chars>" },
  "support": { "file": "pt_BR.onnx.json", "sha256": "<64 hex chars>" }
}
```

A seleção é sincronizada pela conta. O chat continua usando a voz de síntese do
dispositivo; o pacote importado não é carregado automaticamente nem ligado ao
engine Windows. Sem bucket HF configurado, outros dispositivos
exibem os metadados e informam que o download não está disponível.

## RVC Cloud Trainer v0.5.12

A preparação do treinamento RVC em Kaggle está em `tools/rvc-cloud-trainer/`.
Neste diretório há um notebook Kaggle, scripts de preparação/validação/exportação,
configuração conservadora e relatório técnico. O treinamento não inicia
automaticamente: a sessão requer GPU, dataset autorizado e confirmação explícita do operador.

## Instalação

1. Faça backup do banco remoto antes de atualizar: `npx.cmd wrangler d1 export hyron-history --remote --output=backup-hyron.sql`.
2. Copie os arquivos para seu repositório V-0.3 (não copie `node_modules`). **Não apague o banco**.
3. Execute `npm.cmd install` e `npm.cmd run check`.
4. Execute `npx.cmd wrangler d1 execute hyron-history --remote --file=database/0002_v04.sql` **uma única vez**. Essa migração adiciona a coluna `user_id`; se repetir, SQLite reclamará de coluna duplicada.
5. Crie um segredo forte: `npx.cmd wrangler secret put HYRON_SETUP_KEY` (mínimo 24 caracteres aleatórios). Mantenha `OPENROUTER_API_KEY` já configurada.
6. Faça `git add .`, `git commit -m "HYRON V-0.4 multiusuario"`, `git push origin main` e aguarde deploy.
7. No site, selecione **Configuração inicial do administrador**, informe nome, senha (12+ caracteres) e o valor de `HYRON_SETUP_KEY`. A criação do administrador é permitida somente se ainda não houver usuários.
8. Faça login, clique **Convites e usuários**, gere um código válido por 48h e envie ao convidado. Ele seleciona **Cadastrar com convite**.
9. Clique **Importar V-0.3** no mesmo navegador onde usava a versão antiga para reivindicar suas conversas por token original. Conversas antigas não são atribuídas automaticamente.

## Segurança e limitações

- Sessão HttpOnly, Secure, SameSite=Strict; 7 dias. Senhas com PBKDF2-SHA256 (210 mil iterações); não coloque credenciais em arquivos públicos.
- Acesso a conversas/memórias sempre restrito ao usuário autenticado. Cadastro público sem convite não é permitido.
- Limite padrão de 40 mensagens por usuário por dia; variável opcional `DAILY_MESSAGE_LIMIT`. A cota diária não substitui limitação de tentativas de login no Cloudflare WAF/Turnstile; **habilite rate limiting de login e registro antes de abrir o serviço ao público**.
- Memória V-0.4 é explícita: salve e exclua lembranças no botão Memórias. O contexto recupera até 6 lembranças por correspondência textual; não é busca semântica nem extração automática.
- Integrações FreeLLMAPI **inspiradas no catálogo**, sem instalar a biblioteca Python no Worker. Suporta OpenRouter, Groq, Ollama Cloud, Cerebras, Mistral e Gemini por endpoints HTTP compatíveis; cada provedor requer chave e modelo válido (variáveis `<PROVEDOR>_API_KEY` e `<PROVEDOR>_MODEL`). Gratuidade depende da política e disponibilidade do provedor.
- Login não tem ainda recuperação de senha; guarde as credenciais de administrador.
- O limite de mensagens usa contador D1 e pode ser sujeito a concorrência de requisições; Cloudflare WAF é recomendado para proteção adicional.
