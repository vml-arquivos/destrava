#!/usr/bin/env node

/**
 * Script de pré-renderização estática para Destrava Crédito
 * 
 * Valida que o index.html foi gerado corretamente pelo Vite.
 * A SPA React cuidará do roteamento no cliente.
 * 
 * Uso: node scripts/prerender.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, 'dist', 'public');

/**
 * Valida que o index.html foi gerado corretamente
 */
async function validatePrerender() {
  console.log('🔄 Validando pré-renderização estática...\n');

  const indexPath = path.resolve(distDir, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    console.error(`✗ index.html não encontrado em ${indexPath}`);
    process.exit(1);
  }

  const html = fs.readFileSync(indexPath, 'utf-8');
  
  // Verificar se o HTML contém os elementos essenciais
  const checks = [
    { name: 'Meta tags OG', pattern: /og:title|og:description|og:image/ },
    { name: 'Meta tags Twitter', pattern: /twitter:card|twitter:title/ },
    { name: 'Canonical URL', pattern: /rel="canonical"/ },
    { name: 'React root', pattern: /<div id="root"><\/div>/ },
    { name: 'Script bundle', pattern: /<script type="module"/ },
  ];

  let allPassed = true;
  for (const check of checks) {
    if (check.pattern.test(html)) {
      console.log(`✓ ${check.name}`);
    } else {
      console.log(`✗ ${check.name}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('\n❌ Validação falhou: alguns elementos essenciais estão faltando');
    process.exit(1);
  }

  console.log('\n✅ Pré-renderização validada com sucesso!');
  console.log(`   Arquivo: ${indexPath}`);
  console.log(`   Tamanho: ${(html.length / 1024).toFixed(2)} KB`);
}

// Executar
validatePrerender().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
