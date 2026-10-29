// Exporta la base local de la PWA (datos.js y rutas/) a api/app/datos_base.json para que la API use exactamente los mismos datos.
// Uso (desde la raíz del repositorio):  node api/exportar_datos.mjs
// Se ejecuta en la integración continua para comprobar que el JSON está al día con datos.js.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const codigo = readFileSync(join(raiz, 'datos.js'), 'utf8');
const ctx = {};
vm.runInNewContext(codigo + '\n;globalThis.__d={CAT,SUBCATS,COMERCIOS_BASE,RUTAS,EMERGENCIAS,PLAZA_FUSA};', ctx);
const d = ctx.__d;

// Trazados reales de rutas/ (los mismos que usa la app para la ruta guiada y el 3D)
const indice = JSON.parse(readFileSync(join(raiz, 'rutas', 'indice.json'), 'utf8'));
const trazados = {};
for (const [id, info] of Object.entries(indice)) {
  const archivo = join(raiz, 'rutas', id + '.geojson');
  if (!existsSync(archivo)) continue;
  const g = JSON.parse(readFileSync(archivo, 'utf8'));
  const f = (g.features || [g]).find(x => x.geometry && x.geometry.type === 'LineString');
  trazados[id] = { ...info, coordenadas: f.geometry.coordinates.map(c => [c[1], c[0], c[2] ?? null]) }; // [lat, lng, alt]
}

const salida = {
  generado_desde: 'datos.js y rutas/ (node api/exportar_datos.mjs)',
  categorias: Object.fromEntries(Object.entries(d.CAT).map(([k, v]) => [k, v.label])),
  subcategorias: Object.fromEntries(
    Object.entries(d.SUBCATS).map(([k, l]) => [k, l.map(s => ({ k: s.k, t: s.t.replace(/^[^\p{L}]+/u, '').trim() }))]),
  ),
  plaza: d.PLAZA_FUSA,
  comercios: d.COMERCIOS_BASE.map(({ emoji, ...c }) => c),
  rutas: Object.fromEntries(
    Object.entries(d.RUTAS).map(([id, r]) => [
      id,
      {
        nombre: r.nombre,
        dificultad: r.dificultad,
        duracion: r.duracionEstimada,
        distancia_km: r.distanciaTotal,
        desnivel_m: r.desnivelPositivo ?? Math.round((r.elevacionMaxima || 0) - (r.elevacionMinima || 0)),
        elevacion_min: r.elevacionMinima ?? null,
        elevacion_max: r.elevacionMaxima ?? null,
      },
    ]),
  ),
  trazados,
  emergencias: Object.fromEntries(Object.entries(d.EMERGENCIAS).map(([m, l]) => [m, l.map(({ emoji, ...e }) => e)])),
};
const destino = join(raiz, 'api', 'app', 'datos_base.json');
const texto = JSON.stringify(salida, null, 1) + '\n';
if (process.argv.includes('--comprobar')) {
  if (!existsSync(destino) || readFileSync(destino, 'utf8') !== texto) {
    console.error('api/app/datos_base.json no está al día: ejecuta node api/exportar_datos.mjs');
    process.exit(1);
  }
  console.log('datos_base.json al día');
  process.exit(0);
}
writeFileSync(destino, texto);
console.log(
  'Listo: ' +
    salida.comercios.length +
    ' lugares, ' +
    Object.keys(salida.rutas).length +
    ' rutas, ' +
    Object.keys(trazados).length +
    ' trazados reales → api/app/datos_base.json',
);
