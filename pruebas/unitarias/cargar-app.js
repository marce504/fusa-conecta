// Carga funciones REALES de app.js y datos.js para probarlas sin navegador y sin modificar la PWA.
// La PWA es un script clásico (sin módulos): este cargador lee el archivo con espree (el analizador de ESLint),
// toma solo las declaraciones pedidas y las evalúa aisladas, con los datos y dobles de prueba que se le pasen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function declaraciones(archivo) {
  const src = readFileSync(join(RAIZ, archivo), 'utf8');
  const ast = espree.parse(src, { ecmaVersion: 2023, sourceType: 'script', range: true });
  const mapa = new Map();
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration') mapa.set(n.id.name, src.slice(...n.range));
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) {
        if (d.id.type === 'Identifier') mapa.set(d.id.name, `${n.kind} ${src.slice(...d.range)};`);
      }
    }
  }
  return mapa;
}

const APP = declaraciones('app.js');
const DATOS = declaraciones('datos.js');

/**
 * Devuelve un objeto con las funciones/constantes pedidas.
 * @param {string[]} nombres declaraciones de app.js (en el orden en que dependen unas de otras)
 * @param {object} contexto variables externas que esas funciones usan (estado, dobles de prueba…)
 * @param {string[]} datos constantes de datos.js que se necesitan (CAT, SUBCATS…)
 */
export function cargar(nombres, contexto = {}, datos = []) {
  const partes = [];
  for (const n of datos) {
    if (!DATOS.has(n)) throw new Error(`datos.js no declara ${n}`);
    partes.push(DATOS.get(n));
  }
  for (const n of nombres) {
    if (!APP.has(n)) throw new Error(`app.js no declara ${n}`);
    partes.push(APP.get(n));
  }
  const claves = Object.keys(contexto);
  const cuerpo = `${partes.join('\n')}\nreturn { ${[...nombres, ...datos].join(', ')} };`;
  // Es el propósito del cargador: evaluar el código real de la PWA (no-new-func está apagada para las herramientas)
  return new Function(...claves, cuerpo)(...claves.map(k => contexto[k]));
}
