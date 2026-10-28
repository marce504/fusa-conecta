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

`herramientas/agenda-ia/extraer.mjs` + `.github/workflows/agenda.yml` (el repositorio es público: GitHub Actions no cobra minutos).

- **Todos los días a las 6:00 a. m.** (hora de Colombia) y a mano (*Run workflow*).
- **«Buscar eventos ahora»** en Panel → Eventos → Agenda automática: deja un pedido en `config/agenda_auto` y el proceso, que revisa cada 15 minutos, lo toma. La app no guarda ninguna clave de GitHub.
- **Publicación automática**: si la fuente es una alcaldía (`fusagasuga.gov.co`, `pasca-cundinamarca.gov.co`) y el evento tiene título, día **y hora**, y lugar exacto, se publica solo con la etiqueta **«Fuente oficial»**. Si falta algo, o la fuente es IDECUT, queda **pendiente** para el admin.
- **Sin duplicados**: título + día + lugar contra todo lo que ya existe (publicado, pendiente o descartado).
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

Probar sin claves: `cd herramientas/agenda-ia && node extraer.mjs --simular`.

## 2.3 Organizadores

Panel → Eventos → **Invitar organizador** (correo + "Confiable"). La app copia un mensaje para enviarle por correo o WhatsApp.
Cuando esa persona entra con ese correo **verificado** (Google lo verifica solo), su cuenta pasa a "organizador":
publica eventos que quedan por aprobar, o directo si es confiable. "Quitar" le retira el rol. Las reglas impiden que
alguien se ponga ese rol o se marque como confiable sin la invitación.
