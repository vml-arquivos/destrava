from pathlib import Path

path = Path('/home/ubuntu/destrava/server/index.ts')
text = path.read_text()

replacements = [
    (
        '      const colaborador = (req as Request & { colaborador: any }).colaborador;\n      const isAdminKey = !req.headers.authorization && req.headers["x-admin-key"];\n      const isGestor = isAdminKey || isGestorCargo(colaborador?.cargo || \'\');\n',
        '      const colaborador = (req as Request & { colaborador: any }).colaborador;\n      const isGestor = isGestorCargo(colaborador?.cargo || \'\');\n',
    ),
    (
        '      if (isAdminKey) {\n        res.json({ leads: rows, total: rows.length });\n      } else {\n        res.json(rows);\n      }\n',
        '      res.json(rows);\n',
    ),
    (
        '      const solicitante = (req as Request & { colaborador: any }).colaborador;\n      const isAdminKey = !req.headers.authorization && req.headers["x-admin-key"];\n      const cargoSolicitante = isAdminKey ? \'administrador\' : (solicitante?.cargo || \'\');\n',
        '      const solicitante = (req as Request & { colaborador: any }).colaborador;\n      const cargoSolicitante = solicitante?.cargo || \'\';\n',
    ),
    (
        '        const solicitante = (req as Request & { colaborador: any }).colaborador;\n        const isAdminKey = !req.headers.authorization && req.headers["x-admin-key"];\n        const cargoSolicitante = isAdminKey ? \'administrador\' : (solicitante?.cargo || \'\');\n',
        '        const solicitante = (req as Request & { colaborador: any }).colaborador;\n        const cargoSolicitante = solicitante?.cargo || \'\';\n',
    ),
    ('      if (!isAdminKey && !podecriarUsuarios(cargoSolicitante)) {\n', '      if (!podecriarUsuarios(cargoSolicitante)) {\n'),
    ('      if (!isAdminKey && !podeGerenciarCargo(cargoSolicitante, cargo)) {\n', '      if (!podeGerenciarCargo(cargoSolicitante, cargo)) {\n'),
    ('      if (!isAdminKey && !podeGerenciarCargo(cargoSolicitante, cargoAlvo)) {\n', '      if (!podeGerenciarCargo(cargoSolicitante, cargoAlvo)) {\n'),
    ('      if (cargo && !isAdminKey && !podeGerenciarCargo(cargoSolicitante, cargo)) {\n', '      if (cargo && !podeGerenciarCargo(cargoSolicitante, cargo)) {\n'),
    (
        '  app.get("/api/n8n/status", auth, authorize(["Administrador"]), (req: Request, res: Response) => {\n    // Somente Administrador pode acessar integrações n8n\n    const colab = (req as Request & { colaborador?: any }).colaborador;\n    if (colab && (colab.cargo || \'\').toLowerCase() !== \'administrador\') {\n      res.status(403).json({ error: "Acesso restrito ao Administrador." });\n      return;\n    }\n',
        '  app.get("/api/n8n/status", auth, authorize(["Administrador"]), (_req: Request, res: Response) => {\n',
    ),
    (
        '  app.post("/api/n8n/test", auth, authorize(["Administrador"]), async (req: Request, res: Response) => {\n    // Somente Administrador pode testar webhook n8n\n    const colab = (req as Request & { colaborador?: any }).colaborador;\n    if (colab && (colab.cargo || \'\').toLowerCase() !== \'administrador\') {\n      res.status(403).json({ error: "Acesso restrito ao Administrador." });\n      return;\n    }\n',
        '  app.post("/api/n8n/test", auth, authorize(["Administrador"]), async (_req: Request, res: Response) => {\n',
    ),
    (
        '  app.post("/api/admin/sql", requireAdmin, async (req: Request, res: Response) => {\n',
        '  app.post("/api/admin/sql", auth, authorize(["Administrador"]), async (req: Request, res: Response) => {\n',
    ),
    (
        '           ORDER BY empresasAtendidas DESC, convertidos DESC\n',
        '           ORDER BY empresas_atendidas DESC, convertidos DESC\n',
    ),
]

for old, new in replacements:
    text = text.replace(old, new)

path.write_text(text)
print('ok')
