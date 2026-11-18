# Traspaso: qué queda pendiente en Fusa Conecta (18 de noviembre de 2026)

Este archivo es para abrir una **sesión nueva de Claude Code** (en otra cuenta) y seguir donde quedamos.
Pega esto al empezar:

> Lee `docs/PENDIENTES-traspaso.md` del repositorio y continúa con las tareas pendientes en orden.
> Respóndeme siempre en español. Detente al final de cada parte y muéstrame qué cambió antes de publicar.

---

## 1. Contexto del proyecto

- **Qué es:** Fusa Conecta, una PWA (app web instalable) con el directorio de comercios, turismo, agenda, emisora y
  emergencias de Fusagasugá y Pasca. Es un proyecto de estudiantes del SENA (Análisis y Desarrollo de Software) con
  sentido social.
- **Carpeta:** `D:\TEC ANALISIS DESARROLLO SOFTWARE\Analisis\Fusa Conecta\app2`
- **GitHub:** `marce504/fusa-conecta`, rama `main`.
- **Cómo se publica:**
  1. Hacer commit y `git push origin main`.
  2. `git branch -f develop main` y `git push origin develop`.
  3. Desplegar el hosting:
     `npx --yes firebase-tools@13.29.1 deploy --only hosting --project fusa-conecta --non-interactive`
     Agrega `,firestore:rules` a `--only` si cambiaste `firestore.rules`.
  - **App:** https://fusa-conecta.web.app
  - **API (FastAPI en Render):** https://fusa-conecta-api.onrender.com. Se despliega sola cuando cambia algo en `api/**`.
- **Versión de la PWA:** cada vez que publiques, sube el número en `?v=` de `index.html` (son 4 apariciones) y
  `VERSION` en `sw.js`. Ahora están en **v86** y `fusa-v79`.

## 2. Reglas que la usuaria (Marcela) exige siempre

1. **Siempre en español.**
2. **Nunca publicar a producción sin su permiso explícito.** Ella responde «Sí, publícalo».
3. **DETENTE al final de cada parte.** Muestra qué cambió y pide permiso antes de publicar.
4. **Cada parte termina con sus pruebas, el `CHANGELOG.md` y el despliegue.**
5. No cambies la inicialización de Firebase ni los listeners que ya funcionan.
6. **Ninguna llave o secreto en el código del cliente:**
   - todo secreto va en GitHub Secrets o en Render;
   - nunca crees ni pegues llaves tú.
7. El rol **admin** solo se asigna desde la consola de Firebase, nunca desde la app.
8. **Diseño:**
   - paleta «Orquídea»;
   - fuente Poppins;
   - íconos Lucide;
   - **nada de emojis**.
9. **Seguridad:**
   - toda regla de seguridad vive en `firestore.rules`, nunca solo en el JavaScript;
   - plan Spark gratuito, así que **NO** uses Cloud Functions;
   - los ajustes de seguridad de la consola (por ejemplo App Check) los cambia ella, no tú.
10. Para probar flujos con sesión, usa el **Firebase Emulator Suite**, nunca cuentas reales.
11. La clave de la IA nunca va en la app, solo en los secretos.
12. **No hagas scraping de Facebook ni de Instagram.**
13. **Regla de oro:** no inventes negocios, horarios, teléfonos ni rutas.
    - Todo dato nuevo debe venir de una fuente verificable y quedar en el campo `fuentes`.
    - Mejor una sección corta y verdadera que una llena de datos falsos.

## 3. Pruebas (todas deben pasar antes de publicar)

| Qué | Dónde se corre | Comando | Resultado actual |
|---|---|---|---|
| Unitarias | `app2/` | `npx vitest run` | 85 pruebas |
| End-to-end | `app2/` | `npx --yes firebase-tools@13.29.1 emulators:exec --only firestore,auth --project fusa-conecta "npx playwright test"` | 13 pruebas |
| API | `api/` | `.venv/Scripts/python -m pytest -q` | 74 pasan, 5 saltadas |
| Automatización | `automatizacion/` | `../api/.venv/Scripts/python -m pytest -q` | 34 pasan, 3 saltadas |
| Estilo | `app2/` | `npx eslint .` y `npx prettier --check .` | sin errores |
| Estilo Python | `app2/` | `black --check` y `flake8` sobre `api` y `automatizacion` | sin errores |

## 4. Datos importantes del código

- **`datos.js`:** tiene `COMERCIOS_BASE`, un objeto JSON por línea (541 lugares).
  - Campos: `fuentes`, `verificado`, `foto_credito`, `sub`/`tipo`, `ubicacion_aprox`, y `lat:null` si no hay
    coordenadas.
  - Después de cambiarlo, corre `npm run datos:api`, que regenera `api/app/datos_base.json`.
- **Agenda automática:** `automatizacion/agenda.py`, que corre en GitHub Actions (`.github/workflows/agenda.yml`).
  Los programas de festivales van en `automatizacion/programas/*.json`.
- **IA:** la app usa Firebase AI Logic y, si falla, la API `POST /v1/ia/generar` (archivo `api/app/ia.py`).

## 5. TAREAS PENDIENTES (en este orden)

### 5.1 Video promocional con voz real (HECHO el 18-nov-2026; falta solo agregar las funciones nuevas)

- Listo: `video-publicitario/FusaConecta_Video_2026-11.mp4` (76 s) con las 13 voces de ElevenLabs en la voz **Daniela** (voice_id `NUEuVCKSYxEA5YrK3kmx`, español latino neutro; a Marcela no le gustó el acento de Lina, que quedó en `video-publicitario/voz-lina`), plan Starter pagado, y la Cascada San Gabriel (foto propia de Marcela, `img/comercios/cascada-san-gabriel.jpg`, crédito «Foto: equipo Fusa Conecta»).
- Las fotos de `rutas/` son **propias de Marcela** (al principio dijo por error que eran de Google Maps): sí se pueden usar.

Notas anteriores:

- **Generador:** `herramientas/difusion/video-promocional.mjs`
  - Guion: `herramientas/difusion/video-guion.json`, con 13 frases.
  - Tabla de narración: `docs/difusion/video-guion.md`.
- **Voz:** ElevenLabs, voz «Lina - Colombian Warm & Confident» (voice_id `yfUfwZTRubVrsUZWqzwp`, modelo
  `eleven_multilingual_v2`).
- **Audios ya descargados** en `video-publicitario/voz/`:
  03-busca, 04-contacta, 05-ia, 06-turismo, 07-agenda, 08-radio, 09-sos, 11-sena, 12-cierre.
- **Faltan 4 audios.** ElevenLabs bloqueó la cuenta gratuita con el aviso «Unusual activity… Free Tier access has been
  disabled»:
  - `00-pregunta.mp3`
  - `01-marca.mp3`
  - `02-comercios.mp3`
  - `10-negocios.mp3`

  Las frases exactas de cada uno están en `video-guion.json`. Marcela debe hacer una de estas dos cosas:
  - pasar a un plan pago de ElevenLabs y generar esas 4 frases con la misma voz;
  - generarlas ella en la web de ElevenLabs y guardarlas con esos nombres en `video-publicitario/voz/`.
- **Cambio pedido en la escena de turismo:** quitar la Iglesia de Belén y poner una **cascada**.
  - Se cambia en la lista `FOTOS` dentro de `video-promocional.mjs`.
  - Ya se buscó en Wikimedia Commons y no hay fotos libres de cascadas de Fusagasugá.
  - Pídele a Marcela una foto propia o una con permiso del autor, y su crédito.
  - Las fotos de `rutas/cascada de los deseos`, `rutas/cascada san gabriel` y `rutas/sendero San Rafael` vienen de
    Google Maps, de otras personas.
    - **No se pueden usar ni subir a git** sin el permiso de cada autor.
    - Sirven solo como referencia, por ejemplo para saber que existe la Cascada San Gabriel.
  - Cambia también la frase de turismo en el guion para que diga «cascadas». Eso exige regenerar `06-turismo.mp3`.
- **Resumir las funciones nuevas en el video.** Hazlo cuando estén hechas las partes de 5.3: agrega una o dos escenas
  con sus frases.
- **Insumos en la carpeta temporal de la sesión anterior.** Puede que ya no exista; si es así, recréalos:
  - capturas de la app de 390 × 844 a 2x: 02-busqueda, 03-ficha-restaurante, 05-agenda, 06-asistente, 07-sos,
    08-planes y 10-radio;
  - la música, que es el audio de `video-publicitario/FusaConecta_Video_Publicitario.mp4` sacado a WAV.
- **ffmpeg:** está en
  `C:\Users\Marcela\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe`.
  En esta versión `-filter_complex_script` ya no existe; usa `-/filter_complex <archivo>`.
- **Para armarlo:**
  `node herramientas/difusion/video-promocional.mjs <app2> <capturas> <musica.wav> <app2>/video-publicitario/voz <app2>/video-publicitario/FusaConecta_Video_2026-11.mp4 <ffmpeg.exe>`
  Córrelo en segundo plano. Con `MUESTRAS=3,12` antes del comando solo guarda esos fotogramas para revisarlos.
- La carpeta `video-publicitario/` **no está en git**. No la subas.

### 5.2 Parte 1: Cascadas en la sección Turismo (PUBLICADA el 18-nov-2026, commit 903df59, PWA v87)

- Publicado: tipo `cascada`, ficha `c589` Parque Natural San Rafael con 6 fotos en `img/turismo/san-rafael/`, arreglo de la galería. San Gabriel y de los Deseos quedaron dentro de esa ficha (sin fuente pública para fichas propias).

Notas anteriores:

- Hecho, sin commit: tipo `cascada` en `SUBCATS.turismo` (datos.js), ícono `droplets`, `TIPOS_NATURALES` incluye cascada (sin abierto/cerrado) y prueba unitaria (86 pasan). Foto lista: `img/comercios/cascada-san-gabriel.jpg`.
- Falta: los datos de cada cascada. En internet solo se verifica que el Parque Natural San Rafael está en la vereda La Aguadita (Semana); «San Gabriel» y «de los Deseos» no aparecen en fuentes públicas. Marcela las visitó (fotos propias): pedirle vereda, cómo llegar, si están dentro del parque, si se paga entrada y un punto de Google Maps. Su visita queda como fuente («Visita del equipo Fusa Conecta, fecha»).

- Agrega a `datos.js` cascadas reales de Fusagasugá, con `fuentes` verificables y `ubicacion_aprox: true` si no hay
  coordenadas exactas. Puede convenir un tipo nuevo «cascada» dentro de turismo; revisa cómo se filtran los `tipo` en
  la app.
- **Fuentes encontradas:**
  - **Cascada de los Deseos:** está en la ruta La Aguadita – Parque Natural San Rafael, a 2.406 m. Fuente:
    https://es.wikiloc.com/waypoints/493Zg9/cascada-de-los-deseos
  - **Parque Natural San Rafael:** vereda San Rafael, La Aguadita. Fuente sin leer todavía:
    https://caminatasecologicasbogota.com/parque-san-rafael-fusagasuga/
  - **Salto del Duende:** mencionado por la revista Semana.
  - **Cascada del Cacique:** en el Parque Verde & Agua, según minube.
- Antes de incluir cada cascada, verifícala. No inventes horarios ni precios.
- Termina la parte con pruebas, CHANGELOG, commit y despliegue **después de que Marcela apruebe**.

### 5.3 Las otras 9 funciones nuevas (una parte por vez, deteniéndose en cada una)

Para todas: solo datos verificables, reglas en `firestore.rules` y nada de Cloud Functions.

1. **(PUBLICADO 18-nov, commit ad4cea8, PWA v88) Abierto de noche y droguerías de turno.** Filtro «De noche» (`abreDeNoche`), sección Droguerías en SOS, turno solo publicado por el admin con fuente https en `config/turno_droguerias`.
   - Agrega un filtro sobre los horarios que ya existen.
   - El turno de droguerías debe venir de una fuente oficial; si no la hay, no lo inventes.
2. **(PUBLICADO 18-nov, commit 87c1a68, PWA v89 / API v1.4.0) Alertas municipales como notificación push.** `alertas/{id}` + `POST /v1/alertas/enviar`; el push necesita `FIREBASE_SA_FCM` en Render.
   - Usa FCM desde la API de Render, porque no se pueden usar Cloud Functions.
   - Hace falta el secreto `FIREBASE_SA_FCM` en Render, y lo configura Marcela.
   - Solo el admin puede crear alertas.
3. **(PUBLICADO 18-nov, commit c4b5483, PWA v90) Horarios de transporte.** Pantalla «Cómo moverse» y Panel → Transporte; sin fuente oficial pública, solo horarios publicados por el admin con fuente y fecha. Solo con datos verificados de las empresas o de la terminal.
4. **(HECHO 18-nov, PWA v91; ver git log si ya se publicó) Oficios y servicios a domicilio con calificaciones.** `a_domicilio` y `zona_cobertura` en comercios, filtro «A domicilio», regla contra autocalificarse.
   - Las reseñas solo pueden venir de usuarios con sesión.
   - Una reseña por usuario, con la regla en `firestore.rules`.
5. **Mercado campesino.** Fechas y lugar deben venir de una fuente oficial.
6. **Pedidos por WhatsApp desde un menú:** el comercio carga su menú y el cliente arma un mensaje de WhatsApp.
7. **Mascotas y objetos perdidos:**
   - publicaciones con sesión iniciada;
   - que vencen solas;
   - que el admin puede moderar.
8. **Empleos locales:** publicados por los comercios, con moderación y vencimiento.
9. **Rutas turísticas, cajeros, parqueaderos y pico y placa.** El pico y placa debe salir de un decreto oficial de la
   Alcaldía.

### 5.4 Cosas que debe hacer Marcela (no las hagas tú)

- Agregar `GEMINI_API_KEY` en Render. Es la IA de respaldo; App Check se vuelve obligatorio el 21 de enero de 2027.
- Agregar `FIREBASE_SA_FCM` en Render, para las alertas push.
- Generar los 4 audios que faltan (ver 5.1).
- Opcional: publicar la app en Google Play.

## 6. Último estado de git

- **Último commit publicado:** `c4b5483`, en producción como v90 (`fusa-v83`), API v1.4.0.
- Todo lo de la sección 5 está **sin hacer**, salvo los 9 audios descargados.
