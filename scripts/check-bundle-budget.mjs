import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const publicDir = path.resolve("dist", "public");
const indexPath = path.join(publicDir, "index.html");

if (!fs.existsSync(indexPath)) {
  throw new Error("Build do frontend não encontrado em dist/public.");
}

const html = fs.readFileSync(indexPath, "utf8");
const assetPaths = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
  .map((match) => match[1]);

const gzipKb = (filePath) => gzipSync(fs.readFileSync(filePath)).byteLength / 1024;
const formatKb = (value) => `${value.toFixed(1)} kB gzip`;
const uniqueAssets = [...new Set(assetPaths)].map((assetPath) => ({
  assetPath,
  filePath: path.join(publicDir, assetPath.replace(/^\//, "")),
}));

const initialJsKb = uniqueAssets
  .filter(({ assetPath }) => assetPath.endsWith(".js"))
  .reduce((total, { filePath }) => total + gzipKb(filePath), 0);
const initialCssKb = uniqueAssets
  .filter(({ assetPath }) => assetPath.endsWith(".css"))
  .reduce((total, { filePath }) => total + gzipKb(filePath), 0);

const a1Chunk = fs.readdirSync(path.join(publicDir, "assets"))
  .find((fileName) => /^CertificadoDigitalA1-.*\.js$/.test(fileName));
if (!a1Chunk) {
  throw new Error("Chunk da landing CertificadoDigitalA1 não foi encontrado.");
}
const a1ChunkKb = gzipKb(path.join(publicDir, "assets", a1Chunk));

const budgets = [
  { label: "JavaScript inicial", value: initialJsKb, maximum: 130 },
  { label: "CSS inicial", value: initialCssKb, maximum: 45 },
  { label: "Landing A1", value: a1ChunkKb, maximum: 20 },
];

let failed = false;
for (const budget of budgets) {
  const status = budget.value <= budget.maximum ? "OK" : "EXCEDEU";
  console.log(`[bundle-budget] ${status} ${budget.label}: ${formatKb(budget.value)} (limite ${budget.maximum} kB)`);
  failed ||= budget.value > budget.maximum;
}

if (failed) {
  process.exitCode = 1;
}
