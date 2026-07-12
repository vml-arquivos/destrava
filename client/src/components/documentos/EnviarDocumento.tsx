import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Mail, MessageCircle, X, Loader2, Send } from "lucide-react";

export interface DestinatarioPadrao {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
}

interface EnviarDocumentoProps {
  tipoDocumento: "orcamento" | "contrato" | "simulacao" | "proposta_bancaria" | "faturamento" | "dossie_assessoria" | string;
  documentoId: string;
  destinatarioPadrao: DestinatarioPadrao;
  empresaId?: string | null;
  clientePfId?: string | null;
  /** Classe extra pros botões, pra encaixar visualmente onde for plugado (ex: ao lado de "Baixar"/"Imprimir"). */
  className?: string;
}

const RESUMO_TIPO: Record<string, string> = {
  orcamento: "orçamento",
  contrato: "contrato",
  simulacao: "resultado da simulação",
  proposta_bancaria: "proposta bancária",
  faturamento: "relatório de faturamento",
  dossie_assessoria: "dossiê de assessoria",
};

export default function EnviarDocumento({
  tipoDocumento, documentoId, destinatarioPadrao, empresaId, clientePfId, className,
}: EnviarDocumentoProps) {
  const { isFeatureEnabled } = useFeatureAccess();
  const podeEmail = isFeatureEnabled("documento-action-enviar-email");
  const podeWhatsapp = isFeatureEnabled("documento-action-enviar-whatsapp");

  const [canalAberto, setCanalAberto] = useState<"email" | "whatsapp" | null>(null);
  const [nome, setNome] = useState(destinatarioPadrao.nome || "");
  const [email, setEmail] = useState(destinatarioPadrao.email || "");
  const [telefone, setTelefone] = useState(destinatarioPadrao.whatsapp || destinatarioPadrao.telefone || "");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  const rotulo = RESUMO_TIPO[tipoDocumento] || "documento";

  function abrir(canal: "email" | "whatsapp") {
    setNome(destinatarioPadrao.nome || "");
    setEmail(destinatarioPadrao.email || "");
    setTelefone(destinatarioPadrao.whatsapp || destinatarioPadrao.telefone || "");
    setMensagem("");
    setCanalAberto(canal);
  }

  async function confirmar() {
    if (canalAberto === "email" && !email.trim()) {
      toast.error("Informe um e-mail de destino.");
      return;
    }
    if (canalAberto === "whatsapp" && !telefone.trim()) {
      toast.error("Informe um telefone/WhatsApp de destino.");
      return;
    }
    setEnviando(true);
    try {
      const resultado = await apiFetch("/api/documentos/enviar", {
        method: "POST",
        body: JSON.stringify({
          tipo_documento: tipoDocumento,
          documento_id: documentoId,
          canal: canalAberto,
          destinatario: { nome, email, telefone, whatsapp: telefone },
          mensagem: mensagem || undefined,
          empresa_id: empresaId || undefined,
          cliente_pf_id: clientePfId || undefined,
        }),
      });

      if (canalAberto === "whatsapp" && resultado?.linkWhatsapp) {
        window.open(resultado.linkWhatsapp, "_blank", "noopener,noreferrer");
        toast.success("Link do WhatsApp aberto — confirme o envio por lá.");
      } else if (canalAberto === "email") {
        toast.success(`${rotulo[0].toUpperCase()}${rotulo.slice(1)} enviado por e-mail.`);
      }
      setCanalAberto(null);
    } catch (err: any) {
      toast.error(err?.message || `Não foi possível enviar o ${rotulo}.`);
    } finally {
      setEnviando(false);
    }
  }

  if (!podeEmail && !podeWhatsapp) return null;

  return (
    <>
      <div className={`flex items-center gap-2 ${className || ""}`}>
        {podeEmail && (
          <button type="button" onClick={() => abrir("email")} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Enviar e-mail
          </button>
        )}
        {podeWhatsapp && (
          <button type="button" onClick={() => abrir("whatsapp")} className="h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </button>
        )}
      </div>

      {canalAberto && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => !enviando && setCanalAberto(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                {canalAberto === "email" ? <Mail className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                Enviar {rotulo} por {canalAberto === "email" ? "e-mail" : "WhatsApp"}
              </h3>
              <button type="button" onClick={() => setCanalAberto(null)} disabled={enviando} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nome do destinatário</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Nome" />
              </div>

              {canalAberto === "email" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">E-mail</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" placeholder="cliente@exemplo.com" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Telefone / WhatsApp</label>
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" placeholder="(61) 99999-9999" />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Mensagem (opcional)</label>
                <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" placeholder={`Mensagem padrão será usada se deixar em branco.`} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button type="button" onClick={() => setCanalAberto(null)} disabled={enviando} className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={confirmar} disabled={enviando} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Confirmar envio
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
