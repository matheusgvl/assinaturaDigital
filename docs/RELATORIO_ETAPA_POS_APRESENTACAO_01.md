# Relatório — etapa pós-apresentação 01

## Resultado

A etapa de estabilização e segurança de autenticação foi concluída com os PRs
#120, #121, #122, #123 e #124 mesclados na `main` do backend. O PR #30 do
frontend também foi mesclado. O fluxo funcional de assinatura criptográfica de
PDF existente foi preservado.

Isso não significa que o projeto inteiro esteja 100% concluído: WebAuthn, TOTP,
recuperação, auditoria imutável e requisitos adicionais de PDF continuam fora
desta etapa.

## Implementações

### Autenticação, JWT e sessões

- login com rate limiting atômico por conta e IP;
- refresh token opaco de 256 bits, armazenado somente como SHA-256;
- validade de sete dias e cookie HttpOnly/Secure/SameSite Strict;
- denylist por `jti`, consultada no guard a cada rota autenticada;
- claims `jti`, `iat`, `exp`, `session_id`, `ip_hash` e `ua_hash`;
- troca de senha com `password_changed_at` e revogação das sessões;
- User-Agent divergente rejeitado e alteração de IP registrada apenas como alerta;
- `current` correto em `/api/v1/auth/sessions`;
- rotação de refresh com `SELECT ... FOR UPDATE` e transação PostgreSQL;
- `family_id` e revogação em cascata quando há reuso de token.

### Segurança HTTP

CORS, preflight, credenciais por allowlist, cache, CSP, HSTS condicional,
X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy e
X-XSS-Protection foram validados pelos testes das issues correspondentes.

### Migration

Foi criada `src/database/migrations/1795789272300-CreateAccessTokenSecurity.ts`,
com `up` e `down`, adicionando:

- `users.password_changed_at`;
- `sessions.family_id` com backfill das sessões existentes;
- `access_token_denylist` com chave primária `jti`, vínculo de usuário e índice
  de expiração.

A migration foi aplicada no PostgreSQL de testes sem tocar no banco da
demonstração.

## Evidências por PR

| PR | Evidência |
|---|---|
| [#120](https://github.com/matheusgvl/assinaturaDigital/pull/120) | 40 tentativas concorrentes por IP e 25 por conta, com limites determinísticos e sem 5xx |
| [#121](https://github.com/matheusgvl/assinaturaDigital/pull/121) | cookie com `Max-Age=604800` |
| [#122](https://github.com/matheusgvl/assinaturaDigital/pull/122) | CORS/preflight e headers HTTP em produção simulada |
| [#123](https://github.com/matheusgvl/assinaturaDigital/pull/123) | 12 testes de autenticação, denylist, UA/IP, troca de senha e refresh concorrente |
| [#124](https://github.com/matheusgvl/assinaturaDigital/pull/124) | teste adicional de revogação de toda a família após reuso |
| [#30](https://github.com/matheusgvl/assinaturaDigitalFront/pull/30) | homologação Playwright do fluxo real de PDF |

## Matriz de validação final

Executado no backend a partir de branch derivada da `main`, com banco de testes
separado:

```powershell
$env:DATABASE_URL = 'postgresql://assinatura_test:assinatura_test@localhost:55432/assinatura_test'
$env:DATABASE_SSL = 'false'
npx tsc --noEmit
npm run lint
npm run build
npm run test
npm run test:e2e
git diff --check
```

Resultados reais: 12 suites/79 testes unitários e 11 suites/49 testes E2E
aprovados. A suíte de autenticação foi executada novamente no PR #124 com 13
testes aprovados.

O frontend foi validado anteriormente na branch do PR #30 com typecheck, lint,
build, Vitest (22 arquivos/100 testes) e Playwright real. O fluxo validado foi:

`cadastro → login → upload → prévia/canvas → selo → assinatura CMS/RSA → download → verificação válida → adulteração → not_found`.

## Branches e commits

- `feat/issue-5-login-rate-limit-atomic`: `7b434e4`, PR #120;
- `fix/issue-19-refresh-token-ttl`: `1622f69`, PR #121;
- `feat/issue-32-http-security-headers`: `e3cae60`, PR #122;
- `feat/issue-21-auth-session-security`: `c0992df` e `cf50fad`, PR #123;
- `test/issue-30-refresh-reuse`: `54d0212`, PR #124;
- `fix/issue-46-pdf-preview-vite`: `ecd8f9d`, frontend PR #30.

Os commits de implementação terminam em `Ref #ID`. Os merges foram feitos por
merge commit, sem squash e sem push direto na `main`.

## Skills utilizadas

`security-best-practices` orientou a revisão de tokens, cookies, CSRF, entradas,
uploads, logs, CORS e headers. `playwright` orientou e executou a homologação
real do navegador. A análise de banco e concorrência reutilizou o padrão
transacional existente no `LoginRateLimitService`.

## Pendências reais

- WebAuthn/passkeys e TOTP ainda não foram implementados integralmente;
- recuperação de conta, gerenciamento avançado de dispositivos e auditoria
  imutável permanecem como requisitos futuros;
- #45, #48, #49, #55, #56, #58, #59, #62, #63 e outras issues de segurança/PDF
  continuam abertas;
- o ambiente não possui `pdfsig` para validação independente;
- `gh project list` ficou bloqueado pelo escopo do token;
- quatro vulnerabilidades moderadas aparecem em `npm ci`, enquanto a verificação
  CI de produção em nível alto passou;
- o teste histórico de startup imprime avisos de teardown assíncrono na execução
  conjunta, apesar do código de saída 0 e das asserções aprovadas.

## Próxima etapa

A próxima etapa deve ser dedicada a WebAuthn, TOTP, recuperação, auditoria e
proteções adicionais de PDF. Não há autorização implícita para alterar o fluxo
de assinatura já homologado nem para executar deploy.
