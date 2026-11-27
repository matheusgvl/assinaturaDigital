# REQ-50 — Verificação criptográfica do PDF

## Contrato implementado

`POST /api/v1/documents/verify` é público e recebe um PDF em memória. O
backend:

1. extrai o `ByteRange` e o CMS da entrada;
2. recompõe os bytes assinados;
3. compara o `messageDigest` CMS com SHA-256 dos bytes recompostos;
4. verifica a assinatura RSA dos atributos autenticados usando o certificado
   embutido;
5. confirma que o hash integral corresponde a um registro de assinatura deste
   sistema.

O resultado é um dos estados:

- `valid`: assinatura criptograficamente válida e registrada;
- `tampered`: existe estrutura de assinatura, mas o conteúdo ou a assinatura
  não passa na verificação;
- `not_found`: não há assinatura reconhecida pelo sistema.

Nenhum PDF enviado para verificação é persistido. O endpoint não exige conta e
não retorna chave privada, senha, stack trace ou detalhes de banco.

Para reduzir abuso do endpoint público, cada IP pode realizar até 30
verificações em uma janela de 15 minutos. O contador usa a tabela existente de
limites com hash SHA-256 da chave e nunca devolve o endereço IP na resposta.

## Testes

O E2E de documentos cobre `valid`, `tampered`, `not_found` implicitamente para
PDFs sem registro, resposta sem dados sensíveis e rejeição de PDF com JavaScript.
O fluxo de navegador também foi exercitado com upload, assinatura, download do
PDF retornado e novo upload na tela pública de verificação.

## Limites

A identificação de confiança é limitada ao registro local e ao certificado
embutido. Validação externa de CA, OCSP/CRL, PAdES-LTV e carimbo de tempo
qualificado permanecem fora deste escopo.
