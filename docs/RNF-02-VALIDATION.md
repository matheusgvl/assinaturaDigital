# Evidências de validação — RNF-02

Executado em 26/11/2026, na branch `feat/issue-68-api-rest`, após a integração do PR #83 na `main`.

| Verificação | Resultado observado |
|---|---|
| `npm ci --no-audit --no-fund` | Concluído; instalação reproduzível a partir do lockfile |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npx tsc --noEmit` | PASS |
| Testes unitários | PASS — 2 suítes, 5 testes |
| Testes HTTP E2E | PASS — 1 suíte, 4 testes |
| `GET /api/v1/health` | HTTP 200, JSON `{"status":"ok","service":"assinatura-digital-api"}` |
| `GET /rota-inexistente` | HTTP 404, JSON nativo do NestJS |
| `POST /api/v1/health` | HTTP 404, operação não suportada |
| `X-Powered-By` | Ausente na resposta |

Os testes foram executados sem iniciar o frontend e sem conexão com banco de dados. O processo usado para a validação HTTP foi encerrado ao final.
