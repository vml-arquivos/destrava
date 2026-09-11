import { describe, expect, it } from 'vitest';
import { AnaliseDocumentalService } from '../server/services/analiseDocumentalEspecializada';

// CORREÇÃO (11/09/2026, rodada seguinte -- pedido explícito do usuário: "não
// é usar o contrato social como base, é usar os qualquer os documentos, os
// dados que tenha na empresa pra validar os dados do documento do sócio"):
// `carregarDocumentosAnterioresDoSocio` (método privado de
// AnaliseDocumentalService) é a consulta que busca o laudo mais recente de
// cada OUTRO documento já enviado/analisado para o MESMO `socio_id`, usada
// como fonte de apoio por `validarIdentidadeSocioExtraida` quando o QSA
// sincronizado não tem o CPF do sócio. Este teste cobre a consulta em si
// (filtros e mapeamento de linhas) de forma isolada, sem depender de toda a
// cadeia de classificação documental -- o mesmo padrão de teste unitário já
// usado para `validarIdentidadeSocioExtraida` neste projeto.

function criarDbMock(rows: any[]) {
  const calls: Array<{ text: string; values?: any[] }> = [];
  return {
    calls,
    async query(text: string, values?: any[]) {
      calls.push({ text, values });
      return { rows };
    },
  };
}

describe('AnaliseDocumentalService.carregarDocumentosAnterioresDoSocio (privado, acessado via cast em teste)', () => {
  it('não consulta o banco quando não há socio_id (documento ainda não vinculado a um sócio)', async () => {
    const db = criarDbMock([]);
    const service = new AnaliseDocumentalService(db as any);
    const resultado = await (service as any).carregarDocumentosAnterioresDoSocio('empresa-1', null, 'doc-atual');
    expect(resultado).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });

  it('filtra por socio_id, exclui o próprio arquivo, e mapeia tipo_documento + dados_extraidos de cada linha retornada', async () => {
    const db = criarDbMock([
      { arquivo_id: 'doc-antigo-1', tipo_documento: 'recibo_irpf', resultado: { dados_extraidos: { cpf: '123.456.789-01', nome: 'CARLOS EDUARDO SANTOS' } } },
      { arquivo_id: 'doc-antigo-2', tipo_documento: 'rg', resultado: { dados_extraidos: { cpf: '123.456.789-01', nome: 'CARLOS EDUARDO SANTOS' } } },
    ]);
    const service = new AnaliseDocumentalService(db as any);
    const resultado = await (service as any).carregarDocumentosAnterioresDoSocio('empresa-1', 's1', 'doc-atual');

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].text).toContain('FROM public.documentos_arquivos d');
    expect(db.calls[0].text).toContain('JOIN public.documentos_extracoes_ia e');
    expect(db.calls[0].text).toContain('d.socio_id = $1');
    expect(db.calls[0].text).toContain('d.id <> $2');
    expect(db.calls[0].values).toEqual(['s1', 'doc-atual', 'empresa-1']);

    expect(resultado).toEqual([
      { tipo_documento: 'recibo_irpf', dados: { cpf: '123.456.789-01', nome: 'CARLOS EDUARDO SANTOS' } },
      { tipo_documento: 'rg', dados: { cpf: '123.456.789-01', nome: 'CARLOS EDUARDO SANTOS' } },
    ]);
  });

  it('não derruba a análise principal quando a consulta falha -- retorna lista vazia (validação de identidade segue só com o QSA)', async () => {
    const db = { async query() { throw new Error('conexão indisponível'); } };
    const service = new AnaliseDocumentalService(db as any);
    const resultado = await (service as any).carregarDocumentosAnterioresDoSocio('empresa-1', 's1', 'doc-atual');
    expect(resultado).toEqual([]);
  });

  it('linha sem resultado.dados_extraidos vira objeto vazio (nunca undefined/null, para não quebrar derivarIdentidadeApoio)', async () => {
    const db = criarDbMock([
      { arquivo_id: 'doc-antigo-1', tipo_documento: 'rg', resultado: null },
      { arquivo_id: 'doc-antigo-2', tipo_documento: 'cnh', resultado: {} },
    ]);
    const service = new AnaliseDocumentalService(db as any);
    const resultado = await (service as any).carregarDocumentosAnterioresDoSocio('empresa-1', 's1', 'doc-atual');
    expect(resultado).toEqual([
      { tipo_documento: 'rg', dados: {} },
      { tipo_documento: 'cnh', dados: {} },
    ]);
  });
});
