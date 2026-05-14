import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";

function normalizePermValue(value?: string | null) {
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
  ]);

  const cargo = normalizePermValue(user?.cargo);
  const perfil = normalizePermValue(user?.perfil);
  const role = normalizePermValue(user?.role);

  return permitidos.has(cargo) || permitidos.has(perfil) || permitidos.has(role);
}

export default function AcompanhamentoBancario() {
  const { colaborador } = useAuth();
  const permitido = podeAcessarAcompanhamentoBancario(colaborador);

  return (
    <ColaboradorLayout title="Acompanhamento Bancário">
      <div className="p-6">
        {!permitido ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="text-lg font-semibold text-red-700">Acesso restrito</h2>
            <p className="text-sm text-red-600 mt-1">Este módulo é exclusivo para Gestor de Crédito ou superior.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h1 className="text-xl font-semibold">Acompanhamento Bancário</h1>
            <p className="text-sm text-gray-600 mt-2">
              Módulo disponível para perfis autorizados (Admin, Super Admin e Gestor de Crédito).
            </p>
          </div>
        )}
      </div>
    </ColaboradorLayout>
  );
}
