# Entrega — Relatório Bancário A4 Timbrado e Premium

## Resumo

Aplicada melhoria no gerador de relatório inteligente de Acompanhamento Bancário para deixar o documento adequado para impressão em A4, com papel timbrado, logo selecionável, assinatura institucional e estrutura mais legível para prestação de serviço.

## Principais ajustes

- Relatório PDF agora é gerado em A4 retrato, mais adequado para impressão e envio formal.
- Adicionada geração com papel timbrado usando o mesmo mecanismo dos documentos institucionais.
- Adicionado suporte para escolha da marca/logo no modal do relatório.
- Mantidas opções de Destrava Crédito e PermuPay.
- Incluída identificação do relatório como documento de prestação de serviço.
- Mantidas assinaturas no fechamento do relatório.
- Ajustadas assinaturas para padrão mais formal: prestadora/responsável técnico e cliente/contratante.
- Adicionada seção de cálculo de aderência e ajuste necessário.
- Incluídos cálculos de referência semanal, teto semanal, média mensal, margem mensal e necessidade de correção de saldo.
- Reorganizada a tabela de movimentação semanal para não comprimir texto longo.
- Diagnóstico e orientação por semana agora são exibidos em cards, evitando cortes e colunas excessivamente estreitas.
- Preservada a lógica financeira atual do acompanhamento bancário.
- Preservados relatórios PDF, HTML, XLS e JSON.

## Arquivos alterados

- `server/index.ts`
- `client/src/pages/colaborador/AcompanhamentoBancario.tsx`

## Garantias

- Nenhuma migration criada.
- Nenhuma rota antiga removida.
- Nenhum acompanhamento apagado.
- Nenhuma semana apagada.
- Nenhum documento apagado ou movido.
- Nenhuma alteração destrutiva no banco.
- Nenhuma alteração destrutiva no storage.
- Lógica financeira semanal/mensal preservada.

## Validações executadas

- `pnpm run check`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run build`
- `pnpm test -- --run`

## Resultado

- TypeScript aprovado.
- Build aprovado.
- 376 testes aprovados.
- Sem regressões detectadas nas validações executadas.
