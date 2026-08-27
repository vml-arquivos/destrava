# Auditoria inicial — Onda 2

Data: 27/08/2026

## Estado Git

A `main` local e `origin/main` estavam limpas no commit `30ba3c8`, com o código funcional publicado em produção no commit anterior `21901bf`. A branch isolada da Onda 2 ainda não foi criada.

## Regra de bloqueio do schema

O arquivo `db/schema_crm.sql` define `crm_historico_funil` com `id`, `lead_id`, `etapa_de`, `etapa_para`, `motivo`, `colaborador_id`, `origem_ia` e `created_at`, além do índice `idx_crm_funil_lead`.

O mesmo arquivo define `crm_metas` com `id`, `colaborador_id`, `periodo`, `meta_leads`, `meta_convertidos`, `meta_valor`, `real_leads`, `real_convertidos`, `real_valor` e `created_at`, além de `UNIQUE(colaborador_id, periodo)`.

O arquivo também define a função `crm_mover_funil`, que registra a transição em `crm_historico_funil`, atualiza `leads.etapa_funil`/`status` e insere atividade `status_change`.

## Consulta de produção exigida

A especificação exige executar, antes de codificar os itens 1 e 6:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_name in ('crm_metas', 'crm_historico_funil')
order by table_name, ordinal_position;
```

A consulta foi executada em 27/08/2026 pelo Editor SQL administrativo, em modo somente leitura. O resultado retornou 18 linhas: `crm_historico_funil` possui exatamente `id uuid`, `lead_id uuid`, `etapa_de text`, `etapa_para text`, `motivo text`, `colaborador_id uuid`, `origem_ia boolean` e `created_at timestamp with time zone`; `crm_metas` possui exatamente `id uuid`, `colaborador_id uuid`, `periodo date`, `meta_leads integer`, `meta_convertidos integer`, `meta_valor numeric`, `real_leads integer`, `real_convertidos integer`, `real_valor numeric` e `created_at timestamp with time zone`. Nenhuma divergência de coluna ou tipo foi observada. A consulta não alterou dados. Índices e função foram verificados em seguida, também em modo somente leitura. A produção possui `crm_historico_funil_pkey` e `idx_crm_historico_funil_lead_data (lead_id, created_at DESC)`, além de `crm_metas_pkey`. A consulta por `crm_mover_funil` retornou apenas os índices, sem uma linha de função; portanto a função `crm_mover_funil` não foi confirmada no banco de produção, embora as duas tabelas e suas colunas existam. O índice do schema versionado (`idx_crm_funil_lead`) também não apareceu com esse nome; existe índice funcional equivalente para lead/data. Antes de integrar o item 6, será necessário criar uma migration aditiva que defina a função exatamente conforme `db/schema_crm.sql`, sem substituir ou remover o índice existente, e validar sua assinatura no banco.

## Restrições já observadas

Não será inventada fórmula de comissão interna. `taxa_comissao` e `percentual_comissao` não serão reutilizados para metas internas. A Onda 3 não será iniciada. As migrations, quando necessárias, serão somente aditivas e seguirão exatamente `db/schema_crm.sql`.
