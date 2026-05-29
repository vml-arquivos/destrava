import { Request, Response, NextFunction } from "express";
import { normalizeRole } from "./auth.ts";
import { getPermissoes, temPermissao, podeGerenciar, cargosGerenciaveis, Permissoes } from "../../shared/cargos.ts";

/**
 * Middleware de autorização por cargo.
 * Aceita lista de cargos permitidos (strings normalizadas ou originais).
 *
 * Uso: app.get("/rota", auth, authorize(["administrador", "diretor"]), handler)
 */
export function authorize(allowedRoles: string[]) {
  const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    const userRole = normalizeRole(req.user?.role || req.user?.cargo);

    if (!normalizedAllowedRoles.includes(userRole)) {
      res.status(403).json({ error: "Acesso não autorizado" });
      return;
    }

    next();
  };
}

/**
 * Middleware de autorização por permissão específica.
 * Mais granular que authorize() — verifica uma permissão do mapa de cargos.
 *
 * Uso: app.post("/contratos", auth, requirePermissao("gerarContratos"), handler)
 */
export function requirePermissao(permissao: keyof Permissoes) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    const cargo = req.user?.cargo || req.user?.role;
    if (!temPermissao(cargo, permissao)) {
      res.status(403).json({
        error: "Permissão insuficiente",
        detalhe: `Cargo "${cargo}" não possui a permissão "${permissao}".`,
      });
      return;
    }

    next();
  };
}

// Re-exporta utilitários para uso nas rotas
export { getPermissoes, temPermissao, podeGerenciar, cargosGerenciaveis };
