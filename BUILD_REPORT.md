# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita; Rodada 27 — 02/09/2026: botão "Reler" manual em cada card da Etapa 1; Rodada 28 — 02/09/2026: grade de campos ilegível corrigida no Acervo Documental, botão "Reler" do Contrato Social confronta contra o Ato da Junta; Rodada 29 — 02/09/2026: auditoria própria de consistência entre tipos de empresa, três inconsistências corrigidas; Rodada 30 — 02/09/2026: cards do Acervo Documental nivelados quando fechados; Rodada 08/09/2026: identidade documental por evidência em Atos da Junta/Contrato Social, atualizada em 09/09/2026 com o terceiro documento real; Rodada 09/09/2026: laudo por documento vira ícone de hover; Rodada 09/09/2026 parte 2: PDF institucional e roteamento do Dossiê de Crédito; Rodada 09/09/2026 parte 3: cards do Acervo Documental recolhidos por padrão; Rodada 09/09/2026 parte 4: titular de Empresário Individual/MEI deixa de depender de QSA para liberar documentação pessoal; Rodada 09/09/2026 parte 5: reconciliação do titular ligada também na rota que a tela realmente usa, e nome extraído do nome empresarial do MEI quando não há cadastro estruturado; Rodada 09/09/2026 parte 6: causa raiz real encontrada e corrigida -- isEmpresaIndividual não reconhecia "Empresário (Individual)" com parênteses, o texto oficial real da Receita, confirmado com os 3 documentos reais da empresa; Rodada 09/09/2026 parte 7: MEI usa o CCMEI como equivalente do Contrato Social/Atos da Junta -- Etapa 2 só avança com o CCMEI de fato anexado; Rodada 09/09/2026 parte 8: CCMEI anexado no próprio campo "Contrato social" deixa de ser marcado como documento incompatível, e passa a valer como evidência)

## Rodada 09/09/2026 parte 8 — CCMEI anexado no campo "Contrato social" deixa de ser "Documento incompatível" e passa a valer como evidência

Base: mesma árvore da rodada anterior (parte 7), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **120 arquivos / 1128 testes, todos passando** (1123 + 4 novos em `tests/classificadorCcmeiComoContratoSocialMei.test.ts` + 1 novo em `tests/validacaoSocietariaCcmeiMei.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

## Rodada 09/09/2026 parte 7 — MEI usa o CCMEI como equivalente do Contrato Social/Atos da Junta

Base: mesma árvore da rodada anterior (parte 6), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **119 arquivos / 1123 testes, todos passando** (1119 + 4 novos em `tests/validacaoSocietariaCcmeiMei.test.ts`, cobrindo MEI sem CCMEI, MEI com CCMEI anexado, MEI com CCMEI vazio/ilegível e LTDA não afetada).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.5 kB -- `node --check` OK em ambos.

## Rodada 09/09/2026 parte 6 — Causa raiz real: `isEmpresaIndividual` não reconhecia "Empresário (Individual)" com parênteses (texto oficial real da Receita)

Base: mesma árvore da rodada anterior (parte 5), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **118 arquivos / 1119 testes, todos passando** (1117 + 2: 1 novo em `tests/isEmpresaIndividualSemNomeDaEmpresa.test.ts`, 1 novo em `tests/garantirTitularEmpresaIndividual.test.ts`, ambos reproduzindo o caso real com os dados exatos dos 3 documentos anexados pelo usuário -- Cartão CNPJ, Consulta Optantes/SIMEI e QSA da empresa "55.497.701 NATALYA MARTINS LOBO").

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js` (2.5 MB) e `dist/backfill-laudos.js` (447.5 KB) gerados; `node --check` limpo nos dois.

### 4. O que mudou (a causa raiz real, confirmada com os documentos reais)
O usuário enviou os 3 documentos reais da empresa (Cartão CNPJ, Consulta Optantes/SIMEI, QSA). O Cartão CNPJ confirma que o texto oficial da Receita para a natureza jurídica é literalmente **"213-5 - Empresário (Individual)"** -- com parênteses. `isEmpresaIndividual` (`server/routes/documentacao.ts`) exigia as duas palavras coladas (`\bempresario individual\b`), então nunca reconhecia essa empresa como EI/MEI quando `opcao_mei` também não estava sincronizado no cadastro -- e como TODA a correção das rodadas 4 e 5 depende dessa função retornar `true`, o bug persistia mesmo com as duas rotas já corrigidas. A regex agora aceita `empresario\s*\(?individual\)?` (mesmo padrão já usado em outro lugar do projeto, `analiseDocumentalEspecializada.ts`). O QSA real anexado confirma também que o documento em si não lista nenhum sócio ("A NATUREZA JURÍDICA NÃO PERMITE O PREENCHIMENTO DO QSA") -- o nome só existe no "NOME EMPRESARIAL", validando que a extração pelo nome empresarial (parte 5) é o caminho certo, não um fallback secundário. Ver `CHANGELOG_CORRECOES.md` para a descrição completa. — Reconciliação do titular ligada na rota real usada pela tela (`GET /api/empresas/:id/socios`) + extração de nome do nome empresarial do MEI

Base: mesma árvore da rodada anterior (titular de EI/MEI, parte 4), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **118 arquivos / 1117 testes, todos passando** (1109 + 8: 4 novos em `tests/garantirTitularEmpresaIndividual.test.ts` para a extração de nome do nome empresarial do MEI, e 4 novos em `tests/getSociosEmpresaRotaReconciliaTitular.test.ts` para a rota).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js` (2.5 MB) e `dist/backfill-laudos.js` (447.5 KB) gerados; `node --check` limpo nos dois.
- Verificado manualmente no bundle final que o import dinâmico entre `socios_documentos.ts` e `documentacao.ts` (necessário para reaproveitar `garantirTitularEmpresaIndividual` sem criar um ciclo de import estático) foi resolvido pelo esbuild com o padrão padrão de inicialização tardia (`init_documentacao()`/`documentacao_exports`) -- sem nenhum `import()` de runtime pendente, sem risco de falha em produção.

### 4. O que mudou (causa raiz da rodada anterior não ter resolvido o bug real)
A Rodada anterior (parte 4) ligou `garantirTitularEmpresaIndividual` só dentro de `montarDossieCreditoEmpresa`. Mas a tela de Acervo Documental (`DocumentosEntidade.tsx`) não lê a lista de sócios do dossiê -- ela busca direto em `GET /api/empresas/:id/socios` (`server/routes/socios_documentos.ts`), de forma independente. Por isso o print enviado pelo usuário depois da rodada anterior continuava mostrando o bloqueio: o caminho que a tela realmente usa nunca chamava a reconciliação. Corrigido chamando a MESMA função também nessa rota. Além disso, a pedido do usuário, a cascata de resolução de nome do titular passou a incluir o próprio nome empresarial do MEI (razão social/nome fantasia no padrão "raiz do CNPJ + nome civil do titular") como um sinal adicional, quando não há nenhum nome em cadastro estruturado -- nunca inventa CPF. Ver `CHANGELOG_CORRECOES.md` para a descrição completa.

Base: mesma árvore da rodada anterior (cards recolhidos), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **117 arquivos / 1109 testes, todos passando** (1096 + 13, todos os 13 novos em `tests/garantirTitularEmpresaIndividual.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js` (2.5 MB) e `dist/backfill-laudos.js` (447.5 KB) gerados; `node --check` limpo nos dois.

### 4. O que mudou
Uma única função nova, `garantirTitularEmpresaIndividual` (`server/routes/documentacao.ts`), chamada uma vez dentro de `montarDossieCreditoEmpresa` logo depois de `empresa`/`socios` serem carregados (mesmo padrão de "reconciliação-na-leitura" já usado por `reconciliarFollowupMaturidadeEmpresa`). Nenhuma migration, nenhuma tabela nova, nenhum tipo novo -- reaproveita 100% `socios_empresa` e `upsertSocioEmpresa`, já existentes. Ver `CHANGELOG_CORRECOES.md` para a descrição completa do bug e da correção.

## Rodada 09/09/2026 parte 3 — cards do Acervo Documental recolhidos por padrão

Base: mesma árvore da rodada anterior (PDF + roteamento), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **116 arquivos / 1096 testes, todos passando** (1092 + 4, todos os 4 novos em `tests/acervoCardsRecolhidos.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.5 kB -- `node --check dist/backfill-laudos.js` OK.
- Chunk `DocumentosEntidade`: 192.62 kB → 194.36 kB gzip 45.76 kB → 46.14 kB -- crescimento pequeno e esperado (novo estado de expansão + selo de resultado + ícone `ChevronDown`).
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 4. Diff mínimo (verificado por `diff -rq` contra o zip anterior, excluindo `node_modules`/`dist`/`.vite`)
2 arquivos a mais diferem em relação à entrega anterior (09/09/2026 parte 2, PDF + roteamento):
- `client/src/components/documentos/DocumentosEntidade.tsx` (correção de produção, frontend)
- `tests/acervoCardsRecolhidos.test.ts` (teste novo)

Nenhuma migration, rota de backend, variável de ambiente ou dependência foi tocada nesta rodada.

---

## Rodada 09/09/2026 parte 2 — PDF institucional (cabeçalho x título) e roteamento do Dossiê de Crédito (bug do wouter)

Base: mesma árvore da rodada anterior (ícone de hover), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **115 arquivos / 1092 testes, todos passando** (1088 + 4 -- os 4 testes novos são todos de `tests/wouterQueryStringLeitura.test.ts`; `tests/relatorioModularHtml.test.ts`, pré-existente, foi atualizado sem mudar sua contagem, 10/10).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.8 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.5 kB -- `node --check dist/backfill-laudos.js` OK.
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 4. Diff mínimo (verificado por `diff -rq` contra o zip anterior, excluindo `node_modules`/`dist`/`.vite`)
6 arquivos a mais diferem em relação à entrega anterior (09/09/2026, ícone de hover):
- `server/services/relatorioModularHtml.ts` (correção de produção -- geração de PDF)
- `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx` (correção de produção -- roteamento)
- `client/src/pages/colaborador/Empresas.tsx` (correção de produção -- roteamento)
- `client/src/pages/colaborador/RedefinirSenha.tsx` (correção de produção -- roteamento, bug adicional encontrado)
- `tests/relatorioModularHtml.test.ts` (teste pré-existente, atualizado)
- `tests/wouterQueryStringLeitura.test.ts` (teste novo)

Nenhuma migration, rota de backend nova, variável de ambiente ou dependência foi tocada nesta rodada.

### 5. Verificação empírica adicional (fora da suíte automatizada)
A correção do PDF foi validada gerando um PDF real via Chromium a partir do código de produção (`gerarHtmlRelatorioModular` + `generateBrandedPdfBuffer`), antes e depois da mudança -- confirmado visualmente (leitura do PDF gerado) que a sobreposição título/logo desaparece e que nenhuma numeração de página é perdida (ela já não aparecia antes da correção).

---

## Rodada 09/09/2026 — laudo por documento vira ícone de hover no Acervo Documental (cards sempre do mesmo tamanho)

Base: mesma árvore das rodadas anteriores, `node_modules` reinstalado do zero antes desta verificação.

### 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros. Nenhuma dependência adicionada -- `@radix-ui/react-hover-card` já constava do `package.json` (usado pelo componente `client/src/components/ui/hover-card.tsx`, pré-existente, só não tinha uso ainda dentro do Acervo Documental).

### 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 3. Suíte de testes
`npx vitest run` -- **114 arquivos / 1088 testes, todos passando** (contagem inalterada -- `tests/acervoInlineAnalise.test.ts`, pré-existente, foi atualizado para auditar o mecanismo novo, sem teste criado nem removido).

### 4. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.5 kB -- `node --check dist/backfill-laudos.js` OK.
- Chunk `DocumentosEntidade`: 187.10 kB → 192.62 kB gzip 43.50 kB → 45.75 kB -- crescimento pequeno e esperado (o `HoverCard` do Radix, já uma dependência do projeto, passou a ser efetivamente importado neste chunk).
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 5. Diff mínimo (verificado por `diff -rq` contra o zip anterior, excluindo `node_modules`/`dist`/`.vite`)
Só 2 arquivos a mais diferem em relação à entrega anterior (08/09/2026, atualizada):
- `client/src/components/documentos/DocumentosEntidade.tsx` (correção de produção, frontend)
- `tests/acervoInlineAnalise.test.ts` (teste pré-existente, atualizado)

Nenhum arquivo de backend, rota, migration ou configuração foi tocado nesta rodada.

---

## Rodada 08/09/2026, segunda atualização (09/09/2026) — terceiro documento real (par completo Atos da Junta + Alteração Contratual, VIK CONSTRUÇÕES E REFORMAS LTDA)

Base: mesma árvore da rodada anterior (`destravamain_30.zip` + as correções já entregues de 08/09/2026), `node_modules` reinstalado do zero (`pnpm install --frozen-lockfile`) antes desta verificação.

### 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado. Nenhuma dependência adicionada, removida ou alterada nesta atualização.

### 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 3. Suíte de testes
`npx vitest run` -- **114 arquivos / 1088 testes, todos passando** (+3 em relação à rodada anterior: novo terceiro `describe` em `tests/atosJuntaIdentidadePorEvidencia.test.ts`, usando o texto extraído exato do terceiro documento real -- ver `TEST_REPORT.md`/`CHANGELOG_CORRECOES.md`).

### 4. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.5 kB -- `node --check dist/backfill-laudos.js` OK.
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 5. Diff mínimo (verificado por `diff -rq` contra o zip original, excluindo `node_modules`/`dist`/`.vite`)
Ainda apenas 3 arquivos diferem do zip original (mesmos 3 da rodada anterior -- nenhum arquivo a mais tocado nesta atualização):
- `server/services/extracaoDocumentalLocal.ts` (correção de produção -- ganhou 2 correções adicionais dentro de `parseContratoSocialAlteracao`)
- `shared/documentalPresentation.ts` (inalterado desde a rodada anterior)
- `tests/atosJuntaIdentidadePorEvidencia.test.ts` (+3 testes, terceiro `describe`)

Nenhum outro arquivo (frontend, rotas, migrations, configuração, outros serviços) foi tocado nesta atualização -- inclusive `client/src/components/documentos/DocumentosEntidade.tsx`, investigado por causa da queixa de layout ("print bagunçado") mas sem nenhuma alteração, por não ter sido encontrado bug de código (ver `PENDENCIAS_REAIS.md`, item "0-U").

---

## Rodada 08/09/2026 — identidade documental por evidência (Atos da Junta / Contrato Social)

Base desta rodada: `destravamain_30.zip`, extraído em ambiente limpo (`pnpm install --frozen-lockfile` executado do zero, sem `node_modules` pré-existente).

### 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (`packageManager: pnpm@10.4.1`). Nenhuma dependência adicionada, removida ou alterada nesta rodada.

### 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, antes e depois de cada alteração.

### 3. Suíte de testes
`npx vitest run` -- **114 arquivos / 1085 testes, todos passando** (12 testes em `tests/atosJuntaIdentidadePorEvidencia.test.ts`: 6 com fixtures sintéticas + 6 adicionados depois, usando o texto extraído exato dos dois documentos reais anexados pelo usuário -- ver `TEST_REPORT.md` e `CHANGELOG_CORRECOES.md`). Todos os demais arquivos já existentes na base, sem alteração de contagem.

### 4. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.2 kB -- `node --check dist/backfill-laudos.js` OK.
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 5. Diff mínimo (verificado por `diff -rq` contra o zip original, excluindo `node_modules`/`dist`/`.vite`)
Apenas 3 arquivos diferem do zip original:
- `server/services/extracaoDocumentalLocal.ts` (correção de produção)
- `shared/documentalPresentation.ts` (correção de produção -- mantém o novo campo de diagnóstico fora da tela do usuário final)
- `tests/atosJuntaIdentidadePorEvidencia.test.ts` (novo, teste)

Nenhum outro arquivo (frontend, rotas, migrations, configuração, outros serviços) foi tocado nesta rodada.

---


## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida nesta rodada -- a correção é a remoção de uma única classe Tailwind).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, depois de remover `self-start` da className do card do checklist (`client/src/components/documentos/DocumentosEntidade.tsx`).

## 3. Suíte de testes
`npx vitest run` -- 101 arquivos / 910 testes, todos passando (contagem inalterada em relação à Rodada 29 -- correção puramente de CSS, sem nenhuma função pura nova). Ver `TEST_REPORT.md`.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Esta rodada altera só um componente de tela (`client/src/components/documentos/DocumentosEntidade.tsx`) -- nenhuma lógica de backend ou de negócio foi tocada.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK (inalterado -- classe removida, nenhuma nova)
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha).
- Chunk `DocumentosEntidade`: 151.07 kB → 151.06 kB gzip 35.62 kB → 35.62 kB -- praticamente inalterado (a única mudança de código é a remoção de uma string de 11 caracteres da className; o comentário novo explicando a correção não é incluído no bundle minificado).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Os cards do checklist "Documentação da Empresa" (e, pelo mesmo componente, "Identidade do CNPJ" e "Documentação dos Sócios") deixam de ficar com alturas desiguais dentro da mesma linha da grade quando fechados/encolhidos.** Antes, um card com mais conteúdo permanente (selo "OBRIGATÓRIO NA ETAPA", link "Dados da análise") deixava os vizinhos mais simples da mesma linha "flutuando" mais baixos, com um vão em branco visível abaixo deles até a próxima linha começar. Agora todos os cards de uma linha esticam a própria caixa até a altura comum da linha -- bordas terminando no mesmo nível.

**Quando um card específico cresce de verdade** (um aviso mais longo do que o normal, ou "Dados da análise" aberto para um arquivo dentro daquele card), a linha continua crescendo para acomodar -- isso nunca dependeu da classe removida, é assim que a grade calcula a altura de cada linha. A única mudança é que os vizinhos mais curtos da mesma linha agora preenchem esse espaço em vez de deixá-lo em branco fora da própria caixa.

**Sem impacto em nenhuma correção anterior.** Nenhuma lógica de negócio, nenhuma regra de visibilidade de campo, nenhum botão ou toggle foi alterado -- só a forma como cada card preenche o espaço vertical dentro da grade.

**Regra geral, válida para qualquer empresa/regime/porte.** A correção está no componente de card genérico reutilizado por todas as seções da tela, para qualquer tipo de empresa -- nenhum caso especial por tipo de documento ou por regime.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, nenhuma mudança de lógica de negócio -- correção puramente visual (uma classe CSS removida). Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
