# Entrega: Sprint 7 — Integração Nexus/n8n com Tarefas Inteligentes

**Data:** 2026-07-10
**Status:** ✅ Entregue com zero regressão
**Testes:** 306/306 passando (10 arquivos, +35 novos)
**TypeScript:** 0 erros
**Build:** Completo (2908 módulos)

---

## Objetivo

Preparar integração segura para transformar pendências da Inteligência 360 em tarefas no Nexus ou eventos n8n, com confirmação explícita do usuário, idempotência, validação de ambiente e zero criação automática indevida.

---

## Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `server/services/integracaoNexusService.ts` | Serviço de integração com Nexus/n8n: validação de payload, verificação de ambiente, idempotência em memória, envio seguro com fallback n8n, cabeçalho Authorization opcional. |
| `client/src/pages/colaborador/EnviarNexus.tsx` | Componente React com modal de confirmação, lista de pendências por prioridade, status da integração, botão "Criar no Nexus/n8n" e feedback visual de envio/duplicata. |
| `tests/integracaoNexus.test.ts` | 35 testes automatizados cobrindo todos os cenários. |
| `ENTREGA_INTEGRACAO_NEXUS_N8N_...md` | Este documento. |

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `server/index.ts` | Import + rotas fixas `GET /api/empresas/:id/pendencias/nexus-status` e `POST /api/empresas/:id/pendencias/enviar-nexus` inseridas antes de `/:id`. |
| `client/src/pages/colaborador/PlanoAcaoMotor.tsx` | Botão "Nexus (em breve)" substituído por botão funcional "Criar no Nexus" + bloco `<EnviarNexus />` integrado ao final do componente. |

---

## Endpoints

### GET /api/empresas/:id/pendencias/nexus-status
Retorna o status da configuração da integração:
```json
{
  "empresa_id": "...",
  "nexusConfigurado": false,
  "n8nConfigurado": false,
  "algumConfigurado": false,
  "destino": "nenhum",
  "mensagemStatus": "Integração não configurada...",
  "timestamp": "2026-07-10T..."
}
```

### POST /api/empresas/:id/pendencias/enviar-nexus
Envia uma pendência como tarefa. **Exige `confirmed: true` no body.**

**Payload obrigatório:**
```json
{
  "confirmed": true,
  "cnpj": "12345678000199",
  "razaoSocial": "Empresa Exemplo Ltda",
  "pendenciaId": "pend-001",
  "prioridade": "alta",
  "categoria": "documental",
  "titulo": "Contrato social ausente",
  "descricao": "...",
  "moduloOrigem": "inteligencia_360",
  "acaoRecomendada": "Solicitar contrato social",
  "idempotencyKey": "destrava_emp-001_pend-001_2026-07-10"
}
```

**Respostas:**
- `400` — Sem `confirmed: true` ou payload inválido
- `503` — Integração não configurada (mensagem amigável)
- `200` — Sucesso (incluindo `jaEnviado: true` para duplicatas)
- `502` — Webhook retornou erro

---

## Configuração de Ambiente

Para ativar a integração, defina pelo menos uma das variáveis:

```env
NEXUS_WEBHOOK_URL=https://seu-nexus.com/webhook/destrava
NEXUS_API_TOKEN=seu-token-secreto          # opcional, para autenticação
N8N_WEBHOOK_URL=https://seu-n8n.com/webhook/destrava
```

**Prioridade:** Nexus é preferido. Se Nexus falhar e n8n estiver configurado, o sistema tenta n8n automaticamente.

---

## Idempotência

A idempotência é garantida em dois níveis:

1. **Cache em memória** — Chaves enviadas nesta sessão do servidor não são reenviadas.
2. **Banco de dados** — Tabela `nexus_tarefas_enviadas` (criada automaticamente se não existir) registra envios persistentes.

A `idempotencyKey` padrão é: `destrava_{empresaId}_{pendenciaId}_{data-YYYY-MM-DD}`.

---

## Regras de Segurança Implementadas

- ✅ Exige `confirmed: true` explícito no body
- ✅ Não envia se `NEXUS_WEBHOOK_URL` e `N8N_WEBHOOK_URL` estiverem ausentes
- ✅ Não cria tarefas duplicadas (idempotência dupla: memória + banco)
- ✅ Não altera dados existentes da empresa
- ✅ Não cria eventos falsos no histórico (apenas registra quando envia com sucesso)
- ✅ Mensagens de erro são amigáveis e orientadas à ação
- ✅ Timeout de 10 segundos no webhook para evitar travamentos

---

## Validações Executadas

| Checagem | Resultado |
|---|---|
| `npm run check -- --pretty false` | **0 erros** TypeScript |
| `npm run build` | **Build completo** — 2908 módulos |
| `npm test -- --run` | **306/306 testes passando** (+35 novos) |
| Zero regressão | Confirmado — nenhuma rota removida, nenhum dado alterado |
