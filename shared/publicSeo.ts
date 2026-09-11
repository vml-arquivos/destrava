export const SITE_URL = "https://destravacredito.com";
export const SITE_NAME = "Destrava Crédito";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export type SeoChangeFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface PublicSeoDefinition {
  title: string;
  description: string;
  canonicalPath?: string;
  type?: "website" | "article";
  noindex?: boolean;
  sitemap?: {
    priority: number;
    changefreq: SeoChangeFrequency;
  };
}

export const PUBLIC_SEO_ROUTES: Record<string, PublicSeoDefinition> = {
  "/": {
    title: "Assessoria de Crédito Empresarial",
    description:
      "Assessoria para MEI, ME, EPP e empresas acessarem linhas de crédito com análise, organização documental e acompanhamento especializado.",
    sitemap: { priority: 1, changefreq: "weekly" },
  },
  "/sobre": {
    title: "Sobre a Destrava Crédito",
    description:
      "Conheça a Destrava Crédito, nossa atuação em assessoria empresarial e como acompanhamos empresas na busca por crédito.",
    sitemap: { priority: 0.5, changefreq: "yearly" },
  },
  "/produtos": {
    title: "Soluções de Crédito Empresarial e Pessoal",
    description:
      "Conheça as soluções de crédito e assessoria da Destrava para empresas e pessoas físicas e encontre o caminho adequado ao seu perfil.",
    sitemap: { priority: 0.8, changefreq: "weekly" },
  },
  "/blog": {
    title: "Blog de Crédito Empresarial e Gestão Financeira",
    description:
      "Conteúdos sobre crédito empresarial, organização financeira, MEI, pequenas empresas e preparação para análise bancária.",
    sitemap: { priority: 0.7, changefreq: "weekly" },
  },
  "/faq": {
    title: "Perguntas Frequentes sobre Crédito Empresarial",
    description:
      "Tire dúvidas sobre assessoria de crédito, documentos, análise bancária, prazos e linhas disponíveis para empresas.",
    sitemap: { priority: 0.5, changefreq: "monthly" },
  },
  "/contato": {
    title: "Fale com a Destrava Crédito",
    description:
      "Fale com a equipe da Destrava Crédito por formulário, telefone ou WhatsApp. Atendimento em Brasília, Goiânia e todo o Brasil.",
    sitemap: { priority: 0.6, changefreq: "monthly" },
  },
  "/simulacao": {
    title: "Solicite uma Simulação de Crédito Empresarial",
    description:
      "Envie seus dados para uma análise inicial de crédito empresarial e receba orientação da equipe Destrava Crédito.",
    sitemap: { priority: 0.8, changefreq: "weekly" },
  },
  "/simulador": {
    title: "Simulador de Crédito",
    description:
      "Simule cenários de crédito e entenda valores estimados antes de conversar com um especialista. Condições sujeitas à análise.",
    sitemap: { priority: 0.8, changefreq: "weekly" },
  },
  "/simular": {
    title: "Simulador de Crédito Empresarial e Pessoal",
    description:
      "Compare cenários estimados de crédito empresarial e pessoal e solicite uma análise gratuita com a Destrava Crédito.",
    sitemap: { priority: 0.95, changefreq: "weekly" },
  },
  "/credito-empresas": {
    title: "Crédito para Empresas: MEI, ME, EPP e LTDA",
    description:
      "Assessoria para empresas acessarem capital de giro e linhas de crédito de acordo com porte, faturamento e finalidade.",
    sitemap: { priority: 0.9, changefreq: "weekly" },
  },
  "/giro-caixa-facil": {
    title: "Giro CAIXA Fácil para Empresas",
    description:
      "Entenda o Giro CAIXA Fácil e solicite orientação para avaliar elegibilidade, documentos e condições para capital de giro.",
    sitemap: { priority: 0.8, changefreq: "monthly" },
  },
  "/pronampe": {
    title: "PRONAMPE para Micro e Pequenas Empresas",
    description:
      "Veja como funciona o PRONAMPE, quem pode solicitar e quais documentos preparar. Condições sujeitas às regras e à análise bancária.",
    sitemap: { priority: 0.85, changefreq: "monthly" },
  },
  "/procred360": {
    title: "ProCred 360 para MEI e Microempresas",
    description:
      "Entenda o ProCred 360 e receba orientação para verificar elegibilidade, documentação e condições vigentes da linha.",
    sitemap: { priority: 0.8, changefreq: "monthly" },
  },
  "/peac-fgi": {
    title: "PEAC FGI: Crédito com Garantia do BNDES",
    description:
      "Saiba como funciona o PEAC FGI e avalie com a Destrava os requisitos, garantias e documentos para solicitar crédito empresarial.",
    sitemap: { priority: 0.75, changefreq: "monthly" },
  },
  "/fco": {
    title: "FCO para Empresas do Centro-Oeste",
    description:
      "Conheça o FCO para empresas e produtores do Centro-Oeste e solicite orientação sobre projetos, documentos e análise da operação.",
    sitemap: { priority: 0.75, changefreq: "monthly" },
  },
  "/fampe": {
    title: "FAMPE: Fundo de Aval Sebrae",
    description:
      "Entenda como o FAMPE pode complementar garantias de pequenos negócios e quais requisitos são avaliados na solicitação de crédito.",
    sitemap: { priority: 0.75, changefreq: "monthly" },
  },
  "/credito-pessoal": {
    title: "Crédito para Pessoa Física",
    description:
      "Conheça opções de crédito pessoal, consignado e financiamento e solicite uma avaliação conforme seu perfil e finalidade.",
    sitemap: { priority: 0.75, changefreq: "monthly" },
  },
  "/credito-com-garantia-de-imovel": {
    title: "Crédito com Garantia de Imóvel (Home Equity)",
    description:
      "Assessoria em crédito com garantia de imóvel para pessoa física e empresa. Condições sujeitas à avaliação do imóvel e análise de crédito.",
    sitemap: { priority: 0.75, changefreq: "monthly" },
  },
  "/cgi": {
    title: "Crédito com Garantia de Imóvel (Home Equity)",
    description:
      "Assessoria em crédito com garantia de imóvel para pessoa física e empresa. Condições sujeitas à avaliação do imóvel e análise de crédito.",
    canonicalPath: "/credito-com-garantia-de-imovel",
    noindex: true,
  },
  "/rating-banco-brasil": {
    title: "Preparação para Análise de Crédito no Banco do Brasil",
    description:
      "Organize dados cadastrais, financeiros e documentos antes de solicitar crédito. A classificação interna e a decisão pertencem ao banco.",
    sitemap: { priority: 0.6, changefreq: "monthly" },
  },
  "/rating-banco-central": {
    title: "Diagnóstico de Crédito e Dados do Banco Central",
    description:
      "Organize informações cadastrais e financeiras usadas na análise de crédito e receba orientação especializada para sua empresa.",
    sitemap: { priority: 0.6, changefreq: "monthly" },
  },
  "/certificado-digital": {
    title: "Certificado Digital para Pessoa Física e Empresa",
    description:
      "Solicite orientação para emissão de certificado digital e-CPF ou e-CNPJ, modelos A1 e A3, com validação conforme as regras aplicáveis.",
    sitemap: { priority: 0.8, changefreq: "monthly" },
  },
  "/certificado-digital-a1": {
    title: "Certificado Digital A1 Online",
    description:
      "Emita certificado digital A1 e-CPF ou e-CNPJ com orientação na validação e instalação. Prazo sujeito à documentação e disponibilidade.",
    sitemap: { priority: 0.9, changefreq: "monthly" },
  },
  "/consulta-spc-serasa": {
    title: "Consulta de CPF e CNPJ no SPC e Serasa",
    description:
      "Solicite consulta de CPF ou CNPJ para identificar restrições e pendências e receba orientação sobre o relatório.",
    sitemap: { priority: 0.65, changefreq: "monthly" },
  },
  "/calculadora-score": {
    title: "Calculadora de Score de Crédito",
    description:
      "Faça um diagnóstico educativo do seu perfil de crédito e receba orientações para melhorar sua organização financeira.",
    sitemap: { priority: 0.65, changefreq: "monthly" },
  },
  "/politica-privacidade": {
    title: "Política de Privacidade",
    description: "Saiba como a Destrava Crédito trata dados pessoais e quais são os seus direitos conforme a LGPD.",
    sitemap: { priority: 0.3, changefreq: "yearly" },
  },
  "/termos-uso": {
    title: "Termos de Uso",
    description: "Consulte as condições de uso do site e dos canais digitais da Destrava Crédito.",
    sitemap: { priority: 0.3, changefreq: "yearly" },
  },
  "/captura": {
    title: "Solicite Atendimento",
    description: "Envie seus dados para receber atendimento da equipe Destrava Crédito.",
    noindex: true,
  },
  "/sucesso": {
    title: "Solicitação Recebida",
    description: "Confirmação de envio para a equipe Destrava Crédito.",
    noindex: true,
  },
  "/404": {
    title: "Página não encontrada",
    description: "A página solicitada não foi encontrada.",
    noindex: true,
  },
};

export function normalizePathname(pathname: string) {
  const clean = pathname.split("?")[0].split("#")[0] || "/";
  if (clean === "/") return clean;
  return clean.replace(/\/+$/, "");
}

export function buildFullTitle(title: string) {
  const normalized = title.replace(/\s*\|\s*Destrava\s*Cr[eé]dito\s*$/iu, "").trim();
  return normalized === SITE_NAME ? SITE_NAME : `${normalized} | ${SITE_NAME}`;
}

export function getPublicSeo(pathname: string): PublicSeoDefinition | undefined {
  const path = normalizePathname(pathname);
  if (path.startsWith("/colaborador")) {
    return {
      title: "Área do Colaborador",
      description: "Acesso restrito aos colaboradores da Destrava Crédito.",
      noindex: true,
    };
  }
  return PUBLIC_SEO_ROUTES[path];
}
