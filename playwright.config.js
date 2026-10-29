// Pruebas de extremo a extremo (Playwright) en un celular de 390×844, contra el emulador de Firebase.
//   npx firebase emulators:exec --only firestore,auth --project fusa-conecta "npx playwright test"
// Ver docs/pruebas.md.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'pruebas/e2e',
  globalSetup: './pruebas/e2e/semilla.mjs',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'informe-pruebas/e2e', open: 'never' }],
    ['junit', { outputFile: 'informe-pruebas/e2e.xml' }],
  ],
  use: {
    baseURL: 'http://localhost:5510',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    serviceWorkers: 'allow',
    // En local usa el Chrome instalado; en GitHub Actions, el Chromium de Playwright
    channel: process.env.CI ? undefined : 'chrome',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python -m http.server 5510',
    url: 'http://localhost:5510/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
