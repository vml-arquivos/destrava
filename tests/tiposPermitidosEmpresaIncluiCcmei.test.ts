import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CORREÇÃO (10/09/2026, causa raiz real do "CCMEI nunca aparece na tela",
// achada ao investigar o print real do usuário mostrando o card de CCMEI
// completamente ausente da grade -- mesmo já com a correção anterior, do
// mesmo dia, que filtra/reordena "Documentação da Empresa" para MEI --
// pedido explícito do usuário, com urgência: "eu não consegui ainda
// localizar onde vai o c[cmei]. Isso é, saia desse loop, saia desse erro, e
// resolva, de uma vez, sem falhas, sem erros, sem retrabalho.").
//
// A grade de campos de upload não é montada diretamente a partir do
// catálogo estático `SECOES_DOCUMENTAIS` -- ela passa antes por
// `slotsDaTela` (`DocumentosEntidade.tsx`), que só inclui um slot quando o
// tipo dele está na lista `tiposPermitidos` (prop vinda de cada tela que
// usa o componente) OU já foi efetivamente anexado. "ccmei", "das_mei" e
// "relatorio_receitas_mei" têm slot cadastrado no catálogo (`slot("CCMEI",
// "ccmei", ...)` etc., linhas ~216-230) mas nunca estiveram nas listas
// `TIPOS_EMPRESA` (AcervoDocumentalEmpresa.tsx) nem `TIPOS_PERMITIDOS_EMPRESA`
// (EmpresaDocumentos.tsx) -- as duas telas de "Acervo Documental" de
// empresa. Por isso o card de CCMEI nunca podia ser renderizado para
// NENHUMA empresa, em nenhum regime: a causa não estava em nenhuma regra de
// MEI (reordenação, ocultação de Atos da Junta/Contrato Social, etc.) --
// estava um passo antes, no filtro que decide quais slots sequer chegam a
// existir na tela. Isso também explica por que o usuário nunca conseguiu
// anexar o CCMEI em campo próprio, mesmo depois da correção anterior no
// mesmo dia: aquela correção reordena/filtra a lista que já saiu de
// `slotsDaTela` -- se "ccmei" nunca entra nela, não há o que reordenar.
//
// Sem infraestrutura de teste de componente React neste projeto (mesmo
// motivo já documentado em rodadas de frontend anteriores) -- este teste é
// uma auditoria de que as duas listas de tipos permitidos de empresa
// incluem os três tipos.
const TELAS = [
  { arquivo: 'client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx', constante: 'TIPOS_EMPRESA' },
  { arquivo: 'client/src/pages/colaborador/EmpresaDocumentos.tsx', constante: 'TIPOS_PERMITIDOS_EMPRESA' },
];

describe('CCMEI, DAS-MEI e relatório de receitas do MEI aparecem na grade de documentos da empresa (causa raiz: faltavam em tiposPermitidos)', () => {
  TELAS.forEach(({ arquivo, constante }) => {
    it(`${constante} (${arquivo}) inclui "ccmei", "das_mei" e "relatorio_receitas_mei"`, () => {
      const conteudo = readFileSync(resolve(process.cwd(), arquivo), 'utf8');
      const inicio = conteudo.indexOf(`const ${constante}`);
      expect(inicio).toBeGreaterThan(-1);
      const fim = conteudo.indexOf('];', inicio);
      const trechoLista = conteudo.slice(inicio, fim + 2);
      expect(trechoLista).toContain('"ccmei"');
      expect(trechoLista).toContain('"das_mei"');
      expect(trechoLista).toContain('"relatorio_receitas_mei"');
    });
  });

  it('zero regressão: os tipos já existentes (atos_junta_comercial, contrato_social, pgmei, dasn_simei, etc.) continuam presentes nas duas listas', () => {
    TELAS.forEach(({ arquivo }) => {
      const conteudo = readFileSync(resolve(process.cwd(), arquivo), 'utf8');
      ['atos_junta_comercial', 'contrato_social', 'pgdas', 'pgmei', 'defis', 'dasn_simei', 'ecf'].forEach((tipo) => {
        expect(conteudo).toContain(`"${tipo}"`);
      });
    });
  });

  it('o slot "CCMEI" (tipoUpload "ccmei") existe no catálogo de documentos da empresa, com matchTipos vazio (campo próprio, não é alias de outro tipo)', () => {
    const conteudo = readFileSync(resolve(process.cwd(), 'client/src/components/documentos/DocumentosEntidade.tsx'), 'utf8');
    expect(conteudo).toContain('slot("CCMEI", "ccmei", [],');
  });
});
