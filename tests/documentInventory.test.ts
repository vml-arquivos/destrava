import { describe, expect, it } from 'vitest';
import { anexarDocumentosNaoVinculados, idsDocumentosVinculados } from '../server/services/documentInventory';

describe('inventário documental completo', () => {
  it('preserva arquivos ativos sem vínculo em bloco informativo', () => {
    const blocos = [{ codigo: 'certidoes_regularidade', documentos: [{ id: 'cnd-1', tipo_documento: 'cnd_rfb_cnpj' }] }];
    const resultado = anexarDocumentosNaoVinculados(blocos, [
      { id: 'cnd-1', tipo_documento: 'cnd_rfb_cnpj' },
      { id: 'scr-1', tipo_documento: 'rating_bacen_cnpj', validado: true },
      { id: 'pgdas-1', tipo_documento: 'pgdas', validado: true },
    ]);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual(blocos[0]);
    expect(resultado[1].codigo).toBe('documentos_avulsos');
    expect(resultado[1].documentos).toEqual([
      { id: 'scr-1', tipo_documento: 'rating_bacen_cnpj', validado: true },
      { id: 'pgdas-1', tipo_documento: 'pgdas', validado: true },
    ]);
  });

  it('não cria bloco virtual quando todos os arquivos já estão vinculados', () => {
    const blocos = [{ codigo: 'cnpj_receita', documentos: [{ id: 'doc-1' }] }];
    expect(anexarDocumentosNaoVinculados(blocos, [{ id: 'doc-1' }])).toBe(blocos);
    expect(idsDocumentosVinculados(blocos)).toEqual(['doc-1']);
  });

  it('ignora documentos sem ID para não gerar itens fantasmas no relatório', () => {
    const blocos = [{ codigo: 'cnpj_receita', documentos: [] }];
    expect(anexarDocumentosNaoVinculados(blocos, [{ tipo_documento: 'cnd_rfb_cnpj' }])).toBe(blocos);
  });
});
