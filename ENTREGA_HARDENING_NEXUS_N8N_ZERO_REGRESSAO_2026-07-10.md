# Entrega — Sprint 8: Hardening da Integração Nexus/n8n

**Data:** 2026-07-10
**Status:** ✅ Entregue com zero regressão
**Testes:** 344/344 passando (11 arquivos, +38 novos)

---

## Objetivo

Fortalecer a segurança e a confiabilidade da integração Nexus/n8n implementada na Sprint 7, corrigindo vulnerabilidades de payload, adicionando controle de acesso e melhorando a experiência de configuração.

---

## Problemas Corrigidos

| Problema | Solução |
|---|---|
| Frontend enviava `cnpj`, `razaoSocial`, `titulo`, `descricao` etc. | Backend agora busca dados reais da empresa no banco e monta o payload oficial |
| `razaoSocial={empresaId}` no `PlanoAcaoMotor.tsx` (bug) | Corrigido — `razaoSocial` removido do payload do frontend |
| `nexus-status` sem `requireEmpresaAccess` | Adicionado — endpoint agora exige acesso à empresa |
| Tabela `nexus_tarefas_enviadas` sem script de criação | Script aditivo `ensure-nexus-tarefas-enviadas.mjs` criado |
| `.env.example` sem `NEXUS_WEBHOOK_URL` e `NEXUS_API_TOKEN` | Adicionados com documentação clara |
| Painel de Integrações sem informações sobre Nexus/n8n 360 | Novo bloco com status, como funciona, payload de exemplo e instrução de configuração |

---

## Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `scripts/ensure-nexus-tarefas-enviadas.mjs` | Script aditivo e idempotente para criar a tabela `nexus_tarefas_enviadas` com índices de performance. Usa `CREATE TABLE IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS`. |
| `tests/hardeningNexus.test.ts` | 38 testes de hardening cobrindo: `gerarIdempotencyKey`, `validarPayloadNexus`, `verificarConfiguracaoNexus`, idempotência em memória e contrato do payload. |
| `ENTREGA_HARDENING_NEXUS_N8N_...md` | Este documento. |

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `server/index.ts` | `nexus-status`: adicionado `requireEmpresaAccess`. `enviar-nexus`: reescrito com validação server-side — aceita apenas `{ confirmed: true, pendenciaId }` do frontend; busca empresa real, recalcula pendências, monta payload oficial. |
| `client/src/pages/colaborador/EnviarNexus.tsx` | Payload simplificado para `{ confirmed: true, pendenciaId }`. Props `cnpj` e `razaoSocial` tornadas opcionais (retrocompatibilidade). |
| `client/src/pages/colaborador/PlanoAcaoMotor.tsx` | Bug `razaoSocial={empresaId}` corrigido. Props desnecessárias removidas do `<EnviarNexus />`. |
| `client/src/pages/colaborador/Integracoes.tsx` | Novo bloco "Nexus/n8n — Tarefas de Pendências" com status das variáveis, fluxo explicado e payload de exemplo copiável. |
| `.env.example` | Adicionadas `NEXUS_WEBHOOK_URL` e `NEXUS_API_TOKEN` com documentação. |

---

## Fluxo Hardened (Sprint 8)

```
Frontend                    Backend                      Nexus/n8n
─────────────────────────────────────────────────────────────────
{ confirmed: true,    →   requireEmpresaAccess()
  pendenciaId: "..." }     SELECT * FROM empresas
                           calcularPendencias(...)
                           pendencia = find(pendenciaId)
                           payload = {
                             empresaId: empresa.id,       →   POST webhook
                             cnpj: empresa.cnpj,              { evento, empresaId,
                             razaoSocial: empresa.razao_social,  cnpj, razaoSocial,
                             titulo: pendencia.titulo,          titulo, categoria,
                             ...                                prioridade, ... }
                           }
                           INSERT nexus_tarefas_enviadas
                           INSERT empresa_historico
```

---

## Validações Executadas

| Checagem | Resultado |
|---|---|
| `npm run check -- --pretty false` | **0 erros** TypeScript |
| `npm run build` | **Build completo** — 2908 módulos |
| `npm test -- --run` | **344/344 testes passando** (+38 novos) |
| Zero regressão | Confirmado — nenhuma rota removida, nenhum dado alterado |

---

## Como Executar o Script de Migration

```bash
# Na VPS, com DATABASE_URL configurada:
node scripts/ensure-nexus-tarefas-enviadas.mjs

# Ou com variável explícita:
DATABASE_URL=postgres://user:pass@host:5432/db node scripts/ensure-nexus-tarefas-enviadas.mjs
```

O script é **idempotente** — pode ser executado múltiplas vezes sem efeito colateral.

---

## Como Ativar a Integração

Configure no servidor (Coolify ou `.env`):

```env
# Obrigatório (pelo menos um):
NEXUS_WEBHOOK_URL=https://seu-nexus.com/webhook/destrava
# ou
N8N_WEBHOOK_URL=https://n8n.destrava.permupay.com.br/webhook/destrava

# Opcional (autenticação Bearer):
NEXUS_API_TOKEN=seu-token-secreto
```

Após configurar, o botão **"Criar tarefa no Nexus"** na aba Inteligência 360 ficará ativo.
