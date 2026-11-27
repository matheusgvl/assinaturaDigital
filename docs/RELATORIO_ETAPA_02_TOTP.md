# Relatório da Etapa 02 — TOTP, recuperação e segurança da conta

Data da validação: 27/11/2026   
Repositório: `matheusgvl/assinaturaDigital`  
Base validada: `origin/main` em `9349978`

## 1. Escopo

Foram implementadas as issues #11 a #16, preservando o fluxo de autenticação, sessões, CSRF, denylist e assinatura de PDF já existentes:

- #11 — TOTP compatível com RFC 6238;
- #12 — segredo TOTP cifrado em repouso;
- #13 — enrollment com QR Code e confirmação;
- #14 — códigos de recuperação de uso único;
- #15 — segundo fator obrigatório antes de JWT e refresh válido;
- #16 — alertas de tentativas de segundo fator inválidas.

Os PDFs continuam sendo processados em memória e não são persistidos pelo backend.

## 2. PRs e commits

Cada requisito funcional foi implementado em branch própria, com commit terminando exatamente no identificador da issue e merge sem squash:

| Issue | Branch | Commit funcional | PR | Merge na main |
| --- | --- | --- | --- | --- |
| #11 | `feat/issue-11-totp-rfc6238` | `f5033bc` | [#127](https://github.com/matheusgvl/assinaturaDigital/pull/127) | `1cac1f7` |
| #12 | `feat/issue-12-totp-secret` | `ef7abc6` | [#128](https://github.com/matheusgvl/assinaturaDigital/pull/128) | `c8e6e8e` |
| #13 | `feat/issue-13-totp-enrollment` | `7f1d48e` | [#129](https://github.com/matheusgvl/assinaturaDigital/pull/129) | `0094a34` |
| #14 | `feat/issue-14-recovery-codes` | `bda09ae` | [#130](https://github.com/matheusgvl/assinaturaDigital/pull/130) | `52a053e` |
| #15 | `feat/issue-15-totp-login` | `b8776ae` | [#131](https://github.com/matheusgvl/assinaturaDigital/pull/131) | `e3f7227` |
| #16 | `feat/issue-16-totp-alerts` | `2861e8c` | [#132](https://github.com/matheusgvl/assinaturaDigital/pull/132) | `9349978` |

O relatório foi separado do código funcional na branch `docs/issue-16-totp-relatorio`.

## 3. Arquitetura e decisões

### TOTP (#11)

`src/modules/auth/totp.ts` implementa HOTP com HMAC-SHA1, truncamento dinâmico e período RFC 6238 de 30 segundos. O segredo possui 20 bytes, equivalentes a 160 bits, é gerado com `randomBytes` e é codificado em Base32 para o `otpauth://` URI.

A verificação aceita a janela `-1, 0, +1` para tolerar pequenas diferenças de relógio. Formato, dígitos, expiração e vetores oficiais do RFC são testados sem depender do relógio real nos testes unitários.

### Proteção do segredo (#12)

`TotpSecret` armazena `encrypted_secret`, `iv` e `auth_tag`. O segredo é cifrado com AES-256-GCM usando a chave mestre já validada pelo contrato `PDF_MASTER_KEY_B64`. A chave possui 32 bytes e a tag autentica a integridade do ciphertext.

O segredo nunca é retornado após a confirmação e não é enviado para logs. A decisão de reutilizar a chave mestre existente evita criar uma nova variável obrigatória e mantém o ambiente de demonstração compatível.

### Enrollment e QR Code (#13)

`TotpEnrollmentService` cria uma configuração pendente de 10 minutos, produz o QR Code PNG com `qrcode`, cifra o segredo antes de persistir e exige um código válido para definir `users.totp_enabled = true`.

O lock pessimista impede duas confirmações concorrentes para o mesmo enrollment. Tentativas inválidas são persistidas antes da resposta 401 e o enrollment expira após cinco falhas.

### Recuperação (#14)

`TotpRecoveryService` gera dez códigos de 80 bits com CSPRNG. A apresentação usa blocos hexadecimais de quatro caracteres; o banco recebe somente SHA-256 normalizado.

O consumo usa transação e `FOR UPDATE`/lock pessimista. Em uma disputa concorrente pelo mesmo código, apenas uma transação consegue marcar `used_at`; a reutilização retorna falha genérica.

### Login com segundo fator (#15)

Após validar a senha, uma conta com TOTP ativo recebe somente `transactionId`. A transação expira em cinco minutos, possui cinco tentativas e guarda apenas hashes do IP e User-Agent.

O endpoint `/auth/totp/login/verify` aceita TOTP ou recuperação. JWT e refresh token são emitidos somente após a transação ser consumida. A migration `AddSecondFactorVerifiedAtToSessions` marca sessões autenticadas com segundo fator e bloqueia refresh tokens emitidos antes da ativação do TOTP, eliminando o bypass por rotação de refresh.

### Alertas (#16)

`TotpAlertService` grava `invalid_totp`, IP truncado, dispositivo truncado, estado de leitura e timestamp. Não há campos para segredo, código TOTP ou token.

Os endpoints listam somente alertas do usuário autenticado e marcam como lidos apenas IDs pertencentes à mesma conta. A resposta é allowlistada para a tela de segurança.

## 4. Migrations aplicadas

No PostgreSQL isolado de testes, `npm run migration:show` confirmou todas as migrations abaixo aplicadas:

1. `1795789272400-CreateTotpSecrets`
2. `1795789272500-CreateTotpRecoveryCodes`
3. `1795789272600-CreateTotpLoginTransactions`
4. `1795789272700-AddSecondFactorVerifiedAtToSessions`
5. `1795789272800-CreateSecurityAlerts`

Nenhuma migration foi executada no banco de demonstração.

## 5. Endpoints

Todos os caminhos são relativos a `/api/v1`.

| Método | Caminho | Proteção | Finalidade |
| --- | --- | --- | --- |
| POST | `/auth/totp/setup` | JWT | Cria enrollment pendente e retorna QR Code |
| POST | `/auth/totp/setup/confirm` | JWT | Confirma código e ativa TOTP; retorna recovery codes uma única vez |
| POST | `/auth/totp/login/verify` | Transação TOTP | Valida TOTP ou recovery code e emite sessão |
| GET | `/auth/alerts` | JWT | Lista alertas da conta |
| POST | `/auth/alerts/read` | JWT | Marca alertas próprios como lidos |

## 6. Evidências automatizadas

Backend final:

- `npx tsc --noEmit`: aprovado;
- `npm run lint`: aprovado;
- `npm run build`: aprovado;
- `npm run test -- --runInBand`: 15 suítes, 90 testes aprovados;
- `npm run test:e2e -- --runInBand`: 13 suítes, 55 testes aprovados;
- `git diff --check`: aprovado;
- `npm audit` encontrou vulnerabilidades moderadas transitivas em `glob`/`minimatch` sob a árvore do TypeORM; não há vulnerabilidade alta reportada pelo check automatizado do PR. A atualização não foi feita nesta etapa para não alterar escopo funcional.

Os testes de integração específicos comprovam:

- RFC 6238, janela de relógio e rejeição de códigos inválidos;
- segredo cifrado e confirmação por QR;
- expiração do enrollment;
- dez códigos de recuperação, hash exclusivo e consumo concorrente;
- ausência de JWT antes do segundo fator;
- TOTP e recovery válidos;
- recovery reutilizado bloqueado;
- transação expirada e limite de cinco tentativas;
- refresh anterior à ativação bloqueado e refresh de sessão verificada funcional;
- alerta `invalid_totp` sem `code` ou `secret` na resposta e marcação como lido.

Frontend final validado no worktree da main/documentação existente:

- `npm ci`: aprovado, 0 vulnerabilidades reportadas;
- `npm run typecheck`: aprovado;
- `npm run lint`: aprovado;
- `npm run build`: aprovado;
- `npm run test -- --run`: 22 arquivos, 100 testes aprovados.

Não foi necessário criar telas duplicadas: `LoginForm`, `TotpChallenge`, `TotpSetup`, `RecoveryCodes`, `SecurityAlerts` e `TwoFactorSection` já consumiam os contratos implementados.

## 7. Homologação pelo navegador

Foi usado Playwright CLI em uma instância separada da demonstração:

- frontend: `http://localhost:5174`;
- backend: `http://localhost:3001/api/v1`;
- PostgreSQL isolado: porta `55432`, banco `assinatura_test`;
- banco de demonstração original em `55433` preservado.

Fluxo executado:

1. Cadastro de uma conta de apresentação;
2. login inicial;
3. abertura de Segurança da conta;
4. geração e exibição do QR Code;
5. confirmação do código TOTP;
6. exibição única dos dez códigos de recuperação;
7. logout e novo login, com redirecionamento para `/login/totp`;
8. tentativa inválida, com mensagem genérica;
9. login com recovery code válido;
10. visualização do alerta “Códigos de verificação inválidos”;
11. upload de `documento-exemplo.pdf`;
12. posicionamento do selo na página 1;
13. assinatura e download binário;
14. verificação pública retornando “Documento íntegro”;
15. alteração de um byte em uma cópia e verificação retornando “Documento adulterado”.

Artefatos locais:

- assinado: `output/totp-browser/documento-exemplo-assinado.pdf`, 18.513 bytes, SHA-256 `EC5845C3132EBE2D85EDA8FBE3C21312B13C7076DBC8AF41E33EF7B593318360`;
- adulterado: `output/totp-browser/documento-exemplo-assinado-adulterado.pdf`, SHA-256 diferente `D136513AF249E0ED49DDF7EE700B513CC50419CE46B3CDAA10FA1F0988D645B2`.

## 8. Skills utilizadas

- `security-best-practices`: revisão de TypeScript/NestJS, cifragem autenticada, não exposição de segredos, locks transacionais, sessões e prevenção de bypass;
- `playwright`: homologação real do frontend, QR/enrollment, login TOTP, recovery, alertas, upload, download, verificação e adulteração.

Não havia uma skill dedicada de NestJS ou TOTP instalada; não foram instaladas skills novas.

## 9. Pendências e limitações reais

- `pdfsig` não está instalado neste ambiente Windows. A validação independente externa do CMS não foi executada; a evidência disponível é a verificação criptográfica do próprio backend e o fluxo público pelo navegador.
- Os certificados da assinatura PDF continuam autoassinados, portanto não há cadeia de confiança pública.
- O audit local identificou vulnerabilidades moderadas transitivas em dependências do TypeORM (`glob`/`minimatch`). Elas não bloquearam os checks de severidade alta, mas devem ser tratadas em uma atualização de dependências separada.
- A desativação protegida de TOTP e outros blocos de segurança fora de #11–#16 permanecem conforme o estado anterior; não foram reimplementados nesta etapa.
- A auditoria persistente geral ainda é um próximo bloco; os alertas TOTP já possuem armazenamento próprio e não incluem segredos.
- WebAuthn não foi iniciado automaticamente.

As issues #11–#16 aparecem como `CLOSED` no GitHub após os merges. Não executei `gh issue close` manualmente; o fechamento ocorreu no fluxo do GitHub associado aos PRs. A aprovação acadêmica e a revisão do professor continuam sendo a validação externa final.
