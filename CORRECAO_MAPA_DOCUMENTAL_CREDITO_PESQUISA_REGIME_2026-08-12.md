# Mapa documental de crédito — pesquisa de mercado e correção do catálogo por regime — 12/08/2026

## Pedido original

Depois de ver o painel "Próxima leva de documentos" (que já lista, por regime
tributário, os documentos que faltam), o pedido foi: garantir que essa lista está
**correta e completa** para cada porte/enquadramento de empresa (Simples Nacional,
Lucro Presumido, Lucro Real, MEI), do jeito que bancos e assessorias de crédito
realmente exigem — sem excluir nenhum campo que já existisse.

## Método

Antes de mexer em qualquer linha de código, pesquisei na web quais documentos
bancos e fintechs brasileiras realmente exigem em análise de crédito PJ, por
regime tributário, para confrontar contra o catálogo que já existia em
`server/services/mapaDocumentalCreditoService.ts` (`DOCUMENTOS_UNIVERSAIS_EMPRESA`
e `DOCUMENTOS_REGIME`). Fontes consultadas:

- [Documentação Simples Nacional — Banco do Nordeste](https://www.bnb.gov.br/seja-nosso-cliente/pessoa-juridica/documentacao-simples-nacional-empresario-individual)
- [Documentação Lucro Presumido — Banco do Nordeste](https://bnb.gov.br/seja-nosso-cliente/pessoa-juridica/documentacao-lucro-presumido-sociedades)
- [Documentação Lucro Real — Banco do Nordeste](https://www.bnb.gov.br/seja-nosso-cliente/pessoa-juridica/documentacao-lucro-real-empresario-individual)
- [Documentos necessários para análise cadastral PJ — Bancorbrás](https://www.bancorbras.com.br/media/190659/documentos-necessarios-para-analise-cadastral-pj.pdf)
- [O que é CNDT e seu uso em financiamento — Coalize](https://www.coalize.com.br/o-que-e-certidao-negativa-de-debitos-trabalhistas)

## O que a pesquisa confirmou que já estava certo (não alterado)

O catálogo por regime já existente estava, em geral, correto: PGDAS-D + DEFIS para
Simples Nacional; ECF/ECD + Balanço/DRE + DCTF para Lucro Presumido e Lucro Real;
CCMEI + DASN-SIMEI para MEI; CND Federal, FGTS, certidões estadual/municipal,
faturamento e SCR/Registrato no núcleo universal. Nada disso foi removido ou
alterado — só confirmado contra fontes reais.

## O que a pesquisa identificou como faltante (adicionado, nada excluído)

1. **CNDT — Certidão Negativa de Débitos Trabalhistas.** Certidão distinta da CND
   Federal e do FGTS (verifica pendências na Justiça do Trabalho, não regularidade
   fiscal), comumente exigida em conjunto por bancos e financeiras — confirmado
   pela fonte da Coalize. Não existia no catálogo. Adicionada como documento
   universal obrigatório (mesma categoria das outras certidões já existentes).
2. **Demonstrativo/projeção de receitas.** As três páginas do Banco do Nordeste
   (Simples Nacional, Lucro Presumido e Lucro Real) confirmam, de forma consistente,
   que esse documento é exigido **no lugar** do faturamento histórico de 12 meses
   quando a empresa tem menos de 12 meses de constituição ou menos de 11 meses de
   faturamento documentado — situação que o próprio sistema já identifica na
   Etapa 2/3 (regra dos 12 meses da cadeia societária). Não existia no catálogo.
   Adicionado como documento complementar (obrigatório só quando aplicável, não
   trava o avanço por padrão).
3. **Rating em bureau privado (Serasa) e Consulta de protestos (CENPROT).** Esses
   dois já eram campos do checklist do Acervo Documental (`consulta_serasa_cnpj` e
   `cenprot_cnpj`) — mas não tinham nenhum documento correspondente no mapa
   documental de crédito, ou seja, nunca apareciam na lista "documentação exigida
   por regime" nem no painel "próximo documento". Adicionados como itens
   complementares do núcleo universal (fase 4), fechando essa lacuna.

## Correção crítica encontrada durante a implementação

Ao adicionar os 3 novos campos de upload no checklist (FGTS, CNDT, certidões
estadual/municipal e projeção de receitas), encontrei que `server/routes/documentos.ts`
mantém uma whitelist (`TIPOS_DOCUMENTO`) que bloqueia qualquer upload cujo
`tipo_documento` não esteja nela cadastrado, com o erro "tipo_documento inválido"
— checado em 3 pontos diferentes da rota de upload. **Se eu tivesse só adicionado
os campos na tela sem atualizar essa whitelist, os campos apareceriam
normalmente, mas qualquer tentativa de anexar um arquivo neles teria falhado.**
Corrigido: todos os novos tipos (`crf_fgts`, `fgts`, `cndt`, `certidao_trabalhista`,
`cnd_estadual`, `certidao_estadual`, `cnd_municipal`, `certidao_municipal`,
`projecao_receitas`, `demonstrativo_receitas_projetadas`) foram adicionados à
whitelist e ao conjunto `DOCUMENTOS_EMPRESA`. Um teste novo
(`tests/tiposDocumentoCatalogo.test.ts`) trava essa lacuna para não voltar a
acontecer silenciosamente numa próxima adição de campo.

## Documentos ainda fora do catálogo (não incluídos, por não terem evidência clara)

A pesquisa não trouxe evidência forte o suficiente para adicionar de forma
assertiva itens mais específicos por instituição (ex.: formulários próprios de
cada banco, autorizações específicas de cada operação de crédito) — esses já
estão cobertos, quando aplicável, pelos `documentos_adicionais` de cada operação/
programa (`OPERACOES`/`PROGRAMAS`, não alterados). Preferi não inventar exigências
sem fonte confiável, consistente com a disciplina deste projeto de não presumir
regra de negócio sem confirmação.

## Validação executada

```
npx tsc --noEmit    → limpo (0 erros)
npx vitest run      → 41 arquivos, 518/518 testes passando
                       (517 já existentes + 1 novo arquivo de teste)
npm run build       → build de produção concluído, dentro do orçamento de bundle
                       (JS inicial 99.3 kB gzip / limite 130 kB;
                        CSS inicial 33.3 kB gzip / limite 45 kB)
```

Novo teste em `tests/mapaDocumentalCredito.test.ts`: confirma que CNDT, projeção de
receitas, rating de bureau privado e CENPROT aparecem no mapa, e que CNDT é
obrigatória enquanto os outros três são complementares.

Novo teste em `tests/tiposDocumentoCatalogo.test.ts`: confirma que todo tipo novo
usado nos campos do checklist está na whitelist de upload.

## Arquivos alterados

- `server/services/mapaDocumentalCreditoService.ts` — 4 documentos novos
  (`cndt`, `projecao_receitas`, `rating_bureau_privado`, `consulta_protestos`);
  versão do mapa incrementada para `1.2.0`.
- `client/src/components/documentos/DocumentosEntidade.tsx` — 5 novos campos de
  upload no checklist ("Documentação da Empresa"): Certificado de Regularidade do
  FGTS, CNDT, Certidão estadual, Certidão municipal, Demonstrativo/projeção de
  receitas.
- `server/routes/documentos.ts` — `TIPOS_DOCUMENTO` e `DOCUMENTOS_EMPRESA`
  atualizados com os novos tipos (correção crítica descrita acima); `TIPOS_DOCUMENTO`
  passou a ser exportado para viabilizar o teste de regressão.
- `tests/mapaDocumentalCredito.test.ts` — novo teste para os 4 documentos
  adicionados ao mapa.
- `tests/tiposDocumentoCatalogo.test.ts` (novo) — trava a whitelist de upload
  contra a mesma lacuna que quase passou despercebida nesta sessão.

Nenhum campo existente foi removido, renomeado ou teve sua obrigatoriedade
reduzida. Nenhuma regra de gating (Fase 1/2/3, ordem SCR→CCS→CCF, regra dos 12
meses) foi tocada — o mapa documental de crédito é só informativo, não bloqueia
nenhuma etapa — confirmado pelos 518 testes passando.
