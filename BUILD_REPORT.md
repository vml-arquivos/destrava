# Relatório de Build — 31/08/2026 (atualizado, Rodada 14 — limpeza visual e deduplicação de avisos no Acervo Documental, para qualquer tipo/porte/enquadramento de empresa)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final.

## 3. Suíte de testes
`npx vitest run` -- 89 arquivos / 778 testes, todos passando (ver `TEST_REPORT.md` para a progressão completa). Prova por reversão temporária confirmou, quatro vezes (uma por correção desta rodada), que cada uma delas realmente resolve o problema relatado: o sufixo duplicado de sócio no QSA (`formatarSocio`), os dois avisos idênticos sobre Atos da Junta não anexado (`montarValidacaoSocietaria`), os dois avisos idênticos sobre a mesma pendência do Enquadramento Tributário (`avaliarProntidaoIdentidadeCnpj`) e o código interno do motor de extração exposto cru em "Fonte da leitura" (`montarResultadoDetalhadoRelatorio`/`formatarFonteLeituraAmigavel`).

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nenhum componente React foi alterado nesta rodada -- as quatro correções são inteiramente de backend/lógica compartilhada: `shared/documentalPresentation.ts` (`formatarSocio`) e `server/routes/documentacao.ts` (`montarValidacaoSocietaria`, `avaliarProntidaoIdentidadeCnpj`, `montarResultadoDetalhadoRelatorio`/`formatarFonteLeituraAmigavel`).

Orçamento de bundle (checagem automática do próprio projeto) -- idêntico ao das rodadas anteriores, como esperado para uma rodada sem alteração de frontend:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## Conclusão
Nenhum erro em nenhuma das etapas, em nenhum ponto desta sessão. Nenhuma migration nova foi criada nesta rodada -- as quatro correções são de apresentação/agregação de texto sobre dados já calculados em memória a cada requisição, sem nenhuma alteração de schema. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
