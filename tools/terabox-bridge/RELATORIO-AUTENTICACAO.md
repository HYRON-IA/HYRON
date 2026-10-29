# Relatório de autenticação — HYRON Storage Bridge

## Conclusão

O material oficial consultado para esta integração documenta autorização OAuth com aprovação do usuário da conta TeraBox e troca de um código de autorização por tokens. **Não documenta autenticação direta da API por e-mail e senha.** O protótipo, portanto, não coleta nem tenta enviar a senha da conta.

Isto significa que não foi encontrado um método público documentado para autenticar diretamente com e-mail e senha nas chamadas servidor-a-servidor. Não se conclui que nenhum fluxo interno do provedor exista; apenas que esse método não está descrito na documentação oficial consultada e não será implementado aqui.

## Fluxo oficial descrito

1. O usuário autoriza o aplicativo na página TeraBox. A documentação Web/WAP identifica a URL `https://www.terabox.com/wap/outside/login?clientId={client_id}`.
2. O fluxo de servidor recebe um `code` de autorização.
3. O servidor faz `POST https://www.terabox.com/oauth/gettoken` com `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `timestamp` Unix em segundos e `sign`.
4. A documentação define a assinatura como `MD5(client_id + "_" + timestamp + "_" + client_secret + "_" + private_secret)`.
5. O servidor consulta `POST https://www.terabox.com/oauth/tokeninfo` com `access_token` para receber metadados do token e os domínios `api_domain` e `upload_domain`.

## Credenciais e integração pendentes

Antes de executar um teste real, o HYRON precisa obter do TeraBox:

- `client_id`
- `client_secret`
- `private_secret`

A documentação diz que esses valores precisam ser solicitados ao TeraBox, mas não especifica o canal, formulário, prazo ou critérios de aprovação. Ela também não define um callback de servidor próprio para este protótipo de linha de comando. O `TERABOX_AUTH_CODE` deve vir de um fluxo de autorização/callback válido aprovado para o aplicativo; não deve ser substituído por senha, cookie de navegador ou tentativa de acesso a endpoints não documentados.

O script troca o código e consulta `tokeninfo`; não imprime nem persiste tokens. Sem as três credenciais oficiais e um código OAuth válido, a autenticação real não pode ser testada.

## Fontes oficiais

- [TeraBox Open Platform Integration Documentation — chinês](https://www.terabox.com/integrations/docs/chinese), seções 1.0, 1.1.1, 1.4, 1.4.2.1 e 1.4.2.2.
- URL de autorização Web/WAP conforme indicada na seção 1.1.2 da mesma documentação.

O relatório de pesquisa do HYRON em `docs/TERABOX-API-RESEARCH.md` registra os parâmetros, tempos de validade e informações adicionais sobre as credenciais.
