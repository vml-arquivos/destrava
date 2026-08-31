# Relatório de Build — 31/08/2026 (atualizado, Rodada 8 — mensagem mínima, fim da duplicidade de alertas, selo visual correto)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após CADA arquivo alterado nesta rodada (não só uma vez no final).

## 3. Suíte de testes
`npx vitest run` -- 82 arquivos / 740 testes, todos passando (ver `TEST_REPORT.md` para a progressão completa). Prova por reversão temporária confirmou, para os DOIS bugs corrigidos nesta rodada (duplicidade de alertas e selo visual genérico), que os testes correspondentes falham exatamente como o bug relatado quando a correção não está presente.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada: as mensagens mínimas e a consolidação de alertas em `server/services/analiseDocumentalEspecializada.ts`, e a propagação de `dados_extraidos`/conclusão explícita em `server/routes/documentacao.ts`).

Orçamento de bundle (checagem automática do próprio projeto):
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## Conclusão
Nenhum erro em nenhuma das etapas, em nenhum ponto desta sessão. Três migrations aditivas foram criadas nesta rodada (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar -- aplicá-las contra o Postgres da VPS é uma etapa manual separada, fora desta verificação de build.
