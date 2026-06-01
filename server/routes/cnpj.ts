import { Router, Request, Response } from 'express';

// Este roteador expõe uma rota para consulta de CNPJ, funcionando como
// intermediário para a BrasilAPI. Ele evita expor requisições externas no
// frontend e fornece tratamento de erros padronizado. Um tempo limite é
// aplicado para evitar requisições penduradas.

const router = Router();

function normalizeCapitalSocial(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const original = String(value).replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!original) return null;
  const sign = original.startsWith('-') ? '-' : '';
  const s = original.replace(/[^0-9.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    const n = Number(sign + s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (s.includes('.')) {
    const parts = s.split('.');
    const last = parts[parts.length - 1] || '';
    if (parts.length === 2 && /^\d{1,2}$/.test(last)) {
      const n = Number(sign + s);
      return Number.isFinite(n) ? n : null;
    }
    const onlyThousands = parts.length > 1 && parts.slice(1).every((part) => /^\d{3}$/.test(part));
    const normalized = onlyThousands ? parts.join('') : `${parts.slice(0, -1).join('')}.${last}`;
    const n = Number(sign + normalized);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(sign + s.replace(/\D/g, ''));
  return Number.isFinite(n) ? n : null;
}


/**
 * GET /api/cnpj/:cnpj
 *
 * Realiza uma consulta do CNPJ informado na BrasilAPI. O parâmetro
 * `cnpj` pode conter caracteres não numéricos, que serão removidos. A
 * consulta só será executada se o resultado contiver exatamente 14 dígitos.
 * Erros de validação retornam 400; CNPJ não encontrado retorna 404; outros
 * erros retornam 502 para indicar falha no serviço externo.
 */
router.get('/:cnpj', async (req: Request, res: Response) => {
  const raw = String(req.params.cnpj || '').replace(/\D/g, '');
  if (raw.length !== 14) {
    return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos.' });
  }
  try {
    const upstream = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`, {
      headers: { 'User-Agent': 'destrava-credito/1.0' },
      // limita a requisição a 8 segundos para evitar travamento
      signal: AbortSignal.timeout(8_000),
    });
    if (upstream.status === 404) {
      return res.status(404).json({ error: 'CNPJ não encontrado na Receita Federal.' });
    }
    if (!upstream.ok) {
      return res.status(502).json({ error: 'BrasilAPI retornou erro. Tente novamente.' });
    }
    const data = await upstream.json();
    const capitalNormalizado = normalizeCapitalSocial(data?.capital_social);
    return res.json({
      ...data,
      capital_social: capitalNormalizado ?? data?.capital_social ?? null,
      dados_fonte: 'brasilapi',
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return res.status(502).json({
      error: isTimeout
        ? 'Tempo esgotado ao consultar a Receita Federal.'
        : 'Erro ao consultar CNPJ.',
    });
  }
});

export default router;
