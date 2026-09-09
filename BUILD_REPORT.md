# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita; Rodada 27 — 02/09/2026: botão "Reler" manual em cada card da Etapa 1; Rodada 28 — 02/09/2026: grade de campos ilegível corrigida no Acervo Documental, botão "Reler" do Contrato Social confronta contra o Ato da Junta; Rodada 29 — 02/09/2026: auditoria própria de consistência entre tipos de empresa, três inconsistências corrigidas; Rodada 30 — 02/09/2026: cards do Acervo Documental nivelados quando fechados; Rodada 08/09/2026: identidade documental por evidência em Atos da Junta/Contrato Social, atualizada em 09/09/2026 com o terceiro documento real)

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
