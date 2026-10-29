// Evidencia de la migración: corre los casos de casos_paridad.json con las funciones de la versión en JavaScript
// (herramientas/agenda-ia/extraer.mjs, en el commit indicado) y escribe sus resultados para compararlos con Python.
// Uso: node automatizacion/tests/paridad_js.mjs <ruta de extraer.mjs> > resultados_js.json
import { readFileSync } from 'fs';

const src = readFileSync(process.argv[2], 'utf8');
const casos = JSON.parse(readFileSync(new URL('./casos_paridad.json', import.meta.url), 'utf8'));
// Las funciones puras están entre «const norm» y «const UA», y conIA convierte la respuesta de Gemini dentro de un .map
const puras = src.slice(src.indexOf('const norm ='), src.indexOf('const UA ='));
const CATEGORIAS = ['cultura', 'musica', 'deporte', 'gastronomia', 'feria', 'religioso', 'institucional', 'otro'];
const cuerpoMap = src.slice(
  src.indexOf('return (Array.isArray(l) ? l : []).map(e => {'),
  src.indexOf('}).filter(e => e.inicio);') + '}).filter(e => e.inicio);'.length,
);
const f = new Function(
  'CATEGORIAS',
  'casos',
  puras +
    `
  const F = { nombre: 'Alcaldía de Fusagasugá', sitio: 'https://www.fusagasuga.gov.co', oficial: true };
  const x = { friendlyName: 'noticia-prueba' };
  const deIA = l => { ${cuerpoMap.replace(/^return /, 'return ')} };
  const ahora = casos.ahora, DIA = 864e5;
  const cand = deIA(casos.ia).map(({ x, F, ...e }) => e);
  const validos = cand.filter(e => e.titulo.length >= 3 && e.lugar_nombre.length >= 2 && e.fin >= ahora && e.inicio < ahora + 183 * DIA);
  const unicos = [...new Map(validos.map(e => [clave(e), e])).values()].filter((e, i, a) => a.findIndex(z => claveLugarHora(z) === claveLugarHora(e)) === i);
  return {
    titulo_corto: casos.titulos.map(tituloCorto), campana: casos.titulos.map(campanaDe), tipo: casos.titulos.map(t => tipoDe(t, 'cultura')),
    norm: casos.titulos.map(norm), sin_html: casos.titulos.map(sinHTML),
    fecha_col: casos.fechas.map(s => { const v = fechaCol(s); return Number.isNaN(v) || !v ? null : v; }),
    con_campana: casos.descripciones.map(([c, d]) => conCampana(d, c)),
    ia: cand, claves: cand.map(clave), lugar_hora: cand.map(claveLugarHora), unicos: unicos.map(e => e.titulo)
  };`,
);
console.log(JSON.stringify(f(CATEGORIAS, casos)));
