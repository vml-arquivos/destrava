# Pendências Reais — 31/08/2026 (Rodada 6 — Enquadramento Tributário duplicado no relatório)

Lista honesta do que a missão pediu e NÃO foi implementado nesta sessão, com a razão concreta de cada omissão. Nada aqui está descartado por "fora de escopo" sem justificativa -- cada item abaixo é trabalho real, mapeado, que exige mais que uma correção cirúrgica para ser feito com segurança.

## 1. Vocabulário completo de status documentais como enum central

A missão pede doze status (`PENDENTE`, `VALIDADO`, `VALIDADO_COM_ALERTA`, `VALIDADO_HISTORICO`, `INCOMPATIVEL_COM_CAMPO`, `NAO_APLICAVEL`, `NAO_APLICAVEL_AO_REGIME`, `FORA_DA_JANELA_ATUAL`, `AINDA_NAO_EXIGIVEL`, `SATISFEITO_POR_DOCUMENTO_EQUIVALENTE`, `REVISAO_HUMANA`, `REPROVADO_DOCUMENTALMENTE`) usados de forma consistente em todo o sistema. Hoje, cada parte do código tem seu próprio vocabulário pontual (`documento_compativel: boolean`, `regime_confirmado: boolean`, `status_analise: 'ANALISE_ESPECIALIZADA_PENDENTE'`, os `codigo`s de alerta como `regime_tributario_codigo_nao_mapeado`). Unificar isso num enum central exigiria: (a) decidir, documento por documento, qual status granular se aplica a cada combinação de estado hoje representada por booleans espalhados; (b) atualizar toda a API que devolve esses campos para o frontend; (c) atualizar o frontend (`DocumentosEntidade.tsx` e outras telas) para consumir o novo vocabulário sem quebrar a experiência atual; (d) decidir se e como persistir esse status no banco (nova coluna em `documentos_arquivos`? tabela derivada?). É trabalho de arquitetura de várias rodadas, não uma correção cirúrgica -- implementá-lo às pressas nesta rodada arriscaria exatamente o tipo de regressão silenciosa que esta missão inteira busca eliminar.

**O que já existe, pontualmente, como sementes desse vocabulário:** `ANALISE_ESPECIALIZADA_PENDENTE` (EFD-Contribuições), `REVISAO_HUMANA`/`CODIGO_NAO_MAPEADO` (alerta do DARF 8998), `SATISFEITO`/`CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO`/`CERTIDAO_POSITIVA`/`NAO_APLICAVEL`/`PENDENTE` (cobertura de bureau, `coberturaEvidenciaBureauService.ts`). Uma futura unificação pode partir daqui em vez de do zero.

## 2. Integração automática das capacidades novas da Rodada 3 aos fluxos de análise existentes

`registrarPeriodoRegime` (Rodada 2), `registrarFaturamentoCompetencia` e `registrarCoberturaEvidencia` (Rodada 3) são funções prontas, testadas e com rota de leitura -- mas nenhuma delas é chamada automaticamente quando um documento é analisado hoje (`analisarSimplesNacional`, `analisarDocumentoCatalogado` etc.). Ou seja: a infraestrutura de gravação existe, mas hoje só é populada se alguém chamar essas funções manualmente (ex.: via script ou futura chamada explícita). Conectar isso ao pipeline de análise real exige decidir, para cada tipo de documento, QUAL requisito/competência/período ele evidencia e QUANTA confiança atribuir -- uma decisão de produto e não só de código, que merece revisão dedicada em vez de ser assumida nesta rodada.

## 3. Classificador de tipo de comprovante de regime cobre só 4 tipos (e o novo `situacao_certidao` da Rodada 4 depende da IA, não é determinístico)

`detectarTipoComprovanteRegime` reconhece `ecf`, `dctf_mit`, `darf`, `livro_caixa` -- os tipos que a missão pediu explicitamente na matriz cruzada (seção 47). Os demais tipos documentais do catálogo (CND, CADIN, CRF, SCR, PGDAS, DEFIS) ainda não têm um classificador de identidade independente do slot equivalente -- continuam usando a checagem de compatibilidade genérica de `normalizarDocumentoCatalogado` (`bruto.documento_compativel === false`), que depende inteiramente do que a IA/OCR retornou, sem uma segunda camada determinística de verificação de tipo real. Extender o classificador para esses tipos é viável, mas cada um tem marcadores textuais próprios que precisam ser levantados com cuidado (o mesmo processo usado para os 4 tipos desta rodada) para não introduzir falsos negativos.

**Atualização Rodada 4:** para a categoria `cnd_cpend` (CND/CPEND Federal, PGFN, CADIN) especificamente, foi acrescentado um campo `situacao_certidao` exigido explicitamente no prompt da IA e convertido em alerta obrigatório (`certidao_situacao_positiva` / `certidao_situacao_nao_identificada`) sempre que o resultado não seja claramente negativo -- isso responde ao bug real encontrado (CADIN "incluído" tratado como válido). Essa correção NÃO é determinística: ela depende da IA extrair `situacao_certidao` corretamente, ao contrário do classificador local (`detectarTipoComprovanteRegime`) usado para ECF/DCTF/DARF/Livro Caixa, que lê o texto diretamente com regex e nunca depende de uma chamada externa. Construir um classificador determinístico equivalente para `cnd_cpend` exigiria ligar `extrairDocumentoLocal` a essa categoria (hoje ela pula direto para a IA, `usarExtracaoLocal = false`) SEM substituir a extração rica que a IA hoje devolve (razão social, número do documento, órgão emissor etc.) -- arriscado demais para fazer às pressas numa correção de urgência. Prioridade real para uma próxima rodada dedicada.

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

## 9. Relatório de Situação Fiscal (CNPJ/CPF): sem checagem de mérito dedicada

Documento real da empresa ZR CONSTRUCOES E REFORMAS CIVIS LTDA (CNPJ 49.366.887/0001-25), anexado no slot "Relatório de Situação Fiscal (CNPJ)", mostra parcelamento em atraso (3 parcelas) e débitos de PIS/COFINS em aberto -- uma situação fiscal claramente desfavorável. Esse tipo (`situacao_fiscal_cnpj`/`situacao_fiscal_cpf`) tem sua própria categoria de análise (`analise` distinta de `cnd_cpend`, não coberta pela correção da Rodada 4) e continua dependendo inteiramente da extração genérica da IA para os campos `situação`/`campos_comprovados`, sem nenhum alerta dedicado equivalente ao `certidao_situacao_positiva` criado para CND/CADIN/PGFN nesta rodada. Levantar os marcadores textuais próprios de um "Diagnóstico Fiscal na Receita Federal" (que é estruturalmente diferente de uma certidão negativa/positiva -- é uma lista de pendências de parcelamento e débito, não um resultado binário) exige o mesmo cuidado dedicado já aplicado aos outros tipos, e não uma extensão apressada da lógica de `situacao_certidao`.

## 10a. Botão "Reanalisar" novo não reprocessa em lote automaticamente

A Rodada 5 acrescentou um botão "Reanalisar" por arquivo nos documentos catalogados genéricos, mas ele é manual, um arquivo por vez -- não existe (ainda) uma ação em lote ("reanalisar todos os documentos desta empresa" ou "reanalisar todos os documentos já lidos antes de tal data"). Para uma base com muitas empresas já com documentos analisados por versões antigas do motor, isso significa clicar documento por documento. Uma rotina de reprocessamento em lote (varrer `documentos_extracoes_ia` com `status = 'concluido'` e comparar `prompt_versao` com a versão atual, chamando `/extrair` para cada um fora de horário de pico) é viável, mas é uma migração de dados operacional, não uma correção cirúrgica de UI -- fica como próximo passo natural se o volume de documentos com laudo desatualizado for grande.

## 10. Descompasso entre o código no GitHub e o que roda em produção

O print do campo "Enquadramento tributário" mostra `FONTE DA LEITURA:
local:reextract-v1` -- uma string que não existe em nenhuma versão deste
repositório, em nenhuma rodada desta sessão. Isso é evidência concreta de
que o site em produção (destravacredito.com) está rodando um código
diferente do que está hoje em `vml-arquivos/destrava` branch `main`. Esta
sessão nunca teve acesso de push/deploy (o usuário sempre aplicou os zips
manualmente via Coolify), então não é possível confirmar a partir daqui se
há um ajuste manual direto no servidor, uma branch diferente em produção,
ou uma versão desatualizada com nomenclatura antiga -- só recomendar que
isso seja verificado antes de assumir que o deploy do zip desta entrega vai
produzir exatamente o comportamento descrito nos changelogs desta sessão.

## 11. Duas observações do relatório da ZR CONSTRUÇÕES ainda não investigadas (podem ou não ser o mesmo bug já corrigido)

Ao ler o PDF real do relatório desta empresa para confirmar a correção do item acima (Enquadramento Tributário duplicado), duas outras coisas chamaram atenção e **não foram investigadas nesta rodada** -- citadas aqui por transparência, não por terem sido descartadas:

- **"atos da junta.pdf" (Validado) e "ATOS DA JUNTA.pdf" (Excluído) aparecem juntos na seção "1. Documentos anexados e analisados".** São dois arquivos DIFERENTES (um ativo, um excluído) do mesmo tipo -- ao contrário do bug corrigido nesta rodada, aqui o `tipo_documento` é idêntico nos dois casos, então a chave de deduplicação já é a mesma (`atos_junta_comercial`); o que não foi confirmado é se um documento com `status = 'excluido'` deveria sequer entrar na lista que alimenta essa seção do relatório (`documentosAnexados`, que hoje não filtra por status de exclusão antes de aplicar a deduplicação por pontuação). Não foi corrigido porque não há evidência de que seja um bug -- pode ser intencional (mostrar o histórico de tentativas) -- e mexer nisso sem confirmar a intenção correta arriscaria esconder informação que o usuário queira ver.
- **Possível contradição entre o card do Enquadramento Tributário (dados confiantes: Não Optante, confiança 90%) e a seção "4. Resultados consolidados por etapa → Identidade do CNPJ"**, que no mesmo relatório mostra "Observações: Não foram encontrados campos comprovados nem evidências suficientes" e "Pendências e bloqueios: Regime tributário não identificado. Sincronize os dados de CNPJ (Receita Federal) da empresa." Essas duas seções usam fontes de dados diferentes dentro do mesmo `dossie` (`identidade_cnpj.documentos_iniciais.enquadramento_tributario`, calculado por uma rotina de validação separada da Etapa 1, versus a leitura direta do arquivo usada no card da seção 1) -- não foi confirmado se é o mesmo tipo de dessincronia do bug corrigido nesta rodada ou uma causa raiz diferente, e não há reprodução construída ainda.

Ambos os pontos merecem uma rodada dedicada, com reprodução própria, em vez de uma correção apressada sobre uma leitura de PDF sem confirmação de código.

---

Nenhum item desta lista foi omitido por conveniência: cada um está aqui porque implementá-lo com segurança (zero regressão, sem adivinhar dado sensível para decisão de crédito) exige mais do que esta rodada de correção cirúrgica comporta.
