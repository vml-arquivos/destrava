# Correções da integração de tarefas — Destrava → Nexus

## Modal e fonte única

- O modal segue a identidade visual institucional da Destrava e o mesmo contrato funcional usado pelo Nexus.
- O título é gerado a partir da entidade carregada novamente pelo servidor: `Tarefa para empresa — Nome` ou `Tarefa para Cliente PF — Nome`.
- Título, nome, documento e contexto não dependem de valores livres enviados pelo navegador.
- A tarefa é armazenada somente no Nexus. O Destrava é um criador remoto autenticado e não mantém uma lista paralela.
- A chave `destrava_manual:{tipo}:{entidade}:{client_request_id}` protege retry e duplo clique sem colidir duas criações legítimas.

## Checklist canônico

Cada item envia e preserva:

- ID próprio;
- texto e descrição;
- data;
- e-mail do responsável Nexus;
- frequência `unica`, `diaria`, `semanal` ou `mensal`;
- dia da semana ou do mês quando aplicável.

A frequência é individual. A mesma lista pode ter, por exemplo, uma conferência diária, reunião semanal, fechamento mensal e envio único. O Nexus lembra o mesmo item e nunca duplica a lista.

## Compatibilidade e segurança

- E-mail informado é validado pelo Nexus dentro da organização; falha recusa a lista inteira.
- Sem e-mail por item, permanece o responsável principal resolvido pela integração.
- O backend Nexus continua aceitando o contrato legado e converte o antigo lembrete geral em recorrência dos itens durante implantação desencontrada.
- Nenhuma tabela local de tarefas foi criada no Destrava.

## Gate executado

- `npm run build`, incluindo TypeScript, Vite, prerender, orçamento de bundle e bundle do servidor.
- 37 testes de integração Nexus aprovados.
- 38 testes de hardening Nexus aprovados.
- A suíte ampla confirmou os blocos já executados, mas mantém um open handle pré-existente do Vitest após os testes; isso não é falha das asserções desta alteração.

Publicar o Nexus primeiro e depois o Destrava. Em homologação, validar uma Empresa e um Cliente PF com itens de frequências e responsáveis diferentes.
