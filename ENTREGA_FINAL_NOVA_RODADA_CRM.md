# Entrega Final — Nova Rodada de Organização Operacional do CRM

## Escopo executado

Nesta rodada incremental, o monólito foi evoluído sem substituição radical da base existente. O foco foi organizar a camada operacional do CRM, introduzir **perfil operacional** e **visibilidade por agente**, reorganizar a navegação da área do colaborador, criar uma **visão individual do agente** e preparar a base para futura integração com **Chatwoot por agente**, preservando os fluxos já existentes.

## Arquivos modificados nesta rodada

| Tipo | Arquivo | Objetivo principal |
| --- | --- | --- |
| Alterado | `server/index.ts` | Inclusão de perfil operacional no login e em `/api/me`, filtros de visibilidade por agente, reforço de ownership em edição/movimentação de leads e enriquecimento do webhook do Chatwoot com metadados futuros. |
| Alterado | `server/middleware/auth.ts` | Ampliação do contexto autenticado para carregar `perfil`, `pode_atender_leads` e `pode_ver_todos_leads` a partir do JWT. |
| Alterado | `client/src/contexts/AuthContext.tsx` | Compatibilização da tipagem da sessão autenticada com perfil operacional e flags de visibilidade. |
| Alterado | `client/src/pages/colaborador/CRM.tsx` | Reorganização da visão principal do CRM com escopo operacional, filtros por responsável e navegação contextual para carteira/fila. |
| Alterado | `client/src/pages/colaborador/Layout.tsx` | Inclusão da nova entrada de navegação **Minha Carteira** no menu do colaborador. |
| Alterado | `client/src/App.tsx` | Registro da nova rota protegida `/colaborador/meu-crm`. |
| Criado | `client/src/pages/colaborador/MeuCRM.tsx` | Nova visão individual do agente autenticado, focada em carteira própria, follow-ups e prioridades. |
| Criado | `db/migrations/013_colaboradores_perfil_operacional.sql` | Base aditiva para perfil operacional e permissões compatíveis em colaboradores. |
| Criado | `db/migrations/014_chatwoot_base_agente.sql` | Base futura para mapeamento Chatwoot por agente e metadados de sincronismo em `crm_conversas`. |
| Apoio | `.manus_auditoria_crm_fase1.md` | Registro interno da auditoria técnica usada para orientar as mudanças incrementais desta rodada. |

## Endpoints e comportamentos impactados

| Tipo | Endpoint / rota | Mudança aplicada |
| --- | --- | --- |
| Backend | `POST /api/colaborador/login` | JWT passa a incluir perfil operacional e flags de visibilidade/atendimento. |
| Backend | `GET /api/me` | Resposta autenticada compatibilizada com perfil operacional e permissões derivadas. |
| Backend | `GET /api/leads` | Suporte incremental a `scope` e `responsavel_id`, com restrição automática por ownership para agentes. |
| Backend | `GET /api/leads/fila` | Visibilidade operacional compatível com gestão e carteira do agente. |
| Backend | `GET /api/leads/atrasados` | Filtro incremental por ownership/responsável. |
| Backend | `GET /api/leads/hoje` | Filtro incremental por ownership/responsável. |
| Backend | `GET /api/crm/pipeline` | Escopo por agente/time/sem responsável sem quebra do contrato antigo. |
| Backend | `GET /api/crm/pipeline/metricas` | Métricas alinhadas ao mesmo recorte de visibilidade operacional. |
| Backend | `PATCH /api/leads/:id` | Bloqueio de alteração por agente em lead de outro responsável, mantendo compatibilidade com gestão. |
| Backend | `POST /api/crm/mover-funil` | Reforço de ownership ao mover etapas, sem alterar payload existente. |
| Backend | `POST /api/webhook/chatwoot` | Preenchimento aditivo de `chatwoot_contact_id`, `chatwoot_inbox_id`, `chatwoot_assignee_id`, `agente_responsavel_id` e metadados de sincronismo, preservando o comportamento atual. |
| Frontend | `/colaborador/crm` | Nova organização visual do CRM com filtros operacionais. |
| Frontend | `/colaborador/meu-crm` | Nova tela individual do agente autenticado. |

## Migrations criadas nesta rodada

| Migration | Finalidade |
| --- | --- |
| `013_colaboradores_perfil_operacional.sql` | Introduz perfil operacional e permissões compatíveis com a hierarquia legada de cargos. |
| `014_chatwoot_base_agente.sql` | Prepara mapeamento futuro entre colaboradores e agentes do Chatwoot, além de metadados de sincronismo em `crm_conversas`. |

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `pnpm check` | OK |
| `pnpm build` | OK |
| Compilação frontend | OK |
| Bundle do backend | OK |

## Riscos e observações operacionais

| Tipo | Descrição |
| --- | --- |
| Migração pendente | As migrations `013` e `014` precisam ser aplicadas no banco antes do deploy para que o backend produtivo reconheça os novos campos sem erro operacional. |
| Sessões antigas | Usuários já autenticados podem continuar com tokens anteriores até novo login; após autenticação renovada, o JWT passa a refletir perfil e flags atualizadas. |
| Chatwoot futuro | O preenchimento de `agente_responsavel_id` pelo webhook depende do cadastro de `chatwoot_agente_id` nos colaboradores; sem esse mapeamento, a sincronização permanece funcionando, mas sem atribuição automática por agente. |
| Dados legados | Como a solução foi aditiva, perfis e permissões antigas por cargo continuam sendo respeitados; vale revisar operadores com cargos atípicos para confirmar o fallback esperado. |
| Compatibilidade | Os contratos principais foram preservados; os filtros novos foram adicionados de forma opcional, sem remover parâmetros nem alterar payloads já usados pelo frontend. |

## Observação final

A base agora está preparada para a próxima evolução com menor risco: separar com mais clareza a visão **do agente**, **da gestão** e **das conversas Chatwoot por responsável**, sem ruptura das rotas existentes nem do fluxo atual do CRM.
