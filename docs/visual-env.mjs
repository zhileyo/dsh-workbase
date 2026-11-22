import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function visualBrowser() {
  try {
    return process.env.DSH_UI_PLAYWRIGHT
      ? await import(pathToFileURL(resolve(process.env.DSH_UI_PLAYWRIGHT)).href)
      : await import('playwright');
  } catch {
    throw new Error('请安装隔离的 Playwright 并设置 DSH_UI_PLAYWRIGHT 为其 index.mjs 路径（详见 AGENTS.md）');
  }
}
export const browserOptions = {
  headless: true, ...(process.env.DSH_UI_CHROME ? { executablePath: process.env.DSH_UI_CHROME } : {}),
};
export const evidenceDirectory = resolve(process.env.DSH_UI_EVIDENCE_DIR ?? 'docs/ui/verification');
export async function prepareEvidence() {
  await mkdir(evidenceDirectory, { recursive: true }); return evidenceDirectory;
}
