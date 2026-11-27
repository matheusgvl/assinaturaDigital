# REQ-66 — Dependências atualizadas e auditadas

## Automação

O repositório executa `npm audit --omit=dev --audit-level=high` em cada Pull
Request, em pushes para `main` e semanalmente pelo workflow
`.github/workflows/security-audit.yml`. O Dependabot verifica atualizações do
ecossistema npm semanalmente em `.github/dependabot.yml`.

O limiar de CI é `high`: vulnerabilidades altas ou críticas bloqueiam a
verificação. Alertas moderados continuam visíveis no relatório completo do npm
e devem ser reavaliados quando houver uma versão compatível disponível.

## Evidência em 2026-11-27

Comando executado:

```text
npm audit --omit=dev
```

Resultado real: exit code `1`, com `0` vulnerabilidades informativas, baixas,
altas ou críticas e `3` moderadas no grafo de produção. Os alertas são
transitivos por `typeorm@0.3.x`, envolvendo `glob`/`minimatch`, e também
referenciam avisos de segurança do próprio TypeORM. A linha `0.3.x` disponível
no lockfile não oferece uma atualização não-major que elimine todo o conjunto;
uma atualização para a linha major seguinte exige revisão de compatibilidade e
não foi aplicada automaticamente.

O comando usado pelo CI, com limiar `high`, é o controle automático adotado
enquanto o Dependabot acompanha a disponibilidade de correções. Nenhum
`npm audit fix` ou `--force` foi executado.

## Decisão de segurança

O backend usa PostgreSQL e consultas parametrizadas pelo TypeORM; não constrói
`orderBy` ou SQL com entrada HTTP nesta etapa. A migração de TypeORM deve ser
tratada como mudança de compatibilidade, com testes de compilação, integração e
revisão de segurança antes de atualizar a major.
