# Análise e ajuste — APIs de CNPJ unificadas

## Situação anterior

A rota `/api/cnpj/:cnpj` usava somente a BrasilAPI:

```ts
https://brasilapi.com.br/api/cnpj/v1/:cnpj
```

Isso deixava o sistema dependente de uma única fonte para razão social, capital social, CNAEs e QSA/sócios.

## Ajuste aplicado

A rota continua respondendo no formato compatível com BrasilAPI para não quebrar o frontend, mas agora consulta e unifica múltiplas fontes:

1. BrasilAPI — compatibilidade e fallback.
2. CNPJá Open — fonte pública com dados de Receita, Simples, inscrições estaduais e SUFRAMA quando disponíveis.
3. OpenCNPJ — fallback configurável para testes de enriquecimento.

Endpoint interno mantido:

```txt
GET /api/cnpj/:cnpj
```

## Novos campos retornados

Além dos campos antigos, a resposta agora inclui:

```json
{
  "provedor_principal": "cnpja_open",
  "fontes_consulta": [],
  "dados_fontes": {
    "brasilapi": {},
    "cnpja_open": {},
    "opencnpj": {}
  },
  "inscricoes_estaduais": [],
  "suframa": []
}
```

## Correção de capital social

Foi incluída normalização robusta para aceitar:

- `50000.00`
- `50.000,00`
- `R$ 50.000,00`
- `50000`

Sem transformar `50000.00` em `5.000.000,00`.

## Salvamento no cadastro da empresa

O frontend agora envia para `dados_extra_receita`:

- fonte principal usada;
- status de cada fonte;
- payload bruto de cada API;
- payload normalizado;
- inscrições estaduais;
- SUFRAMA;
- dados completos para auditoria e expansão futura.

## Variáveis opcionais

```env
CNPJ_ENABLE_OPEN_CNPJA=true
CNPJ_ENABLE_OPENCNPJ=true
OPENCNPJ_BASE_URL=https://opencnpj.org
CNPJ_API_TIMEOUT_MS=8000
```

Para desativar uma fonte sem alterar código:

```env
CNPJ_ENABLE_OPEN_CNPJA=false
CNPJ_ENABLE_OPENCNPJ=false
```

## Arquivos alterados

- `server/routes/cnpj.ts`
- `client/src/utils/cnpj.ts`
- `client/src/pages/colaborador/Empresas.tsx`
