# Configuração segura — RNF-05

## Configuração implementada

O backend usa `@nestjs/config` no módulo principal. A biblioteca lê variáveis do ambiente do processo e o arquivo local `.env` quando presente. A validação é dividida entre `src/config/app.config.ts` e `src/config/database.config.ts`; o restante do código acessa a configuração por `ConfigService`.

| Variável | Uso | Fallback local |
|---|---|---|
| `PORT` | Porta HTTP da API; obrigatória entre `1` e `65535` | sem fallback |
| `DATABASE_URL` | URL PostgreSQL usada pelo TypeORM; obrigatória | sem fallback |
| `DATABASE_SSL` | Habilita TLS PostgreSQL; somente `true` ou `false` | `false` |
| `JWT_PRIVATE_KEY_B64` / `JWT_PUBLIC_KEY_B64` | Chaves RSA do access token; PEM em Base64 | sem fallback |
| `PDF_MASTER_KEY_B64` | Chave AES-256-GCM para cifrar PKCS#12 dos usuários | sem fallback |

Exemplo de execução local sem gravar valores no código:

```powershell
$env:PORT = '3001'
$env:DATABASE_URL = 'postgres://usuario:senha@127.0.0.1:5432/assinatura_digital'
$env:DATABASE_SSL = 'false'
# Gere as chaves JWT e a chave PDF fora do repositório.
npm run start
```

Ou, em um arquivo `.env` local não versionado:

```text
PORT=3001
DATABASE_URL=postgres://usuario:senha@127.0.0.1:5432/assinatura_digital
DATABASE_SSL=false
```

O `.gitignore` já exclui `.env` e `.env.*`, preservando a exceção existente para `.env.example`. Nenhum arquivo `.env` real é fornecido ou versionado nesta issue.

## Segurança e escopo

- Não há credenciais, tokens, chaves ou URLs sensíveis hardcoded.
- `PORT`, `DATABASE_URL`, as duas chaves JWT e `PDF_MASTER_KEY_B64` são obrigatórios; `DATABASE_SSL` é validado como booleano textual e assume `false` quando não informado.
- A configuração não é registrada em logs nem enviada em respostas HTTP. Mensagens de validação não ecoam valores recebidos.
- TLS habilitado usa `rejectUnauthorized: true`; não há atalho `rejectUnauthorized: false`.
- O pool é limitado, tem timeout de conexão, uma tentativa de retry e não executa migrations automaticamente.
- O health check continua retornando somente seu contrato público.
- Valores ausentes ou inválidos de `PORT` fazem a aplicação recusar a inicialização; a validação obrigatória foi implementada na Issue #73.

## Pendências relacionadas

- RNF-06 / Issue #71: arquivo `.env.example` documentado e versionável nesta branch.
- Issue #72: proteção formal do `.env` no repositório e histórico.
- Issue #73: validação obrigatória das variáveis na inicialização, implementada nesta branch de RNF-08.
- Issue #69: integração PostgreSQL e o schema necessário ao fluxo atual estão implementados; recursos adicionais permanecem nas issues próprias.

O RNF-06 foi implementado com o arquivo `.env.example`. A auditoria formal de arquivos `.env` e do histórico pertence à Issue #72; a validação obrigatória na inicialização está documentada em `docs/RNF-08-VALIDATION.md`.

Sempre que uma nova funcionalidade introduzir uma variável de ambiente, sua branch deve atualizar `.env.example` e esta documentação, sem inserir valores reais.
