import fs from "fs";
import os from "os";
import path from "path";
import type { Browser, LaunchOptions } from "puppeteer-core";

type ChromiumProvider = "sparticuz" | "system";

type ChromiumCandidate = {
  provider: ChromiumProvider;
  executablePath: string;
  args: string[];
};

const tempDirs = new WeakMap<object, string>();

const BASE_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-zygote",
  "--disable-crash-reporter",
  "--disable-breakpad",
  "--no-crash-upload",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-first-run",
];

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function systemChromiumPaths(): string[] {
  return unique([
    process.env.PUPPETEER_EXECUTABLE_PATH || "",
    process.env.CHROMIUM_PATH || "",
    "/usr/bin/chromium",
    "/usr/lib/chromium/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ]).filter((candidate) => fs.existsSync(candidate));
}

async function resolveCandidates(): Promise<ChromiumCandidate[]> {
  const candidates: ChromiumCandidate[] = [];
  const provider = String(process.env.PUPPETEER_BROWSER_PROVIDER || "sparticuz").toLowerCase();

  const addSparticuz = async () => {
    try {
      const mod = await import("@sparticuz/chromium");
      const chromium = mod.default;
      const executablePath = await chromium.executablePath();
      if (executablePath && fs.existsSync(executablePath)) {
        candidates.push({
          provider: "sparticuz",
          executablePath,
          args: unique([...(chromium.args || []), ...BASE_ARGS]),
        });
      }
    } catch (error) {
      console.warn("[chromium] @sparticuz/chromium indisponível:", error instanceof Error ? error.message : error);
    }
  };

  const addSystem = () => {
    for (const executablePath of systemChromiumPaths()) {
      candidates.push({ provider: "system", executablePath, args: BASE_ARGS });
    }
  };

  if (provider === "system") {
    addSystem();
    await addSparticuz();
  } else {
    await addSparticuz();
    addSystem();
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.executablePath)) return false;
    seen.add(candidate.executablePath);
    return true;
  });
}

function formatLaunchError(candidate: ChromiumCandidate, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `[${candidate.provider}] ${candidate.executablePath}: ${message}`;
}

export class ChromiumLaunchError extends Error {
  readonly code = "CHROMIUM_LAUNCH_FAILED";
  readonly attempts: string[];

  constructor(attempts: string[]) {
    super(
      attempts.length
        ? `Não foi possível iniciar o Chromium para gerar o PDF. Tentativas: ${attempts.join(" | ")}`
        : "Nenhum executável Chromium compatível foi encontrado para gerar o PDF.",
    );
    this.name = "ChromiumLaunchError";
    this.attempts = attempts;
  }
}

export async function launchChromium(overrides: Partial<LaunchOptions> = {}): Promise<Browser> {
  const puppeteerModule = await import("puppeteer-core");
  const candidates = await resolveCandidates();
  const attempts: string[] = [];

  for (const candidate of candidates) {
    const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "destrava-chromium-"));
    try {
      console.info(`[chromium] iniciando provider=${candidate.provider} path=${candidate.executablePath}`);
      const browser = await puppeteerModule.default.launch({
        ...overrides,
        executablePath: candidate.executablePath,
        args: unique([...(candidate.args || []), ...((overrides.args as string[] | undefined) || [])]),
        headless: overrides.headless ?? true,
        userDataDir,
        timeout: overrides.timeout ?? 45000,
        env: {
          ...process.env,
          HOME: process.env.HOME && process.env.HOME !== "/root" ? process.env.HOME : os.tmpdir(),
          XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || path.join(os.tmpdir(), ".chromium-config"),
          XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(os.tmpdir(), ".chromium-cache"),
          ...(overrides.env || {}),
        },
      });
      tempDirs.set(browser, userDataDir);
      return browser;
    } catch (error) {
      attempts.push(formatLaunchError(candidate, error));
      await fs.promises.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  throw new ChromiumLaunchError(attempts);
}

export async function closeChromium(browser?: Browser | null): Promise<void> {
  if (!browser) return;
  const userDataDir = tempDirs.get(browser);
  try {
    await browser.close();
  } finally {
    tempDirs.delete(browser);
    if (userDataDir) {
      await fs.promises.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
