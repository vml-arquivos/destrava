# Diagnóstico Pré-Correção — Missão de Evolução do Acervo Documental

Data: 30/08/2026. Auditoria feita antes de qualquer alteração de código da Rodada 1, cobrindo os pontos pedidos na missão original (documentos, regime tributário, DARF, PGDAS, EFD, SCR/CCS/CCF/CENPROT/CADIN/PGFN/CND). Este arquivo é o registro histórico do que foi encontrado ANTES da primeira correção -- mantido sem reescrever o que já foi descoberto, para preservar o histórico de auditoria.

> **Nota de atualização (Rodada 3 — auditoria independente pré-commit):** uma auditoria independente feita sobre o resultado da Rodada 1 encontrou uma forma residual do bug do item 2 abaixo (a correção da Rodada 1 excluía regimes de família errada, mas ainda aceitava um documento de TIPO errado dentro da mesma família válida -- ex.: DCTFWeb confirmando Presumido no slot de ECF) e pediu a reversão do código DARF 8998 (mantido como "Real" no item 1 abaixo "por compatibilidade" -- decisão agora revertida). Ambos foram corrigidos na Rodada 3; ver `CHANGELOG_CORRECOES.md` (seção "Rodada 3") para o detalhamento completo, e `PENDENCIAS_REAIS.md` para o que ainda não foi feito. A lacuna do item 4 (EFD-Contribuições) ganhou um status explícito `ANALISE_ESPECIALIZADA_PENDENTE` na Rodada 3, sem implementar a leitura de M400/M800 em si (continua pendente, agora de forma visível em vez de silenciosa). Parte do item 5 (linha do tempo do regime, faturamento rolling 12 meses, cobertura de bureaus) foi implementada nas Rodadas 2 e 3 como infraestrutura aditiva testada -- ver `ARQUITETURA_DOCUMENTAL_FINAL.md`.

Este arquivo cobre o que foi auditado e corrigido nesta rodada. O diagnóstico mais amplo (SCR sem leitor especializado, CND/PGFN/CADIN sem regra de decisão sobre o texto, Pronampe/BNDES/Rural sem exigência automática, cadeia de 12 meses de arquivamentos, cláusula de assinatura conjunta/vedação de aval) já está registrado em `DIAGNOSTICO_MASTER_PROMPT_CREDITO.md`, entregue antes desta missão, e permanece válido — nenhum item dele foi corrigido nesta rodada além dos três abaixo, que são complementares.

## 1. Bug P0 confirmado: código de receita do DARF (5993 classificado como Presumido)

**Onde:** `server/services/extracaoDocumentalLocal.ts` (`CODIGO_RECEITA_DARF_PRESUMIDO`/`CODIGO_RECEITA_DARF_REAL`), repetido como texto no prompt de IA em `server/services/analiseDocumentalEspecializada.ts` (`promptSimples`), e em comentários (não-funcionais) em `server/routes/documentacao.ts` e `server/routes/documentos.ts`.

**O que estava errado:** o código de receita 5993 ("IRPJ — Lucro Real — Estimativa Mensal") estava classificado como Lucro Presumido. O código 5625 ("IRPJ — Lucro Arbitrado") não existia no catálogo — um DARF de empresa arbitrada nunca conseguia ter o regime identificado por essa via.

**Por que importa:** o regime tributário determina qual trilha documental é exigida a seguir (ECF/ECD/EFD para Real, ECF/Livro Caixa para Presumido). Classificar 5993 como Presumido fazia o sistema pedir o conjunto de documentos errado para uma empresa em Lucro Real — um erro que muda a conclusão da análise, exatamente a categoria de bug que a missão pede para eliminar.

**Confirmado no código, não hipótese:** havia inclusive um teste (`tests/regimeTributarioConsistencia.test.ts`) que codificava a expectativa errada (`'código 5993 (Lucro Presumido)'`), ou seja, o bug estava "protegido" por um teste que validava o comportamento incorreto.

## 2. Bug P0 confirmado: nome do slot de upload usado como prova da identidade do documento

**Onde:** `server/services/extracaoDocumentalLocal.ts`, função `parseComprovanteRegime` (usada para os tipos `ecf`, `dctf_mit`, `darf`, `livro_caixa`).

**O que estava errado:**
```ts
const marcadorDoTipo = marcadores[tipo]?.test(normalizado) === true; // contém "ECF"? "DARF"? etc.
const regimeDetectado = base.dados.regime_confirmado === true;        // ALGUM regime foi confirmado no texto?
const documentoCompativel = marcadorDoTipo || regimeDetectado;
```
`regime_confirmado` fica `true` sempre que o texto afirma QUALQUER regime — inclusive "Optante pelo Simples Nacional". Ou seja: um PGDAS-D (que existe justamente para confirmar que a empresa é Simples Nacional) anexado no slot de ECF passava a validação, porque `regimeDetectado` virava `true` mesmo sem nenhuma palavra de ECF no texto.

**Reprodução exata do caso descrito na missão:** empresa foi Simples Nacional até 31/12/2025; existe um PGDAS-D da competência 12/2025; esse PGDAS é anexado no slot de ECF. Antes da correção: `documento_compativel: true` — o sistema aceitava como se fosse a ECF pedida. Depois da correção (testada em `tests/regimeComprovante.test.ts`): `documento_compativel: false`, gerando o alerta `documento_catalogado_incompativel` ("O arquivo não foi reconhecido como ECF"), sem apagar o arquivo (ele continua no Acervo, disponível como evidência histórica do faturamento daquele mês).

**Por que importa:** é o bug central descrito na missão (seções 6, 10 e 42) — validar um documento como se ele comprovasse algo que ele não comprova é o tipo de falha silenciosa que pode aprovar ou orientar uma proposta de crédito com base em informação errada.

## 3. Ordem de consulta cadastral SCR → CCS → CCF: era bloqueante, virou recomendação (não bloqueante)

**Onde:** `server/routes/documentos.ts` (rota `POST /api/documentos/upload`) e `client/src/components/documentos/DocumentosEntidade.tsx`.

**O que estava acontecendo:** a função `assertOrdemConsultaCadastralPermitida` (regra de negócio correta em si: SCR antes de CCS, CCS antes de CCF) era chamada dentro da rota de upload e **rejeitava o upload com HTTP 423** quando a ordem não era respeitada. Isso contraria a mesma decisão de negócio já tomada nesta base para o resto do pipeline documental (CNPJ → QSA → Enquadramento → Atos da Junta): upload nunca pode ser tecnicamente bloqueado pela ordem de leitura, só a conclusão da análise.

**Correção:** a chamada que bloqueava o upload foi removida da rota (a função em si continua existindo e testada, disponível para relatar a pendência). No frontend, o aviso de ordem fora de sequência deixou de desabilitar o botão de anexar e passou a aparecer como aviso informativo (mesmo padrão visual já usado para os outros avisos de ordem recomendada).

## 4. Auditado e NÃO alterado: EFD-Contribuições (M400/M800)

A missão pede para auditar se M400/M800 são tratados incorretamente como "receita bruta total mensal" (quando na verdade representam receitas isentas/não alcançadas/alíquota zero/suspensão de PIS/COFINS). **Achado:** não existe, em nenhum lugar do código, nenhuma leitura de M400/M800 nem qualquer lógica que trate a EFD-Contribuições de forma específica — o documento está catalogado (`shared/documentTypes.ts`, tipo `efd_contribuicoes`) e listado como exigência para Presumido/Real/Arbitrado (`mapaDocumentalCreditoService.ts`), mas cai inteiramente no analisador genérico (`analisarDocumentoCatalogado`), que não pede nem interpreta registros M400/M800 — não há fórmula errada para corrigir, porque não há fórmula nenhuma.

**Decisão desta rodada:** não implementar um leitor de EFD-Contribuições sem antes ter a estrutura real dos registros validada com documento de referência — um leitor construído às pressas, sem essa validação, corre o risco de introduzir exatamente o tipo de erro silencioso que esta missão inteira busca eliminar (um número de receita bruta calculado errado, mas com aparência de confiável). Fica registrado como lacuna real e prioritária para a próxima rodada, com escopo já mapeado em `DIAGNOSTICO_MASTER_PROMPT_CREDITO.md`, item 3.6.

## 5. Escopo não coberto nesta rodada (registrado, não escondido)

A missão descreve uma arquitetura completa (linha temporal do regime tributário, faturamento em janela móvel de 12 meses cruzando regimes, matriz tipo-esperado × tipo-detectado com o vocabulário completo de status como `INCOMPATIVEL_COM_CAMPO`/`VALIDADO_HISTORICO`/`AINDA_NAO_EXIGIVEL`, cobertura de bureaus por evidência, motor de objeção/e-mail de defesa, catálogo único de documentos com teste de consistência banco/backend/frontend, 25 testes específicos, e ~10 relatórios). Nesta rodada, o que foi corrigido são os três bugs P0 mais concretos e verificáveis (itens 1-3 acima), com o mesmo padrão rigoroso de verificação (typecheck limpo, suíte completa passando, build com sucesso) usado nas rodadas anteriores. O restante da arquitetura pedida é real e vale a pena — é trabalho de várias rodadas adicionais para ser feito com a mesma segurança (zero regressão), não algo que pode ser implantado de forma confiável em uma única passada sem risco de introduzir os mesmos tipos de erro silencioso que a missão quer eliminar.
