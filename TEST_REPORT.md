# Relatório de Testes — 31/08/2026 (atualizado, Rodada 6 — Enquadramento Tributário duplicado no relatório)

## Resultado final

```
Test Files  79 passed (79)
     Tests  727 passed (727)
  Duration  29.53s
```

Progressão dentro desta sessão, sempre crescendo, nunca encolhendo:

| Entrega | Arquivos de teste | Testes | Observação |
|---|---|---|---|
| Antes desta sessão (v19 anterior) | 70 | 652 | Estado herdado |
| Rodada 1 (`...-corrigido-20260830.zip`) | 71 | 656 | 3 bugs P0 + auditoria EFD |
| Rodada 2 (`...-corrigido-20260830-v2.zip`) | 73 | 670 | Linha do tempo do regime tributário |
| Rodada 3 (`...-corrigido-final-20260830.zip`) | 78 | 716 | Ver seção "Rodada 3" abaixo |
| Rodada 4 (`...-corrigido-final-20260831.zip`) | 78 | 724 | +8 testes -- situação da certidão CND/CPEND/PGFN/CADIN |
| Rodada 5 (`...-corrigido-final-20260831-v2.zip`) | 78 (nenhum arquivo novo) | 725 | +1 teste em `tests/documentacaoAnaliseEspecializada.integration.test.ts` -- reprocessamento de laudo já concluído |
| Rodada 6 (esta entrega) | 79 (+1 arquivo novo) | 727 | +2 testes -- Enquadramento Tributário duplicado no relatório consolidado |

## Testes novos ou alterados na Rodada 6 (2 testes: 1 arquivo novo)

- `tests/relatorioDocumentalEnquadramentoTributarioDuplicado.test.ts` (novo, 2 testes): reproduz o bug real reportado ("porque no relatorio gerado tem dois enquadramento tributario com as mesmas informações") -- dois arquivos ativos no mesmo bloco, um catalogado como `enquadramento_tributario_cnpj` e outro como `simples_nacional` (os dois tipos que o catálogo documental e `vincularDocumentosAutomaticos` tratam como a mesma família/bloco, com a mesma análise especializada `simples_extract`), com a mesma leitura -- prova que o relatório consolida em UMA única entrada, não duas. Segundo teste prova que dois documentos genuinamente diferentes (Enquadramento Tributário + QSA) continuam aparecendo como duas entradas distintas, sem regressão.

## Testes novos ou alterados na Rodada 5 (1 teste: 1 arquivo alterado, 0 arquivos novos)

- `tests/documentacaoAnaliseEspecializada.integration.test.ts`: +1 teste -- prova que `POST /api/documentacao/ia/documentos/:id/extrair` dispara `analisarDocumentoCatalogado` de novo mesmo quando já existe um laudo `concluido` persistido (ex.: um ECF lido pelo motor antigo, antes da correção de identidade documental) -- a causa raiz de "já fiz o deploy e a leitura continua errada": nenhum documento já analisado é relido automaticamente só porque o código mudou.
- `client/src/components/documentos/DocumentosEntidade.tsx` (botão "Reanalisar" novo por arquivo, para todos os documentos catalogados genéricos): sem teste de renderização dedicado (mesma situação já registrada na Rodada 4 para a remoção do banner -- este repositório não tem testes de DOM para este componente).

## Testes novos ou alterados na Rodada 4 (8 testes: 1 arquivo alterado, 0 arquivos novos)

- `tests/analiseDocumentalEspecializada.test.ts`: +8 testes -- categoria `cnd_cpend` (CND/CPEND Federal, PGFN, CADIN): situação "positiva" vira alerta crítico para os três tipos (`cadin_cnpj`, `cnd_rfb_cnpj`, `pgfn_cnpj`), situação "negativa" e "positiva_com_efeito_negativo" não geram alerta (sem falso positivo), ausência de confirmação vira alerta de revisão humana, tipos fora da categoria (ex.: `ecf`) não recebem o campo novo (sem regressão), e o prompt de verdade enviado à IA é capturado e verificado.
- `client/src/components/documentos/DocumentosEntidade.tsx` (remoção do banner "Ordem recomendada" SCR→CCS→CCF): sem teste de renderização dedicado neste repositório (não há testes de DOM para este componente); a cobertura relevante é `tests/uploadNaoBloqueadoPorOrdemConsultaCadastral.test.ts`, que testa o comportamento do BACKEND (upload nunca bloqueado pela ordem) e continua passando sem nenhuma alteração -- a remoção foi só do aviso visual, o comportamento de upload não mudou.

## Testes novos ou alterados na Rodada 3 (46 testes: 5 arquivos alterados, 8 arquivos novos)

- `tests/regimeComprovante.test.ts`: +8 testes -- matriz cruzada completa tipo-esperado × tipo-detectado (seção 47 da missão: ECF×DCTFWeb, ECF×DARF, DARF×DCTFWeb, DCTFWeb×ECF, Livro Caixa×ECF, mais o caso compatível e a classificação isolada) e a reversão do código 8998 (não infere mais Lucro Real).
- `tests/regimeTributarioConsistencia.test.ts`: o teste do código 8998 foi reescrito (era "8998 = Lucro Real"; agora prova que 8998 NÃO infere regime e sinaliza `codigoReceitaNaoConfirmado`), seguindo o mesmo protocolo de documentar a correção usado na Rodada 1 para o 5993. Nenhum teste removido -- contagem do arquivo permanece 14.
- `tests/analiseDocumentalEspecializada.test.ts`: +4 testes -- EFD-Contribuições (`ANALISE_ESPECIALIZADA_PENDENTE`, alias legado `efd`, não-regressão em outros tipos catalogados) e a auditoria de linguagem do prompt genérico (captura o prompt real enviado à IA e prova a ausência da frase enviesada).
- `tests/ordemConsultaCadastral.test.ts`: alteração pertence à Rodada 1 (comentário de cabeçalho), listada aqui só porque esta entrega consolida o diff completo contra o repositório original -- sem alteração nesta Rodada 3.
- `server/services/regimeTributarioTemporalService.ts` e seus 2 arquivos de teste (`tests/regimeTributarioTemporalService.test.ts`, 14 testes; `tests/regimeTributarioLinhaDoTempoRoute.test.ts`, 3 testes) e `tests/uploadNaoBloqueadoPorOrdemConsultaCadastral.test.ts` (1 teste): pertencem à Rodada 2, incluídos nesta consolidação final porque a base desta entrega é o estado completo da sessão (ver `CHANGELOG_CORRECOES.md`, seção "Decisão de escopo").
- `tests/faturamentoRolling12MesesService.test.ts` (novo, 10 testes) + `tests/faturamentoRolling12MesesRoute.test.ts` (novo, 4 testes): janela móvel de 12 meses por competência, incluindo o cenário central de consolidar competências de regimes tributários diferentes na mesma janela.
- `tests/coberturaEvidenciaBureauService.test.ts` (novo, 13 testes) + `tests/coberturaEvidenciaBureauRoute.test.ts` (novo, 3 testes): classificador multi-requisito, status granular de certidão (CND/CPEND/Positiva) e consolidação por empresa.
- `tests/catalogoDarfConsistencia.test.ts` (novo, 4 testes): consistência entre o catálogo de código de receita do DARF e o texto do prompt enviado à IA.

## Testes existentes preservados sem alteração de expectativa

Nenhum teste das Rodadas 1 e 2 teve sua expectativa alterada nesta rodada, além dos dois reescritos acima (5993 já havia sido corrigido na Rodada 1; 8998 é a reversão desta rodada, ambos seguindo o mesmo protocolo de documentar o erro antes de corrigir o teste).

## Comando para reproduzir

```
pnpm install --frozen-lockfile
npx tsc --noEmit
npx vitest run
pnpm run build
```
