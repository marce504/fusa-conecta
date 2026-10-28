# Rutas propuestas por la comunidad (v7 · Fase 4)

Cualquier persona con cuenta puede proponer una ruta para Fusa Conecta. Cuando el administrador la aprueba, la ruta entra al
directorio como un sendero más: tiene navegación guiada, vista 3D, galería de fotos y aparece en el asistente
«Pregúntale a Fusa». Lleva el crédito «Ruta propuesta por…».

## Cómo se propone (en la app)

**Perfil → Mis recorridos.** Arriba hay dos botones:

- **Grabar una ruta nueva:**
  - Graba con GPS sin una ruta de referencia, con pausa y fotos.
  - Al terminar, el resumen del recorrido tiene el botón **Proponer como ruta nueva**.
- **Proponer una ruta:**
  - Puedes elegir uno de tus recorridos terminados (los simulados no cuentan).
  - O puedes subir un archivo **GPX o GeoJSON** de hasta 5 MB. Sirven los que exportan Wikiloc, Strava, Komoot o Google My Maps.

La pantalla «Proponer una ruta» muestra el trazado en el mapa, la distancia, el desnivel, el tiempo estimado, el municipio
y el perfil de elevación. También dice si la ruta cumple las condiciones. Los campos del formulario son:

- Nombre (5 a 60 caracteres).
- Tipo: caminata, ciclomontañismo o trote de montaña.
- Dificultad: baja, media o alta.
- Descripción (20 a 500 caracteres).
- **1 a 4 fotos.** Si la ruta viene de un recorrido grabado, sus fotos ya aparecen puestas.

El estado de cada propuesta sale en «Mis recorridos → Rutas que propusiste»:

| Estado | Qué se ve |
|---|---|
| En revisión | La propuesta espera al administrador. |
| Publicada | Abre la ficha de la ruta. |
| No aprobada | Muestra el motivo. |

Las propuestas que no están publicadas se pueden eliminar.

## Condiciones

| Condición | Dónde se valida |
|---|---|
| Distancia de 0,5 a 40 km | En el teléfono (con el trazado) y en `firestore.rules` (con la cifra) |
| Al menos el 80 % del trazado dentro de Fusagasugá o Pasca, o a menos de 5 km de sus límites | En el teléfono, con `limites.geojson` |
| Inicio en la zona aproximada de Fusagasugá y Pasca (latitud 4,0 a 4,6; longitud −74,6 a −74,0) | `firestore.rules` |
| Nombre, tipo, dificultad, descripción, tamaños y campos permitidos | `firestore.rules` |
| Al menos una foto (debe existir `fotos/0`) y como máximo las declaradas; cada una de hasta 280 000 caracteres | `firestore.rules` |
| Queda «pendiente»; solo el administrador la aprueba o la rechaza (rechazar exige motivo) | `firestore.rules` |

- **Margen de 5 km:** existe por los senderos vecinos, como el Quininí (Cara del Indio, en Tibacuy), que las personas de Fusa recorren seguido.
- **Zona en el servidor:** la validación exacta del 80 % no se puede hacer en `firestore.rules` sin Cloud Functions. Por eso el servidor revisa la zona aproximada del inicio y el administrador revisa el trazado en 3D antes de aprobar.

## Datos (`rutas_comunidad/{id}`)

- **Trazado:**
  - `linea` guarda hasta ~400 puntos como texto `lat,lng,alt;…`, porque Firestore no admite listas dentro de listas.
  - Si el GPS o el archivo no traen alturas, el teléfono las pide al modelo de terreno de Open-Meteo.
- **Cifras:** `distancia_km`, `desnivel_m`, `elev_min`, `elev_max`, `perfil` (40 alturas) y `duracion_min`.
  - La duración se estima así: caminata a 4 km/h + 1 h por cada 600 m de subida; trote a 7 km/h + 1 h por cada 800 m; bicicleta a 12 km/h + 1 h por cada 1000 m.
- **Fotos:**
  - `portada` es la miniatura que va dentro del documento.
  - Las fotos completas están en `fotos/0…3`, como en los negocios (ver `fotos-y-storage.md`).
- **Autoría:** `autor_uid` y `autor_nombre`. El nombre va en forma corta, «Ana M.».

Las rutas aprobadas se leen con `where('estado','==','aprobada')`. Cada una se vuelve:

- un lugar `rc-{id}` del directorio (Turismo → Senderos);
- una entrada de `RUTAS`, con el trazado completo para la ruta guiada y la vista 3D.

## Panel de administración → Rutas

- **Por revisar:** cada tarjeta trae lo necesario para decidir.
  - Contenido: autor, tipo, dificultad, municipio, cifras, perfil, descripción y todas las fotos.
  - **Ver en 3D:** muestra el relieve real.
  - **Aprobar**, o **Rechazar** con un motivo.
- **Publicadas:** **Retirar** quita una ruta de la app, con motivo. La persona ve el motivo.

## Insignia

**Explorador de Fusa:** se gana cuando una ruta que propusiste queda publicada. Aparece en «Mis recorridos» con las demás insignias.
