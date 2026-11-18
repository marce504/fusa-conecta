# Video promocional de Fusa Conecta (noviembre de 2026)

Vertical 9:16 (1080 × 1920), con voz, música del video anterior y subtítulos (mucha gente ve los videos de WhatsApp sin
sonido). Lo arma `herramientas/difusion/video-promocional.mjs` con capturas reales de la app. Cada escena dura lo que
dure su frase de voz (`herramientas/difusion/video-guion.json`).

- `video-publicitario/FusaConecta_Video_2026-11_voz-de-prueba.mp4`: con la voz de Windows (Sabina), solo para revisar
  tiempos y contenido.
- La versión final se arma cuando estén los audios de ElevenLabs (abajo).

## Escenas y locución

Para la voz final: en ElevenLabs, con la voz «Daniela - Warm, Professional, Persuasive» (español latino neutro, voice_id NUEuVCKSYxEA5YrK3kmx), genera **un MP3 por frase**
y nómbralo como dice la primera columna. Me pasas la carpeta y armo el video con esa voz: cada escena se ajusta sola a
lo que dure su frase.

| Archivo | Escena | Frase |
|---|---|---|
| `00-pregunta.mp3` | Preguntas de todos los días | ¿Dónde almuerzo? ¿Está abierto? ¿Qué hay para hacer en Fusa? |
| `01-marca.mp3` | Logo animado | Llegó Fusa Conecta: todo Fusa y Pasca, en tu bolsillo. |
| `02-comercios.mp3` | Todo tipo de comercio | Aquí está todo el que vende algo: restaurantes, tiendas, talleres, hoteles, fincas y emprendimientos. Ya son más de quinientos cuarenta lugares. |
| `03-busca.mp3` | Búsqueda | Escribe lo que necesitas y encuéntralo en segundos. |
| `04-contacta.mp3` | Ficha | Mira si está abierto, llama, escribe por WhatsApp o llega con el mapa. |
| `05-ia.mp3` | Pregúntale a Fusa | ¿No sabes qué buscar? Pregúntale a Fusa: la inteligencia artificial te recomienda lo que está abierto y cerca. |
| `06-turismo.mp3` | Turismo (fotos) | Descubre lugares que no sabías que estaban aquí: cascadas, senderos, miradores y el páramo de Sumapaz. |
| `07-agenda.mp3` | Agenda | Entérate de los planes y eventos de la semana. |
| `08-radio.mp3` | Emisora | Y escucha en vivo la emisora Vive Fusagasugá, ochenta y ocho punto uno. |
| `09-sos.mp3` | Emergencias | En una emergencia, los números están ahí, incluso sin señal. |
| `10-negocios.mp3` | Para negocios | ¿Tienes un negocio o un emprendimiento? Súmalo gratis. Si te unes antes del treinta y uno de enero, tienes Premium gratis hasta el treinta de abril. |
| `11-sena.mp3` | Quiénes somos | Fusa Conecta es un proyecto de estudiantes del SENA, con un propósito: que todo Fusa y Pasca se conecte. |
| `12-cierre.mp3` | Cierre con QR | Ábrela hoy en fusa conecta punto web punto app. ¡Es gratis! |

Consejos para ElevenLabs: deja «Stability» en 50 y «Similarity» en 75, como la vez anterior; los números van escritos
en palabras para que los lea bien.

## Qué cambió frente al video de octubre

- Voz, subtítulos y logo animado (las cuatro hojas crecen una por una).
- Una escena dedicada a que **todo el que vende algo** cabe en la app: categorías de colores y nombres reales de
  negocios del directorio que pasan en filas.
- **Turismo** con fotos de la región con licencia libre (Cascada San Gabriel con foto propia del equipo, cerro Quininí, páramo de Sumapaz, Quinta de
  Coburgo), cada una con su crédito.
- La **emisora** Vive Fusagasugá 88.1 FM sonando en la app.
- **Quiénes somos:** estudiantes del SENA de Análisis y Desarrollo de Software, con el sentido social del proyecto.
- Solo datos reales y la campaña para negocios (Premium gratis hasta el 30 de abril de 2027).

## Para rehacerlo

1. Capturas (390 × 844 a 2x): `02-busqueda`, `03-ficha-restaurante`, `05-agenda`, `06-asistente`, `07-sos`,
   `08-planes`, `10-radio` en PNG.
2. Música: el audio de `video-publicitario/FusaConecta_Video_Publicitario.mp4` en WAV.
3. `node herramientas/difusion/video-promocional.mjs <app2> <capturas> <música.wav> <carpeta de voz> <salida.mp4> <ffmpeg.exe>`.
   Con `MUESTRAS=3,12,25` antes del comando guarda solo esos segundos para revisar.
