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

## Extra 4 — limpeza do "Relatório Bancário Inteligente de Acompanhamento"

Foi enviado um PDF real (FHTECH SOLUCAO & DIESEL LTDA) mostrando o mesmo
problema de cabeçalho sobreposto ao título nesse relatório — e pedido para
deixar o relatório mensal de acompanhamento bancário "totalmente
profissional": sem dado duplicado, com entrada/saída/saldo da semana bem
visíveis, faturamento anual/mensal/semanal com a margem de 30%, alertas
diretos, e sem informação faltando.

Essa tela é gerada por `gerarHtmlRelatorioMensalAcompanhamento` (server/
index.ts), acionada pelas rotas `POST /acompanhamentos-bancarios/:id/relatorio`
e `.../relatorio-mensal`. Revisei o PDF real enviado e encontrei 4 problemas
concretos:

1. **Logo sobrepondo o título** — mesma causa das correções anteriores: o
   `@page` do CSS dizia `margin: 0`, enquanto o Puppeteer (via
   `generateBrandedPdfBuffer`, sem `topMargin` customizado nesta rota) reserva
   `28mm` de margem superior pro cabeçalho da marca. Corrigido para
   `@page { size: A4; margin: 28mm 22mm 28mm; }`, batendo exatamente com a
   margem real do Puppeteer (top 28mm, laterais 22mm, rodapé 28mm) — mesmo
   padrão já usado nos outros dois relatórios com essa técnica de papel
   timbrado. Verificado renderizando um PDF de teste com a mesma estrutura de
   cabeçalho: logo limpa, sem sobreposição.

2. **Card da semana faltando "Saídas"** — a seção "Semana em evidência" só
   mostrava Entradas e Saldo da semana atual; o valor de Saídas ficava
   escondido, só dava pra deduzir. Adicionei o card "Saídas da semana" e
   também "Status da semana" (dentro da faixa / abaixo da referência /
   crítico etc.), reorganizando em duas fileiras de 3 cards: Semana atual /
   Período / Status, depois Entradas / Saídas / Saldo — a leitura pedida
   ("entrada, saída, saldo da semana, de forma bem simples e visível") fica
   direta, sem precisar calcular nada de cabeça.

3. **"Parecer técnico" duplicado palavra por palavra** — o mesmo texto
   aparecia duas vezes no relatório: uma vez na seção "Assessoria inteligente
   de crédito" (bloco "Parecer técnico:") e de novo, idêntico, na seção final
   "Parecer técnico final" perto das assinaturas. Removi a repetição do meio
   — o parecer técnico completo agora aparece só uma vez, no fechamento do
   relatório, junto com a orientação ao cliente e as assinaturas, onde faz
   mais sentido como conclusão.

4. **Documento anexado repetido 6 vezes na tabela "Documentos e anexos
   considerados"** — a consulta que busca os documentos da empresa
   (`documentos_arquivos`) não removia duplicatas, e o mesmo arquivo físico
   (reenviado/reprocessado mais de uma vez durante os testes) aparecia várias
   vezes seguidas com o mesmo nome, tamanho e data. Adicionei uma deduplicação
   por nome do arquivo + tamanho antes de montar o relatório, mantendo sempre
   a ocorrência mais recente (a consulta já vem ordenada por `criado_em
   DESC`). Isso é só uma proteção na hora de montar o relatório — não apaga
   nem altera nada no acervo documental do acompanhamento.

O restante da estrutura do relatório (faturamento anual/mensal/semanal com
margem de 30%, teto e % de uso, semanas positivas/negativas/críticas,
movimentação consolidada por semana, composição das entradas por modalidade,
diagnóstico semana a semana, alertas operacionais, rating e prontidão para
crédito) já cobria o que foi pedido — o ajuste foi de clareza/duplicação, não
de dados faltando de cálculo.

### Escopo desta correção

- `server/index.ts` — `gerarHtmlRelatorioMensalAcompanhamento` (CSS `@page`,
  cards da semana, remoção do parecer técnico duplicado) e
  `responderRelatorioAcompanhamentoBancario` (deduplicação de documentos).

Nenhuma migração de schema, nenhuma rota renomeada. `npx tsc --noEmit`
limpo, `npx vitest run` → **539/539 testes passando** (não havia teste
automatizado cobrindo esse gerador de HTML antes desta mudança — a
verificação de layout foi visual, renderizando um PDF de teste real com a
mesma técnica de papel timbrado e conferindo a página 1 como imagem).

## Extra 5 — navegação confusa entre "Acervo Documental" e "Dossiê / Laudo IA"

Foi reportado (com prints e um vídeo de navegação) que, para conseguir ver o
laudo depois de anexar CNPJ/QSA, o caminho era: anexar → "Iniciar análise
documental" → o laudo abre → pra anexar o próximo documento tinha que clicar
"Voltar para a empresa" → clicar de novo na aba "Dossiê / Laudo IA" → esperar
"Montando Dossiê de Crédito..." recarregar tudo do zero. "Caminho longo pra
pouca coisa."

### Causa raiz

O laudo (`DossieCreditoEmpresa`) tinha **duas casas diferentes e
independentes** no sistema:

1. A página exclusiva do acervo (`/colaborador/empresas/:id/acervo`), que já
   abre o laudo embutido na mesma tela (`?view=analise`) assim que "Iniciar
   análise documental" termina — isso já funcionava certo.
2. A aba "Dossiê / Laudo IA" dentro da página da empresa
   (`client/src/pages/colaborador/Empresas.tsx`), que renderizava uma
   **segunda cópia própria** do mesmo `<DossieCreditoEmpresa>`, calculada do
   zero, numa página diferente.

Como são duas instâncias diferentes do mesmo componente, sem nada em comum
além dos dados que buscam do servidor, ir de uma pra outra sempre recarrega
tudo — daí "Montando Dossiê de Crédito..." toda vez. E como anexar mais
documentos só é possível na página do acervo (não na aba da empresa), o
usuário ficava preso pingando entre as duas.

### Correção

O laudo passou a ter **uma casa só**: a página exclusiva do acervo. A aba
"Dossiê / Laudo IA" agora só redireciona pra lá (`/acervo?view=analise`) —
exatamente o mesmo padrão que a aba "Acervo Documental" já usava pra abrir a
página do checklist, só que agora as duas abas levam pro mesmo lugar, cada
uma já na visão certa (checklist ou laudo). E, dentro da própria página do
acervo, adicionei um link "Voltar para o checklist de documentos" acima do
laudo — pra alternar entre anexar documentos e ver o laudo sem precisar
sair pra "Voltar para a empresa" e voltar de novo.

Fluxo novo: `Empresas.tsx` → aba "Acervo Documental" **ou** aba "Dossiê /
Laudo IA" → ambas caem na mesma página do acervo → anexa CNPJ/QSA → clica
"Iniciar análise documental" → vê o laudo ali mesmo → clica "Voltar para o
checklist de documentos" (sem sair da página) → anexa o próximo documento
(Atos da Junta) → repete → só no fim, com tudo anexado, é que faz sentido
gerar/baixar o relatório em PDF. Nenhuma tela nova foi criada — só
eliminada a segunda cópia redundante do laudo e fechado o vaivém entre
página do acervo e aba da empresa.

### Escopo desta correção

- `client/src/pages/colaborador/Empresas.tsx` — aba "Dossiê / Laudo IA"
  agora redireciona para a página do acervo em vez de renderizar sua
  própria cópia do laudo (mesmo padrão já usado pela aba "Acervo
  Documental"); import não usado removido.
- `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx` — link "Voltar
  para o checklist de documentos" na visão do laudo, pra trocar de visão
  sem sair da página.

Nenhuma rota de API mudou, nenhum dado de análise foi alterado — é só
navegação/composição de tela. `npx tsc --noEmit` limpo, `npx vite build`
concluído sem erros, `npx vitest run` → **539/539 testes passando** (essa
mudança é só de front-end/roteamento, não adiciona nem quebra teste de
backend).

## Extra 6 — card de análise documental contraditório, e contrato social/QSA verboso demais

Foi enviado um PDF real (`relatoriodocumentalpalumaburgerltda_17.pdf`) mais
duas capturas de tela — uma delas com círculos vermelhos marcando o
problema — mostrando o card de um documento QSA dizendo, no topo,
"Leitura concluída; documento considerado consistente" (ou seja: validado),
e logo abaixo, no checklist técnico do mesmo card, "CNPJ: não identificado",
"Razão social: não identificada" e "Capital social: não identificado" — uma
contradição visível na tela e impressa no PDF. Junto veio o pedido de deixar
o card do Contrato Social/Atos da Junta bem mais enxuto (só a última
alteração, se já completa 12 meses, e o resultado em uma frase — sem o
texto jurídico completo) e de esconder todo o texto de apoio atrás de um
botão de informações que não ocupe espaço na tela por padrão e nunca apareça
no PDF impresso.

### Causa raiz da contradição

Em `shared/documentalPresentation.ts`, a seção "Amostra objetiva dos dados
lidos" (que mostrava o CNPJ/razão social/capital corretamente) lia esses
valores do array `resultado.campos` (uma lista de `{label, valor}` que a
extração sempre preenche). Mas a seção "Validações realizadas", logo
abaixo, checava esse mesmo dado só em campos com formato de objeto
(`campos_principais`, `dados_extraidos`, `dados_qsa`, `analise_documental`)
— nunca olhava para o array `campos`. Quando a extração só populava o
array (como no caso relatado), a "Amostra" mostrava o valor certo e a
"Validações" — cega para essa fonte — concluía "não identificado" para o
mesmo dado, na mesma tela.

### Correção da contradição

Adicionei um helper `valorDeCampos(campos, ...labels)` que procura um valor
no array `{label, valor}` por nome normalizado (sem acento/maiúscula) e
passei a usá-lo como última opção da cadeia de fallback no checklist do
QSA. Agora o checklist enxerga a mesma fonte de dado que a tela já mostra —
nunca mais contradiz "identificado" com "não identificado" para o mesmo
campo.

### Contrato Social / Atos da Junta — card enxuto

O card societário mostrava, sempre, o texto jurídico completo de cada
alteração (cedente, cessionário, cláusula, evidência literal) e o
diagnóstico bruto da leitura, ocupando bastante espaço tanto na tela quanto
no PDF — mesmo quando só a última alteração importa. Agora, quando o
documento tem alterações societárias, o card mostra por padrão só uma nova
seção objetiva ("Resultado da alteração societária") com:

- o resultado em uma frase (ex.: *"Transferência de titularidade: Marcos
  Henrique Soares Pio → Jonnathas Rodrigues Pires (65.000 quotas, 100%)"*),
  gerado por um novo helper `formatarAlteracaoResumo`;
- a data da última alteração;
- se essa alteração já completa 12 meses (*"Sim — não precisa de alteração
  anterior"* ou *"Não — anexar também a alteração/contrato anterior"*),
  respondendo diretamente ao pedido de não exigir o contrato anterior
  quando os últimos 12 meses já estão cobertos pela alteração mais
  recente.

### Mecanismo do botão de informações (novo campo `colapsavel`)

O tipo `DocumentoAnaliseSecao` (usado tanto pelo PDF quanto pela tela)
ganhou um campo opcional `colapsavel?: boolean`. As seções de apoio —
checklist técnico de validação, texto jurídico completo da transação,
evidência literal do documento — passaram a ser marcadas `colapsavel:
true`. As seções essenciais (resultado, resumo da alteração, titular
atual, dados do QSA) continuam sem essa marca, ou seja, sempre visíveis.

Essa é a mesma função (`construirSecoesAnaliseDocumento`) usada pelo PDF
(`server/routes/documentacao.ts`) e pelos dois lugares da tela que mostram
o card (`DocumentosEntidade.tsx` e `DossieCreditoEmpresa.tsx`, via
`client/src/components/documentos/ResultadoAnaliseDocumento.tsx`) — então
o comportamento ficou consistente nos três lugares:

- **PDF**: `secoesAnaliseHtml` em `server/routes/documentacao.ts` agora
  filtra `!secao.colapsavel` antes de desenhar o HTML — as seções
  colapsáveis simplesmente nunca chegam a ser impressas.
- **Tela**: `ResultadoAnaliseDocumento.tsx` separa as seções em
  "principais" (sempre visíveis) e "detalhes" (colapsáveis) e mostra um
  botão pequeno com ícone de informação — "Ver informações técnicas" — que
  abre/fecha as seções de apoio sem sair da página e sem ocupar espaço
  quando fechado.

### Verificação

- `npx vitest run tests/documentalPresentation.test.ts` → seis testes,
  incluindo um novo criado especificamente para reproduzir o bug relatado
  (QSA com CNPJ/razão social/capital só no array `campos`, confirmando que
  o checklist não fala mais "não identificado" para nenhum deles).
- `npx vitest run` (suíte completa) → **540/540 testes passando** (539
  anteriores + 1 novo).
- `npx tsc --noEmit` limpo.
- `npx vite build --mode production` concluído sem erros.
- Gerei um PDF de teste real reaproveitando o HTML da função de produção
  (dados sintéticos equivalentes ao caso relatado) e conferi a página
  renderizada como imagem: sem sobreposição de cabeçalho, sem mensagem de
  erro/contradição, card do Contrato Social mostrando só resultado + data +
  checagem de 12 meses. Script e PDF de teste apagados depois da
  verificação.

### Escopo desta correção

- `shared/documentalPresentation.ts` — helper `valorDeCampos` (corrige a
  contradição), helpers `parseDataIso`/`formatarDataBr`/
  `formatarAlteracaoResumo` e nova seção `resumo_alteracao` (enxuga o card
  societário), campo `colapsavel` no tipo `DocumentoAnaliseSecao` e nas
  seções de apoio (checklist, texto jurídico completo, evidências).
- `server/routes/documentacao.ts` — `secoesAnaliseHtml` passou a filtrar
  seções `colapsavel` antes de montar o HTML do PDF.
- `client/src/components/documentos/ResultadoAnaliseDocumento.tsx` —
  reescrito para separar seções principais de seções colapsáveis atrás de
  um botão "Ver informações técnicas".
- `tests/documentalPresentation.test.ts` — testes atualizados para a nova
  estrutura, mais um teste novo que reproduz e trava o bug da contradição.

Nenhuma rota de API nem cálculo de análise mudou — é só reorganização de
apresentação (quais seções aparecem por padrão, quais ficam atrás do
botão) e a correção pontual do checklist que lia a fonte de dado errada.

## Extra 7 — a análise da Etapa 1 saía do Acervo Documental, e botões duplicados na tela da empresa

Foram enviadas quatro capturas de tela anotadas (duas do cabeçalho da empresa
com círculos em "Nova Simulação", "Novo Contrato", "Iniciar conversa",
"Atualizar cadastro", "Dossiê / Laudo IA" e "Acervo Documental"; duas do
próprio Acervo Documental com círculos no botão "Iniciar análise documental"
e no checklist) mais uma mensagem de voz detalhada com três pedidos:

1. A análise da Etapa 1 (Cartão CNPJ + QSA + Enquadramento Tributário) tem
   que acontecer e mostrar o resultado dentro do próprio Acervo Documental —
   não abrindo o Dossiê / Laudo IA. O Dossiê passa a ser só o laudo final,
   gerado à parte, depois que todos os documentos já estiverem anexados e
   validados.
2. Sair do Acervo Documental pra ver outra aba da empresa (Inteligência 360,
   Conversas, Simulações...) não pode exigir "Voltar para a empresa" e só
   depois clicar na aba lá — as abas têm que estar disponíveis ali mesmo, um
   clique só.
3. A tela da empresa tem botões repetidos fazendo exatamente a mesma coisa
   duas vezes na mesma tela ("Atualizar cadastro"/"Atualizar", "Editar",
   "Nova Simulação", "Novo Contrato", "Iniciar conversa") — tirar a
   repetição, deixar a tela limpa.

### 1. Etapa 1 passou a analisar e mostrar o resultado dentro do Acervo Documental

**Causa**: o botão "Iniciar análise documental" (`DocumentosEntidade.tsx`,
usado pelo Acervo Documental) chamava a prop `onAbrirLaudo`, que em
`AcervoDocumentalEmpresa.tsx` disparava a análise e IMEDIATAMENTE navegava
pra `?view=analise` — trocando toda a tela do checklist pelo `<DossieCreditoEmpresa>`
(o laudo completo). Ou seja: anexar CNPJ/QSA, clicar em "Iniciar análise
documental" e ver o resultado da Etapa 1 exigia sair do Acervo Documental e
entrar no Dossiê — só voltando por "Voltar para a empresa" pra anexar o
próximo documento. A Etapa 2/3 (Atos da Junta) já tinha sido corrigida numa
entrega anterior (Extra 5) pra mostrar o resultado sem sair da tela; a
Etapa 1 continuava com o comportamento antigo.

**Correção**: o cartão que mostra o resultado da Etapa 1
(`ProntidaoIdentidadeCard`, dentro de `DossieCreditoEmpresa.tsx` — os
documentos lidos, o diagnóstico, "Confirmações"/"O que precisa ser
resolvido"/"Avisos estratégicos", estatísticas de análise) foi exportado e
passou a ser reaproveitado direto dentro de `DocumentosEntidade.tsx`, no
mesmo lugar onde os documentos são anexados. O botão "Iniciar análise
documental" agora chama uma função local (`iniciarAnaliseIdentidade`, no
mesmo padrão de polling já usado pela Etapa 2/3) que dispara a análise e
atualiza esse cartão SEM navegar pra lugar nenhum. Assim que a primeira
análise roda, o botão de disparo simples desaparece (evitando duplicar
ação) e quem controla novas tentativas passa a ser o próprio cartão
completo (que já tem seu botão de "tentar novamente" em caso de falha de
leitura). O Dossiê / Laudo IA (`?view=analise`) continua existindo e
funcionando exatamente igual — só deixou de ser aberto automaticamente pela
Etapa 1; agora é o laudo final, acessado quando o usuário quiser conferir o
relatório completo depois de tudo validado.

### 2. Todas as abas da empresa, também dentro do Acervo Documental

**Correção**: `AcervoDocumentalEmpresa.tsx` ganhou a mesma barra de abas que
já existe na tela da empresa (Dados da Empresa, Dossiê / Laudo IA,
Inteligência 360, Esteira de Crédito, Acervo Documental, Conversas,
Simulações, Contratos Firmados, Histórico), substituindo o botão único
"Voltar para a empresa". Clicar em "Acervo Documental" ou "Dossiê / Laudo
IA" troca a visão na mesma página, sem navegação nenhuma (só alterna o
checklist pelo laudo, como já acontecia). Clicar em qualquer outra aba leva
direto pra ela na tela da empresa, num clique só — sem passar mais por
"Voltar para a empresa" no meio do caminho.

### 3. Botões que faziam a mesma ação duas vezes na mesma tela

Conferido cada botão marcado nas capturas contra o código: eram, de fato, a
mesma ação (mesmo `onClick`) desenhada duas vezes na mesma tela.

- O cabeçalho local do painel "Dados da empresa" (`EmpresaDadosWorkspace`,
  visível em cima de qualquer sub-painel: Resumo, Receita Federal, Cadastro
  interno...) tinha seu próprio par "Editar"/"Atualizar" — idêntico, mesmo
  `onClick`, ao "Editar"/"Atualizar cadastro" que já fica sempre visível no
  cabeçalho da empresa, acima das abas. Removido o par local.
- O painel "Resumo" tinha sua própria linha "Nova simulação" / "Novo
  contrato" / "Iniciar conversa" / "Acervo documental" — as três primeiras
  idênticas à barra "Quick Actions" que já fica sempre visível acima das
  abas (qualquer aba, não só o Resumo), e "Acervo documental" já é uma aba
  própria. Removida a linha inteira.

Nada foi removido do cabeçalho da empresa nem da barra "Quick Actions" — são
os únicos lugares que restaram pra cada uma dessas ações, com uma única
via de acesso por ação (nenhuma removida de vez, só a repetição).

### Verificação

- `npx tsc --noEmit` limpo.
- `npx vitest run` (suíte completa) → **540/540 testes passando** (sem
  mudança na contagem — as alterações desta entrega são de navegação/UI,
  não tocam nenhuma rota nem regra testada).
- `npx vite build --mode production` concluído sem erros.
- Conferido por leitura de código que `onAbrirLaudo` (prop removida) e as
  três props de botão removidas de `EmpresaDadosWorkspace`
  (`onNovaSimulacao`, `onNovoContrato`, `onIniciarConversa`) não tinham
  nenhum outro consumidor no projeto antes de remover (checado com busca em
  todo o `client/src`).

### Escopo desta correção

- `client/src/components/documentacao/DossieCreditoEmpresa.tsx` —
  `ProntidaoIdentidadeCard` e os tipos `IdentidadeCnpj`/`DocumentoInicialStatus`
  passaram a ser exportados; nenhuma mudança de comportamento neste arquivo.
- `client/src/components/documentos/DocumentosEntidade.tsx` — nova função
  `iniciarAnaliseIdentidade` (mesmo padrão de polling da Etapa 2/3), novo
  estado `identidadeCnpj`/`analisandoIdentidade`, `ProntidaoIdentidadeCard`
  renderizado inline; prop `onAbrirLaudo` e a navegação associada removidas.
- `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx` — barra de
  abas da empresa adicionada no lugar do botão único "Voltar para a
  empresa"; função `analisarEAbrirLaudo` (não usada mais) removida.
- `client/src/pages/colaborador/Empresas.tsx` — removido o par
  "Editar"/"Atualizar" duplicado do cabeçalho de `EmpresaDadosWorkspace` e a
  linha "Nova simulação"/"Novo contrato"/"Iniciar conversa"/"Acervo
  documental" duplicada do painel "Resumo"; props não mais usadas removidas
  de `EmpresaDadosWorkspace`.

## Extra 8 — Acervo Documental ainda repetia informação entre etapas e checklist

Foi enviada uma captura de tela do próprio Acervo Documental (depois da
Extra 7) com anotações coloridas e uma mensagem de voz longa apontando que a
página ainda estava "poluída, muito confusa, difícil navegação": o cartão
completo da Etapa 1 (laranja) e o painel da Etapa 2 (rosa) ficavam sempre
visíveis no topo, repetindo exatamente os mesmos 3 documentos (Cartão CNPJ,
QSA, Enquadramento) que já apareciam de novo no checklist (azul) logo
abaixo — os quatro blocos empilhados ao mesmo tempo, mesmo quando o usuário
só queria anexar o próximo documento. Pedido específico: unir a análise de
cada etapa com o checklist de upload da mesma etapa "no mesmo lugar";
terminada uma etapa, ela deve fechar sozinha (resumo de uma linha) e abrir
a próxima; a barra de abas da empresa (amarela) continua fixa como guia,
sem mexer.

### Causa

`DocumentosEntidade.tsx` desenhava, sempre, um por um, empilhados no topo
da tela: (1) o resumo da Etapa 1, (2) o cartão completo `ProntidaoIdentidadeCard`
com o resultado da Etapa 1, (3) o painel da Etapa 2/3 (Atos da Junta/Contrato
Social) — e só depois disso vinha o checklist com as abas "Identidade do
CNPJ" / "Documentação da Empresa" / "Documentação dos Sócios", cada uma com
os mesmos campos de upload já descritos nos blocos acima. Não havia
nenhuma relação entre qual aba do checklist estava selecionada e quais
blocos de análise apareciam — todos ficavam visíveis ao mesmo tempo, o
tempo todo, dobrando (ou triplicando) a quantidade de informação na tela.

### Correção

Os blocos de análise da Etapa 1 e da Etapa 2/3 foram movidos pra dentro do
cartão "Checklist de inclusão de documentos", logo abaixo do seletor de
abas (Identidade do CNPJ / Documentação da Empresa / Documentação dos
Sócios) e antes dos campos de upload — e cada um só é desenhado quando a
aba correspondente do checklist está selecionada:

- Resultado da Etapa 1 (resumo + `ProntidaoIdentidadeCard`) aparece só
  quando a aba ativa é "Identidade do CNPJ".
- Painel da Etapa 2/3 (Atos da Junta/Contrato Social, histórico de 12
  meses, avisos, próxima leva de documentos) aparece só quando a aba ativa
  é "Documentação da Empresa".
- Nenhum texto, campo ou regra de negócio foi alterado dentro desses dois
  blocos — foram só realocados pra dentro do checklist e amarrados à aba
  certa; o restante da tela (barra de abas da empresa, botões do
  cabeçalho, relatório consolidado sob demanda) não foi tocado.

Além disso, o cartão completo da Etapa 1 agora **fecha sozinho** assim que
fica apto pra avançar: em vez do `ProntidaoIdentidadeCard` inteiro (com
todos os documentos, confirmações e avisos), aparece só uma barra verde de
uma linha — "Etapa 1 concluída — Identidade do CNPJ validada" — com um
botão "Ver detalhes" pra reabrir o cartão completo sem perder nenhum dado,
se o usuário quiser conferir de novo. E assim que a análise da Etapa 1
termina apta, o checklist troca sozinho pra aba "Documentação da Empresa"
(a aba do CHECKLIST, dentro do Acervo Documental — não a barra de abas da
empresa lá em cima, que continua fixa como guia, exatamente como pedido),
já mostrando o painel de Atos da Junta pronto pra anexar o próximo
documento, sem o usuário precisar clicar em mais nada.

Resultado: a qualquer momento a tela mostra só a análise da etapa que o
usuário está olhando no checklist, nunca as três etapas empilhadas ao
mesmo tempo — a página ficou bem mais curta e cada seção mostra exatamente
o que é relevante pra quem está anexando aquele documento naquele momento.

### Verificação

- `npx tsc --noEmit` limpo.
- `npx vitest run` (suíte completa) → **540/540 testes passando** (sem
  mudança na contagem — mudança de layout/estado local, não toca nenhuma
  rota nem regra testada).
- `npx vite build --mode production` concluído sem erros.
- Conferido por leitura de código, linha a linha, que o JSX movido é
  idêntico ao original (nenhum texto, classe ou condição de negócio
  alterada) — só a localização e a condição de exibição (`secaoAtivaTitulo`)
  mudaram.

### Escopo desta correção

- `client/src/components/documentos/DocumentosEntidade.tsx` — blocos da
  Etapa 1 (resumo + `ProntidaoIdentidadeCard`) e da Etapa 2/3 (Atos da
  Junta/Contrato Social) movidos pra dentro do checklist, condicionados à
  aba ativa (`secaoAtivaTitulo`); novo estado `identidadeDetalhesAbertos`
  (colapsa o cartão da Etapa 1 depois de apta); `iniciarAnaliseIdentidade`
  passou a trocar a aba do checklist pra "Documentação da Empresa"
  automaticamente quando a Etapa 1 fica apta.

## Extra 9 — Relatório consolidado em modal + descrição dos documentos sob demanda (2026-08-20)

### Pedido do usuário

Novo print da tela de Acervo Documental (empresa "TOK CELL CELULARES E
ACESSORIOS LTDA"), com um X grande cobrindo praticamente toda a extensão
do "Relatório consolidado da análise documental" (que aparece embutido na
própria página assim que o usuário clica em "Relatório da análise") e
rabiscos em cima do checklist de anexação logo abaixo, mais mensagem de
voz longa. Pedidos específicos: (1) o relatório marcado com X não deve
mais abrir dentro da própria página de documentação — deve abrir "em
outro modal"; (2) a parte de anexar documentos (checklist) também precisa
diminuir — "tem muita informação repetida, pendências e bloqueios,
contrato social, alteração, anexar" — trocando texto sempre visível por um
ícone de informação que só mostra o conteúdo ao clicar, do jeito que já
tinha sido pedido antes; (3) zero regressão, zero quebra em qualquer parte
do sistema.

### Causa

O "Relatório consolidado da análise documental" (6 seções: resumo em
números, documentos analisados, documentos aguardando análise, documentos
faltantes, resultado por etapa, observações e próxima ação — cada
documento com seu próprio card de `ResultadoAnaliseDocumento`) era
renderizado como mais um bloco dentro do fluxo normal da página, logo
acima do checklist de upload. Ao clicar em "Relatório da análise", esse
bloco inteiro aparecia entre o cabeçalho e o checklist, empurrando toda a
área de anexação pra muito mais embaixo — exatamente o oposto do pedido
de "análise e documentos no mesmo lugar, sem precisar rolar demais" já
atendido no Extra 8 pra Etapa 1/2/3.

Separadamente, cada um dos ~19 campos de upload do checklist (Certidão de
Regularidade do FGTS, Contrato Social, Relatório SCR, PGDAS, etc.) sempre
mostrava, abaixo do botão "Anexar", um parágrafo fixo com a descrição
completa do documento (e o Cartão CNPJ tinha um parágrafo extra só dele) —
mesmo pra quem já sabia o que era aquele documento e só queria anexar o
arquivo.

### Correção

**Relatório em modal.** O bloco inteiro do relatório consolidado (as 6
seções, sem nenhum texto/cálculo alterado) passou a ser desenhado dentro
de uma janela modal (`fixed inset-0` com fundo escurecido, painel branco
central com rolagem própria, cabeçalho fixo com título + botão "Gerar PDF
deste estado" + botão "X" de fechar) — o mesmo padrão visual já usado no
modal de "Exportar documentos" desta mesma tela. Um novo estado,
`relatorioModalAberto`, controla só a visibilidade: clicar em "Relatório
da análise" continua buscando o estado mais atual no servidor e agora
também abre o modal; fechar no "X" apenas esconde o modal (o resultado já
buscado fica em cache — reabrir não refaz a consulta). A página de
documentação, por trás do modal, nunca mais é empurrada pra baixo por
causa do relatório.

**Descrição dos documentos sob demanda.** Cada card de upload do checklist
ganhou um pequeno ícone "i" ao lado do título do documento (só aparece
quando aquele campo tem descrição ou é o Cartão CNPJ). O parágrafo de
descrição — que antes ficava sempre visível, ocupando uma linha extra em
praticamente todos os ~19 cards — agora só aparece quando o usuário clica
no ícone (novo estado `descricaoVisivel`, por tipo de documento), e some
de novo ao clicar de novo. Nenhuma outra informação do card (nome, contador
de arquivos, botão "Anexar", lista de arquivos já anexados, observação,
validação) foi tocada ou escondida — só a descrição explicativa, que é a
parte que se repetia em quase todo campo.

Os painéis de análise por etapa (Etapa 1 "Identidade do CNPJ" e Etapa 2/3
"Atos da Junta/Contrato Social", entregues no Extra 8) e as informações de
"Avisos", "Pendências que bloqueiam o avanço" e "Próxima leva de
documentos" dentro deles **não foram alterados nesta correção** — são
alertas ativos sobre o que está impedindo o avanço da análise, então
esconder esse conteúdo atrás de um clique arriscaria o usuário não ver por
que algo está bloqueado, o que contraria a exigência de zero regressão.
Se o usuário quiser que esses avisos também fiquem sob demanda, é um
próximo passo à parte, pra tratar com o mesmo cuidado.

### Verificação

- `npx tsc --noEmit` limpo.
- `npx vitest run` (suíte completa) → **540/540 testes passando** (sem
  mudança na contagem — mudança de layout/estado local, não toca nenhuma
  rota nem regra testada).
- `npx vite build --mode production` concluído sem erros.
- Conferido por leitura de código que todo o conteúdo movido pra dentro do
  modal é idêntico ao original (nenhum texto, cálculo ou condição de
  negócio alterada) — só a estrutura de contêiner (overlay + painel com
  cabeçalho fixo + corpo com rolagem) e a condição de exibição
  (`relatorioModalAberto`) mudaram; e que os dois parágrafos de descrição
  do checklist continuam existindo no código exatamente como antes, só
  agora condicionados a `descricaoVisivel[tipo]`.

### Escopo desta correção

- `client/src/components/documentos/DocumentosEntidade.tsx` — bloco do
  "Relatório consolidado da análise documental" convertido de seção
  inline pra modal (`relatorioModalAberto`); botão "Relatório da análise"
  passou a abrir o modal ao carregar; novo botão "X" fecha só a
  visibilidade, sem descartar o dado já carregado; novo ícone de
  informação por campo do checklist, controlado por `descricaoVisivel`,
  substitui o parágrafo de descrição sempre visível.

## Extra 10 — Abas numeradas, navegação entre empresas e relatório mais enxuto (2026-08-20)

### Pedido do usuário

Dois prints da mesma tela do Extra 9 (relatório já abrindo em modal,
confirmado como correto pelo usuário) mais mensagem de voz com três
pedidos: (1) deixar explícito que o checklist segue uma ordem de etapas
("primeira etapa identidade do CNPJ, segunda etapa documentação, terceira
etapa...") e como se avança entre elas; (2) dentro da página de uma
empresa (o Acervo Documental) não existe nenhum jeito de sair ou trocar de
empresa a não ser o botão "voltar" do navegador -- pedido explícito pra
corrigir; (3) mesmo dentro do modal, o relatório ainda tem informação
demais -- em especial as seções "Documentos ainda faltantes para anexar"
e "Resultados consolidados por etapa" (que repete "pendências e
bloqueios") -- pedido pra deixar só o título/essencial visível e esconder
o resto atrás de um ícone de informação, igual ao mecanismo já usado em
outros lugares do sistema.

### Correção 1 — Abas do checklist numeradas

Cada aba do checklist ("Identidade do CNPJ", "Documentação da Empresa",
"Documentação dos Sócios"...) passou a ser rotulada como "Etapa 1 —
Identidade do CNPJ", "Etapa 2 — Documentação da Empresa" etc. (o número
segue a posição real da aba pra aquela tela, calculado a cada renderização
-- não é um valor fixo). O texto interno usado nas comparações de código
(`secaoAtivaTitulo === "Identidade do CNPJ"` e afins, que já existiam) não
mudou, só o rótulo mostrado no botão. Uma aba cujos campos já estão todos
preenchidos agora também fica destacada em verde com um ícone de check,
pra reforçar visualmente o que já foi concluído.

Sobre "avançar automático ou botão": o avanço automático da Etapa 1 pra
Etapa 2, entregue no Extra 8, continua funcionando (assim que Cartão CNPJ
+ QSA são validados, o checklist já troca de aba sozinho). Não estendi
esse avanço automático da Etapa 2 pra Etapa 3: a aba "Documentação da
Empresa" cobre 19 campos (Atos da Junta, Contrato Social, CCS, CCF,
CENPROT, CND, PGDAS, DEFIS, faturamento, fotos...), e `apto_para_avancar`
nessa etapa reflete só a comprovação de Atos da Junta + Contrato Social —
avançar automaticamente nesse momento esconderia os outros ~15 campos que
ainda podem estar pendentes, o que seria uma regressão real (documento
obrigatório escondido). Prefiro deixar como está e tratar isso à parte se
o usuário confirmar que quer esse comportamento.

### Correção 2 — Navegação entre empresas dentro do Acervo Documental

`AcervoDocumentalEmpresa.tsx` ganhou um botão fixo "← Voltar para a lista
de empresas" no topo da página, acima do nome da empresa, que leva direto
pra `/colaborador/empresas` (de onde qualquer outra empresa pode ser
aberta com um clique, usando o seletor "Trocar empresa ou buscar outra..."
que já existe naquela tela). Antes, a única forma de sair da página do
acervo de uma empresa era o botão "voltar" do navegador.

### Correção 3 — Relatório consolidado mais enxuto

Dentro do modal do relatório (Extra 9), duas seções tinham texto sempre
visível e foram condensadas com o mesmo padrão de ícone "i" já usado em
`ResultadoAnaliseDocumento.tsx` (seção 1) e no checklist (Extra 9):

- Seção 3 "Documentos ainda faltantes para anexar": cada card agora
  mostra só o nome do documento e o selo Obrigatório/Recomendado. A
  etapa, a finalidade e a origem (mapa documental de crédito) só
  aparecem ao clicar no ícone "i" ao lado do nome.
- Seção 4 "Resultados consolidados por etapa": cada card mantém título,
  selo de status e a conclusão da análise (a "manchete" da informação,
  que sozinha já diz o essencial). As listas "O que foi confirmado",
  "Observações" e "Pendências e bloqueios" só aparecem ao clicar no ícone
  "i".

Nenhum dado foi removido -- é sempre o mesmo conteúdo, calculado do mesmo
jeito; só a exibição inicial mudou. Os avisos e pendências que aparecem
*fora* do modal, direto no painel de análise da Etapa 2/3 (dentro do
checklist, sempre visível enquanto a etapa está em andamento) não foram
tocados nesta nem na correção anterior -- continuam sempre visíveis ali,
porque é o lugar onde o usuário realmente age para desbloquear o avanço;
o relatório em modal é só uma segunda leitura/consulta.

### Verificação

- `npx tsc --noEmit` limpo.
- `npx vitest run` (suíte completa) → **540/540 testes passando** (sem
  mudança na contagem).
- `npx vite build --mode production` concluído sem erros.
- Conferido por leitura de código que as condições de negócio que já
  existiam (`secaoAtivaTitulo === "..."`, `apto_para_avancar`,
  `contarPreenchidos`) não foram alteradas -- só rótulos, navegação e a
  exibição inicial de duas seções do relatório.

### Escopo desta correção

- `client/src/components/documentos/DocumentosEntidade.tsx` — rótulo
  "Etapa N —" e destaque verde nas abas do checklist; novos componentes
  `CardDocumentoFaltante` e `CardResultadoEtapa` (ícone "i" pra
  etapa/finalidade/origem e confirmações/observações/pendências) usados
  nas seções 3 e 4 do relatório em modal.
- `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx` — botão
  "Voltar para a lista de empresas" no topo da página.

## Extra 11 — Acompanhamento Bancário: menos poluição e separação de quem parou (2026-08-20)

### Pedido do usuário

Dois prints da tela "Acompanhamento Bancário" (lista de empresas com
monitoramento semanal) e mensagem de voz pedindo correção "pontual,
urgente". Pedidos: (1) a tela está confusa -- nome da empresa e uma fileira
de botões repetida em toda linha; organizar em blocos e adicionar filtros
dinâmicos; (2) existem empresas na lista cuja "Próxima atualização" já
passou há meses (o usuário cita o mês 6, hoje é agosto) e que continuam
ocupando a tela como se estivessem em dia -- pediu uma regra pra tirar
quem está parado há dez ou quinze dias da visão principal, sem precisar
ficar olhando pra elas o tempo todo.

### Causa

Cada linha da tabela desenhava, sempre visíveis ao mesmo tempo, as 11
ações possíveis (Detalhes, Extratos, Editar, Atualizar cadastro, Atualizar
semana, + Banco, WhatsApp, Imprimir, Exportar XLS, Gerar relatório,
Prorrogar/Encerrar) -- a maior fonte de poluição visual apontada. Além
disso, a lista já tinha uma lógica de "parados" (`status_pendente` /
`atualizacao_pendente`, calculada no servidor), mas ela não refletia
quanto tempo, de fato, uma empresa está sem receber nenhuma atualização
desde a data prevista -- por isso empresas com "Próxima atualização" de
meses atrás continuavam misturadas, sem destaque, junto de quem está em
dia.

### Correção

**Ações em blocos.** `renderActionButtons` continua com exatamente as
mesmas 11 ações, os mesmos textos e o mesmo comportamento de cada uma
(nenhuma rota, chamada de API ou confirmação foi alterada) -- só a
exibição mudou: ficam sempre visíveis as 3 mais usadas no dia a dia
(Detalhes, Atualizar semana, WhatsApp), e as outras 8 foram agrupadas
atrás de um botão "Mais ações ▾", que abre um menu compacto e fecha
sozinho ao clicar fora dele (mesmo padrão do seletor de empresas de
`Empresas.tsx`) ou ao escolher uma ação.

**Separação de quem parou.** Foi criada uma regra puramente de exibição
(nenhum dado é apagado, encerrado ou alterado no banco): calcula-se
`diasAtrasoAtualizacao`, os dias corridos desde a "Próxima atualização"
prevista até hoje. Acompanhamentos com 10 dias ou mais de atraso (
`DIAS_LIMITE_SEM_MOVIMENTO`) saem da lista principal "Acompanhamentos
cadastrados" e passam a aparecer só dentro de um bloco separado, "Sem
movimentação há mais de 10 dias", que já vem **recolhido** por padrão
(um clique mostra os registros ali dentro, exatamente com as mesmas
informações e ações de sempre). Os contadores do topo da tela (Ativos,
Pendentes, Positivas, Negativas, Prontos, Prorrogados) e os filtros já
existentes (busca, banco, gerente, status, "Apenas pendentes") não foram
alterados -- continuam funcionando exatamente como antes, aplicados antes
dessa nova separação.

Encerrados não entram nessa regra (a função retorna 0 dias de atraso para
quem já está com `status = "encerrado"`), então quem já foi formalmente
encerrado continua só onde já aparecia, via o filtro de status.

### Verificação

- `npx tsc --noEmit` limpo.
- `npx vitest run` (suíte completa) → **540/540 testes passando** (sem
  mudança na contagem -- mudança de exibição, nenhuma rota nem cálculo de
  negócio já testado foi tocado).
- `npx vite build --mode production` concluído sem erros.
- Conferido por leitura de código que a tabela (desktop) e os cards
  (mobile) usados nos dois blocos são a mesma marcação de antes, agora
  numa função reaproveitada (`renderListaAcompanhamentos`) parametrizada
  pela lista recebida -- nenhuma coluna, campo ou cálculo de saldo/rating/
  status foi alterado.

### Escopo desta correção

- `client/src/pages/colaborador/AcompanhamentoBancario.tsx` — nova
  constante `DIAS_LIMITE_SEM_MOVIMENTO` e função `diasAtrasoAtualizacao`;
  novas listas derivadas `listaEmAndamento` / `listaSemMovimento`; novo
  bloco recolhido "Sem movimentação"; `renderActionButtons` reorganizado
  em ações sempre visíveis + menu "Mais ações"; tabela/cards extraídos
  para `renderListaAcompanhamentos`, reaproveitada nos dois blocos.
