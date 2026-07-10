# Entrega final — Voltar para empresa e relatório organizado

## Correções aplicadas

1. Acervo documental
- O botão de voltar agora retorna para `/colaborador/empresas?empresa={empresaId}&aba=documentos`.
- A página de empresas reabre automaticamente a empresa correta a partir da URL.
- O retorno não cai mais na tela vazia de seleção de empresa.
- O botão recebeu texto visível em desktop: "Voltar para empresa".
- Corrigido mojibake visual em nomes de documentos, sem alterar banco nem storage.

2. Relatório de Empresas / Clientes PJ
- CSV organizado para Excel em pt-BR.
- Separador `;` com linha `sep=;`.
- UTF-8 BOM preservado.
- Cabeçalhos revisados e mais claros.
- CNPJ, telefone, moeda e datas formatados para leitura.
- Fallback client-side também usa `;` e `sep=;`.
- Mantida a rota `/api/empresas/relatorio` antes de `/api/empresas/:id`.

## Zero regressão

- Nenhuma migration criada.
- Nenhuma rota antiga removida.
- Nenhum documento apagado, movido ou regravado.
- Nenhum ID alterado.
- Correções aditivas e compatíveis com dados legados.
