# Relatório de Regressão — 31/08/2026 (atualizado, Rodada 6 — Enquadramento Tributário duplicado no relatório)

Verificação item a item pedida na missão original (Rodada 1), reconfirmada nesta rodada. "OK" significa: suíte completa de testes passando, comportamento não alterado por nenhuma das correções cumulativas das quatro rodadas desta sessão, e -- para os itens diretamente relacionados -- teste de regressão dedicado.

| Item | Status | Observação |
|---|---|---|
| Cadastro empresa | OK | Não tocado em nenhuma rodada. |
| Consulta CNPJ | OK | Não tocado em nenhuma rodada. |
| QSA | OK | Não tocado em nenhuma rodada. |
| Fase 1 | OK | Não tocado; a Fase 1 continua sem exigir documentos pessoais dos sócios (regra já correta de rodadas anteriores, não alterada aqui). |
| Regime tributário | OK, com correção (2 rodadas) | Rodada 1: catálogo do DARF corrigido (5993 -> Real, 5625 -> Arbitrado). Rodada 3: identidade documental corrigida para a matriz cruzada completa (não só PGDAS-em-ECF); código 8998 revertido para `null`/`REVISAO_HUMANA` em vez de "Real por compatibilidade". Todos os testes específicos passando, incluindo os que cobrem o comportamento correto anterior sem regressão. |
| Junta (Atos da Junta Comercial) | OK | Não tocado em nenhuma rodada. |
| Contrato (Social/Alteração) | OK | Não tocado em nenhuma rodada. |
| Uploads | OK, com correção | Upload continua sempre aceito (nenhum upload passou a ser bloqueado em nenhuma rodada -- pelo contrário, um bloqueio existente, SCR->CCS->CCF, foi removido na Rodada 1). A validação de conteúdo ficou mais rigorosa a cada rodada (classificação não confia mais no slot em nenhum dos casos cruzados testados), nunca mais permissiva. |
| Observações | OK | Não tocado em nenhuma rodada. |
| Relatórios | OK | Não tocado em nenhuma rodada. |
| SCR/CCS/CCF | OK, com correção + capacidade nova | A checagem de ordem (`assertOrdemConsultaCadastralPermitida`) continua funcionando e testada (Rodada 1); vira aviso informativo no frontend. Rodada 3 acrescenta, sem alterar esse comportamento, um modelo de cobertura de evidência que permite um único documento consolidado responder por SCR+CCF+CENPROT etc. ao mesmo tempo (infraestrutura nova, não conectada ao fluxo de upload existente). |
| Inteligência 360 | OK | Não tocado em nenhuma rodada; suíte `tests/inteligencia360*.test.ts` (54 testes) passando. |
| Esteira | OK | Não tocado em nenhuma rodada; suíte `tests/esteiraCredito.test.ts` (42 testes) passando. |
| Propostas | OK | Não tocado em nenhuma rodada; suíte `tests/propostaBancaria.test.ts` (32 testes) passando. |
| Autenticação | OK | Não tocado em nenhuma rodada. |
| Banco compatível | OK | 3 migrations aditivas novas nesta rodada (100, 101, 102) -- todas idempotentes, todas com FK/constraint em blocos `DO $$...EXCEPTION WHEN undefined_table$$` que nunca falham contra um schema que ainda não tenha as tabelas referenciadas. Ver `MIGRATION_SAFETY_REPORT.md`. |
| EFD-Contribuições | OK, com capacidade nova | Rodada 1: auditado, nenhuma fórmula (certa ou errada) existia. Rodada 3: status explícito `ANALISE_ESPECIALIZADA_PENDENTE` -- documento continua sendo aceito e arquivado normalmente, só nunca mais em silêncio sobre a limitação. |
| Faturamento rolling 12 meses | Capacidade nova (Rodada 3) | Infraestrutura completa e testada (janela calculada, soma, meses faltantes, consolidação cross-regime); não conectada a nenhum fluxo de gravação automática ainda -- ver `PENDENCIAS_REAIS.md`. |
| Regularidade (CND/CPEND/PGFN/CADIN) | OK, com correção nova (Rodada 4) | Um documento real de CADIN "incluído" (empresa com pendência ativa) estava sendo aceito sem nenhum alerta de mérito. `situacao_certidao` agora é exigido no prompt da IA para essa categoria e vira alerta crítico/revisão humana quando não for claramente negativo. 8 testes novos; documentos fora dessa categoria (ex.: ECF) confirmadamente não recebem o campo novo. |
| Banner "Ordem recomendada" (SCR→CCS→CCF) | Removido a pedido do usuário (Rodada 4) | Só o aviso visual foi removido; o upload nunca foi bloqueado por essa ordem em nenhuma rodada (`tests/uploadNaoBloqueadoPorOrdemConsultaCadastral.test.ts`, sem alteração, continua passando). Os outros dois avisos "Ordem recomendada" do mesmo componente (sobre etapas do pipeline, não sobre tipos de documento) não foram tocados -- não foram evidenciados nos prints nem pedidos explicitamente. |
| Reprocessamento de documento já analisado (botão "Reanalisar" genérico) | Novo, corrigido (Rodada 5) | Causa raiz real de "já fiz o deploy e a leitura continua errada": um laudo já `concluido` nunca era relido automaticamente após deploy de uma correção do motor. O endpoint `POST /api/documentacao/ia/documentos/:id/extrair` já suportava forçar reprocessamento (mesmo sobre um laudo `concluido`, confirmado por teste novo), mas não havia botão para os documentos catalogados genéricos (ECF, DCTF, CND, CADIN, PGFN etc.) -- só para a continuidade societária. Nenhum comportamento existente foi alterado: o botão novo só adiciona uma chamada explícita, opt-in, por arquivo. |
| Enquadramento Tributário duplicado no relatório consolidado | Novo, corrigido (Rodada 6) | Bug real reportado com PDF/prints: duas entradas "ENQ. TRIB.pdf" idênticas na seção "Documentos anexados e analisados". Causa raiz: o regex de deduplicação (`chaveDocumentoRelatorio`) só reconhecia a variante "simples nacional" com espaço; o `tipo_documento` real gravado no banco é `simples_nacional`, com underscore, então um arquivo com esse tipo nunca era agrupado com `enquadramento_tributario_cnpj` (mesmo bloco, mesma análise) e sobrevivia como card espelhado. Corrigido aceitando os dois separadores; 2 testes novos (`tests/relatorioDocumentalEnquadramentoTributarioDuplicado.test.ts`) provam a consolidação em 1 entrada E que dois documentos genuinamente diferentes continuam separados. Nenhum arquivo do acervo é alterado, movido ou excluído -- a correção é só de apresentação no relatório. |

## Checklist de critérios de aprovação da missão (seção 59, Rodada 1) + itens da auditoria independente (Rodadas 3, 4 e 5)

- Nenhum teste falhou: confirmado (725/725, ver `TEST_REPORT.md`).
- Build não falhou: confirmado (ver `BUILD_REPORT.md`).
- Migrations testadas: 100 (Rodada 2), 101 e 102 (Rodada 3) -- todas idempotentes, todas aditivas, nenhuma aplicada automaticamente por `npm run migrate` (aplicação contra a VPS é manual, fora desta entrega). Ver `MIGRATION_SAFETY_REPORT.md`.
- PGDAS ainda pode validar como ECF: corrigido e testado desde a Rodada 1 (`tests/regimeComprovante.test.ts`).
- Slot ainda influencia classificação (caso cruzado, ex.: DCTFWeb confirmando Presumido no slot de ECF): **corrigido nesta Rodada 3** -- era o bug P0 residual apontado pela auditoria independente. `documento_compativel` agora é sempre `tipo_detectado === tipo_esperado`, verificado pela matriz cruzada completa em `tests/regimeComprovante.test.ts`.
- 5993 classificado como Presumido: corrigido e testado desde a Rodada 1.
- Código 8998 inferindo Lucro Real sem confirmação: **corrigido nesta Rodada 3** (reversão explícita pedida pela auditoria) -- agora `regime: null` + sinalização `REVISAO_HUMANA`/`CODIGO_NAO_MAPEADO`.
- Rolling 12 meses: **implementado nesta Rodada 3** como infraestrutura aditiva testada (migration + serviço + rota); integração automática com os fluxos de análise existentes fica para a próxima rodada (ver `PENDENCIAS_REAIS.md`).
- Documento histórico contaminando regime atual: resolvido na Rodada 2 (linha do tempo do regime tributário, seção 34 da missão anterior) -- um documento com competência no passado nunca reabre nem substitui o período vigente.
- Cobertura de evidência entre bureaus: **implementada nesta Rodada 3** como infraestrutura aditiva testada; integração automática com o fluxo de upload fica para a próxima rodada.
- Constraint rejeitando tipo válido: não avaliado -- nenhuma mudança de catálogo de tipo de documento foi feita em nenhuma rodada (só tabelas novas, aditivas).
- Fase 1 com regressão: não houve -- Fase 1 não foi tocada em nenhuma rodada.

Os itens ainda pendentes acima não estão escondidos: estão detalhados, com justificativa honesta de por que não foram implementados nesta rodada, em `PENDENCIAS_REAIS.md`.
