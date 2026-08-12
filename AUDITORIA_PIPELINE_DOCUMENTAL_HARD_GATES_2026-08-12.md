# Auditoria técnica — Pipeline documental sequencial

Base de produção: `destrava-main (72).zip`
SHA-256: `379c3502b56501006553d3da65995b7146bd957f5ae12e23d7f993d263dbfac8`

## 1. Diagnóstico e correção de navegação

A ação do Acervo iniciava o processamento na rota parametrizada `/colaborador/empresas/:id/acervo`, mas em seguida navegava para `/colaborador/empresas?empresa=:id&aba=dossie_credito`. A segunda tela depende de recompor a seleção após o carregamento assíncrono da lista de empresas. Nesse intervalo, o componente podia renderizar o estado vazio “Selecionar empresa”.

Correção: processamento e resultado permanecem em `/colaborador/empresas/:id/acervo?view=analise`; o `empresaId` continua como parâmetro obrigatório da rota e também é gravado em `sessionStorage` como recuperação defensiva.

## 2. Máquina de estados

Estados implementados em `DocumentPipelineStatus`:

- `PHASE_1_PENDING`
- `PHASE_1_PROCESSING`
- `PHASE_2_JUNTA_PENDING`
- `PHASE_2_JUNTA_PROCESSING`
- `PHASE_3_CONTRACT_PENDING`
- `PHASE_3_CONTRACT_PROCESSING`
- `PHASE_3_HISTORY_INSUFFICIENT`
- `COMPLETED`

O frontend consulta `GET /api/documentacao/empresa/:empresaId/pipeline/status`. O backend também aplica o gate no upload; desabilitar o botão não é a única proteção.

## 3. Regra temporal

`validateTwelveMonthContractHistory` calcula meses-calendário completos a partir do documento aprovado mais antigo. Período inferior a 12 meses lança `InsufficientHistoricalPeriodException` com código `INSUFFICIENT_HISTORICAL_PERIOD` e HTTP lógico 422.

O resultado é combinado com a cadeia extraída dos Atos da Junta. Alterações intermediárias requeridas continuam obrigatórias: não basta anexar um documento antigo sem correspondência com os registros identificados.

## 4. Arquivos modificados

- `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx`
- `client/src/components/documentacao/DossieCreditoEmpresa.tsx`
- `client/src/components/documentos/DocumentosEntidade.tsx`
- `server/routes/documentacao.ts`
- `server/routes/documentos.ts`
- `server/services/documentPipelineService.ts` (novo)
- `tests/documentPipelineService.test.ts` (novo)

Nenhuma migração, tabela, rota legada ou tipo documental foi removido.

## 5. Validação

- `npm run check`: aprovado.
- `npm run build`: aprovado.
- Pré-renderização e bundle budgets: aprovados.
- Novos testes: 6/6 aprovados.
- Cenários A, B e C: aprovados.
- Cadeia societária: 6/6 aprovados.
- Extração documental local: 8/8 aprovados.
- Uma falha legada em `analiseDocumentalEspecializada.test.ts` foi reproduzida de forma idêntica no ZIP 72 intacto.
- Três falhas legadas em `inteligencia360Documental.test.ts` já eram conhecidas e não estão no delta desta correção.

## 6. Comandos de validação para Manus AI

```bash
npm ci --no-audit --no-fund
npm run check
npx vitest run tests/documentPipelineService.test.ts
npx vitest run tests/cadeiaSocietaria.test.ts tests/extracaoDocumentalLocal.test.ts
npm run build
```

Validação pós-deploy:

1. Abrir uma empresa pelo Acervo e iniciar análise.
2. Confirmar que a URL mantém `/empresas/:id/acervo?view=analise`.
3. Confirmar que a empresa e o relatório continuam visíveis.
4. Confirmar bloqueio dos Atos antes da Fase 1.
5. Confirmar bloqueio do Contrato antes da aprovação dos Atos.
6. Confirmar que alteração recente exige anteriores até atingir 12 meses.

