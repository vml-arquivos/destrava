# Deploy FIX64 — recuperação de tela branca

Release esperada: `fix64-recuperacao-assets-20260810`.

## Motivo da correção

Um `index.html` antigo podia continuar no navegador/CDN e solicitar um arquivo
Vite já removido pelo deploy seguinte. O pedido retornava 404 e o React nunca
iniciava, deixando toda a tela branca.

## Proteções desta release

- HTML e rota `/version` são entregues sem cache.
- Assets existentes continuam com hash e cache imutável.
- Somente um JavaScript antigo ausente recebe o módulo de autorrecuperação.
- O navegador recarrega a rota com cache-busting, sem apagar cookies,
  `localStorage`, dados do usuário ou arquivos.
- Se o container estiver incompleto, aparece uma tela de recuperação com nova
  tentativa, nunca um branco silencioso.
- CSP permite o beacon oficial do Cloudflare, eliminando o bloqueio mostrado no
  console sem liberar origens genéricas.

## Publicação segura no Coolify

1. Substitua o repositório completo por esta pasta.
2. Faça build sem reaproveitar a imagem antiga.
3. Aguarde o healthcheck ficar saudável antes de trocar o tráfego.
4. Confirme `GET /version`:

   ```json
   {"app":"destrava","release":"fix64-recuperacao-assets-20260810"}
   ```

5. Confirme que a resposta da página `/` contém `Cache-Control: no-store` e o
   header `X-Destrava-Release` com a mesma release.

O deploy não exige alteração de banco e não remove nenhum dado.
