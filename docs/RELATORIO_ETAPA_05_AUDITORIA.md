# Relatório da Etapa 05 — auditoria e atividade de segurança

**Data:** 27/11/2026, horário de Brasília.

## Entregas em revisão

| Issue | PR | Estado | Evidência executada |
| --- | --- | --- | --- |
| #56 | #148 | Aberto com checks aprovados | Schema de `audit_events` com usuário quando identificável, UTC, IP, User-Agent, ação, resultado e request ID. |
| #55 | #149 | Aberto com checks aprovados | Interceptor, sete eventos obrigatórios, eventos relevantes de TOTP/WebAuthn e proteção append-only. |
| #58 | #151 backend e #34 frontend | Abertos com checks aprovados | IP novo, senha alterada, ativação/desativação de TOTP, leitura isolada e desativação com reautenticação. |

## Proteções efetivas

A migration de auditoria cria trigger `ENABLE ALWAYS` que rejeita UPDATE, DELETE e TRUNCATE. A validação E2E usou um papel PostgreSQL de execução sem `SUPERUSER`, `CREATEDB`, `CREATEROLE` ou propriedade das tabelas. Esse papel recebeu somente SELECT/INSERT em `audit_events`; suas tentativas de UPDATE e DELETE falharam. O proprietário da migration também recebeu o bloqueio do trigger durante o teste.

O registro não recebe corpo HTTP. Não possui colunas para senha, token, segredo TOTP, recovery code, chave privada ou conteúdo de PDF. Os E2E verificaram que senhas e access token do cenário não aparecem nos eventos.

## Resultados executados

- `test/audit.e2e-spec.ts`: 2 testes aprovados em PostgreSQL isolado.
- `test/security-alerts.e2e-spec.ts`: 1 teste aprovado, cobrindo IP novo, TOTP, senha, leitura e exclusão do segredo.
- Typecheck, lint e build aprovados nas branches correspondentes.

## Limite de segurança documentado

Um administrador privilegiado do PostgreSQL pode alterar o schema ou desabilitar objetos de proteção. A aplicação deve executar com papel distinto e sem privilégios administrativos, enquanto migrations usam papel controlado. O projeto não tenta prometer imutabilidade contra administradores do banco.
