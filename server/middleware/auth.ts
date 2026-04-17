import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

function normalizeRole(value: string | undefined | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export type AuthUser = {
  id: string;
  email?: string;
  nome?: string;
  cargo?: string;
  perfil?: string;
  pode_atender_leads?: boolean;
  pode_ver_todos_leads?: boolean;
  chatwoot_agente_id?: number | null;
  role: string;
};

export function auth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token não fornecido" });
    return;
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as Record<string, unknown>;
    const cargo = typeof decoded.cargo === "string" ? decoded.cargo : undefined;
    const perfil = typeof decoded.perfil === "string" ? decoded.perfil : undefined;
    const chatwootAgenteId =
      typeof decoded.chatwoot_agente_id === "number"
        ? decoded.chatwoot_agente_id
        : typeof decoded.chatwoot_agente_id === "string" && decoded.chatwoot_agente_id.trim() !== ""
          ? Number(decoded.chatwoot_agente_id)
          : null;

    const user: AuthUser = {
      id: String(decoded.id || ""),
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      nome: typeof decoded.nome === "string" ? decoded.nome : undefined,
      cargo,
      perfil,
      pode_atender_leads: typeof decoded.pode_atender_leads === "boolean" ? decoded.pode_atender_leads : undefined,
      pode_ver_todos_leads: typeof decoded.pode_ver_todos_leads === "boolean" ? decoded.pode_ver_todos_leads : undefined,
      chatwoot_agente_id: Number.isFinite(chatwootAgenteId as number) ? Number(chatwootAgenteId) : null,
      role: normalizeRole(cargo),
    };

    if (!user.id || !user.role) {
      res.status(401).json({ error: "Token inválido ou incompleto" });
      return;
    }

    req.user = user;
    req.colaborador = user;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export { normalizeRole };
