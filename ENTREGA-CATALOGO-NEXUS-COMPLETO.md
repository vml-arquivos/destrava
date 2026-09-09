# Entrega — API de catálogo completo para o Nexus

Endpoint: `GET /api/nexus/catalogo`

Parâmetros:
- `tipo=todos|empresa|pessoa_fisica`
- `q=<busca>`
- `page=<pagina>`
- `limit=<1..500>`

A resposta contém todos os cadastros por paginação e mantém aliases legados (`cliente`, `clientes`, `pf`, `pj`).

Validação executada:
- build de produção aprovado;
- 26 testes automatizados aprovados.
