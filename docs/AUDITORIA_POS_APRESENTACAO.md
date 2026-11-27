# Auditoria pós-apresentação

Data da auditoria: 27/11/2026  
Repositórios: `matheusgvl/assinaturaDigital` e `matheusgvl/assinaturaDigitalFront`

## Escopo e método

Esta auditoria foi realizada após a apresentação acadêmica e antes do encerramento
dos blocos de estabilização, autenticação, sessões e segurança HTTP. Foram
consultados os repositórios, branches, PRs e issues pelo GitHub CLI, além dos
checkouts locais. Os testes E2E do backend apontaram exclusivamente para o
PostgreSQL de testes em `localhost:55432/assinatura_test`; o banco da demonstração
em `localhost:55433` não foi usado por testes destrutivos.

As skills aplicadas foram:

- `security-best-practices`: revisão de cookies, CSRF, JWT, uploads, headers,
  logs, validação de entrada e proteção de segredos;
- `playwright`: homologação real do frontend com backend real, incluindo upload,
  prévia, posicionamento do selo, assinatura, download e verificação.

Não foram instaladas skills novas. A skill de Playwright foi executada por CLI
porque o wrapper WSL não estava disponível neste Windows.

## Estado atualizado

| Repositório | `origin/main` | Issues abertas | Issues fechadas |
|---|---|---:|---:|
| Backend | `8396e9a07a803d2a81bc87e30bbfbd8ec57ef0eb` | 21 | 61 |
| Frontend | `d1263f08acc7b558a85f2433a6ca27cc7c32b3e3` | 0 | 13 |

O backend passou de 82 issues totais auditadas para 21 abertas e 61 fechadas.
Os números são uma fotografia do GitHub em 27/11/2026, não uma afirmação de que
todos os requisitos restantes estejam implementados.

## PRs verificados e mesclados

- Frontend PR [#30](https://github.com/matheusgvl/assinaturaDigitalFront/pull/30):
  exclusão de `pdfjs-dist` da pré-otimização do Vite; merge `d1263f0`.
- Backend PR [#118](https://github.com/matheusgvl/assinaturaDigital/pull/118):
  resolução do conflito e rate limiting concorrente de verificação; merge
  `20556d7`.
- Backend PR [#120](https://github.com/matheusgvl/assinaturaDigital/pull/120):
  rate limiting de login atômico; merge `6f110e3`.
- Backend PR [#121](https://github.com/matheusgvl/assinaturaDigital/pull/121):
  refresh token com validade de sete dias; merge `8c010be`.
- Backend PR [#122](https://github.com/matheusgvl/assinaturaDigital/pull/122):
  CORS e headers HTTP; merge `3efd235`.
- Backend PR [#123](https://github.com/matheusgvl/assinaturaDigital/pull/123):
  claims JWT, denylist, sessões e refresh atômico; merge `63f5e32`.
- Backend PR [#124](https://github.com/matheusgvl/assinaturaDigital/pull/124):
  teste explícito de revogação em cascata por reuso; merge `8396e9a`.

Todos os merges preservaram commits individuais. Não houve push direto na
`main`, deploy ou squash.

## Baseline e validação posterior

As implementações anteriores já possuíam cobertura documentada de configuração,
migrations, assinatura/verificação PDF e autenticação básica. Após a atualização
para a `main` atual, os comandos executados no branch de autenticação foram:

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | aprovado |
| `npm run lint` | aprovado |
| `npm run build` | aprovado |
| `npm run test` | 12 suites, 79 testes aprovados |
| `npm run test:e2e` | 11 suites, 49 testes aprovados |
| `npm run test:e2e -- --runTestsByPath test/auth.e2e-spec.ts` | 13 testes aprovados no PR #124 |
| `git diff --check` | aprovado |
| `npm audit --omit=dev --audit-level=high` no CI | aprovado |

Os E2E cobriram também migrations, configuração de startup, headers, CORS,
health, documentos e assinatura. O teste de startup histórico ainda imprime
avisos de teardown assíncrono quando todas as suites são executadas juntas; as
49 asserções terminam aprovadas. Isso permanece como limitação operacional
registrada, sem `forceExit` para mascarar o comportamento.

## Requisitos revisados

### Concluídos nesta etapa

- #5: limite de login por conta e IP com operação transacional;
- #19 e #20: refresh opaco de 256 bits, hash no banco, TTL de sete dias e cookie
  HttpOnly/Secure/SameSite Strict;
- #21 e #22: denylist persistida e consultada pelo guard;
- #24 a #30: `jti`, `iat`, `session_id`, hashes de IP/User-Agent, invalidação por
  troca de senha, sessões atuais, rotação atômica e revogação de família;
- #32 a #36 e #38 a #44: CORS, preflight e headers HTTP exigidos;
- #53: rate limiting concorrente da verificação;
- #57 e #64: sessões isoladas/revogáveis e validação de entradas, após revisão;
- #47 e #65 já estavam fechadas e foram rechecadas durante a homologação.

As issues acima foram fechadas apenas após comentários com evidências nos
respectivos tickets.

### Ainda abertas

Permanecem abertas as issues relacionadas a TOTP, WebAuthn, auditoria imutável,
campos adicionais de segurança, chave privada e alguns requisitos de PDF. Em
particular, #6 a #16, #45, #48, #49 e #55 a #63 ainda não devem ser descritas
como concluídas apenas por causa desta etapa.

## Limitações e bloqueios

- `gh project list --owner matheusgvl` não pôde ser consultado porque o token do
  GitHub não possui o escopo `read:project`.
- `pdfsig` não está instalado no Windows deste ambiente; a assinatura foi
  validada pelo endpoint real e pelos testes CMS/RSA existentes, mas não por esse
  verificador independente.
- `npm ci` reporta quatro vulnerabilidades moderadas no grafo completo; a
  auditoria CI configurada para dependências de produção com nível alto passou.
- HSTS é emitido somente em produção quando a requisição é HTTPS; localhost não
  deve ser interpretado como evidência de HSTS de produção.
- Os hashes de IP/UA são SHA-256 para atender ao contrato acadêmico. O IP gera
  alerta e não bloqueia automaticamente; User-Agent divergente é rejeitado.

## Conclusão da auditoria

O fluxo apresentado de assinatura/verificação foi preservado. O bloco de
autenticação agora possui revogação efetiva por sessão, denylist e família de
refresh, com cobertura concorrente em PostgreSQL real. As próximas etapas devem
tratar WebAuthn, TOTP, recuperação, auditoria e requisitos adicionais de PDF sem
reabrir ou enfraquecer os controles validados aqui.
