# Acervo Documental — Reestruturação Fase 2, validações temporais e multi-sócio — 12/08/2026

## Pedido original

A partir do print da tela "Documentação da Empresa" (Atos da Junta e Contrato Social
já anexados lado a lado) veio o pedido: o sistema deveria **pedir o próximo
documento**, não simplesmente exibir tudo já anexado de uma vez — "o sistema que vai
pedindo os documentos necessários para montar a estratégia". Isso foi aprofundado num
pacote de instruções bem maior, cobrindo: validação temporal de 12 meses dos Atos da
Junta (com loop de retrospecção), cruzamento Contrato Social × Atos da Junta, regras
de Faturamento Bruto, remoção do Enquadramento Tributário como anexo obrigatório,
ordem estrita SCR → CCS → CCF, correção de um bug de persistência do campo
"Observação", validade de 2 meses + titularidade do comprovante de endereço, e
expansão multi-sócio dos documentos pessoais.

Antes de implementar qualquer coisa, cada regra foi auditada contra o código real —
não só contra o changelog do pedido. Isso mudou bastante o escopo do trabalho: boa
parte do que foi pedido **já existia e já funcionava**; o esforço real foi noutro
lugar.

## O que já estava implementado (verificado, não alterado)

Rodar `npx vitest run` e ler o código antes de "corrigir" qualquer coisa evitou
retrabalho e evitou reescrever lógica que já estava correta:

- **12 meses dos Atos da Junta, com loop de retrospecção, dispensa MEI e alerta de
  "outro órgão"** — já implementado em `server/services/cadeiaSocietariaService.ts`
  (`calcularCadeiaComprovacaoSocietaria`) e orquestrado em `montarValidacaoSocietaria`
  (`server/routes/documentacao.ts`), com 6 testes em `tests/cadeiaSocietaria.test.ts`
  cobrindo exatamente os 5 cenários pedidos (último ato ≥12 meses; loop pedindo atos
  anteriores até cruzar o corte; todos os registros comprovados; dispensa MEI sem
  registro; alerta "outro órgão" sem MEI; alerta de tempo mínimo quando nenhum ato
  atinge 12 meses).
- **Cruzamento Contrato Social × Atos da Junta** (NIRE, data de registro, número do
  ato, CNPJ e sócios do QSA) — já implementado em `validarContratoComAtosJunta`
  (`server/services/analiseDocumentalEspecializada.ts:483-561`), chamado
  automaticamente sempre que um contrato/alteração é analisado junto dos Atos.
- **Faturamento Bruto** (assinatura posterior ao último mês faturado, paridade
  eletrônica/manual entre sócio-administrador e contador, CNPJ e sócio-administrador
  batendo com o QSA) — já implementado em `validarFaturamentoExtraido`
  (`server/services/regrasDocumentaisCredito.ts:56-133`).
- **Comprovante de endereço**: validade máxima de 2 meses e checagem de titularidade
  (aprovado se bate com o sócio vinculado, alerta se for terceiro) — já implementado
  em `validarComprovanteEnderecoExtraido` (mesmo arquivo, linhas 135-178).

## O que foi corrigido/implementado nesta sessão

### 1. BUGFIX — Observação "sumindo" ao sair e voltar ao perfil da empresa

**Causa raiz** (confirmada por rastreamento de código, não só suposição): o dado
**nunca foi perdido no banco**. O componente `DocumentosEntidade.tsx` reinicia,
a cada remontagem da tela, o sócio selecionado por padrão em cada campo "por sócio"
sempre para o primeiro sócio em ordem alfabética
(`client/src/components/documentos/DocumentosEntidade.tsx:410-418`, antes da
correção). Se a Observação tivesse sido digitada para outro sócio, o campo de texto
passava a ler a chave errada (`tipo::<id-do-sócio-A>` em vez de
`tipo::<id-do-sócio-B>`) e aparecia vazio — mesmo com o dado intacto no Postgres sob
a outra chave.

**Correção**: ao montar a tela, o sócio padrão de cada campo agora prioriza um sócio
que já tenha documento ou observação salva para aquele campo específico, só caindo no
primeiro da lista quando nenhum sócio tem nada gravado ainda. Sem mudança de schema,
sem mudança de API — só a lógica de seleção inicial no frontend.

### 2. Ordem obrigatória de leitura: SCR → CCS → CCF (CNPJ e CPF)

Antes, os três campos eram totalmente independentes — nada no backend impedia
anexar o CCF sem nunca ter anexado o SCR ou o CCS. O texto "Sequência de análise:
SCR, CCS e CCF" era só uma frase informativa na tela, sem nenhuma imposição de
código.

**Correção**: nova validação `assertOrdemConsultaCadastralPermitida` em
`server/routes/documentos.ts`, chamada dentro de `POST /api/documentos/upload` antes
de gravar o arquivo — bloqueia CCS sem SCR anexado e CCF sem CCS anexado, escopado
corretamente por empresa (CNPJ) ou por sócio (CPF). O frontend replica a mesma regra
(`ORDEM_CONSULTA_CADASTRAL` em `DocumentosEntidade.tsx`) para desabilitar o botão
"Anexar" e mostrar o motivo antes do usuário tentar — o backend continua sendo a
fonte de verdade. 7 testes novos em `tests/ordemConsultaCadastral.test.ts`.

### 3. Enquadramento Tributário deixa de exigir anexo físico

Confirmado no código: `montarEnquadramentoDados`/`avaliarProntidaoIdentidadeCnpj`
exigiam um documento anexado (`enquadramento_tributario_cnpj`/`simples_nacional`)
para liberar a Fase 1, mesmo quando o regime tributário já estava identificado pela
sincronização de CNPJ (`empresas.regime_tributario`/`opcao_simples`/`opcao_mei`).

**Correção**: quando a Receita já identificou o regime (qualquer um dos três campos
preenchido), a Fase 1 não fica mais bloqueada esperando upload — o dado usado é o da
consulta de CNPJ. Um documento continua podendo ser anexado como reforço opcional (e,
se for anexado, ainda precisa ser lido corretamente antes de contar como
"consistente"). Ajustado em 3 pontos, para não ficar inconsistente entre eles:
- `montarEnquadramentoDados` (`server/routes/documentacao.ts`) — não gera mais
  pendência bloqueante quando a Receita já identificou o regime.
- `avaliarProntidaoIdentidadeCnpj` (mesmo arquivo) — `enquadramentoConsistente` não
  depende mais de `anexado`.
- Catálogo `documentacao_blocos` — `enquadramento_tributario` deixou de ser
  `obrigatorio = true`.
- Frontend (`DocumentosEntidade.tsx`) — o campo aparece como "(opcional)", o botão
  "Iniciar análise documental" passa a exigir só Cartão CNPJ + QSA (antes exigia os
  3), e o badge mostra "obrigatórios anexados" em vez de "X/3" fixo.
- `DossieCreditoEmpresa.tsx` — ajustado o gatilho do botão "Tentar novamente" para
  não depender de `anexado` no Enquadramento (usa `anexado || consistente`).

4 testes novos em `tests/enquadramentoTributarioSemAnexo.test.ts`, cobrindo: regime
identificado por texto, identificado só por `opcao_mei`, bloqueio mantido quando a
Receita nunca sincronizou nada, e `empresa` nula/ausente.

### 4. Multi-sócio: sócios do QSA passam a ser conciliados com `socios_empresa`

A tela "Documentação dos Sócios" **já suportava** múltiplos sócios (campos
`porSocio`, seleção de sócio por campo, contagem "X/Y sócios com documento") — o
frontend e o banco já tinham a estrutura dinâmica pedida. A lacuna real, confirmada
por rastreamento de código: o QSA extraído do documento (PDF/OCR) só era **comparado**
contra `socios_empresa` (gerando alertas de divergência) — nunca gravava um sócio
novo lá. Se a sincronização com a Receita estivesse incompleta e o QSA físico
mostrasse um segundo sócio, esse sócio nunca aparecia na aba de documentação pessoal,
porque ela lê exclusivamente de `socios_empresa`.

**Correção**: nova função `sincronizarSociosExtraidosDoQsa`
(`server/routes/documentacao.ts`), chamada sempre que uma leitura nova do QSA
acontece. Cada sócio identificado no documento é conciliado com `socios_empresa` via
`upsertSocioEmpresa` (já existente, casamento por nome/CPF, nunca sobrescreve dado
confirmado manualmente). Só nome, qualificação e se é administrador são gravados —
nenhum dado pessoal (CPF, RG, endereço...) é lido do QSA nem inferido, preservando a
regra "Fase 1 = zero dados pessoais". Falhas de conciliação são só logadas, nunca
quebram a exibição do QSA. 3 testes novos em `tests/sincronizarSociosQsa.test.ts`.

## Gap identificado e não fechado nesta sessão

- **Campo de justificativa do comprovante de endereço**: quando o titular do
  comprovante é um terceiro (não o sócio vinculado), o backend já gera o alerta
  `endereco_titular_diferente_socio` e o campo `exige_justificativa_titular: true` —
  mas não existe hoje um campo de justificativa dedicado e persistido; na prática, a
  justificativa cai no campo Observação genérico (cujo bug de exibição foi corrigido
  no item 1). Criar um campo estruturado exigiria mudança de schema e de UI que não
  foi feita aqui — fica registrado como recomendação, não como "concluído".

## Validação executada

```
npx tsc --noEmit    → limpo (0 erros)
npx vitest run      → 40 arquivos, 516/516 testes passando
npm run build       → build de produção concluído, dentro do orçamento de bundle
                       (JS inicial 99.3 kB gzip / limite 130 kB;
                        CSS inicial 33.3 kB gzip / limite 45 kB)
```

## Arquivos alterados

- `client/src/components/documentos/DocumentosEntidade.tsx` — bugfix da Observação;
  ordem SCR→CCS→CCF no frontend; Enquadramento Tributário opcional.
- `client/src/components/documentacao/DossieCreditoEmpresa.tsx` — ajuste do gatilho
  do botão "Tentar novamente" para não depender de anexo do Enquadramento.
- `server/routes/documentos.ts` — nova validação de ordem SCR→CCS→CCF no upload.
- `server/routes/documentacao.ts` — Enquadramento Tributário sem exigir anexo;
  sincronização de sócios do QSA com `socios_empresa`.
- `tests/ordemConsultaCadastral.test.ts` (novo)
- `tests/enquadramentoTributarioSemAnexo.test.ts` (novo)
- `tests/sincronizarSociosQsa.test.ts` (novo)

Nenhuma migração de banco foi necessária — o catálogo `documentacao_blocos` é
resincronizado automaticamente no próximo start da aplicação (`ON CONFLICT (codigo)
DO UPDATE`). Nenhuma regra de Fase 1 (zero dados pessoais), Fase 3 (trava de 12
meses) ou a correção anterior do bug "Erro ao atualizar sócio" foi tocada ou
regredida — confirmado pelos 516 testes passando, incluindo todos os arquivos de
teste específicos dessas regras.
