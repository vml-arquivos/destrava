import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CORREÇÃO (2026-08-31, bug real reportado em produção 3+ vezes seguidas --
// caso ZR CONSTRUCOES E REFORMAS CIVIS LTDA, CNPJ 49.366.887/0001-25: um
// PGDAS-D anexado no slot "ECF" continuava sendo aceito com um status vago
// ("leitura concluída com observação ou necessidade de revisão"), mesmo com o
// Enquadramento Tributário da própria empresa já lido como "Não Optante" pelo
// Simples Nacional -- um regime diferente do que o PGDAS antigo comprova).
//
// Causa raiz: `extrairHibrido` só usava o resultado da extração LOCAL
// diretamente quando ela NÃO apontasse incompatibilidade -- ou seja,
// exatamente quando o classificador determinístico local
// (`detectarTipoComprovanteRegime`/`parseComprovanteRegime`, em
// extracaoDocumentalLocal.ts) mais precisava ser ouvido, o código descartava
// esse achado e pedia uma segunda opinião à IA (Gemini), que é não
// determinística e cujo campo `documento_compativel` é assumido `true`
// quando ausente da resposta. Isso explica por que a mesma reclamação
// persistiu mesmo depois de peças corretas (classificador local,
// classificador central em classificadorDocumentalCentral.ts) já existirem
// no código -- elas nunca chegavam a ser consultadas neste caminho.
//
// Este teste exercita a extração local de VERDADE (pdftotext sobre um PDF
// real) combinada com uma resposta MOCADA da IA que erradamente diz
// "documento_compativel: true" -- exatamente o cenário que causava o bug --
// para provar que o resultado final da leitura local prevalece e a IA nem
// chega a ser consultada.
//
// Os dois PDFs usados são SINTÉTICOS, gerados para este teste com CNPJ e
// razão social FICTÍCIOS (11.222.333/0001-44, "Empresa Fictícia de Testes
// Ltda") -- nenhum dado real de cliente é incluído neste repositório. Os
// marcadores textuais foram conferidos diretamente contra
// `parseComprovanteRegime`/`classificarDocumentoDeterministico` antes de
// escrever as expectativas abaixo (ver histórico do CHANGELOG_CORRECOES.md).

const generateContent = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn(() => ({ generateContent })),
  })),
}));

import { AnaliseDocumentalService } from '../server/services/analiseDocumentalEspecializada';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

function criarDbMock(caminhoArquivo: string, tipoDocumento: string) {
  return {
    async query(text: string) {
      if (text.includes('FROM public.empresas')) {
        return { rows: [{ id: 'empresa-1', cnpj: '49.366.887/0001-25', razao_social: 'ZR Construcoes e Reformas Civis Ltda' }] };
      }
      if (text.includes('FROM public.socios_empresa')) return { rows: [] };
      if (text.includes('FROM public.documentos_arquivos')) {
        return {
          rows: [{
            id: 'doc-1',
            empresa_id: 'empresa-1',
            entidade_id: 'empresa-1',
            entidade_tipo: 'empresa',
            caminho_arquivo: caminhoArquivo,
            mime_type: 'application/pdf',
            tipo_documento: tipoDocumento,
            hash_arquivo: 'hash-teste',
          }],
        };
      }
      return { rows: [] };
    },
  };
}

function mockGeminiJson(value: unknown) {
  generateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify(value) } });
}

describe('AnaliseDocumentalService.analisarDocumentoCatalogado -- PGDAS no slot de ECF não é "lavado" pela IA', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // `resolverCaminhoSeguro` (server/services/analiseDocumentalEspecializada.ts)
    // só permite ler arquivos dentro de DATA_DIR/UPLOAD_DIR/<cwd>/uploads --
    // por segurança, nunca lê caminho arbitrário do código/aplicação. Os
    // fixtures sintéticos deste teste precisam estar dentro de uma dessas
    // raízes para serem lidos pela extração local de verdade.
    process.env = { ...originalEnv, GEMINI_API_KEY: 'chave-de-teste', DATA_DIR: FIXTURES_DIR, UPLOAD_DIR: FIXTURES_DIR };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('mantém documento_compativel=false mesmo quando a IA (mocada) diria "compatível" -- e a IA nem chega a ser chamada', async () => {
    const caminho = path.join(FIXTURES_DIR, 'pgdas-recibo-sintetico.pdf');
    const db = criarDbMock(caminho, 'ecf');
    // Resposta que a IA daria se fosse consultada -- propositalmente ERRADA
    // sobre `documento_compativel` (o bug histórico), mas com o restante dos
    // campos transcritos corretamente do documento (como uma IA real faria
    // mesmo ao errar o julgamento de compatibilidade), para provar que o
    // resultado final não depende dela nem por acidente.
    mockGeminiJson({
      documento_compativel: true,
      cnpj: '11.222.333/0001-44',
      situacao_simples: 'Optante',
      regime_tributario: 'Simples Nacional',
      situacao: 'documento reconhecido pela IA',
    });
    const service = new AnaliseDocumentalService(db as any);

    const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'ecf');

    expect(resultado.dados_extraidos.documento_compativel).toBe(false);
    expect(resultado.modelo_ia).toMatch(/^local:/);
    expect(generateContent).not.toHaveBeenCalled();

    const alertaLegado = resultado.alertas.find((a: any) => a.codigo === 'documento_catalogado_incompativel');
    expect(alertaLegado).toBeTruthy();
    expect(alertaLegado!.mensagem).toMatch(/simples nacional/i);
    expect(alertaLegado!.mensagem).toMatch(/pgdas/i);
    expect(alertaLegado!.mensagem).toMatch(/optante/i);

    const alertaClassificacao = resultado.alertas.find((a: any) => a.codigo === 'documento_catalogado_tipo_incompativel');
    expect(alertaClassificacao).toBeTruthy();
    expect(alertaClassificacao!.mensagem).toMatch(/simples nacional/i);
    expect(alertaClassificacao!.mensagem).toMatch(/pgdas-d/i);
  });

  it('um ECF de verdade continua sendo aceito normalmente (sem regressão)', async () => {
    const caminho = path.join(FIXTURES_DIR, 'ecf-sintetico.pdf');
    const db = criarDbMock(caminho, 'ecf');
    const service = new AnaliseDocumentalService(db as any);

    const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'ecf');

    expect(resultado.dados_extraidos.documento_compativel).toBe(true);
    expect(resultado.modelo_ia).toMatch(/^local:/);
    expect(generateContent).not.toHaveBeenCalled();
    expect(resultado.alertas.some((a: any) => a.codigo === 'documento_catalogado_incompativel')).toBe(false);
    expect(resultado.alertas.some((a: any) => a.codigo === 'documento_catalogado_tipo_incompativel')).toBe(false);
  });
});
