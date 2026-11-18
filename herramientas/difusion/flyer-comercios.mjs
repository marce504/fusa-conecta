// Flyer para comerciantes de Fusa Conecta: arma el HTML con el logo e íconos reales de la app y lo exporta a PNG y PDF.
// Uso: node herramientas/difusion/flyer-comercios.mjs <ruta absoluta de app2> <ruta absoluta de salida>  (lee el QR en base64 de <salida>/../qr.txt)
/* global document */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const [APP, SALIDA] = process.argv.slice(2);
mkdirSync(SALIDA, { recursive: true });
const require = createRequire(join(APP, 'package.json'));
const { chromium } = require('@playwright/test');

// Íconos Lucide y hojas del logo, tal como están en la app
const ICONOS = new Function(readFileSync(join(APP, 'icons.js'), 'utf8') + ';return ICONOS;')();
const appjs = readFileSync(join(APP, 'app.js'), 'utf8');
const hojas = new Function(appjs.match(/const LOGO_HOJAS=\[[\s\S]*?\];/)[0] + 'return LOGO_HOJAS;')();
const ic = (n, s = 40) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n]}</svg>`;
const iso = (colores, alto) =>
  `<svg height="${alto}" viewBox="102.46 0 194.02 275.6" aria-hidden="true">${hojas.map((d, i) => `<path fill="${colores[i]}" d="${d}"/>`).join('')}</svg>`;
const qr = readFileSync(join(SALIDA, '..', 'qr.txt'), 'utf8').trim();

const que = [
  ['store', 'Comercios y servicios'],
  ['mountain', 'Turismo y rutas'],
  ['calendar-days', 'Eventos y agenda'],
  ['ticket', 'Cupones de descuento'],
  ['utensils', 'Comida y hospedaje'],
  ['siren', 'Emergencias SOS'],
];
const gratis = [
  ['phone', 'WhatsApp y llamada directa'],
  ['navigation', 'Mapa y «Cómo llegar»'],
  ['clock', 'Horario con «Abierto ahora»'],
  ['camera', 'Hasta 4 fotos'],
  ['trending-up', 'Estadísticas básicas'],
];
const premium = [
  ['ticket', 'Cupones con código QR'],
  ['star', 'Destacado y primero en búsquedas'],
  ['megaphone', 'Anuncio en el banner principal (por turnos)'],
  ['heart', 'Novedades a quienes te siguen'],
  ['globe', 'Redes sociales, sitio web y hasta 10 fotos'],
  ['trending-up', 'Estadísticas completas'],
];
const pasos = [
  ['Entra a <b>fusa-conecta.web.app</b>', 'o escanea el QR. En iPhone, ábrela en Safari: no está en la App Store.'],
  ['Crea tu cuenta', 'con Google o con tu correo.'],
  ['Toca <b>«Registrar mi negocio»</b>', 'nombre, categoría, ubicación en el mapa, WhatsApp, horario y fotos.'],
  ['Lo revisamos y lo publicamos', 'y ya apareces para vecinos y turistas.'],
];

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--p50:#F1EEFF;--p100:#E2DCFF;--p500:#6B4EFF;--p700:#4F35D8;--mint:#2DD4A7;--mint7:#047857;--sun:#FFC531;--sun50:#FFF6D6;--ink:#1B1F3B;--ink2:#5B6178;--line:#E7E8F0}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:2400px;font-family:Poppins,sans-serif;color:var(--ink);background:#fff;overflow:hidden}
.cab{position:relative;height:710px;padding:64px 72px 0;color:#fff;background:linear-gradient(160deg,#7B60FF 0%,#5B3DF5 45%,#3F28B8 100%);overflow:hidden}
.cab:after{content:"";position:absolute;right:-160px;top:-120px;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(45,212,167,.35),rgba(45,212,167,0) 65%)}
.marca{display:flex;align-items:center;gap:22px;position:relative;z-index:1}
.marca b{font-size:54px;font-weight:700;letter-spacing:-.02em;line-height:1}.marca b span{font-weight:400;color:#5EEAD4}
.marca small{display:block;font-size:24px;font-weight:500;opacity:.9;margin-top:8px}
h1{position:relative;z-index:1;font-size:82px;line-height:1.04;font-weight:800;letter-spacing:-.03em;margin-top:58px}
h1 em{font-style:normal;color:#5EEAD4}
.sub{position:relative;z-index:1;font-size:31px;line-height:1.4;margin-top:26px;max-width:880px;opacity:.95}
.cuerpo{padding:0 64px}
.que{margin-top:-74px;position:relative;z-index:2;background:#fff;border-radius:36px;box-shadow:0 18px 50px rgba(27,31,59,.14);padding:34px 36px 30px}
.que h2,.sec h2{font-size:30px;font-weight:700;letter-spacing:-.01em}
.que .rej{display:grid;grid-template-columns:repeat(3,1fr);gap:16px 18px;margin-top:22px}
.que .it{display:flex;align-items:center;gap:14px;font-size:23px;font-weight:600;line-height:1.2}
.que .it i{flex:none;width:62px;height:62px;border-radius:18px;display:grid;place-items:center;background:var(--p50);color:var(--p700)}
.que p{margin-top:22px;font-size:22px;color:var(--ink2);text-align:center}.que p b{color:var(--p700)}
.planes{display:grid;grid-template-columns:1fr 1.18fr;gap:24px;margin-top:30px}
.plan{border-radius:32px;padding:30px 30px 26px}
.plan.g{background:#F4F4F8;border:2px solid var(--line)}
.plan.p{background:linear-gradient(170deg,#FFF6D6,#FFE9A8);border:2px solid #FFC531}
.plan h3{font-size:34px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:12px}
.plan .et{display:inline-block;font-size:19px;font-weight:700;border-radius:999px;padding:6px 16px;margin-top:10px}
.g .et{background:#E8FBF4;color:var(--mint7)}.p .et{background:#1B1F3B;color:#FFC531}
.plan ul{list-style:none;margin-top:20px;display:grid;gap:14px}
.plan li{display:flex;gap:12px;align-items:flex-start;font-size:22.5px;line-height:1.3;font-weight:500}
.plan li i{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;margin-top:-3px}
.g li i{background:#fff;color:var(--mint7)}.p li i{background:rgba(255,255,255,.75);color:#8A5A00}
.sec{margin-top:30px}
.pasos{display:grid;gap:16px;margin-top:20px}
.paso{display:flex;gap:22px;align-items:center;background:var(--p50);border-radius:26px;padding:14px 26px}
.paso .n{flex:none;width:60px;height:60px;border-radius:50%;background:var(--p500);color:#fff;font-size:30px;font-weight:800;display:grid;place-items:center}
.paso b{font-weight:700}.paso div{font-size:25px;line-height:1.3}.paso small{display:block;font-size:21px;color:var(--ink2);margin-top:2px}
.reclama{margin-top:16px;font-size:21px;color:var(--ink2);display:flex;gap:10px;align-items:center}.reclama b{color:var(--ink)}
.pie{position:absolute;left:0;right:0;bottom:0;height:300px;background:#1B1F3B;color:#fff;display:flex;align-items:center;gap:40px;padding:0 64px}
.pie img{width:220px;height:220px;border-radius:24px;background:#fff;padding:12px}
.pie .url{font-size:44px;font-weight:700;letter-spacing:-.02em;color:#5EEAD4}
.pie p{font-size:23px;line-height:1.45;margin-top:10px;opacity:.92}
.pie .lema{font-size:22px;font-weight:600;margin-top:16px;color:#FFC531;display:flex;align-items:center;gap:10px}
</style></head><body>
<header class="cab">
  <div class="marca">${iso(['#FFFFFF', '#5EEAD4', '#2DD4A7', '#99F6E4'], 104)}<div><b>Fusa <span>Conecta</span></b><small>Todo Fusa, en tu bolsillo</small></div></div>
  <h1>Tu negocio,<br>a un toque de <em>tus clientes</em></h1>
  <p class="sub">La app gratuita de <b>Fusagasugá y Pasca</b> para encontrar comercios, servicios, planes y eventos cerca.</p>
</header>
<main class="cuerpo">
  <section class="que"><h2>Qué encuentra la gente en la app</h2>
    <div class="rej">${que.map(([i, t]) => `<div class="it"><i>${ic(i, 32)}</i>${t}</div>`).join('')}</div>
    <p>Ya hay <b>más de 540 lugares</b> en el directorio. <b>Súmate con el tuyo.</b></p></section>
  <section class="planes">
    <div class="plan g"><h3>Gratis</h3><span class="et">Para siempre</span>
      <ul>${gratis.map(([i, t]) => `<li><i>${ic(i, 24)}</i>${t}</li>`).join('')}</ul></div>
    <div class="plan p"><h3>${ic('star', 34)}Premium</h3><span class="et">Gratis en la fase de pruebas</span>
      <ul>${premium.map(([i, t]) => `<li><i>${ic(i, 24)}</i>${t}</li>`).join('')}</ul></div>
  </section>
  <section class="sec"><h2>Inscribe tu negocio en 4 pasos</h2>
    <div class="pasos">${pasos.map(([t, s], k) => `<div class="paso"><span class="n">${k + 1}</span><div>${t}<small>${s}</small></div></div>`).join('')}</div>
    <p class="reclama">${ic('badge-check', 28)}<span>¿Tu negocio ya aparece? Ábrelo en la app y toca <b>«¿Es tu negocio? Reclámalo»</b>.</span></p>
  </section>
</main>
<footer class="pie"><img src="data:image/png;base64,${qr}" alt="Código QR de fusa-conecta.web.app">
  <div><div class="url">fusa-conecta.web.app</div>
  <p>No se descarga de ninguna tienda: funciona en el navegador de cualquier celular, Android o iPhone, y puedes dejar su ícono en tu pantalla de inicio.</p>
  <div class="lema">${ic('map-pin', 26)}Hecha en Fusagasugá, para Fusagasugá y Pasca</div></div></footer>
</body></html>`;

writeFileSync(join(SALIDA, 'flyer-comercios.html'), html);
const nav = await chromium.launch({ channel: 'chrome' });
const p = await nav.newPage({ viewport: { width: 1080, height: 2400 }, deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
const desborde = await p.evaluate(() => {
  const m = document.querySelector('main').getBoundingClientRect(),
    f = document.querySelector('footer').getBoundingClientRect();
  return { finMain: Math.round(m.bottom), inicioPie: Math.round(f.top) };
});
console.log('espacio', desborde);
await p.screenshot({ path: join(SALIDA, 'flyer-comercios.png') });
await p.pdf({ path: join(SALIDA, 'flyer-comercios.pdf'), width: '1080px', height: '2400px', printBackground: true });
await nav.close();
console.log('listo');
