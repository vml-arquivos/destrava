import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import NotificacoesFollowup from "@/components/NotificacoesFollowup";
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
  Activity,
  BarChart2,
  DatabaseZap,
  BarChart3,
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
  { href: "/colaborador/crm",         label: "Funil Comercial",    icon: Kanban },
  { href: "/colaborador/calculadora", label: "Calculadora",        icon: Calculator },
  { href: "/colaborador/simulacoes",  label: "Simulações",         icon: FileText },
  { href: "/colaborador/triagem",     label: "Triagem",            icon: ShieldAlert },
  { href: "/colaborador/clientes",    label: "Clientes",           icon: Users },
  { href: "/colaborador/empresas",    label: "Empresas",           icon: Building2 },
  { href: "/colaborador/relatorio-empresas", label: "Relatório Empresas", icon: BarChart3 },
  { href: "/colaborador/cadastros-incompletos", label: "Cadastros Incompletos", icon: DatabaseZap },
  { href: "/colaborador/acompanhamento-bancario",    label: "Acomp. Bancário",   icon: Activity },
  { href: "/colaborador/acompanhamento-financeiro",  label: "Acomp. Financeiro", icon: BarChart2 },
  { href: "/colaborador/previsao-faturamento", label: "Faturamento", icon: TrendingUp },
  { href: "/colaborador/contratos",   label: "Contratos",          icon: FileText },
  { href: "/colaborador/contadores",  label: "Contadores",         icon: BookUser, allowedCargos: ["administrador", "diretor"] },
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

  const primeiroNome = colaborador?.nome?.split(" ")[0] || "Colaborador";
  const isTelaEmpresas = location.startsWith("/colaborador/empresas");

  return (
    <div className="destrava-shell h-screen max-h-screen overflow-hidden flex bg-[radial-gradient(circle_at_top_left,#eff6ff_0,#f8fafc_32%,#f8fafc_100%)] text-slate-900">
      <aside className="hidden lg:flex flex-col w-[244px] h-screen max-h-screen sticky top-0 shrink-0 border-r border-slate-200/80 bg-white/88 backdrop-blur-xl shadow-[8px_0_30px_rgba(15,23,42,0.04)]">
        <div className="p-4 border-b border-slate-100">
          <a href="/" className="flex items-center gap-2">
            <img
              src="/destrava-logo.svg"
              alt="Destrava Crédito"
              className="h-8"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </a>
          <div className="mt-3">
            <Badge variant="secondary" className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-800 shadow-sm">Área do Colaborador</Badge>
          </div>
        </div>

        <div className="p-3 border-b border-slate-100 bg-slate-50/70">
          <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-100">
                <User className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">
                  {colaborador?.nome || "Colaborador"}
                </p>
                <p className="text-xs font-medium text-slate-500 truncate">
                  {colaborador?.cargo || ""}
                </p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto destrava-nav-scroll">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              location.startsWith(item.href + "/") ||
              (item.href.includes("?") && location.startsWith(item.href.split("?")[0]));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${isActive ? "bg-white/16" : "bg-white border border-slate-200 group-hover:border-blue-100 group-hover:text-blue-700"}`}>
                    <Icon className="h-4 w-4 flex-shrink-0" />
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full font-bold">
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="h-3 w-3 opacity-75" />}
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100 bg-white/70">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start rounded-2xl text-slate-500 hover:bg-red-50 hover:text-red-600"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-slate-200 bg-white/92 px-4 flex items-center justify-between shadow-sm backdrop-blur-xl">
        <a href="/" className="flex items-center gap-2">
          <img
            src="/destrava-logo.svg"
            alt="Destrava Crédito"
            className="h-7"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <Badge variant="secondary" className="rounded-full text-xs">Colaborador</Badge>
        </a>
        <button
          onClick={() => setMenuAberto(!menuAberto)}
          className="p-2 rounded-xl hover:bg-slate-100"
        >
          {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuAberto && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm"
          onClick={() => setMenuAberto(false)}
        >
          <div
            className="absolute left-0 top-16 bottom-0 w-[280px] bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">{colaborador?.nome || "Colaborador"}</p>
                  <p className="text-xs text-slate-500">{colaborador?.cargo || ""}</p>
                </div>
              </div>
            </div>
            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href.includes("?") && location.startsWith(item.href.split("?")[0]));
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <a
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                        isActive
                          ? "bg-blue-600 text-white shadow-md shadow-blue-100"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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
            <div className="p-3 border-t border-slate-200">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-2xl text-slate-500 hover:text-red-600"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className={`flex-1 h-screen max-h-screen flex flex-col min-w-0 ${isTelaEmpresas ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"}`}> 
        <div className="hidden lg:flex items-center justify-between px-6 py-3.5 bg-white/82 backdrop-blur-xl border-b border-slate-200/80 shadow-sm shadow-slate-200/40">
          <div className="flex items-center gap-3">
            <div className="h-9 w-1.5 rounded-full bg-blue-600" />
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900">{title || "Painel"}</h2>
              <p className="text-[11px] font-medium text-slate-400">Destrava Crédito</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 border border-slate-200">
              {primeiroNome}
            </span>
            <NotificacoesFollowup />
            <Link href="/colaborador/meu-perfil">
              <a className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950">
                <User className="h-4 w-4 mr-1" />
                Perfil
              </a>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="rounded-xl text-slate-500 hover:text-red-600"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>

        <div className={`destrava-page mt-16 lg:mt-0 ${isTelaEmpresas ? "flex-1 min-h-0 overflow-hidden" : "flex-none min-h-0 overflow-visible"}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
