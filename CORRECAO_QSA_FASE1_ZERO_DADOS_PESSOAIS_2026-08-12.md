# Correção QSA — Fase 1 sem dados pessoais — 12/08/2026

## Causa raiz

A regressão tinha dois efeitos combinados:

1. O parser local do QSA não reconhecia de forma confiável o layout horizontal oficial da Receita Federal (`NOME/NOME EMPRESARIAL` + `QUALIFICAÇÃO` na mesma grade). Quando isso ocorria, a lista de sócios ficava vazia.
2. Mesmo com a lista vazia por falha de extração, a validação percorria todos os sócios sincronizados e criava uma divergência individual falsa para cada nome (`consta no cadastro sincronizado, mas não aparece no QSA analisado`).

## Regra restabelecida

A Fase 1 do QSA confere exclusivamente:

- CNPJ;
- razão social;
- capital social;
- nomes dos sócios;
- identificação do Sócio-Administrador.

CPF, RG, endereço, estado civil, cônjuge, profissão, telefone, e-mail e documentos pessoais dos sócios não são requisitos da Fase 1 e não podem bloquear o avanço.

## Proteções adicionadas

- Parser do layout horizontal oficial do QSA.
- Ausência total de sócios extraídos gera erro de leitura único, sem falsas divergências por pessoa.
- Qualificação genérica não é requisito isolado; serve apenas como evidência interna para identificar a condição de administrador e não é exibida como exigência da Etapa 1.
- Whitelist explícita de códigos QSA autorizados a bloquear a Fase 1, impedindo que pendências pessoais regressem para o gate.
- Versão do processamento QSA elevada para `5.0.0`; laudos QSA persistidos por regras anteriores deixam de ser reutilizados, evitando que alertas antigos continuem aparecendo após o deploy.
- Confiança estatística baixa não cria trava isolada quando todos os campos institucionais obrigatórios foram extraídos e conferem.
- Testes de regressão para o caso PALUMA BURGER / JONNATHAS RODRIGUES PIRES e para ausência de dados pessoais.

## Interface da Etapa 1

O QSA da primeira análise apresenta somente CNPJ, razão social, capital social, nome do sócio e o indicador de Sócio-Administrador. Qualificação textual permanece apenas como apoio interno para reconhecer o administrador. Campos pessoais continuam preservados nos módulos próprios e nas etapas posteriores, mas não aparecem como pendência, requisito ou trava do relatório inicial.

## Validação executada neste pacote

- Parser real executado contra o layout horizontal do QSA: CNPJ, razão social, capital social, JONNATHAS RODRIGUES PIRES e `49-Sócio-Administrador` extraídos corretamente; confiança = 1.
- Validador real executado com dados pessoais presentes no cadastro, mas ausentes no QSA: zero alertas quando os cinco dados institucionais convergem.
- Falha total de extração de sócios gera apenas a falha de leitura (`qsa_socios_nao_extraidos`/`qsa_extracao_inconclusiva`) e não cria o falso `qsa_socio_receita_ausente_documento` por pessoa.
- Divergência real de nome continua bloqueando.
- Divergência real de Sócio-Administrador continua bloqueando.
- Sintaxe TypeScript/TSX dos nove arquivos de código/teste alterados verificada pelo compilador TypeScript.
- A suíte completa `npm ci`/Vitest não pôde ser executada neste ambiente isolado porque uma dependência (`zwitch-2.0.4`) não está no cache local e o sandbox não possui acesso ao registry npm. Nenhuma dependência foi adicionada ou alterada pela correção.

## Arquivos alterados

- `server/services/extracaoDocumentalLocal.ts`
- `server/services/analiseDocumentalEspecializada.ts`
- `server/routes/documentacao.ts`
- `server/services/mapaDocumentalCreditoService.ts`
- `client/src/components/documentacao/DossieCreditoEmpresa.tsx`
- `client/src/components/documentos/DocumentosEntidade.tsx`
- `client/src/pages/colaborador/Empresas.tsx`
- `tests/extracaoDocumentalLocal.test.ts`
- `tests/analiseDocumentalEspecializada.test.ts`

Nenhuma migration, tabela, rota pública, regra da Fase 2/3, integração Nexus ou fluxo de contratos foi removido ou alterado.
