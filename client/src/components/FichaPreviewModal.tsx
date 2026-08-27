import { useRef } from "react";
import { Download, Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FichaPreviewModalProps {
  open: boolean;
  title: string;
  html: string | null;
  downloading?: boolean;
  onClose: () => void;
  onDownload: () => void;
}

export default function FichaPreviewModal({
  open,
  title,
  html,
  downloading = false,
  onClose,
  onDownload,
}: FichaPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  if (!open) return null;

  function imprimir() {
    const janela = iframeRef.current?.contentWindow;
    if (!janela) return;
    janela.focus();
    janela.print();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl sm:h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Conferência antes da impressão</p>
            <h2 className="truncate text-base font-semibold sm:text-lg">{title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" onClick={imprimir} disabled={!html}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir
            </Button>
            <Button type="button" onClick={onDownload} disabled={!html || downloading}>
              {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {downloading ? "Gerando..." : "Baixar PDF"}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar visualização">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-slate-200/70 p-2 sm:p-4">
          {html ? (
            <iframe
              ref={iframeRef}
              title={title}
              srcDoc={html}
              className="h-full w-full rounded-lg border bg-white shadow-sm"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando ficha...</div>
          )}
        </div>
        <div className="border-t bg-card px-4 py-2 text-center text-xs text-muted-foreground">
          Confira os dados e a foto. A geração do arquivo PDF só ocorre quando você clicar em <strong>Baixar PDF</strong>.
        </div>
      </div>
    </div>
  );
}
