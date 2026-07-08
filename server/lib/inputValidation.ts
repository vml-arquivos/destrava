import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

/**
 * Schemas de validação para rotas públicas sensíveis (/api/login, /api/leads).
 *
 * Objetivo desta primeira camada: NÃO reimplementar as regras de negócio que já
 * existem dentro dos handlers em server/index.ts (isso seria arriscado de
 * divergir e causar regressão). O objetivo é só barrar, com um 400 limpo,
 * payloads com TIPOS errados que hoje derrubam o handler com uma exceção não
 * tratada (ex: `telefone` sendo um número/objeto em vez de string faz
 * `telefoneRaw.replace(...)` estourar TypeError -> vira 500 "Erro ao..." em vez
 * de um 400 claro).
 *
 * Por isso quase todo campo é `.nullable().optional()`: ausência ou null do
 * campo continua sendo responsabilidade da validação manual que já existe no
 * handler (mantém a mensagem de erro que o front já trata hoje). Só o TIPO é
 * validado aqui.
 */

// ─── /api/login ────────────────────────────────────────────────────────────

export const loginInputSchema = z.object({
  email: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
});

// ─── /api/leads ────────────────────────────────────────────────────────────

// cpf_cnpj/cpfCnpj já são tratados por onlyDigits(value: unknown) no handler,
// que é seguro para string ou number — por isso aceitamos os dois tipos aqui.
const stringOrNumber = z.union([z.string(), z.number()]);

export const leadInputSchema = z
  .object({
    nome: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    telefone: stringOrNumber.nullable().optional(),
    empresa: z.string().nullable().optional(),
    cpf_cnpj: stringOrNumber.nullable().optional(),
    cpfCnpj: stringOrNumber.nullable().optional(),
    tipo_pessoa: z.string().nullable().optional(),
    tipoPessoa: z.string().nullable().optional(),
    origem: z.string().nullable().optional(),
  })
  // .passthrough(): a rota lê dezenas de outros campos (valor_solicitado,
  // prazo_meses, utm_source, etc.) que já passam por Number()/coerção segura
  // no handler — não faz parte do escopo desta correção revalidar todos eles.
  .passthrough();

export type LoginInput = z.infer<typeof loginInputSchema>;
export type LeadInput = z.infer<typeof leadInputSchema>;

/**
 * Middleware genérico: valida req.body contra um schema Zod.
 * Em caso de falha, responde 400 e interrompe a cadeia — nunca deixa
 * passar para o handler original um corpo com tipo errado.
 */
export function validateBody(
  schema: z.ZodTypeAny,
  errorMessageField: "error" | "message" = "error",
  extraFields: Record<string, unknown> = {},
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      res.status(400).json({ ...extraFields, [errorMessageField]: "Corpo da requisição inválido." });
      return;
    }
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        ...extraFields,
        [errorMessageField]: "Dados inválidos.",
        details: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }
    next();
  };
}
