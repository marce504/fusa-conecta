// Verificación de áreas táctiles (U6, RNF-03): recorre las pantallas principales en un celular de 360×800 y lista los
// elementos tocables de menos de 48×48 px y los que quedan a menos de 8 px de su vecino.
// El área cuenta el pseudo-elemento ::before/::after con position:absolute (así se agranda el área sin agrandar el ícono).
//
// Requisitos: el servidor local y el emulador de Firebase encendidos (ver docs/pruebas.md):
//   python -m http.server 5510
//   npx firebase-tools emulators:start --only firestore,auth --project fusa-conecta
// Uso:  node scripts/areas-tactiles.mjs [--letra=muy-grande] [--url=http://localhost:5510/?emulador]
// Sale con código 1 si encuentra elementos fuera de la norma.
import { chromium } from '@playwright/test';

const opcion = (nombre, valor) =>
  (process.argv.find(a => a.startsWith(`--${nombre}=`)) || `=${valor}`).split('=').slice(1).join('=');
const URL_APP = opcion('url', 'http://localhost:5510/?emulador');
const LETRA = opcion('letra', 'normal');
const MINIMO = 48;
const SEPARACION = 8;

const PANTALLAS = [
  ['Inicio', 'inicio()'],
  ['Búsqueda', "buscarTexto('drogueria')"],
  ['Agenda', 'irAgenda()'],
  ['SOS', "navegar({tipo:'sos'})"],
  ['Perfil', "navegar({tipo:'perfil'})"],
  ['Cupones', "navegar({tipo:'cupones'})"],
  ['Comunidad', "navegar({tipo:'comunidad'})"],
  ['Asistente', 'irAsistente()'],
  ['Ficha', "inicio();abrirDetalle('c354')"],
];

// Se ejecuta dentro de la página: devuelve los problemas de la pantalla visible (o de la hoja abierta)
function medirEnPagina({ minimo, separacion }) {
  const SEL =
    'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=radio],[role=switch]';
  const px = v => (typeof v === 'string' && v.endsWith('px') ? parseFloat(v) : null);
  const hoja = [...document.querySelectorAll('.overlay.abierto')].pop();
  const raiz = hoja || document.getElementById('shell');
  const posicionado = e => getComputedStyle(e).position !== 'static';
  const bloqueDe = e => {
    let x = e;
    while (x && x !== document.body && !posicionado(x)) x = x.parentElement;
    return (x || document.body).getBoundingClientRect();
  };
  const area = e => {
    // Un control dentro de una etiqueta se toca por toda la etiqueta
    const objetivo = e.matches('input') && e.closest('label') ? e.closest('label') : e;
    const r = objetivo.getBoundingClientRect();
    let [izq, arr, der, aba] = [r.left, r.top, r.right, r.bottom];
    ['::before', '::after'].forEach(p => {
      const c = getComputedStyle(objetivo, p);
      if (c.content === 'none' || c.position !== 'absolute') return;
      const b = posicionado(objetivo) ? r : bloqueDe(objetivo);
      const [t, l, d, a] = [px(c.top), px(c.left), px(c.right), px(c.bottom)];
      if (t !== null && a !== null) [arr, aba] = [Math.min(arr, b.top + t), Math.max(aba, b.bottom - a)];
      if (l !== null && d !== null) [izq, der] = [Math.min(izq, b.left + l), Math.max(der, b.right - d)];
    });
    return { izq, arr, der, aba };
  };
  const visibles = [...raiz.querySelectorAll(SEL)].filter(e => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    const enPantalla = r.bottom > 0 && r.top < window.innerHeight;
    return (
      r.width &&
      r.height &&
      enPantalla &&
      s.visibility !== 'hidden' &&
      !e.closest('.leaflet-container,.maplibregl-map,#splash')
    );
  });
  const nombre = e =>
    `${e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`} «${(e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 24)}»`;
  const problemas = [];
  const areas = visibles.map(e => ({ e, a: area(e), r: e.getBoundingClientRect() }));
  areas.forEach(({ e, a }) => {
    const ancho = Math.round(a.der - a.izq);
    const alto = Math.round(a.aba - a.arr);
    if (ancho < minimo || alto < minimo) problemas.push(`${nombre(e)}: ${ancho}×${alto} px`);
  });
  // Separación: entre los bordes visibles de dos controles del mismo grupo (mismo contenedor) en la misma fila o
  // columna. Dos controles que ya miden 48×48 o más pueden ir juntos (barra inferior, control segmentado).
  const grande = r => r.width >= minimo && r.height >= minimo;
  areas.forEach((x, i) =>
    areas.slice(i + 1).forEach(y => {
      if (x.e.parentElement !== y.e.parentElement || (grande(x.r) && grande(y.r))) return;
      const sepH = Math.max(y.r.left - x.r.right, x.r.left - y.r.right);
      const sepV = Math.max(y.r.top - x.r.bottom, x.r.top - y.r.bottom);
      const mismaFila = sepV < 0 && sepH >= 0 && sepH < separacion;
      const mismaColumna = sepH < 0 && sepV >= 0 && sepV < separacion;
      if (mismaFila || mismaColumna)
        problemas.push(`${nombre(x.e)} y ${nombre(y.e)}: ${Math.round(mismaFila ? sepH : sepV)} px de separación`);
    }),
  );
  return problemas;
}

async function main() {
  const navegador = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  const pagina = await navegador.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  await pagina.goto(URL_APP);
  await pagina.waitForFunction(() => typeof arranque !== 'undefined' && arranque.listo);
  await pagina.evaluate(letra => {
    window.ocultarSplash();
    document.querySelectorAll('.firebase-emulator-warning').forEach(e => e.remove());
    window.elegirLetra(letra, false);
  }, LETRA);
  let total = 0;
  for (const [titulo, ir] of PANTALLAS) {
    await pagina.evaluate(`document.querySelectorAll('.overlay.abierto').forEach(o=>cerrar(o.id));${ir}`);
    await pagina.waitForTimeout(600);
    const problemas = [...new Set(await pagina.evaluate(medirEnPagina, { minimo: MINIMO, separacion: SEPARACION }))];
    total += problemas.length;
    process.stdout.write(`\n${titulo}: ${problemas.length ? `${problemas.length} por revisar` : 'todo bien'}\n`);
    problemas.forEach(p => process.stdout.write(`  - ${p}\n`));
  }
  await navegador.close();
  process.stdout.write(
    `\nLetra ${LETRA}: ${total} elementos por revisar (mínimo ${MINIMO}×${MINIMO} px, ${SEPARACION} px entre vecinos).\n`,
  );
  process.exitCode = total ? 1 : 0;
}

main().catch(e => {
  process.stderr.write(`${e.stack}\n`);
  process.exitCode = 2;
});
