# Entrega — Relatórios Inteligentes do Acompanhamento Bancário

## Resumo

Foi implementada a melhoria do relatório do Acompanhamento Bancário para deixar de ser apenas um botão fixo de **Relatório mensal PDF** e passar a funcionar como um **Gerador de Relatórios Bancários Inteligentes**, com seleção de período, formatos de saída e análise consultiva.

A lógica financeira já existente do acompanhamento bancário foi preservada. A entrega apenas amplia a forma de gerar, visualizar e baixar relatórios usando os dados já registrados: acompanhamento, semanas, alertas, documentos e inteligência consultiva.

## Principais melhorias

- Botão visual alterado para **Gerar relatório**.
- Novo modal de configuração do relatório.
- Escolha do tipo de relatório:
  - Mensal;
  - Período personalizado;
  - Completo do acompanhamento;
  - Executivo mensal.
- Escolha de formato:
  - PDF;
  - Visualização HTML;
  - XLS;
  - JSON técnico.
- Opções para incluir:
  - relatório detalhado;
  - análise IA/parecer técnico;
  - documentos/anexos considerados.
- Relatório PDF mais completo, em formato paisagem, com melhor aproveitamento de espaço.
- Histórico semanal detalhado com entradas separadas por origem, saídas, saldo, rating, status, diagnóstico, orientação e próxima ação.
- Resumo executivo inteligente.
- Base de cálculo do acompanhamento.
- Leitura operacional do período.
- Assessoria Inteligente de Crédito integrada ao relatório.
- Alertas operacionais.
- Documentos e anexos considerados.
- Parecer técnico final.
- Orientação para o cliente.

## Rotas atualizadas

- `POST /api/acompanhamentos-bancarios/:id/relatorio`
- `POST /api/acompanhamentos-bancarios/:id/relatorio-mensal`

A rota antiga foi preservada, mas agora usa o mesmo gerador inteligente.

## Arquivos alterados

- `server/index.ts`
- `client/src/pages/colaborador/AcompanhamentoBancario.tsx`

## Zero regressão

- Nenhuma migration criada.
- Nenhuma tabela alterada.
- Nenhuma rota antiga removida.
- Nenhum acompanhamento apagado.
- Nenhuma semana apagada.
- Nenhum documento apagado, movido ou regravado.
- Relatório mensal antigo continua compatível pela rota `/relatorio-mensal`.
- Exportar XLS existente foi preservado.
- A lógica financeira existente foi preservada.

## Observação de validação

A instalação completa das dependências no sandbox não concluiu dentro do tempo disponível. Portanto, `npm run check`, `npm run build` e `npm test` devem ser reexecutados no ambiente local/CI/Coolify antes do deploy final.

## Checklist pós-deploy

1. Abrir Financeiro > Acompanhamento Bancário.
2. Abrir detalhes de um acompanhamento.
3. Clicar em **Gerar relatório**.
4. Gerar relatório mensal em PDF.
5. Gerar relatório por período personalizado.
6. Visualizar relatório em HTML.
7. Baixar XLS.
8. Validar que semanas, alertas, parecer técnico e documentos aparecem corretamente.
9. Validar relatório sem semanas no período selecionado, que deve exibir aviso claro e não quebrar.
