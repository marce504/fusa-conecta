# Registro de cambios

Todos los cambios importantes de Fusa Conecta. Formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versiones con [Versionado Semántico](https://semver.org/lang/es/) (`vMAYOR.MENOR.PARCHE`). Cada versión tiene su etiqueta en Git.

La versión que ve la gente en la app (`?v=` en `index.html`, por ejemplo v63) es el número de publicación de la PWA; la de
este archivo es la del proyecto completo (PWA, app Android, API y procesos).

## [Sin publicar]

### Cambiado (arreglos de UX/UI y accesibilidad, rama `ux-accesibilidad`; detalle en `docs/INFORME_ARREGLOS_UX.md`)
- **Errores de la Fase 1.** La agenda automática ya no duplica eventos de varios días y la app muestra cada evento una
  sola vez (E1); los eventos ya empezados dicen «En curso · hasta …» (E8); el buscador tolera errores de escritura y
  entiende sinónimos, con «¿Quisiste decir…?» (E2, U3); «Pregúntale a Fusa» muestra los lugares del directorio y el
  acceso a emergencias (E3); Inicio limpia la búsqueda y el buscador tiene «Borrar» (E4); los botones de la ficha
  quedan fijos arriba (E5); las pestañas tienen título (E6) y los filtros de la Agenda no se cortan (E7).
- **SOS más claro:** «Llamar» con palabra, «Copiar número», números agrupados y confirmación «¿Llamar a …?».
- **Fichas incompletas:** «Horario sin confirmar», «¿Lo conoces? Envíanoslo» y «Guardar» en la barra (U2, U9);
  listado `docs/comercios-incompletos.csv`.
- **Accesibilidad para personas mayores:** tamaño de letra (Normal, Grande, Muy grande) con todo el CSS en rem, nada
  por debajo de 14 px (U7), áreas táctiles de 48 px (U6), estrellas visibles con palabra (U5), tema «Sistema» por
  defecto (U10), botones con palabras, avisos de 5 s con «Deshacer», explicaciones cortas, foco atrapado en las hojas,
  pausa del carrusel y fechas completas.
- **Inicio y navegación (U1, U4, U8):** «Qué hacer en Fusa» (eventos) primero, «Lo que necesitas» (Transporte, Empleos,
  Salud, Trámites), Rutas y turismo, Ofertas y cupones; barra Inicio · Agenda · Mapa · Comunidad · Perfil con la
  pestaña nueva Comunidad; Cupones pasa a Perfil y a Comunidad. CLS del Inicio de 0,36 a 0,01. Modo sencillo con letra
  Grande, opcional: el Inicio normal viene por defecto y el botón «Aa» de la barra de arriba (con un globo de ayuda la
  primera vez) lleva el tamaño de letra y el modo sencillo; al quitarlo vuelve la letra que había. La X de las alertas
  municipales mide 48 px (PWA v101).
- **Reclamar este comercio** con verificación, colección `reclamos_comercio`, revisión del admin y reglas nuevas
  (Fase 5). La API avisa los reclamos (`reclamo_comercio`) y **decide** la aprobación o el rechazo
  (`POST /v1/reclamos/{id}/decision`): ningún navegador, ni el del admin, puede escribir el dueño de un comercio.
- **Fotos:** crédito y fuente de la foto de los eventos, «Imagen de referencia», mejor diseño sin foto y
  `scripts/proponer-fotos.mjs` (Fase 6). Imágenes de referencia de Unsplash por subcategoría para los lugares sin
  foto (18, en `img/categorias/`).
- **Arreglos encontrados en las pruebas:** enlaces de las paradas de las rutas turísticas que tapaban la pantalla (N1),
  errores del ingreso escritos en el formulario (N2), error de Leaflet al cambiar de pestaña (N3) y etiquetas de la foto
  tapadas con letra grande (N4). PWA v100 (`fusa-v93`).
- **Rendimiento (PWA v102, `fusa-v95`):** la foto de cada evento va aparte, en `eventos/{id}/fotos/0`, y se pide solo
  cuando el evento se acerca a la pantalla; antes la app bajaba 1,7 MB de fotos de la agenda al abrir. La agenda
  automática guarda así las nuevas y mueve las anteriores (`mover_fotos`); reglas nuevas para la foto. Las tarjetas
  usan miniaturas de 420 px (`img/mini`, `scripts/miniaturas.py`): 3,2 MB de fotos pasan a 744 KB.

### Agregado
- **Video promocional: escena «Y ahora también».** Resume las 8 funciones nuevas (alertas del municipio, empleos,
  mascotas perdidas, pedidos por WhatsApp, servicios a domicilio, mercado campesino, rutas turísticas y «Cómo
  moverse») con la voz de Daniela. El video queda de 86 segundos.

### Agregado
- **Rutas turísticas sugeridas.** En Turismo, cuatro recorridos armados con lugares del directorio (cada uno con su
  fuente): «Fusa a pie: centro y cultura» (unos 1,6 km), «Del Sutagao al café», «Naturaleza al norte de Fusa» y «Pasca:
  plaza, museo y cultura». Cada ruta muestra sus paradas en orden, la distancia aproximada y un enlace para verla en
  Google Maps con las paradas. No traen horarios ni precios: hay que verificarlos en cada lugar.
- **Pico y placa, parqueaderos y cajeros en «Cómo moverse».** No hay un decreto de pico y placa vigente publicado por
  la Alcaldía de Fusagasugá ni por la de Pasca (las páginas no oficiales se contradicen), así que la app lo dice y
  solo muestra un horario si el admin lo publica en Panel → Transporte con el decreto y su enlace
  (`config/pico_placa`). Se agregan desde OpenStreetMap los 3 cajeros automáticos que faltaban y el parqueadero del
  Centro Comercial Manila (el único marcado como abierto al público); los 11 bancos ya estaban. «Cómo moverse» aparece
  también en el inicio. PWA v99 (`fusa-v92`).

### Agregado
- **Empleos locales.** Los negocios aprobados publican vacantes desde Mi negocio → «Ofrecer empleo» (cargo,
  descripción, jornada y salario opcional). Un admin las revisa en Panel → Empleos antes de publicarlas: la app
  rechaza de entrada las que cobran al aspirante o piden edad, sexo o «buena presencia». Quien busca trabajo las ve
  en Empleos (Perfil, `#/empleos` y «Empleos en…» en el inicio) y se postula por WhatsApp. Vencen a los 30 días (la
  limpieza diaria las marca) y el negocio las cierra cuando consigue a alguien. La API (v1.6.0) avisa a los admin de
  cada oferta nueva y al negocio cuando se aprueba o rechaza. Reglas: `empleos/{id}` solo lo crea el dueño de un
  negocio aprobado. PWA v98 (`fusa-v91`).

### Corregido
- **Ícono de «Profesionales».** `briefcase` se usaba en esa subcategoría pero no estaba en `icons.js` (salía «?»).

### Agregado
- **Perdidos y encontrados.** Avisos de mascotas y objetos perdidos o encontrados en Fusa y Pasca: foto opcional,
  barrio, fecha y WhatsApp (quien publica acepta mostrarlo). Se publican de inmediato porque son urgentes, vencen a los
  30 días (la limpieza diaria los marca vencidos), quien publica los marca resueltos («¡Ya volvió a casa!») o los
  borra, y el admin los oculta desde Panel → Perdidos. Máximo 3 avisos activos por persona. Aparecen en «Ayúdalos a
  volver a casa» en el inicio, en Servicios → Mascotas, en el Perfil y con `#/perdidos`. Reglas: `perdidos/{id}` con
  campos validados; solo la autora cambia el estado o lo borra. PWA v97 (`fusa-v90`).

### Corregido
- **Ícono de «Foto o afiche».** `image-plus` se usaba en el formulario de eventos pero no estaba en `icons.js`.

### Corregido
- **Actividades en paralelo de un programa oficial.** La agenda tomaba como repetidas dos actividades en el mismo lugar
  y a la misma hora (la exposición y el Taller Tribu del 24 de noviembre en la Casona Balmoral) y publicaba solo una.
  En los programas oficiales, la clave de lugar y hora ahora incluye el título.

### Agregado
- **Programa oficial del Festival Nacional de las Artes «Conexión Sumapaz» (19 al 29 de noviembre).** Transcrito del
  PDF de la Secretaría de Cultura en `automatizacion/programas/conexion-sumapaz-2026.json`: 16 actividades por venir en
  el Parque Max Aya, la Casona Quinta Balmoral y el Parque Coburgo, con su hora real y entrada libre.

### Corregido
- **Eventos sin hora confirmada.** Cuando la noticia no dice la hora, la agenda automática pone 9:00 a. m. y deja el
  evento pendiente, pero el panel no lo advertía: así se aprobaron «Noches de Teatro» y «Conexión Sumapaz» a las
  9:00 a. m. de un solo día. Ahora la agenda marca `hora_por_confirmar` y `lugar_por_confirmar`, y el panel muestra
  «Revisa antes de publicar» con lo que falta confirmar. PWA v96 (`fusa-v89`).

### Agregado
- **Avisos al celular para los administradores.** Cuando alguien registra un negocio (o lo reenvía), sugiere un
  evento, propone una ruta, pide Premium, reclama un negocio o reporta un problema, los admin reciben la novedad en la
  campana y en el celular, con un enlace que abre el panel. La API nueva `POST /v1/notificaciones/pendiente` (API
  v1.5.0) comprueba que exista, siga pendiente y la haya enviado quien llama, y avisa una sola vez. La agenda
  automática también avisa cuando deja eventos por aprobar (`automatizacion/avisos_admin.py`); si su cuenta no puede
  usar FCM, la novedad queda igual en la campana. El push necesita `FIREBASE_SA_FCM` en Render. PWA v95 (`fusa-v88`).

### Corregido
- **No se podían publicar eventos de la agenda automática.** Los eventos de un programa (por ejemplo el Festival
  Nacional de las Artes «Conexión Sumapaz») traen los campos `programa`, `sin_hora_fin` y `fuentes`, y precios de hasta
  60 caracteres, que las reglas de Firestore no aceptaban: al tocar «Publicar» salía «No se pudo completar». Las reglas
  ya los aceptan, y el admin puede publicar o descartar cambiando solo el estado aunque el evento traiga un campo nuevo.
- **Diagnóstico: la API dormida.** Render (plan gratis) apaga la API; al despertar puede cortar la conexión y el
  diagnóstico se rendía al primer «Failed to fetch». Ahora reintenta cada 3 s hasta 70 s.
- **IA: respaldo también sin red hacia Firebase.** Si la llamada a Firebase AI ni siquiera sale (red o navegador que
  bloquea googleapis), la app usa la IA de respaldo de la API, igual que con App Check. PWA v94 (`fusa-v87`).

### Agregado
- **Menú y pedidos por WhatsApp.** En Mi negocio → «Mi menú», el dueño arma su menú (hasta 40 productos con precio,
  descripción corta y si está disponible). En la ficha, el cliente elige cantidades, escribe una nota y toca «Pedir
  por WhatsApp»: se abre el chat del negocio con el pedido, el precio de cada producto y el total. Fusa Conecta no
  cobra ni guarda el pedido; lo confirma el negocio en el chat. Cuenta como toque de WhatsApp en las estadísticas del
  negocio. Gratis en todos los planes. Reglas: el menú es una lista de máximo 40 productos. PWA v93 (`fusa-v86`).
- **Mercado campesino.** En Campo hay una sección con los próximos mercados campesinos de la Agenda (los que se
  publican con su fuente; la agenda automática ya los busca) y las plazas de mercado reales del directorio: Plaza de
  Mercado y Maximercado de Fusagasugá, y Plaza de Mercado de Pasca. En el inicio aparece un aviso solo si hay un
  mercado campesino en los próximos 14 días. No se inventan fechas fijas: no hay un calendario oficial publicado.
  PWA v92 (`fusa-v85`).
- **Oficios y servicios a domicilio.** Al registrar o editar el negocio, los servicios marcan «Atiendo a domicilio» y
  los comercios y productos del campo «Hago domicilios», con las zonas que cubren (texto corto). Quien no tiene local
  puede dejar la dirección vacía y atender por WhatsApp o teléfono, que pasa a ser obligatorio en ese caso. Nuevo
  filtro **«A domicilio»**, el distintivo en la ficha y el asistente entiende «que vengan a la casa». Los lugares del
  directorio que ya dicen «domicilios» en su ficha real entran solos. Las calificaciones siguen siendo una por
  persona y por negocio, y ahora **nadie puede calificar su propio negocio** (`firestore.rules`). PWA v91 (`fusa-v84`).
- **Cómo moverse: Terminal, paraderos y horarios de buses.** Pantalla nueva (desde Servicios → Transporte o con
  `#/transporte`) con la Terminal de Transporte y el paradero del colectivo a Chinauta. No hay una fuente oficial
  pública con los horarios de la Terminal de Fusagasugá (las páginas de pasajes no coinciden entre ellas), así que
  solo aparecen los que el admin publica en Panel → Transporte, con su fuente `https` y la fecha en que los verificó.
  Si el dato tiene más de 3 meses, la app avisa que puede haber cambiado; no se aceptan datos de más de un año.
  Reglas: `transporte/{id}` lo lee cualquiera y solo lo escribe el admin con los campos válidos. PWA v90 (`fusa-v83`).
- **Alertas municipales.** El admin publica alertas (corte de agua o de luz, vía cerrada, clima, salud, seguridad)
  desde Panel → Emergencias, **siempre con la fuente oficial** (enlace `https`) y una fecha final de máximo 30 días.
  Se ven en el inicio, que se pueden ocultar una por una, y en Emergencias, también sin conexión. Con «Avisar al
  celular», la API nueva `POST /v1/alertas/enviar` (API v1.4.0) manda el push a quienes no apagaron los avisos, en
  lotes de 500 y una sola vez por alerta. Reglas: `alertas/{id}` lo lee cualquiera y solo lo escribe el admin con los
  campos válidos; `alertas/{id}/envios` solo lo escribe la API. Necesita `FIREBASE_SA_FCM` en Render para el push;
  sin ella, la alerta igual se publica. PWA v89 (`fusa-v82`).
- **Mensaje de «Contactar».** Ahora saluda de parte de Marcela y Jhon (quien lo envía va primero) y cierra con un
  agradecimiento corto.
- **Filtro «De noche» y droguerías en Emergencias.** En Filtros, «De noche» muestra los lugares que atienden
  después de las 9 p. m. al menos un día, según su horario real (sin horario no entran). En Emergencias hay una
  sección de **Droguerías** con su estado de abierto o cerrado y el aviso de llamar antes de ir. El turno de
  droguerías **solo** aparece si el admin lo publica (Panel → Emergencias → Droguería de turno) con su fuente oficial
  y enlace `https`, y solo entre las fechas que indica; se guarda en `config/turno_droguerias` (lectura pública,
  escritura solo del admin en `firestore.rules`) y queda disponible sin conexión. No se encontró ninguna fuente
  pública con los turnos de Fusagasugá, así que la app no muestra ninguno inventado. PWA v88 (`fusa-v81`).
- **Cascadas en Turismo y ficha del Parque Natural San Rafael.** Nuevo tipo «Cascadas» (ícono de gotas, sin estado
  de abierto o cerrado, como los senderos). Primera ficha: el Parque Natural San Rafael, en la vereda La Aguadita, con
  datos de Semana y de Caminatas al Aire Libre (unos 10 km, 5 horas, entre 1.920 y 2.360 m), ubicación aproximada y una
  galería con 6 fotos propias del equipo (cascadas San Gabriel y de los Deseos, entre otras). Las fichas del directorio
  base pueden traer su galería en `img/` sin pasar por Firestore, y las fuentes sin enlace se muestran como texto.
  El video promocional ya tiene la voz final (Daniela, español latino neutro, ElevenLabs) y abre turismo con la
  Cascada San Gabriel. PWA v87 (`fusa-v80`).

### Corregido
- **Reglas de Firestore.** La regla general del final dejaba al admin escribir alertas sin pasar por su validación;
  `alertas` quedó excluida como `banners` y `eventos`. Las fechas del turno de droguerías ya no se salen de la pantalla.
- **Horarios de 24 horas que pasan la medianoche.** «20:00-02:00» se leía como de 8 p. m. a 2 p. m.; ahora se lee
  hasta las 2 a. m. del día siguiente.
- **Galería de fotos de la ficha.** Las fotos quedaban apiladas una sobre otra y siempre se veía la última, aunque el
  contador dijera «1/6». Ahora cada foto ocupa su lugar y se ven en orden al deslizar. Afectaba también las galerías
  que suben los negocios. Faltaba además el ícono de gotas en el paquete local de Lucide (`icons.js`).
- **Quiénes somos en los mensajes.** El mensaje de «Contactar» (`mensajeContacto`), los mensajes de WhatsApp y el flyer
  dicen que Fusa Conecta es el proyecto de estudiantes del SENA de Análisis y Desarrollo de Software, con sentido
  social: que todo el que venda algo en Fusagasugá y Pasca sea visible y que vecinos y turistas encuentren fácil dónde
  comer, comprar y qué conocer. Nuevo mensaje para usuarios que conocemos en la calle o en redes. PWA v86 (`fusa-v79`).
- **Video promocional con voz, subtítulos y logo animado** (`herramientas/difusion/video-promocional.mjs`). Escenas
  nuevas: todo tipo de comercio con nombres reales, turismo con fotos de licencia libre, la emisora Vive Fusagasugá
  88.1 FM y quiénes somos. Cada escena dura lo que dura su frase de voz (`video-guion.json`); la voz de prueba es la
  de Windows y la final se arma con los audios de ElevenLabs. Guion en `docs/difusion/video-guion.md`. Foto de perfil
  de WhatsApp en dos versiones (`herramientas/difusion/perfil-whatsapp.mjs`).
- **Modo rápido en «Contactar».** Un botón abre el chat del siguiente negocio por contactar (en orden alfabético), lo
  marca como enviado y, al volver a la app, ya muestra el próximo. Así cada mensaje toma unos 10 segundos. Lleva la
  cuenta del día (25 como tope sugerido para cuidar el número) y pide confirmar si se pasa de ese tope o si es fuera
  del horario de la Ley 2300 de 2023. «Saltar este» lo deja para después. Con pruebas unitarias y de punta a punta.
  PWA v85 (`fusa-v78`).
- **Campaña de lanzamiento.** Quien se una hasta el **31 de enero de 2027** (el admin aprueba su reclamo o su negocio
  nuevo) recibe **Premium gratis hasta el 30 de abril de 2027**, la misma fecha para todos (`CAMPANA`,
  `premiumCampana`). Nunca acorta un Premium que ya tenía una fecha más lejana o ninguna. La hoja de planes, la
  confirmación del reclamo y el aviso de aprobación lo dicen.
- **Pestaña «Contactar» en el panel de administración.** Lista de los 151 negocios del directorio que tienen celular y
  aún no tienen dueño. «Escribir» abre WhatsApp con un mensaje con el nombre del negocio, el enlace a su ficha, los pasos
  para reclamarlo, la campaña y cómo pedir que no le escriban más (`mensajeContacto`). Lo envía la persona del equipo
  desde su WhatsApp: la app no manda nada sola. Filtros por estado (por contactar, enviado, respondió, se unió) y
  seguimiento en `contactos/{id}`, que solo lee y escribe el admin (`firestore.rules`). Avisa si es fuera del horario
  de la Ley 2300 de 2023 (lunes a viernes de 7 a 19 y sábados de 8 a 15) y desde 25 mensajes en un día. Con pruebas
  unitarias y de punta a punta. PWA v84 (`fusa-v77`).
- Flyer y mensajes de WhatsApp con las fechas de la campaña (`docs/difusion/`).
- **IA de respaldo por la API** (`POST /v1/ia/generar`, API v1.3.0). Google exigirá App Check en Firebase AI Logic
  el 21 de enero de 2027 y la app no puede usarlo en el plan Spark. Si Firebase responde que falta App Check, la app
  (`modeloDoble`) repite la misma llamada por la API de Render, con la sesión de Firebase, y sigue por ahí ese día. La
  API solo acepta los usos «evento» y «asistente», fija modelo, temperatura y largo, limita el tamaño del pedido y da un
  cupo diario por persona en Firestore. La clave va en la variable `GEMINI_API_KEY` de Render, nunca en la app. La app
  despierta la API al abrir el asistente o el formulario de eventos y espera más en ese camino. El Diagnóstico dice si
  la IA respondió directo o por la API. Con pruebas en la API y en la app. PWA v83 (`fusa-v76`).
- **Guía de iPhone sin App Store** (`instalarEnIphone`). En iPhone la app ya funciona en Safari, pero la gente la
  buscaba en la App Store o se perdía en pasos desactualizados: Safari 26 escondió «Compartir» en el menú «•••» y desde
  Instagram, Facebook o TikTok no se puede agregar al inicio. Ahora la app reconoce el navegador (`navegadorIphone`:
  Safari 26, Safari anterior, Chrome, navegadores internos u otros) y muestra solo sus pasos, con los botones
  dibujados. Desde un navegador interno ofrece copiar el enlace para pegarlo en Safari, y avisa que el ícono pide
  iniciar sesión otra vez. En iPhone la tarjeta y el perfil dicen «Agrégala a tu inicio», no «Instala». Íconos Lucide
  nuevos: `share`, `ellipsis` y `square-plus`. Con prueba unitaria. PWA v82 (`fusa-v75`).
- El flyer y los mensajes de WhatsApp (`docs/difusion/`) dicen que en iPhone se abre en Safari y no se descarga.
- **Programas verificados en la agenda automática** (`automatizacion/programas/*.json`). Para festivales cuyo
  programa sale en PDF o en imágenes y que las alcaldías no publican. El primero es el **13.º FICFUSA** (Festival
  Internacional de Cine de Fusagasugá, 11 al 16 de noviembre de 2026): 30 funciones, charlas y talleres con hora y sede,
  transcritas del programa oficial de ficfusa.com. No entran 3 actividades que el programa trae sin lugar. Estos
  eventos se publican como fuente oficial, sin imagen (serían 30 copias del afiche) y la «reparación» no les recorta
  el título. Guía en `automatizacion/programas/LEEME.md`.
- **La agenda se recupera sola si GitHub no la ejecuta.** GitHub retrasa los horarios programados (la corrida de las
  6:00 a. m. del 11 de noviembre salió a la 1:23 p. m.) y de las revisiones «cada 15 minutos» solo ejecuta unas 5 al
  día. Ahora cualquier revisión hace la búsqueda completa si pasaron más de 20 horas sin una (`motivo_para_correr`).
- **La IA de la agenda reintenta** los errores pasajeros (429 y 5xx) hasta 3 veces con espera creciente: el 11 de
  noviembre dos noticias se quedaron sin leer por «IA HTTP 503».
- **Diagnóstico:** cuando la llamada a la IA falla por App Check, cupo o saturación, la app dice qué pasa y cómo
  arreglarlo en vez del texto técnico (`pistaDiagnostico`). PWA v80 (`fusa-v73`).
- **Logos de 23 marcas en 32 sucursales** (D1, Ara, Éxito, Olímpica, bancos, Terpel, Texaco, Claro, Movistar, Frisby,
  El Corral, Domino's, Oxxo, Cruz Verde, Colsubsidio, Nueva EPS, UNAD y Cámara de Comercio). Salen de la propiedad
  «logo» (P154) de Wikidata de la marca que OSM tiene enlazada, o del nombre de la sucursal; son archivos de Wikimedia
  Commons de dominio público o CC BY-SA, centrados sobre fondo blanco de 800×450 en `img/comercios/logo-*.jpg`, con su
  crédito en la ficha. Se descartó el logo del Ministerio de Educación en un colegio. PWA v79 (`fusa-v72`).
- **Bares, licorera y espacio cultural con fuente** (`c582`–`c588`): Volcano Rock City (bar de rock con sótano
  cultural), Cervecería Artesanal de Fusagasugá – Bar Rock-Crossover (rotonda del Éxito), Tu Tranquilo, Tuki Bar,
  Club de Billares El Rey, Niko Likores (domicilios nocturnos) y Terraza Cultural Libro Abierto. Salen de lo que
  publicaron los propios negocios en directorios locales (Ubiyaaa, Finko) o de una boletería (QueBoleta). La Tasca
  VIP (`c62`) queda confirmada por su página pública (mismo WhatsApp), con domicilios hasta las 4:00 a. m.
  No se encontró fuente para Baracunatana, Místico ni para los bares de la zona del Indio: quedan pendientes.
  PWA v77 (`fusa-v70`).
- **Fotos con licencia libre y su crédito (parte 4).** 8 fotos de Wikimedia Commons, revisadas una por una:
  Iglesia de Belén, Biblioteca Quinta de Coburgo, Monumento al Indio Sutagao, Monumento Lucho Herrera, Instituto
  Salesiano Valsalice, Sendero Cara del Indio (cerro Quininí), Páramo de Sumapaz (frailejones) y Parroquia de Pasca.
  Van a 800 px en `img/comercios/` y cada lugar guarda `foto_credito` (autor, licencia, enlaces). La ficha muestra la
  fila «Foto» con el autor y la licencia (`creditoFotoHTML`, con prueba unitaria), como piden CC BY y CC BY-SA.
- **414 lugares reales de Fusagasugá desde OpenStreetMap** (`c78`–`c491` en `datos.js`, parte 2 de la revisión del
  directorio). Se descargaron los negocios y entidades con nombre que OSM ubica dentro del límite oficial del municipio
  (`limites.geojson`) y se convirtieron con un script que solo usa lo etiquetado en el mapa: nombre, ubicación exacta,
  dirección, teléfono, horario y sitio web. La descripción sale del tipo de lugar («Ferretería», «Droguería»), sin
  inventar nada. Cada ficha enlaza su elemento de OSM en «Fuente» (© colaboradores de OpenStreetMap, licencia ODbL).
  - Comida y tiendas 110, Hospedaje 16 (antes vacíos), Servicios 238 (177 talleres de carros y motos, droguerías,
    hospitales, colegios, estaciones de servicio), Trámites 26 nuevos (bancos, Registraduría, Policía, Juzgados,
    CAR, Emserfusa, Cámara de Comercio), Turismo 13 nuevos (cerros, monumentos, Casa de la Cultura, Quinta Mazuera) y
    4 viveros y agropecuarias en Campo.
  - Se descartaron 115 elementos: los que ya estaban en el directorio, duplicados, nombres genéricos («Laboratorio»,
    «Kiosco»), rótulos de locales que ya cerraron («Antiguo…») y tipos que no son del directorio (parques, canchas,
    iglesias, jardines infantiles).
  - Limpieza de datos de OSM: se quitaron los códigos de levantamiento de los nombres («TM3- Mario Motos» → «Mario
    Motos»), se corrigieron erratas evidentes («Coledio» → «Colegio»), se ignoró un teléfono repetido en tres talleres
    distintos y las sucursales con el mismo nombre llevan su vía («Ara · Calle 19»).
  - Los horarios de OSM se pasan al formato de la app («Lun-Sáb 8:00-18:00»), así funcionan «Abierto» y «Cierra
    pronto». Si un horario no se puede pasar sin perder información, la ficha no muestra horario.
- **Pasca y prestadores turísticos oficiales (parte 3).**
  - 10 lugares de Pasca desde OpenStreetMap (`c492`–`c501`): cumbres del páramo (Cuchilla El Amarillal, Loma Cajica,
    Cuchilla La Rica), Estación de Policía, sedes de la IE Normal Superior, estación de servicio, Plaza de Mercado,
    Banco Agrario y El Molino Gourmet. La Alcaldía y el Museo ya estaban: ahora enlazan su elemento exacto de OSM.
  - 80 prestadores del **Registro Nacional de Turismo** (RNT, datos.gov.co, corte de octubre de 2026; `c502`–`c581`):
    hoteles, hostales, centros vacacionales, glampings, restaurantes, gastrobares, parques temáticos y agencias
    operadoras de Fusagasugá y Pasca (Hospedaje Los Frailejones, Hospedaje El Terruño, American Park, Enpas Ruta 69).
    Cada ficha enlaza su registro (`codigo_rnt`) y dice cuántas habitaciones tiene inscritas.
  - 7 hoteles que ya venían de OSM (Barcelona Chinauta, Catama, Costa del Sol, Parque Zabal, Los Sauces, Los Alpes y
    Villa Sallent) suman el teléfono y el RNT como segunda fuente.
  - No entran las «viviendas turísticas» ni los guías del RNT (casi todos inscritos a nombre de personas, en su casa)
    ni una razón social que es el nombre de una persona. Los teléfonos fijos de 7 cifras llevan el indicativo 601.
  - El RNT no trae coordenadas: estos lugares no salen en el mapa general y su ficha ubica la dirección.
- PWA v73 (`fusa-v66`). `api/app/datos_base.json` regenerado (444 lugares).
- La «Fuente» de Ofalahiatu Vivero apuntaba a `/lugar/c61`, que da 404: la app usa rutas con `#`. Ahora es
  `/#/lugar/c61`. PWA v74 (`fusa-v67`).

### Quitado
- **Limpieza del directorio base (`datos.js`), parte 1.** Se quitaron 47 lugares que no existen o que ninguna fuente
  confirma (detalle y fuentes en `docs/datos-base-verificacion.md`):
  - 40 negocios, hoteles y bares de ejemplo del prototipo (`c01`–`c20` y `c31`–`c50`), con teléfonos secuenciales
    inventados (310-111-00NN, 310-222-00NN…) y sus 41 fotos de `img/comercios/`;
  - 7 lugares sin fuente: Ruta de los Sutagaos, Camino Real de Alaska, Mirador de Ricaurte, Alto de San Benito,
    Notaría Segunda (existe, pero no se encontró su dirección), Cruz Roja y Casa de la Mujer (sin sede confirmada).

### Corregido
- **Eventos sin hora de cierre.** El Festival de Juventudes de Pasca (14 de noviembre) se publicó en el sitio de la
  alcaldía ese mismo día a las 9:28 a. m., con inicio a las 8:00 y sin hora de fin. La agenda le ponía 2 horas, así
  que cuando lo leyó ya lo daba por terminado y no lo guardó. Ahora un evento sin hora de cierre queda vigente hasta el
  final de su día (`sin_hora_fin`) y la app muestra «desde las 8:00 a. m.» sin inventar la hora de fin. PWA v81
  (`fusa-v74`).
- **Fotos desde el panel del admin en lugares del directorio.** Las reglas no dejaban al admin crear la copia en la nube
  de un lugar de `datos.js` (ahora `allow create: if esAdmin() || …`). Al guardar ya no se pierden la fuente, la web,
  el correo ni el crédito de la foto, y no se inventa el horario «Lun-Sáb 8-18» si el lugar no tenía uno por días.
  Prueba de punta a punta nueva con una cuenta admin del emulador.
- **«¿Es tu negocio? Reclámalo»** vuelve a salir en los negocios del directorio (no en trámites ni turismo): se había
  ocultado en todo lugar con fuente. PWA v78 (`fusa-v71`).
- **Mapa y «Cómo llegar» en Pasca.** Google Maps ubica las direcciones de Pasca en Fusagasugá (por ejemplo, la
  Casa de la Cultura salía en el barrio El Tejar), y «Cómo llegar» de los cupones siempre agregaba «Fusagasugá». Ahora
  `destinoDe` usa en Pasca el punto aproximado del lugar o el casco urbano, y en Fusagasugá la dirección. Con prueba
  unitaria.
- **Fotos sin origen.** Se quitaron las 12 fotos de lugares oficiales que no decían de dónde salieron (una de la
  Fiscalía era una imagen generada con IA y la de Bancolombia era otra sucursal). Esos lugares muestran su ícono hasta
  tener una foto libre o una del dueño. Se conserva la del vivero Ofalahiatu, que subió su dueño. PWA v76 (`fusa-v69`).
- **Carrusel «Pasca, puerta del Sumapaz».** Con más lugares oficiales, los negocios que publicaron sus dueños quedaban
  fuera de los 10 del carrusel; ahora van primero. PWA v75 (`fusa-v68`).
- **Teléfonos y horarios inventados en lugares reales.** Se borraron los teléfonos de ejemplo de los atractivos
  (`c21`–`c30`) y los números sin confirmar de la Alcaldía, los Bomberos, el SENA, la Comisaría de Familia y
  Bancolombia. Sin teléfono, la ficha muestra «Cómo llegar». Los horarios que no se pudieron confirmar dicen
  «Consultar directamente».
- **Ubicación exacta desde OpenStreetMap** para la Alcaldía, los Bomberos, el SENA, la Fiscalía, la Comisaría de Familia
  y Bancolombia (antes aproximada).
- **Notaría Primera:** dirección, teléfono y correo del edicto publicado en 2026.
- Cada lugar que queda guarda sus `fuentes` y la fecha de `verificado`, como los de Pasca.
- Las pruebas que usaban negocios de ejemplo ahora usan lugares reales o el negocio de prueba del emulador.
- PWA v72 (`fusa-v65`).
- La ficha mostraba el horario de la Alcaldía de Pasca sin decir que la franja de 8:00 a 12:00 es del sábado. `formatearHorario` ahora formatea cada grupo de días separado por «;» con sus días («Lun-Vie … · Sáb …»). PWA v71 (`fusa-v64`).

## [1.3.0] - 2026-10-30 · Pasca vuelve a estar en Fusa Conecta

### Agregado
- **Selector de municipio en el Inicio (parte 1).** Debajo del buscador hay tres pastillas: «Fusa y Pasca» (por defecto),
  «Fusagasugá» y «Pasca». La elección queda guardada en el teléfono (`fc_municipio`). Es el mismo filtro de municipio
  de la hoja de Filtros (`estado.filtros.municipio`), no uno nuevo. Filtra:
  - los carruseles del Inicio, los mosaicos, «Cupones de la semana» y la lista;
  - el mapa: se centra en el municipio elegido y tiene el botón «Ir a Pasca» (4.30783, -74.30018, según OpenStreetMap);
  - la agenda y el banner del fin de semana;
  - el asistente, que usa el municipio elegido si la persona no pide otro.
  La Agenda y el Mapa también muestran el selector.
- **Sección «Pasca, puerta del Sumapaz»** en el Inicio, con los lugares de Pasca. Mientras haya menos de 6, termina
  con la tarjeta «¿Tienes un negocio en Pasca? Publícalo gratis», que abre «Registrar mi negocio» con Pasca ya elegido.
- **Contenido verificado de Pasca (parte 2).** Seis lugares nuevos en `datos.js` (`c72` a `c77`), cada uno con su
  fuente en `fuentes` y la fecha de revisión en `verificado`:
  - la Alcaldía, la Casa de la Cultura y el CDI, con dirección y horario de la página de turismo de la Alcaldía de Pasca;
  - la Parroquia de Nuestra Señora de la Encarnación y el Museo Arqueológico, con OpenStreetMap y Wikipedia;
  - el Páramo de Sumapaz, como ficha informativa con el aviso oficial de Parques Nacionales Naturales del 13 de marzo de
    2026: el parque **no está habilitado para el ecoturismo**.

  Las coordenadas son de OpenStreetMap; las que no están allí quedan en el centro del casco urbano, marcadas como
  aproximadas. No hay teléfonos inventados: sin teléfono no se muestran «Llamar» ni «WhatsApp». Detalle y diferencias
  con lo pedido en `docs/pasca-fuentes.md`.
- La ficha muestra el correo, el sitio web, las fuentes con la fecha de verificación y el aviso oficial. También
  muestra «Consulta horarios en la Casa de la Cultura» cuando no hay horario confirmado. A los lugares verificados no
  se les ofrece «¿Es tu negocio? Reclámalo».
- **Horarios con varios grupos de días** separados por «;», por ejemplo «Lun-Vie 8:00-13:00 y 14:00-17:00; Sáb
  8:00-12:00». Se usa en la app (`estadoApertura`) y en la API (`estado_apertura`). Antes se ignoraba el sábado.
- **Rutas:** las tres oficiales tienen `municipio` («Fusagasugá»). `GET /v1/rutas` lo devuelve y lo filtra con
  `?municipio=`. Con «Pasca» elegido, la app dice «Aún no hay senderos de Pasca con trazado real. ¿Conoces uno? Grábalo
  con «Grabar mi recorrido» y propónlo», con el botón.
- La API devuelve en la ficha (`/v1/comercios/{id}`) los campos `correo`, `fuentes` y `aviso`.
- La invitación «¿Tienes un negocio en Pasca?» cuenta solo los negocios con dueño, no los lugares oficiales.
- **Verificación del directorio base (parte 4).** `docs/datos-base-verificacion.md` lista los 71 lugares de
  Fusagasugá con «verificado: sí / no / no sé», la fuente y una nota. No se borró ni cambió nada:
  - 13 «sí», confirmados con OpenStreetMap, un sitio oficial o el registro de su dueño;
  - 40 «no», que parecen datos de ejemplo del prototipo: teléfonos con el patrón 310-111-00NN, 310-222-00NN,
    310-444-00NN o 310-555-00NN, sin rastro en OpenStreetMap;
  - 18 «no sé», que pueden existir pero no tienen una fuente que se pueda enlazar: las notarías, la Cruz Roja, la Casa
    de la Mujer, algunos miradores y senderos, y las licoreras agregadas desde Google Maps sin enlace.

  También quedan señalados los teléfonos de ejemplo de lugares que sí existen, como el Cerro Fusacatán o la Iglesia de
  Belén.
- **Agenda de Pasca (parte 3).** El panel admin muestra, en cada fuente de la agenda automática, la fecha de su
  última noticia y de su último evento publicado (`ultima_noticia` y `ultimo_evento` en `agenda.py`). Si los dos
  tienen más de 60 días, marca el sitio como desactualizado: el proceso funciona, pero la fuente no publica nada
  nuevo. Diagnóstico de Pasca, fuentes revisadas e invitación en `docs/pasca-agenda.md`:
  - el sitio de la Alcaldía no publica noticias desde febrero, pero sí publicó 5 festivales del 23 al 25 de octubre;
  - la Gobernación no tiene API ni calendario;
  - Facebook no se lee de forma automatizada.
- **Enlace de invitación de organizador:** `/?organizador=correo` abre «Crea tu cuenta» con ese correo ya escrito. El
  mensaje que copia el admin trae el enlace y explica cómo publicar con IA desde un afiche. Enlace preparado para la
  Casa de la Cultura de Pasca.
- Los eventos de Pasca dicen «· Pasca» junto al lugar en el carrusel, la Agenda y Novedades.
- **Registrar mi negocio:** el municipio (Fusagasugá o Pasca) es obligatorio. El mapa del formulario se centra en el
  municipio elegido. Antes, todo negocio se guardaba como de Fusagasugá, incluso al editarlo.

### Cambiado
- Textos que nombraban solo a Fusa:
  - «Qué hacer en Fusa» ahora dice «Qué hacer en Fusa y Pasca», o el municipio elegido;
  - el pie de página dice «El directorio digital de Fusagasugá y Pasca, en la región del Sumapaz»;
  - el `<title>` y el manifiesto dicen «Fusa Conecta — Fusagasugá y Pasca», y los atajos, «Mapa de Fusa y Pasca» y
    «Agenda: qué hacer en Fusa y Pasca»;
  - también cambiaron el saludo, los cupones vacíos, las Novedades, el texto para compartir un lugar y una regla nueva
    del asistente.

  La marca «Fusa Conecta» y el lema del logo no cambiaron. La meta descripción, el manifiesto y el aviso legal ya
  nombraban a Pasca.
- La línea de filtros activos ya no muestra el municipio, porque se ve siempre en el selector. «Mis favoritos» muestra
  todos los guardados, sin importar el municipio.
- PWA v68 (`fusa-v61`). Parte 2: PWA v69 (`fusa-v62`). Parte 3: PWA v70 (`fusa-v63`).

### Pruebas
- Vitest: `municipioDe`, `enMunicipio`, las opciones del selector y `municipioGuardado`.
- Playwright: con «Pasca» elegido se ven solo lugares de Pasca, «Todo Pasca» y la invitación a publicar. La elección
  sobrevive a la recarga. El mapa se centra en Pasca. Con «Fusa y Pasca» se ven los dos municipios. La semilla del
  emulador trae un negocio de prueba en Pasca.
- pytest: un negocio de Pasca aprobado sale en `/v1/comercios?municipio=Pasca` con su municipio, y no sale en
  Fusagasugá.
- pytest y Vitest: el horario de la Alcaldía de Pasca (abierto el sábado a las 10:00, cerrado a las 13:00).
  `/v1/rutas?municipio=`. Los 6 lugares de Pasca con su fuente y sin teléfono, y el aviso del páramo.
- Playwright: con «Pasca» se ven la Alcaldía, el mensaje de senderos y las fichas del páramo (aviso oficial, sin
  «Llamar» ni «Cómo llegar») y de la Alcaldía (correo y fuente).
- pytest: `ultima_publicacion` por tipo, con el caso real de Pasca: última noticia en febrero, último evento en
  octubre.
- Vitest: `lugarEv` («· Pasca») y `textoUltima` (más de 60 días = desactualizado).
- Playwright: el enlace de invitación abre el registro con el correo escrito, y el mensaje del admin lo incluye.

## [1.2.0] - 2026-10-29 · Entrada más corta, barra con Inicio al centro y avisos al celular

### Cambiado
- **Entrada más corta (parte 1).** Con sesión, la pantalla de entrada se va con lo primero que pase: la app está lista (mínimo 1,6 s) o se cumplen 3 s (`SPLASH.max`). Ya no espera a la nube: si el teléfono tiene una copia del directorio (`datos.js` y la persistencia de Firestore de una visita anterior, marcada con `fc_nube_ok`) o el perfil guardado (`fc_perfil_<uid>`), entra con eso y `onSnapshot` actualiza la vista cuando llegan los datos.
- El rol admin solo se habilita con el perfil real de Firestore (`estado.perfilReal`), nunca con la copia del teléfono.
- Invitado: la animación de entrada va un 25 % más rápida y los botones «Registrarse» y «Solo explorar» se ven completos a los 2,05 s de aparecer la pantalla (antes, 3,3 s). El aviso «Cargando… revisa tu conexión» de los 8 s queda solo para cuando el teléfono no tiene ninguna copia.
- PWA v64 (`fusa-v57`).
- **Barra inferior con Inicio al centro (parte 2).** Nuevo orden: Mapa · Cupones · **Inicio** (botón central grande, ícono `house`, con un anillo cuando está activo) · Agenda · Perfil. Cupones es un botón normal con su globo de cantidad. **Agenda** (`calendar-days`) abre «Qué hacer en Fusa», la misma vista de «Ver agenda», que sigue en el inicio. Atajo nuevo del ícono de la app: `?ir=agenda`.
- **Mis favoritos** sale de la barra y pasa a Perfil como primera opción, con su contador. Se abre como pantalla de segundo nivel (con «Volver») y marca la pestaña Perfil. Para un invitado abre la hoja de ingreso. El corazón de cada ficha sigue igual.
- Revisada a 360 px de ancho, en modo noche y con el texto agrandado un 30 %: los cinco botones miden 70 × 60 px.
- PWA v65 (`fusa-v58`).
- **Avisos al celular (parte 3).** Notificaciones push reales con Firebase Cloud Messaging, sin Cloud Functions (plan Spark): al aprobar o rechazar un negocio, evento, ruta, Premium o reclamo, el panel admin guarda la decisión y llama a la API, que avisa a la persona. El admin ve «Aprobado. Le avisamos a {nombre} en su celular» o «… Verá el aviso en la campana de Novedades». Si la API está dormida, reintenta en segundo plano hasta 60 s sin bloquearlo.
- El permiso **nunca** se pide al abrir la app: solo al terminar «Registrar mi negocio» («¿Quieres que te avisemos aquí cuando tu negocio sea aprobado?») o con el interruptor «Avisos en este celular» de Perfil. Si está bloqueado, se explica cómo activarlo. En iPhone se avisa que hace falta la app instalada (iOS 16.4 o superior).
- La campana muestra «Para ti» con las aprobaciones y rechazos (`usuarios/{uid}/notificaciones`), aunque la persona no haya dado permiso. Al tocar un aviso se abre la pantalla correcta (`#/mi-negocio`, `#/evento/…`, `#/recorridos`).
- `sw.js` recibe el push y muestra el aviso con el ícono de la marca. PWA v66 (`fusa-v59`).
- **Cupones (parte 4).** Cuando no hay cupones activos, la pantalla ya no dice que se publican cada semana. Ahora dice «Pronto habrá cupones de los negocios de Fusa. ¿Tienes un negocio? Publica el tuyo», con un botón a «Registrar mi negocio».
- **Mi negocio:** si la ficha no tiene foto o WhatsApp, avisa «Tu ficha está incompleta: agrega una foto y tu WhatsApp para recibir más clientes», con el botón «Completar mi ficha». El aviso también sale en «Mis negocios» de Perfil.
- **Limpieza diaria:** además de los negocios sin foto, cuenta y lista los que no tienen WhatsApp (`sin_whatsapp`). El panel admin los muestra.
- **App Android 1.1.0** (`apk-v1.1.0`, `versionCode` 2). Los avisos salen como «Fusa Conecta» (`enableNotifications: true`), con el isotipo en blanco. En Android 13 o superior la app pide `POST_NOTIFICATIONS`. Atajo nuevo: Agenda.
- PWA v67 (`fusa-v60`).

### Corregido
- **Agenda: eventos duplicados con otro título u hora.** Caso real: «Celebración del Día Dulce» (31/10, 9:00, «Estadio Fernando Mazuera») y «Día Dulce» (31/10, 14:00, «Estadio municipal Fernando Mazuera»). Regla nueva en `agenda.py` (`parecidos`): mismo día; lugar con al menos 60 % de palabras en común, sin contar «municipal», «estadio», etc.; y un título dentro del otro o con similitud ≥ 0,6. Los parecidos se unen en uno con el horario más amplio (9:00 a 16:00) y las dos fuentes (`fuentes`). La ficha del evento muestra «Otra publicación».
- La agenda repara también los duplicados ya guardados (`unir_guardados`). Nunca borra un evento que publicó una persona. El panel muestra cuántos se unieron.
- Escáner de cupones: si el navegador tardaba en negar la cámara, el aviso «Necesitamos permiso para usar la cámara» aparecía tarde y tapaba el resultado del código escrito a mano.

### Agregado
- Releases de la app Android en GitHub: `apk-v1.0.0` (la que cita el documento técnico) y `apk-v1.1.0`.
- API: `POST /v1/notificaciones/aprobacion` (el endpoint 10). Usa una cuenta de servicio aparte, `FIREBASE_SA_FCM` («Firebase Cloud Messaging API Admin»), solo en Render. Pasos en `api/LEEME.md`. Es idempotente y borra los tokens inválidos. CORS admite POST.
- Reglas: `usuarios/{uid}/dispositivos/{token}`: solo la persona los crea y borra, nadie los lee desde la app. `usuarios/{uid}/notificaciones`: solo la API escribe; la persona lee y marca como leídas.
- `docs/tecnologias-emergentes.md`: lo que ya funciona (IA generativa con llamadas a funciones, IA desde afiches, agenda automática, mapas 3D con relieve real, grabación GPS, PWA offline-first, TWA y analítica Umami) con su evidencia en `docs/evidencias/tecnologias/`.
- `docs/entrega-sena/`: material para el documento técnico (capítulos 3 a 11). Incluye arquitectura en Mermaid (7 diagramas, también en PNG), los 9 endpoints con respuestas reales de producción, la estructura del repositorio, comandos y resultados de pruebas con capturas, y una guía de qué cambiar en cada capítulo.

### Pruebas
- Vitest: `appLista` y la regla del máximo (`salidaSplash`), 5 casos.
- Playwright: entrada con sesión (≤ 3,5 s; medido 1,6 s), con la nube lenta (se va a los 3 s sin esperarla) e invitado (botones visibles ≤ 2,6 s desde la primera pintura; medido 2,0 s).
- Playwright: la barra inferior (los cinco botones, cada uno con su pantalla y `aria-current`, área táctil ≥ 44 px) y Perfil → «Mis favoritos». La prueba del cupón ahora entra a la billetera por el botón Cupones de la barra y revisa su globo.
- pytest: el endpoint de avisos (401, 403, 404, 409, 422 y 503; aprobado y rechazado; tokens inválidos borrados; sin repetir; sin push para quien no dio permiso), `AvisadorFCM` con `messaging` simulado y el repositorio, que solo escribe en novedades y dispositivos. Integración contra el emulador. Cobertura de la API: 84 %.
- Vitest: `estadoAvisos`, `refrescarDispositivo` (nunca pide el permiso al abrir) y `textoAviso`.
- Playwright: reglas de dispositivos, «Para ti» en la campana y la pregunta después de registrar el negocio.
- pytest: el caso real del Día Dulce (`parecidos`, `unir`, `unir_parecidos`) y, contra el emulador, la reparación de los ya guardados (queda uno de 9:00 a 16:00 con las dos fuentes; el de una persona no se borra; una corrida nueva no lo vuelve a crear). También los negocios sin WhatsApp.
- Vitest: `fichaIncompleta`.

### Revisado sin cambios
- **Fotos en base64.** Se midieron los negocios publicados en producción el 2026-10-29: el más grande, MG WASHERS, pesa 27 KB, y los cuatro juntos, 68 KB. Desde la v4, el documento solo guarda una miniatura de portada; `firestore.rules` la limita a 56 000 caracteres (≈ 40 KB). Las fotos grandes van en la subcolección `comercios/{id}/fotos`, que solo se lee al abrir la ficha. Ningún documento se acerca a 200 KB.

## [1.1.0] - 2026-10-28 · Plan de pruebas con evidencias

### Agregado
- **Unitarias de JavaScript** (Vitest): 36 casos sobre el código real de `app.js`, cargado sin modificar con espree:
  - horarios (abierto, cierra pronto, próxima apertura y medianoche);
  - formato de la hora;
  - búsqueda sin tildes ni plurales;
  - validación de cupones.
- **De extremo a extremo** (Playwright, celular de 390×844, emulador): explorar, buscar «café», abrir la ficha y WhatsApp; el ciclo completo del cupón (obtener, QR, validar, canjear y rechazar un segundo canje); SOS sin conexión; asistente con llamada a funciones.
- **Lighthouse CI** (móvil, 3 corridas): accesibilidad 100 y PWA 100 (meta ≥ 90), buenas prácticas 100, SEO 100 y rendimiento 56 (advertencia).
- Informes HTML con pytest-html y cobertura de la API (83 %, mínimo exigido 80 %).
- Artefacto **informe-pruebas** en GitHub Actions con el resumen de todas las suites (`pruebas/resumen.mjs`).
- Plan de pruebas y tabla de resultados en `docs/pruebas.md`, con capturas en `docs/evidencias/pruebas/`.
- `emulators` en `firebase.json`, con el puerto de Firestore 8099, el mismo que usa la PWA en modo emulador.

## [1.0.0] - 2026-10-28 · Estándares e integración continua

### Agregado
- ESLint 9 con la guía de Airbnb adaptada y Prettier para JavaScript; black, flake8 (PEP 8) y type hints para Python (`docs/estandares.md`).
- Ramas `main` (producción) y `develop`, Conventional Commits, plantilla de Pull Request y este CHANGELOG (`CONTRIBUTING.md`).
- Integración continua en GitHub Actions (`ci.yml`). En cada Pull Request:
  - ESLint, Prettier, black y flake8;
  - pruebas de Python;
  - pruebas de integración contra el emulador de Firestore;
  - formato de los commits.
- Despliegue automático al fusionar en `main`: Firebase Hosting y reglas de Firestore; la API en Render se despliega cuando pasan las pruebas.

### Cambiado
- `app.js` cumple ESLint (0 errores) sin cambiar su comportamiento. Las correcciones se aplicaron sobre el árbol sintáctico, se revisaron en el navegador y se quitaron tres funciones que nadie usaba.

## [0.9.0] - 2026-10-28 · App Android, API REST y procesos en Python

### Agregado
- App Android (Trusted Web Activity) `co.fusaconecta.app` con APK y AAB firmados en GitHub Actions, y `assetlinks.json` (sin barra del navegador).
- API REST en Python (FastAPI) con 9 endpoints:
  - comercios, eventos, calendario ICS, rutas en GPX y emergencias;
  - reporte del negocio en Excel y PDF;
  - estadísticas del admin y estado del servicio.
- Documentación OpenAPI en `/docs`. Despliegue gratuito en Render.
- Botones nuevos en la app: «Suscribirme a la agenda», «Descargar GPX», «Descargar reporte» y la API en el Diagnóstico.
- Limpieza diaria en Python: cupones vencidos, eventos de ejemplo y negocios sin foto.

### Cambiado
- La agenda automática pasó de JavaScript a Python con el mismo comportamiento (prueba de paridad).

## [0.8.0] - 2026-10-28 · Agenda más clara
- Eventos de ejemplo:
  - Etiqueta «Ejemplo».
  - No salen en el asistente, el banner ni «Qué hacer en Fusa».
  - Se borran solos a las 24 horas.
- Eventos automáticos con título corto, imagen de la noticia y separación entre planes y «Avisos del municipio».
- Inicio sin lugares repetidos y con los que tienen foto primero.
- Trazados oficiales de senderos publicados por el admin desde la app.

## [0.7.0] - 2026-10-28 · IA y comunidad
- Asistente «Pregúntale a Fusa» (Gemini con llamadas a funciones).
- Agenda automática desde fuentes oficiales.
- Rutas propuestas por la comunidad.
- Pantalla de entrada que espera a que la app esté lista.
- Modo noche automático por la hora de Colombia.
- Aviso de mudanza para la versión de Netlify.

## [0.6.0] - 2026-10-23 · Eventos con IA
- Llenar eventos con IA desde un afiche o un texto, y organizadores invitados.
- Categoría Servicios.
- Trazado real de Cara del Indio.

## [0.5.0] - 2026-10-23 · Senderos y agenda
- Senderos con ruta guiada y 3D.
- Nuevo diseño de comercios.
- «Qué hacer en Fusa» (eventos y agenda).
- Fotos de negocios y privacidad.

## [0.4.0] - 2026-10-23 · Una sola cuenta y panel de administración
- Una sola cuenta para todos y galería de fotos.
- Panel de administración, plan Premium y modo oscuro.
- Hosting en Firebase (fusa-conecta.web.app).

## [0.3.0] - 2026-10-22 · Roles, cupones y presentación
- Reglas por rol y cupones con QR (crear, obtener, billetera y escanear).
- Identidad visual, radio en vivo y analítica con Umami.

## [0.2.0] - 2026-10-19 · Firebase real
- Ingreso con Firebase, base de datos en tiempo real y sistema de diseño con íconos Lucide.

## [0.1.0] - 2026-06-13 · Prototipo
- Primer prototipo del directorio de Fusagasugá.

[Sin publicar]: https://github.com/marce504/fusa-conecta/compare/v1.3.0...develop
[1.3.0]: https://github.com/marce504/fusa-conecta/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/marce504/fusa-conecta/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/marce504/fusa-conecta/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/marce504/fusa-conecta/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/marce504/fusa-conecta/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/marce504/fusa-conecta/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/marce504/fusa-conecta/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/marce504/fusa-conecta/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/marce504/fusa-conecta/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/marce504/fusa-conecta/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/marce504/fusa-conecta/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/marce504/fusa-conecta/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/marce504/fusa-conecta/releases/tag/v0.1.0
