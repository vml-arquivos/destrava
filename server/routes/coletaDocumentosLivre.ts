import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { Pool } from "pg";
import { auth } from "../middleware/auth";
import { sanitizeFileName, validarArquivo } from "./documentos";
import { resolveDocumentPath, saveDocumentBuffer } from "../services/documentStorage";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PUBLIC_LINK_DAYS = 30;
const PUBLIC_BASE_URL = () => (process.env.PUBLIC_SITE_URL || "https://destravacredito.com").replace(/\/$/, "");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const uploadWithFriendlyError = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (error: any) => {
    if (!error) return next();
    res.status(400).json({
      error: error?.code === "LIMIT_FILE_SIZE"
        ? "O arquivo excede o limite de 25 MB. Envie um PDF ou imagem menor."
        : error?.message || "Não foi possível receber o arquivo.",
      code: error?.code || "UPLOAD_INVALIDO",
    });
  });
};

const readRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas consultas. Aguarde alguns minutos e tente novamente." },
});

const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitos envios em pouco tempo. Aguarde alguns minutos antes de tentar novamente." },
});

const FREE_DOCUMENT_TYPES: Record<string, { nome: string; physicalType: string }> = {
  cartao_cnpj: { nome: "Cartão CNPJ", physicalType: "cartao_cnpj" },
  contrato_social: { nome: "Contrato social", physicalType: "contrato_social" },
  alteracao_contratual: { nome: "Alteração contratual", physicalType: "alteracao_contratual" },
  documento_socio: { nome: "Documento de identificação", physicalType: "outros" },
  rg: { nome: "RG", physicalType: "rg" },
  cpf: { nome: "CPF", physicalType: "cpf" },
  cnh: { nome: "CNH", physicalType: "cnh" },
  comprovante_residencia: { nome: "Comprovante de residência", physicalType: "comprovante_residencia" },
  comprovante_faturamento: { nome: "Comprovante de faturamento", physicalType: "comprovante_faturamento" },
  extrato_bancario: { nome: "Extrato bancário", physicalType: "extrato_bancario" },
  balanco: { nome: "Balanço patrimonial", physicalType: "balanco" },
  dre: { nome: "DRE", physicalType: "dre" },
  certidao: { nome: "Certidão", physicalType: "certidao" },
  outros: { nome: "Outro documento", physicalType: "outros" },
};

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function valueHash(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? crypto.createHash("sha256").update(text).digest("hex") : null;
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function safeText(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function validEmail(value: string): boolean {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicStatusMessage(status: string): string {
  if (status === "expirado") return "Este link expirou. Solicite um novo link à equipe responsável.";
  if (status === "revogado") return "Este link foi encerrado. Solicite um novo link à equipe responsável.";
  if (status === "concluido") return "Este link não aceita novos envios. Solicite orientação à equipe responsável.";
  return "Este link não está disponível. Solicite um novo link à equipe responsável.";
}

async function resolveFreeLink(pool: Pool, token: string): Promise<{ id: string; status: string; expira_em: string } | null> {
  if (!token || token.length > 160) return null;
  const { rows } = await pool.query(
    `SELECT id, status, expira_em
       FROM public.links_cofre_documentos_publico
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash(token)],
  );
  const link = rows[0];
  if (!link) return null;
  if (link.status === "ativo" && new Date(link.expira_em).getTime() <= Date.now()) {
    await pool.query(
      `UPDATE public.links_cofre_documentos_publico
          SET status = 'expirado', atualizado_em = NOW()
        WHERE id = $1 AND status = 'ativo'`,
      [link.id],
    );
    return { ...link, status: "expirado" };
  }
  return link;
}

function requireCollaborator(req: Request): string | null {
  const colaborador = (req as Request & { colaborador?: { id?: string } }).colaborador;
  return colaborador?.id || null;
}

export function createColetaDocumentosLivreRouter(pool: Pool): Router {
  const router = Router();

  router.post("/interno/link", auth, async (req: Request, res: Response) => {
    try {
      const colaboradorId = requireCollaborator(req);
      if (!colaboradorId) return res.status(401).json({ error: "Sessão inválida." });
      const rotulo = safeText(req.body?.rotulo, 160) || null;
      const token = crypto.randomBytes(24).toString("base64url");
      const expiraEm = new Date(Date.now() + PUBLIC_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const result = await pool.query(
        `INSERT INTO public.links_cofre_documentos_publico (token_hash, rotulo, criado_por, expira_em)
         VALUES ($1, $2, $3, $4)
         RETURNING id, expira_em`,
        [tokenHash(token), rotulo, colaboradorId, expiraEm],
      );
      const linkId = result.rows[0]?.id;
      if (!linkId) return res.status(500).json({ error: "Não foi possível gerar o link livre." });
      return res.status(201).json({
        ok: true,
        link_id: linkId,
        url: `${PUBLIC_BASE_URL()}/documentos-livre/${encodeURIComponent(token)}`,
        expira_em: expiraEm,
      });
    } catch (error) {
      console.error("[POST /api/coleta-documentos-livre/interno/link]", error);
      return res.status(500).json({ error: "Não foi possível gerar o link livre." });
    }
  });

  router.get("/interno/pendencias", auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT d.id, d.link_id, d.tipo_pessoa, d.nome_remetente, d.documento_tipo,
                d.nome_organizacao, d.email_remetente, d.telefone_remetente,
                d.tipo_documento, d.descricao_documento, d.nome_original, d.mime_type,
                d.tamanho_bytes, d.hash_arquivo, d.status, d.analise_status,
                d.analise_resultado, d.motivo_revisao, d.criado_em, d.atualizado_em
           FROM public.cofre_documentos_publico d
          WHERE d.status IN ('pendente_analise','processando','revisao_humana')
          ORDER BY d.criado_em ASC
          LIMIT 200`,
      );
      return res.json({ items: rows });
    } catch (error) {
      console.error("[GET /api/coleta-documentos-livre/interno/pendencias]", error);
      return res.status(500).json({ error: "Não foi possível carregar o cofre documental." });
    }
  });

  router.get("/interno/:id/arquivo", auth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, nome_arquivo, nome_original, caminho_arquivo
           FROM public.cofre_documentos_publico
          WHERE id = $1
          LIMIT 1`,
        [req.params.id],
      );
      const item = result.rows[0];
      if (!item) return res.status(404).json({ error: "Documento do cofre não encontrado." });
      const resolved = resolveDocumentPath({ ...item, entidade_tipo: "cofre_publico", entidade_id: item.id });
      if (!resolved.absolutePath) return res.status(404).json({ error: "Arquivo não encontrado no armazenamento." });
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFileName(item.nome_original || item.nome_arquivo || "documento")}"`);
      return res.sendFile(resolved.absolutePath);
    } catch (error) {
      console.error("[GET /api/coleta-documentos-livre/interno/:id/arquivo]", error);
      return res.status(500).json({ error: "Não foi possível baixar o documento." });
    }
  });

  router.post("/interno/:id/revisao", auth, async (req: Request, res: Response) => {
    try {
      const colaboradorId = requireCollaborator(req);
      if (!colaboradorId) return res.status(401).json({ error: "Sessão inválida." });
      const status = ["aceito", "recusado", "arquivado"].includes(String(req.body?.status)) ? String(req.body.status) : "";
      if (!status) return res.status(400).json({ error: "Status de revisão inválido." });
      const observacoes = safeText(req.body?.observacoes_internas, 4000) || null;
      const result = await pool.query(
        `UPDATE public.cofre_documentos_publico
            SET status = $2, observacoes_internas = $3,
                revisado_por = $4, revisado_em = NOW(), atualizado_em = NOW()
          WHERE id = $1
          RETURNING id, status, revisado_em`,
        [req.params.id, status, observacoes, colaboradorId],
      );
      if (!result.rows[0]) return res.status(404).json({ error: "Documento do cofre não encontrado." });
      return res.json({ ok: true, item: result.rows[0], vinculo_oficial: false });
    } catch (error) {
      console.error("[POST /api/coleta-documentos-livre/interno/:id/revisao]", error);
      return res.status(500).json({ error: "Não foi possível revisar o documento." });
    }
  });

  router.get("/:token", readRateLimiter, async (req: Request, res: Response) => {
    try {
      const link = await resolveFreeLink(pool, req.params.token);
      if (!link) return res.status(410).json({ error: "Link inválido. Solicite um novo link à equipe responsável." });
      if (link.status !== "ativo") return res.status(410).json({ error: publicStatusMessage(link.status) });
      return res.json({
        ok: true,
        link: { status: "ativo", expira_em: link.expira_em },
        finalidade: "Envie um documento para conferência da equipe. O arquivo ficará em um cofre de triagem e não será vinculado automaticamente a nenhuma ficha.",
        tipos_pessoa: ["pf", "pj"],
        tipos_documento: Object.entries(FREE_DOCUMENT_TYPES).map(([codigo, item]) => ({ codigo, nome: item.nome })),
        limite_arquivo_mb: 25,
        consentimento_obrigatorio: true,
      });
    } catch (error) {
      console.error("[GET /api/coleta-documentos-livre/:token]", error);
      return res.status(500).json({ error: "Não foi possível carregar este link. Tente novamente mais tarde." });
    }
  });

  router.post("/:token/upload", uploadRateLimiter, uploadWithFriendlyError, async (req: Request, res: Response) => {
    let saved: { absolutePath: string; relativePath: string } | null = null;
    try {
      const link = await resolveFreeLink(pool, req.params.token);
      if (!link) return res.status(410).json({ error: "Link inválido. Solicite um novo link à equipe responsável." });
      if (link.status !== "ativo") return res.status(410).json({ error: publicStatusMessage(link.status) });

      const tipoPessoa = safeText(req.body?.tipo_pessoa, 10).toLowerCase();
      const nome = safeText(req.body?.nome_remetente, 180);
      const documentoTipo = safeText(req.body?.documento_tipo, 20).toLowerCase() || null;
      const documentoValor = onlyDigits(req.body?.documento_valor) || null;
      const nomeOrganizacao = safeText(req.body?.nome_organizacao, 240) || null;
      const email = safeText(req.body?.email_remetente, 240).toLowerCase();
      const telefone = safeText(req.body?.telefone_remetente, 60) || null;
      const tipoDocumento = safeText(req.body?.tipo_documento, 80).toLowerCase() || "outros";
      const descricao = safeText(req.body?.descricao_documento, 1000) || null;
      const consentimento = String(req.body?.consentimento || "").toLowerCase() === "true";
      if (!["pf", "pj"].includes(tipoPessoa)) return res.status(400).json({ error: "Informe se a documentação é de pessoa física ou jurídica." });
      if (nome.length < 2) return res.status(400).json({ error: "Informe o nome da pessoa ou responsável." });
      if (documentoTipo && !["cpf", "cnpj"].includes(documentoTipo)) return res.status(400).json({ error: "Tipo de identificação inválido." });
      if (documentoValor && ((documentoTipo === "cpf" && documentoValor.length !== 11) || (documentoTipo === "cnpj" && documentoValor.length !== 14))) return res.status(400).json({ error: "CPF ou CNPJ inválido." });
      if (!validEmail(email)) return res.status(400).json({ error: "Informe um e-mail válido ou deixe o campo em branco." });
      if (!FREE_DOCUMENT_TYPES[tipoDocumento]) return res.status(400).json({ error: "Tipo de documento não permitido." });
      if (!consentimento) return res.status(400).json({ error: "É necessário aceitar o uso dos dados para enviar o documento." });
      const file = req.file;
      if (!file) return res.status(400).json({ error: "Anexe um PDF, foto ou arquivo do documento." });
      validarArquivo(file, FREE_DOCUMENT_TYPES[tipoDocumento].physicalType);

      const id = crypto.randomUUID();
      const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
      const original = sanitizeFileName(file.originalname || "arquivo");
      const ext = original.includes(".") ? original.slice(original.lastIndexOf(".")).toLowerCase() : "";
      const filename = `${id}${ext}`;
      saved = await saveDocumentBuffer({ entidadeTipo: "cofre_publico", entidadeId: id, filename, buffer: file.buffer, expectedSha256: hash });
      const result = await pool.query(
        `INSERT INTO public.cofre_documentos_publico
          (id, link_id, tipo_pessoa, nome_remetente, documento_tipo, documento_valor,
           nome_organizacao, email_remetente, telefone_remetente, tipo_documento,
           descricao_documento, nome_original, nome_arquivo, caminho_arquivo,
           mime_type, tamanho_bytes, hash_arquivo, status, consentimento, consentido_em,
           origem_ip_hash, user_agent_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'revisao_humana',true,NOW(),$18,$19)
         RETURNING id, status, criado_em`,
        [
          id, link.id, tipoPessoa, nome, documentoTipo, documentoValor,
          nomeOrganizacao, email || null, telefone, tipoDocumento, descricao,
          file.originalname || original, filename, saved.relativePath, file.mimetype,
          file.size, hash, valueHash(req.ip), valueHash(req.get("user-agent")),
        ],
      );
      return res.status(201).json({
        ok: true,
        item: result.rows[0],
        status: "revisao_humana",
        mensagem: "Documento recebido no cofre de triagem. A equipe fará a conferência antes de qualquer vinculação.",
        vinculado: false,
      });
    } catch (error: any) {
      if (saved) await fs.unlink(saved.absolutePath).catch(() => undefined);
      console.error("[POST /api/coleta-documentos-livre/:token/upload]", error);
      return res.status(Number(error?.statusCode || 400)).json({ error: error?.message || "Não foi possível receber o documento." });
    }
  });

  return router;
}

export { FREE_DOCUMENT_TYPES, PUBLIC_LINK_DAYS, tokenHash };
