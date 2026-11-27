# Persistência PostgreSQL — RNF-04

## Escopo

O backend usa PostgreSQL como banco relacional de infraestrutura. A integração desta issue prepara a conexão para as funcionalidades de domínio, sem armazenar PDFs no banco e sem criar entidades ou migrations antecipadamente.

O status do RNF-04 é **parcial nesta branch**: a infraestrutura e a conexão real estão implementadas, enquanto o modelo relacional e as migrations continuam reservados para as issues #74–#76. Não há execução automática de migrations no startup.

## Arquitetura

```text
AppModule
├── ConfigModule.forRoot
│   ├── app.config.ts       → PORT
│   └── database.config.ts  → DATABASE_URL / DATABASE_SSL
├── DatabaseModule
│   └── TypeOrmModule.forRootAsync
│       └── database-options.factory.ts → ConfigService
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

As opções ficam centralizadas em `src/database/database-options.factory.ts`:

- `synchronize: false`;
- `migrationsRun: false`;
- `dropSchema: false`;
- pool limitado a 10 conexões;
- timeout de conexão de 5 segundos;
- uma tentativa de retry com atraso de 1 segundo;
- logging do TypeORM desabilitado para evitar exposição acidental de URLs, parâmetros ou dados.

Nenhuma senha, URL ou configuração completa é escrita em logs pela integração.

## Dados e migrations

PDFs não são armazenados no PostgreSQL. Esta etapa não cria tabelas de negócio, não cria entidades e não executa migrations. As issues #74–#76 devem definir o modelo, arquivos de migration, estratégia de rollback e os testes de persistência antes de o RNF-04 ser considerado integralmente concluído.

## Testes de integração

`test/database.e2e-spec.ts` usa um PostgreSQL isolado para comprovar:

- conexão real e `SELECT 1`;
- startup válido e `GET /health`;
- falha quando `DATABASE_URL` está ausente;
- falha quando o PostgreSQL está indisponível;
- falha com credenciais inválidas sem ecoar a senha sintética;
- encerramento do pool após fechar a aplicação.

Os testes de configuração também verificam URL inválida, valores de TLS, `synchronize`, `migrationsRun`, `dropSchema`, pool, timeout e ausência de `rejectUnauthorized: false`.

## Evidências executadas

Em 27/11/2026, a validação foi executada com um container efêmero `postgres:16-alpine`, publicado somente em `127.0.0.1:55432`, com banco e senha sintéticos gerados para a sessão. O container foi removido ao final e nenhuma credencial foi gravada no repositório.

| Verificação | Resultado |
|---|---|
| `npm ci --no-audit --no-fund` | aprovado |
| `npx tsc --noEmit` | aprovado |
| `npm run lint` | aprovado |
| `npm run build` | aprovado |
| `npm run test` | 6 suítes e 42 testes aprovados |
| `npm run test:e2e` | 3 suítes e 11 testes aprovados |
| `git diff --check` | aprovado |
| startup real válido | processo iniciou e `GET /health` retornou HTTP 200 com contrato esperado |
| startup real sem `PORT` | processo encerrou com código 1 antes de escutar |
| `--detectOpenHandles` | 3 suítes e 11 testes aprovados, sem handle persistente reportado |

O Jest padrão emitiu um aviso transitório de handles assíncronos após os testes E2E negativos, embora tenha terminado com código 0; a execução diagnóstica com `--detectOpenHandles` não encontrou handle persistente. Esse comportamento fica registrado para acompanhamento, sem usar `forceExit` para mascará-lo.

`npm audit --omit=dev` encontrou 3 vulnerabilidades moderadas transitivas em `glob` e `minimatch`, provenientes do TypeORM 0.3.x. `npm audit fix` não foi executado automaticamente porque pode alterar a linha major e romper a compatibilidade validada com NestJS 11/Jest CommonJS; a atualização deve ser tratada em revisão própria.
