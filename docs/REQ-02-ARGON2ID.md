# REQ-02 — Armazenamento com Argon2id

O backend usa Argon2id para derivar hashes de senha, com `memoryCost=65536`
(64 MiB), `timeCost=3` e `parallelism=4`. O salt é gerado pela biblioteca e o
hash retornado contém apenas o formato Argon2id; a senha original não é
persistida nem incluída em erros.

`hashPassword` reaplica a política de senha do REQ-01 antes de derivar o hash.
`verifyPassword` falha fechado para hashes malformados e rejeita formatos que
não começam com `$argon2id$`. O módulo é uma regra de domínio independente de
HTTP e banco; o vínculo com usuários será feito quando as entidades de domínio
forem implementadas.
