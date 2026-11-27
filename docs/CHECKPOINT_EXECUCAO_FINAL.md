# Checkpoint da execução final

**Data:** 27/11/2026, horário de Brasília.

## Situação recuperada

- `origin/main` do backend analisada em `f4bbb80`; os PRs de WebAuthn #135 a #139 e os PRs de chaves e metadados #141 a #143 estão mesclados. O relatório da Etapa 03 foi mesclado no PR #144.
- O frontend mantém os PRs #32 e #33 abertos para evitar merge que possa disparar o deploy automático configurado no repositório. Nenhuma alteração foi feita na `main` do frontend.
- Os worktrees preservados contêm trabalho não commitado e independente: `final-baseline-api` para #63 e `final-audit-api` para #55. Eles não devem ser descartados, rebaseados ou misturados.
- A imagem local `assinatura-pdf-worker:local` já foi construída. Os contêineres PostgreSQL de demonstração e de testes estão ativos e separados. As portas de demonstração `3000` e `5173`, o ambiente TOTP `3001` e `5174`, e o ambiente WebAuthn isolado `3002` e `5175` estavam em escuta no momento da recuperação.
- A matriz de rastreabilidade foi recuperada em `docs/MATRIZ_RASTREABILIDADE_95.md`. Ela separa o estado no GitHub da evidência técnica e registra requisitos parciais ou sem teste decisivo.

## Última ação concluída

O PR #145 de #59 foi mesclado externamente na `main`. Os PRs encadeados #146 e #147 também foram mesclados externamente, porém em suas branches-base já encadeadas depois da integração de #145. Por isso não alcançaram `main`. Os commits originais foram preservados e #62 foi republicada como [#150](https://github.com/matheusgvl/assinaturaDigital/pull/150), diretamente contra `main`. #63 permanece pendente da integração correta de #62.

No commit `6cfee61`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check`, o build da imagem e os E2E de documentos e sandbox foram concluídos. O E2E passou com 2 suítes e 10 testes no banco PostgreSQL isolado. A imagem foi identificada como `assinatura-pdf-worker:local`.

Os PRs [#148](https://github.com/matheusgvl/assinaturaDigital/pull/148) e [#149](https://github.com/matheusgvl/assinaturaDigital/pull/149) publicam, respectivamente, os campos #56 e a trilha append-only #55. A trilha foi testada com um papel PostgreSQL restrito e também com o proprietário da migration. O PR [#151](https://github.com/matheusgvl/assinaturaDigital/pull/151) publica #58. Seu E2E confirmou IP novo, ativação e desativação de TOTP, troca de senha, leitura e remoção do segredo no banco isolado.

O frontend recebeu o PR [#34](https://github.com/matheusgvl/assinaturaDigitalFront/pull/34), que envia senha atual e TOTP ao endpoint real de desativação e encerra a sessão após a revogação. O backend recebeu o PR [#152](https://github.com/matheusgvl/assinaturaDigital/pull/152), com TypeORM 0.3.31 e overrides compatíveis. `npm audit --json` passou a reportar zero vulnerabilidades nesse branch.

Em `assinatura_final_migrations`, descartável e distinto da demonstração, as 17 migrations da integração local foram aplicadas do zero, a última foi revertida e reaplicada, depois todas foram revertidas e aplicadas novamente. O rollback completo deixou zero tabelas de domínio, a reaplicação voltou a registrar 17 migrations, `document_signatures` não contém coluna de PDF ou `bytea`, e a FK de `known_login_ips` rejeitou referência a usuário inexistente.

## Trabalho pendente imediato

1. Acompanhar revisão dos PRs #148 a #152 e #34, sem mesclá-los diretamente. Todos os checks consultados estão aprovados, mas não há decisão de revisão registrada.
2. Após a integração de #150, abrir a integração de #63 diretamente contra `main` sem reescrever o histórico.
3. Completar a matriz de 95 requisitos, a revisão de segurança e os relatórios a partir das evidências recuperadas.
4. Repetir a homologação consolidada somente após as integrações aprovadas.

## Restrições preservadas

- Não houve alteração direta de `main`, force push, reset destrutivo, squash, deploy manual, alteração de visibilidade ou permissões.
- O banco de demonstração, suas chaves e seus arquivos de ambiente não são alvo de testes destrutivos.
- Segredos, tokens, chaves privadas e conteúdo de PDFs não são registrados neste arquivo.

## Comandos de retomada

```powershell
Set-Location G:\Trabalhos\assinaturadigital-worktrees\final-baseline-api
$env:DATABASE_URL = 'postgresql://assinatura_test:assinatura_test@127.0.0.1:55432/assinatura_final_test'
npm run test:e2e -- --runTestsByPath test/documents.e2e-spec.ts test/pdf-sandbox.e2e-spec.ts
```

Após a execução, atualizar este checkpoint com o resultado real e a próxima ação.
