# Pregúntale a Fusa (v7 · Fase 3)

Asistente dentro de la app: la gente pregunta en lenguaje natural ("¿qué está abierto ahora?", "planes para el sábado",
"una ruta fácil", "¿dónde autentico un documento?") y Fusa responde **solo con lugares, eventos, rutas, trámites y números
de emergencia que existen en Fusa Conecta**, con tarjetas que abren su ficha.

- Entrada: tarjeta «Pregúntale a Fusa» en el inicio, y el botón del mismo nombre cuando una búsqueda no encuentra nada.
- Pantalla: vista `asistente` (`renderAsistente` en `app.js`).

## Cómo funciona

1. **Modelo:** Firebase AI Logic con la Gemini Developer API, modelo `gemini-flash-lite-latest` (`IA.modelos[0]`).
   - Funciona en el plan Spark y la clave la guarda Firebase: no va en el código.
   - El SDK se carga solo al usarlo (`moduloIA()`), en una app de Firebase aparte. La inicialización principal no cambia.
2. **Llamadas a funciones:** la IA no recibe la base de datos completa. Pide lo que necesita y la app responde con sus propios datos, los mismos que muestra en pantalla (`FUNCIONES_ASIS`). Las cinco funciones son:

   | Función | Qué devuelve |
   |---|---|
   | `buscarLugares` | Texto, categoría, abierto ahora, cerca de mí y municipio. Respeta la edad para bares. |
   | `eventosEntre` | Eventos publicados entre dos fechas (hora de Colombia), por categoría o solo gratis. |
   | `rutas` | Rutas guiadas con distancia, desnivel, dificultad y duración, más los senderos sin trazado. |
   | `tramites` | Entidades de la categoría Trámites (alcaldía, notarías, comisaría, fiscalía, SENA…). |
   | `emergencias` | Números de Fusagasugá o Pasca, los mismos de la pantalla SOS. |

3. **Instrucción del sistema (`instruccionAsis`):**
   - Incluye la fecha y la hora de Colombia, y las fechas del fin de semana.
   - Respuestas cortas, sin emojis ni markdown, con los números tal como llegan.
   - Nunca inventar nombres, horarios, teléfonos ni precios.
   - En una emergencia, primero indicar el 123.
4. **Tarjetas:** bajo la respuesta van las tarjetas de lo que devolvieron las funciones. Si la IA nombró algunos lugares, solo esos (`tarjetasAsis`).
5. **Tiempos:**
   - Gemini tarda entre 5 y 20 segundos por vuelta, y una pregunta normal necesita 2 vueltas: pedir datos y redactar.
   - Cada vuelta tiene 30 segundos de límite.
   - En cuanto las funciones devuelven datos, las tarjetas aparecen con el aviso «Encontré esto. Estoy escribiendo la respuesta».
   - Si la frase final no llega a tiempo, la respuesta queda solo con las tarjetas.
6. **Memoria:** la conversación vive solo en la pantalla, en `estado.asis`.
   - Para que se entiendan preguntas de seguimiento ("¿y alguno gratis?"), la IA recibe las últimas 6 preguntas y respuestas.
   - Nada se guarda en el servidor ni en el teléfono.

## Límites (los valida `firestore.rules`, colección `uso_asistente/{uid}`)

- **Con cuenta:** 30 preguntas al día.
- **Invitado:** 10 al día. El invitado usa la cuenta anónima del dispositivo, así que el límite es por dispositivo.
- El día es el de Colombia (UTC-5).
- El contador solo sube de a uno, empieza en 1 cada día y la hora la pone el servidor. No guarda el texto de las preguntas.
- Mientras no haya App Check, alguien con conocimientos técnicos podría llamar a la IA sin pasar por el contador.
  - El costo no corre riesgo: el proyecto está en el plan gratuito y Gemini aplica su propia cuota.

## Ubicación y privacidad

- La ubicación se pide solo cuando la pregunta es "cerca de mí".
- La IA nunca recibe coordenadas, solo la distancia en km que calcula el teléfono.
- El Aviso legal tiene la sección «Pregúntale a Fusa».
- Para dictar se usa el micrófono del teclado del celular. La app no graba audio.

## Pruebas

- `rulestest/v7f3.mjs`: 17 pruebas de las reglas del cupo.
- `lh/v7f3.mjs`: recorrido completo en el emulador con la IA real (invitado, sin cupo, con cuenta, seguimiento y tarjetas).

## Ajustes v8

- La nota «Respuesta con IA: confirma horarios y precios antes de ir» solo aparece cuando la respuesta recomienda lugares, eventos o rutas (no en saludos ni en preguntas fuera de tema).
- Los eventos de la agenda automática llevan debajo de su tarjeta el enlace **«Ver fuente oficial»** a la publicación de la alcaldía.
- La instrucción del sistema prohíbe agregar datos que no estén en los resultados de las funciones (horarios, requisitos o recomendaciones como «lleva copia» solo si están en la ficha).
- Los eventos de ejemplo (`demo:true`) nunca llegan al asistente. Los avisos del municipio llegan marcados (`es_aviso_municipal`) y el asistente los menciona solo si la persona pregunta por ellos.
