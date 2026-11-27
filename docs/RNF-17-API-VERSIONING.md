# RNF-17 — Política de versionamento da API

## Política

As rotas HTTP públicas são versionadas por prefixo de caminho. A primeira versão
estável é `/api/v1`. Alterações compatíveis permanecem na mesma versão; uma
alteração incompatível cria uma nova versão, como `/api/v2`.

Uma alteração é incompatível quando remove ou renomeia uma rota, muda o método,
altera o significado de um campo obrigatório, modifica o formato de uma resposta
de modo que clientes existentes não consigam processá-la ou muda um status HTTP
já documentado para outro significado.

Adicionar campos opcionais, adicionar endpoints e introduzir códigos de erro
novos sem alterar o significado dos existentes são mudanças compatíveis. Mesmo
assim, contratos e testes devem ser atualizados na mesma alteração.

## Depreciação e migração

Uma versão anterior não é removida silenciosamente. A depreciação deve ser
documentada, comunicar prazo de remoção e manter a versão anterior funcionando
durante o período de migração definido pelo projeto. A nova versão deve ter seus
contratos, testes e instruções de migração publicados antes da remoção.

O versionamento do caminho foi escolhido por ser explícito para o frontend
independente, proxies e ferramentas de observabilidade. Não há negociação de
versão por cabeçalho neste momento.

## Escopo desta entrega

Esta política documenta o critério para o prefixo `/api/v1` implementado na
Issue #81. Ela não cria endpoints de domínio nem promete suporte a `/api/v2`.
