# Relatório de Build — 31/08/2026 (atualizado, Rodada 12 — selo "Avisos" removido, popover de pendência reescrito, terceiro botão "Outro" para comprovação do regime tributário)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após CADA arquivo alterado nesta rodada (não só uma vez no final).

## 3. Suíte de testes
`npx vitest run` -- 84 arquivos / 766 testes, todos passando (ver `TEST_REPORT.md` para a progressão completa). Prova por reversão temporária confirmou, duas vezes, os dois pontos novos desta rodada: a "identidade flexível" do tipo `comprovante_regime_outro` (sem ela, um documento com conteúdo de ECF seria erroneamente marcado "incompatível") e a exigência de regime explícito (`tiposComprovacaoRegime`, sem ela um documento sem nenhuma menção a regime ficaria "satisfeito" silenciosamente).

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada: `shared/documentTypes.ts` (catálogo), `analiseDocumentalEspecializada.ts` (identidade flexível + `tiposComprovacaoRegime` + `tipoLocal`), `mapaDocumentalCreditoService.ts` e `documentacao.ts` (textos da pendência + `tiposComprovacaoRegime` local), `DocumentosEntidade.tsx` (botão "Outro") e `DossieCreditoEmpresa.tsx` (selo "Avisos" removido)).

Orçamento de bundle (checagem automática do próprio projeto):
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## Conclusão
Nenhum erro em nenhuma das etapas, em nenhum ponto desta sessão. Nenhuma migration nova foi criada nesta rodada -- o novo tipo documental `comprovante_regime_outro` é só uma entrada aditiva no catálogo (`shared/documentTypes.ts`, em memória, sem tabela própria); os documentos enviados por esse caminho usam exatamente a mesma tabela `documentos_arquivos` já usada por qualquer outro tipo. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
