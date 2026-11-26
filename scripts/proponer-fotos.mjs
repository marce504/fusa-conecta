// Propone fotos para los lugares del directorio base (datos.js) que no tienen foto, y las deja en un CSV para revisarlas
// ANTES de cambiar nada (Fase 6). Nunca escribe en Firestore ni guarda imágenes.
//
// Fuentes, en este orden:
//  1. Wikimedia Commons (sitios turísticos, iglesias, parques, cerros, el páramo): solo licencias libres (CC0, dominio
//     público, CC BY y CC BY-SA), con autor y licencia.
//  2. Google Places (Place Photos), solo si existe la variable de entorno GOOGLE_PLACES_KEY: guarda el place_id y el
//     nombre de la foto, y la atribución del autor; la imagen se pide en vivo con la clave restringida por dominio.
//
// Uso (desde la raíz):  node scripts/proponer-fotos.mjs [--max=60]
// Escribe docs/propuestas-fotos.csv (separado por «;» y con BOM para Excel).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'docs', 'propuestas-fotos.csv');
const MAX = Number((process.argv.find(a => a.startsWith('--max=')) || '--max=60').split('=')[1]);
const AGENTE = 'FusaConectaPropuestasFotos/1.0 (directorio comunitario; https://fusa-conecta.web.app)';
const LICENCIAS_LIBRES = /^(cc0|public domain|dominio público|pd|cc by(-sa)? \d(\.\d)?( [a-z]+)?)$/i;
const CLAVE_PLACES = process.env.GOOGLE_PLACES_KEY || '';

function cargarDirectorio() {
  const ctx = {};
  vm.runInNewContext(`${readFileSync(join(RAIZ, 'datos.js'), 'utf8')}\n;globalThis.__d=COMERCIOS_BASE;`, ctx);
  return ctx.__d;
}

const sinEtiquetas = t =>
  String(t || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Lugares públicos o naturales: los que tienen fotos libres en Commons
const esLugarPublico = d =>
  d.cat === 'turismo' ||
  /parque|iglesia|parroquia|catedral|plaza|cerro|páramo|museo|casa de la cultura/i.test(d.nombre);

async function buscarEnCommons(d) {
  const q = `${d.nombre} ${d.municipio || 'Fusagasugá'}`;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${q}`,
    gsrnamespace: '6',
    gsrlimit: '5',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '1280',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { 'User-Agent': AGENTE } });
  if (!r.ok) return null;
  const paginas = Object.values((await r.json()).query?.pages || {});
  for (const p of paginas) {
    const info = p.imageinfo?.[0];
    const meta = info?.extmetadata || {};
    const licencia = sinEtiquetas(meta.LicenseShortName?.value);
    if (!info || !LICENCIAS_LIBRES.test(licencia)) continue;
    return {
      fuente: 'wikimedia',
      url_foto: info.thumburl || info.url,
      pagina: info.descriptionurl,
      autor: sinEtiquetas(meta.Artist?.value) || 'Autor en Wikimedia Commons',
      licencia,
      licencia_url: meta.LicenseUrl?.value || '',
      referencia: p.title,
    };
  }
  return null;
}

async function buscarEnPlaces(d) {
  if (!CLAVE_PLACES || d.lat == null) return null;
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': CLAVE_PLACES,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
    },
    body: JSON.stringify({
      textQuery: `${d.nombre}, ${d.municipio || 'Fusagasugá'}`,
      locationBias: { circle: { center: { latitude: d.lat, longitude: d.lng }, radius: 300 } },
      maxResultCount: 1,
    }),
  });
  if (!r.ok) return null;
  const lugar = (await r.json()).places?.[0];
  const foto = lugar?.photos?.[0];
  if (!foto) return null;
  return {
    fuente: 'google_places',
    url_foto: '',
    pagina: '',
    autor: (foto.authorAttributions || []).map(a => a.displayName).join(', '),
    licencia: 'Términos de Google Maps Platform (no se guarda la imagen)',
    licencia_url: 'https://cloud.google.com/maps-platform/terms',
    referencia: `${lugar.id} | ${foto.name}`,
  };
}

const celda = v => {
  const t = String(v ?? '');
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

async function main() {
  const sinFoto = cargarDirectorio().filter(d => !d.imagen && !(d.fotos || []).length);
  const candidatos = [...sinFoto.filter(esLugarPublico), ...sinFoto.filter(d => !esLugarPublico(d))].slice(0, MAX);
  const filas = [];
  for (const d of candidatos) {
    let p = null;
    try {
      p = (esLugarPublico(d) ? await buscarEnCommons(d) : null) || (await buscarEnPlaces(d));
    } catch (e) {
      process.stderr.write(`${d.id}: ${e.message}\n`);
    }
    filas.push([
      d.id,
      d.nombre,
      d.cat,
      d.municipio || 'Fusagasugá',
      p ? p.fuente : 'sin propuesta',
      p?.url_foto,
      p?.pagina,
      p?.autor,
      p?.licencia,
      p?.licencia_url,
      p?.referencia,
      'pendiente de revisar',
    ]);
    await new Promise(r => {
      setTimeout(r, 300); // sin saturar las API públicas
    });
  }
  const encabezado = [
    'ID',
    'Nombre',
    'Categoría',
    'Municipio',
    'Fuente',
    'URL de la foto',
    'Página de la foto',
    'Autor',
    'Licencia',
    'URL de la licencia',
    'Referencia (Commons o place_id | foto)',
    'Revisión',
  ];
  const BOM = String.fromCharCode(0xfeff);
  writeFileSync(SALIDA, `${BOM}${[encabezado, ...filas].map(f => f.map(celda).join(';')).join('\r\n')}\r\n`, 'utf8');
  const conPropuesta = filas.filter(f => f[4] !== 'sin propuesta').length;
  process.stdout.write(
    `${filas.length} lugares revisados, ${conPropuesta} con propuesta${CLAVE_PLACES ? '' : ' (sin GOOGLE_PLACES_KEY: solo Wikimedia Commons)'} → docs/propuestas-fotos.csv\n`,
  );
}

main().catch(e => {
  process.stderr.write(`${e.stack}\n`);
  process.exitCode = 1;
});
