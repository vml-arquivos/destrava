# Destrava Crédito — Site Institucional

Site institucional completo da **Destrava Crédito**, com simulador de empréstimos, captura de leads, landing pages de produtos e painel interno para colaboradores.

## Tecnologias

| Camada | Tecnologia |
| :--- | :--- |
| Frontend | React 18 + TypeScript + Tailwind CSS 4 |
| Roteamento | Wouter |
| Build | Vite 7 |
| Backend | Express.js + Node.js 20 |
| Banco de dados | PostgreSQL 17 (nativo) |
| Deploy | Coolify + Docker |
| Automação | n8n |

## Funcionalidades

### Páginas Principais

- **Home** — Landing page institucional com hero, produtos e depoimentos
- **Simulador Público** (`/simular`) — Simulador com captura de leads integrada
- **Blog** — Artigos sobre crédito e finanças
- **Sobre / Contato** — Institucional e formulário de contato

### Painel Interno (`/colaborador`)

- **Dashboard** — Estatísticas de leads, simulações e conversões
- **CRM / Pipeline** — Kanban de leads por etapa do funil
- **Simulações** — Histórico de simulações realizadas pelos colaboradores
- **Integrações** — Configuração de webhooks n8n

### API Backend

| Endpoint | Método | Descrição |
| :--- | :--- | :--- |
| `/api/health` | GET | Health check |
| `/api/leads` | POST | Criar novo lead (público) |
| `/api/leads` | GET | Listar leads (requer auth) |
| `/api/leads/:id` | PATCH | Atualizar lead (requer auth) |
| `/api/simulacoes` | POST | Registrar simulação (requer auth) |
| `/api/simulacoes` | GET | Listar simulações (requer auth) |
| `/api/stats` | GET | Estatísticas gerais (requer auth) |
| `/api/crm/pipeline` | GET | Pipeline CRM (requer auth) |

> **Autenticação:** JWT via header `Authorization: Bearer <token>`, com autorização por papel para endpoints administrativos.

## Instalação e Desenvolvimento

```bash
# Clonar repositório
git clone https://github.com/vml-arquivos/destrava.git
cd destrava

# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com os valores corretos

# Iniciar em desenvolvimento
pnpm dev
```

## Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha os valores. **Nunca commite o arquivo `.env`.**

As variáveis obrigatórias são:

| Variável | Descrição |
| :--- | :--- |
| `DATABASE_URL` | Connection string PostgreSQL |
| `JWT_SECRET` | Segredo JWT (`openssl rand -hex 48`) |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `SITE_DOMAIN` | `destravacredito.com` |
| `N8N_WEBHOOK_URL` | URL do webhook n8n |

Em produção, todas as variáveis são injetadas pelo **Coolify** em runtime — nunca ficam no repositório.

## Build e Deploy

O deploy é feito automaticamente pelo **Coolify** a cada push na branch `main`.

```bash
# Build local (para teste)
pnpm build

# Iniciar em produção (local)
pnpm start
```

O `docker-entrypoint.sh` executa a migração do banco (`db/migrate.sql`) automaticamente antes de iniciar o servidor em todo redeploy.

## Criar Primeiro Colaborador

Após o primeiro deploy, execute dentro do container via terminal do Coolify:

```bash
docker exec -it <container_id> sh

NOME="Nome Completo" EMAIL="email@destravacredito.com.br" SENHA="Senha@123" CARGO="Administrador" \
  node scripts/create-user.mjs
```

## Estrutura do Projeto

```
destrava/
├── client/src/
│   ├── components/     # Componentes reutilizáveis
│   ├── pages/          # Páginas da aplicação
│   ├── lib/            # Utilitários e tipos
│   └── contexts/       # Contextos React
├── server/
│   └── index.ts        # Backend Express + API
├── db/                 # Migrações SQL (PostgreSQL nativo)
│   ├── migrate.sql     # Migração principal (idempotente)
│   └── migrate_delta.sql
├── scripts/
│   ├── migrate-db.mjs  # Executor de migração
│   ├── create-user.mjs # Criar colaborador
│   └── db-inspect.mjs  # Diagnóstico do banco
├── Dockerfile
├── docker-entrypoint.sh
└── .env.example
```

## Contato

- **WhatsApp:** (61) 3526-8355
- **Site:** destravacredito.com
- **Localização:** Brasília — DF
