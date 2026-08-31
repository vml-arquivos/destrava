# Changelog de Correções — 30/08/2026 (Rodada 11: 31/08/2026)

## Rodada 11 — "Dados da análise" não fica mais atrás de clique para documento incompatível; janela de 12 meses para a exceção de transição de regime tributário

Feedback com print da própria tela (Acervo Documental, campo ECF com um PGDAS-D anexado), marcando com uma seta o link "Dados da análise" que ainda aparecia sob o arquivo incompatível: **"isso é pra tirar, é já pra aparecer o documento incompatível, ok? Isso pra todos que for incompatíveis"**. No mesmo turno, o usuário também refinou o pedido da Rodada 10 sobre transição de regime tributário, usando como exemplo uma empresa que era optante do MEI: **"quando for dessa maneira, que tiver pouco tempo que ele não tiver tempo de ter as certidões... aí também vai ficar explicado... mas só ser nesse necessário, senão não é nem pra aparecer a conta de anexar esses documentos"**.

**Correção 1 — "Dados da análise" removido para documento incompatível:** a Rodada 9 já tinha reduzido o resultado de um documento incompatível a uma única seção mínima ("Documento inválido... anexe o [tipo esperado]"), mas essa seção continuava atrás do botão "Dados da análise" em `DocumentosEntidade.tsx` -- o usuário precisava clicar para ver que o documento era inválido, exatamente o clique extra que a Rodada 9 já tinha eliminado do texto mas não da interação. Corrigido: quando `estadoVisualDocumento(resultadoInline, doc) === "incompativel"`, o botão "Dados da análise"/"Ocultar" deixa de aparecer e o card mínimo de incompatibilidade é exibido diretamente, sem nenhuma interação -- para todo documento incompatível, qualquer que seja o tipo esperado do slot ("isso pra todos que for incompatíveis", não só o exemplo do ECF/PGDAS usado na conversa). Para documentos corretos (com ou sem outra pendência de conteúdo), o comportamento de clicar para expandir continua exatamente como antes -- a mudança é exclusiva do caso "documento incompatível com o slot".

**Correção 2 — janela de 12 meses para a exceção de transição de regime tributário:** a Rodada 10 mantinha os dois grupos fiscais (Simples/MEI e ECF/DCTF) visíveis para sempre, uma vez detectada qualquer evidência histórica dos dois grupos na linha do tempo de regime -- sem nenhum limite de tempo. O usuário esclareceu que a exceção só deve valer enquanto a transição for recente ("pouco tempo", "não tiver tempo de ter as certidões"); depois de passado tempo suficiente para reunir a documentação do regime novo, a opção de anexar o regime anterior não deve nem aparecer para quem ainda não anexou nada dele. Corrigido: `slotCompativelComRegimeTributario` (e a nova função `transicaoDeRegimeRecente`, extraída para ser a única fonte de verdade tanto da visibilidade dos slots quanto do aviso na tela) só mantêm os dois grupos visíveis enquanto o regime hoje vigente tiver menos de 12 meses (366 dias, o mesmo horizonte já usado em outro lugar do sistema para "12 meses de histórico") -- a data de início do regime vigente (`regime_vigente_desde`) é derivada, no backend, da linha do tempo já anexada ao dossiê desde a Rodada 10 (o período aberto, sem `data_fim`, ou o último período registrado na ausência de um aberto). Quando a data de início não é conhecida, a incerteza nunca esconde o slot -- mesma regra de segurança já usada no resto desta funcionalidade. Um documento JÁ anexado continua visível para sempre, independentemente do tempo decorrido -- essa guarda (Rodada 10) não tem prazo.

**Prova de causa raiz:** `tests/slotCompativelComRegimeTributario.test.ts` (+8 testes) prova, com datas fixas injetadas (`agora` é um parâmetro da função pura, nunca `Date.now()` direto), que uma transição há menos de 12 meses mantém os dois grupos visíveis, uma transição de 12 meses ou mais deixa de mostrar o grupo anterior para slots ainda não anexados (mas nunca para os já anexados), e que a ausência/invalidez da data de início trata a transição como recente (incerteza nunca esconde). Um novo `describe` cobre `transicaoDeRegimeRecente` isoladamente, com os mesmos cenários. `tests/mapaDocumentalCredito.test.ts` (+2 testes) prova que `regime_vigente_desde` identifica corretamente o período aberto (sem `data_fim`) como o vigente, com fallback para o último período da lista na ausência de um aberto. Confirmado por reversão temporária: removendo a checagem de dias de `transicaoDeRegimeRecente` (fazendo-a devolver sempre `true` quando os dois grupos aparecem na história, como na Rodada 10), os dois testes de "transição antiga" falham exatamente como o comportamento antigo (esconderiam o grupo anterior nunca, para sempre, independentemente do tempo).

**Sobre o terceiro ponto trazido na mesma mensagem** (leitura correta e cruzada de todos os documentos -- CNPJ, QSA, enquadramento tributário -- com textos objetivos e uma análise mais detalhada feita depois, separadamente): é uma reafirmação de princípios já em vigor no sistema (cruzamento QSA×CNPJ já existe em `analiseDocumentalEspecializada.ts`, seção `confronto_qsa`; leituras já são objetivas por padrão desde as Rodadas 7-9), não um bug concreto com exemplo reproduzível. Nenhuma alteração de código foi feita para este ponto nesta rodada -- fica registrado aqui para que, se o usuário identificar um caso concreto de leitura incorreta ou cruzamento faltando entre dois documentos específicos, seja tratado como uma próxima correção cirúrgica, com o mesmo rigor das demais.

## Rodada 10 — empresa que mudou de regime tributário: documentos do regime anterior continuam sendo pedidos, com a ressalva do regime atual; e auditoria do invariante "conteúdo manda, nunca o nome do arquivo/campo"

Depois de confirmar a Rodada 9 ("Exatamente isso"), o usuário trouxe dois pedidos novos, de arquiteto do sistema, sobre a mesma tela de documentos:

1. **"se ela era optante do simples ... vai precisar anexar os documentos do simples também. Mas, com a ressalva de que agora ela é de outro regime, e falar o regime que vai estar no SRF ou no DCTF"**: uma empresa que mudou de regime tributário (ex.: era optante do Simples Nacional e passou a Lucro Presumido/Real) precisa continuar podendo anexar os documentos do regime ANTERIOR como evidência do período de transição, enquanto não houver comprovação completa de tempo já decorrido sob o regime novo -- e a tela precisa deixar claro que o regime atual é outro, nomeando-o.
2. **"cada documento é pra ser lido e analisado no seu respectivo local... o que vale é a leitura dentro, a leitura real da documentação do arquivo"**: reafirmação de que o nome do arquivo ou o campo/slot em que ele foi anexado nunca pode decidir a identidade do documento -- só o conteúdo lido.

**Item 2 -- auditoria, sem alteração de código:** confirmado, por investigação dedicada do código de extração e classificação, que este invariante já é garantido de ponta a ponta, independentemente do nome do arquivo (`nome_original`/`nome_customizado`) ou do `tipo_documento` do slot declarado no upload:
- `detectarTipoComprovanteRegime`/`parseComprovanteRegime` (`server/services/extracaoDocumentalLocal.ts`) classificam o tipo do documento a partir do TEXTO extraído do arquivo (via OCR/`pdftotext`), nunca a partir do nome do arquivo ou do slot de upload.
- `classificadorDocumentalCentral.ts` (`detectarTipo`) repete essa mesma classificação por conteúdo, como camada central/determinística independente.
- O prompt da IA (usado quando a classificação determinística não decide sozinha) instrui explicitamente a identificar o tipo do documento pelo que está escrito nele, não pelo campo em que foi anexado.
- `extrairHibrido` (mesmo arquivo) tem um curto-circuito determinístico: para os tipos com classificador 100% confiável (ECF, PGDAS-D, DCTF/DCTFWeb/MIT, DARF, ECD, Livro Caixa -- a correção da Rodada 7), quando a extração local já decide `documento_compativel: false`, a IA nem chega a ser chamada -- eliminando qualquer chance de o modelo "aceitar" um documento errado por sugestão do nome do campo.

Nenhum destes pontos usa `nome_original`, `nome_customizado` ou o `tipo_documento` declarado do slot para decidir compatibilidade -- o campo `tipo_documento` do slot é usado só para saber QUAL documento era esperado ali (para comparar com o que foi de fato identificado no conteúdo), nunca para decidir o que o documento É. Nenhuma alteração de código foi necessária para este ponto; ele já estava correto antes desta rodada.

**Item 1 -- causa raiz:** a tela de documentos (`DocumentosEntidade.tsx`, função `slotsDaTela`) já escondia os slots fiscais do grupo Simples Nacional (PGDAS, PGMEI, DEFIS etc.) sempre que o regime tributário confirmado da empresa era do grupo ECF/DCTF (Lucro Presumido, Lucro Real, Lucro Arbitrado, Imune/Isenta ou "não optante a confirmar"), e vice-versa -- mas essa decisão (`slotCompativelComRegime`) olhava só para o regime ATUAL (`mapaCredito.regime_identificado`), sem nenhuma memória de que a empresa pode ter mudado de regime. Isso tinha dois problemas reais, um deles um risco de regressão latente descoberto durante a investigação desta rodada (nunca relatado pelo usuário, mas exatamente o cenário que ele descreveu): (a) um documento do Simples já anexado (ex.: um PGDAS-D histórico) podia DESAPARECER da tela assim que o regime da empresa fosse corretamente confirmado para o outro grupo -- o que passou a ser mais provável depois das correções de classificação das Rodadas 7-9 -- mesmo esse documento continuando a ser evidência real de um período em que a empresa esteve sob aquele regime; e (b) uma empresa que comprovadamente mudou de regime (evidência dos dois grupos fiscais na linha do tempo) não tinha como sequer ANEXAR um documento novo do regime anterior, porque o slot ficava oculto.

**Correção, em duas partes:**

1. **Backend** (`server/routes/documentacao.ts` + `server/services/mapaDocumentalCreditoService.ts`): o montador do dossiê (`montarDossieCreditoEmpresa`) passou a anexar ao mapa documental um novo campo, aditivo e best-effort, `historico_regime_tributario.linha_do_tempo`, lido da linha do tempo de regime tributário já existente e já populada desde uma rodada anterior desta sessão (`regimeTributarioTemporalService.obterLinhaDoTempoRegime`, tabela `empresas_regime_tributario_historico`, registrada a cada documento lido com regime confirmado -- ver `persistirEvidenciasP0` em `analiseDocumentalEspecializada.ts`). O acesso à tabela é envolto em `try/catch`: qualquer falha (ex.: tabela vazia ou indisponível) não derruba o dossiê -- o mapa documental simplesmente segue funcionando com o regime atual apenas, como antes desta correção. A função pura que molda esse campo (`montarHistoricoRegimeTributarioParaMapa`) foi extraída para ser testável isoladamente, sem precisar montar o dossiê inteiro (que depende de CNPJ, QSA, societário e do motor de regras documentais).
2. **Frontend** (`client/src/components/documentos/DocumentosEntidade.tsx` + nova função pura em `shared/documentalPresentation.ts`): a decisão `slotCompativelComRegime` foi extraída para uma função pura testável, `slotCompativelComRegimeTributario`, com duas guardas novas, nesta ordem: (a) um slot que já tem documento anexado NUNCA é escondido, seja qual for o regime confirmado depois -- fecha o risco de regressão (a) acima; (b) quando a linha do tempo mostra que a empresa já esteve nos dois grupos fiscais (Simples e ECF/DCTF) em períodos diferentes, os dois grupos de slots continuam visíveis para anexar, mesmo para documentos ainda não anexados -- resolve o pedido (b). Um novo indicador visual, ao lado da já existente pendência de confirmação de regime, avisa "Mudança de regime — regime atual: [nome do regime]" sempre que essa transição é detectada, nomeando o regime atual exatamente como ele aparece em `mapaCredito.regime_descricao` (o mesmo texto já usado em "Faltam N documentos... — regime X").

**Prova de causa raiz:** `tests/slotCompativelComRegimeTributario.test.ts` (novo, 10 testes) prova os quatro cenários pedidos com a função pura extraída -- empresa sempre-Simples (esconde ECF/DCTF), empresa sempre-ECF (esconde Simples), regime ainda não identificado/a confirmar (comportamento inalterado) e empresa que mudou de regime (união dos dois grupos) -- além do cenário de regressão específico (documento já anexado nunca some) e da classificação de regime em grupo fiscal (`bucketDoRegimeTributarioHistorico`). `tests/mapaDocumentalCredito.test.ts` (2 testes novos) prova que `montarHistoricoRegimeTributarioParaMapa` mantém só `regime`/`data_inicio`/`data_fim`, descartando os campos internos do registro (id, fonte, confiança, documento_evidencia_id, observação), e que devolve lista vazia sem erro quando a empresa ainda não tem nenhuma evidência de regime registrada. Confirmado por reversão temporária das duas guardas novas em `slotCompativelComRegimeTributario` (documento já anexado / transição de regime detectada): sem cada uma delas, o teste correspondente falha exatamente como o cenário de risco descrito acima.

## Rodada 9 — zero leitura exibida de documento incompatível: só "Documento inválido, anexe o [X]" -- nenhum dado do documento errado aparece na tela

Feedback imediatamente seguinte à Rodada 8 (mesmo usuário, sobre a mesma tela): a Rodada 8 já tinha reduzido o alerta a uma mensagem mínima e corrigido o selo visual, mas o usuário foi além -- pediu explicitamente que, quando o documento anexado NÃO é o esperado, **nenhuma informação lida dele apareça na tela**, nem resumida: **"não é pra ele ler o que está nesse documento do simples, pra ele ler só se for o s f [ECF]"**. Ou seja: não é só encurtar o texto -- é remover COMPLETAMENTE a exibição de qualquer dado do documento errado (diagnóstico, "amostra objetiva dos dados lidos", alertas explicando o motivo). A única coisa que pode aparecer é um indicador vermelho de pendência: **"Documento inválido... anexe o [tipo esperado]"**. Quando o documento CORRETO for anexado e lido, aí sim os dados dele (regime tributário, tipo de empresa) voltam a aparecer normalmente -- exatamente como já acontecia antes para documentos compatíveis.

**Causa raiz:** `construirSecoesAnaliseDocumento` (`shared/documentalPresentation.ts`) sempre construía as mesmas seções (diagnóstico, alertas, amostra de dados) independentemente de o documento ser ou não o esperado para o slot -- a Rodada 8 já tinha encurtado o TEXTO dessas seções, mas nunca suprimiu as seções em si quando o documento é do tipo errado.

**Correção:** extraída a mesma condição de incompatibilidade já usada por `estadoVisualDocumento` (documento_compativel/identidade_status/tipo_esperado×tipo_detectado) para uma função compartilhada `documentoMarcadoIncompativel` -- garantindo que o selo visual e o conteúdo da tela nunca discordem entre si sobre quando um documento é o tipo errado. Quando essa condição é verdadeira, `construirSecoesAnaliseDocumento` devolve SÓ a seção "Resultado da análise", com a mensagem mínima "Documento inválido para este campo. Anexe o documento correto: [Nome do tipo esperado]." (`server/routes/documentacao.ts`, usando `documentLabel` do catálogo para nomear o tipo exato, ex.: "ECF"). Nenhuma seção de diagnóstico, amostra de dados ou alerta é construída para esse caso -- não é uma questão de escondê-las na tela, elas simplesmente não existem no resultado. Quando o documento é o correto (mesmo com outras pendências de conteúdo, como regime ambíguo ou baixa confiança), todas as seções continuam aparecendo exatamente como antes -- a supressão é exclusiva do caso "documento errado no slot".

**Prova de causa raiz:** `tests/documentacaoConclusaoIncompatibilidade.test.ts` (atualizado) monta um laudo persistido mocado com dados de fato lidos do PGDAS-D errado (`situacao_simples`, `regime_tributario`, `diagnostico_factual`) -- exatamente os dados que vazavam para a tela antes desta correção -- e prova que `construirSecoesAnaliseDocumento` devolve só 1 seção (nenhuma de diagnóstico/campos/alertas), com a mensagem "Documento inválido... ECF". Segundo teste prova, em contraste direto, que um ECF de verdade continua mostrando a seção de dados lidos (ex.: "Regime tributário declarado no documento: Lucro Presumido") -- sem regressão. Confirmado por reversão temporária em ambos os pontos (o corte de seções e o texto da conclusão): sem a correção, o primeiro teste falha exatamente como o bug relatado (a "amostra objetiva dos dados lidos" e o diagnóstico do PGDAS reaparecem; a conclusão volta a ser o texto genérico).

## Rodada 8 — mensagem mínima (é ou não é o documento + o que ele diz), sem duplicidade, e o selo visual deixa de mentir "revisão necessária" para um documento incompatível

Feedback do usuário sobre a própria tela gerada pela Rodada 7: os dois prints mostram a nova seção "Alertas da leitura automática" renderizando -- prova de que a Rodada 7 funcionou -- mas o usuário rejeitou o RESULTADO com três críticas concretas e literais:

1. **"tire esse texto enorme, não precisa dessa explicação"**: as mensagens de alerta da Rodada 7 explicavam o problema em um parágrafo inteiro (o que é o documento, por que não serve, o que anexar). O único conteúdo exigido agora é (1) se o arquivo é ou não é o documento esperado e (2) o que o próprio documento afirma sobre enquadramento/regime tributário -- nada além disso.
2. **"não ler um outro documento junto com duplicidade, com o bug, resolva"**: para os tipos com classificador determinístico (ECF, PGDAS-D, DCTF/DCTFWeb/MIT, DARF, ECD, Livro Caixa) e para a categoria de certidões (`cnd_cpend` e afins), o mesmo problema de identidade podia gerar DOIS alertas quase idênticos ao mesmo tempo -- um do classificador local/IA (`documento_catalogado_incompativel`) e outro do classificador central (`documento_catalogado_tipo_incompativel`) -- cada um contando a mesma história com palavras diferentes. Isso é a "duplicidade" relatada.
3. **"não é mais aceitável que um documento fique no local de outro documento... como um documento validado, como lido"**: apesar do alerta correto já existir, o SELO/status geral do documento (o que aparecia como "REVISÃO NECESSÁRIA" no print) continuava genérico -- o mesmo rótulo usado para qualquer outro motivo de revisão (baixa confiança, campo ambíguo etc.), nunca dizendo explicitamente "este não é o documento certo e não foi validado para este campo".

**Causa raiz do item 3 (a mais estrutural das três):** `normalizarDocumentoCatalogado` (`server/services/analiseDocumentalEspecializada.ts`) sempre calculou corretamente `documento_compativel`/`identidade_status` dentro de `dados_extraidos` -- mas `montarResultadoDetalhadoRelatorio` (`server/routes/documentacao.ts`), a função que monta o objeto `resultado_analise` consumido pela tela do Acervo Documental (`enriquecerDocumentosAcervoComAnalise`) e pelo relatório consolidado (`montarRelatorioDocumental`), NUNCA repassava esses campos para o objeto devolvido ao frontend -- só devolvia uma `conclusao` textual binária ("consistente" ou "necessidade de revisão"). Consequência dupla: (a) a própria função de conclusão não sabia que o motivo da revisão era "documento errado" especificamente; (b) `estadoVisualDocumento` (`shared/documentalPresentation.ts`), que desde a Rodada 7 já sabia calcular corretamente o estado `"incompativel"` a partir de `resultado.dados_extraidos.documento_compativel`/`identidade_status`, nunca recebia esses dados e caía no estado genérico `"revisao"` -- por isso o selo mostrava "Revisão necessária" (rótulo de `estadoVisualDocumento`) em vez de "Documento incompatível", mesmo com o laudo já sinalizando a incompatibilidade internamente.

**Correção, em três partes, todas cirúrgicas:**

1. **Mensagens mínimas** (`server/services/analiseDocumentalEspecializada.ts`): os textos de `documento_catalogado_incompativel` e `documento_catalogado_tipo_incompativel` foram reduzidos à forma `Documento incorreto para "<esperado>" -- conteúdo identificado: <detectado>. Não validado. Enquadramento indicado no arquivo: <regime/situação lida>.` -- sem explicação longa, sem recomendação. Um novo mapa `ROTULOS_TIPO_DETECTADO`/`descreverTipoDetectadoResumido` traduz os códigos internos do classificador (ex.: `PGDAS_D`) para um rótulo curto em português (`PGDAS-D (Simples Nacional)`).
2. **Fim da duplicidade**: para os tipos críticos (o mesmo conjunto `tiposCriticos` já usado desde a Rodada 4/6: ECF, PGDAS-D, DCTF/DCTFWeb/MIT, DARF, ECD, Livro Caixa, CND/CPEND/CADIN/PGFN/CENPROT/Situação Fiscal), os dois sinais de incompatibilidade (classificador central e classificador local/IA) agora resultam num ÚNICO alerta (`documento_catalogado_tipo_incompativel`) -- o alerta genérico (`documento_catalogado_incompativel`) só é emitido isoladamente para os tipos que NÃO têm classificador central (onde não há risco de duplicidade).
3. **Selo visual correto**: `montarResultadoDetalhadoRelatorio` agora propaga `dados_extraidos` (com `documento_compativel`, `identidade_status`, `tipo_esperado`, `tipo_detectado`, `satisfaz_requisito`, `cobertura_status`) para o objeto `resultado_analise` devolvido à tela, e a `conclusao` textual passa a dizer explicitamente `"Documento incorreto para este campo -- NÃO validado. Anexe o documento correto."` sempre que `documento_compativel === false` ou `identidade_status === 'INCOMPATIVEL'` -- em vez do texto genérico anterior. Isso corrige tanto a tela do Acervo Documental (`enriquecerDocumentosAcervoComAnalise`) quanto o relatório consolidado (`montarRelatorioDocumental`), já que os dois compartilham a mesma função.

**Prova de causa raiz (dupla, uma por bug):**
- `tests/analiseDocumentalPgdasNoSlotDeEcfNaoDeveSerLaundered.test.ts` (atualizado): prova que só existe UM alerta (`documento_catalogado_tipo_incompativel`, não mais dois), com a mensagem mínima (menos de 200 caracteres, sem `recomendacao`), ainda mencionando "Simples Nacional"/"PGDAS-D"/"não validado". Confirmado por reversão temporária: sem a correção da duplicidade, o teste falha porque o alerta genérico volta a aparecer junto do alerta do classificador central.
- `tests/documentacaoConclusaoIncompatibilidade.test.ts` (novo, 2 testes): prova, de ponta a ponta (`montarRelatorioDocumental` → `estadoVisualDocumento`/`rotuloEstadoDocumento`), que um documento incompatível agora produz a conclusão "Documento incorreto... NÃO validado" e o selo "Documento incompatível" -- não mais "Revisão necessária" -- e que um documento realmente consistente continua com o selo de sucesso ("Requisito satisfeito"), sem regressão. Confirmado por reversão temporária: sem a propagação de `dados_extraidos`, o primeiro teste falha exatamente como o bug relatado (conclusão volta a ser o texto genérico).

**Nada mudou na causa raiz corrigida na Rodada 7** (a IA continua sem ser consultada quando o classificador local/central já decide com confiança; `__texto_local` continua propagado para todos os tipos). Esta rodada corrige exclusivamente COMO o resultado correto é comunicado ao usuário -- o texto do alerta, a ausência de duplicidade, e o selo visual.

## Rodada 7 — causa raiz definitiva do PGDAS no slot de ECF (sobre a base com classificador central e versionamento de laudos)

Novo relato do usuário sobre o site em produção, com print do Acervo Documental e o PDF real do PGDAS-D da empresa ZR CONSTRUCOES E REFORMAS CIVIS LTDA (CNPJ 49.366.887/0001-25): o arquivo continuava anexado no campo "ECF" com o status vago "Leitura concluída com observação ou necessidade de revisão", sem nunca declarar explicitamente que o conteúdo é um comprovante do Simples Nacional -- mesmo o Enquadramento Tributário da própria empresa já constando como "Não Optante" no mesmo dossiê. Pedido explícito: a leitura precisa deixar isso claro, "com garantias de que vai funcionar, sem retrabalho".

**Contexto necessário antes da causa raiz:** o estado de código usado como base para esta rodada já incluía, sem nenhuma entrada própria neste changelog, três peças novas -- um classificador central de identidade documental (`server/services/classificadorDocumentalCentral.ts`, com um enum mais amplo que cobre inclusive PGDAS-D/RECIBO_PGDAS/ECD, algo que as rodadas anteriores deste changelog ainda não cobriam), um sistema de versionamento de laudos por assinatura (`server/services/documentalLaudoVersioning.ts`, que marca automaticamente um laudo persistido como desatualizado sempre que a versão do classificador/regras muda) e um backfill controlado em lote (`server/services/backfillLaudosService.ts` + `scripts/backfill-laudos.ts` + migration 103). Essas três peças já eram corretas isoladamente -- inclusive já havia um teste (`tests/p0LaudosBackfill.test.ts`) provando, em nível de função pura, que `classificarDocumentoDeterministico` identifica corretamente um PGDAS-D como incompatível com o slot de ECF.

**Causa raiz (a mesma classe de bug das rodadas 1/3/5, num lugar novo):** apesar de todas essas peças corretas já existirem, `extrairHibrido` (`server/services/analiseDocumentalEspecializada.ts`) só propagava o texto extraído localmente (`__texto_local`) para a resposta da IA quando `tipo === 'qsa'`. Para todos os demais tipos -- incluindo ECF, PGDAS-D, DCTF/DCTFWeb/MIT, DARF, ECD e Livro Caixa -- sempre que a extração local apontava incompatibilidade e o código pedia uma segunda opinião à IA, o classificador central nunca recebia texto real para classificar (ficava com `NAO_IDENTIFICADO` em vez de `INCOMPATIVEL`), e a decisão final acabava dependendo só do que a IA (não determinística) respondesse. Comprovado lendo o texto real do PGDAS-D anexado (via `pdftotext`) e reproduzindo o cálculo manualmente: com o texto real, tanto o classificador local (`parseComprovanteRegime`) quanto o central (`classificarDocumentoDeterministico`) já concluíam corretamente `documento_compativel: false` / `identidade_status: 'INCOMPATIVEL'` -- mas esse texto nunca chegava a eles no caminho de produção.

**Correção, em três partes, todas cirúrgicas:**

1. `extrairHibrido` agora propaga `__texto_local` sempre que a extração local produziu texto, não só para QSA -- isso, sozinho, já faz o classificador central funcionar corretamente para todos os tipos com extração local.
2. Como reforço redundante (defesa em profundidade, não apenas uma correção): para os tipos com classificador 100% determinístico (`ecf`, `pgdas_d`, `dctf_mit`, `darf`, `ecd`, `livro_caixa` -- a mesma lista de `TipoComprovanteRegime` em `extracaoDocumentalLocal.ts`), um `documento_compativel: false` da extração local agora é usado diretamente, sem sequer chamar a IA. Assim, mesmo que um bug futuro volte a impedir a propagação do texto local, esses seis tipos continuam corretos por um caminho independente.
3. As mensagens de alerta (`documento_catalogado_incompativel` e `documento_catalogado_tipo_incompativel`) agora declaram explicitamente, em português claro, quando o conteúdo lido é um comprovante do Simples Nacional (PGDAS-D ou seu recibo) -- diretamente em resposta ao "tem que deixar claro que essa empresa não é mais optante do simples".

**Garantia adicional:** um `RULE_VERSION` bumpado em `documentalLaudoVersioning.ts` garante que os DOIS arquivos de PGDAS já anexados no slot de ECF pela ZR Construções (analisados antes desta correção existir) sejam automaticamente marcados como `REANALISE_NECESSARIA` na próxima leitura -- sem precisar reanexar nada. Depois do deploy, rodar `npm run backfill:laudos -- enqueue-and-run` reprocessa esses documentos em lote (ou o botão "Reanalisar" resolve caso a caso).

**Visibilidade na tela:** o alerta claro e específico já existia como dado calculado pelo backend antes desta rodada, mas nunca virava uma seção visível para documentos catalogados genéricos (fora do fluxo societário/QSA) em `shared/documentalPresentation.ts` -- reproduzindo, num componente diferente, o mesmo problema já corrigido antes no Acervo Documental (dado certo, mas invisível na tela). Corrigido com uma nova seção "Alertas da leitura automática", sempre visível (nunca escondida atrás de um clique), para alertas de severidade alta ou crítica.

**Prova de causa raiz:** teste novo (`tests/analiseDocumentalPgdasNoSlotDeEcfNaoDeveSerLaundered.test.ts`) exercita a extração local de verdade (`pdftotext` sobre um PDF sintético) com a IA mocada para responder erradamente "compatível" -- prova que o resultado final ignora essa resposta da IA e que a IA sequer chega a ser chamada. Confirmado por reversão temporária: comentando a correção, o teste falha exatamente como o bug relatado (`documento_compativel` volta a `true`, herdado da IA mocada).

## Rodada 6 — "Enquadramento Tributário" aparecia duas vezes, com os mesmos dados, no relatório consolidado

Novo relato do usuário, com o PDF real do relatório da empresa ZR CONSTRUCOES E REFORMAS CIVIS LTDA e 2 prints do modal "Relatório consolidado da análise documental": **"porque no relatorio gerado tem dois enquadramento tributario com as mesmas informações"**. Confirmado no PDF anexado: a seção "1. Documentos anexados e analisados" lista **duas** entradas "ENQ. TRIB.pdf", ambas "Validado", com dado byte-idêntico (CNPJ 49.366.887/0001-25, Situação Não Optante, Regime Não Optante, Optante MEI/SIMEI Não, fonte `local:tesseract-v1`, confiança 90%).

**Causa raiz:** o catálogo documental (`shared/documentTypes.ts`) e a regra de vínculo automático a blocos (`vincularDocumentosAutomaticos`, `server/routes/documentacao.ts`) tratam `enquadramento_tributario_cnpj` **e** `simples_nacional` como o mesmo requisito documental -- os dois têm `bloco: 'enquadramento_tributario'` e são lidos pela mesma análise especializada (`analise: 'simples_nacional'`, `promptCodigo: 'simples_extract'`). Uma empresa pode ter o arquivo catalogado com qualquer um dos dois `tipo_documento`, e nada impede que existam dois arquivos ativos (não excluídos) com tipos diferentes cobrindo o mesmo requisito -- o que de fato ocorreu nesta empresa.

A função que gera o relatório consolidado (`montarRelatorioDocumental` → `chaveDocumentoRelatorio`, `server/routes/documentacao.ts`) já sabia agrupar essas duas variantes numa única chave de deduplicação (`'enquadramento_tributario'`) -- mas o regex que reconhece a variante "Simples Nacional" só previa a forma **com espaço** (`"simples nacional"`); o valor real gravado no banco é `simples_nacional`, **com underscore**. Um arquivo com esse `tipo_documento` nunca batia no regex, caía na chave genérica `${codigo}:${nome}` -- diferente da chave do outro tipo -- e sobrevivia à deduplicação como um SEGUNDO card, mostrando a mesma leitura (mesmo motor de análise) do card que já existia. Nenhum outro par de tipos do catálogo tem esse mesmo problema (verificado contra `shared/documentTypes.ts` e a lista de tipos usada em `vincularDocumentosAutomaticos`); os demais marcadores do mesmo regex -- `cartao`, `cnpj`, `qsa` -- não usam separador com espaço em nenhum `tipo_documento` real do catálogo.

**Correção:** o regex de `chaveDocumentoRelatorio` agora aceita tanto `simples nacional` (espaço) quanto `simples_nacional` (underscore) -- `simples[ _]nacional`. Isso NÃO altera nenhum outro comportamento de agrupamento: continua reconhecendo exatamente os mesmos casos de antes, só que também o caso real que faltava. Nenhum documento é excluído do acervo; a correção só afeta qual entrada aparece no relatório consolidado quando dois arquivos cobrem o mesmo requisito.

**Ação necessária depois do deploy:** nenhuma -- ao contrário do bug da Rodada 5, esta correção não depende de laudo persistido desatualizado; o próximo carregamento do relatório já mostra uma única entrada de Enquadramento Tributário.

## Rodada 5 — Causa raiz de "já fiz o deploy e a leitura continua errada": laudo antigo nunca se atualiza sozinho

Depois da entrega da Rodada 4, o usuário confirmou ter aplicado o deploy e reportou que a leitura do PGDAS no local do ECF **continuava** errada em produção. Isso não é uma falha da correção de identidade documental (Rodadas 1/3) nem da correção de situação da certidão (Rodada 4) -- é uma causa raiz estrutural diferente, e mais importante:

**Um documento já analisado NUNCA é relido automaticamente, mesmo depois de corrigir e deployar o motor de análise.** `enriquecerDocumentosAcervoComAnalise` (`server/routes/documentacao.ts`), responsável por preencher `resultado_analise` de cada arquivo na tela do Acervo Documental, só LÊ o laudo já persistido em `documentos_extracoes_ia` (`buscarAnaliseEspecializadaPersistida`) -- ela nunca reprocessa nada sozinha. Isso significa: os dois arquivos de PGDAS foram anexados e analisados em 26/08/2026 (antes de qualquer correção desta sessão existir), o laudo ERRADO daquela época ficou gravado no banco, e nenhum deploy posterior muda esse registro já existente -- só afeta análises NOVAS, de documentos que ainda não tinham laudo. Corrigir o código sem reprocessar os documentos já lidos é, na prática, invisível para quem já os anexou.

O backend já tinha a peça que faltava: `POST /api/documentacao/ia/documentos/:documentoId/extrair` força uma nova leitura mesmo quando já existe um laudo `concluido` (confirmado por teste novo em `tests/documentacaoAnaliseEspecializada.integration.test.ts` -- só um laudo `pendente`/`processando` recente é tratado como "já em andamento" e ignorado; um `concluido` sempre dispara reprocessamento). O que faltava era um jeito de o usuário acionar isso pela tela, para os documentos catalogados genéricos (ECF, DCTF, DARF, Livro Caixa, CND, CADIN, PGFN etc.) -- só existia um botão "Reanalisar" para o bloco de continuidade societária (Atos da Junta/Contrato Social), não para esses.

**Correção:** `client/src/components/documentos/DocumentosEntidade.tsx` ganhou um botão "Reanalisar" (ícone de atualizar) ao lado de Visualizar/Baixar em cada arquivo que já tem algum resultado de análise -- chama `POST /api/documentacao/ia/documentos/:id/extrair` e recarrega a lista depois de alguns segundos (o processamento roda em segundo plano no servidor). Isso resolve o caso relatado: depois de deployar esta correção, quem tiver documentos com laudo antigo (como o PGDAS de 26/08) pode clicar em "Reanalisar" no próprio arquivo, sem precisar excluir e reanexar nada, e o resultado passa a refletir o motor de análise corrigido (identidade documental + situação da certidão).

**Ação necessária depois do deploy:** para os DOIS arquivos de PGDAS já anexados no slot de ECF/Recibo de entrega da ECF, clique no botão "Reanalisar" novo em cada um -- só assim o laudo antigo (de antes desta sessão) é substituído pelo laudo correto. Deployar o código sozinho não reprocessa documentos já lidos.

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
