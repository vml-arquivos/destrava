# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta -- a correção só remove código, não usa nenhuma dependência nova).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado após a alteração e uma última vez no final (remove o estado `mostrarComplementares` e as variáveis `temObrigatorios`/`liberarComplementares`/`ocultos` em `client/src/components/documentos/DocumentosEntidade.tsx`, sem deixar nenhuma referência órfã).

## 3. Suíte de testes
`npx vitest run` -- 99 arquivos / 876 testes, todos passando, sem nenhuma alteração de expectativa em relação à Rodada 24 (esta rodada é só de frontend, remoção de uma filtragem de exibição, sem nenhuma lógica nova de negócio/validação para testar isoladamente). Ver `TEST_REPORT.md` para o detalhe da verificação manual feita em substituição a um teste automatizado (o projeto não tem infraestrutura de teste de componente React).

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Nesta rodada só um arquivo de FRONTEND foi alterado (`client/src/components/documentos/DocumentosEntidade.tsx`) -- nenhum arquivo de backend foi tocado.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; nenhum código de servidor foi alterado nesta rodada).
- Chunk `DocumentosEntidade`: 150.42 kB → 149.82 kB gzip (35.55 kB → 35.36 kB) -- ENCOLHEU: mais código foi removido (filtragem/estado/botão) do que comentário foi acrescentado.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Todos os campos do checklist de documentos ficam sempre visíveis, para qualquer empresa/regime/porte -- sem exceção e sem precisar de nenhum clique para revelá-los.** A partir do próximo deploy, o botão "Ver documentos complementares"/"Mostrar só os obrigatórios" deixa de existir, e a grade inteira de campos de cada seção (Identidade do CNPJ, Documentação da Empresa, etc.) aparece completa desde a primeira carga da tela, em qualquer empresa, independentemente do regime tributário ou de os Atos da Junta já terem sido aprovados/dispensados. O que continua colapsável é só o bloco de resultado da leitura DENTRO de cada card já anexado ("Dados da análise") -- o card de anexo em si nunca mais se esconde.

**Sem impacto em qual conjunto de campos existe por regime.** Esta rodada não muda quais tipos de documento aparecem no checklist de uma empresa (isso continua vindo do mapa documental por regime, já existente) -- só faz TODOS os campos que já fariam parte daquele checklist aparecerem de uma vez, sem uma segunda camada de ocultação por cima.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, nenhum endpoint novo nesta rodada -- a correção só remove uma camada de filtragem de exibição no frontend. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
