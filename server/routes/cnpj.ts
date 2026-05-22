import { Router, Request, Response } from 'express';

// Este roteador expõe uma rota para consulta de CNPJ, funcionando como
// intermediário para a BrasilAPI. Ele evita expor requisições externas no
// frontend e fornece tratamento de erros padronizado. Um tempo limite é
// aplicado para evitar requisições penduradas.

const router = Router();

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
