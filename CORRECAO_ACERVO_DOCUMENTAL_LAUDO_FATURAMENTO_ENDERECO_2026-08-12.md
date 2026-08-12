# Acervo Documental — Laudo completo por documento (Faturamento e Comprovante de Endereço) — 12/08/2026

## Pedido original

Depois de ver a "Próxima leva de documentos" (lista de nomes + finalidade de cada
documento), o feedback foi que isso ainda não é suficiente: "temos que ter laudo,
temos que ter relatório, temos que ter informação, não somente passar pra próxima
etapa... o que está sendo consultado? Qual o resultado que está dando?"

## Investigação (antes de escrever qualquer código)

Rastreei, documento por documento, quais dos ~26 tipos do checklist realmente têm
alguma análise de IA rodando hoje — e não apenas armazenamento do arquivo:

- **Com análise real (leitura de IA + validação de regras de negócio já
  implementadas e testadas)**: QSA, Enquadramento/Simples Nacional (Fase 1), Atos
  da Junta Comercial, Contrato Social × Atos da Junta (cruzamento), **Faturamento**
  e **Comprovante de Endereço do sócio**. As duas últimas (`validarFaturamentoExtraido`
  e `validarComprovanteEnderecoExtraido`, `server/services/regrasDocumentaisCredito.ts`)
  já rodam automaticamente assim que o arquivo é anexado
  (`agendarAnaliseRegraDocumental`, `server/routes/documentos.ts:519`) — o
  resultado (dados extraídos + lista de alertas com severidade e recomendação) já
  ficava salvo em `documentos_arquivos.resultado_validacao.analise_regra_documental`
  e **já chegava para o frontend** (o campo faz parte do `SELECT` de `GET
  /api/documentos`) — só nunca tinha sido exibido além de uma linha truncada
  ("Análise automática concluída").
- **Sem nenhuma análise de IA hoje** (só armazenamento do arquivo, sem leitura,
  sem extração, sem validação): CND/CPEND Federal, Situação Fiscal, CADIN, PGFN,
  Rating (CNPJ e CPF), Consulta de optante pelo Simples Nacional (a consulta
  separada, distinta do enquadramento da Fase 1), PGDAS e recibo, DEFIS e recibo,
  SCR/CCS/CCF, Certidões estadual/municipal, eCAC. Isso é real e verificado no
  código (`ANALISE_ESPECIALIZADA_POR_TIPO` em `server/routes/documentacao.ts` só
  cobre `qsa`, `simples_nacional`/`enquadramento_tributario_cnpj`,
  `atos_junta_comercial`, `faturamento_12_meses` e `comprovante_residencia` — nada
  mais).

## O que foi implementado nesta sessão

Em `DocumentosEntidade.tsx`, cada arquivo já anexado de Faturamento ou
Comprovante de Endereço ganhou um link "Ver laudo" que expande, no próprio card do
documento (sem precisar sair da tela nem abrir outra aba), o laudo completo já
calculado pelo backend:

- Status da leitura (concluída / aguardando revisão humana) e quando foi
  consultado.
- Para Faturamento: quantos meses foram identificados e o intervalo, se a
  assinatura foi feita depois do fechamento do último mês, se as assinaturas do
  sócio-administrador e do contador usam a mesma modalidade (manual/eletrônica).
- Para Comprovante de Endereço: mês de referência identificado, se está dentro da
  validade de 2 meses, se o titular confere com o sócio vinculado.
- A lista completa de alertas (não só o primeiro, truncado) — cada um com a
  mensagem e, quando existe, a recomendação do que fazer.
- Quando a leitura falhou (arquivo ilegível, erro de processamento), mostra a
  mensagem de erro registrada, em vez de simplesmente não mostrar nada.

Nada disso exigiu nova lógica de análise — o dado já existia, já estava correto e
já testado; a mudança foi só deixar de escondê-lo.

## Gap real, não fechado nesta sessão — e decisão que só cabe ao dono do produto

Para os ~11 tipos de documento sem nenhuma análise de IA hoje (CND, situação
fiscal, CADIN, PGFN, Rating, Simples Nacional avulso, PGDAS, DEFIS, SCR/CCS/CCF,
certidões estadual/municipal, eCAC), não existe "laudo" possível ainda — o sistema
literalmente não lê o conteúdo desses arquivos, só guarda o upload. Criar esse
laudo de verdade (extração de campos + regras de validação) para cada um desses
tipos é um trabalho real de engenharia, do mesmo tamanho do que já foi feito para
Atos da Junta ou Faturamento — e cada um precisa de regras de negócio próprias que
não estão definidas em nenhum lugar ainda (o que faz uma CND ser válida? qual
prazo? o que checar num PGDAS-D? isso bate com o faturamento declarado?). Inventar
essas regras sem confirmação do Fernando seria o mesmo erro que este projeto vem
evitando desde o início: assumir uma regra de negócio em vez de ter a fonte
correta. Por isso, ficou registrado como pergunta em aberto para o usuário, não
implementado nesta sessão.

## Validação executada

```
npx tsc --noEmit    → limpo (0 erros)
npx vitest run      → 40 arquivos, 516/516 testes passando (nenhum teste alterado;
                       regrasDocumentaisCredito.test.ts continua cobrindo a lógica
                       de origem, que não foi tocada)
npm run build       → build de produção concluído, dentro do orçamento de bundle
                       (JS inicial 99.3 kB gzip / limite 130 kB;
                        CSS inicial 33.3 kB gzip / limite 45 kB)
```

## Arquivos alterados

- `client/src/components/documentos/DocumentosEntidade.tsx` — novo componente
  `ResumoLaudoDocumento`; novo estado `laudosExpandidos`; cada arquivo de
  Faturamento/Comprovante de Endereço ganhou o link "Ver laudo" que expande o
  resultado completo já calculado pelo backend (dados extraídos + alertas), sem
  alterar nenhuma rota nem lógica de análise existente.

Nenhuma rota de backend foi criada ou alterada. Nenhuma regra de validação de
Faturamento ou Comprovante de Endereço foi tocada — confirmado pelos 516 testes
passando.
