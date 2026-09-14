import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validarArquivo } from '../server/routes/documentos';
import { extrairDocumentoLocal } from '../server/services/extracaoDocumentalLocal';

const temporarios: string[] = [];

afterEach(async () => {
  await Promise.all(temporarios.splice(0).map((diretorio) => rm(diretorio, { recursive: true, force: true })));
});

function arquivo(nome: string, mimetype: string, buffer: Buffer) {
  return {
    originalname: nome,
    mimetype,
    buffer,
    size: buffer.length,
  } as any;
}

describe('formatos documentais aceitos', () => {
  it.each([
    ['GIF', 'imagem.gif', 'image/gif', Buffer.from('GIF89a' + 'conteudo')],
    ['TIFF little-endian', 'imagem.tiff', 'image/tiff', Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x00])],
    ['TIFF big-endian', 'imagem.tif', 'image/tiff', Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00])],
    ['BMP', 'imagem.bmp', 'image/bmp', Buffer.from('BM' + 'conteudo')],
    ['texto simples', 'documento.txt', 'text/plain', Buffer.from('Nome: Pessoa de Teste\nCPF: 123.456.789-00', 'utf8')],
    ['JSON', 'documento.json', 'application/json', Buffer.from('{"nome":"Pessoa de Teste"}', 'utf8')],
    ['SVG', 'documento.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Pessoa de Teste</text></svg>', 'utf8')],
    ['RTF', 'documento.rtf', 'application/rtf', Buffer.from('{\\rtf1\\ansi Pessoa de Teste\\par CPF: 123.456.789-00}', 'utf8')],
    ['OpenDocument', 'documento.odt', 'application/vnd.oasis.opendocument.text', Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('content.xml')])],
  ])('aceita assinatura válida de %s', (_rotulo, nome, mimetype, buffer) => {
    expect(() => validarArquivo(arquivo(nome, mimetype, buffer), 'documento_socio')).not.toThrow();
  });

  it('recusa imagem com extensão e assinatura incompatíveis', () => {
    expect(() => validarArquivo(arquivo('imagem.gif', 'image/gif', Buffer.from('não é GIF')), 'documento_socio'))
      .toThrow(/conteúdo real do arquivo/i);
  });

  it('lê texto e RTF pelo dispatcher local sem cair em formato não suportado', async () => {
    const diretorio = await mkdtemp(path.join(tmpdir(), 'destrava-formatos-'));
    temporarios.push(diretorio);
    const textoPath = path.join(diretorio, 'identidade.txt');
    const rtfPath = path.join(diretorio, 'identidade.rtf');
    await writeFile(textoPath, 'CARTEIRA NACIONAL DE HABILITAÇÃO\nNome: Pessoa de Teste\nCPF: 123.456.789-00', 'utf8');
    await writeFile(rtfPath, '{\\rtf1\\ansi CARTEIRA NACIONAL DE HABILITAÇÃO\\par Nome: Pessoa de Teste}', 'utf8');

    const texto = await extrairDocumentoLocal(textoPath, 'text/plain', 'documento_identidade_socio', 'documento_socio');
    const rtf = await extrairDocumentoLocal(rtfPath, 'application/rtf', 'documento_identidade_socio', 'documento_socio');

    expect(texto.mecanismo).toBe('texto_estruturado');
    expect(texto.texto).toContain('CARTEIRA NACIONAL');
    expect(rtf.mecanismo).toBe('texto_estruturado');
    expect(rtf.texto).toContain('CARTEIRA NACIONAL');
  });

  it('reconhece dimensões de BMP e TIFF para não rebaixar imagem válida a revisão', async () => {
    const diretorio = await mkdtemp(path.join(tmpdir(), 'destrava-imagens-'));
    temporarios.push(diretorio);
    const bmpPath = path.join(diretorio, 'fachada.bmp');
    const tiffPath = path.join(diretorio, 'fachada.tiff');
    const bmp = Buffer.alloc(10_000);
    bmp.write('BM', 0, 'ascii');
    bmp.writeInt32LE(640, 18);
    bmp.writeInt32LE(360, 22);
    const tiff = Buffer.alloc(10_000);
    tiff.write('II', 0, 'ascii');
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(2, 8);
    tiff.writeUInt16LE(256, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(640, 18);
    tiff.writeUInt16LE(257, 22); tiff.writeUInt16LE(3, 24); tiff.writeUInt32LE(1, 26); tiff.writeUInt16LE(360, 30);
    await writeFile(bmpPath, bmp);
    await writeFile(tiffPath, tiff);

    const bmpResult = await extrairDocumentoLocal(bmpPath, 'image/bmp', 'foto_fachada', 'foto_fachada');
    const tiffResult = await extrairDocumentoLocal(tiffPath, 'image/tiff', 'foto_fachada', 'foto_fachada');

    expect(bmpResult.dados.dimensoes_imagem).toEqual({ largura: 640, altura: 360 });
    expect(tiffResult.dados.dimensoes_imagem).toEqual({ largura: 640, altura: 360 });
    expect(bmpResult.dados.qualidade_imagem).toBe('adequada');
    expect(tiffResult.dados.qualidade_imagem).toBe('adequada');
  });
});
