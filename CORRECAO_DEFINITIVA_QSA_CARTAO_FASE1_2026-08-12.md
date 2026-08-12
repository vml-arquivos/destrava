# Correção definitiva — Etapa 1 / QSA / Cartão CNPJ

Data: 12/08/2026
Base: `destrava-main (73)` já integrada com as correções anteriores da Fase 1.

## Problema reproduzido pelo print

A tela mantinha a Etapa 1 bloqueada por dois falsos positivos:

1. O QSA era lido com CNPJ, razão social e capital social, mas o parser retornava `socios: []`, exibindo `Sócios 0` e as mensagens "Não foi possível identificar os nomes dos sócios no QSA" e "leitura inconclusiva".
2. O Cartão CNPJ tinha o endereço contaminado por cabeçalhos do próprio PDF/OCR, por exemplo `NÚMERO COMPLEMENTO ... CNPJ ... COMPROVANTE ... BAIRRO/DISTRITO MUNICÍPIO UF`, e esse texto era tratado como se fosse um endereço real divergente.

## Causa raiz do QSA

O leitor local normalizava todas as linhas antes da leitura societária, compactando múltiplos espaços. Isso eliminava a estrutura de colunas criada por `pdftotext -layout`. Além disso, alguns PDFs oficiais devolvem:

- cabeçalho `NOME/NOME EMPRESARIAL | QUALIFICAÇÃO`;
- nome do sócio em uma linha;
- `49-Sócio-Administrador` na linha seguinte.

Essa terceira variação não era reconhecida. O resultado era um falso `Sócios 0` mesmo com o nome visível no documento.

## Correção aplicada ao QSA

- O parser QSA agora preserva uma cópia das linhas com o layout original.
- Reconhece tabela com colunas separadas por espaços/tabs.
- Reconhece nome e qualificação colapsados na mesma linha.
- Reconhece nome em uma linha e qualificação na linha seguinte.
- Reconhece formato vertical com rótulos separados.
- Reconhece formato compacto `Nome/Nome Empresarial: ... Qualificação: ...`.
- Possui fallback estrutural para OCR que perdeu as colunas.
- Possui fallback adicional seguro: se a estrutura se perder, um nome já sincronizado só é confirmado quando o nome completo aparece literalmente no texto extraído do próprio QSA. A condição de administrador só é confirmada por evidência textual próxima no próprio documento.
- Nenhum CPF, RG, endereço, estado civil, cônjuge, profissão, telefone, e-mail ou documento pessoal é consultado, exigido ou inferido para decidir a Etapa 1.
- A versão do motor QSA foi alterada de `5.0.0` para `5.1.0`, invalidando somente o laudo QSA antigo e obrigando novo processamento seguro.

## Regra fechada da Etapa 1

O QSA confere somente:

- CNPJ;
- razão social;
- capital social;
- nomes dos sócios;
- identificação de quem é Sócio-Administrador.

Dados pessoais dos sócios pertencem às etapas posteriores e não podem bloquear esta etapa.

## Correção aplicada ao Cartão CNPJ

O comparador de endereço agora identifica quando o texto do suposto endereço contém cabeçalhos/metadados do Cartão CNPJ ou um CNPJ completo. Nessa situação o resultado é classificado como falha de extração do campo, e não como divergência cadastral.

Também foi adicionada sanitização de laudos CNPJ já persistidos: ao carregar um laudo antigo, a comparação do endereço é recalculada pela regra nova. Se a antiga divergência era apenas contaminação de OCR, o alerta é removido em memória imediatamente, sem apagar histórico e sem migration. Novas análises passam a ser gravadas já com o comportamento corrigido.

## Arquivos alterados nesta correção

- `server/services/extracaoDocumentalLocal.ts`
- `server/services/analiseDocumentalEspecializada.ts`
- `server/services/analiseCnpjReceitaCartao.ts`
- `server/utils/helpers.ts`
- `server/routes/documentacao.ts`
- `tests/extracaoDocumentalLocal.test.ts`

## Validações executadas

1. Transpilação/sintaxe TypeScript dos seis arquivos alterados e do teste: OK.
2. QSA no layout horizontal com duas colunas: extraiu `JONNATHAS RODRIGUES PIRES` como `49-Sócio-Administrador`: OK.
3. QSA com nome e qualificação em linhas separadas: extraiu o mesmo sócio e administrador: OK.
4. QSA em formato compacto com rótulos: OK.
5. QSA com dois sócios, um `22-Sócio` e um `49-Sócio-Administrador`: extraiu os dois sem duplicação: OK.
6. Endereço contaminado exatamente no padrão mostrado no print (`NÚMERO COMPLEMENTO`, CNPJ, `COMPROVANTE`, `BAIRRO/DISTRITO MUNICÍPIO UF`): classificado como `nao_extraido`, `divergente=false`: OK.

A suíte completa com instalação de dependências não pôde ser executada neste ambiente isolado. Nenhuma dependência do projeto foi alterada.

## Comportamento esperado após deploy

Ao abrir a empresa, a divergência falsa de endereço persistida deixa de bloquear pela nova sanitização. Para o QSA, execute uma vez a análise inicial/reprocessamento: a versão `5.1.0` não reutiliza o resultado `5.0.0`. Se o documento contém CNPJ, razão social, capital social, `JONNATHAS RODRIGUES PIRES` e `49-Sócio-Administrador`, o QSA deve ficar consistente e a Etapa 1 não pode solicitar nem aguardar dados pessoais do sócio.
