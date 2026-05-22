import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/cnpj/:cnpj
 *
 * Proxy para a BrasilAPI — mantém a chamada externa no backend,
 * evita exposição de origin no frontend e permite adicionar cache futuro.
 */
router.get('/:cnpj', async (req: Request, res: Response) => {
  const raw = req.params.cnpj.replace(/\D/g, '');

  if (raw.length !== 14) {
    return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos.' });
  }

  try {
    const upstream = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`, {
      headers: { 'User-Agent': 'destrava-credito/1.0' },
      // 8 segundos de timeout
      signal: AbortSignal.timeout(8_000),
    });

    if (upstream.status === 404) {
      return res.status(404).json({ error: 'CNPJ não encontrado na Receita Federal.' });
    }

    if (!upstream.ok) {
      return res.status(502).json({ error: 'BrasilAPI retornou erro. Tente novamente.' });
    }

    const data = await upstream.json();
    return res.json(data);

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
