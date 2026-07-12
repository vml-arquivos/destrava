import type { Pool } from "pg";
import crypto from "crypto";

/**
 * Envio direto de documentos (orçamento, contrato, simulação, proposta bancária,
 * faturamento, dossiê de assessoria...) por e-mail e WhatsApp.
 *
 * Decisões de arquitetura (documentadas conforme pedido):
 *
 * - E-MAIL: via Resend (https://resend.com), API HTTP simples -- só precisa da
 *   variável de ambiente RESEND_API_KEY. O PDF vai **anexado de verdade** no
 *   e-mail (Resend aceita anexo em base64), não como link -- assim não precisa
 *   de nenhuma rota pública nem token pra esse canal. Se RESEND_API_KEY não
 *   estiver configurada, o envio falha com mensagem clara em vez de travar ou
 *   falhar silenciosamente.
 *
 * - WHATSAPP: wa.me não permite anexar arquivo, só texto pré-preenchido. Por
 *   isso geramos um **link público de acesso único** (token aleatório, válido
 *   por tempo limitado) que aponta pra uma rota sem login
 *   (GET /api/documentos-publicos/:token, ver server/index.ts) -- o
 *   destinatário abre o link e baixa o documento sem precisar ter conta no
 *   sistema. Isso NÃO é envio 100% automático: o colaborador ainda precisa
 *   clicar em "abrir" e confirmar o envio no WhatsApp Web/app dele. Optamos
 *   por essa rota porque não exige contratar uma API paga (Meta Cloud API ou
 *   Twilio). Se decidirem por envio 100% automático no futuro, é só trocar
 *   `gerarLinkWhatsapp` por uma chamada real de API.
 */

export interface DestinatarioDocumento {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
}

export interface EnviarDocumentoInput {
  tipoDocumento: string; // 'orcamento' | 'contrato' | 'simulacao' | 'proposta_bancaria' | 'faturamento' | 'dossie_assessoria' | ...
  documentoId: string;
  canal: "email" | "whatsapp";
  destinatario: DestinatarioDocumento;
  assunto?: string;
  mensagem?: string;
  /** Obrigatório pro canal 'email' -- bytes do PDF/arquivo a anexar. */
  arquivo?: { buffer: Buffer; filename: string; mimeType?: string } | null;
  /** Base pra montar o link público do canal 'whatsapp' (ex: https://destravacredito.com). */
  baseUrlPublica?: string;
  empresaId?: string | null;
  clientePfId?: string | null;
  enviadoPor?: string | null;
}

export interface EnviarDocumentoResultado {
  ok: boolean;
  canal: "email" | "whatsapp";
  status: "enviado" | "falhou" | "link_gerado";
  mensagemErro?: string;
  linkWhatsapp?: string; // presente quando canal = 'whatsapp'
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function rotuloTipoDocumento(tipoDocumento: string): string {
  const mapa: Record<string, string> = {
    orcamento: "orçamento",
    contrato: "contrato",
    simulacao: "resultado da simulação",
    proposta_bancaria: "proposta bancária",
    faturamento: "relatório de faturamento",
    dossie_assessoria: "dossiê de assessoria",
  };
  return mapa[tipoDocumento] || "documento";
}

function montarMensagemPadrao(tipoDocumento: string, nomeDestinatario?: string | null, linkOpcional?: string): string {
  const rotulo = rotuloTipoDocumento(tipoDocumento);
  const saudacao = nomeDestinatario ? `Olá, ${nomeDestinatario}!` : "Olá!";
  const base = `${saudacao} Segue o(a) ${rotulo} da Destrava Crédito.`;
  return linkOpcional ? `${base} ${linkOpcional}` : base;
}

async function enviarPorEmail(input: EnviarDocumentoInput): Promise<EnviarDocumentoResultado> {
  const apiKey = process.env.RESEND_API_KEY;
  const remetente = process.env.RESEND_FROM_EMAIL || "Destrava Crédito <nao-responda@destravacredito.com>";

  if (!input.destinatario.email) {
    return { ok: false, canal: "email", status: "falhou", mensagemErro: "Destinatário sem e-mail cadastrado." };
  }
  if (!apiKey) {
    return {
      ok: false,
      canal: "email",
      status: "falhou",
      mensagemErro: "Envio de e-mail não configurado neste ambiente (falta RESEND_API_KEY). Configure a variável de ambiente no Coolify para habilitar o envio.",
    };
  }
  if (!input.arquivo?.buffer) {
    return { ok: false, canal: "email", status: "falhou", mensagemErro: "Documento não pôde ser preparado para anexar ao e-mail." };
  }

  const assunto = input.assunto || `Destrava Crédito — ${rotuloTipoDocumento(input.tipoDocumento)}`;
  const mensagem = input.mensagem || montarMensagemPadrao(input.tipoDocumento, input.destinatario.nome);

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente,
        to: [input.destinatario.email],
        subject: assunto,
        html: `<p>${mensagem.replace(/\n/g, "<br/>")}</p>`,
        attachments: [
          {
            filename: input.arquivo.filename,
            content: input.arquivo.buffer.toString("base64"),
          },
        ],
      }),
    });

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => "");
      return { ok: false, canal: "email", status: "falhou", mensagemErro: `Falha ao enviar e-mail (HTTP ${resp.status}): ${corpo.slice(0, 300)}` };
    }

    return { ok: true, canal: "email", status: "enviado" };
  } catch (err: any) {
    return { ok: false, canal: "email", status: "falhou", mensagemErro: err?.message || "Erro desconhecido ao enviar e-mail." };
  }
}

async function gerarLinkWhatsapp(pool: Pool, input: EnviarDocumentoInput): Promise<EnviarDocumentoResultado & { token?: string; tokenExpiraEm?: Date }> {
  const numero = onlyDigits(input.destinatario.whatsapp || input.destinatario.telefone);
  if (!numero) {
    return { ok: false, canal: "whatsapp", status: "falhou", mensagemErro: "Destinatário sem telefone/WhatsApp cadastrado." };
  }
  if (!input.baseUrlPublica) {
    return { ok: false, canal: "whatsapp", status: "falhou", mensagemErro: "URL pública do sistema não configurada." };
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
  const linkPublico = `${input.baseUrlPublica.replace(/\/$/, "")}/api/documentos-publicos/${token}`;

  const numeroComDDI = numero.length <= 11 ? `55${numero}` : numero;
  const mensagem = input.mensagem || montarMensagemPadrao(input.tipoDocumento, input.destinatario.nome, linkPublico);
  const link = `https://wa.me/${numeroComDDI}?text=${encodeURIComponent(mensagem)}`;

  return { ok: true, canal: "whatsapp", status: "link_gerado", linkWhatsapp: link, token, tokenExpiraEm: expiraEm };
}

export async function enviarDocumento(pool: Pool, input: EnviarDocumentoInput): Promise<EnviarDocumentoResultado> {
  const resultado = input.canal === "email" ? await enviarPorEmail(input) : await gerarLinkWhatsapp(pool, input);

  try {
    await pool.query(
      `INSERT INTO documentos_enviados
        (tipo_documento, documento_id, empresa_id, cliente_pf_id, canal, destinatario, destinatario_nome, assunto, mensagem, status, erro, token, token_expira_em, enviado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        input.tipoDocumento,
        input.documentoId,
        input.empresaId || null,
        input.clientePfId || null,
        input.canal,
        input.canal === "email" ? (input.destinatario.email || "") : (input.destinatario.whatsapp || input.destinatario.telefone || ""),
        input.destinatario.nome || null,
        input.assunto || null,
        input.mensagem || null,
        resultado.status,
        resultado.mensagemErro || null,
        (resultado as any).token || null,
        (resultado as any).tokenExpiraEm || null,
        input.enviadoPor || null,
      ]
    );
  } catch (err) {
    console.error("[documentDeliveryService] Falha ao registrar log de envio:", err);
  }

  return { ok: resultado.ok, canal: resultado.canal, status: resultado.status, mensagemErro: resultado.mensagemErro, linkWhatsapp: (resultado as any).linkWhatsapp };
}

/** Usado pela rota pública (sem login) que resolve o token do link de WhatsApp. */
export async function resolverTokenPublico(pool: Pool, token: string): Promise<{ tipoDocumento: string; documentoId: string } | null> {
  const { rows } = await pool.query(
    `SELECT tipo_documento, documento_id FROM documentos_enviados WHERE token = $1 AND (token_expira_em IS NULL OR token_expira_em > NOW()) LIMIT 1`,
    [token]
  );
  if (!rows.length) return null;
  return { tipoDocumento: rows[0].tipo_documento, documentoId: rows[0].documento_id };
}

