# Agenda de Pasca: diagnóstico, fuentes e invitación

Revisado el 2026-10-30.

## Diagnóstico: el proceso funciona; la fuente publica poco

`agenda.py` lee bien el sitio de la Alcaldía de Pasca. La corrida del 2026-10-29 leyó 524 contenidos, sin errores.
Que no haya eventos de Pasca en la agenda se debe a lo que publica el sitio:

| Qué | Lo más reciente en www.pasca-cundinamarca.gov.co |
|---|---|
| Noticias (`Article`) | 2026-02-23. Desde entonces no hay noticias nuevas, y la agenda solo lee las de los últimos 30 días |
| Eventos (`Event`) | Editados el 2026-10-19: cinco festivales del 23 al 25 de octubre (Reyes de la Papa, Danza Folclórica Zoratama, Formación Musical, Canino y Gastronómico). El 2026-10-29 ya habían pasado, así que no quedaron como eventos vigentes |
| Otros | Documentos y convocatorias (precotizaciones y la convocatoria del XX Festival Nacional de Música Campesina, agosto) |

Desde la v1.3.0, el panel admin (Agenda automática) muestra en cada fuente la fecha de su **última noticia** y de su
**último evento publicado**. Si los dos tienen más de 60 días, lo marca como «sitio desactualizado: el proceso
funciona, pero esta fuente no publica nada nuevo». Los datos salen de `ultima_noticia` y `ultimo_evento` en
`config/agenda_auto.fuentes`, y se ven desde la próxima corrida.

## Otras fuentes oficiales revisadas

| Fuente | ¿Se puede leer sin iniciar sesión? | Resultado |
|---|---|---|
| Alcaldía de Pasca | Sí, con su API pública `/api/v1/contents` (la misma plataforma de Gobierno Digital que usa Fusagasugá) | Ya está en la agenda |
| IDECUT (Cultura y Turismo de Cundinamarca) | Sí, con la misma API | Ya está en la agenda, filtrada por «Fusagasugá», «Pasca» o «Sumapaz»; todo lo que trae queda pendiente de aprobación. El 2026-10-29 leyó 21 contenidos y ningún evento de Pasca |
| Gobernación de Cundinamarca (www.cundinamarca.gov.co) | Sí, pero es un portal WebSphere sin API: solo páginas HTML de noticias | No tiene calendario de eventos. Leerlo exigiría extraer texto de páginas HTML y pasarlo por IA. No lo agregué: casi todo son noticias generales del departamento. Si quieres, se puede agregar como fuente «siempre pendiente» filtrada por «Pasca» |
| Emisora o canal comunitario de Pasca | No encontré un sitio web con agenda | Sin fuente automática |
| Facebook de la Alcaldía (página 61555675541955) | No se lee | Sus condiciones prohíben la lectura automatizada y no hay API pública para esto |

Conclusión: la forma realista de tener eventos de Pasca es que alguien de Pasca los publique. Para eso es la
invitación de organizador.

## Invitación para la Casa de la Cultura de Pasca

El correo que la Alcaldía publica para la Casa de la Cultura es **contactenos@pasca-cundinamarca.gov.co**. Es el
correo general de la Alcaldía: quien lo maneje podrá publicar los eventos. Si la Casa de la Cultura te da otro
correo, usa ese.

**Enlace de invitación** (abre «Crea tu cuenta» con el correo ya escrito):

https://fusa-conecta.web.app/?organizador=contactenos%40pasca-cundinamarca.gov.co

El enlace funciona solo después de crear la invitación. Hazlo tú, desde tu cuenta de admin:

1. Abre Fusa Conecta con tu cuenta de admin → Perfil → **Panel de administración** → pestaña **Eventos**.
2. En **Organizadores de eventos**, escribe `contactenos@pasca-cundinamarca.gov.co`.
3. Decide si es **confiable**. Sin marcar, sus eventos quedan por aprobar; marcado, se publican directo. Para empezar,
   recomiendo dejarlo sin marcar.
4. Toca **Invitar organizador**. La app crea `invitaciones/{correo}` y copia el mensaje con el enlace.
5. Envíalo por correo o WhatsApp. El mensaje dice:

   > Hola. Te invitamos a publicar los eventos de tu organización en la agenda de Fusa Conecta (Fusagasugá y Pasca).
   > Abre este enlace y crea tu cuenta con el correo contactenos@pasca-cundinamarca.gov.co:
   > https://fusa-conecta.web.app/?organizador=contactenos%40pasca-cundinamarca.gov.co . Verifica el correo y luego
   > ve a Agenda → «+». Puedes subir la foto del afiche y la IA llena los datos del evento.

Cuando la persona crea la cuenta y verifica el correo, la app la vuelve organizadora (`aplicarInvitacion`, revisado por
`firestore.rules`). En el panel, la invitación pasa de «Pendiente» a «Activo».

## En la app

- Los eventos de Pasca dicen «· Pasca» junto al lugar: en el carrusel del Inicio, en la Agenda y en Novedades.
- El selector de municipio (parte 1) los incluye con «Fusa y Pasca» o «Pasca», y los quita con «Fusagasugá».
