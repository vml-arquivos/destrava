# Deploy FIX65 — tela branca e lockfile

Release esperada: `fix65-recuperacao-assets-lockfile-20260810`.

## Correções desta release

- `pnpm-lock.yaml` alinhado ao `override` e ao patch do `package.json` usando
  exatamente o pnpm 10.4.1 do Docker.
- `pnpm-workspace.yaml` válido, sem valores placeholder.
- HTML entregue sem cache.
- Assets existentes continuam com hash e cache imutável.
- JavaScript antigo ausente recebe um módulo de autorrecuperação.
- O navegador recarrega com cache-busting sem apagar cookies, `localStorage`,
  arquivos ou dados do usuário.
- Caso um container esteja incompleto, o usuário vê uma tela de recuperação em
  vez de tela branca silenciosa.

## Publicação no Coolify

1. Substitua o repositório completo por esta pasta.
2. Nas variáveis sensíveis, desative `Available at Buildtime`. Chaves e segredos
   são necessários somente em runtime e não podem aparecer como `ARG` no log.
3. Revogue e gere novamente qualquer chave ou segredo já exibido em log.
4. Faça um novo build sem cache e aguarde o healthcheck ficar saudável.
5. Confirme `GET /version`:

   ```json
   {"app":"destrava","release":"fix65-recuperacao-assets-lockfile-20260810"}
   ```

6. Confirme que `/` responde com `Cache-Control: no-store` e o header
   `X-Destrava-Release` com a mesma release.

O deploy não exige migração de banco e não remove dados.
