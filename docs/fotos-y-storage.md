# Fotos de negocios (Fase 5.1) y Firebase Storage como mejora futura

## Cómo se guardan hoy (plan gratuito Spark, sin Storage)

Firestore tiene un límite de **1 MB por documento**, así que las fotos no van dentro del negocio:

| Dónde | Qué | Límite (lo valida `firestore.rules`) |
|---|---|---|
| `comercios/{id}` | `imagen`: portada en miniatura (WebP 320 px) y `fotos`: lista ordenada de ids (su largo es el número de fotos) | portada ≤ 56 000 caracteres (≈ 40 KB); 4 fotos en Gratis, 10 en Premium |
| `comercios/{id}/fotos/{n}` | una foto por documento: `data` (WebP 1280 px; JPEG en Safari), `ancho`, `alto`, `bytes`, `fecha` | ≤ 280 000 caracteres (≈ 200 KB) |

- La app comprime en el teléfono antes de subir (baja calidad y tamaño hasta caber).
- El negocio y sus fotos se guardan en un mismo lote: o se guarda todo o nada.
- **Migración automática**: si un negocio aún tiene la foto grande dentro del documento (como Ofalahiatu Vivero Virtual y MG Washers, ~94 KB cada uno), la app la pasa sola a la galería y deja la miniatura cuando entra su dueño o el admin. El botón "Pasar fotos antiguas a la galería" del panel queda por si alguna falla.

Costo: cada foto vista es 1 lectura de Firestore (50 000 lecturas gratis al día). Con pocos negocios y fotos esto alcanza de sobra.

## Mejora futura: Firebase Storage (requiere el plan Blaze)

Desde 2024 los proyectos nuevos solo pueden crear un bucket de Storage con el plan **Blaze** (pago por uso; incluye una capa gratuita y se puede poner un presupuesto con alertas).

Ventajas al pasar a Storage:

- Fotos más grandes y de mejor calidad, con URL propia que el navegador y el service worker guardan en caché.
- Menos lecturas de Firestore (la foto ya no es un documento).
- Se pueden generar miniaturas en el servidor (extensión "Resize Images").

Cómo migrar cuando se active Blaze:

1. Crear el bucket y escribir `storage.rules` (dueño o admin escriben en `comercios/{id}/`, imágenes hasta 1 MB; lectura pública solo de negocios aprobados).
2. Cambiar la subida para usar `putString(data, 'data_url')` y guardar en `fotos` las rutas o URLs en lugar de los ids de documentos.
3. Un script de una sola vez copia `comercios/*/fotos/*` a Storage y actualiza las listas.
4. Mantener la lectura de ambos formatos durante la transición.
