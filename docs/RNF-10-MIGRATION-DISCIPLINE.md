# RNF-10 — Schema sem alteração manual

## Regra

Alterações de schema são feitas exclusivamente por migrations versionadas e
revisadas em Pull Request. A aplicação não sincroniza entidades automaticamente
e não remove schema: `synchronize`, `migrationsRun` e `dropSchema` permanecem
desativados.

O acesso operacional ao banco não é um mecanismo de entrega de schema. SQL
manual pode ser usado somente para inspeção controlada ou recuperação autorizada;
qualquer alteração permanente deve ser codificada em uma migration com `up` e
`down`, testada e registrada na tabela de histórico.

## Fluxo obrigatório

1. Criar uma migration nomeada por timestamp.
2. Revisar o SQL, o escopo e o rollback.
3. Executar a migration em banco efêmero e validar o histórico.
4. Revisar o Pull Request e aplicar a migration por comando explícito no
   ambiente autorizado.
5. Nunca editar uma migration já aplicada; criar outra migration corretiva.

Os comandos documentados em [`RNF-09-MIGRATIONS.md`](RNF-09-MIGRATIONS.md) são
o caminho suportado para criar, aplicar, consultar e reverter migrations.
