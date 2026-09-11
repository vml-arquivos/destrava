/**
 * Logos das contratadas para uso nos PDFs de contratos.
 * Lidas em runtime via fs.readFileSync para não inflar o bundle do esbuild.
 * Os arquivos PNG ficam em server/assets/ e são copiados para dist/assets/ no Dockerfile.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadLogoB64(filename: string): string {
  try {
    const candidates = [
      path.join(__dirname, "assets", filename),
      path.join(__dirname, "..", "server", "assets", filename),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString("base64")}`;
      }
    }
    console.warn(`[logo_constants] Logo não encontrada: ${filename}`);
    return "";
  } catch (e) {
    console.warn(`[logo_constants] Erro ao carregar logo ${filename}:`, e);
    return "";
  }
}

export const DESTRAVA_LOGO_B64: string = loadLogoB64("logo-destrava.png");
export const PERMUPAY_LOGO_B64: string = loadLogoB64("logo-permupay.png");
