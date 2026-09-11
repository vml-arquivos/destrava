# Relatório de implementação — Onda 0 do CRM

**Projeto:** Destrava Crédito  
**Branch:** `onda-0-consolidacao-base`  
**Base:** `main` limpa em `531ebe9`  
**Data:** 27 de agosto de 2026  
**Autor:** Manus AI

## Resultado executivo

A Onda 0 foi implementada em uma branch isolada, sem alterar a `main` e sem iniciar as ondas posteriores que dependem de confirmação humana. A entrega consolida a taxonomia do funil, evita o descarte do score determinístico, conecta a camada operacional à ficha do CRM, corrige a priorização das filas, protege o endpoint público de solicitação de PDF e adiciona um dataset dourado para prevenir regressões na análise societária documental.

| Área | Resultado | Compatibilidade |
|---|---|---|
| Taxonomia do funil | Mapeamentos canônicos, legados e de persistência centralizados em `shared/funnel.ts` | Mantida a taxonomia legada de gravação (`entrada`, `contato`, `qualificacao`, etc.) |
| Score de lead | Criado `score_basico`, com backfill idempotente e cálculo efetivo manual → IA → básico | O código funciona antes da migration; o campo é usado quando disponível |
| Fila operacional | Backend e telas `Fila`/`MeuCRM` ordenam pelo score efetivo, atraso, temperatura e data | O campo antigo `score_ia` continua aceito como fallback |
| CRM operacional | Follow-ups, notas internas e delegações disponíveis na aba `Operação` da ficha | Erro `migration_pending` não oculta as abas legadas |
| Segurança | Rate limit de 10 solicitações por IP a cada 15 minutos e honeypot no endpoint público de PDF | Payload legítimo atual permanece válido |
| Análise documental | Dataset dourado com transformação de Empresário Individual para LTDA e caso histórico | Não houve alteração nos prompts nem no motor documental |

## Arquivos e commits

A base compartilhada foi registrada no commit `34c705c` (`feat(crm): centraliza funil e score basico`). A implementação operacional foi registrada no commit `a4bf763` (`feat(crm): conecta operacao e prioriza fila`). Os commits são reversíveis individualmente e a branch permanece dois commits à frente de `origin/main`.

Os principais arquivos alterados são `shared/funnel.ts`, `shared/leadScoring.ts`, `server/index.ts`, `db/migrations/086_onda_0_crm_score_basico.sql`, `db/migrate.sql`, `client/src/pages/colaborador/CRM.tsx`, `client/src/pages/colaborador/Fila.tsx`, `client/src/pages/colaborador/MeuCRM.tsx` e `client/src/components/NotificacoesFollowup.tsx`. Os novos testes estão em `tests/funnelAndLeadScoring.test.ts`, `tests/analiseDocumentalGolden.test.ts` e `tests/fixtures/analise-documental-golden.json`.

## Mudanças funcionais

A fórmula existente do score básico foi extraída para um helper compartilhado, sem alteração de seus critérios: valor solicitado, prazo, completude cadastral e temperatura. O score é persistido de maneira compatível em `leads` e `triagem_leads`, e a migration 086 preenche apenas lacunas. A fila calcula o score efetivo priorizando score manual, score de IA positivo e score básico, mantendo o comportamento legado quando o campo novo ainda não existe.

A nova aba **Operação** permite agendar, listar e concluir follow-ups; criar notas internas privadas; e, para perfis de gestão, delegar um lead a um colaborador ativo. As rotas verificam a visibilidade do lead antes de ler ou alterar dados. Notas privadas ficam restritas ao autor, responsável atual e gestores. Delegações são gravadas em histórico e atualizam o responsável do lead dentro de transação.

O endpoint público `/api/leads/:id/solicitar-pdf` agora usa o rate limit já suportado pelo projeto e ignora silenciosamente requisições que preencham campos honeypot. Também foi corrigido o link do sino de follow-up, que apontava para `?lead=` enquanto a ficha do CRM lê `?leadId=`.

## Validação executada

| Verificação | Resultado |
|---|---:|
| `pnpm check` | Aprovado |
| `pnpm test` | **51 arquivos, 547 testes aprovados** |
| Testes do dataset dourado documental | 2 casos aprovados |
| Testes de funil e score | 7 casos aprovados |
| `pnpm build` | Aprovado |
| Pré-renderização e meta tags | Aprovadas |
| Bundle inicial JavaScript | 98,1 kB gzip, abaixo do limite de 130 kB |
| Bundle inicial CSS | 30,3 kB gzip, abaixo do limite de 45 kB |
| `git diff --check` | Aprovado |
| Estado da branch após commit | Limpo |

## Limitações e próximo passo controlado

A sessão não possui `DATABASE_URL`; portanto, foi feita apenas a validação estática, de testes e de build. A migration 086 foi preparada nos dois pontos usados pelo projeto, mas **não foi aplicada em produção** nem foi executada uma inspeção factual do banco real. O deploy no Coolify também não foi disparado automaticamente. A aplicação foi preparada para tolerar o intervalo entre código e migration, retornando `migration_pending` nas novas rotas e preservando as telas legadas.

Não foram iniciadas as ondas 1 e 2. A continuação deve ocorrer somente após validação humana da Onda 0, aplicação controlada da migration 086 no banco correto e verificação operacional das rotas de follow-up, nota e delegação com uma conta de teste de cada perfil.

## Referências internas

| Referência | Conteúdo |
|---|---|
| `pasted_content.txt` | Roadmap e critérios de aceite da Onda 0 |
| `shared/funnel.ts` | Fonte única da taxonomia do funil |
| `shared/leadScoring.ts` | Fórmula compartilhada de score básico e score efetivo |
| `db/migrations/086_onda_0_crm_score_basico.sql` | Migration aditiva e idempotente |
| `tests/analiseDocumentalGolden.test.ts` | Proteção contra regressões societárias documentais |
