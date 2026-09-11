# Relatório de Auditoria Técnica e Evolução CRM v2 — Destrava Crédito

**Data:** 01 de Abril de 2026
**Autor:** Arquiteto Técnico (Manus AI)
**Projeto:** Destrava Crédito (Repositório: `vml-arquivos/destrava`)

---

## 1. Resumo Executivo

Este relatório documenta a auditoria técnica realizada no repositório do Destrava Crédito e as ações tomadas para corrigir inconsistências críticas e implantar a nova camada operacional do CRM.

A auditoria revelou que o repositório apresentava "schema drift" (diferenças entre o código e o banco de dados de produção), problemas de capitalização que causavam bugs silenciosos no Kanban, e ausência de tabelas críticas (como `triagem_leads`) nos scripts de criação originais.

Todas as correções foram empacotadas em **8 migrations SQL idempotentes**, acompanhadas de um script de rollback completo.

---

## 2. Descobertas da Auditoria (FASE 0)

### 2.1. Tabela `triagem_leads` Fantasma
A tabela `triagem_leads` é amplamente utilizada no servidor (`server/index.ts`) para gerenciar a fila de pré-qualificação do simulador público. No entanto, **nenhum arquivo de schema no repositório continha o `CREATE TABLE` original**. A tabela só aparecia em migrations secundárias (ex: `migrate_simulacoes_empresa_v1.sql` adicionando `empresa_id`).
* **Impacto:** Impossibilidade de recriar o banco do zero ou rodar testes locais sem erros.
* **Solução:** Criada a migration `001_triagem_leads_create.sql` para formalizar a tabela de forma idempotente.

### 2.2. Bug Silencioso no Kanban (`etapa_funil`)
O arquivo `schema_fase1_1_delta.sql` definiu o valor padrão de `etapa_funil` como `'Novo'` (com "N" maiúsculo). No entanto:
1. O frontend (`CRM.tsx`) filtra as colunas do Kanban usando minúsculas (`'novo'`).
2. A view `vw_crm_pipeline` exclui leads inativos.
3. O `CHECK constraint` em `migrate.sql` exigia minúsculas, mas estava desatualizado em relação às etapas reais do frontend (faltavam `qualificado`, `documentacao`, `aprovacao`).
* **Impacto:** Leads recém-criados ficavam **invisíveis** no Kanban porque não se encaixavam em nenhuma coluna.
* **Solução:** Criada a migration `002_fix_etapa_funil_kanban.sql` que normaliza os dados existentes para minúsculas, atualiza o `CHECK constraint` para incluir todas as 9 etapas do frontend, e corrige o `DEFAULT` para `'novo'`.

### 2.3. Histórico de Funil Inexistente
A rota `POST /api/crm/mover-funil` apenas atualizava a coluna `etapa_funil` na tabela `leads`. Não havia registro na tabela `crm_historico_funil` nem em `crm_atividades`.
* **Impacto:** Gestores não conseguiam auditar quando um lead mudou de etapa, quem mudou, ou quanto tempo ficou em cada fase.
* **Solução:** Criada a migration `003_fix_mover_funil_historico.sql` com uma trigger no banco de dados que registra automaticamente o histórico e a atividade sempre que a `etapa_funil` é alterada.

### 2.4. Usuários Duplicados e Permissões Quebradas
O sistema de cargos no servidor (`server/index.ts`) usava arrays em minúsculas (`'administrador'`), mas a criação de usuários permitia capitalização variada (`'Administrador'`). Além disso, não havia restrição única no banco para e-mails ignorando maiúsculas/minúsculas.
* **Impacto:** Falhas de permissão (usuários não reconhecidos como gestores) e possibilidade de contas duplicadas (ex: `joao@email.com` e `Joao@email.com`).
* **Solução:** Criada a migration `004_fix_usuarios_duplicados_cargos.sql` que normaliza cargos e e-mails, adiciona um índice único funcional (`LOWER(email)`), e aplica um `CHECK constraint` rigoroso nos cargos.

### 2.5. Sincronização Chatwoot e Controle de IA
O webhook do Chatwoot criava leads corretamente, mas não os vinculava a uma "caixa" de atendimento, impossibilitando o controle granular de IA (ligar/desligar IA apenas para o WhatsApp Comercial, por exemplo).
* **Impacto:** A IA respondia a todos ou a ninguém, sem controle por canal.
* **Solução:** Criada a migration `007_sync_chatwoot_n8n_ia_caixa.sql` que introduz o conceito de `caixa_id` nas conversas e funções no banco para determinar se a IA deve responder com base nas regras da caixa e da conversa.

---

## 3. Nova Camada Operacional (FASE 3 e 5)

Para elevar o CRM a um patamar "Enterprise", foram introduzidas novas estruturas de dados:

1. **Caixas de Atendimento (`crm_caixas`):** Filas organizadas por canal (WhatsApp, Email, Formulário) com controle individual de IA e responsáveis.
2. **Delegação de Leads (`crm_delegacoes`):** Rastreabilidade completa de transferências de leads entre colaboradores (quem delegou, para quem, motivo, data).
3. **Notas Internas (`crm_notas_internas`):** Comentários privados em leads, visíveis apenas para a equipe interna.
4. **Agenda de Follow-ups (`crm_followups`):** Substituição do campo simples `proximo_followup` por uma tabela completa de agendamentos, com status (pendente, realizado, cancelado) e resultados.
5. **Dashboards por Perfil:** Views SQL otimizadas para diferentes visões (Gestor, Consultor, Captador), garantindo que cada usuário veja apenas o que tem permissão, com métricas de conversão e performance em tempo real.

---

## 4. Checklist de Implantação

Para aplicar esta evolução em produção, siga os passos abaixo na ordem exata:

- [ ] **1. Backup Completo:** Realize um dump completo do banco de dados de produção antes de iniciar.
- [ ] **2. Branch de Trabalho:** Faça o merge da branch `feature/crm-evolution-v2` para a branch principal (main/master).
- [ ] **3. Execução das Migrations:** Execute os scripts SQL na pasta `db/migrations/` na ordem numérica:
  - [ ] `001_triagem_leads_create.sql`
  - [ ] `002_fix_etapa_funil_kanban.sql`
  - [ ] `003_fix_mover_funil_historico.sql`
  - [ ] `004_fix_usuarios_duplicados_cargos.sql`
  - [ ] `005_crm_camada_operacional.sql`
  - [ ] `006_crm_campos_leads_extras.sql`
  - [ ] `007_sync_chatwoot_n8n_ia_caixa.sql`
  - [ ] `008_dashboards_visibilidade_perfil.sql`
- [ ] **4. Validação:** Verifique se o Kanban do CRM carrega corretamente e se os leads antigos estão visíveis.
- [ ] **5. Teste de IA:** Envie uma mensagem de teste via Chatwoot para confirmar se a vinculação com a caixa e o controle de IA estão funcionando.
- [ ] **6. Rollback (Se necessário):** Em caso de falha crítica, execute o script `rollback_all.sql` para reverter todas as alterações de banco de dados.

---
*Fim do Relatório*
