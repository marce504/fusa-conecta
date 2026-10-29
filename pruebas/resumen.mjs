// Junta los resultados de todas las pruebas (JUnit XML de pytest, Vitest y Playwright, y los informes de Lighthouse)
// y genera informe-pruebas/index.html (artefacto de GitHub Actions) y la tabla de docs/pruebas.md.
//   node pruebas/resumen.mjs            → solo el HTML
//   node pruebas/resumen.mjs --docs     → además reescribe la tabla de resultados en docs/pruebas.md
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'informe-pruebas';
const SUITES = [
  ['js-unitarias.xml', 'Unitarias JavaScript (Vitest)'],
  ['api.xml', 'Unitarias y de API Python (pytest)'],
  ['automatizacion.xml', 'Procesos automáticos Python (pytest)'],
  ['api-integracion.xml', 'Integración: API contra el emulador'],
  ['automatizacion-integracion.xml', 'Integración: procesos contra el emulador'],
  ['e2e.xml', 'Extremo a extremo (Playwright, 390×844)'],
];
const ahora = new Date();
const fecha = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
}).format(ahora);
const html = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const atributo = (texto, nombre) => (texto.match(new RegExp(`${nombre}="([^"]*)"`)) || [])[1] || '';
const desescapar = s =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function casos(xml) {
  const lista = [];
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const [, attrs, , cuerpo = ''] = m;
    const estado = /<(failure|error)\b/.test(cuerpo) ? 'falla' : /<skipped\b/.test(cuerpo) ? 'omitida' : 'pasa';
    lista.push({
      nombre: desescapar(atributo(attrs, 'name')),
      grupo: desescapar(atributo(attrs, 'classname')),
      segundos: Number(atributo(attrs, 'time')) || 0,
      estado,
    });
  }
  return lista;
}

const suites = SUITES.filter(([f]) => existsSync(join(DIR, f))).map(([archivo, titulo]) => {
  const lista = casos(readFileSync(join(DIR, archivo), 'utf8'));
  const cuenta = e => lista.filter(c => c.estado === e).length;
  return { archivo, titulo, lista, pasan: cuenta('pasa'), fallan: cuenta('falla'), omitidas: cuenta('omitida') };
});

// Lighthouse: mediana de las corridas de la página principal
let lighthouse = null;
const dirLh = join(DIR, 'lighthouse');
if (existsSync(join(dirLh, 'manifest.json'))) {
  const manifiesto = JSON.parse(readFileSync(join(dirLh, 'manifest.json'), 'utf8'));
  const rep = manifiesto.find(r => r.isRepresentativeRun) || manifiesto[0];
  if (rep) {
    lighthouse = {
      resumen: rep.summary,
      html: (readdirSync(dirLh).find(f => f.endsWith('.html')) || '').toString(),
    };
  }
}

const total = suites.reduce((a, s) => ({ p: a.p + s.pasan, f: a.f + s.fallan, o: a.o + s.omitidas }), {
  p: 0,
  f: 0,
  o: 0,
});
const pct = v => Math.round(v * 100);
const filaLh = lighthouse
  ? Object.entries({
      performance: 'Rendimiento',
      accessibility: 'Accesibilidad',
      'best-practices': 'Buenas prácticas',
      seo: 'SEO',
      pwa: 'PWA',
    })
      .map(([k, t]) => [t, lighthouse.resumen[k]])
      .filter(([, v]) => v != null)
  : [];

const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pruebas de Fusa Conecta</title><style>
:root{--bg:#fff;--ink:#14162b;--ink2:#565b73;--line:#e7e8f0;--ok:#047857;--okbg:#ecfdf5;--mal:#b91c1c;--malbg:#fef2f2;--om:#8a5a00;--ombg:#fff6d6;--pri:#5b3df5}
@media (prefers-color-scheme:dark){:root{--bg:#121420;--ink:#eceef8;--ink2:#a9adc4;--line:#2b2f47;--ok:#6ee7a0;--okbg:#13291c;--mal:#fca5a5;--malbg:#3b1422;--om:#f2c14e;--ombg:#2a2311;--pri:#a99bff}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:24px 16px}
h1{font-size:26px;margin:0 0 4px}p.sub{color:var(--ink2);margin:0 0 20px}.cifras{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
.cifra{flex:1 1 140px;border:1px solid var(--line);border-radius:12px;padding:12px 16px}.cifra b{display:block;font-size:28px}
details{border:1px solid var(--line);border-radius:12px;margin:12px 0;padding:0 16px}summary{cursor:pointer;padding:12px 0;font-weight:600;min-height:44px}
table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:14px}td,th{border-top:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.e{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:700}.pasa{background:var(--okbg);color:var(--ok)}.falla{background:var(--malbg);color:var(--mal)}.omitida{background:var(--ombg);color:var(--om)}
a{color:var(--pri)}</style></head><body><main>
<h1>Pruebas de Fusa Conecta</h1><p class="sub">${html(fecha)} · ${html(process.env.GITHUB_SHA ? 'commit ' + process.env.GITHUB_SHA.slice(0, 7) : 'corrida local')}</p>
<div class="cifras"><div class="cifra"><b>${total.p}</b>pasan</div><div class="cifra"><b>${total.f}</b>fallan</div><div class="cifra"><b>${total.o}</b>omitidas</div>
${filaLh.map(([t, v]) => `<div class="cifra"><b>${pct(v)}</b>Lighthouse · ${t}</div>`).join('')}</div>
${suites
  .map(
    s => `<details${s.fallan ? ' open' : ''}><summary>${html(s.titulo)} · ${s.pasan} pasan${s.fallan ? ` · ${s.fallan} fallan` : ''}${s.omitidas ? ` · ${s.omitidas} omitidas` : ''}</summary>
<table><tr><th>Caso</th><th>Grupo</th><th>Resultado</th><th>s</th></tr>${s.lista
      .map(
        c =>
          `<tr><td>${html(c.nombre)}</td><td>${html(c.grupo)}</td><td><span class="e ${c.estado}">${c.estado}</span></td><td>${c.segundos.toFixed(2)}</td></tr>`,
      )
      .join('')}</table></details>`,
  )
  .join('')}
<p>Informes detallados: ${[
  'js-unitarias/index.html',
  'python.html',
  'cobertura/index.html',
  'e2e/index.html',
  lighthouse && lighthouse.html ? `lighthouse/${lighthouse.html}` : '',
]
  .filter(f => f && existsSync(join(DIR, f)))
  .map(f => `<a href="${f}">${f}</a>`)
  .join(' · ')}</p></main></body></html>`;
writeFileSync(join(DIR, 'index.html'), pagina);
console.log(`Informe: ${total.p} pasan · ${total.f} fallan · ${total.o} omitidas → ${DIR}/index.html`);

if (process.argv.includes('--docs')) {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);
  const marca = /<!-- resultados:inicio -->[\s\S]*<!-- resultados:fin -->/;
  const filas = suites.flatMap(s =>
    s.lista.map(
      c =>
        `| ${s.titulo} | ${c.nombre.replace(/\|/g, '\\|')} | ${{ pasa: 'Pasa', falla: '**Falla**', omitida: 'Omitida' }[c.estado]} | ${dia} |`,
    ),
  );
  const resumen = suites.map(s => `| ${s.titulo} | ${s.lista.length} | ${s.pasan} | ${s.fallan} | ${s.omitidas} |`);
  const tablaLh = filaLh.length
    ? `\n\n**Lighthouse** (mediana de 3 corridas, móvil): ${filaLh.map(([t, v]) => `${t} ${pct(v)}`).join(' · ')}`
    : '';
  const bloque = `<!-- resultados:inicio -->
Última corrida: ${dia}. Total: **${total.p} pasan, ${total.f} fallan, ${total.o} omitidas**.${tablaLh}

Las omitidas son las pruebas de integración dentro de las suites unitarias de Python: necesitan el emulador y corren
(y pasan) en su propia suite, «Integración».

| Suite | Casos | Pasan | Fallan | Omitidas |
|---|---|---|---|---|
${resumen.join('\n')}

| Suite | Caso | Resultado | Fecha |
|---|---|---|---|
${filas.join('\n')}
<!-- resultados:fin -->`;
  const archivo = 'docs/pruebas.md';
  const actual = readFileSync(archivo, 'utf8');
  writeFileSync(archivo, actual.replace(marca, bloque));
  console.log(`Tabla actualizada en ${archivo}`);
}
