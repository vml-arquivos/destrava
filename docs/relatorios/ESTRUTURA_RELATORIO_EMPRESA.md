# Estrutura do relatório documental empresarial

## Objetivo

O relatório apresenta uma visão institucional, rastreável e modular da documentação empresarial. A empresa utilizada na regressão foi apenas uma fonte de dados de validação. Nenhuma regra depende de nome, CNPJ ou quantidade fixa de arquivos de uma empresa específica.

## Ordem obrigatória

| Ordem | Módulo | Escopo | Conteúdo principal |
|---:|---|---|---|
| 1 | Identificação da empresa | Institucional | Dados cadastrais, contatos, atividade, datas de cadastro e completude. |
| 2 | Análise dos quatro documentos da primeira etapa | Institucional | Leitura, validação, origem, arquivo, datas, evidências e pendências de cada documento inicial. |
| 3 | Documentos societários e atos oficiais | Institucional | Junta Comercial, contrato social, alterações, atos, registros, vigência e histórico. |
| 4 | Consultas e verificações | Institucional | Consultas de crédito e consultas fiscais/cadastrais em submódulos distintos. |
| 5 | Dados e documentos dos sócios | Institucional, conforme permissão | Sócios, administradores, documentos vinculados e validações sem misturar o acervo da empresa. |
| 6 | Ficha da empresa e relacionamento | Interno | Assessoria, relacionamento, contratos internos, acompanhamento e materiais de trabalho. |
| 7 | Resumo de atualizações, pendências e validade documental | Institucional | Pendências acionáveis, confirmações, atualizações, validade e próxima ação. |

A ordem é aplicada ao DTO `modulos_relatorio`, ao modal do acervo e ao PDF exportado. O PDF inclui índice, cabeçalho, paginação e rodapé.

## Separação de escopo

O acervo institucional contém documentos que comprovam ou atualizam a situação da empresa, sua constituição, regularidade, sócios e consultas oficiais ou de crédito. Documentos de assessoria são classificados no módulo interno `ficha_empresa`. No modo institucional, esse módulo permanece identificado, mas seu conteúdo é omitido. No modo interno, ele é incluído somente depois da autorização server-side.

A separação é lógica e não destrutiva. O arquivo original, seu identificador, datas e histórico permanecem preservados. O relatório apenas altera a projeção modular e o escopo de apresentação.

## Datas e rastreabilidade

Cada item documental possui campos independentes para data do documento, emissão, expedição, anexação, leitura, verificação e validade. Quando a fonte não fornece uma data, o relatório exibe **Não informado**. A análise estruturada nunca substitui o arquivo original.

## Versões

Snapshots continuam sendo persistidos na tabela existente de análises documentais. A versão do relatório é `1.4.0`; novas gerações não sobrescrevem snapshots anteriores.

## Referências

[1]: ../../server/services/relatorioInicialDocumentalService.ts "Agregador do relatório documental"
[2]: ../../server/services/relatorioModularHtml.ts "Renderizador HTML e PDF modular"
[3]: ../../client/src/components/documentos/DocumentosEntidade.tsx "Interface do acervo documental"
[4]: ../../server/routes/documentacao.ts "Rotas de dossiê, relatório e exportação"
