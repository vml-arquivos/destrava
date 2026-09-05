# Leitura automática e regras documentais

Versão: 2026-09-05  
Escopo: catálogo documental, upload, extração, classificação, validade, matriz por natureza jurídica/regime e reprocessamento.

## Resultado implementado

- Os 141 tipos anexáveis do catálogo têm configuração efetiva de leitura automática.
- 105 tipos conservam configuração especializada ou prompt próprio; os 36 restantes usam o extrator genérico conservador, nunca o parser de contrato como substituto indevido.
- Upload, análise manual e backfill usam o mesmo despachante de análise; não existem três decisões divergentes sobre qual leitor executar.
- Os campos comprovados são exibidos no card do arquivo, inclusive CNPJ/CPF, razão social, órgão emissor/registral, número/protocolo, competência, emissão, validade, situação e valores explicitamente rotulados.
- Campos ausentes, ilegíveis ou inferidos não são tratados como comprovados. A análise falha de forma fechada e pede revisão humana.
- Laudos possuem assinatura por arquivo, prompt, classificador, extrator, regra e schema. Mudança de versão torna o laudo antigo obsoleto e elegível a reprocessamento.

## Fluxo operacional

1. O upload valida entidade, tipo catalogado, tamanho, extensão, MIME e assinatura real do conteúdo.
2. O arquivo é persistido e recebe hash SHA-256.
3. O tipo do catálogo seleciona o motor especializado ou o extrator genérico.
4. PDF textual é lido localmente; PDF escaneado e imagens seguem para OCR; CSV, DOCX e XLSX são lidos como conteúdo estruturado.
5. O classificador confronta tipo declarado e tipo detectado.
6. As regras conferem campos essenciais, competência, emissão, validade e situação documental.
7. O laudo e as evidências são persistidos e apresentados no arquivo/dossiê.
8. Falha transitória entra em retentativa automática; arquivo/laudo antigo entra em backfill versionado.

## Arquivos e limites

| Formato | Validação | Leitura |
|---|---|---|
| PDF | extensão, MIME e cabeçalho `%PDF-` | texto local; OCR nas páginas sem texto |
| JPG/JPEG | extensão, MIME e bytes iniciais JPEG | OCR |
| PNG | extensão, MIME e assinatura PNG | OCR |
| WebP | extensão, MIME e cabeçalhos RIFF/WEBP | OCR |
| CSV | extensão, MIME, texto UTF-8 plausível e ausência de byte nulo | leitura estruturada |
| DOCX | extensão, MIME, ZIP e presença de `word/` | XML estruturado |
| XLSX | extensão, MIME, ZIP e presença de `xl/` | planilhas estruturadas |

Limite efetivo: 20 MB para contrato social, alteração contratual e contrato gerado; 10 MB para os demais tipos. O limite bruto do middleware é 25 MB, mas a regra específica sempre é aplicada antes da gravação.

Configuração padrão do OCR local:

- idiomas `por+eng`;
- até 12 páginas por documento, configurável até o limite técnico de 30;
- 180 DPI;
- timeout de 120 segundos;
- PDF textual com timeout de 15 segundos e buffer de 16 MB.

## Matriz societária

| Natureza/situação | Documentação societária principal | Registro correto |
|---|---|---|
| MEI/SIMEI | CCMEI; não exigir contrato social | formalização eletrônica/CCMEI |
| Empresário Individual não MEI | Requerimento de Empresário ou instrumento de inscrição e alterações | Junta Comercial |
| Sociedade Empresária Limitada | contrato social/consolidação/última alteração e cadeia necessária | Junta Comercial |
| Sociedade Anônima | ata de constituição, estatuto e atas vigentes | Junta Comercial |
| Cooperativa | estatuto e atas vigentes | Junta Comercial |
| Associação ou fundação privada | estatuto/atas e comprovação do registro civil | RCPJ/Cartório de Pessoas Jurídicas; não Junta Comercial |
| Sociedade de advocacia ou sociedade unipessoal de advocacia | ato constitutivo/alterações e registro correspondente | OAB Seccional; não Junta Comercial/RCPJ como registro constitutivo profissional |

A natureza jurídica e o regime tributário são dimensões separadas. “Empresário Individual” não significa automaticamente MEI; a dispensa societária só ocorre quando o enquadramento MEI/SIMEI estiver efetivamente comprovado.

## Matriz fiscal por regime

| Regime confirmado | Documentos centrais | Não exigir como regra geral |
|---|---|---|
| MEI/SIMEI | CCMEI, PGMEI/DAS-MEI, DASN-SIMEI e relatório mensal de receitas quando necessário | contrato social, PGDAS-D convencional, DEFIS, ECD/ECF padrão |
| Simples Nacional | consulta de opção, PGDAS-D mensal, DEFIS anual e recibos | ECF/ECD como regra geral, salvo obrigação/exceção comprovada |
| Não optante, regime ainda incerto | ECF, DCTF/DCTFWeb-MIT, DARF ou Livro Caixa como evidência, sem inferir regime por ausência | PGDAS/DEFIS |
| Lucro Presumido | ECF, DCTFWeb/MIT a partir de 01/2025, DARF e demonstrações aplicáveis | PGDAS/DEFIS |
| Lucro Real | ECF, ECD quando obrigada, DCTFWeb/MIT, EFD aplicável e demonstrações contábeis | PGDAS/DEFIS |
| Lucro Arbitrado | ECF/DARF e evidência explícita da forma de apuração | PGDAS/DEFIS |
| Imune/isenta | documentos de imunidade/isenção, estatuto/atas e obrigações efetivamente aplicáveis | não presumir dispensa sem evidência |

Para fatos geradores a partir de janeiro de 2025, o sistema trata DCTFWeb/MIT como trilha atual; competências até dezembro de 2024 continuam históricas na DCTF PGD quando aplicável.

## Regras temporais e validade

| Política | Resultado atual | Condição de reprovação/alerta |
|---|---|---|
| Validade expressa | aceita até a data final indicada | vencida = `FORA_JANELA`; sem data exigida = `NAO_VERIFICADO` |
| Emissão em até 30 dias | política operacional para consulta/cadastro | emissão mais antiga não comprova estado atual |
| Emissão em até 60 dias | política operacional para comprovante de endereço | emissão mais antiga não comprova endereço atual |
| Competência mensal | mês corrente ou último mês fechado = `ATUAL` | dois ou mais meses anteriores = `HISTORICO`; mês futuro = `FUTURO` |
| Competência anual | ano anterior = atual quando já exigível; ano corrente = `AINDA_NAO_EXIGIVEL` | ano futuro = `FUTURO`; anos mais antigos = `HISTORICO` |
| Rolling 12 meses | exige meses identificáveis, sem duplicação | lacunas impedem total confirmado e geram pendência |
| ECF regular | último dia útil de julho do ano seguinte ao ano-calendário | antes do prazo não marcar omissão; situações especiais exigem regra própria/versionada |

Os prazos de 30 e 60 dias acima são políticas operacionais de análise de crédito, não uma declaração de validade legal universal. Quando o próprio documento ou a fonte oficial trouxer validade, prevalece a data expressa. Regras excepcionais e exigências particulares de bancos devem entrar como configuração versionada, com fundamento e vigência, sem substituir silenciosamente a regra geral.

## Estados fail-closed

| Estado | Significado operacional |
|---|---|
| `ATUAL` | identidade e temporalidade comprovam o requisito |
| `HISTORICO` | preservado como evidência, mas não comprova a situação atual |
| `FORA_JANELA` | vencido ou fora da janela operacional |
| `AINDA_NAO_EXIGIVEL` | período ainda não exigível; não tratar como atraso |
| `FUTURO` | data/competência futura; nunca aprovar automaticamente |
| `NAO_VERIFICADO` | faltou evidência obrigatória de data/competência/validade |
| `NAO_APLICAVEL` | regra documentada não se aplica à empresa/período |

Um arquivo só satisfaz automaticamente o requisito quando a identidade é `IDENTIFICADO` e a temporalidade é `ATUAL` ou `NAO_APLICAVEL`. Tipo incompatível, texto insuficiente, data futura, vencimento, campo essencial ausente ou baixa confiança requerem revisão.

## EFD e dados estruturados

- EFD-Contribuições lê período e registros M400/M800.
- M400 (PIS) e M800 (Cofins) da mesma base econômica são conciliados; não são somados como duas receitas.
- EFD ICMS/IPI lê E110 e separa débitos, créditos e imposto a recolher.
- CSV/XLSX preservam as linhas/células como evidência textual para o mesmo pipeline de classificação.
- Dados inferidos permanecem separados de `campos_comprovados`.

## Persistência, retentativa e reprocessamento

- Retentativa automática padrão: a cada 5 minutos, lote de 25, máximo de 5 tentativas.
- Jobs abandonados em `PROCESSANDO` por mais de 30 minutos são rearmados pela migração.
- A fila registra assinatura-alvo, versão do prompt e versão do motor.
- Versões atuais: classificador `2026.09.05`, extrator `local-2026.09.04`, regras `rules-2026.09.05.1`, schema `laudo-104`.
- QSA usa prompt `5.1.0`; prompts genéricos `catalogo_*` usam `2.0.0`; os demais especializados usam `1.0.0`.

## Implantação segura

Pré-requisitos: Node.js 22, pnpm compatível com o lockfile, PostgreSQL acessível e binários `pdftotext`, `pdftoppm`, `tesseract` e `unzip` presentes no container.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm migrate -- --dry-run
pnpm migrate
pnpm backfill:laudos -- enqueue-and-run --retry-failed
```

O container usa `MIGRATE_ON_STARTUP=false` por padrão. A migração deve ser validada em transação com `--dry-run`, aplicada uma vez e só depois seguida pelo backfill. O executor usa checksum, lock transacional e tabela de histórico; uma falha executa rollback e encerra com código não zero.

Antes do deploy, faça backup verificável do PostgreSQL e dos volumes documentais. Para rollback de aplicação, restaure a imagem anterior; não remova colunas/tabelas da migração 104. Os dados novos são aditivos e laudos antigos ficam versionados, não apagados.

## Variáveis relevantes

```dotenv
GEMINI_DOCUMENT_OCR_ENABLED=true
LOCAL_OCR_ENABLED=true
LOCAL_OCR_LANGUAGES=por+eng
LOCAL_OCR_MAX_PAGES=12
LOCAL_DOCUMENT_CONFIDENCE_MIN=0.72
DOCUMENT_ANALYSIS_RETRY_INTERVAL_MS=300000
DOCUMENT_ANALYSIS_RETRY_BATCH=25
DOCUMENT_ANALYSIS_MAX_RETRIES=5
BACKFILL_MAX_ATTEMPTS=5
MIGRATE_ON_STARTUP=false
ENABLE_ADMIN_SQL=false
```

## Fontes oficiais verificadas em 05/09/2026

- Portal Empresas & Negócios — MEI, CCMEI e inexistência de contrato social: https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/perguntas-frequentes
- DREI — atos constitutivos de EI, LTDA, S.A. e cooperativa: https://www.gov.br/empresas-e-negocios/pt-br/drei/orientacoes-de-abertura/ato-constitutivo-da-empresa/quero-elaborar-o-ato-constitutivo-de-empresa
- JUCEMAT — associação registrada no RCPJ, não na Junta Comercial: https://www.jucemat.mt.gov.br/faqs/354
- Lei nº 6.015/1973 — atos constitutivos, estatutos, fundações e associações no RCPJ: https://www.planalto.gov.br/ccivil_03/leis/l6015compilada.htm
- OAB Conselho Federal — registro de sociedades de advocacia na OAB Seccional: https://www.oab.org.br/util/print?numero=23/1965&origem=Provimentos&print=Legislacao
- Receita Federal — prazo regular da ECF: https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/ecf/ecf
- Portal de Serviços — PGDAS-D mensal: https://www.gov.br/pt-br/servicos/declarar-apuracoes-mensais-do-simples-nacional
- Portal de Serviços — DEFIS anual: https://www.gov.br/pt-br/servicos/declarar-apuracoes-e-informacoes-anuais-do-simples-nacional
- Portal de Serviços — DCTFWeb/MIT desde 01/2025: https://www.gov.br/pt-br/servicos/declarar-debitos-e-creditos-tributarios-federais

## Limites que exigem operação humana

- Arquivo criptografado, corrompido, ilegível ou com páginas além do limite configurado não pode ser validado automaticamente.
- A IA não substitui documento faltante, autenticação externa, assinatura, registro ou consulta à fonte emissora.
- A exigência de cada instituição financeira pode mudar; regras bancárias devem ser revisadas/configuradas por produto e vigência.
- Alterações legais, prorrogações excepcionais e calendários estaduais/municipais devem ser atualizados como nova versão de regra antes de serem usados para decisão.
- A validação local não aplicou migração em banco de produção nem navegou no ambiente publicado, pois não foi fornecido URL/sessão de acesso nesta execução.
