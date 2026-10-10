# HYRON v0.1

Protótipo open source (MIT) de assistente web com voz e fallback entre APIs gratuitas. **Não é um agente autônomo ainda.**

## Arquitetura

- Cloudflare Workers: backend e arquivos estáticos
- Groq (`llama-3.3-70b-versatile`) como primeira opção; OpenRouter (`openrouter/free`) como fallback
- Web Speech API: ditado e leitura em voz alta, sujeitos à compatibilidade do navegador
- Histórico mantido apenas na aba (não há memória persistente ainda)

## Publicação sem instalar nada no computador

1. Crie um repositório no GitHub e envie os arquivos desta pasta (extraia o ZIP primeiro).
2. No Cloudflare Dashboard, acesse Workers & Pages e crie um Worker conectado ao repositório GitHub. Se a interface não oferecer o fluxo de Git, utilize o editor web do GitHub Codespaces para executar `npm install` e `npm run deploy`.
3. Configure a compilação/deploy com `npm run deploy`, diretório raiz do projeto e os ajustes exigidos pela integração Git da Cloudflare.
4. Em **Settings > Variables and Secrets**, adicione `GROQ_API_KEY` e/ou `OPENROUTER_API_KEY` como segredos. Configure `HYRON_ACCESS_KEY` para restringir o uso da API. Nunca publique chaves no GitHub ou JavaScript do navegador.
5. Abra o endereço `*.workers.dev` gerado. No ícone de engrenagem, informe a chave de acesso HYRON, se definida.

Documentação oficial: https://developers.cloudflare.com/workers/ ; https://console.groq.com/ ; https://openrouter.ai/

## Desenvolvimento

```sh
npm install
npm run check
npm run dev
```

Para testes locais, use `.dev.vars` (ignorado pelo Git). Para publicar: `npm run deploy`.

## Limitações e segurança

- Provedores podem alterar modelos, disponibilidade e cotas gratuitas; revise os IDs no arquivo `src/index.ts`.
- O fallback tenta outro provedor quando o anterior falha; não ignora limites contratuais.
- Não há autenticação completa nem limitação de taxa. **Não exponha a aplicação publicamente sem configurar `HYRON_ACCESS_KEY` e controles adicionais.** A chave no `sessionStorage` é apenas um controle inicial, não substitui login seguro.
- A API de chat não navega na web, não executa código e não controla o GitHub nesta versão.
- O reconhecimento de voz pode enviar áudio a serviços do navegador; consulte as políticas do navegador.
- A configuração `wrangler.jsonc` é destinada a Workers com assets estáticos. Pode exigir ajustes conforme a versão da plataforma.
- Custo zero apenas dentro das franquias gratuitas; nenhuma cobrança deve ser ativada sem sua decisão.

## Próximas versões

- v0.2: autenticação real, D1, memória persistente e histórico
- v0.3: ferramentas, busca web e leitura de repositórios GitHub com permissões
- v0.4: roteador ampliado a partir de catálogos Free LLM APIs
