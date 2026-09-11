# Entrega — Configuração Premium de Menu e Funções

## Resumo

Foi implementada uma configuração administrativa para controlar quais módulos aparecem no menu do sistema e quais funções ficam disponíveis por usuário.

A configuração fica disponível em:

`/colaborador/configuracao-funcoes`

E aparece no menu em:

`Gestão > Menu e Funções`

## O que foi criado

### Backend

- `server/services/featureAccessService.ts`
- `GET /api/configuracao-funcoes/me`
- `GET /api/configuracao-funcoes`
- `PUT /api/configuracao-funcoes`

A configuração é salva em JSON no diretório persistente do sistema:

`DATA_DIR/configuracoes/funcoes-menu.json`

Isso evita migration e não altera o schema do banco.

### Frontend

- `client/src/config/featureCatalog.ts`
- `client/src/hooks/useFeatureAccess.ts`
- `client/src/pages/colaborador/ConfiguracaoFuncoes.tsx`

Também foram ajustados:

- `client/src/pages/colaborador/Layout.tsx`
- `client/src/App.tsx`

## Funcionalidades

- Marcar/desmarcar funções que aparecem para todos.
- Criar exceções por usuário.
- Permitir que uma função oculta globalmente apareça para um usuário específico.
- Ocultar uma função apenas para um usuário específico.
- Mostrar mensagem amigável quando um usuário tenta acessar uma função ocultada.
- Manter a configuração de Menu e Funções sempre acessível para Administrador.

## Funções catalogadas

- Dashboard
- Funil de Vendas
- Triagem de Leads
- Simulações
- Calculadora
- Orçamentos
- Clientes PJ
- Clientes PF
- Relatórios PJ
- Cadastros Incompletos
- Central de Assessoria
- Diagnóstico de Crédito
- Acompanhamento Bancário
- Acompanhamento Financeiro
- Faturamento
- Contratos
- Contadores
- Integrações n8n
- Usuários
- Menu e Funções

## Garantias de zero regressão

- Nenhuma migration criada.
- Nenhuma rota antiga removida.
- Nenhum documento apagado.
- Nenhum acompanhamento apagado.
- Nenhuma semana apagada.
- Nenhuma alteração destrutiva no banco.
- Nenhuma alteração destrutiva no storage.
- A configuração apenas controla visibilidade e acesso operacional no frontend.
- Regras hierárquicas existentes por cargo continuam preservadas.

## Validações executadas

- `pnpm run check`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run build`
- `pnpm test -- --run`

Resultado:

- TypeScript aprovado.
- Build aprovado.
- 380 testes aprovados.
