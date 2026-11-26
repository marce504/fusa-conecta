// Mide el CLS (Cumulative Layout Shift) del Inicio con la Performance API, en un celular y con red lenta (Fase 4).
// Entra como invitado («Solo explorar»), espera a que lleguen los datos de la nube y suma los cambios de diseño por
// ventanas de sesión (como Lighthouse y Chrome). Lista qué elementos se movieron, para saber qué arreglar.
//
// Requisitos: el servidor local y el emulador encendidos (ver scripts/areas-tactiles.mjs).
// Uso:  node scripts/medir-cls.mjs [--url=http://localhost:5510/?emulador] [--ancho=360] [--alto=800] [--red=lenta|normal]
import { chromium } from '@playwright/test';

const opcion = (nombre, valor) =>
  (process.argv.find(a => a.startsWith(`--${nombre}=`)) || `=${valor}`).split('=').slice(1).join('=');
const URL_APP = opcion('url', 'http://localhost:5510/?emulador');
const ANCHO = Number(opcion('ancho', '360'));
const ALTO = Number(opcion('alto', '800'));
const RED = opcion('red', 'lenta');
// «Slow 4G» de Chrome DevTools: 150 ms de latencia, 1,6 Mb/s de bajada y 750 kb/s de subida
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

function observarCambios() {
  window.cambiosDiseno = [];
  new PerformanceObserver(lista => {
    lista.getEntries().forEach(e => {
      if (e.hadRecentInput) return;
      const fuentes = (e.sources || []).map(f => {
        const n = f.node;
        if (!n || !n.nodeType) return '(nodo ya quitado)';
        const el = n.nodeType === 1 ? n : n.parentElement;
        const r = (a, b) => `${Math.round(a.top)}+${Math.round(a.height)}→${Math.round(b.top)}+${Math.round(b.height)}`;
        return el
          ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className).split(' ')[0]} (${r(f.previousRect, f.currentRect)})`
          : '(texto)';
      });
      window.cambiosDiseno.push({ valor: e.value, momento: Math.round(e.startTime), fuentes });
    });
  }).observe({ type: 'layout-shift', buffered: true });
}

// Ventanas de sesión: cambios a menos de 1 s entre sí y de 5 s en total; el CLS es la ventana más grande
function clsPorVentanas(cambios) {
  let mejor = 0;
  let actual = 0;
  let inicio = 0;
  let anterior = 0;
  cambios.forEach(c => {
    if (c.momento - anterior > 1000 || c.momento - inicio > 5000) {
      actual = 0;
      inicio = c.momento;
    }
    actual += c.valor;
    anterior = c.momento;
    mejor = Math.max(mejor, actual);
  });
  return mejor;
}

async function main() {
  const navegador = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  const contexto = await navegador.newContext({
    viewport: { width: ANCHO, height: ALTO },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await contexto.addInitScript(() => localStorage.setItem('fc_letra_preguntada', 'true'));
  const pagina = await contexto.newPage();
  const cdp = await contexto.newCDPSession(pagina);
  if (RED === 'lenta') {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await pagina.addInitScript(observarCambios);
  await pagina.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await pagina.locator('#sInvitado').click({ timeout: 60000 });
  await pagina.waitForTimeout(12000);
  const cambios = await pagina.evaluate(() => window.cambiosDiseno);
  await navegador.close();
  const cls = clsPorVentanas(cambios);
  process.stdout.write(
    `CLS del Inicio (${ANCHO}×${ALTO}, red ${RED}): ${cls.toFixed(3)} (${cambios.length} cambios)\n`,
  );
  cambios
    .filter(c => c.valor >= 0.001)
    .forEach(c => process.stdout.write(`  ${c.momento} ms · ${c.valor.toFixed(3)} · ${c.fuentes.join(', ')}\n`));
  process.exitCode = cls < 0.1 ? 0 : 1;
}

main().catch(e => {
  process.stderr.write(`${e.stack}\n`);
  process.exitCode = 2;
});
