# Correções da integração de tarefas — Destrava → Nexus

## Resultado funcional

- Ações rápidas `Criar tarefa no Nexus` foram adicionadas no cadastro de Empresa e no painel do Cliente PF.
- O servidor recarrega a entidade pelo ID; nome, documento e autor não são confiados ao frontend.
- O modal envia título, descrição, prazo, prioridade, lembrete diário e checklist.
- Cada item possui ID, descrição, data e e-mail de responsável próprios.
- E-mail de membro preenchido é validado pelo Nexus dentro da organização. Um e-mail inválido recusa toda a lista para evitar atribuição silenciosa à pessoa errada.
- Sem e-mail por item, o Nexus usa o responsável principal resolvido pela integração.
- A chave `destrava_manual:{tipo}:{entidade}:{client_request_id}` torna retry/duplo clique idempotente, sem colidir duas listas legítimas da mesma entidade.

## Configuração

- `NEXUS_WEBHOOK_URL` deve apontar para o endpoint de criação integrado do Nexus.
- `NEXUS_API_TOKEN` deve corresponder ao segredo configurado no Nexus.
- Para criação manual direta, fallback n8n não é utilizado: a lista precisa ser confirmada pelo próprio Nexus.

## Ordem de publicação

Publicar este repositório somente depois do Nexus corrigido. O contrato continua compatível com os envios antigos de pendências.

## Gate de regressão executado

- `npm run check`
- `npm run build`, incluindo prerender e orçamento de bundle
- Testes Nexus/integração direcionados
- Testes adicionais de idempotência: mesma tentativa repete a chave; uma nova lista gera outra; Empresa e PF não colidem

Antes da produção, validar em homologação uma Empresa e um Cliente PF reais, inclusive um item sem e-mail e outro com e-mail de membro Nexus válido.
