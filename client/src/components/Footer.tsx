import { APP_LOGO } from "@/const";
import { Link } from "wouter";
import { Instagram, Linkedin, Mail, Phone, MessageCircle, MapPin } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const linksCredito = [
    { label: "Crédito Empresarial", href: "/credito-empresas" },
    { label: "PRONAMPE", href: "/pronampe" },
    { label: "Giro CAIXA Fácil", href: "/giro-caixa-facil" },
    { label: "ProCred 360", href: "/procred360" },
    { label: "PEAC FGI", href: "/peac-fgi" },
    { label: "FCO", href: "/fco" },
    { label: "FAMPE", href: "/fampe" },
  ];

  const linksServicos = [
    { label: "Rating Banco Central", href: "/rating-banco-central" },
    { label: "Certificado Digital", href: "/certificado-digital" },
    { label: "Consulta SPC/Serasa", href: "/consulta-spc-serasa" },
  ];

  const linksInstitucional = [
    { label: "Início", href: "/" },
    { label: "Sobre Nós", href: "/sobre" },
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
              src="/destrava-logo-color.svg"
              alt="Destrava Crédito"
              className="h-14 w-auto mb-4"
            />
            <p className="text-sm text-white/80 mb-5 leading-relaxed max-w-xs">
              Assessoria especializada em captação de crédito bancário e governamental para empresas que buscam mais clareza, organização e apoio consultivo em todo o processo.
            </p>
            <p className="text-xs text-white/50 mb-5 leading-relaxed max-w-xs italic">
              Assessoria empresarial com foco em clareza, estratégia e condução real para empresas que precisam avançar.
            </p>
            <div className="flex gap-4 mb-5">
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
              <a href="https://wa.me/556135268355" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-green-500 flex items-center justify-center transition-all"
                aria-label="WhatsApp">
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>
            <div className="space-y-2 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[var(--color-caixa-yellow)]" />
                <a href="tel:+556135268355" className="hover:text-white transition-colors">(61) 3526-8355</a>
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

          {/* Crédito Empresarial */}
          <div>
            <h3 className="font-bold text-base mb-4 text-[var(--color-caixa-yellow)]">Crédito Empresarial</h3>
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
              <strong>Aviso Legal:</strong> A Destrava atua como <strong>assessoria empresarial para captação de recursos e crédito para empresas</strong>. A concessão final do crédito é de responsabilidade exclusiva da instituição financeira parceira. As condições de crédito, taxas de juros e prazos variam conforme perfil do cliente e análise de crédito. Sujeito à análise e aprovação. As simulações apresentadas são estimativas e não constituem oferta de crédito.
            </p>
          </div>

          {/* Links Legais e Copyright */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-white/60">
            <p>© {currentYear} Destrava. Todos os direitos reservados.</p>
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
