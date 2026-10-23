# Trazados reales de las rutas

Cada ruta con trazado real tiene un archivo `rutas/{id}.geojson` (el `id` del lugar en `datos.js`, por ejemplo `c21`)
y una entrada en `rutas/indice.json`. Mientras una ruta no esté en el índice, la app muestra
"Trazado en preparación" y no ofrece "Ver ruta en 3D".

## Formato

- GeoJSON con un `LineString` de **150 a 300 puntos** en orden, desde el inicio del sendero hasta la meta.
- Coordenadas `[longitud, latitud, altura_m]` (la altura es opcional).
- Debe venir de un **GPX real** (caminado con GPS), no dibujado a mano.

`indice.json`:

```json
{ "c21": { "nombre": "Sendero al Cerro Fusacatán", "fuente": "Recorrido real grabado con Fusa Conecta", "fecha": "2026-10-25", "puntos": 240 } }
```

## Cómo obtener el trazado

1. Con una cuenta de administrador, abre el sendero y toca **Grabar recorrido** desde el inicio real hasta la meta.
2. Al terminar, en el resumen toca **Descargar trazado para la ruta (GeoJSON)**: la app lo deja en 150-300 puntos.
3. Guarda el archivo como `rutas/{id}.geojson`, agrega la entrada en `indice.json`, sube la versión y publica.

Si tienes un GPX de otra app (Wikiloc, Strava, Garmin), conviértelo a GeoJSON con 150-300 puntos y revisa
que la licencia permita usarlo. Datos de OpenStreetMap: © OpenStreetMap contributors (ODbL).
