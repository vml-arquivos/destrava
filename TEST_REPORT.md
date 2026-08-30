# Relatório de Testes — 30/08/2026 (atualizado, Rodada 3 — final pré-commit)

## Resultado final

```
Test Files  78 passed (78)
     Tests  716 passed (716)
  Duration  28.49s
```

Progressão dentro desta sessão, sempre crescendo, nunca encolhendo:

| Entrega | Arquivos de teste | Testes | Observação |
|---|---|---|---|
| Antes desta sessão (v19 anterior) | 70 | 652 | Estado herdado |
| Rodada 1 (`...-corrigido-20260830.zip`) | 71 | 656 | 3 bugs P0 + auditoria EFD |
| Rodada 2 (`...-corrigido-20260830-v2.zip`) | 73 | 670 | Linha do tempo do regime tributário |
| Rodada 3 (esta entrega, `...-corrigido-final-20260830.zip`) | 78 | 716 | Ver abaixo |

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
