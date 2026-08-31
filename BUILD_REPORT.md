# Relatório de Build — 31/08/2026 (atualizado, Rodada 15 — bump de RULE_VERSION ausente na Rodada 13 e checagem de laudo desatualizado nos agregadores de Etapa 1)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final.

## 3. Suíte de testes
`npx vitest run` -- 92 arquivos / 784 testes, todos passando (ver `TEST_REPORT.md` para a progressão completa). Prova por reversão temporária confirmou, três vezes (uma por correção desta rodada), que cada uma delas realmente resolve o problema relatado: (1) desligando o bump de `RULE_VERSION` (`server/services/documentalLaudoVersioning.ts`) e o guard `analiseDesatualizada` em `montarQsaDocumentalDados`, a pendência antiga do QSA ("Não foi possível identificar os nomes dos sócios no QSA") reaparece exatamente como no print real reportado pelo usuário; (2) o mesmo experimento em `montarEnquadramentoDados` revelou que nenhum teste pré-existente cobria esse segundo agregador -- a suíte inteira (784 testes) passava mesmo sem o guard, confirmando uma lacuna de cobertura real, agora fechada; (3) desligando a checagem `temPendenciaQsaGraveComMensagem` em `avaliarProntidaoIdentidadeCnpj`, o bloqueio genérico do QSA volta a duplicar a mensagem específica.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nenhum componente React foi alterado nesta rodada -- as três correções são inteiramente de backend: `server/services/documentalLaudoVersioning.ts` (`RULE_VERSION`) e `server/routes/documentacao.ts` (`analiseDesatualizada`, `montarQsaDocumentalDados`, `montarEnquadramentoDados`, `avaliarProntidaoIdentidadeCnpj`).

Orçamento de bundle (checagem automática do próprio projeto) -- idêntico ao das rodadas anteriores, como esperado para uma rodada sem alteração de frontend:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Ação operacional obrigatória após o deploy (não é uma etapa de build, mas condiciona o efeito real desta entrega)
O bump de `RULE_VERSION` só marca os laudos já persistidos como `REANALISE_NECESSARIA` -- ele não reprocessa nada sozinho, e nenhuma rota de leitura (GET) executa a IA de novo automaticamente. Depois de publicar esta correção, é necessário rodar `npm run backfill:laudos -- enqueue-and-run` (script já existente desde a Rodada 7) para reprocessar em lote os laudos marcados como desatualizados, ou usar o botão "↻ Forçar nova leitura" no Acervo Documental para um documento específico. Sem um desses dois passos, a tela da empresa continuaria mostrando o texto antigo mesmo com o código já corrigido em produção.

## Conclusão
Nenhum erro em nenhuma das etapas, em nenhum ponto desta sessão. Nenhuma migration nova foi criada nesta rodada -- o bump de `RULE_VERSION` e a checagem de obsolescência operam inteiramente sobre a infraestrutura de versionamento já existente desde a migration 103 (Rodada 7), sem nenhuma alteração de schema. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
