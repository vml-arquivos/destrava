# Diagnóstico: Master System Prompt de Crédito x Código Atual

Data: 30/08/2026
Base comparada: `Master_System_Prompt_Credito.pdf` (STEP 1 a STEP 6) e a listagem complementar em 5 Blocos (Cadastral/Societário, Financeiro/Fiscal por regime, Linhas Subvencionadas, Compliance/Bureau, Sócios PF), confrontados com o código-fonte real do repositório (`destrava-main`).

Objetivo deste documento: dizer, regra por regra, **o que já existe, o que está incompleto e o que está totalmente ausente**, priorizando as regras que podem **mudar o resultado final da análise de crédito** (aprovação/reprovação), não apenas ajustes cosméticos. Nenhuma alteração de código foi feita neste momento — este é o diagnóstico solicitado, para orientar a próxima rodada de correções cirúrgicas.

---

## 1. Resumo executivo

O sistema já tem uma base sólida: catálogo de documentos amplo (`shared/documentTypes.ts`), sequência de leitura correta (CNPJ → QSA → Enquadramento → confirmação de regime → Atos da Junta → Contrato Social), indicadores financeiros mais completos que o próprio Master Prompt pede (EBITDA, ICSD, DSCR, liquidez corrente/seca, endividamento geral), e um gate crítico já implementado (situação cadastral não ativa bloqueia o avanço).

Porém, a análise de conteúdo dos documentos de **compliance e risco de crédito** (SCR/Bacen, CND/PGFN/CADIN, CRF-FGTS) está incompleta de um jeito específico e perigoso: **o documento é lido e arquivado, mas o texto extraído não é convertido em uma decisão automática**. Ou seja, o sistema sabe pedir o documento certo, mas não sabe interpretar sozinho "isto aqui reprova o crédito". Essa é a lacuna mais séria, porque é exatamente o tipo de regra que "muda totalmente a conclusão da análise" — e hoje ela depende 100% de um humano notar isso ao ler o PDF, sem nenhum alerta automático do sistema.

Resumo por bloco de risco:

| Bloco do Master Prompt | Situação |
|---|---|
| STEP 1 — Cadastral/Societário (CNPJ ativo, QSA, Atos da Junta) | Implementado e correto |
| STEP 1 — Cadeia de 12 meses de alterações contratuais | Ausente |
| STEP 1 — Cláusula "Assinatura Conjunta"/"Vedação de Aval" | Ausente |
| STEP 2 — Roteamento por regime (Simples x Presumido/Real) | Implementado e correto |
| STEP 2 — Extração específica de PGDAS-D/DEFIS/EFD-Contribuições | Parcial (documento é aceito, mas sem leitor especializado) |
| STEP 2 — EBITDA/Liquidez/Capital de giro | Implementado (mais completo que o pedido) |
| STEP 3 — Documentos condicionais por produto (Pronampe/BNDES/Rural) | Parcial (catálogo existe, mas não é regra de bloqueio automática) |
| STEP 4 — CND/PGFN "Positiva" x "Negativa"/"Positiva com efeitos de Negativa" | Ausente como regra de decisão |
| STEP 4 — CRF-FGTS regular x irregular | Ausente como regra de decisão |
| STEP 4 — CADIN com restrição | Ausente como regra de decisão |
| STEP 5 — SCR Bacen PJ: "Prejuízo" e "Dívida > 2,5x EBITDA" | Ausente |
| STEP 5 — SCR Bacen PF: rebaixar rating PJ por inadimplência do sócio | Ausente |
| STEP 6 — Gerador de e-mail de defesa técnica/objeção | Ausente |

---

## 2. O que já está correto e não deve ser tocado

Confirmado no código, sem necessidade de mudança:

**Sequência documental (STEP 1/2).** A ordem Cartão CNPJ → QSA → Enquadramento Tributário → (se não optante do Simples, exigir ECF/DCTF/DARF/Livro Caixa antes de liberar) → Atos da Junta Comercial → Contrato Social/Alteração está corretamente implementada em `server/routes/documentacao.ts` (função que monta `bloqueios`/`avisos` da Fase 1, por volta da linha 1900) e reforçada no frontend (`DocumentosEntidade.tsx`).

**Gate de situação cadastral (STEP 1).** A regra "se `situacao_cadastral != ATIVA` então bloqueia" já existe e é tratada como crítica em vários pontos: `server/routes/documentacao.ts:1909-1911` (bloqueio da Fase 1), `server/services/esteiraCreditoService.ts:133` (`critico: true`), e `server/services/relatorioTecnicoEmpresaService.ts:336` ("Bloqueia proposta bancária"). Isso já cobre o STOP_LOSS do Master Prompt para o CNPJ.

**Indicadores financeiros (STEP 2).** `server/services/indicadoresFinanceiros.ts` já calcula EBITDA (com fallback via Lucro Operacional + Depreciação + Amortização quando o documento não traz o EBITDA pronto), margem EBITDA, DSCR, ICSD, dívida líquida/EBITDA, liquidez corrente, liquidez seca, capital de giro líquido, endividamento geral e perfil da dívida. Isso é mais completo do que o Master Prompt pede — nenhuma ação necessária aqui, apenas confirmar que esses indicadores realmente entram na decisão final (ver seção 4).

**Catálogo de documentos (Blocos 1-5).** `shared/documentTypes.ts` já cadastra todos os tipos citados na listagem do usuário: CND/PGFN/CADIN (federal, estadual, municipal), CRF-FGTS, CNDT, SCR/rating Bacen (PJ e PF), PGDAS-D, DEFIS, e os documentos de sócios PF (RG/CNH, comprovante de residência, certidão de estado civil). Ou seja, **o problema não é falta de documento no catálogo** — é falta de regra de decisão sobre o conteúdo desses documentos, como detalhado abaixo.

**Roteiro de produtos de crédito (STEP 3).** `server/services/mapaDocumentalCreditoService.ts` já tem um catálogo de operações (capital de giro, investimento, Pronampe, BNDES/Finame, crédito rural, comércio exterior etc.) com documentos adicionais recomendados para cada uma — inclusive mais detalhado que o Master Prompt (ex.: PRONAMPE via Banco do Brasil vs. CAIXA como perfis distintos). O que falta é a parte de **exigir automaticamente** esses documentos quando a operação é selecionada (ver item 3.3 abaixo).

---

## 3. Lacunas identificadas (por ordem de risco para a decisão de crédito)

### 3.1 SCR Bacen (PJ e PF) não tem leitor especializado — RISCO MÁXIMO

O Master Prompt define regras de decisão explícitas sobre o Relatório SCR:

- "Se 'Prejuízo' > 0 → STOP LOSS."
- "Se Dívida 'A Vencer' + Novo Limite > 2,5x EBITDA → REPROVAR."
- SCR do sócio PF: "Rebaixar Rating PJ se PF estiver inadimplente."

No código, `rating_bacen_cnpj`, `scr_cnpj`, `relatorio_scr`, `rating_bacen_cpf` e `scr_cpf` estão catalogados (`shared/documentTypes.ts`) com `analise: 'scr'` e `promptCodigo: 'scr_extract'`. Só que **não existe nenhuma função `analisarSCR` em `server/services/analiseDocumentalEspecializada.ts`** — a lista completa de analisadores especializados é: `analisarQSA`, `analisarSimplesNacional`, `analisarAtosJuntaComercial`, `analisarFaturamento`, `analisarComprovanteResidencia`, `analisarDocumentoCatalogado` (genérico), `analisarExtratoBancario`, `analisarContratoComAtosJunta`. Nenhum trata SCR.

Isso significa que, na prática, `scr_extract` nunca é chamado como prompt code registrado de forma específica — o tipo cai no laço genérico de `ANALISE_ESPECIALIZADA_POR_TIPO` (`server/routes/documentacao.ts:3123-3128`) e é processado por `analisarDocumentoCatalogado`, que:

1. Usa um prompt genérico (`promptDocumentoCatalogado`) que só pede campos básicos (CNPJ, CPF, razão social, valores financeiros, validade, situação) — **não pede "prejuízo", não pede "dívida a vencer", não pede rating**.
2. Tenta primeiro uma extração local determinística (`extrairDocumentoLocal`) usando o tipo `'contrato_social_alteracao'` como modelo de leitura (porque SCR não está entre os poucos tipos com modelo próprio: `ecf`, `dctf_mit`, `darf`, `livro_caixa`) — ou seja, o extrator local tenta ler um relatório SCR como se fosse um contrato social, o que tende a falhar e cair para o Gemini.
3. Mesmo quando o Gemini lê o documento, o resultado normalizado (`normalizarDocumentoCatalogado`) **não tem nenhuma regra que transforme "prejuízo > 0" ou "dívida/EBITDA > 2,5x" em um bloqueio**. Só gera alertas genéricos de baixa confiança ou incompatibilidade de documento.

**Impacto:** hoje, uma empresa com prejuízo declarado no SCR ou endividamento acima de 2,5x o EBITDA pode passar pela análise documental sem nenhum alerta automático — o único jeito de isso ser pego é um humano abrir o PDF e notar. Essa é exatamente a categoria de regra que "muda totalmente a conclusão", como o usuário descreveu.

**Recomendação:** criar `analisarSCR(empresaId, arquivoId)` em `analiseDocumentalEspecializada.ts`, com prompt dedicado pedindo explicitamente: resultado (lucro/prejuízo), dívida a vencer, dívida vencida, limite de crédito solicitado, rating Bacen. Adicionar validação determinística que aplica as duas regras do Master Prompt como bloqueios críticos (usando o EBITDA já calculado por `indicadoresFinanceiros.ts`). Para o SCR de PF, adicionar a checagem de inadimplência do sócio e, quando positiva, sinalizar rebaixamento do rating da PJ na Fase de compliance.

### 3.2 CND Federal/PGFN, CADIN e CRF-FGTS: documento lido, mas texto nunca vira decisão

O Master Prompt é literal aqui:

- CND/PGFN: `CONTAINS "Positiva com efeitos de Negativa" OU "Negativa" → APROVADO`; `CONTAINS "Positiva" (sozinha) → STOP_LOSS`.
- CRF-FGTS: `situacao == "REGULAR" E validade >= HOJE → APROVADO`.
- CADIN: `restricoes > 0 → REPROVADO` (linhas públicas/subsidiadas).

No código, `cnd_rfb_cnpj`, `pgfn_cnpj`, `cadin_cnpj`, `crf_fgts`, `cndt`, `cnd_estadual`, `cnd_municipal` (e as versões `_cpf` para sócios) estão todos catalogados com `analise` e `promptCodigo` próprios (`cnd_cpend_extract`, `crf_fgts_extract`, `cndt_extract` etc. — ver `shared/documentTypes.ts:91-107`). Só que, igual ao caso do SCR, **nenhum desses `promptCodigo` tem uma função especializada correspondente**: eles caem no mesmo laço genérico e são tratados por `analisarDocumentoCatalogado`, sem nenhuma leitura de "Positiva" vs. "Negativa" vs. "Positiva com efeitos de Negativa" no texto, e sem contagem de restrições do CADIN.

**Impacto:** uma CND Federal com status "Positiva" (dívida ativa, sem suspensão) — que segundo o próprio texto normativo é motivo de recusa — pode ser arquivada como "documento anexado e lido" sem nenhum bloqueio, porque o sistema nunca chega a comparar o texto extraído com essas três frases-chave.

**Recomendação:** criar validadores determinísticos (não precisam de IA para isso — é comparação de texto) que rodam sobre o texto/campos já extraídos: `validarCndPgfn`, `validarCrfFgts`, `validarCadin`. Podem reaproveitar o mesmo padrão de `validarAtosJuntaExtraidos`/`validarQsaExtraida` (retornam `AlertaDocumental[]` com severidade `critica` quando a regra bate). Isso é uma correção cirúrgica: não exige mudar o catálogo, só adicionar 3 funções pequenas e plugá-las em `executarAnaliseDocumentalEspecializada`.

### 3.3 Documentos condicionais por produto (Pronampe/BNDES/Rural) não bloqueiam nada

O Master Prompt trata isso como regra de roteamento: se o produto escolhido é PRONAMPE, BNDES ou linha Agrícola, documentos específicos passam a ser obrigatórios (Hash Code e-CAC, Declaração de Porte, Carta Consulta + 3 Orçamentos, CAR/CCIR/ITR/matrícula rural sem ônus).

No código, `server/services/mapaDocumentalCreditoService.ts` tem esse catálogo pronto e até mais rico. Mas ele só é consumido em `server/routes/coletaDocumentos.ts` e `server/routes/documentacao.ts` como **referência informativa** (o que aparece na tela como "documentos recomendados para esta operação") — não encontrei nenhum uso desse serviço em `esteiraCreditoService.ts` (pontuação/bloqueios da esteira) nem em `propostaBancariaService.ts` (geração da proposta bancária). Ou seja: hoje, escolher "PRONAMPE" como produto **não torna** a Declaração de Porte ou o Hash Code e-CAC obrigatórios de fato — eles aparecem como sugestão, mas o dossiê pode ser considerado apto sem eles.

**Impacto:** menor que os itens 3.1 e 3.2 (não é uma reprovação indevida, é uma aprovação que pode avançar sem documento específico da linha escolhida), mas ainda é uma lacuna real quando o produto final é Pronampe/BNDES/Rural.

**Recomendação:** quando a empresa tiver uma operação/produto selecionado, cruzar `mapaDocumentalCreditoService`'s `documentos_adicionais` daquela operação com os documentos efetivamente anexados, e gerar bloqueios (não apenas avisos) para os itens marcados como obrigatórios pela linha.

### 3.4 Cadeia de 12 meses de arquivamentos societários — ausente

O Master Prompt pede: calcular meses desde o último arquivamento na Junta; se `< 12`, exigir a cadeia de alterações anteriores até completar 12 meses de histórico documentado.

O código já tem uma peça importante disso: `validarAtosJuntaExtraidos` (`analiseDocumentalEspecializada.ts:755-813`) lê `historico_arquivamentos` e sinaliza quando a alteração mais recente foi há menos de 30 dias. Mas não há o cálculo específico "há quantos meses foi o último arquivamento" nem a exigência de completar a cadeia até 12 meses quando esse número for menor que 12.

**Recomendação:** estender `validarAtosJuntaExtraidos` para calcular `mesesDesdeUltimoArquivamento` a partir de `historico_arquivamentos` (ou `data_registro` quando não há histórico completo) e, quando `< 12`, gerar um aviso/pendência pedindo os atos anteriores que completem a janela de 12 meses — mesmo padrão de pendência não bloqueante já usado neste projeto (compatível com a decisão de "nunca bloquear upload, só sinalizar").

### 3.5 Cláusula "Assinatura Conjunta"/"Vedação de Aval" no Contrato Social — ausente

O Master Prompt pede uma busca textual (NLP simples) no contrato social por cláusulas de assinatura conjunta obrigatória ou vedação de avais/fianças pelos sócios. Não encontrei nenhuma menção a isso em `validarContratoComAtosJunta` nem em qualquer outro validador (`grep` por "assinatura conjunta" e "vedação de aval" não retornou nenhum resultado no projeto inteiro).

**Impacto:** é uma regra que pode afetar diretamente a viabilidade de operações que dependem de aval dos sócios (Pronampe, por exemplo, quase sempre exige aval) — se o contrato vedar expressamente o aval, a operação pode não ser viável do jeito planejado, e hoje nada no sistema chama atenção para isso.

**Recomendação:** adicionar, dentro de `analisarContratoComAtosJunta`, uma busca por expressões-chave no texto extraído do contrato (ex.: "assinatura conjunta", "em conjunto", "vedado", "vedação", "aval", "fiança") e, quando encontradas, gerar um aviso informativo direcionando para revisão humana — não precisa ser um bloqueio automático, já que interpretação de cláusula contratual exige leitura humana da frase completa, mas hoje isso nem chega a ser sinalizado.

### 3.6 PGDAS-D, DEFIS e EFD-Contribuições sem leitor especializado

O Master Prompt pede extração específica: PGDAS-D → "Receita Bruta do Mês" (para anualizar e medir variação mensal); DEFIS → receita anual consolidada cruzada com a distribuição de lucros aos sócios; EFD-Contribuições → "Receita Bruta" das linhas M400/M800, mês a mês, últimos 12 meses.

No código, `pgdas` e `defis` estão catalogados (`server/services/regrasDocumentaisCredito.ts:254,257`) como documentos obrigatórios condicionados ao regime Simples Nacional, mas **não existe nenhuma função `analisarPGDAS`/`analisarDEFIS`** — caem no mesmo fallback genérico do item 3.1/3.2. EFD-Contribuições não aparece em lugar nenhum do código (nem catálogo, nem analisador) — é o único documento citado explicitamente pelo Master Prompt que está totalmente ausente do sistema.

**Impacto:** médio — o Extrato Bancário PJ (`analisarExtratoBancario`) já cobre parcialmente a validação cruzada de faturamento para o Simples Nacional (compara volume de crédito em conta com o faturamento declarado). Mas para empresas em Lucro Presumido/Real, não há hoje nenhuma leitura estruturada da receita bruta mensal via EFD-Contribuições — a análise financeira depende do Balanço/DRE, que é anual/menos granular.

**Recomendação:** dentro do orçamento de "correção cirúrgica", priorizar primeiro os itens 3.1 e 3.2 (que mudam decisão de aprovação/reprovação). PGDAS/DEFIS/EFD podem entrar numa segunda rodada como analisadores especializados seguindo o mesmo padrão de `analisarFaturamento`.

### 3.7 Motor de objeção / e-mail de defesa técnica (STEP 6) — totalmente ausente

Não encontrei nenhum código relacionado à geração automática de um e-mail/modelo de defesa técnica citando KYC (Bacen 3.978) e conformidade fiscal (RFB 2.004) para quando um analista bancário pedir documento já coberto por ECF/DCTF/EFD/PGDAS.

**Impacto:** é uma funcionalidade nova, não uma regra de decisão de crédito — não muda aprovação/reprovação, é uma ferramenta de produtividade da equipe comercial/analista. Prioridade mais baixa que os itens 3.1-3.6.

**Recomendação:** tratar como feature nova a ser desenhada separadamente (template de e-mail + lógica de "quais documentos já cobrem qual exigência"), fora do escopo de correção cirúrgica de regras de crédito.

---

## 4. Ponto de atenção estrutural: onde as novas regras devem ser plugadas

Todas as lacunas 3.1 a 3.5 têm o mesmo formato de correção no código, o que é uma boa notícia para manter tudo "cirúrgico e objetivo":

1. Cada documento (SCR, CND, CADIN, CRF, contrato social) já é lido e vira um registro em `documentos_extracoes_ia` com campos extraídos.
2. O ponto certo para acrescentar a regra de decisão é o mesmo padrão que já existe para QSA e Atos da Junta: uma função `validarXxxExtraido(...)` que roda **depois** da extração e devolve `AlertaDocumental[]`, com `severidade: 'critica'` para os casos de STOP_LOSS/REPROVAR.
3. Esses alertas críticos já sabem virar bloqueio visível: o padrão usado em `server/routes/documentacao.ts` (`addBloqueio(...)`) e em `esteiraCreditoService.ts`/`propostaBancariaService.ts` (arrays de `bloqueios` com `critico: true`) é exatamente o mesmo em todo o projeto. Ou seja, uma vez que a regra de decisão exista, ligá-la ao "isso impede o dossiê de ficar apto" é uma mudança pequena e já teria repetição do padrão existente — nenhuma arquitetura nova é necessária.

Isso significa que a lacuna real não é estrutural (o sistema já sabe fazer "ler documento → gerar alerta → bloquear dossiê" muito bem, como prova a regra de regime tributário e a de situação cadastral) — a lacuna é que **os leitores especializados de SCR/CND/CADIN/CRF nunca foram escritos**, então não existe alerta para virar bloqueio.

---

## 5. Recomendação de prioridade para a próxima rodada

Ordem sugerida, da regra que mais "muda a conclusão da análise" para a que menos muda:

1. **SCR Bacen PJ** — "Prejuízo > 0" e "Dívida > 2,5x EBITDA" (item 3.1). Maior risco: pode aprovar operação que deveria ser recusada.
2. **CND Federal/PGFN e CADIN** — "Positiva" isolada deveria travar (item 3.2). Mesmo risco de aprovar indevidamente.
3. **CRF-FGTS** — regra mais simples (regular/irregular + validade), mesmo padrão do item 2.
4. **SCR Bacen PF (sócios)** — rebaixar rating da PJ por inadimplência pessoal (item 3.1, parte PF).
5. **Documentos condicionais por produto** (Pronampe/BNDES/Rural) — vira bloqueio, não só sugestão (item 3.3).
6. **Cadeia de 12 meses de arquivamentos** e **cláusula de assinatura conjunta/vedação de aval** (itens 3.4 e 3.5) — pendências informativas, sem necessidade de bloqueio automático.
7. **PGDAS/DEFIS/EFD-Contribuições** (item 3.6) — analisadores especializados, complementando o que o Extrato Bancário já cobre parcialmente.
8. **Motor de objeção/e-mail de defesa** (item 3.7) — feature nova, sem urgência de risco de crédito.

Nenhum código foi alterado neste diagnóstico. Assim que a prioridade acima for confirmada, a implementação segue o mesmo fluxo já usado nas rodadas anteriores: edição direta, `tsc --noEmit` + suíte completa de testes + build, e entrega do repositório revisado.
