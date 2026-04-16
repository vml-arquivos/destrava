import { Request, Response, NextFunction } from "express";
import { normalizeRole } from "./auth.ts";

export function authorize(allowedRoles: string[]) {
  const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));

  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = normalizeRole(req.user?.role || req.user?.cargo);

    if (!req.user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    if (!normalizedAllowedRoles.includes(userRole)) {
      res.status(403).json({ error: "Acesso não autorizado" });
      return;
    }

    next();
  };
}
