# Acervo Documental — "Próximo documento" depois da Etapa 3 (mapa por regime) — 12/08/2026

## Pedido original

Depois de ver o painel inline (Etapa 2/3) já em produção — mostrando "Continuidade
comprovada" assim que os Atos da Junta e o Contrato/Alteração fecham os 12 meses de
histórico — o feedback foi: parar em "liberado" não é suficiente. A empresa do
exemplo (Paluma Burger Ltda) é optante do Simples Nacional, e depois da Etapa 3
ainda existe uma sequência de documentos (cadastro, regularidade, e depois a parte
fiscal específica do regime — PGDAS, DEFIS etc.) que precisa continuar sendo pedida,
um de cada vez, até fechar a cadeia completa que sustenta a proposta de crédito.
Pedido verbatim: "após analisar só falou que está liberado, mas não é isso... qual o
próximo documento? Coloque uma mensagem que solicite a próxima documentação."

## O que já estava implementado (verificado, não alterado)

- `gerarMapaDocumentalCredito` (`server/services/mapaDocumentalCreditoService.ts`) —
  já existia, já testado (`tests/mapaDocumentalCredito.test.ts`), e já monta,
  **por regime tributário identificado** (MEI, Simples Nacional, Lucro Presumido,
  Lucro Real, imune/isenta), a sequência completa de 6 etapas com os documentos
  específicos de cada uma — inclusive já marca `anexado: true/false` em cada
  documento comparando com os tipos já anexados. Para Simples Nacional, a etapa 4
  ("Faturamento e documentação fiscal") já inclui exatamente comprovante de opção
  pelo Simples, PGDAS dos últimos 12 meses, DEFIS e (quando aplicável) Balanço/DRE.
- Esse resultado já era retornado pelo endpoint `GET
  /api/documentacao/empresa/:empresaId/dossie` (campo `mapa_documental_credito`) e
  já era renderizado — só que dentro de um `<details>` recolhido
  (`MapaDocumentalCreditoCard`, em `DossieCreditoEmpresa.tsx`), que não afirma
  explicitly qual é o *próximo* documento, só lista as 6 etapas por inteiro.

A lacuna real (mesma raiz da correção anterior): o dado já existia e já era correto
por regime, mas não virava uma mensagem direta de "o que anexar agora", e não
aparecia na tela onde o usuário efetivamente está (a tela de upload).

## O que foi implementado nesta sessão

Em `DocumentosEntidade.tsx`, o painel inline da Etapa 2/3 (adicionado na sessão
anterior) ganhou uma continuação: quando `societaria.apto_para_avancar === true`
("Continuidade comprovada"), o mesmo painel passa a consultar o mapa documental de
crédito já calculado e a mostrar:

- **Próximo documento**: o primeiro documento obrigatório, ainda não anexado, das
  etapas de "Cadastro, sócios e regularidade" e "Faturamento e documentação fiscal"
  (essas duas etapas já se destravam juntas assim que a Etapa 3 fecha — confirmado
  lendo `gerarMapaDocumentalCredito`, ambas usam `bloqueada: !etapa2Aprovada`). Com
  o nome do documento e a finalidade, do jeito que o mapa já descreve.
- **Fila dos próximos**: até 4 documentos seguintes, para dar visão da cadeia
  completa que ainda falta ("...e mais N documento(s)" quando há mais que isso).
- **Mensagem de conclusão**: quando não sobra nenhum documento obrigatório
  pendente nessas duas etapas, o painel troca a mensagem para "Dossiê documental
  completo" e mostra o texto que o próprio mapa já produz para a próxima etapa
  (`proxima_acao` — ex: capacidade de pagamento e escolha da operação de crédito).

**Cuidado tomado, importante**: nem todo documento do mapa tem hoje um campo de
upload correspondente nesta tela (ex.: Certificado de Regularidade do FGTS,
certidão estadual/municipal isolada — o mapa foi desenhado de forma mais ampla que
o checklist atual). Apontar "próximo documento: FGTS" sem ter onde anexar geraria
o mesmo problema de novo — orientação que não leva a lugar nenhum. Por isso, a
lista de "próximo documento"/"fila dos próximos" só considera itens do mapa cujo
tipo de arquivo bate com um campo real do checklist desta tela (usando o mesmo
`TIPO_PARA_SLOT` que já resolve upload/exibição de cada campo) — nunca aponta para
um documento sem campo de destino.

## Gap identificado e conscientemente não fechado nesta sessão

- Os poucos documentos do mapa sem campo de upload direto nesta tela (Regularidade
  do FGTS, certidão estadual isolada, certidão municipal isolada) continuam
  existindo no mapa, mas não entram na mensagem de "próximo documento" — por
  enquanto eles ficam de fora da fila guiada, e quando necessários podem ser
  anexados pelo campo genérico "Campo outros / Documento nomeado", que já aceita
  nome livre. Criar campos dedicados para esses três é uma extensão pequena e de
  baixo risco, mas não foi feita aqui para não expandir escopo sem pedido explícito.

## Validação executada

```
npx tsc --noEmit    → limpo (0 erros)
npx vitest run      → 40 arquivos, 516/516 testes passando (nenhum teste alterado;
                       mapaDocumentalCredito.test.ts e cadeiaSocietaria.test.ts
                       continuam cobrindo a lógica de origem, que não foi tocada)
npm run build       → build de produção concluído, dentro do orçamento de bundle
                       (JS inicial 99.3 kB gzip / limite 130 kB;
                        CSS inicial 33.3 kB gzip / limite 45 kB)
```

## Arquivos alterados

- `client/src/components/documentos/DocumentosEntidade.tsx` — nova busca do campo
  `mapa_documental_credito` (já vinha na mesma resposta do dossiê, só não era lida);
  novo cálculo `proximaLevaCredito` (memoizado, filtrado por campo real existente
  no checklist); painel da Etapa 2/3 estendido para mostrar "Próxima leva de
  documentos" e "Dossiê documental completo" depois que a continuidade societária
  está comprovada.

Nenhuma rota de backend foi criada ou alterada — `gerarMapaDocumentalCredito` e o
endpoint do dossiê já existiam e já estavam corretos, confirmado por leitura direta
do código e pelos testes que já cobriam o serviço antes desta sessão. Nenhuma regra
de regime tributário, da cadeia societária de 12 meses ou do gatilho automático de
análise (implementado na correção anterior) foi alterada — confirmado pelos 516
testes passando.
