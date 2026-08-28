import { useState } from "react";
import { Copy, Link2, Loader2, Mail, MessageCircle, Send, Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface SolicitacaoDocumentosProps {
  empresaId: string;
  empresaNome: string;
  destinatario?: {
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
    whatsapp?: string | null;
  };
}

export default function SolicitarDocumentos({ empresaId, empresaNome, destinatario }: SolicitacaoDocumentosProps) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(destinatario?.nome || "");
  const [email, setEmail] = useState(destinatario?.email || "");
  const [telefone, setTelefone] = useState(destinatario?.whatsapp || destinatario?.telefone || "");
  const [gerando, setGerando] = useState(false);
  const [url, setUrl] = useState("");
  const [expiraEm, setExpiraEm] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [urlLivre, setUrlLivre] = useState("");
  const [expiraLivre, setExpiraLivre] = useState("");
  const [copiadoLivre, setCopiadoLivre] = useState(false);

  function abrir() {
    setNome(destinatario?.nome || "");
    setEmail(destinatario?.email || "");
    setTelefone(destinatario?.whatsapp || destinatario?.telefone || "");
    setUrl("");
    setExpiraEm("");
    setCopiado(false);
    setUrlLivre("");
    setExpiraLivre("");
    setCopiadoLivre(false);
    setAberto(true);
  }

  async function gerar(canal: "" | "email" | "whatsapp") {
    if (canal === "email" && !email.trim()) {
      toast.error("Informe um e-mail de destino.");
      return;
    }
    if (canal === "whatsapp" && !telefone.trim()) {
      toast.error("Informe um telefone/WhatsApp de destino.");
      return;
    }
    setGerando(true);
    try {
      const resultado = await apiFetch(`/api/coleta-documentos/interno/empresas/${empresaId}/link`, {
        method: "POST",
        body: JSON.stringify({
          canal: canal || undefined,
          destinatario: { nome, email, telefone, whatsapp: telefone },
        }),
      });
      setUrl(resultado?.url || "");
      setExpiraEm(resultado?.expira_em || "");
      if (canal === "whatsapp" && resultado?.link_whatsapp) {
        window.open(resultado.link_whatsapp, "_blank", "noopener,noreferrer");
        toast.success("WhatsApp preparado. Confirme o envio na janela aberta.");
      } else if (canal === "email") {
        toast.success("Link de coleta enviado por e-mail.");
      } else {
        toast.success("Link de coleta gerado.");
      }
    } catch (error: any) {
      if (error?.message && url) toast.error(error.message);
      else toast.error(error?.message || "Não foi possível gerar o link de coleta.");
    } finally {
      setGerando(false);
    }
  }

  async function gerarLivre() {
    setGerando(true);
    try {
      const resultado = await apiFetch("/api/coleta-documentos-livre/interno/link", {
        method: "POST",
        body: JSON.stringify({ rotulo: `Link livre — ${empresaNome}` }),
      });
      setUrlLivre(resultado?.url || "");
      setExpiraLivre(resultado?.expira_em || "");
      toast.success("Link livre gerado. Ele pode ser compartilhado com PF ou PJ.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar o link livre.");
    } finally {
      setGerando(false);
    }
  }

  async function copiarLivre() {
    if (!urlLivre) return;
    try {
      await navigator.clipboard.writeText(urlLivre);
      setCopiadoLivre(true);
      toast.success("Link livre copiado.");
      window.setTimeout(() => setCopiadoLivre(false), 1800);
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o link para copiar.");
    }
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success("Link copiado.");
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o link para copiar.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="flex items-center gap-1 text-[10px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-1 rounded-lg hover:bg-cyan-100 transition-colors"
        title="Gerar link seguro para a empresa enviar documentos"
      >
        <Link2 className="w-3.5 h-3.5" />
        <span>Solicitar documentos</span>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => !gerando && setAberto(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-700">Coleta segura</p>
                <h3 className="mt-1 text-lg font-black text-foreground">Solicitar documentos</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Gere um link de acesso único para <strong>{empresaNome}</strong>. O prazo inicial é de 30 dias.</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} disabled={gerando} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Nome do destinatário</label><input value={nome} onChange={(event) => setNome(event.target.value)} className="w-full h-9 rounded-lg border border-border px-3 text-sm" placeholder="Responsável pela empresa" /></div>
              <div><label className="block text-xs font-semibold text-muted-foreground mb-1">E-mail</label><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="w-full h-9 rounded-lg border border-border px-3 text-sm" placeholder="cliente@empresa.com" /></div>
              <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Telefone / WhatsApp</label><input value={telefone} onChange={(event) => setTelefone(event.target.value)} className="w-full h-9 rounded-lg border border-border px-3 text-sm" placeholder="(61) 99999-9999" /></div>
            </div>

            {url && (
              <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-800">Link gerado</p>
                <div className="mt-2 flex gap-2"><input readOnly value={url} className="min-w-0 flex-1 rounded-lg border border-cyan-200 bg-white px-2 py-2 text-xs text-cyan-900" onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={copiar} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-bold text-white">{copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiado ? "Copiado" : "Copiar"}</button></div>
                {expiraEm && <p className="mt-2 text-[11px] text-cyan-800">Válido até {new Date(expiraEm).toLocaleDateString("pt-BR")}.</p>}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-800">Link livre compartilhável</p>
              <p className="mt-1 text-[11px] leading-5 text-violet-900">Recebe documentos de PF ou PJ, mesmo sem cadastro. Os arquivos ficam em cofre separado e não entram automaticamente em fichas.</p>
              {urlLivre && <div className="mt-2 flex gap-2"><input readOnly value={urlLivre} className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-2 py-2 text-xs text-violet-900" onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={copiarLivre} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white">{copiadoLivre ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiadoLivre ? "Copiado" : "Copiar"}</button></div>}
              {expiraLivre && <p className="mt-2 text-[11px] text-violet-800">Válido até {new Date(expiraLivre).toLocaleDateString("pt-BR")}.</p>}
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void gerarLivre()} disabled={gerando} className="h-9 rounded-lg border border-violet-200 bg-white px-3 text-xs font-bold text-violet-800 hover:bg-violet-100 flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> {urlLivre ? "Gerar outro link livre" : "Gerar link livre"}</button><button type="button" onClick={() => window.open("/colaborador/cofre-documentos-publico", "_blank", "noopener,noreferrer")} className="h-9 rounded-lg border border-violet-200 bg-white px-3 text-xs font-bold text-violet-800 hover:bg-violet-100 flex items-center gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> Ver cofre interno</button></div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setAberto(false)} disabled={gerando} className="h-9 px-3 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:bg-muted">Fechar</button>
              <button type="button" onClick={() => void gerar("")} disabled={gerando} className="h-9 px-3 rounded-lg border border-cyan-200 bg-cyan-50 text-xs font-bold text-cyan-800 hover:bg-cyan-100 flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Gerar link</button>
              <button type="button" onClick={() => void gerar("email")} disabled={gerando} className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-bold text-foreground hover:bg-muted flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mail</button>
              <button type="button" onClick={() => void gerar("whatsapp")} disabled={gerando} className="h-9 px-3 rounded-lg bg-success/10 border border-success/20 text-xs font-bold text-success hover:bg-success/20 flex items-center gap-1.5">{gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
