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
  Workflow,
  Kanban,
  Building2,
  ShieldAlert,
  TrendingUp,
  BookUser,
  UserCheck,
  Activity,
  BarChart2,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  allowedCargos?: string[];
  managementOnly?: boolean;
}

const CARGOS_GESTAO = ["administrador", "diretor", "gerente comercial"];

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/colaborador/dashboard",   label: "Dashboard",          icon: LayoutDashboard },
  { href: "/colaborador/meu-perfil",  label: "Meu Perfil",         icon: User },
  { href: "/colaborador/crm",         label: "Funil Comercial",    icon: Kanban },
  { href: "/colaborador/calculadora", label: "Calculadora",        icon: Calculator },
  { href: "/colaborador/simulacoes",  label: "Simulações",         icon: FileText },
  { href: "/colaborador/triagem",     label: "Triagem",            icon: ShieldAlert },
  { href: "/colaborador/clientes",    label: "Clientes",           icon: Users },
  { href: "/colaborador/empresas",    label: "Empresas",           icon: Building2 },
  { href: "/colaborador/acompanhamento-bancario",    label: "Acomp. Bancário",   icon: Activity },
  { href: "/colaborador/acompanhamento-financeiro",  label: "Acomp. Financeiro", icon: BarChart2 },
  { href: "/colaborador/previsao-faturamento", label: "Faturamento", icon: TrendingUp },
  { href: "/colaborador/contratos",   label: "Contratos",          icon: FileText },
  { href: "/colaborador/contadores",  label: "Contadores",         icon: BookUser, allowedCargos: ["administrador", "diretor"] },
  { href: "/colaborador/clientes-pf", label: "Clientes PF",        icon: UserCheck },
  { href: "/colaborador/integracoes", label: "Integrações n8n",    icon: Workflow, allowedCargos: ["administrador"] },
  { href: "/colaborador/usuarios",    label: "Usuários",           icon: User, allowedCargos: CARGOS_GESTAO },
];

function normalizePermValue(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function podeAcessarAcompanhamentoBancario(user: any): boolean {
  if (!user) return false;
  if (user?.acesso_acompanhamento_bancario === true) return true;
  const permitidos = new Set([
    "admin",
    "administrador",
    "super_admin",
    "superadmin",
    "gestor_credito",
    "gestor_de_credito",
    "diretor",
  ]);
  return (
    permitidos.has(normalizePermValue(user?.cargo)) ||
    permitidos.has(normalizePermValue(user?.perfil)) ||
    permitidos.has(normalizePermValue(user?.role))
  );
}

function podeAcessarFinanceiro(user: any): boolean {
  if (!user) return false;
  if (user?.acesso_acompanhamento_financeiro === true) return true;
  const permitidos = new Set([
    "admin",
    "administrador",
    "super_admin",
    "superadmin",
    "diretor",
    "gestor_credito",
    "gestor_de_credito",
  ]);
  return (
    permitidos.has(normalizePermValue(user?.cargo)) ||
    permitidos.has(normalizePermValue(user?.perfil)) ||
    permitidos.has(normalizePermValue(user?.role))
  );
}

interface ColaboradorLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function ColaboradorLayout({ children, title }: ColaboradorLayoutProps) {
  const [location] = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const { colaborador, signOut } = useAuth();

  const cargoLower = normalizePermValue(colaborador?.cargo);

  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.managementOnly) {
      const isGestor = CARGOS_GESTAO.map(normalizePermValue).includes(cargoLower);
      if (!isGestor) return false;
    }
    if (item.href === "/colaborador/acompanhamento-bancario" && !podeAcessarAcompanhamentoBancario(colaborador)) return false;
    if (item.href === "/colaborador/acompanhamento-financeiro" && !podeAcessarFinanceiro(colaborador)) return false;
    if (!item.allowedCargos) return true;
    return item.allowedCargos.map(normalizePermValue).includes(cargoLower);
  });

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/colaborador/login";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-200">
          <a href="/" className="flex items-center gap-2">
            <img
              src="/destrava-logo.svg"
              alt="Destrava Crédito"
              className="h-8"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </a>
          <div className="mt-2">
            <Badge variant="secondary" className="text-xs">Área do Colaborador</Badge>
          </div>
        </div>

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
                {colaborador?.cargo || ""}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              location.startsWith(item.href + "/") ||
              (item.href.includes("?") && location.startsWith(item.href.split("?")[0]));
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

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between shadow-sm">
        <a href="/" className="flex items-center gap-2">
          <img
            src="/destrava-logo.svg"
            alt="Destrava Crédito"
            className="h-7"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
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
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMenuAberto(false)}
        >
          <div
            className="absolute left-0 top-14 bottom-0 w-64 bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{colaborador?.nome || "Colaborador"}</p>
                  <p className="text-xs text-gray-500">{colaborador?.cargo || ""}</p>
                </div>
              </div>
            </div>
            <nav className="p-3 space-y-0.5">
              {navItems.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href.includes("?") && location.startsWith(item.href.split("?")[0]));
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

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="hidden lg:flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title || "Painel"}</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              <strong className="text-gray-900">
                {colaborador?.nome?.split(" ")[0] || "Colaborador"}
              </strong>
            </span>
            <Link href="/colaborador/meu-perfil">
              <a className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                <User className="h-4 w-4 mr-1" />
                Perfil
              </a>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="text-gray-500 hover:text-red-600"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>

        <div className="flex-1 mt-14 lg:mt-0 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
