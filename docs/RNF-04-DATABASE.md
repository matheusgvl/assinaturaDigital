# Persistência PostgreSQL — RNF-04

## Escopo

O backend usa PostgreSQL como banco relacional de infraestrutura e domínio. A aplicação persiste usuários, sessões, limites de login, chaves de assinatura cifradas e metadados das assinaturas; os bytes dos PDFs não são armazenados.

O status do RNF-04 é **implementado para o fluxo atual**: a infraestrutura, o `DataSource` compartilhado e as migrations de autenticação/documentos estão implementados. A fixture do RNF-09 fica fora do caminho de produção e serve somente à homologação automatizada. Não há execução automática de migrations no startup.

## Arquitetura

```text
AppModule
├── ConfigModule.forRoot
│   ├── app.config.ts       → PORT
│   └── database.config.ts  → DATABASE_URL / DATABASE_SSL
├── DatabaseModule
│   └── TypeOrmModule.forRootAsync
│       └── database-options.factory.ts → ConfigService
├── database/data-source.ts → CLI TypeORM (sem PORT/Nest HTTP)
├── database/migrations/   → caminho reservado para migrations de produção
├── test/migrations/       → DataSource e fixture de homologação
└── HealthModule
```

`DatabaseModule` é a fronteira de infraestrutura. Ele constrói as opções do TypeORM por meio de `ConfigService` e não permite que controllers ou services leiam `process.env` diretamente. A conexão é criada durante o ciclo de inicialização do NestJS; se a configuração ou o banco estiver indisponível, o processo falha antes de disponibilizar a API.

## Configuração

| Variável | Regra |
|---|---|
| `DATABASE_URL` | Obrigatória; esquema `postgres:` ou `postgresql:`, host e nome de banco válidos |
| `DATABASE_SSL` | `true` ou `false`; ausência equivale a `false` para desenvolvimento local |

O arquivo [`.env.example`](../.env.example) documenta as variáveis sem credenciais reais. O arquivo `.env` local é ignorado pelo Git.

Exemplo local, usando somente valores fornecidos pelo administrador da instância:

```powershell
$env:DATABASE_URL = 'postgres://USER:PASSWORD@127.0.0.1:5432/assinatura_digital'
$env:DATABASE_SSL = 'false'
```

Em ambiente com TLS, use `DATABASE_SSL=true`. O código configura `rejectUnauthorized: true`, mantendo a verificação do certificado; não existe caminho de configuração com `rejectUnauthorized: false`.

## Opções de conexão

As opções ficam centralizadas em `src/database/database-options.factory.ts` e são reutilizadas pela aplicação e pela CLI:

- `synchronize: false`;
- `migrationsRun: false`;
- `dropSchema: false`;
- tabela de histórico `typeorm_migrations`;
- migrations de produção localizadas por `src/database/migrations/*.{js,ts}`;
- pool limitado a 10 conexões;
- timeout de conexão de 5 segundos;
- uma tentativa de retry com atraso de 1 segundo;
- logging do TypeORM desabilitado para evitar exposição acidental de URLs, parâmetros ou dados.

Nenhuma senha, URL ou configuração completa é escrita em logs pela integração.

## Dados e migrations

PDFs não são armazenados no PostgreSQL. A aplicação não cria tabelas por sincronização e não executa migrations no startup. O diretório `src/database/migrations` contém as migrations de produção de autenticação, rate limiting e assinatura de documentos. A fixture `test/migrations/fixtures/1795789271721-Rnf09SchemaFixture.ts` cria somente `rnf09_migration_fixture` em ambiente de homologação.

O mecanismo real, histórico, segunda execução e reversão da fixture estão documentados em [`RNF-09-MIGRATIONS.md`](RNF-09-MIGRATIONS.md). As Issues #75 e #76 devem formalizar, respectivamente, a proibição operacional de mudanças manuais e a política completa de sequência/upgrade/downgrade.

## Testes de integração

`test/database.e2e-spec.ts` usa um PostgreSQL isolado para comprovar:

- conexão real e `SELECT 1`;
- startup válido e `GET /api/v1/health`;
- falha quando `DATABASE_URL` está ausente;
- falha quando o PostgreSQL está indisponível;
- falha com credenciais inválidas sem ecoar a senha sintética;
- encerramento do pool após fechar a aplicação.

Os testes de configuração também verificam URL inválida, valores de TLS, `synchronize`, `migrationsRun`, `dropSchema`, pool, timeout e ausência de `rejectUnauthorized: false`.

Os testes do RNF-09 comprovam banco vazio, inicialização sem sincronização, aplicação real da fixture, histórico, idempotência, configuração inválida, rollback transacional de uma migration com falha e encerramento do `DataSource`.

## Evidências executadas

Em 27/11/2026, a validação foi executada com um container efêmero `postgres:16-alpine`, publicado somente em `127.0.0.1:55432`, com banco e senha sintéticos gerados para a sessão. O container foi removido ao final e nenhuma credencial foi gravada no repositório.

| Verificação | Resultado |
|---|---|
| `npm ci --no-audit --no-fund` | aprovado |
| `npx tsc --noEmit` | aprovado |
| `npm run lint` | aprovado |
| `npm run build` | aprovado |
| `npm run test` | 7 suítes e 48 testes aprovados |
| `npm run test:e2e` | 4 suítes e 17 testes aprovados |
| `git diff --check` | aprovado |
| startup real válido | processo iniciou e `GET /api/v1/health` retornou HTTP 200 com contrato esperado |
| startup real sem `PORT` | processo encerrou com código 1 antes de escutar |
| `--detectOpenHandles` | 4 suítes e 17 testes aprovados, sem handle persistente reportado |
| `migration:run` em banco vazio | tabela `typeorm_migrations` criada; nenhuma tabela de fixture/negócio criada |
| `migration:test:run` | fixture criada e registrada no histórico |
| segunda `migration:test:run` | nenhuma migration pendente; histórico permaneceu com 1 registro |
| `migration:test:show` | `[X] 1 Rnf09SchemaFixture1795789271721` após execução |
| `migration:test:revert` | fixture removida do banco efêmero |
| `migration:show:compiled` | executado com sucesso a partir de `dist/database/data-source.js` |
| configuração CLI inválida | ausência de `DATABASE_URL` e `DATABASE_SSL=yes` terminaram com código 1 |

O Jest padrão emitiu um aviso transitório de handles assíncronos após os testes E2E negativos, embora tenha terminado com código 0; a execução diagnóstica com `--detectOpenHandles` não encontrou handle persistente. Esse comportamento fica registrado para acompanhamento, sem usar `forceExit` para mascará-lo.

`npm audit --omit=dev` encontrou 3 vulnerabilidades moderadas transitivas em `glob` e `minimatch`, provenientes do TypeORM 0.3.x. `npm audit fix` não foi executado automaticamente porque pode alterar a linha major e romper a compatibilidade validada com NestJS 11/Jest CommonJS; a atualização deve ser tratada em revisão própria.
