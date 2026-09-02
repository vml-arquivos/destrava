# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta -- o novo serviço só usa `pg` e funções já existentes no projeto).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final (inclui o novo arquivo `server/services/sincronizacaoReceitaAutomaticaService.ts` e o novo import em `server/services/automation/scheduler.ts`).

## 3. Suíte de testes
`npx vitest run` -- 95 arquivos / 796 testes, todos passando (94/788 herdados das rodadas anteriores, sem nenhuma alteração de expectativa, mais 8 testes novos em 1 arquivo novo). Ver `TEST_REPORT.md` para o detalhe dos oito testes novos e a prova de causa raiz por reversão temporária.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nesta rodada só arquivos de BACKEND foram alterados/criados (`server/services/sincronizacaoReceitaAutomaticaService.ts` novo, `server/services/automation/scheduler.ts` alterado, `.env.example` documentado) -- nenhum arquivo de frontend foi tocado.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente; o tamanho cresce de forma desprezível com o novo serviço, ~300 linhas).
- Chunk `DocumentosEntidade`: 149.75 kB gzip 35.37 kB -- idêntico à Rodada 18, porque nenhum arquivo de frontend foi alterado nesta rodada.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)
A partir do próximo deploy, um terceiro job em segundo plano (mesmo scheduler já usado para retry de outbox e rotinas CND/CEMPROT) passa a reconsultar automaticamente, a cada 30 minutos (padrão, configurável via `SINCRONIZACAO_RECEITA_INTERVAL_MS`), até 15 empresas (padrão, configurável) com situação cadastral não-ativa ou nunca sincronizada -- sem precisar de nenhum clique manual. Uma empresa que a Receita já confirma como ativa há dias passa a refletir isso no sistema dentro de algumas horas (6h de intervalo mínimo por padrão para quem está pendente), em vez de ficar presa indefinidamente até alguém lembrar de abrir a ficha e clicar em "Atualizar cadastral". Isso NÃO elimina a janela própria de cada fonte gratuita de CNPJ (nenhuma garante tempo real -- ver `CHANGELOG_CORRECOES.md` para a pesquisa completa), só elimina a espera adicional de "ninguém reconsultou ainda", que era o gargalo real identificado nesta rodada. Nenhuma ação operacional é necessária após o deploy -- o job começa a rodar sozinho assim que o servidor sobe, usando as mesmas três fontes gratuitas já em produção.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova nesta rodada -- é uma correção de infraestrutura (um job novo que grava, sozinho, nas mesmas colunas que o botão manual já grava), reaproveitando funções e tabelas que já existiam (`consultarCnpj`, `empresas`, `empresa_historico`). Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
