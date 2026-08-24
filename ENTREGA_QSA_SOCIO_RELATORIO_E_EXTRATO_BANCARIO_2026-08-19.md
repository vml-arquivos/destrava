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

## Extra 12 — PDF do relatório documental: fim das páginas em branco e lista de faltantes enxuta (2026-08-20)

### Pedido do usuário

O usuário anexou o PDF baixado do "Relatório de análise documental" (o
arquivo que o botão "Gerar PDF" produz, diferente do modal em tela já
ajustado nos Extras 9/10) com a seguinte reclamação: o relatório está
desorganizado, com "um pedaço de informação, aí uma página vazia, depois
mais informação, mais espaço vazio"; pediu formatação profissional e,
especificamente, que a seção "Documentos ainda faltantes para anexar"
pare de mostrar código técnico, finalidade e "Origem: ..." embaixo de
cada documento -- só o nome e a etiqueta (Obrigatório/Recomendado),
"enxuto".

Depois de receber o primeiro PDF de exemplo corrigido, o usuário mandou
prints apontando que ainda sobrava um vão grande logo abaixo do título
"1. Documentos anexados e analisados" -- o título aparecia sozinho no
fim da página, sem nenhum conteúdo visível embaixo dele -- e reforçou:
"isso tem que ser totalmente profissional... um relatório que vai ser
enviado pros clientes". Essa segunda rodada corrigiu justamente esse
resquício.

### Causa

O PDF é gerado renderizando um HTML com Chromium (mesmo motor usado em
orçamentos e contratos). A causa raiz teve duas camadas:

1. Todo `<h2>` (título de cada uma das 7 seções do relatório) tinha
   `page-break-after: avoid` (nunca deixar um título sozinho no fim da
   página) combinado com blocos de documento (`.doc`, `.stage`) com
   `page-break-inside: avoid` (nunca cortar um documento ao meio). Como a
   seção "Documentos ainda faltantes para anexar" tinha 14 documentos
   nesse formato verboso, blocos inteiros não cabiam no espaço restante
   da página e o Chromium empurrava tudo para a página seguinte,
   deixando um vão enorme.
2. Na primeira correção, o `page-break-after: avoid` do `h2` foi apenas
   removido para destravar esse empurrão -- só que isso trocou um
   problema pelo outro: agora era o título que ficava sozinho no fim da
   página (o "Amostra objetiva dos dados lidos" do primeiro documento da
   seção 1 é um bloco alto, com grade de 4 a 6 campos, que também não
   cabia no espaço restante e pulava sozinho, deixando o título acima
   dele "pendurado" sem nada embaixo -- foi exatamente esse vão que o
   usuário apontou nos prints).

### Correção

**Lista de faltantes enxuta.** A seção 3 do PDF mostra só o nome do
documento e a etiqueta Obrigatório/Recomendado -- código técnico
(`documento.codigo`), a etapa, o parágrafo de finalidade e a linha
"Origem: ..." saíram do PDF (diferente do modal em tela, o PDF é estático
e impresso, então essas informações não podem ficar atrás de um ícone de
clique como foi feito na tela no Extra 10 -- aqui elas simplesmente não
entram mais no documento).

**Paginação profissional, sem vão nem título solto.** A combinação final
de regras resolve as duas pontas ao mesmo tempo:

- `h2` voltou a ter `page-break-after: avoid` -- um título nunca fica
  mais sozinho no fim da página.
- Os blocos de documento (`.doc`, `.stage`) deixaram de ter
  `page-break-inside: avoid` e passaram a `page-break-inside: auto` --
  ou seja, se um documento for alto demais pra caber inteiro no espaço
  que sobrou, o Chromium agora pode continuar o conteúdo dele (fundo
  colorido e borda incluídos) na página seguinte, em vez de empurrar o
  bloco inteiro (e o título junto) para uma página nova. Isso é o mesmo
  comportamento que uma tabela tem quando não cabe inteira numa página.
- Os cards compactos da lista de faltantes (`.doc.compact`) continuam
  com `page-break-inside: avoid` -- são pequenos o bastante (uma linha)
  pra nunca precisarem ser cortados, então mantêm o corte limpo entre um
  documento e outro.
- As tabelas (blocos analisados, próximas etapas) continuam com
  `page-break-inside: auto`, herdado da primeira rodada.

Na prática, cada seção agora ocupa o espaço que realmente tem disponível
em cada página -- sem vão em branco e sem título isolado -- e, quando um
bloco de documento precisa continuar na página seguinte, ele simplesmente
continua (mesmo efeito visual de uma tabela que vira a página), sem
nenhum corte feio ou sobreposição.

### Verificação

Como o PDF é gerado renderizando HTML/CSS num Chromium sem cabeça (sem
banco de dados ou servidor real disponível neste ambiente de trabalho
para emitir um relatório de verdade), a verificação foi feita em duas
rodadas, sempre recriando os mesmos dados do relatório da empresa TOK
CELL CELULARES E ACESSORIOS LTDA anexado pelo usuário (5 documentos
analisados, 14 faltantes, 2 resultados por etapa etc.):

- **Antes de qualquer correção:** 8 páginas, com trechos quase inteiramente
  em branco logo após "Resumo executivo" e após "Documentos anexados e
  aguardando análise" -- reproduzindo o problema original relatado.
- **Primeira correção (lista enxuta + `h2` sem `avoid`):** 7 páginas, sem
  vãos grandes no meio do documento, mas com o título da seção 1
  aparecendo sozinho no fim de uma página -- o problema que o usuário
  apontou nos prints da segunda rodada.
- **Correção final (`h2` com `avoid` + `.doc`/`.stage` com conteúdo
  divisível entre páginas):** **6 páginas**, sem nenhum vão em branco e
  sem nenhum título isolado -- confirmado visualmente, página por página,
  convertendo o PDF gerado em imagem.
- Na última rodada, em vez de recriar a função manualmente, o script de
  verificação passou a **extrair e executar a função real** direto de
  `server/routes/documentacao.ts` (via esbuild, só removendo a tipagem
  TypeScript) -- então o PDF conferido é gerado pelo mesmo código que
  está no arquivo entregue, não por uma cópia à parte.
- `npx tsc --noEmit` limpo.
- `npx vitest run` (suíte completa) → **540/540 testes passando**.
- `npx vite build --mode production` concluído sem erros.
- Em anexo a esta entrega vai um PDF de exemplo
  (`exemplo_relatorio_documental_corrigido.pdf`), gerado com os mesmos
  dados da TOK CELL pela função real do sistema, para conferência visual
  antes de gerar um relatório de verdade pelo sistema.

### Escopo desta correção

- `server/routes/documentacao.ts` — dentro de
  `gerarHtmlRelatorioDocumental`: template da seção "Documentos ainda
  faltantes para anexar" simplificado (só nome + etiqueta); `h2` mantém
  `page-break-after: avoid`; `.doc`/`.stage` passaram de
  `page-break-inside: avoid` para `page-break-inside: auto` (podem
  continuar na página seguinte quando não cabem inteiros); nova classe
  `.doc.compact` (com `page-break-inside: avoid`, mantendo os cards
  enxutos de faltantes sempre inteiros numa única página); `table`
  mantém `page-break-inside: auto`. Nenhuma outra seção do PDF, rota ou
  cálculo de dados foi alterado -- só a formatação/paginação e o
  template dessa seção específica.

## Extra 13 — Visualização em blocos e empresas recentes (Acompanhamento Bancário + Clientes PJ) (2026-08-20)

### Pedido do usuário

Depois de já ter atualizado o próprio repositório com o Extra 11 (menos
botões visíveis por linha no Acompanhamento Bancário), o usuário pediu,
por mensagem de voz, três coisas relacionadas, pra serem feitas nas duas
telas e "da mesma maneira, sigam um padrão":

1. Opção de **visualização em blocos** (cards), tanto no Acompanhamento
   Bancário quanto na tela de empresas (Clientes PJ) -- além da tabela/
   lista que já existe.
2. Na tela de "Clientes PJ" (`/colaborador/empresas`), filtros mais
   eficientes e precisos pra buscar empresas -- hoje o único filtro
   visível é o campo de busca e uns selects escondidos dentro de um
   combobox que precisa ser aberto.
3. Que a tela de empresas já mostre, de cara, um conjunto de empresas
   "com as últimas movimentações" (as mais recentemente atualizadas),
   em vez de começar vazia esperando uma busca.

### Causa / situação anterior

- **Acompanhamento Bancário**: já tinha tabela (desktop) e cards
  (mobile, fallback automático em telas pequenas), mas nenhuma opção de
  alternar pra visualização em blocos no desktop.
- **Empresas / Clientes PJ**: a lista de empresas só existe dentro do
  dropdown do combobox de busca (que precisa ser clicado pra abrir); os
  filtros de status/porte/origem ficam escondidos dentro desse mesmo
  dropdown; e, antes de escolher uma empresa, a tela principal mostrava
  só um quadro vazio "Selecione uma empresa" -- nada de lista, blocos ou
  sugestão de por onde começar.

### Correção

**Acompanhamento Bancário** (`AcompanhamentoBancario.tsx`): um alternador
"Lista / Blocos" foi adicionado no cabeçalho de "Acompanhamentos
cadastrados" (visível só em telas grandes -- no celular já era sempre em
cards, isso não muda). Em "Blocos", a tabela desktop é substituída por
uma grade de cards (2 a 3 colunas conforme a largura da tela), com os
mesmos dados de cada linha (empresa, CNPJ, banco, rating, responsável,
próxima atualização, saldo da semana, status) e as mesmas ações de
sempre (`renderActionButtons`, sem nenhuma mudança de comportamento). O
alternador vale tanto pro bloco "Acompanhamentos cadastrados" quanto pro
bloco recolhido "Sem movimentação" (Extra 11), já que os dois reaproveitam
a mesma função de renderização.

**Empresas / Clientes PJ** (`Empresas.tsx`): o quadro vazio "Selecione
uma empresa" foi substituído por um painel com três partes, mostrado
sempre que nenhuma empresa está aberta:

1. **Filtros rápidos sempre visíveis** -- chips de status (Todos, Ativo,
   Inativo, Prospecto, Cliente, Ex-cliente) e selects de porte/origem,
   agora na tela principal, sem precisar abrir o combobox. Usam
   exatamente os mesmos estados (`filtroStatus`, `filtroPorte`,
   `filtroOrigem`, `busca`) que o combobox já usava -- filtrar em
   qualquer um dos dois lugares (combobox ou aqui) dá o mesmo resultado,
   e um botão "Limpar filtros" aparece quando algum filtro está ativo.
2. **Empresas recentes** -- lista `empresas` (já carregada e filtrada
   pelo servidor assim que a página abre, isso já existia) ordenada pela
   mais recentemente atualizada (`updated_at`, com `created_at` como
   respaldo) e limitada a 24 pra não sobrecarregar a tela; muda
   automaticamente pra "Resultado da busca" quando algum filtro ou busca
   está ativo.
3. **Alternador Blocos/Lista**, no mesmo padrão visual do Acompanhamento
   Bancário -- em blocos, cada empresa vira um card clicável (avatar com
   iniciais, razão social, status, porte, cidade/UF, data da última
   atualização); em lista, uma versão compacta de uma linha por empresa,
   igualmente clicável. Clicar em qualquer card ou linha chama a mesma
   função `selecionar(emp)` que o combobox já usava pra abrir a empresa
   -- nenhum comportamento de abertura/edição foi alterado.

Em ambas as telas, nenhuma rota de API, cálculo de dado ou ação existente
foi tocada -- só a forma como a mesma informação já carregada é exibida,
e dois novos jeitos (blocos/lista) de olhar pra ela.

### Verificação

Como são mudanças de exibição em componentes React que dependem de dados
carregados de um banco/servidor não disponível neste ambiente de
trabalho (não há como abrir a tela de verdade e clicar), a verificação
seguiu o mesmo padrão usado nos Extras 9, 10 e 11 (mudanças de UI sem
pipeline de renderização própria):

- `npx tsc --noEmit` limpo (o TypeScript valida a estrutura de todo o
  JSX novo -- inclusive achou e um parâmetro sem tipo explícito, que foi
  corrigido antes de prosseguir).
- `npx vitest run` (suíte completa) → **540/540 testes passando**, sem
  nenhuma mudança de contagem.
- `npx vite build --mode production` concluído sem erros (bundle de
  `AcompanhamentoBancario` foi de 151,02 kB para 154,76 kB gzip; o de
  `Empresas` foi de 266,82 kB para 273,08 kB gzip -- crescimento
  esperado pelo JSX novo).
- Conferido por leitura de código que: (a) nenhum `<button>` ficou
  aninhado dentro de outro `<button>` nos novos cards (o que geraria
  HTML inválido); (b) o carregamento inicial de `empresas` em
  `Empresas.tsx` já roda assim que a página abre (não depende do
  combobox ser aberto), então a grade de "empresas recentes" aparece
  imediatamente; (c) os filtros novos usam os mesmos estados que o
  combobox já usava, sem duplicar lógica de busca.

### Escopo desta correção

- `client/src/pages/colaborador/AcompanhamentoBancario.tsx` — novo
  estado `visualizacao` ("lista" | "blocos"); alternador no cabeçalho de
  "Acompanhamentos cadastrados"; nova grade de cards desktop dentro de
  `renderListaAcompanhamentos`, condicionada a `visualizacao === "blocos"`;
  tabela existente agora condicionada a `visualizacao === "lista"`; bloco
  mobile (cards) inalterado.
- `client/src/pages/colaborador/Empresas.tsx` — novo estado
  `visualizacaoEmpresas`; novo `useMemo` `empresasRecentes` (ordenação
  client-side por `updated_at`, limite de 24); bloco `!selecionada`
  reescrito com filtros rápidos + alternador + grade/lista de empresas
  recentes, substituindo o antigo quadro vazio "Selecione uma empresa".
  Nenhuma rota, filtro server-side ou fluxo de seleção/edição de empresa
  foi alterado.

## Extra 14 — Empresas recentes mais enxuto (só quem tem documento + análise) e botão Voltar (2026-08-20)

### Pedido do usuário

Depois de ver o Extra 13 já no ar, o usuário mandou prints e pediu três
ajustes na tela de "Clientes PJ":

1. O bloco "Empresas recentes" estava mostrando 24 empresas com rolagem
   grande demais. Pediu pra reduzir bastante -- na mensagem de voz ele
   cita "quatro" e depois se corrige pra "seis"; segui a última instrução
   e deixei em **6**, é uma constante única (`LIMITE_EMPRESAS_RECENTES`)
   fácil de ajustar se o número certo for outro.
2. O bloco deveria mostrar **só empresas que já têm documento anexado E
   alguma análise iniciada** no Acervo Documental -- não qualquer empresa
   recente.
3. Cada card deveria trazer só o essencial, sem crescer: nome da empresa,
   "análise iniciada" e quantos documentos foram anexados -- nada de
   descrição ou informação extra.
4. Um botão "Voltar" na tela de detalhe da empresa, pra sair sem precisar
   clicar em "Trocar empresa ou buscar outra" nem usar o voltar do
   navegador.

### Causa / situação anterior

O Extra 13 mostrava as 24 empresas mais recentes **de qualquer status**,
sem considerar se elas já tinham documentação anexada -- por isso a lista
ficava longa e cheia de empresas que ainda nem começaram o processo
documental, exigindo rolagem grande. Além disso, `GET /api/empresas` (que
alimenta a tela) nunca trouxe contagem de documentos nem status de
análise -- essa informação só existia por empresa, sob demanda, dentro do
Acervo Documental de cada uma (não havia nenhum endpoint que desse essa
resposta pra várias empresas de uma vez). E o botão "Voltar" da tela de
detalhe só existia no celular (`sm:hidden`) -- no desktop, a única forma
de sair de uma empresa aberta era clicar em "Trocar empresa" (que abre a
busca) ou usar o botão voltar do navegador.

### Correção

**Novo endpoint leve de resumo documental.** Foi criada a rota
`GET /api/documentacao/empresas/documentos-resumo`
(`server/routes/documentacao.ts`), que devolve, pra cada empresa que já
tem pelo menos 1 documento anexado (`documentacao_bloco_arquivos`, mesma
tabela usada pelo Acervo Documental, contando arquivos com status
diferente de `'arquivado'`) **e** pelo menos 1 análise iniciada
(`documentacao_analises_ia`), um objeto `{ empresa_id, documentos_count,
analise_iniciada }`. O filtro já acontece no banco -- o front só recebe
quem já se qualifica. É uma rota nova e só de leitura (`SELECT`), não
altera nem cria nada; nenhuma rota existente foi tocada.

**"Empresas recentes" agora cruza com esse resumo.** `Empresas.tsx` busca
esse resumo uma vez ao carregar a página e cruza (por `empresa_id`) com a
lista de empresas já carregada. O bloco "Empresas recentes" passou a
mostrar só quem aparece nesse resumo (documento + análise), ordenado pela
mais recentemente atualizada, limitado a 6 -- sem a rolagem grande de
antes. Se a chamada ao resumo falhar por qualquer motivo, o bloco
simplesmente fica vazio (com uma mensagem explicando o critério); o resto
da tela (busca, filtros, abrir empresa) continua funcionando normalmente.

**Cards enxutos.** Os cards (blocos e lista) trocaram porte/cidade/UF por
duas informações só: uma etiqueta "Análise iniciada" e "N documento(s)
anexado(s)" -- sem aumentar o tamanho do card, exatamente o pedido.

**Botão Voltar sempre visível.** O botão que já existia (`ArrowLeft`,
volta pra lista e limpa a empresa selecionada) deixou de ficar restrito
ao celular (`sm:hidden` removido) e ganhou o texto "Voltar" ao lado do
ícone em telas maiores. Mesmo `onClick` de sempre -- nenhum comportamento
novo, só ficou visível em qualquer tamanho de tela.

### Verificação

- `npx tsc --noEmit` limpo.
- `npx vitest run` (suíte completa) → **540/540 testes passando**, sem
  nenhuma mudança de contagem.
- `npx vite build --mode production` concluído sem erros.
- Conferido por leitura de código: a query do novo endpoint usa
  subconsultas correlacionadas (`COUNT(DISTINCT ...)` e `EXISTS`) em vez
  de `JOIN`s diretos entre `documentacao_bloco_arquivos` e
  `documentacao_analises_ia` -- evita contar documentos em dobro por
  causa do cruzamento entre as duas tabelas relacionadas à mesma empresa.
- Como não há banco de dados de verdade disponível neste ambiente de
  trabalho pra rodar a query contra dados reais, a verificação foi por
  leitura cuidadosa do SQL e comparação com o padrão já usado em outras
  consultas deste mesmo arquivo (`server/routes/documentacao.ts:2244-2254`,
  que já junta `documentacao_entidade_blocos` → `documentacao_bloco_arquivos`
  → `documentos_arquivos` pra montar o Acervo Documental) -- mesma
  tabela, mesmo filtro de status (`<> 'arquivado'`), já usado e testado
  em produção pelo resto do sistema.

### Escopo desta correção

- `server/routes/documentacao.ts` — nova rota
  `GET /empresas/documentos-resumo` (dentro do router montado em
  `/api/documentacao`), só leitura, aditiva.
- `client/src/pages/colaborador/Empresas.tsx` — novo estado
  `documentosResumo` + `useEffect` que busca o resumo uma vez;
  `LIMITE_EMPRESAS_RECENTES` de 24 para 6; `empresasRecentes` agora
  filtra por quem tem resumo; cards (blocos e lista) trocaram
  porte/cidade por "Análise iniciada" + contagem de documentos; texto do
  cabeçalho e da mensagem vazia atualizados; botão "Voltar" da tela de
  detalhe agora visível em qualquer tamanho de tela. Nenhuma rota
  existente, filtro server-side ou fluxo de seleção/edição de empresa foi
  alterado.


## Extra 15 — confiabilidade documental, fallbacks honestos e confiança da leitura (2026-08-22)

Esta etapa consolidou as correções de confiabilidade previstas no documento de execução, sem alterar rotas de negócio existentes, schema, dados persistidos ou a ordem dos fluxos documentais.

### Consulta documental avançada

`buscarAnalisesDocumentaisAvancadas` passou a devolver um resultado estruturado com `analises` e `falhaConsulta`. Ausência da tabela esperada (`42P01`/`does not exist`) é tratada como ausência de histórico e retorna lista vazia sem marcar falha. Erro real de consulta continua sendo distinguido e sinalizado. O resultado de Inteligência 360 propaga esse estado como `falha_consulta_documental`, e a tela exibe um aviso discreto somente quando houve falha real, sem bloquear a análise determinística nem transformar ausência de dados em erro falso.

### Fallback operacional

Os quatro consumidores identificados de `fallback_operacional` — os três fluxos de IA do CRM e a análise de Triagem — passaram a informar de maneira não intrusiva quando o conteúdo exibido veio do fallback operacional. O aviso fica próximo do resultado e não altera geração, edição, qualificação, envio, status ou qualquer ação do usuário. O sistema não apresenta conteúdo determinístico como se fosse uma resposta efetivamente gerada por IA.

### Confiança da leitura

O builder compartilhado de apresentação documental (`shared/documentalPresentation.ts`) passou a incluir o campo **Confiança da leitura** quando `nivel_confianca` é numérico. Valores entre 0 e 1 são convertidos para percentual; valores entre 0 e 100 são preservados como percentual. A alteração mantém a assinatura e o retorno do builder, evita duplicação quando a confiança já aparece na amostra de dados e se aplica aos caminhos genérico e societário, alcançando tela, dossiê e PDF quando o dado existe.

### Cartão CNPJ

Quando o Cartão CNPJ existe, a extração falha e não há data manual disponível, o analisador mantém a redução de score de 5 pontos e agora gera o alerta explícito `cartao_cnpj_extracao_falhou`, com severidade média e recomendação para revisar o documento ou informar a data manual. O cenário manual continua sem esse alerta quando a data foi fornecida.

### Endpoints genéricos sem worker

Os dois endpoints genéricos de IA documental que não possuem consumidor ativo nem worker implementado passaram a responder **HTTP 501 Not Implemented** com mensagem clara, antes de qualquer inserção de pendência ou estado de aguardando. O endpoint de consulta das análises e os endpoints especializados permaneceram intactos. A ausência de consumidores foi confirmada por busca no frontend e no servidor.

### Rotulagem determinística

Os rótulos do Acompanhamento Bancário que chamavam parecer técnico determinístico de IA foram corrigidos para **parecer técnico**, sem alteração do checkbox, dos dados, da geração do relatório ou das rotas. A referência a IA foi mantida somente onde há chamada real a modelo.

## Extra 16 — robustez, limpeza e testes reais (2026-08-22)

### Motor semanal preservado

A varredura confirmou que `analisadorSemanal.ts` não é órfão: `server/services/routesWeeklyMonitor.ts` importa e usa `analisarSemana` e `analisarLote` em rotas acessíveis do Weekly Monitor, enquanto `WeeklyMonitorDashboard.tsx` mantém os tipos e a interface correspondente. Por isso, o motor não foi removido e nenhum comportamento foi alterado. O risco de duplicação entre motores permanece documentado para uma decisão futura de negócio, sem remoção precipitada.

### Descarte seguro de semanas inválidas

O lote semanal mantém o `continue` para ignorar uma semana inválida sem interromper as demais. O descarte agora registra `console.warn` com `client_id`, `data_referencia_inicio` e a causa do erro, permitindo auditoria operacional sem expor dados sensíveis nem alterar o resultado das semanas válidas.

### Cobertura direta de serviços

O teste legado desconectado de IA foi substituído por cobertura direta das funções reais do `aiService`, com mock mínimo de `@google/generative-ai`. Foram cobertos resposta normal, JSON inválido e fallback operacional, sem chamada externa real. Também foi adicionada cobertura direta de `documentDeliveryService`, incluindo envio de e-mail, falha HTTP, WhatsApp e resolução de token, sem depender de Resend, WhatsApp ou banco real.

### Fail-fast de produção

Foi criado `server/productionConfig.ts` para validar `DATABASE_URL` e `JWT_SECRET` somente no modo de produção. O bootstrap do servidor executa a validação antes de aceitar tráfego; configuração ausente produz mensagem clara e encerra o processo. Falha de conexão inicial com PostgreSQL também encerra o processo de produção em vez de deixar um servidor parcialmente inicializado. O caminho de testes e desenvolvimento permanece compatível.

### Itens deliberadamente adiados ou fora de escopo

A expansão de novos documentos não foi executada por falta de priorização de negócio; permanece como backlog e não recebeu alteração especulativa. O upsell de e-book em modo demonstração e o wrapper externo Gemini/GEMINI_API_URL não utilizado foram registrados como fora de escopo e não corrigidos nesta etapa.

## Validação final desta execução

- `git diff --check`: aprovado.
- `npx tsc --noEmit`: aprovado, sem erros.
- `npx vitest run`: **49 arquivos de teste e 540 testes aprovados**.
- `npx vite build --mode production`: aprovado; 2.934 módulos transformados e build concluído sem erros.
- Nenhum restart, stop, redeploy, migração de schema, alteração de banco de produção ou publicação automática foi executado durante a validação.
- A execução permaneceu em branch isolado e o pacote de entrega deve excluir `node_modules`, `.git`, `dist` e `coverage`.

## Escopo técnico desta execução

Além do relatório, o lote inclui somente arquivos do frontend, backend compartilhado e testes relacionados aos itens do documento: tokens e telas visuais já presentes no branch, `server/services/inteligencia360Service.ts`, `server/index.ts`, `client/src/pages/colaborador/Inteligencia360.tsx`, `client/src/pages/colaborador/CRM.tsx`, `client/src/pages/colaborador/Triagem.tsx`, `shared/documentalPresentation.ts`, `server/services/analiseCnpjReceitaCartao.ts`, `server/routes/documentacao.ts`, `client/src/pages/colaborador/AcompanhamentoBancario.tsx`, `server/services/analisadorSemanal.ts`, `server/productionConfig.ts` e as suítes correspondentes em `tests/`. Nenhuma funcionalidade usada foi removida.

## Extra 17 — fechamento da migração de cor (resíduos que passavam pelo grep mas quebravam no modo escuro) (2026-08-22)

### Causa

A verificação independente da entrega anterior (Extra 15/16) confirmou que o comando de checagem original (`bg-white` + classes de cor numeradas) retornava vazio, mas esse comando não cobria dois padrões que geram exatamente o mesmo problema visual — card claro sobre fundo escuro:

1. **`border-white`** (com ou sem opacidade, ex. `border-white/80`) usado ao lado de `bg-card` em cards que já tinham sido migrados — sobrava uma borda branca sólida em volta de um card escuro no modo escuro. Encontrado em `DocumentosEntidade.tsx` (9), `DossieCreditoEmpresa.tsx` (10), `Inteligencia360.tsx` (4), `Empresas.tsx` (1) e um divisor (`border-t border-white/50`) em `AssessoriaIA.tsx` (1) — 25 ocorrências no total.
2. **Gradientes com cor fixa terminando em branco ou tom pastel `-50`** (ex. `bg-gradient-to-br from-amber-50 to-white`, `from-slate-50 to-blue-50`, `from-blue-50 to-indigo-50`) — o mesmo efeito de "card claro" só que via gradiente em vez de `bg-white` puro, então não aparecia no grep original. Encontrado em `AcompanhamentoBancario.tsx` (2), `CRM.tsx` (2), `PlanoAcaoMotor.tsx` (1), `RelatorioTecnico.tsx` (1), `PropostaBancaria.tsx` (1), `EsteiraCredito.tsx` (1), `Inteligencia360.tsx` (1), `NexusTarefasEmpresa.tsx` (1) e `Empresas.tsx` (1) — 11 ocorrências no total.

### Correção

- Todos os 25 `border-white` residuais viraram `border-border` (o token de borda que já se adapta a cada tema) — confirmado, zero ocorrências restantes nesses 5 arquivos.
- Os 11 gradientes trocaram a cor fixa terminal (branco/pastel) por uma versão em token com opacidade (`to-card`, `from-muted`, `from-warning/10`, `from-primary/10`, `from-accent/10` etc.), preservando a mesma intenção visual (um card com leve tingimento de cor) mas agora coerente nos dois temas.

**O que foi deliberadamente deixado de fora, e por quê:** `border-white/20` em `Login.tsx`, `RecuperarSenha.tsx`, `RedefinirSenha.tsx` e `DocumentoPreview.tsx`, os spinners `border-white border-t-transparent` em `Triagem.tsx`, e os gradientes escuros e saturados usados como barra de cabeçalho fixa (`from-blue-900 to-blue-700` em `CRM.tsx`/`Clientes.tsx`/`Calculadora.tsx`, `from-violet-900 to-violet-700` em `ClientesPF.tsx`, `from-blue-950 via-blue-800 to-blue-600` em `CriarTarefaNexusModal.tsx`, entre outros) — todos esses ficam sobre um fundo que já é sólido e colorido (ou é um anel translúcido/spinner branco sobre um botão colorido), então não criam o problema de card claro em fundo escuro; são estilisticamente aceitáveis nos dois temas e não foram tocados para não ampliar o escopo além do que estava realmente quebrado. `Footer.tsx` e `HeroCarousel.tsx` também não foram tocados — confirmado que são usados só nas páginas públicas/institucionais, que não têm o alternador de tema.

### Decisão registrada sobre o item 2.3 (motor semanal `analisadorSemanal.ts` / Weekly Monitor)

Confirmado nesta etapa: as rotas registradas por `registerWeeklyMonitorRoutes` usam o mesmo middleware de autenticação e permissão (`auth`, `requireAcessoAcompanhamento`) que o resto do módulo de Acompanhamento Bancário — não há brecha de acesso. Como a ativação corrige um bug real e bem evidenciado (a tela `WeeklyMonitorDashboard` chamando rotas que não existiam, retornando 404), a decisão é **manter ativa**. Registrado aqui como decisão consciente, não como um efeito colateral não revisado.

### Verificação

- `npx tsc --noEmit`: limpo.
- `npx vitest run`: **540/540 testes passando**, sem nenhuma mudança de contagem (o ajuste é só de classes CSS, não toca lógica).
- `npx vite build --mode production`: concluído sem erros.
- Varredura final confirmando zero resíduos: nenhum `bg-white`, `border-white` (fora dos casos intencionais documentados acima) ou gradiente terminando em branco/pastel nas páginas e componentes autenticados (`client/src/pages/colaborador/` e `client/src/components/`).

### Escopo desta correção

- `client/src/components/documentos/DocumentosEntidade.tsx`, `client/src/components/documentacao/DossieCreditoEmpresa.tsx`, `client/src/pages/colaborador/Inteligencia360.tsx`, `client/src/pages/colaborador/Empresas.tsx`, `client/src/pages/colaborador/AssessoriaIA.tsx` — `border-white` → `border-border`.
- `client/src/pages/colaborador/AcompanhamentoBancario.tsx`, `client/src/pages/colaborador/CRM.tsx`, `client/src/pages/colaborador/PlanoAcaoMotor.tsx`, `client/src/pages/colaborador/RelatorioTecnico.tsx`, `client/src/pages/colaborador/PropostaBancaria.tsx`, `client/src/pages/colaborador/EsteiraCredito.tsx`, `client/src/pages/colaborador/NexusTarefasEmpresa.tsx`, `client/src/pages/colaborador/Empresas.tsx` — gradientes com cor fixa trocados por tokens.

Nenhuma rota, cálculo ou dado foi alterado — só classes CSS.

## Extra 18 — Contrato assinado visível/substituindo, Orçamentos na ficha da empresa, Acompanhamento Bancário para Pessoa Física e separação de documentos gerados (2026-08-24)

### Pedido do usuário

1. Acompanhamento Bancário também disponível para Pessoa Física (não só empresa).
2. Orçamentos visíveis/acessíveis na ficha da empresa.
3. Todos os documentos gerados dentro do Destrava (empresa ou PF) armazenados/visíveis na ficha da empresa.
4. Contrato assinado não aparecia ao tentar visualizar na ficha da empresa (bug).
5. Ao anexar o contrato assinado, ele deve substituir o "aguardando assinatura" (bug).
6. Documentos gerados pelo próprio Destrava separados visualmente dos documentos que a empresa envia.

### 4/5 — Contrato assinado: causa e correção

**Causa:** as duas colunas (`pdf_path` = versão sem assinatura, `assinado_pdf_path` = versão assinada) sempre existiram na tabela `contratos_gerados` (desde a migration 020) e o upload do assinado sempre gravou corretamente na coluna certa (`UPDATE ... SET assinado_pdf_path=$1 ...`, mesma linha — nunca cria linha duplicada). O bug estava só na leitura: `GET /api/contratos/:id/visualizar` e `GET /api/contratos/:id/download` nunca liam `assinado_pdf_path` — só montavam os caminhos candidatos a partir de `pdf_path`, então depois de assinado o sistema continuava mostrando (ou tentando abrir) o PDF sem assinatura. Um segundo problema, no frontend: depois do upload do contrato assinado, a lista "Contratos Firmados" da ficha da empresa não era recarregada — só a empresa em si — então o card continuava marcado "Aguardando assinatura" até a página ser recarregada.

**Correção:**
- `server/index.ts` (`GET /api/contratos/:id/download`): passou a selecionar também `assinado_pdf_path` e `status`, e usa `assinado_pdf_path` como caminho preferencial quando `status='assinado'` (com fallback pro `pdf_path` se por algum motivo o assinado não estiver presente).
- `server/index.ts` (`GET /api/contratos/:id/visualizar`): mesma lógica de preferência aplicada na montagem dos caminhos candidatos.
- `client/src/pages/colaborador/Empresas.tsx` (`handleAnexarContratoAssinado`): depois do upload bem-sucedido, agora também busca `GET /api/empresas/:id/contratos` de novo e atualiza o estado `contratosEmpresa`, então o card já aparece "Assinado" na hora, sem precisar recarregar a página.

Como o componente `ListaContratos.tsx` chama exatamente os mesmos dois endpoints (`/visualizar` e `/download`), o mesmo fix cobre qualquer outro lugar do sistema que exiba contratos, sem precisar duplicar a correção.

### 2 — Orçamentos na ficha da empresa

Sem nenhuma mudança de schema: `orcamentos_timbrados` já tinha `empresa_id` (migration 063) e índice próprio. Faltava só o endpoint de listagem por empresa e a aba na tela.

- Novo endpoint `GET /api/empresas/:id/orcamentos` em `server/index.ts`, no mesmo padrão de `/contratos` e `/simulacoes` já existentes.
- Nova aba "Orçamentos" em `client/src/pages/colaborador/Empresas.tsx` (registrada em `ABAS_EMPRESA`, com feature key própria `empresa-tab-orcamentos` também cadastrada em `featureCatalog.ts` — controlável por Configuração de Funções, do mesmo jeito que as demais abas), com listagem, visualizar e baixar PDF (reaproveitando os endpoints `GET /api/orcamentos/:id/pdf` e `/download` que já existiam no módulo de Orçamentos).

### 1 — Acompanhamento Bancário para Pessoa Física

A tabela `acompanhamentos_bancarios` (migration 022) já tinha uma coluna `tipo_cliente` (default `'pj'`, sem `CHECK` travando outros valores) que nunca era usada — só faltava o vínculo com `clientes_pf` e a lógica de criação/sincronização branching por tipo. Nenhuma coluna existente mudou de tipo ou obrigatoriedade.

- Nova migration idempotente (roda no boot, registrada como "Migration 083" em `server/index.ts`, com o arquivo de referência `db/migrations/083_acompanhamento_bancario_pf.sql`): adiciona `pessoa_fisica_id UUID NULL REFERENCES clientes_pf(id) ON DELETE SET NULL` + índice.
- `server/index.ts`: novas funções `buscarClientePfParaAcompanhamento` e `montarDadosClientePfParaAcompanhamento`, espelhando as equivalentes de empresa sem alterar o comportamento delas.
- `POST /api/acompanhamentos-bancarios`: agora aceita `tipo_cliente` (`'pj'`/`'pf'`) e `pessoa_fisica_id`; quando é PF, exige uma pessoa física já cadastrada (mesma regra de "não cria com cadastro inexistente" que já valia para empresa) em vez de empresa. Quando é PJ, o comportamento é idêntico ao que já existia.
- `POST /api/acompanhamentos-bancarios/:id/sincronizar-cadastro`: passou a detectar `tipo_cliente='pf'` e sincronizar contra `clientes_pf` em vez de `empresas`.
- Os endpoints de listagem (`GET /api/acompanhamentos-bancarios`) e detalhe (`GET /api/acompanhamentos-bancarios/:id`) não precisaram de nenhuma mudança — não fazem JOIN com `empresas`, usam o campo de texto livre `nome_empresa` diretamente, então já funcionavam para qualquer tipo de cliente.
- `client/src/pages/colaborador/AcompanhamentoBancario.tsx`: o modal "Novo Acompanhamento" ganhou um seletor "Empresa (PJ) / Pessoa Física (PF)" (travado durante edição, pra não trocar o vínculo de um acompanhamento já existente) que troca o buscador de cadastro (empresa ↔ pessoa física, reaproveitando `/api/clientes-pf` e `/api/clientes-pf/buscar`). O resto do formulário (banco, objetivo, rating, faturamento etc.) é o mesmo para os dois tipos.

Como `clientes_pf` não tem campo de faturamento/renda (só existe pra PJ), o valor de referência da pessoa física continua sendo o que o colaborador já informava manualmente no formulário — nenhuma suposição nova foi introduzida.

### 3/6 — Documentos gerados armazenados na ficha da empresa e separados dos documentos da empresa

**O que já ficava resolvido pelos itens acima:** contratos gerados (`contratos_gerados`) e orçamentos (`orcamentos_timbrados`) já são persistidos com `empresa_id` e agora aparecem nas abas "Contratos Firmados" e "Orçamentos" da ficha da empresa — nenhuma mudança de schema necessária para esses dois tipos.

**Separação visual (documento gerado × documento enviado pela empresa):** a coluna `documentos_arquivos.origem` já existe e já é gravada corretamente em cada INSERT (`upload_manual`, `gerado_sistema`, `importado_api`, `sincronizacao`, `migracao`) — só não era lida pela tela do Acervo Documental. Adicionada uma etiqueta "Gerado pela Destrava" nos cards de documento em `client/src/components/documentos/DocumentosEntidade.tsx` sempre que `origem === 'gerado_sistema'`, deixando visualmente claro o que veio do próprio sistema (ex.: contrato assinado que também é copiado pro Acervo Documental) versus o que a empresa enviou.

**O que ficou fora desta entrega, deliberadamente:** dois tipos de documento gerado pelo Destrava (relatório documental / dossiê de crédito e proposta bancária) hoje são montados sob demanda e entregues direto na resposta HTTP (`res.send(pdf)`), sem nenhum `INSERT` — ou seja, não existe um arquivo persistido para eles aparecerem em lugar nenhum, muito menos na ficha da empresa. Resolver isso de verdade exige criar tabela(s) nova(s) (ex. `relatorios_gerados`, `propostas_bancarias_geradas`), decidir política de retenção/histórico (toda geração vira uma versão nova? substitui a anterior?) e alterar os dois serviços que hoje não persistem nada. Dado o padrão "sem regressão e sem quebra" desta entrega, essa parte foi propositalmente deixada de fora para não introduzir schema novo e política de retenção sem confirmação — fica mapeada e pronta para ser o próximo passo, se for esse o caminho desejado.

### Verificação

- `npx tsc --noEmit`: limpo.
- `npx vitest run`: **540/540 testes passando**, mesma contagem de antes — nenhum teste existente quebrou.
- `npx vite build --mode production`: concluído sem erros.
- Conferido manualmente por leitura de código (não por execução de banco nesta sessão): mapeamento de placeholders `$1..$31` do novo `INSERT` de `acompanhamentos_bancarios` reconferido item a item contra a lista de colunas para garantir que nenhuma coluna ficou desalinhada com o parâmetro errado.

### Escopo desta correção

- `server/index.ts` — endpoints de contrato (`/visualizar`, `/download`), novo endpoint `/api/empresas/:id/orcamentos`, Migration 083 (`pessoa_fisica_id`), funções de PF para Acompanhamento Bancário, `POST /api/acompanhamentos-bancarios` e `POST .../sincronizar-cadastro`.
- `db/migrations/083_acompanhamento_bancario_pf.sql` — novo (referência da migration já aplicada automaticamente no boot).
- `client/src/pages/colaborador/Empresas.tsx` — nova aba "Orçamentos", re-fetch de contratos após anexar assinado.
- `client/src/config/featureCatalog.ts` — nova feature key `empresa-tab-orcamentos`.
- `client/src/pages/colaborador/AcompanhamentoBancario.tsx` — seletor PJ/PF e buscador de pessoa física no modal "Novo Acompanhamento".
- `client/src/components/documentos/DocumentosEntidade.tsx` — etiqueta "Gerado pela Destrava" por `origem`.

Nenhum campo, rota ou comportamento existente de PJ foi alterado — todas as mudanças em `acompanhamentos_bancarios` e no formulário são branches novos condicionados a `tipo_cliente='pf'`/`pessoa_fisica_id`, mantendo o fluxo de PJ bit-a-bit igual ao que já estava validado.

## Extra 19 — Capital social deixa de bloquear/mandar empresa para Cadastros Incompletos (2026-08-24)

### Pedido do usuário

Empresa ou instituição que legitimamente não tem capital social (associação, fundação, cooperativa, órgão público, entre outras) não deve ser bloqueada nem mandada para "Cadastros Incompletos" só por isso. Ela deve ir direto para o cadastro normal de empresas com os dados que já vêm da Receita, e a ausência/divergência de capital social deve virar alerta só na consulta com documentação anexada — não motivo de bloqueio de cadastro.

### Causa

A função `pendenciasEmpresa()` (`server/index.ts`) tratava capital social ausente ou zerado como uma pendência bloqueante, no mesmo nível de CNPJ inválido ou razão social ausente. Isso alimenta diretamente `cadastro_completo`/`cadastro_status`, que é o campo que a tela "Cadastros Incompletos" usa pra listar registros (`GET /api/cadastros-incompletos`) — então toda empresa cujo único dado faltante era o capital social (comum em entidades que a própria Receita não retorna esse campo, por não se aplicar ao tipo societário) ficava presa nessa tela como "incompleta" para sempre, mesmo vindo 100% sincronizada da Receita em todo o resto.

O motor de pendências/plano de ação (`pendenciasEmpresaService.ts`) e os alertas de divergência documental (`analiseDocumentalEspecializada.ts`, comparação QSA/Junta Comercial × Receita) já tratavam isso corretamente, como alerta informativo e não bloqueante — só a rota de cadastro (`pendenciasEmpresa()`) estava desalinhada com o resto do sistema.

### Correção

- `server/index.ts` (`pendenciasEmpresa`): removida a checagem de capital social da lista de pendências que definem `cadastro_completo`/`cadastro_status`. As demais checagens (CNPJ, razão social, CNAE, natureza jurídica, situação cadastral) continuam exatamente como estavam.
- Nova migration idempotente no boot ("Migration 084"): recalcula `cadastro_pendencias`/`cadastro_status`/`cadastro_completo` de todas as empresas já cadastradas (exceto arquivadas por duplicidade ou removidas) com a regra nova, e só grava UPDATE nas linhas cujo resultado mudou — sem isso, as empresas que já estavam gravadas como "incompleto" antes desta correção continuariam presas em Cadastros Incompletos até alguém clicar "Reprocessar" uma por uma. Não mexe em empresa com pendência real (CNAE/natureza jurídica/situação cadastral realmente ausentes) nem em duplicada/removida.
- Nenhuma mudança em `pendenciasEmpresaService.ts` (motor de pendências/plano de ação) nem em `analiseDocumentalEspecializada.ts` (alertas de divergência documental) — esses dois já tratavam capital social como alerta informativo, exatamente como pedido; continuam mostrando o alerta na consulta com documentação anexada.

### Verificação

- `npx tsc --noEmit`: limpo.
- `npx vitest run`: **540/540 testes passando**, mesma contagem de antes.
- `npx vite build --mode production`: concluído sem erros.
- Conferido que nenhum teste e nenhum trecho de frontend faz correspondência pelo texto literal "Capital social não sincronizado" vindo de `pendenciasEmpresa` (a tela de Cadastros Incompletos renderiza a lista de pendências de forma genérica, sem depender de nenhum texto específico) — a remoção não quebra nada que dependesse dessa string.

### Escopo desta correção

- `server/index.ts` — `pendenciasEmpresa()` (remoção da checagem de capital social) e Migration 084 (recomputo em lote das empresas já cadastradas).

Nenhuma coluna de schema foi criada ou alterada — é só mudança de regra de negócio (o que conta como pendência) e um recomputo dos dados já existentes com essa regra nova.

## Extra 20 — Visualização do contrato firmado em modal (fim das "duas abas") (2026-08-24)

### Pedido do usuário

"quero uma correção no contrato firmado, quando clica para visualizar, abre duas abas com mesmo contrato, e quero qua abra em um modal e não outra aba, abra modal com opção de salvar, baixar e imprimir, nunca poderá ser editado, e abra em um modal para visualizar e facil de fechar"

### Causa

O botão "Visualizar PDF" do contrato (na ficha da empresa, aba "Contratos Firmados", e também no gerador de contratos) buscava o PDF por `fetch` e só depois chamava `window.open(url, "_blank")` para abrir em nova aba. Como o `window.open` acontecia **depois** de um `await` (a resposta do `fetch`), alguns navegadores não reconhecem mais a chamada como resultado direto do clique do usuário e bloqueiam o pop-up — nesse caso o código tinha um fallback que criava um `<a target="_blank">` e simulava um clique nele. Dependendo do navegador/bloqueador de pop-up, as duas coisas podiam acontecer (uma aba pelo `window.open` que o navegador deixou passar parcialmente + a aba do link de fallback), resultando no efeito relatado de "abre duas abas com o mesmo contrato".

### Correção

- `client/src/pages/colaborador/Empresas.tsx`: `handleVerContrato` não usa mais `window.open`/nova aba. Agora ele guarda o PDF (blob) em estado (`contratoPreviewUrl`/`contratoPreviewInfo`) e abre um **modal** interno com um `<iframe>` somente leitura mostrando o PDF — o mesmo padrão já usado para os documentos anexados na ficha da empresa (`DocumentosEntidade.tsx`). Um `<iframe>` de PDF não permite edição alguma do conteúdo — só visualização.
  - O modal tem três ações no cabeçalho: **Imprimir** (abre uma aba de impressão dedicada e já dispara `print()` — esse é o único caso em que uma aba nova é aberta, e é intencional: é a forma padrão do navegador de imprimir um PDF), **Baixar** (usa a rota de download já existente, que salva o arquivo no computador — cobre tanto "baixar" quanto "salvar"), e um **X** para fechar. O modal também fecha clicando fora dele ou apertando **Esc**, e a URL do blob é liberada da memória (`URL.revokeObjectURL`) ao fechar.
  - Como bônus, o `<iframe>` com o PDF usa o visualizador nativo do navegador (ex.: Chrome), que já traz seus próprios ícones de salvar/baixar/imprimir/zoom na barra de ferramentas — reforçando as opções pedidas, sem risco de edição.
- `client/src/components/contratos/ListaContratos.tsx` (usado na tela "Gerador de Contratos"): tinha exatamente o mesmo padrão de `window.open` para visualizar (`abrirPdf`) na mesma rota `/api/contratos/:id/visualizar`, sujeito ao mesmo problema. Recebeu a mesma correção: modal somente leitura com Imprimir/Baixar/Fechar, fecha com Esc ou clique fora.
- Nenhuma rota de backend foi alterada — a correção é só na forma como o PDF já retornado pela API é exibido no navegador.

### Verificação

- `npx tsc --noEmit`: limpo.
- `npx vitest run`: **540/540 testes passando**, mesma contagem de antes.
- `npx vite build --mode production`: concluído sem erros.
- Conferido por grep que não sobrou nenhum `window.open` no fluxo de "visualizar" contrato — o único `window.open` restante em cada arquivo é dentro da ação explícita "Imprimir" (comportamento esperado/pedido, não é mais disparado ao clicar em "Visualizar").
- Baixar contrato (`handleBaixarContrato`/`handleDownload`), anexar contrato assinado, e as demais ações da lista de contratos (status, excluir, editar, regenerar) não foram tocadas.

### Escopo desta correção

- `client/src/pages/colaborador/Empresas.tsx` — `handleVerContrato`, novo `handleImprimirContrato`, novo `fecharPreviewContrato`, novo estado do modal, novo bloco de modal no JSX.
- `client/src/components/contratos/ListaContratos.tsx` — `abrirPdf`, novo `imprimirPdf`, novo `fecharPreview`, novo estado do modal, novo bloco de modal no JSX.

Não altera "Orçamentos" nem nenhuma outra tela de visualização de PDF fora do fluxo de contrato firmado, conforme o pedido.
