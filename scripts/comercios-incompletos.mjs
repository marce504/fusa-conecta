// Listado de los lugares del directorio base (datos.js) a los que les falta el teléfono, el horario o la foto (U2).
// Sale ordenado por prioridad: primero Salud y Trámites, después el resto de categorías.
// Uso (desde la raíz del repositorio):  node scripts/comercios-incompletos.mjs
// Escribe docs/comercios-incompletos.csv (separado por «;» y con BOM para que Excel lo abra con tildes).
// Solo lee datos.js: los negocios registrados por sus dueños en Firestore se revisan en el panel de administración.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'docs', 'comercios-incompletos.csv');

// Mismo criterio que la app (esNatural en app.js): los sitios naturales no tienen horario ni teléfono
const TIPOS_NATURALES = ['sendero', 'mirador', 'cascada'];
const RE_NATURAL = /\b(cerro|sendero|mirador|camino real|alto de|cascada|salto)\b/i;
const esNatural = d => d.cat === 'turismo' && (TIPOS_NATURALES.includes(d.tipo) || RE_NATURAL.test(d.nombre || ''));

function cargarDatos() {
  const ctx = {};
  vm.runInNewContext(
    `${readFileSync(join(RAIZ, 'datos.js'), 'utf8')}\n;globalThis.__d={CAT,SUBCATS,COMERCIOS_BASE};`,
    ctx,
  );
  return ctx.__d;
}

function prioridad(d) {
  if (d.cat === 'servicios' && d.sub === 'salud') return 1;
  if (d.cat === 'tramite') return 2;
  return 3;
}

function faltantes(d) {
  const natural = esNatural(d);
  return {
    telefono: !natural && !String(d.tel || d.whatsapp || '').replace(/\D/g, ''),
    horario: !natural && !d.horario && !(Array.isArray(d.dias) && d.dias.length) && !d.horario_nota,
    foto: !d.imagen && !(Array.isArray(d.fotos) && d.fotos.length),
  };
}

const celda = v => {
  const t = String(v ?? '');
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function filas({ CAT, SUBCATS, COMERCIOS_BASE }) {
  const nombreSub = d => {
    const s = (SUBCATS[d.cat] || []).find(x => x.k === (d.cat === 'turismo' ? d.tipo : d.sub));
    return s ? s.t.replace(/^[^\p{L}]+/u, '').trim() : '';
  };
  return COMERCIOS_BASE.map(d => ({ d, f: faltantes(d) }))
    .filter(({ f }) => f.telefono || f.horario || f.foto)
    .sort(
      (a, b) =>
        prioridad(a.d) - prioridad(b.d) ||
        (CAT[a.d.cat]?.label || '').localeCompare(CAT[b.d.cat]?.label || '', 'es') ||
        nombreSub(a.d).localeCompare(nombreSub(b.d), 'es') ||
        a.d.nombre.localeCompare(b.d.nombre, 'es'),
    )
    .map(({ d, f }) => [
      prioridad(d) === 1 ? 'Salud' : prioridad(d) === 2 ? 'Trámites' : 'Otras',
      CAT[d.cat]?.label || d.cat,
      nombreSub(d),
      d.id,
      d.nombre,
      d.direccion || '',
      d.municipio || 'Fusagasugá',
      f.telefono ? 'sí' : '',
      f.horario ? 'sí' : '',
      f.foto ? 'sí' : '',
      (d.fuentes || []).map(x => x.url || x.nombre).join(' | '),
    ]);
}

const ENCABEZADO = [
  'Prioridad',
  'Categoría',
  'Subcategoría',
  'ID',
  'Nombre',
  'Dirección',
  'Municipio',
  'Falta teléfono',
  'Falta horario',
  'Falta foto',
  'Fuente',
];
const lista = filas(cargarDatos());
const csv = [ENCABEZADO, ...lista].map(f => f.map(celda).join(';')).join('\r\n');
const BOM = String.fromCharCode(0xfeff); // Excel reconoce así que el archivo es UTF-8
writeFileSync(SALIDA, `${BOM}${csv}\r\n`, 'utf8');
const cuenta = i => lista.filter(f => f[i] === 'sí').length;
process.stdout.write(
  `${lista.length} lugares incompletos (sin teléfono: ${cuenta(7)}, sin horario: ${cuenta(8)}, sin foto: ${cuenta(9)}) → docs/comercios-incompletos.csv\n`,
);
