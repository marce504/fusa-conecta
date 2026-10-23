# Agenda casi automática con IA (Fase 4.2)

## ¿Es viable con el plan gratuito (Spark)?

**Sí.** No hace falta Cloud Functions ni el plan Blaze:

- El proceso corre en **GitHub Actions** (gratis: repositorios públicos sin límite; privados 2.000 minutos al mes; esta tarea tarda menos de 1 minuto).
- Escribe en Firestore con el **SDK de administración** usando una cuenta de servicio (funciona en Spark). Son pocas escrituras al día, muy por debajo del límite gratuito (20.000 escrituras diarias).
- La IA es la **API de Gemini** en su capa gratuita (modelo Flash). Una corrida diaria usa entre 0 y 20 llamadas.
- **Costo estimado: $0.** Si se prefiere la API de Claude en lugar de Gemini, costaría centavos de dólar al mes (pocas llamadas cortas), pero ya no sería $0.

Todo lo que encuentra queda con `estado: 'pendiente'` y `origen: 'ia'`. Se aprueba en **Panel de administración → Eventos** con un toque: Publicar, Editar o Descartar.

## Fuentes revisadas (2026-10-23)

| Fuente | Qué ofrece | ¿Se usa? |
|---|---|---|
| Sitio oficial de la Alcaldía `https://www.fusagasuga.gov.co` | Plataforma "Sitios Territoriales" (gov.co) con **API JSON pública**: `GET /api/v1/contents?keyword=…&pageSize=20` (máx. 20 por página). Trae contenidos tipo **Event** (con `startingDate`, `closingDate`, lugar `EventLocation` y organizador `EventHost`) y **Article** (noticias). Tiene las etiquetas "Calendario de actividades" (id 3) y "Noticias" (id 1). | **Sí**: los Event se toman directo (sin IA); las noticias de los últimos 30 días pasan por la IA. |
| `fusagasuga-cundinamarca.gov.co` | No responde. | No |
| RSS / ICS oficiales | No se encontraron. | — |
| Facebook / Instagram de la Alcaldía o la Secretaría de Cultura | Sus términos prohíben extraer datos automáticamente. | **No** (se pueden publicar a mano desde el panel) |
| Bandsintown y portales comerciales | Listados de terceros, sin licencia clara. | No |

Prueba hecha hoy con `node extraer.mjs --simular`: 130 contenidos leídos, **0 eventos estructurados con fecha futura** y 3 noticias recientes para la IA. La Alcaldía publica pocos eventos en su sitio; conviene pedirle a la **Secretaría de Cultura** que use el "Calendario de actividades" del sitio oficial o que publique un calendario en formato ICS. Cualquier fuente nueva (ICS/RSS) se agrega en `herramientas/agenda-ia/extraer.mjs`.

## Cómo activarlo

1. **Clave de la IA**: en https://aistudio.google.com crea una API key de Gemini (gratis).
2. **Cuenta de servicio de Firebase**: Consola de Firebase → Configuración del proyecto → Cuentas de servicio → *Generar nueva clave privada*. Descarga el JSON (no lo subas al repositorio).
3. En GitHub: repositorio `marce504/fusa-conecta` → Settings → Secrets and variables → Actions → *New repository secret*:
   - `GEMINI_API_KEY` = la clave del paso 1.
   - `FIREBASE_SA` = todo el contenido del JSON del paso 2.
4. Prueba: pestaña **Actions → Agenda con IA → Run workflow**. Revisa los pendientes en el panel.
5. Para que corra solo cada día a las 6:00 a. m., quita el `#` de las líneas `schedule` en `.github/workflows/agenda-ia.yml`.

Las claves **nunca** van en el código de la app: solo en los secretos de GitHub.

## Detalles

- Duplicados: compara título + fecha + lugar (sin tildes ni mayúsculas) contra todos los eventos de hoy en adelante y dentro de la misma corrida.
- La IA solo recibe texto público del sitio oficial y debe responder JSON; no inventa datos (sin hora → 9:00 a. m.; sin fin → 2 horas después) y nada se publica sin revisión humana.
- Probar sin claves: `cd herramientas/agenda-ia && node extraer.mjs --simular`.
