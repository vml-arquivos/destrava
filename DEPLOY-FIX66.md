# Deploy Destrava FIX66

Release esperada: `fix66-destinatarios-ranking-nexus-20260810`.

## Pré-requisito

Publique primeiro o Nexus FIX65. O Destrava passa a consumir o catálogo protegido disponibilizado por essa release.

## O que muda

- substitui o e-mail digitado por seletores de equipe e membro carregados do Nexus;
- mostra todos os perfis ativos, inclusive gestores e administradores;
- qualquer usuário autenticado que já tenha acesso ao cadastro pode criar a lista;
- adiciona a pontuação oficial do Nexus em cada item;
- responsável, recorrência, pontuação, aprovação, histórico e ranking continuam armazenados somente no Nexus;
- respostas HTML de 502/503/504 deixam de aparecer na tela e viram mensagem operacional segura;
- nenhuma tabela ou dado do Destrava é alterado.

## Variáveis

Mantenha:

```text
NEXUS_API_TOKEN=<mesmo valor de NEXUS_DESTRAVA_INTEGRATION_SECRET no Nexus>
NEXUS_WEBHOOK_URL=https://SEU-NEXUS/api/integracoes/destrava/tarefas
NEXUS_API_BASE_URL=https://SEU-NEXUS
```

`NEXUS_API_BASE_URL` é recomendado para o catálogo. Se não estiver definido, o sistema consegue derivá-lo quando `NEXUS_WEBHOOK_URL` usa a rota oficial acima.

As variáveis devem existir somente em runtime. No Coolify, deixe desmarcado **Available at Buildtime** para tokens, segredos e credenciais.

## Validação após publicar

1. Confirme:

   ```bash
   curl -fsS https://SEU-DESTRAVA/version
   ```

2. A resposta deve informar esta FIX66.
3. Entre com um usuário comum, abra uma empresa e clique em **Criar tarefa no Nexus**.
4. Confirme que equipes e membros carregam automaticamente e que um gestor pode ser escolhido.
5. Crie dois itens com membros, datas, frequências e níveis diferentes.
6. No Nexus, confirme uma única lista, itens separados e pontos lançados somente depois da aprovação.

## Rollback

Republique a imagem anterior. Não há migration nova nem dados locais para desfazer.
