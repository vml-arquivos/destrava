# Permissões e sistema de trava

## Regra de acesso

As rotas de dossiê, relatório, PDF e mapa validam a sessão, a empresa solicitada e o vínculo do colaborador com a empresa. Usuários com permissão ampla podem consultar empresas autorizadas pela política existente. Os demais precisam ser responsável, analista ou captador da empresa.

O modo **interno** exige adicionalmente permissão de gestão. Alterar `modo=institucional` para `modo=interno` sem essa permissão retorna `403`. A checagem ocorre no backend e não depende da visibilidade de botões no frontend.

| Recurso | Controle |
|---|---|
| Dossiê da empresa | Sessão e vínculo com a empresa. |
| Relatório institucional | Sessão e vínculo com a empresa. |
| PDF institucional | Sessão e vínculo com a empresa. |
| Relatório/PDF interno | Sessão, vínculo com a empresa e permissão de gestão. |
| Arquivo de origem | Rota protegida de documento e vínculo do arquivo. |
| Sócios e documentos pessoais | Incluídos conforme o dossiê e as permissões aplicáveis. |

## Separação de dados

O modo institucional não serializa os itens da ficha interna no módulo da empresa. O modo interno é explícito, autenticado e autorizado no servidor. A renderização HTML escapa valores textuais antes de inseri-los no PDF, impedindo que nomes ou campos extraídos sejam interpretados como marcação.

## Auditoria e não destruição

A geração do relatório cria snapshot na persistência documental existente. A classificação modular não apaga arquivo, ID, autor ou datas. Reclassificações futuras devem preservar a origem e registrar a mudança.

## Limitações conhecidas

O controle de acesso específico do download/visualização de cada documento deve continuar sendo aplicado pela rota de arquivos. Este módulo não substitui as políticas gerais de autenticação nem cria uma URL pública para documentos.

## Referências

[1]: ../../server/routes/documentacao.ts "Autorização das rotas documentais"
[2]: ../../server/index.ts "Políticas gerais de acesso empresarial"
[3]: ../../server/services/documentStorage.ts "Armazenamento e resolução de arquivos"
