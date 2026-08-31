# Arquitetura Documental — Estado Final desta Sessão (30/08/2026)

Visão consolidada de como as peças construídas nas três rodadas desta sessão se encaixam. Cada peça é aditiva e testada isoladamente; este documento explica como elas se relacionam.

## 1. Identidade documental: separar "o que foi pedido" de "o que o arquivo realmente é"

O princípio central de todas as correções desta sessão: o nome do campo em que um arquivo foi anexado (o slot) é a INTENÇÃO de quem fez o upload, nunca uma prova do conteúdo real do arquivo. Duas peças implementam isso:

- **`detectarTipoComprovanteRegime`** (`server/services/extracaoDocumentalLocal.ts`): classificador puro que lê o texto e devolve o tipo real (`ecf` | `dctf_mit` | `darf` | `livro_caixa` | `null`), verificando os marcadores de cada tipo na mesma ordem sempre, nunca perguntando "isso poderia ser o tipo esperado?". `parseComprovanteRegime(tipoEsperado, texto)` compara o resultado com o tipo esperado (`documento_compativel = tipo_detectado === tipo_esperado`) -- uma igualdade estrita, sem nenhum "ou" que deixe um regime confirmado por qualquer via substituir a ausência do marcador do tipo certo.
- **`promptDocumentoCatalogado`** (`server/services/analiseDocumentalEspecializada.ts`): mesmo princípio aplicado à instrução dada à IA -- identificar o tipo pelo conteúdo primeiro, comparar com o esperado depois, nunca presumir a partir do nome do campo.

Um documento do tipo errado nunca é descartado: ele fica com `documento_compativel: false` (não satisfaz o slot em que foi anexado) mas pode continuar sendo `pode_evidenciar_regime: true` (evidência útil para a linha do tempo do regime tributário, seção 2 abaixo) -- nenhuma informação é jogada fora, só deixa de ser usada para o propósito errado.

## 2. Regime tributário: valor atual + histórico versionado (Rodada 2)

Duas fontes convivem, sem conflito:
- `empresas.regime_tributario` (campo já existente): o "regime vigente" que o resto do sistema já lê hoje. Não foi alterado.
- `empresas_regime_tributario_historico` (migration 100) + `regimeTributarioTemporalService.ts`: histórico completo por período, com a regra central de que um documento com competência no passado nunca reabre nem substitui o período vigente atual -- só preenche uma lacuna do histórico. Endpoint de leitura: `GET /api/documentacao/empresa/:empresaId/regime-tributario/linha-do-tempo`.

O código DARF 8998 (Rodada 3) é o exemplo do princípio "nunca inferir sem confirmação": em vez de continuar mapeado para "Lucro Real" por conveniência, agora devolve `regime: null` e um sinal explícito (`codigoReceitaNaoConfirmado`) que vira um alerta de auditoria (`regime_tributario_codigo_nao_mapeado`, com os marcadores `CODIGO_NAO_MAPEADO`/`REVISAO_HUMANA`).

## 3. Faturamento: metadado do documento + valor estruturado por competência (Rodada 3)

- `extracaoDocumentalLocal.ts` (`parseFaturamento12Meses`): continua exatamente como antes, lendo metadados do documento anexado no slot `faturamento_12_meses` (assinaturas, meses de referência citados no texto etc.). Não foi alterado.
- `empresas_faturamento_mensal` (migration 101) + `faturamentoRolling12MesesService.ts`: um valor numérico por competência (ano/mês), independente de documento ou slot específico -- pode vir de qualquer fonte (PGDAS, extrato bancário, declaração de faturamento). A janela de 12 meses é sempre calculada a partir do último mês fechado e soma competências de regimes tributários diferentes sem exigir um tipo de documento uniforme (o cenário central pedido pela missão: 3 meses em Presumido seguidos de 9 em Real dentro da mesma janela). Endpoint: `GET /api/documentacao/empresa/:empresaId/faturamento/rolling-12-meses`.

Estas duas peças ainda não estão conectadas entre si nem a nenhum fluxo de gravação automática -- ver `PENDENCIAS_REAIS.md`.

## 4. Cobertura de evidência entre bureaus (Rodada 3)

- Upload por slot (`scr_cnpj`, `ccs_cnpj`, `ccf_cnpj`, `cenprot_cnpj`, `cadin_cnpj`, `pgfn_cnpj`, `cnd_rfb_cnpj`, `cndt`, `situacao_fiscal_cnpj`, `consulta_serasa_cnpj`, e os equivalentes `_cpf`): continua exatamente como antes (`server/routes/documentos.ts`, `TIPOS_DOCUMENTO`). Não foi alterado.
- `document_evidence_coverage` (migration 102) + `coberturaEvidenciaBureauService.ts`: uma camada aditiva que registra, por documento, quais requisitos ele efetivamente evidencia -- um único relatório de bureau consolidado (comum na prática) pode cobrir SCR + CCF + CENPROT ao mesmo tempo, sem exigir três uploads idênticos. Um status granular (`SATISFEITO` / `CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO` / `CERTIDAO_POSITIVA` / `NAO_APLICAVEL` / `PENDENTE`) evita tratar CND, CPEND e Certidão Positiva pura como equivalentes -- só os dois primeiros contam como requisito resolvido (`statusResolveRequisito`). Endpoint: `GET /api/documentacao/empresa/:empresaId/cobertura-bureau`.

## 5. EFD-Contribuições: limitação explícita em vez de silenciosa (Rodada 3)

`normalizarDocumentoCatalogado` (`analiseDocumentalEspecializada.ts`) marca qualquer documento `efd_contribuicoes` (ou seu alias legado `efd`) com `status_analise: 'ANALISE_ESPECIALIZADA_PENDENTE'` e um alerta dedicado. O documento continua sendo aceito e arquivado normalmente como evidência do dossiê -- a única mudança é que a ausência de uma leitura especializada de M400/M800 deixa de ser invisível.

## 6a. Situação de mérito da certidão (CND/CPEND/PGFN/CADIN) -- Rodada 4

Complementa o princípio da seção 1: identidade correta (`documento_compativel: true`) nunca provou que o RESULTADO da certidão é favorável -- um relatório de CADIN de verdade pode dizer que o CNPJ está incluído (pendência ativa), não "nada consta". Para a categoria `analise: 'cnd_cpend'` (CND/CPEND Federal, PGFN, CADIN -- CNPJ e CPF), `promptDocumentoCatalogado` agora exige o campo `situacao_certidao` (`negativa` | `positiva_com_efeito_negativo` | `positiva` | `null`) com a consequência de cada valor deixada inequívoca para o modelo, e `normalizarDocumentoCatalogado` converte um resultado desfavorável ou não confirmado num alerta garantido (`certidao_situacao_positiva`, crítico, ou `certidao_situacao_nao_identificada`, revisão humana) -- nunca em silêncio. Diferente da seção 1 (classificador determinístico local por regex), esta checagem depende da leitura da IA; ver `PENDENCIAS_REAIS.md`, item 3, para a limitação assumida.

## 6. Consistência entre fontes de verdade

`tests/catalogoDarfConsistencia.test.ts` prova automaticamente que o catálogo de código de receita do DARF (`CATALOGO_CODIGO_RECEITA_DARF_IRPJ`, em código) e o texto do prompt enviado à IA (`promptSimples`) nunca divergem -- a mesma classe de bug corrigida duas vezes nesta sessão (5993 na Rodada 1, 8998 na Rodada 3) tinha exatamente essa divergência como causa raiz.

## O que fica de fora deste diagrama

O vocabulário completo de status documentais (`PENDENTE`, `VALIDADO`, `VALIDADO_COM_ALERTA`, `VALIDADO_HISTORICO`, `INCOMPATIVEL_COM_CAMPO`, `NAO_APLICAVEL`, `NAO_APLICAVEL_AO_REGIME`, `FORA_DA_JANELA_ATUAL`, `AINDA_NAO_EXIGIVEL`, `SATISFEITO_POR_DOCUMENTO_EQUIVALENTE`, `REVISAO_HUMANA`, `REPROVADO_DOCUMENTALMENTE`) como um enum central usado por toda a aplicação, a conexão automática das três capacidades novas da Rodada 3 aos fluxos de análise já existentes, e o motor de objeção/e-mail de defesa técnica -- ver `PENDENCIAS_REAIS.md` para o detalhamento e a justificativa de cada item.
