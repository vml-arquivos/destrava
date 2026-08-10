import { useState } from 'react';
import { Calendar, CheckSquare, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';

type EntidadeNexus = { tipo: 'empresa' | 'pessoa_fisica'; id: string; nome: string };
type ChecklistRecurrence = 'unica' | 'diaria' | 'semanal' | 'mensal';
type ChecklistDraft = {
  id: string;
  texto: string;
  descricao: string;
  data: string;
  responsavel_email: string;
  recorrencia: ChecklistRecurrence;
  recorrencia_dia_semana: string;
  recorrencia_dia_mes: string;
};

const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const newChecklistItem = (): ChecklistDraft => ({
  id: newId(), texto: '', descricao: '', data: '', responsavel_email: '', recorrencia: 'unica',
  recorrencia_dia_semana: String(new Date().getDay()), recorrencia_dia_mes: String(new Date().getDate()),
});

export default function CriarTarefaNexusModal({ entidade, onClose }: { entidade: EntidadeNexus; onClose: () => void }) {
  const [requestId] = useState(newId);
  const [descricao, setDescricao] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta'>('media');
  const [items, setItems] = useState<ChecklistDraft[]>([newChecklistItem()]);
  const [saving, setSaving] = useState(false);
  const tituloAutomatico = entidade.tipo === 'empresa'
    ? `Tarefa para empresa — ${entidade.nome}`
    : `Tarefa para Cliente PF — ${entidade.nome}`;

  const updateItem = <K extends keyof ChecklistDraft>(id: string, field: K, value: ChecklistDraft[K]) => {
    setItems(current => current.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  async function submit() {
    if (!items.length || items.some(item => !item.texto.trim())) { toast.error('Preencha todas as ações do checklist.'); return; }
    setSaving(true);
    try {
      const result: any = await apiFetch(`/api/${entidade.tipo === 'empresa' ? 'empresas' : 'clientes-pf'}/${entidade.id}/tarefas-nexus`, {
        method: 'POST',
        body: JSON.stringify({
          confirmed: true,
          client_request_id: requestId,
          titulo: tituloAutomatico,
          descricao: descricao.trim() || null,
          prazo: prazo || null,
          prioridade,
          checklist: items.map(item => ({
            id: item.id,
            texto: item.texto.trim(),
            descricao: item.descricao.trim() || null,
            data: item.data || null,
            responsavel_email: item.responsavel_email.trim().toLowerCase() || null,
            recorrencia: item.recorrencia,
            recorrencia_dia_semana: item.recorrencia === 'semanal' ? Number(item.recorrencia_dia_semana) : null,
            recorrencia_dia_mes: item.recorrencia === 'mensal' ? Number(item.recorrencia_dia_mes) : null,
          })),
        }),
      });
      toast.success(result?.mensagem || 'Lista criada no Nexus.');
      onClose();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível criar a tarefa no Nexus.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Criar tarefa no Nexus">
      <div className="w-full max-w-3xl max-h-[94vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b flex items-start justify-between gap-4 bg-gradient-to-r from-blue-950 to-blue-700 text-white">
          <div>
            <h2 className="font-black text-lg">Nova lista de tarefas</h2>
            <p className="text-xs text-blue-100 mt-1">{entidade.tipo === 'empresa' ? 'Empresa' : 'Cliente PF'} · {entidade.nome}</p>
          </div>
          <button type="button" onClick={onClose} className="text-blue-100 hover:text-white"><X className="w-5 h-5" /></button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Título automático da lista</label>
            <input className={`${inputClass} bg-blue-50 text-blue-950 font-semibold`} value={tituloAutomatico} readOnly />
            <p className="text-[11px] text-slate-500 mt-1">Mesmo padrão do Nexus. Cada envio recebe ID próprio e nunca é misturado com outra lista.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Descrição</label>
            <textarea className={inputClass} value={descricao} onChange={event => setDescricao(event.target.value)} rows={2} maxLength={4000} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-slate-600 mb-1">Prazo da lista</label><input type="date" className={inputClass} value={prazo} onChange={event => setPrazo(event.target.value)} /></div>
            <div><label className="block text-xs font-bold text-slate-600 mb-1">Prioridade</label><select className={inputClass} value={prioridade} onChange={event => setPrioridade(event.target.value as typeof prioridade)}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50">
            <CheckSquare className="w-5 h-5 text-blue-700 mt-0.5" />
            <span><strong className="text-sm text-blue-950">Fonte única no Nexus</strong><br /><small className="text-blue-700">Este modal usa o mesmo contrato de criação. Tarefas, checklist, responsáveis, recorrência e histórico são armazenados somente no Nexus.</small></span>
          </div>

          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div><h3 className="font-black text-sm text-slate-800 flex items-center gap-2"><CheckSquare className="w-4 h-4" /> Checklist</h3><p className="text-[11px] text-slate-500">Responsável e data pertencem ao item; valores diferentes nunca são misturados.</p></div>
              <button type="button" onClick={() => setItems(current => [...current, newChecklistItem()])} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200"><Plus className="w-3.5 h-3.5" /> Ação</button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                  <div className="flex gap-2 items-start">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white text-xs font-black flex items-center justify-center shrink-0">{index + 1}</span>
                    <div className="flex-1 grid gap-2">
                      <input className={inputClass} value={item.texto} onChange={event => updateItem(item.id, 'texto', event.target.value)} placeholder="Ação a executar *" maxLength={500} />
                      <input className={inputClass} value={item.descricao} onChange={event => updateItem(item.id, 'descricao', event.target.value)} placeholder="Orientação/descrição do item (opcional)" maxLength={2000} />
                      <div className="grid sm:grid-cols-2 gap-2">
                        <label className="relative"><Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input type="date" className={`${inputClass} pl-9`} value={item.data} onChange={event => updateItem(item.id, 'data', event.target.value)} /></label>
                        <input type="email" className={inputClass} value={item.responsavel_email} onChange={event => updateItem(item.id, 'responsavel_email', event.target.value)} placeholder="E-mail do membro no Nexus (opcional)" />
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                        <label className="block text-xs font-bold text-blue-950 mb-1">Frequência desta tarefa</label>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <select className={inputClass} value={item.recorrencia} onChange={event => updateItem(item.id, 'recorrencia', event.target.value as ChecklistRecurrence)}>
                            <option value="unica">Uma vez</option>
                            <option value="diaria">Todos os dias</option>
                            <option value="semanal">Toda semana</option>
                            <option value="mensal">Todo mês</option>
                          </select>
                          {item.recorrencia === 'semanal' && (
                            <select className={inputClass} value={item.recorrencia_dia_semana} onChange={event => updateItem(item.id, 'recorrencia_dia_semana', event.target.value)}>
                              {['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'].map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}
                            </select>
                          )}
                          {item.recorrencia === 'mensal' && (
                            <select className={inputClass} value={item.recorrencia_dia_mes} onChange={event => updateItem(item.id, 'recorrencia_dia_mes', event.target.value)}>
                              {Array.from({ length: 31 }, (_, dayIndex) => dayIndex + 1).map(day => <option key={day} value={day}>Dia {day}</option>)}
                            </select>
                          )}
                        </div>
                        <p className="text-[11px] text-blue-700 mt-1">Lembra o mesmo item até concluir e aprovar. Não cria outra lista.</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setItems(current => current.filter(value => value.id !== item.id))} disabled={items.length === 1} className="p-2 text-rose-600 disabled:opacity-30" title="Remover item"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="px-5 py-4 border-t flex justify-end gap-2 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border text-sm font-bold text-slate-600">Cancelar</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}{saving ? 'Enviando…' : 'Criar no Nexus'}</button>
        </footer>
      </div>
    </div>
  );
}
