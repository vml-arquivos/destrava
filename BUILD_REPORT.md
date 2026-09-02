# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta -- o novo módulo e as funções novas só usam `pg` e funções já existentes no projeto).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final (inclui o novo arquivo `server/utils/confirmacaoCadastralDocumento.ts`, as funções novas em `server/services/analiseCnpjReceitaCartao.ts` e as alterações em `server/services/sincronizacaoReceitaAutomaticaService.ts`).

## 3. Suíte de testes
`npx vitest run` -- 96 arquivos / 824 testes, todos passando (95/796 herdados das rodadas anteriores, sem nenhuma alteração de expectativa, mais 28 testes novos: 16 num arquivo novo, 9 e 3 em dois arquivos ampliados). Ver `TEST_REPORT.md` para o detalhe dos vinte e oito testes novos e as duas provas de causa raiz por reversão temporária.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nesta rodada só arquivos de BACKEND foram alterados/criados (`server/utils/confirmacaoCadastralDocumento.ts` novo; `server/services/analiseCnpjReceitaCartao.ts` e `server/services/sincronizacaoReceitaAutomaticaService.ts` alterados) -- nenhum arquivo de frontend foi tocado.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente; o tamanho cresce de forma desprezível com o módulo e as funções novas desta rodada, bem abaixo de 300 linhas ao todo).
- Chunk `DocumentosEntidade`: 149.75 kB gzip 35.37 kB -- idêntico às Rodadas 18/19, porque nenhum arquivo de frontend foi alterado nesta rodada.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)
A partir do próximo deploy, sempre que o Cartão CNPJ oficial de uma empresa for lido (no upload, ou numa reanálise manual) com qualidade de leitura confirmada, mostrando a empresa ATIVA e dentro do prazo de validade documental de 30 dias (contado a partir da data de emissão/consulta impressa no rodapé do próprio Cartão CNPJ, nunca da data de abertura da empresa), o sistema passa a corrigir automaticamente `situacao_cadastral`/`data_situacao_cadastral` da empresa (quando ainda estiverem desatualizados) e a travar esse valor contra a sincronização automática de CNPJ (Rodada 19) -- que passa a pular a sobrescrita desses dois campos especificamente para essa empresa, mas continua atualizando normalmente os demais campos de registro (natureza jurídica, CNAE, capital social, matriz/filial) e o carimbo de última sincronização. Isso corrige a regressão relatada pelo usuário logo após a Rodada 19 entrar em produção: uma empresa corrigida manualmente (ou pelo próprio Cartão CNPJ) para ATIVA deixa de poder ser revertida de volta para uma situação desatualizada pela reconsulta automática às APIs gratuitas. Nenhuma ação operacional é necessária após o deploy -- a confirmação/trava acontece sozinha na próxima vez que o Cartão CNPJ de cada empresa for lido (upload novo, ou reanálise manual de um Cartão CNPJ já anexado); empresas cujo Cartão CNPJ já estava anexado antes deste deploy só recebem o selo de confirmação na próxima leitura desse documento (upload de um novo Cartão CNPJ, ou clique manual de reanálise no Acervo Documental) -- não há um backfill retroativo automático nesta rodada, por não ter sido pedido e por evitar reprocessar em massa um volume de documentos sem uma necessidade concreta reportada.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova nesta rodada -- é uma correção que reaproveita uma coluna JSONB já existente (`empresas.dados_extra_receita`, desde a migration 035) para gravar um selo aditivo (merge, nunca substituição), e reaproveita funções/tabelas que já existiam (`empresa_historico`, `colunasDaTabela`, `registrarHistoricoSincronizacaoSeguro`, a extração do Cartão CNPJ já existente desde antes desta rodada). Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
