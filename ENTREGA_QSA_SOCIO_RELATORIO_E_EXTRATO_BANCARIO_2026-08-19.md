# Entrega — nome do sócio sumindo do relatório (QSA) + "0 lançamentos" no Acompanhamento Bancário

## Pedido

Dois problemas reportados com documentos reais anexados:

1. Um QSA anexado, validado e "consistente" no dossiê não mostrava o nome do
   sócio em lugar nenhum do relatório/dossiê/análises — apesar de a análise
   documental existir justamente para validar CNPJ, sócio e alteração
   contratual e gerar um relatório preciso e enxuto.
2. O Acompanhamento Bancário não lia o extrato bancário anexado (PDF): zero
   lançamentos eram encontrados e o preenchimento semanal automático não
   acontecia. Pedido explícito: a IA precisa ler tanto PDF quanto imagem, e
   ler com precisão.

## Bug 1 — QSA "consistente" sem sócio no relatório

### Causa raiz

`montarRelatorioDocumental` (`server/routes/documentacao.ts`), a função que
monta o relatório por arquivo (usada tanto pelo `/relatorio` em JSON quanto
pelo `/relatorio/pdf`), só conhecia a análise especializada de IA dos
documentos **societários** (contrato/alteração + atos da Junta). Para
qualquer outro tipo com análise própria — QSA, Simples Nacional,
Enquadramento Tributário, faturamento, comprovante de residência — o
relatório não tinha acesso ao laudo persistido (`documentos_extracoes_ia`) e
caía de volta na flag administrativa `documento.validado` (setada
manualmente/no upload, sem relação com o que a IA efetivamente leu).

Resultado, comprovado com o relatório real anexado
(`relatoriodocumentalpalumaburgerltda_13.pdf`): o QSA aparecia como
"Validado" / "Leitura concluída; documento considerado consistente" ao lado
de "SÓCIOS LIDOS NO QSA: 0" — a mensagem contradizia o próprio dado. E como o
nome do sócio nunca chegava em `resultado_analise.socios_lidos`, ele também
não aparecia em nenhuma seção do relatório (nem PDF, nem na tela).

### Correção

`montarRelatorioDocumental` agora busca, para cada documento anexado cujo
tipo tem análise especializada (`ANALISE_ESPECIALIZADA_POR_TIPO` — QSA,
Simples/Enquadramento, Atos da Junta, faturamento, comprovante de
residência), o laudo persistido em `documentos_extracoes_ia`
(`buscarAnaliseEspecializadaPersistida`, já existente e usado em outros
pontos do arquivo) e usa esse laudo — não mais a flag manual — para decidir
se o documento é "consistente":

- Se existe laudo de IA para o arquivo, ele manda: nem a flag `validado`
  transforma uma leitura marcada como incompleta/revisão em "consistente", e
  a ausência da flag não esconde uma leitura que a IA de fato concluiu.
- Sem laudo especializado para aquele tipo de documento (certidões, garantias
  etc.), o comportamento anterior continua exatamente igual.

Como consequência direta, `montarResultadoDetalhadoRelatorio` (que já lia
`socios_lidos` de `analise?.dados_extraidos?.socios` quando esse dado
existia) passa a receber o laudo real do QSA — e o nome do sócio aparece na
seção "Nomes identificados no QSA" (`shared/documentalPresentation.ts`, já
existente, usada tanto no relatório PDF quanto na tela), sem precisar tocar
nessa lógica de apresentação.

`montarRelatorioDocumental` precisou virar `async` (a busca do laudo é uma
consulta ao banco); os dois pontos que a chamam (`/relatorio` e
`/relatorio/pdf`) foram ajustados para `await`.

### Testes (`tests/relatorioDocumentalQsaSocios.test.ts`, novo arquivo)

1. QSA com `validado=true` no banco mas 0 sócios extraídos pela IA
   (persistido com `status: 'revisao_humana'` e alerta de severidade alta) →
   **antes**: `consistente: true`, "Validado", "considerado consistente".
   **depois**: `consistente: false`, não aparece como "Validado", conclusão
   não diz "considerado consistente". Confirmei revertendo a correção
   temporariamente: os dois testes falham exatamente como o bug descrito e
   voltam a passar com a correção — não é uma asserção vazia.
2. QSA com sócio realmente extraído (`status: 'concluido'`, sócio "Jonnathas
   Rodrigues Pires") → `consistente: true`, "Validado", e o nome aparece em
   `resultado_analise.socios_lidos`.

## Bug 2 — Acompanhamento Bancário com "0 lançamentos"

### O que eu confirmei primeiro

Rodei o extrato SICOOB real anexado
(`comprovante_17082026_112501.pdf`, FHTECH SOLUCAO & DIESEL LTDA,
01/08/2026–17/08/2026) direto contra o leitor determinístico local
(`parseExtratoBancario`, em `server/services/extracaoDocumentalLocal.ts`): a
leitura funciona bem para este documento — 20 lançamentos identificados
corretamente (PIX, tarifas, débitos, com valores e datas certos), confiança
0.95. Ou seja, a extração em si (texto → lançamentos) **não** é onde a leitura
falha para este tipo de documento.

### Causa raiz do "0 lançamentos" silencioso

`normalizarExtratoBancario` (`server/services/analiseDocumentalEspecializada.ts`)
descarta, sem deixar rastro, todo lançamento cuja data caia fora da semana
bancária selecionada (`semana_inicio`/`semana_fim` da atualização escolhida
na tela) — o que é o comportamento correto para não misturar dinheiro de
semanas diferentes. O problema é que, quando isso zera a lista inteira, a
rota `POST /api/acompanhamentos-bancarios/:id/extratos/analisar`
(`server/index.ts`) sempre devolvia a mesma mensagem genérica: *"Nenhum
lançamento novo foi incluído; os dados já podem existir ou não foram
legíveis no período."* — idêntica à mensagem de um documento realmente
ilegível. Do ponto de vista de quem anexou o extrato, os dois casos pareciam
"a IA não leu o documento", mesmo quando a leitura tinha funcionado
perfeitamente e o problema real era só a semana selecionada não cobrir
nenhuma data do extrato.

### Correção

- `normalizarExtratoBancario` agora calcula
  `total_lancamentos_no_documento`: quantos lançamentos válidos o documento
  tinha **antes** do filtro pela semana. Também guardei o período real do
  documento (usando todos os lançamentos válidos, não só os da semana) para
  `periodo_inicio`/`periodo_fim` — antes, se a semana zerasse a lista, o
  período do documento também sumia da resposta.
- Quando a leitura encontra lançamentos válidos mas nenhum cai na semana
  selecionada, uma observação explícita é gerada: *"O documento foi lido com
  sucesso e tem N lançamento(s) entre DD/MM/AAAA e DD/MM/AAAA, mas nenhuma
  data cai na semana selecionada (...). Selecione a semana bancária
  correta..."*.
- A rota `/extratos/analisar` agora escolhe a mensagem de retorno com base
  nesse dado: lançamentos inseridos → mensagem de sucesso (igual antes);
  lançamentos lidos mas já importados antes → mensagem específica de
  duplicidade; lançamentos lidos mas fora da semana → usa a observação nova,
  citando o período real do documento; documento sem nenhum lançamento
  legível → mensagem pedindo para verificar nitidez/formato do arquivo. O
  usuário agora consegue diferenciar "a leitura funcionou, é a semana errada"
  de "o documento não deu pra ler" sem abrir o console.

### Lacuna de verificação de propriedade também corrigida

Ao rastrear a cadeia de upload → análise, encontrei uma lacuna real em
`validarEntidade` (`server/routes/documentos.ts`): ela já resolve e confirma
`empresa_id` a partir do próprio registro do banco para `entidade_tipo`
`socio` e `contrato`, mas para `acompanhamento_bancario` caía no fallback
genérico (`return {}`) — nem confirmava que o acompanhamento existe, nem
resolvia o `empresa_id` pelo banco; o campo salvo em
`documentos_arquivos.empresa_id` dependia inteiramente do que o front
enviasse em `empresa_id` no FormData. Como a leitura do extrato
(`carregarContexto`, no mesmo arquivo do Bug 2) exige
`documento.empresa_id === empresaId` para aceitar o arquivo, qualquer
divergência nesse campo (ex.: uma corrida de carregamento no front que
mande o campo vazio) faz a leitura falhar de forma **totalmente silenciosa**
para quem só está olhando o "0 lançamentos" na tela — sem esse gap ter
relação nenhuma com o texto do PDF. Corrigido: `acompanhamento_bancario`
agora resolve e confirma `empresa_id` a partir da tabela
`acompanhamentos_bancarios`, no mesmo padrão já usado para `socio`/`contrato`.

### Sobre leitura de imagem

O pipeline já suportava imagem (`jpeg/png/webp`) tanto na extração local
(OCR via `tesseract`, quando disponível no ambiente) quanto na IA externa
(Gemini aceita `inlineData` de imagem do mesmo jeito que PDF) — não encontrei
um bug de código específico para esse caminho; não toquei nele. Se um extrato
em imagem continuar não lendo depois desta correção, o próximo passo é
confirmar (via log do servidor) se `tesseract`/`pdftoppm` estão instalados no
ambiente de produção — sem esse binário a extração local cai para a IA
externa automaticamente, então isso só bloquearia a leitura se a chave do
Gemini também não estiver configurada no ambiente.

### Testes

- `tests/analiseDocumentalEspecializada.test.ts` (3 casos novos, usando dados
  no formato do extrato SICOOB real): (1) semana parcial → só os lançamentos
  daquela semana entram, `total_lancamentos_no_documento` reflete o total
  real do documento; (2) semana totalmente fora do período do documento →
  `lancamentos: []` mas a observação cita "lido com sucesso" e as datas reais
  do documento — prova que não é mais confundido com falha de leitura; (3)
  documento genuinamente sem lançamento legível → observação diferente
  ("nenhum lançamento legível foi encontrado no documento").
- `tests/validarEntidadeAcompanhamentoBancario.test.ts` (novo arquivo, 3
  casos): resolve `empresa_id` do banco mesmo sem o campo vir no corpo da
  requisição; rejeita acompanhamento inexistente; rejeita quando o
  `empresa_id` enviado pelo cliente diverge do dono real do acompanhamento.

## Escopo da mudança

7 arquivos tocados, todos cirúrgicos:

- `server/routes/documentacao.ts` — Bug 1 (uma função + 2 pontos de chamada).
- `server/services/analiseDocumentalEspecializada.ts` — Bug 2 (uma função +
  um helper de formatação de data + a interface do resultado).
- `server/index.ts` — Bug 2 (mensagem da rota `/extratos/analisar`).
- `server/routes/documentos.ts` — Bug 2 (um `case` novo em `validarEntidade`).
- `tests/relatorioDocumentalQsaSocios.test.ts` — novo, Bug 1.
- `tests/analiseDocumentalEspecializada.test.ts` — 3 testes novos, Bug 2.
- `tests/validarEntidadeAcompanhamentoBancario.test.ts` — novo, Bug 2.

Nenhuma rota foi removida ou renomeada, nenhuma migração de schema, nenhum
armazenamento alterado. `npx vitest run` → **539/539 testes passando** (531
da base do zip 10 + 8 novos), `npx tsc --noEmit` → 0 erros.

## Extra — revisão do extrato por modalidade, em vez de dia a dia

Depois da correção do Bug 2, foi pedido para trocar a lista de revisão
lançamento-a-lançamento (um card por dia) por um **resumo por modalidade**:
total de entrada e saída da semana selecionada, separado em Pix,
Transferência (TED/DOC), Crédito (demais entradas) e Débito (demais saídas).
Dinheiro (depósito em espécie) fica de fora — é lançado manualmente, não vem
do extrato, conforme confirmado.

### O que mudou

Em `client/src/pages/colaborador/AcompanhamentoBancario.tsx`, na seção
"Extratos e comprovantes bancários":

- Cada lançamento importado é classificado em uma de 4 modalidades
  (`classificarModalidadeLancamento`): Pix e Transferência são identificados
  pela descrição do lançamento (contém "pix", "ted", "doc" ou "transfer");
  o que sobra vira Crédito (entradas) ou Débito (saídas) — o mesmo critério
  que o próprio extrato usa para marcar C/D quando não é uma modalidade
  nomeada.
- Uma tabela de resumo (`resumoModalidadesLancamentos`) aparece no topo da
  seção, somando entrada e saída de cada modalidade e o total geral —
  contando todos os lançamentos da semana selecionada que não foram
  descartados (pendentes, aprovados e já aplicados).
- A lista detalhada por lançamento **continua existindo** (não foi removida)
  porque é o mecanismo usado para aprovar/corrigir/descartar cada linha antes
  de aplicar (`aplicarLancamentosImportados` só aplica os que estão como
  "aprovado") — mas agora fica escondida por padrão, atrás de um link "Ver e
  revisar lançamentos individuais (N)". A visão padrão passa a ser o resumo
  por modalidade, como pedido.

Só a tela mudou — nenhuma rota, nenhum schema de banco, nenhuma lógica de
extração/classificação no servidor foi tocada. `npx tsc --noEmit` limpo e
`npx vite build` concluído sem erros depois da mudança (validação de que o
JSX/TS da tela está correto). `npx vitest run` continua em 539/539 (esta
mudança é só de front-end, não adiciona nem quebra teste de backend).

## Extra 2 — bloqueio "current transaction is aborted" ao salvar, e aplicar tudo de uma vez

Depois de usar o resumo por modalidade, apareceu um erro vermelho ao tentar
salvar: **"current transaction is aborted, commands ignored until end of
transaction block"**. Junto veio o pedido de trocar o fluxo de "aprovar
lançamento por lançamento" por "aplicar o total de uma vez", somando com o
que já existir na semana (nunca sobrescrevendo).

### Causa raiz do bloqueio

Em `server/index.ts`, a função `recalcularSemanaBancariaAposImportacao` (usada
pela rota `POST /lancamentos-importados/aplicar`, o botão "Aplicar
aprovados") roda dentro de uma única transação de banco. Depois de gravar o
recálculo da semana, ela faz duas escritas auxiliares — histórico de
compensação e alertas automáticos — cada uma dentro de um `try/catch` que
só registrava um aviso no log (`console.warn`) se desse erro, sem desfazer
nada.

O problema: no Postgres, se **qualquer** comando dentro de uma transação
falha, a transação inteira fica "abortada" e passa a rejeitar todo comando
seguinte com essa mensagem, até um `COMMIT`/`ROLLBACK` explícito — mesmo que
o comando seguinte não tenha nada a ver com o que falhou. Como esses
`try/catch` engoliam o erro original sem desfazer a transação, o próximo
comando (um `UPDATE` de rotina, "atualizar `ultimo_update_em`") caía direto
nesse bloqueio, e era **esse** erro genérico — não o erro real — que
aparecia pro usuário na tela.

**Correção**: os dois blocos auxiliares agora rodam isolados dentro de um
`SAVEPOINT` (o mesmo padrão que já existia em outro ponto do arquivo, na
rota de editar semana). Se uma dessas escritas auxiliares falhar, fazemos
`ROLLBACK TO SAVEPOINT` só daquele bloco — a transação principal continua
saudável e o recálculo da semana é salvo normalmente. Nenhuma escrita
auxiliar deixa de tentar rodar; só deixa de travar tudo se der problema.

### Aplicar tudo de uma vez, somando com o que já existe

Antes, só dava pra aplicar lançamentos já marcados individualmente como
"Aprovado". Agora existem dois botões:

- **"Aplicar só os aprovados"** — o comportamento antigo, para quem quer
  revisar/aprovar item a item antes de aplicar.
- **"Aplicar tudo (somar total da semana)"** (novo, botão principal) — pega
  de uma vez todos os lançamentos da semana que não foram descartados
  (aprovados e pendentes juntos), marca os pendentes como aprovados no ato,
  e aplica tudo numa única chamada. Não é mais preciso aprovar dia a dia.

Em `server/index.ts`, a rota `POST
/acompanhamentos-bancarios/:id/lancamentos-importados/aplicar` ganhou um
parâmetro `incluir_pendentes`: quando `true`, o filtro de status passa a
aceitar `'pendente'` além de `'aprovado'` (só `'descartado'` fica de fora).

O cálculo em si **já era aditivo** e continua sendo — não foi preciso mudar
essa parte, só destravar o bloqueio: `recalcularSemanaBancariaAposImportacao`
lê o valor atual de cada campo de entrada da semana (pix, maquininha, ted,
etc.) antes de aplicar os novos lançamentos e **soma** em cima, nunca
substitui. Ou seja, se a semana já tinha entradas lançadas manualmente ou de
uma aplicação anterior, elas continuam lá — o novo total só se soma a elas.
Saldo, referências, teto, percentuais e diagnóstico da semana são
recalculados na mesma chamada, então tudo fica consistente depois de aplicar.

Dinheiro continua fora do fluxo automático (não muda nesta correção) — segue
sendo lançado manualmente, como já estava.

### Escopo desta correção

- `server/index.ts` — `recalcularSemanaBancariaAposImportacao` (savepoints
  nos dois blocos auxiliares) e a rota `.../lancamentos-importados/aplicar`
  (parâmetro `incluir_pendentes`).
- `client/src/pages/colaborador/AcompanhamentoBancario.tsx` — nova função
  `aplicarTodosLancamentosDaSemana` e o novo botão "Aplicar tudo (somar total
  da semana)", ao lado do botão antigo (renomeado para "Aplicar só os
  aprovados").

Nenhuma migração de schema. `npx tsc --noEmit` limpo, `npx vite build`
concluído sem erros, `npx vitest run` → **539/539 testes passando**.

## Extra 3 — logo do cabeçalho sobrepondo o título no PDF do relatório documental

Foi enviado um relatório em PDF (`Relatório Documental — Paluma Burger
LTDA`) mostrando a logo do cabeçalho sobreposta ao título H1 da primeira
página, cortando o texto.

**Causa**: em `server/routes/documentacao.ts`, a função
`gerarHtmlRelatorioDocumental` embutia no HTML um `<style>` com
`@page { size: A4; margin: 14mm; }`. Só que essa margem de 14mm no CSS não
batia com a margem que o Puppeteer realmente usa para desenhar o PDF —
passada em JavaScript por quem chama essa função
(`generateBrandedPdfBuffer(..., { topMargin: '38mm' })`, com margem superior
de 38mm reservada pro cabeçalho com a logo). Como o CSS dizia 14mm mas o
Puppeteer reservava 38mm de área de cabeçalho por fora do conteúdo, o
título HTML (que só respeitava o `margin: 14mm` do CSS) começava a ser
desenhado bem mais cedo do que a área do cabeçalho terminava — daí a
sobreposição.

**Correção**: uma linha — o `@page` do CSS passou a usar exatamente as
mesmas margens do Puppeteer: `@page { size: A4; margin: 38mm 22mm 28mm; }`
(topo 38mm, laterais 22mm, rodapé 28mm), no mesmo padrão que outra função de
relatório do mesmo arquivo já usava corretamente.

**Verificação**: gerei um PDF de teste real com essa função (dados
sintéticos) e comparei a página 1 renderizada como imagem antes/depois — a
logo ficou limpa, com espaço em branco generoso acima do título, sem
sobreposição. Script de teste e PDF temporário foram apagados depois da
verificação; nada de teste ficou no repositório.

### Escopo desta correção

- `server/routes/documentacao.ts` — uma linha de CSS dentro de
  `gerarHtmlRelatorioDocumental`.

Nenhuma outra função de geração de PDF foi tocada. `npx tsc --noEmit`
limpo, `npx vitest run` → **539/539 testes passando** (mudança é só CSS
dentro de uma string de template, não afeta nenhum teste existente).
