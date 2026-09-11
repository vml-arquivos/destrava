# Correção visual — frame da empresa em altura total

## Objetivo
Ajustar somente o visual da página de empresas para eliminar espaço em branco inferior e usar toda a área útil da tela.

## Alterações
- A página de empresas passou a ocupar altura total disponível.
- A coluna da lista de empresas agora usa `flex-1 min-h-0`, sem `max-height` artificial.
- O frame de detalhes da empresa agora usa `h-full min-h-0`, sem limitar a visualização a cerca de 600px.
- O conteúdo interno usa scroll apenas dentro do frame quando necessário.
- O quadro societário com apenas um sócio passa a usar largura total, evitando espaço branco lateral.
- Nenhuma rota, regra, migration ou estrutura de dados foi alterada.
