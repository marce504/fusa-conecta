# API REST de Fusa Conecta (Python · FastAPI)

Servicios web REST de Fusa Conecta, en **Python 3.12** con **FastAPI**.

- **Datos:** lee Firestore con el SDK de **Firebase Admin**, solo lectura. También lee la misma base local de la PWA (`datos.js`).
- **Respuestas:** JSON, ICS, GPX, Excel y PDF.
- **Documentación:** OpenAPI automática en **`/docs`**.

| | |
|---|---|
| URL | https://fusa-conecta-api.onrender.com (documentación: `/docs`, esquema: `/openapi.json`) |
| Versión | `/v1` |
| CORS | Solo `https://fusa-conecta.web.app` (variable `ORIGENES`) |
| Límite | 60 peticiones por minuto por IP (20 en los endpoints protegidos). Si se supera, responde `429` con `Retry-After` |
| Caché | Las listas públicas se guardan 2 minutos en memoria. El plan Spark permite 50 000 lecturas al día |
| Autenticación | `Authorization: Bearer <idToken>` de Firebase Auth, verificado con `firebase_admin.auth.verify_id_token` |

## Endpoints

| Método y ruta | Qué devuelve | Lo usa la app |
|---|---|---|
| `GET /v1/comercios` | Lugares del directorio. Filtros: `categoria`, `sub`, `municipio`, `abierto`, `q`, `pagina`, `por_pagina` (máx. 50) | — |
| `GET /v1/comercios/{id}` | Ficha pública con horario, estado (abierto o cerrado) y cupones activos | — |
| `GET /v1/eventos` | Agenda: `desde`, `hasta` (AAAA-MM-DD), `categoria`, `tipo=plan\|aviso` | — |
| `GET /v1/eventos.ics` | Calendario suscribible (iCalendar, RFC 5545) | Agenda → **Suscribirme a la agenda** |
| `GET /v1/rutas` | Rutas con distancia, desnivel y si tienen trazado real | — |
| `GET /v1/rutas/{id}.gpx` | Trazado en GPX 1.1 (404 si aún está «en preparación») | Ficha del sendero → **Descargar GPX** |
| `GET /v1/emergencias?municipio=fusagasuga\|pasca` | Números de emergencia | — |
| `GET /v1/comercios/{id}/reporte?formato=xlsx\|pdf&mes=AAAA-MM` | Reporte del mes: vistas, toques en WhatsApp y Llamar, cupones obtenidos y canjeados. **Solo el dueño o el admin** | Panel del negocio → **Descargar reporte** |
| `GET /v1/admin/estadisticas` | Totales de negocios, usuarios, cupones, canjes, eventos y rutas. **Solo admin** | — |
| `POST /v1/notificaciones/aprobacion` | Avisa a la persona que el admin aprobó o rechazó lo que envió: novedad en su campana y push (FCM) a sus celulares. **Solo admin** | Panel admin → al aprobar o rechazar |
| `GET /v1/salud` | Estado del servicio y de Firestore | Panel → **Diagnóstico** |

Ejemplos:

```bash
curl "https://fusa-conecta-api.onrender.com/v1/comercios?q=panaderia&abierto=true"
```

```bash
curl "https://fusa-conecta-api.onrender.com/v1/eventos?tipo=plan&desde=2026-11-01&hasta=2026-11-30"
```

```bash
curl -o cara-del-indio.gpx "https://fusa-conecta-api.onrender.com/v1/rutas/c22.gpx"
```

```bash
curl -H "Authorization: Bearer $ID_TOKEN" -o reporte.xlsx "https://fusa-conecta-api.onrender.com/v1/comercios/ID/reporte?formato=xlsx&mes=2026-10"
```

### Reglas que replica de la app

- **Directorio:** la base local de `datos.js`, menos los lugares que el admin ocultó, más los aprobados en Firestore. Si un lugar está en las dos, gana la nube.
- **Bares:** solo salen con `categoria=bares`, porque la app los muestra únicamente a mayores de edad.
- **Lo privado nunca sale:** la cuenta de servicio salta las reglas de Firestore, así que el código filtra igual que `firestore.rules`: solo comercios `aprobado`, eventos `publicado` y rutas `aprobada`. Los eventos de ejemplo (`demo`) nunca salen.
- **Funciones traducidas desde `app.js`:** estado abierto o cerrado (hora de Colombia, UTC-5) y búsqueda sin tildes ni plurales. Están en `app/utilidades.py`, con pruebas.

## Estructura

```
api/
  app/main.py           FastAPI: endpoints, CORS, límite de peticiones, autenticación
  app/servicios.py      reglas de negocio (directorio, agenda, rutas, emergencias, reporte)
  app/repositorio.py    lectura de Firestore con caché (interfaz para probar sin Firestore)
  app/utilidades.py     horarios, búsqueda, avisos y fechas de Colombia (funciones puras)
  app/formatos.py       GPX, ICS, Excel (openpyxl) y PDF (ReportLab)
  app/datos_base.json   copia de datos.js y rutas/ (la genera exportar_datos.mjs)
  exportar_datos.mjs    node api/exportar_datos.mjs  (--comprobar en la integración continua)
  tests/                pytest: unitarias, API con repositorio falso e integración con el emulador
```

Si cambias `datos.js` o `rutas/`, actualiza la copia de la API:

```bash
node api/exportar_datos.mjs
```

## Ejecutar en local

```bash
cd api
```

```bash
python -m venv .venv
```

```bash
.venv/Scripts/pip install -r requirements-dev.txt
```

Con los emuladores de Firebase (nunca con datos de producción), en dos terminales:

```bash
firebase emulators:start --only firestore,auth --project fusa-conecta
```

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8099 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 ORIGENES=http://localhost:5510 .venv/Scripts/uvicorn app.main:app --port 8000
```

Abre http://127.0.0.1:8000/docs. Para que la PWA local use esta API, abre `http://localhost:5510/?emulador&api_local`.

## Pruebas

```bash
.venv/Scripts/python -m pytest -v
```

Las pruebas de integración usan el emulador. Corren solo si están las variables `FIRESTORE_EMULATOR_HOST` y `FIREBASE_AUTH_EMULATOR_HOST`; si no, se saltan.

## Despliegue gratuito: Render

| Opción | Costo | Por qué |
|---|---|---|
| **Render (elegida)** | Gratis: 750 h al mes, sin tarjeta | Servidor Python normal (uvicorn): el límite de peticiones y la caché funcionan. **Se duerme tras 15 minutos sin uso**: la primera petición tarda de 30 a 60 s en despertarlo, y la app lo avisa |
| Vercel (funciones Python) | Gratis (Hobby, uso no comercial) | Arranca más rápido, pero cada petición puede caer en una instancia nueva: el límite de peticiones y la caché en memoria casi no sirven |
| Google Cloud Run | Capa gratuita generosa | **Exige el plan Blaze**: hay que vincular una cuenta de facturación con tarjeta. El proyecto está en el plan Spark, así que no se usa |

### Pasos (los hace la dueña del proyecto; unos 10 minutos)

1. **Cuenta de servicio de solo lectura.** Usa una distinta a la de la agenda, que sí escribe.
   1. Entra a https://console.cloud.google.com/iam-admin/serviceaccounts?project=fusa-conecta → **Crear cuenta de servicio** → nombre `api-solo-lectura` → **Crear y continuar**.
   2. Rol: **Cloud Datastore Viewer** (solo lee Firestore) → **Continuar** → **Listo**.
   3. Ábrela → **Claves** → **Agregar clave** → **Crear clave nueva** → **JSON**. Se descarga un archivo.
2. **Render.**
   1. Entra a https://dashboard.render.com con tu cuenta de GitHub → **New** → **Blueprint** → elige `marce504/fusa-conecta`. Render lee `render.yaml`.
   2. Te pide `FIREBASE_SA`: pega **todo** el contenido del archivo JSON del paso 1 → **Apply**.
   3. Borra el archivo JSON de tu computador.
3. En unos 5 minutos responde https://fusa-conecta-api.onrender.com/v1/salud con `"estado": "ok"`. Desde entonces, cada `git push` que cambie `api/` lo vuelve a desplegar.

Si Render asigna otra dirección (por ejemplo, porque `fusa-conecta-api` ya está tomado), cámbiala en `API_URL` de `app.js`, `sw.js` y `render.yaml`.

### Avisos al celular (FCM): segunda cuenta de servicio `FIREBASE_SA_FCM`

`POST /v1/notificaciones/aprobacion` escribe la novedad en `usuarios/{uid}/notificaciones`, borra los tokens que ya no
sirven y envía el push con Firebase Cloud Messaging. Por eso necesita una cuenta **aparte** de la de solo lectura.
Sin ella, el endpoint responde 503 y el panel admin sigue funcionando igual, solo que sin avisos.

Pasos (los hace la dueña del proyecto; unos 10 minutos):

1. **Activa la API de FCM.** Entra a https://console.cloud.google.com/apis/library/fcm.googleapis.com?project=fusa-conecta.
   Si dice **Habilitar**, tócalo. Si dice **Administrar**, ya está activa.
2. **Crea la cuenta.** Entra a https://console.cloud.google.com/iam-admin/serviceaccounts?project=fusa-conecta →
   **Crear cuenta de servicio** → nombre `api-avisos`, descripción «Avisos al celular de la API» → **Crear y continuar**.
3. **Dale dos roles** (en «Otorga a esta cuenta de servicio acceso al proyecto», con **Agregar otro rol**):
   - **Firebase Cloud Messaging API Admin**: solo para enviar avisos.
   - **Cloud Datastore User**: para escribir la novedad y borrar los tokens viejos.

   Toca **Continuar** → **Listo**.
4. **Crea la clave.** Abre `api-avisos` → pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → **JSON** →
   **Crear**. Se descarga un archivo.
5. **Guárdala en Render.** Entra a https://dashboard.render.com → `fusa-conecta-api` → **Environment** →
   **Add Environment Variable**. Escribe Key `FIREBASE_SA_FCM` y en Value pega **todo** el contenido del JSON →
   **Save, rebuild, and deploy**.
6. **Borra el archivo JSON** de tu computador. No lo subas a GitHub ni lo pegues en el código.
7. **Comprueba.** Aprueba algo de prueba en el panel admin. Debe salir «Aprobado. Le avisamos a … en su celular» o
   «Aprobado. Verá el aviso en la campana de Novedades».

**Límite de los permisos.** IAM no permite limitar «Cloud Datastore User» a algunas colecciones: la cuenta podría
escribir en todo Firestore. Para compensarlo:
- la clave vive solo en Render;
- `app/avisos.py` es el único código que la usa, y solo escribe en `usuarios/{uid}/notificaciones` y
  `usuarios/{uid}/dispositivos`. La prueba `test_repositorio_firestore_solo_escribe_novedades_y_dispositivos` lo
  comprueba;
- las demás lecturas de la API siguen con la cuenta de solo lectura (`FIREBASE_SA`).

**Clave VAPID (opcional).** La PWA usa la clave pública por defecto de Firebase. Para usar una propia:
1. Ve a la consola de Firebase → ⚙ **Configuración del proyecto** → **Cloud Messaging** → **Certificados push web** →
   **Generar par de claves**.
2. Copia la clave **pública** en `AVISOS.vapid` de `app.js`.

La privada se queda en Firebase y nunca va en el código. Al cambiar de clave, los celulares registran un token nuevo
la próxima vez que abren la app.
