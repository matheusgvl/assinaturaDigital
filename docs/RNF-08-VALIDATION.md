# Validação de ambiente na inicialização — RNF-08

## Contrato atual

`PORT` e `DATABASE_URL` são obrigatórios no startup. `DATABASE_SSL` é opcional para desenvolvimento local, mas, quando informado, aceita somente `true` ou `false`.

- Deve existir no ambiente carregado pelo processo ou no `.env`.
- Deve ser um número inteiro entre `1` e `65535`.
- Valores ausentes, vazios, não numéricos ou fora do intervalo fazem o `ConfigModule` lançar erro.
- `DATABASE_URL` deve usar o esquema `postgres:` ou `postgresql:` e conter um nome de banco.
- Valores ausentes ou inválidos de `DATABASE_URL` e `DATABASE_SSL` fazem o `ConfigModule` lançar erro.
- O servidor não executa `listen` quando a validação falha.

A validação é centralizada em `src/config/app.config.ts` e conectada ao `ConfigModule.forRoot({ validate })`. O `ConfigService` recebe somente a configuração já validada; não há fallback silencioso para configuração inválida.

## Testes

Os testes cobrem:

- `PORT` válido;
- ausência de `PORT`;
- valor vazio;
- valor não numérico;
- valores `0` e `65536`;
- limites válidos `1` e `65535`;
- regressão do health check e da API HTTP.

O arquivo `test/setup-env.ts` fornece `PORT=3000` sintético somente quando a variável não foi definida pelo processo. Valores explícitos são preservados e o valor original é restaurado ao final da suíte. Os testes que exigem PostgreSQL usam um banco isolado e não gravam credenciais no repositório.

## Limites

Novas variáveis obrigatórias deverão ser adicionadas à função de validação, ao `.env.example`, à documentação e aos testes na mesma issue que introduzir a configuração. As entidades, migrations e o modelo de domínio PostgreSQL ainda pertencem às issues #74–#76. PDFs não são armazenados no banco.

## Evidências executadas

As evidências específicas desta implementação estão em [`docs/RNF-04-DATABASE.md`](RNF-04-DATABASE.md), incluindo o comando executado, o banco isolado usado e a classificação das migrations ainda pendentes.
