import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Calculator,
  FileText,
  LogOut,
  Menu,
  X,
  ChevronRight,
  User,
  Users,
  Database,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: "/colaborador/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/colaborador/calculadora", label: "Calculadora", icon: Calculator },
  { href: "/colaborador/simulacoes", label: "Simulações Salvas", icon: FileText },
  { href: "/colaborador/usuarios", label: "Usuários", icon: Users },
  { href: "/colaborador/sql", label: "SQL Editor", icon: Database },
];

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function ColaboradorLayout({ children, title }: LayoutProps) {
  const { colaborador, signOut } = useAuth();
  const [location] = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/colaborador/login";
  };

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* ── Sidebar Desktop ── */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-border shadow-sm">
        {/* Logo */}
        <div className="p-5 border-b border-border">
          <a href="/" className="flex items-center gap-2">
            <img src="/destrava-logo.svg" alt="Destrava Crédito" className="h-8" />
          </a>
          <div className="mt-3 flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">Área do Colaborador</Badge>
          </div>
        </div>

        {/* Perfil */}
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {colaborador?.nome || "Colaborador"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {colaborador?.cargo || "Analista"}
              </p>
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                  {isActive && <ChevronRight className="h-3 w-3 ml-auto" />}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Sair */}
        <div className="p-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* ── Mobile: Header + Drawer ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-border px-4 h-14 flex items-center justify-between shadow-sm">
        <a href="/" className="flex items-center gap-2">
          <img src="/destrava-logo.svg" alt="Destrava Crédito" className="h-7" />
        </a>
        <button
          onClick={() => setMenuAberto(!menuAberto)}
          className="p-2 rounded-md hover:bg-muted"
        >
          {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {menuAberto && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMenuAberto(false)}>
          <div
            className="absolute left-0 top-14 bottom-0 w-64 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{colaborador?.nome || "Colaborador"}</p>
                  <p className="text-xs text-muted-foreground">{colaborador?.cargo || "Analista"}</p>
                </div>
              </div>
            </div>
            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <a
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      onClick={() => setMenuAberto(false)}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </a>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Conteúdo principal ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-4 bg-white border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{title || "Painel"}</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Olá, <strong>{colaborador?.nome?.split(" ")[0] || "Colaborador"}</strong>
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 p-4 lg:p-6 mt-14 lg:mt-0 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
