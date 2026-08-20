import { useState } from "react";
import { Info } from "lucide-react";
import { construirSecoesAnaliseDocumento, type DocumentoAnaliseSecao } from "@shared/documentalPresentation";

type ResultadoAnaliseDocumentoProps = {
  resultado: any;
  documento?: any;
  compacto?: boolean;
};

function classesSecao(secao: DocumentoAnaliseSecao): string {
  if (secao.id === "resultado") return "border-emerald-100 bg-emerald-50/60";
  if (secao.id === "diagnostico_factual") return "border-blue-200 bg-blue-50/70";
  if (secao.id === "resumo_alteracao") return "border-indigo-200 bg-indigo-50/60";
  if (secao.id === "transacoes") return "border-indigo-200 bg-indigo-50/60";
  if (secao.id === "qsa_nomes") return "border-blue-200 bg-blue-50/60";
  if (secao.id === "amostra_dados") return "border-sky-200 bg-sky-50/60";
  if (secao.id === "validacoes") return "border-amber-200 bg-amber-50/60";
  if (secao.id === "titular_atual") return "border-cyan-200 bg-cyan-50/60";
  if (secao.id === "leitura_societaria") return "border-violet-200 bg-violet-50/70";
  if (secao.id === "evidencias") return "border-slate-200 bg-slate-50";
  return "border-slate-200 bg-slate-50";
}

function classesTitulo(secao: DocumentoAnaliseSecao): string {
  if (secao.id === "resultado") return "text-emerald-700";
  if (secao.id === "diagnostico_factual") return "text-blue-800";
  if (secao.id === "resumo_alteracao") return "text-indigo-800";
  if (secao.id === "transacoes") return "text-indigo-800";
  if (secao.id === "qsa_nomes") return "text-blue-800";
  if (secao.id === "amostra_dados") return "text-sky-800";
  if (secao.id === "validacoes") return "text-amber-800";
  if (secao.id === "titular_atual") return "text-cyan-800";
  if (secao.id === "leitura_societaria") return "text-violet-800";
  if (secao.id === "evidencias") return "text-slate-700";
  return "text-slate-600";
}

function BlocoSecao({ secao, texto }: { secao: DocumentoAnaliseSecao; texto: string }) {
  return (
    <>
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
    </>
  );
}

export function ResultadoAnaliseDocumento({ resultado, documento, compacto = false }: ResultadoAnaliseDocumentoProps) {
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const todasSecoes = construirSecoesAnaliseDocumento(resultado, documento);
  const espacamento = compacto ? "mt-1.5" : "mt-2";
  const texto = compacto ? "text-[9px]" : "text-[10px]";
  const titulo = compacto ? "text-[8px]" : "text-[9px]";
  if (!todasSecoes.length) return null;

  // Seções "colapsavel" (checklist técnico, texto jurídico completo, evidência
  // literal) não ficam soltas na tela por padrão -- só o resultado e os dados
  // essenciais aparecem de cara. Quem quiser o detalhe técnico clica no botão
  // "i" (informações) abaixo, que abre/fecha essas seções sem sair da tela.
  // No PDF gerado, essas mesmas seções nem são desenhadas (ver documentacao.ts).
  const principais = todasSecoes.filter((secao) => !secao.colapsavel);
  const detalhes = todasSecoes.filter((secao) => secao.colapsavel);

  return (
    <div className="space-y-1.5">
      {principais.map((secao) => (
        <div key={secao.id} className={`${espacamento} rounded-lg border p-2 ${classesSecao(secao)}`}>
          <p className={`${titulo} font-black uppercase ${classesTitulo(secao)}`}>{secao.titulo}</p>
          <BlocoSecao secao={secao} texto={texto} />
        </div>
      ))}

      {!!detalhes.length && (
        <div className={espacamento}>
          <button
            type="button"
            onClick={() => setDetalhesAbertos((v) => !v)}
            title="Ver informações técnicas complementares (checklist de validação, texto jurídico completo, evidências)"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            <Info className="h-3 w-3" />
            {detalhesAbertos ? "Ocultar informações técnicas" : "Ver informações técnicas"}
          </button>
          {detalhesAbertos && (
            <div className="mt-1.5 space-y-1.5">
              {detalhes.map((secao) => (
                <div key={secao.id} className={`rounded-lg border p-2 ${classesSecao(secao)}`}>
                  <p className={`${titulo} font-black uppercase ${classesTitulo(secao)}`}>{secao.titulo}</p>
                  <BlocoSecao secao={secao} texto={texto} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
