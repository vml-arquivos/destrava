# Recuperação da validação documental — 05/09/2026

## Base e segurança operacional

- Repositório oficial: `vml-arquivos/destrava`.
- Branch local: `fix/validacao-documental-recuperacao-estavel`.
- Base: `d20da8138178058129614b18bb3d39886e93e668` (`main`).
- Referência estável auditada: pai `2a4e32fbfcdb8c5c4f297dfde8ea32d01726634a` e PRs 28–31.
- O ZIP antigo foi usado apenas para comparação funcional/visual.
- Nenhum banco, migration, segredo, GitHub remoto ou ambiente de produção foi alterado.
- `MIGRATE_ON_STARTUP=false` permanece como configuração segura.

## Correções funcionais

### QSA por natureza jurídica

- O QSA voltou a validar somente o seu propósito: vínculo com o CNPJ, integrantes e administrador/titular.
- Razão social e capital, quando presentes, continuam extraídos internamente, mas não bloqueiam o QSA.
- MEI e Empresário Individual não recebem sócio fictício derivado da razão social ou do nome fantasia.
- A resposta oficial de que a natureza jurídica não admite preenchimento do QSA é aceita para MEI/EI.
- LTDA e demais sociedades aplicáveis continuam exigindo integrantes e administrador reais.
- Quando a base sincronizada ainda está vazia, o próprio QSA legível pode ser a evidência primária; o sistema não inventa divergência com uma lista inexistente.

### CCMEI no enquadramento

- O CCMEI é reconhecido internamente como prova da condição de MEI/SIMEI.
- Não é obrigatório o certificado repetir a frase exata “Optante pelo SIMEI”.
- CNPJ e conteúdo real continuam sendo conferidos; o slot de upload não prova identidade.

### Inteligência documental interna

- Os 141 tipos catalogados (95 tipos canônicos e aliases legados) possuem ficha de leitura interna explícita.
- Cada ficha define campos essenciais, campos condicionais e política temporal.
- O extrator genérico recebe o tipo esperado somente para escolher quais rótulos procurar.
- A identidade é decidida separadamente pelo conteúdo do arquivo.
- Foram ampliados os rótulos internos de contratos, registros, pessoas, certidões, consultas, crédito, fiscal, contábil, financeiro e garantias.
- PDF textual é lido primeiro; PDFs escaneados e imagens usam OCR local; CSV, XLSX e DOCX usam extração estruturada local.
- IA externa continua opcional e desligada por padrão:

```dotenv
GEMINI_DOCUMENT_OCR_ENABLED=false
DOCUMENT_EXTERNAL_AI_FALLBACK_ENABLED=false
LOCAL_OCR_ENABLED=true
```

- Campo ausente, ilegível ou não comprovado nunca é inferido: o documento vai para revisão humana.
- O último laudo concluído permanece visível durante uma releitura e não é apagado se a nova tentativa falhar.

### Prazos e validade

- Datas futuras e certidões vencidas não satisfazem o requisito.
- Documentos mensais distinguem situação atual, apoio à janela móvel de 12 meses e histórico.
- ECF, ECD, DEFIS e DASN-SIMEI respeitam a data em que passam a ser exigíveis.
- Documentos sem vencimento formal não recebem validade legal inventada.
- Prazos de política de crédito permanecem identificados como prática de mercado, separados de lei/norma e validade informada pelo órgão.

### Interface

- A análise fica recolhida por padrão.
- Documento válido: `OK — validado`, `Dados da análise`, `Reler`.
- Incompatibilidade: resumo `Documento incompatível` e ação `Ver inconsistência`.
- Pendência: resumo `Revisão necessária` e ação `Ver pendência`.
- O conteúdo volta a recolher por `ocultar`.
- O Acervo mostra apenas dados essenciais; evidências e dados profundos permanecem no backend para cruzamentos e relatórios.

## Validação executada

- `corepack pnpm@10.4.1 install --frozen-lockfile`: aprovado.
- TypeScript (`tsc --noEmit`): aprovado.
- Vitest: **109 arquivos e 983 testes aprovados**.
- Build Vite de produção: aprovado.
- Pré-renderização: aprovada.
- Orçamento de bundles: aprovado.
- Backend `dist/index.js`: gerado e validado.
- Worker `dist/backfill-laudos.js`: gerado e validado.
- `git diff --check`: aprovado.

## Limite deliberado e seguro

“Leitura automática” significa tentar ler e validar automaticamente todo arquivo suportado; não significa aprovar sem evidência. Fotos operacionais e um documento arbitrário no campo “Outros” não podem ter seu significado comprovado apenas por OCR. Sem um modelo visual local validado, esses casos permanecem em revisão humana. Isso é comportamento fail-closed e evita falsa aprovação.

O mecanismo de evolução interna é controlado por fichas versionadas, classificadores determinísticos e casos dourados de teste. Novas amostras corrigem regras e aumentam o corpus de regressão; o sistema não se auto-treina silenciosamente em produção, porque isso tornaria os resultados não auditáveis.

## Antes de qualquer implantação

1. Confirmar por consulta somente leitura o commit/imagem realmente implantado.
2. Consultar o schema real e o histórico de migrations.
3. Testar em homologação com amostras reais de MEI, EI, LTDA e demais famílias documentais.
4. Somente após autorização expressa, avaliar migration em cópia do banco e executar `--dry-run`.
5. Implantar de forma controlada, validar saúde e fazer teste de navegação/upload.
6. Backfill somente depois da validação do schema, em lote e com monitoramento.

