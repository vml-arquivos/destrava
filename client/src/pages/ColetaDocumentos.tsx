import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, FileCheck2, FileUp, Loader2, LockKeyhole, RefreshCw, ShieldCheck, UploadCloud, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";

type ColetaDocumento = {
  codigo: string;
  nome: string;
  finalidade: string;
  obrigatorio: boolean;
  tipos_arquivo: string[];
  aceitar: string;
  observacao?: string;
};

type ColetaState = {
  link: { status: string; expira_em: string };
  empresa: { nome: string };
  progresso: { enviados: number; total: number; faltam: number; percentual: number };
  etapa_atual: { numero: number; titulo: string; objetivo: string } | null;
  proximo_documento: ColetaDocumento | null;
  ultimo_envio: null | {
    status: "processando" | "promovido" | "revisao_humana" | "recusado";
    item_codigo: string;
    mensagem: string;
    criado_em: string;
  };
  concluido: boolean;
};

function formatDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}

function statusLabel(status?: string): string {
  if (status === "revisao_humana") return "Em conferência";
  if (status === "recusado") return "Precisa de novo envio";
  if (status === "promovido") return "Aceito";
  return "Recebido";
}

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-white">
      <div className="flex items-center gap-3 text-sm text-slate-300" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-300" aria-hidden="true" />
        Carregando sua coleta segura...
      </div>
    </main>
  );
}

export default function ColetaDocumentos() {
  const [, params] = useRoute("/documentos/:token");
  const token = params?.token || "";
  const [state, setState] = useState<ColetaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultadoLocal, setResultadoLocal] = useState<"promovido" | "revisao_humana" | null>(null);

  const carregar = useCallback(async () => {
    if (!token) {
      setErro("Link inválido. Solicite um novo link ao consultor responsável.");
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch(`/api/coleta-documentos/${encodeURIComponent(token)}`);
      setState(data as ColetaState);
      setErro("");
    } catch (error: any) {
      setErro(error?.message || "Não foi possível carregar esta coleta.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const documento = state?.proximo_documento || null;
  const inputAccept = useMemo(() => documento?.aceitar || ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx", [documento]);

  async function enviar() {
    if (!documento || !arquivo || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const form = new FormData();
      form.append("item_codigo", documento.codigo);
      form.append("file", arquivo);
      const resposta = await apiFetch(`/api/coleta-documentos/${encodeURIComponent(token)}/upload`, {
        method: "POST",
        body: form,
      });
      setResultadoLocal(resposta?.status === "promovido" ? "promovido" : "revisao_humana");
      setArquivo(null);
      await carregar();
    } catch (error: any) {
      setErro(error?.message || "Não foi possível enviar este documento.");
    } finally {
      setEnviando(false);
    }
  }

  if (loading) return <Loading />;

  if (erro && !state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300/15 text-amber-200">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Destrava Crédito</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Não foi possível abrir este link</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{erro}</p>
          <p className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-6 text-slate-300">Se você recebeu este link por engano ou ele venceu, fale com o consultor responsável para receber um novo acesso.</p>
        </section>
      </main>
    );
  }

  if (!state) return <Loading />;

  if (state.concluido) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-white">
        <section className="w-full max-w-md rounded-3xl border border-emerald-300/20 bg-white/10 p-6 text-center shadow-2xl backdrop-blur sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Coleta concluída</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Obrigado por enviar os documentos</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">Recebemos os documentos aceitos de <strong className="text-white">{state.empresa.nome}</strong>. O consultor responsável foi notificado para continuar a análise.</p>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-200"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Dados encaminhados com segurança</div>
        </section>
      </main>
    );
  }

  const percentual = Math.min(100, Math.max(0, state.progresso.percentual || 0));
  const ultimo = state.ultimo_envio;
  const mostrarResultado = resultadoLocal || (ultimo && ultimo.item_codigo === documento?.codigo ? ultimo.status : null);

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-200"><LockKeyhole className="h-4 w-4" aria-hidden="true" /><span className="text-xs font-bold">Coleta segura, sem login</span></div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Envio de documentos</h1>
            <p className="mt-1 text-sm text-slate-300">Para <strong className="text-white">{state.empresa.nome}</strong></p>
          </div>
          <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right text-[11px] text-slate-300 sm:block"><span className="block font-bold text-white">Link válido até</span>{formatDate(state.link.expira_em)}</div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Progresso</p><p className="mt-1 text-sm text-slate-300">{state.progresso.enviados} de {state.progresso.total} documentos aceitos</p></div>
            <strong className="text-xl font-black text-white">{percentual}%</strong>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30" aria-label={`Progresso: ${percentual}%`} role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all" style={{ width: `${percentual}%` }} /></div>
        </section>

        {erro && <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm leading-6 text-rose-100" role="alert">{erro}</div>}

        {mostrarResultado && (
          <section className={`mt-4 rounded-2xl border p-4 ${mostrarResultado === "promovido" ? "border-emerald-300/20 bg-emerald-300/10" : "border-amber-300/20 bg-amber-300/10"}`} aria-live="polite">
            <div className="flex items-start gap-3">
              {mostrarResultado === "promovido" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />}
              <div><p className="font-bold">{mostrarResultado === "promovido" ? "Documento aceito" : "Documento recebido para conferência"}</p><p className="mt-1 text-sm leading-6 text-slate-200">{mostrarResultado === "promovido" ? "Tudo certo. O próximo documento será mostrado abaixo." : "Precisamos confirmar este documento. Você pode tentar novamente com uma imagem ou PDF mais nítido; nossa equipe também fará a conferência."}</p></div>
            </div>
          </section>
        )}

        {documento ? (
          <section className="mt-5 rounded-3xl border border-cyan-200/20 bg-white p-5 text-slate-900 shadow-xl sm:p-7">
            <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-800">Etapa {state.etapa_atual?.numero || "—"}</span><span className="text-xs font-bold text-slate-500">Ainda faltam {state.progresso.faltam}</span></div>
            <h2 className="mt-5 text-2xl font-black tracking-tight">{documento.nome}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{documento.finalidade}</p>
            {state.etapa_atual?.objetivo && <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600"><strong className="text-slate-800">Nesta etapa:</strong> {state.etapa_atual.objetivo}</p>}
            {documento.observacao && <p className="mt-3 text-xs leading-5 text-slate-500">{documento.observacao}</p>}

            <label className="mt-6 block cursor-pointer rounded-2xl border-2 border-dashed border-cyan-300 bg-cyan-50/60 p-5 text-center transition hover:bg-cyan-50 focus-within:ring-2 focus-within:ring-cyan-500">
              <input className="sr-only" type="file" accept={inputAccept} capture="environment" onChange={(event) => setArquivo(event.target.files?.[0] || null)} disabled={enviando} />
              <UploadCloud className="mx-auto h-8 w-8 text-cyan-700" aria-hidden="true" />
              <span className="mt-3 block text-sm font-black text-cyan-900">{arquivo ? arquivo.name : "Tirar foto ou escolher arquivo"}</span>
              <span className="mt-1 block text-xs leading-5 text-cyan-800">Aceitamos PDF, foto e arquivos compatíveis. Limite de 25 MB.</span>
            </label>

            <button type="button" onClick={enviar} disabled={!arquivo || enviando} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-lg shadow-cyan-900/20 transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50">
              {enviando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FileUp className="h-5 w-5" aria-hidden="true" />}
              {enviando ? "Analisando documento..." : "Enviar documento"}
            </button>
            {ultimo && <p className="mt-4 text-center text-xs text-slate-500">Último envio: {statusLabel(ultimo.status)}{formatDate(ultimo.criado_em) ? ` em ${formatDate(ultimo.criado_em)}` : ""}.</p>}
          </section>
        ) : (
          <section className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-6 text-center"><FileCheck2 className="mx-auto h-9 w-9 text-emerald-200" aria-hidden="true" /><h2 className="mt-3 text-xl font-black">Documentos aceitos nesta etapa</h2><p className="mt-2 text-sm leading-6 text-slate-300">Atualize a página ou fale com o consultor responsável se algum documento precisar ser substituído.</p><button type="button" onClick={() => void carregar()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-bold text-white"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar</button></section>
        )}

        <footer className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] leading-5 text-slate-400"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />Você verá apenas os documentos solicitados para esta empresa e nesta etapa.</footer>
      </div>
    </main>
  );
}
