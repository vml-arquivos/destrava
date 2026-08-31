# Relatório de Build — 31/08/2026 (atualizado, Rodada 11 — "Dados da análise" direto para incompatível + janela de 12 meses na transição de regime)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após CADA arquivo alterado nesta rodada (não só uma vez no final).

## 3. Suíte de testes
`npx vitest run` -- 83 arquivos / 762 testes, todos passando (ver `TEST_REPORT.md` para a progressão completa). Prova por reversão temporária confirmou, para a checagem de dias de `transicaoDeRegimeRecente` (o refinamento novo desta rodada), que os testes de "transição antiga" falham exatamente como o comportamento da Rodada 10 (sem limite de tempo) quando a checagem é removida.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada: `documentoIncompativel` em `DocumentosEntidade.tsx`, e `transicaoDeRegimeRecente`/`regime_vigente_desde` em `shared/documentalPresentation.ts` + `mapaDocumentalCreditoService.ts`).

Orçamento de bundle (checagem automática do próprio projeto):
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## Conclusão
Nenhum erro em nenhuma das etapas, em nenhum ponto desta sessão. Nenhuma migration nova foi criada nesta rodada -- `regime_vigente_desde` é derivado, em memória, da mesma linha do tempo já lida da tabela `empresas_regime_tributario_historico` (existente desde a migration 100, Rodada 2); nenhuma alteração de schema foi necessária. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
