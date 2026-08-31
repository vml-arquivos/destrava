# Relatório de Segurança de Migrations — 30/08/2026 (Rodada 3 — final pré-commit)

Três migrations aditivas foram criadas nesta sessão: `100_regime_tributario_linha_do_tempo.sql` (Rodada 2), `101_faturamento_mensal_rolling12.sql` e `102_cobertura_evidencia_bureau.sql` (ambas Rodada 3). Este relatório documenta por que as três são seguras de aplicar contra o banco de produção da VPS.

## Como as numbered migrations funcionam neste repositório (confirmado no código)

`scripts/migrate-db.mjs` (script executado por `npm run migrate`) só aplica `db/migrate.sql`, um arquivo consolidado único. Os arquivos numerados em `db/migrations/*.sql` **não são aplicados automaticamente por nenhum script deste repositório** -- são aplicados manualmente/externamente pelo usuário contra o Postgres da VPS, fora do fluxo de build/deploy do Coolify. Isso significa: nenhuma das três migrations desta sessão roda sozinha em nenhum deploy; build e testes passam com ou sem elas terem sido aplicadas.

## Propriedades de segurança comuns às três migrations

1. **Idempotentes.** Toda `CREATE TABLE` usa `IF NOT EXISTS`; todo `CREATE INDEX` usa `IF NOT EXISTS`; toda função de trigger usa `CREATE OR REPLACE FUNCTION`; todo `DROP TRIGGER` antes de recriar usa `IF EXISTS`. Rodar a mesma migration duas vezes não falha e não duplica nada.
2. **Puramente aditivas.** Nenhuma das três altera, renomeia ou remove qualquer coluna, tabela, índice ou constraint já existente. Cada uma cria exatamente UMA tabela nova, sem tocar em `empresas`, `documentos_arquivos`, `socios_empresa` ou qualquer outra tabela do sistema (só referenciam essas tabelas via FK, nunca as modificam).
3. **FKs protegidas contra schema incompleto.** Toda `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` está dentro de um bloco `DO $$ ... EXCEPTION WHEN undefined_table THEN NULL; END $$` que checa `to_regclass(...)` antes de tentar criar a constraint. Isso significa que, se por qualquer motivo a tabela referenciada (`empresas`, `documentos_arquivos`) não existir no momento em que a migration rodar, a migration não falha -- ela simplesmente não cria aquele FK específico, deixando a tabela nova utilizável sem a garantia referencial até que a FK seja adicionada manualmente depois.
4. **Sem dado a migrar.** As três tabelas são criadas vazias -- não há UPDATE, INSERT ou transformação de dado existente em nenhuma delas. Não existe risco de a migration travar por causa de volume de dado ou de encontrar uma linha em formato inesperado.
5. **Reversíveis sem efeito colateral em outras tabelas.** `DROP TABLE IF EXISTS <tabela> CASCADE` remove cada uma das três de forma limpa (ver `ROLLBACK_PLAN.md`), porque nenhuma outra tabela tem FK apontando PARA elas (só o contrário).

## Detalhe por migration

### 100 — `empresas_regime_tributario_historico` (Rodada 2)
- Um período por linha (`data_inicio`/`data_fim`/`regime`/`fonte`/`confianca`/`documento_evidencia_id`).
- Índice único parcial `uq_regime_historico_periodo_vigente ... WHERE data_fim IS NULL`: garante, no nível de banco, que nunca existem dois períodos "vigentes" (sem fim) para a mesma empresa ao mesmo tempo -- mesmo sob concorrência, uma segunda escrita simultânea falha por violação de unicidade em vez de criar inconsistência. Esta é a única das três com uma constraint de negócio além das FKs padrão.

### 101 — `empresas_faturamento_mensal` (Rodada 3)
- Um valor por linha (`empresa_id`, `ano`, `mes`, `valor`).
- `CHECK (mes >= 1 AND mes <= 12)`: rejeita no banco qualquer tentativa de gravar um mês inválido, independente do que o código da aplicação validar.
- Índice único `uq_faturamento_mensal_empresa_competencia (empresa_id, ano, mes)`: garante uma única linha por competência por empresa -- o serviço (`faturamentoRolling12MesesService.ts`) sempre faz upsert lógico (SELECT antes de decidir INSERT ou UPDATE) respeitando essa unicidade.

### 102 — `document_evidence_coverage` (Rodada 3)
- Uma linha por par (documento, requisito) -- um documento pode ter várias linhas (uma por requisito que cobre).
- Índice único `uq_evidence_coverage_documento_requisito (documento_id, requirement_code)`: garante que o mesmo documento nunca tem duas linhas de cobertura para o mesmo requisito (o serviço faz upsert lógico da mesma forma que as outras duas).
- Única das três com `ON DELETE CASCADE` na FK para `documentos_arquivos` (em vez de `SET NULL`, usado nas outras): faz sentido aqui porque uma linha de cobertura sem o documento que a originou não tem mais nenhum uso -- ao contrário do histórico de regime ou do faturamento por competência, que continuam significativos mesmo que o documento de evidência original seja excluído.

## Como aplicar (ação manual, fora desta entrega)

```
psql "$DATABASE_URL" -f db/migrations/100_regime_tributario_linha_do_tempo.sql
psql "$DATABASE_URL" -f db/migrations/101_faturamento_mensal_rolling12.sql
psql "$DATABASE_URL" -f db/migrations/102_cobertura_evidencia_bureau.sql
```

Podem ser aplicadas em qualquer ordem entre si (nenhuma depende de outra), e podem ser aplicadas antes ou depois do deploy do código desta entrega -- nenhuma rota nova falha se a tabela ainda não existir no banco (as rotas usam `pool.query` diretamente contra a tabela; se ela não existir, a rota devolve HTTP 500 com uma mensagem de erro, nunca corrompe dado nem afeta outra rota).
