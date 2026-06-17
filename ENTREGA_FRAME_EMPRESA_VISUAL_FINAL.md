# Correção visual final — página de empresas

## Objetivo
Aumentar a área útil da página de visualização da empresa e melhorar a leitura dos dados sem mexer em rotas, banco, migrations ou regras de negócio.

## Alterações aplicadas
- Removido o cabeçalho largo superior interno da página de empresas.
- O título, contador de empresas e botão Nova Empresa foram levados para a coluna lateral esquerda.
- O card de detalhes da empresa agora começa mais acima, praticamente na primeira dobra da tela.
- O frame da empresa foi ampliado para `calc(100vh - 88px)`.
- O conteúdo interno da empresa passou a usar altura flexível real, com rolagem interna aproveitando o máximo da tela.
- Score, abas e espaçamentos foram compactados.
- A primeira aba permanece como Dados da Empresa, com quadro societário na própria página.
- Nenhuma migration necessária.

## Arquivo alterado
- `client/src/pages/colaborador/Empresas.tsx`

## Validação
- Build de produção executado com sucesso via `npm run build`.
