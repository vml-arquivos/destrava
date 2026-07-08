import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DEFAULT_DATA_DIR = '/var/data/destrava';

export class PersistentStorageError extends Error {
  statusCode = 503;
  code = 'PERSISTENT_STORAGE_REQUIRED';

  constructor(message: string) {
    super(message);
    this.name = 'PersistentStorageError';
  }
}

export type StorageHealth = {
  root: string;
  writable: boolean;
  persistent: boolean;
  configured: boolean;
  required: boolean;
  mountPoint: string | null;
  message: string;
};

export function getDataDir(): string {
  return path.resolve(process.env.DATA_DIR || DEFAULT_DATA_DIR);
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

function readMountPoints(): string[] {
  try {
    const lines = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n');
    return lines
      .map((line) => line.split(' - ')[0]?.trim().split(' ')[4])
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\\040/g, ' '))
      .sort((a, b) => b.length - a.length);
  } catch {
    return [];
  }
}

function findMountPoint(target: string): string | null {
  const normalizedTarget = normalizePath(target);
  return readMountPoints().find((mountPoint) => {
    const normalizedMount = normalizePath(mountPoint);
    return normalizedTarget === normalizedMount || normalizedTarget.startsWith(`${normalizedMount}/`);
  }) || null;
}

function isDedicatedPersistentMount(root: string, mountPoint: string | null): boolean {
  if (!mountPoint) return false;
  const normalizedRoot = normalizePath(root);
  const normalizedMount = normalizePath(mountPoint);
  if (normalizedMount === '/') return false;
  if (normalizedMount === '/app' || normalizedMount.startsWith('/app/')) return false;
  return normalizedRoot === normalizedMount || normalizedRoot.startsWith(`${normalizedMount}/`);
}

export async function getDocumentStorageHealth(): Promise<StorageHealth> {
  const root = getDataDir();
  const required = process.env.NODE_ENV === 'production' && process.env.REQUIRE_PERSISTENT_STORAGE !== 'false';
  let writable = false;
  let writeError = '';

  try {
    await fs.promises.mkdir(path.join(root, 'uploads', 'documentos'), { recursive: true });
    const probe = path.join(root, `.storage-probe-${process.pid}-${crypto.randomUUID()}`);
    await fs.promises.writeFile(probe, 'ok', { flag: 'wx' });
    await fs.promises.unlink(probe);
    writable = true;
  } catch (err: any) {
    writeError = err?.message || String(err);
  }

  const mountPoint = findMountPoint(root);
  const configured = process.env.PERSISTENT_STORAGE_CONFIGURED === 'true';
  const mounted = isDedicatedPersistentMount(root, mountPoint);
  const persistent = mounted && configured;

  let message = 'Armazenamento documental disponível.';
  if (!writable) {
    message = `O diretório documental não está gravável: ${writeError || root}`;
  } else if (required && !mounted) {
    message = `O diretório ${root} não está em um volume persistente dedicado. Configure um volume no Coolify antes de anexar arquivos.`;
  } else if (required && mounted && !configured) {
    message = `O volume está montado em ${mountPoint}, mas falta confirmar a configuração com PERSISTENT_STORAGE_CONFIGURED=true.`;
  } else if (persistent) {
    message = `Volume persistente ativo em ${mountPoint}.`;
  }

  return { root, writable, persistent, configured, required, mountPoint, message };
}

export async function assertDocumentStorageReady(): Promise<StorageHealth> {
  const health = await getDocumentStorageHealth();
  if (!health.writable) throw new PersistentStorageError(health.message);
  if (health.required && !health.persistent) throw new PersistentStorageError(health.message);
  return health;
}

function sanitizeSegment(value: string): string {
  return String(value || 'sem-id')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'sem-id';
}


const LEGACY_SEARCH_ROOTS = [
  '/var/data/destrava',
  '/data',
  '/app',
  process.cwd(),
  '/tmp',
];

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function looksLikeUploadRoot(value: string): boolean {
  const normalized = normalizePath(value);
  return normalized.includes('/uploads') || normalized.includes('/documentos') || normalized.includes('/data');
}

function scanForLegacyFile(names: string[]): string | null {
  const safeNames = new Set(
    names
      .map((name) => path.basename(String(name || '').trim()))
      .filter((name) => Boolean(name) && name !== '.' && name !== '..')
  );
  if (!safeNames.size) return null;

  const roots = uniqueStrings([
    getDataDir(),
    ...LEGACY_SEARCH_ROOTS,
    process.env.LEGACY_UPLOADS_DIR,
    process.env.UPLOADS_DIR,
  ]);

  const queue: Array<{ dir: string; depth: number }> = [];
  const visited = new Set<string>();

  for (const root of roots) {
    const normalized = path.resolve(root);
    if (!visited.has(normalized) && fs.existsSync(normalized)) queue.push({ dir: normalized, depth: 0 });
  }

  let inspected = 0;
  const maxInspected = Number(process.env.DOCUMENT_SEARCH_MAX_FILES || 12000);
  const maxDepth = Number(process.env.DOCUMENT_SEARCH_MAX_DEPTH || 7);

  while (queue.length && inspected < maxInspected) {
    const current = queue.shift()!;
    if (visited.has(current.dir)) continue;
    visited.add(current.dir);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (inspected++ >= maxInspected) break;
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const full = path.join(current.dir, entry.name);

      if (entry.isFile() && safeNames.has(entry.name)) return full;

      if (entry.isDirectory() && current.depth < maxDepth) {
        // Evita varredura ampla demais: após o primeiro nível, seguimos apenas por
        // árvores que parecem conter uploads/documentos.
        if (current.depth === 0 || looksLikeUploadRoot(full)) {
          queue.push({ dir: full, depth: current.depth + 1 });
        }
      }
    }
  }

  return null;
}

export async function saveDocumentBuffer(params: {
  entidadeTipo: string;
  entidadeId: string;
  filename: string;
  buffer: Buffer;
  expectedSha256?: string;
}): Promise<{ absolutePath: string; relativePath: string; sha256: string }> {
  const health = await assertDocumentStorageReady();
  const safeEntity = sanitizeSegment(params.entidadeTipo);
  const safeId = sanitizeSegment(params.entidadeId);
  const safeFilename = path.basename(params.filename).replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const relativePath = path.posix.join('uploads', 'documentos', safeEntity, safeId, safeFilename);
  const absolutePath = path.join(health.root, ...relativePath.split('/'));
  const directory = path.dirname(absolutePath);
  await fs.promises.mkdir(directory, { recursive: true });

  const tempPath = path.join(directory, `.${safeFilename}.${crypto.randomUUID()}.tmp`);
  await fs.promises.writeFile(tempPath, params.buffer, { flag: 'wx', mode: 0o640 });

  const sha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');
  if (params.expectedSha256 && sha256 !== params.expectedSha256) {
    await fs.promises.unlink(tempPath).catch(() => undefined);
    throw new Error('Falha de integridade ao gravar o documento. O hash do arquivo não confere.');
  }

  await fs.promises.rename(tempPath, absolutePath);
  return { absolutePath, relativePath, sha256 };
}

function candidateFromUploadsSuffix(storedPath: string): string | null {
  const normalized = storedPath.replace(/\\/g, '/');
  const marker = '/uploads/';
  const idx = normalized.lastIndexOf(marker);
  if (idx >= 0) return normalized.slice(idx + 1);
  if (normalized.startsWith('uploads/')) return normalized;
  return null;
}

export function resolveDocumentPath(doc: {
  caminho_arquivo?: string | null;
  nome_arquivo?: string | null;
  nome_original?: string | null;
  hash_arquivo?: string | null;
  entidade_tipo?: string | null;
  entidade_id?: string | null;
}): { absolutePath: string | null; relativePath: string | null; candidates: string[] } {
  const root = getDataDir();
  const stored = String(doc.caminho_arquivo || '').trim();
  const candidates = new Set<string>();

  if (stored) {
    if (path.isAbsolute(stored)) candidates.add(path.resolve(stored));
    else candidates.add(path.join(root, ...stored.replace(/\\/g, '/').split('/')));

    const uploadsSuffix = candidateFromUploadsSuffix(stored);
    if (uploadsSuffix) candidates.add(path.join(root, ...uploadsSuffix.split('/')));
  }

  if (doc.nome_arquivo && doc.entidade_tipo && doc.entidade_id) {
    candidates.add(path.join(
      root,
      'uploads',
      'documentos',
      sanitizeSegment(doc.entidade_tipo),
      sanitizeSegment(doc.entidade_id),
      path.basename(doc.nome_arquivo),
    ));
  }

  if (doc.nome_arquivo) {
    candidates.add(path.resolve('uploads', 'documentos', path.basename(doc.nome_arquivo)));
    candidates.add(path.join('/app/uploads/documentos', path.basename(doc.nome_arquivo)));
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const normalizedCandidate = path.resolve(candidate);
        const relative = normalizedCandidate.startsWith(`${root}${path.sep}`)
          ? path.relative(root, normalizedCandidate).replace(/\\/g, '/')
          : candidateFromUploadsSuffix(normalizedCandidate);
        return { absolutePath: normalizedCandidate, relativePath: relative || null, candidates: Array.from(candidates) };
      }
    } catch {
      // Continua para o próximo candidato.
    }
  }

  const recovered = scanForLegacyFile(uniqueStrings([
    doc.nome_arquivo,
    doc.nome_original,
    stored ? path.basename(stored) : null,
  ]));
  if (recovered) {
    const normalizedRecovered = path.resolve(recovered);
    candidates.add(normalizedRecovered);
    const relative = normalizedRecovered.startsWith(`${root}${path.sep}`)
      ? path.relative(root, normalizedRecovered).replace(/\\/g, '/')
      : candidateFromUploadsSuffix(normalizedRecovered);
    return { absolutePath: normalizedRecovered, relativePath: relative || null, candidates: Array.from(candidates) };
  }

  return { absolutePath: null, relativePath: null, candidates: Array.from(candidates) };
}

export function isPathInsideDocumentStorage(filePath: string): boolean {
  const root = getDataDir();
  const resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}
