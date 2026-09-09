# Sprint 4 — Motor de Pendências e Plano de Ação

## Resumo da Entrega

Foi implementado com sucesso o **Motor Central de Pendências e Plano de Ação por Empresa**, integrado à aba Inteligência 360. O sistema identifica automaticamente, em tempo real e sem persistência no banco, tudo o que impede ou dificulta contrato, análise de crédito, proposta bancária, faturamento, documentação, análise societária e relacionamento comercial.

A implementação respeitou estritamente a regra de **ZERO REGRESSÃO**: nenhuma rota antiga foi removida, nenhum documento foi apagado, nenhum dado foi alterado automaticamente e nenhuma migration destrutiva foi criada.

## Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `server/services/pendenciasEmpresaService.ts` | Motor de regras determinístico com 8 categorias de análise, cálculo de prioridade, score de completude, plano de ação e resumo executivo. |
| `client/src/pages/colaborador/PlanoAcaoMotor.tsx` | Componente React com visão kanban por prioridade, visão de plano de ação numerado, botões de navegação por módulo, copiar plano e base futura para Nexus. |
| `tests/motorPendencias.test.ts` | Suíte com 31 testes automatizados cobrindo todos os cenários solicitados. |
| `ENTREGA_MOTOR_PENDENCIAS_PLANO_ACAO_ZERO_REGRESSAO_2026-07-10.md` | Este documento de entrega. |

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `server/index.ts` | Adicionado import de `calcularPendencias` e inserida a rota fixa `GET /api/empresas/:id/pendencias` antes da rota dinâmica `/:id`, com fallback seguro em caso de erro. |
| `client/src/pages/colaborador/Inteligencia360.tsx` | Importado e inserido o componente `<PlanoAcaoMotor />` como primeiro bloco da aba, antes do Relatório Técnico e da Proposta Bancária. |

## Rota Criada

`GET /api/empresas/:id/pendencias` — retorna JSON calculado em tempo real com todas as pendências agrupadas por categoria, plano de ação priorizado, score de completude e resumo executivo. Nenhum dado é persistido no banco nesta sprint.

## Categorias de Análise Implementadas

O motor avalia 8 categorias distintas, cada uma com regras específicas de prioridade:

| Categoria | Exemplos de Pendências |
|---|---|
| Cadastral | CNPJ ausente, situação irregular, contato ausente, CNAE não informado |
| Societária | Sem sócios, sócio sem CPF, sem representante legal, percentual ausente |
| Documental | Acervo vazio, documentos sem arquivo, documentos não validados, cobertura abaixo de 50% |
| Crédito | Faturamento ausente, capital social não sincronizado, score ausente, sem simulação |
| Contrato | Sem contratos, contratos sem assinatura, contratos vencidos |
| Faturamento | Faturamento não comprovado, regime tributário ausente, sem orçamentos |
| Comercial | Sem follow-up, responsável não identificado |
| Operacional | Porte ausente, natureza jurídica ausente, sugestão de relatório técnico |

## Regras de Prioridade

| Prioridade | Critérios | Prazo no Plano |
|---|---|---|
| Alta | CNPJ ausente, situação irregular, sócio sem CPF, acervo vazio, documentos sem arquivo, faturamento ausente, contrato sem assinatura/vencido | Imediato |
| Média | Score ausente, capital social ausente, sem simulação, documentos não validados, sem representante legal, sem follow-up | Até 5 dias úteis |
| Baixa | Melhorias cadastrais, documentação complementar, observações operacionais | Até 15 dias úteis |

## Funcionalidades do Frontend

O componente `PlanoAcaoMotor` oferece duas visões intercambiáveis:

A **visão Por Prioridade** exibe as pendências em formato kanban, agrupadas em seções de alta (vermelho), média (âmbar) e baixa (azul), com cards expansíveis que mostram impacto, ação recomendada e botão de navegação direta para o módulo responsável.

A **visão Plano de Ação** exibe a sequência numerada de execução, ordenada por prioridade, com prazo estimado e link para o módulo de cada item.

Ambas as visões incluem o botão "Copiar plano" (copia texto formatado para a área de transferência) e o botão "Criar tarefas no Nexus" (desabilitado, preparatório para integração futura).

Quando não há pendências, o sistema exibe a mensagem: "Cliente sem pendências críticas identificadas com os dados atuais."

## Garantias de Zero Regressão

Nenhuma migration destrutiva foi aplicada. Nenhuma rota existente foi modificada ou removida. Nenhum documento ou arquivo físico foi apagado, movido ou alterado. Os fluxos existentes (Inteligência 360, Proposta Bancária, Relatório Técnico, Clientes PJ, Acervo, Orçamentos, Contratos e Assessoria IA) não foram impactados.

## Validações Executadas

| Checagem | Resultado |
|---|---|
| `npm run check -- --pretty false` | **0 erros** TypeScript |
| `npm run build` | **Build completo** — 2905 módulos transformados |
| `npm test -- --run` | **193/193 testes passando** (7 arquivos, +31 novos testes) |
