# REQ-01 — Política de senhas

Senhas aceitas pelo domínio precisam ter pelo menos 12 caracteres e conter
maiúscula, minúscula, número e símbolo. A validação retorna uma mensagem única
e não informa qual regra falhou, reduzindo enumeração de requisitos e evitando
ecoar a senha recebida.

O contrato está em `src/modules/auth/password-policy.ts` e é independente do
transporte HTTP. A persistência e o fluxo de login serão adicionados quando o
modelo de usuários estiver definido; esta etapa não cria endpoint fictício nem
armazena senha em texto.
