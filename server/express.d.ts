import type { AuthUser } from "./middleware/auth.ts";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      colaborador?: AuthUser;
    }
  }
}

export {};
