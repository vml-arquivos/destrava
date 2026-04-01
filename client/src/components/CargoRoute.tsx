import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ShieldX } from "lucide-react";

interface CargoRouteProps {
  children: React.ReactNode;
  /** Lista de cargos (lowercase) que têm acesso à rota */
  allowedCargos: string[];
}

/**
 * Protege uma rota por cargo. Deve ser usado dentro de <ProtectedRoute>.
 * Redireciona para /colaborador/dashboard se o cargo não tiver acesso.
 */
export default function CargoRoute({ children, allowedCargos }: CargoRouteProps) {
  const { colaborador, loading } = useAuth();
  const [, setLocation] = useLocation();

  const cargoLower = (colaborador?.cargo || "").toLowerCase();
  const temAcesso = allowedCargos.includes(cargoLower);

  useEffect(() => {
    if (!loading && colaborador && !temAcesso) {
      setLocation("/colaborador/dashboard");
    }
  }, [loading, colaborador, temAcesso, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!temAcesso) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <ShieldX className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Acesso não autorizado</p>
          <p className="text-sm text-gray-400 mt-1">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
