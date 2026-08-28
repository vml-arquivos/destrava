# Relatório de implementação — Destrava Crédito

**Projeto:** Destrava Crédito
**Branch publicada:** `main`
**Commit publicado:** `21901bf` — `feat: adiciona convites seguros para parceiros e captadores`
**Deployment Coolify:** `fkk1pleycovjpc0snq3akync`
**Ambiente:** `production`
**Autor:** Manus AI
**Data do registro:** 27/08/2026

## Status executivo

As atualizações de autoedição, foto opcional, enriquecimento CNPJ, indicação rastreável e convites de cadastro foram incorporadas à `main`, enviadas ao GitHub e publicadas em produção. O deployment terminou com **Success**, o healthcheck do novo container retornou **healthy** e a aplicação permaneceu **Running**.

A regra de segurança adotada para novos cadastros é deliberadamente conservadora: o link não libera acesso imediatamente. O interessado define sua própria senha, o usuário é criado como inativo e o Administrador aprova o cadastro pela tela de Usuários. Somente depois da aprovação o acesso ao sistema é liberado.

> Nenhuma senha, hash, token de reset ou segredo de colaborador é exibido em ficha, resposta administrativa ou relatório. O token do convite é persistido apenas como hash SHA-256 e o link bruto não é versionado neste relatório.

## Correção de autoedição e foto do Administrador

O guard do `PATCH` de colaboradores passou a distinguir **autoedição** de **gestão de terceiros**. O próprio usuário pode editar seu cadastro, incluindo nome, e-mail, telefone, senha e foto opcional. Na autoedição, cargo, perfil operacional, permissões de atendimento, visibilidade ampla e identificador Chatwoot permanecem protegidos contra alteração indevida. Para terceiros, a hierarquia estrita continua sendo aplicada.

A tela de Usuários agora oferece a ação explícita **Editar meu cadastro** para o usuário autenticado. O campo de foto opcional permanece disponível no formulário e utiliza o endpoint protegido e o armazenamento persistente já existentes, com limite de 2 MB e MIME permitido para JPG, PNG e WebP.

| Controle | Resultado comprovado |
| --- | --- |
| Autoedição de Administrador | Disponível no formulário de produção; a tela abriu sem a mensagem anterior de falta de permissão. |
| Alteração administrativa de terceiros | Continua sujeita à hierarquia de cargos. |
| Autoalteração de cargo/permissões | Bloqueada no backend e protegida no frontend. |
| Foto opcional | Campo disponível na criação e na autoedição; endpoint autenticado e armazenamento persistente preservados. |
| Upload real em registro de produção | Não executado para não alterar a foto real do Administrador sem autorização específica; coberto por typecheck e testes focais. |

## Links seguros de cadastro para parceiros e captadores

Foi criada a rota pública `/cadastro-convite?token=...` e a área administrativa **Links de cadastro** dentro de Usuários. Gestores autorizados podem gerar links individuais de parceiro ou captador, copiar o endereço e acompanhar os convites recentes.

O fluxo implementado é o seguinte. O gestor escolhe **Gerar link de parceiro** ou **Gerar link de captador**. O sistema gera token aleatório, grava somente seu hash, define expiração de sete dias e permite uso único. O interessado acessa o link, preenche os dados e define sua própria senha. Para parceiro, CPF é obrigatório e, após o envio, é criado o registro correspondente em `parceiros_comerciais`; para ambos os tipos, o usuário de acesso é criado com cargo seguro `Captador Externo`, perfil de agente e permissões amplas desativadas. O cadastro fica inativo até aprovação.

Na própria tela administrativa, o gestor visualiza os estados **Disponível**, **Aguardando aprovação**, **Aprovado**, **Expirado** e **Revogado**. O botão **Aprovar** ativa o colaborador e, quando aplicável, também ativa o cadastro comercial do parceiro. O botão **Revogar** invalida um link ainda não utilizado. O login existente é reutilizado; não há sessão automática nem senha temporária exposta.

| Proteção | Implementação |
| --- | --- |
| Token | `crypto.randomBytes` no link; somente hash SHA-256 no banco. |
| Expiração | Sete dias por convite. |
| Uso único | Coluna `usado_em` com bloqueio transacional `FOR UPDATE`. |
| Revogação | Coluna `revogado_em` e endpoint administrativo. |
| Abuso | Limitador específico de cinco tentativas por 15 minutos no fluxo público. |
| Aprovação | Novo usuário nasce com `ativo = false`; somente gestor autorizado aprova. |
| Credenciais | Senha definida pelo interessado e armazenada com bcrypt; nenhum segredo retorna na resposta. |
| Permissão administrativa | Geração, consulta, aprovação e revogação exigem `podecriarUsuarios`. |

O teste manual em produção gerou um link real de parceiro, exibiu o endereço no painel, registrou o convite como **Disponível** e abriu a página pública com os campos corretos de parceiro, sem expor dados administrativos. Nenhum cadastro real foi enviado durante o teste. O link gerado pode ser copiado do painel de Usuários e enviado ao parceiro autorizado.

## Indicação rastreável

A indicação mínima foi incorporada sem criar portal. O helper de atribuição mantém UTMs e consentimento de analytics e passou a preservar o parâmetro funcional `ref` mesmo sem consentimento de cookies de marketing. A tela de Parceiros pode gerar e copiar links rastreáveis. A referência é resolvida de forma opcional na captação, sem bloquear o lead quando o código é inexistente ou o schema ainda não estiver disponível.

A migration aditiva `089_indicacao_rastreavel.sql` adiciona o armazenamento da referência e mantém os fluxos existentes. Não foram alterados contratos, comissões nem a entidade de parceiro comercial. A regra de não criar portal de afiliados nesta onda foi preservada.

## Enriquecimento CNPJ best-effort

A consulta composta existente de CNPJ foi extraída para uma função reutilizável em `server/routes/cnpj.ts`, preservando BrasilAPI, CNPJá e OpenCNPJ, normalização e comportamento de falha. O fluxo de criação de empresa do simulador reaproveita essa consulta depois da criação ou localização da empresa.

O enriquecimento é opcional e não bloqueante. Somente campos retornados e não vazios são aplicados às colunas existentes; dados preenchidos não são substituídos por vazios. Falha de provedor, CNPJ ausente ou inválido e coluna aditiva ainda não disponível não impedem a criação do lead/empresa. Os testes cobrem CNPJ inválido, sucesso composto e construção de atualização sem dados fiscais falsos.

## Acompanhamento de empresas recentes

O acompanhamento estrutural continua usando `empresa_followups`, que aceita `empresa_id`; a tabela lead-centric `crm_followups` não foi forçada a receber vínculo de empresa. A reconciliação de maturidade de 12 meses permanece idempotente, atualiza a data quando a data de abertura é corrigida, reabre o acompanhamento quando necessário e não bloqueia documentos, simulador, CRM ou Inteligência 360.

A correção B1 e o tratamento do enquadramento tributário opcional não foram alterados nesta atualização. Empresas recentes continuam no sistema com alertas e acompanhamento, mas não são marcadas como aptas apenas por terem avançado ou anexado documentos.

## Fichas cadastrais e PDFs

As fichas de colaboradores/captadores, contadores e parceiros usam visualização prévia antes da ação de impressão ou download. A resposta de PDF converte explicitamente o `Uint8Array` do Chromium para `Buffer`, impedindo que o navegador salve JSON de índices com extensão `.pdf`. O PDF de parceiro já foi validado em produção como PDF 1.4 válido, A4, com duas páginas e conteúdo cadastral extraível.

As rotas de preview e PDF permanecem protegidas. O modal compartilhado separa **Visualizar**, **Imprimir** e **Baixar PDF**. A foto opcional de colaborador é servida por rota autenticada e pode aparecer no cadastro, na ficha e no PDF quando houver imagem persistida.

## Banco de dados e compatibilidade

As mudanças de banco são aditivas. A migration `090_convites_cadastro.sql` cria a tabela de convites com token hash, tipo, cargo, expiração, uso, revogação e auditoria; adiciona `colaboradores.convite_cadastro_id` e o vínculo opcional `parceiros_comerciais.colaborador_id`. O mesmo conteúdo foi incluído em `db/migrate.sql` e no bootstrap idempotente do servidor.

Nenhuma tabela existente foi removida e nenhuma informação de contrato, comissão, CRM ou documentação foi migrada destrutivamente. O bootstrap registra aviso e degrada de forma segura quando uma instalação antiga ainda não possui a estrutura aditiva.

## Validação local

| Verificação | Resultado |
| --- | --- |
| Testes focais de autoedição, ficha e convites | 9 testes aprovados. |
| Suíte completa | 58 arquivos / 571 testes aprovados. |
| `pnpm check` | Aprovado. |
| `pnpm build` | Aprovado. |
| Pré-renderização e budgets | Aprovados. |
| `git diff --check` | Aprovado. |
| Escopo Git | Baseline Onda 1 em `21901bf`; após a promoção da Onda 2, `origin/main` ficou em `2c338c8`. |

Os avisos de conexão recusada e fallback de Inteligência 360 observados na suíte são cenários deliberados de testes já existentes; não causaram falha.

## Validação em produção

O Coolify confirmou o checkout do SHA completo `21901bf7d8fb08e7bc6608d509b48814c9b380cc`. O deployment `fkk1pleycovjpc0snq3akync` terminou com **Success** em aproximadamente 3m21s. O novo container foi considerado **healthy**, a aplicação ficou **Running** e os containers antigos foram removidos durante a troca.

Os smoke checks públicos responderam conforme esperado. `GET /api/health` retornou `status: ok` e `db: connected`; a landing pública respondeu HTTP 200; e um token de convite inválido retornou HTTP 404 com mensagem genérica. A rota autenticada de Usuários carregou 14 colaboradores e exibiu **Editar meu cadastro**, o campo de foto opcional e o bloco de geração de links. A autoedição do Administrador foi aberta sem a falha de autorização anterior. Um link real de parceiro foi gerado e sua página pública apresentou o formulário de cadastro correto.

## Onda 2 — Máquina de Vendas

A Onda 2 foi implementada na branch isolada `onda-2-maquina-de-vendas` até o commit `1863314`. A entrega inclui metas comerciais e realizado por colaborador/mês, forecast ponderado exclusivamente pelas probabilidades já fornecidas pela IA, métricas de vendas sem comissão interna, vínculo nullable orçamento→lead, extensão da timeline 360 com triagem e auditoria central de mudanças de etapa/responsável na ficha do lead.

| Item | Implementação | Evidência |
| --- | --- | --- |
| Metas e realizado | `GET/POST /api/crm/metas`, autorização de gestão, upsert por colaborador+mês e cálculo por fontes reais | `3ec7e85`; testes puros aprovados |
| Forecast | `GET /api/crm/forecast`, fórmula `valor_solicitado × probabilidade / 100`, sem backfill/recalculo | `0ba3288`; retorno `migration_pending` antes do schema |
| Métricas e orçamento→lead | `GET /api/crm/metricas-vendas` e `lead_id` nullable em `orcamentos_timbrados` | `b41c3a3`; sem vínculo histórico adivinhado |
| Timeline 360 | Triagem real e tabela real `public.orcamentos_timbrados`, com fallback failure-tolerant | `b574e82`; 40 testes de histórico |
| Auditoria do funil | Endpoint protegido, helper não bloqueante, cobertura de etapa/responsável em mover-funil e PATCH, e seção visual na FichaLead | `1863314`; 4 testes focais do item 6 |

As migrations `091`, `092`, `093` e `094` foram aplicadas em produção em 27/08/2026 pelo Editor SQL autenticado, após confirmação operacional. A confirmação pós-migration registrou os índices de metas, campos IA, `orcamentos_timbrados.lead_id`, índice parcial e função `crm_mover_funil`; `crm_metas_rows` e `orcamentos_vinculados_rows` permaneceram em zero durante o rollout. A aplicação foi feita por statements isolados após uma tentativa multi-statement que falhou e foi revertida explicitamente com `ROLLBACK`; não houve alteração de dados de negócio.

A fonte atual do ciclo comercial é `leads.created_at` até `contratos_gerados.data_assinatura`; contratos sem lead não entram no denominador do ciclo. O endpoint declara essa limitação e deverá usar histórico do funil em evolução posterior. Não foi inventada comissão: o comissionamento interno permanece **aguardando definição do cliente**.

A branch da Onda 2 foi promovida para `origin/main` no commit `2c338c8b40c767a69366874fc9b486539cfacf3d`. O deployment Coolify `vlb8ezviipjxyhmemek50rxg` terminou com **Success** em aproximadamente 4m38s; o novo container passou em healthcheck (**healthy**, código 0), o rolling update foi concluído e a aplicação permaneceu **Running**.

## Link público de coleta guiada de documentos

A funcionalidade foi implementada na branch isolada `feature-link-publico-coleta-documentos`, derivada da `origin/main` após a Onda 2, sem misturar o lote de responsividade mobile. O assistente público `/documentos/:token` é mobile-first, apresenta somente o próximo documento obrigatório calculado pelo `gerarMapaDocumentalCredito`, mostra progresso, finalidade, formatos aceitos e permite foto pela câmera do celular ou arquivo de até 25 MB.

A migration aditiva `095_coleta_documentos_publica.sql` cria `links_coleta_documentos` e `coleta_documentos`. O token aleatório de 24 bytes é armazenado somente como SHA-256, o link é escopado pela empresa resolvida no banco e há apenas um link ativo por empresa. O prazo adotado inicialmente é de **30 dias**, com geração de novo link para renovação/substituição; essa decisão foi documentada e deve ser confirmada ou ajustada pelo cliente.

| Camada | Implementação | Proteção/evidência |
| --- | --- | --- |
| Carregamento público | `GET /api/coleta-documentos/:token` | Rate limit, token hash, validade, status e resposta mínima sem e-mail, CNPJ, IDs, indicadores ou programas internos |
| Upload público | `POST /api/coleta-documentos/:token/upload` | Rate limit mais restritivo, um arquivo por vez, validação reutilizada do upload interno, empresa/item resolvidos pelo token e etapa atual |
| Staging e análise | `documentos_arquivos` com `coleta_status=staging` + `coleta_documentos` | Staging é excluído do Acervo/mapa oficial; Cartão CNPJ, QSA, Simples, Atos, faturamento, residência e contrato reutilizam os analisadores existentes; tipos sem analisador não são aprovados artificialmente |
| Promoção | Transação `promoteSubmission` | Só ocorre sem alerta alto/crítico; após promoção o staging é marcado como promovido e vinculado ao bloco documental oficial |
| Revisão humana | Endpoints internos de pendências e revisão | Aceitar promove; recusar mantém o arquivo fora do Acervo e registra follow-up para reenvio |
| Notificação | `empresa_followups` | Chegada, revisão, aceite e conclusão geram acompanhamento na estrutura já existente; nenhum canal paralelo foi criado |
| Ação interna | `Solicitar documentos` na ficha de Empresas | Gera/copia link, envia e-mail via Resend já configurado ou prepara WhatsApp via `wa.me` |

A seleção do passo percorre todas as etapas desbloqueadas do mapa, em vez de parar na etapa numérica inicial. Códigos documentais ainda ausentes da constraint legada são preservados como código solicitado no staging e usam o tipo físico seguro `outros` até revisão; não foi alterada nem recriada a constraint existente. O Acervo e o montador do dossiê ignoram staging, e o Cartão CNPJ possui override opcional não persistente para que a análise pública não substitua um laudo global antes da promoção.

A validação local foi concluída com `pnpm check`, teste focal `tests/coletaDocumentos.test.ts` com 5 testes, suíte completa com 61 arquivos e 586 testes, `pnpm build`, pré-renderização, budgets e `git diff --check`. A captura visual em viewport real de 390×844 confirmou o layout sem overflow e, após ajuste específico, sem o banner global de cookies cobrindo o CTA. A publicação em produção, aplicação da migration 095 e o teste ponta a ponta com empresas de teste dos regimes Simples Nacional e MEI ainda não foram executados nesta etapa; dependem de commit/push, rollout aditivo e autorização operacional específica.

## Itens ainda bloqueados por dependência externa ou decisão de negócio

Não foram inventados IDs de Meta Pixel, Google Ads, LinkedIn ou credenciais de WhatsApp Business API. Esses itens continuam aguardando os identificadores, provedor, token, número e regras de consentimento fornecidos pelo cliente. O roteamento automático e SLA continuam aguardando a aprovação do critério de distribuição, janela e responsável; nenhum algoritmo arbitrário foi introduzido.

A validação real de upload da foto do Administrador e a submissão de um cadastro de parceiro/captador não foram executadas para evitar alterar registros reais. Para o teste ponta a ponta desses dois passos, deve ser fornecido um colaborador/registro de teste ou autorização explícita para usar um cadastro controlado.

## Extensão: cofre documental público livre

Foi implementada em branch separada a modalidade de link público livre para recebimento de documentos de pessoa física ou jurídica, inclusive remetentes não cadastrados. O token é armazenado somente como hash SHA-256; cada envio identifica o remetente, aceita um arquivo por vez e exige consentimento. O arquivo é gravado pelo mesmo serviço de storage persistente, porém em tabela própria de cofre, sem inserir `documentos_arquivos` e sem preencher `empresa_id`, `cliente_pf_id` ou `lead_id`. Portanto, não aparece automaticamente em empresas, clientes PF, leads ou no Acervo Documental.

Cada primeiro envio cria um dossiê individual tokenizado, associado ao link livre, com identidade do remetente persistida. O token do dossiê é mantido apenas no navegador do remetente para que os próximos arquivos sejam gravados com o mesmo `dossie_id`; a identidade fica desabilitada para edição durante a continuidade. Um novo remetente ou uma nova pessoa deve iniciar outro dossiê, e o backend rejeita o uso de um token de dossiê em outro link. Assim, documentos de empresas ou pessoas físicas diferentes não são agrupados pela simples coincidência do link compartilhável.

A triagem interna autenticada permite listar, baixar, aceitar no próprio cofre ou recusar os itens, exibindo o identificador resumido do dossiê. A aceitação não cria vínculo oficial; eventual associação futura deverá ser uma ação interna deliberada e auditável. A modalidade atrelada a uma empresa permanece em `/documentos/:token`, continua usando `gerarMapaDocumentalCredito` como fonte do checklist e não foi substituída pelo cofre livre. A Onda 3/portal do cliente continua fora do escopo.

A validade inicial continua definida em 30 dias, como decisão provisória sujeita à confirmação do cliente. O link livre pode ser gerado novamente para novas campanhas sem invalidar links anteriores ainda válidos. Foram adicionadas as migrations aditivas `096_cofre_documentos_publico.sql` e `097_dossies_cofre_documentos_publico.sql`, o router `coletaDocumentosLivre.ts`, as telas públicas e internas correspondentes e testes de token, isolamento entre links, continuidade no mesmo dossiê, consentimento, staging separado e rejeição de `empresa_id` enviado pelo remetente.

A validação local da extensão anterior passou em `pnpm check`, nos testes focais combinados da coleta empresarial e do cofre livre (9 testes), e a correção de agrupamento passou no teste focal do cofre livre (5 testes). A suíte completa (`62` arquivos e `590` testes), o `pnpm build`, os budgets existentes, a pré-renderização e o `git diff --check` também passaram. Também foi feita inspeção visual local da tela pública em layout estreito, sem overflow observado. Ainda não foram aplicadas a migration `096` em produção, criados links reais, feitos uploads reais ou iniciado novo deployment; os commits estão isolados em `feature-cofre-publico-documentos` (`6cd04d6` e `fae0289`) para revisão e rollout posterior.

## Rollback

O rollback da aplicação da Onda 2 deve retornar ao código funcional de produção `21901bf`; o último registro documental anterior na `main` era `30ba3c8`. O deployment anterior da Onda 1 foi `fkk1pleycovjpc0snq3akync`, com **Success**, healthcheck **healthy** e aplicação **Running**. Como as migrations `091`–`094` são aditivas, o rollback da aplicação não remove as colunas, índices ou função criados; eventual limpeza de dados de teste deve ser deliberada e manual, nunca destrutiva por padrão.

## Arquivos principais

| Arquivo | Finalidade |
| --- | --- |
| `server/index.ts` | Guards de autoedição, endpoints de convite, bootstrap aditivo, integração CNPJ e indicação. |
| `client/src/pages/CadastroConvite.tsx` | Formulário público seguro de cadastro por convite. |
| `client/src/pages/colaborador/Usuarios.tsx` | Autoedição, foto opcional, geração, acompanhamento e aprovação de convites. |
| `client/src/pages/colaborador/Parceiros.tsx` | Geração/cópia de indicação rastreável no cadastro de parceiros. |
| `client/src/lib/analytics.ts` | Preservação de `ref`, UTMs e consentimento. |
| `server/routes/cnpj.ts` | Consulta CNPJ reutilizável com provedores existentes. |
| `server/services/empresaCnpjEnrichment.ts` | UPDATE puro e failure-tolerant do enriquecimento. |
| `server/services/referralService.ts` | Normalização e geração de códigos de indicação. |
| `db/migrations/089_indicacao_rastreavel.sql` | Estrutura aditiva de indicação. |
| `db/migrations/090_convites_cadastro.sql` | Estrutura aditiva de convites e vínculos. |
| `tests/cadastroConviteAuthorization.test.ts` | Regressão de token, aprovação e ausência de sessão automática. |
| `tests/referralService.test.ts` | Regressão de normalização e formato de links. |
| `tests/usuarioSelfEditAuthorization.test.ts` | Regressão da autoedição e hierarquia de terceiros. |
| `db/migrations/095_coleta_documentos_publica.sql` | Links tokenizados, staging e revisão da coleta pública. |
| `server/routes/coletaDocumentos.ts` | Rotas públicas, upload, análise, promoção, revisão e notificações. |
| `client/src/pages/ColetaDocumentos.tsx` | Assistente público mobile-first por token. |
| `client/src/components/documentos/SolicitarDocumentos.tsx` | Ação interna de geração e envio do link. |
| `tests/coletaDocumentos.test.ts` | Regressão de token, isolamento, etapa única, tipos e severidade. |
| `db/migrations/096_cofre_documentos_publico.sql` | Estrutura aditiva do cofre livre, sem vínculos oficiais automáticos. |
| `db/migrations/097_dossies_cofre_documentos_publico.sql` | Dossiês isolados por remetente e coluna `dossie_id` dos arquivos. |
| `server/routes/coletaDocumentosLivre.ts` | Geração de link, GET/POST público, upload separado, download e revisão autenticada. |
| `client/src/pages/ColetaDocumentosLivre.tsx` | Tela pública mobile-first para PF/PJ e um arquivo por envio. |
| `client/src/pages/colaborador/CofreDocumentosPublico.tsx` | Triagem interna autenticada do cofre livre. |
| `tests/coletaDocumentosLivre.test.ts` | Testes de token, isolamento, consentimento, staging e não vinculação. |
| `RELATORIO_IMPLEMENTACAO.md` | Este registro de implementação e evidências. |
