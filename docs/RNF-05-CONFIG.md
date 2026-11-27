# Configuração segura — RNF-05

## Configuração implementada

O backend usa `@nestjs/config` no módulo principal. A biblioteca lê variáveis do ambiente do processo e o arquivo local `.env` quando presente. O código acessa a configuração somente pela camada `src/config/app.config.ts`.

| Variável | Uso | Fallback local |
|---|---|---|
| `PORT` | Porta HTTP da API; obrigatória entre `1` e `65535` | sem fallback |

Exemplo de execução local sem gravar valores no código:

```powershell
$env:PORT = '3001'
npm run start
```

Ou, em um arquivo `.env` local não versionado:

```text
PORT=3001
```

O `.gitignore` já exclui `.env` e `.env.*`, preservando a exceção existente para `.env.example`. Nenhum arquivo `.env` real é fornecido ou versionado nesta issue.

## Segurança e escopo

- Não há credenciais, tokens, chaves ou URLs sensíveis hardcoded.
- `PORT` é a única configuração atualmente necessária.
- A configuração não é registrada em logs nem enviada em respostas HTTP.
- O health check continua retornando somente seu contrato público.
- Valores ausentes ou inválidos de `PORT` fazem a aplicação recusar a inicialização; a validação obrigatória foi implementada na Issue #73.

## Pendências relacionadas

- RNF-06 / Issue #71: arquivo `.env.example` documentado e versionável nesta branch.
- Issue #72: proteção formal do `.env` no repositório e histórico.
- Issue #73: validação obrigatória das variáveis na inicialização, implementada nesta branch de RNF-08.
- Issue #69: PostgreSQL e configurações de banco.

O RNF-06 foi implementado com o arquivo `.env.example`. A auditoria formal de arquivos `.env` e do histórico pertence à Issue #72; a validação obrigatória na inicialização está documentada em `docs/RNF-08-VALIDATION.md`.

Sempre que uma nova funcionalidade introduzir uma variável de ambiente, sua branch deve atualizar `.env.example` e esta documentação, sem inserir valores reais.
