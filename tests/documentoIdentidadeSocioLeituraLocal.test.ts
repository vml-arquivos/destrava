import { describe, expect, it } from 'vitest';
import { classificarDocumentoDeterministico } from '../server/services/classificadorDocumentalCentral';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
import { normalizarDocumentoCatalogado, tipoLeitorLocalDocumentoCatalogado } from '../server/services/analiseDocumentalEspecializada';

// CORREÇÃO (11/09/2026, pedido explícito do usuário com uma CNH real
// anexada: "mesmo colocando o cnh [...] ele está pedindo revisão [...] tem
// que saber ler todo o documento [...] garanta que consiga ler e entender
// todos os documentos"): "Documento de identificação do sócio" (RG/CNH/CPF)
// nunca teve leitor local dedicado -- caía no parser genérico, que nunca
// captura os campos essenciais do perfil (`nome`, `numero_documento`),
// porque os rótulos oficiais desses formulários vêm com prefixo numérico de
// campo ("2 e 1 NOME E SOBRENOME", "5 Nº REGISTRO") e nunca estão no início
// da linha; e capturava o CPF ERRADO numa CNH real -- a regra genérica pega
// o primeiro número de 11 dígitos do texto, que na CNH é o Nº DE REGISTRO
// (aparece antes do CPF no layout oficial), não o CPF de fato. Um novo
// parser dedicado (`parseDocumentoIdentidadeSocio`) resolve os dois
// problemas para CNH, RG e CPF -- não específico desta empresa/documento.
const CNH_TEXTO_REAL = `Carteira Nacional de Habilitação (CNH) - SENATRAN QR CODE
DOCUMENTO DE IDENTIFICAÇÃO
Este arquivo não pode ser utilizado
como documento de habilitação.
Carteira Nacional de Habilitação  (CNH) - SENATRAN
REPÚBLICA FEDERATIVA DO BRASIL
MINISTÉRIO DOS TRANSPORTES
SECRETARIA NACIONAL DE TRÂNSITO
CARTEIRA NACIONAL DE HABILITAÇÃO / DRIVER LICENSE / PERMISO DE CONDUCCIÓN
2 e 1 NOME E SOBRENOME
JONNATHAS RODRIGUES PIRES
1ª HABILITAÇÃO
06/11/2014
3 DATA, LOCAL E UF DE NASCIMENTO
11/01/1996, PARAUNA, GO
4a DATA EMISSÃO
19/02/2024
4b VALIDADE
16/02/2034
ACC
D
4c DOC IDENTIDADE / ÓRG EMISSOR / UF
5408199 SPTC GO
5 Nº REGISTRO
06224801406
9 CAT HAB
AB
4d CPF
038.211.981-92
NACIONALIDADE
BRASILEIRO(A)
FILIAÇÃO
DELCIMAR RODRIGUES DOS SANTOS
ALESSANDRA PITIMAN PIRES DOS SANTOS
7 ASSINATURA DO PORTADOR
LOCAL
GOIANIA, GO
GOIÁS`;

const RG_TEXTO_SINTETICO = `REPÚBLICA FEDERATIVA DO BRASIL
SECRETARIA DE SEGURANÇA PÚBLICA
CARTEIRA DE IDENTIDADE
REGISTRO GERAL
12.345.678-9
NOME
MARIA DA SILVA SANTOS
FILIAÇÃO
JOSÉ DA SILVA
ANA SANTOS
CPF
123.456.789-00
DATA DE NASCIMENTO
05/05/1990`;

const CPF_TEXTO_SINTETICO = `MINISTÉRIO DA FAZENDA
CADASTRO DE PESSOAS FÍSICAS
COMPROVANTE DE SITUAÇÃO CADASTRAL NO CPF
Nome da Pessoa Física
CARLOS EDUARDO OLIVEIRA
CPF
987.654.321-00
Data de Nascimento
10/10/1985`;

describe('tipoLeitorLocalDocumentoCatalogado -- documento_socio/rg/cnh/cpf roteiam para o leitor dedicado', () => {
  it.each(['documento_socio', 'rg', 'cnh', 'cpf'])('%s deixa de cair em documento_generico', (tipo) => {
    expect(tipoLeitorLocalDocumentoCatalogado(tipo)).toBe('documento_identidade_socio');
  });
});

describe('parseDocumentoIdentidadeSocio -- CNH real', () => {
  it('extrai nome e numero_documento (antes sempre ausentes -- "Campos essenciais não comprovados: nome, numero_documento")', () => {
    const r = analisarTextoDocumentoLocal('documento_identidade_socio', CNH_TEXTO_REAL, 'documento_socio');
    expect(r.dados.nome).toBe('JONNATHAS RODRIGUES PIRES');
    expect(r.dados.numero_documento).toBe('06224801406');
  });

  it('extrai o CPF correto -- não o Nº de registro (bug real: CPF ficava "06224801406" em vez de "038.211.981-92")', () => {
    const r = analisarTextoDocumentoLocal('documento_identidade_socio', CNH_TEXTO_REAL, 'documento_socio');
    expect(r.dados.cpf).toBe('038.211.981-92');
  });

  it('reconhece o documento como CNH compatível e cruza o limiar de confiança local (0.72)', () => {
    const r = analisarTextoDocumentoLocal('documento_identidade_socio', CNH_TEXTO_REAL, 'documento_socio');
    expect(r.dados.documento_compativel).toBe(true);
    expect(r.dados.tipo_detectado_local).toBe('CNH');
    expect(r.confianca).toBeGreaterThanOrEqual(0.72);
  });

  it('status_documental final deixa de ser "Revisão necessária" (DADOS_INSUFICIENTES) e passa a DADO_COMPROVADO', () => {
    const leitura = analisarTextoDocumentoLocal('documento_identidade_socio', CNH_TEXTO_REAL, 'documento_socio');
    const extraidos = { ...leitura.dados, confianca: leitura.confianca, __texto_local: CNH_TEXTO_REAL };
    const normalizado = normalizarDocumentoCatalogado(extraidos, 'documento_socio');
    expect(normalizado.dados.status_documental).toBe('DADO_COMPROVADO');
    expect(normalizado.dados.campos_essenciais_ausentes).toEqual([]);
  });

  it('classificação central: identidade IDENTIFICADO como CNH (documento_socio aceita RG/CPF/CNH)', () => {
    const classificacao = classificarDocumentoDeterministico({ tipoEsperado: 'documento_socio', texto: CNH_TEXTO_REAL });
    expect(classificacao.identidade_status).toBe('IDENTIFICADO');
    expect(classificacao.tipo_detectado).toBe('CNH');
  });
});

describe('parseDocumentoIdentidadeSocio -- RG e CPF (documentos sintéticos, mesmo leitor)', () => {
  it('reconhece um RG como compatível e extrai nome', () => {
    const r = analisarTextoDocumentoLocal('documento_identidade_socio', RG_TEXTO_SINTETICO, 'documento_socio');
    expect(r.dados.documento_compativel).toBe(true);
    expect(r.dados.tipo_detectado_local).toBe('RG');
    expect(r.dados.nome).toBe('MARIA DA SILVA SANTOS');
  });

  it('reconhece um cartão de CPF como compatível e usa o próprio CPF como numero_documento', () => {
    const r = analisarTextoDocumentoLocal('documento_identidade_socio', CPF_TEXTO_SINTETICO, 'documento_socio');
    expect(r.dados.documento_compativel).toBe(true);
    expect(r.dados.tipo_detectado_local).toBe('CPF');
    expect(r.dados.numero_documento).toBe(r.dados.cpf);
  });
});

describe('zero regressão -- um documento claramente não relacionado continua incompatível como documento de identidade', () => {
  it('um contrato social não é confundido com RG/CNH/CPF', () => {
    const texto = 'INSTRUMENTO PARTICULAR DE CONTRATO SOCIAL\nContratante e contratado resolvem constituir sociedade empresária limitada.';
    const r = analisarTextoDocumentoLocal('documento_identidade_socio', texto, 'documento_socio');
    expect(r.dados.documento_compativel).toBe(false);
  });
});
