# REQ-46 — Assinatura criptográfica embutida no PDF

## Contrato implementado

`POST /api/v1/documents/sign` exige Bearer token e recebe `multipart/form-data`:

- `file`: PDF de até 20 MiB;
- `page`: página baseada em 1;
- `x` e `y`: coordenadas em pontos PDF para o selo visual.

O backend valida o magic number `%PDF-`, rejeita arquivos vazios, maiores que
20 MiB e PDFs que contenham `/JavaScript`, `/JS` ou `/AA`. O PDF é carregado em
memória, recebe o selo visual e um placeholder de assinatura. A biblioteca
`@signpdf` produz uma assinatura CMS detached com `ByteRange` e `Contents`
embutidos no PDF retornado.

O selo visual exibe o nome do assinante, o instante UTC, o SHA-256 integral do
PDF original (em duas linhas) e o identificador UUID da assinatura.

## Chaves por usuário

Na primeira assinatura do usuário, o backend gera um par RSA de 2048 bits e um
certificado autoassinado específico para aquele usuário. O PKCS#12 que contém o
material privado é cifrado em repouso com AES-256-GCM usando
`PDF_MASTER_KEY_B64`. O banco recebe somente o PKCS#12 cifrado, IV e tag de
autenticação. O material privado não aparece em respostas, logs ou frontend.

Os bytes do PDF não são gravados no PostgreSQL. É persistido apenas o hash do
PDF original, o hash do PDF assinado, o usuário, o identificador da assinatura
e o instante UTC.

## Evidência

`test/documents.e2e-spec.ts` usa PostgreSQL 16 real e comprova a geração de um
PDF com `%PDF-`, `/ByteRange` e `/Contents`, a verificação posterior, a detecção
de adulteração e a rejeição de JavaScript. O frontend usa o mesmo contrato e
baixa somente o Blob retornado pelo servidor.

## Limites

O certificado é autoassinado para o escopo acadêmico e não implementa uma
hierarquia de confiança pública, revogação ou carimbo de tempo externo. Esses
controles não devem ser inferidos como concluídos.
