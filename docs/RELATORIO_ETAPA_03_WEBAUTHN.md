# Etapa 03 · WebAuthn e passkeys

Validação realizada em 27/11/2026 com a API e o frontend de homologação em `localhost` e instâncias de PostgreSQL descartáveis.

| Requisito | Implementação | Evidência |
| --- | --- | --- |
| REQ-06 | PR #138, `83ff529` | Registro e autenticação no Chromium, verificação de assinatura, cancelamento, desafio expirado e consumo único |
| REQ-07 | PR #136, `c08c244` | Migration de credenciais e leitura de metadados públicos persistidos |
| REQ-08 | PR #137, `7a65176` | Onze cenários unitários e concorrência de duas atualizações sobre a mesma versão no PostgreSQL |
| REQ-09 | PR #135, `969a792` | Onze cenários de configuração e autenticação a partir de `localhost` |
| REQ-10 | PR #139, `497176c` | Listagem, isolamento, confirmação de senha, renomeação e recusa de login após revogação |

## Contrato e armazenamento

- `POST /api/v1/auth/passkeys/registration/options` recebe a senha atual e exige Bearer válido. A verificação de registro tem o mesmo vínculo de titular e sessão.
- `POST /api/v1/auth/passkeys/authentication/options` cria um desafio para uma credencial descobrível. A verificação exige presença e verificação do usuário, assinatura válida, origem permitida e RP ID esperado.
- `GET /api/v1/auth/passkeys` lista o titular. `PUT` e `DELETE /api/v1/auth/passkeys/:id` também pedem a senha atual. A revogação invalida desafios TOTP de login pendentes do titular.
- A migration `1795789272900` guarda a chave pública, o identificador de credencial, o contador e o AAGUID. A migration `1795789273000` guarda desafios por dois minutos. A verificação retira cada desafio com um único `DELETE … RETURNING`, inclusive quando a resposta do autenticador falha.
- O servidor aceita zero/zero e exige incremento estrito nos demais casos. A atualização compara o contador que foi usado na verificação e exige que a passkey ainda esteja ativa.
- Contas com TOTP ativo recebem apenas a transação de segundo fator após a passkey. O JWT, o cookie HttpOnly e o cookie CSRF são emitidos no fluxo existente após a validação do TOTP.

## Homologação

No backend, 112 testes unitários e 59 E2E passaram. O PR #140 corrigiu o isolamento do teste de configuração inválida para que o Jest termine com saída zero. No frontend, typecheck, lint, build e 100 testes passaram.

O Chromium com autenticador virtual exercitou cadastro, registro de passkey, renomeação, cancelamento, assinatura de autenticador inválida, login, TOTP e recusa de credencial revogada. O fluxo assinou e baixou um PDF após login WebAuthn. A verificação pública retornou `valid`. O OpenSSL 3.1.2 validou o CMS com `-noverify`, opção que desativa a validação da cadeia de certificados.

O cenário de origem incorreta foi coberto pela API e as combinações de RP ID e origem incompatíveis pela validação de configuração. A concorrência de contador foi exercitada no PostgreSQL e o consumo único foi testado na rota. O teste de autenticação no navegador usou um autenticador virtual Chromium, com verificação de usuário habilitada.

O roteiro em `test/browser/webauthn-flow.js` usa um Chromium gerenciado pelo Playwright CLI. Execute a partir da raiz do backend com um banco de homologação e ambas as aplicações ativas. Para uma interface em `http://localhost:5175`, defina `WEBAUTHN_RP_ID=localhost`, `WEBAUTHN_ORIGINS=http://localhost:5175` e configure o proxy do Vite para a API de homologação.

```powershell
npm install --prefix output/playwright --no-save --no-package-lock jsqr@1.4.0
npx --yes --package @playwright/cli playwright-cli -s=webauthn open http://localhost:5175 --headed
npx --yes --package @playwright/cli playwright-cli -s=webauthn --json run-code --filename test/browser/webauthn-flow.js
```

O decodificador de QR fica no diretório de evidências e é usado exclusivamente pelo roteiro para simular um aplicativo autenticador. O roteiro gera credenciais descartáveis e imprime somente o resultado de cada passo.

## Entrega dos repositórios

Os cinco PRs funcionais do backend foram incorporados com merge commits. O frontend está homologado nas branches dos PRs [#32](https://github.com/matheusgvl/assinaturaDigitalFront/pull/32) e [#33](https://github.com/matheusgvl/assinaturaDigitalFront/pull/33). A integração GitHub–Vercel gerou previews automaticamente. O merge na `main` do frontend permanece pendente porque essa branch aciona publicação no Vercel e a missão restringe deploys.
