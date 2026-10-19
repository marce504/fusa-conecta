/* ===== DATOS BASE DE FUSA CONECTA =====
 * Copia local del directorio: permite que la app funcione sin conexión
 * (equivalente a la base local SQLite del Documento Técnico, cap. 4.8.1).
 * Firestore es la fuente de verdad y agrega los comercios registrados por productores.
 */
const CAT={
  campo:    {label:'Vitrina del Campo',    bg:'#DAB23F',fg:'#3a3110',hero:'linear-gradient(135deg,#e8cc78,#DAB23F)',emoji:'🌿'},
  comercio: {label:'Directorio Comercial', bg:'#EA8143',fg:'#fff',   hero:'linear-gradient(135deg,#F4A079,#EA8143)',emoji:'🏪'},
  turismo:  {label:'Turismo y Rutas',      bg:'#BC487D',fg:'#fff',   hero:'linear-gradient(135deg,#D472A0,#BC487D)',emoji:'🥾'},
  hospedaje:{label:'Hospedaje',            bg:'#2D6A8E',fg:'#fff',   hero:'linear-gradient(135deg,#4A90C2,#2D6A8E)',emoji:'🛏️'},
  bares:    {label:'Bares y Licores',      bg:'#6C2E77',fg:'#fff',   hero:'linear-gradient(135deg,#9B4BAF,#6C2E77)',emoji:'🍸'},
  tramite:  {label:'Trámites Municipales', bg:'#204F2E',fg:'#fff',   hero:'linear-gradient(135deg,#3a8f58,#204F2E)',emoji:'🏛️'}
};

// Plaza principal de Fusagasugá: centro del mapa cuando no hay GPS (RF-10)
const PLAZA_FUSA=[4.3443,-74.3619];

const COMERCIOS_BASE=[
  {"id":"c01","cat":"campo","emoji":"🌿","rating":4.8,"nombre":"Café Sutagao","desc":"Café de origen cultivado y tostado por familias campesinas del piedemonte fusagasugueño, con secado al sol y tueste artesanal. Catación los fines de semana.","horario":"Sáb y Dom · 7–2 p.m.","direccion":"Vereda Bermejal","tel":"3101110001","whatsapp":"3101110001","imagen":"img/comercios/cafe-sutagao.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":true,"prioridadBusqueda":1,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c02","cat":"campo","emoji":"🍯","rating":4.9,"nombre":"Miel La Aguadita","desc":"Miel pura de abejas, polen y propóleo del corregimiento de La Aguadita. Recorridos guiados por el apiario con cita previa.","horario":"Lun-Sáb · 8–4 p.m.","direccion":"Cto La Aguadita","tel":"3101110002","whatsapp":"3101110002","imagen":"img/comercios/miel-la-aguadita.jpg","lat":4.38834,"lng":-74.32489,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c03","cat":"campo","emoji":"🧺","rating":4.7,"nombre":"Artesanías de Balay","desc":"Cestería y artesanías tradicionales tejidas a mano en fibras naturales por artesanas locales. Piezas por encargo.","horario":"Lun-Sáb · 8–5 p.m.","direccion":"Vereda Bosachoque","tel":"3101110003","whatsapp":"3101110003","imagen":"img/comercios/artesanias-de-balay.jpg","lat":4.37055,"lng":-74.38747,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c04","cat":"campo","emoji":"🌸","rating":5,"nombre":"Vivero de Orquídeas de Fusa","desc":"Cattleyas, phalaenopsis y orquídeas nativas cultivadas en Ciudad Jardín. Plantas en flor, sustratos y asesoría.","horario":"Mar-Dom · 9–5 p.m.","direccion":"Vereda Bosachoque","tel":"3101110004","whatsapp":"3101110004","imagen":"img/comercios/vivero-de-orquideas-de-fusa.jpg","lat":4.37055,"lng":-74.38747,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c05","cat":"campo","emoji":"🧀","rating":4.7,"nombre":"Quesos Campesinos El Triunfo","desc":"Queso doble crema, campesino y cuajada fresca elaborados a diario con leche de la vereda de forma tradicional.","horario":"Todos los días · 6–1 p.m.","direccion":"Vereda El Triunfo","tel":"3101110005","whatsapp":"3101110005","imagen":"img/comercios/quesos-campesinos-el-triunfo.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c06","cat":"campo","emoji":"🍓","rating":4.5,"nombre":"Conservas Doña Rosa","desc":"Mermeladas de mora, fresa y uchuva hechas sin conservantes con fruta fresca de fincas vecinas y cocción lenta.","horario":"Mié-Dom · 9–4 p.m.","direccion":"Vereda Sardinas","tel":"3101110006","whatsapp":"3101110006","imagen":"img/comercios/conservas-dona-rosa.jpg","lat":4.31072,"lng":-74.35456,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c07","cat":"campo","emoji":"🥬","rating":4.8,"nombre":"Huerta Orgánica San José","desc":"Verduras y hortalizas orgánicas sin agroquímicos, cosechadas el mismo día. Canastas semanales a domicilio.","horario":"Lun/Mié/Vie · 7–12 m.","direccion":"Vereda Usatama","tel":"3101110007","whatsapp":"3101110007","imagen":"img/comercios/huerta-organica-san-jose.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c08","cat":"campo","emoji":"🥛","rating":4.6,"nombre":"Lácteos La Pradera","desc":"Leche fresca, yogurt natural y kumis de finca propia. Del establo a tu mesa.","horario":"Todos los días · 5:30–11 a.m.","direccion":"Vereda La Cascada","tel":"3101110008","whatsapp":"3101110008","imagen":"img/comercios/lacteos-la-pradera.jpg","lat":4.38471,"lng":-74.3904,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c09","cat":"campo","emoji":"🧶","rating":4.9,"nombre":"Tejidos Manos Campesinas","desc":"Mochilas, ruanas y tejidos en lana por mujeres artesanas del campo, combinando diseños tradicionales y contemporáneos.","horario":"Jue-Dom · 9–5 p.m.","direccion":"Vereda Tierra Negra","tel":"3101110009","whatsapp":"3101110009","imagen":"img/comercios/tejidos-manos-campesinas.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c10","cat":"campo","emoji":"🪴","rating":4.7,"nombre":"Vivero Verde Plantas Nativas","desc":"Plántulas ornamentales, frutales y árboles nativos. Asesoría en siembra y paisajismo.","horario":"Mar-Dom · 8–5 p.m.","direccion":"Vereda Novillero","tel":"3101110010","whatsapp":"3101110010","imagen":"img/comercios/vivero-verde-plantas-nativas.jpg","lat":4.34539,"lng":-74.40025,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c11","cat":"comercio","emoji":"🔧","rating":4.5,"nombre":"Ferretería El Tornillo de Oro","desc":"Herramientas, materiales de construcción, pintura y eléctricos con asesoría para obra. Despacho a domicilio.","horario":"Lun-Sáb · 7–7 p.m.","direccion":"Cra 7 # 6-32, Centro","tel":"3102220011","whatsapp":"3102220011","imagen":"img/comercios/ferreteria-el-tornillo-de-oro.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c12","cat":"comercio","emoji":"🍕","rating":4.7,"nombre":"Pizzería Nápoles Fusa","desc":"Pizza artesanal en horno de leña, pastas frescas y entradas italianas. Domicilios en todo el casco urbano.","horario":"Mar-Dom · 4–10:30 p.m.","direccion":"Cll 18 # 8-15, Balmoral","tel":"3102220012","whatsapp":"3102220012","imagen":"img/comercios/pizzeria-napoles-fusa.jpg","lat":4.3331,"lng":-74.36398,"ubicacion_aprox":false,"esPremium":true,"prioridadBusqueda":1,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c13","cat":"comercio","emoji":"🍽️","rating":4.8,"nombre":"La Casona Sumapaceña","desc":"Cocina típica del Sumapaz: ajiaco, mute, sancocho y bandeja paisa con sazón casera.","horario":"Todos los días · 11–8 p.m.","direccion":"Cra 6 # 10-40, Centro","tel":"3102220013","whatsapp":"3102220013","imagen":"img/comercios/la-casona-sumapacena.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c14","cat":"comercio","emoji":"🥐","rating":4.6,"nombre":"Panadería y Café El Cedro","desc":"Pan fresco del día, pastelería y café de la región. Encargos de tortas para eventos.","horario":"Todos los días · 5:30–8 p.m.","direccion":"Cll 8 # 12-09, Pekín","tel":"3102220014","whatsapp":"3102220014","imagen":"img/comercios/panaderia-y-cafe-el-cedro.jpg","lat":4.34387,"lng":-74.35265,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c15","cat":"comercio","emoji":"💊","rating":4.4,"nombre":"Droguería Salud Total","desc":"Medicamentos, cuidado personal y primeros auxilios. Toma de presión gratuita y domicilio.","horario":"Todos los días · 7–10 p.m.","direccion":"Cra 8 # 7-21, Centro","tel":"3102220015","whatsapp":"3102220015","imagen":"img/comercios/drogueria-salud-total.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c16","cat":"comercio","emoji":"👟","rating":4.3,"nombre":"Calzado El Paso","desc":"Calzado para toda la familia: deportivo, formal, escolar y de trabajo.","horario":"Lun-Sáb · 9–7:30 p.m.","direccion":"Cll 16 # 7-50, E. Sierra","tel":"3102220016","whatsapp":"3102220016","imagen":"img/comercios/calzado-el-paso.jpg","lat":4.34444,"lng":-74.35949,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c17","cat":"comercio","emoji":"🍦","rating":4.7,"nombre":"Heladería Fusa Fresh","desc":"Helados artesanales, malteadas y postres fríos con frutas frescas de la región.","horario":"Todos los días · 12–9 p.m.","direccion":"Cra 7 # 12-18, Centro","tel":"3102220017","whatsapp":"3102220017","imagen":"img/comercios/heladeria-fusa-fresh.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c18","cat":"comercio","emoji":"📒","rating":4.5,"nombre":"Papelería Mil Ideas","desc":"Útiles escolares, fotocopias e impresiones a color, recargas y trámites en línea.","horario":"Lun-Sáb · 8–7 p.m.","direccion":"Cll 10 # 9-30, San Mateo","tel":"3102220018","whatsapp":"3102220018","imagen":"img/comercios/papeleria-mil-ideas.jpg","lat":4.33305,"lng":-74.37344,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c19","cat":"comercio","emoji":"🏍️","rating":4.6,"nombre":"Taller RápidoMoto","desc":"Mantenimiento, repuestos y mecánica express para motos de todas las marcas.","horario":"Lun-Sáb · 7:30–6 p.m.","direccion":"Av. Las Palmas # 22-14","tel":"3102220019","whatsapp":"3102220019","imagen":"img/comercios/taller-rapidomoto.jpg","lat":4.34116,"lng":-74.36677,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c20","cat":"comercio","emoji":"🐾","rating":4.9,"nombre":"Veterinaria Huellitas","desc":"Consulta, vacunación, peluquería canina, guardería y urgencias. Planes de salud preventiva.","horario":"Lun-Sáb · 8–7 · Dom 9–1","direccion":"Cll 14 # 6-22, Centro","tel":"3102220020","whatsapp":"3102220020","imagen":"img/comercios/veterinaria-huellitas.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c21","cat":"turismo","emoji":"⛰️","rating":4.8,"nombre":"Cerro Fusacatán","desc":"Cerro tutelar de Fusagasugá y uno de sus principales miradores. Caminata y avistamiento de aves al amanecer.","horario":"Recom. 5–4 p.m.","direccion":"Costado oriental","tel":"3103330021","whatsapp":"3103330021","imagen":"img/comercios/cerro-fusacatan.jpg","lat":4.33237,"lng":-74.33815,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"sendero","nivelDificultad":"Media"},
  {"id":"c22","cat":"turismo","emoji":"🪨","rating":4.6,"nombre":"Sendero Cara del Indio","desc":"Formación rocosa con perfil de indígena. Vistas panorámicas del paisaje sumapaceño.","horario":"Diurna · 6–5 p.m.","direccion":"Vía Fusa-Arbeláez","tel":"3103330022","whatsapp":"3103330022","imagen":"img/comercios/sendero-cara-del-indio.jpg","lat":4.322,"lng":-74.48805,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"sendero","nivelDificultad":"Media"},
  {"id":"c23","cat":"turismo","emoji":"🌫️","rating":4.7,"nombre":"Corregimiento La Aguadita","desc":"Clima frío y niebla a 20 min del centro. Senderos de montaña y bosque altoandino.","horario":"Todo el día · lleva abrigo","direccion":"Cto La Aguadita","tel":"3103330023","whatsapp":"3103330023","imagen":"img/comercios/corregimiento-la-aguadita.jpg","lat":4.38834,"lng":-74.32489,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"sendero","nivelDificultad":"Alta"},
  {"id":"c24","cat":"turismo","emoji":"🏘️","rating":4.5,"nombre":"Pueblito Fusagasugueño","desc":"Réplica colonial con artesanías, gastronomía típica y eventos culturales.","horario":"Mar-Dom · 9–6 p.m.","direccion":"Sector turístico","tel":"3103330024","whatsapp":"3103330024","imagen":"img/comercios/pueblito-fusagasugueno.jpg","lat":4.34582,"lng":-74.37689,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"cultural","nivelDificultad":"Baja"},
  {"id":"c25","cat":"turismo","emoji":"🥾","rating":4.6,"nombre":"Ruta de los Sutagaos","desc":"Senderismo por paisajes rurales, miradores y caminos ancestrales del municipio.","horario":"Guiado · mañana","direccion":"Zona rural","tel":"3103330025","whatsapp":"3103330025","imagen":"img/comercios/ruta-de-los-sutagaos.jpg","lat":4.34495,"lng":-74.36742,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"sendero","nivelDificultad":"Media"},
  {"id":"c26","cat":"turismo","emoji":"🛤️","rating":4.5,"nombre":"Camino Real de Alaska","desc":"Antiguo camino empedrado colonial en la vereda Alaska. Caminatas ecológicas y fotografía.","horario":"Diurna · clima templado","direccion":"Vereda Alaska","tel":"3103330026","whatsapp":"3103330026","imagen":"img/comercios/camino-real-de-alaska.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"sendero","nivelDificultad":"Baja"},
  {"id":"c27","cat":"turismo","emoji":"🌄","rating":4.4,"nombre":"Mirador de Ricaurte","desc":"Punto elevado con vistas del valle y la zona rural. Contemplar el atardecer.","horario":"Recom. 6–5 p.m.","direccion":"Sector Ricaurte","tel":"3103330027","whatsapp":"3103330027","imagen":"img/comercios/mirador-de-ricaurte.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"mirador","nivelDificultad":"Baja"},
  {"id":"c28","cat":"turismo","emoji":"🏞️","rating":4.5,"nombre":"Alto de San Benito","desc":"Sector campestre con miradores naturales. Punto de partida de rutas ecológicas.","horario":"Todo el día","direccion":"Sector San Benito","tel":"3103330028","whatsapp":"3103330028","imagen":"img/comercios/alto-de-san-benito.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"mirador","nivelDificultad":"Baja"},
  {"id":"c29","cat":"turismo","emoji":"⛪","rating":4.6,"nombre":"Iglesia de Belén","desc":"Templo referente religioso y arquitectónico del centro. Recorrido patrimonial.","horario":"Según horario misas","direccion":"Barrio Belén","tel":"3103330029","whatsapp":"3103330029","imagen":"img/comercios/iglesia-de-belen.jpg","lat":4.34404,"lng":-74.36126,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"cultural","nivelDificultad":"Baja"},
  {"id":"c30","cat":"turismo","emoji":"☕","rating":4.9,"nombre":"Hacienda Coloma – Museo del Café","desc":"Hacienda cafetera con catación, tienda y senderos. Uno de los grandes atractivos de Fusagasugá.","horario":"Mar-Dom · 9–4 p.m.","direccion":"Vía Fusa-Bogotá km 4","tel":"3103330030","whatsapp":"3103330030","imagen":"img/comercios/hacienda-coloma-museo-del-cafe.jpg","lat":4.34286,"lng":-74.37764,"ubicacion_aprox":false,"esPremium":true,"prioridadBusqueda":1,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá","tipo":"finca","nivelDificultad":"Baja"},
  {"id":"c31","cat":"hospedaje","emoji":"🏨","rating":4.5,"nombre":"Hotel Casa Tarará","desc":"Hotel céntrico con habitaciones cómodas, wifi, parqueadero y desayuno incluido.","horario":"Recepción 24h","direccion":"Cra 7 # 8-40, Centro","tel":"3104440031","whatsapp":"3104440031","imagen":"img/comercios/hotel-casa-tarara.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c32","cat":"hospedaje","emoji":"🛎️","rating":4.7,"nombre":"Hotel Boutique La Quinta","desc":"Hotel boutique con jardines y zona de descanso. Habitaciones temáticas y atención personalizada.","horario":"Recepción 24h","direccion":"Cll 12 # 6-18, Centro","tel":"3104440032","whatsapp":"3104440032","imagen":"img/comercios/hotel-boutique-la-quinta.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":true,"prioridadBusqueda":1,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c33","cat":"hospedaje","emoji":"🎒","rating":4.4,"nombre":"Hostal Viajero Sumapaz","desc":"Hostal económico con habitaciones privadas y compartidas. Cocina común para mochileros.","horario":"Rec. 7–10 p.m.","direccion":"Cll 16 # 9-25","tel":"3104440033","whatsapp":"3104440033","imagen":"img/comercios/hostal-viajero-sumapaz.jpg","lat":4.34495,"lng":-74.36742,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c34","cat":"hospedaje","emoji":"⛺","rating":4.8,"nombre":"Glamping Cielo Verde","desc":"Domos panorámicos en la montaña con fogata y vistas al valle. Incluye desayuno.","horario":"Check-in 3p · out 12m","direccion":"Vereda Bermejal alto","tel":"3104440034","whatsapp":"3104440034","imagen":"img/comercios/glamping-cielo-verde.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c35","cat":"hospedaje","emoji":"🌳","rating":4.6,"nombre":"Hotel Campestre El Vergel","desc":"Hotel campestre con piscina, zonas verdes y salones para eventos.","horario":"Recepción 24h","direccion":"Vía Fusa-Arbeláez km 2","tel":"3104440035","whatsapp":"3104440035","imagen":"img/comercios/hotel-campestre-el-vergel.jpg","lat":4.32334,"lng":-74.36584,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c36","cat":"hospedaje","emoji":"🏢","rating":4.3,"nombre":"Aparta-hotel Ciudad Jardín","desc":"Apartamentos amoblados por noche o temporada con cocina equipada y wifi.","horario":"Rec. 6–11 p.m.","direccion":"Cll 6 # 5-12, Centro","tel":"3104440036","whatsapp":"3104440036","imagen":"img/comercios/aparta-hotel-ciudad-jardin.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c37","cat":"hospedaje","emoji":"🌿","rating":4.5,"nombre":"Glamping Bosque de Niebla","desc":"Glamping de clima frío en La Aguadita. Domos cálidos y fogatas nocturnas.","horario":"Check-in 3p · out 12m","direccion":"Cto La Aguadita","tel":"3104440037","whatsapp":"3104440037","imagen":"img/comercios/glamping-bosque-de-niebla.jpg","lat":4.38834,"lng":-74.32489,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c38","cat":"hospedaje","emoji":"🏬","rating":4.4,"nombre":"Hotel Plaza Centro","desc":"Hotel funcional frente a zonas comerciales. Bien ubicado para trámites o compras.","horario":"Recepción 24h","direccion":"Cra 6 # 7-55, Centro","tel":"3104440038","whatsapp":"3104440038","imagen":"img/comercios/hotel-plaza-centro.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c39","cat":"hospedaje","emoji":"🛏️","rating":4.6,"nombre":"Finca-Hotel Los Cerezos","desc":"Finca-hotel con piscina, juegos y restaurante. Celebraciones en ambiente campestre.","horario":"Recepción 24h","direccion":"Vereda Guavio","tel":"3104440039","whatsapp":"3104440039","imagen":"img/comercios/finca-hotel-los-cerezos.jpg","lat":4.28138,"lng":-74.39673,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c40","cat":"hospedaje","emoji":"🧳","rating":4.5,"nombre":"Hostal Mochilero Fusa","desc":"Hostal juvenil con terraza y planes de senderismo. Ambiente social para viajeros.","horario":"Rec. 7–11 p.m.","direccion":"Cll 18 # 7-30, Balmoral","tel":"3104440040","whatsapp":"3104440040","imagen":"img/comercios/hostal-mochilero-fusa.jpg","lat":4.3331,"lng":-74.36398,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c41","cat":"bares","emoji":"🍸","rating":4.6,"nombre":"Gastrobar La Terraza","desc":"Coctelería de autor y música en vivo los fines de semana. Terraza con vista a la ciudad.","horario":"Jue-Sáb · 5–2 a.m.","direccion":"Cll 17 # 7-22, Centro","tel":"3105550041","whatsapp":"3105550041","imagen":"img/comercios/gastrobar-la-terraza.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":true,"prioridadBusqueda":1,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c42","cat":"bares","emoji":"🎶","rating":4.4,"nombre":"Discoteca Luna Club","desc":"Reguetón, crossover y electrónica. Zona VIP y la mejor rumba del fin de semana.","horario":"Vie/Sáb · 9–3 a.m.","direccion":"Av. Las Palmas # 18-40","tel":"3105550042","whatsapp":"3105550042","imagen":"img/comercios/discoteca-luna-club.jpg","lat":4.34116,"lng":-74.36677,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c43","cat":"bares","emoji":"🛵","rating":4.5,"nombre":"Estanco El Trago Express","desc":"Amplia variedad de licores con domicilio rápido en todo el casco urbano.","horario":"Todos · 10–12 a.m.","direccion":"Cra 8 # 14-10, Centro","tel":"3105550043","whatsapp":"3105550043","imagen":"img/comercios/estanco-el-trago-express.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c44","cat":"bares","emoji":"🍷","rating":4.7,"nombre":"Bar de Vinos Uvas & Co","desc":"Carta nacional e importada, tablas de quesos y maridajes guiados en ambiente íntimo.","horario":"Mié-Sáb · 4–12 a.m.","direccion":"Cll 12 # 8-05, Centro","tel":"3105550044","whatsapp":"3105550044","imagen":"img/comercios/bar-de-vinos-uvas-co.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c45","cat":"bares","emoji":"🍺","rating":4.6,"nombre":"Cervecería Artesanal Fusa Beer","desc":"Estilos de barril locales, hamburguesas y alitas. Growlers y domicilios de cerveza fría.","horario":"Mar-Dom · 3–11 p.m.","direccion":"Cra 7 # 20-15, Balmoral","tel":"3105550045","whatsapp":"3105550045","imagen":"img/comercios/cerveceria-artesanal-fusa-beer.jpg","lat":4.3331,"lng":-74.36398,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c46","cat":"bares","emoji":"🎤","rating":4.3,"nombre":"Karaoke Las Vegas","desc":"Cabinas privadas con gran catálogo de canciones, cocteles y pasabocas.","horario":"Jue-Sáb · 6–2 a.m.","direccion":"Cll 16 # 6-28, Centro","tel":"3105550046","whatsapp":"3105550046","imagen":"img/comercios/karaoke-las-vegas.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c47","cat":"bares","emoji":"🚚","rating":4.5,"nombre":"Licorera 24h Don Licor","desc":"Domicilios nocturnos de cervezas, aguardiente, ron y mezcladores las 24 horas.","horario":"Todos · 24 horas","direccion":"Av. Las Palmas # 25-03","tel":"3105550047","whatsapp":"3105550047","imagen":"img/comercios/licorera-24h-don-licor.jpg","lat":4.34243,"lng":-74.36934,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c48","cat":"bares","emoji":"🌴","rating":4.5,"nombre":"Lounge Bar Selva","desc":"Coctelería tiki, música chill y zona al aire libre. After office y noches tranquilas.","horario":"Mié-Sáb · 5–1 a.m.","direccion":"Cll 19 # 8-50, Centro","tel":"3105550048","whatsapp":"3105550048","imagen":"img/comercios/lounge-bar-selva.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c49","cat":"bares","emoji":"📻","rating":4.4,"nombre":"Bar Rockola El Recuerdo","desc":"Música popular con clásicos del despecho y la salsa. Tradición rumbera del centro.","horario":"Jue-Dom · 4–1 a.m.","direccion":"Cra 6 # 13-12, Centro","tel":"3105550049","whatsapp":"3105550049","imagen":"img/comercios/bar-rockola-el-recuerdo.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c50","cat":"bares","emoji":"🍹","rating":4.7,"nombre":"Cocktail Bar Mixología 360","desc":"Coctelería de autor con bartenders profesionales y barra en vivo.","horario":"Jue-Sáb · 6–2 a.m.","direccion":"Cll 17 # 9-14, Centro","tel":"3105550050","whatsapp":"3105550050","imagen":"img/comercios/cocktail-bar-mixologia-360.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c51","cat":"tramite","emoji":"🏛️","rating":4.2,"nombre":"Alcaldía Municipal de Fusagasugá","desc":"Trámites de gobierno, hacienda, planeación y atención ciudadana.","horario":"Lun-Vie · 8–12 y 2–6","direccion":"Calle 6 N° 6-24, Centro","tel":"6018868181","whatsapp":"","imagen":"img/comercios/alcaldia-municipal-de-fusagasuga.jpg","lat":4.3443,"lng":-74.36194,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"https://www.fusagasuga-cundinamarca.gov.co","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c52","cat":"tramite","emoji":"📜","rating":4.3,"nombre":"Notaría Primera de Fusagasugá","desc":"Autenticaciones, registro civil, escrituras, matrimonios y sucesiones.","horario":"Lun-Vie · 8–1 y 2–5","direccion":"Calle 9 N° 7-21, Centro","tel":"6018731234","whatsapp":"","imagen":"img/comercios/notaria-primera-de-fusagasuga.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c53","cat":"tramite","emoji":"📜","rating":4.2,"nombre":"Notaría Segunda de Fusagasugá","desc":"Jornada continua: autenticación, registro civil, matrimonios y sucesiones.","horario":"Lun-Vie · 8–5 · Sáb 8–12","direccion":"Cra 8 N° 8-13, Centro","tel":"6018735678","whatsapp":"","imagen":"img/comercios/notaria-segunda-de-fusagasuga.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c54","cat":"tramite","emoji":"🚒","rating":4.9,"nombre":"Bomberos Voluntarios de Fusagasugá","desc":"Incendios, rescates y emergencias 24 horas. Capacitaciones e inspecciones.","horario":"Emergencias · 24h","direccion":"Carrera 5 N° 9-02","tel":"3115853577","whatsapp":"3115853577","imagen":"img/comercios/bomberos-voluntarios-de-fusagasuga.jpg","lat":4.3289,"lng":-74.3653,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c55","cat":"tramite","emoji":"🎓","rating":4.6,"nombre":"SENA – Centro Agroecológico","desc":"Formación gratuita en áreas agroindustriales, administrativas y turismo.","horario":"Lun-Vie · 7–5 p.m.","direccion":"Av. Manuel H. Cárdenas, Calle 16","tel":"6018673476","whatsapp":"","imagen":"img/comercios/sena-centro-agroecologico.jpg","lat":4.33911,"lng":-74.36644,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"https://www.sena.edu.co","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c56","cat":"tramite","emoji":"➕","rating":4.7,"nombre":"Cruz Roja – Fusagasugá","desc":"Atención prehospitalaria, primeros auxilios y capacitaciones. Línea 132.","horario":"Lun-Vie · 8–12 y 2–5","direccion":"Centro, Fusagasugá","tel":"132","whatsapp":"","imagen":"img/comercios/cruz-roja-fusagasuga.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c57","cat":"tramite","emoji":"⚖️","rating":4,"nombre":"Fiscalía General – Fusagasugá","desc":"Denuncias y actuaciones penales. Orientación a víctimas. Línea 122.","horario":"Lun-Vie · 8–5 p.m.","direccion":"Centro, Fusagasugá","tel":"122","whatsapp":"","imagen":"img/comercios/fiscalia-general-fusagasuga.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c58","cat":"tramite","emoji":"👨‍👩‍👧","rating":4.1,"nombre":"Comisaría de Familia","desc":"Violencia intrafamiliar, conciliaciones y medidas de protección con acompañamiento.","horario":"Lun-Vie · 8–12 y 2–6","direccion":"Calle 6 N° 6-24","tel":"6018868181","whatsapp":"","imagen":"img/comercios/comisaria-de-familia.jpg","lat":4.34047,"lng":-74.3656,"ubicacion_aprox":false,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c59","cat":"tramite","emoji":"💜","rating":4.4,"nombre":"Casa de la Mujer","desc":"Orientación, asesoría jurídica y psicológica. Línea Púrpura 155.","horario":"Lun-Vie · 8–12 y 2–6","direccion":"Centro, Fusagasugá","tel":"155","whatsapp":"","imagen":"img/comercios/casa-de-la-mujer.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c60","cat":"tramite","emoji":"🏦","rating":4,"nombre":"Bancolombia – Sucursal Fusagasugá","desc":"Retiros, consignaciones y asesoría financiera. Cajeros automáticos y atención en caja.","horario":"Lun-Vie · 9–4 p.m.","direccion":"Centro, Fusagasugá","tel":"6014040","whatsapp":"","imagen":"img/comercios/bancolombia-sucursal-fusagasuga.jpg","lat":4.34307,"lng":-74.36328,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"},
  {"id":"c61","cat":"campo","emoji":"🌿","rating":4.5,"nombre":"Ofalahiatu Vivero","desc":"Venta de todo tipo de plantas","horario":"Consultar directamente","direccion":"La Palma 3","tel":"3015472950","whatsapp":"3015472950","imagen":"img/comercios/ofalahiatu-vivero.jpg","lat":4.3369,"lng":-74.3638,"ubicacion_aprox":true,"esPremium":false,"prioridadBusqueda":0,"redesSociales":{},"sitioWeb":"","propietario_uid":null,"propietario":"Fusa Conecta","municipio":"Fusagasugá"}
];

// Rutas guiadas estilo Wikiloc (RF-17). Trazado aproximado; elevaciones del modelo digital de terreno (Open-Meteo).
const RUTAS={
 "c21": {
  "nombre": "Sendero al Cerro Fusacatán",
  "dificultad": "Media",
  "duracionEstimada": "2h 30min",
  "rutaWaypoints": [
   [
    4.34,
    -74.356
   ],
   [
    4.3385,
    -74.352
   ],
   [
    4.3372,
    -74.348
   ],
   [
    4.336,
    -74.3445
   ],
   [
    4.3348,
    -74.3415
   ],
   [
    4.3337,
    -74.3395
   ],
   [
    4.33237,
    -74.33815
   ]
  ],
  "puntoLlegada": [
   4.33237,
   -74.33815
  ],
  "distanciaTotal": 2.17,
  "perfilElevacion": [
   1784,
   1793,
   1820,
   1845,
   1859,
   1869,
   1904,
   1936,
   1955,
   1971,
   1981,
   2001,
   2013,
   2056,
   2084,
   2105,
   2124,
   2124,
   2149,
   2174,
   2174,
   2192,
   2202,
   2202,
   2267
  ],
  "elevacionMaxima": 2267,
  "elevacionMinima": 1784,
  "puntosInteres": [
   {
    "wp": 0,
    "nombre": "Inicio del sendero",
    "descripcion": "Punto de partida en el borde oriental del casco urbano."
   },
   {
    "wp": 3,
    "nombre": "Mirador intermedio",
    "descripcion": "Vista panorámica del valle de Fusagasugá."
   },
   {
    "wp": 6,
    "nombre": "Cumbre del Fusacatán",
    "descripcion": "Cerro tutelar del municipio."
   }
  ],
  "esCacheable": true
 },
 "c23": {
  "nombre": "Ruta a La Aguadita",
  "dificultad": "Alta",
  "duracionEstimada": "3h 30min",
  "rutaWaypoints": [
   [
    4.35,
    -74.356
   ],
   [
    4.358,
    -74.35
   ],
   [
    4.366,
    -74.343
   ],
   [
    4.374,
    -74.337
   ],
   [
    4.381,
    -74.331
   ],
   [
    4.38834,
    -74.32489
   ]
  ],
  "puntoLlegada": [
   4.38834,
   -74.32489
  ],
  "distanciaTotal": 5.49,
  "perfilElevacion": [
   1799,
   1819,
   1832,
   1839,
   1861,
   1921,
   1923,
   1890,
   1862,
   1875,
   1923,
   1904,
   1951,
   1968,
   1963,
   2014,
   1986,
   1962,
   1922,
   1904,
   1883
  ],
  "elevacionMaxima": 2014,
  "elevacionMinima": 1799,
  "puntosInteres": [
   {
    "wp": 0,
    "nombre": "Salida desde Fusagasugá",
    "descripcion": "Inicio del ascenso hacia el corregimiento."
   },
   {
    "wp": 3,
    "nombre": "Bosque altoandino",
    "descripcion": "Tramo de niebla y vegetación nativa."
   },
   {
    "wp": 5,
    "nombre": "Corregimiento La Aguadita",
    "descripcion": "Clima frío, miel y senderos de montaña."
   }
  ],
  "esCacheable": true
 }
};

// Teléfonos de emergencia (RF-16, RNF-02): siempre disponibles sin conexión.
const EMERGENCIAS={
  fusagasuga:[
    {entidad:'Línea única de emergencias',tipo:'Seguridad',numero:'123',emoji:'🚓',detalle:'Policía, tránsito y atención de emergencias 24 h'},
    {entidad:'Fiscalía (denuncias)',tipo:'Seguridad',numero:'122',emoji:'⚖️',detalle:'Denuncias y orientación a víctimas'},
    {entidad:'Hospital San Rafael',tipo:'Salud',numero:'6018672051',emoji:'🏥',detalle:'Urgencias médicas · Fusagasugá'},
    {entidad:'Cruz Roja',tipo:'Salud',numero:'132',emoji:'➕',detalle:'Atención prehospitalaria'},
    {entidad:'Ambulancias',tipo:'Salud',numero:'125',emoji:'🚑',detalle:'Servicio de ambulancias'},
    {entidad:'Bomberos Voluntarios Fusagasugá',tipo:'Rescate',numero:'3115853577',emoji:'🚒',detalle:'Incendios y rescates 24 h'},
    {entidad:'Bomberos (línea nacional)',tipo:'Rescate',numero:'119',emoji:'🔥',detalle:'Incendios y rescates'},
    {entidad:'Defensa Civil',tipo:'Rescate',numero:'144',emoji:'🦺',detalle:'Desastres y búsqueda'},
    {entidad:'Alcaldía de Fusagasugá',tipo:'Atención ciudadana',numero:'6018868181',emoji:'🏛️',detalle:'Gestión del riesgo y atención al ciudadano'},
    {entidad:'Línea Púrpura / Mujer',tipo:'Atención ciudadana',numero:'155',emoji:'💜',detalle:'Orientación a mujeres víctimas de violencia'},
    {entidad:'ICBF',tipo:'Atención ciudadana',numero:'141',emoji:'👨‍👩‍👧',detalle:'Protección de niñas, niños y adolescentes'}
  ],
  pasca:[
    {entidad:'Línea única de emergencias',tipo:'Seguridad',numero:'123',emoji:'🚓',detalle:'Policía y emergencias 24 h · opera en Pasca'},
    {entidad:'Cruz Roja',tipo:'Salud',numero:'132',emoji:'➕',detalle:'Atención prehospitalaria'},
    {entidad:'Ambulancias',tipo:'Salud',numero:'125',emoji:'🚑',detalle:'Servicio de ambulancias'},
    {entidad:'Bomberos (línea nacional)',tipo:'Rescate',numero:'119',emoji:'🚒',detalle:'Incendios y rescates'},
    {entidad:'Defensa Civil',tipo:'Rescate',numero:'144',emoji:'🦺',detalle:'Desastres y búsqueda en zona rural'},
    {entidad:'Línea Púrpura / Mujer',tipo:'Atención ciudadana',numero:'155',emoji:'💜',detalle:'Orientación a mujeres víctimas de violencia'},
    {entidad:'ICBF',tipo:'Atención ciudadana',numero:'141',emoji:'👨‍👩‍👧',detalle:'Protección de niñas, niños y adolescentes'}
  ]
};

// Cupones de ejemplo de los comercios Premium de demostración (RF-11).
const CUPONES_BASE=[
  {id:'demo-c01',comercio_id:'c01',descripcion:'10% en café de origen (bolsa de 500 g)',porcentajeDescuento:10,vigencia:'2026-12-31',terminos:'Un cupón por persona al día.'},
  {id:'demo-c12',comercio_id:'c12',descripcion:'15% en pizzas medianas de martes a jueves',porcentajeDescuento:15,vigencia:'2026-12-31',terminos:'No acumulable con otras promociones.'},
  {id:'demo-c30',comercio_id:'c30',descripcion:'15% en la catación guiada de café',porcentajeDescuento:15,vigencia:'2026-12-31',terminos:'Sujeto a disponibilidad de cupos.'},
  {id:'demo-c32',comercio_id:'c32',descripcion:'10% en tu segunda noche de alojamiento',porcentajeDescuento:10,vigencia:'2026-12-31',terminos:'Aplica para reservas directas.'},
  {id:'demo-c41',comercio_id:'c41',descripcion:'10% en coctelería de autor de jueves a sábado',porcentajeDescuento:10,vigencia:'2026-12-31',terminos:'Solo mayores de 18 años.'}
];
