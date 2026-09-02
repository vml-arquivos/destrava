# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta -- a correção só usa `useEffect`/`useRef`, já importados de `react` neste mesmo arquivo, e a rota de status que já existia).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado após a alteração e uma última vez no final (inclui o novo `useRef` `tentativasVerificacaoAutomaticaRef` e o novo `useEffect` de verificação automática, ambos em `client/src/components/documentos/DocumentosEntidade.tsx`).

## 3. Suíte de testes
`npx vitest run` -- 99 arquivos / 876 testes, todos passando, sem nenhuma alteração de expectativa em relação à Rodada 23 (esta rodada é só de frontend, reaproveitando uma rota já existente, sem nenhuma lógica nova de negócio/validação para testar isoladamente). Ver `TEST_REPORT.md` para o detalhe da verificação manual ponta a ponta feita em substituição a um teste automatizado (o projeto não tem infraestrutura de teste de componente React).

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Nesta rodada só um arquivo de FRONTEND foi alterado (`client/src/components/documentos/DocumentosEntidade.tsx`) -- nenhum arquivo de backend foi tocado.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; nenhum código de servidor foi alterado nesta rodada).
- Chunk `DocumentosEntidade`: 149.83 kB → 150.42 kB gzip (35.39 kB → 35.55 kB) -- crescimento pequeno, só o novo `useRef`/`useEffect` de verificação automática.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Uma leitura que já estava pendente/falhada de antes (sem nenhum upload novo) passa a se resolver sozinha na tela, sem recarregar a página.** A partir do próximo deploy, sempre que o card de identidade mostrar algum item da Etapa 1 (Cartão CNPJ, QSA ou Enquadramento Tributário) como "Falha na leitura", a tela passa a checar sozinha, a cada 60 segundos, se a retentativa automática (já existente desde a Rodada 21, cooldown de 15 minutos) já resolveu -- e atualiza o card assim que o resultado mudar, sem precisar de F5 nem de um novo upload. Isso complementa (não substitui) o gatilho da Rodada 23, que continua cuidando do caso de um upload novo acontecer nesta mesma aba.

**Sem impacto nos outros tipos de documento nem em quem já está com a Etapa 1 resolvida.** Enquanto não houver nenhum item com "Falha na leitura" no card de identidade, nenhuma verificação extra roda -- nem para os tipos sem leitura automática, nem para os cinco tipos com leitura automática mas sem card de identidade (ver `PENDENCIAS_REAIS.md`, item 0-L), nem para empresas com a Etapa 1 já validada.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, nenhum endpoint novo nesta rodada -- a correção reaproveita 100% de uma rota (`.../analise-inicial/status`) já existente e já em produção desde a Rodada 17, só passando a chamá-la também em segundo plano, sem interação do usuário. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
