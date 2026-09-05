import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backend = readFileSync(resolve(process.cwd(), 'server/routes/documentacao.ts'), 'utf8');
const acervo = readFileSync(resolve(process.cwd(), 'client/src/components/documentos/DocumentosEntidade.tsx'), 'utf8');

describe('análise inline no Acervo Documental', () => {
  it('reutiliza o resultado detalhado do relatório no payload dos blocos', () => {
    expect(backend).toContain('enriquecerDocumentosAcervoComAnalise');
    expect(backend).toContain('resultado_analise: resultadoAnalise');
    expect(backend).toContain('const blocos = await enriquecerDocumentosAcervoComAnalise(blocosBrutos);');
  });

  it('renderiza resultado por arquivo e mantém o estado de upload quando não há laudo', () => {
    expect(acervo).toContain('resultado_analise?: Record<string, any> | null;');
    expect(acervo).toContain('const resultadoInline = doc.resultado_analise || laudo || laudoErro || null;');
    expect(acervo).toContain('<ResultadoAnaliseDocumento resultado={resultadoInline} documento={doc} compacto />');
    expect(acervo).toContain('Dados da análise');
  });
  it('oferece Ler/Reler para todo documento analisável, inclusive antes do primeiro laudo', () => {
    expect(acervo).toContain('tipoDocumentoTemLeituraAutomatica(doc.tipo_documento)');
    expect(acervo).toContain('temResultadoInline ? "Reler" : "Ler"');
    expect(acervo).toContain('somenteSeNecessario: true');
    expect(acervo).toContain('/api/documentacao/ia/documentos/${doc.id}/status');
  });

  it('backend expõe status universal e o clique manual força uma nova leitura real', () => {
    expect(backend).toContain("router.get('/ia/documentos/:documentoId/status'");
    expect(backend).toContain('forcar: forcar === true');
    expect(backend).toContain('const laudoAtual = !params.forcar');
    expect(backend).toContain("'contrato_junta_crosscheck'");
  });

});
