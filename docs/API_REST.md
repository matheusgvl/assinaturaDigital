# Contratos da API REST

## Escopo atual

O backend usa NestJS como API HTTP independente do frontend. O único recurso disponível nesta etapa é o health check:

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

## Convenções REST

- `GET` consulta recursos.
- `POST` cria recursos ou dispara operações explícitas.
- `PUT` substitui um recurso integralmente.
- `PATCH` atualiza um recurso parcialmente.
- `DELETE` remove ou revoga um recurso.
- Rotas usam substantivos claros e parâmetros de rota para identificar recursos.
- Query parameters ficam reservados para filtros e paginação.
- JSON é o formato padrão; `multipart/form-data` será usado apenas quando o upload de PDF for implementado.

Não são criadas rotas artificiais apenas para demonstrar métodos HTTP. Atualmente, `POST /api/v1/health` não é suportado e o NestJS responde `404`.

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

## Versionamento e evolução

O endpoint atual é `/api/v1/health`, conforme a Issue #81 (RNF-16). A política completa está em [`docs/RNF-17-API-VERSIONING.md`](RNF-17-API-VERSIONING.md). Novos endpoints devem:

1. representar um recurso ou operação de domínio real;
2. declarar método, entrada, saída e status HTTP;
3. manter controllers finos e services independentes;
4. validar entradas antes de atingir infraestrutura;
5. adicionar testes de sucesso, falha e regressão;
6. atualizar esta documentação sem registrar funcionalidades ainda inexistentes.

Autenticação, usuários, passkeys, TOTP, persistência, PDFs, CORS, headers adicionais e tratamento global de erros serão definidos nas issues próprias.
