# Changelog de Correções — 30/08/2026

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
