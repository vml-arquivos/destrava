# Entrega — Correção apagar semana no Acompanhamento Bancário

## Problema
A rota `DELETE /api/acompanhamentos-bancarios/:id/atualizacoes/:numeroSemana` retornava 500 ao apagar uma atualização semanal.

## Causa provável
A semana possuía alertas/diagnósticos vinculados em `acompanhamento_bancario_alertas`. Em bases antigas, a FK/limpeza pode não estar com cascade efetivo, bloqueando o delete da atualização semanal.

## Correção
- A rota agora busca a atualização semanal antes de apagar.
- Remove explicitamente os alertas vinculados pela semana e/ou pelo `atualizacao_id`.
- Só depois remove a linha de `acompanhamento_bancario_atualizacoes`.
- Recalcula `ultimo_update_em` e `proxima_atualizacao` com base na última semana restante.
- Ajusta também a exclusão do acompanhamento inteiro para limpar alertas antes das atualizações.

## Arquivo alterado
- `server/index.ts`

## Migration
Não precisa migration.

## Validação
- `npm run build`: OK
