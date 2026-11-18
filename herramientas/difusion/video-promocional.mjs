// Video promocional de Fusa Conecta (vertical 1080 × 1920, 30 cuadros por segundo), con voz, música y subtítulos.
// Cada escena es HTML animado por tiempo: Playwright toma un cuadro por paso y ffmpeg arma el MP4.
// La duración de cada escena sale de su locución (video-guion.json): max(mínimo, voz + 0,8 s).
//
// Uso: node herramientas/difusion/video-promocional.mjs <app2> <capturas> <música.wav> <carpeta de voz> <salida.mp4> <ffmpeg>
//   <carpeta de voz>: un WAV o MP3 por escena, en orden (00-pregunta.wav, 01-marca.wav…). Ver docs/difusion/video-guion.md.
//   MUESTRAS=3,12,25 antes del comando guarda solo esos segundos como JPG para revisar.
/* global document, window */
import { readFileSync, mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const [APP, CAPTURAS, MUSICA, VOZ, SALIDA, FFMPEG] = process.argv.slice(2);
const require = createRequire(join(APP, 'package.json'));
const { chromium } = require('@playwright/test');

const FPS = 30;
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/i, m => m.replace('ffmpeg', 'ffprobe'));
const GUION = JSON.parse(readFileSync(join(APP, 'herramientas', 'difusion', 'video-guion.json'), 'utf8'));
const voces = readdirSync(VOZ)
  .filter(f => /\.(wav|mp3)$/i.test(f))
  .sort();
if (voces.length !== GUION.length) throw new Error(`Hay ${voces.length} audios de voz y ${GUION.length} escenas`);
const durVoz = voces.map(
  f =>
    +execFileSync(FFPROBE, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      join(VOZ, f),
    ]).toString(),
);
// Tiempos de cada escena
let t0 = 0;
const T = GUION.map((g, i) => {
  const d = Math.max(g.min, durVoz[i] + 0.8);
  const r = { id: g.id, a: t0, b: t0 + d, voz: g.voz };
  t0 += d;
  return r;
});
const DURACION = Math.ceil(t0 * 10) / 10;

// Recursos: íconos, logo, capturas, fotos con licencia libre y nombres reales del directorio
const ICONOS = new Function(readFileSync(join(APP, 'icons.js'), 'utf8') + ';return ICONOS;')();
const appjs = readFileSync(join(APP, 'app.js'), 'utf8');
const hojas = new Function(appjs.match(/const LOGO_HOJAS=\[[\s\S]*?\];/)[0] + 'return LOGO_HOJAS;')();
const ic = (n, s = 36) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[n]}</svg>`;
const COLORES_HOJA = ['#FFFFFF', '#5EEAD4', '#2DD4A7', '#99F6E4'];
const iso = (alto, clase = '') =>
  `<svg class="${clase}" height="${alto}" viewBox="102.46 0 194.02 275.6" style="overflow:visible">${hojas.map((d, i) => `<path class="hoja h${i}" fill="${COLORES_HOJA[i]}" d="${d}"/>`).join('')}</svg>`;
const b64 = (ruta, tipo) => `data:${tipo};base64,` + readFileSync(ruta).toString('base64');
const cap = n => b64(join(CAPTURAS, n + '.png'), 'image/png');
const qr = readFileSync(join(APP, 'docs', 'difusion', 'qr.txt'), 'utf8').trim();
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(APP, 'datos.js'), 'utf8') + ';this.B=COMERCIOS_BASE', ctx);
const BASE = ctx.B;
// La cascada es foto propia del equipo; las demás salen del directorio con su licencia de Commons.
const FOTOS = [
  {
    nombre: 'Cascada San Gabriel',
    src: b64(join(APP, 'img/turismo/san-rafael/1-cascada-san-gabriel.jpg'), 'image/jpeg'),
    cred: 'Foto: equipo Fusa Conecta',
  },
  ...['Sendero Cara del Indio', 'Páramo de Sumapaz (desde Pasca)', 'Biblioteca Pública Quinta de Coburgo'].map(n => {
    const x = BASE.find(b => b.nombre === n);
    return {
      nombre: n.replace(' (desde Pasca)', '').replace('Sendero Cara del Indio', 'Cerro Quininí y Cara del Indio'),
      src: b64(join(APP, x.imagen), 'image/jpeg'),
      cred: `Foto: ${x.foto_credito.autor} · ${x.foto_credito.licencia} · Wikimedia Commons`,
    };
  }),
];
const COL = {
  comercio: '#C2410C',
  servicios: '#4338CA',
  campo: '#15803D',
  turismo: '#0369A1',
  hospedaje: '#A21CAF',
  bares: '#8A5A00',
  tramite: '#334155',
};
const DE_COMERCIO = ['comercio', 'servicios', 'campo', 'hospedaje', 'bares']; // los que venden algo (sin trámites ni turismo)
const FONDO = {
  comercio: '#FFEDD5',
  servicios: '#E0E7FF',
  campo: '#DCFCE7',
  turismo: '#E0F2FE',
  hospedaje: '#FAE8FF',
  bares: '#FEF3C7',
  tramite: '#E2E8F0',
};
// Nombres cortos y variados (nunca los de cadenas), repartidos entre categorías
const vistos = new Set();
const nombres = BASE.filter(
  b =>
    b.nombre.length <= 24 &&
    !/·|\(|^(D1|Ara|Éxito|Olímpica|Banco|Davivienda|Terpel|Primax|Claro|Movistar)/.test(b.nombre) &&
    DE_COMERCIO.includes(b.cat) &&
    b.sub !== 'educacion' &&
    !/Iglesia|Parroquia|Colegio|IE |Instituci|Universidad|Escuela|Hospital|Polic/.test(b.nombre),
).filter(b => !vistos.has(b.nombre) && vistos.add(b.nombre));
const porCat = DE_COMERCIO.map(k => nombres.filter(b => b.cat === k));
const mezcla = [];
for (let i = 0; mezcla.length < 60; i++) for (const l of porCat) if (l[i]) mezcla.push(l[i]);
const filas = [0, 1, 2].map(f => mezcla.filter((_, i) => i % 3 === f));
const CATS = [
  ['utensils', 'Comida', 'comercio'],
  ['shopping-bag', 'Tiendas', 'comercio'],
  ['car', 'Talleres', 'servicios'],
  ['bed-double', 'Hospedaje', 'hospedaje'],
  ['sprout', 'Campo', 'campo'],
  ['mountain', 'Turismo', 'turismo'],
  ['wine', 'Bares', 'bares'],
  ['stethoscope', 'Salud', 'servicios'],
];

// Escenas con celular: [id, fondo, etiqueta, título, captura, chips]
const CEL = {
  busca: [
    '#F1EEFF',
    'Busca',
    'Encuéntralo <em>en segundos</em>',
    '02-busqueda',
    [['search', 'Hoteles, comida, talleres…', 'i']],
  ],
  contacta: [
    '#E8FBF4',
    'Contacta',
    'Llama, escribe o llega <em>con un toque</em>',
    '03-ficha-restaurante',
    [
      ['clock', 'Abierto ahora', 'd'],
      ['phone', 'WhatsApp y llamada', 'i'],
    ],
  ],
  ia: ['#EEF2FF', 'Con IA', 'Pregúntale <em>a Fusa</em>', '06-asistente', [['star', 'Lo abierto y cercano', 'd']]],
  agenda: [
    '#FFF1F2',
    'Agenda',
    'Los planes de Fusa <em>al día</em>',
    '05-agenda',
    [['calendar-days', 'Con fuentes oficiales', 'i']],
  ],
  radio: [
    '#F1EEFF',
    'Radio en vivo',
    'Vive Fusagasugá <em>88.1 FM</em>',
    '10-radio',
    [['play', 'Emisora de la Alcaldía', 'd']],
  ],
  sos: [
    '#FEF2F2',
    'SOS',
    'Emergencias, <em>incluso sin señal</em>',
    '07-sos',
    [['siren', '123 · 132 · 125 · 119', 'i']],
  ],
  negocios: [
    '#FFF6D6',
    'Para negocios',
    '¿Tienes un negocio? <em>Súmalo gratis</em>',
    '08-planes',
    [
      ['badge-check', 'Reclámalo o regístralo', 'i'],
      ['star', 'Premium gratis hasta el 30 de abril', 'd'],
    ],
  ],
};

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1920px;overflow:hidden;font-family:Poppins,sans-serif;color:#1B1F3B;background:#1B1F3B}
.esc{position:absolute;inset:0;opacity:0;overflow:hidden}
.lila{background:radial-gradient(circle at 80% 14%,rgba(45,212,167,.35),rgba(45,212,167,0) 42%),linear-gradient(160deg,#7B60FF,#5B3DF5 48%,#3F28B8)}
.oscuro{background:radial-gradient(circle at 20% 85%,rgba(107,78,255,.45),rgba(107,78,255,0) 50%),#1B1F3B;color:#fff}
.centro{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.cab{position:absolute;left:80px;right:80px;top:110px}
.et{display:inline-flex;align-items:center;gap:10px;font-size:30px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4F35D8;background:#fff;border-radius:999px;padding:10px 26px;box-shadow:0 6px 20px rgba(27,31,59,.08)}
h2{font-size:80px;line-height:1.05;font-weight:800;letter-spacing:-.03em;margin-top:24px}
h2 em{font-style:normal;color:#6B4EFF}
.cel{position:absolute;left:50%;top:470px;width:545px;height:1180px;margin-left:-272px;border-radius:74px;background:#0E1024;padding:15px;box-shadow:0 40px 90px rgba(27,31,59,.35)}
.cel img{width:100%;height:100%;border-radius:60px;object-fit:cover;object-position:top;display:block}
.chip{position:absolute;display:flex;align-items:center;gap:14px;background:#fff;border-radius:26px;padding:18px 26px;font-size:31px;font-weight:700;box-shadow:0 18px 44px rgba(27,31,59,.2);white-space:nowrap}
.chip i{display:grid;place-items:center;width:54px;height:54px;border-radius:16px;background:#F1EEFF;color:#4F35D8}
.chip.i{left:36px}.chip.d{right:36px}
.preg{position:absolute;font-size:46px;font-weight:700;background:#fff;color:#1B1F3B;border-radius:34px;padding:26px 38px;box-shadow:0 20px 50px rgba(0,0,0,.25)}
.hoja{transform-box:fill-box;transform-origin:50% 100%}
.nom{font-size:128px;font-weight:700;letter-spacing:-.03em;line-height:1;color:#fff;margin-top:40px}.nom span{display:inline-block}.nom .c{font-weight:400;color:#5EEAD4}
.lema{font-size:46px;font-weight:500;color:#fff;margin-top:18px}
.muns{display:flex;gap:18px;margin-top:40px}.muns b{font-size:34px;font-weight:700;color:#1B1F3B;background:#5EEAD4;border-radius:999px;padding:12px 30px}
.anillo{position:absolute;left:50%;top:34%;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;border:6px solid rgba(94,234,212,.7)}
.rej{position:absolute;left:70px;right:70px;top:500px;display:grid;grid-template-columns:repeat(4,1fr);gap:26px}
.cat{border-radius:34px;padding:30px 10px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;font-size:30px;font-weight:700;box-shadow:0 16px 40px rgba(27,31,59,.18)}
.cat i{display:grid;place-items:center;width:96px;height:96px;border-radius:28px;background:rgba(255,255,255,.75)}
.fila{position:absolute;left:0;white-space:nowrap;display:flex;gap:18px}
.fila b{font-size:32px;font-weight:600;border-radius:999px;padding:14px 28px;background:#fff;display:inline-flex;align-items:center;gap:10px}
.fila b i{width:14px;height:14px;border-radius:50%}
.contador{position:absolute;left:0;right:0;top:1360px;text-align:center;color:#fff;font-size:44px;font-weight:600}
.contador b{font-size:110px;font-weight:800;color:#5EEAD4;display:block;line-height:1}
.foto{position:absolute;left:70px;right:70px;top:470px;height:1180px;border-radius:56px;overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,.35)}
.foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.foto .tag{position:absolute;left:36px;bottom:80px;font-size:44px;font-weight:800;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.6)}
.foto .cred{position:absolute;left:36px;bottom:34px;font-size:20px;color:#fff;opacity:.9;text-shadow:0 2px 8px rgba(0,0,0,.7)}
.eq{position:absolute;right:90px;top:1180px;display:flex;gap:12px;align-items:flex-end;height:130px;padding:18px 22px;background:#fff;border-radius:28px;box-shadow:0 18px 44px rgba(27,31,59,.2);box-sizing:content-box}
.eq i{width:22px;border-radius:11px;background:#6B4EFF}
.sena h2{color:#fff;font-size:76px;margin:0 70px}.sena h2 em{color:#5EEAD4}
.sena .sub{font-size:38px;font-weight:500;margin:26px 80px 0;opacity:.92}
.metas{display:flex;flex-direction:column;gap:22px;margin-top:60px;align-items:center}
.metas b{display:inline-flex;align-items:center;gap:16px;font-size:36px;font-weight:700;background:rgba(255,255,255,.1);border:2px solid rgba(94,234,212,.5);border-radius:28px;padding:20px 34px;color:#fff}
.metas b i{color:#5EEAD4}
.url{font-size:72px;font-weight:800;letter-spacing:-.02em;color:#5EEAD4}
.qr{width:320px;height:320px;border-radius:36px;background:#fff;padding:18px;margin:36px 0}
.pie{font-size:36px;line-height:1.45;color:#fff;opacity:.92;max-width:860px}
.camp{margin-top:40px;font-size:33px;font-weight:700;color:#1B1F3B;background:#FFC531;border-radius:28px;padding:22px 34px;max-width:900px;line-height:1.3}
.nota{position:absolute;left:0;right:0;top:1665px;text-align:center;font-size:22px;color:#5B6178}
#sub{position:absolute;left:60px;right:60px;bottom:52px;display:flex;justify-content:center}
#sub p{background:rgba(14,16,36,.86);color:#fff;font-size:34px;font-weight:600;line-height:1.35;border-radius:24px;padding:14px 26px;text-align:center;max-width:960px}
</style></head><body>
<section class="esc oscuro centro" id="pregunta">
  <h2 style="color:#fff;font-size:92px;margin:-300px 80px 0">¿Buscas algo<br>en <em style="color:#5EEAD4">Fusa</em>?</h2>
  ${[
    ['¿Dónde almuerzo?', 200, 1040],
    ['¿Está abierto?', 560, 1220],
    ['¿Qué hay este finde?', 130, 1400],
    ['¿Dónde consigo…?', 520, 1580],
  ]
    .map(([t, x, y], k) => `<div class="preg" data-k="${k}" style="left:${x}px;top:${y}px">${t}</div>`)
    .join('')}
</section>
<section class="esc lila centro" id="marca"><div class="anillo"></div>${iso(360, 'iso')}
  <div class="nom">${'Fusa'
    .split('')
    .map(l => `<span>${l}</span>`)
    .join('')} ${'Conecta'
    .split('')
    .map(l => `<span class="c">${l}</span>`)
    .join('')}</div>
  <div class="lema">Todo Fusa, en tu bolsillo</div><div class="muns"><b>Fusagasugá</b><b>Pasca</b></div></section>
<section class="esc lila" id="comercios">
  <div class="cab"><span class="et">Para todos</span><h2 style="color:#fff">Todo el que vende algo, <em style="color:#5EEAD4">aquí</em></h2></div>
  <div class="rej">${CATS.map(([i, t, k], j) => `<div class="cat" data-j="${j}" style="background:${FONDO[k]};color:${COL[k]}"><i>${ic(i, 54)}</i>${t}</div>`).join('')}</div>
  ${filas.map((l, f) => `<div class="fila" data-f="${f}" style="top:${1010 + f * 100}px">${[...l, ...l].map(b => `<b style="color:${COL[b.cat]}"><i style="background:${COL[b.cat]}"></i>${b.nombre}</b>`).join('')}</div>`).join('')}
  <div class="contador"><b id="cuenta">0</b>lugares de Fusagasugá y Pasca</div></section>
${Object.entries(CEL)
  .map(
    ([id, [fondo, et, tit, c, chips]]) => `<section class="esc" id="${id}" style="background:${fondo}">
  <div class="cab"><span class="et">${et}</span><h2>${tit}</h2></div>
  <div class="cel"><img src="${cap(c)}"></div>
  ${id === 'radio' ? `<div class="eq">${[0, 1, 2, 3, 4].map(k => `<i data-k="${k}"></i>`).join('')}</div>` : ''}
  ${chips.map(([i, t, lado], j) => `<div class="chip ${lado}" data-j="${j}" style="top:${1040 + j * 220}px"><i>${ic(i, 30)}</i>${t}</div>`).join('')}
  ${id === 'agenda' ? '<p class="nota">Agenda de ejemplo: FICFUSA, noviembre de 2026</p>' : ''}</section>`,
  )
  .join('')}
<section class="esc oscuro" id="turismo">
  <div class="cab"><span class="et">Turismo</span><h2 style="color:#fff">Lo que no sabías <em style="color:#5EEAD4">que estaba aquí</em></h2></div>
  ${FOTOS.map((x, k) => `<div class="foto" data-k="${k}"><img src="${x.src}"><div class="tag">${x.nombre}</div><div class="cred">${x.cred}</div></div>`).join('')}
</section>
<section class="esc oscuro centro sena" id="sena">${iso(150, 'iso-s')}
  <h2 style="margin-top:44px">Hecho en Fusa por <em>estudiantes del SENA</em></h2>
  <p class="sub">Análisis y Desarrollo de Software · un proyecto con sentido social</p>
  <div class="metas"><b data-k="0"><i>${ic('store', 36)}</i>Que todo comercio y emprendimiento se vea</b>
    <b data-k="1"><i>${ic('mountain', 36)}</i>Que el turismo crezca</b><b data-k="2"><i>${ic('heart', 36)}</i>Que todo Fusa y Pasca se conecte</b></div></section>
<section class="esc oscuro centro" id="cierre">${iso(170, 'iso-c')}<div class="url" style="margin-top:34px">fusa-conecta.web.app</div>
  <img class="qr" src="data:image/png;base64,${qr}">
  <p class="pie">Gratis. Ábrela en el navegador de tu celular, <b>Android o iPhone</b>: no se descarga de ninguna tienda.</p>
  <div class="camp">Negocios: únanse antes del 31 de enero y tienen Premium gratis hasta el 30 de abril de 2027</div></section>
<div id="sub"><p></p></div>
<script>
const T=${JSON.stringify(T)},TOTAL=${DURACION};
const ease=x=>1-Math.pow(1-Math.min(1,Math.max(0,x)),3);
const resorte=x=>{x=Math.min(1,Math.max(0,x));return x===1?1:1-Math.pow(2,-9*x)*Math.cos(x*9.5);};
const lin=x=>Math.min(1,Math.max(0,x));
const vis=(t,a,b)=>Math.min(lin((t-a)/.4),lin((b-t)/.4));
const $=s=>document.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
window.cuadro=function(t){
  let sub='';
  for(const e of T){
    const s=document.getElementById(e.id),l=t-e.a,d=e.b-e.a,final=e.id==='cierre';
    s.style.opacity=vis(t,e.a-.2,final?TOTAL+1:e.b+.2);
    if(t>=e.a&&t<e.b)sub=e.voz;
    if(s.style.opacity==='0')continue;
    if(e.id==='pregunta')$$('.preg',s).forEach(p=>{const k=+p.dataset.k,x=resorte((l-.4-k*.7)/.8);p.style.opacity=lin((l-.4-k*.7)/.2);p.style.transform='scale('+(.3+.7*x)+') rotate('+(k%2?3:-3)+'deg)';});
    if(e.id==='marca'||e.id==='sena'||e.id==='cierre'){
      $$('.hoja',s).forEach((h,k)=>{const x=resorte((l-.15-k*.28)/.9);h.style.transform='scale('+x+') rotate('+((1-x)*(k%2?14:-14))+'deg)';h.style.opacity=lin((l-.15-k*.28)/.15);});
      if(e.id==='marca'){
        $$('.nom span',s).forEach((sp,k)=>{const x=ease((l-1.2-k*.05)/.5);sp.style.opacity=x;sp.style.transform='translateY('+(50*(1-x))+'px)';});
        const lm=ease((l-1.9)/.6);$('.lema',s).style.opacity=lm;$('.muns',s).style.opacity=ease((l-2.4)/.6);
        const a=lin((l-1.2)/1.4);$('.anillo',s).style.opacity=(1-a)*.9;$('.anillo',s).style.transform='scale('+(.6+.9*a)+')';
      }
    }
    if(e.id==='comercios'){
      $$('.cat',s).forEach(c=>{const j=+c.dataset.j,x=resorte((l-.3-j*.12)/.7);c.style.transform='scale('+x+')';c.style.opacity=lin((l-.3-j*.12)/.2);});
      $$('.fila',s).forEach(f=>{const k=+f.dataset.f,w=f.scrollWidth/2,v=(k%2?-1:1)*110;f.style.transform='translateX('+(-((l*v+k*300)%w+w)%w)+'px)';f.style.opacity=ease((l-1.2-k*.2)/.5);});
      $('#cuenta').textContent=Math.round(540*ease((l-1)/3))+'+';
    }
    if(s.querySelector('.cel')){
      const c=ease(l/.9);s.querySelector('.cel').style.transform='translateY('+(160*(1-c))+'px) scale('+(1+.03*lin(l/d))+')';
      const cab=s.querySelector('.cab');cab.style.transform='translateY('+(-40*(1-ease(l/.7)))+'px)';cab.style.opacity=ease(l/.7);
      $$('.chip',s).forEach(ch=>{const j=+ch.dataset.j,x=resorte((l-.9-j*1)/.8);ch.style.opacity=lin((l-.9-j)/.25);ch.style.transform='translateX('+((ch.classList.contains('d')?1:-1)*90*(1-x))+'px)';});
      $$('.eq i',s).forEach(b=>{const k=+b.dataset.k;b.style.height=(30+90*Math.abs(Math.sin(l*(5+k*1.7)+k)))+'px';});
    }
    if(e.id==='turismo'){
      const n=4,tr=d/n;$$('.foto',s).forEach(f=>{const k=+f.dataset.k,lk=l-k*tr;f.style.opacity=k===n-1?lin(lk/.4):Math.min(lin(lk/.4),lin((tr-lk)/.4)+(lk>tr?0:0));
        f.style.zIndex=k;f.querySelector('img').style.transform='scale('+(1.12-.1*lin(lk/(tr+.5)))+') translateX('+((k%2?-1:1)*20*lin(lk/tr))+'px)';});
      const cab=s.querySelector('.cab');cab.style.opacity=ease(l/.7);
    }
    if(e.id==='sena')$$('.metas b',s).forEach(b=>{const k=+b.dataset.k,x=resorte((l-1.6-k*.5)/.8);b.style.opacity=lin((l-1.6-k*.5)/.25);b.style.transform='translateY('+(40*(1-x))+'px)';});
    if(e.id==='cierre'){const q=ease((l-.6)/.8);['.url','.qr','.pie','.camp'].forEach((c,k)=>{const x=ease((l-.6-k*.25)/.7);s.querySelector(c).style.opacity=x;s.querySelector(c).style.transform='translateY('+(40*(1-x))+'px)';});}
  }
  const p=$('#sub p');p.textContent=sub;p.parentNode.style.opacity=sub?1:0;
};
</script></body></html>`;

const cuadros = SALIDA + '.cuadros';
rmSync(cuadros, { recursive: true, force: true });
mkdirSync(cuadros, { recursive: true });
const nav = await chromium.launch({ channel: 'chrome' });
const p = await nav.newPage({ viewport: { width: 1080, height: 1920 } });
await p.setContent(html, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
console.log('escenas', T.map(e => `${e.id} ${e.a.toFixed(1)}–${e.b.toFixed(1)}`).join(' · '), '· total', DURACION, 's');
if (process.env.MUESTRAS) {
  for (const t of process.env.MUESTRAS.split(',').map(Number)) {
    await p.evaluate(x => window.cuadro(x), t);
    await p.screenshot({
      path: join(cuadros, 'muestra-' + String(t * 10).padStart(4, '0') + '.jpg'),
      type: 'jpeg',
      quality: 80,
    });
  }
  await nav.close();
  console.log('muestras en', cuadros);
  process.exit(0);
}
const total = Math.round(FPS * DURACION);
for (let f = 0; f < total; f++) {
  await p.evaluate(t => window.cuadro(t), f / FPS);
  await p.screenshot({ path: join(cuadros, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  if (f % 300 === 0) console.log('cuadro', f, 'de', total);
}
await nav.close();
// Audio: cada frase entra 0,35 s después de que empieza su escena; la música baja mientras hay voz
const entradas = ['-i', MUSICA, ...voces.flatMap(f => ['-i', join(VOZ, f)])];
const filtros = voces.map(
  (_, i) =>
    `[${i + 2}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round((T[i].a + 0.35) * 1000)}|${Math.round((T[i].a + 0.35) * 1000)}[v${i}]`,
);
const grafo =
  `${filtros.join(';')};${voces.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voces.length}:normalize=0[voz];` +
  `[1:a]aloop=loop=1:size=2e9,atrim=0:${DURACION},volume=0.28,afade=t=in:d=1,afade=t=out:st=${DURACION - 3}:d=3[mus];` +
  `[voz]asplit[voz1][voz2];[mus][voz1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[musb];[musb][voz2]amix=inputs=2:normalize=0,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
writeFileSync(SALIDA + '.filtro.txt', grafo);
execFileSync(FFMPEG, [
  '-y',
  '-v',
  'error',
  '-framerate',
  String(FPS),
  '-i',
  join(cuadros, '%05d.jpg'),
  ...entradas,
  '-/filter_complex',
  SALIDA + '.filtro.txt',
  '-map',
  '0:v',
  '-map',
  '[a]',
  '-t',
  String(DURACION),
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '20',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  SALIDA,
]);
rmSync(cuadros, { recursive: true, force: true });
rmSync(SALIDA + '.filtro.txt', { force: true });
console.log('listo', SALIDA);
