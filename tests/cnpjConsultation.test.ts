import { afterEach, describe, expect, it, vi } from 'vitest';
import { consultarCnpj } from '../server/routes/cnpj';

describe('consulta reutilizável de CNPJ', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejeita documento inválido sem produzir dados cadastrais', async () => {
    const resultado = await consultarCnpj('12.345.678/0001-9');

    expect(resultado).toEqual({
      ok: false,
      status: 400,
      error: 'CNPJ deve ter 14 dígitos.',
    });
  });

  it('preserva o contrato normalizado quando os provedores retornam dados', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('brasilapi')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            cnpj: '11222333000181',
            razao_social: 'Empresa Teste LTDA',
            nome_fantasia: 'Teste',
            municipio: 'São Paulo',
            uf: 'SP',
            cnae_fiscal: 6201500,
          }),
        };
      }
      if (url.includes('cnpja.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            taxId: '11222333000181',
            company: { name: 'Empresa Teste LTDA' },
            address: { city: 'São Paulo', state: 'SP' },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cnpj: '11222333000181',
          razao_social: 'Empresa Teste LTDA',
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await consultarCnpj('11.222.333/0001-81');

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.data).toMatchObject({
        cnpj: '11222333000181',
        razao_social: 'Empresa Teste LTDA',
        municipio: 'São Paulo',
        uf: 'SP',
        cnae_fiscal: 6201500,
        qsa_count: 0,
        fontes_consulta: expect.any(Array),
      });
      expect(resultado.data.provedor_principal).toBe('brasilapi');
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
