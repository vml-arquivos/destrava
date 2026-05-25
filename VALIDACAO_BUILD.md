# Validação técnica da entrega

Data: 2026-05-25

Alterações principais:
- Reorganização visual da página `Empresas` como Company Hub compacto.
- Reorganização da página `Clientes PF` como Central de Clientes PF com origem, status operacional, próxima ação e painel de detalhe.
- Backend de `clientes_pf` atualizado para aceitar campos opcionais de origem/campanha/próxima ação sem quebrar bancos antigos.
- Nova migration `036_crm_clientes_origem_layout.sql` com campos opcionais e índices para origem/status/próxima ação.

Comandos executados:

```bash
npm run check
npm run build
```

Resultado:

```text
npm run check ✅ passou
npm run build ✅ passou
vite build ✅ passou
esbuild server/index.ts ✅ passou
```

Observação:
- `npm install` foi usado apenas no ambiente de validação local para restaurar dependências ausentes no sandbox.
- `node_modules` e `dist` não foram incluídos no ZIP final do repositório, seguindo prática normal de deploy por fonte.
