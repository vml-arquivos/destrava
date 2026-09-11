import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CORREÇÃO (09/09/2026, pedido explícito do usuário: "quando clica em dossiê
// de crédito ele não executa nenhuma ação, volta para acervo"). Causa raiz
// confirmada lendo o código-fonte instalado da própria biblioteca
// (node_modules/wouter, `use-browser-location.js`): `useLocation()` do
// wouter devolve só `window.location.pathname` -- NUNCA a query string. Os
// três arquivos abaixo liam a query fazendo `location.split("?")[1]` a
// partir do valor de `useLocation()` -- isso SEMPRE resultava em query
// vazia, então qualquer navegação que só troca a query (`?view=analise`,
// `?aba=...`, `?token=...`, `?novo=1`) não tinha nenhum efeito visível,
// mesmo a URL do navegador mudando de verdade. Reproduzido com um script
// isolado usando o wouter instalado antes desta correção.
//
// Corrigido trocando pelo hook certo do wouter para isso, `useSearch()`,
// nos três pontos onde o bug existia. Este teste não é um teste de
// comportamento de componente React (o projeto não tem essa infraestrutura,
// mesmo motivo já documentado em rodadas de frontend anteriores) -- é uma
// auditoria de que o padrão certo está no código-fonte, e que o padrão
// quebrado não volta por engano no futuro (nestes arquivos, nem em nenhum
// outro componente de tela).
const ARQUIVOS_COM_QUERY_STRING = [
  'client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx',
  'client/src/pages/colaborador/Empresas.tsx',
  'client/src/pages/colaborador/RedefinirSenha.tsx',
];

describe('leitura de query string via wouter (?view=, ?aba=, ?token=, ?novo=)', () => {
  it('nenhum dos três arquivos que precisam ler a query usa mais o padrão quebrado location.split("?") em código (fora de comentário)', () => {
    for (const caminho of ARQUIVOS_COM_QUERY_STRING) {
      const conteudo = readFileSync(resolve(process.cwd(), caminho), 'utf8');
      // Os comentários explicativos da correção citam o padrão antigo de
      // propósito, como contexto histórico -- por isso a checagem ignora
      // linhas de comentário (`//...`) e olha só para código de verdade.
      const codigoSemComentarios = conteudo
        .split('\n')
        .filter((linha) => !linha.trim().startsWith('//'))
        .join('\n');
      expect(codigoSemComentarios, `${caminho} ainda usa o padrão quebrado`).not.toMatch(/location\.split\(["']\?["']\)/);
      expect(conteudo, `${caminho} não importa useSearch do wouter`).toMatch(/import\s*\{[^}]*\buseSearch\b[^}]*\}\s*from\s*["']wouter["']/);
    }
  });

  it('AcervoDocumentalEmpresa lê ?view= e ?etapa= a partir de useSearch(), não de useLocation()', () => {
    const conteudo = readFileSync(resolve(process.cwd(), 'client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx'), 'utf8');
    expect(conteudo).toContain('const search = useSearch();');
    expect(conteudo).toContain('const view = new URLSearchParams(search).get("view");');
    expect(conteudo).toContain('const etapaInicial = new URLSearchParams(search).get("etapa");');
  });

  it('Empresas.tsx lê ?empresa=/?aba=/?novo= a partir de useSearch(), com search nas dependências dos efeitos que reagem à URL', () => {
    const conteudo = readFileSync(resolve(process.cwd(), 'client/src/pages/colaborador/Empresas.tsx'), 'utf8');
    expect(conteudo).toContain('const search = useSearch();');
    expect(conteudo).toContain('const queryString = search || "";');
    expect(conteudo).toContain('}, [location, search, empresas, selecionada?.id]);');
    expect(conteudo).toContain('}, [selecionada?.id, location, search]);');
    expect(conteudo).toContain('new URLSearchParams(search).get("novo")');
  });

  it('RedefinirSenha lê ?token= a partir de useSearch(), não de useLocation()', () => {
    const conteudo = readFileSync(resolve(process.cwd(), 'client/src/pages/colaborador/RedefinirSenha.tsx'), 'utf8');
    expect(conteudo).toContain('const search = useSearch();');
    expect(conteudo).toContain('new URLSearchParams(search).get("token")');
  });
});
