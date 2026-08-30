# Plano de leitura documental — o que cada documento precisa ter, o que a IA lê, e o que fazer quando não bate

Este documento registra, de forma verificável no código (não é uma proposta — é o que o sistema já faz, mais o que foi ajustado nesta rodada), a regra de leitura de cada documento do dossiê de crédito empresarial: o que precisa ser extraído, o que conta como "correto", e a estratégia quando a leitura não confere.

## Princípio geral (regra de negócio fixada nesta rodada, 2026-08-30)

**O upload de um documento nunca é bloqueado.** O usuário pode anexar qualquer documento, em qualquer ordem, a qualquer momento. O que muda quando um documento falta, está fora da ordem recomendada, ou é lido com alguma inconsistência é:

1. Aparece uma **pendência** — um indicador compacto (ícone de informação, badge "Ação necessária"/"Pendência"), nunca um bloco de texto permanente ocupando a tela — que, ao ser clicado, explica o que é e como resolver.
2. A IA sempre analisa o que foi anexado e **sempre avisa** o que falta ou o que está inconsistente — isso nunca é silencioso.
3. O que fica de fato indisponível até a pendência ser resolvida é **o dossiê completo para a proposta de crédito** (os flags `apto_para_avancar` de cada etapa, e a geração/consolidação do laudo final) — nunca o campo de anexo em si.

Essa é a diferença entre "ordem recomendada de leitura" (o que este documento pede: CNPJ → QSA → Enquadramento → confirmação de regime → Atos da Junta → Contrato Social/Alteração → demais documentos) e "bloqueio técnico de upload" (que deixou de existir para essa sequência nesta rodada — ver `CORRECAO_UPLOAD_NAO_BLOQUEIA_PIPELINE_2026-08-30.md` seção de código para o detalhe da mudança em `server/routes/documentos.ts`).

## Estratégia por severidade (já implementada em `AlertaDocumental`/`Pendencia`, `server/services/analiseDocumentalEspecializada.ts` e `server/services/regrasDocumentaisCredito.ts`)

Toda leitura de documento gera uma lista de alertas/pendências com um campo `severidade`. A estratégia de resposta do sistema é a mesma em todo o dossiê:

- **baixa** — aviso informativo. Não impede nada; aparece no indicador "Avisos" (popover, ver `IndicadorPendencia` em `DossieCreditoEmpresa.tsx`).
- **media** — pendência que pede atenção (ex.: titular do comprovante de endereço diferente do sócio, sem justificativa). Fica marcada como "Ação necessária"; não bloqueia o upload de outros documentos, mas impede o bloco/etapa correspondente de ficar `apto_para_avancar`.
- **alta** — pendência que precisa ser corrigida antes do dossiê ser considerado completo (documento incompatível, data fora do prazo, campo obrigatório não identificado). Mesma regra: some da tela quando resolvida, nunca trava o upload de outra coisa.
- **crítica** — inconsistência que indica risco real de erro material (ex.: CNPJ do faturamento não é o da empresa analisada, signatário não é administrador do QSA). Fica em destaque no checklist e é o tipo de pendência que mais provavelmente impede a proposta de crédito de avançar — mas, mesmo assim, a estratégia é sempre "peça o documento certo/corrigido", nunca "recuse o anexo que já foi enviado".

Em todos os casos, a resposta ao usuário sempre inclui, quando disponível, uma `recomendacao` — o que fazer para resolver (ex.: "Reclassificar ou anexar a relação de faturamento correta.", "Gerar e assinar novamente a relação após o fechamento da última competência."). Isso é o "botãozinho de informações" pedido: o alerta é curto, e a recomendação é a explicação de como resolver, dentro do mesmo popover.

## A sequência principal, documento a documento

### 1. Cartão CNPJ (`cartao_cnpj`)
- **O que é lido** (`analiseCnpjReceitaCartao.ts`, motor Gemini 2.5 Flash/Pro com fallback): CNPJ, razão social, data de abertura, CNAE principal, natureza jurídica, porte, situação cadastral, matriz/filial, endereço.
- **O que conta como correto**: documento legível, CNPJ e razão social batem com o cadastro da empresa (`empresas.cnpj`/`razao_social`), situação cadastral ativa, emissão com no máximo 30 dias (`data_emissao_documento` + regra em `server/routes/documentos.ts`, linha ~823-841 — depois de 30 dias vira `status='recusado'`/`exige_revisao_humana=true`, mas o registro continua existindo e pode ser substituído por um anexo novo a qualquer momento).
- **Se a leitura não bate**: pendência "Falha na leitura" (arquivo ilegível) ou "Revisão necessária" (dados não batem) no próprio card; a Etapa 1 não fica `apto_para_avancar` até um Cartão CNPJ válido e recente ser anexado.

### 2. QSA / Quadro societário (`qsa`)
- **O que é lido**: lista de sócios/administradores, CPF/CNPJ de cada um, percentual de participação, quem é administrador.
- **O que conta como correto**: pelo menos um administrador identificado, percentuais consistentes, nomes que batem com os sócios já cadastrados (ou permitem cadastro).
- **Se a leitura não bate**: pendência específica por sócio ausente/divergente; a Fase 1 permanece pendente.

### 3. Enquadramento tributário (`enquadramento_tributario_cnpj` / Simples Nacional)
- **O que é lido**: se a empresa é optante do Simples Nacional (vem primariamente da consulta de CNPJ/Receita Federal, `empresas.regime_tributario`; documento é reforço/confirmação).
- **Regra de sequência**: se optante do Simples → libera diretamente os Atos da Junta Comercial (Etapa 2). Se **não optante** → o regime efetivo (Lucro Presumido, Lucro Real ou Arbitrado) precisa ser confirmado por um dos documentos abaixo **antes** dos Atos da Junta serem considerados parte do dossiê completo (o campo de anexo dos Atos da Junta continua liberado, mas a pendência de regime aparece até ser resolvida — ver `regimeConfirmadoOuNaoAplicavel` em `server/routes/documentacao.ts`).
- **Documentos que confirmam o regime efetivo (qualquer um serve)**:
  - **ECF** (Escrituração Contábil Fiscal)
  - **DCTF/DCTFWeb**
  - **DARF** — o código de receita indica o regime (2089 = Lucro Presumido; 5993/3373 = Lucro Real; 5625 = Lucro Arbitrado), lido por `analisarSimplesNacional`/`regimeViaCodigoReceitaDarf` em `extracaoDocumentalLocal.ts`. Catálogo corrigido em 2026-08-30 (5993 estava classificado como Presumido por engano). O código 8998 não é confirmado na tabela oficial da RFB para IRPJ e nunca infere regime sozinho — fica sinalizado para revisão humana.
  - **Livro Caixa** (regime de caixa, tipicamente MEI/Simples em situações específicas).
- **Se a leitura não bate**: pendência "Regime a confirmar" (compacta, popover "Ação necessária"); o card de Enquadramento não repete mais esse aviso internamente (era redundante — corrigido nesta rodada), o aviso único vive no bloco dedicado logo abaixo da grade Cartão CNPJ/QSA/Enquadramento.

### 4. Atos da Junta Comercial (`atos_junta_comercial`)
- **O que é lido** (`analiseDocumentalEspecializada.ts`, prompt `atos_junta_extract`): tipo de ato (constituição, alteração, transformação), data de registro na Junta Comercial, administradores nomeados, capital social, objeto social.
- **O que conta como correto**: documento legível, data de registro coerente com a idade da empresa, administradores batendo com o QSA.
- **Se a leitura não bate**: pendências `atos_junta_falha_leitura` / `atos_junta_leitura_inconclusiva` / `atos_junta_arquivo_vazio` (ver `server/routes/documentacao.ts`, linhas ~1466-1500) — pedem novo anexo legível, sem impedir que o usuário já tenha anexado outros documentos em paralelo.
- **Ordem recomendada, não bloqueio**: o anexo dos Atos da Junta é sempre aceito, mesmo antes da Fase 1/confirmação de regime estarem completas (mudança desta rodada) — mas o dossiê só considera essa etapa `apto_para_avancar` depois que Fase 1 + regime (quando aplicável) estiverem resolvidos.

### 5. Contrato Social / Alteração Contratual (`contrato_social`, `alteracao_contratual`)
- **O que é lido** (`parseContratoSocialAlteracao` em `extracaoDocumentalLocal.ts`): data de registro, capital social, sócios e seus percentuais, objeto social, se é a via consolidada ou uma alteração pontual.
- **Regra de continuidade societária**: o sistema exige 12 meses de histórico comprovado (`validateTwelveMonthContractHistory` em `documentPipelineService.ts`) — soma o tempo entre o registro mais antigo aprovado e a data de referência; se `< 12 meses`, pede o Contrato Social original ou alteração anterior para completar o período (`InsufficientHistoricalPeriodException`).
- **Se a leitura não bate**: pendência de histórico insuficiente, com a recomendação explícita de qual documento anexar para completar os 12 meses. Novamente: o campo de anexo nunca fica desabilitado por causa disso.

### 6. Demais documentos (Faturamento, Comprovante de Residência, Regularidade Fiscal/Trabalhista, Crédito/SCR)

Esses documentos já têm motor de leitura e validação próprios, ativados automaticamente no upload (`TIPOS_COM_ANALISE_AUTOMATICA` em `server/routes/documentos.ts`) ou via análise específica (`analiseDocumentalService` em `analiseDocumentalEspecializada.ts`, `resolverRegrasDocumentais` em `regrasDocumentaisCredito.ts`). O padrão de leitura/validação/estratégia é o mesmo em todos:

| Documento | O que é lido | O que conta como correto | Estratégia se não bate |
|---|---|---|---|
| Faturamento 12 meses (`faturamento_12_meses`) | Meses de referência, CNPJ, assinatura do sócio-administrador e do contador, modalidade de assinatura | 12 meses terminando no último mês fechado; CNPJ bate com a empresa; ambas as assinaturas presentes e da mesma modalidade (manual ou eletrônica); signatário é administrador do QSA | Pendências específicas por campo (`faturamento_mes_ainda_nao_fechado`, `faturamento_cnpj_divergente` [crítica], `faturamento_signatario_nao_administrador` [crítica], etc.) — cada uma com `recomendacao` própria |
| Comprovante de Residência (`comprovante_residencia`) | Mês de referência, nome do titular | Validade máxima de 2 meses; titular bate com o sócio vinculado (ou há justificativa registrada) | Pendência de validade vencida ou titular divergente, com pedido de novo comprovante ou justificativa |
| CND/Regularidade (RFB, FGTS, Trabalhista, Estadual, Municipal, CADIN, PGFN) | Situação (regular/irregular), data de emissão/validade | Documento dentro da validade e com situação regular | Pendência "documento vencido"/"situação irregular", pede emissão atualizada |
| SCR/Rating BACEN, CCS, CCF (crédito) | Situação do tomador nas modalidades de crédito | Leitura íntegra, sem sinal de inadimplência não esperado | Segue a ordem obrigatória de leitura SCR → CCS → CCF (regra separada, já validada em `assertOrdemConsultaCadastralPermitida`, não alterada nesta rodada) |
| ECF/PGDAS/PGMEI/DEFIS/DASN-SIMEI (fiscal) | Regime, receita bruta declarada, período de apuração | Consistência com o enquadramento tributário identificado | Pendência de regime/receita divergente, pede documento do período correto |

Todos seguem a mesma filosofia de severidade e recomendação descrita na seção anterior — nenhum documento novo precisa de um motor de leitura do zero; o padrão (`AlertaDocumental { codigo, mensagem, severidade, recomendacao }`) já é genérico o suficiente para cobrir qualquer tipo do catálogo (`shared/documentTypes.ts`).

## O que foi alterado nesta rodada (2026-08-30) e por quê

1. **Upload nunca bloqueado por fase do pipeline**: removida a checagem em `server/routes/documentos.ts` que rejeitava (HTTP 423) o anexo de Atos da Junta/Contrato Social/Alteração quando a Fase 1 ou a confirmação de regime ainda não estavam completas. A função utilitária `assertUploadAllowed` (`server/services/documentPipelineService.ts`) continua existindo e testada — só deixou de ser chamada como bloqueio no upload. Coberto por um novo teste dedicado: `tests/uploadNaoBloqueadoPorFasePipeline.test.ts`.
2. **UX da pendência de regime tributário** (ver anexos anteriores desta série de correções): a caixa "Revisão necessária" some do card de Enquadramento Tributário quando já existe o bloco dedicado de pendência; "O que precisa ser resolvido"/"Avisos" viram indicadores compactos com popover ("Ação necessária"); o bloco de confirmação de regime passa a aparecer abaixo da grade Cartão CNPJ/QSA/Enquadramento, não acima.
3. **Correção incidental**: `tests/releaseTracking.test.ts` tinha uma asserção com escaping duplicado (`\\n` esperado como `\\\\n`) que sempre falhava, sem relação com o build real (o Dockerfile nunca rodou `pnpm test`). Corrigida a asserção para refletir o Dockerfile real e correto, sem alterar o Dockerfile.

Toda a suíte de testes (70 arquivos, 652 testes) passa, `tsc --noEmit` está limpo, e `pnpm run build` conclui com sucesso (bundle dentro do orçamento configurado).

## Fora do escopo desta rodada (decisão consciente)

A ordem obrigatória de leitura das consultas cadastrais (SCR → CCS → CCF, `assertOrdemConsultaCadastralPermitida`) **não foi alterada**. É uma regra de negócio diferente, testada e corrigida em uma rodada anterior especificamente para impedir a leitura fora de ordem desse conjunto (ver comentário no próprio arquivo de teste, `tests/ordemConsultaCadastral.test.ts`). Se a intenção for que ela também vire pendência informativa em vez de bloqueio técnico, isso deve ser pedido explicitamente, para não desfazer uma correção anterior sem confirmação.
