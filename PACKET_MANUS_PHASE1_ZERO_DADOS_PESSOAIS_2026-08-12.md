# [PACKET:MANUS_INSTRUCTION] — Fase 1 sem dados pessoais

## Base auditada

- Repositório-base: `destrava-main (72).zip`
- SHA-256 da entrada: `379c3502b56501006553d3da65995b7146bd957f5ae12e23d7f993d263dbfac8`
- Regra preservada: contexto da empresa mantido na rota `/colaborador/empresas/:empresaId/acervo?view=analise` e em `sessionStorage`.
- Regra preservada: pipeline bloqueante Fase 1 → Atos da Junta → Contrato/Alterações com comprovação de 12 meses.

## Causa raiz e correção

O backend já possuía validação institucional do QSA, mas agregava ao bloco da primeira análise as `pendencias_contrato` produzidas pelo cadastro geral de sócios. Essas pendências incluem dados destinados a contratos e etapas avançadas (RG, endereço residencial, estado civil, contato e profissão). A composição fazia dados futuros parecerem requisitos da Fase 1.

A correção separa os contextos:

1. A Fase 1 usa exclusivamente pendências institucionais extraídas de CNPJ, QSA e enquadramento tributário.
2. Pendências pessoais permanecem disponíveis para contratos e etapas futuras, sem bloquear a Fase 1.
3. A resposta aditiva `phase1` contém somente `cnpjStatus`, `isMatriz`, `location`, `companySize`, `qsaMatches`, `capitalSocial` e `taxRegime`.
4. `PHASE_1_APPROVED` exige documentos iniciais consistentes, CNPJ ativo, matriz, correspondência do QSA e regime tributário identificado.
5. Após aprovação, o próximo gate continua sendo Atos da Junta Comercial.

## Arquivos modificados

- `server/services/phase1AnalysisService.ts`: DTO restrito e guard de aprovação da Fase 1.
- `server/routes/documentacao.ts`: separação das pendências pessoais; resposta `status`/`phase1`; preservação do gate societário.
- `server/routes/socios_documentos.ts`: marca pendências pessoais como `contratos_e_etapas_futuras` e `bloqueia_fase_1: false`.
- `client/src/pages/colaborador/Empresas.tsx`: rótulos deixam explícito que os dados pessoais não bloqueiam a Fase 1.
- `tests/phase1AnalysisService.test.ts`: regressão de dados pessoais e aprovação/reprovação institucional.

Arquivos do hard gate e navegação, também presentes neste pacote completo:

- `server/services/documentPipelineService.ts`
- `server/routes/documentos.ts`
- `client/src/components/documentos/DocumentosEntidade.tsx`
- `client/src/components/documentacao/DossieCreditoEmpresa.tsx`
- `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx`
- `tests/documentPipelineService.test.ts`

## Rotas auditadas

- `POST /api/documentacao/empresa/:empresaId/analise-inicial/iniciar`
- `GET /api/documentacao/empresa/:empresaId/analise-inicial/status`
- Rotas legadas de execução da análise inicial mantêm o payload anterior e recebem os campos aditivos `status` e `phase1`.
- Uploads documentais continuam protegidos no backend pelos hard gates; a UI não é a única barreira.

## Comandos obrigatórios antes do redeploy

```bash
npm ci
npm run check
npx vitest run tests/phase1AnalysisService.test.ts tests/documentPipelineService.test.ts tests/cadeiaSocietaria.test.ts tests/extracaoDocumentalLocal.test.ts
npm run build
```

Observação: nesta base, o Vitest mantém handles abertos após imprimir o sucesso dos testes focados; os 23 testes concluíram com sucesso, mas o processo precisou ser encerrado após o relatório. Isso não afetou `tsc` nem o build de produção.

## Critérios de aceite

1. RG, CNH, CPF documental, endereço residencial, estado civil e certidão de casamento não aparecem como requisitos nem bloqueadores da Fase 1.
2. CNPJ inativo, filial, QSA divergente ou regime tributário não identificado mantêm `PHASE_1_PENDING`.
3. CNPJ ativo, matriz, QSA correspondente e enquadramento identificado, com os três documentos iniciais consistentes, retornam `PHASE_1_APPROVED`.
4. A aprovação libera apenas Atos da Junta Comercial.
5. Contrato/alteração permanece bloqueado até aprovação dos Atos.
6. Documento posterior permanece bloqueado até comprovação dos 12 meses na Fase 3.
7. Iniciar análise conserva o `empresaId` e não retorna à seleção de empresa.

## Casos automatizados

- Aprovação sem qualquer campo pessoal.
- Contrato exato do DTO, impedindo vazamento de chaves pessoais.
- Reprovação por CNPJ inativo.
- Reprovação por QSA divergente.
- Bloqueio da Fase 2 antes da Fase 1.
- Bloqueio da Fase 3 antes dos Atos da Junta.
- Alteração recente exige histórico anterior.
- Alteração antiga satisfaz 12 meses.
- Contrato original com 12 meses satisfaz a regra.
- Sequência documental posterior bloqueada antes da Fase 3.

