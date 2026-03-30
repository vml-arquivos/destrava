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
  Zap,
  Kanban,
  Building2,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const navItems: NavItem[] = [
  { href: "/colaborador/dashboard",  label: "Dashboard",       icon: LayoutDashboard },
  { href: "/colaborador/crm",        label: "CRM — Pipeline",  icon: Kanban },
  { href: "/colaborador/calculadora",label: "Calculadora",     icon: Calculator },
  { href: "/colaborador/simulacoes", label: "Simulações",      icon: FileText },
  { href: "/colaborador/clientes",   label: "Clientes",        icon: Users },
  { href: "/colaborador/empresas",   label: "Empresas",        icon: Building2 },
  { href: "/colaborador/integracoes",label: "Integrações n8n", icon: Zap },
  { href: "/colaborador/usuarios",   label: "Usuários",        icon: User },
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
    <div className="min-h-screen bg-gray-50 flex">
      {/* ── Sidebar Desktop ── */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 shadow-sm">
        {/* Logo */}
        <div className="p-5 border-b border-gray-200">
          <a href="/" className="flex items-center gap-2">
            <img src="/destrava-logo.svg" alt="Destrava Crédito" className="h-8" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span className="font-bold text-blue-900 text-lg">Destrava</span>
          </a>
          <div className="mt-2">
            <Badge variant="secondary" className="text-xs">Área do Colaborador</Badge>
          </div>
        </div>

        {/* Perfil */}
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {colaborador?.nome || "Colaborador"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {colaborador?.cargo || "Analista"}
              </p>
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full font-bold">
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Sair */}
        <div className="p-3 border-t border-gray-200">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-500 hover:text-red-600 hover:bg-red-50"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* ── Mobile: Header + Drawer ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between shadow-sm">
        <a href="/" className="flex items-center gap-2">
          <span className="font-bold text-blue-900">Destrava</span>
          <Badge variant="secondary" className="text-xs">Colaborador</Badge>
        </a>
        <button
          onClick={() => setMenuAberto(!menuAberto)}
          className="p-2 rounded-md hover:bg-gray-100"
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
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{colaborador?.nome || "Colaborador"}</p>
                  <p className="text-xs text-gray-500">{colaborador?.cargo || "Analista"}</p>
                </div>
              </div>
            </div>
            <nav className="p-3 space-y-0.5">
              {navItems.map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <a
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-blue-600 text-white"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
            <div className="p-3 border-t border-gray-200">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-gray-500 hover:text-red-600"
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
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title || "Painel"}</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              <strong className="text-gray-900">{colaborador?.nome?.split(" ")[0] || "Colaborador"}</strong>
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="text-gray-500 hover:text-red-600">
              <LogOut className="h-4 w-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 mt-14 lg:mt-0 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
