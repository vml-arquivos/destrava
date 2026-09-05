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
    expect(acervo).toContain('{aberto ? "ocultar" : "Dados da análise"}');
    expect(acervo).toContain('? "Ver inconsistência"');
    expect(acervo).toContain('? "Ver pendência"');
    expect(acervo).toContain('{laudosExpandidos[doc.id] && resultadoInline && <ResultadoAnaliseDocumento');
    expect(acervo).not.toContain('{(documentoIncompativel || leituraPrecisaAtencao || laudosExpandidos[doc.id]) && resultadoInline');
    const resultadoComponente = readFileSync(resolve(process.cwd(), 'client/src/components/documentos/ResultadoAnaliseDocumento.tsx'), 'utf8');
    expect(resultadoComponente).toContain('const detalhes = compacto ? []');
  });
  it('oferece Ler/Reler para todo documento analisável, inclusive antes do primeiro laudo', () => {
    expect(acervo).toContain('tipoDocumentoTemLeituraAutomatica(doc.tipo_documento)');
    expect(acervo).toContain('temLeituraReal ? "Reler" : "Ler"');
    expect(acervo).toContain('somenteSeNecessario: true');
    expect(acervo).toContain('/api/documentacao/ia/documentos/${doc.id}/status');
    expect(acervo).toContain('const exigeCrosscheckSocietario = ["contrato_social", "alteracao_contratual"].includes(doc.tipo_documento)');
    expect(acervo).toContain('if (doc.analisado === true) return false;');
  });

  it('abre o Acervo com laudos individuais antes de aguardar o dossiê completo', () => {
    expect(acervo).toContain('Rodada 38: primeira pintura = Acervo + laudos persistidos por arquivo.');
    expect(acervo).toContain('setDocs(filtrada);');
    expect(acervo).toContain('A tela já pode ser usada neste ponto.');
    expect(acervo).toContain('setLoading(false);');
    expect(acervo).toContain('apiFetch(\`/api/documentacao/empresa/\${empresaId}/dossie\`)');
    // O dossiê agregado só atualiza os resumos de etapa; não remonta/substitui
    // a lista de documentos que já chegou com laudos persistidos.
    expect(acervo).not.toContain('const analisesPorArquivo = new Map');
  });

  it('lista documentos já trazendo o último laudo persistido por arquivo', () => {
    const documentosBackend = readFileSync(resolve(process.cwd(), 'server/routes/documentos.ts'), 'utf8');
    expect(documentosBackend).toContain('resultado_analise_persistida');
    expect(documentosBackend).toContain('resultado_cnpj_persistido');
    expect(documentosBackend).toContain('resultado_analise: resultadoAnalise');
  });

  it('backend expõe status universal e o clique manual força uma nova leitura real', () => {
    expect(backend).toContain("router.get('/ia/documentos/:documentoId/status'");
    expect(backend).toContain('forcar: forcar === true');
    expect(backend).toContain('const laudoAtual = !params.forcar');
    expect(backend).toContain("'contrato_junta_crosscheck'");
  });

});
