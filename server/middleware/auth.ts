import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const SESSION_COOKIE = "destrava_session";

function cookieValue(req: Request, name: string) {
  const cookie = req.headers.cookie || "";
  const entry = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

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
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  // O cookie HttpOnly existe para previews/downloads navegados diretamente.
  // Operações mutáveis continuam exigindo Bearer, reduzindo superfície de CSRF.
  const cookieToken = ["GET", "HEAD"].includes(req.method)
    ? cookieValue(req, SESSION_COOKIE)
    : null;
  const token = bearerToken || cookieToken;
  if (!token) {
    res.status(401).json({ error: "Token não fornecido" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as Record<string, unknown>;
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
    if (bearerToken) setSessionCookie(res, bearerToken);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export { normalizeRole };
