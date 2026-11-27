# Validação de ambiente na inicialização — RNF-08

## Contrato atual

`PORT`, `DATABASE_URL`, `JWT_PRIVATE_KEY_B64`, `JWT_PUBLIC_KEY_B64` e `PDF_MASTER_KEY_B64` são obrigatórios no startup. `DATABASE_SSL` é opcional para desenvolvimento local, mas, quando informado, aceita somente `true` ou `false`.

- Deve existir no ambiente carregado pelo processo ou no `.env`.
- Deve ser um número inteiro entre `1` e `65535`.
- Valores ausentes, vazios, não numéricos ou fora do intervalo fazem o `ConfigModule` lançar erro.
- `DATABASE_URL` deve usar o esquema `postgres:` ou `postgresql:` e conter um nome de banco.
- Valores ausentes ou inválidos de `DATABASE_URL` e `DATABASE_SSL` fazem o `ConfigModule` lançar erro.
- As chaves JWT devem ser PEMs RSA codificados em Base64; a chave mestra PDF deve decodificar para exatamente 32 bytes.
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

Novas variáveis obrigatórias deverão ser adicionadas à função de validação, ao `.env.example`, à documentação e aos testes na mesma issue que introduzir a configuração. Os bytes dos PDFs não são armazenados no banco, mas usuários, chaves cifradas e metadados de assinaturas são definidos por migrations de produção.

## Evidências executadas

As evidências específicas desta implementação estão em [`docs/RNF-04-DATABASE.md`](RNF-04-DATABASE.md), incluindo o comando executado, o banco isolado usado e a classificação das migrations ainda pendentes.
