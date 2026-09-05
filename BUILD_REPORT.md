# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita; Rodada 27 — 02/09/2026: botão "Reler" manual em cada card da Etapa 1; Rodada 28 — 02/09/2026: grade de campos ilegível corrigida no Acervo Documental, botão "Reler" do Contrato Social confronta contra o Ato da Junta; Rodada 29 — 02/09/2026: auditoria própria de consistência entre tipos de empresa, três inconsistências corrigidas; Rodada 30 — 02/09/2026: cards do Acervo Documental nivelados quando fechados; Continuidade 05/09/2026 — leitura automática integral e empacotamento Docker corrigido (GPT); Rodada 31 — 05/09/2026: selo de laudo desatualizado corrigido, build/testes reverificados de forma independente)

## Rodada 31 (05/09/2026) — verificação independente do pacote recebido do GPT + correção do selo de laudo desatualizado

Esta rodada partiu do zip `destravamain 24.zip`, enviado pelo usuário, contendo o resultado do trabalho de outra IA ("GPT") sobre este mesmo projeto (catálogo de leitura automática de 141 tipos, versionamento de laudos, correção do empacotamento Docker `dist/index.js`/`dist/backfill-laudos.js`, matriz documental por natureza jurídica/regime, entre outros -- ver `CHANGELOG_CORRECOES.md`, seção "Continuidade 05/09/2026", e o próprio `RELATORIO_VALIDACAO_CORRECOES_2026-09-05.md`/`DOCUMENTACAO_LEITURA_AUTOMATICA_2026-09-05.md` incluídos no pacote). O usuário pediu diagnóstico e correção de uma falha na leitura da documentação observada logo após essa implantação (ver `CHANGELOG_CORRECOES.md`, "Rodada 31", para a causa raiz e a correção).

**Instalação**: `pnpm install --frozen-lockfile` -- concluída sem erros nesta máquina, a partir do `pnpm-lock.yaml` incluído no pacote do GPT.

**Typecheck**: `npx tsc --noEmit` -- limpo, incluindo a linha nova adicionada em `server/routes/documentacao.ts` (`resultadoAnalise.analysis_status = lifecycleStatus || 'REANALISE_NECESSARIA';`).

**Suíte de testes**: `npx vitest run` -- **104 arquivos / 930 testes, todos passando** (929 já presentes no pacote do GPT + 1 novo desta rodada, cobrindo especificamente o bug corrigido -- ver `TEST_REPORT.md`). Isto confirma de forma independente a contagem que o próprio `RELATORIO_VALIDACAO_CORRECOES_2026-09-05.md` do GPT reporta (104 arquivos / 929 testes) -- não foi apenas aceita, foi executada do zero nesta máquina.

**Build de produção**: `pnpm run build` -- concluído com sucesso. Orçamento de bundle dentro do limite: JavaScript inicial 98.7 kB gzip (limite 130 kB), CSS inicial 31.3 kB gzip (limite 45 kB), Landing A1 8.5 kB gzip (limite 20 kB). Pré-renderização estática validada (meta OG, Twitter, canonical, React root, bundle).

**Confirmação específica do fix de empacotamento Docker do GPT** (o motivo do deploy anterior ter sido revertido pelo Coolify, por gerar `dist/server/index.js` em vez de `dist/index.js`): confirmado nesta máquina que `dist/index.js` (2.3 MB) e `dist/backfill-laudos.js` (365.5 kB) são gerados nos caminhos exatos consumidos pelo `Dockerfile`/`docker-entrypoint.sh`, e que `node --check dist/index.js` e `node --check dist/backfill-laudos.js` passam sem erro de sintaxe -- o pacote gerado por este build está apto para o mesmo fluxo de deploy que falhou antes da correção do GPT.

**Conclusão desta rodada**: nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova. A única mudança de código é a propagação de um campo (`analysis_status`) já calculado, num único ponto de um único arquivo de rota, mais um teste de regressão -- consistente com o escopo cirúrgico exigido em todas as rodadas anteriores desta sessão.

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
