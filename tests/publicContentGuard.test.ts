import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("guardas de confiança do conteúdo público", () => {
  it("não reintroduz domínio antigo, promessas absolutas ou falso Rating Bacen", () => {
    const publicContent = [
      "client/src/data/blogPosts.ts",
      "client/src/data/faqData.ts",
      "client/src/pages/CapturaLead.tsx",
      "client/src/pages/CalculadoraScore.tsx",
      "client/src/pages/RatingBancoCentral.tsx",
      "client/src/pages/Sobre.tsx",
    ]
      .map(read)
      .join("\n");

    expect(publicContent).not.toMatch(/destrava-credito\.manus\.space/i);
    expect(publicContent).not.toMatch(/aprova(?:ç|c)ão garantida/i);
    expect(publicContent).not.toMatch(/rating bacen/i);
    expect(publicContent).not.toMatch(/1,5% a 4,5% a\.m\./i);
    expect(publicContent).not.toMatch(/autorizados pela caixa/i);
  });

  it("não referencia assets promocionais removidos", () => {
    const clientSource = sourceFiles(join(ROOT, "client/src"))
      .filter((path) => /\.(?:ts|tsx|css)$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(clientSource).not.toMatch(
      /carousel-(?:caixa|fampe|fco|fgi|procred|pronampe)|logo-pronampe\.jpg|logo-fco\.png/,
    );
  });

  it("evita controles interativos aninhados nas páginas React", () => {
    for (const path of sourceFiles(join(ROOT, "client/src")).filter((file) =>
      file.endsWith(".tsx"),
    )) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(
        /<Link\b[^>]*>(?:(?!<\/Link>)[\s\S])*<Button\b/,
      );
      expect(source, path).not.toMatch(
        /<a(?:\s|>)[^>]*>(?:(?!<\/a>)[\s\S])*<Button\b/,
      );
      expect(source, path).not.toMatch(
        /<Link\b[^>]*>(?:(?!<\/Link>)[\s\S])*<a(?:\s|>)/,
      );
    }
  });
});
