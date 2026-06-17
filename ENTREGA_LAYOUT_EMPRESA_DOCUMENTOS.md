# Entrega enxuta — layout empresa e acervo documental

## Escopo aplicado
- Reorganização visual da página de detalhes da empresa.
- Redução do espaço em branco no topo e melhor aproveitamento da área útil.
- Melhoria de legibilidade com cartões-resumo no cabeçalho da empresa.
- Reorganização do acervo documental com checklist mais claro e navegação por seções.
- Exibição rápida dos arquivos já anexados dentro de cada bloco de upload.

## Arquivos alterados
- `client/src/pages/colaborador/Empresas.tsx`
- `client/src/components/documentos/DocumentosEntidade.tsx`

## Resultado prático
### Página da empresa
- Cabeçalho superior mais compacto.
- Card de detalhes com melhor ocupação vertical.
- Abas com melhor fixação visual.
- Dados principais mais legíveis: CNPJ, localização e contato principal.

### Acervo documental
- Painel-resumo do acervo com indicadores rápidos.
- Checklist documental mais organizado por seção.
- Navegação rápida entre seções do acervo.
- Cards de upload maiores e mais legíveis.
- Cada card mostra os arquivos já vinculados naquele campo.

## Validação
- Build de produção executado com sucesso via `npm run build`.
