import { APP_LOGO } from "@/const";
import { Link } from "wouter";
import { Facebook, Instagram, Linkedin, Mail, Phone, MessageCircle, MapPin } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const linksCredito = [
    { label: "Crédito para Empresas", href: "/credito-empresas" },
    { label: "PRONAMPE", href: "/credito-empresas" },
    { label: "Giro CAIXA Fácil", href: "/giro-caixa-facil" },
    { label: "PRONAMP", href: "/credito-empresas" },
    { label: "Crédito Pessoal", href: "/credito-pessoal" },
    { label: "Consignado", href: "/credito-pessoal" },
  ];

  const linksServicos = [
    { label: "Rating Banco do Brasil", href: "/rating-banco-brasil" },
    { label: "Certificado Digital", href: "/certificado-digital" },
    { label: "Consulta SPC/Serasa", href: "/consulta-spc-serasa" },
    { label: "Limpa Nome CPF", href: "/limpa-nome" },
    { label: "Limpa Nome CNPJ", href: "/limpa-nome-cnpj" },
    { label: "Calculadora Score", href: "/calculadora-score" },
  ];

  const linksInstitucional = [
    { label: "Início", href: "/" },
    { label: "Sobre Nós", href: "/sobre" },
    { label: "Produtos", href: "/produtos" },
    { label: "Simulador", href: "/simulador" },
    { label: "Blog", href: "/blog" },
    { label: "FAQ", href: "/faq" },
    { label: "Contato", href: "/contato" },
  ];

  return (
    <footer className="bg-[var(--color-caixa-blue-dark)] text-white">
      <div className="container py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-10">
          {/* Logo e Descrição */}
          <div className="lg:col-span-2">
            <img
              src={APP_LOGO}
              alt="Destrava Crédito"
              className="h-12 w-auto mb-4 brightness-0 invert"
            />
            <p className="text-sm text-white/80 mb-5 leading-relaxed max-w-xs">
              Correspondente bancário e assessoria especializada em crédito empresarial e pessoal. Facilitamos o acesso ao crédito para empresas e pessoas físicas em todo o Brasil.
            </p>
            <div className="flex gap-4 mb-5">
              <a href="https://facebook.com/destravacredito" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-[var(--color-caixa-yellow)] hover:text-black flex items-center justify-center transition-all"
                aria-label="Facebook">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="https://instagram.com/destravacredito" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-[var(--color-caixa-yellow)] hover:text-black flex items-center justify-center transition-all"
                aria-label="Instagram">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="https://linkedin.com/company/destravacredito" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-[var(--color-caixa-yellow)] hover:text-black flex items-center justify-center transition-all"
                aria-label="LinkedIn">
                <Linkedin className="h-4 w-4" />
              </a>
              <a href="https://wa.me/5561986055223" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-green-500 flex items-center justify-center transition-all"
                aria-label="WhatsApp">
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>
            <div className="space-y-2 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[var(--color-caixa-yellow)]" />
                <a href="tel:+5561986055223" className="hover:text-white transition-colors">(61) 9 8605-5223</a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[var(--color-caixa-yellow)]" />
                <a href="mailto:contato@destravacredito.com.br" className="hover:text-white transition-colors">contato@destravacredito.com.br</a>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[var(--color-caixa-yellow)]" />
                <span>Brasília - DF | Atendimento Nacional</span>
              </div>
            </div>
          </div>

          {/* Crédito */}
          <div>
            <h3 className="font-bold text-base mb-4 text-[var(--color-caixa-yellow)]">Crédito</h3>
            <ul className="space-y-2">
              {linksCredito.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-white/70 hover:text-[var(--color-caixa-yellow)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Serviços */}
          <div>
            <h3 className="font-bold text-base mb-4 text-[var(--color-caixa-yellow)]">Serviços</h3>
            <ul className="space-y-2">
              {linksServicos.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-white/70 hover:text-[var(--color-caixa-yellow)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Institucional */}
          <div>
            <h3 className="font-bold text-base mb-4 text-[var(--color-caixa-yellow)]">Institucional</h3>
            <ul className="space-y-2">
              {linksInstitucional.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-white/70 hover:text-[var(--color-caixa-yellow)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/20 pt-8">
          {/* Disclaimer Legal */}
          <div className="bg-white/10 rounded-xl p-5 mb-6">
            <p className="text-xs text-white/80 leading-relaxed">
              <strong>Aviso Legal:</strong> A Destrava Crédito atua como <strong>Correspondente Bancário e Assessoria de Crédito</strong>, intermediando o processo de solicitação de crédito junto às instituições financeiras. A concessão final do crédito é de responsabilidade exclusiva da instituição financeira parceira. As condições de crédito, taxas de juros e prazos variam conforme perfil do cliente e análise de crédito. Sujeito à análise e aprovação. As simulações apresentadas são estimativas e não constituem oferta de crédito.
            </p>
          </div>

          {/* Links Legais e Copyright */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-white/60">
            <p>© {currentYear} Destrava Crédito. Todos os direitos reservados.</p>
            <div className="flex gap-6">
              <Link href="/politica-privacidade" className="hover:text-[var(--color-caixa-yellow)] transition-colors">
                Política de Privacidade
              </Link>
              <Link href="/termos-uso" className="hover:text-[var(--color-caixa-yellow)] transition-colors">
                Termos de Uso
              </Link>
              <Link href="/faq" className="hover:text-[var(--color-caixa-yellow)] transition-colors">
                FAQ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
