import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enviarDocumento,
  resolverTokenPublico,
  rotuloTipoDocumento,
} from "../server/services/documentDeliveryService";

function makePool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
}

describe("documentDeliveryService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("normaliza os rótulos dos tipos conhecidos", () => {
    expect(rotuloTipoDocumento("orcamento")).toBe("orçamento");
    expect(rotuloTipoDocumento("dossie_assessoria")).toBe("dossiê de assessoria");
    expect(rotuloTipoDocumento("tipo_desconhecido")).toBe("documento");
  });

  it("falha de forma explícita quando e-mail não está configurado", async () => {
    const pool = makePool();
    const result = await enviarDocumento(pool, {
      tipoDocumento: "contrato",
      documentoId: "doc-1",
      canal: "email",
      destinatario: { nome: "João", email: "joao@example.com" },
      arquivo: { buffer: Buffer.from("pdf"), filename: "contrato.pdf" },
    });

    expect(result).toMatchObject({
      ok: false,
      canal: "email",
      status: "falhou",
    });
    expect(result.mensagemErro).toContain("RESEND_API_KEY");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("envia e-mail com anexo quando Resend responde sucesso", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const pool = makePool();

    const result = await enviarDocumento(pool, {
      tipoDocumento: "contrato",
      documentoId: "doc-2",
      canal: "email",
      destinatario: { nome: "João", email: "joao@example.com" },
      assunto: "Contrato",
      mensagem: "Segue o documento.",
      arquivo: { buffer: Buffer.from("pdf"), filename: "contrato.pdf", mimeType: "application/pdf" },
    });

    expect(result).toMatchObject({ ok: true, canal: "email", status: "enviado" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.to).toEqual(["joao@example.com"]);
    expect(payload.attachments[0]).toMatchObject({
      filename: "contrato.pdf",
      content: Buffer.from("pdf").toString("base64"),
    });
  });

  it("retorna falha operacional quando Resend responde erro HTTP", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: vi.fn().mockResolvedValue("invalid recipient"),
    }));
    const pool = makePool();

    const result = await enviarDocumento(pool, {
      tipoDocumento: "orcamento",
      documentoId: "doc-3",
      canal: "email",
      destinatario: { email: "invalid@example.com" },
      arquivo: { buffer: Buffer.from("pdf"), filename: "orcamento.pdf" },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("falhou");
    expect(result.mensagemErro).toContain("HTTP 422");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("gera link WhatsApp e registra token quando telefone está presente", async () => {
    const pool = makePool();
    const result = await enviarDocumento(pool, {
      tipoDocumento: "simulacao",
      documentoId: "doc-4",
      canal: "whatsapp",
      destinatario: { nome: "Maria", telefone: "(61) 99999-9999" },
      baseUrlPublica: "https://destrava.example/",
    });

    expect(result).toMatchObject({ ok: true, canal: "whatsapp", status: "link_gerado" });
    expect(result.linkWhatsapp).toContain("https://wa.me/5561999999999?text=");
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toContain("link_gerado");
  });

  it("não gera WhatsApp sem telefone", async () => {
    const pool = makePool();
    const result = await enviarDocumento(pool, {
      tipoDocumento: "contrato",
      documentoId: "doc-5",
      canal: "whatsapp",
      destinatario: {},
      baseUrlPublica: "https://destrava.example",
    });

    expect(result).toMatchObject({ ok: false, canal: "whatsapp", status: "falhou" });
    expect(result.mensagemErro).toContain("telefone");
  });

  it("resolve somente token público ainda válido", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ tipo_documento: "contrato", documento_id: "doc-6" }] }),
    } as any;

    await expect(resolverTokenPublico(pool, "token-1")).resolves.toEqual({
      tipoDocumento: "contrato",
      documentoId: "doc-6",
    });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("token_expira_em"), ["token-1"]);
  });
});
