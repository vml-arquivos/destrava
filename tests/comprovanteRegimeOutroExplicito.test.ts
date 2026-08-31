import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CORREÇÃO (2026-08-31, rodada 12, pedido explícito do usuário -- marcação
// numa captura de tela com "anexar documentos" + mensagem de voz): "abra mais
// um campo... pra que possa ter outro... documento que fale com o regime
// tributário exato da empresa. Por exemplo... não precisa colocar nome...
// Porque se não tiver nenhum desses [ECF/DCTF/DARF/Livro Caixa], vai ter que
// ver o outro, e o outro vai ter que estar exatamente explícito qual o
// regime tributário."
//
// Este teste cobre o novo tipo documental 'comprovante_regime_outro' (o
// terceiro botão "Outro", ao lado de ECF e DCTF, no popover da pendência de
// regime tributário -- ver blocoPendenciaRegime em DocumentosEntidade.tsx):
//
// 1) Ao contrário de ECF/DCTF/DARF/Livro Caixa, este campo não tem um
//    formato de documento fixo esperado -- por isso não pode ser submetido ao
//    classificador central de identidade (`classificarResultadoPersistido`),
//    que compara um tipo esperado fixo contra um tipo detectado dentre um
//    conjunto fechado de formulários oficiais. Sem o tratamento de
//    "identidade flexível" (ver `identidadeFlexivel` em
//    `normalizarDocumentoCatalogado`, analiseDocumentalEspecializada.ts),
//    QUALQUER documento aceito aqui seria classificado como
//    identidade_status "INCOMPATIVEL" (porque 'comprovante_regime_outro'
//    nunca é igual a nenhum tipo detectado do conjunto fechado), mesmo
//    quando o regime tributário está perfeitamente explícito no texto. Este
//    teste usa de propósito um documento cujo conteúdo bate com o marcador
//    textual de ECF (`fixture ecf-sintetico.pdf`) para provar que, mesmo
//    assim, o campo genérico não marca o documento como incompatível.
// 2) O único requisito não negociável deste campo é o regime tributário
//    estar EXPLICITAMENTE declarado no texto -- exatamente a mesma checagem
//    usada para ECF/DCTF/DARF/Livro Caixa (`tiposComprovacaoRegime`). Um
//    documento que só confirma "Optante pelo Simples Nacional" (sem declarar
//    Presumido/Real/Arbitrado) não resolve a pendência.

const generateContent = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn(() => ({ generateContent })),
  })),
}));

import { AnaliseDocumentalService } from '../server/services/analiseDocumentalEspecializada';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

function mockGeminiJson(value: unknown) {
  generateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify(value) } });
}

function criarDbMock(caminhoArquivo: string, tipoDocumento: string) {
  return {
    async query(text: string) {
      if (text.includes('FROM public.empresas')) {
        return { rows: [{ id: 'empresa-1', cnpj: '11.222.333/0001-44', razao_social: 'Empresa Fictícia de Testes Ltda' }] };
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

describe('AnaliseDocumentalService.analisarDocumentoCatalogado -- campo genérico "Outro" comprovante do regime tributário', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'chave-de-teste', DATA_DIR: FIXTURES_DIR, UPLOAD_DIR: FIXTURES_DIR };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('aceita um documento com o regime tributário explícito, mesmo tendo o formato de outro tipo (ECF) -- identidade flexível, sem falso "incompatível"', async () => {
    const caminho = path.join(FIXTURES_DIR, 'ecf-sintetico.pdf');
    const db = criarDbMock(caminho, 'comprovante_regime_outro');
    const service = new AnaliseDocumentalService(db as any);

    const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'comprovante_regime_outro');

    // Regime lido diretamente do texto ("Regime de Tributacao: Lucro
    // Presumido"), exatamente pela mesma checagem usada para ECF/DCTF/DARF/
    // Livro Caixa (tiposComprovacaoRegime).
    expect(resultado.dados_extraidos.regime_confirmado).toBe(true);
    expect(resultado.dados_extraidos.regime_tributario).toBe('Lucro Presumido');

    // Identidade flexível: mesmo o conteúdo batendo com o marcador de ECF,
    // este campo não tem um "tipo esperado" fixo para comparar -- nunca deve
    // ser marcado como documento incompatível por causa disso.
    expect(resultado.dados_extraidos.identidade_status).toBe('IDENTIFICADO');
    expect(resultado.dados_extraidos.documento_compativel).not.toBe(false);
    expect(resultado.alertas.some((a: any) => a.codigo === 'documento_catalogado_incompativel')).toBe(false);
    expect(resultado.alertas.some((a: any) => a.codigo === 'documento_catalogado_tipo_incompativel')).toBe(false);

  });

  // A checagem de evidência exigida pela extração puramente local (sem IA) já
  // existe hoje para ECF/DCTF/DARF/Livro Caixa -- não é algo novo introduzido
  // por este campo, então o teste acima não afirma nada sobre
  // `revisao_humana_necessaria` (comparar com o teste de consistência abaixo,
  // que prova que 'comprovante_regime_outro' se comporta EXATAMENTE como
  // 'ecf' para o mesmo arquivo, sem tratamento especial).
  it('se comporta exatamente como "ecf" para o mesmo arquivo -- nenhum tratamento especial além da identidade flexível', async () => {
    const caminho = path.join(FIXTURES_DIR, 'ecf-sintetico.pdf');
    const dbEcf = criarDbMock(caminho, 'ecf');
    const resultadoEcf = await new AnaliseDocumentalService(dbEcf as any).analisarDocumentoCatalogado('empresa-1', 'doc-1', 'ecf');
    const dbOutro = criarDbMock(caminho, 'comprovante_regime_outro');
    const resultadoOutro = await new AnaliseDocumentalService(dbOutro as any).analisarDocumentoCatalogado('empresa-1', 'doc-1', 'comprovante_regime_outro');

    expect(resultadoOutro.status).toBe(resultadoEcf.status);
    expect(resultadoOutro.revisao_humana_necessaria).toBe(resultadoEcf.revisao_humana_necessaria);
    expect(resultadoOutro.dados_extraidos.regime_confirmado).toBe(resultadoEcf.dados_extraidos.regime_confirmado);
    expect(resultadoOutro.dados_extraidos.regime_tributario).toBe(resultadoEcf.dados_extraidos.regime_tributario);
  });

  it('NÃO confirma um regime que justifique a pendência quando o documento só declara ser optante do Simples Nacional -- exige o regime exatamente explícito', async () => {
    const caminho = path.join(FIXTURES_DIR, 'pgdas-recibo-sintetico.pdf');
    const db = criarDbMock(caminho, 'comprovante_regime_outro');
    const service = new AnaliseDocumentalService(db as any);

    const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'comprovante_regime_outro');

    // "Optante pelo Simples Nacional" não é Lucro Presumido, Real nem
    // Arbitrado -- os únicos regimes que justificam a pendência de "não
    // optante" (ver `regimesDeclarados` em routes/documentacao.ts). O
    // documento é lido corretamente (não fica em branco), mas nunca deve ser
    // confundido com uma confirmação de Presumido/Real/Arbitrado.
    expect(resultado.dados_extraidos.regime_tributario).toBe('Simples Nacional');
    expect(resultado.dados_extraidos.regime_tributario).not.toMatch(/presumido|real|arbitrado/i);
    expect(resultado.alertas.some((a: any) => a.codigo === 'regime_tributario_nao_identificado')).toBe(false);
  });

  // Documento sintético (contrato de prestação de serviços, sem qualquer
  // menção a regime/enquadramento tributário) -- prova o caso em que o campo
  // genérico "Outro" NÃO deve resolver a pendência: nenhum regime tributário
  // foi declarado no texto. Este é o teste que efetivamente depende de
  // 'comprovante_regime_outro' estar em `tiposComprovacaoRegime` (os dois
  // testes anteriores passam mesmo sem essa inclusão, porque o regime já vem
  // preenchido pela extração local de base -- ver prova por reversão no
  // CHANGELOG_CORRECOES.md).
  it('não confirma regime nenhum quando o documento não declara nenhum regime tributário -- não fica satisfeito silenciosamente', async () => {
    const caminho = path.join(FIXTURES_DIR, 'documento-sem-regime-sintetico.pdf');
    const db = criarDbMock(caminho, 'comprovante_regime_outro');
    const service = new AnaliseDocumentalService(db as any);
    // A extração local sozinha tem confiança baixa para este documento (não
    // há nenhum campo fiscal para casar), então o fluxo real pediria uma
    // segunda opinião à IA -- mocada aqui de forma determinística (sem
    // regime_tributario na resposta) para o teste não depender de rede nem
    // do caminho de fallback por exceção.
    mockGeminiJson({ documento_compativel: false, cnpj: null, situacao: 'Contrato de prestação de serviços, sem menção a regime tributário.' });

    const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'comprovante_regime_outro');

    expect(resultado.dados_extraidos.regime_confirmado).not.toBe(true);
    expect(resultado.dados_extraidos.regime_tributario).toBeFalsy();
    expect(resultado.alertas.some((a: any) => a.codigo === 'regime_tributario_nao_identificado')).toBe(true);
    // `satisfaz_requisito`/`cobertura_status` nunca podem ficar "satisfeitos"
    // aqui -- mesmo com a identidade flexível (que só dispensa a comparação
    // de FORMATO do documento, nunca a exigência do regime explícito).
    expect(resultado.dados_extraidos.satisfaz_requisito).toBe(false);
    expect(resultado.dados_extraidos.cobertura_status).toBe('NAO_SATISFAZ');
  });
});
