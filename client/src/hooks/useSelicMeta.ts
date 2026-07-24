import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface SelicMeta {
  valor: number;
  dataReferencia: string;
  indisponivel: boolean;
}

let selicCacheModulo: SelicMeta | null = null;

/** Busca a Selic Meta real (Banco Central) uma única vez por sessão de página --
 *  compartilhada entre todos os componentes que usam o hook na mesma tela (não
 *  dispara requisições redundantes). É só referência informativa (ex.: "PRONAMPE
 *  usa Selic + 6%"), nunca substitui a taxa que o colaborador ou o cliente
 *  vê/digita/explora manualmente na simulação. */
export function useSelicMeta(): SelicMeta | null {
  const [selic, setSelic] = useState(selicCacheModulo);
  useEffect(() => {
    if (selicCacheModulo) return;
    apiFetch("/api/mercado/selic")
      .then((data: any) => {
        selicCacheModulo = { valor: data.valor, dataReferencia: data.dataReferencia, indisponivel: false };
        setSelic(selicCacheModulo);
      })
      .catch(() => {
        selicCacheModulo = { valor: 0, dataReferencia: "", indisponivel: true };
        setSelic(selicCacheModulo);
      });
  }, []);
  return selic;
}
