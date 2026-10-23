# IA para la agenda de eventos (v6 · Fase 2)

Todo lo que crea o propone la IA llega como evento **pendiente** (`origen: 'ia'`) y se aprueba en
**Panel de administración → Eventos** con un toque (Publicar · Editar · Descartar). Excepción: si lo llena con IA
el admin o un organizador confiable, ellos mismos lo publican después de revisarlo.

## 2.1 "Llenar con IA desde un afiche o texto" (en la app, plan Spark, costo $0)

- Está en el formulario de evento del admin, de los organizadores y de los negocios.
- Usa **Firebase AI Logic** (SDK web `firebase/ai` 12.19.0) con la **Gemini Developer API** (modelo `gemini-flash-lite-latest`; si falla, `gemini-3.8-flash`) y salida estructurada (schema) con los campos de `eventos`. La clave la guarda Firebase: no está en el código.
- Se carga solo al usarla, en una app de Firebase aparte con la misma configuración (la inicialización principal no cambia).
- Límite: **20 usos por persona al día** (`uso_ia/{uid}`, validado en `firestore.rules`). Si falla o no está activada, el formulario sigue a mano.

### Activarla (lo hace la dueña del proyecto en la consola; 5 minutos)

1. https://console.firebase.google.com/project/fusa-conecta/ailogic → **Get started** → elige **Gemini Developer API** (sin costo, plan Spark). Firebase crea y protege la clave.
2. **App Check** (recomendado, para que solo la app use la IA):
   1. En https://www.google.com/recaptcha/admin crea una clave **reCAPTCHA v3** para los dominios `fusa-conecta.web.app` y `fusa-conecta.firebaseapp.com`.
   2. Consola de Firebase → **App Check** → registra la app web con esa clave (proveedor reCAPTCHA v3) y pon la **clave secreta** allí.
   3. La **clave de sitio** de `fusa-conecta.web.app` ya está en `IA.recaptcha` (`app.js`); la app pide el token de App Check solo en ese dominio.
   4. Cuando veas tráfico verificado en App Check → Firebase AI Logic, pulsa **Enforce**.
3. Opcional: en AI Logic → Settings pon un límite de solicitudes por usuario por minuto.

Capa gratuita de Gemini (Developer API): límites por minuto y por día por proyecto; con 20 usos por persona al día y pocas personas que publican eventos queda muy por debajo. Si algún día se supera, la IA responde con error y el formulario sigue a mano.

## 2.2 Agenda automática desde fuentes oficiales (GitHub Actions, costo $0)

`herramientas/agenda-ia/extraer.mjs` + `.github/workflows/agenda-ia.yml`: corre **todos los días a las 6:00 a. m.** (y a mano). Sin los secretos termina sin hacer nada.

### Fuentes revisadas el 2026-10-23

| Fuente | Resultado |
|---|---|
| Alcaldía de Fusagasugá `https://www.fusagasuga.gov.co` (API JSON pública `/api/v1/contents?keyword=…`, plataforma gov.co) | **Funciona.** 128 contenidos leídos; hoy 0 eventos con fecha futura y 3 noticias recientes (pasan por la IA). |
| Alcaldía de Pasca `https://www.pasca-cundinamarca.gov.co` (misma plataforma y API) | **Funciona.** 156 contenidos; **2 eventos futuros reales**: Festival Nacional de Danza Folclórica y Tradicional Zoratama (24 oct.) y Festival de los Reyes de la Papa (25 oct.), ambos en el Parque Principal. |
| datos.gov.co (catálogo Socrata) | No hay agenda cultural de Fusagasugá, Pasca ni Cundinamarca (solo Cali 2018, Chía, Valle). |
| RSS / ICS oficiales | No existen en estos sitios. |
| Facebook / Instagram | **No se usan** (sus términos prohíben extraer datos automáticamente). |

Los eventos con datos estructurados del sitio (tipo "Event": fecha, lugar y organizador) se toman directo, sin IA; las noticias de los últimos 30 días pasan por Gemini. Sin duplicados: título + fecha + lugar contra lo que ya existe.

### Activarlo

1. **Clave de Gemini**: https://aistudio.google.com → *Get API key* (gratis).
2. **Cuenta de servicio con permisos mínimos** (solo Firestore):
   1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=fusa-conecta → *Crear cuenta de servicio* "agenda-ia".
   2. Rol: **Cloud Datastore User** (lee y escribe Firestore; nada más). No le des "Firebase Admin" ni "Editor".
   3. *Claves* → *Agregar clave* → JSON. No la subas al repositorio.
3. GitHub → `marce504/fusa-conecta` → Settings → Secrets and variables → Actions:
   - `GEMINI_API_KEY` = la clave del paso 1.
   - `FIREBASE_SA` = el contenido completo del JSON del paso 2.
4. Prueba: Actions → **Agenda con IA** → *Run workflow*. Los eventos aparecen en el panel → Eventos → Por aprobar.

Probar sin claves: `cd herramientas/agenda-ia && node extraer.mjs --simular`.

## 2.3 Organizadores

Panel → Eventos → **Invitar organizador** (correo + "Confiable"). La app copia un mensaje para enviarle por correo o WhatsApp.
Cuando esa persona entra con ese correo **verificado** (Google lo verifica solo), su cuenta pasa a "organizador":
publica eventos que quedan por aprobar, o directo si es confiable. "Quitar" le retira el rol. Las reglas impiden que
alguien se ponga ese rol o se marque como confiable sin la invitación.
