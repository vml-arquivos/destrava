import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown, Building2, BarChart3, Shield, Search, Lock, Home } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { COMPANY } from "@/config/company";

interface NavItem {
  label: string;
  href: string;
  children?: { label: string; href: string; icon?: React.ComponentType<{ className?: string }>; desc?: string }[];
}

interface HeaderProps {
  /** Texto do botão principal do cabeçalho. Default: "Simule seu crédito" (mantém o comportamento de sempre). */
  ctaLabel?: string;
  /** Link do botão principal do cabeçalho. Default: "/simular". */
  ctaHref?: string;
}

export default function Header({ ctaLabel = "Simule seu crédito", ctaHref = "/simular" }: HeaderProps = {}) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const navItems: NavItem[] = [
    { label: "Início", href: "/" },
    {
      label: "Crédito Empresarial",
      href: "/credito-empresas",
      children: [
        { label: "Visão Geral", href: "/credito-empresas", icon: Building2, desc: "Soluções para empresas de todos os portes" },
        { label: "PRONAMPE", href: "/pronampe", icon: Building2, desc: "Crédito federal para MEI e pequenas empresas" },
        { label: "Giro CAIXA Fácil", href: "/giro-caixa-facil", icon: Building2, desc: "Capital de giro pela CAIXA Econômica Federal" },
        { label: "FCO", href: "/fco", icon: Building2, desc: "Fundo Constitucional do Centro-Oeste" },
        { label: "PEAC FGI", href: "/peac-fgi", icon: Building2, desc: "Crédito com garantia FGI/BNDES" },
        { label: "FAMPE", href: "/fampe", icon: Building2, desc: "Complemento de garantias pelo Sebrae" },
        { label: "ProCred 360", href: "/procred360", icon: Building2, desc: "Juros subsidiados · Programa Acredita" },
        { label: "CGI — Garantia de Imóvel", href: "/credito-com-garantia-de-imovel", icon: Home, desc: "Crédito com garantia de imóvel (home equity)" },
      ],
    },
    {
      label: "Serviços",
      href: "/produtos",
      children: [
        { label: "Diagnóstico de Crédito", href: "/rating-banco-central", icon: BarChart3, desc: "Leitura orientada do SCR/Registrato" },
        { label: "Certificado Digital", href: "/certificado-digital", icon: Shield, desc: "A1 e A3 para PF e PJ" },
        { label: "Consulta SPC/Serasa", href: "/consulta-spc-serasa", icon: Search, desc: "CPF e CNPJ" },
      ],
    },
    { label: "Blog", href: "/blog" },
    { label: "Sobre", href: "/sobre" },
    { label: "Contato", href: "/contato" },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      setOpenDropdown(null);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container">
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center flex-shrink-0" aria-label="Destrava Crédito — página inicial">
            <img
              src="/destrava-logo.svg"
              alt={COMPANY.nome}
              className="h-11 w-auto object-contain"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1" ref={dropdownRef} aria-label="Navegação principal">
            {navItems.map((item) =>
              item.children ? (
                <div key={item.href} className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                    aria-expanded={openDropdown === item.label}
                    aria-haspopup="menu"
                    aria-controls={`menu-${item.href.replaceAll("/", "-")}`}
                    className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${
                      location.startsWith(item.href) ? "text-primary" : "text-foreground/80"
                    }`}
                  >
                    {item.label}
                    <ChevronDown className={`h-4 w-4 transition-transform ${openDropdown === item.label ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === item.label && (
                    <div id={`menu-${item.href.replaceAll("/", "-")}`} role="menu" className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpenDropdown(null)}
                          role="menuitem"
                          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          {child.icon && (
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <child.icon className="h-4 w-4 text-[var(--color-caixa-blue)]" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-gray-900">{child.label}</p>
                            {child.desc && <p className="text-xs text-gray-500 mt-0.5">{child.desc}</p>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={location === item.href ? "page" : undefined}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${
                    location === item.href ? "text-primary" : "text-foreground/80"
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>

          {/* CTA Buttons Desktop */}
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            <Button asChild variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700 gap-1.5 text-xs">
              <Link href="/colaborador/login">
                <Lock className="h-3.5 w-3.5" />
                Área Restrita
              </Link>
            </Button>
            <Button asChild size="lg" className="font-semibold bg-[var(--color-caixa-blue)] hover:bg-blue-700">
              <Link href={ctaHref} data-cta-position="header-desktop">
                {ctaLabel}
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav id="mobile-navigation" className="lg:hidden py-4 border-t border-border max-h-[80vh] overflow-y-auto" aria-label="Navegação móvel">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 text-base font-medium rounded-lg transition-colors hover:bg-accent ${
                      location === item.href ? "text-primary bg-accent" : "text-foreground/80"
                    }`}
                  >
                    {item.label}
                  </Link>
                  {item.children && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.slice(1).map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="block px-4 py-2 text-sm text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-4 px-2 space-y-2">
                <Button asChild size="lg" className="w-full font-semibold bg-[var(--color-caixa-blue)] hover:bg-blue-700">
                  <Link href={ctaHref} onClick={() => setMobileMenuOpen(false)} data-cta-position="header-mobile">
                    {ctaLabel}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full text-gray-500 border-gray-200 gap-1.5">
                  <Link href="/colaborador/login" onClick={() => setMobileMenuOpen(false)}>
                    <Lock className="h-3.5 w-3.5" />
                    Área Restrita — Colaboradores
                  </Link>
                </Button>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
