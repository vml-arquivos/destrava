# Entrega: Automation Engine — Destrava Crédito ⇄ Nexus Gestão

**Data:** 2026-07-22
**Status:** ✅ Entregue com zero regressão
**Testes:** 421/421 passando (23 arquivos, +23 novos: automationOutbox, automationConcurrency, webhookAuth, automationRecorrenciaCancelamento)
**TypeScript:** 0 erros
**Build:** Completo (vite build + prerender + bundle-budget + esbuild server)

---

## Objetivo

Substituir a integração manual/pontual existente com o Nexus Gestão (botão "enviar pendência", sincronização de catálogo sob demanda) por um Automation Engine orientado a eventos: contrato de assessoria assinado dispara automaticamente as rotinas recorrentes de CND (mensal, dia 22) e CEMPROT (semanal); acompanhamento bancário criado gera automaticamente uma tarefa por semana no Nexus, executada dentro do próprio Destrava e sincronizada em tempo real — sem duplicar tarefas, sem alterar usuários/permissões existentes, sem remover nada do que já existia.

Este documento cobre a metade Destrava. O Nexus tem seu próprio `ENTREGA_AUTOMATION_ENGINE_2026-07-22.md` espelhando esta estrutura.

---

## Arquitetura

Nenhuma infraestrutura nova (sem Redis/RabbitMQ/Kafka) — os dois sistemas já são deployados de forma independente e já se falam via HTTP autenticado; um broker moveria poucos eventos por dia às custas de uma dependência operacional que nenhum dos dois ambientes tem hoje. Em vez disso:

- **Outbox** (`automation_events`): todo evento de domínio é gravado antes de ser despachado, garantindo entrega mesmo se a chamada HTTP falhar.
- **Despacho imediato + varredura de retry**: efeito "tempo real" no caminho feliz, com `setInterval` (primeiro agendador que o Destrava já teve) reentregando o que falhar.
- **Assinatura HMAC-SHA256 + timestamp + nonce** por cima do segredo estático já existente (`NEXUS_INTEGRATION_SECRET`/`requireNexusIntegration`) — reforça sem substituir.
- **Idempotência em duas camadas**: `UNIQUE(event_type, idempotency_key)` no outbox impede publicar o mesmo evento duas vezes; `pg_advisory_xact_lock` + `ON CONFLICT DO NOTHING` do lado Nexus impede duas entregas concorrentes criarem duas tarefas.

---

## Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `server/services/automation/outboxRepository.ts` | Persistência do outbox: inserir (idempotente), reivindicar lote pendente (`FOR UPDATE SKIP LOCKED`), marcar sucesso/falha, registrar auditoria. |
| `server/services/automation/eventBus.ts` | Catálogo tipado de eventos + `publishEvent()`, ponto único de publicação. |
| `server/services/automation/dispatcher.ts` | Despacho imediato e varredura de retry; grava `nexus_task_links` a partir da resposta do Nexus para `AcompanhamentoCriado`. |
| `server/services/automation/webhookClient.ts` | Cliente HTTP assinado (HMAC) para chamar o Nexus (`enviarWebhookNexus`/`chamarNexus`). |
| `server/services/automation/scheduler.ts` | Primeiro scheduler do Destrava: varredura de retry + avaliação das rotinas CND (dia 22)/CEMPROT (semanal) para contratos de assessoria ativos. |
| `server/middleware/webhookAuth.ts` | Verificação de assinatura HMAC + janela de replay + nonce de uso único. |
| `server/routes/automationEngine.ts` | `GET /api/automation/events`, `POST /api/automation/events/:id/retry` (admin) e `GET /api/automation/alertas` (qualquer colaborador, para o sino de notificações). |
| `server/routes/acompanhamentoBancarioNexus.ts` | Proxy de leitura/escrita da tarefa do Nexus para uma semana de acompanhamento bancário (Workflow 2). |
| `client/src/components/NotificacoesAutomacao.tsx` | Sino de alertas (7d/3d/1d/hoje/atrasado) de rotinas e acompanhamento bancário. |
| `db/migrations/072_automation_engine.sql` | `automation_events`, `automation_audit_log`, `nexus_task_links`, `automation_alerts_cache`; vigência em `contratos_gerados`. |
| `tests/automationOutbox.test.ts`, `tests/automationConcurrency.test.ts`, `tests/webhookAuth.test.ts`, `tests/automationRecorrenciaCancelamento.test.ts`, `tests/helpers/fakePool.ts` | Suíte de testes do Automation Engine. |

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `server/index.ts` | Monta `automationEngine` router; inicia o scheduler; hook de `ContratoAssinado`/`ContratoEncerrado` em `PATCH /api/contratos/:id/status`; persiste vigência ao criar contrato de assessoria; hook de `AcompanhamentoCriado` em `POST /api/acompanhamentos-bancarios`; `/api/nexus/eventos` generalizado para aceitar o envelope estruturado (`TarefaConcluidaNexus`, `AlertaAutomacao`) mantendo 100% do formato legado; **corrigido bug pré-existente** `SELECT * FROM contratos` → `contratos_gerados` (tabela não existia, erro era engolido silenciosamente); registra `registerWeeklyMonitorRoutes` (módulo já implementado mas nunca ligado — o dashboard de monitoramento semanal dava 404 em produção). |
| `client/src/pages/colaborador/Layout.tsx` | Monta `<NotificacoesAutomacao />` ao lado do sino de follow-ups existente (mobile e desktop). |
| `.env.example` | `AUTOMATION_RETRY_INTERVAL_MS`, `AUTOMATION_ROTINAS_INTERVAL_MS` (reaproveita `NEXUS_INTEGRATION_SECRET` como chave HMAC). |

---

## Catálogo de Eventos

| Evento | Direção | Chave de idempotência |
|---|---|---|
| `ContratoAssinado` / `ContratoValidado` | Destrava → Nexus | `contrato:{id}:assinado` |
| `ContratoEncerrado` | Destrava → Nexus | `contrato:{id}:encerrado` |
| `AcompanhamentoCriado` | Destrava → Nexus | `acomp:{id}:criado` |
| `SemanaConcluida` | Destrava → Nexus (fallback de retry) | `acomp:{id}:semana:{n}:...` |
| `RotinaCndDue` | Scheduler → Nexus | `rotina:cnd:{contrato_id}:{YYYY-MM}` |
| `RotinaCemprotDue` | Scheduler → Nexus | `rotina:cemprot:{contrato_id}:{YYYY-MM}:{iso_week}` |
| `TarefaConcluidaNexus` | Nexus → Destrava | `tarefa_nexus:{id}:{status}:{updated_at}` |
| `AlertaAutomacao` | Nexus → Destrava | `alerta:{tarefa_id}:{tier}:{data}` |

Todo evento Destrava→Nexus vai para `POST /api/integracoes/destrava/eventos` (Nexus). Todo evento Nexus→Destrava vai para `POST /api/nexus/eventos` (já existente, generalizado).

---

## Workflow 1 — Contrato de Assessoria

1. `PATCH /api/contratos/:id/status` com `status: 'assinado'` publica `ContratoAssinado` (vigência já persistida na criação do contrato).
2. Scheduler (a cada 15 min por padrão) avalia contratos ativos: dia 22 → `RotinaCndDue`; toda semana → `RotinaCemprotDue`. A checagem "já emitido no período" é uma `NOT EXISTS` na própria query, então rodar várias vezes por dia é seguro.
3. Nexus cria a tarefa do período (checklist "Consultar CND, Baixar PDF, Anexar PDF, Registrar validade, Registrar observações, Atualizar Cliente 360, Concluir" ou o equivalente CEMPROT) — executada nativamente na UI do Nexus (não há integração de API com órgãos públicos; seria RPA/CAPTCHA, fora de escopo).
4. `status: 'cancelado'` publica `ContratoEncerrado` — o scheduler simplesmente para de encontrar o contrato como ativo; nenhuma tarefa/histórico já criado é apagado.

## Workflow 2 — Acompanhamento Bancário

1. `POST /api/acompanhamentos-bancarios` publica `AcompanhamentoCriado` com o número de semanas calculado a partir de `data_inicio`/`data_fim_prevista`.
2. Nexus cria uma tarefa por semana (mesmo `responsavel_id` do colaborador que iniciou — nunca escolha manual), todas com o mesmo `projeto_grupo_id`, e devolve o mapeamento semana→tarefa na própria resposta HTTP.
3. O dispatcher grava esse mapeamento em `nexus_task_links` — é isso que a tela de acompanhamento bancário usa em `GET/PATCH /api/acompanhamentos-bancarios/:id/semanas/:numero/nexus-tarefa` para renderizar e escrever de volta na tarefa do Nexus, sem nunca criar uma cópia local.
4. Se a escrita síncrona falhar (Nexus fora do ar), a mudança é enfileirada como `SemanaConcluida` no outbox para o retry sweep entregar depois — a UI informa "sincronizando" em vez de erro.

---

## Configuração de Ambiente

```env
# Já existentes, reaproveitados como chave HMAC:
NEXUS_INTEGRATION_SECRET=...
NEXUS_PUBLIC_URL=https://nexus.permupay.com.br

# Novos, opcionais (os padrões já cobrem uso normal):
AUTOMATION_RETRY_INTERVAL_MS=60000
AUTOMATION_ROTINAS_INTERVAL_MS=900000
```

---

## Bugs pré-existentes corrigidos nesta entrega

1. `server/index.ts` — `GET /api/nexus/empresas/:id/resumo` consultava uma tabela `contratos` que nunca existiu (deveria ser `contratos_gerados`); o erro era engolido por um `.catch(() => ({rows:[]}))`, então o Nexus sempre recebia "sem contratos" para toda empresa. Corrigido.
2. `server/services/routesWeeklyMonitor.ts` — módulo de inteligência semanal totalmente implementado, mas nunca registrado em `server/index.ts`; o frontend (`WeeklyMonitorDashboard.tsx`) chamava rotas que davam 404 em produção. Registrado.

---

## Limitações conhecidas / follow-up sugerido

- **WhatsApp/Email** para os alertas — explicitamente adiado pelo usuário ("posteriormente").
- **Testes de concorrência real**: sem Postgres disponível no ambiente de desenvolvimento, os testes de concorrência rodam contra uma fake de Postgres em memória (`tests/helpers/fakePool.ts`) que reproduz a mesma regra de negócio (`UNIQUE` + `ON CONFLICT DO NOTHING`), mas não uma corrida real entre duas conexões. Recomenda-se um smoke test manual em staging com dois disparos simultâneos reais antes do primeiro uso em produção.
- **Alertas atualmente só empresas com CNPJ vinculado a acompanhamento/rotina** — `automation_alerts_cache.empresa_id` fica `NULL` se o Nexus não conseguir resolver a empresa a partir do payload da tarefa.

---

## Validações Executadas

| Checagem | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 erros** |
| `npm run build` | **Build completo** (vite + prerender + bundle-budget + esbuild) |
| `npx vitest run` | **421/421 testes passando** (398 pré-existentes + 23 novos) |
| Zero regressão | Confirmado — nenhuma rota/tela/permissão/migration removida |
