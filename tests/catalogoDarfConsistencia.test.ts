import { describe, expect, it } from 'vitest';
import { CATALOGO_CODIGO_RECEITA_DARF_IRPJ } from '../server/services/extracaoDocumentalLocal';
import { promptSimples } from '../server/services/analiseDocumentalEspecializada';

// Teste de consistência catálogo <-> prompt da IA (Missão de evolução do
// Acervo Documental, seção sobre teste de consistência banco/backend/
// frontend/catálogo). O código do catálogo (extracaoDocumentalLocal.ts,
// usado pela leitura local determinística) e a tabela de códigos de receita
// escrita como texto dentro do prompt enviado ao Gemini
// (analiseDocumentalEspecializada.ts, promptSimples) são DUAS fontes de
// verdade independentes que precisam concordar -- foi exatamente uma
// divergência entre elas (5993 classificado como Presumido num lugar e como
// "confirmar manualmente" implícito no outro) que originou o bug P0 corrigido
// nesta rodada, e a reversão do código 8998 corrigiu a mesma classe de erro
// pela segunda vez. Este teste existe para nunca mais deixar essas duas
// fontes divergirem silenciosamente.
describe('catálogo de código de receita do DARF -- consistência entre código e prompt da IA', () => {
  const prompt = promptSimples();

  it('todo código CONFIRMADO no catálogo aparece no prompt mapeado para o mesmo regime', () => {
    for (const [codigo, entrada] of Object.entries(CATALOGO_CODIGO_RECEITA_DARF_IRPJ)) {
      if (!entrada.confirmado) continue;
      const regex = new RegExp(`C[oó]digo ${codigo}\\b[^\\n]*"regime_tributario":\\s*"${entrada.regime}"`, 'i');
      expect(prompt, `código ${codigo} deveria mapear para "${entrada.regime}" no prompt da IA (catálogo e prompt divergiram)`).toMatch(regex);
    }
  });

  it('todo código NÃO confirmado no catálogo (ex.: 8998) nunca é mapeado para um regime no prompt da IA', () => {
    for (const [codigo, entrada] of Object.entries(CATALOGO_CODIGO_RECEITA_DARF_IRPJ)) {
      if (entrada.confirmado) continue;
      const regexMapeadoParaRegime = new RegExp(`C[oó]digo[^\\n]*\\b${codigo}\\b[^\\n]*"regime_tributario":\\s*"Lucro`, 'i');
      expect(prompt, `código ${codigo} não está confirmado na tabela oficial da RFB e não pode ser mapeado para um regime no prompt da IA`).not.toMatch(regexMapeadoParaRegime);
    }
  });

  it('nenhum código do catálogo fica ausente do prompt (evita o prompt ficar desatualizado silenciosamente ao editar só um dos dois arquivos)', () => {
    for (const codigo of Object.keys(CATALOGO_CODIGO_RECEITA_DARF_IRPJ)) {
      expect(prompt, `código ${codigo} do catálogo deveria ser mencionado no prompt da IA`).toContain(codigo);
    }
  });

  it('o catálogo continua fechado nos regimes reconhecidos (Presumido, Real ou Arbitrado) para todo código confirmado', () => {
    const regimesValidos = new Set(['Lucro Presumido', 'Lucro Real', 'Lucro Arbitrado']);
    for (const entrada of Object.values(CATALOGO_CODIGO_RECEITA_DARF_IRPJ)) {
      if (!entrada.confirmado) continue;
      expect(regimesValidos.has(entrada.regime as string), `regime "${entrada.regime}" fora do vocabulário reconhecido`).toBe(true);
    }
  });
});
