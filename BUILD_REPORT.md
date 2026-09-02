# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental")

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final (inclui o novo import cruzado entre `server/routes/documentos.ts` e `server/routes/documentacao.ts`).

## 3. Suíte de testes
`npx vitest run` -- 94 arquivos / 788 testes, todos passando (92/784 herdados das rodadas anteriores, sem nenhuma alteração de expectativa, mais 4 testes novos desta rodada em 2 arquivos novos). Ver `TEST_REPORT.md` para o detalhe dos dois testes novos e a prova de causa raiz por reversão temporária.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nesta rodada só dois arquivos de BACKEND foram alterados -- `server/routes/documentacao.ts` (uma função interna passou a ser `export`, sem nenhuma mudança de comportamento) e `server/routes/documentos.ts` (a leitura automática do upload passa a também gravar em `documentos_extracoes_ia`) -- nenhum arquivo de frontend foi tocado.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente; o tamanho cresce de forma desprezível com o pequeno bloco novo de código adicionado a `documentos.ts`).
- Chunk `DocumentosEntidade`: 149.33 kB gzip 35.25 kB -- BYTE-A-BYTE idêntico ao da Rodada 16, porque nenhum arquivo de frontend foi alterado nesta rodada.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)
A leitura automática de QSA e Enquadramento Tributário/Simples Nacional (que já rodava sozinha em segundo plano assim que o documento era anexado, desde antes desta rodada) passa a também alimentar o banner "Etapa 1 pendente"/"Ação necessária" -- sem precisar clicar em "Iniciar análise documental". Isso fica visível na PRÓXIMA vez que a tela do Acervo Documental carregar depois do upload (reabrir a página, navegar de volta), porque a leitura em si continua sendo assíncrona (alguns segundos, em segundo plano, como já era antes desta rodada) -- não instantaneamente, no mesmo segundo em que o upload termina, sem nenhum recarregamento (ver `PENDENCIAS_REAIS.md`, item 0-D, para essa distinção registrada explicitamente). O botão "Iniciar análise documental" continua existindo e funcionando exatamente como antes -- ele passa a ser necessário só quando a leitura automática ainda não tiver concluído, ou para forçar uma nova leitura.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova nesta rodada -- é uma correção de infraestrutura (onde o resultado de uma leitura automática já existente é gravado), inteiramente contida no backend, reaproveitando uma função (`persistirAnaliseEspecializada`) e uma tabela (`documentos_extracoes_ia`) que já existiam e já eram usadas pelo fluxo manual. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
