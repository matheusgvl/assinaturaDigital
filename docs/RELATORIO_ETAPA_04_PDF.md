# Relatório da Etapa 04 — assinatura e processamento de PDF

**Data:** 27/11/2026, horário de Brasília.

## Escopo e evidências

| Issue | Estado técnico | Evidência |
| --- | --- | --- |
| #45 | Integrada | PR #141, geração de RSA 2048 no cadastro e PKCS#12 cifrado por AES-GCM. |
| #48 | Integrada | PR #142, hash, IP de origem e metadados sem bytes do PDF. |
| #49 | Integrada | PR #143, página, coordenadas e rotação validadas. |
| #59 | Integrada | PR #145 na `main`, consultas usuais não selecionam a chave cifrada e buffers transitórios são limpos. |
| #62 | Aguardando revisão de integração | PR #150 contém o worker Docker restrito. O PR #146 foi mesclado externamente na branch encadeada e não levou o código à `main`. |
| #63 | Aguardando #62 | Commit `6cfee61` e PR #147 foram validados, mas #147 foi mesclado na branch de #62 depois que a base já havia sido integrada. Será republicado contra `main` após #150. |

## Isolamento de PDF

O worker recebe um único trabalho binário limitado, processa-o em um contêiner Linux sem rede e encerra após cada operação. A configuração efetiva remove capabilities, ativa `no-new-privileges`, usa UID 10001, raiz somente leitura, `/tmp` mínimo, 384 MiB de memória, uma CPU, 32 processos e timeout. Não há mount de socket Docker, arquivos do host, credenciais de banco ou chaves JWT.

O E2E `test/pdf-sandbox.e2e-spec.ts` executou uma sonda dentro da imagem e comprovou identidade, ausência de rede externa, flags do processo, limites cgroup e ausência de segredos no ambiente do worker.

## Validação estrutural

`pdf-structure.ts` usa o parser do PDF para percorrer objetos indiretos, dicionários, arrays e streams já decodificados. Recusa JavaScript, OpenAction, Additional Actions e subtipos ativos, inclusive quando os nomes estão codificados ou o objeto está em stream comprimido. O conteúdo nunca é executado. PDFs malformados, referências inexistentes e arquivos acima do limite também são recusados.

## Resultados executados

- `npx tsc --noEmit`, lint, build e `git diff --check` concluídos.
- Imagem `assinatura-pdf-worker:local` reconstruída.
- `test/documents.e2e-spec.ts` e `test/pdf-sandbox.e2e-spec.ts` com 2 suítes e 10 testes aprovados no PostgreSQL isolado.
- A verificação CMS independente anterior com OpenSSL confirma integridade criptográfica do artefato de navegador. Isso não atribui confiança pública ao certificado autoassinado e não equivale a ICP-Brasil.

## Limitações

O sandbox reduz a superfície de ataque, mas Docker Desktop não substitui um serviço de sandbox gerenciado em produção. A confiança do certificado depende de uma cadeia externa, ausente no projeto acadêmico.
