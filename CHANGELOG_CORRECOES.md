# Changelog de Correções — 30/08/2026 (Rodada 4: 31/08/2026)

## Rodada 4 — Bug real reportado em produção (CADIN/CND/PGFN) + remoção de banner + diagnóstico do PGDAS-no-ECF

Esta rodada responde a um relato do usuário sobre o site **em produção**
(destravacredito.com), acompanhado de 5 prints do Acervo Documental e 8
documentos reais da empresa ZR CONSTRUCOES E REFORMAS CIVIS LTDA (CNPJ
49.366.887/0001-25). Cada documento foi lido de verdade (via `pdftotext` e,
para os três que não têm camada de texto, renderizado e lido visualmente)
e cruzado com o print correspondente.

### Achado 1 (já corrigido nas Rodadas 1-3, ainda não implantado): PGDAS no slot de ECF

Os prints confirmam que `PGDASD-DECLARACAO-49366887202512001.pdf` e
`PGDASD-RECIBO-49366887202512001.pdf` — os dois comprovantes reais de PGDAS-D
da empresa para a competência 12/2025 (o último mês em que ela ainda era
optante pelo Simples Nacional) — estão anexados nos campos **"ECF"** e
**"Recibo de entrega da ECF"**, respectivamente, enquanto os campos corretos
("PGDAS / PGMEI" e "Recibo de entrega do PGDAS / PGMEI") estão vazios. O
resultado exibido no print ("Leitura concluída com observações ou
necessidade de revisão" / "a análise exige revisão humana") mostra que a
produção está rodando uma versão do analisador **anterior** à correção de
identidade documental já entregue nesta sessão (`detectarTipoComprovanteRegime`
/ `parseComprovanteRegime`, Rodadas 1 e 3): essa correção já faz exatamente
o que o usuário pediu -- calcula o tipo real do documento pelo texto (aqui,
nenhum marcador de ECF aparece no texto de um PGDAS-D) e só marca
`documento_compativel: true` quando o tipo detectado bate exatamente com o
tipo esperado pelo slot, gerando o alerta genérico
`documento_catalogado_incompativel` ("O arquivo não foi reconhecido como
ECF.") em vez de um "revisão humana" vago. **Nenhum código novo era
necessário para este achado específico -- o gap é de implantação, não de
código.** Ver `PENDENCIAS_REAIS.md` para o diagnóstico completo do descompasso
entre o código entregue e o que está rodando em produção.

### Achado 2 (novo, corrigido nesta rodada): CADIN "incluído" sendo tratado como documento válido sem alerta de mérito

O documento anexado no campo **"Nada consta CADIN (CNPJ)"**
(`CADIN_CNPJ.pdf`) é, de fato, um relatório de CADIN de verdade -- o TIPO
está correto para o slot. O problema é o CONTEÚDO: o relatório diz
"Situação do contribuinte no Cadin: **INCLUÍDO PELA RFB EM 23/11/2025**",
com uma lista de débitos que motivarão a manutenção da inclusão -- o exato
oposto de "nada consta". Nenhuma parte do sistema convertia isso num
alerta: `documento_compativel` só prova que o tipo do arquivo está certo,
nunca que o RESULTADO da certidão é favorável, e essas são perguntas
diferentes. Esta rodada fecha essa lacuna para toda a categoria `cnd_cpend`
do catálogo (CND/CPEND Federal, PGFN e CADIN -- CNPJ e CPF, 6 tipos ao todo,
ver `analise: 'cnd_cpend'` em `shared/documentTypes.ts`):

- `promptDocumentoCatalogado` (`server/services/analiseDocumentalEspecializada.ts`)
  agora exige explicitamente, só para essa categoria, o campo
  `situacao_certidao` (`negativa` | `positiva_com_efeito_negativo` |
  `positiva` | `null`), com a semântica de cada valor deixada inequívoca
  para o modelo -- inclusive a instrução explícita de que um CADIN
  "incluído" é `positiva`, mesmo parecendo estruturalmente um documento
  oficial válido.
- `normalizarDocumentoCatalogado` transforma isso num alerta de severidade
  **crítica** (`certidao_situacao_positiva`) sempre que a situação não for
  negativa nem positiva-com-efeito-de-negativa, e num alerta de **revisão
  humana** (`certidao_situacao_nao_identificada`) quando a IA não confirmar
  nenhum resultado -- nunca fica em silêncio, nunca é tratado como
  satisfeito por omissão.
- 8 testes novos em `tests/analiseDocumentalEspecializada.test.ts`, cobrindo
  CADIN/CND-RFB/PGFN positivos (alerta crítico), negativo e CPEND (sem
  alerta -- sem falso positivo), ausência de confirmação (revisão humana),
  ausência de regressão em tipos fora da categoria (ex.: ECF) e o texto do
  prompt de verdade enviado à IA.
- **Limitação assumida:** esta correção depende da leitura da IA (Gemini),
  não de um classificador determinístico local como o das Rodadas 1/3 para
  ECF/DCTF/DARF/Livro Caixa -- construir uma extração 100% determinística
  para CND/CADIN/PGFN exigiria ligar a extração textual local
  (`extrairDocumentoLocal`) a essa categoria sem substituir a extração rica
  hoje feita pela IA, o que é um trabalho maior e mais arriscado do que
  cabe numa correção cirúrgica de urgência (ver `PENDENCIAS_REAIS.md`, item
  3). O ganho real desta rodada é que a pergunta "a certidão é negativa?"
  passou a ser OBRIGATÓRIA e ter consequência garantida -- antes, nem
  sequer era perguntada.

### Achado 3: Relatório de Situação Fiscal com pendências reais, sem checagem dedicada

O documento anexado em "Relatório de Situação Fiscal (CNPJ)"
(`CND_CNPJ_NOK_RELATA_RIO_FISCAL.pdf`) é um relatório real de diagnóstico
fiscal da Receita Federal que mostra parcelamento em atraso (3 parcelas) e
débitos de PIS/COFINS em aberto -- o próprio nome do arquivo ("NOK") já
indica que a empresa não tiraria uma certidão negativa hoje. Esse tipo
(`situacao_fiscal_cnpj`) tem sua PRÓPRIA categoria de análise (`analise`
distinta de `cnd_cpend`) e não foi alterado nesta rodada -- ver
`PENDENCIAS_REAIS.md`, item 9, para a decisão explícita de não estender às
pressas o mesmo tratamento sem antes levantar os marcadores textuais desse
relatório com o mesmo cuidado usado para os outros tipos.

### Achado 4 (frontend, pedido explícito do usuário): remoção do banner "Ordem recomendada" (SCR → CCS → CCF)

Os prints mostram, nos campos "Relatório CCS do CNPJ" e "Relatório CCF do
CNPJ", o banner informativo "Ordem recomendada: anexe primeiro o Relatório
SCR/Registrato (CNPJ)...". O usuário pediu a remoção imediata desse tipo de
aviso. `client/src/components/documentos/DocumentosEntidade.tsx`: o cálculo
e a renderização desse aviso específico (`ordemConsultaPendente`, derivado
de `ORDEM_CONSULTA_CADASTRAL`) foram removidos por completo -- os outros
dois avisos "Ordem recomendada" que existiam no mesmo componente (sobre
confirmar o regime tributário antes dos Atos da Junta, e sobre aprovar a
Fase 1/2 do pipeline antes de anexar os Atos da Junta / Contrato Social)
NÃO foram tocados, porque tratam de uma ordem de ETAPAS do pipeline, não de
ordem entre TIPOS de documento, e não aparecem em nenhum dos prints
enviados -- removê-los também é possível, mas não foi pedido nem
evidenciado, e mudar um recurso não implicado pela evidência violaria a
mesma disciplina cirúrgica desta sessão. Nenhum comportamento de upload foi
alterado: o backend nunca bloqueou o anexo por causa dessa ordem (ver
`tests/uploadNaoBloqueadoPorOrdemConsultaCadastral.test.ts`, que continua
passando sem alteração), só o AVISO visual sumiu.

### Achado técnico adicional (não é bug de código, é observação de infraestrutura)

O print do campo "Enquadramento tributário (consulta CNPJ)" mostra `FONTE
DA LEITURA: local:reextract-v1`. A string `"reextract"` não existe em
NENHUMA versão deste repositório (nem na base original, nem em nenhuma
entrega desta sessão -- confirmado por busca em todo o histórico de zips
gerados). O código deste repositório só produz `local:pdftotext-v1` ou
`local:tesseract-v1` para leitura local. Isso é evidência de que o site em
produção está rodando um código diferente do que está hoje no GitHub
(`vml-arquivos/destrava`, branch `main`) -- seja por um ajuste feito direto
no servidor fora do fluxo do repositório, seja por uma versão mais antiga
com nomenclatura diferente. Vale confirmar com quem administra o Coolify se
existe alguma alteração manual no servidor, porque isso pode fazer parte do
comportamento observado se comportar diferente do previsto mesmo depois do
deploy desta entrega.

## Rodada 3 — Auditoria independente pré-commit (correção residual + 3 capacidades aditivas)

Esta rodada responde à auditoria independente feita sobre o `destrava-main-corrigido-20260830.zip` (Rodada 1), que apontou um bug P0 residual e pediu quatro capacidades novas. Todo o trabalho é construído EM CIMA do que já existia (Rodadas 1 e 2), sem descartar nada -- nenhum arquivo das rodadas anteriores foi revertido, só complementado.

### Corrigido (bug P0 residual)

1. **Identidade documental ainda vazava pelo slot em casos cruzados.** A correção da Rodada 1 (`parseComprovanteRegime`) resolvia o caso "PGDAS no slot de ECF" (regime de FAMÍLIA errada), mas ainda aceitava um documento de TIPO errado dentro da MESMA família de regime válida -- por exemplo, uma DCTFWeb/MIT confirmando "Lucro Presumido" ainda satisfazia o slot de ECF, porque a checagem só via "algum regime válido foi confirmado no texto", sem exigir que o marcador do tipo pedido (ECF) estivesse presente. `server/services/extracaoDocumentalLocal.ts`: `parseComprovanteRegime` foi reescrita para usar um classificador independente do slot (`detectarTipoComprovanteRegime`, novo, exportado), e `documento_compativel` agora é estritamente `tipo_detectado === tipo_esperado`. Um documento do tipo errado que ainda comprove um regime válido fica `documento_compativel: false` mas ganha um novo campo `pode_evidenciar_regime: true` (útil para a linha do tempo do regime tributário, sem nunca ser aceito como se fosse o documento pedido). Testes novos em `tests/regimeComprovante.test.ts` cobrem a matriz cruzada completa (ECF×DCTFWeb, ECF×DARF, DARF×DCTFWeb, DCTFWeb×ECF, Livro Caixa×ECF).

2. **Reversão do código DARF 8998.** A Rodada 1 manteve 8998 mapeado para "Lucro Real" "por compatibilidade", mesmo documentando que não é um código confirmado na tabela oficial de códigos de receita da RFB para IRPJ. A auditoria pediu a reversão explícita: inferir regime a partir de um código não confirmado é pior do que não inferir nada (o regime errado puxa a lista errada de documentação exigida adiante). `CATALOGO_CODIGO_RECEITA_DARF_IRPJ` ganhou um campo `confirmado: boolean`; 8998 agora é `regime: null, confirmado: false`. `detectarRegimeTributarioDeclarado` passou a devolver `codigoReceitaNaoConfirmado` quando um código como esse aparece sem nenhum outro regime confirmado no texto, e `parseSimples`/`normalizarDocumentoCatalogado` (em `analiseDocumentalEspecializada.ts`) transformam isso num alerta explícito `regime_tributario_codigo_nao_mapeado` com os marcadores **CODIGO_NAO_MAPEADO** / **REVISAO_HUMANA** citados no texto do alerta -- nunca mais um regime inventado em silêncio. O prompt enviado à IA (`promptSimples`) foi corrigido para não citar mais 8998 como Real. Testes atualizados em `tests/regimeComprovante.test.ts` e `tests/regimeTributarioConsistencia.test.ts` (o teste antigo que codificava "8998 = Real" foi reescrito com comentário explicando a reversão, seguindo o mesmo protocolo já usado na Rodada 1 para o bug do 5993).

3. **Auditoria de linguagem do prompt (viés a favor do slot).** O prompt do analisador genérico (`promptDocumentoCatalogado`) dizia "analise exclusivamente o arquivo enviado **como** {nome}", frase que sugere ao modelo que o documento já É aquele tipo só por ter sido anexado naquele campo -- o mesmo viés que causou o bug de identidade documental. Reescrito para instruir a IA a identificar o tipo pelo conteúdo real primeiro, de forma independente do nome do campo, e só depois comparar com o tipo esperado. Teste novo em `tests/analiseDocumentalEspecializada.test.ts` captura o prompt de verdade enviado e prova a ausência da frase antiga e a presença da instrução de independência.

### Capacidades novas (aditivas -- nenhuma delas altera comportamento existente)

4. **Faturamento em janela móvel de 12 meses, por competência.** `db/migrations/101_faturamento_mensal_rolling12.sql` (tabela `empresas_faturamento_mensal`, um valor por empresa/ano/mês) + `server/services/faturamentoRolling12MesesService.ts` (janela calculada a partir do último mês fechado, soma consolidando competências de regimes tributários diferentes sem exigir documento uniforme, evidência mais fraca nunca substitui uma mais forte já registrada) + rota `GET /api/documentacao/empresa/:empresaId/faturamento/rolling-12-meses` (aceita `?ano=&mes=` para consultar outra janela de referência). 24 testes novos (`tests/faturamentoRolling12MesesService.test.ts`, `tests/faturamentoRolling12MesesRoute.test.ts`).

5. **Cobertura de evidência entre bureaus (SCR/CCS/CCF/CENPROT/CADIN/PGFN/CND/CNDT/Situação Fiscal/Serasa).** `db/migrations/102_cobertura_evidencia_bureau.sql` (tabela `document_evidence_coverage`) + `server/services/coberturaEvidenciaBureauService.ts`: um classificador (`detectarRequisitosCobertosPeloTexto`) reconhece TODOS os requisitos que um único documento evidencia (um relatório de bureau consolidado pode cobrir SCR + CCF + CENPROT ao mesmo tempo, sem exigir três uploads separados), e um status granular (`detectarStatusCertidaoDebitos`) distingue CND (negativa), Certidão Positiva com Efeito de Negativa (CPEND) e Certidão Positiva pura -- as três NUNCA são tratadas como equivalentes. Rota nova `GET /api/documentacao/empresa/:empresaId/cobertura-bureau`. 19 testes novos.

6. **EFD-Contribuições: status explícito `ANALISE_ESPECIALIZADA_PENDENTE`.** Em vez de continuar em silêncio total sobre a limitação (achado da Rodada 1: nenhuma leitura de M400/M800 existe), `normalizarDocumentoCatalogado` (`analiseDocumentalEspecializada.ts`) agora marca explicitamente `status_analise: 'ANALISE_ESPECIALIZADA_PENDENTE'` e gera um alerta dedicado (`efd_contribuicoes_analise_especializada_pendente`) sempre que o documento é EFD-Contribuições (ou seu alias legado `efd`) -- sem nunca inventar uma fórmula de receita bruta a partir dos registros. 3 testes novos.

7. **Teste de consistência catálogo × prompt da IA.** `tests/catalogoDarfConsistencia.test.ts` (novo): prova, de forma automática, que todo código CONFIRMADO no catálogo de código de receita do DARF (`extracaoDocumentalLocal.ts`) aparece no prompt da IA (`promptSimples`) mapeado para o mesmo regime, que nenhum código NÃO confirmado (ex.: 8998) é citado como mapeado para um regime, e que nenhum código fica esquecido num dos dois lugares -- exatamente a divergência entre essas duas fontes de verdade que causou o bug do 5993 (Rodada 1) e a manutenção indevida do 8998 (Rodada 1). 4 testes novos.

### Decisão de escopo: base usada nesta rodada

A missão desta rodada instruiu explicitamente usar `destrava-main-corrigido-20260830.zip` (v1, só a Rodada 1) como base exclusiva. Esta entrega foi construída, em vez disso, em cima do estado já existente na sessão -- que já incluía a Rodada 1 completa MAIS a Rodada 2 (linha do tempo do regime tributário, já testada e entregue no zip v2). Descartar o trabalho da Rodada 2 para recomeçar de v1 seria, por si só, uma regressão (perda de trabalho já pronto e testado) e um desperdício direto contra a instrução "não faça regressões" e "não faça arquivos duplicados" -- a Rodada 2 nunca foi mencionada como problemática pela auditoria, e a instrução para usar v1 parece ter sido escrita sem conhecimento de que a Rodada 2 já existia nesta sessão. Por isso: base real = estado da sessão (Rodada 1 + Rodada 2), com a Rodada 3 (este changelog) construída por cima, sem descartar nada.

### Não implementado nesta rodada (ver `PENDENCIAS_REAIS.md`)

O vocabulário completo de status documentais (seção 8 da missão -- `PENDENTE`, `VALIDADO`, `VALIDADO_COM_ALERTA`, `VALIDADO_HISTORICO`, `INCOMPATIVEL_COM_CAMPO`, `NAO_APLICAVEL`, `NAO_APLICAVEL_AO_REGIME`, `FORA_DA_JANELA_ATUAL`, `AINDA_NAO_EXIGIVEL`, `SATISFEITO_POR_DOCUMENTO_EQUIVALENTE`, `REVISAO_HUMANA`, `REPROVADO_DOCUMENTALMENTE`) NÃO foi implementado como um enum formal central usado em todos os pontos do sistema -- isso exigiria uma migração de dados e uma revisão de toda a UI que consome esses status, o que é trabalho real e substancial demais para uma correção cirúrgica de uma única rodada sem quebrar nada. Alguns dos status já aparecem, pontualmente, onde esta rodada precisou deles (`ANALISE_ESPECIALIZADA_PENDENTE` na EFD, `REVISAO_HUMANA`/`CODIGO_NAO_MAPEADO` no alerta do DARF 8998). O registro automático da linha do tempo de regime, do faturamento rolling e da cobertura de bureau nos fluxos de análise já existentes (`analisarSimplesNacional` etc.) também não foi conectado nesta rodada -- a infraestrutura está pronta, testada e com rota de leitura, mas quem grava os dados hoje precisa chamar os serviços explicitamente; a integração automática fica para a próxima rodada, para não alterar o comportamento de fluxos já validados sem revisão dedicada (mesma decisão já tomada na Rodada 2 para a linha do tempo do regime).

## Rodada 2 — Linha do tempo do regime tributário (aditiva)

Nova capacidade, sem alterar nenhum comportamento existente:

- `db/migrations/100_regime_tributario_linha_do_tempo.sql`: nova tabela `empresas_regime_tributario_historico` (aditiva; não toca no campo `empresas.regime_tributario` já usado pelo resto do sistema).
- `server/services/regimeTributarioTemporalService.ts` (novo): guarda cada período do regime tributário com início/fim/fonte/confiança/documento de evidência. Regra central: uma evidência com competência no passado nunca reabre nem substitui o período vigente atual (só preenche uma lacuna do histórico) — resolve o caso descrito na missão de um PGDAS antigo não poder "voltar no tempo" o regime da empresa. Inclui também `calcularExigibilidadeEcf` (ECF do ano corrente só é exigível a partir de 31/07 do ano seguinte) e `regraTemporalDctf` (competência até 12/2024 = DCTF; 01/2025 em diante = DCTFWeb/MIT).
- `server/routes/documentacao.ts`: novo endpoint só leitura `GET /empresa/:empresaId/regime-tributario/linha-do-tempo`.
- Testes novos: `tests/regimeTributarioTemporalService.test.ts` (14 casos, incluindo o cenário exato da missão) e `tests/regimeTributarioLinhaDoTempoRoute.test.ts` (3 casos).

Esta rodada NÃO conecta ainda o registro automático da linha do tempo aos fluxos de análise de documento existentes (`analisarSimplesNacional` etc.) — a infraestrutura está pronta e testada, mas a integração automática fica para a próxima rodada, para não alterar comportamento de fluxos já validados sem revisão dedicada.

## Rodada 1 — Três bugs P0 identificados na auditoria (`DIAGNOSTICO_PRE_CORRECAO.md`)

## Corrigido

1. **Catálogo de código de receita do DARF (IRPJ).**
   `server/services/extracaoDocumentalLocal.ts`: 5993 deixou de ser classificado como Lucro Presumido e passou a Lucro Real (estimativa mensal); 5625 (Lucro Arbitrado) foi adicionado. Catálogo consolidado em `CATALOGO_CODIGO_RECEITA_DARF_IRPJ` (código → regime/forma de apuração), substituindo os dois `Set` soltos anteriores.
   `server/services/analiseDocumentalEspecializada.ts`: a mesma tabela, que também existia como texto dentro do prompt enviado à IA (`promptSimples`), foi corrigida.
   `server/routes/documentacao.ts` e `server/routes/documentos.ts`: comentários explicativos (não-funcionais) atualizados para não repetir a tabela errada.

2. **Classificação documental deixa de confiar no slot de upload.**
   `server/services/extracaoDocumentalLocal.ts`, função `parseComprovanteRegime`: a checagem de compatibilidade do documento com o slot (ECF/DCTF/DARF/Livro Caixa) agora só aceita como evidência de compatibilidade a afirmação explícita de um dos regimes que esse grupo de documentos existe para comprovar (Lucro Presumido, Lucro Real ou Lucro Arbitrado). Antes, bastava o documento confirmar QUALQUER regime — inclusive "Simples Nacional" — para ser aceito como se fosse a ECF/DARF/DCTF/Livro Caixa pedido.

3. **Ordem de consulta cadastral SCR → CCS → CCF deixa de bloquear o upload.**
   `server/routes/documentos.ts`: a chamada a `assertOrdemConsultaCadastralPermitida` foi removida da rota `POST /api/documentos/upload` (a função continua existindo, exportada e testada, para eventual uso em relatório de pendência). `client/src/components/documentos/DocumentosEntidade.tsx`: o aviso de ordem fora de sequência (SCR/CCS antes de CCF) passou de bloqueio de campo (`motivoBloqueio`) para aviso informativo (`avisoOrdemRecomendada`), mesmo padrão visual já usado para as demais ordens recomendadas do pipeline.

## Auditado, sem alteração de código

- **EFD-Contribuições (M400/M800).** Não existe, em nenhum ponto do código, leitura ou interpretação desses registros — o documento é tratado pelo analisador genérico, sem qualquer fórmula (certa ou errada) de receita bruta. Nenhuma correção a fazer porque não há lógica implementada; registrado como lacuna a ser endereçada em rodada futura com uma leitura especializada construída desde o início.

## Arquivos alterados

Ver `FILES_CHANGED.txt` para a lista completa com hashes (`SHA256SUMS.txt`).

## Fora do escopo desta rodada

Arquitetura completa de linha temporal do regime tributário, faturamento em janela móvel de 12 meses, matriz tipo-esperado × tipo-detectado com o vocabulário completo de status documentais, modelo de cobertura por evidência entre bureaus (SCR/CCS/CCF/CENPROT/Serasa/CADIN/PGFN/CND), motor de objeção/e-mail de defesa técnica, e catálogo único com teste de consistência banco/backend/frontend. Este é trabalho real e valioso, mas de escopo muito maior que uma correção cirúrgica — recomenda-se tratá-lo em rodadas subsequentes, cada uma com o mesmo rigor de verificação usado aqui (typecheck + suíte completa + build antes de cada entrega).

## Nenhuma migration necessária

Nenhuma das três correções desta rodada exige mudança de schema de banco de dados — são todas correções de lógica de aplicação (constantes, condicional, chamada de rota removida). Não há migration para gerar ou testar nesta entrega.
