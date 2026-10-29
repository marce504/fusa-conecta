# Servicios web REST (API de Fusa Conecta)

- **Base:** `https://fusa-conecta-api.onrender.com`
- **Versión:** `/v1`
- **Documentación interactiva (OpenAPI 3.1):** [/docs](https://fusa-conecta-api.onrender.com/docs); esquema en [/openapi.json](https://fusa-conecta-api.onrender.com/openapi.json).

Python 3.12 con FastAPI. Lee Firestore con Firebase Admin, con una cuenta de servicio de solo lectura.

Características comunes:
- Respuestas en JSON; los errores tienen la forma `{"error": "…", "estado": 4xx}`.
- **CORS** solo para `https://fusa-conecta.web.app`.
- **Límite:** 60 peticiones por minuto por IP (20 en los endpoints protegidos). Al pasarlo responde 429 con `Retry-After`.
- **Autenticación** en los protegidos: `Authorization: Bearer <idToken de Firebase Auth>`, verificado con `firebase_admin.auth.verify_id_token`.

Las respuestas de abajo son **reales**: se pidieron a la API en producción el 2026-10-28.

## Resumen

| # | Método y ruta | Descripción | Protección | Lo usa la app |
|---|---|---|---|---|
| 1 | `GET /v1/comercios` | Directorio con filtros `categoria`, `sub`, `municipio`, `abierto`, `q`, `pagina`, `por_pagina` | Pública | — |
| 2 | `GET /v1/comercios/{id}` | Ficha pública con estado (abierto o cerrado) y cupones activos | Pública | — |
| 3 | `GET /v1/eventos` | Agenda con `desde`, `hasta`, `categoria`, `tipo=plan\|aviso` | Pública | — |
| 4 | `GET /v1/eventos.ics` | Calendario suscribible (RFC 5545) | Pública | Agenda → «Suscribirme a la agenda» |
| 5 | `GET /v1/rutas` · `GET /v1/rutas/{id}.gpx` | Rutas y trazado en GPX 1.1 | Pública | Ficha del sendero → «Descargar GPX» |
| 6 | `GET /v1/emergencias?municipio=` | Números de emergencia de Fusagasugá o Pasca | Pública | — |
| 7 | `GET /v1/comercios/{id}/reporte?formato=xlsx\|pdf&mes=` | Reporte mensual del negocio (Excel con openpyxl, PDF con ReportLab) | Token del dueño o admin | Panel del negocio → «Descargar reporte» |
| 8 | `GET /v1/admin/estadisticas` | Totales de negocios, usuarios, cupones, canjes, eventos y rutas | Token de admin | — |
| 9 | `GET /v1/salud` | Estado del servicio y de Firestore | Pública, sin límite | Panel → «Diagnóstico» |

## Ejemplos

### 1. Buscar en el directorio (sin tildes ni plurales)

```bash
curl "https://fusa-conecta-api.onrender.com/v1/comercios?q=panaderia&por_pagina=2"
```

```json
{
  "total": 1, "pagina": 1, "por_pagina": 2, "paginas": 1,
  "resultados": [{
    "id": "c14", "nombre": "Panadería y Café El Cedro", "categoria": "comercio", "categoria_nombre": "Comida y tiendas",
    "sub": "panaderias", "sub_nombre": "Panaderías", "municipio": "Fusagasugá", "direccion": "Cll 8 # 12-09, Pekín",
    "lat": 4.34387, "lng": -74.35265, "horario": "Todos los días · 5:30–8 p.m.",
    "estado": "Abre mañana 5:30 a. m.", "abierto": false, "telefono": "3102220014", "whatsapp": "3102220014",
    "premium": false, "tiene_foto": true,
    "imagen_url": "https://fusa-conecta.web.app/img/comercios/panaderia-y-cafe-el-cedro.jpg",
    "cupones": 0, "url": "https://fusa-conecta.web.app/#/lugar/c14"
  }]
}
```

### 2. Ficha de un lugar

```bash
curl "https://fusa-conecta-api.onrender.com/v1/comercios/c14"
```

Devuelve lo mismo que la búsqueda, más `descripcion`, `sitio_web`, `redes`, `imagen` y `cupones_activos`. Si el lugar no existe o no está publicado: `404 {"error":"No existe ese lugar o no está publicado","estado":404}`.

### 3. Agenda (solo planes)

```bash
curl "https://fusa-conecta-api.onrender.com/v1/eventos?tipo=plan"
```

```json
{ "total": 1, "resultados": [{
  "id": "EbqpZOdBo2TwcbSqKMRU", "titulo": "Día Dulce", "categoria": "cultura", "tipo": "plan",
  "inicio": "2026-10-31T14:00:00-05:00", "fin": "2026-10-31T16:00:00-05:00",
  "lugar": "Estadio municipal Fernando Mazuera", "municipio": "Fusagasugá", "gratis": true,
  "fuente_oficial": true, "enlace_fuente": "https://www.fusagasuga.gov.co/noticias/preparate-para-un-dia-dulce-lleno-de-diversion",
  "tiene_imagen": true, "url": "https://fusa-conecta.web.app/#/evento/EbqpZOdBo2TwcbSqKMRU"
}]}
```

Si las fechas no vienen como AAAA-MM-DD: `422 {"error":"Las fechas van como AAAA-MM-DD","estado":422}`.

### 4. Calendario suscribible

```bash
curl "https://fusa-conecta-api.onrender.com/v1/eventos.ics"
```

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Fusa Conecta//Agenda//ES
X-WR-CALNAME:Fusa Conecta · Qué hacer en Fusa
X-WR-TIMEZONE:America/Bogota
REFRESH-INTERVAL;VALUE=DURATION:PT6H
BEGIN:VEVENT
UID:EbqpZOdBo2TwcbSqKMRU@fusa-conecta.web.app
DTSTART:20261031T190000Z
DTEND:20261031T210000Z
SUMMARY:Día Dulce
LOCATION:Estadio municipal Fernando Mazuera\, Fusagasugá
…
END:VEVENT
END:VCALENDAR
```

En la app, «Suscribirme a la agenda» abre `webcal://…/v1/eventos.ics` o Google Calendar con ese enlace; el calendario se actualiza solo cada 6 horas.

### 5. Rutas y GPX

```bash
curl "https://fusa-conecta-api.onrender.com/v1/rutas"
```

```json
{ "total": 3, "resultados": [
  { "id": "c22", "nombre": "Sendero Cara del Indio por el Camino Real del Quininí", "dificultad": "Media",
    "distancia_km": 3.98, "desnivel_m": 421, "trazado_real": true, "puntos": 200,
    "fuente": "OpenStreetMap (© OpenStreetMap contributors, ODbL)…",
    "gpx": "https://fusa-conecta-api.onrender.com/v1/rutas/c22.gpx" },
  { "id": "c21", "nombre": "Sendero al Cerro Fusacatán", "trazado_real": false, "puntos": 0, "gpx": null }
]}
```

```bash
curl -o cara-del-indio.gpx "https://fusa-conecta-api.onrender.com/v1/rutas/c22.gpx"
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fusa Conecta (https://fusa-conecta.web.app)" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Sendero Cara del Indio por el Camino Real del Quininí</name>…</metadata>
  <trk><name>…</name><trkseg>
      <trkpt lat="4.335865" lon="-74.484855"><ele>1488</ele></trkpt>
      …
```

Para una ruta sin trazado real: `404 {"error":"Esta ruta aún no tiene trazado real (trazado en preparación)","estado":404}`.

### 6. Números de emergencia

```bash
curl "https://fusa-conecta-api.onrender.com/v1/emergencias?municipio=pasca"
```

```json
{ "municipio": "Pasca", "total": 7, "resultados": [
  { "entidad": "Línea única de emergencias", "tipo": "Seguridad", "numero": "123", "detalle": "Policía y emergencias 24 h · opera en Pasca" },
  { "entidad": "Cruz Roja", "tipo": "Salud", "numero": "132", "detalle": "Atención prehospitalaria" }
]}
```

### 7. Reporte del negocio (protegido)

```bash
curl -H "Authorization: Bearer $ID_TOKEN" -o reporte.pdf "https://fusa-conecta-api.onrender.com/v1/comercios/ID/reporte?formato=pdf&mes=2026-10"
```

| Situación | Respuesta |
|---|---|
| Sin token | `401 {"error":"Falta el token: Authorization: Bearer <idToken de Firebase>","estado":401}` |
| Token de otra persona | `403` «Solo el dueño del negocio o un administrador pueden descargar este reporte» |
| Dueño o admin | Archivo `reporte-<negocio>-2026-10.xlsx` o `.pdf` con vistas, toques en WhatsApp y Llamar, cupones obtenidos y canjeados, y el detalle por cupón |

### 8. Estadísticas del admin (protegido)

Respuesta (todos los valores son enteros, salvo la fecha):

```text
negocios_aprobados, negocios_pendientes, usuarios, cupones, cupones_obtenidos, cupones_canjeados,
eventos_publicados, eventos_pendientes, rutas_comunidad, lugares_directorio, generado (fecha ISO)
```

Sin token responde 401 y con token de alguien que no es admin, 403. Cuenta con agregación de Firestore (1 lectura por cada 1000 documentos). La prueba de integración `api/tests/test_integracion.py` la comprueba con tokens del emulador.

### 9. Estado del servicio

```bash
curl "https://fusa-conecta-api.onrender.com/v1/salud"
```

```json
{ "estado": "ok", "version": "1.0.0", "firestore": true, "firestore_ms": 105, "activo_desde_s": 13 }
```

Captura de la documentación interactiva en producción: [capturas/02-api-docs-produccion.png](capturas/02-api-docs-produccion.png).
