# Relatório de implementação — lembrete de reavaliação aos 12 meses

**Projeto:** Destrava Crédito

**Branch:** `feat/lembrete-12-meses`

**Base de produção:** `6ffc04b`

**Autor:** Manus AI

**Status:** implementação local em validação; deploy ainda não iniciado

## Objetivo

Implementar o acompanhamento ativo de empresas que ainda não completaram 12 meses de abertura. O recurso não bloqueia anexos, não transforma idade em divergência documental e não altera a aptidão documental já corrigida na B1. Quando existe `data_abertura` e a empresa ainda é recente, o sistema mantém um único follow-up automático para a data de maturidade de 12 meses, visível no fluxo de follow-ups da empresa e concluível pelo mecanismo já existente.

## O que foi confirmado antes da implementação

A tabela existente `empresa_followups` é a estrutura adequada para este caso de uso. Ela já possui vínculo obrigatório por `empresa_id`, título, tipo, `data_agendada`, descrição, controle de conclusão (`concluido`/`concluido_em`) e timestamps. A tabela é criada pela migration `035_empresa_cadastro_credito_robusto.sql` e possui índices por empresa e data agendada. A tabela lead-centric `crm_followups` não é adequada para o lembrete porque trabalha com `lead_id`, `colaborador_id` e vocabulário próprio de status.

| Evidência                    | Estado confirmado                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API de follow-ups da empresa | `GET /api/empresas/:id/followups`, `POST /api/empresas/:id/followups` e `PATCH /api/empresas/:id/followups/:fid/concluir` já existem em `server/index.ts`.                                                  |
| Tela existente               | `Empresas.tsx` já carrega, lista e conclui `empresa_followups` na aba de conversas/follow-ups. Não foi criada tela ou canal novo.                                                                           |
| Notificação global           | `NotificacoesFollowup.tsx` e `/api/leads/atrasados`/`/api/leads/hoje` são lead-centric; não foram ampliados para não misturar os dois fluxos nem alterar notificações existentes.                           |
| Cálculo de idade             | `documentacao.ts` e `inteligencia360Service.ts` já calculam e expõem `idade_meses`/`empresa_apta_12_meses`. Esses arquivos B1 não foram alterados.                                                          |
| Banco da sessão              | A inspeção somente leitura não foi executada contra o banco porque `DATABASE_URL` não está disponível no sandbox. O estado factual do banco deve ser confirmado no ambiente de produção antes da migration. |

## Desenho final

Foi criada a migration aditiva `087_empresa_followup_maturidade_12_meses.sql`, que adiciona `empresa_followups.origem` com valor padrão `manual` e cria o índice único parcial `idx_empresa_followups_maturidade_unica` para garantir no máximo um registro com `origem = 'maturidade_12_meses'` por empresa. O mesmo bloco foi incluído no agregado `db/migrate.sql`, preservando o processo de deployment existente. Nenhuma coluna ou tabela existente foi removida ou alterada destrutivamente.

A lógica de domínio está isolada em `server/services/empresaMaturidadeFollowup.ts`. A data de maturidade é calculada como doze meses de calendário após `data_abertura`, usando UTC e limitando o dia ao último dia do mês de destino para casos como 29 de fevereiro. A descrição informa a data em que a empresa completa 12 meses. O helper trata a ausência da migration como no-op compatível, evitando que instalações antigas deixem de carregar o CRM.

A reconciliação é chamada nos seguintes pontos já existentes: abertura do dossiê de documentação, carregamento da Inteligência 360, criação de empresa, atualização de empresa e carregamento da lista de follow-ups da empresa. A execução é failure-tolerant: uma falha no lembrete é registrada no log e não impede a abertura da ficha, o carregamento documental, o CRM ou a Inteligência 360.

Além da migration versionada, o bootstrap do servidor contém uma proteção idempotente equivalente. Ela tenta adicionar a coluna e o índice antes de servir requisições e apenas registra aviso se o banco ainda não estiver disponível. Essa redundância é deliberada para instalações Coolify que fazem deploy da aplicação sem executar manualmente todos os arquivos SQL.

A implementação não altera `server/routes/documentacao.ts` nem `server/services/inteligencia360Service.ts`; apenas usa os pontos de entrada já existentes no backend para disparar a reconciliação sem duplicar a fórmula de idade da B1.

## Idempotência e atualização

O helper procura o registro automático pelo par `empresa_id` e `origem`. Se não houver registro e a empresa ainda for recente, cria um follow-up com tipo existente `ligacao`, data agendada futura ou de maturidade e status implícito de pendente, conforme o schema de `empresa_followups`. Se o registro já existir, não cria duplicata. Se `data_abertura` for corrigida, atualiza data, título e descrição do mesmo registro. Se um lembrete anteriormente concluído voltar a representar uma empresa ainda recente após correção da data, ele é reaberto para acompanhamento. Se a empresa já tiver maturado, o registro histórico não é apagado nem duplicado.

## Decisões para os casos de borda

### Empresa removida, arquivada ou duplicada

A remoção física da empresa já usa uma foreign key com `ON DELETE CASCADE`, portanto o follow-up não permanece como pendência fantasma. Para empresas arquivadas, inativas ou marcadas como duplicadas, a reconciliação fecha um lembrete automático pendente com `concluido = true` e preserva o histórico. A rotina não cria novo lembrete para esses registros. A correção ou alteração do CNPJ, por si só, não muda o `empresa_id`; o acompanhamento continua vinculado à mesma empresa, enquanto a nova `data_abertura` é reconciliada.

### Correção posterior da data de abertura

O registro automático é atualizado com a nova data de maturidade, título e descrição. Quando a nova data ainda indica empresa recente, o lembrete permanece ou volta a ficar pendente. Quando a nova data já indica maturidade, o histórico permanece sem criar outro registro. Assim, uma correção de fonte não deixa a equipe com uma data antiga invisível.

### Conclusão após a reavaliação

A equipe usa o fluxo já existente `PATCH /api/empresas/:id/followups/:fid/concluir`, que grava `concluido = true` e `concluido_em = NOW()`. Não foi criado um novo status nem uma nova tela de conclusão.

## Arquivos alterados

| Arquivo                                                      | Motivo                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `server/services/empresaMaturidadeFollowup.ts`               | Cálculo de data, classificação de cadastro inativo e reconciliação idempotente.          |
| `server/index.ts`                                            | Pontos de entrada failure-tolerant para criação, atualização e visualização do lembrete. |
| `db/migrations/087_empresa_followup_maturidade_12_meses.sql` | Coluna de origem e unicidade parcial, em migration aditiva.                              |
| `db/migrate.sql`                                             | Espelho da migration para o agregado de produção.                                        |
| `tests/empresaMaturidadeFollowup.test.ts`                    | Regressão de datas, ano bissexto e estados arquivado/duplicado.                          |
| `RELATORIO_IMPLEMENTACAO.md`                                 | Este relatório.                                                                          |

Os arquivos B1 `server/routes/documentacao.ts` e `server/services/inteligencia360Service.ts` permanecem sem alteração.

## Validação

A validação focalizada executada até este ponto foi aprovada:

```text
pnpm check
pnpm test
pnpm build
pnpm exec tsx scripts/check-bundle-budget.mjs
pnpm exec vitest run tests/empresaMaturidadeFollowup.test.ts

typecheck: aprovado
testes focados: 11 aprovados
teste completo: 52 arquivos / 558 testes aprovados
build de produção: aprovado
pré-renderização e limites de bundle: aprovados
```

A migration no banco real, a validação de uma empresa de teste em produção e o deploy serão registrados nesta seção antes da publicação final.

## Rollback e deploy

O rollback funcional conhecido é o commit de produção anterior `6ffc04b`. A branch de trabalho é isolada e a `main` não foi modificada nesta etapa. O deploy somente deve ser iniciado depois de confirmar a migration no banco de produção e executar a validação completa local. Após o deploy, devem ser conferidos o carregamento da fila/CRM, a abertura de uma empresa com menos de 12 meses, a ausência de erro na ficha de uma empresa madura e a existência de exatamente um follow-up automático na empresa de teste.
