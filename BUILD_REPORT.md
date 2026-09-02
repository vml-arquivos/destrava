# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida nesta rodada -- a correção só usa código/bibliotecas já presentes no projeto, `pool`/`colunasDaTabela` já importados em `analiseCnpjReceitaCartao.ts` desde rodadas anteriores).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, depois de acrescentar o novo type `ResultadoConfirmacaoNomeEmpresarialDocumento`, a função `deveConfirmarNomeEmpresarialViaCartao`, a função `aplicarConfirmacaoNomeEmpresarialDocumentoEmpresa` (`server/services/analiseCnpjReceitaCartao.ts`), o novo item `'razao_social'` em `CAMPOS_RASTREAVEIS_EDICAO_MANUAL` (`server/utils/edicaoManualCamposEmpresa.ts`) e o novo describe/import em `tests/analiseCnpjReceitaCartao.test.ts`.

## 3. Suíte de testes
`npx vitest run` -- 99 arquivos / 888 testes, todos passando (876 → 888: os 12 testes novos do describe `deveConfirmarNomeEmpresarialViaCartao`). Ver `TEST_REPORT.md` para o detalhe de cada caso coberto e para a nota sobre a função impura (`aplicarConfirmacaoNomeEmpresarialDocumentoEmpresa`) não ter teste unitário direto, mesma convenção já usada para as funções irmãs (`aplicarConfirmacaoCadastralDocumentoEmpresa`/`aplicarAtualizacaoContatoDocumentoEmpresa`).

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Esta rodada é **backend-only**: os dois arquivos de código alterados (`server/services/analiseCnpjReceitaCartao.ts`, `server/utils/edicaoManualCamposEmpresa.ts`) e o arquivo de teste ampliado (`tests/analiseCnpjReceitaCartao.test.ts`) não afetam o bundle do frontend.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o backend cresceu só com as duas funções novas desta rodada, variação desprezível no total).
- Chunk `DocumentosEntidade`: 149.82 kB gzip 35.36 kB -- **inalterado** em relação à Rodada 25 (nenhum arquivo de frontend foi tocado nesta rodada).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**O Cartão CNPJ passa a corrigir automaticamente o nome empresarial/razão social do cadastro quando a API gratuita da Receita está desatualizada -- mesmo padrão já em produção para situação cadastral desde a Rodada 20.** Quando o Cartão CNPJ anexado (lido com qualidade mínima confirmada, dentro da validade documental de 30 dias, e com o mesmo número de CNPJ do cadastro) mostra um nome empresarial diferente do sincronizado, o cadastro é corrigido automaticamente -- exigindo, quando há de fato uma correção pendente, que o documento tenha sido emitido há no máximo 5 dias (mesma janela apertada já usada para situação cadastral desde a Rodada 22). Uma edição manual prévia da razão social pelo colaborador trava essa correção automática permanentemente para aquele campo, no mesmo padrão já usado para os outros campos protegidos (`edicaoManualCamposEmpresa.ts`).

**Trava de segurança nova: exige o mesmo número de CNPJ entre cadastro e documento.** Diferente de simplesmente copiar o padrão de situação cadastral, esta rodada acrescenta uma verificação que a Rodada 25 não tinha percebido que fazia falta: um nome divergente sozinho não prova que a empresa mudou de nome -- pode ser um documento de outra empresa anexado por engano. Por isso, quando os dois números de CNPJ são legíveis e diferentes, a correção é recusada e a divergência de nome continua sinalizada normalmente (nada muda para esse caso, que é o cenário genuíno de "documento errado anexado").

**O resultado já aparece corrigido na mesma análise, sem precisar de um novo upload/F5** -- diferente da situação cadastral (Rodada 20), cujo efeito só aparece na consulta seguinte. Isso atende ao pedido explícito do usuário ("tem que... aparecer no modal a análise") e fica registrado como uma assimetria intencional em `PENDENCIAS_REAIS.md` (item 0-O), com a extensão do mesmo tratamento à situação cadastral disponível para uma rodada futura, mediante confirmação.

**Sem impacto em qual conjunto de campos existe por regime, nem em nenhuma outra correção de rodadas anteriores.** A montagem do checklist documental por regime (Rodada 25), a sincronização automática de CNPJ (Rodada 19), a confirmação/trava de situação cadastral (Rodada 20) e a atualização de contato (Rodada 21/22) continuam funcionando exatamente como antes -- esta rodada só acrescenta um campo novo (`razao_social`) ao conjunto de campos que o Cartão CNPJ pode corrigir automaticamente, seguindo o mesmo padrão de decisão pura + aplicação impura já estabelecido.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema (`razao_social` já existe na tabela `empresas` desde antes desta sessão), nenhuma dependência nova, nenhum endpoint novo nesta rodada. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
