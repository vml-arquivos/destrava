import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolveDocumentPath } from './documentStorage';

type DocumentStorageRow = {
  id: string;
  caminho_arquivo?: string | null;
  nome_arquivo?: string | null;
  nome_original?: string | null;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  entidade_tipo?: string | null;
  entidade_id?: string | null;
  metadados?: Record<string, unknown> | null;
};

export type DocumentProcessingEvidence = {
  arquivo_aberto: boolean;
  arquivo_localizado: boolean;
  paginas_processadas: number | null;
  paginas_documento: number | null;
  unidade_processada: 'pagina' | 'imagem' | 'registro' | 'desconhecida';
  tipo_arquivo: 'pdf' | 'imagem' | 'estruturado' | 'desconhecido';
  mecanismo_verificacao: 'pdfinfo' | 'filesystem' | 'metadado' | 'indisponivel';
  tamanho_bytes: number | null;
  motivo: string | null;
};

const execFileAsync = promisify(execFile);

function tipoArquivo(row: DocumentStorageRow, filePath: string | null): DocumentProcessingEvidence['tipo_arquivo'] {
  const mime = String(row.mime_type || '').toLowerCase();
  const extension = path.extname(filePath || row.nome_arquivo || row.nome_original || '').toLowerCase();
  if (mime === 'application/pdf' || extension === '.pdf') return 'pdf';
  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp'].includes(extension)) return 'imagem';
  if (['.csv', '.xlsx', '.xls', '.docx', '.json'].includes(extension)) return 'estruturado';
  return 'desconhecido';
}

function paginasDoMetadado(row: DocumentStorageRow): number | null {
  const metadados = row.metadados && typeof row.metadados === 'object' ? row.metadados : {};
  const candidatos = [
    (metadados as any).paginas_processadas,
    (metadados as any).numero_paginas,
    (metadados as any).page_count,
    (metadados as any).pages,
  ];
  const valor = candidatos.find((item) => Number.isInteger(Number(item)) && Number(item) > 0);
  return valor === undefined ? null : Number(valor);
}

async function contarPaginasPdf(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      process.env.PDFINFO_BINARY || 'pdfinfo',
      [filePath],
      { timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' },
    );
    const match = String(stdout || '').match(/^Pages:\s*(\d+)/im);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function auditarArquivoDocumental(row: DocumentStorageRow): Promise<DocumentProcessingEvidence> {
  const resolved = resolveDocumentPath(row);
  const filePath = resolved.absolutePath;
  const tipo = tipoArquivo(row, filePath);
  const tamanho = row.tamanho_bytes !== null && row.tamanho_bytes !== undefined
    ? Number(row.tamanho_bytes)
    : filePath
      ? await fs.promises.stat(filePath).then((stat) => stat.size).catch(() => null)
      : null;
  const paginasMetadado = paginasDoMetadado(row);

  if (!filePath) {
    return {
      arquivo_aberto: false,
      arquivo_localizado: false,
      paginas_processadas: paginasMetadado,
      paginas_documento: null,
      unidade_processada: tipo === 'imagem' ? 'imagem' : tipo === 'estruturado' ? 'registro' : 'desconhecida',
      tipo_arquivo: tipo,
      mecanismo_verificacao: paginasMetadado ? 'metadado' : 'indisponivel',
      tamanho_bytes: tamanho,
      motivo: 'Arquivo físico não localizado no armazenamento persistente.',
    };
  }

  if (tipo === 'pdf') {
    const paginas = await contarPaginasPdf(filePath);
    return {
      arquivo_aberto: true,
      arquivo_localizado: true,
      paginas_processadas: paginas ?? paginasMetadado,
      paginas_documento: paginas,
      unidade_processada: 'pagina',
      tipo_arquivo: tipo,
      mecanismo_verificacao: paginas ? 'pdfinfo' : paginasMetadado ? 'metadado' : 'indisponivel',
      tamanho_bytes: tamanho,
      motivo: paginas ? null : 'Arquivo PDF localizado, mas o número de páginas não foi obtido pelo verificador.',
    };
  }

  return {
    arquivo_aberto: true,
    arquivo_localizado: true,
    paginas_processadas: paginasMetadado,
    paginas_documento: tipo === 'imagem' || tipo === 'estruturado' ? 1 : paginasMetadado,
    unidade_processada: tipo === 'imagem' ? 'imagem' : tipo === 'estruturado' ? 'registro' : 'desconhecida',
    tipo_arquivo: tipo,
    mecanismo_verificacao: 'filesystem',
    tamanho_bytes: tamanho,
    motivo: tipo === 'desconhecido' ? 'Arquivo localizado, mas seu formato não possui contador de páginas integrado.' : null,
  };
}

export async function auditarArquivosDocumentais(rows: DocumentStorageRow[]): Promise<Map<string, DocumentProcessingEvidence>> {
  const resultados = await Promise.all(rows.map(async (row) => [String(row.id), await auditarArquivoDocumental(row)] as const));
  return new Map(resultados);
}

export function resumoEvidenciaProcessamento(evidencias: Map<string, DocumentProcessingEvidence>) {
  const valores = Array.from(evidencias.values());
  return {
    arquivos_localizados: valores.filter((item) => item.arquivo_localizado).length,
    arquivos_abertos: valores.filter((item) => item.arquivo_aberto).length,
    arquivos_com_paginas: valores.filter((item) => Number.isInteger(item.paginas_processadas) && Number(item.paginas_processadas) > 0).length,
    arquivos_sem_paginas: valores.filter((item) => !Number.isInteger(item.paginas_processadas) || Number(item.paginas_processadas) <= 0).length,
    paginas_processadas: valores.reduce((total, item) => total + (Number(item.paginas_processadas) > 0 ? Number(item.paginas_processadas) : 0), 0),
  };
}
