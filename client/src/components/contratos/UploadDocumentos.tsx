/**
 * UploadDocumentos.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Componente de upload de documentos para contratos.
 *
 * Categorias suportadas:
 *   Identidade   → RG (frente/verso), CNH (frente/verso)
 *   Endereço     → Comprovante de Endereço
 *   Empresa      → Contrato Social, Procuração, Alteração Contratual
 *   Consultas    → Rating SCR/BACEN, Boa Vista, CEMPROT, Serasa, SPC, Receita Federal
 *   Outros       → Documentos genéricos
 *
 * Funcionalidades:
 *   ✅ Upload de imagens (JPG, PNG) e PDFs
 *   ✅ Preview visual inline para imagens
 *   ✅ Ícone + nome do arquivo para PDFs
 *   ✅ Reordenação por drag (ordem de impressão)
 *   ✅ Remoção individual
 *   ✅ Edição de categoria e descrição após upload
 *   ✅ Limite configurável de arquivos
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useCallback } from 'react';
import {
  Upload, X, FileText, CreditCard, Home, Building2,
  Paperclip, GripVertical, AlertCircle, CheckCircle2,
  Search, ShieldCheck, BarChart3, FileSearch,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CategoriaDocumento =
  // Identidade
  | 'rg_frente' | 'rg_verso'
  | 'cnh_frente' | 'cnh_verso'
  // Endereço
  | 'comprovante_endereco'
  // Empresa
  | 'contrato_social' | 'alteracao_contratual' | 'procuracao'
  // Consultas de crédito
  | 'rating_scr' | 'boa_vista' | 'cemprot' | 'serasa' | 'spc' | 'receita_federal'
  // Genérico
  | 'outros';

export interface DocumentoAnexo {
  id: string;
  file: File;
  categoria: CategoriaDocumento;
  descricao: string;
  previewUrl: string | null; // null para PDFs
  tipo: 'imagem' | 'pdf';
}

interface Props {
  documentos: DocumentoAnexo[];
  onChange: (docs: DocumentoAnexo[]) => void;
  maxArquivos?: number;
  disabled?: boolean;
}

// ─── Configuração das categorias ──────────────────────────────────────────────

interface CategoriaDef {
  value: CategoriaDocumento;
  label: string;
  grupo: string;
  icon: React.ReactNode;
  cor: string;
  descricaoPadrao: string;
}

const CATEGORIAS: CategoriaDef[] = [
  // Identidade
  { value: 'rg_frente',          grupo: 'Identidade',          label: 'RG — Frente',                icon: <CreditCard className="w-3 h-3" />,  cor: 'blue',    descricaoPadrao: 'RG Frente'                   },
  { value: 'rg_verso',           grupo: 'Identidade',          label: 'RG — Verso',                 icon: <CreditCard className="w-3 h-3" />,  cor: 'blue',    descricaoPadrao: 'RG Verso'                    },
  { value: 'cnh_frente',         grupo: 'Identidade',          label: 'CNH — Frente',               icon: <CreditCard className="w-3 h-3" />,  cor: 'indigo',  descricaoPadrao: 'CNH Frente'                  },
  { value: 'cnh_verso',          grupo: 'Identidade',          label: 'CNH — Verso',                icon: <CreditCard className="w-3 h-3" />,  cor: 'indigo',  descricaoPadrao: 'CNH Verso'                   },
  // Endereço
  { value: 'comprovante_endereco', grupo: 'Endereço',          label: 'Comprovante de Endereço',    icon: <Home className="w-3 h-3" />,        cor: 'emerald', descricaoPadrao: 'Comprovante de Endereço'     },
  // Empresa
  { value: 'contrato_social',    grupo: 'Empresa',             label: 'Contrato Social',            icon: <Building2 className="w-3 h-3" />,   cor: 'amber',   descricaoPadrao: 'Contrato Social'             },
  { value: 'alteracao_contratual', grupo: 'Empresa',           label: 'Alteração Contratual',       icon: <Building2 className="w-3 h-3" />,   cor: 'amber',   descricaoPadrao: 'Última Alteração Contratual' },
  { value: 'procuracao',         grupo: 'Empresa',             label: 'Procuração',                 icon: <FileText className="w-3 h-3" />,    cor: 'orange',  descricaoPadrao: 'Procuração'                  },
  // Consultas de crédito
  { value: 'rating_scr',         grupo: 'Consultas de Crédito', label: 'Rating SCR / BACEN',       icon: <BarChart3 className="w-3 h-3" />,   cor: 'violet',  descricaoPadrao: 'Consulta Rating SCR/BACEN'   },
  { value: 'boa_vista',          grupo: 'Consultas de Crédito', label: 'Boa Vista',                icon: <Search className="w-3 h-3" />,      cor: 'cyan',    descricaoPadrao: 'Consulta Boa Vista'          },
  { value: 'cemprot',            grupo: 'Consultas de Crédito', label: 'CEMPROT',                  icon: <ShieldCheck className="w-3 h-3" />, cor: 'rose',    descricaoPadrao: 'Consulta CEMPROT'            },
  { value: 'serasa',             grupo: 'Consultas de Crédito', label: 'Serasa',                   icon: <FileSearch className="w-3 h-3" />,  cor: 'pink',    descricaoPadrao: 'Consulta Serasa'             },
  { value: 'spc',                grupo: 'Consultas de Crédito', label: 'SPC',                      icon: <FileSearch className="w-3 h-3" />,  cor: 'fuchsia', descricaoPadrao: 'Consulta SPC'                },
  { value: 'receita_federal',    grupo: 'Consultas de Crédito', label: 'Receita Federal',          icon: <ShieldCheck className="w-3 h-3" />, cor: 'teal',    descricaoPadrao: 'Consulta Receita Federal'    },
  // Outros
  { value: 'outros',             grupo: 'Outros',              label: 'Outros Documentos',          icon: <Paperclip className="w-3 h-3" />,   cor: 'gray',    descricaoPadrao: 'Documento Anexo'             },
];

const COR_BADGE: Record<string, string> = {
  blue:    'bg-blue-100 text-blue-700 border-blue-200',
  indigo:  'bg-indigo-100 text-indigo-700 border-indigo-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-100 text-amber-700 border-amber-200',
  orange:  'bg-orange-100 text-orange-700 border-orange-200',
  violet:  'bg-violet-100 text-violet-700 border-violet-200',
  cyan:    'bg-cyan-100 text-cyan-700 border-cyan-200',
  rose:    'bg-rose-100 text-rose-700 border-rose-200',
  pink:    'bg-pink-100 text-pink-700 border-pink-200',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  teal:    'bg-teal-100 text-teal-700 border-teal-200',
  gray:    'bg-gray-100 text-gray-600 border-gray-200',
};

const COR_PREVIEW: Record<string, string> = {
  blue: 'bg-blue-50 border-blue-200', indigo: 'bg-indigo-50 border-indigo-200',
  emerald: 'bg-emerald-50 border-emerald-200', amber: 'bg-amber-50 border-amber-200',
  orange: 'bg-orange-50 border-orange-200', violet: 'bg-violet-50 border-violet-200',
  cyan: 'bg-cyan-50 border-cyan-200', rose: 'bg-rose-50 border-rose-200',
  pink: 'bg-pink-50 border-pink-200', fuchsia: 'bg-fuchsia-50 border-fuchsia-200',
  teal: 'bg-teal-50 border-teal-200', gray: 'bg-gray-50 border-gray-200',
};

const COR_TEXT: Record<string, string> = {
  blue: 'text-blue-400', indigo: 'text-indigo-400', emerald: 'text-emerald-400',
  amber: 'text-amber-400', orange: 'text-orange-400', violet: 'text-violet-400',
  cyan: 'text-cyan-400', rose: 'text-rose-400', pink: 'text-pink-400',
  fuchsia: 'text-fuchsia-400', teal: 'text-teal-400', gray: 'text-gray-400',
};

function getCat(value: CategoriaDocumento): CategoriaDef {
  return CATEGORIAS.find(c => c.value === value) ?? CATEGORIAS[CATEGORIAS.length - 1];
}

function gerarId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Agrupa categorias por grupo para exibir no seletor
const GRUPOS = Array.from(new Set(CATEGORIAS.map(c => c.grupo)));

// ─── Componente ───────────────────────────────────────────────────────────────

export function UploadDocumentos({ documentos, onChange, maxArquivos = 30, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [categoriaAtiva, setCategoriaAtiva] = useState<CategoriaDocumento>('rg_frente');
  const [erroTipo, setErroTipo] = useState<string | null>(null);

  const processarArquivos = useCallback(
    (files: FileList | File[]) => {
      setErroTipo(null);
      const novos: DocumentoAnexo[] = [];
      const invalidos: string[] = [];
      const catDef = getCat(categoriaAtiva);

      Array.from(files).forEach(file => {
        const isImagem = file.type.startsWith('image/');
        const isPdf    = file.type === 'application/pdf';
        if (!isImagem && !isPdf) { invalidos.push(file.name); return; }
        if (documentos.length + novos.length >= maxArquivos) return;
        novos.push({
          id: gerarId(),
          file,
          categoria: categoriaAtiva,
          descricao: catDef.descricaoPadrao,
          previewUrl: isImagem ? URL.createObjectURL(file) : null,
          tipo: isImagem ? 'imagem' : 'pdf',
        });
      });

      if (invalidos.length > 0)
        setErroTipo(`Formato não suportado: ${invalidos.join(', ')}. Use JPG, PNG ou PDF.`);
      if (novos.length > 0)
        onChange([...documentos, ...novos]);
    },
    [documentos, onChange, categoriaAtiva, maxArquivos],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (!disabled) processarArquivos(e.dataTransfer.files);
  };

  const remover = (id: string) => {
    const doc = documentos.find(d => d.id === id);
    if (doc?.previewUrl) URL.revokeObjectURL(doc.previewUrl);
    onChange(documentos.filter(d => d.id !== id));
  };

  const atualizar = (id: string, campo: 'categoria' | 'descricao', valor: string) =>
    onChange(documentos.map(d => d.id === id ? { ...d, [campo]: valor } : d));

  const dragItem  = useRef<number | null>(null);
  const dragOver2 = useRef<number | null>(null);
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver2.current === null) return;
    const novo = [...documentos];
    const [item] = novo.splice(dragItem.current, 1);
    novo.splice(dragOver2.current, 0, item);
    dragItem.current = null; dragOver2.current = null;
    onChange(novo);
  };

  const restantes = maxArquivos - documentos.length;

  return (
    <div className="space-y-4">

      {/* ── Seletor de categoria por grupo ───────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Selecione a categoria antes de adicionar
        </p>
        {GRUPOS.map(grupo => (
          <div key={grupo}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{grupo}</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIAS.filter(c => c.grupo === grupo).map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategoriaAtiva(cat.value)}
                  disabled={disabled}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                    categoriaAtiva === cat.value
                      ? COR_BADGE[cat.cor] + ' ring-2 ring-offset-1 ring-current shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Zona de drop ─────────────────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
          : dragOver ? 'border-blue-400 bg-blue-50 scale-[1.01]'
          : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        <input
          ref={inputRef} type="file" multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={e => e.target.files && processarArquivos(e.target.files)}
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${dragOver ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <Upload className={`w-5 h-5 ${dragOver ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">
              {dragOver ? 'Solte os arquivos aqui' : 'Clique ou arraste os documentos'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              JPG, PNG, WEBP ou PDF — máx. {maxArquivos} arquivos ({restantes} restantes)
            </p>
            {categoriaAtiva && (
              <p className="text-xs font-medium mt-1" style={{ color: 'inherit' }}>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${COR_BADGE[getCat(categoriaAtiva).cor]}`}>
                  {getCat(categoriaAtiva).icon}
                  Adicionando como: {getCat(categoriaAtiva).label}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Erro de tipo ─────────────────────────────────────────────────── */}
      {erroTipo && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {erroTipo}
        </div>
      )}

      {/* ── Lista de documentos ───────────────────────────────────────────── */}
      {documentos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {documentos.length} documento{documentos.length !== 1 ? 's' : ''} — arraste para reordenar a impressão
          </p>

          {documentos.map((doc, idx) => {
            const cat = getCat(doc.categoria);
            return (
              <div
                key={doc.id}
                draggable
                onDragStart={() => { dragItem.current = idx; }}
                onDragEnter={() => { dragOver2.current = idx; }}
                onDragEnd={handleDragEnd}
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Handle */}
                <div className="mt-1 cursor-grab text-gray-300 hover:text-gray-500 flex-shrink-0">
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* Preview / Ícone */}
                <div className="flex-shrink-0">
                  {doc.tipo === 'imagem' && doc.previewUrl ? (
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                      <img src={doc.previewUrl} alt={doc.descricao} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={`w-16 h-16 rounded-lg border flex flex-col items-center justify-center gap-1 ${COR_PREVIEW[cat.cor] ?? 'bg-gray-50 border-gray-200'}`}>
                      <div className={COR_TEXT[cat.cor] ?? 'text-gray-400'}>
                        {cat.icon ? <span className="scale-150 block">{cat.icon}</span> : <FileText className="w-6 h-6" />}
                      </div>
                      <span className={`text-[9px] font-bold uppercase ${COR_TEXT[cat.cor] ?? 'text-gray-400'}`}>PDF</span>
                    </div>
                  )}
                </div>

                {/* Campos */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold text-gray-400">#{idx + 1}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${COR_BADGE[cat.cor]}`}>
                      {cat.icon}{cat.label}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {doc.tipo === 'pdf' ? 'PDF' : 'Imagem'} · {(doc.file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>

                  <input
                    type="text"
                    value={doc.descricao}
                    onChange={e => atualizar(doc.id, 'descricao', e.target.value)}
                    placeholder="Descrição do documento"
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    disabled={disabled}
                  />

                  <select
                    value={doc.categoria}
                    onChange={e => atualizar(doc.id, 'categoria', e.target.value as CategoriaDocumento)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    disabled={disabled}
                  >
                    {GRUPOS.map(g => (
                      <optgroup key={g} label={g}>
                        {CATEGORIAS.filter(c => c.grupo === g).map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Remover */}
                <button
                  type="button"
                  onClick={() => remover(doc.id)}
                  disabled={disabled}
                  className="flex-shrink-0 mt-1 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
