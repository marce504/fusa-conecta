# IA para la agenda de eventos (v6 · Fase 2, v7 · Fases 1 y 2)

Todo lo que crea o propone la IA llega como evento **pendiente** (`origen: 'ia'`) y se aprueba en
**Panel de administración → Eventos** con un toque (Publicar · Editar · Descartar). Excepción: si lo llena con IA
el admin o un organizador confiable, ellos mismos lo publican después de revisarlo.

## 2.1 "Llenar con IA desde un afiche o texto" (en la app, plan Spark, costo $0)

- Está en el formulario de evento del admin, de los organizadores y de los negocios.
- Usa **Firebase AI Logic** (SDK web `firebase/ai` 12.19.0) con la **Gemini Developer API** (modelo `gemini-flash-lite-latest`, el único que respondió en la prueba real del 2026-10-28; tiempo límite de 25 s) y salida estructurada (schema) con los campos de `eventos`. La clave la guarda Firebase: no está en el código.
- Se carga solo al usarla, en una app de Firebase aparte con la misma configuración (la inicialización principal no cambia).
- Límite: **20 usos por persona al día** (`uso_ia/{uid}`, validado en `firestore.rules`). Si falla o no está activada, el formulario sigue a mano.

### Activarla (lo hace la dueña del proyecto en la consola; 5 minutos)

1. https://console.firebase.google.com/project/fusa-conecta/ailogic → **Get started** → elige **Gemini Developer API** (sin costo, plan Spark). Firebase crea y protege la clave.
2. **App Check**: por ahora **no se usa**. Google retiró el reCAPTCHA clásico y su reemplazo (Fraud Defense / reCAPTCHA Enterprise) pide una cuenta de facturación. En el plan Spark no hay cobros: lo peor es que se gaste el cupo diario gratis y ese día el formulario se llene a mano. Si el proyecto pasa a un plan con facturación, se activa con `ReCaptchaEnterpriseProvider` y la clave de sitio va en `IA.recaptcha`.
3. Opcional: en AI Logic → Settings pon un límite de solicitudes por usuario por minuto.

Capa gratuita de Gemini (Developer API): límites por minuto y por día por proyecto; con 20 usos por persona al día y pocas personas que publican eventos queda muy por debajo. Si algún día se supera, la IA responde con error y el formulario sigue a mano.

## 2.2 Agenda automática desde fuentes oficiales (GitHub Actions, costo $0)

`automatizacion/agenda.py` (Python 3.12; hasta la Fase 3 era `herramientas/agenda-ia/extraer.mjs`, con el mismo comportamiento) + `.github/workflows/agenda.yml` (el repositorio es público: GitHub Actions no cobra minutos). Ver `automatizacion/LEEME.md`.

- **Todos los días a las 6:00 a. m.** (hora de Colombia) y a mano (*Run workflow*).
- **«Buscar eventos ahora»** en Panel → Eventos → Agenda automática: deja un pedido en `config/agenda_auto` y el proceso, que revisa cada 15 minutos, lo toma. La app no guarda ninguna clave de GitHub.
- **Publicación automática**: si la fuente es una alcaldía (`fusagasuga.gov.co`, `pasca-cundinamarca.gov.co`) y el evento tiene título, día **y hora**, y lugar exacto, se publica solo con la etiqueta **«Fuente oficial»**. Si falta algo, o la fuente es IDECUT, queda **pendiente** para el admin.
- **Sin duplicados**: título + día + lugar, o el mismo lugar a la misma hora, contra todo lo que ya existe (publicado, pendiente o descartado). Una noticia con varias actividades crea un evento por cada lugar y hora distintos.
- **Títulos de máximo 60 caracteres** (v8): Gemini devuelve `titulo_corto` y la campaña aparte; la campaña va al inicio de la descripción («Hace parte de: Semana de Acción contra el Mosquito.»). Los eventos estructurados del sitio se acortan cortando en « - » o «: » y sin palabras de enlace al final.
- **Plan o aviso** (v8, campo `tipo`): los planes (cultura, música, deporte, feria, gastronomía, religioso) salen en «Qué hacer en Fusa» y en el banner; los **avisos del municipio** (jornadas de salud, vacunación, lavado de tanques, fumigación, cortes de servicio) solo en el filtro «Avisos del municipio» de la Agenda y en la campana de Novedades. La app aplica la misma lista de palabras a los eventos anteriores sin `tipo`.
- **Imagen** (v8): la imagen principal de la noticia (`defaultImage` de la API gov.co, o `og:image` de la página) se baja y se guarda en WebP de máximo 200 KB, igual que las fotos que suben las personas. Va aparte, en
  `eventos/{id}/fotos/0`, y el evento lleva `con_foto: true` (v102): dentro del evento, la app bajaba todas las fotos
  de la agenda al abrir. Cada corrida pasa a `fotos/0` las fotos que aún estén dentro de un evento (`mover_fotos`). Si no hay o el sitio no responde, la app muestra una ilustración de línea con el color de la categoría, y la siguiente corrida lo vuelve a intentar.
- **Reparación** (v8): cada corrida completa arregla los automáticos guardados antes (título corto, `tipo`, imagen). Solo eso, sin leer los sitios: `python automatizacion/agenda.py --reparar`.
- **Eventos de ejemplo**: cada corrida (también las de cada 15 minutos) borra los `demo:true` con más de 24 horas. El panel del admin también los borra al abrirse.
- Al terminar escribe el resumen en `config/agenda_auto` (fecha, fuentes leídas, encontrados, publicados, pendientes, ya existían), que el panel muestra.
- Sin los secretos termina en segundos sin hacer nada.

### Fuentes revisadas el 2026-10-28

| Fuente | Resultado |
|---|---|
| Alcaldía de Fusagasugá `https://www.fusagasuga.gov.co` (API JSON pública de la plataforma gov.co: búsqueda `/api/v1/contents?keyword=…` y detalle `/api/v1/contents/{nombre}` con el texto completo) | **Funciona.** 387 contenidos con 22 palabras clave; 0 eventos estructurados con fecha futura y **13 noticias de los últimos 30 días** que lee la IA. |
| Alcaldía de Pasca `https://www.pasca-cundinamarca.gov.co` (misma plataforma y API) | **Funciona.** 527 contenidos; hoy 0 eventos futuros (Zoratama y Reyes de la Papa ya pasaron) y 0 noticias recientes. |
| IDECUT, Cultura y Turismo de Cundinamarca `https://www.idecut.gov.co` (misma plataforma) | **Funciona.** 19-21 contenidos que mencionan Fusagasugá, Pasca o Sumapaz; hoy ninguno futuro. Siempre quedan pendientes (no es una alcaldía). |
| RSS / ICS | No existen: esas direcciones devuelven la página del sitio. |
| datos.gov.co | No hay agenda cultural de Fusagasugá, Pasca ni Cundinamarca (solo Cali 2018 y Chía). |
| Facebook / Instagram | **No se usan.** |

**Primera corrida (estimada el 2026-10-28** pasando esas 13 noticias por el mismo modelo e instrucción): **6 eventos futuros → 5 se publican solos** (Semana de Acción contra el Mosquito: jornadas con día, hora y barrio) **y 1 queda pendiente** («Día Dulce», sin hora en la noticia).

### Activarlo (10 minutos)

1. **Clave de Gemini**: https://aistudio.google.com/apikey → **Create API key** → elige el proyecto **fusa-conecta** → copia la clave.
2. **Cuenta de servicio con permisos mínimos** (solo Firestore):
   1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=fusa-conecta → **Crear cuenta de servicio** → nombre `agenda-automatica` → **Crear y continuar**.
   2. Rol: **Cloud Datastore User** (lee y escribe Firestore; nada más) → **Continuar** → **Listo**. No le des "Firebase Admin" ni "Editor".
   3. Abre la cuenta → pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → **JSON**. Se descarga un archivo.
3. GitHub: https://github.com/marce504/fusa-conecta/settings/secrets/actions → **New repository secret** dos veces:
   - Name `GEMINI_API_KEY`, Secret = la clave del paso 1 → **Add secret**.
   - Name `FIREBASE_SA`, Secret = **todo** el contenido del archivo JSON (ábrelo con el Bloc de notas) → **Add secret**.
   - Borra el archivo JSON de tu computador.
4. Primera corrida: https://github.com/marce504/fusa-conecta/actions/workflows/agenda.yml → **Run workflow** → **Run workflow**. Tarda 1-2 minutos. El resultado aparece en la app: Panel → Eventos → Agenda automática.

GitHub pausa los procesos programados de un repositorio público después de 60 días sin cambios: si pasa, en la misma página de Actions aparece **Enable workflow**.

Probar sin claves: `python automatizacion/agenda.py --simular` (con `--imagenes` también baja y comprime las imágenes).

### Qué revisar cuando «no se publican eventos» (2026-11-12)

1. **Panel de administración → Eventos → estado de la agenda automática.** Dice cuándo fue la última búsqueda, cuántos
   contenidos leyó de cada fuente y las últimas líneas del registro.
2. **Si corre pero encuentra 0:** las fuentes no han publicado. El proceso solo lee las alcaldías de Fusagasugá y Pasca
   y el IDECUT. En noviembre de 2026 la Alcaldía de Fusagasugá no publicó nada del festival de cine, así que no había de
   dónde leerlo. Para esos casos están los **programas verificados** (`automatizacion/programas/`), los organizadores
   con cuenta y «Llenar con IA desde un afiche».
3. **Si no corre:** GitHub retrasa u omite los horarios. Se puede lanzar a mano en GitHub → Actions → «Agenda
   automática» → Run workflow. Desde v1.4.1 la revisión periódica recupera la corrida diaria si pasan más de 20 horas.

### «Llamada a la IA» falla en el Diagnóstico con «Firebase App Check token is invalid» (401)

La consola de Firebase está **exigiendo App Check** para Firebase AI Logic y la app no envía ese token (el reemplazo de
reCAPTCHA pide cuenta de facturación; ver 2.1). Mientras esté exigido no funcionan «Pregúntale a Fusa» ni «Llenar con
IA» para nadie. Arreglo, en la consola: **App Check → APIs → Firebase AI Logic → Dejar de aplicar (Unenforce)**. No
es un cambio de código. La agenda automática no se afecta: usa su propia clave en los secretos de GitHub.

### IA de respaldo por la API (v1.4.4, antes del 21 de enero de 2027)

Google anunció que **exigirá App Check en Firebase AI Logic el 21 de enero de 2027**, aunque hoy se haya quitado. La
app no puede usar App Check en el plan Spark. Por eso ahora hace esto:

1. Llama a Gemini con Firebase AI Logic, como siempre: es lo más rápido.
2. Si Firebase responde «App Check token is invalid», pasa por la API de Render (`POST /v1/ia/generar`), y en ese
   teléfono sigue por ahí durante un día. La API verifica la sesión de Firebase, solo acepta los dos usos de la app
   (leer un evento y el asistente), fija el modelo y el largo de la respuesta, y da un cupo de 80 llamadas al día por
   persona (`uso_ia_api/{uid}`, solo la escribe la API).
3. La API del plan gratuito se duerme: la app la despierta al abrir el asistente o el formulario de eventos, y espera
   hasta 80 s en ese camino.

**Lo que hay que hacer una vez (la dueña del proyecto):** en Render → `fusa-conecta-api` → **Environment** → **Add
Environment Variable**: `GEMINI_API_KEY` con la misma clave de Gemini que está en los secretos de GitHub. Guardar y
esperar el redespliegue. El Diagnóstico de la app dice por dónde respondió la IA.

## 2.3 Organizadores

Panel → Eventos → **Invitar organizador** (correo + "Confiable"). La app copia un mensaje para enviarle por correo o WhatsApp.
Cuando esa persona entra con ese correo **verificado** (Google lo verifica solo), su cuenta pasa a "organizador":
publica eventos que quedan por aprobar, o directo si es confiable. "Quitar" le retira el rol. Las reglas impiden que
alguien se ponga ese rol o se marque como confiable sin la invitación.
