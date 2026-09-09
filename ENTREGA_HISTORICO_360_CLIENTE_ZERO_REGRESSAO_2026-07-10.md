# Sprint 6 — Histórico de Evolução do Cliente

## Resumo da Entrega

Foi implementado com sucesso o **Histórico 360 do Cliente**, uma linha do tempo consolidada que agrega eventos de múltiplas fontes do sistema em uma visão unificada, cronológica e filtrada.

A funcionalidade foi integrada em dois pontos da aplicação: na aba **Inteligência 360** (como bloco lazy ao final) e diretamente na **aba Histórico** da página da empresa (abaixo do feed de notas existente, sem removê-lo).

A implementação respeitou estritamente a regra de **ZERO REGRESSÃO**: nenhum histórico antigo foi apagado, nenhum evento falso foi criado, nenhum usuário foi inventado, e nenhuma migration destrutiva foi aplicada.

## Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `server/services/historicoClienteService.ts` | Serviço de consolidação de eventos de 9 fontes distintas, com ordenação cronológica, separação de eventos sem data, resumo por tipo e proteção total contra arrays null/undefined. |
| `client/src/pages/colaborador/Historico360.tsx` | Componente React com linha do tempo agrupada por dia, filtro por tipo de evento, cards expansíveis, exibição de usuário quando disponível, seção separada para "Data não informada" e botões de navegação para módulos. |
| `tests/historicoCliente.test.ts` | Suíte com 39 testes automatizados cobrindo todos os cenários solicitados. |
| `ENTREGA_HISTORICO_360_CLIENTE_ZERO_REGRESSAO_2026-07-10.md` | Este documento de entrega. |

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `server/index.ts` | Import de `consolidarHistorico360` e rota fixa `GET /api/empresas/:id/historico-360` inserida antes de `/:id`, com fallback seguro. |
| `client/src/pages/colaborador/Inteligencia360.tsx` | Import e inserção do bloco `<Historico360 />` antes do Resumo de Atividade. |
| `client/src/pages/colaborador/Empresas.tsx` | Import de `Historico360` e inserção do bloco na aba Histórico, abaixo do feed de notas existente (sem remover nada). |

## Rota Criada

`GET /api/empresas/:id/historico-360` — retorna JSON consolidado em tempo real. Nenhum dado é persistido no banco.

## Fontes de Eventos Consolidadas

| Fonte | Tipo de Evento | Campos Usados |
|---|---|---|
| `empresas` | `cadastro`, `atualizacao_cadastral` | `created_at`, `updated_at`, `ultima_sincronizacao_receita` |
| `empresa_historico` | `nota`, `simulacao`, `contrato`, `analise`, `sistema` | `tipo`, `descricao`, `autor`, `created_at` |
| `followup_empresa` | `followup` | `tipo`, `descricao`, `autor`, `created_at` |
| `empresa_followups` | `followup` | `tipo`, `titulo`, `descricao`, `concluido`, `created_at` |
| `documentos_arquivos` | `documento` | `tipo`, `nome_arquivo`, `arquivo_path`, `status`, `created_at` |
| `simulacoes_colaborador` | `simulacao` | `produto`, `valor_solicitado`, `prazo_meses`, `status`, `criado_em` |
| `contratos_gerados` | `contrato` | `numero_contrato`, `tipo_contrato`, `status`, `valor_contrato`, `data_assinatura`, `created_at` |
| `orcamentos` | `orcamento` | `descricao`, `valor_total`, `status`, `created_at` |
| `acompanhamentos_bancarios` | `acompanhamento_bancario` | `banco`, `produto`, `status`, `valor`, `responsavel`, `created_at` |

## Regras de Tratamento de Datas

- Eventos com `created_at` válido são ordenados cronologicamente (mais recente primeiro) e agrupados por dia.
- Eventos com `created_at` null, vazio ou inválido são separados em `eventos_sem_data` e exibidos no final com o rótulo **"Data não informada"**.
- Contratos com `data_assinatura` válida geram um segundo evento de assinatura, além do evento de criação.

## Regras de Usuário

- O campo `usuario` é preenchido apenas quando o dado existe na fonte (`autor`, `responsavel`, `enviado_por`, etc.).
- Se o campo não existir ou for vazio/null, `usuario` é retornado como `null` — nunca é inventado.

## Validações Executadas

| Checagem | Resultado |
|---|---|
| `npm run check -- --pretty false` | **0 erros** TypeScript |
| `npm run build` | **Build completo** — 2907 módulos transformados |
| `npm test -- --run` | **271/271 testes passando** (9 arquivos, +39 novos testes) |
