# Entrega — IA CNPJ Receita + Cartão CNPJ Fase 1

## Objetivo
Iniciar a IA documental pelo documento mais importante: CNPJ.

A análise usa duas fontes:

1. **Receita Federal sincronizada**: fonte estruturada principal.
2. **Cartão CNPJ anexado**: documento comprobatório para conferência, validade e divergência.

## Arquivos alterados/criados

- `db/migrations/062_analise_cnpj_receita_cartao.sql`
- `server/services/analiseCnpjReceitaCartao.ts`
- `server/routes/documentacao.ts`
- `client/src/components/documentacao/DossieCreditoEmpresa.tsx`

## Rotas novas

- `GET /api/documentacao/empresa/:empresaId/analise-cnpj`
- `POST /api/documentacao/empresa/:empresaId/analise-cnpj`

## O que a análise faz agora

- Analisa o CNPJ já sincronizado pela Receita Federal.
- Identifica matriz ou filial pelo CNPJ/cadastro.
- Calcula tempo de abertura.
- Gera alerta para empresa com menos de 12 meses.
- Gera ponto positivo para empresa com mais de 36 meses.
- Analisa situação cadastral.
- Avalia CNAE, natureza jurídica, porte e capital social.
- Verifica se existe Cartão CNPJ anexado.
- Se houver data de emissão do Cartão CNPJ, valida prazo de 30 dias.
- Se houver `GEMINI_API_KEY` ou `GOOGLE_API_KEY`, tenta ler o Cartão CNPJ por IA/OCR.
- Compara Receita x Cartão CNPJ nos campos principais.
- Gera score CNPJ, risco, diagnóstico, alertas e recomendações.
- Salva histórico na tabela `analises_cnpj_empresa`.

## Observação importante

Sem chave Gemini configurada, a análise já funciona usando os dados da Receita e o anexo do Cartão CNPJ, mas a leitura automática do conteúdo do PDF/imagem fica pendente de OCR/IA.

Variável opcional:

```env
GEMINI_API_KEY=SUA_CHAVE
GEMINI_MODEL=gemini-1.5-flash
```

## Validação

Executado com sucesso:

```bash
npx tsc --noEmit
npm run build
```

## Aplicação

Rode a migration antes do deploy do backend atualizado:

```bash
cd /opt/destrava

docker exec -i tr3go0jqyc5h3tuvz7f46zkc psql -U postgres -d postgres < db/migrations/062_analise_cnpj_receita_cartao.sql
```
