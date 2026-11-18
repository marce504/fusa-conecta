// Foto de perfil de WhatsApp de Fusa Conecta: isotipo de la app sobre el degradado de la marca, centrado para el
// recorte circular de WhatsApp. Dos versiones de 1080 × 1080: solo el ícono y con el nombre.
// Uso: node herramientas/difusion/perfil-whatsapp.mjs <ruta absoluta de app2> <ruta absoluta de salida>
/* global document */
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const [APP, SALIDA] = process.argv.slice(2);
mkdirSync(SALIDA, { recursive: true });
const require = createRequire(join(APP, 'package.json'));
const { chromium } = require('@playwright/test');

const appjs = readFileSync(join(APP, 'app.js'), 'utf8');
const hojas = new Function(appjs.match(/const LOGO_HOJAS=\[[\s\S]*?\];/)[0] + 'return LOGO_HOJAS;')();
const iso = alto =>
  `<svg height="${alto}" viewBox="102.46 0 194.02 275.6" aria-hidden="true">${hojas
    .map((d, i) => `<path fill="${['#FFFFFF', '#5EEAD4', '#2DD4A7', '#99F6E4'][i]}" d="${d}"/>`)
    .join('')}</svg>`;

const pagina = conNombre => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;font-family:Poppins,sans-serif;overflow:hidden;
  background:radial-gradient(circle at 78% 18%,rgba(45,212,167,.38),rgba(45,212,167,0) 46%),linear-gradient(155deg,#7B60FF 0%,#5B3DF5 48%,#3F28B8 100%);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
.nombre{color:#fff;font-size:92px;font-weight:700;letter-spacing:-.02em;line-height:1}
.nombre span{font-weight:400;color:#5EEAD4}
</style></head><body>${iso(conNombre ? 500 : 620)}${conNombre ? '<div class="nombre">Fusa <span>Conecta</span></div>' : ''}</body></html>`;

const nav = await chromium.launch({ channel: 'chrome' });
const p = await nav.newPage({ viewport: { width: 1080, height: 1080 } });
for (const [archivo, conNombre] of [
  ['perfil-whatsapp.png', false],
  ['perfil-whatsapp-con-nombre.png', true],
]) {
  await p.setContent(pagina(conNombre), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(SALIDA, archivo) });
}
// Vista previa con el recorte circular de WhatsApp, solo para revisar
await p.setContent(
  `<body style="margin:0;background:#ECE5DD;display:flex;gap:40px;align-items:center;justify-content:center;width:1080px;height:600px">
  ${['perfil-whatsapp.png', 'perfil-whatsapp-con-nombre.png']
    .map(
      f =>
        `<img src="data:image/png;base64,${readFileSync(join(SALIDA, f)).toString('base64')}" style="width:420px;height:420px;border-radius:50%">`,
    )
    .join('')}</body>`,
);
await p.setViewportSize({ width: 1080, height: 600 });
await p.screenshot({ path: join(SALIDA, '..', 'perfil-whatsapp-vista-circular.png') });
await nav.close();
console.log('listo');
