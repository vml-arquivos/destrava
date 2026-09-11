# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita; Rodada 27 — 02/09/2026: botão "Reler" manual em cada card da Etapa 1; Rodada 28 — 02/09/2026: grade de campos ilegível corrigida no Acervo Documental, botão "Reler" do Contrato Social confronta contra o Ato da Junta; Rodada 29 — 02/09/2026: auditoria própria de consistência entre tipos de empresa, três inconsistências corrigidas; Rodada 30 — 02/09/2026: cards do Acervo Documental nivelados quando fechados; Rodada 08/09/2026: identidade documental por evidência em Atos da Junta/Contrato Social, atualizada em 09/09/2026 com o terceiro documento real; Rodada 09/09/2026: laudo por documento vira ícone de hover; Rodada 09/09/2026 parte 2: PDF institucional e roteamento do Dossiê de Crédito; Rodada 09/09/2026 parte 3: cards do Acervo Documental recolhidos por padrão; Rodada 09/09/2026 parte 4: titular de Empresário Individual/MEI deixa de depender de QSA para liberar documentação pessoal; Rodada 09/09/2026 parte 5: reconciliação do titular ligada também na rota que a tela realmente usa, e nome extraído do nome empresarial do MEI quando não há cadastro estruturado; Rodada 09/09/2026 parte 6: causa raiz real encontrada e corrigida -- isEmpresaIndividual não reconhecia "Empresário (Individual)" com parênteses, o texto oficial real da Receita, confirmado com os 3 documentos reais da empresa; Rodada 09/09/2026 parte 7: MEI usa o CCMEI como equivalente do Contrato Social/Atos da Junta -- Etapa 2 só avança com o CCMEI de fato anexado; Rodada 09/09/2026 parte 8: CCMEI anexado no próprio campo "Contrato social" deixa de ser marcado como documento incompatível, e passa a valer como evidência; Rodada 09/09/2026 parte 9: corrigido o caminho de leitura do tipo detectado -- a etapa ainda pedia o CCMEI mesmo depois da parte 8; Rodada 09/09/2026 parte 10: três superfícies de texto (frontend e backend) que ainda diziam "Atos da Junta Comercial" para o MEI mesmo com o CCMEI já reconhecido pela parte 9 -- novo campo `empresa_identificada_mei` explícito; Rodada 10/09/2026 parte 11: campo "CCMEI" reordenado para aparecer logo após "Contrato social" para MEI -- estava 24 campos abaixo na lista, causando confusão real sobre onde anexar; Rodada 10/09/2026 parte 12: para MEI, "Atos da Junta Comercial"/"Contrato social" deixam de aparecer na grade (exceto com arquivo já anexado) e o CCMEI vira o primeiro campo, reversível por natureza; títulos dos cards de documento com mais contraste; Rodada 10/09/2026 parte 13: ECF/ECD/DEFIS/DASN-SIMEI respeitam o prazo legal de entrega antes de virarem pendência obrigatória; Rodada 10/09/2026 parte 14: causa raiz real de "o CCMEI nunca aparece na tela" -- faltava nas listas `tiposPermitidos` das duas telas de Acervo Documental de empresa; Rodada 11/09/2026 parte 15: CCMEI anexado ficava preso para sempre em "Revisão necessária" -- novo leitor local especializado; Rodada 11/09/2026 parte 16: um CCMEI de fato anexado passa a valer como evidência direta de MEI no banner de regime e no checklist; Rodada 11/09/2026 parte 17: documento de identificação do sócio, comprovante de endereço, Declaração de IRPF e Recibo de entrega do IRPF ganham leitores locais dedicados)

## Rodada 11/09/2026 parte 17 — Documento de identificação do sócio, comprovante de endereço, Declaração de IRPF e Recibo de entrega do IRPF ganham leitores locais dedicados

Base: mesma árvore da parte 16 (mesma entrega), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **130 arquivos / 1201 testes, todos passando** (1168 + 33 novos: 12 em `tests/documentoIdentidadeSocioLeituraLocal.test.ts`, 17 em `tests/declaracaoEReciboIrpfLeituraLocal.test.ts`, 4 em `tests/comprovanteResidenciaEnderecoCompleto.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.8 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 458.9 kB -- `node --check` OK em ambos.

### 4. O que mudou
Com 2 prints reais e 4 documentos reais do sócio de "PALUMA BURGER LTDA" (CNH, comprovante SPC/Serasa, Declaração de IRPF completa e Recibo de entrega), o usuário mostrou que "Documento de identificação do sócio" e "Comprovante de endereço do sócio" ficavam presos em "Revisão necessária", e "Declaração de Imposto de Renda (IRPF) do sócio"/"Recibo de entrega" ficavam marcados "Incompatível" -- para um sócio real, com documentos reais e legíveis. Nenhum dos quatro tipos tinha leitor local dedicado; todos caíam no `parseDocumentoGenerico`, e cada um falhava por um motivo próprio e sistemático (não específico desta empresa): rótulos oficiais de RG/CNH com prefixo numérico de campo nunca eram reconhecidos pelo helper de extração por rótulo, e a regra genérica de CPF capturava o primeiro número de 11 dígitos do texto -- numa CNH real, o Nº de Registro, não o CPF; o comprovante de endereço nunca extraía `endereco_completo`, campo obrigatório do perfil, para nenhuma empresa; a Declaração de IRPF confundia "Exercício" com "Ano-calendário" (sempre um ano de diferença) e capturava lixo de uma linha de tabela de rendimentos para `titular`; o Recibo de entrega nunca teve um tipo de classificação próprio no classificador central, caindo sempre no fallback genérico "IRPF" e ficando permanentemente marcado como tipo incompatível. Corrigido com três novos parsers dedicados (`parseDocumentoIdentidadeSocio`, `parseDeclaracaoIrpf`, `parseReciboIrpf`), um novo helper de extração (`linhaAposIndiceContendo`, para rótulos numerados de formulário oficial), a extração de `endereco_completo` adicionada ao parser já existente de comprovante de endereço, e uma nova regra de classificação `RECIBO_IRPF` no classificador central -- seguindo exatamente o padrão já estabelecido pelo `parseCcmei` da parte 15. Todos os quatro fixes foram verificados de ponta a ponta com o texto real dos documentos anexados, confirmando a transição de `status_documental` para `DADO_COMPROVADO` em cada caso.

**Nota para o usuário, fora do escopo de código desta rodada:** assim como observado na parte 15, as variáveis de ambiente `DOCUMENT_EXTERNAL_AI_FALLBACK_ENABLED` e `GEMINI_DOCUMENT_OCR_ENABLED` controlam o fallback de leitura por IA externa em produção -- não foi possível confirmar o valor real dessas variáveis a partir desta sessão. Com esta correção, os quatro tipos já devem validar corretamente mesmo com essas variáveis desligadas.

## Rodada 11/09/2026 parte 16 — Um CCMEI de fato anexado passa a valer como evidência direta de MEI no banner de regime e no checklist de documentos

Base: mesma árvore da parte 15 (mesma entrega), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **127 arquivos / 1168 testes, todos passando** (1162 + 6 novos em `tests/regimeCcmeiComoEvidencia.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.8 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

### 4. O que mudou
Print real mostrando o banner da tela com "regime Simples Nacional — optante" e "Faltam 7 documento(s)" para uma empresa MEI real, mesmo já com um CCMEI anexado -- porque nem `opcao_mei` nem o texto do enquadramento sincronizado da Receita mencionavam literalmente "MEI"/"SIMEI" (caso comum quando a sincronização automática de CNPJ ainda não capturou o enquadramento tributário completo). `identificarRegimeCredito` (`mapaDocumentalCreditoService.ts`) ganhou um terceiro parâmetro opcional, `evidenciaCcmeiAnexado`: quando `true`, o CCMEI de fato anexado (mesmo sinal booleano que `montarValidacaoSocietaria` já calcula para dispensar Atos da Junta/Contrato Social) passa a ser tratado como prova documental direta da condição de MEI. Deliberadamente diferente de inferir por natureza jurídica "Empresário Individual" -- removido de propósito na Rodada 29 (nem todo Empresário Individual é MEI, uma empresa pode desenquadrar e continuar com essa natureza jurídica) -- o CCMEI, ao contrário, É o próprio documento que comprova o enquadramento MEI, um sinal seguro. Um `opcao_mei: false` explícito da Receita nunca é sobrescrito só pela presença do arquivo -- dado oficial sempre vence. Fio conectado em dois pontos que já tinham a evidência calculada, sem nenhuma consulta nova ao banco: `gerarMapaDocumentalCredito` (usa `tiposAnexados` já recebido) e `avaliarProntidaoIdentidadeCnpj` (novo parâmetro `ccmeiAnexado`, alimentado pelo `documentacaoSocietaria.ccmei_anexado` já calculado antes na mesma rota). Efeito: com o CCMEI anexado, o banner passa a mostrar "MEI" e o checklist passa a exigir DASN-SIMEI em vez de PGDAS-D/DEFIS/ECF/ECD -- exatamente o conjunto documental correto para o regime real da empresa, nem mais nem menos, como pedido explicitamente pelo usuário.

## Rodada 11/09/2026 parte 15 — CCMEI anexado ficava preso para sempre em "Revisão necessária": novo leitor local especializado

Base: mesma árvore da rodada anterior (parte 14), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **126 arquivos / 1162 testes, todos passando** (1154 + 8 novos em `tests/parseCcmei.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.8 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

### 4. O que mudou
Com o campo CCMEI finalmente visível na grade (parte 14), o usuário anexou um CCMEI real e mostrou, em print, que ele ficava permanentemente preso em "Revisão necessária — Campos essenciais não comprovados: titular, condicao_mei", mesmo sendo um documento real e legível. Causa raiz: o CCMEI nunca teve um leitor local especializado -- caía direto no `parseDocumentoGenerico`, cujo teto de confiança (0.65) nunca alcança o limiar de confiança (0.72, `LOCAL_DOCUMENT_CONFIDENCE_MIN`) que permite o resultado da leitura local ser aceito como definitivo; o texto real do CCMEI usa rótulos ("Nome Civil", cabeçalho "CERTIFICADO DA CONDIÇÃO DE MICROEMPREENDEDOR INDIVIDUAL - CCMEI" às vezes quebrado em duas linhas) que o parser genérico não reconhece como `titular`/`condicao_mei`. Corrigido com um novo parser dedicado, `parseCcmei` (`extracaoDocumentalLocal.ts`), seguindo o mesmo padrão já usado para DASN-SIMEI/DEFIS: parte do resultado genérico como base, sobrepõe extração específica dos rótulos reais do CCMEI (nome civil/titular, marcador de condição de MEI comparado em texto normalizado sem acento, data de início das atividades, situação cadastral), calcula `documento_compativel` por reconhecimento do cabeçalho oficial, e eleva a confiança o suficiente para cruzar o limiar quando o documento é de fato um CCMEI reconhecível. Roteamento ligado em dois pontos: `tipoLeitorLocalDocumentoCatalogado` (`analiseDocumentalEspecializada.ts`) e o dispatcher `analisarTextoDocumentoLocal` (`extracaoDocumentalLocal.ts`, tanto na rota direta quanto no fallback por tipo esperado). Zero regressão: nenhum outro tipo de documento muda de comportamento -- `parseDocumentoGenerico` continua exatamente igual para todos os outros tipos que não têm parser dedicado.

**Nota para o usuário, fora do escopo de código desta rodada:** as variáveis de ambiente `DOCUMENT_EXTERNAL_AI_FALLBACK_ENABLED` e `GEMINI_DOCUMENT_OCR_ENABLED` (ambas com padrão `false` quando ausentes) controlam se, além da leitura local, existe um fallback de IA externa para casos realmente difíceis de ler. Esta correção resolve o sintoma do CCMEI de forma independente dessas variáveis (a leitura local agora cruza o limiar de confiança sozinha), mas vale a pena confirmar o valor delas no Coolify para a qualidade de leitura de documentos em geral -- não foi alterado nesta rodada por ser uma configuração de infraestrutura de amplo alcance (afeta todos os tipos de documento "catalogado", não só o CCMEI), fora do que esta sessão consegue verificar ou testar com segurança.

## Rodada 10/09/2026 parte 14 — Causa raiz real de "o CCMEI nunca aparece na tela": faltava nas listas `tiposPermitidos` das duas telas de Acervo Documental de empresa

Base: mesma árvore das rodadas anteriores (partes 12/13), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **125 arquivos / 1154 testes, todos passando** (1143 + 7 novos em `tests/exigibilidadeTemporalDocumentosAnuais.test.ts` (parte 13) + 4 novos em `tests/tiposPermitidosEmpresaIncluiCcmei.test.ts` (parte 14)).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.8 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

### 4. O que mudou
Interrompendo a rodada anterior com 2 prints novos, o usuário mostrou que mesmo com as partes 11/12 implementadas, o campo dedicado de CCMEI continuava **completamente ausente da grade** (não apenas reordenado/escondido) e "Atos da Junta"/"Contrato social" continuavam pendentes. Investigação: a grade não vem direto do catálogo estático (`SECOES_DOCUMENTAIS`) -- passa antes por um filtro de "tipos permitidos" (`tiposPermitidos`, prop de cada tela) dentro de `slotsDaTela`. "ccmei", "das_mei" e "relatorio_receitas_mei" têm slot cadastrado no catálogo, mas nunca estiveram nas listas `TIPOS_EMPRESA` (`AcervoDocumentalEmpresa.tsx`) nem `TIPOS_PERMITIDOS_EMPRESA` (`EmpresaDocumentos.tsx`) -- confirmado por busca no código-fonte, "ccmei" não aparecia em nenhum arquivo de `client/src/pages`. Essa é a causa raiz real de toda a confusão desta série de rodadas: nenhuma correção anterior de MEI (reordenar, esconder, textos de mensagem) podia ter efeito sobre um campo que nunca chegava a existir na grade. Corrigido adicionando os três tipos às duas listas, mantendo-as idênticas entre si. Efeito em cascata: como o backend só dispensa Atos da Junta/Contrato Social para MEI quando o CCMEI foi de fato anexado e reconhecido (`societaria.atos_dispensados_por_mei`, já implementado desde a parte 7/8/9), sem um campo para anexar o CCMEI essa evidência nunca podia existir -- agora que existe, o fluxo completo (reordenar, esconder, dispensar, liberar a etapa) volta a funcionar de ponta a ponta.

## Rodada 10/09/2026 parte 13 — ECF/ECD/DEFIS/DASN-SIMEI respeitam o prazo legal de entrega antes de virarem pendência obrigatória

Base: mesma árvore da rodada anterior (parte 12), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **124 arquivos / 1150 testes, todos passando** (1143 + 7 novos em `tests/exigibilidadeTemporalDocumentosAnuais.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.8 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

### 4. O que mudou
Pedido do usuário sobre datas: ECF/ECD/DEFIS/DASN-SIMEI têm prazo legal de entrega anual (já calculado por `regimeTributarioTemporalService.ts`, Rodada 33), mas esse cálculo só era usado para julgar documento já anexado, nunca para decidir se um documento ainda faltando devia contar como pendência obrigatória -- uma empresa que mudou de regime há pouco podia ser cobrada por um documento que legalmente ainda não venceu. Nova função pura `aplicarExigibilidadeTemporalDocumentosAnuais` (`mapaDocumentalCreditoService.ts`), ligada em `documentacao.ts` logo após o cálculo da linha do tempo de regime: enquanto o prazo legal do documento não chega, ele deixa de contar como obrigatório, reaproveitando o mesmo campo `obrigatorio` que toda a lógica de pendência já respeita.

## Rodada 10/09/2026 parte 12 — Para MEI, "Atos da Junta Comercial"/"Contrato social" somem da grade (CCMEI vira o primeiro campo); títulos dos cards com mais contraste

Base: mesma árvore da rodada anterior (parte 11), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **123 arquivos / 1143 testes, todos passando** (1140 + 3 novos em `tests/reordenacaoCcmeiParaMei.test.ts`, reescrito nesta rodada -- mesmo nome de arquivo, mas os testes agora cobrem o comportamento novo, substituindo os 3 testes da versão anterior).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

### 4. O que mudou
Pedido do usuário, revendo a correção da parte 11 com um print real da tela: para uma empresa já validada como MEI na Etapa 1, os campos "Atos da Junta Comercial" e "Contrato social e alterações contratuais" não devem mais aparecer na grade -- só o CCMEI. Implementado com uma exceção de segurança: um campo só é escondido se não tiver nenhum arquivo já anexado (zero regressão -- nunca esconde um upload existente do usuário). O CCMEI passa a ser o primeiro campo da seção "Documentação da Empresa" para MEI. A mudança é reversível por natureza: como `empresa_identificada_mei` é recalculado a cada carregamento a partir do enquadramento tributário real, se a empresa desenquadrar do MEI, os dois campos voltam a aparecer sozinhos, sem nenhuma ação manual -- exatamente como pedido. Também aumentado o contraste do título de cada card de documento (`text-muted-foreground` → `text-foreground`, mesmo peso `font-bold` de antes, só a cor muda), a pedido explícito do usuário.

## Rodada 10/09/2026 parte 11 — Campo "CCMEI" reordenado para aparecer logo após "Contrato social" (estava 24 campos abaixo, causando confusão sobre onde anexar)

Base: mesma árvore da rodada anterior (parte 10), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **123 arquivos / 1140 testes, todos passando** (1137 + 3 novos em `tests/reordenacaoCcmeiParaMei.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

### 4. O que mudou
Pedido do usuário: "Onde anexo o CCMEI, pois estou anexando no mesmo local do contrato social?" -- a pergunta revelou a causa real da confusão: o campo dedicado "CCMEI" sempre existiu na mesma seção/aba de "Contrato social" e "Atos da Junta Comercial" (nunca em outra tela), mas 24 campos abaixo na lista. Anexar em "Contrato social" também já funciona (reconhecido pelo classificador desde a parte 8), mas o usuário nunca via o campo dedicado sem rolar a tela inteira. Corrigido com uma reordenação -- só para empresa identificada como MEI -- que move o campo "CCMEI" para logo depois de "Contrato social e alterações contratuais" na grade. Nenhum campo foi escondido ou removido: Atos da Junta e Contrato Social continuam visíveis (já marcados "Dispensado (MEI)" quando o CCMEI é reconhecido, desde a parte 10). Também foi acrescentada, na própria descrição do campo CCMEI, a referência cruzada reversa explicando que ele substitui o Contrato Social/Atos da Junta para MEI.

## Rodada 09/09/2026 parte 10 — Três superfícies de texto ainda diziam "Atos da Junta Comercial" para o MEI (mesmo com a parte 9 já corrigida)

Base: mesma árvore da rodada anterior (parte 9), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **122 arquivos / 1137 testes, todos passando** (1128 + 3 novos em `tests/normalizarDocumentoCatalogadoCcmeiTipoDetectado.test.ts`, que chamam a função real de normalização (sem presumir o formato do laudo) + 6 novos em `tests/textoMeiSemAtosDaJuntaUiCompleta.test.ts`, auditando as 3 superfícies de texto corrigidas + 4 assertions novas nos 4 testes já existentes de `tests/validacaoSocietariaCcmeiMei.test.ts`, agora também verificando o campo `empresa_identificada_mei`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.8 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

### 4. O que mudou
A gate de negócio (`atos_dispensados_por_mei`) já estava correta desde a parte 9. Mas uma auditoria completa desta rodada encontrou que, enquanto a etapa não avança (MEI com CCMEI ainda não reconhecido, ou etapa ainda não aprovada), TRÊS textos de tela/mensagem continuavam dizendo "Atos da Junta Comercial" para QUALQUER empresa, inclusive MEI: (1) o "próximo documento a anexar" e o título/rótulo do card na Etapa 2 (`client/src/components/documentos/DocumentosEntidade.tsx`); (2) o aviso de "ordem recomendada" no campo Contrato Social do Acervo Documental (mesmo arquivo); (3) a mensagem de erro da rota `POST /empresa/:empresaId/analise-societaria/iniciar` (`server/routes/documentacao.ts`). Todas as três agora ramificam por um novo campo explícito, `empresa_identificada_mei` (retornado por `montarValidacaoSocietaria`, independente de o CCMEI já ter sido anexado ou não), para nunca mais mencionar "Atos da Junta" a uma empresa MEI. Ver `CHANGELOG_CORRECOES.md` para a descrição completa.

## Rodada 09/09/2026 parte 9 — Corrigido o caminho de leitura do tipo detectado do CCMEI (a etapa ainda pedia o CCMEI mesmo depois da parte 8)

Base: mesma árvore da rodada anterior (parte 8), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **120 arquivos / 1128 testes, todos passando** (mesma contagem da parte 8 -- nenhum teste novo, o teste existente de `tests/validacaoSocietariaCcmeiMei.test.ts` que cobre este cenário foi corrigido para usar o formato real do laudo persistido, e passou a exercer o caminho de leitura correto).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

## Rodada 09/09/2026 parte 8 — CCMEI anexado no campo "Contrato social" deixa de ser "Documento incompatível" e passa a valer como evidência

Base: mesma árvore da rodada anterior (parte 7), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **120 arquivos / 1128 testes, todos passando** (1123 + 4 novos em `tests/classificadorCcmeiComoContratoSocialMei.test.ts` + 1 novo em `tests/validacaoSocietariaCcmeiMei.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.6 kB -- `node --check` OK em ambos.

## Rodada 09/09/2026 parte 7 — MEI usa o CCMEI como equivalente do Contrato Social/Atos da Junta

Base: mesma árvore da rodada anterior (parte 6), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **119 arquivos / 1123 testes, todos passando** (1119 + 4 novos em `tests/validacaoSocietariaCcmeiMei.test.ts`, cobrindo MEI sem CCMEI, MEI com CCMEI anexado, MEI com CCMEI vazio/ilegível e LTDA não afetada).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- `dist/index.js` 2.5 MB / `dist/backfill-laudos.js` 447.5 kB -- `node --check` OK em ambos.

## Rodada 09/09/2026 parte 6 — Causa raiz real: `isEmpresaIndividual` não reconhecia "Empresário (Individual)" com parênteses (texto oficial real da Receita)

Base: mesma árvore da rodada anterior (parte 5), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **118 arquivos / 1119 testes, todos passando** (1117 + 2: 1 novo em `tests/isEmpresaIndividualSemNomeDaEmpresa.test.ts`, 1 novo em `tests/garantirTitularEmpresaIndividual.test.ts`, ambos reproduzindo o caso real com os dados exatos dos 3 documentos anexados pelo usuário -- Cartão CNPJ, Consulta Optantes/SIMEI e QSA da empresa "55.497.701 NATALYA MARTINS LOBO").

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js` (2.5 MB) e `dist/backfill-laudos.js` (447.5 KB) gerados; `node --check` limpo nos dois.

### 4. O que mudou (a causa raiz real, confirmada com os documentos reais)
O usuário enviou os 3 documentos reais da empresa (Cartão CNPJ, Consulta Optantes/SIMEI, QSA). O Cartão CNPJ confirma que o texto oficial da Receita para a natureza jurídica é literalmente **"213-5 - Empresário (Individual)"** -- com parênteses. `isEmpresaIndividual` (`server/routes/documentacao.ts`) exigia as duas palavras coladas (`\bempresario individual\b`), então nunca reconhecia essa empresa como EI/MEI quando `opcao_mei` também não estava sincronizado no cadastro -- e como TODA a correção das rodadas 4 e 5 depende dessa função retornar `true`, o bug persistia mesmo com as duas rotas já corrigidas. A regex agora aceita `empresario\s*\(?individual\)?` (mesmo padrão já usado em outro lugar do projeto, `analiseDocumentalEspecializada.ts`). O QSA real anexado confirma também que o documento em si não lista nenhum sócio ("A NATUREZA JURÍDICA NÃO PERMITE O PREENCHIMENTO DO QSA") -- o nome só existe no "NOME EMPRESARIAL", validando que a extração pelo nome empresarial (parte 5) é o caminho certo, não um fallback secundário. Ver `CHANGELOG_CORRECOES.md` para a descrição completa. — Reconciliação do titular ligada na rota real usada pela tela (`GET /api/empresas/:id/socios`) + extração de nome do nome empresarial do MEI

Base: mesma árvore da rodada anterior (titular de EI/MEI, parte 4), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **118 arquivos / 1117 testes, todos passando** (1109 + 8: 4 novos em `tests/garantirTitularEmpresaIndividual.test.ts` para a extração de nome do nome empresarial do MEI, e 4 novos em `tests/getSociosEmpresaRotaReconciliaTitular.test.ts` para a rota).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js` (2.5 MB) e `dist/backfill-laudos.js` (447.5 KB) gerados; `node --check` limpo nos dois.
- Verificado manualmente no bundle final que o import dinâmico entre `socios_documentos.ts` e `documentacao.ts` (necessário para reaproveitar `garantirTitularEmpresaIndividual` sem criar um ciclo de import estático) foi resolvido pelo esbuild com o padrão padrão de inicialização tardia (`init_documentacao()`/`documentacao_exports`) -- sem nenhum `import()` de runtime pendente, sem risco de falha em produção.

### 4. O que mudou (causa raiz da rodada anterior não ter resolvido o bug real)
A Rodada anterior (parte 4) ligou `garantirTitularEmpresaIndividual` só dentro de `montarDossieCreditoEmpresa`. Mas a tela de Acervo Documental (`DocumentosEntidade.tsx`) não lê a lista de sócios do dossiê -- ela busca direto em `GET /api/empresas/:id/socios` (`server/routes/socios_documentos.ts`), de forma independente. Por isso o print enviado pelo usuário depois da rodada anterior continuava mostrando o bloqueio: o caminho que a tela realmente usa nunca chamava a reconciliação. Corrigido chamando a MESMA função também nessa rota. Além disso, a pedido do usuário, a cascata de resolução de nome do titular passou a incluir o próprio nome empresarial do MEI (razão social/nome fantasia no padrão "raiz do CNPJ + nome civil do titular") como um sinal adicional, quando não há nenhum nome em cadastro estruturado -- nunca inventa CPF. Ver `CHANGELOG_CORRECOES.md` para a descrição completa.

Base: mesma árvore da rodada anterior (cards recolhidos), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **117 arquivos / 1109 testes, todos passando** (1096 + 13, todos os 13 novos em `tests/garantirTitularEmpresaIndividual.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js` (2.5 MB) e `dist/backfill-laudos.js` (447.5 KB) gerados; `node --check` limpo nos dois.

### 4. O que mudou
Uma única função nova, `garantirTitularEmpresaIndividual` (`server/routes/documentacao.ts`), chamada uma vez dentro de `montarDossieCreditoEmpresa` logo depois de `empresa`/`socios` serem carregados (mesmo padrão de "reconciliação-na-leitura" já usado por `reconciliarFollowupMaturidadeEmpresa`). Nenhuma migration, nenhuma tabela nova, nenhum tipo novo -- reaproveita 100% `socios_empresa` e `upsertSocioEmpresa`, já existentes. Ver `CHANGELOG_CORRECOES.md` para a descrição completa do bug e da correção.

## Rodada 09/09/2026 parte 3 — cards do Acervo Documental recolhidos por padrão

Base: mesma árvore da rodada anterior (PDF + roteamento), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **116 arquivos / 1096 testes, todos passando** (1092 + 4, todos os 4 novos em `tests/acervoCardsRecolhidos.test.ts`).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.5 kB -- `node --check dist/backfill-laudos.js` OK.
- Chunk `DocumentosEntidade`: 192.62 kB → 194.36 kB gzip 45.76 kB → 46.14 kB -- crescimento pequeno e esperado (novo estado de expansão + selo de resultado + ícone `ChevronDown`).
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 4. Diff mínimo (verificado por `diff -rq` contra o zip anterior, excluindo `node_modules`/`dist`/`.vite`)
2 arquivos a mais diferem em relação à entrega anterior (09/09/2026 parte 2, PDF + roteamento):
- `client/src/components/documentos/DocumentosEntidade.tsx` (correção de produção, frontend)
- `tests/acervoCardsRecolhidos.test.ts` (teste novo)

Nenhuma migration, rota de backend, variável de ambiente ou dependência foi tocada nesta rodada.

---

## Rodada 09/09/2026 parte 2 — PDF institucional (cabeçalho x título) e roteamento do Dossiê de Crédito (bug do wouter)

Base: mesma árvore da rodada anterior (ícone de hover), `node_modules` já instalado nesta verificação (sem alteração de dependências).

### 1. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 2. Suíte de testes
`npx vitest run` -- **115 arquivos / 1092 testes, todos passando** (1088 + 4 -- os 4 testes novos são todos de `tests/wouterQueryStringLeitura.test.ts`; `tests/relatorioModularHtml.test.ts`, pré-existente, foi atualizado sem mudar sua contagem, 10/10).

### 3. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.8 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.5 kB -- `node --check dist/backfill-laudos.js` OK.
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 4. Diff mínimo (verificado por `diff -rq` contra o zip anterior, excluindo `node_modules`/`dist`/`.vite`)
6 arquivos a mais diferem em relação à entrega anterior (09/09/2026, ícone de hover):
- `server/services/relatorioModularHtml.ts` (correção de produção -- geração de PDF)
- `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx` (correção de produção -- roteamento)
- `client/src/pages/colaborador/Empresas.tsx` (correção de produção -- roteamento)
- `client/src/pages/colaborador/RedefinirSenha.tsx` (correção de produção -- roteamento, bug adicional encontrado)
- `tests/relatorioModularHtml.test.ts` (teste pré-existente, atualizado)
- `tests/wouterQueryStringLeitura.test.ts` (teste novo)

Nenhuma migration, rota de backend nova, variável de ambiente ou dependência foi tocada nesta rodada.

### 5. Verificação empírica adicional (fora da suíte automatizada)
A correção do PDF foi validada gerando um PDF real via Chromium a partir do código de produção (`gerarHtmlRelatorioModular` + `generateBrandedPdfBuffer`), antes e depois da mudança -- confirmado visualmente (leitura do PDF gerado) que a sobreposição título/logo desaparece e que nenhuma numeração de página é perdida (ela já não aparecia antes da correção).

---

## Rodada 09/09/2026 — laudo por documento vira ícone de hover no Acervo Documental (cards sempre do mesmo tamanho)

Base: mesma árvore das rodadas anteriores, `node_modules` reinstalado do zero antes desta verificação.

### 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros. Nenhuma dependência adicionada -- `@radix-ui/react-hover-card` já constava do `package.json` (usado pelo componente `client/src/components/ui/hover-card.tsx`, pré-existente, só não tinha uso ainda dentro do Acervo Documental).

### 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 3. Suíte de testes
`npx vitest run` -- **114 arquivos / 1088 testes, todos passando** (contagem inalterada -- `tests/acervoInlineAnalise.test.ts`, pré-existente, foi atualizado para auditar o mecanismo novo, sem teste criado nem removido).

### 4. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.4 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.5 kB -- `node --check dist/backfill-laudos.js` OK.
- Chunk `DocumentosEntidade`: 187.10 kB → 192.62 kB gzip 43.50 kB → 45.75 kB -- crescimento pequeno e esperado (o `HoverCard` do Radix, já uma dependência do projeto, passou a ser efetivamente importado neste chunk).
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 5. Diff mínimo (verificado por `diff -rq` contra o zip anterior, excluindo `node_modules`/`dist`/`.vite`)
Só 2 arquivos a mais diferem em relação à entrega anterior (08/09/2026, atualizada):
- `client/src/components/documentos/DocumentosEntidade.tsx` (correção de produção, frontend)
- `tests/acervoInlineAnalise.test.ts` (teste pré-existente, atualizado)

Nenhum arquivo de backend, rota, migration ou configuração foi tocado nesta rodada.

---

## Rodada 08/09/2026, segunda atualização (09/09/2026) — terceiro documento real (par completo Atos da Junta + Alteração Contratual, VIK CONSTRUÇÕES E REFORMAS LTDA)

Base: mesma árvore da rodada anterior (`destravamain_30.zip` + as correções já entregues de 08/09/2026), `node_modules` reinstalado do zero (`pnpm install --frozen-lockfile`) antes desta verificação.

### 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado. Nenhuma dependência adicionada, removida ou alterada nesta atualização.

### 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro.

### 3. Suíte de testes
`npx vitest run` -- **114 arquivos / 1088 testes, todos passando** (+3 em relação à rodada anterior: novo terceiro `describe` em `tests/atosJuntaIdentidadePorEvidencia.test.ts`, usando o texto extraído exato do terceiro documento real -- ver `TEST_REPORT.md`/`CHANGELOG_CORRECOES.md`).

### 4. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.5 kB -- `node --check dist/backfill-laudos.js` OK.
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 5. Diff mínimo (verificado por `diff -rq` contra o zip original, excluindo `node_modules`/`dist`/`.vite`)
Ainda apenas 3 arquivos diferem do zip original (mesmos 3 da rodada anterior -- nenhum arquivo a mais tocado nesta atualização):
- `server/services/extracaoDocumentalLocal.ts` (correção de produção -- ganhou 2 correções adicionais dentro de `parseContratoSocialAlteracao`)
- `shared/documentalPresentation.ts` (inalterado desde a rodada anterior)
- `tests/atosJuntaIdentidadePorEvidencia.test.ts` (+3 testes, terceiro `describe`)

Nenhum outro arquivo (frontend, rotas, migrations, configuração, outros serviços) foi tocado nesta atualização -- inclusive `client/src/components/documentos/DocumentosEntidade.tsx`, investigado por causa da queixa de layout ("print bagunçado") mas sem nenhuma alteração, por não ter sido encontrado bug de código (ver `PENDENCIAS_REAIS.md`, item "0-U").

---

## Rodada 08/09/2026 — identidade documental por evidência (Atos da Junta / Contrato Social)

Base desta rodada: `destravamain_30.zip`, extraído em ambiente limpo (`pnpm install --frozen-lockfile` executado do zero, sem `node_modules` pré-existente).

### 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (`packageManager: pnpm@10.4.1`). Nenhuma dependência adicionada, removida ou alterada nesta rodada.

### 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, antes e depois de cada alteração.

### 3. Suíte de testes
`npx vitest run` -- **114 arquivos / 1085 testes, todos passando** (12 testes em `tests/atosJuntaIdentidadePorEvidencia.test.ts`: 6 com fixtures sintéticas + 6 adicionados depois, usando o texto extraído exato dos dois documentos reais anexados pelo usuário -- ver `TEST_REPORT.md` e `CHANGELOG_CORRECOES.md`). Todos os demais arquivos já existentes na base, sem alteração de contagem.

### 4. Build de produção
`pnpm run build` -- concluído com sucesso.
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.5 MB (aviso de tamanho do esbuild, pré-existente, não é falha) -- `node --check dist/index.js` OK.
- `dist/backfill-laudos.js`: 447.2 kB -- `node --check dist/backfill-laudos.js` OK.
- Pré-renderização estática validada (meta tags OG, Twitter, canonical URL, React root, script bundle).

### 5. Diff mínimo (verificado por `diff -rq` contra o zip original, excluindo `node_modules`/`dist`/`.vite`)
Apenas 3 arquivos diferem do zip original:
- `server/services/extracaoDocumentalLocal.ts` (correção de produção)
- `shared/documentalPresentation.ts` (correção de produção -- mantém o novo campo de diagnóstico fora da tela do usuário final)
- `tests/atosJuntaIdentidadePorEvidencia.test.ts` (novo, teste)

Nenhum outro arquivo (frontend, rotas, migrations, configuração, outros serviços) foi tocado nesta rodada.

---


## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida nesta rodada -- a correção é a remoção de uma única classe Tailwind).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, depois de remover `self-start` da className do card do checklist (`client/src/components/documentos/DocumentosEntidade.tsx`).

## 3. Suíte de testes
`npx vitest run` -- 101 arquivos / 910 testes, todos passando (contagem inalterada em relação à Rodada 29 -- correção puramente de CSS, sem nenhuma função pura nova). Ver `TEST_REPORT.md`.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Esta rodada altera só um componente de tela (`client/src/components/documentos/DocumentosEntidade.tsx`) -- nenhuma lógica de backend ou de negócio foi tocada.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK (inalterado -- classe removida, nenhuma nova)
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha).
- Chunk `DocumentosEntidade`: 151.07 kB → 151.06 kB gzip 35.62 kB → 35.62 kB -- praticamente inalterado (a única mudança de código é a remoção de uma string de 11 caracteres da className; o comentário novo explicando a correção não é incluído no bundle minificado).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

**Os cards do checklist "Documentação da Empresa" (e, pelo mesmo componente, "Identidade do CNPJ" e "Documentação dos Sócios") deixam de ficar com alturas desiguais dentro da mesma linha da grade quando fechados/encolhidos.** Antes, um card com mais conteúdo permanente (selo "OBRIGATÓRIO NA ETAPA", link "Dados da análise") deixava os vizinhos mais simples da mesma linha "flutuando" mais baixos, com um vão em branco visível abaixo deles até a próxima linha começar. Agora todos os cards de uma linha esticam a própria caixa até a altura comum da linha -- bordas terminando no mesmo nível.

**Quando um card específico cresce de verdade** (um aviso mais longo do que o normal, ou "Dados da análise" aberto para um arquivo dentro daquele card), a linha continua crescendo para acomodar -- isso nunca dependeu da classe removida, é assim que a grade calcula a altura de cada linha. A única mudança é que os vizinhos mais curtos da mesma linha agora preenchem esse espaço em vez de deixá-lo em branco fora da própria caixa.

**Sem impacto em nenhuma correção anterior.** Nenhuma lógica de negócio, nenhuma regra de visibilidade de campo, nenhum botão ou toggle foi alterado -- só a forma como cada card preenche o espaço vertical dentro da grade.

**Regra geral, válida para qualquer empresa/regime/porte.** A correção está no componente de card genérico reutilizado por todas as seções da tela, para qualquer tipo de empresa -- nenhum caso especial por tipo de documento ou por regime.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, nenhuma mudança de lógica de negócio -- correção puramente visual (uma classe CSS removida). Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
