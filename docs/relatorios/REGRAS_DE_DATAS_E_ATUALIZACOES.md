# Regras de datas e atualizações documentais

## Campos independentes

O relatório não usa uma data genérica para representar eventos diferentes. O item modular pode apresentar os campos abaixo quando fornecidos pela fonte:

| Campo de apresentação | Significado |
|---|---|
| Data do documento | Data indicada no documento ou competência representada. |
| Data de emissão | Data em que o órgão ou emissor produziu o documento. |
| Data de expedição | Data de expedição, quando distinta da emissão. |
| Data de anexação | Momento em que o arquivo foi recebido pelo sistema. |
| Data da última leitura | Momento da análise documental. |
| Data da última verificação | Momento da conferência ou atualização do status. |
| Validade | Data de vencimento ou período de validade informado pela fonte. |
| Versão | Versão do laudo, documento ou snapshot, quando disponível. |

A ausência de um campo aparece como **Não informado**. Nenhuma data é estimada a partir de outra data.

## Histórico

Novas consultas, leituras e arquivos não apagam snapshots anteriores. A geração do relatório persiste a versão do relatório, a data de geração, o resultado e as pendências. Documentos substituídos permanecem rastreáveis, mas versões excluídas logicamente não entram na projeção de documentos ativos.

## Estados

O status de leitura informa se o arquivo foi processado. O status de validação informa o resultado documental. A aplicação mantém distinção entre **Confirmado**, **Aprovado com ressalva**, **Pendente**, **Revisão necessária**, **Divergente** e **Incompatível comprovado**.

A ausência de data não é incompatibilidade. A incompatibilidade exige evidência explícita de que o conteúdo não satisfaz o tipo ou requisito esperado. A revisão permanece quando faltam evidências ou quando existe divergência real.

## Cobertura temporal

O faturamento somente é considerado completo quando a fonte comprova doze competências mensais. A continuidade societária somente é considerada comprovada quando os atos e instrumentos cobrem a janela temporal exigida. A data de anexação nunca substitui a data oficial do documento para essas regras.

## Referências

[1]: ../../server/services/relatorioInicialDocumentalService.ts "Estados, datas e cobertura temporal do relatório"
[2]: ../../shared/documentalPresentation.ts "Apresentação de estados e linhas objetivas"
[3]: ../../db/migrations/056_dossie_documental_credito_blocos_ia.sql "Persistência do dossiê e análises"
