# Checklist de homologação do relatório empresarial

## Estrutura e classificação

| Verificação | Resultado esperado |
|---|---|
| Empresa sem documentos | Módulos aparecem com estados vazios e sem confirmação inventada. |
| Quatro documentos iniciais | Aparecem exclusivamente no módulo 2. |
| Contrato social e alterações | Aparecem no módulo societário, com arquivos e datas próprios. |
| Consultas de crédito | Aparecem em `Consultas de crédito`. |
| Consultas fiscais | Aparecem em `Consultas fiscais e cadastrais`. |
| Dois ou mais sócios | Aparecem no módulo 5, sem mistura com documentos institucionais. |
| Contrato de assessoria | Omitido no institucional e visível somente na ficha interna autorizada. |
| Versão histórica excluída | Não aparece como documento ativo nem gera revisão duplicada. |

## Datas e estados

| Verificação | Resultado esperado |
|---|---|
| Datas diferentes | Documento, emissão, expedição, anexação, leitura, verificação e validade não são colapsadas. |
| Data ausente | Exibe `Não informado`. |
| Documento vencido | Mantém o estado e registra pendência/validade, sem trocar o tipo documental. |
| Consulta atualizada | O snapshot anterior permanece acessível no histórico. |
| Incompatibilidade | Só aparece com evidência explícita de incompatibilidade. |
| Arquivo não lido | Não é promovido a confirmado. |

## Segurança

| Verificação | Resultado esperado |
|---|---|
| Empresa A acessando Empresa B | Retorno `403` ou `404`, sem dados da outra empresa. |
| Usuário sem vínculo | Acesso negado ao dossiê e às exportações. |
| Modo interno sem gestão | Retorno `403`. |
| Modo institucional | Não contém contrato de assessoria nem documentos internos. |
| URL ou ID adulterado | Não permite leitura ou download de arquivo sem autorização. |

## PDF e interface

| Verificação | Resultado esperado |
|---|---|
| Ordem | Identificação, iniciais, societário, consultas, sócios, ficha e resumo. |
| Índice | Todos os sete módulos têm entrada e âncora correspondente. |
| Paginação | Cabeçalho/rodapé e conteúdo não são cortados. |
| Desktop e mobile | Índice, cards e tabelas permanecem legíveis e navegáveis. |
| Estado vazio/erro | A interface informa ausência ou falha sem criar confirmação. |

## Comandos de validação

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm migrate:verify
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

No checkout atual, os equivalentes efetivamente usados são `pnpm exec tsc --noEmit`, `pnpm exec vitest run` e `pnpm run build`. A validação de produção também deve conferir `/version`, `/api/health`, o status do deployment e uma exportação autenticada do PDF.

## Referências

[1]: ../../tests/relatorioModularHtml.test.ts "Regressões do relatório modular"
[2]: ../../server/routes/documentacao.ts "Rotas protegidas e exportação"
[3]: ../../client/src/components/documentos/DocumentosEntidade.tsx "Modal e organização visual do acervo"
