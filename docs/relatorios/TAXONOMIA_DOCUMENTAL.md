# Taxonomia documental empresarial

## Princípios

A taxonomia diferencia o **tipo documental** da **origem física**, do **status de leitura** e do **status de validação**. Um arquivo pode ser lido, mas incompatível; pode estar anexado, mas ainda não lido; ou pode ser uma versão histórica. Esses estados não são colapsados em um único rótulo.

| Família | Exemplos | Módulo |
|---|---|---|
| Identidade inicial | Cartão CNPJ, QSA, enquadramento e situação cadastral | Análise inicial |
| Societária | Atos da Junta, contrato social, alterações, consolidações, atas e procurações | Societários |
| Crédito | SCR/Registrato, CCS, CCF, CENPROT, Serasa, rating e bureau | Consultas de crédito |
| Fiscal/cadastral | CPEND/CND, PGDAS, DEFIS, FGTS, CNDT, eCAC e regime tributário | Consultas fiscais e cadastrais |
| Sócios | CPF, identificação pessoal, comprovante de residência, procuração e representação | Sócios |
| Financeira | Faturamento, receita, movimentação e extratos | Consultas/verificações |
| Assessoria interna | Contrato de assessoria, acompanhamento bancário, simulações e relatórios internos | Ficha da empresa |

## Regras de classificação

Documentos societários permanecem separados de documentos de sócios. Consultas de crédito não são misturadas a certidões fiscais. O contrato de assessoria e materiais de acompanhamento não são tratados como prova da situação jurídica ou fiscal da empresa.

O contrato social e a alteração contratual podem compartilhar a família societária, mas conservam título, subtipo, arquivo, datas, versão e análise próprios. A linha do tempo societária usa a data oficial e o número de arquivamento, e não a data de anexação.

Documentos excluídos logicamente não entram no relatório ativo. A exclusão lógica não remove o arquivo nem o histórico; ela impede que uma versão antiga seja apresentada como documento vigente ou gere uma revisão duplicada.

## Escopo do relatório

O modo institucional omite itens classificados como assessoria. O modo interno autorizado inclui a ficha e seus documentos. A classificação é aplicada no servidor antes da renderização; esconder elementos somente no frontend não é considerado controle de acesso.

## Referências

[1]: ../../server/services/relatorioInicialDocumentalService.ts "Regras de classificação e montagem modular"
[2]: ../../server/services/documentInventory.ts "Inventário de arquivos documentais"
[3]: ../../shared/documentTypes.ts "Catálogo compartilhado de tipos documentais"
[4]: ../../server/services/mapaDocumentalCreditoService.ts "Mapa documental de crédito"
