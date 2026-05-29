import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ShieldX } from "lucide-react";
import { temPermissao, normalizarCargo, Permissoes } from "../../../shared/cargos";

interface CargoRouteProps {
  children: React.ReactNode;
  /**
   * Lista de cargos (case-insensitive) que têm acesso à rota.
   * Aceita cargos normalizados ou originais, ex: ["Administrador", "Diretor"]
   */
  allowedCargos?: string[];
  /**
   * Permissão específica do mapa de permissões (alternativa a allowedCargos).
   * Exemplo: permissao="gerarContratos"
   */
  permissao?: keyof Permissoes;
}

/**
 * Protege uma rota por cargo ou permissão específica.
 * Deve ser usado dentro de <ProtectedRoute>.
 * Redireciona para /colaborador/dashboard se não tiver acesso.
 */
export default function CargoRoute({
  children,
  allowedCargos,
  permissao,
}: CargoRouteProps) {
  const { colaborador, loading } = useAuth();
  const [, setLocation] = useLocation();

  const cargoNormalizado = normalizarCargo(colaborador?.cargo);

  // Verifica acesso: por permissão específica OU por lista de cargos
  const temAcesso = (() => {
    if (!colaborador) return false;
    if (permissao) return temPermissao(colaborador.cargo, permissao);
    if (allowedCargos && allowedCargos.length > 0) {
      return allowedCargos.map(normalizarCargo).includes(cargoNormalizado);
    }
    // Se nenhum critério definido, permite acesso (rota pública dentro do painel)
    return true;
  })();

  useEffect(() => {
    if (!loading && colaborador && !temAcesso) {
      setLocation("/colaborador/dashboard");
    }
  }, [loading, colaborador, temAcesso, setLocation]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gray-50"
        role="status"
        aria-label="Verificando permissões…"
      >
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
      </div>
    );
  }

  if (!temAcesso) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gray-50"
        role="alert"
        aria-live="assertive"
      >
        <div className="text-center max-w-sm px-6">
          <ShieldX className="h-12 w-12 text-red-400 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-700 font-semibold text-lg">Acesso não autorizado</p>
          <p className="text-sm text-gray-500 mt-1">
            Você não tem permissão para acessar esta página.
            {colaborador?.cargo && (
              <> Seu cargo atual é <strong>{colaborador.cargo}</strong>.</>
            )}
          </p>
          <button
            onClick={() => setLocation("/colaborador/dashboard")}
            className="mt-4 text-sm text-blue-600 underline hover:text-blue-800"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
