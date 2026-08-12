# Correção — "Erro ao atualizar sócio" no modal Sócio/Representante — 12/08/2026

## Causa raiz (reproduzida e confirmada contra Postgres real)

Quando uma empresa ainda não tem nenhum sócio salvo em `socios_empresa`, a tela sintetiza
um card visual de "sócio-administrador inferido" a partir do cadastro da empresa
(`montarSocioAdministradorPadrao`, `client/src/pages/colaborador/Empresas.tsx`), com um
id fictício no formato `socio-admin-<empresaId>` — que nunca existe no banco.

O botão "Editar vínculo" da aba "Sócios / QSA" (linha ~677) abria o modal "Sócio /
Representante" para esse card sem checar se ele era real ou inferido. Ao clicar em
"Salvar sócio/representante", a tela disparava sempre um `PUT
/api/empresas/:id/socios/:sid` — inclusive com o id fictício.

No backend, esse id ia direto para `WHERE id = $sid` numa coluna `UUID`. O Postgres
rejeita a comparação com `invalid input syntax for type uuid` (código `22P02`), o handler
genérico de erro captura e devolve `{ error: 'Erro ao atualizar sócio' }` com status 500
— exatamente o texto e o comportamento do print enviado.

Reproduzido isoladamente contra uma instância Postgres real, com o schema exato criado
por `ensureSociosEmpresaSchema()`:
```
UPDATE ... WHERE id=$40 AND empresa_id=$41
-- id=$40 = 'socio-admin-74ab11d8-f53f-46b0-b4d7-48abef7c7ff6'
ERRO: invalid input syntax for type uuid: "socio-admin-74ab11d8-f53f-46b0-b4d7-48abef7c7ff6"
```

Isso não tem nenhuma relação com a regra de "zero dados pessoais na Fase 1" — é um bug de
CRUD: tentar fazer UPDATE de um registro que nunca foi criado, em vez de criá-lo.

## Correção aplicada

1. **`client/src/pages/colaborador/Empresas.tsx` — `salvarSocio()`**: agora detecta
   `socioEditando?.inferido_empresa === true` (flag que `montarSocioAdministradorPadrao`
   já define) e, nesse caso, faz `POST /api/empresas/:id/socios` (criação) em vez de
   `PUT .../socios/:sid`. Para sócios reais, o comportamento é idêntico ao anterior
   (`PUT`). Depois de salvar, a lista local é atualizada por merge OU inserção, conforme
   o caso.
2. **`server/routes/socios_documentos.ts` — `PUT /:id/socios/:sid`**: guarda defensiva
   adicional — se `:sid` não for um UUID válido, devolve `404
   { error: 'Sócio ainda não foi cadastrado nesta empresa...', code: 'SOCIO_NAO_CADASTRADO' }`
   em vez de deixar o erro cru do Postgres estourar como 500. Isso cobre qualquer outro
   ponto de entrada (atual ou futuro) que venha a chamar essa rota com um id inválido.

Nenhuma migração, rota pública, regra de Fase 1/2/3, integração Nexus ou fluxo de
contratos foi alterado. O caminho de edição de um sócio **real** (UUID válido) continua
byte a byte o mesmo.

## Débito de teste corrigido no mesmo pacote

Ao rodar a suíte completa (`npx vitest run`, 37 arquivos) para validar zero regressão,
apareceram 4 falhas pré-existentes, nenhuma causada por esta correção:

- `tests/inteligencia360Documental.test.ts` (3 testes) — a fixture `analiseCnpjOk` não
  incluía os campos `cartao_anexado`/`cartao_pendente_ocr`, que existem na tabela real
  `analises_cnpj_empresa` (migration 062) e são preenchidos pelo serviço real
  (`analiseCnpjReceitaCartao.ts`). Sem eles, `consolidarEtapaIdentidadeDocumental` nunca
  considerava o Cartão CNPJ consistente — a fixture ficou desatualizada em relação ao
  schema, não é um bug de produção. Corrigido preenchendo os dois campos na fixture. Um
  quarto teste no mesmo describe comparava a mensagem de bloqueio com o texto
  "ainda não foi analisado", que não existe na implementação atual (o texto real é
  "...está anexado, mas o processamento ainda não foi concluído."); ajustada a asserção
  para o texto real em vez de mudar a mensagem de produção.
- `tests/documentacaoAnaliseEspecializada.integration.test.ts` (1 teste) — esta fixture
  específica ficou desatualizada pela própria correção de QSA aplicada horas antes
  (elevação da versão do prompt QSA para `5.0.0`, ver
  `CORRECAO_QSA_FASE1_ZERO_DADOS_PESSOAIS_2026-08-12.md`): o registro de extração
  "pendente" mockado no teste não tinha `prompt_versao`, então o motor de dedup
  (corretamente) tratava como uma versão antiga e reprocessava, em vez de reconhecer que
  já havia uma execução em andamento na versão atual. Corrigido adicionando
  `prompt_versao: '5.0.0'` na fixture, preservando a intenção original do teste
  (não duplicar disparo de análise dentro da mesma versão).

## Validação executada

```
npx tsc --noEmit                 → limpo (0 erros)
npx vitest run                   → 37 arquivos, 500/500 testes passando
npm run build                    → build de produção concluído, dentro do orçamento de bundle
```

Reprodução isolada do bug original (script ad-hoc contra Postgres 16 local, mesmo schema
de `ensureSociosEmpresaSchema()`): confirma o erro antes da correção e a ausência dele
depois (via guarda no backend) e o fluxo correto fim a fim (via `POST` no frontend).

## Arquivos alterados

- `client/src/pages/colaborador/Empresas.tsx`
- `server/routes/socios_documentos.ts`
- `server/services/analiseDocumentalEspecializada.ts` (correção de tipo `TS7006`
  pré-existente, sem mudança de comportamento — bloqueava `tsc --noEmit`)
- `tests/inteligencia360Documental.test.ts`
- `tests/documentacaoAnaliseEspecializada.integration.test.ts`
- `tests/sociosEmpresaAtualizar.test.ts` (novo — regressão do bug corrigido)
