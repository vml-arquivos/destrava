import { Download, CheckCircle, XCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { toast } from 'sonner';

interface Contrato {
  id: string;
  empresa_id: string;
  parceiro_nome?: string;
  valor_referencia: number;
  taxa_comissao: number;
  data_assinatura: string;
  foro_eleito: string;
  status: 'gerado' | 'assinado' | 'cancelado';
  created_at: string;
  pdf_path?: string;
}

interface Props {
  contratos: Contrato[];
  onStatusChange: (id: string, status: string) => void;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const statusConfig = {
  gerado: { label: 'Gerado', class: 'bg-blue-100 text-blue-800' },
  assinado: { label: 'Assinado', class: 'bg-emerald-100 text-emerald-800' },
  cancelado: { label: 'Cancelado', class: 'bg-red-100 text-red-800' },
};

export function ListaContratos({ contratos, onStatusChange }: Props) {
  const handleDownload = (id: string) => {
    const token = localStorage.getItem('destrava_token');
    const url = `/api/contratos/${id}/download`;
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `contrato-${id}.pdf`);
    // Usar fetch para download autenticado
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
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

  if (!contratos.length) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Nenhum contrato gerado para esta empresa.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left py-2 px-3 font-medium text-gray-600">Data</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Valor Ref.</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Comissão</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Parceiro</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Foro</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Status</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Ações</th>
          </tr>
        </thead>
        <tbody>
          {contratos.map(c => {
            const sc = statusConfig[c.status] || statusConfig.gerado;
            return (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 text-gray-700">
                  {new Date(c.data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="py-2 px-3 font-medium text-gray-900">
                  {formatBRL(parseFloat(String(c.valor_referencia)))}
                </td>
                <td className="py-2 px-3 text-gray-600">{c.taxa_comissao}%</td>
                <td className="py-2 px-3 text-gray-600">{c.parceiro_nome || '—'}</td>
                <td className="py-2 px-3 text-gray-600">{c.foro_eleito}</td>
                <td className="py-2 px-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${sc.class}`}>
                    {sc.label}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(c.id)}
                      title="Baixar PDF"
                      className="p-1 text-blue-600 hover:text-blue-800 rounded"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {c.status === 'gerado' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(c.id, 'assinado')}
                          title="Marcar como assinado"
                          className="p-1 text-emerald-600 hover:text-emerald-800 rounded"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleStatusChange(c.id, 'cancelado')}
                          title="Cancelar contrato"
                          className="p-1 text-red-500 hover:text-red-700 rounded"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
