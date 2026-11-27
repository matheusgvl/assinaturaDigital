# Validação de ambiente na inicialização — RNF-08

## Contrato atual

`PORT` é a única variável de ambiente atualmente utilizada pelo backend e passou a ser obrigatória no startup.

- Deve existir no ambiente carregado pelo processo ou no `.env`.
- Deve ser um número inteiro entre `1` e `65535`.
- Valores ausentes, vazios, não numéricos ou fora do intervalo fazem o `ConfigModule` lançar erro.
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

O arquivo `test/setup-env.ts` fornece apenas `PORT=3000` sintético para os testes que precisam construir o módulo NestJS. Os cenários inválidos chamam a função de validação diretamente, sem depender do ambiente da máquina.

## Limites

Novas variáveis obrigatórias deverão ser adicionadas à função de validação, ao `.env.example`, à documentação e aos testes na mesma issue que introduzir a configuração. PostgreSQL, autenticação, chaves criptográficas e demais variáveis futuras não foram criados nesta issue.

## Evidências executadas

- `npm ci`: concluído.
- `npx tsc --noEmit`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- Testes unitários: 27 aprovados.
- Testes E2E: 4 aprovados.
- Processo sem `PORT`: encerrou com código 1 antes de disponibilizar a API.
- Processo com porta válida: iniciou em uma porta de teste e `GET /health` retornou HTTP 200 com o contrato existente.
