# Pesquisa da API oficial do TeraBox

**Data da consulta:** 10 de outubro de 2026

**Documentação consultada:** [TeraBox Open Platform Integration Documentation (chinês)](https://www.terabox.com/integrations/docs/chinese)
**Escopo:** autenticação de servidor e operações de arquivos relevantes ao armazenamento de modelos RVC e Piper. Não foram feitas chamadas autenticadas à API.

## Resumo executivo

- A documentação oficial descreve um fluxo de autorização OAuth por código: o usuário autoriza o aplicativo no TeraBox, o servidor troca o `code` por tokens e consulta `/oauth/tokeninfo` para descobrir os domínios corretos da API e de upload.
- `client_id`, `client_secret` e `private_secret` precisam ser solicitados separadamente ao TeraBox. A documentação não informa formulário, endereço de contato, prazo ou critérios de aprovação.
- O upload suporta partes (“分片上传”) e consiste em pré-upload, envio das partes e criação/consolidação do arquivo. Cada parte em uploads de múltiplas partes deve ter **mais de 4 MB**.
- Não encontrei na documentação um limite máximo por arquivo, um limite de 300 MB, quotas de chamadas ou uma política específica para contas pessoais. Portanto, não é possível concluir apenas com esta documentação que arquivos acima de 300 MB serão aceitos em todos os casos.
- As operações de listagem, download e exclusão estão documentadas. As chamadas devem respeitar o espaço de arquivos atribuído ao aplicativo.

## 1. Autenticação de servidor

Referência: seção **1.4 Server接入流程** (“fluxo de integração do servidor”), [na documentação oficial](https://www.terabox.com/integrations/docs/chinese#anchor-63387462-9ee0-3117-b831-8f4054062db6).

### Fluxo documentado

1. O usuário é direcionado a uma página TeraBox para entrar e autorizar o aplicativo.
2. Após a autorização, o callback recebe um `code`.
3. O servidor troca o `code` por `access_token` e `refresh_token`.
4. O servidor envia o `access_token` a `POST /oauth/tokeninfo` para descobrir `api_domain` e `upload_domain`, que podem variar entre usuários/regiões.
5. As APIs de arquivos usam o domínio retornado e o token de acesso. O endpoint de upload multipart usa especificamente `upload_domain`; os demais serviços básicos usam `api_domain`.
6. Quando o token expirar, o servidor o renova com `refresh_token`.

O `access_token` dura **2 dias** e o `refresh_token`, **30 dias**. Cada `refresh_token` só pode ser usado uma vez. Após uma renovação bem-sucedida, o `access_token` anterior permanece válido por 15 segundos. O período de validade do novo `refresh_token` permanece o mesmo que o do anterior. A documentação recomenda armazenar em cache as informações de domínio retornadas por `tokeninfo` por, no máximo, aproximadamente **1 hora**.

### Obtenção e renovação de tokens

Os endpoints OAuth abaixo são publicados no host `www.terabox.com`.

| Operação | Método e endpoint | Parâmetros documentados |
|---|---|---|
| Trocar código por token | `POST https://www.terabox.com/oauth/gettoken` | `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `timestamp` (Unix, segundos) e `sign` |
| Consultar dados do token/domínios | `POST https://www.terabox.com/oauth/tokeninfo` | `access_token` |
| Renovar tokens | `POST https://www.terabox.com/oauth/refreshtoken` | `client_id`, `client_secret`, `refresh_token`, `timestamp` e `sign` |

As chamadas de token são mostradas como `multipart/form-data` (`curl --form`). A assinatura é descrita como:

```text
sign = MD5(client_id + "_" + timestamp + "_" + client_secret + "_" + private_secret)
```

O `private_secret` é solicitado separadamente. A documentação o descreve como segredo privado; a assinatura e todas as chamadas de token devem, portanto, ser feitas no servidor, sem expor segredos ao navegador ou ao aplicativo cliente.

Para renovar, use sempre o novo `refresh_token` retornado: o token anterior não pode ser reutilizado. A documentação também informa que chamadas muito frequentes à troca de código podem resultar no erro `300001`, mas não define um limite numérico ou janela de tempo.

### Solicitação das credenciais

As seções **1.0 整体流程** (fluxo geral) e **1.1.1 参数准备** (preparação de parâmetros) dizem que o fornecedor precisa solicitar ao TeraBox `client_id`, `client_secret` e `private_secret`; a obtenção do `client_id` é indicada como uma solicitação separada ao TeraBox. O fluxo geral também menciona fornecer nome do aplicativo, logo do produto e URL Schemes para Android/iOS.

**Não confirmado pela documentação consultada:** canal ou formulário para a solicitação, documentos exigidos além dos itens acima, critérios formais de aprovação, prazo de análise e se a aprovação do aplicativo é necessária antes de usar a API. A página não oferece detalhes suficientes para inferir esses procedimentos.

## 2. Operações de arquivos

Referências: seção **3.1 说明** (observações gerais), **3.3 容量相关** (quota) e **3.4 文件相关** (arquivos), na [documentação oficial](https://www.terabox.com/integrations/docs/chinese#anchor-cf5de655-1a87-3f67-acfa-4d852095e4b6).

### Domínio, token e diretório

- A URL base das operações comuns deve usar o valor `api_domain` retornado por `/oauth/tokeninfo`.
- O envio de partes em `/rest/2.0/pcs/superfile2` deve usar `upload_domain`.
- Os exemplos passam o token de API como `access_tokens` (plural) na query string.
- A seção 3.1 restringe `path` e operações de arquivos ao espaço atribuído ao aplicativo. A documentação apresenta o caminho como `/From: Other Applications/<nome-do-aplicativo>/`.
- Há uma inconsistência: a seção de listagem (3.4.5) descreve o diretório como `/From: Other Device/<nome-do-aplicativo>-<ID-do-aplicativo>/`, enquanto exemplos de outras operações usam caminhos diferentes. Confirme o diretório efetivo antes de implementar; não assuma que esses exemplos são intercambiáveis.

### Upload: pré-upload, partes e consolidação

O fluxo da seção 3.4 tem três operações:

| Etapa | Método e endpoint | Parâmetros/corpo principal |
|---|---|---|
| 1. Pré-upload | `POST {api_domain}/openapi/api/precreate?access_tokens={token}` | Corpo: `autoinit=1`, `block_list` (JSON com MD5 de cada parte) e `path`. Retorna `uploadid` e a lista de partes a enviar. |
| 2. Enviar parte | `POST {upload_domain}/rest/2.0/pcs/superfile2` | Query: `method=upload`, `app_id=250528`, `path`, `uploadid`, `partseq` (índice começando em 0) e `access_tokens`. Corpo: `file` binário. |
| 3. Criar arquivo | `POST {api_domain}/openapi/api/create?access_tokens={token}` | Corpo: `path`, `size`, `uploadid`, `block_list` (igual ao usado no pré-upload) e `rtype` (política para conflitos de nome). |

A ordem dos envios precisa corresponder à ordem das partes declarada no pré-upload. A documentação afirma que, em upload com múltiplas partes, **cada parte precisa ter tamanho maior que 4 MB**; partes menores causam erro. `rtype` aceita `0` (falhar se existir), `1` (renomear se o caminho conflitar), `2` (renomear se conflitar caminho e conteúdo) e `3` (sobrescrever); o padrão documentado é `1`.

Exemplo esquemático, sem credenciais:

```text
POST {api_domain}/openapi/api/precreate?access_tokens={access_token}
body: autoinit=1, path={caminho}, block_list=["{md5-parte-0}", ...]

POST {upload_domain}/rest/2.0/pcs/superfile2
query: method=upload&app_id=250528&path={caminho}&uploadid={uploadid}
       &partseq=0&access_tokens={access_token}
body: file={bytes-da-parte}

POST {api_domain}/openapi/api/create?access_tokens={access_token}
body: path={caminho}, size={bytes}, uploadid={uploadid},
      block_list=["{md5-parte-0}", ...], rtype=1
```

### Listar, baixar e excluir

| Operação | Método e endpoint | Parâmetros documentados |
|---|---|---|
| Listar diretório | `GET {api_domain}/openapi/api/list` | `access_tokens`, `dir`, `page`, `num`; opcionais `order` (`time`, `name` ou `size`), `desc` e `web`. Retorna dados de arquivo como nome, `fs_id`, caminho, tamanho e indicador de diretório. |
| Obter links de download | `GET {api_domain}/openapi/api/download` | `access_tokens`, `fidlist` (IDs separados por vírgula; aceita múltiplos) e `type=dlink`. Retorna `dlink` para cada arquivo. |
| Excluir arquivo(s) | `POST {api_domain}/openapi/api/filemanager?access_tokens={token}&opera=delete` | Corpo com `filelist`, uma lista JSON de caminhos, por exemplo `["/caminho/modelo.pth"]`. `async` é opcional (0 síncrono, 1 adaptativo, 2 assíncrono). |

Para baixar o conteúdo, a documentação diz para acrescentar `access_tokens` ao `dlink` retornado. Trate o link resultante e o token como credenciais: não os exponha em URLs públicas, logs ou respostas ao cliente sem necessidade. O exemplo de `curl` da seção de download contém um cabeçalho `Cookie: xxx`, mas a tabela de parâmetros não o define como requisito; a documentação não esclarece essa discrepância.

### Consulta de quota

`GET {api_domain}/openapi/api/quota?access_tokens={token}` retorna `total` e `used` em bytes para o usuário autorizado. É o mecanismo documentado para consultar o espaço disponível; não é uma garantia de um limite uniforme entre contas.

**Observação de documentação:** a tabela de parâmetros da listagem apresenta `path` com tipo `int`, mas seu exemplo usa `page=1` junto a `dir=/`. Neste relatório, `page` e `dir` refletem os nomes que aparecem no exemplo e na descrição. Confirme a especificação com o provedor se a chamada real divergir.

## 3. Arquivos maiores que 300 MB, limites e contas pessoais

### Confirmado

- A API oferece upload em partes, com endpoints explícitos de pré-upload, envio de parte e consolidação.
- As partes de uploads multiparte devem ser maiores que 4 MB e enviadas na ordem esperada.
- Existe uma API de consulta de quota por usuário.
- A troca de código tem um erro documentado para frequência excessiva (`300001`), sem indicar quantitativo.

### Não especificado / não confirmado

- A documentação consultada **não declara** limite máximo por arquivo, limite máximo por parte, quantidade máxima de partes nem limite de 300 MB.
- Não há uma afirmação explícita de que arquivos acima de 300 MB são aceitos, nem de que são rejeitados. O suporte a partes é evidência do mecanismo de upload fragmentado, mas não prova um tamanho máximo suportado ou garantido.
- Não foram encontradas quotas de chamadas, limites de banda, limites de armazenamento por plano nem garantias de disponibilidade.
- Não há regras específicas para contas pessoais, exigência explícita de conta empresarial, restrições de automação ou política de retenção para uso de armazenamento como backend de modelos.
- Não foram encontrados critérios ou fluxo de aprovação de credenciais além da indicação de solicitação separada ao TeraBox.

Antes de definir o produto para guardar modelos RVC/Piper — alguns dos quais podem ultrapassar 300 MB — confirme esses pontos com o TeraBox e teste com uma conta/aplicativo aprovado. Não trate o tamanho máximo como ilimitado.

## 4. Aplicação ao HYRON: próximos passos sugeridos

1. Solicitar ao TeraBox as credenciais de aplicativo e confirmar elegibilidade, limites de arquivo/conta, quota de API e diretório correto. Manter `client_secret` e `private_secret` apenas como segredos de servidor no Cloudflare Workers.
2. Implementar OAuth no backend, guardar tokens de forma segura por usuário e renovar tokens de uso único com controle contra concorrência; cachear `api_domain`/`upload_domain` conforme a documentação.
3. Implementar upload retomável em três fases, calcular MD5 de cada parte, respeitar a ordem do `block_list` e o mínimo documentado por parte. Definir comportamento para conflitos (`rtype`) e falhas parciais.
4. Implementar listagem, download privado e exclusão dentro do diretório atribuído. Evitar expor `access_token`, `refresh_token`, assinatura ou `dlink` em respostas e logs.
5. Testar modelos RVC e Piper representativos, incluindo arquivo acima de 300 MB, sem assumir que a existência de upload multipart garante aceitação desse tamanho.

## 5. Referências e método de consulta

- [Documentação oficial TeraBox — chinês](https://www.terabox.com/integrations/docs/chinese)
  - **1.0 整体流程**: dados que o fornecedor deve fornecer e solicitação de credenciais.
  - **1.1.1 参数准备**: obtenção separada do `client_id`.
  - **1.4 Server接入流程**, incluindo **1.4.2.1** troca de código, **1.4.2.2** consulta de token/domínio e **1.4.2.3** renovação.
  - **3.1 说明**: HTTP/HTTPS, domínios de API/upload e espaço de arquivos.
  - **3.3.1 容量查询接口**: consulta de quota.
  - **3.4 文件相关**, incluindo **3.4.1** pré-upload, **3.4.2** upload de partes, **3.4.3** criação, **3.4.4** gerenciamento/exclusão, **3.4.5** listagem e **3.4.8** download.

A página oficial foi renderizada e consultada no navegador; as capturas das seções de autorização do servidor, upload em partes e gerenciamento de arquivos foram produzidas nesta sessão. A extração HTTP simples não disponibilizou o conteúdo da documentação, então a consulta foi feita ao texto renderizado no navegador. Não foram usados tokens, cookies ou credenciais para acessar endpoints da API.
