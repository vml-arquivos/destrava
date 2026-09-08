# Exportações PDF

## Modos disponíveis

| Modo | Conteúdo | Permissão |
|---|---|---|
| Institucional | Identificação, análise inicial, societário, consultas, sócios e resumo. O conteúdo de assessoria é omitido. | Acesso à empresa. |
| Interno | Conteúdo institucional mais ficha da empresa, relacionamento e documentos internos da assessoria. | Acesso à empresa e permissão de gestão. |

A rota recebe o modo explicitamente e revalida a autorização no servidor. O nome do arquivo também identifica o modo exportado.

## Estrutura do PDF

O PDF contém cabeçalho com a empresa e situação documental, índice com links internos, sete módulos na ordem do sistema, submódulos de crédito e fiscal/cadastral, tabelas de sócios, linha do tempo societária, pendências acionáveis e rodapé com paginação `Página X de Y`.

Cada item documental apresenta o título funcional, tipo, etapa, arquivo original, status de leitura, status de validação, datas independentes, validade, resumo objetivo, dados extraídos, inconsistências, pendências, confiança, revisão humana e versão quando disponíveis.

## Integridade

O PDF é uma apresentação do estado documental. A análise não substitui o arquivo original. Campos ausentes aparecem como **Não informado**. Documentos internos não são incluídos no modo institucional.

## Relatório de pendências e alterações

O DTO já preserva pendências detalhadas, histórico societário, snapshots e datas de atualização. Relatórios especializados de pendências ou alterações podem reutilizar esse DTO sem duplicar a fonte documental nem descartar histórico.

## Referências

[1]: ../../server/routes/documentacao.ts "Endpoint de exportação documental em PDF"
[2]: ../../server/services/relatorioModularHtml.ts "Template HTML modular e paginação"
[3]: ../../server/services/relatorioInicialDocumentalService.ts "DTO modular do relatório"
