import { useState, useMemo, useEffect } from 'react';
import { Download, CheckCircle, XCircle, Trash2, Eye, RefreshCw, Upload, Pencil, Printer, X } from 'lucide-react';
import { apiFetch, getToken } from '../../lib/api';
import { toast } from 'sonner';

interface Contrato {
  id: string;
  tipo_contrato?: string;
  numero_contrato?: string;
  protocolo_contrato?: string;
  codigo_tipo_contrato?: string;
  empresa_id?: string;
  lead_id?: string;
  cliente_pf_id?: string;
  parceiro_id?: string;
  parceiro_nome?: string;
  contratada_nome?: string;
  responsavel_contrato_nome?: string;
  empresa_nome?: string;
  lead_nome?: string;
  cliente_pf_nome?: string;
  valor_referencia?: number;
  valor_contrato?: number;
  taxa_comissao?: number;
  data_assinatura: string;
  foro_eleito: string;
  status: 'gerado' | 'assinado' | 'cancelado';
  created_at: string;
  pdf_path?: string;
  criado_por_nome?: string;
  assinado_em?: string | null;
  assinado_pdf_path?: string | null;
}

interface Props {
  contratos: Contrato[];
  onStatusChange: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
  userCargo?: string;
  podeTudo?: boolean;
  podeExcluir?: boolean;
  podeEditar?: boolean;
  onEdit?: (id: string) => void;
}

const formatBRL = (v: number | undefined | null) => {
  if (v == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
};

const formatData = (value: string | null | undefined): string => {
  if (!value) return '—';
  try {
    const d = new Date(value.includes('T') ? value : value + 'T12:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
};

const tipoLabel: Record<string, string> = {
  assessoria:          'Assessoria',
  assessoria_pf:       'Assessoria PF',
  limpa_nome:          'L. Nome',
  limpa_bacen:         'L. BACEN',
  rating:              'Rating',
  parceria_comercial:  'Parceria',
};

const tipoLabelFull: Record<string, string> = {
  assessoria:          'Assessoria',
  assessoria_pf:       'Assessoria PF',
  limpa_nome:          'Limpa Nome',
  limpa_bacen:         'Limpa BACEN',
  rating:              'Rating',
  parceria_comercial:  'Parceria Comercial',
};

const tipoCor: Record<string, string> = {
  assessoria:          'bg-primary/20 text-primary',
  assessoria_pf:       'bg-primary/20 text-primary',
  limpa_nome:          'bg-primary/20 text-primary',
  limpa_bacen:         'bg-primary/20 text-primary',
  rating:              'bg-warning/20 text-warning',
  parceria_comercial:  'bg-success/20 text-success',
};

const statusConfig = {
  gerado:    { label: 'Gerado',    class: 'bg-primary/20 text-primary' },
  assinado:  { label: 'Assinado',  class: 'bg-success/20 text-success' },
  cancelado: { label: 'Cancelado', class: 'bg-destructive/20 text-destructive' },
};

function normalizeCargo(cargo: string | undefined | null): string {
  return (cargo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function podeExcluirCargo(cargo: string | undefined | null): boolean {
  const c = normalizeCargo(cargo);
  return ['administrador', 'admin', 'diretor'].includes(c);
}

const nomeArquivoContrato = (contrato: Contrato): string => {
  const base = contrato.protocolo_contrato || contrato.numero_contrato || `contrato-${contrato.id}`;
  return `${String(base)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`;
};

export function ListaContratos({ contratos, onStatusChange, onDelete, userCargo, podeTudo, podeExcluir: podeExcluirProp, podeEditar = false, onEdit }: Props) {
  const podeExcluirContrato = podeExcluirProp ?? podeExcluirCargo(userCargo);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBatch, setDeletingBatch] = useState(false);

  // ── Deduplicação: mantém apenas o mais recente por (empresa_id|lead_id + tipo_contrato + numero_contrato) ──
  const contratosSemDuplicatas = useMemo(() => {
    const seen = new Map<string, Contrato>();
    // Ordena do mais antigo ao mais novo para que o mais recente sobrescreva
    const sorted = [...contratos].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const c of sorted) {
      const clienteKey = c.empresa_id || c.lead_id || 'sem-cliente';
      const numKey = c.numero_contrato || c.protocolo_contrato || c.id;
      const chave = `${clienteKey}__${c.tipo_contrato || ''}__${numKey}`;
      seen.set(chave, c);
    }
    // Reordena por data decrescente para exibição
    return Array.from(seen.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [contratos]);

  const totalSelecionados = selectedIds.size;
  const todosSelecionados = contratosSemDuplicatas.length > 0 && selectedIds.size === contratosSemDuplicatas.length;

  const toggleAll = () => {
    if (todosSelecionados) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contratosSemDuplicatas.map(c => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Visualização em modal interno (somente leitura), nunca em nova aba:
  // window.open() após um fetch assíncrono pode ser bloqueado pelo navegador
  // e, dependendo do bloqueador de pop-up, abrir a aba do window.open() e
  // outra aba de fallback ao mesmo tempo -- efeito de "duas abas com o mesmo
  // contrato". O modal evita essa ambiguidade por completo.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContrato, setPreviewContrato] = useState<Contrato | null>(null);

  useEffect(() => {
    if (!previewUrl) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharPreview(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const fecharPreview = () => {
    setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return null; });
    setPreviewContrato(null);
  };

  const abrirPdf = (contrato: Contrato) => {
    const token = getToken();
    const url = `/api/contratos/${contrato.id}/visualizar`;
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then(res => {
        if (!res.ok) return res.json().then((j: any) => { throw new Error(j?.error || 'PDF não encontrado'); });
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return blobUrl; });
        setPreviewContrato(contrato);
      })
      .catch((err: any) => toast.error(err?.message || 'Erro ao visualizar contrato'));
  };

  const imprimirPdf = (id: string) => {
    const token = getToken();
    const url = `/api/contratos/${id}/visualizar`;
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then(res => {
        if (!res.ok) return res.json().then((j: any) => { throw new Error(j?.error || 'PDF não encontrado'); });
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const w = window.open(blobUrl, '_blank', 'noopener,noreferrer');
        if (!w) { toast.warning('Permita pop-ups para imprimir o contrato.'); return; }
        setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 1200);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      })
      .catch((err: any) => toast.error(err?.message || 'Erro ao imprimir contrato'));
  };

  const handleDownload = (contrato: Contrato) => {
    const id = contrato.id;
    const token = getToken();
    const url = `/api/contratos/${id}/download`;
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = nomeArquivoContrato(contrato);
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast.error('Erro ao baixar contrato'));
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/contratos/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onStatusChange(id, status);
      toast.success(`Status atualizado para ${statusConfig[status as keyof typeof statusConfig]?.label}`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.')) return;
    try {
      await apiFetch(`/api/contratos/${id}`, { method: 'DELETE' });
      toast.success('Contrato excluído com sucesso.');
      onDelete?.(id);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir contrato');
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedIds.size} contrato(s)? Esta ação não pode ser desfeita.`)) return;
    setDeletingBatch(true);
    let sucesso = 0;
    let falhas = 0;
    for (const id of Array.from(selectedIds)) {
      try {
        await apiFetch(`/api/contratos/${id}`, { method: 'DELETE' });
        onDelete?.(id);
        sucesso++;
      } catch {
        falhas++;
      }
    }
    setSelectedIds(new Set());
    setDeletingBatch(false);
    if (sucesso > 0) toast.success(`${sucesso} contrato(s) excluído(s) com sucesso.`);
    if (falhas > 0) toast.error(`${falhas} contrato(s) não puderam ser excluídos.`);
  };

  const handleRegenerar = async (id: string) => {
    if (!window.confirm('Regenerar o PDF deste contrato com os dados atuais?')) return;
    try {
      await apiFetch(`/api/contratos/${id}/regenerar`, { method: 'POST' });
      toast.success('PDF regenerado com sucesso.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao regenerar contrato');
    }
  };

  const handleUploadAssinado = (id: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await apiFetch(`/api/contratos/${id}/anexo-assinado`, {
            method: 'POST',
            body: JSON.stringify({ arquivo_base64: reader.result, nome_arquivo: file.name }),
          });
          toast.success('Contrato assinado anexado com sucesso.');
          onStatusChange(id, 'assinado');
        } catch (err: any) {
          toast.error(err.message || 'Erro ao anexar contrato assinado');
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  if (!contratos.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhum contrato encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Barra de ações em lote */}
      {podeExcluirContrato && (
        <div className="flex items-center justify-between py-2 px-3 bg-muted border border-border rounded-lg">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todosSelecionados}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded border-input text-primary focus:ring-primary"
              />
              {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
            </label>
            {totalSelecionados > 0 && (
              <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                {totalSelecionados} selecionado{totalSelecionados > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {totalSelecionados > 0 && (
            <button
              onClick={handleDeleteBatch}
              disabled={deletingBatch}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-primary-foreground text-xs rounded-lg hover:bg-destructive disabled:opacity-50 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deletingBatch ? 'Excluindo...' : `Excluir ${totalSelecionados}`}
            </button>
          )}
        </div>
      )}

      {/* Tabela compacta */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              {podeExcluirContrato && (
                <th className="py-2 px-2 w-8">
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-input text-primary focus:ring-primary"
                  />
                </th>
              )}
              <th className="text-left py-2 px-2 font-semibold text-muted-foreground w-20">Tipo</th>
              <th className="text-left py-2 px-2 font-semibold text-muted-foreground">Cliente</th>
              <th className="text-left py-2 px-2 font-semibold text-muted-foreground w-28">Valor</th>
              <th className="text-left py-2 px-2 font-semibold text-muted-foreground w-24">Data</th>
              <th className="text-left py-2 px-2 font-semibold text-muted-foreground w-20">Status</th>
              <th className="text-left py-2 px-2 font-semibold text-muted-foreground w-28">Responsável</th>
              <th className="py-2 px-2 font-semibold text-muted-foreground w-44 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {contratosSemDuplicatas.map(c => {
              const sc = statusConfig[c.status] || statusConfig.gerado;
              const nomeCliente = c.empresa_nome || c.cliente_pf_nome || c.lead_nome || '—';
              const valor = c.valor_contrato ?? c.valor_referencia;
              const dataDisplay = formatData(c.data_assinatura || c.created_at);
              const isSelected = selectedIds.has(c.id);
              const tipoCorClass = tipoCor[c.tipo_contrato || ''] || 'bg-muted text-foreground';
              const numRef = c.protocolo_contrato || c.numero_contrato;
              const responsavel = c.responsavel_contrato_nome || c.criado_por_nome || '—';
              const contratoAssinado = c.status === 'assinado' || !!c.assinado_em || !!c.assinado_pdf_path;

              return (
                <tr
                  key={c.id}
                  className={`border-b border-border hover:bg-primary/10/30 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                >
                  {podeExcluirContrato && (
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(c.id)}
                        className="w-3.5 h-3.5 rounded border-input text-primary focus:ring-primary"
                      />
                    </td>
                  )}

                  {/* Tipo */}
                  <td className="py-2 px-2">
                    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${tipoCorClass}`}
                      title={tipoLabelFull[c.tipo_contrato || ''] || c.tipo_contrato || '—'}>
                      {tipoLabel[c.tipo_contrato || ''] || c.tipo_contrato || '—'}
                    </span>
                    {numRef && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[70px]" title={numRef}>{numRef}</div>
                    )}
                  </td>

                  {/* Cliente */}
                  <td className="py-2 px-2">
                    <div className="font-medium text-foreground truncate max-w-[200px]" title={nomeCliente}>
                      {nomeCliente}
                    </div>
                    {c.parceiro_nome && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={c.parceiro_nome}>
                        Parceiro: {c.parceiro_nome}
                      </div>
                    )}
                  </td>

                  {/* Valor */}
                  <td className="py-2 px-2 font-semibold text-foreground whitespace-nowrap">
                    {formatBRL(valor)}
                  </td>

                  {/* Data */}
                  <td className="py-2 px-2 text-foreground whitespace-nowrap">
                    {dataDisplay}
                  </td>

                  {/* Status */}
                  <td className="py-2 px-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${sc.class}`}>
                      {sc.label}
                    </span>
                  </td>

                  {/* Responsável */}
                  <td className="py-2 px-2 text-muted-foreground truncate max-w-[110px]" title={responsavel}>
                    {responsavel}
                  </td>

                  {/* Ações — botões diretos para não depender de dropdown/portal em tabela rolável */}
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <button
                        onClick={() => abrirPdf(c)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground"
                        title="Visualizar PDF"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownload(c)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-primary/20 bg-card hover:bg-primary/10 text-primary"
                        title="Baixar PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {podeEditar && !contratoAssinado && onEdit && (
                        <button
                          onClick={() => onEdit(c.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-primary/20 bg-card hover:bg-primary/10 text-primary"
                          title="Editar contrato"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {podeEditar && !contratoAssinado && (
                        <button
                          onClick={() => handleRegenerar(c.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-warning/20 bg-card hover:bg-warning/10 text-warning"
                          title="Regenerar PDF"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleUploadAssinado(c.id)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-primary/20 bg-card hover:bg-primary/10 text-primary"
                        title="Anexar contrato assinado"
                      >
                        <Upload className="w-3.5 h-3.5" />
                      </button>
                      {c.status === 'gerado' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(c.id, 'assinado')}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-success/20 bg-card hover:bg-success/10 text-success"
                            title="Marcar como assinado"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(c.id, 'cancelado')}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-destructive/20 bg-card hover:bg-destructive/10 text-destructive"
                            title="Cancelar contrato"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {podeExcluirContrato && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-destructive/20 bg-card hover:bg-destructive/10 text-destructive"
                          title="Excluir contrato"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rodapé com total */}
      <div className="text-[11px] text-muted-foreground px-1">
        {contratosSemDuplicatas.length} contrato{contratosSemDuplicatas.length !== 1 ? 's' : ''}
        {contratos.length !== contratosSemDuplicatas.length && (
          <span className="ml-1 text-warning">
            ({contratos.length - contratosSemDuplicatas.length} duplicata{contratos.length - contratosSemDuplicatas.length !== 1 ? 's' : ''} removida{contratos.length - contratosSemDuplicatas.length !== 1 ? 's' : ''})
          </span>
        )}
      </div>

      {/* Modal de visualização do contrato (somente leitura) -- substitui o
          antigo window.open, que causava o efeito de "duas abas". */}
      {previewUrl && previewContrato && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-overlay backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) fecharPreview(); }}
        >
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="h-14 px-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {previewContrato.numero_contrato || previewContrato.protocolo_contrato || `Contrato #${previewContrato.id.slice(0, 8)}`}
                </p>
                <p className="text-[11px] text-muted-foreground">Contrato firmado -- somente leitura</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => imprimirPdf(previewContrato.id)}
                  className="h-9 px-3 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5"
                  title="Imprimir contrato"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(previewContrato)}
                  className="h-9 px-3 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5"
                  title="Baixar / salvar contrato"
                >
                  <Download className="w-3.5 h-3.5" /> Baixar
                </button>
                <button
                  type="button"
                  onClick={fecharPreview}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                  title="Fechar (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe title="Visualização do contrato" src={previewUrl} className="flex-1 w-full bg-muted" />
          </div>
        </div>
      )}
    </div>
  );
}
