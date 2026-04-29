import { useRef } from 'react';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';

interface Props {
  onImport: (registros: { competencia: string; valor: number; origem: string }[]) => void;
}

export function FormHistorico({ onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const registros = (results.data as any[])
          .filter(row => row.competencia && row.valor)
          .map(row => ({
            competencia: row.competencia,
            valor: parseFloat(String(row.valor).replace(/[^\d.,]/g, '').replace(',', '.')),
            origem: 'importado' as const,
          }))
          .filter(r => !isNaN(r.valor));
        onImport(registros);
      },
    });
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
      >
        <Upload className="w-4 h-4" />
        Importar CSV
      </button>
      <p className="text-xs text-gray-400 mt-1">
        Formato esperado: colunas <code>competencia</code> (YYYY-MM-DD) e <code>valor</code>
      </p>
    </div>
  );
}
