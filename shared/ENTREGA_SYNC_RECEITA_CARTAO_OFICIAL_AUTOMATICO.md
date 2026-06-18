# Entrega — Sincronização automática Receita com Cartão CNPJ oficial como fonte prioritária

## Causa raiz encontrada
A BrasilAPI retornou dados antigos para o CNPJ 45.771.261/0001-43: SAO PAULO/SP, CEP 02710001 e CNAE 7319002. O Cartão CNPJ oficial anexado, emitido na Receita, mostra BRASILIA/DF, CEP 72.427-000 e CNAE 45.20-0-01.

Portanto, o problema não era apenas botão/frontend: uma fonte gratuita estava defasada/cacheada e o backend aceitava essa fonte como verdade final.

## Correção aplicada
- A rota `POST /api/empresas/:id/sincronizar-receita` agora consulta múltiplas fontes gratuitas:
  - BrasilAPI
  - OpenCNPJ
  - CNPJá Open
- Quando existir Cartão CNPJ oficial anexado no acervo, o backend usa OCR/IA do documento como fonte prioritária.
- O Cartão CNPJ oficial anexado prevalece sobre APIs gratuitas cacheadas/desatualizadas.
- A rota arquiva automaticamente empresas duplicadas com o mesmo CNPJ antes de reativar/salvar a empresa selecionada, evitando erro de índice único ativo.
- O salvamento agora aplica casts por tipo real de coluna (`jsonb`, `text[]`, `date`, `timestamp`, `boolean`), evitando erro 500 por tipo incompatível.
- O endpoint retorna `fonte_final`, `fontes_consulta` e `cartao_oficial_usado` para auditoria.
- A consulta `/api/cnpj/:cnpj` agora também consulta CNPJá Open e prioriza CNPJá/OpenCNPJ antes da BrasilAPI para reduzir defasagem.

## Arquivos alterados
- `server/index.ts`
- `server/routes/cnpj.ts`
- `server/services/analiseCnpjReceitaCartao.ts`

## Requisito operacional
Para usar o Cartão CNPJ como fonte automática prioritária, a empresa precisa ter o documento anexado como tipo `cartao_cnpj` e a variável Gemini/OCR já configurada:

```env
GEMINI_API_KEY=...
GEMINI_DOCUMENT_OCR_ENABLED=true
```

Se não houver Cartão CNPJ anexado ou OCR disponível, o sistema usa as APIs gratuitas e salva a melhor fonte disponível.

## Validação
- `npm run build`: OK
- `npx tsc --noEmit`: OK

## Commit sugerido
```bash
cd /opt/destrava
unzip -o hotfix_sync_receita_cartao_oficial_automatico.zip

git add server/index.ts \
  server/routes/cnpj.ts \
  server/services/analiseCnpjReceitaCartao.ts \
  ENTREGA_SYNC_RECEITA_CARTAO_OFICIAL_AUTOMATICO.md

git commit -m "Prioriza Cartao CNPJ oficial na sincronizacao Receita"

git push origin main
```
