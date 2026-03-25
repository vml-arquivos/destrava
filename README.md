# Destrava Crédito - Site Institucional

Site institucional completo da **Destrava Crédito**, com simulador de empréstimos, captura de leads, landing pages de produtos e backend dinâmico para persistência de dados.

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS 4 |
| Roteamento | Wouter |
| Build | Vite 7 |
| Backend | Express.js + Node.js |
| Deploy | PM2 + Nginx |
| Hospedagem | Google Cloud VPS |

## Funcionalidades

### Páginas Principais
- **Home** - Landing page institucional com hero, produtos e depoimentos
- **Simulador** - Simulador completo de empréstimos
- **Captura de Leads** (`/simular`) - Formulário com simulador integrado para captura de leads
- **Blog** - Artigos sobre crédito e finanças
- **FAQ** - Perguntas frequentes
- **Sobre** - Sobre a empresa
- **Contato** - Formulário de contato

### Produtos / Serviços
- **Crédito Empresarial** (`/credito-empresas`) - PRONAMPE, Giro CAIXA Fácil, PRONAMP, médio/grande porte
- **Crédito Pessoal** (`/credito-pessoal`) - Consignado, pessoal, imobiliário, veículo
- **Rating Banco do Brasil** (`/rating-banco-brasil`) - Consulta e melhoria de rating
- **Certificado Digital** (`/certificado-digital`) - A1 e A3 para PF e PJ
- **Consulta SPC/Serasa** (`/consulta-spc-serasa`) - CPF e CNPJ
- **Limpa Nome CPF** (`/limpa-nome`) - Regularização de CPF
- **Limpa Nome CNPJ** (`/limpa-nome-cnpj`) - Regularização de CNPJ
- **Calculadora Score** (`/calculadora-score`) - Simulação de score

### Backend API
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/health` | GET | Health check |
| `/api/leads` | POST | Criar novo lead |
| `/api/leads` | GET | Listar leads (admin) |
| `/api/leads/:id` | PATCH | Atualizar status do lead (admin) |
| `/api/simulacoes` | POST | Registrar simulação |
| `/api/simulacoes` | GET | Listar simulações (admin) |
| `/api/contato` | POST | Enviar mensagem de contato |
| `/api/contatos` | GET | Listar contatos (admin) |
| `/api/stats` | GET | Estatísticas gerais (admin) |

> **Admin:** Adicione o header `x-admin-key: SEU_ADMIN_KEY` nas requisições de admin.

## Instalação e Desenvolvimento

```bash
# Clonar repositório
git clone https://github.com/vml-arquivos/destrava.git
cd destrava

# Instalar dependências
pnpm install

# Iniciar em desenvolvimento
pnpm dev
```

## Build e Deploy

```bash
# Build para produção
pnpm build

# Iniciar em produção
pnpm start

# Deploy completo na VPS
bash deploy.sh

# Configurar Nginx
sudo bash nginx-setup.sh destravacredito.com.br
```

## Variáveis de Ambiente

Copie `.env.example` para `.env` e configure:

```env
NODE_ENV=production
PORT=3000
DATA_DIR=/var/data/destrava
ADMIN_KEY=sua-chave-secreta-aqui
SITE_DOMAIN=destravacredito.com.br
WHATSAPP_NUMBER=5561986055223
```

## Estrutura do Projeto

```
destrava/
├── client/
│   └── src/
│       ├── components/     # Componentes reutilizáveis
│       ├── pages/          # Páginas da aplicação
│       ├── data/           # Dados estáticos (produtos, blog)
│       └── contexts/       # Contextos React
├── server/
│   └── index.ts            # Backend Express com API
├── data/                   # Dados persistidos (leads, simulações)
├── dist/                   # Build de produção
├── ecosystem.config.js     # Configuração PM2
├── nginx-setup.sh          # Script de configuração Nginx
└── deploy.sh               # Script de deploy automatizado
```

## Acesso Admin

Para acessar os dados de leads e simulações, use a API com o header de autenticação:

```bash
# Listar leads
curl -H "x-admin-key: destrava2024admin" https://destravacredito.com.br/api/leads

# Estatísticas
curl -H "x-admin-key: destrava2024admin" https://destravacredito.com.br/api/stats
```

## Contato

- **WhatsApp:** (61) 9 8605-5223
- **E-mail:** contato@destravacredito.com.br
- **Localização:** Brasília - DF
