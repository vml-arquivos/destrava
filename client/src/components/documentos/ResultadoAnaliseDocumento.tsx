import { useState } from "react";
import { Info } from "lucide-react";
import { construirSecoesAnaliseDocumento, type DocumentoAnaliseSecao } from "@shared/documentalPresentation";

type ResultadoAnaliseDocumentoProps = {
  resultado: any;
  documento?: any;
  compacto?: boolean;
};

function classesSecao(secao: DocumentoAnaliseSecao): string {
  if (secao.id === "resultado") return "border-success/20 bg-success/10";
  if (secao.id === "diagnostico_factual") return "border-primary/20 bg-primary/10";
  if (secao.id === "resumo_alteracao") return "border-primary/20 bg-primary/10";
  if (secao.id === "transacoes") return "border-primary/20 bg-primary/10";
  if (secao.id === "qsa_nomes") return "border-primary/20 bg-primary/10";
  if (secao.id === "amostra_dados") return "border-primary/20 bg-primary/10";
  if (secao.id === "validacoes") return "border-warning/20 bg-warning/10";
  if (secao.id === "titular_atual") return "border-primary/20 bg-primary/10";
  if (secao.id === "leitura_societaria") return "border-primary/20 bg-primary/10";
  if (secao.id === "evidencias") return "border-border bg-muted";
  return "border-border bg-muted";
}

function classesTitulo(secao: DocumentoAnaliseSecao): string {
  if (secao.id === "resultado") return "text-success";
  if (secao.id === "diagnostico_factual") return "text-primary";
  if (secao.id === "resumo_alteracao") return "text-primary";
  if (secao.id === "transacoes") return "text-primary";
  if (secao.id === "qsa_nomes") return "text-primary";
  if (secao.id === "amostra_dados") return "text-primary";
  if (secao.id === "validacoes") return "text-warning";
  if (secao.id === "titular_atual") return "text-primary";
  if (secao.id === "leitura_societaria") return "text-primary";
  if (secao.id === "evidencias") return "text-muted-foreground";
  return "text-muted-foreground";
}

function BlocoSecao({ secao, texto }: { secao: DocumentoAnaliseSecao; texto: string }) {
  return (
    <>
      {secao.texto && <p className={`mt-0.5 whitespace-pre-line font-semibold text-foreground ${texto}`}>{secao.texto}</p>}
      {!!secao.itens?.length && (
        <div className="mt-1 space-y-1">
          {secao.itens.map((item, index) => (
            <p key={`${secao.id}-${index}`} className={`whitespace-pre-line text-muted-foreground ${texto}`}>
              {secao.id === "evidencias" ? <span className="italic">{item}</span> : <><span className="mr-1">•</span>{item}</>}
            </p>
          ))}
        </div>
      )}
      {!!secao.campos?.length && (
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {secao.campos.map((campo, index) => (
            <div key={`${campo.label}-${index}`} className="rounded-lg border border-border bg-card/80 px-2 py-1.5">
              <p className="text-[8px] font-black uppercase text-muted-foreground">{campo.label}</p>
              <p className={`mt-0.5 break-words font-semibold text-muted-foreground ${texto}`}>{campo.valor}</p>
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
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[9px] font-bold text-muted-foreground hover:border-input hover:text-muted-foreground"
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
