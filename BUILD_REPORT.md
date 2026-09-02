# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta -- a correção só chama uma função que já existia no próprio componente).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado após a alteração e uma última vez no final (inclui a nova constante `TIPOS_GATILHO_ANALISE_IDENTIDADE` e a chamada nova em `enviar()`, ambas em `client/src/components/documentos/DocumentosEntidade.tsx`).

## 3. Suíte de testes
`npx vitest run` -- 99 arquivos / 876 testes, todos passando, sem nenhuma alteração de expectativa em relação à Rodada 22 (esta rodada é só de frontend, reaproveitando uma função já existente, sem nenhuma lógica nova de negócio/validação para testar isoladamente). Ver `TEST_REPORT.md` para o detalhe da verificação manual ponta a ponta feita em substituição a um teste automatizado (o projeto não tem infraestrutura de teste de componente React).

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Nesta rodada só um arquivo de FRONTEND foi alterado (`client/src/components/documentos/DocumentosEntidade.tsx`) -- nenhum arquivo de backend foi tocado.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; nenhum código de servidor foi alterado nesta rodada).
- Chunk `DocumentosEntidade`: 149.75 kB → 149.83 kB gzip (35.37 kB → 35.39 kB) -- crescimento desprezível, só a nova constante e o novo bloco `if` dentro de `enviar()`.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento Tributário, sem recarregar a tela.** A partir do próximo deploy, ao anexar qualquer um desses três documentos, o card de identidade (que já existe, logo abaixo da grade "Identidade do CNPJ") passa a mostrar "Aguardando análise" e, em seguida, o resultado real ("OK — validado", "Revisão necessária" com o motivo, ou "Falha na leitura") assim que a leitura terminar -- sem precisar recarregar a página nem navegar para outra aba e voltar. Isso é a mesma função (`iniciarAnaliseIdentidade`) que já roda hoje atrás do botão "Iniciar análise documental", agora também disparada automaticamente e silenciosamente (sem toast) logo após o upload -- exatamente o mesmo padrão que Atos da Junta Comercial/Contrato Social já usam desde a Rodada 17/19. Se, no momento do anexo, ainda faltar algum dos três documentos, nada acontece visivelmente (o sistema aguarda o terceiro documento ser anexado para então analisar os três de uma vez) -- comportamento idêntico ao do botão manual, não alterado nesta rodada.

**Sem impacto nos outros tipos de documento.** Documentos sem leitura automática (Relatório SCR, CND RFB, Nada Consta CADIN/PGFN, etc.) continuam exatamente como estão -- sem nenhum gatilho, sem nenhuma tela nova. Os cinco tipos com leitura automática mas sem card de identidade (DARF, Faturamento 12 meses, Comprovante de Residência e variantes) também continuam exatamente como estavam antes desta rodada -- ver `PENDENCIAS_REAIS.md`, item 0-L, para a decisão de escopo registrada sobre esses cinco tipos.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, nenhum endpoint novo nesta rodada -- a correção reaproveita 100% de um mecanismo (função, endpoints, polling, card de status) já existente e já em produção desde rodadas anteriores, só mudando QUANDO ele é acionado. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
