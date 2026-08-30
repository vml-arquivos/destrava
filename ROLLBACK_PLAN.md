# Plano de Rollback — 30/08/2026 (atualizado, Rodada 3 — final pré-commit)

## Como reverter tudo desta sessão (as três rodadas)

Se este pacote for aplicado por cima de um checkout limpo do commit anterior, reverter é restaurar os arquivos listados em `FILES_CHANGED.txt` para a versão anterior (o commit atual em produção, ou o commit correspondente à entrega v19 anterior a esta missão) e remover os arquivos novos listados no mesmo arquivo. Nenhuma migration precisa ser desfeita no banco se ela nunca chegou a ser aplicada manualmente contra a VPS (ver abaixo) -- `npm run migrate` nunca as aplica sozinho.

## Como reverter cada correção/capacidade isoladamente

### Rodada 1 (bugs P0 originais)
1. **Catálogo de código de receita do DARF**: reverter `server/services/extracaoDocumentalLocal.ts` (bloco `CATALOGO_CODIGO_RECEITA_DARF_IRPJ`) e `server/services/analiseDocumentalEspecializada.ts` (tabela dentro de `promptSimples`). Reverter também `tests/regimeTributarioConsistencia.test.ts`.
2. **Classificação independente do slot (caso PGDAS-em-ECF)**: reverter o trecho original de `parseComprovanteRegime` (`server/services/extracaoDocumentalLocal.ts`).
3. **SCR/CCS/CCF deixar de bloquear upload**: reintroduzir a chamada a `assertOrdemConsultaCadastralPermitida` em `server/routes/documentos.ts` (rota `POST /api/documentos/upload`) e reverter `client/src/components/documentos/DocumentosEntidade.tsx`. Remover `tests/uploadNaoBloqueadoPorOrdemConsultaCadastral.test.ts`.

### Rodada 2 (linha do tempo do regime tributário)
4. Remover `server/services/regimeTributarioTemporalService.ts`, a rota em `server/routes/documentacao.ts` (`GET .../regime-tributario/linha-do-tempo`) e os 2 arquivos de teste correspondentes. No banco: `DROP TABLE IF EXISTS public.empresas_regime_tributario_historico CASCADE;` (só necessário se a migration 100 chegou a ser aplicada manualmente contra a VPS -- nenhum outro dado do sistema referencia essa tabela, então o drop não afeta mais nada).

### Rodada 3 (esta entrega)
5. **Identidade documental (matriz cruzada)**: reverter `parseComprovanteRegime`/`detectarTipoComprovanteRegime` em `server/services/extracaoDocumentalLocal.ts` para a versão da Rodada 1. Reverter os 8 testes novos em `tests/regimeComprovante.test.ts`.
6. **Reversão do código 8998**: reverter `CATALOGO_CODIGO_RECEITA_DARF_IRPJ` (campo `confirmado`), `detectarRegimeTributarioDeclarado` e o alerta `regime_tributario_codigo_nao_mapeado` em `normalizarDocumentoCatalogado` (`analiseDocumentalEspecializada.ts`). Reverter o teste do 8998 em `tests/regimeComprovante.test.ts` e `tests/regimeTributarioConsistencia.test.ts`.
7. **Auditoria de linguagem do prompt**: reverter `promptDocumentoCatalogado` em `analiseDocumentalEspecializada.ts`. Remover o teste correspondente em `tests/analiseDocumentalEspecializada.test.ts`.
8. **Faturamento rolling 12 meses**: remover `server/services/faturamentoRolling12MesesService.ts`, a rota em `server/routes/documentacao.ts` (`GET .../faturamento/rolling-12-meses`) e os 2 arquivos de teste. No banco: `DROP TABLE IF EXISTS public.empresas_faturamento_mensal CASCADE;` (só se a migration 101 tiver sido aplicada).
9. **Cobertura de evidência entre bureaus**: remover `server/services/coberturaEvidenciaBureauService.ts`, a rota em `server/routes/documentacao.ts` (`GET .../cobertura-bureau`) e os 2 arquivos de teste. No banco: `DROP TABLE IF EXISTS public.document_evidence_coverage CASCADE;` (só se a migration 102 tiver sido aplicada).
10. **EFD-Contribuições `ANALISE_ESPECIALIZADA_PENDENTE`**: remover o bloco `dadosEfd`/o alerta `efd_contribuicoes_analise_especializada_pendente` em `normalizarDocumentoCatalogado` (`analiseDocumentalEspecializada.ts`). Remover os 3 testes correspondentes em `tests/analiseDocumentalEspecializada.test.ts`.
11. **Teste de consistência catálogo × prompt**: remover `tests/catalogoDarfConsistencia.test.ts` e, se desejado, as duas exportações adicionadas só para viabilizá-lo (`CATALOGO_CODIGO_RECEITA_DARF_IRPJ` e `promptSimples` -- ambas seguras de manter exportadas mesmo sem o teste, pois não mudam nenhum comportamento em runtime).

## Risco de rollback

Baixo em todos os itens. Nenhuma das correções de código (itens 1, 2, 3, 5, 6, 7, 10, 11) depende de dado gravado no banco -- reverter o código volta exatamente ao comportamento anterior. As três capacidades aditivas com tabela nova (itens 4, 8, 9) só têm risco de perda de dado SE a migration correspondente já tiver sido aplicada manualmente contra a VPS E já existirem linhas gravadas nela por uso real do sistema -- nesse caso um `DROP TABLE` apaga esse histórico específico (linha do tempo de regime, faturamento por competência ou cobertura de bureau já registrados), mas nunca afeta `empresas.regime_tributario`, `documentos_arquivos` ou qualquer outra tabela existente, porque as três são estritamente aditivas e nenhuma coluna de tabela existente foi alterada.
