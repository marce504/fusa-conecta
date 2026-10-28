# Trazados reales de las rutas

Cada ruta con trazado real tiene un archivo `rutas/{id}.geojson` (el `id` del lugar en `datos.js`, por ejemplo `c21`)
y una entrada en `rutas/indice.json`. Mientras una ruta no esté en el índice, la app muestra
"Trazado en preparación" y no ofrece "Ver ruta en 3D".

## Estado (2026-10-23)

| Ruta | Trazado |
|---|---|
| `c22` Cara del Indio | **Real**: OpenStreetMap (Camino Real del Quininí + sendero Panorámica, © OpenStreetMap contributors, ODbL), alturas SRTM 30 m. 3,98 km y +421 m desde la vía Viotá–Tibacuy. |
| `c21` Cerro Fusacatán | En preparación: el sendero no está en OpenStreetMap. Grabarlo en campo (ver `docs/grabar-ruta.md`). |
| `c23` La Aguadita | En preparación: no hay senderos mapeados en OpenStreetMap. Grabarlo en campo. |

## Formato

- GeoJSON con un `LineString` de **150 a 300 puntos** en orden, desde el inicio del sendero hasta la meta.
- Coordenadas `[longitud, latitud, altura_m]` (la altura es opcional).
- Debe venir de un **GPX real** (caminado con GPS), no dibujado a mano.

`indice.json`:

```json
{ "c21": { "nombre": "Sendero al Cerro Fusacatán", "fuente": "Recorrido real grabado con Fusa Conecta", "fecha": "2026-10-25", "puntos": 240 } }
```

## Cómo obtener el trazado

1. Con una cuenta de administrador, abre el sendero y toca **Grabar mi recorrido** (paso a paso en `docs/grabar-ruta.md`) desde el inicio real hasta la meta.
2. Al terminar, en el resumen toca **Descargar trazado para la ruta (GeoJSON)**: la app lo deja en 150-300 puntos.
3. Guarda el archivo como `rutas/{id}.geojson`, agrega la entrada en `indice.json`, sube la versión y publica.

Si tienes un GPX de otra app (Wikiloc, Strava, Garmin), conviértelo a GeoJSON con 150-300 puntos y revisa
que la licencia permita usarlo. Datos de OpenStreetMap: © OpenStreetMap contributors (ODbL).

## Rutas de la comunidad (v7 · Fase 4)

Las rutas que propone la gente no van en esta carpeta: viven en Firestore (`rutas_comunidad`) con su trazado y sus fotos,
y entran a la app cuando el administrador las aprueba. Ver `docs/rutas-comunidad.md`. Los límites de Fusagasugá y Pasca
con los que se validan están en `limites.geojson` (OpenStreetMap, ODbL).
