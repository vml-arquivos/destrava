# Pendências Reais — 30/08/2026 (Rodada 3 — final pré-commit)

Lista honesta do que a missão pediu e NÃO foi implementado nesta sessão, com a razão concreta de cada omissão. Nada aqui está descartado por "fora de escopo" sem justificativa -- cada item abaixo é trabalho real, mapeado, que exige mais que uma correção cirúrgica para ser feito com segurança.

## 1. Vocabulário completo de status documentais como enum central

A missão pede doze status (`PENDENTE`, `VALIDADO`, `VALIDADO_COM_ALERTA`, `VALIDADO_HISTORICO`, `INCOMPATIVEL_COM_CAMPO`, `NAO_APLICAVEL`, `NAO_APLICAVEL_AO_REGIME`, `FORA_DA_JANELA_ATUAL`, `AINDA_NAO_EXIGIVEL`, `SATISFEITO_POR_DOCUMENTO_EQUIVALENTE`, `REVISAO_HUMANA`, `REPROVADO_DOCUMENTALMENTE`) usados de forma consistente em todo o sistema. Hoje, cada parte do código tem seu próprio vocabulário pontual (`documento_compativel: boolean`, `regime_confirmado: boolean`, `status_analise: 'ANALISE_ESPECIALIZADA_PENDENTE'`, os `codigo`s de alerta como `regime_tributario_codigo_nao_mapeado`). Unificar isso num enum central exigiria: (a) decidir, documento por documento, qual status granular se aplica a cada combinação de estado hoje representada por booleans espalhados; (b) atualizar toda a API que devolve esses campos para o frontend; (c) atualizar o frontend (`DocumentosEntidade.tsx` e outras telas) para consumir o novo vocabulário sem quebrar a experiência atual; (d) decidir se e como persistir esse status no banco (nova coluna em `documentos_arquivos`? tabela derivada?). É trabalho de arquitetura de várias rodadas, não uma correção cirúrgica -- implementá-lo às pressas nesta rodada arriscaria exatamente o tipo de regressão silenciosa que esta missão inteira busca eliminar.

**O que já existe, pontualmente, como sementes desse vocabulário:** `ANALISE_ESPECIALIZADA_PENDENTE` (EFD-Contribuições), `REVISAO_HUMANA`/`CODIGO_NAO_MAPEADO` (alerta do DARF 8998), `SATISFEITO`/`CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO`/`CERTIDAO_POSITIVA`/`NAO_APLICAVEL`/`PENDENTE` (cobertura de bureau, `coberturaEvidenciaBureauService.ts`). Uma futura unificação pode partir daqui em vez de do zero.

## 2. Integração automática das capacidades novas da Rodada 3 aos fluxos de análise existentes

`registrarPeriodoRegime` (Rodada 2), `registrarFaturamentoCompetencia` e `registrarCoberturaEvidencia` (Rodada 3) são funções prontas, testadas e com rota de leitura -- mas nenhuma delas é chamada automaticamente quando um documento é analisado hoje (`analisarSimplesNacional`, `analisarDocumentoCatalogado` etc.). Ou seja: a infraestrutura de gravação existe, mas hoje só é populada se alguém chamar essas funções manualmente (ex.: via script ou futura chamada explícita). Conectar isso ao pipeline de análise real exige decidir, para cada tipo de documento, QUAL requisito/competência/período ele evidencia e QUANTA confiança atribuir -- uma decisão de produto e não só de código, que merece revisão dedicada em vez de ser assumida nesta rodada.

## 3. Classificador de tipo de comprovante de regime cobre só 4 tipos

`detectarTipoComprovanteRegime` reconhece `ecf`, `dctf_mit`, `darf`, `livro_caixa` -- os tipos que a missão pediu explicitamente na matriz cruzada (seção 47). Os demais tipos documentais do catálogo (CND, CADIN, CRF, SCR, PGDAS, DEFIS) ainda não têm um classificador de identidade independente do slot equivalente -- continuam usando a checagem de compatibilidade genérica de `normalizarDocumentoCatalogado` (`bruto.documento_compativel === false`), que depende inteiramente do que a IA/OCR retornou, sem uma segunda camada determinística de verificação de tipo real. Extender o classificador para esses tipos é viável, mas cada um tem marcadores textuais próprios que precisam ser levantados com cuidado (o mesmo processo usado para os 4 tipos desta rodada) para não introduzir falsos negativos.

## 4. EFD-Contribuições: leitura especializada de M400/M800 continua não implementada

A Rodada 3 tornou a limitação EXPLÍCITA (`ANALISE_ESPECIALIZADA_PENDENTE`), mas não implementou a leitura em si. Construir essa leitura exige validar a estrutura real dos registros M400/M800 com um documento de referência real -- um leitor construído sem essa validação arrisca introduzir exatamente o tipo de erro silencioso (um número de receita bruta calculado errado, mas com aparência de confiável) que esta missão busca eliminar. Prioridade real para a próxima rodada, com escopo mapeado em `DIAGNOSTICO_MASTER_PROMPT_CREDITO.md`, item 3.6.

## 5. `efd_icms_ipi` não foi tocado

A EFD ICMS/IPI é uma obrigação diferente (ICMS/IPI, não PIS/COFINS) e não foi mencionada pela missão desta rodada -- deliberadamente fora do escopo do item 6 acima (EFD-Contribuições). Se a mesma limitação se aplicar a ela, precisa de uma auditoria própria.

## 6. Motor de objeção / e-mail de defesa técnica

Mencionado na missão original (Rodada 1) como parte da arquitetura completa; não iniciado em nenhuma das três rodadas desta sessão. Nenhum código relacionado existe hoje no repositório para servir de base.

## 7. Catálogo único com teste de consistência banco/backend/frontend (visão completa)

`tests/catalogoDarfConsistencia.test.ts` (Rodada 3) cobre a consistência entre o catálogo de código de receita do DARF e o prompt da IA -- um caso concreto e de alto valor (é a causa raiz dos dois bugs de regime corrigidos nesta sessão). `tests/tiposDocumentoCatalogo.test.ts` (pré-existente) cobre a consistência entre o catálogo de tipos documentais e a whitelist de upload. Uma consistência mais ampla -- cruzando `shared/documentTypes.ts`, toda constraint de banco relacionada a tipo de documento, e todo componente de frontend que lista tipos documentais -- não foi construída; os dois testes existentes cobrem os pontos de maior risco já identificados nesta sessão, não a superfície completa.

## 8. Bureaus: classificador textual cobre os marcadores mais comuns, não uma extração estruturada

`detectarRequisitosCobertosPeloTexto` reconhece os requisitos pela presença de palavras/siglas no texto (SCR, CCS, CCF, CENPROT, CADIN, PGFN, CND federal, CNDT, Situação Fiscal, Serasa) -- não faz uma extração estruturada de campos (número do relatório, data de emissão, órgão). É suficiente para o propósito desta rodada (provar que um documento cobre múltiplos requisitos), mas não substitui uma leitura completa de cada tipo de bureau.

---

Nenhum item desta lista foi omitido por conveniência: cada um está aqui porque implementá-lo com segurança (zero regressão, sem adivinhar dado sensível para decisão de crédito) exige mais do que esta rodada de correção cirúrgica comporta.
