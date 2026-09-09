# Correção de rolagem — menu e lista fixos

## Objetivo
Manter o menu lateral e a lista de empresas travados/fixos na tela, deixando somente o painel de dados da empresa rolar internamente.

## Alterações
- Shell principal passa a usar `h-screen` e `overflow-hidden`.
- Menu lateral passa a usar `h-screen`, `max-h-screen`, `sticky top-0` e `shrink-0`.
- Conteúdo principal não cria mais rolagem geral da página.
- Área de empresas usa altura total disponível.
- Lista de empresas fica travada no layout, com rolagem interna própria quando necessário.
- Frame da empresa ocupa toda a altura disponível.
- Apenas o conteúdo da empresa rola dentro do frame.

## Arquivos alterados
- `client/src/pages/colaborador/Layout.tsx`
- `client/src/pages/colaborador/Empresas.tsx`

## Migration
Não precisa migration.
