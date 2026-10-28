// Agenda automática de Fusa Conecta (v7 · Fase 2)
// Lee las APIs públicas de los sitios oficiales (plataforma gov.co), extrae eventos futuros y los guarda en Firestore:
// - Alcaldías de Fusagasugá y Pasca, con título, fecha y lugar claros → se publican solos con la etiqueta «Fuente oficial».
// - Si falta algo, o la fuente no es una alcaldía (IDECUT) → quedan PENDIENTES para el admin.
// Sin duplicados (título + día + lugar, o mismo lugar a la misma hora) contra todo lo que ya existe. No usa Facebook ni Instagram.
// v8: títulos de máximo 60 caracteres (la campaña va a la descripción), «plan» o «aviso» del municipio, imagen principal de la
// noticia en WebP ≤ 200 KB, reparación de los automáticos anteriores y borrado de los eventos de ejemplo a las 24 horas.
//
// Uso:
//   node extraer.mjs --simular            → no escribe nada; sin GEMINI_API_KEY tampoco usa la IA (muestra lo que haría)
//   node extraer.mjs --modo=diaria        → corrida completa (necesita FIREBASE_SA; GEMINI_API_KEY para leer noticias)
//   node extraer.mjs --revisar            → solo corre si el admin tocó «Buscar eventos ahora» en la app
//   node extraer.mjs --reparar            → solo arregla los automáticos ya guardados (título corto, plan/aviso, imagen); no lee los sitios
// Las claves NUNCA van en el código de la app: solo en los secretos del proceso programado (GitHub Actions).
const ARGS = process.argv.slice(2), SIMULAR = ARGS.includes('--simular'), REVISAR = ARGS.includes('--revisar'), SOLO_REPARAR = ARGS.includes('--reparar');
let MODO = (ARGS.find(a => a.startsWith('--modo=')) || '--modo=manual').slice(7);
const FUENTES = [
  { nombre: 'Alcaldía de Fusagasugá', sitio: 'https://www.fusagasuga.gov.co', municipio: 'Fusagasugá', oficial: true },
  { nombre: 'Alcaldía de Pasca', sitio: 'https://www.pasca-cundinamarca.gov.co', municipio: 'Pasca', oficial: true },
  // Instituto de Cultura y Turismo de Cundinamarca: solo lo que mencione Fusagasugá, Pasca o Sumapaz, y siempre pendiente
  { nombre: 'IDECUT (Cultura y Turismo de Cundinamarca)', sitio: 'https://www.idecut.gov.co', municipio: null, oficial: false, filtro: /fusagasug|pasca|sumapaz/i }
];
const PALABRAS = ['evento', 'eventos', 'agenda', 'festival', 'concierto', 'feria', 'celebración', 'programación', 'cultura', 'casa de la cultura',
  'deporte', 'torneo', 'caminata', 'mercado campesino', 'turismo', 'danza', 'teatro', 'música', 'exposición', 'cine', 'taller', 'navidad'];
const CATEGORIAS = ['cultura', 'musica', 'deporte', 'gastronomia', 'feria', 'religioso', 'institucional', 'otro'];
const MODELO = process.env.MODELO_IA || 'gemini-flash-lite-latest';   // el mismo que funciona en la app
const DIA = 864e5, ahora = Date.now(), t0 = Date.now();

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const clave = e => norm(e.titulo) + '|' + new Date(e.inicio - 5 * 36e5).toISOString().slice(0, 10) + '|' + norm(e.lugar_nombre);
const sinHTML = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
// Las fechas del sitio vienen sin zona horaria: son hora de Colombia (UTC-5)
const fechaCol = s => s ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + '-05:00') : NaN;
const recortar = (s, n) => String(s || '').trim().slice(0, n);
// Título de máximo 60 caracteres: sin el nombre de la campaña pegado («Jornada… - Semana de Acción contra el Mosquito»)
const SEPARADOR = /\s+[-–—|]\s+|:\s+/;
function tituloCorto(t) {
  let s = sinHTML(t).split(SEPARADOR)[0].trim() || sinHTML(t);
  if (s.length > 60) s = s.slice(0, 61).replace(/\s+\S*$/, '');
  // Sin palabras de enlace colgando al final («…en talleres de»)
  for (let i = 0; i < 4; i++) s = s.replace(/[\s,;:.\-–]+$/, '').replace(/\s+(de|del|la|las|el|los|en|y|e|o|a|al|con|para|por|un|una)$/i, '');
  return s.slice(0, 60);
}
const campanaDe = t => { const p = sinHTML(t).split(SEPARADOR); return p.length > 1 ? p.slice(1).join(' - ').trim() : ''; };
const conCampana = (desc, campana) => recortar(campana && !norm(desc).includes(norm(campana)) ? 'Hace parte de: ' + campana + '. ' + (desc || '') : desc, 1000);
// Avisos del municipio (no son planes): jornadas de salud, vacunación, cortes de servicio… (la app usa la misma lista)
const RE_AVISO = /vacunaci|jornada de (salud|vacun)|lavado de tanques|fumigaci|tamizaje|brigada de salud|cortes? de (agua|luz|energ|servicio)|suspensi[oó]n del servicio|racionamiento/i;
const tipoDe = (titulo, categoria) => categoria === 'institucional' || RE_AVISO.test(titulo) ? 'aviso' : 'plan';
// Mismo lugar a la misma hora = mismo evento aunque el título cambie (una noticia con varias actividades no se duplica)
const claveLugarHora = e => norm(e.lugar_nombre) + '|' + Math.round(e.inicio / 6e4);
const UA = { 'User-Agent': 'FusaConecta/1.0 (agenda; https://fusa-conecta.web.app)' };
// Imagen principal de la noticia (defaultImage de la API gov.co o og:image de la página), en WebP de máximo 200 KB
async function imagenDe(x, enlace) {
  try {
    let src = x && (x.defaultImage || x.defaultThumbnail);
    if (!src && enlace) {
      const html = await fetch(enlace, { headers: UA, signal: AbortSignal.timeout(20000) }).then(r => r.ok ? r.text() : '');
      const m = html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      src = m && m[1].replace(/&amp;/g, '&');
    }
    if (!src) return '';
    src = new URL(src, enlace || 'https://www.fusagasuga.gov.co').href.replace(/^http:/, 'https:');
    const r = await fetch(src, { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) return '';
    const sharp = (await import('sharp')).default, buf = Buffer.from(await r.arrayBuffer());
    for (const [ancho, calidad] of [[1280, 78], [1024, 70], [800, 62], [640, 55], [480, 50]]) {
      const out = await sharp(buf).rotate().resize({ width: ancho, withoutEnlargement: true }).webp({ quality: calidad }).toBuffer();
      if (out.length <= 200000) return 'data:image/webp;base64,' + out.toString('base64');
    }
  } catch (e) { console.warn('Imagen:', e.message); }
  return '';
}

async function buscar(F, palabra) {
  const r = await fetch(F.sitio + '/api/v1/contents?pageSize=50&page=0&keyword=' + encodeURIComponent(palabra),
    { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).results || [];
}
function atributo(x, nombre) {
  const a = x.attributes; if (!a) return '';
  if (Array.isArray(a)) { const f = a.find(z => z.attribute === nombre); return f ? String(f.value || '') : ''; }
  const m = String(a).match(new RegExp("'attribute': '" + nombre + "', 'value': '([^']*)'")); return m ? m[1] : '';
}
const textoDe = x => sinHTML(x.name) + '\n' + sinHTML(x.metaDescription) + '\n' + sinHTML(x.body || x.description);
// La búsqueda trae solo título y resumen; el texto completo (fecha, hora, lugar) está en el detalle de cada contenido
async function conDetalle(F, x) {
  try { const r = await fetch(F.sitio + '/api/v1/contents/' + encodeURIComponent(x.friendlyName), { signal: AbortSignal.timeout(30000) });
    if (r.ok) { const d = await r.json(); if (d && d.body) x.body = d.body; if (d && d.defaultImage) x.defaultImage = d.defaultImage; } } catch (e) {}
  return x;
}
const municipioDe = (F, x) => F.municipio || (/pasca/i.test(textoDe(x)) ? 'Pasca' : 'Fusagasugá');

// Eventos con datos estructurados en el sitio (fecha, lugar y organizador): no necesitan IA
function deEvento(x, F) {
  const ini = fechaCol(x.startingDate); if (!ini) return null;
  const lugar = sinHTML(atributo(x, 'EventLocation')), titulo = tituloCorto(x.name);
  return { titulo, descripcion: conCampana(sinHTML(x.metaDescription || x.description), campanaDe(x.name)), categoria: 'otro', tipo: tipoDe(sinHTML(x.name), 'otro'), x,
    inicio: ini, fin: Math.max(fechaCol(x.closingDate) || ini + 2 * 36e5, ini), lugar_nombre: recortar(lugar || F.municipio || 'Por confirmar', 80),
    organizador: recortar(sinHTML(atributo(x, 'EventHost')) || F.nombre, 80), gratis: true, precio: '', municipio: municipioDe(F, x),
    enlace: F.sitio + '/eventos/' + x.friendlyName, completo: !!(lugar && sinHTML(x.name).length >= 3), F };
}
// Noticias recientes: Gemini decide si anuncian eventos futuros y dice si la fecha y el lugar están claros en el texto
const ESQUEMA = { type: 'ARRAY', items: { type: 'OBJECT', properties: {
  titulo: { type: 'STRING' }, titulo_corto: { type: 'STRING', description: 'Nombre de la actividad en máximo 60 caracteres, sin el nombre de la campaña ni del programa' },
  campana: { type: 'STRING', description: 'Campaña o programa del que hace parte (por ejemplo "Semana de Acción contra el Mosquito"), o vacío' },
  tipo: { type: 'STRING', enum: ['plan', 'aviso'], description: 'plan = actividad para disfrutar (cultura, música, deporte, feria, gastronomía, religioso); aviso = jornada institucional (salud, vacunación, lavado de tanques, fumigación, cortes de servicio, trámites)' },
  descripcion: { type: 'STRING' }, categoria: { type: 'STRING', enum: CATEGORIAS },
  inicio: { type: 'STRING', description: 'AAAA-MM-DDTHH:MM hora de Colombia' }, fin: { type: 'STRING', description: 'AAAA-MM-DDTHH:MM hora de Colombia' },
  lugar_nombre: { type: 'STRING' }, municipio: { type: 'STRING', enum: ['Fusagasugá', 'Pasca'] }, organizador: { type: 'STRING' },
  gratis: { type: 'BOOLEAN' }, precio: { type: 'STRING' },
  fecha_clara: { type: 'BOOLEAN', description: 'true solo si el texto dice el día Y la hora del evento' },
  lugar_claro: { type: 'BOOLEAN', description: 'true solo si el texto dice el sitio exacto (parque, coliseo, vereda...)' } },
  required: ['titulo', 'titulo_corto', 'tipo', 'inicio', 'lugar_nombre', 'municipio', 'fecha_clara', 'lugar_claro'] } };
async function conIA(x, F) {
  const hoy = new Date(ahora - 5 * 36e5).toISOString().slice(0, 10);
  const pedido = 'Hoy es ' + hoy + ' en Colombia. Del siguiente texto oficial (' + F.nombre + '), extrae SOLO eventos públicos FUTUROS que ocurran en Fusagasugá o Pasca (Cundinamarca). '
    + 'Devuelve un arreglo vacío si no hay. No inventes datos: si no dice la hora, usa 09:00 y fecha_clara=false; si no dice el lugar exacto, lugar_nombre="Por confirmar" y lugar_claro=false; '
    + 'si falta el fin, 2 horas después. gratis=true si dice entrada libre o gratis. '
    + 'titulo_corto: el nombre de la actividad en máximo 60 caracteres, sin la campaña (ejemplo: "Jornada de lavado de tanques y sensibilización - Semana de Acción contra el Mosquito" → titulo_corto "Jornada de lavado de tanques", campana "Semana de Acción contra el Mosquito"). '
    + 'Si una noticia anuncia varias actividades, devuelve una por cada lugar y hora distintos, sin repetir el mismo lugar a la misma hora.\n\nTEXTO:\n' + textoDe(x).slice(0, 4000);
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELO + ':generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ contents: [{ parts: [{ text: pedido }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0 } }) });
  if (!r.ok) throw new Error('IA HTTP ' + r.status);
  const j = await r.json();
  let l = []; try { l = JSON.parse(j.candidates[0].content.parts[0].text); } catch (e) { return []; }
  return (Array.isArray(l) ? l : []).map(e => {
    const ini = fechaCol(String(e.inicio || '').slice(0, 16)), fin = fechaCol(String(e.fin || '').slice(0, 16));
    const categoria = CATEGORIAS.includes(e.categoria) ? e.categoria : 'otro', titulo = tituloCorto(e.titulo_corto || e.titulo);
    return { titulo, descripcion: conCampana(e.descripcion, e.campana || campanaDe(e.titulo)), categoria, x,
      tipo: e.tipo === 'aviso' || tipoDe(titulo + ' ' + (e.titulo || ''), categoria) === 'aviso' ? 'aviso' : 'plan',
      inicio: ini, fin: Math.max(fin || ini + 2 * 36e5, ini), lugar_nombre: recortar(e.lugar_nombre || 'Por confirmar', 80), organizador: recortar(e.organizador || F.nombre, 80),
      gratis: e.gratis !== false, precio: e.gratis === false ? recortar(e.precio, 40) : '', municipio: e.municipio === 'Pasca' ? 'Pasca' : 'Fusagasugá',
      enlace: F.sitio + '/noticias/' + x.friendlyName, completo: e.fecha_clara === true && e.lugar_claro === true && !/por confirmar/i.test(e.lugar_nombre || ''), F };
  }).filter(e => e.inicio);
}

// --- Firestore (solo si hay credenciales) ---
let db = null, Timestamp, FieldValue;
if (process.env.FIREBASE_SA && !SIMULAR) {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const fs = await import('firebase-admin/firestore');
  ({ Timestamp, FieldValue } = fs);
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA)) });
  db = fs.getFirestore();
}
const ESTADO = db && db.collection('config').doc('agenda_auto');
// Eventos de ejemplo (demo:true): se borran solos a las 24 horas de cargados
if (db) {
  const demos = await db.collection('eventos').where('demo', '==', true).get(), vencidos = demos.docs.filter(d => { const f = d.data().fecha_creacion; return !f || f.toMillis() < ahora - DIA; });
  if (vencidos.length) { const b = db.batch(); vencidos.forEach(d => b.delete(d.ref)); await b.commit(); console.log(vencidos.length + ' eventos de ejemplo borrados (más de 24 horas).'); }
}
if (REVISAR) {
  if (!ESTADO) { console.log('Sin FIREBASE_SA: nada que revisar.'); process.exit(0); }
  const s = (await ESTADO.get()).data() || {};
  const pedido = s.solicitado_en && s.solicitado_en.toMillis(), ultima = s.ultima_corrida && s.ultima_corrida.toMillis();
  if (!pedido || (ultima && pedido <= ultima)) { console.log('No hay pedidos nuevos desde la app.'); process.exit(0); }
  MODO = 'pedida desde la app'; console.log('Pedido desde la app: se busca ahora.');
}
if (!SIMULAR && !db) { console.log('Falta FIREBASE_SA (secreto de GitHub): no se hace nada. Ver docs/agenda-ia.md.'); process.exit(0); }
const conClaveIA = !!process.env.GEMINI_API_KEY;

// --- Lectura de fuentes ---
const resumenFuentes = [];
let candidatos = [], noticias = [];
for (const F of SOLO_REPARAR ? [] : FUENTES) {
  const vistos = new Map(), errores = [];
  for (const p of PALABRAS) {
    try { (await buscar(F, p)).forEach(x => vistos.set(x.contentID, x)); } catch (e) { errores.push(p + ': ' + e.message); }
  }
  const items = [...vistos.values()].filter(x => !F.filtro || F.filtro.test(textoDe(x)));
  const ev = items.filter(x => x.contentType === 'Event').map(x => deEvento(x, F)).filter(e => e && e.fin >= ahora);
  const nt = items.filter(x => x.contentType === 'Article' && Date.parse(x.modifiedDate || 0) > ahora - 30 * DIA);
  for (const x of nt) await conDetalle(F, x);
  candidatos = candidatos.concat(ev); noticias = noticias.concat(nt.map(x => ({ x, F })));
  resumenFuentes.push({ nombre: F.nombre, sitio: F.sitio, ok: errores.length < PALABRAS.length, contenidos: items.length, eventos: ev.length, noticias: nt.length,
    error: errores.length ? errores.length + ' búsquedas fallaron (' + errores[0] + ')' : '' });
  console.log(F.nombre + ': ' + items.length + ' contenidos · ' + ev.length + ' eventos con fecha futura · ' + nt.length + ' noticias recientes' + (errores.length ? ' · ' + errores.length + ' errores' : ''));
}
let erroresIA = 0;
if (conClaveIA && !SOLO_REPARAR) for (const { x, F } of noticias) { try { candidatos = candidatos.concat(await conIA(x, F)); } catch (e) { erroresIA++; console.error('IA:', e.message); } }

// Solo futuros (hasta 6 meses), con título y lugar válidos para las reglas de la app; sin duplicados dentro de la corrida
const validos = candidatos.filter(e => e.titulo.length >= 3 && e.lugar_nombre.length >= 2 && e.fin >= ahora && e.inicio < ahora + 183 * DIA);
const vistosLH = new Set();
const unicos = [...new Map(validos.map(e => [clave(e), e])).values()].filter(e => { const k = claveLugarHora(e); if (vistosLH.has(k)) return false; vistosLH.add(k); return true; });
const decidir = e => e.F.oficial && e.completo ? 'publicado' : 'pendiente';

if (SIMULAR) {
  console.log('\n' + unicos.length + ' eventos (sin revisar duplicados en Firestore)' + (conClaveIA ? '' : '; sin GEMINI_API_KEY no se leyeron las ' + noticias.length + ' noticias') + ':');
  for (const e of unicos) {
    const img = ARGS.includes('--imagenes') ? await imagenDe(e.x, e.enlace) : '';
    console.log(' - [' + decidir(e) + ' · ' + e.tipo + '] ' + new Date(e.inicio - 5 * 36e5).toISOString().slice(0, 16).replace('T', ' ') + ' · ' + e.titulo + ' (' + e.titulo.length + ') · ' + e.lugar_nombre + ' · ' + e.F.nombre + ' · ' + e.enlace + (img ? ' · imagen ' + Math.round(img.length * 3 / 4 / 1024) + ' KB' : ''));
  }
  if (!conClaveIA) noticias.forEach(({ x, F }) => console.log('   noticia para la IA · ' + F.nombre + ' · ' + sinHTML(x.name).slice(0, 90) + ' · ' + String(x.modifiedDate).slice(0, 10)));
  // --volcar=archivo.json: guarda los textos de las noticias (para probar la extracción con otra clave)
  const volcar = (ARGS.find(a => a.startsWith('--volcar=')) || '').slice(9);
  if (volcar) (await import('fs')).writeFileSync(volcar, JSON.stringify(noticias.map(({ x, F }) => ({ fuente: F.nombre, oficial: F.oficial, enlace: F.sitio + '/noticias/' + x.friendlyName, texto: textoDe(x).slice(0, 4000) }))));
  process.exit(0);
}

// Duplicados contra lo que ya existe (publicado, pendiente o descartado) desde ayer
const existentes = await db.collection('eventos').where('fecha_inicio', '>=', Timestamp.fromMillis(ahora - DIA)).get();
const ya = new Set(), yaLH = new Set();
existentes.docs.forEach(d => { const x = d.data(), e = { titulo: x.titulo, inicio: x.fecha_inicio.toMillis(), lugar_nombre: x.lugar_nombre }; ya.add(clave(e)); yaLH.add(claveLugarHora(e)); });
let publicados = 0, pendientes = 0, duplicados = 0;
const lote = db.batch(), imagenes = new Map();   // una descarga por noticia aunque traiga varias actividades
for (const e of unicos) {
  if (ya.has(clave(e)) || yaLH.has(claveLugarHora(e))) { duplicados++; continue; }
  const est = decidir(e); est === 'publicado' ? publicados++ : pendientes++;
  if (!imagenes.has(e.enlace)) imagenes.set(e.enlace, await imagenDe(e.x, e.enlace));
  lote.set(db.collection('eventos').doc(), { titulo: e.titulo, descripcion: e.descripcion, categoria: e.categoria, tipo: e.tipo,
    fecha_inicio: Timestamp.fromMillis(e.inicio), fecha_fin: Timestamp.fromMillis(e.fin), lugar_nombre: e.lugar_nombre, lat: null, lng: null,
    municipio: e.municipio, imagen: imagenes.get(e.enlace), organizador: e.organizador, enlace_fuente: recortar(e.enlace, 500), gratis: e.gratis, precio: e.precio,
    fuente_oficial: e.F.oficial, estado: est, origen: 'automatico', creado_por: 'agenda-automatica', fecha_creacion: FieldValue.serverTimestamp() });
}
await lote.commit();
// Automáticos anteriores a v8 (sin «tipo»): título corto, campaña en la descripción, plan o aviso e imagen de la noticia
// (los que quedaron sin imagen porque el sitio no respondió se reintentan en cada corrida)
const viejos = existentes.docs.filter(d => { const x = d.data(); return x.origen === 'automatico' && (!x.tipo || !x.imagen); });
let reparados = 0;
for (const d of viejos) {
  const x = d.data(), cambios = { tipo: x.tipo || tipoDe(x.titulo, x.categoria) };
  if (x.titulo.length > 60 || SEPARADOR.test(x.titulo)) { cambios.titulo = tituloCorto(x.titulo); cambios.descripcion = conCampana(x.descripcion, campanaDe(x.titulo)); }
  if (!x.imagen && x.enlace_fuente) {
    const m = x.enlace_fuente.match(/^(https:\/\/[^/]+)\/(?:noticias|eventos)\/([^/?#]+)/);
    let det = null; if (m) try { det = await fetch(m[1] + '/api/v1/contents/' + encodeURIComponent(m[2]), { headers: UA, signal: AbortSignal.timeout(30000) }).then(r => r.ok ? r.json() : null); } catch (e) {}
    if (!imagenes.has(x.enlace_fuente)) imagenes.set(x.enlace_fuente, await imagenDe(det, x.enlace_fuente));
    if (imagenes.get(x.enlace_fuente)) cambios.imagen = imagenes.get(x.enlace_fuente);
  }
  if (x.tipo && Object.keys(cambios).length === 1) continue;   // nada nuevo (la imagen sigue sin llegar)
  await d.ref.update(cambios); reparados++;
  console.log('Reparado: ' + (cambios.titulo || x.titulo) + ' · ' + cambios.tipo + (cambios.imagen ? ' · con imagen' : ''));
}
if (!SOLO_REPARAR) await ESTADO.set({ ultima_corrida: Timestamp.fromMillis(t0), modo: MODO, duracion_s: Math.round((Date.now() - t0) / 1000), fuentes: resumenFuentes,
  noticias_leidas: conClaveIA ? noticias.length - erroresIA : 0, noticias_sin_ia: conClaveIA ? erroresIA : noticias.length, con_ia: conClaveIA,
  encontrados: unicos.length, publicados, pendientes, duplicados, reparados }, { merge: true });
console.log('\nListo: ' + unicos.length + ' encontrados · ' + publicados + ' publicados · ' + pendientes + ' pendientes · ' + duplicados + ' ya existían · ' + reparados + ' reparados.');
