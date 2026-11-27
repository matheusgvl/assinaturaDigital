# Contratos da API REST

## Escopo atual

O backend usa NestJS como API HTTP independente do frontend. Além do health check, o contrato atual inclui autenticação e operações reais de assinatura/verificação:

```http
GET /api/v1/health
Accept: application/json
```

Resposta `200 OK` (`application/json`):

```json
{
  "status": "ok",
  "service": "assinatura-digital-api"
}
```

Os campos são estáveis, tipados no backend e não incluem banco de dados, ambiente, credenciais ou segredos.

### Autenticação

As rotas ficam sob `/api/v1/auth`:

- `POST /register` (`201`): `{ name, email, password }`.
- `POST /login` (`200`): retorna o access token; o refresh é somente cookie HttpOnly.
- `GET /me` (`200`): exige Bearer token.
- `POST /refresh` (`200`): gira o refresh cookie.
- `POST /logout` (`204`): revoga o refresh atual.

### Documentos

- `POST /api/v1/documents/sign` (`200`): exige Bearer token e recebe multipart `file`, `page`, `x` e `y`; retorna somente o PDF assinado.
- `POST /api/v1/documents/verify` (`201`): recebe multipart `file` sem autenticação e retorna `valid`, `tampered` ou `not_found`.

Uploads são validados por limite de 20 MiB, magic number `%PDF-` e rejeição de ações JavaScript/AA. Os bytes não são persistidos; somente hash, identidade da assinatura e material de chave cifrado permanecem no PostgreSQL.

## Convenções REST

- `GET` consulta recursos.
- `POST` cria recursos ou dispara operações explícitas.
- `PUT` substitui um recurso integralmente.
- `PATCH` atualiza um recurso parcialmente.
- `DELETE` remove ou revoga um recurso.
- Rotas usam substantivos claros e parâmetros de rota para identificar recursos.
- Query parameters ficam reservados para filtros e paginação.
- JSON é o formato padrão; os endpoints de documento usam `multipart/form-data`.

Não são criadas rotas artificiais apenas para demonstrar métodos HTTP. Atualmente, `POST /api/v1/health` não é suportado e o NestJS responde `404`.

O contrato de autenticação, incluindo cookies e rotação de refresh token, está em [`docs/REQ-03-AUTHENTICATION-CORE.md`](REQ-03-AUTHENTICATION-CORE.md). Os endpoints de autenticação usam o envelope global de erros e nunca retornam senhas, hashes ou refresh tokens no corpo.

## Status HTTP

As respostas devem usar semanticamente `200 OK`, `201 Created` e `204 No Content` para sucesso, e `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `413 Payload Too Large`, `422 Unprocessable Entity`, `429 Too Many Requests` e `500 Internal Server Error` conforme o caso.

Erros HTTP usam um envelope JSON estável com `code`, `message`, `timestamp` e `path`:

```json
{
  "code": "VAL_001",
  "message": "Invalid request",
  "timestamp": "2026-11-27T14:00:00.000Z",
  "path": "/api/v1/health"
}
```

O código é controlado pelo backend: `VAL_001` representa validação, `AUTH_001` autenticação, `AUTH_002` autorização, `DOC_001` documentos e `API_001` falhas genéricas. Exceções inesperadas sempre retornam `500 Internal Server Error` sem stack trace, SQL, credenciais ou valores recebidos.

Falhas de entrada usam `400`, ausência de autenticação usa `401`, falta de permissão usa `403`, recurso inexistente usa `404` e falhas não tratadas usam `500`. O filtro global preserva esses status e não transforma falhas internas em respostas de sucesso.

As respostas HTTP incluem uma política CSP restritiva: `default-src 'self'`, `script-src 'self'`, `object-src 'none'` e `frame-ancestors 'none'`. Fontes curinga e scripts inline/eval não são permitidos.

## Organização

Controllers são a camada de transporte: recebem HTTP, delegam e retornam contratos. Services concentram regras de domínio e não dependem do frontend. Módulos agrupam responsabilidades por domínio. O frontend deve consumir somente estes contratos HTTP e nunca importar módulos internos ou acessar o banco diretamente.

Passkeys, TOTP completo, CSRF e recursos avançados de auditoria ainda são issues próprias. CORS, headers, persistência mínima de metadados e assinatura/verificação PDF já estão implementados.

## Versionamento e evolução

Os endpoints atuais usam `/api/v1`, conforme a Issue #81 (RNF-16). A política completa está em [`docs/RNF-17-API-VERSIONING.md`](RNF-17-API-VERSIONING.md). Novos endpoints devem:

1. representar um recurso ou operação de domínio real;
2. declarar método, entrada, saída e status HTTP;
3. manter controllers finos e services independentes;
4. validar entradas antes de atingir infraestrutura;
5. adicionar testes de sucesso, falha e regressão;
6. atualizar esta documentação sem registrar funcionalidades ainda inexistentes.

Novos recursos de autenticação forte, passkeys, TOTP, CSRF e auditoria devem ser adicionados nas issues próprias, sem rebaixar os contratos existentes.
