# REQ-03 — Autenticação funcional

## Contrato implementado

O backend expõe, sob `/api/v1/auth`:

- `POST /register`: cria usuário com e-mail normalizado e senha Argon2id.
- `POST /login`: valida senha, retorna access token RS256 de 15 minutos e
  define refresh token opaco em cookie HttpOnly.
- `GET /me`: exige `Authorization: Bearer` e retorna o usuário autenticado.
- `POST /refresh`: rotaciona o refresh token e invalida o anterior.
- `POST /logout`: revoga o refresh token atual e limpa o cookie.

Refresh tokens são gerados com aleatoriedade criptográfica e persistidos somente
como SHA-256. Access tokens não são persistidos; suas chaves RSA são fornecidas
por `JWT_PRIVATE_KEY_B64` e `JWT_PUBLIC_KEY_B64`, fora do repositório.

## Proteções

Login inexistente, senha incorreta e conta temporariamente bloqueada usam o
mesmo status e mensagem. Após cinco falhas consecutivas, a conta é bloqueada por
15 minutos. Um login válido zera o contador. A política de senha e o hashing
estão documentados em `REQ-01-PASSWORD-POLICY.md` e `REQ-02-ARGON2ID.md`.

CSRF por cookie, TOTP, rate limiting distribuído e passkeys ainda são requisitos
separados e não são apresentados como concluídos por esta entrega.

## Chaves locais

Gere chaves RSA localmente e forneça os PEMs codificados em Base64 pelas
variáveis `JWT_PRIVATE_KEY_B64` e `JWT_PUBLIC_KEY_B64`. Nunca copie os valores
para `.env.example`, commits ou logs.
