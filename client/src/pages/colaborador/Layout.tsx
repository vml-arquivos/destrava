import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";
import NotificacoesFollowup from "@/components/NotificacoesFollowup";
import {
  LayoutDashboard,
  Calculator,
  FileText,
  FileSignature,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
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
  Sparkles,
  BrainCircuit,
  ClipboardCheck,
  Scale,
  Banknote,
  Settings,
  UserCog,
  PlugZap,
  SlidersHorizontal,
  Newspaper,
  Image as ImageIcon,
} from "lucide-react";

const CARGOS_GESTAO = ["administrador", "diretor", "gerente comercial"];

// ── Definição de módulos do menu ──────────────────────────────────────────────
interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  allowedCargos?: string[];
  badge?: string;
  featureKey?: string;
}
interface NavModule {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string; // cor do ícone do módulo
  items: NavItem[];
  allowedCargos?: string[];
}

const NAV_MODULES: NavModule[] = [
  // ── 1. Visão geral ──────────────────────────────────────────────────────────
  {
    id: "visao",
    label: "Visão Geral",
    icon: LayoutDashboard,
    color: "text-slate-600",
    items: [
      {
        href: "/colaborador/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        featureKey: "dashboard",
      },
    ],
  },

  // ── 2. Comercial ────────────────────────────────────────────────────────────
  {
    id: "comercial",
    label: "Comercial",
    icon: Kanban,
    color: "text-blue-600",
    items: [
      {
        href: "/colaborador/crm",
        label: "Funil de Vendas",
        icon: Kanban,
        featureKey: "funil-vendas",
      },
      {
        href: "/colaborador/triagem",
        label: "Triagem de Leads",
        icon: ShieldAlert,
        featureKey: "triagem-leads",
      },
      {
        href: "/colaborador/simulacoes",
        label: "Simulações",
        icon: Calculator,
        featureKey: "simulacoes",
      },
      {
        href: "/colaborador/calculadora",
        label: "Calculadora",
        icon: Calculator,
        featureKey: "calculadora",
      },
      {
        href: "/colaborador/orcamentos",
        label: "Orçamentos",
        icon: FileSignature,
        featureKey: "orcamentos",
      },
    ],
  },

  // ── 3. Clientes ─────────────────────────────────────────────────────────────
  {
    id: "clientes",
    label: "Clientes",
    icon: Users,
    color: "text-violet-600",
    items: [
      {
        href: "/colaborador/empresas",
        label: "Clientes PJ",
        icon: Building2,
        featureKey: "clientes-pj",
      },
      {
        href: "/colaborador/clientes",
        label: "Clientes PF",
        icon: Users,
        featureKey: "clientes-pf",
      },
      {
        href: "/colaborador/relatorio-empresas",
        label: "Relatórios PJ",
        icon: BarChart3,
        featureKey: "relatorios-pj",
      },
      {
        href: "/colaborador/cadastros-incompletos",
        label: "Cadastros Incompletos",
        icon: DatabaseZap,
        featureKey: "cadastros-incompletos",
      },
    ],
  },

  // ── 4. Assessoria Inteligente (NOVO) ────────────────────────────────────────
  {
    id: "assessoria",
    label: "Assessoria IA",
    icon: BrainCircuit,
    color: "text-emerald-600",
    items: [
      {
        href: "/colaborador/assessoria",
        label: "Central de Assessoria",
        icon: BrainCircuit,
        featureKey: "assessoria-ia",
      },
      {
        href: "/colaborador/diagnostico-credito",
        label: "Diagnóstico de Crédito",
        icon: ClipboardCheck,
        featureKey: "diagnostico-credito",
      },
    ],
  },

  // ── 5. Financeiro ───────────────────────────────────────────────────────────
  {
    id: "financeiro",
    label: "Financeiro",
    icon: Banknote,
    color: "text-amber-600",
    items: [
      {
        href: "/colaborador/acompanhamento-bancario",
        label: "Acomp. Bancário",
        icon: Activity,
        featureKey: "acompanhamento-bancario",
      },
      {
        href: "/colaborador/acompanhamento-financeiro",
        label: "Acomp. Financeiro",
        icon: BarChart2,
        featureKey: "acompanhamento-financeiro",
      },
      {
        href: "/colaborador/previsao-faturamento",
        label: "Faturamento",
        icon: TrendingUp,
        featureKey: "faturamento",
      },
    ],
  },

  // ── 6. Documentos e Contratos ───────────────────────────────────────────────
  {
    id: "documentos",
    label: "Contratos",
    icon: FileText,
    color: "text-orange-600",
    items: [
      {
        href: "/colaborador/contratos",
        label: "Contratos",
        icon: FileText,
        featureKey: "contratos",
      },
    ],
  },

  // ── 7. Gestão (admin) ───────────────────────────────────────────────────────
  {
    id: "gestao",
    label: "Gestão",
    icon: Settings,
    color: "text-slate-500",
    allowedCargos: CARGOS_GESTAO,
    items: [
      {
        href: "/colaborador/contadores",
        label: "Contadores",
        icon: BookUser,
        allowedCargos: ["administrador", "diretor"],
        featureKey: "contadores",
      },
      {
        href: "/colaborador/integracoes",
        label: "Integrações n8n",
        icon: PlugZap,
        allowedCargos: ["administrador"],
        featureKey: "integracoes",
      },
      {
        href: "/colaborador/gestao-blog",
        label: "Conteúdo e SEO",
        icon: Newspaper,
        allowedCargos: CARGOS_GESTAO,
      },
      {
        href: "/colaborador/gestao-banners",
        label: "Banners do Site",
        icon: ImageIcon,
        allowedCargos: CARGOS_GESTAO,
      },
      {
        href: "/colaborador/usuarios",
        label: "Usuários",
        icon: UserCog,
        allowedCargos: CARGOS_GESTAO,
        featureKey: "usuarios",
      },
      {
        href: "/colaborador/configuracao-funcoes",
        label: "Menu e Funções",
        icon: SlidersHorizontal,
        allowedCargos: ["administrador"],
        featureKey: "configuracao-funcoes",
      },
    ],
  },
];

// ── Componente principal ─────────────────────────────────────────────────────
function podeAcessarAcompanhamentoBancario(colab: any) {
  const cargo = (colab?.cargo || "").toLowerCase();
  return [
    "administrador",
    "diretor",
    "gerente comercial",
    "consultor sênior",
    "analista de crédito",
  ].includes(cargo);
}
function podeAcessarFinanceiro(colab: any) {
  const cargo = (colab?.cargo || "").toLowerCase();
  return ["administrador", "diretor", "gerente comercial"].includes(cargo);
}

function filtrarItems(
  items: NavItem[],
  colab: any,
  isFeatureEnabled: (featureKey?: string | null) => boolean
) {
  return items.filter(item => {
    if (
      item.allowedCargos &&
      !item.allowedCargos.includes((colab?.cargo || "").toLowerCase())
    )
      return false;
    if (!isFeatureEnabled(item.featureKey)) return false;
    if (
      item.href === "/colaborador/acompanhamento-bancario" &&
      !podeAcessarAcompanhamentoBancario(colab)
    )
      return false;
    if (
      item.href === "/colaborador/acompanhamento-financeiro" &&
      !podeAcessarFinanceiro(colab)
    )
      return false;
    return true;
  });
}

function filtrarModulos(
  modules: NavModule[],
  colab: any,
  isFeatureEnabled: (featureKey?: string | null) => boolean
) {
  return modules
    .filter(
      mod =>
        !mod.allowedCargos ||
        mod.allowedCargos.includes((colab?.cargo || "").toLowerCase())
    )
    .map(mod => ({
      ...mod,
      items: filtrarItems(mod.items, colab, isFeatureEnabled),
    }))
    .filter(mod => mod.items.length > 0);
}

export default function Layout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const [location] = useLocation();
  const { colaborador, logout } = useAuth();
  const { isFeatureEnabled } = useFeatureAccess();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Módulos expandidos — inicializa com o módulo ativo aberto
  const modulos = filtrarModulos(NAV_MODULES, colaborador, isFeatureEnabled);
  const moduloAtivo = modulos.find(m =>
    m.items.some(i => location === i.href || location.startsWith(i.href + "/"))
  );
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (moduloAtivo) init[moduloAtivo.id] = true;
    return init;
  });

  function toggleModulo(id: string) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const isTelaEmpresas =
    location.startsWith("/colaborador/empresas") ||
    location.startsWith("/colaborador/assessoria");
  const isEmpresaDetalhe = location.startsWith("/colaborador/empresas");

  const sidebar = (
    <nav className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
        <img
          src="/destrava-logo.svg"
          alt="Destrava"
          className="h-8 w-auto"
          onError={e => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="min-w-0">
          <div className="text-xs font-black text-slate-800 leading-tight">
            Destrava Crédito
          </div>
          <div className="text-[10px] text-slate-400 font-medium">
            Área do Colaborador
          </div>
        </div>
      </div>

      {/* Módulos */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {modulos.map(mod => {
          const ModIcon = mod.icon;
          const isExpanded = expandidos[mod.id] ?? false;
          const hasActive = mod.items.some(
            i => location === i.href || location.startsWith(i.href + "/")
          );

          // Módulo com item único: link direto sem accordion
          if (mod.items.length === 1) {
            const item = mod.items[0];
            const ItemIcon = item.icon;
            const isActive =
              location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={mod.id}
                href={item.href}
                onClick={() => setMobileOpen(false)}
              >
                <div
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <ItemIcon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : mod.color}`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            );
          }

          return (
            <div key={mod.id}>
              {/* Cabeçalho do módulo */}
              <button
                onClick={() => toggleModulo(mod.id)}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                  hasActive && !isExpanded
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <ModIcon className={`h-4 w-4 shrink-0 ${mod.color}`} />
                <span className="flex-1 text-left truncate">{mod.label}</span>
                {hasActive && !isExpanded && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                )}
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>

              {/* Itens do módulo */}
              {isExpanded && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-100 pl-3">
                  {mod.items.map(item => {
                    const ItemIcon = item.icon;
                    const isActive =
                      location === item.href ||
                      location.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                      >
                        <div
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                            isActive
                              ? "bg-blue-600 text-white"
                              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          }`}
                        >
                          <ItemIcon
                            className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer com perfil */}
      <div className="border-t border-slate-100 p-3 space-y-1">
        <Link
          href="/colaborador/meu-perfil"
          onClick={() => setMobileOpen(false)}
        >
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer">
            <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-black text-xs shrink-0">
              {(colaborador?.nome || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate font-bold text-slate-800">
                {colaborador?.nome || "Colaborador"}
              </div>
              <div className="truncate text-slate-400 capitalize">
                {colaborador?.cargo || ""}
              </div>
            </div>
          </div>
        </Link>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-white border-r border-slate-100 shadow-sm">
        {sidebar}
      </aside>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-2xl flex flex-col">
            <div className="flex justify-end p-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-xl p-2 hover:bg-slate-100"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Conteúdo principal */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Header mobile */}
        <header className="flex lg:hidden items-center justify-between border-b border-slate-100 bg-white px-4 py-3 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-xl p-2 hover:bg-slate-100"
          >
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <span className="text-sm font-black text-slate-800">
            {title || "Destrava Crédito"}
          </span>
          <NotificacoesFollowup />
        </header>

        {/* Header desktop */}
        <header className="hidden lg:flex items-center justify-between border-b border-slate-100 bg-white px-6 py-3 shadow-sm">
          <div>
            <h1 className="text-base font-black text-slate-800">
              {title || "Destrava Crédito"}
            </h1>
            <p className="text-xs text-slate-400">Destrava Crédito</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificacoesFollowup />
            <Link href="/colaborador/meu-perfil">
              <button className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all">
                <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-black text-xs">
                  {(colaborador?.nome || "?").charAt(0).toUpperCase()}
                </div>
                {colaborador?.nome?.split(" ")[0] || "Perfil"}
              </button>
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </header>

        {/* Conteúdo */}
        <main
          className={`flex-1 min-w-0 overflow-x-hidden ${
            isEmpresaDetalhe
              ? "overflow-y-auto"
              : isTelaEmpresas
                ? "overflow-y-auto flex flex-col"
                : "overflow-y-auto"
          }`}
        >
          <div
            className={`destrava-page ${
              isEmpresaDetalhe
                ? "min-h-full overflow-visible"
                : isTelaEmpresas
                  ? "flex-1 min-h-full overflow-visible flex flex-col"
                  : "min-h-0 overflow-visible"
            }`}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
