# RNF-11 — Identificação e rollback de migrations

## Convenção

Cada migration recebe um timestamp de 13 dígitos seguido de nome descritivo:
`TIMESTAMP-NomeDescritivo.ts`. O timestamp é o identificador ordenável usado
pelo TypeORM no histórico `typeorm_migrations`.

Toda migration deve implementar `up` e `down`. O `up` aplica somente a mudança
da própria migration; o `down` desfaz essa mudança de forma determinística e
não remove objetos de outras versões.

Depois de aplicada em ambiente compartilhado, a migration não é editada. Uma
correção é uma nova migration, preservando o histórico executado.

## Evidência

A fixture `1795789271721-Rnf09SchemaFixture.ts` é validada por teste estático e
por integração PostgreSQL. A integração confirmou a aplicação inicial, o
registro de um único histórico, a segunda execução idempotente e o rollback que
remove somente a tabela criada pela fixture.

O mesmo fluxo é usado pelos comandos `migration:run`, `migration:show` e
`migration:revert`, sempre em banco autorizado e sem execução automática no
startup da API.
