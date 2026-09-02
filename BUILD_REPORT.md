# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta -- o módulo novo e as funções novas só usam código já existente no projeto).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final (inclui o novo arquivo `server/utils/edicaoManualCamposEmpresa.ts`, as funções novas/alteradas em `server/services/analiseCnpjReceitaCartao.ts`, a extração ajustada em `server/services/extracaoDocumentalLocal.ts`, a normalização revisada em `server/utils/helpers.ts`, e o trecho novo em `server/index.ts`).

## 3. Suíte de testes
`npx vitest run` -- 99 arquivos / 876 testes, todos passando (850/850 herdados das rodadas anteriores, sem nenhuma alteração de expectativa, mais 26 testes novos: 4 em `normalizarNomeEmpresarial.test.ts`, 1 em `extracaoDocumentalLocal.test.ts`, 10 em `analiseCnpjReceitaCartao.test.ts`, 11 no arquivo novo `edicaoManualCamposEmpresa.test.ts`). Ver `TEST_REPORT.md` para o detalhe dos vinte e seis testes novos e as duas provas de causa raiz por reversão temporária, mais a verificação direta contra os dois documentos reais (Cartão CNPJ e QSA) anexados pelo usuário nesta rodada.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nesta rodada só arquivos de BACKEND foram alterados/criados (`server/utils/edicaoManualCamposEmpresa.ts` novo; `server/utils/helpers.ts`, `server/services/extracaoDocumentalLocal.ts`, `server/services/analiseCnpjReceitaCartao.ts` e `server/index.ts` alterados) -- nenhum arquivo de frontend foi tocado.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente; o tamanho cresce de forma desprezível com o módulo e as funções novas desta rodada, bem abaixo de 300 linhas ao todo).
- Chunk `DocumentosEntidade`: 149.75 kB gzip 35.37 kB -- idêntico às Rodadas 18/19/20/21, porque nenhum arquivo de frontend foi alterado nesta rodada.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Por que os prints que motivaram esta rodada pareciam mostrar que a Rodada 21 "não funcionou".** Os quatro prints enviados junto com o pedido desta rodada eram visualmente idênticos aos de ANTES da Rodada 20/21 -- não dava para saber, só pelos prints, se o deploy da Rodada 21 já tinha sido feito no ambiente onde eles foram tirados. Independentemente disso, esta rodada testou a extração/decisão da Rodada 21 diretamente contra os dois documentos reais (Cartão CNPJ e, pela primeira vez, o QSA real) e confirmou que, mesmo com o deploy da Rodada 21 aplicado, dois problemas reais impediriam a correção completa de acontecer para esta empresa especificamente: o identificador de 11 dígitos no FINAL do nome já gravado no cadastro (a Rodada 21 só cobria o radical no início), e a data grudada no valor de situação cadastral extraído do documento. Os dois estão corrigidos nesta rodada -- ver `CHANGELOG_CORRECOES.md`, seção "Rodada 22".

**Janela de 5 dias para correção automática de situação cadastral (pedido novo desta rodada).** A partir do próximo deploy, quando a leitura do Cartão CNPJ for efetivamente CORRIGIR a situação cadastral já gravada (ou seja, há uma divergência real porque a API gratuita da Receita ainda não pegou a mudança), o documento precisa ter sido emitido há no máximo 5 dias para a correção acontecer automaticamente -- antes disso, o sistema deixa o cadastro como está e aguarda um documento mais recente. Quando não há nenhuma correção a fazer (a situação do documento já bate com a já gravada), a janela de 30 dias já existente desde a Rodada 20 continua suficiente, porque não há nada a "corrigir às pressas" -- é um no-op idempotente.

**Trava permanente contra sobrescrever uma edição manual (pedido novo desta rodada).** A partir do próximo deploy, quando um colaborador editar manualmente a situação cadastral, o telefone ou o e-mail de uma empresa (fora da sincronização automática com a Receita), esse campo específico fica marcado e a leitura automática de documentos (Cartão CNPJ) nunca mais o sobrescreve -- sem expiração por tempo. Telefone e e-mail são rastreados de forma independente: se o colaborador só corrigiu um dos dois manualmente, o outro continua sendo atualizado normalmente pela leitura do documento. Empresas que nunca tiveram nenhum desses campos editados manualmente não são afetadas -- o comportamento continua idêntico ao das Rodadas 20/21.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova nesta rodada -- as quatro correções reaproveitam a coluna já existente `empresas.dados_extra_receita` (JSONB, desde a migration 035) e funções já existentes (`colunasDaTabela`, `registrarHistoricoSincronizacaoSeguro`, `normalizarSituacaoCadastral`, `parseDate`). Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
