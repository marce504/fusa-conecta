# Idea futura: "Pregúntale a Fusa" (Fase 4.3 — sin implementar)

Un chat dentro de la app donde la gente pregunta en lenguaje natural, por ejemplo:

- "¿Qué hago este fin de semana con niños?"
- "¿Dónde almuerzo cerca del parque que esté abierto ahora?"
- "Un sendero fácil para ir mañana temprano"

y la IA responde **solo con lugares y eventos que existen en Fusa Conecta**, con tarjetas que abren su ficha.

## Cómo funcionaría

1. La app arma un **contexto pequeño** con lo que aplica a la pregunta: eventos vigentes de la agenda (título, fecha, lugar, categoría, precio) y lugares relevantes (nombre, categoría, horario, abierto/cerrado, distancia si hay ubicación, calificación). Nada de datos personales.
2. Ese contexto y la pregunta van a un **servicio intermedio** que guarda la clave de la IA. La clave nunca va en la app. En Spark puede ser un Cloudflare Worker o Vercel Function gratuitos; con Blaze, una Cloud Function.
3. Instrucción al modelo: responder en español sencillo, recomendar como máximo 3–5 opciones **tomadas del contexto**, devolver sus `id` para mostrarlas como tarjetas, y decir "no tengo eso en la app" cuando no haya coincidencias (nunca inventar lugares, horarios ni precios).
4. La app muestra la respuesta con las tarjetas compactas y los eventos, más "Ver en el mapa".

## Cuidados

- **Costo**: limitar preguntas por persona y día, y respuestas cortas. Gemini Flash en capa gratuita o Claude Haiku (centavos por cientos de preguntas).
- **Privacidad (Ley 1581)**: no enviar nombre, correo ni ubicación exacta; usar distancias aproximadas. Avisarlo en el Aviso legal.
- **Calidad**: registrar (sin datos personales) las preguntas sin respuesta para saber qué lugares o eventos faltan en la app.
- **Accesibilidad**: campo de texto con etiqueta, respuestas en una región `aria-live` y botones de sugerencias rápidas ("Con niños", "Gratis", "Hoy").
