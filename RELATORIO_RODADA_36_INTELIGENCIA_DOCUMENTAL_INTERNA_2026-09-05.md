# Relatório — Rodada 36: validação documental persistente e internal-first

Data: 2026-09-05  
Base: `main@3475eca62321c61548a6e3a47be90169bd9d6d45`  
Branch: `feat/rodada-36-validacao-documental-persistente-internal-first`

## Objetivo

Garantir que a validação documental automática já concluída não seja desfeita por logout, restart, deploy ou simples atualização de versão do motor; preservar o botão manual **Reler**; manter upload e validação automáticos; e tornar IA externa um fallback explicitamente opcional.

## Contrato funcional implementado

1. **Upload automático preservado.** O fluxo existente `agendarAnaliseRegraDocumental` continua sendo chamado após o upload.
2. **Botão Relêr preservado.** Nenhum componente ou rota do fluxo manual foi removido.
3. **Laudo concluído não é derrubado por bump de versão.** Diferença de assinatura agenda atualização, mas o último laudo concluído continua utilizável enquanto não houver invalidação explícita.
4. **Troca atômica do ponto de vista funcional.** O laudo anterior só passa a `SUPERSEDED` depois de a nova leitura ser persistida com sucesso.
5. **Falha da nova leitura não destrói a anterior.** Retentativa falha fica separada e a última conclusão válida continua preservada.
6. **Compatibilidade com banco sem colunas de versionamento.** Uma conclusão antiga não é zerada para iniciar a nova tentativa; a releitura usa outra linha.
7. **Fail-closed real preservado.** `STALE` e `SUPERSEDED` explícitos continuam bloqueando; tentativa `falhou` não é transformada em válida.
8. **Recuperação da verdade documental original.** Quando uma versão anterior zerou a coluna `satisfaz_requisito` apenas ao detectar bump global, o valor explicitamente registrado no próprio laudo tem precedência. Documento realmente incompatível continua `false`.
9. **Internal-first.** Ter `GEMINI_API_KEY` não habilita IA externa. O fallback documental exige simultaneamente `DOCUMENT_EXTERNAL_AI_FALLBACK_ENABLED=true` e `GEMINI_DOCUMENT_OCR_ENABLED=true`.
10. **Extração local parcial é preservada.** Se OCR/leitor local extrair evidência, ela é mantida para validação/revisão mesmo com fallback externo desligado.
11. **Cartão CNPJ também respeita internal-first.** Resultado local parcial deixa de ser descartado apenas porque não atingiu o limiar para confirmação automática.
12. **Scheduler da Rodada 35 preservado.** O enfileiramento periódico automático continua convergindo o backlog sem comando manual.

## Arquivos de produção alterados

- `.env.example`
- `server/routes/documentacao.ts`
- `server/services/documentalLaudoVersioning.ts`
- `server/services/documentExternalAiPolicy.ts` (novo)
- `server/services/analiseDocumentalEspecializada.ts`
- `server/services/analiseCnpjReceitaCartao.ts`
- `server/services/backfillLaudosService.ts`

## Testes alterados/adicionados

- `tests/validacaoDocumentalPersistenteInternalFirst.test.ts` (novo)
- `tests/acervoDocumentalFalhaRealVsAguardando.test.ts`
- `tests/analiseQsaDesatualizadaNaoRepeteErroAntigo.test.ts`
- `tests/analiseEnquadramentoDesatualizadaNaoRepeteErroAntigo.test.ts`
- `tests/relerQsaEnquadramentoAposVersaoMudar.test.ts`

## O que não foi alterado

- frontend e UX do botão **Reler**;
- upload, download, exclusão e visualização;
- regras específicas de QSA/CCMEI entregues na V3;
- matriz documental das Rodadas 33/34;
- scheduler da Rodada 35;
- `DATABASE_URL`;
- schema e migrations;
- Inteligência 360 / estratégia bancária;
- proposta de crédito.

## Validações executadas nesta sessão

- Reconciliação do ZIP enviado com `main@3475eca...`.
- Transpilação TypeScript dos arquivos alterados no workspace local: sem erro sintático.
- Verificação de whitespace do diff local: sem erro.
- Testes contratuais diretos executados para:
  - laudo concluído ATIVO permanece utilizável;
  - conclusão legada marcada apenas como `REANALISE_NECESSARIA` pode permanecer durante atualização;
  - `STALE` explícito continua bloqueado;
  - `SUPERSEDED` continua bloqueado;
  - uma chave Gemini sozinha não ativa fallback externo;
  - fallback externo exige os dois opt-ins.
- Verificação estática de que `Reler`, `relerDocumentoIdentidade`, `agendarAnaliseRegraDocumental` e `analisarDocumentoAutomatico` continuam presentes.

### Limitação de validação

O ambiente desta sessão não possui `node_modules` e o registry de pacotes não estava acessível. Portanto, a suíte completa Vitest e o build final desta branch **ainda precisam ser rerodados antes do merge**. A alteração foi deliberadamente mantida em branch/PR, sem escrita direta na `main`.

## Procedimento de homologação antes do merge

1. `pnpm install --frozen-lockfile`
2. `npx tsc --noEmit`
3. `npx vitest run`
4. `pnpm run build`
5. Confirmar `dist/index.js` e `dist/backfill-laudos.js`.
6. Homologar:
   - Cartão CNPJ novo valida automaticamente;
   - QSA MEI/EI valida automaticamente;
   - QSA LTDA continua validando composição/administração;
   - Enquadramento Tributário valida automaticamente;
   - logout/login mantém a conclusão;
   - restart mantém a conclusão;
   - deploy/bump de motor não converte conclusão válida em pendência;
   - **Reler** cria nova tentativa sem apagar a anterior;
   - falha de **Reler** mantém o último laudo válido;
   - `STALE` explícito continua pedindo revisão;
   - IA externa desligada mantém leitura local e, se insuficiente, produz revisão humana objetiva.

## Deploy

A Rodada 36 não adiciona migration. Manter a `DATABASE_URL` atual. Não trocar credenciais. Depois do merge e homologação, o deploy é o deploy normal da aplicação.

## Próximas melhorias — performance e expertise

### P0/P1 — completar a Inteligência Documental Interna

O catálogo possui 141 tipos e todos entram no despacho automático, mas ainda existem tipos que compartilham o leitor local genérico. A próxima fase deve criar um `DocumentReaderRegistry` auditável por tipo/família, com:

- identidade do documento;
- campos obrigatórios e opcionais;
- temporalidade;
- autenticidade;
- cruzamentos;
- evidências;
- fixtures e benchmark;
- versão do reader.

O fallback genérico deve capturar evidência, mas não satisfazer requisito crítico sozinho.

### P1 — temporalidade correta por natureza da evidência

Separar explicitamente:

- `VALIDADE_EXPRESSA`: CND/CRF;
- `COMPETENCIA_MENSAL`: PGDAS/DCTF/EFD/DARF;
- `COMPETENCIA_ANUAL`: ECF/ECD/DASN-SIMEI;
- `SNAPSHOT`: CNPJ/QSA/Simples/CADIN/SCR;
- `ROLLING_12`: faturamento;
- `SEM_EXPIRACAO_FORMAL`: atos societários;
- `POLITICA_CREDITO`: prazos internos como comprovante de endereço.

### P1 — performance

- cache de OCR/extração por SHA-256;
- evitar releitura do mesmo binário quando readerVersion não mudou;
- worker separado para OCR pesado;
- concorrência e lotes configuráveis;
- prioridade para identidade/regime/checklist;
- métricas por reader: duração, confiança, revisão, erro e taxa de sucesso.

### P1/P2 — expertise interna treinável

- corpus anonimizado e fixtures sintéticas por documento/layout;
- registrar correção humana como dataset supervisionado;
- benchmark por readerVersion;
- classificador/extração ML local opcional atrás do mesmo contrato;
- adapters para QR code/código de validação/consulta oficial;
- provenance store por fato: arquivo, página, trecho, readerVersion e regra.

### Camada estratégica — depois da camada documental

A Inteligência 360 deve consumir somente fatos `PROVADO` e `CALCULADO`, sem reler PDFs nem alterar a verdade documental. A partir daí gera diagnóstico bancário, capacidade, risco, produtos, linhas, garantias, estrutura e proposta.

## Critério de aceite arquitetural

Com IA externa desligada, o sistema deve continuar recebendo documentos, executando leitura interna, persistindo laudos individuais, montando checklist e relatório consolidado. Quando a evidência interna não for suficiente, o resultado deve ser `NAO_VERIFICADO`/`REVISAO_HUMANA`, nunca dependência obrigatória de um provedor externo.
