# Auditoria — "DESTRAVA_MAIN_73_CORRECAO_DEFINITIVA_QSA_CARTAO_FASE1.zip" — 12/08/2026

## Pergunta do usuário
"Veja se esse arquivo tá corrigido" — auditoria do zip enviado como "correção
definitiva" do parser de QSA e do comparador de endereço do Cartão CNPJ,
antes de confiar/publicar.

## Resposta curta
**Parcialmente.** As duas correções que o pacote se propõe a entregar (parser
de QSA mais robusto e comparador de endereço do Cartão CNPJ tolerante a
cabeçalho de OCR) estão **corretas em intenção e, em sua maioria, corretas na
implementação** — mas o zip como recebido tinha dois problemas sérios, ambos
já corrigidos nesta auditoria:

1. **Regressão silenciosa**: o zip foi construído a partir de um estado do
   repositório **anterior** à correção do bug "Erro ao atualizar sócio"
   (ver `CORRECAO_SOCIO_INFERIDO_ERRO_ATUALIZAR_2026-08-12.md`), publicada
   horas antes. Se esse zip fosse aplicado diretamente por cima do código em
   produção, ele reverteria essa correção: o botão "Salvar sócio/representante"
   voltaria a quebrar com "Erro ao atualizar sócio" para qualquer empresa sem
   sócio real cadastrado ainda.
2. **Bug novo introduzido pelo próprio parser de QSA reescrito**: o teste do
   próprio pacote (`tests/extracaoDocumentalLocal.test.ts`, caso "extrai QSA,
   capital social e sócio administrador") **falhava contra a implementação
   entregue no zip** — o parser extraía **2 sócios em vez de 1** para um QSA
   em formato vertical (rótulos e valores em linhas alternadas). Isso
   contradiz a própria lista de validação do changelog do pacote, item 5
   ("extraiu ... sem duplicação: OK").

Nenhuma dessas duas coisas foi detectada por rodar apenas o changelog/resumo
enviado junto do zip — só apareceram ao (a) diffar contra o último estado
validado e (b) efetivamente rodar `npx vitest run` no código entregue.

## O que foi feito nesta auditoria

1. Extraído o zip em `/tmp/destrava/def_correcao` e lido o changelog completo
   (`CORRECAO_DEFINITIVA_QSA_CARTAO_FASE1_2026-08-12.md`).
2. Diff linha a linha entre `def_correcao` e a última base validada
   (`current74`, já com a correção do bug do sócio) para os 6 arquivos que o
   changelog declara ter alterado. Confirmado:
   - `server/routes/documentacao.ts`: diferença é exatamente o bump de versão
     do prompt QSA (`qsa_extract: '5.0.0' → '5.1.0'`) — correto e coerente com
     o versionamento idempotente já existente.
   - `server/services/extracaoDocumentalLocal.ts`,
     `server/services/analiseCnpjReceitaCartao.ts`, `server/utils/helpers.ts`,
     `tests/extracaoDocumentalLocal.test.ts`: arquivos novos/reescritos,
     legítimos — implementam de fato o parser de QSA multi-layout e o
     comparador de endereço tolerante a OCR descritos no changelog.
   - `server/services/analiseDocumentalEspecializada.ts`: reescrito a partir
     de um estado anterior ao meu fix de tipagem (`TS7006`) — reintroduzia o
     erro de `tsc`.
   - **Ausentes** no zip (presentes na base validada): a correção de
     `client/src/pages/colaborador/Empresas.tsx` (`salvarSocio` roteando para
     `POST` quando o sócio é inferido), a guarda de UUID em
     `server/routes/socios_documentos.ts`, e o teste de regressão
     `tests/sociosEmpresaAtualizar.test.ts`.
3. Construído `/tmp/destrava/merged` = base validada (`current74`) +
   sobreposição dos 6 arquivos legítimos do `def_correcao` + reaplicação
   manual do bump de versão em `documentacao.ts`. Isso preserva a correção do
   bug do sócio **e** incorpora as melhorias reais do parser de QSA/Cartão
   CNPJ.
4. `npm install` — ok.
5. `npx tsc --noEmit` — reencontrado o mesmo erro de tipagem `TS7006` em
   `analiseDocumentalEspecializada.ts:370` (o overwrite do arquivo trouxe de
   volta a versão sem anotação de tipo). Reaplicada a mesma correção:
   `sociosDocumento.some((socio: ReturnType<typeof socioNormalizado>) => ...)`.
6. `npx vitest run` — 2 falhas na primeira rodada:
   - `tests/documentacaoAnaliseEspecializada.integration.test.ts` — fixture
     desatualizada (ainda esperava `prompt_versao: '5.0.0'`, mas o próprio
     bump do pacote para `5.1.0` mudou a versão vigente). Corrigido ajustando
     a fixture para `'5.1.0'`.
   - `tests/extracaoDocumentalLocal.test.ts` — **bug real, não de fixture**:
     ver seção abaixo.
7. Após o fix do parser: `npx tsc --noEmit` limpo, `npx vitest run` → **37
   arquivos, 502/502 testes passando**, `npm run build` → build de produção
   concluído dentro do orçamento de bundle.

## Bug novo encontrado e corrigido: duplicação de sócio no parser vertical

**Sintoma**: para um QSA em formato vertical —

```
NOME/NOME EMPRESARIAL
JONNATHAS RODRIGUES PIRES
QUALIFICAÇÃO DO SÓCIO
Sócio-Administrador
```

— `parseQsa()` retornava 2 sócios em vez de 1.

**Causa raiz**: o parser tem 4 estratégias de reconhecimento que rodam em
sequência e todas alimentam a mesma lista via um helper de deduplicação por
nome normalizado (`adicionarSocio`). A primeira estratégia ("layout vertical
oficial") já reconhece corretamente o par nome/qualificação acima e adiciona
"JONNATHAS RODRIGUES PIRES". A quarta estratégia ("fallback estrutural") varre
o documento inteiro procurando qualquer linha que pareça uma qualificação
societária (ex.: "Sócio-Administrador") e, quando encontra, olha até 3 linhas
acima em busca do nome correspondente — pensada para OCR que perde toda a
estrutura de colunas.

O problema: o rótulo da linha imediatamente anterior à qualificação é a
própria linha "QUALIFICAÇÃO DO SÓCIO" (o cabeçalho do campo, sem valor
colado). A função que decide "isso parece um nome de sócio?"
(`pareceNomeSocio`) tinha uma lista de rótulos conhecidos para rejeitar
(`pareceRotulo`), mas essa lista só reconhecia a palavra isolada
"qualificação" (ou "qualificação:") — não a variante oficial do campo,
"qualificação do sócio", que é como o campo aparece de fato nos documentos.
Por isso a linha "QUALIFICAÇÃO DO SÓCIO" passava despercebida pelo filtro,
era aceita como um "nome" plausível, e o fallback parava aí (usa a primeira
linha válida encontrada, não continua procurando) — nunca chegava à linha
correta ("JONNATHAS RODRIGUES PIRES", 2 linhas acima). Resultado: um sócio
fantasma com nome "QUALIFICAÇÃO DO SÓCIO" era adicionado à lista, ao lado do
sócio real já adicionado pela primeira estratégia — e como os nomes são
diferentes, a deduplicação por nome normalizado não os unificava.

**Correção aplicada** (`server/services/extracaoDocumentalLocal.ts`):
adicionado `'qualificacao do socio'` à lista de rótulos conhecidos usada por
`pareceRotulo()`. Com isso, a linha "QUALIFICAÇÃO DO SÓCIO" é corretamente
reconhecida como rótulo (não como nome) em qualquer um dos pontos do parser
que usam esse filtro, e o fallback estrutural passa a continuar a busca até a
linha correta.

```diff
- 'capital social', 'nome nome empresarial', 'qualificacao', 'cnpj', 'nire',
+ 'capital social', 'nome nome empresarial', 'qualificacao', 'qualificacao do socio', 'cnpj', 'nire',
```

Mudança de uma linha, sem efeito colateral nos outros formatos de QSA
testados (layout horizontal com cabeçalho combinado, nome/qualificação em
linhas separadas após cabeçalho horizontal, formato compacto) — todos
continuam passando, verificado rodando a suíte completa do arquivo antes e
depois da mudança.

Nenhuma relação com dados pessoais/Fase 1: é um bug de parsing de texto,
isolado ao reconhecimento de nome de sócio dentro de `parseQsa()`.

## Arquivos alterados nesta auditoria (sobre o merge com def_correcao)

- `server/services/extracaoDocumentalLocal.ts` — fix da duplicação de sócio
  (1 linha).
- `server/services/analiseDocumentalEspecializada.ts` — reaplicação da
  correção de tipo `TS7006` (mesma do pacote anterior, perdida no overwrite).
- `tests/documentacaoAnaliseEspecializada.integration.test.ts` — fixture
  `prompt_versao` atualizada para `'5.1.0'`.
- `server/routes/documentacao.ts` — bump de versão `qsa_extract` para
  `'5.1.0'` (reaplicado manualmente a partir do changelog do pacote, já que
  o merge manteve a base anterior para preservar a correção do sócio).

Arquivos do `def_correcao` incorporados sem alteração adicional:
`server/services/analiseCnpjReceitaCartao.ts`, `server/utils/helpers.ts`,
`tests/extracaoDocumentalLocal.test.ts`.

Preservado integralmente da correção anterior (não presente no zip
auditado, mas necessário para não regredir):
`client/src/pages/colaborador/Empresas.tsx`,
`server/routes/socios_documentos.ts`,
`tests/sociosEmpresaAtualizar.test.ts`.

## Validação final

```
npx tsc --noEmit    → limpo (0 erros)
npx vitest run      → 37 arquivos, 502/502 testes passando
npm run build       → build de produção concluído, dentro do orçamento de bundle
                       (JS inicial 99.2 kB gzip / limite 130 kB;
                        CSS inicial 33.3 kB gzip / limite 45 kB)
```

## Recomendação

Publicar o conteúdo de `/tmp/destrava/merged` (entregue em anexo), não o zip
`DESTRAVA_MAIN_73_CORRECAO_DEFINITIVA_QSA_CARTAO_FASE1.zip` original — este
último, se aplicado como veio, reintroduziria o bug "Erro ao atualizar
sócio" e entregaria um parser de QSA que duplica sócios no formato vertical
mais comum de documento.
