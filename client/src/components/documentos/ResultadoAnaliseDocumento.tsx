import { useState } from "react";
import { Info } from "lucide-react";
import {
  construirSecoesAnaliseDocumento,
  estadoVisualDocumento,
  rotuloEstadoDocumento,
  type DocumentoAnaliseSecao,
  type DocumentoEstadoVisual,
} from "@shared/documentalPresentation";

type ResultadoAnaliseDocumentoProps = {
  resultado: any;
  documento?: any;
  compacto?: boolean;
};

function classesSecao(secao: DocumentoAnaliseSecao, estado: DocumentoEstadoVisual): string {
  if (secao.id === "resultado") {
    if (estado === "aprovado") return "border-success/20 bg-success/10";
    if (estado === "incompativel") return "border-destructive/20 bg-destructive/10";
    if (estado === "reanalisar") return "border-destructive/20 bg-destructive/10";
    return "border-warning/20 bg-warning/10";
  }
  if (secao.id === "diagnostico_factual") return "border-primary/20 bg-primary/10";
  if (secao.id === "alertas") return "border-destructive/20 bg-destructive/10";
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

function classesTitulo(secao: DocumentoAnaliseSecao, estado: DocumentoEstadoVisual): string {
  if (secao.id === "resultado") {
    if (estado === "aprovado") return "text-success";
    if (estado === "incompativel" || estado === "reanalisar") return "text-destructive";
    return "text-warning";
  }
  if (secao.id === "diagnostico_factual") return "text-primary";
  if (secao.id === "alertas") return "text-destructive";
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

// CORREÇÃO (Rodada 28, 02/09/2026, pedido explícito do usuário, com print
// anotado da tela em produção -- "a visualização dos dados... está totalmente
// desconfigurado, não dá pra ler perfeitamente os dados"): a grade de campos
// ("AMOSTRA OBJETIVA DOS DADOS LIDOS" nos Atos da Junta, e qualquer outra
// seção com `campos`) usava `sm:grid-cols-2 lg:grid-cols-4` -- breakpoints
// de VIEWPORT do navegador, não do espaço realmente disponível no card. Em
// `compacto` (o uso de dentro do Acervo Documental, onde cada card tem só
// ~230px de largura -- ver o comentário de 2026-09-02/Rodada 18 sobre
// `grid-cols-[repeat(auto-fit,minmax(230px,1fr))]` na grade externa de
// cards), numa tela larga o navegador já bate o breakpoint `lg:` e força 4
// colunas MESMO com o card tendo só ~200px de largura útil -- cada coluna
// sobra com uns 40-50px, estreita demais até para uma palavra inteira, e o
// texto passa a quebrar letra por letra ("522\n078\n367\n98", "ALT\nERA\nÇÃO").
// Trocado por `auto-fit`/`minmax` (mesma técnica já usada na grade externa),
// que reage ao espaço REAL do container, não ao viewport -- em qualquer card
// estreito, no máximo 2 colunas cabem (e cai para 1 automaticamente se nem
// isso couber), sem nenhuma palavra quebrando letra por letra. Fora do modo
// compacto (relatório de página inteira, com bem mais espaço horizontal
// disponível), o comportamento mais denso é preservado.
function BlocoSecao({ secao, texto, compacto }: { secao: DocumentoAnaliseSecao; texto: string; compacto: boolean }) {
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
        <div className={`mt-1.5 grid gap-1.5 ${compacto ? "grid-cols-[repeat(auto-fit,minmax(110px,1fr))]" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
          {secao.campos.map((campo, index) => (
            <div key={`${campo.label}-${index}`} className="min-w-0 rounded-lg border border-border bg-card/80 px-2 py-1.5">
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
  const estado = estadoVisualDocumento(resultado, documento);
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
        <div key={secao.id} className={`${espacamento} rounded-lg border p-2 ${classesSecao(secao, estado)}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`${titulo} font-black uppercase ${classesTitulo(secao, estado)}`}>{secao.titulo}</p>
            {secao.id === "resultado" && <span className={`${titulo} rounded-full border px-2 py-0.5 font-black uppercase ${estado === "aprovado" ? "border-success/20 bg-success/10 text-success" : estado === "incompativel" || estado === "reanalisar" ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-warning/20 bg-warning/10 text-warning"}`}>{rotuloEstadoDocumento(estado)}</span>}
          </div>
          <BlocoSecao secao={secao} texto={texto} compacto={compacto} />
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
                <div key={secao.id} className={`rounded-lg border p-2 ${classesSecao(secao, estado)}`}>
                  <p className={`${titulo} font-black uppercase ${classesTitulo(secao, estado)}`}>{secao.titulo}</p>
                  <BlocoSecao secao={secao} texto={texto} compacto={compacto} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
