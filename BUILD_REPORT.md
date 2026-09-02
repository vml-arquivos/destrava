# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita; Rodada 27 — 02/09/2026: botão "Reler" manual em cada card da Etapa 1; Rodada 28 — 02/09/2026: grade de campos ilegível corrigida no Acervo Documental, botão "Reler" do Contrato Social confronta contra o Ato da Junta)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida nesta rodada -- as duas correções só usam código/bibliotecas já presentes no projeto: Tailwind/CSS já configurados, `analiseDocumentalService`/`vitest`/`supertest` já eram dependências para o código e os testes já existentes).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, depois de acrescentar o parâmetro `compacto: boolean` a `BlocoSecao` (`client/src/components/documentos/ResultadoAnaliseDocumento.tsx`), o bloco especial para `contrato_social`/`alteracao_contratual` na rota `/ia/documentos/:documentoId/extrair` (`server/routes/documentacao.ts`) e os três testes novos em `tests/documentacaoAnaliseEspecializada.integration.test.ts`.

## 3. Suíte de testes
`npx vitest run` -- 100 arquivos / 898 testes, todos passando (895 → 898: os 3 testes novos do crosscheck do Contrato Social, acrescentados a um arquivo de teste já existente -- por isso a contagem de arquivos não muda, 100 → 100). Ver `TEST_REPORT.md` para o detalhe de cada caso coberto.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Esta rodada altera frontend (`client/src/components/documentos/ResultadoAnaliseDocumento.tsx`, correção de CSS) e backend (`server/routes/documentacao.ts`, nova rota especial de crosscheck).

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK (31.2 kB → 31.3 kB, crescimento mínimo pela nova classe utilitária Tailwind `grid-cols-[repeat(auto-fit,minmax(110px,1fr))]`)
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o bloco novo da rota é pequeno, variação desprezível no total).
- Chunk `DocumentosEntidade`: 150.93 kB → 151.02 kB gzip 35.56 kB → 35.61 kB -- crescimento mínimo e esperado (o parâmetro `compacto` novo em `BlocoSecao`, usado por `ResultadoAnaliseDocumento` dentro deste mesmo chunk).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**A grade "AMOSTRA OBJETIVA DOS DADOS LIDOS" (e qualquer outra seção com campos) dentro dos cards do Acervo Documental deixa de quebrar texto letra por letra.** Em qualquer largura de tela, a grade agora se ajusta ao espaço real do card (no máximo 2 colunas em ~230px de largura útil, caindo para 1 se necessário) em vez de forçar 4 colunas por causa da largura da JANELA do navegador. O relatório de página inteira (fora do Acervo Documental compacto) continua com o layout mais denso de antes, sem nenhuma mudança visível ali.

**O botão "Reler" (🔄) de um Contrato Social ou Alteração Contratual já anexado passa a de fato reler o documento**, confrontando-o contra o Ato da Junta Comercial legível mais recente da mesma empresa -- em vez de responder um erro 501 silencioso como antes. Se ainda não houver nenhum Ato da Junta legível anexado, o botão explica exatamente isso ("Anexe um Ato da Junta Comercial legível antes de reler...") em vez de falhar sem explicação.

**Sem impacto em nenhuma correção anterior.** A grade de campos fora do modo compacto, o gatilho automático de análise societária ao anexar Atos da Junta/Contrato Social/Alteração Contratual, o botão "Reler" da Etapa 1 (Rodada 27, tipos diferentes), e todo o restante do despacho de análise especializada por tipo de documento continuam funcionando exatamente como antes.

**Regra geral, válida para qualquer empresa/regime/porte.** A correção de CSS está na função de apresentação genérica usada por todos os tipos de documento, não em um caso especial por tipo; a busca pelo Ato da Junta para o crosscheck é sempre "o mais recente e legível desta empresa", nunca uma empresa ou arquivo fixo. O conjunto de documentos exigido por regime/porte (`mapaDocumentalCreditoService.ts`) não foi tocado nesta rodada.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, nenhum endpoint novo (a correção do Contrato Social é um bloco especial dentro da rota `POST /api/documentacao/ia/documentos/:documentoId/extrair` já existente) -- não introduz nenhuma lógica de leitura documental nova, só um segundo ponto de entrada para uma função de análise já existente e já usada em produção. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
