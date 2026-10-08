// Existing browser checks can use a local installation or the desktop app's bundled Playwright.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

let runtime;
if (process.env.PLAYWRIGHT_MODULE) runtime = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
else {
  try { runtime = await import('playwright'); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    const file = [
      `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`,
      '/opt/node22/lib/node_modules/playwright/index.mjs',
    ].find(existsSync);
    if (!file) throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright index.mjs to run browser checks.');
    runtime = await import(pathToFileURL(file));
  }
}
export const { chromium } = runtime;
export const channel = process.env.BROWSER_CHANNEL || (process.platform === 'darwin' ? 'chrome' : 'chromium');
