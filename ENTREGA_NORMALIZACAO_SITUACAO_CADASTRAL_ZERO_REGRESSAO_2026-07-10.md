# Entrega — Normalização Cadastral e Blindagem dos Diagnósticos

## Resumo

Aplicada a Sprint 8.1 para corrigir definitivamente a interpretação da situação cadastral nos motores de diagnóstico do Destrava.

O problema corrigido era o uso de lógica baseada em `includes("ativa")`, que podia classificar indevidamente valores como `INATIVA` como se fossem `ATIVA`, porque a palavra `inativa` contém `ativa`.

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `server/utils/situacaoCadastral.ts` | Utilitário central para normalizar e classificar situação cadastral de forma segura. |
| `tests/situacaoCadastral.test.ts` | Testes automatizados para situações ativas, inativas, irregulares, desconhecidas e motores principais. |

## Arquivos modificados

| Arquivo | Ajuste |
|---|---|
| `server/services/pendenciasEmpresaService.ts` | Substituída lógica insegura por `isSituacaoAtiva` e `isSituacaoIrregular`. |
| `server/services/propostaBancariaService.ts` | Blindada pontuação, riscos, pendências e pontos fortes contra falso positivo de situação ativa. |
| `server/services/relatorioTecnicoEmpresaService.ts` | Blindada análise cadastral, score, pendências e risco cadastral. |
| `server/services/esteiraCreditoService.ts` | Blindada etapa de cadastro para bloquear empresa inativa/inapta/baixada. |
| `server/routes/documentacao.ts` | Corrigida pendência de CNPJ para usar classificador seguro. |
| `server/services/analiseCnpjReceitaCartao.ts` | Corrigida análise do Cartão CNPJ e Receita para não classificar `INATIVA` como `ATIVA`. |

## Regras implementadas

- `ATIVA`, `REGULAR`, `HABILITADA` e equivalentes positivos podem ser classificados como ativos.
- `INATIVA`, `BAIXADA`, `SUSPENSA`, `INAPTA`, `NULA`, `CANCELADA` e `PARALISADA` nunca são classificados como ativos.
- `null`, `undefined`, vazio e `Não informado` são tratados como desconhecidos.
- Textos longos como `Situação cadastral: ATIVA` são aceitos como ativos.
- Textos longos como `Situação cadastral: INATIVA` continuam sendo irregulares.

## Garantias de zero regressão

- Nenhuma migration criada.
- Nenhuma tabela alterada.
- Nenhuma rota removida.
- Nenhum documento apagado, movido ou regravado.
- Nenhuma alteração destrutiva no banco.
- Nenhuma alteração destrutiva no storage.
- Compatibilidade preservada com Inteligência 360, Proposta Bancária, Relatório Técnico, Motor de Pendências, Esteira, Histórico e Nexus/n8n.

## Validações executadas

| Comando | Resultado |
|---|---|
| `npm test -- --run` | Aprovado — 371 testes passaram. |
| `npm run build` | Aprovado — Vite + esbuild concluídos. |
| `npx tsc --noEmit --skipLibCheck --target ES2020 --moduleResolution bundler --module ESNext server/utils/situacaoCadastral.ts tests/situacaoCadastral.test.ts` | Aprovado — arquivos novos e testes novos sem erro de tipo. |
| `npm run check -- --pretty false` | Tentado, mas não concluiu no sandbox por timeout do ambiente. |

## Observação

O build de produção e a suíte automatizada completa passaram. O `npm run check` deve ser reexecutado no ambiente local/Coolify/CI, pois neste sandbox o processo de TypeScript não retornou antes do limite de tempo.

## Próximo passo recomendado

Com a normalização cadastral concluída, o sistema está tecnicamente mais seguro para avançar para a próxima fase: **Sprint 9 — Dossiê Bancário Premium**.
