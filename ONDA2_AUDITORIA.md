# Auditoria e execução da Onda 2 — Máquina de Vendas

Data do registro: 27/08/2026.

## Estado de código e produção antes do rollout

A produção Coolify estava saudável no código da Onda 1 (`21901bf`; deployment `fkk1pleycovjpc0snq3akync`, **Success**, healthcheck **healthy**, aplicação **Running**). A `main` remota foi promovida ao commit `2c338c8b40c767a69366874fc9b486539cfacf3d` após o rollout. A branch isolada `onda-2-maquina-de-vendas` recebeu os commits funcionais da Onda 2 e foi publicada no remoto até `1863314`.

A alteração local deste arquivo foi mantida fora do commit funcional do item 6 e só está sendo consolidada agora como documentação factual. O commit funcional `1863314` contém somente código, migration 094, agregador e teste focal; não contém este relatório.

## Auditoria obrigatória do schema

Antes dos itens 1 e 6, a consulta exigida foi executada em produção pelo Editor SQL autenticado, somente leitura:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_name in ('crm_metas', 'crm_historico_funil')
order by table_name, ordinal_position;
```

O resultado retornou 18 colunas compatíveis com o desenho de `db/schema_crm.sql`. `crm_historico_funil` possui `id`, `lead_id`, `etapa_de`, `etapa_para`, `motivo`, `colaborador_id`, `origem_ia` e `created_at`. `crm_metas` possui `id`, `colaborador_id`, `periodo`, `meta_leads`, `meta_convertidos`, `meta_valor`, `real_leads`, `real_convertidos`, `real_valor` e `created_at`.

A produção tinha `crm_historico_funil_pkey` e `idx_crm_historico_funil_lead_data (lead_id, created_at DESC)`, equivalentes ao índice de consulta por lead; o índice equivalente existente foi preservado. A função `crm_mover_funil` não existia e `crm_metas` não possuía a unicidade `(colaborador_id, periodo)`. A consulta de duplicidades em `crm_metas` retornou zero linhas, permitindo criar o índice único sem escolher ou excluir registros.

Também foram confirmados `crm_atividades` com as colunas usadas pela função de referência, `triagem_leads` com os campos necessários de triagem, `contratos_gerados` com `lead_id` e campos de fechamento, e a tabela real `public.orcamentos_timbrados`. A tabela `public.orcamentos` não existe.

A auditoria confirmou ainda que produção não possuía `leads.probabilidade_conversao` nem `leads.probabilidade_aprovacao`, embora o endpoint existente da IA já tentasse gravá-las. Não foram inventadas probabilidades nem feito backfill artificial.

## Itens implementados

| Item | Entrega | Estado |
| --- | --- | --- |
| 1 | Metas comerciais e realizado por colaborador e mês, com autorização de gestão, upsert idempotente e cálculo a partir de leads/contratos reais | Implementado nos commits `3ec7e85` e dependente de migration 091 aplicada |
| 2 | Forecast ponderado por IA usando `valor_solicitado × probabilidade / 100`, sem recalcular probabilidades; retorno `503 migration_pending` enquanto o schema faltar | Implementado no commit `0ba3288` e dependente de migration 092 aplicada |
| 3 | Métricas de vendas por vendedor/período e vínculo nullable orçamento→lead; sem comissão interna | Implementado no commit `b41c3a3` e dependente de migration 093 aplicada |
| 4 | Timeline 360 estendida com triagem e fonte real `orcamentos_timbrados` | Implementado no commit `b574e82` |
| 5 | Testes focais, typecheck, suíte e build para os serviços e timeline | Implementado e validado nos commits anteriores da branch |
| 6 | Auditoria central de etapa/responsável, endpoint protegido de leitura e seção “Histórico de mudanças” na ficha do lead | Implementado no commit `1863314` |

A auditoria do item 6 cobre `POST /api/crm/mover-funil` e `PATCH /api/leads/:id`, incluindo mudanças apenas de responsável, mudanças apenas de etapa, autoatribuição ao sair da entrada e ausência de novo registro quando nenhum campo operacional muda. O helper tolera temporariamente a indisponibilidade da tabela histórica sem bloquear o update legado. A ficha carrega o recurso novo com fallback vazio e mantém atividades, documentos e qualificações existentes.

O endpoint de leitura `GET /api/crm/historico-funil?lead_id=...` exige autenticação, valida a posse/carteira por `leadPertenceAoColaborador`, limita a 200 registros, ordena por data e não expõe dados sensíveis além do nome/cargo do autor, etapa, motivo e origem IA.

Não foi criada tela adicional de gestão para metas/forecast/métricas nesta etapa: o escopo exigia os endpoints para os itens 1–3 e tela explícita para o item 6. Não foi alterado o CRM existente além da seção aditiva da ficha.

## Migrations 091–094 aplicadas em produção

Como o projeto não executa auto-migrate, a aplicação foi feita após a confirmação operacional do usuário, usando o Editor SQL autenticado. Não há backup agendado no Coolify para esta aplicação (`Schedules 0`, `Enabled 0`, `Total executions 0`); por isso o rollout foi aditivo, idempotente e interrompível, sem criar dados de negócio.

A primeira tentativa multi-statement falhou antes do commit por usar nome de índice qualificado em posição inválida. Foi emitido `ROLLBACK`, com sucesso e sem dados alterados. Uma segunda tentativa multi-statement foi reportada como sucesso pela interface, mas o preflight mostrou que nenhum objeto havia sido criado; ela não foi considerada válida. A execução final foi dividida em statements isolados, cada um aceito e depois verificado.

| Migration | Alteração efetivamente aplicada |
| --- | --- |
| `091` | `idx_crm_metas_colaborador_periodo` único e `idx_crm_metas_periodo` |
| `092` | Campos de probabilidade/IA em `leads`, campos de estado da IA em `triagem_leads` e `idx_leads_ia_ativa` |
| `093` | `orcamentos_timbrados.lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL` e índice parcial |
| `094` | Função `public.crm_mover_funil(uuid,text,text,uuid,boolean)` conforme referência, disponibilizada sem invocação durante a migration |

Preflight pós-migration em `2026-08-27T22:01:44.755Z`:

| Verificação | Resultado |
| --- | --- |
| Índice único de metas | `true` |
| Índice de metas por período | `true` |
| Função `crm_mover_funil` | `true` |
| Campos IA em `leads` | `analise_credito_ia`, `ia_ativa`, `ia_motivo_pausa`, `ia_pausada_ate`, `linha_recomendada`, `prazo_aprovacao_estimado`, `probabilidade_aprovacao`, `probabilidade_conversao`, `proxima_acao_ia` |
| Campos IA em `triagem_leads` | `ia_ativa`, `ia_pausada_ate` |
| `orcamentos_timbrados.lead_id` | `true` |
| Índice parcial de orçamento | `true` |
| Linhas criadas em `crm_metas` durante o rollout | `0` |
| Orçamentos vinculados durante o rollout | `0` |

A função 094 não foi chamada porque a aplicação atual preserva uma camada de compatibilidade UI↔etapas legadas e a produção possui trigger histórico compatível. As rotas usam o helper seguro equivalente após o update, evitando mudança cega de `status` e evitando duplicidade durante o rollout.

## Validação local e rollback

Foram aprovados na branch final `pnpm check`, `pnpm test --run`, `pnpm build` e `git diff --check`. A suíte focal do item 6 passou com 4 testes; as suítes de timeline e métricas passaram com 40 e 5 testes, respectivamente. A suíte completa e o build terminaram sem falhas; permanecem apenas os warnings já conhecidos de bundle inicial `dist/index.js` aproximadamente 2,0 MB e cenários deliberados de conexão recusada/fallback em testes de IA.

Rollback de aplicação: retornar ao código funcional `21901bf`; `30ba3c8` é o último registro documental anterior à integração na `main`. O deployment da Onda 2 foi `vlb8ezviipjxyhmemek50rxg`, com **Success** em aproximadamente 4m38s, healthcheck **healthy**, rolling update concluído e aplicação **Running**. O rollback do código não remove as estruturas 091–094; elas são aditivas e devem permanecer compatíveis. Não executar DROP, DELETE ou TRUNCATE como “rollback” automático.

## Validação pós-publicação em produção

Após o deployment `vlb8ezviipjxyhmemek50rxg`, foram executados smoke tests somente leitura. `GET /api/health` retornou `status: ok`, `db: connected` e `n8n_configured: true`; a landing respondeu HTTP 200 e token de convite inválido retornou HTTP 404. A fila CRM carregou com 3 leads ativos e a ficha abriu exibindo “Histórico de mudanças”; a triagem carregou 30 itens, com 16 aguardando, 2 possíveis clientes e 1 convertido. Os endpoints autenticados responderam HTTP 200: metas sem registros, forecast com 1 lead e pipeline bruto de R$ 250.000 com forecast ponderado R$ 0, e métricas com 14 contratos fechados, receita R$ 0 e 14 contratos sem lead. Orçamentos e contratos carregaram com seus controles existentes, sem criação ou edição. O Histórico 360 autenticado respondeu HTTP 200 com 27 eventos reais para a empresa testada; não havia evento de triagem nessa empresa específica.

## Restrições de negócio preservadas

Não foi implementado comissionamento interno. `taxa_comissao` de contratos e `percentual_comissao` de parceiros não foram reutilizados. A regra interna permanece **aguardando definição do cliente**: percentual ou bônus, base de cálculo, período, faixas e estorno/cancelamento precisam ser definidos antes de qualquer fórmula.

A Onda 3, incluindo portal do cliente, permanece bloqueada e não foi iniciada.
