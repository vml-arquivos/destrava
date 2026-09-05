# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita; Rodada 27 — 02/09/2026: botão "Reler" manual em cada card da Etapa 1; Rodada 28 — 02/09/2026: grade de campos ilegível corrigida no Acervo Documental, botão "Reler" do Contrato Social confronta contra o Ato da Junta; Rodada 29 — 02/09/2026: auditoria própria de consistência entre tipos de empresa, três inconsistências corrigidas; Rodada 30 — 02/09/2026: cards do Acervo Documental nivelados quando fechados; Continuidade 05/09/2026 — leitura automática integral e empacotamento Docker corrigido (GPT); Rodada 31 — 05/09/2026: selo de laudo desatualizado corrigido, build/testes reverificados de forma independente; Rodada 32 — 05/09/2026: mesma correção estendida à seção "Identidade do CNPJ"; Rodada 33 — 05/09/2026: matriz documental cruzada Manus AI + GPT implementada; Rodada 34 — 05/09/2026: selo de dispensa do MEI para Atos da Junta/Contrato Social; Rodada 35 — 05/09/2026: scheduler passa a enfileirar sozinho a primeira análise de documentos antigos)

## Rodada 35 (05/09/2026) — scheduler passa a enfileirar sozinho a primeira análise de documentos antigos cobertos por bump de catálogo/versão

A pedido explícito e urgente do usuário, ao diagnosticar um print real (empresa Simples Nacional "PALUMA BURGER LTDA" mostrando QSA/Enquadramento Tributário em "Reanálise necessária" e muitos documentos em "análise pendente") -- ver `CHANGELOG_CORRECOES.md`, seção "Rodada 35", para o rastreamento completo do pipeline e a causa raiz (o job recorrente `executarRetryDocumental` nunca chamava `backfillLaudosService.enqueue()`, deixando documentos antigos de tipos recém-cobertos pela "Continuidade 05/09/2026" sem nenhuma tentativa automática de primeira análise).

**Instalação**: `pnpm install --frozen-lockfile` -- sem erros (`node_modules` precisou ser reinstalado do zero novamente nesta rodada, mesma rotina de sempre entre entregas empacotadas).

**Typecheck**: `npx tsc --noEmit` -- limpo, incluindo a nova constante `LOTE_ENFILEIRAMENTO_BACKFILL` e a chamada nova a `backfillLaudosService.enqueue()` em `server/services/automation/scheduler.ts`.

**Suíte de testes**: `npx vitest run` -- **108 arquivos / 962 testes, todos passando** (960 pré-existentes + 2 novos desta rodada, sem nenhuma expectativa pré-existente alterada -- ver `TEST_REPORT.md`).

**Build de produção**: `pnpm run build` -- concluído com sucesso. Orçamento de bundle dentro do limite: JavaScript inicial 98.7 kB gzip (limite 130 kB), CSS inicial 31.3 kB gzip (limite 45 kB), Landing A1 8.5 kB gzip (limite 20 kB). `dist/index.js` (2.411.963 bytes) e `dist/backfill-laudos.js` (384.115 bytes) -- variação de tamanho de `dist/index.js` compatível com a poucas linhas novas em `scheduler.ts` (constante + uma chamada de método + comentário explicativo); `dist/backfill-laudos.js` idêntico em tamanho ao da Rodada 34, esperado já que nenhum código desse bundle foi alterado. Ambos passando `node --check` sem erro de sintaxe. Pré-renderização estática validada.

**Sobre o alcance desta rodada**: a correção é puramente sobre QUANDO o sistema chama, sozinho, um método (`backfillLaudosService.enqueue`) que já existia e já era usado pelo comando manual `pnpm backfill:laudos -- enqueue-and-run`, sem alteração nenhuma na lógica de extração/classificação/comparação de nenhum documento. Nenhuma migration, nenhuma dependência nova, nenhuma mudança na comparação CNPJ↔QSA↔Enquadramento Tributário.

**Regra geral, válida para qualquer empresa/documento/regime tributário, não hardcoded para uma empresa específica.** O `enqueue()` chamado automaticamente usa o mesmo critério (qualquer tipo com `documentAnalysisConfig`, sem filtro por empresa/CNPJ) já usado pelo comando manual -- a mudança é só passar a chamá-lo sozinho, em lote pequeno, no ciclo já existente do scheduler.

## Rodada 34 (05/09/2026) — selo "OBRIGATÓRIO NA ETAPA" de Atos da Junta Comercial/Contrato Social passa a checar a dispensa do MEI

A pedido do usuário, ao diagnosticar um print real (empresa MEI mostrando esses dois cards como obrigatórios mesmo já dispensados pelo backend) -- ver `CHANGELOG_CORRECOES.md`, seção "Rodada 34", para a causa raiz completa e para o diagnóstico separado (sem alteração de código) do QSA "Reanálise necessária" mostrado no mesmo print.

**Instalação**: `pnpm install --frozen-lockfile` -- sem erros (`node_modules` precisou ser reinstalado do zero novamente nesta rodada, mesma rotina de sempre entre entregas empacotadas).

**Typecheck**: `npx tsc --noEmit` -- limpo, incluindo a nova função `documentoSocietarioDispensadoPorMei` (`shared/documentalPresentation.ts`) e seu uso em `DocumentosEntidade.tsx`.

**Suíte de testes**: `npx vitest run` -- **107 arquivos / 960 testes, todos passando** (957 pré-existentes + 3 novos desta rodada, sem nenhuma expectativa pré-existente alterada -- ver `TEST_REPORT.md`).

**Build de produção**: `pnpm run build` -- concluído com sucesso. Orçamento de bundle dentro do limite: JavaScript inicial 98.7 kB gzip (limite 130 kB), CSS inicial 31.3 kB gzip (limite 45 kB), Landing A1 8.5 kB gzip (limite 20 kB). `dist/index.js` (2.411.654 bytes) e `dist/backfill-laudos.js` (384.115 bytes) -- tamanhos idênticos aos da Rodada 33, esperado para uma correção pequena e localizada de frontend -- ambos passando `node --check` sem erro de sintaxe.

**Sobre o alcance desta rodada**: a correção é puramente sobre qual selo aparece em dois cards do checklist visual, condicionado a um campo (`societaria.atos_dispensados_por_mei`) que o backend já calculava e devolvia antes desta rodada -- nenhuma regra de obrigatoriedade real (o que de fato bloqueia o avanço do dossiê para a próxima etapa) foi tocada. Nenhuma migration, nenhuma dependência nova, nenhuma mudança de comportamento para empresas não-MEI (que continuam vendo "OBRIGATÓRIO NA ETAPA" exatamente como antes).

**Regra geral, válida para qualquer empresa MEI, não hardcoded para uma empresa específica.** A correção lê o mesmo campo que o backend já calcula para qualquer empresa a partir do enquadramento tributário real dela -- nunca por nome ou CNPJ.

## Rodada 33 (05/09/2026) — implementação das correções da matriz documental cruzada (Manus AI + GPT): critério de competência, grauFonte, fonte_normativa, prazos precisos de ECD/DEFIS/DASN-SIMEI, WINDOW_SUPPORT

Implementação das seis correções descritas em `DIAGNOSTICO_SINTESE_MATRIZ_DOCUMENTAL_RODADA_33.md`, a pedido explícito do usuário ("já tem as informações, já tem as conclusões, já estão validadas, então faça agora essas atualizações"). Ver `CHANGELOG_CORRECOES.md`, seção "Rodada 33", para a descrição completa de cada correção e o que foi deliberadamente deixado fora do escopo (4 dos 5 estados fail-closed propostos pela Manus AI; o modelo de dados em 3 camadas).

**Instalação**: `pnpm install --frozen-lockfile` -- sem erros (`node_modules` precisou ser reinstalado do zero nesta rodada, pois não estava presente na cópia de trabalho recebida; nenhuma dependência nova adicionada ou removida).

**Typecheck**: `npx tsc --noEmit` -- limpo, verificado incrementalmente depois de cada um dos seis arquivos de produção alterados (`shared/documentalPresentation.ts`, `server/services/documentAnalysisProfiles.ts`, `server/services/regrasDocumentaisCredito.ts`, `server/services/mapaDocumentalCreditoService.ts`, `server/services/regimeTributarioTemporalService.ts`, `server/services/classificadorDocumentalCentral.ts`, `server/services/documentalLaudoVersioning.ts`) e novamente ao final, com todos juntos.

**Suíte de testes**: `npx vitest run` -- **107 arquivos / 957 testes, todos passando** (936 pré-existentes + 21 novos desta rodada, com 2 expectativas pré-existentes ajustadas por consequência direta e esperada da introdução de `WINDOW_SUPPORT` -- ver `TEST_REPORT.md` para o detalhamento completo, incluindo por que os dois ajustes não alteram o resultado real de aprovação/reprovação de nenhum documento).

**Build de produção**: `pnpm run build` -- concluído com sucesso. Orçamento de bundle dentro do limite: JavaScript inicial 98.7 kB gzip (limite 130 kB), CSS inicial 31.3 kB gzip (limite 45 kB), Landing A1 8.5 kB gzip (limite 20 kB). `dist/index.js` (2.411.654 bytes) e `dist/backfill-laudos.js` (384.115 bytes) gerados nos caminhos exatos consumidos pelo `Dockerfile`/`docker-entrypoint.sh`, ambos passando `node --check` sem erro de sintaxe. Pré-renderização estática validada.

**Sobre o alcance desta rodada**: todas as seis correções são estritamente aditivas ou de ampliação por OR lógico (nunca removem uma condição que já concedia acesso/visibilidade a um documento) -- a única exceção aparente, a mudança de `tipo_exigencia` de `comprovante_residencia` de `'obrigacao_legal'` para `'politica_bancaria'`, não altera se o documento é exigido nem seu prazo de validade padrão (que passou a vir do mesmo lugar central, `documentAnalysisProfiles.ts`, em vez de um valor duplicado hardcoded), só corrige o RÓTULO de que tipo de exigência ele representa. Nenhuma migration de banco é necessária para o funcionamento das cinco primeiras correções; a sexta (`fonte_normativa` em `documentos_regras_credito`) é aditiva e opcional (nullable), compatível com `SELECT *` já em uso, e o sistema funciona corretamente mesmo que a coluna ainda não exista fisicamente no banco de produção (nesse caso `row.fonte_normativa` seria simplesmente `undefined`, e o código já trata isso com `|| null`).

**Regra geral, válida para qualquer tipo de empresa/regime/porte.** Nenhuma das seis correções é condicionada a uma empresa, CNPJ ou tipo societário específico -- todas operam sobre critérios gerais (janela de tempo, tipo documental, citação legal do próprio tipo, data-limite legal do próprio tipo de obrigação), consistente com a exigência permanente desta engenharia de nunca hardcodear uma regra para uma empresa em particular.

**Fonte da matriz de exigências permanece exclusivamente as APIs gratuitas de CNPJ já em uso** (BrasilAPI, CNPJá Open, OpenCNPJ) -- nenhuma das seis correções desta rodada introduz, chama ou depende de qualquer API paga.

## Rodada 32 (05/09/2026) — card de QSA/Enquadramento Tributário da seção "Identidade do CNPJ" também corrigido; toggle de texto

Continuação direta da Rodada 31: o usuário reportou, com novo print da mesma empresa, que a mensagem de "reanálise necessária" continuava aparecendo sob o selo errado "Aguardando análise" no card de QSA/Enquadramento Tributário do TOPO da tela (seção "Identidade do CNPJ") -- um componente/caminho de dados que a Rodada 31 não alcançava (ver `CHANGELOG_CORRECOES.md`, "Rodada 32").

**Instalação**: `pnpm install --frozen-lockfile` -- sem erros, sem mudança de dependências.

**Typecheck**: `npx tsc --noEmit` -- limpo, incluindo o novo parâmetro `statusLeitura` em `statusDocumento` (`server/routes/documentacao.ts`) e o novo estado `reanaliseNecessaria`/`diagnosticoLongo` em `StatusAnaliseSlot` (`DocumentosEntidade.tsx`).

**Suíte de testes**: `npx vitest run` -- **106 arquivos / 936 testes, todos passando** (930 da Rodada 31 + 6 novos desta rodada -- ver `TEST_REPORT.md`). Os 2 novos testes de `tests/relerQsaEnquadramentoAposVersaoMudar.test.ts` também serviram para descartar, com um mock de banco com estado, a hipótese de que o botão "Reler" em si estivesse quebrado -- não estava; só o selo mostrado antes do clique é que estava errado.

**Build de produção**: `pnpm run build` -- concluído com sucesso. Orçamento de bundle dentro do limite: JavaScript inicial 98.7 kB gzip (limite 130 kB), CSS inicial 31.3 kB gzip (limite 45 kB), Landing A1 8.5 kB gzip (limite 20 kB). Pré-renderização estática validada.

**Conclusão desta rodada**: nenhuma migration, nenhuma dependência nova, nenhuma mudança de regra de negócio -- a correção é a propagação de um sinal já calculado (mesma natureza da Rodada 31, num componente diferente) mais um toggle de apresentação para texto longo, com 6 testes novos cobrindo especificamente os dois pontos.

## Rodada 31 (05/09/2026) — verificação independente do pacote recebido do GPT + correção do selo de laudo desatualizado

Esta rodada partiu do zip `destravamain 24.zip`, enviado pelo usuário, contendo o resultado do trabalho de outra IA ("GPT") sobre este mesmo projeto (catálogo de leitura automática de 141 tipos, versionamento de laudos, correção do empacotamento Docker `dist/index.js`/`dist/backfill-laudos.js`, matriz documental por natureza jurídica/regime, entre outros -- ver `CHANGELOG_CORRECOES.md`, seção "Continuidade 05/09/2026", e o próprio `RELATORIO_VALIDACAO_CORRECOES_2026-09-05.md`/`DOCUMENTACAO_LEITURA_AUTOMATICA_2026-09-05.md` incluídos no pacote). O usuário pediu diagnóstico e correção de uma falha na leitura da documentação observada logo após essa implantação (ver `CHANGELOG_CORRECOES.md`, "Rodada 31", para a causa raiz e a correção).

**Instalação**: `pnpm install --frozen-lockfile` -- concluída sem erros nesta máquina, a partir do `pnpm-lock.yaml` incluído no pacote do GPT.

**Typecheck**: `npx tsc --noEmit` -- limpo, incluindo a linha nova adicionada em `server/routes/documentacao.ts` (`resultadoAnalise.analysis_status = lifecycleStatus || 'REANALISE_NECESSARIA';`).

**Suíte de testes**: `npx vitest run` -- **104 arquivos / 930 testes, todos passando** (929 já presentes no pacote do GPT + 1 novo desta rodada, cobrindo especificamente o bug corrigido -- ver `TEST_REPORT.md`). Isto confirma de forma independente a contagem que o próprio `RELATORIO_VALIDACAO_CORRECOES_2026-09-05.md` do GPT reporta (104 arquivos / 929 testes) -- não foi apenas aceita, foi executada do zero nesta máquina.

**Build de produção**: `pnpm run build` -- concluído com sucesso. Orçamento de bundle dentro do limite: JavaScript inicial 98.7 kB gzip (limite 130 kB), CSS inicial 31.3 kB gzip (limite 45 kB), Landing A1 8.5 kB gzip (limite 20 kB). Pré-renderização estática validada (meta OG, Twitter, canonical, React root, bundle).

**Confirmação específica do fix de empacotamento Docker do GPT** (o motivo do deploy anterior ter sido revertido pelo Coolify, por gerar `dist/server/index.js` em vez de `dist/index.js`): confirmado nesta máquina que `dist/index.js` (2.3 MB) e `dist/backfill-laudos.js` (365.5 kB) são gerados nos caminhos exatos consumidos pelo `Dockerfile`/`docker-entrypoint.sh`, e que `node --check dist/index.js` e `node --check dist/backfill-laudos.js` passam sem erro de sintaxe -- o pacote gerado por este build está apto para o mesmo fluxo de deploy que falhou antes da correção do GPT.

**Conclusão desta rodada**: nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova. A única mudança de código é a propagação de um campo (`analysis_status`) já calculado, num único ponto de um único arquivo de rota, mais um teste de regressão -- consistente com o escopo cirúrgico exigido em todas as rodadas anteriores desta sessão.

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida nesta rodada -- a correção é a remoção de uma única classe Tailwind).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, depois de remover `self-start` da className do card do checklist (`client/src/components/documentos/DocumentosEntidade.tsx`).

## 3. Suíte de testes
`npx vitest run` -- 101 arquivos / 910 testes, todos passando (contagem inalterada em relação à Rodada 29 -- correção puramente de CSS, sem nenhuma função pura nova). Ver `TEST_REPORT.md`.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Esta rodada altera só um componente de tela (`client/src/components/documentos/DocumentosEntidade.tsx`) -- nenhuma lógica de backend ou de negócio foi tocada.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK (inalterado -- classe removida, nenhuma nova)
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha).
- Chunk `DocumentosEntidade`: 151.07 kB → 151.06 kB gzip 35.62 kB → 35.62 kB -- praticamente inalterado (a única mudança de código é a remoção de uma string de 11 caracteres da className; o comentário novo explicando a correção não é incluído no bundle minificado).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Os cards do checklist "Documentação da Empresa" (e, pelo mesmo componente, "Identidade do CNPJ" e "Documentação dos Sócios") deixam de ficar com alturas desiguais dentro da mesma linha da grade quando fechados/encolhidos.** Antes, um card com mais conteúdo permanente (selo "OBRIGATÓRIO NA ETAPA", link "Dados da análise") deixava os vizinhos mais simples da mesma linha "flutuando" mais baixos, com um vão em branco visível abaixo deles até a próxima linha começar. Agora todos os cards de uma linha esticam a própria caixa até a altura comum da linha -- bordas terminando no mesmo nível.

**Quando um card específico cresce de verdade** (um aviso mais longo do que o normal, ou "Dados da análise" aberto para um arquivo dentro daquele card), a linha continua crescendo para acomodar -- isso nunca dependeu da classe removida, é assim que a grade calcula a altura de cada linha. A única mudança é que os vizinhos mais curtos da mesma linha agora preenchem esse espaço em vez de deixá-lo em branco fora da própria caixa.

**Sem impacto em nenhuma correção anterior.** Nenhuma lógica de negócio, nenhuma regra de visibilidade de campo, nenhum botão ou toggle foi alterado -- só a forma como cada card preenche o espaço vertical dentro da grade.

**Regra geral, válida para qualquer empresa/regime/porte.** A correção está no componente de card genérico reutilizado por todas as seções da tela, para qualquer tipo de empresa -- nenhum caso especial por tipo de documento ou por regime.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, nenhuma mudança de lógica de negócio -- correção puramente visual (uma classe CSS removida). Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
