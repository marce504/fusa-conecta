// Agenda casi automática para "Qué hacer en Fusa" (v5 · Fase 4.2)
// Lee la API pública del sitio oficial de la Alcaldía, extrae eventos y los guarda en Firestore como
// PENDIENTES (origen "ia"). Siempre los aprueba una persona desde el panel de administración.
//
// Uso:
//   node extraer.mjs --simular            → no llama a la IA ni escribe: muestra lo que haría (sin claves)
//   node extraer.mjs                      → necesita GEMINI_API_KEY y FIREBASE_SA (JSON de la cuenta de servicio)
// Las claves NUNCA van en el código de la app: solo en los secretos del proceso programado (GitHub Actions).
const SIMULAR = process.argv.includes('--simular');
// Sitios oficiales (plataforma gov.co "Sitios Territoriales", misma API pública JSON)
const FUENTES = [
  { sitio: 'https://www.fusagasuga.gov.co', municipio: 'Fusagasugá' },
  { sitio: 'https://www.pasca-cundinamarca.gov.co', municipio: 'Pasca' }
];
const PALABRAS = ['evento', 'festival', 'concierto', 'feria', 'celebración', 'programación', 'cultura', 'deporte', 'caminata', 'mercado campesino'];
const CATEGORIAS = ['cultura', 'musica', 'deporte', 'gastronomia', 'feria', 'religioso', 'institucional', 'otro'];
const MODELO = process.env.MODELO_IA || 'gemini-2.5-flash';
const DIA = 864e5, ahora = Date.now();

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const clave = e => norm(e.titulo) + '|' + new Date(e.inicio).toISOString().slice(0, 10) + '|' + norm(e.lugar_nombre);
const sinHTML = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// Las fechas del sitio vienen sin zona horaria: son hora de Colombia (UTC-5)
const fechaCol = s => s ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + '-05:00') : NaN;

async function buscar(SITIO, palabra) {
  const r = await fetch(SITIO + '/api/v1/contents?pageSize=20&page=0&keyword=' + encodeURIComponent(palabra), { headers: { 'User-Agent': 'FusaConecta/1.0 (agenda)' } });
  if (!r.ok) throw new Error('API ' + r.status);
  return (await r.json()).results || [];
}
function atributo(x, nombre) {
  const a = x.attributes; if (!a) return '';
  if (Array.isArray(a)) { const f = a.find(z => z.attribute === nombre); return f ? f.value : ''; }
  const m = String(a).match(new RegExp("'attribute': '" + nombre + "', 'value': '([^']*)'")); return m ? m[1] : '';
}
// Eventos con datos estructurados en el sitio (no necesitan IA)
function deEvento(x, F) {
  const ini = fechaCol(x.startingDate); if (!ini || ini < ahora - DIA) return null;
  const fin = fechaCol(x.closingDate) || ini + 2 * 3600e3;
  return { titulo: sinHTML(x.name).slice(0, 80), descripcion: sinHTML(x.metaDescription || x.description).slice(0, 1000), categoria: 'otro',
    inicio: ini, fin: Math.max(fin, ini), lugar_nombre: (atributo(x, 'EventLocation') || 'Fusagasugá').slice(0, 80), organizador: (atributo(x, 'EventHost') || 'Alcaldía de ' + F.municipio).slice(0, 80), fuente: F.sitio + '/', municipio: F.municipio };
}
// Noticias: la IA decide si anuncian un evento futuro y lo devuelve en JSON
async function conIA(x, F) {
  const texto = (sinHTML(x.name) + '\n' + sinHTML(x.metaDescription) + '\n' + sinHTML(x.description)).slice(0, 4000);
  const hoy = new Date().toISOString().slice(0, 10);
  const pedido = 'Hoy es ' + hoy + '. Del siguiente texto oficial de la Alcaldía de ' + F.municipio + ' (Cundinamarca, Colombia), extrae SOLO eventos públicos futuros en Fusagasugá o Pasca. '
    + 'Responde un arreglo JSON (vacío si no hay) con objetos {"titulo","descripcion","categoria","inicio","fin","lugar_nombre","organizador","gratis","precio"}. '
    + 'categoria es una de: ' + CATEGORIAS.join(', ') + '. inicio y fin en formato ISO con zona -05:00. No inventes datos: si falta la hora, usa 09:00; si falta el fin, 2 horas después.\n\nTEXTO:\n' + texto;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELO + ':generateContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: pedido }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }) });
  if (!r.ok) throw new Error('IA ' + r.status);
  const j = await r.json();
  let l = []; try { l = JSON.parse(j.candidates[0].content.parts[0].text); } catch (e) { return []; }
  return (Array.isArray(l) ? l : []).map(e => ({ titulo: String(e.titulo || '').slice(0, 80), descripcion: String(e.descripcion || '').slice(0, 1000),
    categoria: CATEGORIAS.includes(e.categoria) ? e.categoria : 'otro', inicio: Date.parse(e.inicio), fin: Date.parse(e.fin) || Date.parse(e.inicio) + 2 * 3600e3,
    lugar_nombre: String(e.lugar_nombre || 'Fusagasugá').slice(0, 80), organizador: String(e.organizador || '').slice(0, 80),
    gratis: e.gratis !== false, precio: e.gratis === false ? String(e.precio || '').slice(0, 40) : '', fuente: F.sitio + '/', municipio: F.municipio }))
    .filter(e => e.titulo.length >= 3 && e.inicio > ahora - DIA && e.inicio < ahora + 120 * DIA && e.fin >= e.inicio);
}

let eventos = [], noticias = [];
for (const F of FUENTES) {
  const vistos = new Map();
  for (const p of PALABRAS) {
    try { (await buscar(F.sitio, p)).forEach(x => vistos.set(x.contentID, x)); } catch (e) { console.error(F.municipio + ': no se pudo leer «' + p + '»:', e.message); }
  }
  const candidatos = [...vistos.values()].filter(x => ['Event', 'Article'].includes(x.contentType));
  const ev = candidatos.filter(x => x.contentType === 'Event').map(x => deEvento(x, F)).filter(Boolean);
  const nt = candidatos.filter(x => x.contentType === 'Article' && Date.parse(x.modifiedDate || 0) > ahora - 30 * DIA).map(x => ({ x, F }));
  eventos = eventos.concat(ev); noticias = noticias.concat(nt);
  console.log('Fuente: ' + F.sitio + ' · ' + vistos.size + ' contenidos · ' + ev.length + ' eventos con fecha futura · ' + nt.length + ' noticias recientes para la IA');
}
if (!SIMULAR) {
  if (!process.env.GEMINI_API_KEY || !process.env.FIREBASE_SA) { console.log('Faltan GEMINI_API_KEY o FIREBASE_SA: no se hace nada.'); process.exit(0); }
  for (const { x, F } of noticias) { try { eventos = eventos.concat(await conIA(x, F)); } catch (e) { console.error('IA:', e.message); } }
}
// Sin duplicados dentro de esta corrida
const unicos = [...new Map(eventos.map(e => [clave(e), e])).values()];
if (SIMULAR) {
  console.log('Se guardarían como pendientes (sin revisar duplicados en Firestore):');
  unicos.forEach(e => console.log(' - ' + new Date(e.inicio).toISOString().slice(0, 16) + ' · ' + e.titulo + ' · ' + e.lugar_nombre));
  if (noticias.length) console.log('(+ lo que la IA encuentre en ' + noticias.length + ' noticias)');
  process.exit(0);
}
const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = getFirestore();
// Sin duplicados contra lo que ya existe (publicado, pendiente o descartado) de hoy en adelante
const existentes = await db.collection('eventos').where('fecha_inicio', '>=', Timestamp.fromMillis(ahora - DIA)).get();
const ya = new Set(existentes.docs.map(d => { const x = d.data(); return clave({ titulo: x.titulo, inicio: x.fecha_inicio.toMillis(), lugar_nombre: x.lugar_nombre }); }));
let n = 0;
for (const e of unicos) {
  if (ya.has(clave(e))) continue;
  await db.collection('eventos').add({ titulo: e.titulo, descripcion: e.descripcion || '', categoria: e.categoria, fecha_inicio: Timestamp.fromMillis(e.inicio), fecha_fin: Timestamp.fromMillis(e.fin),
    lugar_nombre: e.lugar_nombre, lat: null, lng: null, municipio: e.municipio || 'Fusagasugá', imagen: '', organizador: e.organizador || '', enlace_fuente: e.fuente,
    gratis: e.gratis !== false, precio: e.precio || '', estado: 'pendiente', origen: 'ia', creado_por: 'ia', fecha_creacion: FieldValue.serverTimestamp() });
  n++;
}
console.log(n + ' eventos nuevos quedaron pendientes de aprobación en el panel.');
