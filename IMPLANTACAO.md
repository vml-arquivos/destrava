# Guia de Implantação - Destrava Crédito

## 📋 Visão Geral

Site completo multi-página para o serviço **Giro CAIXA Fácil** da Destrava Crédito, correspondente bancário autorizado da CAIXA Econômica Federal.

### Tecnologias Utilizadas
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Routing**: Wouter
- **Build**: Vite
- **Deploy**: Manus Platform

---

## 🚀 Implantação Rápida

### 1. Publicar o Site

1. Acesse o **Management Dashboard** (painel à direita)
2. Clique no botão **"Publish"** no canto superior direito
3. Aguarde o processo de build e deploy (1-2 minutos)
4. Seu site estará disponível em: `https://[seu-dominio].manus.space`

### 2. Configurar Domínio Personalizado (Opcional)

1. Acesse **Settings → Domains** no Management Dashboard
2. Adicione seu domínio personalizado (ex: `www.destravacredito.com.br`)
3. Configure os registros DNS conforme instruções exibidas
4. Aguarde propagação DNS (até 48 horas)

---

## 🔧 Configurações Pós-Implantação

### Atualizar Favicon

O favicon atual é genérico. Para substituir pela logo da Destrava Crédito:

1. Acesse **Settings → General** no Management Dashboard
2. Faça upload da logo em formato `.ico`, `.png` ou `.svg`
3. O favicon será atualizado automaticamente

### Integrar Webhook de Formulários

Quando tiver a URL do webhook para receber leads:

1. Edite o arquivo `client/src/pages/Simulacao.tsx`
2. Localize a função `handleSubmit`
3. Substitua o redirecionamento por uma chamada POST:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSubmitting(true);

  try {
    const response = await fetch('SUA_URL_WEBHOOK_AQUI', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    if (response.ok) {
      router('/sucesso');
    } else {
      toast.error('Erro ao enviar formulário. Tente novamente.');
    }
  } catch (error) {
    toast.error('Erro de conexão. Verifique sua internet.');
  } finally {
    setIsSubmitting(false);
  }
};
```

4. Repita o processo para `client/src/pages/Home.tsx` (formulário da home)

### Adicionar Google Analytics

Para rastrear acessos e conversões:

1. Crie uma propriedade no Google Analytics 4
2. Copie o ID de medição (formato: `G-XXXXXXXXXX`)
3. Edite `client/index.html` e adicione antes do `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Configurar Meta Pixel (Facebook Ads)

Para rastrear conversões de anúncios:

1. Acesse o Gerenciador de Eventos do Facebook
2. Crie um Pixel e copie o código
3. Cole no `client/index.html` antes do `</head>`
4. Configure eventos personalizados nos formulários

---

## 📄 Estrutura de Páginas

| Página | URL | Descrição | SEO Priority |
|--------|-----|-----------|--------------|
| **Home** | `/` | Landing page principal com hero, benefícios, FAQ e formulário | 1.0 |
| **Sobre** | `/sobre` | Página institucional com missão, visão e valores | 0.8 |
| **Giro CAIXA Fácil** | `/giro-caixa-facil` | Detalhes do produto principal | 0.9 |
| **Simulação** | `/simulacao` | Formulário de contato e simulação | 0.9 |
| **Simulador** | `/simulador` | Calculadora interativa de crédito (7 produtos) | 0.9 |
| **Blog** | `/blog` | Lista de artigos | 0.7 |
| **Artigo** | `/blog/:slug` | Template de artigo individual | 0.6 |
| **Política** | `/politica-privacidade` | Política de privacidade | 0.3 |
| **Termos** | `/termos-uso` | Termos de uso | 0.3 |
| **Sucesso** | `/sucesso` | Confirmação de envio de formulário | - |

---

## 🎯 SEO Implementado

### ✅ Meta Tags Completas
- Title tags otimizados para cada página
- Meta descriptions únicas (150-160 caracteres)
- Keywords relevantes para o nicho
- Open Graph tags para redes sociais
- Twitter Cards

### ✅ Structured Data (JSON-LD)
- **Organization**: Dados da empresa
- **LocalBusiness**: Informações de contato
- **Service**: Produtos de crédito
- **FAQPage**: Perguntas frequentes
- **Article**: Artigos do blog
- **BreadcrumbList**: Navegação estruturada

### ✅ Arquivos SEO
- `robots.txt`: Permite indexação de todas as páginas
- `sitemap.xml`: Mapa do site com 11 URLs
- Canonical URLs em todas as páginas
- Alt text em todas as imagens

### ✅ Performance
- Lazy loading de imagens
- Componentes otimizados
- CSS minificado (Tailwind)
- Build otimizado com Vite

---

## 📱 Contatos e Integrações

### WhatsApp
- **Número**: +55 61 98605-5223
- **Formato de link**: `https://wa.me/5561986055223`
- Botões de WhatsApp presentes em:
  - Header (menu fixo)
  - Hero da Home
  - Página de Sucesso
  - Footer

### Redes Sociais (Placeholders)
Atualize os links no arquivo `client/src/components/Footer.tsx`:

```typescript
// Linha ~85
<a href="https://facebook.com/destravacredito" ...>
<a href="https://instagram.com/destravacredito" ...>
<a href="https://linkedin.com/company/destravacredito" ...>
```

---

## 🎨 Personalização de Cores

As cores da CAIXA estão configuradas em `client/src/index.css`:

```css
:root {
  --color-caixa-blue: oklch(0.35 0.15 250);        /* #0033A0 */
  --color-caixa-blue-dark: oklch(0.25 0.15 250);   /* #00244D */
  --color-caixa-yellow: oklch(0.80 0.15 85);       /* #FFB400 */
}
```

Para alterar, edite os valores OKLCH mantendo a estrutura.

---

## 📊 Palavras-Chave Principais

### Primárias
- giro caixa facil
- capital de giro
- credito empresarial
- emprestimo mei
- credito caixa

### Secundárias
- destrava credito
- correspondente bancario caixa
- financiamento empresa
- credito pequena empresa
- assessoria credito empresarial

### Long-tail
- como conseguir capital de giro caixa
- documentos necessarios credito empresarial
- taxa de juros giro caixa facil
- correspondente bancario autorizado caixa
- simulador credito empresarial caixa

---

## 🔒 Segurança e Compliance

### LGPD
- Política de Privacidade implementada
- Termos de Uso implementados
- Disclaimer legal em todas as páginas
- Formulários com consentimento explícito

### Disclaimers Obrigatórios
Presente em todas as páginas (rodapé):

> *Sujeito à análise e aprovação da CAIXA. Condições variam conforme perfil. Destrava Crédito atua como Correspondente / Assessoria.*

---

## 📈 Próximos Passos Recomendados

### Curto Prazo (1-2 semanas)
1. ✅ Publicar o site
2. ✅ Configurar Google Analytics
3. ✅ Integrar webhook de formulários
4. ✅ Atualizar favicon
5. ✅ Configurar Meta Pixel (se usar Facebook Ads)
6. ✅ Testar todos os formulários em produção
7. ✅ Submeter sitemap ao Google Search Console

### Médio Prazo (1 mês)
1. Criar mais artigos para o blog (SEO)
2. Implementar chat ao vivo (Tawk.to, JivoChat)
3. Adicionar depoimentos reais de clientes
4. Criar landing pages específicas para campanhas
5. Implementar A/B testing nos CTAs
6. Configurar remarketing (Google Ads + Meta)

### Longo Prazo (3-6 meses)
1. Desenvolver área do cliente (login)
2. Integrar API da CAIXA (se disponível)
3. Sistema de acompanhamento de propostas
4. Calculadora de ROI avançada
5. Integração com CRM (RD Station, HubSpot)
6. Programa de indicação de clientes

---

## 🆘 Suporte e Manutenção

### Atualizar Conteúdo

Para atualizar textos, imagens ou informações:

1. Acesse o Management Dashboard
2. Vá em **Code** (painel lateral)
3. Navegue até o arquivo desejado
4. Edite diretamente no editor
5. Salve e aguarde rebuild automático

### Adicionar Novo Artigo no Blog

1. Edite `client/src/data/blogPosts.ts`
2. Adicione um novo objeto no array:

```typescript
{
  slug: "novo-artigo",
  title: "Título do Artigo",
  excerpt: "Resumo breve...",
  date: "2025-11-15",
  author: "Equipe Destrava Crédito",
  image: "/caminho/imagem.jpg",
  content: `Conteúdo completo em markdown...`
}
```

3. Salve e o artigo aparecerá automaticamente

### Problemas Comuns

**Formulário não envia:**
- Verifique se o webhook está configurado
- Teste a URL do webhook com Postman
- Verifique logs no console do navegador

**Imagens não carregam:**
- Certifique-se que estão em `client/public/`
- Use caminhos absolutos: `/imagem.jpg`
- Verifique extensão do arquivo (jpg, png, svg)

**SEO não aparece:**
- Aguarde 24-48h após publicação
- Submeta sitemap no Google Search Console
- Verifique robots.txt não está bloqueando

---

## 📞 Contato para Suporte Técnico

Para dúvidas sobre a plataforma Manus:
- **Site**: https://help.manus.im
- **Documentação**: https://docs.manus.im

Para dúvidas sobre o site da Destrava Crédito:
- **WhatsApp**: +55 61 98605-5223
- **Email**: contato@destravacredito.com.br (configurar)

---

## ✅ Checklist de Lançamento

- [ ] Site publicado e acessível
- [ ] Favicon atualizado com logo real
- [ ] Google Analytics configurado
- [ ] Webhook de formulários integrado
- [ ] Todos os links testados
- [ ] Formulários testados em produção
- [ ] WhatsApp testado (clique no botão)
- [ ] Sitemap submetido ao Google Search Console
- [ ] Redes sociais atualizadas com links reais
- [ ] Domínio personalizado configurado (opcional)
- [ ] Meta Pixel configurado (se usar ads)
- [ ] Teste de responsividade (mobile/tablet/desktop)
- [ ] Teste de velocidade (PageSpeed Insights)
- [ ] Backup do código realizado

---

**Última atualização**: 11 de novembro de 2025  
**Versão**: 1.0.0  
**Desenvolvido por**: Manus AI
