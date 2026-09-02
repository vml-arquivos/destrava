# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta -- o módulo novo e as funções novas só usam `pg` e funções já existentes no projeto).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final (inclui o novo arquivo `server/utils/retentativaAutomaticaAnaliseDocumental.ts`, as funções novas em `server/services/analiseCnpjReceitaCartao.ts`, a extração nova em `server/services/extracaoDocumentalLocal.ts`, a normalização revisada em `server/utils/helpers.ts` e as alterações em `server/routes/documentacao.ts`).

## 3. Suíte de testes
`npx vitest run` -- 98 arquivos / 850 testes, todos passando (824/824 herdados das rodadas anteriores, sem nenhuma alteração de expectativa, mais 26 testes novos: 6 e 11 em dois arquivos novos, 7 e 2 em dois arquivos ampliados). Ver `TEST_REPORT.md` para o detalhe dos vinte e seis testes novos e as quatro provas de causa raiz por reversão temporária.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nesta rodada só arquivos de BACKEND foram alterados/criados (`server/utils/retentativaAutomaticaAnaliseDocumental.ts` novo; `server/utils/helpers.ts`, `server/services/extracaoDocumentalLocal.ts`, `server/services/analiseCnpjReceitaCartao.ts` e `server/routes/documentacao.ts` alterados) -- nenhum arquivo de frontend foi tocado.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente; o tamanho cresce de forma desprezível com o módulo e as funções novas desta rodada, bem abaixo de 400 linhas ao todo).
- Chunk `DocumentosEntidade`: 149.75 kB gzip 35.37 kB -- idêntico às Rodadas 18/19/20, porque nenhum arquivo de frontend foi alterado nesta rodada.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Leitura automática sem clique (Cartão CNPJ).** A partir do próximo deploy, sempre que a tela do Acervo Documental/Dados da Empresa for aberta e o Cartão CNPJ tiver uma falha de leitura persistida de uma tentativa anterior sem nenhuma leitura bem-sucedida depois dela, o sistema tenta a leitura de novo sozinho -- sem precisar clicar em "Analisar documentos" -- respeitando um intervalo mínimo de 15 minutos (padrão, configurável via `RETENTATIVA_ANALISE_DOCUMENTAL_COOLDOWN_MINUTOS`) desde a última tentativa, para não repetir chamadas ao mecanismo de leitura a cada carregamento de tela quando o documento é genuinamente ilegível. Uma empresa cujo Cartão CNPJ já tenha sido lido com sucesso, ou que nunca teve nenhuma falha registrada, não é afetada -- o comportamento continua idêntico ao de antes desta rodada.

**Falso positivo de "divergência de nome" para Empresário Individual.** A partir do próximo deploy, qualquer empresa Empresário Individual cujo Cartão CNPJ/QSA seja lido (ou relido, pela retentativa automática acima) deixa de ser marcada como "Cartão CNPJ diverge da Receita Federal"/"razão social do QSA diverge" só por causa do radical do CNPJ que a Receita imprime na frente do nome nesses documentos -- sem precisar de nenhuma ação manual, porque a correção está na comparação em si, não em um dado gravado. Empresas cujo Cartão CNPJ/QSA já tenha sido lido antes deste deploy com esse falso positivo continuam mostrando o selo antigo até a próxima leitura (nova análise manual, ou a retentativa automática quando aplicável) -- não há backfill retroativo automático nesta rodada, pelo mesmo motivo já registrado nas rodadas anteriores (evitar reprocessar em massa um volume de documentos sem uma necessidade concreta reportada).

**Telefone/e-mail via Cartão CNPJ.** A partir do próximo deploy, sempre que um Cartão CNPJ for lido (upload novo, reanálise manual, ou a retentativa automática) com qualidade de leitura confirmada e dentro do prazo de validade documental de 30 dias, e o documento trouxer telefone e/ou e-mail (nem todo Cartão CNPJ tem os dois preenchidos), esses valores substituem `empresas.telefone`/`empresas.email` -- mesmo que já houvesse um valor diferente cadastrado antes, conforme pedido explícito do usuário ("Substituir"). Isso não interage com a sincronização automática de CNPJ (Rodada 19), que nunca tocava esses dois campos de qualquer forma (proteção já existente em `EMPRESA_CAMPOS_PROTEGIDOS_SYNC`, `server/index.ts`, não alterada nesta rodada).

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova nesta rodada -- as três correções reaproveitam colunas já existentes (`empresas.telefone`/`empresas.email`, desde a criação da tabela) e funções já existentes (`colunasDaTabela`, `registrarHistoricoSincronizacaoSeguro`, `extracaoTemQualidade`, a extração do Cartão CNPJ já existente desde antes desta rodada). Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
