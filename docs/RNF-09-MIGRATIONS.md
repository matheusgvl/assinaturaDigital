# Schema por migrations — RNF-09

## Resultado e limite de escopo

O mecanismo de migrations versionadas está implementado e foi homologado contra PostgreSQL 16 real em banco vazio. O schema de negócio ainda não foi criado: não há entidades permanentes justificáveis neste escopo e não foram inventadas tabelas de usuários, documentos, assinaturas ou auditoria.

Para testar o mecanismo sem transformar uma tabela artificial em schema de produção, a homologação usa a fixture `test/migrations/fixtures/1795789271721-Rnf09SchemaFixture.ts`. Ela cria somente `rnf09_migration_fixture`, com colunas técnicas `id`, `marker` e `created_at`, e está fora de `src/database/migrations`.

Classificação: **PASS para o mecanismo RNF-09; PARTIAL para o RNF-04 quanto ao schema de negócio**.

## Arquitetura

```text
src/database/database-options.factory.ts
├── opções PostgreSQL comuns
├── migrationsTableName: typeorm_migrations
├── synchronize: false
├── migrationsRun: false
└── dropSchema: false

src/database/data-source.ts
└── DataSource da CLI, sem PORT e sem inicializar Nest/HTTP

src/database/migrations/
└── caminho reservado para migrations de produção

test/migrations/fixture-data-source.ts
└── DataSource isolado que aponta para a fixture
```

`src/database/data-source.ts` carrega `.env` de forma silenciosa, valida `DATABASE_URL` e `DATABASE_SSL` e reutiliza `createDatabaseOptionsFromEnvironment`. A CLI não executa `PORT` porque não inicia o servidor HTTP. A aplicação continua usando `ConfigModule`, exige `PORT` e mantém o mesmo contrato PostgreSQL.

## Convenção e segurança

Migrations devem seguir `TIMESTAMP-NomeDescritivo.ts`, implementar `MigrationInterface` e conter `up` e `down` determinísticos. Depois de aplicada em ambiente compartilhado, uma migration não deve ser editada; correções devem ser novas migrations. A sequência e a política de upgrade/downgrade estão formalizadas em [`RNF-11-MIGRATION-IDENTIFIERS.md`](RNF-11-MIGRATION-IDENTIFIERS.md).

As opções abaixo são obrigatoriamente desativadas tanto na aplicação quanto no DataSource:

```text
synchronize: false
migrationsRun: false
dropSchema: false
```

`DATABASE_SSL=true` mantém `rejectUnauthorized: true`. Parâmetros TLS na `DATABASE_URL` (`sslmode`, `ssl`, certificados e equivalentes) são rejeitados para impedir que a URL contradiga `DATABASE_SSL`. URLs e credenciais não são incluídas em migrations, logs próprios ou mensagens de validação.

As migrations desta issue usam SQL estático e não recebem entrada de usuário. A inspeção de schema usa consultas parametrizadas. Não há `DROP DATABASE`, `TRUNCATE`, extensões administrativas, credenciais, dados pessoais ou PDFs.

## Scripts

| Script | Uso |
|---|---|
| `npm run migration:create -- src/database/migrations/Nome` | cria arquivo TypeScript vazio no caminho informado |
| `npm run migration:generate -- src/database/migrations/Nome` | gera migration a partir das entidades após revisão do SQL |
| `npm run migration:run` | aplica migrations de produção explicitamente |
| `npm run migration:show` | mostra migrations de produção pendentes/executadas |
| `npm run migration:revert` | reverte a última migration em ambiente autorizado |
| `npm run migration:run:compiled` | aplica migrations usando `dist/database/data-source.js` |
| `npm run migration:show:compiled` | consulta o DataSource compilado |
| `npm run migration:test:run` | executa a fixture isolada de homologação |
| `npm run migration:test:show` | consulta o estado da fixture |
| `npm run migration:test:revert` | reverte a fixture em banco efêmero autorizado |

Exemplo sem colocar credenciais em arquivos versionados:

```powershell
$env:DATABASE_URL = 'postgres://USER:PASSWORD@127.0.0.1:5432/assinatura_digital'
$env:DATABASE_SSL = 'false'
npm run migration:show
```

`DATABASE_URL` é obrigatória para a CLI. `PORT` não é necessária para comandos de migration, mas continua obrigatória para `npm run start`.

## Processo de revisão

1. Crie a migration com nome temporal e revise o arquivo gerado.
2. Verifique que não há SQL dinâmico, segredos, PDFs ou operações destrutivas fora do objeto da própria migration.
3. Execute `migration:show` e `migration:run` somente no banco autorizado.
4. Confirme o registro em `typeorm_migrations` e inspecione o schema por `information_schema`/`pg_catalog`.
5. Nunca edite uma migration já aplicada; crie uma nova para corrigir o schema.
6. Em branches paralelas, coordene timestamps e resolva a ordem antes de compartilhar o histórico.

## Evidências reais

Em 27/11/2026 foram usados containers PostgreSQL 16 efêmeros, cada um com banco dedicado, porta local e senha sintética gerada somente para a sessão. Nenhuma credencial foi versionada e os containers foram removidos ao final.

- `npm ci --no-audit --no-fund`: aprovado.
- `npx tsc --noEmit`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- `npm run test`: 7 suítes, 48 testes aprovados.
- `npm run test:e2e`: 4 suítes, 17 testes aprovados.
- Execução E2E com `--detectOpenHandles`: 4 suítes, 17 testes aprovados, sem handle persistente reportado.
- `migration:run` em banco vazio: criou somente `typeorm_migrations`; a tabela de fixture permaneceu ausente.
- `migration:test:show` inicial: `[ ] Rnf09SchemaFixture1795789271721`.
- Primeira `migration:test:run`: criou `rnf09_migration_fixture`, com colunas `id, marker, created_at`, e registrou 1 histórico.
- Segunda `migration:test:run`: `No migrations are pending`; o histórico permaneceu com 1 registro.
- `migration:test:show` após aplicação: `[X] 1 Rnf09SchemaFixture1795789271721`.
- `migration:test:revert`: removeu a fixture do banco efêmero; `migration:show:compiled` executou com sucesso.
- Configurações sem `DATABASE_URL` e com `DATABASE_SSL=yes`: CLI terminou com código 1 e mensagens sanitizadas.
- `git diff --check`: aprovado.

O Jest padrão também emitiu o aviso transitório de handles observado nas suítes anteriores; a execução diagnóstica não encontrou handle persistente e não foi usado `forceExit`.

## Dependências e próximos requisitos

`npm audit --omit=dev` mantém as 3 vulnerabilidades moderadas transitivas já registradas em `glob`/`minimatch` via TypeORM 0.3.x. `npm audit fix --force` não foi executado.

Os controles contra alterações manuais estão formalizados em [`RNF-10-MIGRATION-DISCIPLINE.md`](RNF-10-MIGRATION-DISCIPLINE.md), e a convenção de sequência, upgrade/downgrade e rollback está em [`RNF-11-MIGRATION-IDENTIFIERS.md`](RNF-11-MIGRATION-IDENTIFIERS.md). A Issue #69 permanece relacionada e não é encerrada automaticamente porque o schema de negócio ainda não foi definido.
