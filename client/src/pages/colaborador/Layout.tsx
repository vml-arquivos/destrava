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
  ListOrdered,
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
  /** cargos que podem ver este item; undefined = todos */
  allowedCargos?: string[];
  /** item exclusivo para perfis com visão ampla de gestão */
  managementOnly?: boolean;
}

// Cargos com acesso total (gestão)
const CARGOS_GESTAO = ['administrador', 'diretor', 'gerente comercial'];

// Definição dos itens de navegação. Removemos as entradas duplicadas de fila e meu CRM e renomeamos o CRM para Funil Comercial.
const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/colaborador/dashboard",   label: "Dashboard",          icon: LayoutDashboard },
  { href: "/colaborador/meu-perfil",  label: "Meu Perfil",         icon: User },
  // Unifica CRM geral e pessoal em um único funil comercial. Apenas gestores podem ver todas as oportunidades.
  { href: "/colaborador/crm",         label: "Funil Comercial",     icon: Kanban },
  { href: "/colaborador/calculadora", label: "Calculadora",        icon: Calculator },
  { href: "/colaborador/simulacoes",  label: "Simulações",         icon: FileText },
  { href: "/colaborador/triagem",     label: "Triagem",            icon: ShieldAlert },
  { href: "/colaborador/clientes",    label: "Clientes",           icon: Users },
  { href: "/colaborador/empresas",    label: "Empresas",           icon: Building2 },
  { href: "/colaborador/acompanhamento-bancario",    label: "Acomp. Bancário",   icon: Activity },
  { href: "/colaborador/acompanhamento-financeiro",  label: "Acomp. Financeiro", icon: BarChart2 },
  // Faturamento: todos os colaboradores
  { href: "/colaborador/previsao-faturamento", label: "Faturamento", icon: TrendingUp },
  // Gerador de Contratos: todos os colaboradores
  { href: "/colaborador/contratos",   label: "Contratos",          icon: FileText },
  // Cadastro de Contadores: somente Administrador e Diretor
  { href: "/colaborador/contadores",  label: "Contadores",         icon: BookUser, allowedCargos: ['administrador', 'diretor'] },
  { href: "/colaborador/clientes-pf", label: "Clientes PF",        icon: UserCheck },
  // Integrações n8n: somente Administrador
  {
    href: "/colaborador/integracoes",
    label: "Integrações n8n",
    icon: Workflow,
    allowedCargos: ['administrador'],
  },
  // Usuários: somente Administrador, Diretor e Gerente Comercial
  {
    href: "/colaborador/usuarios",
    label: "Usuários",
    icon: User,
    allowedCargos: CARGOS_GESTAO,
  },
];

// ─── Helpers de permissão ────────────────────────────────────────────────────

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

// ─── Componente ──────────────────────────────────────────────────────────────

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
    // Itens exclusivos de gestão
    if (item.managementOnly) {
      const isGestor = CARGOS_GESTAO.map(normalizePermValue).includes(cargoLower);
      if (!isGestor) return false;
    }
    // Acesso ao Acompanhamento Bancário
    if (item.href === "/colaborador/acompanhamento-bancario" && !podeAcessarAcompanhamentoBancario(colaborador)) return false;
    // Acesso ao Acompanhamento Financeiro
    if (item.href === "/colaborador/acompanhamento-financeiro" && !podeAcessarFinanceiro(colaborador)) return false;
    // Restrição por cargos específicos
    if (!item.allowedCargos) return true;
    return item.allowedCargos.map(normalizePermValue).includes(cargoLower);
  });

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/colaborador/login";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar e conteúdo omitidos por brevidade */}
    </div>
  );
}
