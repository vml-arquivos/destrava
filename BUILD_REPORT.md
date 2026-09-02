# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita; Rodada 27 — 02/09/2026: botão "Reler" manual em cada card da Etapa 1)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida nesta rodada -- a rota nova e o botão novo só usam código/bibliotecas já presentes no projeto: `express`/`supertest` já eram devDependencies para os testes de integração já existentes).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, depois de acrescentar a nova rota e a função pura `tipoIdentidadeTemReleituraManual` (`server/routes/documentacao.ts`), o novo estado/função/props em `client/src/components/documentos/DocumentosEntidade.tsx` (`relendoTipoIdentidade`, `relerDocumentoIdentidade`, `onReler`/`relendo` em `StatusAnaliseSlot`) e o novo arquivo de teste `tests/releituraManualIdentidadeEtapa1.test.ts`.

## 3. Suíte de testes
`npx vitest run` -- 100 arquivos / 895 testes, todos passando (888 → 895: os 7 testes novos de `tests/releituraManualIdentidadeEtapa1.test.ts`; 99 → 100 arquivos: um arquivo de teste novo). Ver `TEST_REPORT.md` para o detalhe de cada caso coberto e para a nota sobre o caminho de sucesso da rota (que aciona as funções de análise já existentes) não ter teste unitário direto, mesma convenção já usada nas rodadas anteriores para funções impuras com muitas dependências de banco.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Esta rodada altera backend (`server/routes/documentacao.ts`) e frontend (`client/src/components/documentos/DocumentosEntidade.tsx`).

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; a rota nova é pequena, variação desprezível no total).
- Chunk `DocumentosEntidade`: 149.82 kB → 150.93 kB gzip 35.36 kB → 35.56 kB -- crescimento pequeno e esperado (um botão novo, um estado novo, uma função nova de ~15 linhas).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Cada um dos três cards da Etapa 1 (Cartão CNPJ, QSA, Enquadramento Tributário) ganha um botão pequeno "Reler"**, visível sempre que aquele documento já está anexado -- em qualquer um dos quatro estados do card (validado, revisão necessária, aguardando análise, falha na leitura, ou regime a confirmar). Clicar força uma nova leitura SÓ daquele documento (sem depender dos outros dois estarem corretos/anexados, e sem exigir reanexar nenhum arquivo) e atualiza o card com o resultado assim que a releitura terminar -- sem precisar recarregar a página. Isso cobre o caso em que a correção automática (Rodadas 20/26) não se aplicou por algum motivo (documento fora da janela de 5 dias, por exemplo) e o usuário quer forçar a releitura manualmente, sem precisar excluir e reanexar o mesmo arquivo só para disparar uma nova leitura.

**Sem impacto em nenhuma correção anterior.** O botão "Analisar documentos" (que só aparece antes da primeira análise da Etapa 1 e sempre processa os três documentos juntos) e toda a releitura automática já existente (upload novo, falha pendente, correções automáticas de situação cadastral/nome empresarial) continuam funcionando exatamente como antes -- o botão novo é um mecanismo adicional, não uma substituição.

**Regra geral, válida para qualquer empresa/regime/porte.** Os três tipos aceitos pela releitura manual são sempre os mesmos três (Cartão CNPJ, QSA, Enquadramento Tributário) -- o conjunto de documentos que cada empresa específica precisa anexar, calculado por regime/porte em `mapaDocumentalCreditoService.ts`, não foi tocado nesta rodada.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, um endpoint novo nesta rodada (`POST /api/documentacao/empresa/:empresaId/identidade/:tipo/reler`), que só orquestra funções de análise já existentes -- não introduz nenhuma lógica de leitura documental nova. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
