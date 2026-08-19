import { construirSecoesAnaliseDocumento, type DocumentoAnaliseSecao } from "@shared/documentalPresentation";

type ResultadoAnaliseDocumentoProps = {
  resultado: any;
  documento?: any;
  compacto?: boolean;
};

function classesSecao(secao: DocumentoAnaliseSecao): string {
  if (secao.id === "resultado") return "border-emerald-100 bg-emerald-50/60";
  if (secao.id === "diagnostico_factual") return "border-blue-200 bg-blue-50/70";
  if (secao.id === "alteracoes_societarias") return "border-indigo-200 bg-indigo-50/60";
  if (secao.id === "quadro_societario_final") return "border-cyan-200 bg-cyan-50/60";
  if (secao.id === "leitura_societaria") return "border-violet-200 bg-violet-50/70";
  if (secao.id === "evidencias") return "border-slate-200 bg-slate-50";
  return "border-slate-200 bg-slate-50";
}

function classesTitulo(secao: DocumentoAnaliseSecao): string {
  if (secao.id === "resultado") return "text-emerald-700";
  if (secao.id === "diagnostico_factual") return "text-blue-800";
  if (secao.id === "alteracoes_societarias") return "text-indigo-800";
  if (secao.id === "quadro_societario_final") return "text-cyan-800";
  if (secao.id === "leitura_societaria") return "text-violet-800";
  return "text-slate-600";
}

export function ResultadoAnaliseDocumento({ resultado, documento, compacto = false }: ResultadoAnaliseDocumentoProps) {
  const secoes = construirSecoesAnaliseDocumento(resultado, documento);
  const espacamento = compacto ? "mt-1.5" : "mt-2";
  const texto = compacto ? "text-[9px]" : "text-[10px]";
  const titulo = compacto ? "text-[8px]" : "text-[9px]";
  if (!secoes.length) return null;

  return (
    <div className="space-y-1.5">
      {secoes.map((secao) => (
        <div key={secao.id} className={`${espacamento} rounded-lg border p-2 ${classesSecao(secao)}`}>
          <p className={`${titulo} font-black uppercase ${classesTitulo(secao)}`}>{secao.titulo}</p>
          {secao.texto && <p className={`mt-0.5 whitespace-pre-line font-semibold text-slate-800 ${texto}`}>{secao.texto}</p>}
          {!!secao.itens?.length && (
            <div className="mt-1 space-y-1">
              {secao.itens.map((item, index) => (
                <p key={`${secao.id}-${index}`} className={`whitespace-pre-line text-slate-700 ${texto}`}>
                  {secao.id === "evidencias" ? <span className="italic">{item}</span> : <><span className="mr-1">•</span>{item}</>}
                </p>
              ))}
            </div>
          )}
          {!!secao.campos?.length && (
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {secao.campos.map((campo, index) => (
                <div key={`${campo.label}-${index}`} className="rounded-lg border border-slate-100 bg-white/80 px-2 py-1.5">
                  <p className="text-[8px] font-black uppercase text-slate-400">{campo.label}</p>
                  <p className={`mt-0.5 break-words font-semibold text-slate-700 ${texto}`}>{campo.valor}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
