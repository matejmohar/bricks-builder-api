import { chromium, type FullConfig } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const project = config.projects[0]!;
  const baseURL = project.use.baseURL ?? 'http://localhost:8080';
  const statePath = project.use.storageState as string;

  const res = await fetch(`${baseURL}/wp-login.php`).catch((e: unknown) => {
    throw new Error(`WordPress lab is not reachable at ${baseURL} (${String(e)}). See README "Running the tests".`);
  });
  if (res.status !== 200) throw new Error(`${baseURL}/wp-login.php returned ${res.status}`);

  if (!existsSync(dirname(statePath))) mkdirSync(dirname(statePath), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/wp-login.php`);
  await page.fill('#user_login', process.env.BRICKS_USER ?? 'admin');
  await page.fill('#user_pass', process.env.BRICKS_PASSWORD ?? 'admin');
  await page.click('#wp-submit');
  await page.waitForURL(/wp-admin/);
  await page.context().storageState({ path: statePath });
  await browser.close();
}
