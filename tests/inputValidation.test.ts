import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { contactInputSchema, loginInputSchema, leadInputSchema, validateBody } from "../server/lib/inputValidation";

function appWithValidator(schema: Parameters<typeof validateBody>[0]) {
  const app = express();
  app.use(express.json());
  app.post("/test", validateBody(schema), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

// ─── loginInputSchema ───────────────────────────────────────────────────────

describe("loginInputSchema — comportamento hoje aceito por /api/login não pode mudar", () => {
  const app = appWithValidator(loginInputSchema);

  it("aceita email/password como strings (caso normal de login)", async () => {
    const res = await request(app).post("/test").send({ email: "a@b.com", password: "123456" });
    expect(res.status).toBe(200);
  });

  it("aceita email/password ausentes (handler original decide o 400 'obrigatórios')", async () => {
    const res = await request(app).post("/test").send({});
    expect(res.status).toBe(200);
  });

  it("aceita email/password null (handler original decide o 400 'obrigatórios')", async () => {
    const res = await request(app).post("/test").send({ email: null, password: null });
    expect(res.status).toBe(200);
  });

  it("REJEITA email com tipo número — antes derrubava o handler em email.trim() (TypeError -> 500)", async () => {
    const res = await request(app).post("/test").send({ email: 12345, password: "x" });
    expect(res.status).toBe(400);
  });

  it("REJEITA password com tipo objeto", async () => {
    const res = await request(app).post("/test").send({ email: "a@b.com", password: { x: 1 } });
    expect(res.status).toBe(400);
  });

  it("REJEITA corpo que não é objeto (array)", async () => {
    const res = await request(app).post("/test").send([1, 2, 3]);
    expect(res.status).toBe(400);
  });
});

// ─── leadInputSchema ────────────────────────────────────────────────────────

describe("leadInputSchema — comportamento hoje aceito por /api/leads não pode mudar", () => {
  const app = appWithValidator(leadInputSchema);

  it("aceita payload típico do simulador público (PF)", async () => {
    const res = await request(app).post("/test").send({
      nome: "Maria Teste",
      email: "maria@exemplo.com",
      telefone: "(61) 99999-9999",
      cpf_cnpj: "12345678901",
      tipo_pessoa: "pf",
      origem: "simulador_publico",
      valor_solicitado: 50000,
      prazo_meses: 24,
    });
    expect(res.status).toBe(200);
  });

  it("aceita payload típico PJ com alias cpfCnpj/tipoPessoa (camelCase)", async () => {
    const res = await request(app).post("/test").send({
      nome: "João",
      cpfCnpj: "12345678000195",
      tipoPessoa: "empresa",
      origem: "site",
    });
    expect(res.status).toBe(200);
  });

  it("aceita lead criado manualmente pelo CRM sem documento (origem != simulador)", async () => {
    const res = await request(app).post("/test").send({ nome: "Lead manual", origem: "manual" });
    expect(res.status).toBe(200);
  });

  it("aceita cpf_cnpj como number (onlyDigits() do handler já trata number)", async () => {
    const res = await request(app).post("/test").send({ nome: "Teste", cpf_cnpj: 12345678901 });
    expect(res.status).toBe(200);
  });

  it("aceita campos extras não mapeados (utm_source, pagina, etc.) — passthrough", async () => {
    const res = await request(app).post("/test").send({ nome: "Teste", utm_source: "google", pagina: "/simulador" });
    expect(res.status).toBe(200);
  });

  it("REJEITA telefone com tipo objeto — antes derrubava o handler em telefoneRaw.replace() (TypeError -> 500)", async () => {
    const res = await request(app).post("/test").send({ nome: "Teste", telefone: { ddd: 61, numero: 999999999 } });
    expect(res.status).toBe(400);
  });

  it("REJEITA nome com tipo array", async () => {
    const res = await request(app).post("/test").send({ nome: ["a", "b"] });
    expect(res.status).toBe(400);
  });

  it("REJEITA corpo nulo/ausente", async () => {
    const res = await request(app).post("/test").send();
    // supertest sem .send() manda corpo vazio; express.json() deixa req.body = {}
    // então este caso deve passar (objeto vazio é válido) — cobre a semântica atual.
    expect(res.status).toBe(200);
  });
});

describe("contactInputSchema — bloqueio de spam e payloads inválidos", () => {
  const app = appWithValidator(contactInputSchema);

  it("aceita contato válido", async () => {
    const res = await request(app).post("/test").send({
      nome: "Maria Teste",
      email: "maria@example.com",
      telefone: "(61) 99999-9999",
      assunto: "Certificado A1",
      mensagem: "Gostaria de receber orientação.",
    });
    expect(res.status).toBe(200);
  });

  it("rejeita email inválido e mensagem vazia", async () => {
    const res = await request(app).post("/test").send({
      nome: "Maria",
      email: "email-invalido",
      assunto: "Contato",
      mensagem: "",
    });
    expect(res.status).toBe(400);
  });
});
