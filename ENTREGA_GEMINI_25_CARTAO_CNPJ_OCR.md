# Entrega — Gemini 2.5 OCR Cartão CNPJ

## Escopo
Hotfix para ativar a leitura real do Cartão CNPJ anexado usando Gemini 2.5 Flash com fallback Gemini 2.5 Pro.

## Alterações
- Padrão do OCR documental passa a ser `gemini-2.5-flash`.
- Fallback automático para `gemini-2.5-pro` quando a extração vier incompleta, sem data de emissão, sem CNPJ, sem data de abertura, sem situação cadastral ou com baixa confiança.
- Prompt reforçado para a IA não confundir `DATA DE ABERTURA` com a data de emissão do comprovante.
- Extração estruturada de:
  - CNPJ;
  - matriz/filial;
  - data de abertura;
  - nome empresarial;
  - nome fantasia;
  - CNAE principal;
  - natureza jurídica;
  - porte;
  - endereço;
  - situação cadastral;
  - data da situação cadastral;
  - data de emissão do comprovante;
  - modelo Gemini usado;
  - confiança da extração.
- Resolução mais robusta do caminho físico do arquivo anexado dentro do Docker.
- Suporte a PDF/imagem mesmo quando o MIME vier como `application/octet-stream`, usando extensão do arquivo.
- Tela Dossiê / Laudo IA passa a exibir `Emissão cartão` e `Validade cartão` nos campos rápidos da análise CNPJ.

## Variáveis esperadas
```env
GEMINI_API_KEY=SUA_CHAVE
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MODEL_FALLBACK=gemini-2.5-pro
GEMINI_DOCUMENT_OCR_ENABLED=true
GEMINI_TIMEOUT_MS=30000
```

## Arquivos alterados
- `server/services/analiseCnpjReceitaCartao.ts`
- `client/src/components/documentacao/DossieCreditoEmpresa.tsx`

## Banco de dados
Não precisa migration nova.

## Validação
- `npx tsc --noEmit`: OK
- `npm run build`: OK
