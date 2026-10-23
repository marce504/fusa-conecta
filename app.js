/* =====================================================================
 * FUSA CONECTA — lógica de la aplicación
 * Arquitectura en capas + MVVM ligero (Documento Técnico, cap. 5 y 6):
 *  - Singleton: una sola conexión a Firebase (app, auth, firestore).
 *  - Repository: los datos se leen de la copia local (datos.js + caché
 *    offline de Firestore) y se actualizan en vivo desde la nube.
 *  - Factory: creación del perfil de usuario según su rol.
 * La presentación usa el sistema de diseño de app.css (variables de :root)
 * y los íconos locales de icons.js: aquí no hay colores ni emojis.
 * ===================================================================== */
'use strict';

/* ===== FIREBASE (Singleton) ===== */
const firebaseConfig = {
  apiKey: "AIzaSyDUz1Mcf0m4A4L5ohsaQ8WWMeOeItrxhZk",
  // En el sitio publicado el ingreso con Google vuelve al mismo dominio de la app (Firebase Hosting sirve /__/auth;
  // en Netlify, _redirects lo reenvía); así Chrome y Safari no bloquean el regreso de la sesión.
  authDomain: ['fusa-conecta.web.app','fusa-conecta.netlify.app'].includes(location.hostname)?location.hostname:'fusa-conecta.firebaseapp.com',
  projectId: "fusa-conecta",
  storageBucket: "fusa-conecta.firebasestorage.app",
  messagingSenderId: "1045068656562",
  appId: "1:1045068656562:web:0316f5c7b41851b7c37eab"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
// Pruebas locales contra los emuladores de Firebase: http://localhost:<puerto>/?emulador
const EMULADOR=location.hostname==='localhost'&&new URLSearchParams(location.search).has('emulador');
if(EMULADOR){auth.useEmulator('http://127.0.0.1:9099');db.useEmulator('127.0.0.1',8099);}
// Caché local persistente: la app sigue funcionando sin conexión (RNF-02, RNF-08)
else db.enablePersistence({synchronizeTabs:true}).catch(()=>{});
auth.useDeviceLanguage();
const TS = firebase.firestore.Timestamp;
const FV = firebase.firestore.FieldValue;

/* ===== UTILIDADES ===== */
const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>c.querySelectorAll(s);
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();}
// Lee un color del sistema de diseño (para librerías que no aceptan variables CSS)
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
// Valor del tema claro aunque la app esté en oscuro (póster para imprimir, logo dibujado en canvas)
let refClaro=null;
function cssVarClaro(n){
  if(!refClaro){refClaro=document.createElement('div');refClaro.dataset.tema='claro';refClaro.hidden=true;document.body.appendChild(refClaro);}
  return getComputedStyle(refClaro).getPropertyValue(n).trim();
}
/* ===== TEMA: Sistema / Claro / Oscuro (v4 · Fase 6). index.html ya lo puso antes del primer pintado ===== */
function temaElegido(){try{return localStorage.getItem('fc_tema')||'sistema';}catch(e){return 'sistema';}}
const temaOscuro=()=>document.documentElement.dataset.tema==='oscuro';
const consultaOscuro=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
function aplicarTema(pref=temaElegido()){
  const o=pref==='oscuro'||(pref==='sistema'&&!!consultaOscuro&&consultaOscuro.matches);
  if(o===temaOscuro())return;
  document.documentElement.dataset.tema=o?'oscuro':'claro';
  // Barra del sistema y mapas con los colores del tema nuevo
  const sp=document.getElementById('splash');colorBarra(sp&&!sp.classList.contains('oculto')?'--primary-500':'--bg');
  if(typeof render==='function'&&['mapa','ruta'].includes(vistaActual().tipo))render(true);
}
function elegirTema(pref){try{localStorage.setItem('fc_tema',pref);}catch(e){}aplicarTema(pref);medir('tema',{tema:pref});}
if(consultaOscuro)(consultaOscuro.addEventListener?consultaOscuro.addEventListener('change',()=>{if(temaElegido()==='sistema')aplicarTema('sistema');}):consultaOscuro.addListener(()=>{if(temaElegido()==='sistema')aplicarTema('sistema');}));
// Teselas del mapa: siempre OpenStreetMap; en modo noche se oscurecen con un filtro solo en el panel de teselas (CSS)
function capaBase(){
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
}
function urlTesela(z,x,y){return 'https://tile.openstreetmap.org/'+z+'/'+x+'/'+y+'.png';}
const ls={
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},
  del(k){try{localStorage.removeItem(k);}catch(e){}}
};
// Aviso arriba, justo bajo la fila del logo (no tapa títulos ni tarjetas)
function toast(msg,ms=2500){const t=$('#toast'),ref=vistaActual().tipo==='lista'?$('#sesion'):$('#topbar');t.style.top=Math.max(8,(ref?ref.getBoundingClientRect().bottom:0)+6)+'px';t.textContent=msg;t.classList.add('ver');if(t._t)clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('ver'),ms);}
function abrir(id){$('#'+id).classList.add('abierto');}
// Acciones al cerrar una capa (apagar la cámara, liberar el bloqueo de pantalla)
const alCerrar={};
function cerrar(id){const o=$('#'+id);if(!o||!o.classList.contains('abierto'))return;o.classList.remove('abierto');if(alCerrar[id])alCerrar[id]();}
function aMs(v){
  if(!v)return null;if(typeof v==='number')return v;if(v.toMillis)return v.toMillis();
  // Fechas "AAAA-MM-DD" valen hasta el final de ese día en hora local
  if(/^\d{4}-\d{2}-\d{2}$/.test(v))return new Date(v+'T23:59:59').getTime();
  const t=Date.parse(v);return isNaN(t)?null:t;
}
function fechaCorta(ms){return ms?new Date(ms).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'}):'—';}
function imgSegura(src){return /^(img\/|data:image\/|https:\/\/)/.test(src||'')?src:'';}
function telLimpio(t){return String(t||'').replace(/\D/g,'');}
function esCelular(t){return /^3\d{9}$/.test(telLimpio(t));}
function distanciaKm(a,b){const r=x=>x*Math.PI/180;const dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(h));}
function fmtDist(km){return km<1?Math.round(km*1000)+' m':km.toFixed(1).replace('.',',')+' km';}
function cargarScript(src){return new Promise((ok,mal)=>{if(document.querySelector('script[src="'+src+'"]'))return ok();const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=mal;document.head.appendChild(s);});}
function cargarCSS(href){if(document.querySelector('link[href="'+href+'"]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);}
async function cargarLeaflet(){
  cargarCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
  cargarCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css');
  await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
  await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js');
}
// Diálogo de confirmación con ícono Lucide; "peligro" pinta la acción en rojo
function confirmar(titulo,texto,si='Sí',no='No',icono='circle-help',peligro=false){
  return new Promise(res=>{
    const ic=$('#cfIc');ic.innerHTML=icon(icono,28);ic.classList.toggle('peligro',peligro);
    $('#cfTit').textContent=titulo;$('#cfTxt').textContent=texto;
    $('#cfSi').textContent=si;$('#cfNo').textContent=no;
    $('#cfSi').className='btn '+(peligro?'btn-peligro':'btn-primario');
    const fin=v=>{cerrar('ovConfirm');$('#cfSi').onclick=$('#cfNo').onclick=null;res(v);};
    $('#cfSi').onclick=()=>fin(true);$('#cfNo').onclick=()=>fin(false);
    abrir('ovConfirm');
  });
}

/* ===== ESTADO (ViewModel) ===== */
const estado={
  usuario:null,       // {uid, nombre, email, anonimo, verificado}
  perfil:null,        // documento usuarios/{uid}
  favoritos:[], q:'', mayorEdad:false,
  califs:{},          // comercio_id -> [calificaciones]
  cuponesFS:[],       // cupones publicados por comerciantes
  pos:null,           // [lat,lng] del usuario si dio permiso
  online:navigator.onLine,
  sosMunicipio:'fusagasuga',
  filtros:{abierto:false,cupon:false,municipio:'',orden:'recomendados'}  // hoja de Filtros del listado
};
function logueado(){return !!(estado.usuario&&!estado.usuario.anonimo);}
// Ser comerciante ya no se elige al registrarse: se deriva de tener al menos un negocio aprobado (o ser admin)
function esComerciante(){return logueado()&&(esAdmin()||comerciosPropios.some(c=>c.estado_publicacion==='aprobado'));}

/* ===== REPOSITORIO DE COMERCIOS ===== */
const nombresBase=new Set(COMERCIOS_BASE.map(c=>norm(c.nombre).trim()));
const idsBase=new Set(COMERCIOS_BASE.map(c=>c.id));
let comerciosNube=[];
let database=COMERCIOS_BASE.map(c=>({...c}));
function normalizarNube(id,x){
  const cat=CAT[x.cat]?x.cat:(CAT[x.categoria]?x.categoria:'comercio');
  const tel=telLimpio(x.tel);
  return {id,cat,emoji:x.emoji||CAT[cat].emoji,rating:+x.rating||0,nombre:x.nombre||'Sin nombre',desc:x.desc||'',
    horario:x.horario||'',dias:x.dias||null,abre:x.abre||'',cierra:x.cierra||'',direccion:x.direccion||'Fusagasugá',
    tel,whatsapp:x.whatsapp||(esCelular(tel)?tel:''),imagen:x.imagen||'',lat:x.lat,lng:x.lng,ubicacion_aprox:x.ubicacion_aprox!==false,
    esPremium:!!x.esPremium,suscripcion_vigente_hasta:aMs(x.suscripcion_vigente_hasta),prioridadBusqueda:+x.prioridadBusqueda||0,
    redesSociales:x.redesSociales||{},sitioWeb:x.sitioWeb||'',propietario_uid:x.propietario_uid||null,municipio:x.municipio||'Fusagasugá',
    tipo:x.tipo||'',sub:x.sub||'',nivelDificultad:x.nivelDificultad||'',
    estado_publicacion:x.estado_publicacion||'pendiente',motivo_rechazo:x.motivo_rechazo||'',prueba_usada:!!x.prueba_usada,
    fotos:Array.isArray(x.fotos)?x.fotos:[],creado:aMs(x.fecha_aprobacion)||aMs(x.fechaCreacion)||null};
}
estado.ocultos=new Set(ls.get('fc_ocultos',[]));
function reconstruirDirectorio(){
  // Un negocio reclamado o corregido por el admin se guarda en la nube con el mismo id y reemplaza su copia local
  const porId=new Map(COMERCIOS_BASE.filter(c=>!estado.ocultos.has(c.id)).map(c=>[c.id,{...c}]));
  comerciosNube.forEach(c=>porId.set(c.id,c));
  database=[...porId.values()];
}
// La regla pública solo deja leer comercios aprobados; una consulta sin este filtro sería rechazada completa.
db.collection('comercios').where('estado_publicacion','==','aprobado').onSnapshot(snap=>{
  const lista=[];
  snap.forEach(doc=>{
    const x=doc.data();
    // Los registros antiguos de la carga inicial ya están en la copia local (datos.js)
    if(!x.propietario_uid&&nombresBase.has(norm(x.nombre).trim())&&!idsBase.has(doc.id))return;
    lista.push(normalizarNube(doc.id,x));
  });
  comerciosNube=lista;estado.nubeLista=true;reconstruirDirectorio();refrescarVista();
},err=>console.warn('Comercios sin conexión:',err.code));
// Negocios de muestra que el admin ocultó (los de la nube se ocultan con estado "oculto" y ya no llegan al directorio)
db.collection('config').doc('directorio').onSnapshot(s=>{
  const l=(s.exists&&s.data().ocultos)||[];estado.ocultos=new Set(l);ls.set('fc_ocultos',l);reconstruirDirectorio();refrescarVista();
},()=>{});
// Banners del inicio que publica el admin (negocio destacado y banners con foto)
estado.banners=[];
db.collection('banners').onSnapshot(s=>{
  estado.banners=s.docs.map(d=>({id:d.id,...d.data()}));
  if(!$('#plegBanner').hidden)montarBanner();
  if(vistaActual().tipo==='admin'&&estado.admin.tab==='banners')render(true);
},()=>{});
/* ===== QUÉ HACER EN FUSA: EVENTOS Y AGENDA (v5 · Fase 4) =====
   Colección eventos. Lectura pública solo de los publicados; cualquier cuenta real puede sugerir (queda pendiente)
   y el admin publica, edita o descarta. Los eventos que ya terminaron se ocultan solos. */
const CATS_EVENTO=[['cultura','Cultura','drama'],['musica','Música','music'],['deporte','Deporte','trophy'],['gastronomia','Gastronomía','utensils'],
  ['feria','Feria','ferris-wheel'],['religioso','Religioso','church'],['institucional','Institucional','landmark'],['otro','Otro','sparkles']];
const catEvento=k=>CATS_EVENTO.find(c=>c[0]===k)||CATS_EVENTO[7];
const DIAS3=['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'],DIAS_EV=['dom','lun','mar','mié','jue','vie','sáb'],MESES3=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
estado.eventos=[];estado.agenda={rango:'30',cat:'',vista:'lista'};
let eventoPorAbrir=null;
db.collection('eventos').where('estado','==','publicado').onSnapshot(s=>{
  estado.eventos=s.docs.map(d=>{const x=d.data();return {id:d.id,...x,ini:aMs(x.fecha_inicio),fin:aMs(x.fecha_fin)};});
  if(eventoPorAbrir&&estado.eventos.some(e=>e.id===eventoPorAbrir)){const id=eventoPorAbrir;eventoPorAbrir=null;abrirEvento(id);}
  if(!$('#plegBanner').hidden)montarBanner();
  refrescarVista();
},()=>{});
// Próximos o en curso (los que ya terminaron no se muestran), del más cercano al más lejano
function eventosVigentes(){const ahora=Date.now();return estado.eventos.filter(e=>e.ini&&e.fin&&e.fin>=ahora).sort((a,b)=>a.ini-b.ini);}
function finDelDomingo(){const d=new Date();d.setHours(23,59,59,999);d.setDate(d.getDate()+((7-d.getDay())%7));return d.getTime();}
function inicioDelViernes(){const d=new Date();if([0,5,6].includes(d.getDay()))return Date.now();d.setHours(0,0,0,0);d.setDate(d.getDate()+(5-d.getDay()));return d.getTime();}
function eventosEn(rango,cat){
  const ahora=Date.now(),hoyFin=new Date().setHours(23,59,59,999);
  const [desde,hasta]=rango==='hoy'?[ahora,hoyFin]:rango==='finde'?[inicioDelViernes(),finDelDomingo()]:[ahora,ahora+30*864e5];
  return eventosVigentes().filter(e=>e.ini<=hasta&&e.fin>=desde&&(!cat||e.categoria===cat));
}
function horaEv(ms){const d=new Date(ms);return horaTexto(d.getHours()*60+d.getMinutes());}
function fechaEvento(e){
  const a=new Date(e.ini),b=new Date(e.fin),mismoDia=a.toDateString()===b.toDateString();
  const dia=d=>DIAS_EV[d.getDay()]+' '+d.getDate()+' de '+MESES3[d.getMonth()];
  return dia(a)+' · '+horaEv(e.ini)+(mismoDia?' – '+horaEv(e.fin):' al '+dia(b));
}
const calBloque=ms=>{const d=new Date(ms);return '<span class="cal-bloque" aria-hidden="true"><small>'+DIAS3[d.getDay()]+'</small><b>'+d.getDate()+'</b></span>';};
const precioEv=e=>e.gratis?'Gratis':(e.precio||'Con costo');
// Tarjeta de evento para el carrusel del inicio (mismo tamaño que la tarjeta compacta)
function tarjetaEventoHTML(e){
  const c=catEvento(e.categoria);
  return '<article class="tarjeta tarjeta-ev"><div class="tc-foto"><span class="fallback-ic c-ev">'+icon(c[2],28)+'</span>'
    +(e.imagen?'<img src="'+esc(e.imagen)+'" alt="" loading="lazy" decoding="async" onerror="this.remove()">':'')+calBloque(e.ini)+'</div>'
    +(e.demo?'<span class="ev-demo">Ejemplo</span>':'')
    +'<h3 class="tc-nombre"><button class="tc-link" data-evento="'+esc(e.id)+'">'+esc(e.titulo)+'</button></h3>'
    +'<p class="tc-linea">'+icon('map-pin',12)+esc(e.lugar_nombre)+'</p><p class="tc-linea">'+horaEv(e.ini)+' · '+esc(precioEv(e))+'</p></article>';
}
// Quien puede publicar directo o como organizador ve "Publicar un evento"; los demás, "Sugerir un evento"
const puedePublicarEventos=()=>esAdmin()||esComerciante()||esOrganizador();
const textoSugerir=()=>logueado()&&puedePublicarEventos()?'Publicar un evento':'Sugerir un evento';
function sugerirEvento(){if(!logueado()){pedirLogin('Inicia sesión para sugerir un evento.');return;}formEvento(null);}
// Ilustración de línea (calendario con destellos) para el estado vacío
const ILU_EVENTOS='<svg class="ev-vacio-ilu" viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  +'<rect x="16" y="22" width="56" height="54" rx="10"/><path d="M16 38h56M30 14v14M58 14v14"/><path d="M30 52h6M44 52h6M30 64h6M44 64h6"/>'
  +'<path d="M80 50v12M74 56h12M76 24l4 4M84 20v6"/></svg>';
function seccionEventosHTML(){
  const l=eventosVigentes().slice(0,10);
  return '<section class="seccion-inicio" aria-labelledby="tEventos"><div class="head-v"><h2 id="tEventos">Qué hacer en Fusa</h2><button class="btn-ghost" data-agenda>Ver agenda</button></div>'
    +(l.length?'<div class="carrusel carrusel-tc">'+l.map(tarjetaEventoHTML).join('')+'</div>'
      :'<div class="ev-vacio">'+ILU_EVENTOS+'<div class="ev-vacio-tx"><p>Aún no hay eventos esta semana. ¿Sabes de uno?</p>'
        +'<button class="btn btn-primario btn-sm" data-sugerir>'+icon('calendar-plus',16)+textoSugerir()+'</button></div></div>')
    +'</section>';
}
// Primera diapositiva del banner si hay eventos entre hoy y el domingo
function slideFinDeSemana(){
  const e=eventosVigentes().find(x=>x.ini<=finDelDomingo());if(!e)return null;
  return {id:'evento-'+e.id,foto:e.imagen||'',velo:'violeta',tag:'Este fin de semana en Fusa',tit:e.titulo,
    sub:fechaEvento(e)+' · '+e.lugar_nombre,accion:'agenda',textoBoton:'Ver agenda',ilu:'<span class="ilu-circulo">'+icon('calendar-days',30)+'</span>'};
}
function enlazarEventos(){
  $$('#cuerpo [data-evento]').forEach(b=>b.onclick=()=>abrirEvento(b.dataset.evento));
  $$('#cuerpo [data-agenda]').forEach(b=>b.onclick=()=>irAgenda());
  $$('#cuerpo [data-sugerir]').forEach(b=>b.onclick=sugerirEvento);
}
function irAgenda(rango){if(rango)estado.agenda.rango=rango;navegar({tipo:'agenda'});}

/* ---------- Pantalla Agenda: Hoy · Este fin de semana · Próximos 30 días · categoría; lista o mapa ---------- */
function filaEventoHTML(e){
  const c=catEvento(e.categoria);
  return '<article class="ev-fila">'+calBloque(e.ini)
    +'<div class="ev-tx"><h3><button class="ev-link" data-evento="'+esc(e.id)+'">'+esc(e.titulo)+'</button></h3>'
    +'<p>'+icon('clock',14)+esc(fechaEvento(e))+'</p><p>'+icon('map-pin',14)+esc(e.lugar_nombre)+'</p>'
    +'<p class="ev-chips">'+(e.demo?'<span class="ev-chip ev-chip-demo">Ejemplo</span>':'')+'<span class="ev-chip">'+icon(c[2],12)+c[1]+'</span><span class="ev-chip'+(e.gratis?' gratis':'')+'">'+esc(precioEv(e))+'</span></p></div>'
    +(e.imagen?'<img class="ev-img" src="'+esc(e.imagen)+'" alt="" loading="lazy">':'')+'</article>';
}
function renderAgenda(){
  const A=estado.agenda,l=eventosEn(A.rango,A.cat);
  const quien=textoSugerir();
  $('#cuerpo').innerHTML='<div class="vista"><div class="head-v"><h2>Qué hacer en Fusa</h2><span class="conteo">'+l.length+(l.length===1?' evento':' eventos')+'</span></div>'
    +'<div class="lb-orden ag-rango" role="radiogroup" aria-label="Cuándo">'+[['hoy','Hoy'],['finde','Este fin de semana'],['30','Próximos 30 días']]
      .map(([k,t])=>'<button type="button" role="radio" aria-checked="'+(A.rango===k)+'" class="chip-filtro'+(A.rango===k?' on':'')+'" data-rango="'+k+'">'+t+'</button>').join('')+'</div>'
    +'<div class="lista-barra"><div class="lb-orden" role="group" aria-label="Categoría">'+CATS_EVENTO.map(([k,t,ic])=>'<button type="button" aria-pressed="'+(A.cat===k)+'" class="chip-filtro'+(A.cat===k?' on':'')+'" data-evcat="'+k+'">'+icon(ic,14)+t+'</button>').join('')+'</div>'
    +'<div class="lb-vista" role="radiogroup" aria-label="Vista"><button type="button" role="radio" aria-checked="'+(A.vista!=='mapa')+'" class="'+(A.vista!=='mapa'?'on':'')+'" data-agvista="lista" aria-label="Lista">'+icon('calendar-days',20)+'</button>'
    +'<button type="button" role="radio" aria-checked="'+(A.vista==='mapa')+'" class="'+(A.vista==='mapa'?'on':'')+'" data-agvista="mapa" aria-label="Mapa">'+icon('map',20)+'</button></div></div>'
    +(l.length?(A.vista==='mapa'?'<div id="mapaAgenda" class="mapa-lista" role="region" aria-label="Mapa de los eventos"></div>':'<div class="ev-lista">'+l.map(filaEventoHTML).join('')+'</div>')
      :'<div class="vacio">'+icon('calendar-days',48)+'<b>No hay eventos '+(A.rango==='hoy'?'hoy':A.rango==='finde'?'este fin de semana':'en los próximos 30 días')+(A.cat?' de '+catEvento(A.cat)[1].toLowerCase():'')+'</b><p>¿Sabes de alguno? Cuéntanos y lo publicamos después de revisarlo.</p></div>')
    +'<button class="btn btn-secundario btn-bloque mt-16" id="agSugerir">'+icon('calendar-plus',18)+quien+'</button>'
    +'</div>'+footerHTML();
  $$('#cuerpo [data-rango]').forEach(b=>b.onclick=()=>{A.rango=b.dataset.rango;render(true);});
  $$('#cuerpo [data-evcat]').forEach(b=>b.onclick=()=>{A.cat=A.cat===b.dataset.evcat?'':b.dataset.evcat;render(true);});
  $$('#cuerpo [data-agvista]').forEach(b=>b.onclick=()=>{A.vista=b.dataset.agvista;render(true);});
  $$('#cuerpo .ev-link').forEach(b=>b.onclick=()=>abrirEvento(b.dataset.evento));
  $('#agSugerir').onclick=sugerirEvento;
  // Botón flotante "+" (dentro de la app, encima de la barra inferior; se quita al salir de la Agenda)
  const fab=document.createElement('button');fab.className='fab-agenda';fab.id='agFab';fab.setAttribute('aria-label',textoSugerir());
  fab.innerHTML=icon('plus',28);fab.onclick=sugerirEvento;$('#shell').appendChild(fab);
  enlazarFooter();
  if(A.vista==='mapa'&&l.length)mapaAgenda(l);
}
async function mapaAgenda(l){
  try{await cargarLeaflet();}catch(e){return;}
  const caja=$('#mapaAgenda');if(!caja||mapaActivo)return;
  const m=L.map(caja).setView(PLAZA_FUSA,13);mapaActivo=m;capaBase().addTo(m);
  const pts=[];l.filter(e=>e.lat&&e.lng).forEach(e=>{pts.push([e.lat,e.lng]);
    L.marker([e.lat,e.lng],{icon:pinIcono(catEvento(e.categoria)[2]),title:e.titulo,alt:e.titulo}).addTo(m)
      .bindPopup('<b>'+esc(e.titulo)+'</b><br><small>'+esc(fechaEvento(e))+'</small><br><button class="pop-ver" data-evento="'+esc(e.id)+'">Ver evento</button>');});
  if(pts.length>1)m.fitBounds(pts,{padding:[24,24],maxZoom:16});else if(pts.length)m.setView(pts[0],16);
  m.on('popupopen',ev=>{const b=ev.popup.getElement().querySelector('[data-evento]');if(b)b.onclick=()=>abrirEvento(b.dataset.evento);});
  setTimeout(()=>m.invalidateSize(),200);
}

/* ---------- Ficha del evento ---------- */
function icsEvento(e){
  const f=ms=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const x=s=>String(s||'').replace(/[\\;,]/g,m=>'\\'+m).replace(/\r?\n/g,'\\n');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Fusa Conecta//Agenda//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:'+e.id+'@fusa-conecta.web.app','DTSTAMP:'+f(Date.now()),'DTSTART:'+f(e.ini),'DTEND:'+f(e.fin),'SUMMARY:'+x(e.titulo),
    'LOCATION:'+x(e.lugar_nombre+', '+(e.municipio||'Fusagasugá')),'DESCRIPTION:'+x((e.descripcion||'')+'\n'+SITIO_URL+'/#/evento/'+e.id),
    e.enlace_fuente?'URL:'+e.enlace_fuente:'','END:VEVENT','END:VCALENDAR'].filter(Boolean).join('\r\n');
}
function abrirEvento(id){
  const e=estado.eventos.find(x=>x.id===id);if(!e){eventoPorAbrir=id;return;}
  enviarAnalitica(()=>umami.track(p=>({...p,url:'/evento/'+e.id,title:e.titulo+' · Fusa Conecta'})));
  const c=catEvento(e.categoria),fav='ev:'+e.id,on=estado.favoritos.includes(fav);
  const destino=e.lat&&e.lng?e.lat+','+e.lng:e.lugar_nombre+', '+(e.municipio||'Fusagasugá')+', Cundinamarca';
  abrirHoja('<div class="ev-hero">'+(e.imagen?'<img src="'+esc(e.imagen)+'" alt="">':'<span class="fallback-ic c-ev">'+icon(c[2],40)+'</span>')+calBloque(e.ini)+'</div>'
    +'<div class="hoja-pad">'+(e.demo?'<span class="ev-chip ev-chip-demo">Ejemplo</span> ':'')+'<span class="ev-chip">'+icon(c[2],12)+c[1]+'</span><h2 class="ev-titulo">'+esc(e.titulo)+'</h2>'
    +'<div class="datos">'+filaDato('clock','Fecha y hora',esc(fechaEvento(e)))
    +filaDato('map-pin','Lugar',esc(e.lugar_nombre)+' · '+esc(e.municipio||'Fusagasugá')+'<br><a href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destino)+'" target="_blank" rel="noopener">Cómo llegar</a>')
    +(e.organizador?filaDato('users','Organiza',esc(e.organizador)):'')
    +filaDato('ticket','Entrada',esc(precioEv(e)))
    +(e.enlace_fuente?filaDato('external-link','Fuente oficial','<a href="'+esc(e.enlace_fuente)+'" target="_blank" rel="noopener">Ver la publicación original</a>'):'')+'</div>'
    +(e.descripcion?'<p class="det-desc">'+esc(e.descripcion)+'</p>':'')
    +'<div class="ev-acc"><button class="btn btn-primario btn-bloque" id="evCal">'+icon('calendar-plus',18)+'Agregar a mi calendario</button>'
    +'<div class="ev-acc2"><button class="btn btn-secundario'+(on?' on':'')+'" id="evInteresa" aria-pressed="'+on+'">'+icon('heart',18)+(on?'Te interesa':'Me interesa')+'</button>'
    +'<button class="btn btn-secundario" id="evCompartir">'+icon('share-2',18)+'Compartir</button></div></div></div>');
  $('#sheetGen').setAttribute('aria-label','Evento: '+e.titulo);
  $('#evCal').onclick=()=>{medir('evento_calendario');entregarArchivo(new File([icsEvento(e)],'evento-fusa-conecta.ics',{type:'text/calendar'}),e.titulo);};
  $('#evInteresa').onclick=()=>{if(!toggleFavorito(fav))return;const ya=estado.favoritos.includes(fav),b=$('#evInteresa');
    b.classList.toggle('on',ya);b.setAttribute('aria-pressed',ya);b.innerHTML=icon('heart',18)+(ya?'Te interesa':'Me interesa');};
  $('#evCompartir').onclick=()=>compartir(e.titulo,'/evento/'+e.id);
}
// Favoritos: los eventos que te interesan (vigentes) arriba de los lugares
function eventosFavoritosHTML(){
  const l=eventosVigentes().filter(e=>estado.favoritos.includes('ev:'+e.id));
  return l.length?'<section class="seccion-inicio" aria-labelledby="tEvFav"><div class="head-v"><h2 id="tEvFav">Eventos que te interesan</h2></div><div class="ev-lista">'+l.map(filaEventoHTML).join('')+'</div></section>':'';
}

/* ---------- Publicar (admin, directo), publicar como organizador o sugerir (quedan pendientes) ---------- */
const aLocal=ms=>{if(!ms)return '';const d=new Date(ms),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());};
function formEvento(e,opc={}){
  const admin=esAdmin(),v=k=>esc(e&&e[k]!=null?e[k]:'');
  let foto=e&&e.imagen?{src:e.imagen}:null,lat=e?e.lat:null,lng=e?e.lng:null;
  const lugares=[...database].filter(d=>d.lat&&d.lng).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const directo=admin||organizadorConfiable();let porIA=false;
  abrirHoja('<div class="hoja-pad"><h2>'+(e?'Editar evento':admin?'Nuevo evento':puedePublicarEventos()?'Publicar un evento':'Sugerir un evento')+'</h2>'
    +(directo?'':'<p class="nota-c izq">Lo revisamos antes de publicarlo en la agenda.</p>')
    +(puedeUsarIA()?iaCajaHTML():'')
    +'<label class="foto-banner" id="evfCaja"><input type="file" accept="image/*" id="evfFoto" class="sr-only">'
    +(foto?'<img src="'+esc(foto.src)+'" alt="Foto del evento. Toca para cambiarla">':'<span class="fb-vacio">'+icon('image-plus',28)+'<b>Foto o afiche (opcional)</b></span>')+'</label>'
    +'<div class="campo"><label for="evfTit">Nombre del evento <span class="req">*</span></label><input class="input" id="evfTit" maxlength="80" value="'+v('titulo')+'"></div>'
    +'<div class="campo"><label for="evfCat">Categoría <span class="req">*</span></label><select class="input" id="evfCat">'+CATS_EVENTO.map(([k,t])=>'<option value="'+k+'"'+(e&&e.categoria===k?' selected':'')+'>'+t+'</option>').join('')+'</select></div>'
    +'<div class="fb-fechas"><div class="campo"><label for="evfIni">Empieza <span class="req">*</span></label><input class="input" type="datetime-local" id="evfIni" value="'+aLocal(e&&e.ini)+'"></div>'
    +'<div class="campo"><label for="evfFin">Termina <span class="req">*</span></label><input class="input" type="datetime-local" id="evfFin" value="'+aLocal(e&&e.fin)+'"></div></div>'
    +'<div class="campo"><label for="evfLugar">Lugar <span class="req">*</span></label><input class="input" id="evfLugar" maxlength="80" placeholder="Ej.: Parque principal" value="'+v('lugar_nombre')+'"></div>'
    +'<div class="campo"><label for="evfEn">¿Es en un lugar de la app? (opcional, para el mapa)</label><select class="input" id="evfEn"><option value="">No / no sé</option>'
      +lugares.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.nombre)+'</option>').join('')+'</select>'
      +'<button type="button" class="btn btn-ghost" id="evfAqui">'+icon('locate-fixed',16)+'Usar mi ubicación actual</button><p class="ayuda" id="evfPos">'+(lat?'Ubicación en el mapa guardada':'Sin ubicación en el mapa')+'</p></div>'
    +'<div class="campo"><label for="evfMun">Municipio</label><select class="input" id="evfMun">'+['Fusagasugá','Pasca'].map(m=>'<option'+(e&&e.municipio===m?' selected':'')+'>'+m+'</option>').join('')+'</select></div>'
    +'<div class="campo"><label for="evfOrg">Organiza</label><input class="input" id="evfOrg" maxlength="80" placeholder="Ej.: Casa de la Cultura" value="'+v('organizador')+'"></div>'
    +'<label class="switch-row"><span>Entrada gratis</span><input type="checkbox" id="evfGratis"'+(!e||e.gratis?' checked':'')+'></label>'
    +'<div class="campo" id="evfPrecioCaja"'+(!e||e.gratis?' hidden':'')+'><label for="evfPrecio">Precio</label><input class="input" id="evfPrecio" maxlength="40" placeholder="Ej.: $10.000" value="'+v('precio')+'"></div>'
    +'<div class="campo"><label for="evfFuente">Enlace de la fuente oficial</label><input class="input" type="url" id="evfFuente" placeholder="https://..." value="'+v('enlace_fuente')+'"></div>'
    +'<div class="campo"><label for="evfDesc">Descripción</label><textarea id="evfDesc" maxlength="1000">'+v('descripcion')+'</textarea></div>'
    +'<button class="btn btn-primario btn-bloque mt-16" id="evfGuardar">'+(admin?(e&&e.estado!=='publicado'?'Guardar y publicar':e?'Guardar cambios':'Publicar evento'):directo?'Publicar evento':'Enviar para revisión')+'</button></div>');
  $('#sheetGen').setAttribute('aria-label','Formulario de evento');
  $('#evfGratis').onchange=()=>{$('#evfPrecioCaja').hidden=$('#evfGratis').checked;};
  $('#evfEn').onchange=()=>{const d=buscar($('#evfEn').value);if(!d)return;lat=d.lat;lng=d.lng;if(!$('#evfLugar').value.trim())$('#evfLugar').value=d.nombre;$('#evfPos').textContent='Ubicación de «'+d.nombre+'» guardada';};
  $('#evfAqui').onclick=async()=>{const p=await pedirUbicacion();if(!p){toast('No pudimos ver tu ubicación');return;}[lat,lng]=p;$('#evfPos').textContent='Tu ubicación actual quedó guardada';};
  $('#evfFoto').onchange=async ev=>{const f=ev.target.files[0];if(!f)return;$('#evfCaja').classList.add('cargando');
    try{foto=await comprimirFoto(f,1280,250000,.8);$('#evfCaja').querySelector('img,.fb-vacio').outerHTML='<img src="'+foto.src+'" alt="Foto elegida para el evento">';}catch(err){toast('No pudimos usar esa foto. Prueba con otra.');}
    $('#evfCaja').classList.remove('cargando');};
  // La IA llena el formulario; la persona revisa, corrige y envía
  if($('#iaLlenar'))enlazarIAEvento((d,afiche)=>{
    porIA=true;
    const pon=(id,val)=>{const el=$(id);if(el&&val!=null&&String(val).trim()!=='')el.value=String(val).trim();};
    pon('#evfTit',String(d.titulo||'').slice(0,80));pon('#evfDesc',String(d.descripcion||'').slice(0,1000));
    if(CATS_EVENTO.some(c=>c[0]===d.categoria))$('#evfCat').value=d.categoria;
    pon('#evfIni',aCampoFecha(d.fecha_inicio));pon('#evfFin',aCampoFecha(d.fecha_fin));
    if(!$('#evfFin').value&&$('#evfIni').value){const t=new Date($('#evfIni').value).getTime()+2*36e5;$('#evfFin').value=aLocal(t);}
    pon('#evfLugar',String(d.lugar_nombre||'').slice(0,80));
    if(['Fusagasugá','Pasca'].includes(d.municipio))$('#evfMun').value=d.municipio;
    pon('#evfOrg',String(d.organizador||'').slice(0,80));
    if(/^https:\/\/\S+$/.test(d.enlace_fuente||''))$('#evfFuente').value=d.enlace_fuente;
    $('#evfGratis').checked=d.gratis!==false;$('#evfPrecioCaja').hidden=$('#evfGratis').checked;
    if(d.gratis===false)pon('#evfPrecio',String(d.precio||'').slice(0,40));
    // El afiche también sirve como foto del evento si aún no tiene una
    if(afiche&&!foto){comprimirFoto(afiche.src,1280,250000,.8).then(f=>{foto=f;const caja=$('#evfCaja');if(caja)caja.querySelector('img,.fb-vacio').outerHTML='<img src="'+f.src+'" alt="Afiche del evento">';}).catch(()=>{});}
  });
  $('#evfGuardar').onclick=async()=>{
    const tit=$('#evfTit').value.trim(),ini=$('#evfIni').value?new Date($('#evfIni').value).getTime():0,fin=$('#evfFin').value?new Date($('#evfFin').value).getTime():0;
    const lugar=$('#evfLugar').value.trim(),fuente=$('#evfFuente').value.trim();
    if(tit.length<3){toast('Escribe el nombre del evento');$('#evfTit').focus();return;}
    if(!ini||!fin){toast('Indica cuándo empieza y cuándo termina');return;}
    if(fin<ini){toast('La hora final debe ser después de la inicial');$('#evfFin').focus();return;}
    if(!e&&fin<Date.now()){toast('Ese evento ya terminó');return;}
    if(!lugar){toast('Escribe dónde es');$('#evfLugar').focus();return;}
    if(fuente&&!/^https:\/\/\S+$/.test(fuente)){toast('El enlace debe comenzar con https://');$('#evfFuente').focus();return;}
    const TS=firebase.firestore.Timestamp;
    const datos={titulo:tit,descripcion:$('#evfDesc').value.trim(),categoria:$('#evfCat').value,fecha_inicio:TS.fromMillis(ini),fecha_fin:TS.fromMillis(fin),
      lugar_nombre:lugar,lat:lat||null,lng:lng||null,municipio:$('#evfMun').value,imagen:foto?foto.src:'',organizador:$('#evfOrg').value.trim(),
      enlace_fuente:fuente,gratis:$('#evfGratis').checked,precio:$('#evfGratis').checked?'':$('#evfPrecio').value.trim()};
    $('#evfGuardar').disabled=true;
    try{
      if(admin&&e)await db.collection('eventos').doc(e.id).set({...datos,estado:'publicado',origen:porIA?'ia':(e.origen||'admin'),creado_por:e.creado_por||estado.usuario.uid,fecha_creacion:e.fecha_creacion||FV.serverTimestamp()});
      else await db.collection('eventos').add({...datos,estado:directo?'publicado':'pendiente',
        origen:porIA?'ia':admin?'admin':(esOrganizador()||esComerciante())?'organizador':'usuario',
        creado_por:estado.usuario.uid,fecha_creacion:FV.serverTimestamp()});
      cerrar('ovGen');medir(directo?'evento_publicado':'evento_sugerido');
      toast(directo?'Evento publicado en la agenda':'¡Gracias! Lo revisamos y te avisamos cuando esté publicado.');
      if(vistaActual().tipo==='admin')cargarAdmin();
    }catch(err){console.error(err);toast('No se pudo guardar. Revisa tu conexión.');$('#evfGuardar').disabled=false;}
  };
}

/* ===== IA: LLENAR UN EVENTO DESDE UN AFICHE O UN TEXTO (v6 · Fase 2.1) =====
   Firebase AI Logic (SDK web modular firebase/ai) con la Gemini Developer API: funciona en el plan Spark y la clave
   la guarda Firebase (nunca va en este código). Se carga solo al usarla, en una app de Firebase aparte con la misma
   configuración: la inicialización principal no cambia. Con App Check (reCAPTCHA v3) si hay clave de sitio.
   Límite: 20 usos por persona al día (contador en Firestore, validado por las reglas). Si falla, el formulario sigue a mano. */
const IA={version:'12.19.0',modelo:'gemini-2.5-flash',limiteDia:20,
  recaptcha:''};   // clave de SITIO reCAPTCHA v3 (es pública) cuando se active App Check en la consola
let modeloIA=null;
const esOrganizador=()=>!!(estado.perfil&&estado.perfil.rol==='organizador');
const organizadorConfiable=()=>esOrganizador()&&estado.perfil.confiable===true;
const puedeUsarIA=()=>logueado()&&(esAdmin()||esComerciante()||esOrganizador());
async function obtenerModeloIA(){
  if(modeloIA)return modeloIA;
  const base='https://www.gstatic.com/firebasejs/'+IA.version+'/';
  const {initializeApp,getApps}=await import(base+'firebase-app.js');
  const {getAI,getGenerativeModel,GoogleAIBackend,Schema}=await import(base+'firebase-ai.js');
  const app=getApps().find(a=>a.name==='fusa-ia')||initializeApp(firebase.app().options,'fusa-ia');
  if(IA.recaptcha){
    const {initializeAppCheck,ReCaptchaV3Provider}=await import(base+'firebase-app-check.js');
    try{initializeAppCheck(app,{provider:new ReCaptchaV3Provider(IA.recaptcha),isTokenAutoRefreshEnabled:true});}catch(e){}
  }
  // Salida estructurada: Gemini responde exactamente estos campos
  const esquema=Schema.object({properties:{
      titulo:Schema.string({description:'Nombre del evento, máximo 80 caracteres'}),
      descripcion:Schema.string({description:'Descripción corta, máximo 300 caracteres'}),
      categoria:Schema.enumString({enum:CATS_EVENTO.map(c=>c[0])}),
      fecha_inicio:Schema.string({description:'Inicio en formato AAAA-MM-DDTHH:MM, hora de Colombia'}),
      fecha_fin:Schema.string({description:'Fin en formato AAAA-MM-DDTHH:MM, hora de Colombia'}),
      lugar_nombre:Schema.string(),
      municipio:Schema.enumString({enum:['Fusagasugá','Pasca']}),
      gratis:Schema.boolean(),
      precio:Schema.string(),
      organizador:Schema.string(),
      enlace_fuente:Schema.string({description:'Enlace https de la publicación oficial, si aparece'})},
    optionalProperties:['descripcion','fecha_fin','precio','organizador','enlace_fuente']});
  const ai=getAI(app,{backend:new GoogleAIBackend()});
  modeloIA=getGenerativeModel(ai,{model:IA.modelo,generationConfig:{responseMimeType:'application/json',responseSchema:esquema,temperature:0}});
  return modeloIA;
}
// Cuenta un uso de hoy (día UTC); las reglas impiden pasar de 20 o saltarse el contador
async function contarUsoIA(){
  const ref=db.collection('uso_ia').doc(estado.usuario.uid),dia=Math.floor(Date.now()/864e5);
  return db.runTransaction(async t=>{
    const s=await t.get(ref),x=s.exists?s.data():null,n=x&&x.dia===dia?x.n+1:1;
    if(n>IA.limiteDia)throw Object.assign(new Error('limite'),{code:'limite'});
    t.set(ref,{dia,n,ultima:FV.serverTimestamp()});return IA.limiteDia-n;
  });
}
function iaCajaHTML(){
  return '<div class="ia-caja"><p class="bloque-tit">'+icon('sparkles',18)+'Llenar con IA desde un afiche o texto</p>'
    +'<p class="nota-c izq">Sube la foto del afiche o pega el texto de la publicación. Revisa todo antes de enviar.</p>'
    +'<label class="btn btn-secundario btn-bloque ia-afiche" id="iaAficheBtn">'+icon('image-plus',18)+'<span id="iaAficheTx">Subir afiche</span><input type="file" accept="image/*" id="iaAfiche" class="sr-only"></label>'
    +'<div class="campo"><label for="iaTexto">Texto de la publicación</label><textarea id="iaTexto" maxlength="4000" placeholder="Pega aquí el texto del evento"></textarea></div>'
    +'<button type="button" class="btn btn-tonal btn-bloque" id="iaLlenar">'+icon('sparkles',18)+'Llenar el formulario</button>'
    +'<p class="ayuda" id="iaEstado" role="status" aria-live="polite"></p></div>';
}
// a datetime-local: acepta "AAAA-MM-DDTHH:MM" (con o sin segundos o zona) en hora de Colombia
const aCampoFecha=s=>{const m=String(s||'').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);return m?m[1]+'T'+m[2]:'';};
function enlazarIAEvento(alLlenar){
  let afiche=null;
  const est=t=>{const e=$('#iaEstado');if(e)e.textContent=t;};
  $('#iaAfiche').onchange=async ev=>{const f=ev.target.files[0];if(!f)return;
    try{afiche=await comprimirFoto(f,1280,600000,.85);$('#iaAficheTx').textContent='Afiche listo · cambiar';est('');}catch(e){est('No pudimos leer esa imagen. Prueba con otra.');}};
  $('#iaLlenar').onclick=async()=>{
    const texto=$('#iaTexto').value.trim();
    if(!afiche&&texto.length<15){est('Sube el afiche o pega el texto del evento.');return;}
    if(!estado.online){est('La IA necesita conexión a internet. Puedes llenar el formulario a mano.');return;}
    const b=$('#iaLlenar');b.disabled=true;b.innerHTML=icon('loader-circle',18,'gira')+'Leyendo…';est('');
    try{
      const quedan=await contarUsoIA();
      const modelo=await obtenerModeloIA();
      const hoy=new Date(),p=n=>String(n).padStart(2,'0');
      const pedido='Hoy es '+hoy.getFullYear()+'-'+p(hoy.getMonth()+1)+'-'+p(hoy.getDate())+' en Colombia. Extrae UN evento público de Fusagasugá o Pasca (Cundinamarca) '
        +'del afiche o texto. Reglas: no inventes datos; si falta el año, usa la próxima fecha futura; si falta la hora, usa 09:00; si falta el fin, 2 horas después; '
        +'gratis es true si dice entrada libre o gratis; si hay valor, gratis false y precio con el valor; municipio Fusagasugá salvo que diga Pasca. '
        +'Categorías: '+CATS_EVENTO.map(c=>c[0]+' ('+c[1]+')').join(', ')+'.'+(texto?'\n\nTEXTO:\n'+texto:'');
      const partes=[{text:pedido}];
      if(afiche)partes.push({inlineData:{mimeType:afiche.src.slice(5,afiche.src.indexOf(';')),data:afiche.src.split(',')[1]}});
      const r=await modelo.generateContent(partes);
      const d=JSON.parse(r.response.text());
      alLlenar(d,afiche);
      medir('evento_ia',{con_afiche:!!afiche});
      est('Listo: revisa y corrige lo que haga falta. Te quedan '+quedan+' usos de IA hoy.');
    }catch(e){
      console.warn('IA:',e);
      est(e.code==='limite'?'Llegaste al límite de '+IA.limiteDia+' usos de IA por hoy. Puedes llenar el formulario a mano.'
        :/api-not-enabled|permission|403|app-check/i.test(String(e.code)+e.message)?'La IA todavía no está activada en la app. Puedes llenar el formulario a mano.'
        :'No pudimos leer el evento con IA. Puedes llenar el formulario a mano.');
    }finally{b.disabled=false;b.innerHTML=icon('sparkles',18)+'Llenar el formulario';}
  };
}

/* ===== ORGANIZADORES (v6 · Fase 2.3) =====
   El admin invita por correo (invitaciones/{correo}). Cuando esa persona entra con ese correo verificado, su cuenta pasa a
   "organizador": publica eventos que quedan pendientes, o directos si el admin la marcó como confiable. */
async function aplicarInvitacion(user){
  if(!user||!user.email||!estado.perfil||estado.perfil.rol!=='usuario')return;
  try{
    const correo=user.email.toLowerCase(),inv=await db.collection('invitaciones').doc(correo).get();
    if(!inv.exists)return;
    if(!user.emailVerified){toast('Verifica tu correo para activar tu cuenta de organizador de eventos',4000);return;}
    const confiable=inv.data().confiable===true;
    await db.collection('usuarios').doc(user.uid).update({rol:'organizador',confiable});
    estado.perfil.rol='organizador';estado.perfil.confiable=confiable;
    toast('Tu cuenta quedó como organizador de eventos',4000);render(true);
  }catch(e){console.warn('Invitación:',e.code||e);}
}
function mensajeInvitacion(correo){
  return 'Hola. Te invitamos a publicar los eventos de tu organización en la agenda de Fusa Conecta. '
    +'Entra a '+SITIO_URL+' y crea tu cuenta (o ingresa) con este correo: '+correo+'. Luego ve a Perfil → Agenda de eventos → «+».';
}
async function cargarOrganizadores(){
  const [inv,us]=await Promise.all([db.collection('invitaciones').get(),db.collection('usuarios').where('rol','==','organizador').get()]);
  estado.admin.invitaciones=inv.docs.map(d=>({correo:d.id,...d.data()}));
  estado.admin.organizadores=us.docs.map(d=>({uid:d.id,...d.data()}));
}
function organizadoresAdminHTML(){
  const A=estado.admin,inv=A.invitaciones||[],org=A.organizadores||[];
  return '<p class="dash-section">Organizadores de eventos</p>'
    +'<p class="nota-c izq">Alcaldía, Casa de la Cultura, colegios… Publican eventos que quedan por aprobar; si los marcas como confiables, se publican directo.</p>'
    +'<div class="campo"><label for="orgCorreo">Correo del organizador</label><input class="input" type="email" id="orgCorreo" autocomplete="off" placeholder="cultura@fusagasuga.gov.co"></div>'
    +'<label class="switch-row"><span>Confiable: publica sin revisión</span><input type="checkbox" id="orgConfiable"></label>'
    +'<button class="btn btn-secundario btn-bloque" id="orgInvitar">'+icon('mail',18)+'Invitar organizador</button>'
    +(A.organizadoresCargando?'<p class="nota-c izq">Cargando…</p>':'')
    +inv.map(i=>{const u=org.find(o=>(o.correo||'').toLowerCase()===i.correo);
      return '<div class="adm-fila"><div class="dc-info"><b>'+esc(i.correo)+'</b><span>'+(u?'Activo · '+esc(u.nombre||''):'Pendiente: aún no ha entrado con este correo')+(i.confiable?' · Confiable':'')+'</span></div>'
        +'<div class="dc-actions"><button class="btn btn-secundario btn-sm" data-orgcopiar="'+esc(i.correo)+'">'+icon('copy',16)+'Copiar invitación</button>'
        +'<button class="btn btn-ghost" data-orgquitar="'+esc(i.correo)+'">Quitar</button></div></div>';}).join('');
}
function enlazarOrganizadoresAdmin(){
  const A=estado.admin;
  if(!A.organizadores&&!A.organizadoresCargando){A.organizadoresCargando=true;
    cargarOrganizadores().catch(()=>{}).finally(()=>{A.organizadoresCargando=false;if(vistaActual().tipo==='admin'&&A.tab==='eventos')render(true);});}
  const b=$('#orgInvitar');if(b)b.onclick=async()=>{
    const correo=$('#orgCorreo').value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){toast('Escribe un correo válido');$('#orgCorreo').focus();return;}
    const confiable=$('#orgConfiable').checked;
    await adminAccion(async()=>{await db.collection('invitaciones').doc(correo).set({rol:'organizador',confiable,invitado_por:estado.usuario.uid,fecha:FV.serverTimestamp()});A.organizadores=null;},'Invitación creada');
    try{await navigator.clipboard.writeText(mensajeInvitacion(correo));toast('Invitación creada y mensaje copiado: envíaselo por correo o WhatsApp',4000);}catch(e){}
  };
  $$('[data-orgcopiar]').forEach(x=>x.onclick=async()=>{try{await navigator.clipboard.writeText(mensajeInvitacion(x.dataset.orgcopiar));toast('Mensaje copiado');}catch(e){toast(mensajeInvitacion(x.dataset.orgcopiar),6000);}});
  $$('[data-orgquitar]').forEach(x=>x.onclick=async()=>{
    const correo=x.dataset.orgquitar,u=(A.organizadores||[]).find(o=>(o.correo||'').toLowerCase()===correo);
    if(!await confirmar('Quitar organizador',correo+' deja de poder publicar eventos como organizador.','Quitar','Cancelar','user',true))return;
    await adminAccion(async()=>{const lote=db.batch();lote.delete(db.collection('invitaciones').doc(correo));
      if(u)lote.update(db.collection('usuarios').doc(u.uid),{rol:'usuario',confiable:false});await lote.commit();A.organizadores=null;},'Organizador quitado');
  });
}

/* ---------- Admin · eventos de ejemplo para presentar (demo:true) ---------- */
// El tipo se fija por la extensión (algunos servidores entregan .webp como binario genérico)
async function fotoComoDataURL(url){const b=new Blob([await fetch(url).then(r=>r.arrayBuffer())],{type:/\.webp$/i.test(url)?'image/webp':'image/jpeg'});return new Promise((ok,mal)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=mal;fr.readAsDataURL(b);});}
async function cargarEventosDemo(){
  const TS=firebase.firestore.Timestamp,dia=(d,h,m=0)=>{const x=new Date();x.setDate(x.getDate()+d);x.setHours(h,m,0,0);return x.getTime();};
  const sab=(6-new Date().getDay()+7)%7||7;
  const base={lat:null,lng:null,municipio:'Fusagasugá',enlace_fuente:'',estado:'publicado',origen:'admin',creado_por:estado.usuario.uid,demo:true};
  const l=[
    {titulo:'Festival de Bandas del Sumapaz',descripcion:'Bandas sinfónicas de la región en concierto al aire libre (evento de ejemplo).',categoria:'musica',ini:dia(sab,16),fin:dia(sab,21),
      lugar_nombre:'Parque principal',lat:4.3366,lng:-74.3639,organizador:'Secretaría de Cultura',gratis:true,precio:'',foto:'img/banners/bienvenida.webp'},
    {titulo:'Mercado campesino',descripcion:'Productos frescos del campo directo de los productores (evento de ejemplo).',categoria:'feria',ini:dia(sab+1,7),fin:dia(sab+1,13),
      lugar_nombre:'Plaza de mercado',organizador:'Productores de Fusagasugá',gratis:true,precio:'',foto:'img/banners/negocio.webp'},
    {titulo:'Caminata al Cerro Fusacatán',descripcion:'Salida guiada al amanecer; lleva agua y ropa abrigada (evento de ejemplo).',categoria:'deporte',ini:dia(sab+5,5),fin:dia(sab+5,10),
      lugar_nombre:'Inicio del sendero al Fusacatán',organizador:'Club de caminantes',gratis:false,precio:'$15.000',foto:'img/banners/opinion.webp'}
  ];
  const b=db.batch();
  for(const e of l){
    const imagen=await fotoComoDataURL(e.foto).catch(()=>'');
    b.set(db.collection('eventos').doc(),{...base,titulo:e.titulo,descripcion:e.descripcion,categoria:e.categoria,fecha_inicio:TS.fromMillis(e.ini),fecha_fin:TS.fromMillis(e.fin),
      lugar_nombre:e.lugar_nombre,lat:e.lat||null,lng:e.lng||null,organizador:e.organizador,gratis:e.gratis,precio:e.precio,imagen:/^data:image\/(webp|jpeg);/.test(imagen)?imagen:'',fecha_creacion:FV.serverTimestamp()});
  }
  await b.commit();
}

/* ---------- Admin · pestaña Eventos ---------- */
function eventosAdminHTML(){
  const pend=(estado.adminPend.eventos||[]).slice().sort((a,b)=>(a.ini||0)-(b.ini||0)),pub=eventosVigentes();
  const fila=(e,botones)=>'<div class="adm-card"><div class="adm-head">'+calBloque(e.ini)+'<div class="dc-info"><h3>'+esc(e.titulo)+'</h3><p>'+esc(fechaEvento(e))+' · '+esc(e.lugar_nombre)+'</p></div></div>'
    +'<p class="nota-c izq">'+catEvento(e.categoria)[1]+' · '+esc(precioEv(e))+(e.organizador?' · '+esc(e.organizador):'')+' · Origen: '+esc({admin:'admin',organizador:'organizador',usuario:'sugerido por un usuario',ia:'IA'}[e.origen]||e.origen)+'</p>'
    +(e.descripcion?'<p class="adm-desc">'+esc(e.descripcion.slice(0,220))+'</p>':'')
    +(e.enlace_fuente?'<p class="nota-c izq"><a href="'+esc(e.enlace_fuente)+'" target="_blank" rel="noopener">Ver la fuente</a></p>':'')
    +'<div class="dc-actions">'+botones+'</div></div>';
  const nDemo=estado.eventos.filter(e=>e.demo).length;
  return '<button class="btn btn-primario btn-bloque" id="admEvNuevo">'+icon('calendar-plus',18)+'Nuevo evento</button>'
    +'<div class="dc-actions mt-16"><button class="btn btn-secundario btn-sm" id="admEvDemo">'+icon('sparkles',16)+'Cargar eventos de ejemplo</button>'
    +(nDemo?'<button class="btn btn-ghost" id="admEvDemoBorrar">'+icon('trash-2',16)+'Borrar eventos de ejemplo ('+nDemo+')</button>':'')+'</div>'
    +'<p class="nota-c izq">Los de ejemplo sirven para presentar la app: se publican con la etiqueta «Ejemplo» y se borran con un toque.</p>'
    +organizadoresAdminHTML()
    +'<p class="dash-section">Por aprobar ('+pend.length+')</p>'
    +(pend.length?pend.map(e=>fila(e,'<button class="btn btn-primario btn-sm" data-evpub="'+esc(e.id)+'">'+icon('check',16)+'Publicar</button>'
        +'<button class="btn btn-secundario btn-sm" data-eveditp="'+esc(e.id)+'">'+icon('pencil',16)+'Editar</button>'
        +'<button class="btn btn-ghost" data-evdesc="'+esc(e.id)+'">Descartar</button>')).join('')
      :'<p class="nota-c izq">No hay eventos por aprobar.</p>')
    +'<p class="dash-section">Publicados y próximos ('+pub.length+')</p>'
    +(pub.length?pub.map(e=>fila(e,'<button class="btn btn-secundario btn-sm" data-evedit="'+esc(e.id)+'">'+icon('pencil',16)+'Editar</button>'
        +'<button class="btn btn-ghost" data-evborrar="'+esc(e.id)+'">Eliminar</button>')).join('')
      :'<p class="nota-c izq">Aún no hay eventos publicados.</p>');
}
function enlazarEventosAdmin(){
  const col=db.collection('eventos'),pend=id=>(estado.adminPend.eventos||[]).find(e=>e.id===id),pub=id=>estado.eventos.find(e=>e.id===id);
  const n=$('#admEvNuevo');if(n)n.onclick=()=>formEvento(null);
  enlazarOrganizadoresAdmin();
  const dm=$('#admEvDemo');if(dm)dm.onclick=()=>{dm.disabled=true;adminAccion(cargarEventosDemo,'3 eventos de ejemplo publicados');};
  const db_=$('#admEvDemoBorrar');if(db_)db_.onclick=async()=>{if(!await confirmar('Borrar eventos de ejemplo','Se eliminan de la agenda todos los eventos marcados como ejemplo.','Borrar','Cancelar','trash-2',true))return;
    adminAccion(async()=>{const s=await col.where('demo','==',true).get();const b=db.batch();s.docs.forEach(d=>b.delete(d.ref));await b.commit();},'Eventos de ejemplo borrados');};
  $$('[data-evpub]').forEach(b=>b.onclick=()=>adminAccion(()=>col.doc(b.dataset.evpub).update({estado:'publicado'}),'Evento publicado en la agenda'));
  $$('[data-eveditp]').forEach(b=>b.onclick=()=>formEvento(pend(b.dataset.eveditp)));
  $$('[data-evedit]').forEach(b=>b.onclick=()=>formEvento(pub(b.dataset.evedit)));
  $$('[data-evdesc]').forEach(b=>b.onclick=()=>pedirMotivo('Descartar el evento',m=>adminAccion(()=>col.doc(b.dataset.evdesc).update({estado:'rechazado',motivo:m}),'Evento descartado'),
    ['Ya pasó','Información incompleta','No es en Fusagasugá o Pasca','Duplicado','No es un evento público']));
  $$('[data-evborrar]').forEach(b=>b.onclick=async()=>{const e=pub(b.dataset.evborrar);
    if(!await confirmar('Eliminar evento','«'+e.titulo+'» sale de la agenda. Esta acción no se puede deshacer.','Eliminar','Cancelar','trash-2',true))return;
    adminAccion(()=>col.doc(e.id).delete(),'Evento eliminado');});
}


// Comercios del dueño en cualquier estado (pendiente, rechazado, aprobado): solo con sesión de comerciante
let comerciosPropios=[],propiosUnsub=null;
function escucharMisComercios(){
  if(propiosUnsub||!logueado())return;
  propiosUnsub=db.collection('comercios').where('propietario_uid','==',estado.usuario.uid).onSnapshot(snap=>{
    comerciosPropios=snap.docs.map(doc=>normalizarNube(doc.id,doc.data()));refrescarVista();
    // Si su negocio aún guarda la foto grande dentro del documento, se pasa sola a la galería (una vez por sesión)
    const viejas=snap.docs.map(d=>({id:d.id,...d.data()})).filter(fotoAntigua);
    if(viejas.length&&!migrandoPropias){migrandoPropias=true;
      migrarFotosAntiguas(viejas).then(n=>{if(n)toast(n===1?'Pasamos la foto de tu negocio a su galería':'Pasamos las fotos de tus negocios a sus galerías');});}
  },()=>{propiosUnsub=null;});
}
let migrandoPropias=false;
// Foto antigua: imagen en base64 dentro del documento del negocio y sin galería
const fotoAntigua=c=>/^data:image\//.test(c.imagen||'')&&!(c.fotos||[]).length;
function dejarDeEscucharMisComercios(){if(propiosUnsub){propiosUnsub();propiosUnsub=null;}comerciosPropios=[];}

db.collection('calificaciones').onSnapshot(snap=>{
  const c={};
  snap.forEach(doc=>{const x=doc.data();if(x.estado_moderacion==='oculto')return;(c[x.comercio_id]=c[x.comercio_id]||[]).push({...x,_id:doc.id});});
  Object.values(c).forEach(l=>l.sort((a,b)=>(aMs(b.fecha)||0)-(aMs(a.fecha)||0)));
  estado.califs=c;refrescarVista();
},err=>console.warn('Calificaciones sin conexión:',err.code));

db.collection('cupones').onSnapshot(snap=>{
  estado.cuponesFS=[];snap.forEach(doc=>estado.cuponesFS.push({id:doc.id,...doc.data()}));
  refrescarVista();
},()=>{});

// Números de emergencia editados por el admin; si no hay, se usan los de datos.js. Copia local para modo avión.
estado.emergencias=ls.get('fc_emergencias',{});
db.collection('emergencias').onSnapshot(s=>{
  const e={};s.forEach(d=>{const x=d.data();e[d.id]={lista:x.lista||[],actualizado:aMs(x.actualizado)};});
  estado.emergencias=e;ls.set('fc_emergencias',e);if(vistaActual().tipo==='sos')render(true);
},()=>{});
function listaEmergencias(mun){const e=estado.emergencias[mun];return e&&e.lista&&e.lista.length?e.lista:EMERGENCIAS[mun];}

function premiumVigente(d){if(!d.esPremium)return false;return !d.suscripcion_vigente_hasta||d.suscripcion_vigente_hasta>Date.now();}
// Solo cuentan las calificaciones reales de usuarios: sin reseñas no se muestran estrellas
function calificacionDe(d){
  const l=estado.califs[d.id]||[];
  if(l.length)return {prom:l.reduce((a,c)=>a+c.estrellas,0)/l.length,total:l.length};
  return {prom:0,total:0};
}
function distanciaA(d){return (estado.pos&&d.lat&&d.lng)?distanciaKm(estado.pos,[d.lat,d.lng]):null;}

/* ===== HORARIOS: estado de apertura en tiempo real (RF-08) ===== */
const DIA_IDX={dom:0,lun:1,mar:2,mie:3,jue:4,vie:5,sab:6};
const DIAS_TXT=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_LARGO=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
function parsearDias(t){
  const n=norm(t);
  if(/todos|todo el dia|diari|24 ?h/.test(n)&&!/(lun|mar|mie|jue|vie|sab|dom)\s*-/.test(n))return [0,1,2,3,4,5,6];
  const r=n.match(/(lun|mar|mie|jue|vie|sab|dom)\s*-\s*(lun|mar|mie|jue|vie|sab|dom)/);
  if(r){const a=DIA_IDX[r[1]],b=DIA_IDX[r[2]],out=[];for(let i=a;;i=(i+1)%7){out.push(i);if(i===b)break;}return out;}
  const s=[...n.matchAll(/\b(lun|mar|mie|jue|vie|sab|dom)\b/g)].map(m=>DIA_IDX[m[1]]);
  return s.length?s:[0,1,2,3,4,5,6];
}
function parsearRangos(t){
  const out=[],re=/(\d{1,2})(?::(\d{2}))?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|m\.)?/gi;let m;
  while((m=re.exec(t))){
    let s=+m[1]+(+m[2]||0)/60,e=+m[3]+(+m[4]||0)/60;const suf=(m[5]||'').toLowerCase()[0]||'';
    if(suf==='p'&&e<12)e+=12;else if(suf==='a'&&Math.floor(e)===12)e=24;else if(suf==='m')e=12;else if(!suf&&e<=7)e+=12;
    if(suf==='a'){if(e===24){if(s<8)s+=12;}else if(s>e)s+=12;}
    else if(s<5&&s+12<e)s+=12;
    out.push([Math.round(s*60),Math.round(e*60)]);
  }
  return out;
}
// Licoreras y bares que atienden las 24 horas
function es24h(d){return d.cat==='bares'&&/24\s*h|24 horas/i.test(d.horario||'');}
function horaTexto(min){
  min=((min%1440)+1440)%1440;const h=Math.floor(min/60),m=min%60;
  return (h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' a. m.':' p. m.');
}
// Devuelve {tipo:'ab'|'pronto'|'cerr', abierto, texto} o null si el lugar no tiene horario calculable
function estadoApertura(d){
  if(esNatural(d))return null;
  let dias,rangos;
  if(d.dias&&d.dias.length&&d.abre&&d.cierra){
    const hm=x=>{const[h,mi]=x.split(':');return +h*60+(+mi||0);};
    dias=d.dias;rangos=[[hm(d.abre),hm(d.cierra)]];
  }else{
    const h=d.horario||'';
    if(/24\s*h|24 horas/i.test(h))return {tipo:'ab',abierto:true,texto:'Abierto 24 horas'};
    rangos=parsearRangos(h);if(!rangos.length)return null;dias=parsearDias(h);
  }
  const ahora=new Date(),dia=ahora.getDay(),min=ahora.getHours()*60+ahora.getMinutes(),ayer=(dia+6)%7;
  for(const [s,e] of rangos){
    let resta=null;
    if(e>s){if(dias.includes(dia)&&min>=s&&min<e)resta=e-min;}
    else{if(dias.includes(dia)&&min>=s)resta=1440-min+e;else if(dias.includes(ayer)&&min<e)resta=e-min;}
    if(resta!=null)return resta<=60?{tipo:'pronto',abierto:true,texto:'Cierra pronto'}:{tipo:'ab',abierto:true,texto:'Abierto'};
  }
  // Cerrado: busca la próxima apertura dentro de la semana
  let prox=null;
  for(let o=0;o<=7&&prox==null;o++){
    const di=(dia+o)%7;if(!dias.includes(di))continue;
    const ini=rangos.map(r=>r[0]).filter(s=>o>0||s>min).sort((a,b)=>a-b)[0];
    if(ini!=null)prox={o,di,ini};
  }
  if(!prox)return {tipo:'cerr',abierto:false,texto:'Cerrado'};
  const falta=prox.o*1440+prox.ini-min;
  if(falta<=60)return {tipo:'pronto',abierto:false,texto:'Abre pronto · '+horaTexto(prox.ini)};
  const cuando=prox.o===0?'Abre a las '+horaTexto(prox.ini):prox.o===1?'Abre mañana '+horaTexto(prox.ini):'Abre el '+DIAS_LARGO[prox.di]+' '+horaTexto(prox.ini);
  return {tipo:'cerr',abierto:false,texto:cuando};
}
function estadoHTML(ap,id){return ap?'<span class="estado '+ap.tipo+'"'+(id!=null?' data-estado="'+esc(id)+'"':'')+'><span class="punto" aria-hidden="true"></span><span class="et">'+esc(ap.texto)+'</span></span>':'';}
function horarioTexto(d){
  if(d.dias&&d.dias.length&&d.abre&&d.cierra)return d.dias.slice().sort().map(i=>DIAS_TXT[i]).join(', ')+' · '+formatearHora(d.abre)+' – '+formatearHora(d.cierra);
  return formatearHorario(d.horario)||'Consultar directamente';
}

/* ===== ÍCONOS POR CATEGORÍA, SUBCATEGORÍA Y SERVICIO ===== */
// Los emojis de datos.js se ignoran: el ícono sale de la categoría o subcategoría
const ICONO_CAT={todas:'layout-grid',comercio:'store',campo:'sprout',turismo:'mountain',hospedaje:'bed-double',bares:'wine',tramite:'landmark',favoritos:'heart'};
const ICONO_SUB={comidas:'utensils',ferreterias:'hammer',mascotas:'paw-print',panaderias:'croissant',salud:'stethoscope',servicios:'hand-helping',talleres:'car',tiendas:'shopping-bag',
  sendero:'footprints',mirador:'binoculars',cultural:'church',finca:'tractor'};
const NOMBRE_CAT_CORTO={comercio:'Comercios',campo:'Campo',turismo:'Turismo',hospedaje:'Hospedaje',bares:'Bares y licores',tramite:'Trámites'};
function iconoDe(d){return ICONO_SUB[subDe(d)]||ICONO_CAT[d.cat]||'map-pin';}
function etiquetaDe(d){return nombreSub(d.cat,subDe(d))||NOMBRE_CAT_CORTO[d.cat]||'Lugar';}
const RED_IC={instagram:'instagram',facebook:'facebook',tiktok:'link',youtube:'youtube',x:'twitter'};
const RED_TXT={instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',youtube:'YouTube',x:'X'};
function iconoEmergencia(e){
  const n=norm(e.entidad+' '+e.numero);
  if(/fiscal/.test(n))return 'scale';
  if(/hospital/.test(n))return 'hospital';
  if(/cruz roja/.test(n))return 'cross';
  if(/ambulanc/.test(n))return 'ambulance';
  if(/bomber/.test(n))return 'flame';
  if(/defensa civil/.test(n))return 'life-buoy';
  if(/alcald/.test(n))return 'landmark';
  if(/purpura|mujer/.test(n))return 'heart-handshake';
  if(/icbf/.test(n))return 'baby';
  return 'shield';
}
function califHTML(cal){
  return cal.total?'<span class="calif">'+icon('star',16,'ic-fill')+cal.prom.toFixed(1).replace('.',',')+' ('+cal.total+')</span>':'';
}
function estrellasFijas(n){return Array.from({length:5},(_,i)=>'<span class="'+(i<n?'on':'')+'">'+icon('star',14,'ic-fill')+'</span>').join('');}
const PTO='<span class="pto" aria-hidden="true">·</span>';

/* ===== ANALÍTICA CON UMAMI (sin cookies ni datos personales) =====
   Solo en el sitio publicado y solo si hay un Website ID. Cada pantalla cuenta como una página
   (la app vive en una sola dirección) y se miden acciones clave sin nombres, correos ni ids de usuario. */
const UMAMI={id:'62b419e4-bcfa-465f-b47b-c617aa6392e6',script:'https://cloud.umami.is/script.js',dominios:['fusa-conecta.web.app','fusa-conecta.netlify.app']};
const analitica={cola:[],ultima:''};
(function(){
  if(!UMAMI.id||!UMAMI.dominios.includes(location.hostname))return;
  const s=document.createElement('script');
  s.defer=true;s.src=UMAMI.script;s.dataset.websiteId=UMAMI.id;s.dataset.autoTrack='false';s.dataset.domains=UMAMI.dominios.join(',');
  s.onload=()=>{analitica.cola.splice(0).forEach(f=>f());};
  document.head.appendChild(s);
})();
function enviarAnalitica(f){if(!UMAMI.id)return;try{window.umami?f():analitica.cola.push(f);}catch(e){}}
// Página vista: solo cuando cambia la pantalla (no en cada actualización en vivo)
function medirPagina(url,titulo){
  if(url===analitica.ultima)return;analitica.ultima=url;
  enviarAnalitica(()=>umami.track(p=>({...p,url,title:titulo+' · Fusa Conecta'})));
}
function medir(evento,datos){enviarAnalitica(()=>umami.track(evento,datos));}
function rutaDeVista(v){
  if(v.tipo==='lista'){
    if(v.cat==='favoritos')return ['/favoritos','Mis favoritos'];
    if(!v.cat||v.cat==='todas')return v.sub?['/categoria/todas/'+v.sub,'Inicio']:['/','Inicio'];
    return ['/categoria/'+v.cat+(v.sub?'/'+v.sub:''),(NOMBRE_CAT_CORTO[v.cat]||v.cat)+(v.sub?' · '+nombreSub(v.cat,v.sub):'')];
  }
  const T={mapa:'Mapa',sos:'Emergencias SOS',perfil:'Perfil',dashboard:'Mi negocio',planes:'Planes',agenda:'Agenda',recorridos:'Mis recorridos',recorrido:'Recorrido',admin:'Administración',billetera:'Mis cupones',cupones:'Cupones disponibles',ruta:'Ruta guiada'};
  return [v.tipo==='ruta'?'/ruta/'+v.id:'/'+v.tipo,T[v.tipo]||v.tipo];
}

/* ===== NAVEGACIÓN (pila + botón Atrás del sistema, RF-07) ===== */
const stack=[];
let saliendo=false;
function vistaActual(){return stack[stack.length-1]||{tipo:'lista',cat:'todas'};}
function navegar(v){stack.push(v);try{history.pushState({n:stack.length},'');}catch(e){}render();}
function volver(){if(stack.length>1)history.back();}
function inicio(){stack.length=0;navegar({tipo:'lista',cat:'todas'});}
window.addEventListener('popstate',()=>{
  if(saliendo){history.back();return;}
  const ab=$('.overlay.abierto');
  if(ab){cerrar(ab.id);history.pushState({n:stack.length},'');return;}
  if(stack.length>1){stack.pop();render();return;}
  history.pushState({n:stack.length},'');
  confirmar('Salir de Fusa Conecta','¿Estás seguro que deseas salir de Fusa Conecta?','Sí, salir','No','log-out').then(si=>{
    if(!si)return;saliendo=true;window.close();history.back();
  });
});

/* ===== CABECERA ===== */
/* ===== LOGO DE FUSA CONECTA: un solo componente para todas las pantallas =====
   logo(variante,tema,opc) → HTML listo para insertar.
   variante: 'horizontal' (header, footer) | 'vertical' (splash, póster) | 'iso' (solo las 4 hojas)
   tema: 'claro' (fondos blancos) | 'lila' (fondo --primary-500) | 'oscuro' (fondo --ink)
   Medidas de Poppins (por em): alto de la "F" 0,71 · altura de la "x" 0,55 · ascendente 1,05 · descendente 0,35.
   Con line-height 0,92 la parte superior de la "F" queda a 0,10 em del borde de la línea y la línea base a 0,81 em. */
const LOGO_VB='102.46 0 194.02 275.6';            // caja exacta de las 4 hojas
const LOGO_PROP=194.02/275.6;                      // ancho / alto del isotipo
const LOGO_ANCHO_NOMBRE=6.842;                     // "Fusa Conecta" en una línea, en em (con -0.02em por letra)
const LOGO_HOJAS=[ // superior (la del circuito), izquierda, derecha, inferior
  'M265.05,59.24c.94,1.25,1.78,3.19.85,4.61-1.59,2.45-4.07,6.91-6.46,9.9-2.77,3.46-6.2,6.19-10.31,8.2-.73.35-1.51.59-2.33.7-.95.12-1.43.19-1.44.19-5.09,1.04-8.92,3.8-11.51,8.3-2.46,4.28-2.76,9.65-1.11,14.13.33.91.48,1.58.43,2.01-.22,1.89-1.24,3.39-2.52,4.76-6.43,6.89-12.93,13.83-19.49,20.8-.55.58-1.33.93-2.33,1.04-1.86.21-3.47-1.27-3.73-3.03-.2-1.35-.29-2.97-.28-4.88.2-32.66.33-50.96.4-54.9.02-1.19.48-2.4,1.4-3.61.19-.25.94-.84,2.25-1.77,8.39-5.96,9.66-17.82,2.36-25.2-9.6-9.71-25.68-4.1-27.79,9.27-.49,3.12-.04,6.2,1.35,9.25,1.7,3.73,4.32,6.13,7.75,8.26.12.07.23.17.32.28.81,1.02,1.21,2.22,1.2,3.62-.03,6.14-.05,17.29-.07,33.45,0,.29-.05.82-.16,1.6-.59,4.27-5.2,5.21-8.2,2.54-4.84-4.32-11.42-10.38-19.77-18.2-.67-.62-1.08-1.32-1.22-2.08-.09-.44-.01-1.23.22-2.35,1.14-5.54-.09-10.38-3.69-14.54-3.37-3.89-7.78-5.79-13.23-5.71-2.59.04-5.12,1.73-7.15-.94-2.36-3.1-2.96-6.18-.89-9.63.53-.88,1.77-2.48,3.73-4.8,8.62-10.22,18.21-20.17,28.79-29.83,7.31-6.67,15-12.98,23.06-18.93,2.36-1.74,5.6-2.34,8.26-1.12,2.54,1.16,4,2.47,7.17,4.84,1.53,1.15,2.84,2.16,3.93,3.03,11.89,9.6,23.16,20,33.81,31.21,2.59,2.73,4.89,5.42,7.62,8.52,2.26,2.56,5.2,6.23,8.8,11h0Z',
  'M125.2,74.73c1.21-1.71,3.59-2.23,5.27-.95,1.97,1.51,2.68,2.94,2.07,5.59-1.02,4.42.17,9.16,2.63,12.71.77,1.11,1.93,2.29,3.45,3.53,4.4,3.56,10.3,4.3,15.65,2.55,1.11-.36,1.82-.52,2.11-.46.58.11,1.23.45,1.94,1.03.65.53,2.12,1.86,4.43,4,2.89,2.69,4.44,3.96,6.56,6.14,1.52,1.57,3.72,3.27,5.45,5.01,1.58,1.6,2.4,2.28,3.91,3.66.73.67,1.22,1.15,1.49,1.46,3.23,3.73,5.66,7.18,7.3,10.37,2.33,4.55,3.69,9.38,4.07,14.51.59,7.95.36,13.74.35,27.98,0,2.81-.29,5.54-.87,8.19-.64,2.91-2.75,5.58-6.01,4.61-.78-.23-1.95-1.06-3.52-2.49-2.95-2.69-5.86-5.41-8.75-8.17-3.67-3.51-7.44-7.11-11.32-10.83-1.68-1.61-1.63-2.82-1.35-5.24.31-2.69.09-5.12-.65-7.29-1.63-4.72-4.73-8.11-9.3-10.18-3.44-1.56-7.74-1.81-11.1-.67-.53.18-1.14.36-1.83.54-1.21.32-2.53-.49-3.49-1.3-1.82-1.53-7.47-6.25-16.97-14.17-1.4-1.16-2.97-2.53-4.72-4.09-2.17-1.94-3.92-4.76-3.79-7.69.05-1.02.23-2.14.56-3.35,3.43-12.71,8.92-24.37,16.46-34.99h0Z',
  'M262.57,90.62c.06-.61.27-1.16.62-1.65.72-1.01,3.27-4.48,7.64-10.41,1.25-1.68,2.77-3.02,4.95-2.05.61.27,1.2.85,1.76,1.74,1.17,1.84,1.8,2.82,1.87,2.94,2.88,4.58,5.62,9.96,8.22,16.13,4.15,9.85,6.82,20.05,8.02,30.61.54,4.79.98,9.99.78,15.02-.35,8.64-1.27,16.33-2.77,23.05-4.83,21.66-15.89,41.49-32.11,56.92-6.46,6.15-12.96,11.05-20.04,16.01-3.07,2.15-6.04,4.48-8.92,7-8.15,7.11-14.68,16.11-19.36,25.84-.74,1.53-1.83,3.51-3.73,3.74-1.8.23-2.98-.58-3.53-2.41-.4-1.32-.67-2.88-.84-4.69-.14-1.53-.26-4.38-.37-8.54-.07-2.91-.06-7.38.05-13.43.08-4.79.97-9.68,2.67-14.66,1.78-5.26,4.2-10.17,7.25-14.73,2.06-3.08,3.43-5.02,4.12-5.84,2.47-2.93,4.21-5.2,6.71-7.77,5.75-5.93,10.26-10.56,13.53-13.91,1.32-1.36,2.83-1.84,4.53-1.44,1.05.25,1.58.37,1.59.37,1.83.21,3.16.29,3.98.23,4.63-.3,8.47-2.14,11.52-5.55,3.23-3.62,4.86-8.59,4.1-13.42-.93-5.83-4.71-10.65-10.12-12.88-6.07-2.5-12.99-1.01-17.57,3.58-3.46,3.47-5.11,7.82-4.96,13.06.02.59.24,1.73.67,3.43.45,1.81.11,3.18-1.15,4.48-10.51,10.88-17.42,18.06-20.71,21.54-1.24,1.31-3.4,1.54-4.73.3-.76-.71-1.17-1.67-1.23-2.87-.41-8.05-.15-18.38-.21-23.49-.04-3.51.13-6.35.51-8.54,2.18-12.48,8.76-22.45,17.21-31.51,7.54-8.09,13.66-14.58,18.36-19.46,1.52-1.59,2.98-1.77,5.34-1.59,1.81.13,3.31.11,4.49-.08,4.77-.75,8.49-3.18,11.17-7.29,2.62-4.02,3.37-8.43,2.25-13.23-.31-1.31-1.13-2.87-1.46-3.83-.08-.23-.11-.48-.08-.72h0Z',
  'M150.76,170.79c1.49-.64,3.57.78,4.67,1.81,3.92,3.63,7.77,7.22,11.55,10.78,2.8,2.64,5.21,5.1,7.24,7.39,2.54,2.86,4.69,5.54,6.46,8.05,5.84,8.28,9.07,18.17,10.2,28.1.58,5.07.9,10.58.96,15.58.1,9.01-.16,18.15-.75,27.41-.1,1.54-.23,3.9-1.56,4.95-2.06,1.63-4.09.3-4.96-1.87-1.53-3.85-2.73-6.64-3.58-8.37-3.01-6.11-6.84-11.34-11.51-15.68-3.49-3.25-7.65-6.3-12.48-9.16-.04-.02-.88-.54-2.53-1.54-9.65-5.87-18.29-13.1-25.91-21.69-8.27-9.33-14.69-19.91-19.23-31.73-3.63-9.42-5.81-19.07-6.55-28.93-.44-5.81-.43-11.94.02-18.39.12-1.67.4-2.78.84-3.33,1.55-1.93,4.05-1.51,5.99-.07,6.64,4.91,12.4,9.52,17.29,13.84,1.24,1.1,1.14,2.47.81,4.25-.47,2.47-.52,4.61-.16,6.42.82,4.11,2.68,7.36,5.57,9.76,5.02,4.17,11.65,5.04,17.64,2.43h0Z'];
// Colores de las hojas por tema (variables de :root)
const LOGO_COLORES={claro:['--primary-500','--mint-300','--mint-600','--mint-400'],lila:['--blanco','--teal-300','--mint-300','--teal-200'],oscuro:['--blanco','--teal-300','--mint-300','--teal-200']};
function isoSVG(clase,tema,enLinea){
  // enLinea: rellenos escritos en el SVG (para dibujarlo fuera de la página: póster, ícono)
  const col=LOGO_COLORES[tema]||LOGO_COLORES.claro;
  return '<svg class="'+clase+'" viewBox="'+LOGO_VB+'" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
    +LOGO_HOJAS.map((d,i)=>'<path class="h'+(i+1)+'"'+(enLinea?' fill="'+cssVarClaro(col[i])+'"':'')+' d="'+d+'"/>').join('')+'</svg>';
}
function logo(variante='horizontal',tema='claro',opc={}){
  const alto=opc.alto||36;
  // Por debajo de 32 px el nombre no se lee: solo el isotipo
  if(variante==='horizontal'&&alto<32)variante='iso';
  const t=' t-'+(LOGO_COLORES[tema]?tema:'claro')+(opc.clase?' '+opc.clase:'');
  if(variante==='iso')
    return '<span class="logo logo-i'+t+'" style="--alto:'+alto+'px"'+(opc.decorativo?' aria-hidden="true"':' role="img" aria-label="Fusa Conecta"')+'>'+isoSVG('logo-iso',tema)+'</span>';
  if(variante==='vertical'){
    // Isotipo arriba; nombre en una línea ≈ 2,2 × ancho del isotipo; separación = 0,2 × alto del isotipo
    const W=alto*LOGO_PROP,f=2.2*W/LOGO_ANCHO_NOMBRE;
    return '<span class="logo logo-v'+t+'" role="img" aria-label="Fusa Conecta'+(opc.lema?'. Todo Fusa, en tu bolsillo':'')+'" style="--alto:'+alto+'px;--f:'+f.toFixed(2)+'px">'
      +'<span class="logo-caja">'+isoSVG('logo-iso',tema)+(opc.extraIso||'')+'</span>'
      +'<span class="logo-nom" aria-hidden="true"><b>Fusa</b> <span>Conecta</span></span>'
      +(opc.lema?'<span class="logo-lema" aria-hidden="true">Todo Fusa, en tu bolsillo</span>':'')+'</span>';
  }
  // Horizontal: "Fusa" y "Conecta" apilados; el isotipo mide lo mismo que de la parte superior de la "F" a la línea base de "Conecta"
  return '<span class="logo logo-h'+t+'" role="img" aria-label="Fusa Conecta" style="font-size:'+(alto/1.84).toFixed(2)+'px">'
    +isoSVG('logo-iso',tema)+'<span class="logo-nom" aria-hidden="true"><b>Fusa</b><span>Conecta</span></span></span>';
}
const MARCA_HTML=logo('horizontal','claro',{alto:36});
const SOS_HTML='<button class="sos-pill" data-sos aria-label="SOS: números de emergencia">'+icon('siren',18)+'SOS</button>';
// Saludo según la hora: "Buenos días / Buenas tardes / Buenas noches" (+ nombre si hay sesión)
function saludoDeHora(h=new Date().getHours()){return h>=5&&h<12?'Buenos días':h>=12&&h<19?'Buenas tardes':'Buenas noches';}
function pintarSaludo(){
  const nom=logueado()?estado.usuario.nombre.split(' ')[0]:'';
  $('#saludoHora').innerHTML='<div class="sh-tx"><b>'+saludoDeHora()+(nom?', '+esc(nom):'')+'</b><span>¿Qué plan hay hoy en Fusa?</span></div>'+pildoraRadioHTML();
  $('#pRadio').onclick=radioAlternar;
}
function renderHeader(){
  const v=vistaActual();
  const enLista=v.tipo==='lista';
  // En los listados no hay "Volver": se vuelve tocando "Todas" (o con el botón Atrás del celular)
  // Las pestañas de la barra inferior (Inicio, Mapa, Cupones, Favoritos, Perfil) no llevan "Volver"; solo las pantallas de segundo nivel
  $('#bVolver').classList.toggle('invisible',stack.length<=1||enLista||['mapa','cupones','billetera','perfil'].includes(v.tipo));
  $('#topbar').classList.toggle('en-lista',enLista);
  $('#descubre').style.display=enLista?'block':'none';
  if(!enLista)return;
  pintarSaludo();
  const conBanner=v.cat==='todas'&&!v.sub&&!v.todo&&!estado.q;
  $('#cats').closest('.fila-chips').hidden=conBanner;
  $('#plegBanner').hidden=!conBanner;
  if(conBanner)montarBanner();
  if(document.activeElement!==$('#busqueda'))$('#busqueda').value=estado.q;
  const ses=$('#sesion');
  if(logueado()){
    const nom=estado.usuario.nombre;
    ses.innerHTML=MARCA_HTML+'<div class="sesion-acciones">'+SOS_HTML+campanaHTML()+'<button class="btn-cuenta" id="bPerfilTop" aria-label="Mi perfil: '+esc(nom)+'"><span class="av">'+esc(nom.charAt(0).toUpperCase())+'</span></button></div>';
    $('#bPerfilTop').onclick=()=>navegar({tipo:'perfil'});
  }else{
    ses.innerHTML=MARCA_HTML+'<div class="sesion-acciones">'+SOS_HTML+campanaHTML()+'<button class="btn-cuenta" id="bEntrar" aria-label="Entrar o crear cuenta">'+icon('user',22)+'</button></div>';
    $('#bEntrar').onclick=()=>abrirLogin('ingresar');
  }
  $('#bNovedades').onclick=abrirNovedades;
  const chips=[{k:'todas',t:'Todas'},{k:'comercio',t:'Comercios'},{k:'campo',t:'Campo'},{k:'turismo',t:'Turismo'},
    {k:'hospedaje',t:'Hospedaje'},{k:'bares',t:'Bares y Licores'},{k:'tramite',t:'Trámites'}];
  $('#cats').innerHTML=chips.map(c=>'<button class="cat'+(v.cat===c.k?' activa':'')+'" data-cat="'+c.k+'" role="tab" aria-selected="'+(v.cat===c.k)+'">'+icon(ICONO_CAT[c.k],18)+c.t+'</button>').join('');
  $$('#cats .cat').forEach(b=>b.onclick=()=>{
    const k=b.dataset.cat;if(v.cat===k&&!v.sub)return;
    if(k==='bares'){irABares();return;}
    navegar({tipo:'lista',cat:k});
  });
  const activa=$('#cats .cat.activa');
  if(activa)activa.scrollIntoView({inline:'nearest',block:'nearest'});
  renderSubcategorias(v);
}
/* ===== SEGUNDO NIVEL: filtros rápidos + subcategorías =====
   Filtros rápidos (Abierto ahora, Con cupón, municipio) al inicio de la fila;
   luego las subcategorías de Comercios (en Todas y Comercios) o de Turismo. */
function renderSubcategorias(v){
  const fila=$('#subcats'),cont=$('#filaSub');
  const subs=['todas','favoritos'].includes(v.cat)?[]:(SUBCATS[v.cat]||[]).filter(s=>database.some(d=>d.cat===v.cat&&subDe(d)===s.k));
  cont.classList.toggle('vacia',!subs.length);
  fila.innerHTML=subs.map(s=>'<button class="subcat'+(v.sub===s.k?' activa':'')+'" data-sub="'+s.k+'" aria-pressed="'+(v.sub===s.k)+'">'+icon(ICONO_SUB[s.k]||'circle-help',16)+nombreSub(v.cat,s.k)+'</button>').join('');
  // Tocar la subcategoría activa la quita; cambiarla no llena el historial del botón Atrás
  $$('#subcats [data-sub]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.sub;
    stack[stack.length-1]={tipo:'lista',cat:v.cat,sub:v.sub===k?'':k};render();
  });
  const act=$('#subcats .subcat.activa');if(act)act.scrollIntoView({inline:'nearest',block:'nearest'});
  pintarFiltrosActivos();
}
/* ===== FILTROS: hoja inferior y línea de filtros activos ===== */
const ORDENES=[['recomendados','Recomendados'],['calificados','Mejor calificados'],['cercanos','Más cercanos']];
function filtrosActivos(f=estado.filtros){
  const l=[];
  if(f.abierto)l.push(['abierto','Abierto ahora']);
  if(f.cupon)l.push(['cupon','Con cupón']);
  if(f.municipio)l.push(['municipio',f.municipio]);
  if(f.orden&&f.orden!=='recomendados')l.push(['orden',ORDENES.find(o=>o[0]===f.orden)[1]]);
  return l;
}
function pintarFiltrosActivos(){
  const l=filtrosActivos(),g=$('#filtrosGlobo');
  g.hidden=!l.length;g.textContent=l.length;
  $('#bFiltros').classList.toggle('on',!!l.length);
  $('#bFiltros').setAttribute('aria-label','Filtros'+(l.length?': '+l.length+(l.length===1?' activo':' activos'):''));
  $('#filtrosActivos').innerHTML=l.map(([k,t])=>'<button class="fa-pill" data-quitar="'+k+'" aria-label="Quitar filtro '+esc(t)+'">'+esc(t)+icon('x',16)+'</button>').join('');
  $$('[data-quitar]').forEach(b=>b.onclick=()=>{const k=b.dataset.quitar,f=estado.filtros;if(k==='municipio')f.municipio='';else if(k==='orden')f.orden='recomendados';else f[k]=false;render();});
}
function abrirFiltros(){
  const v=vistaActual(),borrador={...estado.filtros};
  const contar=()=>itemsVisibles(v.cat,v.sub,true,borrador).length;
  const pintar=()=>{
    abrirHoja('<div class="hoja-filtros"><h2 class="hoja-tit">Filtros</h2>'
      +[['abierto','clock','Abierto ahora'],['cupon','ticket','Con cupón']].map(([k,i,t])=>'<label class="fil-fila"><span class="fil-tx">'+icon(i)+t+'</span><input type="checkbox" role="switch" class="interruptor" data-fil="'+k+'"'+(borrador[k]?' checked':'')+'></label>').join('')
      +'<span class="fil-lbl" id="lMun">Municipio</span><div class="seg" role="radiogroup" aria-labelledby="lMun">'+[['','Ambos'],['Fusagasugá','Fusagasugá'],['Pasca','Pasca']].map(([k,t])=>'<button type="button" role="radio" aria-checked="'+(borrador.municipio===k)+'" class="'+(borrador.municipio===k?'on':'')+'" data-mun="'+k+'">'+t+'</button>').join('')+'</div>'
      +'<span class="fil-lbl" id="lOrden">Ordenar por</span><div class="seg" role="radiogroup" aria-labelledby="lOrden">'+ORDENES.map(([k,t])=>'<button type="button" role="radio" aria-checked="'+(borrador.orden===k)+'" class="'+(borrador.orden===k?'on':'')+'" data-orden="'+k+'">'+t+'</button>').join('')+'</div>'
      +'</div><div class="fil-pie"><button class="btn btn-ghost" id="filLimpiar">Limpiar</button><button class="btn btn-primario" id="filVer"></button></div>');
    $('#sheetGen').setAttribute('aria-label','Filtros');
    const n=contar();$('#filVer').textContent='Ver '+n+(n===1?' lugar':' lugares');
    $$('[data-fil]').forEach(x=>x.onchange=()=>{borrador[x.dataset.fil]=x.checked;const n=contar();$('#filVer').textContent='Ver '+n+(n===1?' lugar':' lugares');});
    $$('[data-mun]').forEach(b=>b.onclick=()=>{borrador.municipio=b.dataset.mun;pintar();});
    $$('[data-orden]').forEach(b=>b.onclick=()=>{borrador.orden=b.dataset.orden;pintar();});
    $('#filLimpiar').onclick=()=>{Object.assign(borrador,{abierto:false,cupon:false,municipio:'',orden:'recomendados'});pintar();};
    $('#filVer').onclick=async()=>{
      if(borrador.orden==='cercanos'&&!estado.pos){
        const p=await pedirUbicacion();
        if(!p){toast('Activa tu ubicación para ordenar por cercanía');borrador.orden='recomendados';}
      }
      estado.filtros={...borrador};cerrar('ovGen');render();
      medir('filtros',{activos:filtrosActivos().map(x=>x[1]).join(', ')||'ninguno'});
    };
  };
  pintar();
}

function subDe(d){return d.cat==='turismo'?(d.tipo||''):(d.sub||'');}
// Nombre de la subcategoría sin el emoji que trae datos.js
function nombreSub(cat,k){const s=(SUBCATS[cat]||[]).find(x=>x.k===k);return s?s.t.replace(/^[^\p{L}]+/u,'').trim():'';}
function irABares(){if(estado.mayorEdad){navegar({tipo:'lista',cat:'bares'});return;}abrir('ovEdad');}

/* ===== BÚSQUEDA Y ORDEN (RF-05, RF-19) ===== */
// Ignora tildes, mayúsculas y plurales: "droguerias" encuentra "Droguería"
function raiz(w){if(w.length>4&&w.endsWith('es'))return w.slice(0,-2);if(w.length>3&&w.endsWith('s'))return w.slice(0,-1);return w;}
function tokens(s){return norm(s).split(/[^a-z0-9]+/).filter(Boolean).map(raiz);}
function coincide(d,q){
  if(!q)return true;
  const txt=tokens(d.nombre+' '+d.desc+' '+d.direccion+' '+(CAT[d.cat]?CAT[d.cat].label:'')+' '+(d.tipo||'')+' '+nombreSub(d.cat,subDe(d))).join(' ');
  return tokens(q).every(t=>txt.includes(t));
}
function prioridad(d){
  // Premium primero cuando está dentro del radio de cercanía (2 km) o si no hay GPS
  if(!premiumVigente(d)||!(d.prioridadBusqueda>0))return 0;
  const km=distanciaA(d);return (km==null||km<=2)?1:0;
}
function ordenar(items,orden='recomendados'){
  if(orden==='calificados')return items.sort((a,b)=>{const x=calificacionDe(a),y=calificacionDe(b);return (y.prom-x.prom)||(y.total-x.total);});
  if(orden==='cercanos')return items.sort((a,b)=>(distanciaA(a)??1e9)-(distanciaA(b)??1e9));
  return items.sort((a,b)=>{
    const p=prioridad(b)-prioridad(a);if(p)return p;
    const da=distanciaA(a),dbb=distanciaA(b);
    if(da!=null&&dbb!=null&&Math.abs(da-dbb)>0.05)return da-dbb;
    return calificacionDe(b).prom-calificacionDe(a).prom;
  });
}
function itemsVisibles(cat,sub,conFiltros=true,f=estado.filtros){
  let items=[...database];
  if(cat&&cat!=='todas'&&cat!=='favoritos')items=items.filter(d=>d.cat===cat);
  if(sub)items=items.filter(d=>subDe(d)===sub);
  if(cat==='favoritos')items=items.filter(d=>estado.favoritos.includes(String(d.id)));
  if(cat==='todas'&&!estado.mayorEdad)items=items.filter(d=>d.cat!=='bares');
  if(conFiltros){
    if(f.abierto)items=items.filter(d=>{const a=estadoApertura(d);return a&&a.abierto;});
    if(f.cupon)items=items.filter(d=>cuponesDe(d).length>0);
    if(f.municipio)items=items.filter(d=>(d.municipio||'Fusagasugá')===f.municipio);
  }
  return ordenar(items.filter(d=>coincide(d,estado.q)),conFiltros?f.orden:'recomendados');
}
function renderSugerencias(){
  const box=$('#sugerencias');const q=$('#busqueda').value.trim();
  if(q.length<3){box.classList.remove('ver');box.innerHTML='';return;}
  estado.q=q;
  const res=itemsVisibles('todas','',false).slice(0,6);estado.q='';
  box.innerHTML=res.length?res.map(d=>'<button data-sug="'+esc(d.id)+'"><span class="sg-ic c-'+esc(d.cat)+'">'+icon(iconoDe(d),16)+'</span><span class="sg-tx"><b>'+esc(d.nombre)+'</b><small>'+esc(etiquetaDe(d))+(premiumVigente(d)?' · Destacado':'')+'</small></span></button>').join('')
    :'<p class="sg-vacio">Sin coincidencias para «'+esc(q)+'»</p>';
  box.classList.add('ver');
  $$('#sugerencias [data-sug]').forEach(b=>b.onmousedown=e=>{e.preventDefault();box.classList.remove('ver');abrirDetalle(b.dataset.sug);});
}

/* ===== TARJETA DE LUGAR ===== */
function fotoHTML(d,cls){
  const img=imgSegura(d.imagen);
  return '<div class="'+cls+'"><span class="fallback-ic c-'+esc(d.cat)+'">'+icon(iconoDe(d))+'</span>'
    +(img?'<img src="'+esc(img)+'" alt="Foto de '+esc(d.nombre)+'" loading="lazy" onerror="this.remove()">':'');
}
function badgeDestacado(d){return premiumVigente(d)?'<span class="badge-dest">'+icon('star',14,'ic-fill')+'Destacado</span>':'';}
function enlazarTarjetas(){
  $$('#cuerpo .tc-link').forEach(b=>b.onclick=()=>abrirDetalle(b.dataset.ver));
  $$('#cuerpo .tc-fav').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    if(!toggleFavorito(b.dataset.fav))return;
    const on=estado.favoritos.includes(b.dataset.fav);
    b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.classList.add('pop');setTimeout(()=>b.classList.remove('pop'),400);
    if(vistaActual().cat==='favoritos')render();
  });
}
function buscar(id){return database.find(x=>String(x.id)===String(id))||comerciosPropios.find(x=>String(x.id)===String(id));}

/* ===== ACCIONES DE CONTACTO (RF-09, RF-13) ===== */
function abrirWhatsApp(d){
  if(!d)return;
  const wa=d.whatsapp||(esCelular(d.tel)?telLimpio(d.tel):'');
  if(!wa){toast('Este comercio no tiene WhatsApp registrado. Puedes llamar al '+d.tel);return;}
  registrarEvento(d,'toques_wa');medir('whatsapp',{comercio:d.nombre,categoria:d.cat});
  const msg='Hola '+d.nombre+', te encontré en Fusa Conecta. Quisiera más información.';
  window.open('https://wa.me/57'+wa+'?text='+encodeURIComponent(msg),'_blank','noopener');
}
async function compartir(nombre,ruta){
  medir('compartir',{lugar:nombre});
  const url=location.origin+location.pathname+(ruta?'#'+ruta:'');
  const text='Mira este lugar en Fusagasugá: '+nombre+'. Descúbrelo en Fusa Conecta.';
  if(navigator.share){try{await navigator.share({title:nombre,text,url});}catch(e){}return;}
  window.open('https://wa.me/?text='+encodeURIComponent(text+' '+url),'_blank','noopener');
}

/* ===== FAVORITOS (RF-14) ===== */
function claveFav(){return 'fc_fav_'+(estado.usuario?estado.usuario.uid:'');}
function toggleFavorito(rawId){
  if(!logueado()){pedirLogin('Inicia sesión para guardar tus lugares favoritos.');return false;}
  const id=String(rawId);const i=estado.favoritos.indexOf(id);
  if(i===-1)estado.favoritos.push(id);else estado.favoritos.splice(i,1);
  ls.set(claveFav(),estado.favoritos);
  db.collection('usuarios').doc(estado.usuario.uid).update({favoritos:i===-1?FV.arrayUnion(id):FV.arrayRemove(id)}).catch(()=>{});
  toast(i===-1?'Agregado a favoritos':'Quitado de favoritos');
  return true;
}

/* ===== RENDER PRINCIPAL ===== */
let mapaActivo=null,rutaWatch=null,rutaSim=null;
function limpiarMapas(){
  if(rutaWatch!=null){navigator.geolocation.clearWatch(rutaWatch);rutaWatch=null;}
  if(rutaSim){clearInterval(rutaSim);rutaSim=null;}
  if(mapaActivo){mapaActivo.remove();mapaActivo=null;}
}
function refrescarVista(){
  const v=vistaActual();
  if(['lista','perfil','dashboard','billetera','cupones','planes','agenda'].includes(v.tipo))render(true);
}
function render(conservarScroll){
  const v=vistaActual();const cuerpo=$('#cuerpo');
  const scroll=conservarScroll?cuerpo.scrollTop:0;
  limpiarMapas();
  const fabAg=$('#agFab');if(fabAg)fabAg.remove();
  // Las actualizaciones en vivo no repiten la animación de entrada de las tarjetas
  cuerpo.className='cuerpo'+(conservarScroll?' sin-anim':'');
  if(v.tipo==='dashboard')renderDashboard();
  else if(v.tipo==='perfil')renderPerfil();
  else if(v.tipo==='sos')renderSOS();
  else if(v.tipo==='mapa')renderMapa();
  else if(v.tipo==='ruta')renderRuta(v.id);
  else if(v.tipo==='admin')renderAdmin();
  else if(v.tipo==='billetera')renderBilletera();
  else if(v.tipo==='cupones')renderCuponesDisponibles();
  else if(v.tipo==='planes')renderPlanes();
  else if(v.tipo==='agenda')renderAgenda();
  else if(v.tipo==='recorridos')renderRecorridos();
  else if(v.tipo==='recorrido')renderRecorrido(v.id);
  else renderLista(v);
  renderHeader();renderBottomNav();pintarAvisoGrabando();
  cuerpo.scrollTop=scroll;
  medirPagina(...rutaDeVista(v));
}
function hayFiltros(){return filtrosActivos().length>0;}
function renderLista(v){
  const items=itemsVisibles(v.cat,v.sub);
  const titulo=v.cat==='favoritos'?'Mis favoritos':(v.cat==='todas'?'Todo Fusa Conecta':(CAT[v.cat]?CAT[v.cat].label:'Resultados'))
    +(v.sub?' · '+nombreSub(v.cat,v.sub):'');
  let html;
  const enInicio=v.cat==='todas'&&!v.sub&&!v.todo&&!estado.q&&!hayFiltros();
  if(estado.listaClave!==JSON.stringify([v.cat,v.sub,v.todo,estado.q])){estado.listaClave=JSON.stringify([v.cat,v.sub,v.todo,estado.q]);estado.limiteLista=POR_PAGINA;}
  if(enInicio){
    // Inicio: categorías en tiles y secciones en carrusel; al final una muestra del directorio en 2 columnas
    html=tilesHTML()+seccionEventosHTML()+seccionCuponesHTML()+seccionAbiertosHTML()+seccionCercaHTML()+seccionCampoHTML()+seccionRutasHTML()+seccionRecientesHTML()+tarjetaInstalarHTML()
      +'<div class="head-v" id="todoFusa"><h2>Todo Fusa Conecta</h2><span class="conteo">'+items.length+' lugares</span></div>'
      +'<div class="grid-tc">'+items.slice(0,8).map(tarjetaHTML).join('')+'</div>'
      +'<button class="btn btn-secundario btn-bloque mt-16" id="verTodo">Ver todos los lugares ('+items.length+')</button>';
  }else if(items.length){
    html=(v.cat==='favoritos'?eventosFavoritosHTML():'')+'<div class="head-v" id="todoFusa"><h2>'+esc(titulo)+'</h2><span class="conteo">'+items.length+(items.length===1?' lugar':' lugares')+'</span></div>'
      +barraListaHTML(items.length)
      +(estado.vistaLista==='mapa'?'<div id="mapaLista" class="mapa-lista" role="region" aria-label="Mapa de los resultados"></div>':cuadriculaHTML(items,estado.limiteLista||POR_PAGINA));
  }else if(v.cat==='favoritos'&&!estado.q&&!hayFiltros()){
    html=eventosFavoritosHTML()+'<div class="vacio">'+icon('heart',48)+'<b>Aún no tienes favoritos</b><p>Toca el corazón de un lugar para guardarlo aquí. Tus favoritos quedan disponibles sin conexión.</p></div>';
  }else{
    const motivo=estado.q?'No encontramos resultados para «'+esc(estado.q)+'»'
      :estado.filtros.municipio==='Pasca'?'Aún no hay lugares registrados en Pasca con estos filtros'
      :'No hay lugares que cumplan estos filtros';
    const sug=[['comercio','Comercios'],['turismo','Turismo'],['hospedaje','Hospedaje'],['campo','Campo']];
    html='<div class="vacio">'+icon('search-x',48)+'<b>'+motivo+'</b><p>Prueba con otra palabra o explora una categoría:</p>'
      +'<div class="sug-cats">'+sug.map(([k,t])=>'<button class="chip-filtro" data-sugcat="'+k+'">'+icon(ICONO_CAT[k],16)+t+'</button>').join('')+'</div></div>';
  }
  $('#cuerpo').innerHTML='<div class="vista">'+html+'</div>'+footerHTML();
  $$('[data-sugcat]').forEach(b=>b.onclick=()=>{
    estado.q='';estado.filtros={abierto:false,cupon:false,municipio:'',orden:'recomendados'};$('#busqueda').value='';
    navegar({tipo:'lista',cat:b.dataset.sugcat});
  });
  enlazarTarjetas();enlazarCuponesSemana();enlazarSecciones();enlazarInstalar();enlazarFooter();
  enlazarEventos();
  if(enInicio){enlazarTiles();const vt=$('#verTodo');if(vt)vt.onclick=()=>navegar({tipo:'lista',cat:'todas',todo:true});}
  else if(items.length)enlazarListado(items);
}

/* ===== BANNER PRINCIPAL ROTATIVO (inicio) =====
   Primero el "Negocio destacado" (un solo espacio) y los banners con foto que publica el admin (colección banners);
   después las 4 diapositivas propias de la app. Cambia sola cada 5 s; se pausa al tocarla o arrastrarla y
   se reanuda a los 8 s. Se desliza con el dedo (scroll-snap) o con el mouse (pointer events).
   Con prefers-reduced-motion no avanza sola. */
const HOJA_SVG='M50 2C80 12 98 42 90 70 82 94 44 100 18 82-4 66 4 22 50 2Z';
function formaSVG(cls,x,y,t,giro){return '<svg class="forma '+cls+'" style="left:'+x+'%;top:'+y+'%;width:'+t+'px;height:'+t+'px;transform:rotate('+giro+'deg)" viewBox="0 0 100 100" aria-hidden="true"><path d="'+HOJA_SVG+'"/></svg>';}
function cuponesActivosTotal(){let n=0;database.forEach(d=>n+=cuponesDe(d).length);return n;}
function textoCuponesBanner(){const n=cuponesActivosTotal();return n?n+(n===1?' cupón activo':' cupones activos'):'Pronto, cupones nuevos';}
// Banners propios de la app: todos con foto real de Fusa (WebP 800 px) y el velo de su color;
// si una foto no carga queda el fondo de color con la ilustración
function slidesBase(){
  return [
    {id:'bienvenida',foto:'img/banners/bienvenida.webp',velo:'violeta',tag:'Bienvenido',tit:'Todo Fusa, en tu bolsillo',
      sub:'Comercios, rutas y emergencias de la región.',accion:'explorar',textoBoton:'Explorar',
      ilu:'<span class="ilu-logo">'+logo('iso','lila',{alto:56,decorativo:true})+'</span>'},
    {id:'cupones',foto:'img/banners/cupones.webp',velo:'sol',tag:'Ahorra en Fusa',tit:'Tu cupón te está esperando',
      sub:'Toma un descuento, muéstralo en caja y ahorra.',accion:'cupones',textoBoton:'Ver cupones',
      ilu:'<span class="ilu-ticket"><b>%</b><i></i><small>OFF</small></span>',iluSiempre:true,
      extra:'<span class="slide-dato" id="bannerCupones">'+textoCuponesBanner()+'</span>'},
    {id:'negocio',foto:'img/banners/negocio.webp',velo:'menta',tag:'Para comerciantes',tit:'¿Tienes un negocio? Súmalo gratis',
      sub:'Llega a más vecinos y turistas de la región.',accion:'negocio',textoBoton:'Registrar mi negocio',
      ilu:'<span class="ilu-circulo">'+icon('store',30)+'</span>'},
    {id:'opinion',foto:'img/banners/opinion.webp',velo:'noche',tag:'Estamos en pruebas',tit:'Tu opinión hace mejor esta app',
      sub:'Cuéntanos qué te gustó y qué cambiarías.',accion:'opinion',textoBoton:'Dar mi opinión',
      ilu:'<span class="ilu-circulo">'+icon('message-circle-heart',30)+'</span>'}
  ];
}
const porOrden=(a,b)=>(a.orden||0)-(b.orden||0);
// Fechas del banner como texto AAAA-MM-DD (fecha local): sin fechas se muestra mientras esté activo
function hoyISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
const bannerVigente=b=>b.activo!==false&&(!b.desde||b.desde<=hoyISO())&&(!b.hasta||b.hasta>=hoyISO());
function accionBanner(b){
  const t=b.enlace_tipo||'ninguno';
  if(t==='negocio'||t==='categoria')return b.enlace_valor?t+':'+b.enlace_valor:'';
  return t==='cupones'?'cupones':t==='registrar'?'negocio':'';
}
function slidesBanner(){
  const l=[],bs=estado.banners||[];
  const finde=slideFinDeSemana();if(finde)l.push(finde);
  const dest=bs.find(b=>b.id==='destacado'&&b.activo!==false),dc=dest&&buscar(dest.comercio_id);
  if(dc)l.push({id:'destacado-'+dc.id,foto:imgSegura(dc.imagen)?dc.imagen:'',fotoNube:dc.fotos&&dc.fotos[0]?dc.fotos[0]:'',comercio:dc.id,
    tag:'Negocio destacado',tit:dc.nombre,sub:etiquetaDe(dc)+(dc.direccion?' · '+dc.direccion:''),accion:'negocio:'+dc.id,textoBoton:'Ver negocio',
    ilu:'<span class="ilu-circulo">'+icon(iconoDe(dc),30)+'</span>'});
  bs.filter(b=>b.tipo==='foto'&&b.imagen&&bannerVigente(b)).sort(porOrden).forEach(b=>l.push({id:b.id,foto:b.imagen,tag:b.etiqueta||'',tit:b.titulo||'',sub:b.texto||'',
    accion:accionBanner(b),textoBoton:b.boton||(b.enlace_tipo==='negocio'?'Ver negocio':'Ver más')}));
  return l.concat(slidesBase());
}
function slideHTML(s,i,n){
  const aria=' role="group" aria-roledescription="diapositiva" aria-label="'+(i+1)+' de '+n+': '+esc(s.tit)+'" data-sid="'+esc(s.id)+'"';
  // Foto (z 0) → velo de color de izquierda a derecha (z 1) → texto (z 2), dentro del contexto de apilamiento de la diapositiva.
  // Carga inmediata (en un carrusel horizontal "lazy" deja sin cargar las que no se ven); la primera con prioridad alta.
  // Si la foto falla, se oculta y queda el fondo de color con la ilustración.
  const v=s.velo||'violeta';
  return '<div class="slide s-foto v-'+v+(s.comercio?' s-destacado':'')+(s.foto?'':' sin-foto')+(s.iluSiempre?' ilu-siempre':'')+'"'+aria+'>'
    +(s.foto?'<img class="slide-foto" src="'+esc(s.foto)+'" alt="" loading="eager" decoding="async"'+(i===0?' fetchpriority="high"':'')
      +' onerror="this.hidden=true;this.closest(\'.slide\').classList.add(\'sin-foto\')">':'')
    +'<span class="slide-velo" aria-hidden="true"></span>'
    +(s.ilu?'<div class="slide-ilu" aria-hidden="true">'+s.ilu+'</div>':'')
    +(s.tag?'<span class="slide-tag">'+(s.comercio?icon('star',12,'ic-fill'):'')+esc(s.tag)+'</span>':'')
    +'<h2 class="slide-tit">'+esc(s.tit)+'</h2>'+(s.sub?'<p class="slide-sub">'+esc(s.sub)+'</p>':'')
    +(s.accion?'<div class="slide-pie"><button class="slide-btn" data-slide="'+esc(s.accion)+'">'+esc(s.textoBoton)+icon('arrow-right',16)+'</button>'+(s.extra||'')+'</div>':'')+'</div>';
}
function bannerHTML(sl){
  return '<div class="banner-pista" id="bannerPista">'+sl.map((s,i)=>slideHTML(s,i,sl.length)).join('')+'</div>'
    +'<div class="banner-puntos" aria-hidden="true">'+sl.map((s,i)=>'<span class="'+(i?'':'on')+'"></span>').join('')+'</div>';
}
const banner={actual:0,n:0,timer:null,pausaHasta:0,firma:'',arr:null,ventana:false};
const pasoBanner=p=>p.firstElementChild.offsetWidth+8;
function montarBanner(){
  const caja=$('#banner'),sl=slidesBanner();
  // Solo se regenera si cambió lo que muestra (nuevo banner, destacado distinto...): así no parpadea al navegar
  const firma=sl.map(s=>s.id+'|'+s.tit+'|'+(s.foto?s.foto.length:0)+'|'+(s.accion||'')).join(';');
  if(banner.firma!==firma){
    banner.firma=firma;banner.n=sl.length;banner.actual=0;
    caja.innerHTML=bannerHTML(sl);
    const pista=$('#bannerPista');
    const pausar=()=>{banner.pausaHasta=Date.now()+8000;};
    ['pointerdown','touchstart','wheel','focusin'].forEach(ev=>pista.addEventListener(ev,pausar,{passive:true}));
    pista.addEventListener('scroll',()=>{
      const i=Math.round(pista.scrollLeft/pasoBanner(pista));
      if(i!==banner.actual){banner.actual=i;$$('.banner-puntos span').forEach((p,k)=>p.classList.toggle('on',k===i));}
    },{passive:true});
    // Arrastre con el mouse en computador (en el celular el dedo usa el desplazamiento nativo)
    pista.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;banner.arr={x:e.clientX,s:pista.scrollLeft};pista.classList.add('arrastrando');});
    $$('[data-slide]',caja).forEach(b=>b.onclick=()=>accionSlide(b.dataset.slide));
    // El destacado se ve de una vez con la portada liviana y luego cambia a su primera foto en buena calidad
    const d=sl.find(s=>s.fotoNube);
    if(d)db.collection('comercios').doc(String(d.comercio)).collection('fotos').doc(d.fotoNube).get().then(s=>{
      const sl2=caja.querySelector('[data-sid="'+d.id+'"]');if(!s.exists||!sl2)return;
      let img=sl2.querySelector('.slide-foto');
      if(!img){img=document.createElement('img');img.className='slide-foto';img.alt='';sl2.prepend(img);}
      img.src=s.data().data;
    }).catch(()=>{});
  }
  if(!banner.ventana){
    banner.ventana=true;
    window.addEventListener('pointermove',e=>{const p=$('#bannerPista');if(banner.arr&&p)p.scrollLeft=banner.arr.s-(e.clientX-banner.arr.x);});
    window.addEventListener('pointerup',()=>{const p=$('#bannerPista');if(!banner.arr||!p)return;banner.arr=null;p.classList.remove('arrastrando');irASlide(Math.round(p.scrollLeft/pasoBanner(p)));});
    if(!sinMovimiento())banner.timer=setInterval(avanzarBanner,5000);
  }
  const c=$('#bannerCupones');if(c)c.textContent=textoCuponesBanner();
}
function irASlide(i){
  const pista=$('#bannerPista');if(!pista||!banner.n)return;
  i=(i+banner.n)%banner.n;pista.scrollTo({left:i*pasoBanner(pista),behavior:sinMovimiento()?'auto':'smooth'});
}
function avanzarBanner(){
  const caja=$('#banner');
  // Solo avanza si se ve: en el inicio, sin la cabecera plegada y con la app en primer plano
  if(Date.now()<banner.pausaHasta||document.hidden||!caja.offsetParent||$('#topbar').classList.contains('arriba')||$('.overlay.abierto'))return;
  irASlide(banner.actual+1);
}
function accionSlide(k){
  banner.pausaHasta=Date.now()+8000;
  if(k==='agenda'){irAgenda('finde');return;}
  const [tipo,valor]=k.split(':');
  if(tipo==='negocio'&&valor){abrirDetalle(valor);return;}
  if(tipo==='categoria'&&valor&&CAT[valor]){valor==='bares'?irABares():navegar({tipo:'lista',cat:valor});return;}
  if(k==='explorar'){const t=$('#todoFusa');if(t)t.scrollIntoView({behavior:sinMovimiento()?'auto':'smooth',block:'start'});}
  else if(k==='cupones'){estado.filtros.cupon=true;render();}
  else if(k==='negocio')registrarMiNegocio();
  else if(k==='opinion')abrirOpinion('banner');
}
// "Registrar mi negocio": cualquier persona con cuenta; sin cuenta, primero se registra y luego sigue al asistente
function registrarMiNegocio(){
  if(logueado()){abrirFormComercio(null);return;}
  guardarAccionPendiente('negocio');
  abrirLogin('registro',false,'Crea tu cuenta gratis para registrar tu negocio.');
}

/* ===== TARJETA COMPACTA (v5 · Fase 3) =====
   168 px en carruseles y ancho flexible en la cuadrícula de 2 columnas. Foto 4:3, corazón arriba a la derecha,
   insignia "Cupón" o "Destacado" arriba a la izquierda; toda la tarjeta abre la ficha (el nombre es el enlace y lo cubre todo). */
function tarjetaHTML(d){
  const esFav=estado.favoritos.includes(String(d.id)),cal=calificacionDe(d),ap=estadoApertura(d),km=distanciaA(d),img=imgSegura(d.imagen);
  const insignia=cuponesDe(d).length?'<span class="tc-ins cupon">'+icon('ticket',12)+'Cupón</span>'
    :premiumVigente(d)?'<span class="tc-ins dest">'+icon('star',12,'ic-fill')+'Destacado</span>':'';
  // Abierto o "Cierra pronto" cuando aplica; si no, la categoría y la distancia
  const linea=ap&&ap.abierto?estadoHTML(ap,d.id):'<span class="tc-cat">'+esc(etiquetaDe(d))+(km!=null?' · '+fmtDist(km):'')+'</span>';
  return '<article class="tarjeta">'
    +'<div class="tc-foto"><span class="fallback-ic c-'+esc(d.cat)+'">'+icon(iconoDe(d),28)+'</span>'
      +(img?'<img src="'+esc(img)+'" alt="" loading="lazy" decoding="async" onerror="this.remove()">':'')+insignia
      +'<button class="tc-fav'+(esFav?' on':'')+'" data-fav="'+esc(d.id)+'" aria-pressed="'+esFav+'" aria-label="'+(esFav?'Quitar de favoritos ':'Guardar en favoritos ')+esc(d.nombre)+'">'+icon('heart',18)+'</button></div>'
    +'<h3 class="tc-nombre"><button class="tc-link" data-ver="'+esc(d.id)+'">'+esc(d.nombre)+'</button></h3>'
    +(cal.total?'<p class="tc-calif">'+icon('star',14,'ic-fill')+cal.prom.toFixed(1).replace('.',',')+' <span>('+cal.total+')</span></p>':'')
    +'<p class="tc-linea">'+linea+'</p></article>';
}
function tarjetaEsqueletoHTML(){return '<div class="tarjeta esqueleto" aria-hidden="true"><div class="tc-foto"></div><span class="esq-l"></span><span class="esq-l corta"></span></div>';}
function carruselHTML(id,titulo,items,ir,cargando){
  if(!items.length&&!cargando)return '';
  return '<section class="seccion-inicio" aria-labelledby="t'+id+'"><div class="head-v"><h2 id="t'+id+'">'+titulo+'</h2>'
    +(ir&&items.length?'<button class="btn-ghost" data-ir="'+ir+'">Ver todos</button>':'')+'</div>'
    +'<div class="carrusel carrusel-tc"'+(cargando?' aria-busy="true"':'')+'>'+(cargando?tarjetaEsqueletoHTML().repeat(3):items.map(tarjetaHTML).join(''))+'</div></section>';
}

/* ===== CATEGORÍAS EN TILES (inicio) ===== */
const TILES=[
  {t:'Comida',ic:'utensils',cat:'comercio',sub:'comidas',c:'comer'},
  {t:'Tiendas',ic:'shopping-bag',cat:'comercio',sub:'tiendas',c:'comer'},
  {t:'Campo',ic:'sprout',cat:'campo',c:'campo'},
  {t:'Turismo',ic:'mountain',cat:'turismo',c:'turismo'},
  {t:'Hospedaje',ic:'bed-double',cat:'hospedaje',c:'hospedaje'},
  {t:'Eventos',ic:'calendar-days',agenda:true,c:'eventos'},
  {t:'Bares',ic:'wine',cat:'bares',c:'bares'},
  {t:'Trámites',ic:'landmark',cat:'tramite',c:'tramites'},
  {t:'Mascotas',ic:'paw-print',cat:'comercio',sub:'mascotas',c:'comer'},
  {t:'Panaderías',ic:'croissant',cat:'comercio',sub:'panaderias',c:'comer'},
  {t:'Salud',ic:'stethoscope',cat:'comercio',sub:'salud',c:'comer'},
  {t:'Servicios',ic:'hand-helping',cat:'comercio',sub:'servicios',c:'comer'},
  {t:'Talleres',ic:'car',cat:'comercio',sub:'talleres',c:'comer'},
  {t:'Ferreterías',ic:'hammer',cat:'comercio',sub:'ferreterias',c:'comer'},
  {t:'Comercios',ic:'store',cat:'comercio',c:'comer'}
];
// Solo las categorías con lugares; si son más de 8, la octava es "Más" y abre una hoja con todas
// "Eventos" siempre está (aunque no haya ninguno publicado: lleva a la Agenda y a sugerir uno)
function tilesDisponibles(){return TILES.filter(x=>x.agenda||database.some(d=>d.cat===x.cat&&(!x.sub||subDe(d)===x.sub)));}
function tileHTML(x,i){return '<button class="tile-cat" data-tile="'+i+'"><span class="tile-ic c-'+x.c+'" aria-hidden="true">'+icon(x.ic,28)+'</span><span class="tile-tx">'+x.t+'</span></button>';}
function tilesHTML(){
  const l=tilesDisponibles(),mas=l.length>8;
  return '<nav class="tiles-cat" aria-label="Categorías">'+(mas?l.slice(0,7):l).map((x,i)=>tileHTML(x,TILES.indexOf(x))).join('')
    +(mas?'<button class="tile-cat" id="tileMas"><span class="tile-ic c-mas" aria-hidden="true">'+icon('layout-grid',28)+'</span><span class="tile-tx">Más</span></button>':'')+'</nav>';
}
function irATile(x){if(x.agenda){irAgenda();return;}if(x.cat==='bares'){irABares();return;}navegar({tipo:'lista',cat:x.cat,sub:x.sub||''});}
function enlazarTiles(){
  $$('#cuerpo [data-tile]').forEach(b=>b.onclick=()=>irATile(TILES[+b.dataset.tile]));
  const m=$('#tileMas');if(m)m.onclick=()=>{
    abrirHoja('<div class="hoja-pad"><h2>Todas las categorías</h2><nav class="tiles-cat mt-16" aria-label="Todas las categorías">'+tilesDisponibles().map(x=>tileHTML(x,TILES.indexOf(x))).join('')+'</nav></div>');
    $('#sheetGen').setAttribute('aria-label','Todas las categorías');
    $$('#sheetGen [data-tile]').forEach(b=>b.onclick=()=>{cerrar('ovGen');irATile(TILES[+b.dataset.tile]);});
  };
}

/* ===== SECCIONES DEL INICIO (carruseles de tarjetas compactas) ===== */
function seccionAbiertosHTML(){
  const l=itemsVisibles('todas','',false).filter(d=>{const a=estadoApertura(d);return a&&a.abierto;}).slice(0,10);
  return carruselHTML('Abiertos','Abierto ahora',l,'abierto');
}
function seccionCercaHTML(){
  if(!estado.pos)return '';
  const l=itemsVisibles('todas','',false).filter(d=>{const k=distanciaA(d);return k!=null&&k<=3;}).sort((a,b)=>distanciaA(a)-distanciaA(b)).slice(0,10);
  return carruselHTML('Cerca','Cerca de ti',l,'cercanos');
}
function seccionCampoHTML(){return carruselHTML('Campo','Del campo a tu mesa',itemsVisibles('campo','',false).slice(0,10),'campo');}
// Rutas y senderos: primero los que tienen recorrido, luego los demás senderos
function seccionRutasHTML(){
  const l=database.filter(d=>RUTAS[d.id]||subDe(d)==='sendero').sort((a,b)=>(!!RUTAS[b.id]-!!RUTAS[a.id])||(calificacionDe(b).prom-calificacionDe(a).prom)).slice(0,10);
  return carruselHTML('Rutas','Rutas y senderos',l,'senderos');
}
// Recién llegados: negocios aprobados en la nube, del más nuevo al más antiguo (esqueleto mientras carga la nube)
function seccionRecientesHTML(){
  const l=database.filter(d=>d.creado).sort((a,b)=>b.creado-a.creado).slice(0,10);
  return carruselHTML('Recientes','Recién llegados',l,'',!estado.nubeLista);
}
function enlazarSecciones(){
  $$('#cuerpo [data-ir]').forEach(b=>b.onclick=()=>{const k=b.dataset.ir;
    if(k==='abierto'){estado.filtros.abierto=true;render();}
    else if(k==='cercanos'){estado.filtros.orden='cercanos';navegar({tipo:'lista',cat:'todas',todo:true});}
    else if(k==='senderos')navegar({tipo:'lista',cat:'turismo',sub:'sendero'});
    else navegar({tipo:'lista',cat:k});});
}

/* ===== LISTADOS EN CUADRÍCULA DE 2 COLUMNAS (o mapa) ===== */
const POR_PAGINA=24;
function barraListaHTML(n){
  const o=estado.filtros.orden||'recomendados',vm=estado.vistaLista==='mapa';
  return '<div class="lista-barra"><div class="lb-orden" role="radiogroup" aria-label="Ordenar por">'
    +ORDENES.map(([k,t])=>'<button type="button" role="radio" aria-checked="'+(o===k)+'" class="chip-filtro'+(o===k?' on':'')+'" data-orden="'+k+'">'+t+'</button>').join('')+'</div>'
    +'<div class="lb-vista" role="radiogroup" aria-label="Vista"><button type="button" role="radio" aria-checked="'+!vm+'" class="'+(vm?'':'on')+'" data-vista="cuadricula" aria-label="Cuadrícula">'+icon('layout-grid',20)+'</button>'
    +'<button type="button" role="radio" aria-checked="'+vm+'" class="'+(vm?'on':'')+'" data-vista="mapa" aria-label="Mapa">'+icon('map',20)+'</button></div></div>';
}
function cuadriculaHTML(items,limite){
  return '<div class="grid-tc">'+items.slice(0,limite).map(tarjetaHTML).join('')+'</div>'
    +(items.length>limite?'<button class="btn btn-secundario btn-bloque mt-16" id="verMas">Ver más ('+(items.length-limite)+')</button>':'');
}
function enlazarListado(items){
  $$('#cuerpo [data-orden]').forEach(b=>b.onclick=async()=>{
    const k=b.dataset.orden;
    if(k==='cercanos'&&!estado.pos){const p=await pedirUbicacion();if(!p){toast('Activa tu ubicación para ordenar por cercanía');return;}}
    estado.filtros.orden=k;render(true);});
  $$('#cuerpo [data-vista]').forEach(b=>b.onclick=()=>{estado.vistaLista=b.dataset.vista;render(true);});
  const vm=$('#verMas');if(vm)vm.onclick=()=>{estado.limiteLista=(estado.limiteLista||POR_PAGINA)+POR_PAGINA;render(true);};
  if(estado.vistaLista==='mapa'&&$('#mapaLista'))mapaDeLista(items);
}
async function mapaDeLista(items){
  try{await cargarLeaflet();}catch(e){$('#mapaLista').innerHTML='<div class="mapa-off">'+icon('wifi-off',24)+'No se pudo cargar el mapa.</div>';return;}
  const caja=$('#mapaLista');if(!caja||mapaActivo)return;
  const m=L.map(caja).setView(PLAZA_FUSA,13);mapaActivo=m;capaBase().addTo(m);
  const con=items.filter(d=>d.lat&&d.lng),pts=[];
  con.forEach(d=>{pts.push([d.lat,d.lng]);L.marker([d.lat,d.lng],{icon:pinIcono(iconoDe(d),'pin-fc c-'+d.cat),title:d.nombre,alt:d.nombre}).addTo(m)
    .bindPopup('<b>'+esc(d.nombre)+'</b><br><small>'+esc(etiquetaDe(d))+'</small><br><button class="pop-ver" data-ver="'+esc(d.id)+'">Ver ficha</button>');});
  if(pts.length>1)m.fitBounds(pts,{padding:[24,24],maxZoom:16});else if(pts.length)m.setView(pts[0],16);
  m.on('popupopen',e=>{const b=e.popup.getElement().querySelector('[data-ver]');if(b)b.onclick=()=>abrirDetalle(b.dataset.ver);});
  setTimeout(()=>m.invalidateSize(),200);
}

/* ===== FICHA DEL LUGAR (RF-08 a RF-13, RF-20, RF-21) ===== */
// Solo comercios con dueño y Premium vigente: un cupón sin dueño nunca podría canjearse
function cuponesDe(d){
  if(!d.propietario_uid||!premiumVigente(d))return [];
  const hoy=Date.now();
  return estado.cuponesFS.filter(c=>c.comercio_id===d.id&&(c.estado||'activo')==='activo'&&(c.cupo_restante==null||c.cupo_restante>0))
    .filter(c=>{const v=aMs(c.vigencia);return !v||v>hoy;});
}
function filaDato(ic,etiqueta,valor){return '<div class="fila-dato">'+icon(ic)+'<div><small>'+etiqueta+'</small><span>'+valor+'</span></div></div>';}
/* ===== SENDEROS Y LUGARES NATURALES (v5 · Fase 2) =====
   Senderos, cerros, miradores y caminos no son comercios: sin abierto/cerrado, sin "Reclámalo", sin llamar ni WhatsApp.
   Trazados reales en rutas/{id}.geojson (150-300 puntos de un GPX real), listados en rutas/indice.json y cargados bajo demanda.
   Sin trazado real no hay "Ver ruta en 3D": se muestra "Trazado en preparación". */
const TIPOS_NATURALES=['sendero','mirador'];
const esNatural=d=>!!d&&d.cat==='turismo'&&(TIPOS_NATURALES.includes(d.tipo)||/\b(cerro|sendero|mirador|camino real|alto de)\b/i.test(d.nombre||''));
// Mejor hora para ir (solo donde hay dato confirmado)
const MEJOR_HORA={c21:'5:00 – 9:00 a. m.'};
// "Recom. 5–4 p.m." → "Recomendado: 5:00 a. m. – 4:00 p. m." (usa el mismo lector de horarios que calcula Abierto/Cerrado)
function formatearHorario(h){
  const rangos=parsearRangos(h||'');if(!rangos.length)return h||'';
  const i=(h.search(/\d/));let pre=i>0?h.slice(0,i).trim():'';
  pre=pre.replace(/^Recom\.?\s*/i,'');
  return (pre?pre+' ':'')+rangos.map(([s,e])=>horaTexto(s)+' – '+horaTexto(e)).join(', ');
}
let indiceRutas=null;
async function trazadoReal(id){
  try{
    if(!indiceRutas)indiceRutas=await fetch('rutas/indice.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({}));
    const info=indiceRutas[id];if(!info)return null;
    if(!info._coords){
      const g=await fetch('rutas/'+id+'.geojson').then(r=>r.json());
      const f=(g.features||[g]).find(x=>x.geometry&&x.geometry.type==='LineString');
      info._coords=f.geometry.coordinates.map(c=>[c[1],c[0],c[2]==null?null:c[2]]);   // [lat, lng, ele]
    }
    return info._coords.length>=150?info._coords:null;
  }catch(e){return null;}
}
// Vista previa pequeña del relieve en la ficha (MapLibre sin interacción); se elimina al cerrar la ficha
let mapaPrevia=null;
function quitarPreviaRelieve(){if(mapaPrevia){try{mapaPrevia.remove();}catch(e){}mapaPrevia=null;}}
async function previaRelieve(d,coords){
  const caja=$('#relievePrev');if(!caja||!estado.online||!soporta3D())return;
  try{await cargarMapLibre();}catch(e){return;}
  if(!document.body.contains(caja))return;
  quitarPreviaRelieve();
  const centro=coords?coords[Math.floor(coords.length/2)]:[d.lat,d.lng];
  mapaPrevia=new maplibregl.Map({container:caja,style:temaOscuro()?ESTILO_3D.oscuro:ESTILO_3D.claro,center:[centro[1],centro[0]],zoom:coords?13.6:14,pitch:62,bearing:-20,
    interactive:false,attributionControl:{compact:true},fadeDuration:0});
  mapaPrevia.on('load',()=>{
    try{agregarRelieve(mapaPrevia);}catch(e){}
    // En la vista previa los créditos van como texto debajo (el botón (i) del mapa queda recogido)
    const at=caja.querySelector('.maplibregl-ctrl-attrib');if(at)at.classList.remove('maplibregl-compact-show');
    if(coords){
      mapaPrevia.addSource('ruta',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords.map(c=>[c[1],c[0]])}}});
      mapaPrevia.addLayer({id:'ruta',type:'line',source:'ruta',paint:{'line-color':cssVar('--primary-500'),'line-width':4},layout:{'line-cap':'round','line-join':'round'}});
      const lim=coords.reduce((b,c)=>[[Math.min(b[0][0],c[1]),Math.min(b[0][1],c[0])],[Math.max(b[1][0],c[1]),Math.max(b[1][1],c[0])]],[[180,90],[-180,-90]]);
      mapaPrevia.fitBounds(lim,{padding:24,pitch:62,bearing:-20,duration:0});
    }
  });
}
// Para el admin: el trazado de un recorrido real grabado con la app, listo para guardar en rutas/{id}.geojson
function trazadoParaRutas(r){
  const p=r.puntos;if(p.length<2)return null;
  // Muestreo por distancia: entre 150 y 300 puntos repartidos a lo largo del camino
  const n=Math.min(300,Math.max(150,Math.min(p.length,300)));
  const acum=[0];for(let i=1;i<p.length;i++)acum.push(acum[i-1]+distanciaKm(p[i-1],p[i]));
  const total=acum[acum.length-1],sal=[];let j=0;
  for(let k=0;k<n;k++){const objetivo=total*k/(n-1);while(j<p.length-1&&acum[j+1]<objetivo)j++;
    const a=p[j],b=p[Math.min(j+1,p.length-1)],tr=(acum[Math.min(j+1,p.length-1)]-acum[j])||1,f=Math.min(1,Math.max(0,(objetivo-acum[j])/tr));
    const ele=a[2]!=null&&b[2]!=null?Math.round(a[2]+(b[2]-a[2])*f):(a[2]!=null?a[2]:null);
    sal.push([+(a[1]+(b[1]-a[1])*f).toFixed(6),+(a[0]+(b[0]-a[0])*f).toFixed(6)].concat(ele==null?[]:[ele]));}
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{ruta:r.rutaId,nombre:r.nombre,fuente:'Recorrido real grabado con Fusa Conecta',
    fecha:new Date(r.inicio).toISOString().slice(0,10),distancia_km:+total.toFixed(2),desnivel_m:r.desnivel||0,puntos:n},geometry:{type:'LineString',coordinates:sal}}]};
}
function abrirDetalle(id){
  const d=buscar(id);if(!d)return;
  // La ficha es una hoja sobre la pantalla actual: se cuenta como página sin cambiar la pantalla de fondo
  enviarAnalitica(()=>umami.track(p=>({...p,url:'/lugar/'+d.id,title:d.nombre+' · Fusa Conecta'})));
  registrarEvento(d,'vistas');
  const esFav=estado.favoritos.includes(String(d.id));
  const esDueno=logueado()&&d.propietario_uid&&d.propietario_uid===estado.usuario.uid;
  const cal=calificacionDe(d);const ap=estadoApertura(d);const km=distanciaA(d);
  const califs=estado.califs[d.id]||[];
  const premium=premiumVigente(d);
  const miCalif=logueado()?califs.find(c=>c.usuario_uid===estado.usuario.uid):null;
  const ruta=RUTAS[d.id];
  const cupones=cuponesDe(d);
  const natural=esNatural(d);

  const opiniones=califs.length===0
    ?'<p class="nota-c">Aún no hay opiniones. Sé el primero en calificar este lugar.</p>'
    :califs.map(c=>'<div class="opinion"><div class="op-head"><span class="op-user">'+esc(c.usuario_nombre||'Usuario')+'</span>'
      +'<span class="op-stars" aria-label="'+c.estrellas+' de 5 estrellas">'+estrellasFijas(c.estrellas)+'</span></div>'
      +(c.comentario?'<p class="op-text">'+esc(c.comentario)+'</p>':'')
      +'<span class="op-fecha">'+fechaCorta(aMs(c.fecha))+(c.fueEditada?' · editada':'')+' · <button class="enlace-discreto" data-rep="'+esc(c._id)+'">Reportar</button></span></div>').join('');
  const formCalif=logueado()
    ?'<div class="star-sel" id="starSel" role="radiogroup" aria-label="Tu calificación">'+[1,2,3,4,5].map(n=>'<button data-n="'+n+'" role="radio" aria-label="'+n+(n===1?' estrella':' estrellas')+'">'+icon('star',28)+'</button>').join('')+'</div>'
      +'<div class="campo"><label for="ratingTxt">Tu opinión (opcional)</label><textarea id="ratingTxt" maxlength="500" placeholder="Cuéntanos tu experiencia...">'+esc(miCalif?miCalif.comentario:'')+'</textarea></div>'
      +'<button class="btn btn-tonal btn-bloque" id="bCalificar">'+(miCalif?'Actualizar mi calificación':'Enviar calificación')+'</button>'
    :'<button class="btn btn-secundario btn-bloque" id="bLoginCalif">Inicia sesión para calificar</button>';

  const redes=premium?Object.entries(d.redesSociales||{}).filter(([k,u])=>u&&/^https:\/\//.test(u)).slice(0,5):[];
  const webOk=d.sitioWeb&&/^https:\/\//.test(d.sitioWeb);
  const bloquePremium=premium&&(redes.length||webOk)
    ?'<div class="bloque bloque-premium"><p class="bloque-tit">'+icon('globe',18)+'Redes y sitio web</p>'
      +(redes.length?'<div class="redes">'+redes.map(([k,u])=>'<a href="'+esc(u)+'" target="_blank" rel="noopener" class="btn btn-secundario btn-sm">'+icon(RED_IC[k]||'link',18)+(RED_TXT[k]||esc(k))+'</a>').join('')+'</div>':'')
      +(webOk?'<a class="btn btn-secundario btn-bloque" href="'+esc(d.sitioWeb)+'" target="_blank" rel="noopener">'+icon('globe')+'Visitar sitio web'+icon('external-link',16)+'</a>':'')
      +'</div>':'';
  const bloqueCupones=cupones.length
    ?'<div class="bloque-tickets"><p class="bloque-tit">'+icon('ticket',18)+'Cupones disponibles</p>'
      +cupones.map(c=>ticketHTML({icono:ICONO_TIPO_CUPON[c.tipo],titulo:c.descripcion,detalle:esc(detalleCupon(c))+(c.terminos?'<br>'+esc(c.terminos):''),
        accion:yaTengoCupon(c.id)?'<button class="btn btn-secundario btn-sm" data-cupon="'+esc(c.id)+'">'+icon('wallet',18)+'Ver en mi billetera</button>'
          :'<button class="btn btn-tonal btn-sm" data-cupon="'+esc(c.id)+'">Obtener cupón</button>'})).join('')
      +'</div>':'';
  const chips=[];
  if(d.cat==='turismo'&&d.tipo)chips.push([ICONO_SUB[d.tipo]||'mountain',nombreSub('turismo',d.tipo)||d.tipo]);
  if(d.nivelDificultad)chips.push(['footprints','Dificultad '+d.nivelDificultad.toLowerCase()]);
  if(ruta){chips.push(['route',String(ruta.distanciaTotal).replace('.',',')+' km']);chips.push(['clock',ruta.duracionEstimada]);}
  if(es24h(d))chips.push(['clock','Abierto 24 horas']);
  chips.push(['map-pin',d.municipio||'Fusagasugá']);
  const chipsHTML='<div class="chips-car">'+chips.map(([i,t])=>'<span class="chip-car">'+icon(i,16)+esc(t)+'</span>').join('')+'</div>';
  const destinoMapa=(d.lat&&d.lng&&!d.ubicacion_aprox)?d.lat+','+d.lng:d.direccion+', Fusagasugá, Cundinamarca';
  const embed='https://maps.google.com/maps?q='+encodeURIComponent(destinoMapa)+'&z='+(d.ubicacion_aprox?14:16)+'&output=embed';
  const llegar='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destinoMapa);
  const mapaHTML=estado.online
    ?'<div class="mapa-wrap"><iframe src="'+embed+'" allowfullscreen loading="lazy" title="Mapa de '+esc(d.nombre)+'"></iframe></div>'
    :'<div class="mapa-off">'+icon('wifi-off',24)+'El mapa no está disponible sin conexión. La dirección sigue disponible arriba.</div>';

  const html='<div class="grab"></div>'
    +fotoHTML(d,'det-hero')+galeriaFichaHTML(d)
    +'<span class="pill-cat">'+icon(iconoDe(d),14)+esc(etiquetaDe(d))+'</span>'
    +badgeDestacado(d)
    +'<div class="det-top-acc">'
    +'<button class="btn-redondo" id="detShare" aria-label="Compartir '+esc(d.nombre)+'">'+icon('share-2')+'</button>'
    +'<button class="btn-redondo'+(esFav?' on':'')+'" id="detFav" aria-pressed="'+esFav+'" aria-label="'+(esFav?'Quitar de favoritos':'Guardar en favoritos')+'">'+icon('heart')+'</button>'
    +'<button class="btn-redondo" id="cerrarDet" aria-label="Cerrar ficha">'+icon('x')+'</button>'
    +'</div></div>'
    +'<div class="det-body">'
    +'<h2>'+esc(d.nombre)+'</h2>'
    +'<div class="meta">'+[califHTML(cal),estadoHTML(ap,d.id)].filter(Boolean).join(PTO)+'</div>'
    +chipsHTML
    +'<p class="det-desc">'+esc(d.desc)+'</p>'
    +'<div class="datos">'
    +filaDato('map-pin','Dirección',esc(d.direccion)+(km!=null?' · a '+fmtDist(km)+' de ti':''))
    +(natural&&MEJOR_HORA[d.id]?filaDato('sun','Mejor hora',esc(MEJOR_HORA[d.id])):'')
    +filaDato('clock',natural?'Horario recomendado':'Horario',esc(horarioTexto(d)))
    +(natural?'':filaDato('phone','Contacto',esc(d.tel)))
    +'</div>'
    +(natural?'<div class="bloque-natural"><p class="bloque-tit">'+icon('mountain',18)+'Relieve</p>'
      +(estado.online?'<div class="relieve-prev" id="relievePrev" role="img" aria-label="Vista previa del relieve de '+esc(d.nombre)+'"></div>'
        +'<p class="relieve-cred">Mapa: OpenFreeMap · © OpenStreetMap · Relieve: Mapzen / AWS</p>':'')
      +'<div id="detTrazado"><p class="trazado-prep" role="status">'+icon('loader-circle',16,'gira')+'Buscando el trazado…</p></div>'
      +(ruta?'<button class="btn btn-secundario btn-bloque mt-16" id="detRuta">'+icon('footprints')+'Grabar mi recorrido</button>':'')+'</div>'
      :(ruta?'<button class="btn btn-secundario btn-bloque btn-ruta" id="detRuta">'+icon('route')+'Iniciar navegación guiada</button>':''))
    +bloqueCupones+bloquePremium
    +'<p class="mapa-label">'+icon('map',18)+'Ubicación'+(d.ubicacion_aprox?' aproximada del sector':'')+'</p>'
    +mapaHTML
    +(esDueno?'<button class="btn btn-secundario btn-bloque mt-16" id="btnEditar">'+icon('pencil')+'Editar mi comercio</button>'
      :esAdmin()?'<button class="btn btn-secundario btn-bloque mt-16" id="btnEditar">'+icon('shield-check')+'Editar ficha (administración)</button>':'')
    +'<div class="seccion-det"><h3>Calificaciones'+(califs.length?' ('+califs.length+')':'')+'</h3>'
    +formCalif+'<div class="opiniones">'+opiniones+'</div></div>'
    +'<div class="det-pie">'+(!d.propietario_uid&&!natural?'<button class="btn btn-ghost" id="bReclamar">'+icon('store',18)+'¿Es tu negocio? Reclámalo</button>':'')
    +'<button class="enlace-discreto" id="bReportar">'+icon('flag',14)+'Reportar un problema</button></div>'
    +'</div>'
    +'<div class="det-acc-fija">'
    +(natural
      ?'<a class="btn btn-primario" id="detLlegar" href="'+llegar+'" target="_blank" rel="noopener">'+icon('navigation')+'Cómo llegar al inicio</a>'
        +'<button class="btn btn-secundario" id="detCompartir">'+icon('share-2')+'Compartir</button>'
      :'<a class="btn btn-primario" data-tel="'+esc(d.id)+'" href="tel:'+esc(d.tel)+'" aria-label="Llamar a '+esc(d.nombre)+'">'+icon('phone')+'Llamar</a>'
        +'<button class="btn btn-wa-ficha" id="detWa" aria-label="Escribir por WhatsApp a '+esc(d.nombre)+'">'+icon('whatsapp',22)+'WhatsApp</button>'
        +'<a class="btn btn-secundario" href="'+llegar+'" target="_blank" rel="noopener">'+icon('navigation')+'Cómo llegar</a>')
    +'</div>';

  $('#sheetDetalle').innerHTML=html;
  $('#sheetDetalle').setAttribute('aria-label','Ficha de '+d.nombre);
  $('#sheetDetalle').scrollTop=0;
  abrir('ovDetalle');
  enlazarGaleriaFicha(d);
  $('#cerrarDet').onclick=()=>{quitarPreviaRelieve();cerrar('ovDetalle');};
  const dw=$('#detWa');if(dw)dw.onclick=()=>abrirWhatsApp(d);
  const dc=$('#detCompartir');if(dc)dc.onclick=()=>compartir(d.nombre,'/lugar/'+d.id);
  if(natural){
    // Trazado real: "Ver ruta en 3D" (y "Cómo llegar al inicio" va al primer punto del trazado); sin él, "Trazado en preparación"
    trazadoReal(d.id).then(coords=>{
      const t=$('#detTrazado');if(!t||!$('#ovDetalle').classList.contains('abierto'))return;
      if(coords){
        t.innerHTML='<button class="btn btn-primario btn-bloque" id="det3D">'+icon('mountain',18)+'Ver ruta en 3D</button>';
        $('#det3D').onclick=()=>abrir3D({titulo:d.nombre,linea:coords.map(c=>[c[0],c[1]])});
        const ll=$('#detLlegar');if(ll)ll.href='https://www.google.com/maps/dir/?api=1&destination='+coords[0][0]+','+coords[0][1];
      }else t.innerHTML='<p class="trazado-prep" role="status">'+icon('route',16)+'Trazado en preparación. Pronto podrás ver la ruta en 3D.</p>';
      previaRelieve(d,coords);
    });
  }
  $('#detShare').onclick=()=>compartir(d.nombre,'/lugar/'+d.id);
  $('#detFav').onclick=()=>{if(toggleFavorito(d.id)){const on=estado.favoritos.includes(String(d.id));$('#detFav').classList.toggle('on',on);$('#detFav').setAttribute('aria-pressed',on);}};
  if(ruta)$('#detRuta').onclick=()=>{cerrar('ovDetalle');navegar({tipo:'ruta',id:d.id});};
  $$('#sheetDetalle [data-cupon]').forEach(b=>b.onclick=()=>generarCupon(d,cupones.find(c=>c.id===b.dataset.cupon),b));
  const be=$('#btnEditar');if(be)be.onclick=()=>{cerrar('ovDetalle');abrirFormComercio(d);};
  const br=$('#bReclamar');if(br)br.onclick=()=>{cerrar('ovDetalle');reclamarNegocio(d);};
  $('#bReportar').onclick=()=>{cerrar('ovDetalle');reportar(d);};
  $$('#sheetDetalle [data-rep]').forEach(b=>b.onclick=()=>{cerrar('ovDetalle');reportar(d,califs.find(c=>c._id===b.dataset.rep));});
  if(!logueado()){$('#bLoginCalif').onclick=()=>pedirLogin('Inicia sesión para calificar y comentar.');return;}
  let val=miCalif?miCalif.estrellas:0;
  const stars=$$('#starSel button');
  const pintar=n=>stars.forEach((s,i)=>{s.classList.toggle('on',i<n);s.setAttribute('aria-checked',i+1===val);});
  pintar(val);
  stars.forEach(s=>{
    s.onclick=()=>{val=+s.dataset.n;pintar(val);};
    s.onmouseenter=()=>pintar(+s.dataset.n);s.onmouseleave=()=>pintar(val);
  });
  $('#bCalificar').onclick=()=>enviarCalificacion(d,val,$('#ratingTxt').value.trim(),!!miCalif);
}

/* ===== CALIFICACIONES (RF-12): una por usuario, se actualiza si vuelve a calificar ===== */
async function enviarCalificacion(d,estrellasSel,comentario,editada){
  if(!estrellasSel){toast('Selecciona de 1 a 5 estrellas');return;}
  if(!estado.online){toast('Necesitas conexión a internet para calificar');return;}
  const uid=estado.usuario.uid;const btn=$('#bCalificar');btn.disabled=true;btn.textContent='Enviando...';
  try{
    await db.collection('calificaciones').doc(d.id+'_'+uid).set({
      comercio_id:String(d.id),usuario_uid:uid,usuario_nombre:estado.usuario.nombre,estrellas:estrellasSel,
      comentario:comentario.slice(0,500),fecha:FV.serverTimestamp(),fueEditada:editada,estado_moderacion:'publicado'
    });
    toast(editada?'Actualizamos tu calificación':'Gracias por tu calificación');
    setTimeout(()=>abrirDetalle(d.id),400);
  }catch(e){console.error(e);toast('No se pudo guardar la calificación. Intenta de nuevo.');btn.disabled=false;btn.textContent='Enviar calificación';}
}

/* ===== CUPONES CON QR (RF-11, Fase 3) ===== */
// Librería de QR copiada en lib/: la billetera funciona sin conexión
async function pintarQR(el,texto,tam){
  try{
    await cargarScript('lib/qrcode.min.js');
    el.innerHTML='';
    new QRCode(el,{text:texto,width:tam,height:tam,colorDark:cssVar('--tinta-fija'),colorLight:cssVar('--blanco'),correctLevel:QRCode.CorrectLevel.M});
    return true;
  }catch(e){return false;}
}
// Chrome solo permite vibrar después de que la persona tocó la pantalla
function vibrar(ms=30){try{if(navigator.vibrate&&(!navigator.userActivation||navigator.userActivation.hasBeenActive))navigator.vibrate(ms);}catch(e){}}
function sinMovimiento(){return !!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);}
function codigoCupon(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';const r=crypto.getRandomValues(new Uint8Array(8));r.forEach(n=>s+=a[n%a.length]);return 'FC-'+s.slice(0,4)+'-'+s.slice(4);}
function cuponesLocales(){return ls.get('fc_cupones_'+(estado.usuario?estado.usuario.uid:''),[]);}
function guardarCuponLocal(c){const l=cuponesLocales().filter(x=>x.id!==c.id);l.unshift(c);ls.set('fc_cupones_'+estado.usuario.uid,l.slice(0,30));}
function cuponesActivos(){return logueado()?cuponesLocales().filter(c=>estadoCupon(c)==='activo').length:0;}
function yaTengoCupon(cuponId){return logueado()&&cuponesLocales().some(c=>c.id===cuponId+'_'+estado.usuario.uid);}
// Días en que aplica un cupón (vacío = todos los días)
function diasTexto(dias){return dias&&dias.length&&dias.length<7?dias.slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(i=>DIAS_TXT[i]).join(', '):'';}
function venceEn(ms){
  if(!ms)return '';
  const h=Math.floor((ms-Date.now())/3600000);
  if(h<0)return 'Vencido';
  if(h<1)return 'Vence en menos de 1 hora';
  if(h<24)return 'Vence en '+h+(h===1?' hora':' horas');
  const d=Math.floor(h/24);return 'Vence en '+d+(d===1?' día':' días');
}
// "12 oct a las 3:40 p. m."
function fechaConHora(ms){
  if(!ms)return '';const t=new Date(ms);
  return t.getDate()+' '+t.toLocaleDateString('es-CO',{month:'short'}).replace('.','')+' a las '+formatearHora(t.getHours()+':'+t.getMinutes());
}
// "Ana María Gómez" -> "Ana M."
function nombreCorto(n){const p=String(n||'Cliente').trim().split(/\s+/);return p[0]+(p[1]?' '+p[1].charAt(0).toUpperCase()+'.':'');}

// Ticket amarillo con borde troquelado: el mismo en la ficha, el inicio, la vista previa y la billetera
function ticketHTML(t){
  return '<div class="ticket'+(t.clase?' '+t.clase:'')+'"'+(t.attrs||'')+'><div class="ticket-lado">'+icon(t.icono||'ticket',24)+'</div>'
    +'<div class="ticket-cuerpo">'+(t.comercio?'<small class="ticket-com">'+esc(t.comercio)+'</small>':'')
    +'<b class="ticket-tit">'+esc(t.titulo)+'</b>'
    +(t.detalle?'<span class="ticket-det">'+t.detalle+'</span>':'')
    +(t.accion||'')+'</div></div>';
}
const ICONO_TIPO_CUPON={descuento:'percent','2x1':'ticket',regalo:'gift',precio:'tag'};
function detalleCupon(c){
  const dias=diasTexto(c.dias);
  return 'Vence el '+fechaCorta(aMs(c.vigencia))+(c.cupo_restante!=null?' · quedan '+c.cupo_restante:'')+(dias?' · '+dias:'');
}

// Obtener un cupón (transacción): verifica estado, vigencia y cupo; un cupón por persona (id {cuponId}_{uid});
// descuenta 1 al cupo y crea el canje "reservado". Las reglas exigen ambas escrituras juntas.
async function generarCupon(d,cupon,boton){
  if(!cupon)return;
  if(!logueado()){pedirLogin('Inicia sesión para obtener cupones de descuento.');return;}
  const uid=estado.usuario.uid;const id=cupon.id+'_'+uid;
  const local=cuponesLocales().find(c=>c.id===id);
  if(local){cerrar('ovDetalle');irABilletera();return;}
  if(!estado.online){toast('Necesitas conexión para obtener un cupón nuevo');return;}
  if(boton){boton.disabled=true;boton.textContent='Guardando…';}
  const cuponRef=db.collection('cupones').doc(cupon.id),canjeRef=db.collection('canjes').doc(id);
  try{
    const r=await db.runTransaction(async tx=>{
      const cs=await tx.get(cuponRef);const ks=await tx.get(canjeRef);
      if(ks.exists)return {ya:true,datos:ks.data()};
      if(!cs.exists)throw new Error('no-existe');
      const c=cs.data();
      if((c.estado||'activo')!=='activo')throw new Error('inactivo');
      const vig=aMs(c.vigencia);if(vig&&vig<Date.now())throw new Error('vencido');
      if(!(c.cupo_restante>0))throw new Error('agotado');
      const datos={cupon_id:cupon.id,comercio_id:c.comercio_id,comercio_nombre:c.comercio_nombre||d.nombre,descripcion:c.descripcion,
        tipo:c.tipo||'',terminos:c.terminos||'',dias:c.dias||null,
        propietario_uid:c.propietario_uid,usuario_uid:uid,usuario_nombre:estado.usuario.nombre,codigo:codigoCupon(),
        estado:'reservado',fecha_emision:FV.serverTimestamp(),fecha_vencimiento:TS.fromMillis(vig||Date.now()+30*86400000)};
      tx.update(cuponRef,{cupo_restante:c.cupo_restante-1});
      tx.set(canjeRef,datos);
      return {ya:false,datos};
    });
    guardarCuponLocal(serializarCupon({id,...r.datos,fecha_emision:Date.now()}));
    if(!r.ya){registrarEvento(d,'cupones_obtenidos');medir('cupon_obtenido',{comercio:d.nombre});}
    vibrar(30);
    if(boton){
      volarABilletera(boton);
      boton.disabled=false;boton.className='btn btn-secundario btn-sm';boton.innerHTML=icon('wallet',18)+'Ver en mi billetera';
      boton.onclick=()=>{cerrar('ovDetalle');irABilletera();};
    }
    actualizarBilletera();
    toast(r.ya?'Ya tienes este cupón':'Cupón guardado en tu billetera');
  }catch(e){
    console.warn(e);
    if(boton){boton.disabled=false;boton.textContent='Obtener cupón';}
    const m={agotado:'Este cupón ya se agotó',vencido:'Este cupón ya venció',inactivo:'Este cupón no está disponible por ahora','no-existe':'Este cupón ya no existe'};
    toast(m[e.message]||'No se pudo obtener el cupón. Intenta de nuevo.');
  }
}
// Animación: el ticket se desliza desde el botón hasta la billetera de la cabecera
function volarABilletera(desde){
  if(sinMovimiento()||!desde.animate)return;
  const destino=$('.bn-fab');
  if(!destino)return;
  const a=desde.getBoundingClientRect(),b=destino.getBoundingClientRect();
  const v=document.createElement('div');v.className='ticket-vuelo';v.innerHTML=icon('ticket',22);
  v.style.left=(a.left+a.width/2-28)+'px';v.style.top=(a.top+a.height/2-20)+'px';
  document.body.appendChild(v);
  const dx=b.left+b.width/2-(a.left+a.width/2),dy=b.top+b.height/2-(a.top+a.height/2);
  v.animate([{transform:'translate(0,0) rotate(0) scale(1)',opacity:1},{transform:'translate('+dx*.4+'px,'+(dy*.4-60)+'px) rotate(-12deg) scale(.9)',opacity:1,offset:.45},{transform:'translate('+dx+'px,'+dy+'px) rotate(-20deg) scale(.3)',opacity:.4}],
    {duration:750,easing:'cubic-bezier(.45,0,.55,1)'}).onfinish=()=>{v.remove();destino.classList.add('pulso');setTimeout(()=>destino.classList.remove('pulso'),450);};
}
function serializarCupon(c){
  return {id:c.id,cupon_id:c.cupon_id||'',comercio_id:c.comercio_id,codigo:c.codigo,descripcion:c.descripcion,comercio_nombre:c.comercio_nombre,
    tipo:c.tipo||'',terminos:c.terminos||'',dias:c.dias||null,estado:c.estado,
    fecha_vencimiento:aMs(c.fecha_vencimiento),fecha_canje:aMs(c.fecha_canje),fecha_emision:aMs(c.fecha_emision)};
}
function estadoCupon(c){if(c.estado==='usado')return 'usado';if(c.fecha_vencimiento&&c.fecha_vencimiento<Date.now())return 'vencido';return 'activo';}
function fechaHora(ms){return ms?new Date(ms).toLocaleString('es-CO',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';}
function comoLlegarURL(comercioId,nombre){
  const d=buscar(comercioId);
  const destino=d?((d.lat&&d.lng&&!d.ubicacion_aprox)?d.lat+','+d.lng:d.direccion+', Fusagasugá, Cundinamarca'):(nombre||'')+', Fusagasugá';
  return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destino);
}

/* ---------- Mostrar en caja: pantalla blanca completa, QR de 240 px ---------- */
let bloqueoPantalla=null;
async function mostrarCupon(c){
  if(!c)return;
  const est=estadoCupon(c);
  $('#pantallaCupon').innerHTML='<button class="btn-redondo cerrar" id="pcCerrar" aria-label="Cerrar">'+icon('x')+'</button>'
    +'<div class="pc-centro">'
    +'<p class="pc-com">'+esc(c.comercio_nombre)+'</p><h2 class="pc-tit">'+esc(c.descripcion)+'</h2>'
    +'<div class="pc-qr'+(est!=='activo'?' apagado':'')+'" id="pcQR" role="img" aria-label="Código QR del cupón '+esc(c.codigo)+'"></div>'
    +'<div class="codigo">'+esc(c.codigo)+'</div>'
    +(est==='activo'
      ?'<p class="pc-instr">'+icon('scan-line',20)+'Muéstrale este código al vendedor</p><p class="pc-vence">'+venceEn(c.fecha_vencimiento)+(diasTexto(c.dias)?' · Válido: '+diasTexto(c.dias):'')+'</p>'
      :'<p class="pc-instr apagado">'+(est==='usado'?'Este cupón ya fue canjeado'+(c.fecha_canje?' el '+fechaConHora(c.fecha_canje):''):'Este cupón está vencido')+'</p>')
    +(c.terminos?'<p class="pc-vence">'+esc(c.terminos)+'</p>':'')
    +'</div>';
  abrir('ovCupon');
  $('#pcCerrar').onclick=()=>cerrar('ovCupon');
  if(!await pintarQR($('#pcQR'),'FUSACONECTA:'+c.codigo,240))$('#pcQR').innerHTML='<p class="nota">Muestra el código escrito.</p>';
  // Mantiene la pantalla encendida mientras el vendedor escanea
  try{if(est==='activo'&&navigator.wakeLock)bloqueoPantalla=await navigator.wakeLock.request('screen');}catch(e){}
}
alCerrar.ovCupon=()=>{if(bloqueoPantalla){bloqueoPantalla.release().catch(()=>{});bloqueoPantalla=null;}};

/* ---------- Billetera "Mis cupones": Activos, Usados y Vencidos ---------- */
function irABilletera(){
  if(!logueado()){pedirLogin('Inicia sesión para ver tus cupones.');return;}
  if(vistaActual().tipo!=='billetera')navegar({tipo:'billetera'});
}
function pintarGloboCupones(){
  const n=cuponesActivos(),b=$('#bnBadge');
  b.hidden=!n;b.textContent=n>9?'9+':n;
  $('.bn-centro').setAttribute('aria-label','Cupones'+(n?': '+n+(n===1?' activo':' activos'):''));
}
function actualizarBilletera(){
  pintarGloboCupones();
  if(vistaActual().tipo==='billetera')render(true);
}
function renderBilletera(){
  const cuerpo=$('#cuerpo');
  if(!logueado()){
    cuerpo.innerHTML='<div class="vista"><div class="vacio">'+icon('wallet',48)+'<b>Tus cupones viven aquí</b><p>Inicia sesión para guardar cupones y mostrarlos en caja, incluso sin conexión.</p><button class="btn btn-primario mt-16" id="bwEntrar">Iniciar sesión</button></div></div>'+footerHTML();
    $('#bwEntrar').onclick=()=>abrirLogin('ingresar');enlazarFooter();return;
  }
  const todos=cuponesLocales();
  const grupos={activo:[],usado:[],vencido:[]};
  todos.forEach(c=>grupos[estadoCupon(c)].push(c));
  grupos.activo.sort((a,b)=>(a.fecha_vencimiento||0)-(b.fecha_vencimiento||0));
  grupos.usado.sort((a,b)=>(b.fecha_canje||0)-(a.fecha_canje||0));
  const tab=estado.tabBilletera||'activo';
  const tabs=[['activo','Activos'],['usado','Usados'],['vencido','Vencidos']];
  const lista=grupos[tab];
  const vacio={activo:['ticket','No tienes cupones activos','Busca los lugares con cupón y guárdalos aquí.'],
    usado:['badge-check','Aún no has usado cupones','Cuando el vendedor escanee un cupón, aparecerá aquí.'],
    vencido:['hourglass','No tienes cupones vencidos','Los cupones que no alcances a usar aparecerán aquí.']}[tab];
  cuerpo.innerHTML='<div class="vista"><div class="head-v"><h2>Mis cupones</h2><button class="btn-ghost" id="bwMas">'+icon('plus',18)+'Más cupones</button></div>'
    +'<p class="conteo izq">'+(estado.online?'':icon('wifi-off',14)+' ')+'Disponibles sin conexión</p>'
    +'<div class="adm-tabs" role="tablist" aria-label="Estado de los cupones">'+tabs.map(([k,t])=>'<button role="tab" aria-selected="'+(tab===k)+'" class="'+(tab===k?'on':'')+'" data-wtab="'+k+'">'+t+(grupos[k].length?' <span class="contador gris">'+grupos[k].length+'</span>':'')+'</button>').join('')+'</div>'
    +(lista.length?'<div class="billetera">'+lista.map(c=>{
        const est=estadoCupon(c);
        return '<article class="cupon-bill '+est+'"><div class="cb-cab"><span class="cb-ic">'+icon(ICONO_TIPO_CUPON[c.tipo]||'ticket',22)+'</span><div><small>'+esc(c.comercio_nombre)+'</small><b>'+esc(c.descripcion)+'</b></div></div>'
          +'<button class="cb-qr" data-mostrar="'+esc(c.id)+'" aria-label="Mostrar el cupón '+esc(c.codigo)+' en pantalla completa"><span class="cb-qr-img" data-qr="'+esc(c.codigo)+'"></span></button>'
          +'<div class="codigo">'+esc(c.codigo)+'</div>'
          +'<p class="cb-estado">'+(est==='activo'?icon('clock',16)+venceEn(c.fecha_vencimiento)+(diasTexto(c.dias)?' · '+diasTexto(c.dias):'')
            :est==='usado'?icon('badge-check',16)+'Canjeado'+(c.fecha_canje?' el '+fechaConHora(c.fecha_canje):'')
            :icon('hourglass',16)+'Venció el '+fechaCorta(c.fecha_vencimiento))+'</p>'
          +(est==='activo'?'<div class="cb-acc"><button class="btn btn-tonal" data-mostrar="'+esc(c.id)+'">'+icon('scan-line')+'Mostrar en caja</button>'
            +'<a class="btn btn-secundario" href="'+comoLlegarURL(c.comercio_id,c.comercio_nombre)+'" target="_blank" rel="noopener">'+icon('navigation')+'Cómo llegar</a></div>':'')
          +'</article>';
      }).join('')+'</div>'
      :'<div class="vacio">'+icon(vacio[0],48)+'<b>'+vacio[1]+'</b><p>'+vacio[2]+'</p>'+(tab==='activo'?'<button class="btn btn-primario mt-16" id="bwBuscar">'+icon('ticket')+'Ver lugares con cupón</button>':'')+'</div>')
    +'</div>'+footerHTML();
  $$('[data-wtab]').forEach(b=>b.onclick=()=>{estado.tabBilletera=b.dataset.wtab;render();});
  $$('[data-mostrar]').forEach(b=>b.onclick=()=>mostrarCupon(todos.find(c=>c.id===b.dataset.mostrar)));
  const bb=$('#bwBuscar');if(bb)bb.onclick=()=>navegar({tipo:'cupones'});
  $('#bwMas').onclick=()=>navegar({tipo:'cupones'});
  $$('[data-qr]').forEach(el=>pintarQR(el,'FUSACONECTA:'+el.dataset.qr,160));
  enlazarFooter();
  sincronizarCupones();
}

/* ---------- Cupones disponibles (botón central sin sesión) ---------- */
function renderCuponesDisponibles(){
  const l=[];database.forEach(d=>cuponesDe(d).forEach(c=>l.push({d,c})));
  l.sort((a,b)=>(aMs(a.c.vigencia)||0)-(aMs(b.c.vigencia)||0));
  $('#cuerpo').innerHTML='<div class="vista"><div class="head-v"><h2>Cupones</h2><span class="conteo">'+l.length+(l.length===1?' disponible':' disponibles')+'</span></div>'
    +(logueado()?'':'<div class="aviso-suave">'+icon('wallet',20)+'<span>Inicia sesión para guardar cupones en tu billetera y mostrarlos en caja, incluso sin conexión.</span><button class="btn btn-tonal btn-sm" id="bcEntrar">Entrar</button></div>')
    +(l.length?'<div class="lista-tickets">'+l.map(({d,c})=>ticketHTML({icono:ICONO_TIPO_CUPON[c.tipo],comercio:d.nombre,titulo:c.descripcion,detalle:esc(detalleCupon(c)),
        accion:'<div class="ticket-acc"><button class="btn btn-tonal btn-sm" data-obtener="'+esc(c.id)+'" data-com="'+esc(d.id)+'">'+(yaTengoCupon(c.id)?icon('wallet',18)+'Ver en mi billetera':'Obtener cupón')+'</button>'
          +'<button class="btn btn-ghost" data-vercom="'+esc(d.id)+'">Ver lugar</button></div>'})).join('')+'</div>'
      :'<div class="vacio">'+icon('ticket',48)+'<b>Aún no hay cupones activos</b><p>Los comercios destacados publican cupones nuevos cada semana.</p></div>')
    +'</div>'+footerHTML();
  const be=$('#bcEntrar');if(be)be.onclick=()=>abrirLogin('ingresar',false,'Inicia sesión para guardar tus cupones.');
  $$('[data-obtener]').forEach(b=>b.onclick=()=>{const d=buscar(b.dataset.com);generarCupon(d,cuponesDe(d).find(c=>c.id===b.dataset.obtener),b);});
  $$('[data-vercom]').forEach(b=>b.onclick=()=>abrirDetalle(b.dataset.vercom));
  enlazarFooter();
}

/* ---------- "Cupones de la semana" en el inicio ---------- */
function cuponesDeLaSemana(){
  const l=[];
  database.forEach(d=>cuponesDe(d).forEach(c=>l.push({d,c})));
  return l.sort((a,b)=>(aMs(b.c.fecha_creacion)||0)-(aMs(a.c.fecha_creacion)||0)).slice(0,10);
}
function seccionCuponesHTML(){
  const l=cuponesDeLaSemana();if(!l.length)return '';
  return '<section class="cupones-semana" aria-labelledby="tCupSem"><div class="head-v"><h2 id="tCupSem">Cupones de la semana</h2><button class="btn-ghost" id="bConCupon">Ver todos</button></div>'
    +'<div class="carrusel">'+l.map(({d,c})=>ticketHTML({clase:'ticket-mini',attrs:' role="button" tabindex="0" data-ver-cupon="'+esc(d.id)+'"',
      icono:ICONO_TIPO_CUPON[c.tipo],comercio:d.nombre,titulo:c.descripcion,detalle:esc(detalleCupon(c))})).join('')+'</div></section>';
}
function enlazarCuponesSemana(){
  $$('[data-ver-cupon]').forEach(t=>{
    const ir=()=>abrirDetalle(t.dataset.verCupon);
    t.onclick=ir;t.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ir();}};
  });
  const b=$('#bConCupon');if(b)b.onclick=()=>{estado.filtros.cupon=true;render();};
}

/* ---------- El comerciante CREA el cupón: asistente de 3 pasos ---------- */
const PLANTILLAS_CUPON=[
  {k:'descuento',t:'% de descuento',ic:'percent',texto:'15% de descuento en tu compra'},
  {k:'2x1',t:'2×1',ic:'ticket',texto:'2×1 en tu producto favorito'},
  {k:'regalo',t:'Regalo con tu compra',ic:'gift',texto:'Un regalo sorpresa con tu compra'},
  {k:'precio',t:'Precio especial',ic:'tag',texto:'Precio especial para clientes de Fusa Conecta'}
];
const VIGENCIAS=[['1s','1 semana',7],['2s','2 semanas',14],['1m','1 mes',30],['fecha','Elegir fecha',0]];
let cw=null;
function isoLocal(ms){const t=new Date(ms);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');}
function vigenciaCW(){const v=VIGENCIAS.find(x=>x[0]===cw.vig);return v[2]?isoLocal(Date.now()+v[2]*86400000):cw.fecha;}
function formCupon(d){
  cw={d,paso:1,tipo:'descuento',texto:PLANTILLAS_CUPON[0].texto,pct:15,cupo:50,vig:'1m',fecha:isoLocal(Date.now()+30*86400000),dias:[],terminos:''};
  pintarCuponWiz();abrir('ovForm');
}
function guardarCuponWiz(){
  const v=id=>{const el=$('#'+id);return el?el.value.trim():null;};
  if($('#cwTexto'))cw.texto=v('cwTexto');
  if($('#cwCupo'))cw.cupo=Math.max(1,Math.min(1000,parseInt(v('cwCupo'),10)||1));
  if($('#cwFecha'))cw.fecha=v('cwFecha');
  if($('#cwTer'))cw.terminos=v('cwTer');
}
function validarCuponWiz(){
  if(cw.paso===1&&cw.texto.length<4)return 'Escribe el beneficio del cupón';
  if(cw.paso===2){
    const f=vigenciaCW();
    if(!f||aMs(f)<Date.now())return 'Elige una fecha de vencimiento futura';
    if(aMs(f)>Date.now()+366*86400000)return 'El cupón puede durar máximo un año';
  }
  return '';
}
function pintarCuponWiz(){
  const p=cw.paso,PASOS=['Tipo de beneficio','Reglas','Vista previa'];
  let cuerpo='';
  if(p===1){
    cuerpo='<p class="lbl">¿Qué le vas a ofrecer a tus clientes?</p><div class="tiles tiles-cupon" role="radiogroup" aria-label="Tipo de beneficio">'
      +PLANTILLAS_CUPON.map(t=>'<button type="button" class="tile'+(cw.tipo===t.k?' on':'')+'" data-ctipo="'+t.k+'" role="radio" aria-checked="'+(cw.tipo===t.k)+'"><span class="tile-ic">'+icon(t.ic,22)+'</span>'+t.t+'</button>').join('')+'</div>'
      +(cw.tipo==='descuento'?'<p class="lbl mt-16" id="lPct">Porcentaje</p><div class="stepper" role="group" aria-labelledby="lPct"><button type="button" class="btn-redondo" data-pct="-5" aria-label="Menos 5%">'+icon('minus')+'</button><output id="cwPct">'+cw.pct+'%</output><button type="button" class="btn-redondo" data-pct="5" aria-label="Más 5%">'+icon('plus')+'</button></div>':'')
      +'<div class="campo mt-16"><label for="cwTexto">Texto del cupón <span class="req">*</span></label><input id="cwTexto" maxlength="60" value="'+esc(cw.texto)+'"><p class="ayuda">Puedes editarlo. Ej: «15% en tu catación guiada».</p></div>';
  }else if(p===2){
    cuerpo='<p class="lbl" id="lCupo">¿Cuántos cupones en total?</p><div class="stepper" role="group" aria-labelledby="lCupo"><button type="button" class="btn-redondo" data-cupo="-1" aria-label="Uno menos">'+icon('minus')+'</button>'
      +'<input id="cwCupo" type="number" inputmode="numeric" min="1" max="1000" value="'+cw.cupo+'" aria-label="Cantidad de cupones"><button type="button" class="btn-redondo" data-cupo="1" aria-label="Uno más">'+icon('plus')+'</button></div>'
      +'<div class="chips-dias mt-8">'+[20,50,100].map(n=>'<button type="button" class="chip-dia'+(cw.cupo===n?' on':'')+'" data-cupo-n="'+n+'" aria-pressed="'+(cw.cupo===n)+'">'+n+'</button>').join('')+'</div>'
      +'<p class="lbl mt-16">¿Hasta cuándo?</p><div class="chips-dias" role="radiogroup" aria-label="Vigencia">'
      +VIGENCIAS.map(([k,t])=>'<button type="button" class="chip-dia'+(cw.vig===k?' on':'')+'" data-vig="'+k+'" role="radio" aria-checked="'+(cw.vig===k)+'">'+t+'</button>').join('')+'</div>'
      +(cw.vig==='fecha'?'<div class="campo mt-8"><label for="cwFecha">Vence el</label><input type="date" id="cwFecha" min="'+isoLocal(Date.now())+'" value="'+esc(cw.fecha)+'"></div>'
        :'<p class="ayuda">Vence el '+fechaCorta(aMs(vigenciaCW()))+'</p>')
      +'<p class="lbl mt-16">Días válidos <span class="opc">(opcional)</span></p><div class="chips-dias" role="group" aria-label="Días válidos">'
      +[[1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[0,'Dom']].map(([i,t])=>'<button type="button" class="chip-dia'+(cw.dias.includes(i)?' on':'')+'" data-cdia="'+i+'" aria-pressed="'+cw.dias.includes(i)+'">'+t+'</button>').join('')+'</div>'
      +'<p class="ayuda">'+(cw.dias.length&&cw.dias.length<7?'Solo se podrá canjear: '+diasTexto(cw.dias):'Si no eliges ninguno, vale todos los días.')+'</p>'
      +'<div class="campo mt-16"><label for="cwTer">Condiciones</label><input id="cwTer" maxlength="100" placeholder="Ej: No acumulable con otras promociones" value="'+esc(cw.terminos)+'"></div>';
  }else{
    cuerpo='<p class="nota">Así verán tu cupón los clientes:</p>'
      +ticketHTML({clase:'ticket-grande',icono:ICONO_TIPO_CUPON[cw.tipo],comercio:cw.d.nombre,titulo:cw.texto,
        detalle:esc('Vence el '+fechaCorta(aMs(vigenciaCW()))+' · '+cw.cupo+' disponibles'+(diasTexto(cw.dias)?' · '+diasTexto(cw.dias):''))+(cw.terminos?'<br>'+esc(cw.terminos):''),
        accion:'<span class="btn btn-secundario btn-sm ticket-btn" aria-hidden="true">Obtener cupón</span>'})
      +'<p class="nota">'+icon('info',14)+' Cada persona puede obtenerlo una vez. Lo canjeas escaneando su código QR desde «Escanear cupón».</p>';
  }
  $('#sheetForm').innerHTML='<div class="grab"></div><button class="btn-redondo cerrar" id="cwCerrar" aria-label="Cerrar">'+icon('x')+'</button>'
    +'<div class="form-head"><h2>Crear cupón</h2><p>Paso '+p+' de 3 · '+PASOS[p-1]+'</p>'
    +'<div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="3" aria-valuenow="'+p+'"><span style="width:'+Math.round(p/3*100)+'%"></span></div></div>'
    +'<div class="form-body">'+cuerpo+'</div>'
    +'<div class="wiz-pie">'+(p>1?'<button class="btn btn-secundario" id="cwAtras">'+icon('arrow-left')+'Atrás</button>':'')
    +(p===3?'<button class="btn btn-primario" id="cwPublicar">'+icon('ticket')+'Publicar cupón</button>':'<button class="btn btn-primario" id="cwSig">'+(p===2?'Ver vista previa':'Siguiente')+'</button>')+'</div>';
  $('#sheetForm').setAttribute('aria-label','Crear cupón');
  $('#sheetForm').scrollTop=0;
  $('#cwCerrar').onclick=()=>cerrar('ovForm');
  const at=$('#cwAtras');if(at)at.onclick=()=>{guardarCuponWiz();cw.paso--;pintarCuponWiz();};
  const sg=$('#cwSig');if(sg)sg.onclick=()=>{guardarCuponWiz();const e=validarCuponWiz();if(e){toast(e);return;}cw.paso++;pintarCuponWiz();};
  const pb=$('#cwPublicar');if(pb)pb.onclick=publicarCupon;
  $$('[data-ctipo]').forEach(b=>b.onclick=()=>{guardarCuponWiz();const t=PLANTILLAS_CUPON.find(x=>x.k===b.dataset.ctipo);cw.tipo=t.k;cw.texto=t.k==='descuento'?t.texto.replace(/^\d+%/,cw.pct+'%'):t.texto;pintarCuponWiz();});
  $$('[data-pct]').forEach(b=>b.onclick=()=>{
    guardarCuponWiz();cw.pct=Math.max(5,Math.min(90,cw.pct+(+b.dataset.pct)));
    if(/^\d{1,2}%/.test(cw.texto))cw.texto=cw.texto.replace(/^\d{1,2}%/,cw.pct+'%');
    $('#cwPct').textContent=cw.pct+'%';$('#cwTexto').value=cw.texto;
  });
  $$('[data-cupo]').forEach(b=>b.onclick=()=>{guardarCuponWiz();cw.cupo=Math.max(1,Math.min(1000,cw.cupo+(+b.dataset.cupo)));pintarCuponWiz();});
  $$('[data-cupo-n]').forEach(b=>b.onclick=()=>{guardarCuponWiz();cw.cupo=+b.dataset.cupoN;pintarCuponWiz();});
  $$('[data-vig]').forEach(b=>b.onclick=()=>{guardarCuponWiz();cw.vig=b.dataset.vig;pintarCuponWiz();});
  $$('[data-cdia]').forEach(b=>b.onclick=()=>{guardarCuponWiz();const i=+b.dataset.cdia;cw.dias=cw.dias.includes(i)?cw.dias.filter(x=>x!==i):[...cw.dias,i];pintarCuponWiz();});
}
async function publicarCupon(){
  const d=cw.d,btn=$('#cwPublicar');
  if(!estado.online){toast('Necesitas conexión para publicar el cupón');return;}
  btn.disabled=true;btn.textContent='Publicando…';
  try{
    await db.collection('cupones').add({comercio_id:d.id,propietario_uid:estado.usuario.uid,comercio_nombre:d.nombre,descripcion:cw.texto,tipo:cw.tipo,
      porcentajeDescuento:cw.tipo==='descuento'?cw.pct:null,cupo_total:cw.cupo,cupo_restante:cw.cupo,vigencia:vigenciaCW(),
      dias:cw.dias.length&&cw.dias.length<7?cw.dias:null,terminos:cw.terminos,estado:'activo',fecha_creacion:FV.serverTimestamp()});
    $('#sheetForm').innerHTML='<div class="grab"></div><div class="hoja-pad hoja-centro listo-cupon"><div class="mc-ic ambar">'+icon('sparkles',28)+'</div>'
      +'<h2>¡Cupón publicado!</h2><p>Tu cupón ya está visible en tu ficha y en «Cupones de la semana».</p>'
      +ticketHTML({icono:ICONO_TIPO_CUPON[cw.tipo],comercio:d.nombre,titulo:cw.texto,detalle:esc('Vence el '+fechaCorta(aMs(vigenciaCW())))})
      +'<button class="btn btn-primario btn-bloque mt-16" id="cwListo">Listo</button></div>';
    $('#cwListo').onclick=()=>{cerrar('ovForm');if(vistaActual().tipo==='dashboard')render(true);};
    confeti();vibrar(30);
  }catch(e){console.error(e);toast('No se pudo publicar el cupón. Revisa que tu plan Premium esté vigente.');btn.disabled=false;btn.innerHTML=icon('ticket')+'Publicar cupón';}
}
// Confeti suave: pocas piezas, solo transform/opacity; no aparece si el usuario pidió menos movimiento
function confeti(){
  if(sinMovimiento())return;
  const capa=document.createElement('div');capa.className='confeti';capa.setAttribute('aria-hidden','true');
  for(let i=0;i<28;i++){
    const s=document.createElement('span');
    s.style.left=(Math.random()*100)+'%';s.style.animationDelay=(Math.random()*.35)+'s';s.style.animationDuration=(1.4+Math.random()*.9)+'s';
    s.style.setProperty('--giro',(Math.random()*720-360)+'deg');s.style.setProperty('--deriva',(Math.random()*80-40)+'px');
    s.className='c'+(i%4);capa.appendChild(s);
  }
  document.body.appendChild(capa);setTimeout(()=>capa.remove(),2600);
}

/* ---------- El comerciante CANJEA escaneando ---------- */
// Lector: BarcodeDetector nativo (Android/Chrome) o, de respaldo, jsQR local (iPhone y navegadores sin la API)
const lector={stream:null,raf:0,detector:null,comercio:null,leyendo:false,canvas:null};
function abrirEscaner(d){
  lector.comercio=d;
  abrir('ovEscaner');
  iniciarCamara();
}
function marcoEscaner(){
  return '<video id="escVideo" playsinline muted autoplay aria-hidden="true"></video>'
    +'<div class="esc-marco" aria-hidden="true"><span></span></div>'
    +'<div class="esc-top"><button class="btn-redondo" id="escCerrar" aria-label="Cerrar escáner">'+icon('x')+'</button><p>Apunta al código QR del cupón de tu cliente</p></div>'
    +'<div class="esc-pie"><p id="escEstado" role="status">Abriendo la cámara…</p>'
    +'<button class="btn btn-secundario btn-bloque" id="escManual">'+icon('keyboard')+'Escribir el código a mano</button></div>';
}
function enlazarEscaner(){
  $('#escCerrar').onclick=()=>cerrar('ovEscaner');
  $('#escManual').onclick=codigoManual;
}
async function iniciarCamara(){
  detenerCamara();
  $('#escaner').className='escaner';
  $('#escaner').innerHTML=marcoEscaner();enlazarEscaner();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){sinCamara('no-api');return;}
  try{
    lector.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false});
  }catch(e){sinCamara(e.name);return;}
  if(!$('#ovEscaner').classList.contains('abierto')){detenerCamara();return;}
  const v=$('#escVideo');v.srcObject=lector.stream;
  try{await v.play();}catch(e){}
  lector.detector=null;
  try{
    if('BarcodeDetector' in window&&(await BarcodeDetector.getSupportedFormats()).includes('qr_code'))lector.detector=new BarcodeDetector({formats:['qr_code']});
  }catch(e){}
  if(!lector.detector){
    try{await cargarScript('lib/jsQR.js');}catch(e){$('#escEstado').textContent='No se pudo cargar el lector. Escribe el código a mano.';return;}
  }
  $('#escEstado').textContent='Buscando el código…';
  lector.leyendo=true;buscarQR();
}
let ultimaLectura=0;
function buscarQR(){
  if(!lector.leyendo)return;
  lector.raf=requestAnimationFrame(async()=>{
    const v=$('#escVideo');
    // Una lectura cada ~200 ms es suficiente y cuida la batería
    if(!v||v.readyState<2||Date.now()-ultimaLectura<200){buscarQR();return;}
    ultimaLectura=Date.now();
    let texto=null;
    try{
      if(lector.detector){const r=await lector.detector.detect(v);if(r.length)texto=r[0].rawValue;}
      else{
        const w=Math.min(640,v.videoWidth),h=Math.round(v.videoHeight*w/v.videoWidth);
        const cv=lector.canvas||(lector.canvas=document.createElement('canvas'));cv.width=w;cv.height=h;
        const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,0,0,w,h);
        const r=jsQR(ctx.getImageData(0,0,w,h).data,w,h,{inversionAttempts:'dontInvert'});if(r)texto=r.data;
      }
    }catch(e){}
    if(texto&&lector.leyendo){lector.leyendo=false;vibrar(60);detenerCamara();leerTextoQR(texto);return;}
    buscarQR();
  });
}
function detenerCamara(){
  lector.leyendo=false;cancelAnimationFrame(lector.raf);
  if(lector.stream){lector.stream.getTracks().forEach(t=>t.stop());lector.stream=null;}
}
alCerrar.ovEscaner=detenerCamara;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&lector.stream)detenerCamara();else if(!document.hidden&&$('#ovEscaner').classList.contains('abierto')&&$('#escVideo'))iniciarCamara();});
function sinCamara(motivo){
  const permiso=motivo==='NotAllowedError'||motivo==='SecurityError';
  const tit=permiso?'Necesitamos permiso para usar la cámara':motivo==='NotFoundError'||motivo==='OverconstrainedError'?'No encontramos una cámara':motivo==='no-api'?'Este navegador no deja usar la cámara aquí':'No pudimos abrir la cámara';
  $('#escaner').className='escaner claro';
  $('#escaner').innerHTML='<button class="btn-redondo cerrar" id="escCerrar" aria-label="Cerrar">'+icon('x')+'</button>'
    +'<div class="esc-ayuda"><div class="mc-ic peligro">'+icon('camera',28)+'</div><h2>'+tit+'</h2>'
    +(permiso?'<ol class="pasos"><li>Toca el candado o el ícono que está a la izquierda de la dirección (en la app instalada: mantén presionado el ícono de Fusa Conecta → Información de la app).</li>'
      +'<li>Entra a <b>Permisos</b> → <b>Cámara</b> y elige <b>Permitir</b>.</li>'
      +'<li>En iPhone: Ajustes → Safari → Cámara → Permitir.</li><li>Vuelve aquí y toca «Intentar de nuevo».</li></ol>'
      :'<p>Puedes validar el cupón escribiendo el código que aparece debajo del QR.</p>')
    +'<div class="hoja-acc"><button class="btn btn-primario btn-bloque" id="escManual">'+icon('keyboard')+'Escribir el código a mano</button>'
    +'<button class="btn btn-secundario btn-bloque" id="escReintentar">'+icon('refresh-cw')+'Intentar de nuevo</button></div></div>';
  enlazarEscaner();$('#escReintentar').onclick=iniciarCamara;
}
function codigoManual(){
  detenerCamara();
  $('#escaner').className='escaner claro';
  $('#escaner').innerHTML='<button class="btn-redondo cerrar" id="escCerrar" aria-label="Cerrar">'+icon('x')+'</button>'
    +'<div class="esc-ayuda"><div class="mc-ic">'+icon('keyboard',28)+'</div><h2>Escribe el código</h2><p>Está debajo del QR en el celular del cliente.</p>'
    +'<div class="validar-row mt-16"><label for="vCodigo" class="sr-only">Código del cupón</label><input class="input" id="vCodigo" placeholder="FC-XXXX-XXXX" maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false">'
    +'<button class="btn btn-primario" id="vValidar">Revisar</button></div><p class="nota-c izq" id="vRes" role="status"></p>'
    +'<button class="btn btn-ghost mt-16" id="escCamara">'+icon('camera',18)+'Usar la cámara</button></div>';
  $('#escCerrar').onclick=()=>cerrar('ovEscaner');
  $('#escCamara').onclick=iniciarCamara;
  const ir=()=>{
    const cod=$('#vCodigo').value.trim().toUpperCase().replace(/\s+/g,'');
    if(!/^FC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cod)){$('#vRes').textContent='Escribe el código completo, por ejemplo FC-AB12-CD34.';return;}
    revisarCupon(cod);
  };
  $('#vValidar').onclick=ir;
  $('#vCodigo').addEventListener('keydown',e=>{if(e.key==='Enter')ir();});
  setTimeout(()=>$('#vCodigo').focus(),250);
}
function leerTextoQR(texto){
  const m=String(texto).trim().match(/^FUSACONECTA:(FC-[A-Z0-9]{4}-[A-Z0-9]{4})$/i);
  if(m){revisarCupon(m[1].toUpperCase());return;}
  if(/#\/lugar\//.test(texto)){resultadoEscaner('rojo','Este no es un cupón','Es el código QR de un negocio. Pídele al cliente que abra el cupón en «Mis cupones».');return;}
  resultadoEscaner('rojo','Este código no es de Fusa Conecta','Pídele al cliente que abra su cupón en «Mis cupones».');
}
// Pantalla de resultado a pantalla completa: verde (válido), ámbar (ya canjeado), rojo (vencido / otro comercio)
function resultadoEscaner(color,titulo,texto,extra){
  const ic={verde:'circle-check',ambar:'circle-alert',rojo:'circle-x'}[color];
  $('#escaner').className='escaner resultado '+color;
  $('#escaner').innerHTML='<button class="btn-redondo cerrar" id="escCerrar" aria-label="Cerrar">'+icon('x')+'</button>'
    +'<div class="esc-res" role="alert">'+icon(ic,72)+'<h2>'+titulo+'</h2>'+(texto?'<p>'+texto+'</p>':'')+'</div>'
    +'<div class="esc-res-acc">'+(extra||'<button class="btn btn-claro btn-bloque" id="escOtro">'+icon('scan-line')+'Escanear otro cupón</button>')
    +'<button class="enlace-claro" id="escManual">Escribir el código a mano</button></div>';
  $('#escCerrar').onclick=()=>cerrar('ovEscaner');
  $('#escManual').onclick=codigoManual;
  const o=$('#escOtro');if(o)o.onclick=iniciarCamara;
}
async function revisarCupon(cod){
  const d=lector.comercio,uid=estado.usuario.uid;
  const res=$('#vRes');if(res)res.textContent='Revisando…';
  if(!estado.online){resultadoEscaner('rojo','Sin conexión','Para canjear un cupón necesitas internet. Revisa tu conexión e intenta de nuevo.');return;}
  try{
    const s=await db.collection('canjes').where('propietario_uid','==',uid).where('codigo','==',cod).limit(1).get();
    if(s.empty){resultadoEscaner('rojo','Este cupón es de otro comercio','O el código no existe. Revisa que el cliente te muestre un cupón de '+esc(d.nombre)+'.');return;}
    const doc=s.docs[0],k=doc.data();
    if(k.comercio_id!==d.id){resultadoEscaner('rojo','Este cupón es de otro comercio','Es de '+esc(k.comercio_nombre||'otro negocio')+'. Escanéalo desde el panel de ese negocio.');return;}
    if(k.estado==='usado'){resultadoEscaner('ambar','Ya fue canjeado',k.fecha_canje?'El '+fechaConHora(aMs(k.fecha_canje)):'Este cupón ya se usó.');return;}
    const vence=aMs(k.fecha_vencimiento);
    if(vence&&vence<Date.now()){resultadoEscaner('rojo','Vencido','Este cupón venció el '+fechaCorta(vence)+'.');return;}
    if(k.dias&&k.dias.length&&!k.dias.includes(new Date().getDay())){resultadoEscaner('rojo','Hoy no aplica','Este cupón solo vale: '+diasTexto(k.dias)+'.');return;}
    resultadoEscaner('verde','Cupón válido',esc(k.descripcion)+'<br>Cliente: '+esc(nombreCorto(k.usuario_nombre))+(k.terminos?'<br><small>'+esc(k.terminos)+'</small>':''),
      '<button class="btn btn-claro btn-bloque btn-xl" id="escConfirmar">'+icon('badge-check',22)+'Confirmar canje</button><button class="btn btn-ghost-claro btn-bloque" id="escCancelar">Cancelar</button>');
    $('#escCancelar').onclick=()=>cerrar('ovEscaner');
    $('#escConfirmar').onclick=()=>confirmarCanje(doc.ref,k);
  }catch(e){console.error(e);resultadoEscaner('rojo','No se pudo revisar','Revisa tu conexión e intenta de nuevo.');}
}
// Canjear (transacción): solo el dueño del comercio, una sola vez, de "reservado" a "usado". El cupo ya se descontó al obtenerlo.
async function confirmarCanje(ref,k){
  const uid=estado.usuario.uid,btn=$('#escConfirmar');
  btn.disabled=true;btn.textContent='Confirmando…';
  try{
    const r=await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const c=s.data();
      if(c.estado==='usado')return {tipo:'usado',c};
      tx.update(ref,{estado:'usado',fecha_canje:FV.serverTimestamp(),canjeado_por:uid});
      return {tipo:'ok',c};
    });
    if(r.tipo==='usado'){resultadoEscaner('ambar','Ya fue canjeado',r.c.fecha_canje?'El '+fechaConHora(aMs(r.c.fecha_canje)):'');return;}
    vibrar([40,60,40]);
    canjesPropios=canjesPropios.filter(x=>x.id!==ref.id).concat([{id:ref.id,...k,estado:'usado',fecha_canje:Date.now()}]);
    contarCanje(k.comercio_id);
    resultadoEscaner('verde','Canje confirmado',esc(k.descripcion)+'<br>Cliente: '+esc(nombreCorto(k.usuario_nombre)));
    if(vistaActual().tipo==='dashboard')render(true);
  }catch(e){console.error(e);btn.disabled=false;btn.innerHTML=icon('badge-check',22)+'Confirmar canje';toast('No se pudo confirmar. Revisa tu conexión.');}
}
// El canje lo suma el dueño (registrarEvento ignora al dueño, por eso va directo)
function contarCanje(comercioId){
  db.collection('comercios').doc(String(comercioId)).collection('estadisticas').doc(mesClave()).set({cupones_canjeados:FV.increment(1)},{merge:true}).catch(()=>{});
}

/* ---------- "Mi código QR": póster para el mostrador (carta y tarjeta) ---------- */
// Dirección oficial de la app (Firebase Hosting) para los QR del mostrador
const SITIO_URL='https://fusa-conecta.web.app';
function enlaceFicha(id){return SITIO_URL+'/#/lugar/'+encodeURIComponent(id);}
const FORMATOS_POSTER={carta:{w:1275,h:1650,t:'Tamaño carta'},tarjeta:{w:1050,h:600,t:'Tamaño tarjeta'}};
let posterFormato='carta';
async function miCodigoQR(d){
  abrirHoja('<div class="hoja-pad hoja-centro"><h2>Mi código QR</h2><p>Imprímelo y pégalo en tu mostrador: tus clientes lo escanean y abren tu ficha.</p>'
    +'<div class="adm-tabs centro" role="tablist" aria-label="Tamaño del póster">'+Object.entries(FORMATOS_POSTER).map(([k,f])=>'<button role="tab" data-pformato="'+k+'" aria-selected="'+(posterFormato===k)+'" class="'+(posterFormato===k?'on':'')+'">'+f.t+'</button>').join('')+'</div>'
    +'<div class="poster-prev"><img id="posterImg" alt="Póster con el código QR de '+esc(d.nombre)+'"><p class="nota" id="posterEstado">Preparando el póster…</p></div>'
    +'<div class="hoja-acc"><button class="btn btn-primario btn-bloque" id="qrDescargar" disabled>'+icon('image-down')+'Descargar</button>'
    +'<button class="btn btn-secundario btn-bloque" id="qrCompartir" disabled>'+icon('share-2')+'Compartir</button></div></div>');
  let lienzo=null;
  const pintar=async()=>{
    $$('[data-pformato]').forEach(b=>{const on=b.dataset.pformato===posterFormato;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
    $('#qrDescargar').disabled=$('#qrCompartir').disabled=true;
    try{
      lienzo=await dibujarPoster(d,posterFormato);
      $('#posterImg').src=lienzo.toDataURL('image/png');$('#posterEstado').textContent=FORMATOS_POSTER[posterFormato].t+' · listo para imprimir';
      $('#qrDescargar').disabled=$('#qrCompartir').disabled=false;
    }catch(e){console.error(e);$('#posterEstado').textContent='No se pudo generar el póster. Enlace: '+enlaceFicha(d.id);}
  };
  $$('[data-pformato]').forEach(b=>b.onclick=()=>{posterFormato=b.dataset.pformato;pintar();});
  const nombreArchivo=()=>'fusa-conecta-'+norm(d.nombre).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+posterFormato+'.png';
  $('#qrDescargar').onclick=()=>{if(!lienzo)return;const a=document.createElement('a');a.href=lienzo.toDataURL('image/png');a.download=nombreArchivo();a.click();};
  $('#qrCompartir').onclick=()=>{
    if(!lienzo)return;
    lienzo.toBlob(async b=>{
      const f=b&&new File([b],nombreArchivo(),{type:'image/png'});
      const texto='Encuéntranos, guárdanos y obtén cupones en Fusa Conecta: '+enlaceFicha(d.id);
      try{
        if(f&&navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],title:d.nombre,text:texto});
        else compartir(d.nombre,'/lugar/'+d.id);
      }catch(e){}
    },'image/png');
  };
  pintar();
}
function imagenDeSVG(svg){
  return new Promise((ok,mal)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=mal;i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
}
// Ajusta un texto a un ancho máximo partiéndolo en líneas
function lineasTexto(ctx,txt,max){
  const palabras=String(txt).split(/\s+/),l=[];let act='';
  palabras.forEach(p=>{const prueba=act?act+' '+p:p;if(ctx.measureText(prueba).width>max&&act){l.push(act);act=p;}else act=prueba;});
  if(act)l.push(act);return l;
}
async function dibujarPoster(d,formato){
  const F=FORMATOS_POSTER[formato],cv=document.createElement('canvas');cv.width=F.w;cv.height=F.h;
  const ctx=cv.getContext('2d'),c=n=>cssVarClaro(n),fuente=getComputedStyle(document.body).fontFamily;
  const tmp=document.createElement('div');
  const tamQR=formato==='carta'?760:400;
  await pintarQR(tmp,enlaceFicha(d.id),tamQR);
  const qr=tmp.querySelector('canvas');if(!qr)throw new Error('qr');
  await Promise.all(['800','500','600','700','400'].map(p=>document.fonts.load(p+' 40px Poppins').catch(()=>{})));
  const iso=await imagenDeSVG(isoSVG('','claro',true).replace('<svg ','<svg width="194" height="276" '));
  ctx.fillStyle=c('--bg');ctx.fillRect(0,0,F.w,F.h);
  const texto=(t,x,y,tam,peso,color,alin='center',max=F.w-120)=>{ctx.font=peso+' '+tam+'px '+fuente;ctx.fillStyle=color;ctx.textAlign=alin;ctx.textBaseline='top';
    const ls=lineasTexto(ctx,t,max);ls.forEach((l,i)=>ctx.fillText(l,x,y+i*tam*1.25));return y+ls.length*tam*1.25;};
  if(formato==='carta'){
    ctx.fillStyle=c('--primary-500');ctx.fillRect(0,0,F.w,24);ctx.fillRect(0,F.h-24,F.w,24);
    // Logo vertical: isotipo arriba y "Fusa Conecta" en una línea (≈ 2,2 × ancho del isotipo)
    const ancho=marcaPoster(ctx,iso,'vertical',F.w/2,70,120,fuente);
    let y=texto(d.nombre,F.w/2,70+120+ancho.alto+40,84,'700',c('--ink'));
    const qy=y+50;
    ctx.fillStyle=c('--soft');ctx.strokeStyle=c('--line');ctx.lineWidth=4;
    redondeado(ctx,(F.w-tamQR)/2-40,qy-40,tamQR+80,tamQR+80,40);ctx.fill();ctx.stroke();
    ctx.drawImage(qr,(F.w-tamQR)/2,qy,tamQR,tamQR);
    y=texto('Encuéntranos, guárdanos y obtén cupones en Fusa Conecta',F.w/2,qy+tamQR+90,52,'600',c('--primary-700'),'center',F.w-220);
    texto('Escanea con la cámara de tu celular',F.w/2,y+24,36,'400',c('--ink-2'));
  }else{
    ctx.fillStyle=c('--primary-500');ctx.fillRect(0,0,18,F.h);
    const qx=F.w-tamQR-80,qy=(F.h-tamQR)/2;
    ctx.drawImage(qr,qx,qy,tamQR,tamQR);
    marcaPoster(ctx,iso,'horizontal',70,64,64,fuente);
    const max=qx-70-50;
    let y=texto(d.nombre,70,190,56,'700',c('--ink'),'left',max);
    texto('Encuéntranos, guárdanos y obtén cupones en Fusa Conecta',70,y+24,30,'500',c('--primary-700'),'left',max);
  }
  return cv;
}
// Logo en el lienzo del póster con las proporciones de logo(): vertical (x = centro) u horizontal (x = borde izquierdo)
function marcaPoster(ctx,iso,variante,x,y,alto,fuente){
  const pinta=(t,peso,tam,color,px,py)=>{ctx.font=peso+' '+tam+'px '+fuente;ctx.fillStyle=color;if('letterSpacing' in ctx)ctx.letterSpacing=(-.02*tam)+'px';ctx.fillText(t,px,py);return ctx.measureText(t).width;};
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
  if(variante==='vertical'){
    const H=alto,W=H*LOGO_PROP,f=2.2*W/LOGO_ANCHO_NOMBRE;
    ctx.drawImage(iso,x-W/2,y,W,H);
    ctx.font='800 '+f+'px '+fuente;const a=ctx.measureText('Fusa ').width;ctx.font='500 '+f+'px '+fuente;const b=ctx.measureText('Conecta').width;
    const base=y+H+.2*H+.71*f,x0=x-(a+b)/2;
    pinta('Fusa ','800',f,cssVarClaro('--ink'),x0,base);pinta('Conecta','500',f,cssVarClaro('--primary-500'),x0+a,base);
    if('letterSpacing' in ctx)ctx.letterSpacing='0px';
    return {alto:.2*H+.71*f+.4*f};
  }
  const em=alto/1.84,H=1.63*em,W=H*LOGO_PROP;
  ctx.drawImage(iso,x,y+.10*em,W,H);
  const tx=x+W+.35*W;
  pinta('Fusa','800',em,cssVarClaro('--ink'),tx,y+.81*em);pinta('Conecta','500',em,cssVarClaro('--primary-500'),tx,y+1.73*em);
  if('letterSpacing' in ctx)ctx.letterSpacing='0px';
  return {alto};
}
function redondeado(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

/* ===== HOJA GENÉRICA ===== */
function abrirHoja(html){
  $('#sheetGen').innerHTML='<div class="grab"></div><button class="btn-redondo cerrar" id="cerrarGen" aria-label="Cerrar">'+icon('x')+'</button>'+html;
  $('#cerrarGen').onclick=()=>cerrar('ovGen');abrir('ovGen');
}

/* ===== MAPA GENERAL CON CLÚSTERES (RF-10, RNF-06) ===== */
function pedirUbicacion(){
  return new Promise(res=>{
    if(!navigator.geolocation){res(null);return;}
    navigator.geolocation.getCurrentPosition(p=>{estado.pos=[p.coords.latitude,p.coords.longitude];res(estado.pos);},()=>res(null),{enableHighAccuracy:true,timeout:8000,maximumAge:60000});
  });
}
function pinIcono(nombreIcono,clase='pin-fc'){return L.divIcon({className:clase,html:'<span>'+icon(nombreIcono,16)+'</span>',iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-16]});}
function pinUsuario(){return L.divIcon({className:'pin-fc yo',html:'<span></span>',iconSize:[20,20],iconAnchor:[10,10]});}
async function renderMapa(){
  const cuerpo=$('#cuerpo');
  if(!estado.online){cuerpo.innerHTML='<div class="vista"><div class="mapa-off">'+icon('wifi-off',32)+'<b>Mapa no disponible sin conexión</b>El directorio, tus favoritos y las emergencias siguen funcionando.</div></div>';return;}
  cuerpo.innerHTML='<div class="vista-mapa"><div class="mapa-head"><h2>Mapa de Fusa</h2><span id="mapaInfo">Cargando mapa…</span></div><div id="mapaGeneral" role="region" aria-label="Mapa de lugares"></div></div>';
  try{await cargarLeaflet();}catch(e){$('#mapaInfo').textContent='No se pudo cargar el mapa.';return;}
  if(vistaActual().tipo!=='mapa'||!$('#mapaGeneral'))return;
  const m=L.map('mapaGeneral',{zoomControl:true}).setView(PLAZA_FUSA,14);mapaActivo=m;
  capaBase().addTo(m);
  const grupo=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:50,
    iconCreateFunction:c=>L.divIcon({className:'cluster-fc',html:'<span>'+c.getChildCount()+'</span>',iconSize:[40,40]})});
  const items=database.filter(d=>d.lat&&d.lng&&(d.cat!=='bares'||estado.mayorEdad));
  items.forEach(d=>{
    const mk=L.marker([d.lat,d.lng],{icon:pinIcono(iconoDe(d),'pin-fc c-'+d.cat),title:d.nombre,alt:d.nombre});
    mk.bindPopup('<b>'+esc(d.nombre)+'</b><br><small>'+esc(etiquetaDe(d))+(d.ubicacion_aprox?' · ubicación aproximada':'')+'</small><br><button class="pop-ver" data-ver="'+esc(d.id)+'">Ver ficha</button>');
    grupo.addLayer(mk);
  });
  m.addLayer(grupo);
  m.on('popupopen',e=>{const b=e.popup.getElement().querySelector('[data-ver]');if(b)b.onclick=()=>abrirDetalle(b.dataset.ver);});
  $('#mapaInfo').textContent=items.length+' lugares · toca un grupo para acercarte';
  const pos=await pedirUbicacion();
  if(pos&&mapaActivo===m){
    L.marker(pos,{icon:pinUsuario(),title:'Estás aquí'}).addTo(m).bindPopup('Estás aquí');
    if(distanciaKm(pos,PLAZA_FUSA)<25)m.setView(pos,15);
  }else if(mapaActivo===m){
    $('#mapaInfo').textContent='Activa tu ubicación para ver lo más cercano';
    const b=document.createElement('button');b.className='btn btn-tonal btn-sm';b.id='mapaGPS';b.innerHTML=icon('locate-fixed',16)+'Activar';
    $('.mapa-head').appendChild(b);
    b.onclick=async()=>{const p=await pedirUbicacion();if(mapaActivo!==m)return;
      if(!p){toast('No pudimos ver tu ubicación. Permite el acceso en los ajustes del navegador.');return;}
      L.marker(p,{icon:pinUsuario(),title:'Estás aquí'}).addTo(m).bindPopup('Estás aquí');m.setView(p,15);b.remove();$('#mapaInfo').textContent=items.length+' lugares cerca de ti';};
  }
  setTimeout(()=>m.invalidateSize(),200);
}

/* ===== NAVEGACIÓN GUIADA DE SENDEROS (RF-17) ===== */
function perfilSVG(r){
  const p=r.perfilElevacion,w=320,h=84,min=r.elevacionMinima-20,max=r.elevacionMaxima+20;
  const pts=p.map((e,i)=>(i/(p.length-1)*w).toFixed(1)+','+(h-(e-min)/(max-min)*h).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 '+w+' '+(h+4)+'" class="perfil-elev" preserveAspectRatio="none" role="img" aria-label="Perfil de elevación de la ruta"><polygon class="area" points="0,'+h+' '+pts+' '+w+','+h+'"/><polyline class="linea" points="'+pts+'"/></svg>';
}
/* ===== SENDEROS ESTILO RELIVE (v4 · Fase 7) =====
   - Recorrer en 3D: MapLibre GL (copiado en lib/, se carga solo en las pantallas de senderos) con relieve
     Terrarium de AWS (Mapzen) y un vuelo de cámara por el trazado.
   - Grabar: watchPosition + Wake Lock (pantalla encendida) + IndexedDB (sobrevive a cierres) + fotos con su posición.
   - Relive: el recorrido en 3D, tarjeta vertical 1080 x 1920 para compartir y video (MediaRecorder).
   - Mis recorridos e insignias: todo vive en el teléfono (IndexedDB); nada se sube a la nube. */
const MAPLIBRE_JS='lib/maplibre/maplibre-gl.js',MAPLIBRE_CSS='lib/maplibre/maplibre-gl.css';
async function cargarMapLibre(){cargarCSS(MAPLIBRE_CSS);await cargarScript(MAPLIBRE_JS);}
function soporta3D(){try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch(e){return false;}}
const fmtKm=km=>(km||0).toFixed(km>=10?1:2).replace('.',',')+' km';
function fmtDuracion(ms){const m=Math.round((ms||0)/60000),h=Math.floor(m/60);return h?h+' h '+String(m%60).padStart(2,'0')+' min':m+' min';}
function fmtRitmo(ms,km){if(!km||km<.05)return '—';const s=ms/1000/km;return Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0')+' min/km';}

/* ---------- IndexedDB: recorridos y sus fotos (en almacenes separados para guardar rápido) ---------- */
const IDB={
  db:null,
  abrir(){
    if(this.db)return Promise.resolve(this.db);
    return new Promise((ok,mal)=>{
      if(!('indexedDB' in window)){mal(new Error('sin-idb'));return;}
      const r=indexedDB.open('fusa-recorridos',1);
      r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('recorridos',{keyPath:'id'});d.createObjectStore('fotos',{keyPath:'id'}).createIndex('rec','rec');};
      r.onsuccess=()=>{this.db=r.result;ok(this.db);};r.onerror=()=>mal(r.error);
    });
  },
  async op(almacen,modo,fn){const d=await this.abrir();return new Promise((ok,mal)=>{const t=d.transaction(almacen,modo),s=t.objectStore(almacen);const r=fn(s);t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>mal(t.error);});},
  poner(a,v){return this.op(a,'readwrite',s=>s.put(v));},
  obtener(a,id){return this.op(a,'readonly',s=>s.get(id));},
  todos(a){return this.op(a,'readonly',s=>s.getAll());},
  borrar(a,id){return this.op(a,'readwrite',s=>s.delete(id));},
  fotosDe(rec){return this.op('fotos','readonly',s=>s.index('rec').getAll(rec));}
};
async function borrarRecorrido(id){
  const fotos=await IDB.fotosDe(id).catch(()=>[]);
  for(const f of fotos)await IDB.borrar('fotos',f.id);
  await IDB.borrar('recorridos',id);
}

/* ---------- Estadísticas de un recorrido ---------- */
// Desnivel con histéresis de 4 m: el GPS sube y baja unos metros aunque estés quieto
function desnivelPositivo(pts){
  let sube=0,ref=null;
  pts.forEach(p=>{const a=p[2];if(a==null)return;if(ref==null){ref=a;return;}if(a-ref>=4){sube+=a-ref;ref=a;}else if(ref-a>=4)ref=a;});
  return Math.round(sube);
}
function distanciaDe(pts){let s=0;for(let i=1;i<pts.length;i++)s+=distanciaKm(pts[i-1],pts[i]);return s;}

/* ---------- Grabación (independiente de la pantalla: sigue aunque visites otras secciones) ---------- */
const grab={rec:null,watch:null,sim:null,wake:null,pausado:false,ultimo:0,guardadoEn:0,alCambiar:null};
async function pedirPantallaEncendida(){
  try{if('wakeLock' in navigator&&!grab.wake){grab.wake=await navigator.wakeLock.request('screen');grab.wake.addEventListener('release',()=>{grab.wake=null;});}}catch(e){}
}
document.addEventListener('visibilitychange',()=>{if(grab.rec&&!grab.pausado&&document.visibilityState==='visible')pedirPantallaEncendida();});
function soltarPantalla(){if(grab.wake){grab.wake.release().catch(()=>{});grab.wake=null;}}
async function guardarGrabacion(forzar){
  if(!grab.rec)return;
  const ahora=Date.now();if(!forzar&&ahora-grab.guardadoEn<8000)return;
  grab.guardadoEn=ahora;
  const r=grab.rec;r.distancia=distanciaDe(r.puntos);r.desnivel=desnivelPositivo(r.puntos);
  if(!grab.pausado&&r.reanudado){r.activo+=ahora-r.reanudado;r.reanudado=ahora;}
  await IDB.poner('recorridos',r).catch(()=>{});
}
function tiempoActivo(r){return r.activo+(grab.rec===r&&!grab.pausado&&r.reanudado?Date.now()-r.reanudado:0);}
async function empezarGrabacion(rutaId,simulado){
  const r=RUTAS[rutaId];
  grab.rec={id:'r'+Date.now().toString(36),rutaId,nombre:r?r.nombre:'Recorrido libre',inicio:Date.now(),fin:null,puntos:[],fotos:[],
    activo:0,reanudado:Date.now(),distancia:0,desnivel:0,estado:'grabando',completo:false,simulado:!!simulado};
  grab.pausado=false;grab.guardadoEn=0;
  await guardarGrabacion(true);
  if(!simulado)pedirPantallaEncendida();
  medir('recorrido_inicio',{ruta:rutaId,simulado:!!simulado});
  if(simulado)return;
  grab.watch=navigator.geolocation.watchPosition(p=>sumarPunto([p.coords.latitude,p.coords.longitude,p.coords.altitude],p.coords.accuracy),
    e=>{if(e.code===1){toast('Permite el acceso a tu ubicación para grabar');detenerSensores();if(grab.alCambiar)grab.alCambiar();}},
    {enableHighAccuracy:true,maximumAge:3000,timeout:30000});
}
// Puntos con precisión de 35 m o mejor y al menos 5 m del anterior (menos ruido y menos espacio)
function sumarPunto(p,precision){
  const r=grab.rec;if(!r||grab.pausado)return;
  if(precision!=null&&precision>35)return;
  const ant=r.puntos[r.puntos.length-1];
  if(ant&&distanciaKm(ant,p)<.005)return;
  r.puntos.push([+p[0].toFixed(6),+p[1].toFixed(6),p[2]==null?null:Math.round(p[2]),Date.now()]);
  guardarGrabacion();
  if(grab.alCambiar)grab.alCambiar(p);
}
function pausarGrabacion(){const r=grab.rec;if(!r||grab.pausado)return;r.activo+=Date.now()-r.reanudado;r.reanudado=null;grab.pausado=true;soltarPantalla();guardarGrabacion(true);pintarAvisoGrabando();}
function reanudarGrabacion(){const r=grab.rec;if(!r||!grab.pausado)return;r.reanudado=Date.now();grab.pausado=false;if(!r.simulado)pedirPantallaEncendida();guardarGrabacion(true);pintarAvisoGrabando();}
function detenerSensores(){
  if(grab.watch!=null){navigator.geolocation.clearWatch(grab.watch);grab.watch=null;}
  if(grab.sim){clearInterval(grab.sim);grab.sim=null;}
  soltarPantalla();
}
async function terminarGrabacion(completo){
  const r=grab.rec;if(!r)return null;
  if(!grab.pausado&&r.reanudado){r.activo+=Date.now()-r.reanudado;}
  detenerSensores();
  r.reanudado=null;r.fin=Date.now();r.estado='terminado';r.completo=!!completo;
  await guardarGrabacion(true);
  grab.rec=null;grab.pausado=false;pintarAvisoGrabando();
  medir('recorrido_fin',{ruta:r.rutaId,km:+r.distancia.toFixed(2),simulado:r.simulado});
  return r;
}
// Si la app se cerró a mitad de camino, el recorrido sigue en el teléfono y se puede continuar
async function recorridoSinTerminar(){
  const l=await IDB.todos('recorridos').catch(()=>[]);
  return l.find(x=>x.estado==='grabando')||null;
}
async function continuarGrabacion(r){
  grab.rec=r;r.reanudado=Date.now();grab.pausado=false;
  if(!r.simulado){pedirPantallaEncendida();
    grab.watch=navigator.geolocation.watchPosition(p=>sumarPunto([p.coords.latitude,p.coords.longitude,p.coords.altitude],p.coords.accuracy),()=>{},{enableHighAccuracy:true,maximumAge:3000,timeout:30000});}
}
// Foto durante el recorrido: se comprime y queda con la posición donde se tomó
async function fotoDeRecorrido(archivo){
  const r=grab.rec;if(!r||!archivo)return;
  try{
    const f=await comprimirFoto(archivo,1280,250000,.8);
    const ult=r.puntos[r.puntos.length-1];
    const id='f'+Date.now().toString(36);
    await IDB.poner('fotos',{id,rec:r.id,t:Date.now(),lat:ult?ult[0]:null,lng:ult?ult[1]:null,i:Math.max(0,r.puntos.length-1),data:f.src});
    r.fotos.push(id);await guardarGrabacion(true);
    toast('Foto guardada en tu recorrido');
  }catch(e){toast('No pudimos guardar esa foto');}
}
// Aviso fijo mientras se graba y estás en otra pantalla
function pintarAvisoGrabando(){
  let a=$('#avisoGrabando');
  const ver=!!grab.rec&&!(vistaActual().tipo==='ruta'&&vistaActual().id===grab.rec.rutaId);
  if(!ver){if(a)a.remove();return;}
  if(!a){a=document.createElement('button');a.id='avisoGrabando';a.className='aviso-grabando';document.body.appendChild(a);
    a.onclick=()=>{if(grab.rec)navegar({tipo:'ruta',id:grab.rec.rutaId});};}
  a.innerHTML='<span class="punto-grab" aria-hidden="true"></span>'+(grab.pausado?'Recorrido en pausa':'Grabando tu recorrido')+' · Volver';
}

/* ---------- Insignias (solo recorridos reales terminados; las simulaciones no cuentan) ---------- */
const INSIGNIAS=[
  ['primer','footprints','Primer sendero','Termina tu primer recorrido',s=>s.n>=1],
  ['km10','route','10 km','Suma 10 km recorridos',s=>s.km>=10],
  ['km50','mountain','50 km','Suma 50 km recorridos',s=>s.km>=50],
  ['escalador','trending-up','Escalador','Sube 500 m de desnivel en total',s=>s.desnivel>=500],
  ['fusacatan','flag','Cumbre del Fusacatán','Llega a la meta del Cerro Fusacatán',s=>s.rutas.has('c21')],
  ['explorador','binoculars','Explorador del Sumapaz','Completa todos los senderos con ruta',s=>Object.keys(RUTAS).every(k=>s.rutas.has(k))],
  ['madrugador','sun','Madrugador','Empieza un recorrido antes de las 7 a. m.',s=>s.madrugador],
  ['fotografo','camera','Fotógrafo de senderos','Toma 10 fotos en tus recorridos',s=>s.fotos>=10]
];
function resumenInsignias(lista){
  const s={n:0,km:0,desnivel:0,rutas:new Set(),madrugador:false,fotos:0};
  lista.filter(r=>r.estado==='terminado'&&!r.simulado).forEach(r=>{
    s.n++;s.km+=r.distancia||0;s.desnivel+=r.desnivel||0;s.fotos+=(r.fotos||[]).length;
    if(r.completo)s.rutas.add(r.rutaId);if(new Date(r.inicio).getHours()<7)s.madrugador=true;});
  return s;
}
const insigniasGanadas=lista=>{const s=resumenInsignias(lista);return new Set(INSIGNIAS.filter(x=>x[4](s)).map(x=>x[0]));};
function insigniasHTML(gan){
  return '<ul class="insignias" aria-label="Insignias">'+INSIGNIAS.map(([k,ic,t,d])=>{const ok=gan.has(k);
    return '<li class="insignia'+(ok?' ganada':'')+'"><span class="ins-ic" aria-hidden="true">'+icon(ok?ic:'lock',22)+'</span><b>'+t+'</b><small>'+(ok?'Ganada':d)+'</small></li>';}).join('')+'</ul>';
}

/* ---------- Mis recorridos ---------- */
async function renderRecorridos(){
  const cuerpo=$('#cuerpo');
  cuerpo.innerHTML='<div class="vista"><div class="dash-top"><h2>Mis recorridos</h2></div><div class="vacio">'+icon('loader-circle',40,'gira')+'</div></div>';
  let lista=[];try{lista=await IDB.todos('recorridos');}catch(e){}
  if(vistaActual().tipo!=='recorridos')return;
  lista.sort((a,b)=>b.inicio-a.inicio);
  const gan=insigniasGanadas(lista),s=resumenInsignias(lista);
  cuerpo.innerHTML='<div class="vista"><div class="dash-top"><h2>Mis recorridos</h2></div>'
    +'<div class="metricas"><div class="metrica">'+icon('footprints',18)+'<b>'+s.n+'</b><span>Recorridos</span></div><div class="metrica">'+icon('route',18)+'<b>'+fmtKm(s.km)+'</b><span>Distancia total</span></div>'
    +'<div class="metrica">'+icon('trending-up',18)+'<b>'+s.desnivel+' m</b><span>Desnivel total</span></div><div class="metrica">'+icon('award',18)+'<b>'+gan.size+' de '+INSIGNIAS.length+'</b><span>Insignias</span></div></div>'
    +'<p class="dash-section">Insignias</p>'+insigniasHTML(gan)
    +'<p class="dash-section">Historial</p>'
    +(lista.length?lista.map(r=>'<article class="rec-item"><button class="rec-link" data-rec="'+esc(r.id)+'" aria-label="Ver '+esc(r.nombre)+' del '+fechaCorta(r.inicio)+'"></button>'
        +'<span class="rec-ic" aria-hidden="true">'+icon(r.completo?'flag':'footprints',22)+'</span><div class="rec-tx"><b>'+esc(r.nombre)+'</b>'
        +'<span>'+fechaCorta(r.inicio)+' · '+fmtKm(r.distancia)+' · '+fmtDuracion(r.activo)+(r.estado==='grabando'?' · Sin terminar':'')+(r.simulado?' · Simulación':'')+'</span></div>'
        +'<button class="btn-redondo rec-borrar" data-borrar-rec="'+esc(r.id)+'" aria-label="Eliminar el recorrido '+esc(r.nombre)+' del '+fechaCorta(r.inicio)+'">'+icon('trash-2',18)+'</button></article>').join('')
      :'<div class="vacio">'+icon('footprints',48)+'<b>Aún no tienes recorridos</b><p>Abre un sendero con ruta y toca «Grabar recorrido». Todo queda guardado en tu teléfono.</p>'
        +'<button class="btn btn-primario" id="recIrSenderos">Ver senderos</button></div>')
    +'<p class="nota-c izq">Tus recorridos y fotos se guardan solo en este teléfono. Si borras los datos del navegador o desinstalas la app, se pierden.</p>'
    +'</div>'+footerHTML();
  $$('[data-rec]').forEach(b=>b.onclick=()=>navegar({tipo:'recorrido',id:b.dataset.rec}));
  $$('[data-borrar-rec]').forEach(b=>b.onclick=async()=>{
    if(!await confirmar('Eliminar recorrido','Se borran el trazado y sus fotos de este teléfono. No se puede deshacer.','Eliminar','Cancelar','trash-2',true))return;
    if(grab.rec&&grab.rec.id===b.dataset.borrarRec){detenerSensores();grab.rec=null;pintarAvisoGrabando();}
    await borrarRecorrido(b.dataset.borrarRec);toast('Recorrido eliminado');render(true);});
  const ir=$('#recIrSenderos');if(ir)ir.onclick=()=>navegar({tipo:'lista',cat:'turismo',sub:'sendero'});
  enlazarFooter();
}

/* ---------- Relive: el resumen de un recorrido ---------- */
function perfilRecorridoSVG(pts){
  const a=pts.filter(p=>p[2]!=null);if(a.length<3)return '';
  const w=320,h=84,v=a.map(p=>p[2]),min=Math.min(...v)-10,max=Math.max(...v)+10;
  const xy=a.map((p,i)=>(i/(a.length-1)*w).toFixed(1)+','+(h-(p[2]-min)/(max-min)*h).toFixed(1)).join(' ');
  return '<div class="elev-head"><span>Perfil de elevación</span><span>'+Math.round(min+10)+' – '+Math.round(max-10)+' m s. n. m.</span></div>'
    +'<svg viewBox="0 0 '+w+' '+(h+4)+'" class="perfil-elev" preserveAspectRatio="none" role="img" aria-label="Perfil de elevación de tu recorrido"><polygon class="area" points="0,'+h+' '+xy+' '+w+','+h+'"/><polyline class="linea" points="'+xy+'"/></svg>';
}
async function renderRecorrido(id){
  const cuerpo=$('#cuerpo');
  const r=await IDB.obtener('recorridos',id).catch(()=>null);
  if(vistaActual().tipo!=='recorrido')return;
  if(!r){cuerpo.innerHTML='<div class="vacio">'+icon('footprints',48)+'<b>Recorrido no encontrado</b></div>';return;}
  const fotos=await IDB.fotosDe(id).catch(()=>[]);
  const todos=await IDB.todos('recorridos').catch(()=>[]);
  const antes=insigniasGanadas(todos.filter(x=>x.id!==id)),ahora=insigniasGanadas(todos);
  const nuevas=INSIGNIAS.filter(x=>ahora.has(x[0])&&!antes.has(x[0]));
  cuerpo.innerHTML='<div class="vista relive">'
    +'<div class="relive-head"><span class="relive-tag">'+icon(r.completo?'flag':'footprints',14)+(r.completo?'Meta alcanzada':r.estado==='grabando'?'Sin terminar':'Recorrido')+(r.simulado?' · Simulación':'')+'</span>'
    +'<h2>'+esc(r.nombre)+'</h2><p>'+fechaHora(r.inicio)+'</p></div>'
    +'<div class="ruta-stats"><div><b>'+fmtKm(r.distancia)+'</b><span>Distancia</span></div><div><b>'+fmtDuracion(r.activo)+'</b><span>Tiempo</span></div>'
    +'<div><b>'+(r.desnivel||0)+' m</b><span>Desnivel</span></div><div><b>'+fmtRitmo(r.activo,r.distancia)+'</b><span>Ritmo</span></div></div>'
    +(nuevas.length?'<div class="relive-nuevas" role="status">'+icon('award',20)+'<span><b>¡Nueva insignia!</b> '+nuevas.map(x=>x[2]).join(', ')+'</span></div>':'')
    +perfilRecorridoSVG(r.puntos)
    +(fotos.length?'<div class="relive-fotos" aria-label="Fotos del recorrido">'+fotos.map((f,i)=>'<img src="'+f.data+'" alt="Foto '+(i+1)+' del recorrido">').join('')+'</div>':'')
    +'<div class="relive-acc">'
    +'<button class="btn btn-primario btn-bloque" id="rlVer3D"'+(r.puntos.length<2?' disabled':'')+'>'+icon('mountain',18)+'Ver mi recorrido en 3D</button>'
    +'<button class="btn btn-secundario btn-bloque" id="rlVideo"'+(r.puntos.length<2?' disabled':'')+'>'+icon('video',18)+'Crear video para compartir</button>'
    +'<button class="btn btn-secundario btn-bloque" id="rlTarjeta"'+(r.puntos.length<2?' disabled':'')+'>'+icon('image',18)+'Compartir tarjeta</button>'
    +(esAdmin()&&r.rutaId&&r.puntos.length>=20&&!r.simulado?'<button class="btn btn-secundario btn-bloque" id="rlTrazado">'+icon('download',18)+'Descargar trazado para la ruta (GeoJSON)</button>':'')
    +'<button class="btn btn-ghost btn-bloque" id="rlMis">'+icon('award',18)+'Mis recorridos e insignias</button></div>'
    +(r.puntos.length<2?'<p class="nota-c">Este recorrido no alcanzó a guardar suficientes puntos de GPS para dibujarlo.</p>':'')
    +'</div>'+footerHTML();
  const datos3D=()=>({titulo:r.nombre,linea:r.puntos.map(p=>[p[0],p[1]]),fotos,rec:r});
  $('#rlVer3D').onclick=()=>abrir3D(datos3D());
  $('#rlVideo').onclick=()=>abrir3D({...datos3D(),video:true});
  $('#rlTarjeta').onclick=()=>compartirTarjeta(r,fotos);
  $('#rlMis').onclick=()=>navegar({tipo:'recorridos'});
  const rt=$('#rlTrazado');if(rt)rt.onclick=()=>{const g=trazadoParaRutas(r);if(!g)return;
    entregarArchivo(new File([JSON.stringify(g)],r.rutaId+'.geojson',{type:'application/geo+json'}),'Trazado de '+r.nombre);};
  enlazarFooter();
}

/* ---------- Vista 3D (MapLibre + relieve) con vuelo de cámara y video opcional ---------- */
const ESTILO_3D={claro:'https://tiles.openfreemap.org/styles/liberty',oscuro:'https://tiles.openfreemap.org/styles/dark'};
// Relieve: Terrarium (Mapzen / AWS) como terreno 3D y sombreado debajo de las etiquetas
function agregarRelieve(mapa){
  const dem={type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:15,
    attribution:'Relieve: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen / AWS Terrain Tiles</a>'};
  mapa.addSource('relieve',dem);mapa.addSource('sombras',{...dem});
  const etiquetas=(mapa.getStyle().layers||[]).find(l=>l.type==='symbol');
  mapa.addLayer({id:'sombras',type:'hillshade',source:'sombras',paint:{'hillshade-exaggeration':.35,'hillshade-shadow-color':cssVar('--tinta-fija'),'hillshade-highlight-color':cssVar('--blanco'),'hillshade-accent-color':cssVar('--tinta-fija')}},etiquetas&&etiquetas.id);
  mapa.setTerrain({source:'relieve',exaggeration:1.5});
}
// Punto y rumbo a una distancia (km) del inicio de la línea
function puntoEn(linea,acum,d){
  let i=acum.findIndex(x=>x>=d);if(i<=0)i=1;if(i<0)i=linea.length-1;
  const a=linea[i-1],b=linea[i],tramo=(acum[i]-acum[i-1])||1e-9,f=Math.min(1,Math.max(0,(d-acum[i-1])/tramo));
  return {p:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],i};
}
function rumbo(a,b){const r=x=>x*Math.PI/180,y=Math.sin(r(b[1]-a[1]))*Math.cos(r(b[0])),x=Math.cos(r(a[0]))*Math.sin(r(b[0]))-Math.sin(r(a[0]))*Math.cos(r(b[0]))*Math.cos(r(b[1]-a[1]));return (Math.atan2(y,x)*180/Math.PI+360)%360;}
let vista3D=null;
async function abrir3D(o){
  if(!estado.online){toast('La vista 3D necesita conexión a internet');return;}
  if(!soporta3D()){toast('Tu teléfono no puede mostrar mapas 3D');return;}
  const volverA=document.activeElement;
  const cont=document.createElement('div');cont.className='tres-d';cont.setAttribute('role','dialog');cont.setAttribute('aria-modal','true');cont.setAttribute('aria-label','Recorrido en 3D: '+o.titulo);
  cont.innerHTML='<div class="td-mapa" id="tdMapa"></div>'
    +'<div class="td-top"><button class="btn-redondo" id="tdCerrar" aria-label="Cerrar la vista 3D">'+icon('x',20)+'</button><div class="td-tit"><b>'+esc(o.titulo)+'</b><small id="tdEstado">Cargando relieve…</small></div></div>'
    +'<div class="td-abajo"><div class="td-barra" aria-hidden="true"><span id="tdAvance"></span></div>'
    +'<div class="td-btns"><button class="btn btn-primario" id="tdPlay">'+icon('play',18)+'Recorrer</button>'
    +(o.video?'<button class="btn btn-secundario" id="tdGrabar">'+icon('video',18)+'Grabar video</button>':'')+'</div></div>';
  document.body.appendChild(cont);
  const cerrar3D=()=>{if(!vista3D)return;cancelAnimationFrame(vista3D.raf);if(vista3D.grabador&&vista3D.grabador.state==='recording')vista3D.grabador.stop();
    try{vista3D.mapa.remove();}catch(e){}cont.remove();document.removeEventListener('keydown',tecla);vista3D=null;if(volverA&&volverA.focus)volverA.focus();};
  const tecla=e=>{if(e.key==='Escape')cerrar3D();};
  document.addEventListener('keydown',tecla);
  $('#tdCerrar').onclick=cerrar3D;$('#tdCerrar').focus();
  try{await cargarMapLibre();}catch(e){toast('No se pudo cargar el mapa 3D');cerrar3D();return;}
  if(!document.body.contains(cont))return;
  const linea=o.linea.map(p=>[p[1],p[0]]);   // MapLibre usa [lng, lat]
  const acum=[0];for(let i=1;i<o.linea.length;i++)acum.push(acum[i-1]+distanciaKm(o.linea[i-1],o.linea[i]));
  const total=acum[acum.length-1]||0;
  const lim=linea.reduce((b,p)=>[[Math.min(b[0][0],p[0]),Math.min(b[0][1],p[1])],[Math.max(b[1][0],p[0]),Math.max(b[1][1],p[1])]],[[180,90],[-180,-90]]);
  const mapa=new maplibregl.Map({container:'tdMapa',style:temaOscuro()?ESTILO_3D.oscuro:ESTILO_3D.claro,bounds:lim,fitBoundsOptions:{padding:60},pitch:55,maxPitch:75,
    preserveDrawingBuffer:!!o.video,attributionControl:{compact:false},fadeDuration:0});
  vista3D={mapa,raf:0,grabador:null,cont};
  vista3D.k=0;vista3D.idx=0;
  mapa.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');
  const fotosMarc=[];
  mapa.on('load',()=>{
    try{agregarRelieve(mapa);}catch(e){}
    $('#tdEstado').textContent=fmtKm(total)+' · Toca «Recorrer» para volar por el sendero';
    mapa.addSource('ruta',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:linea}}});
    mapa.addSource('avance',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:linea.slice(0,1)}}});
    mapa.addLayer({id:'ruta-borde',type:'line',source:'ruta',paint:{'line-color':cssVar('--blanco'),'line-width':['interpolate',['linear'],['zoom'],11,6,16,11],'line-opacity':.7},layout:{'line-cap':'round','line-join':'round'}});
    mapa.addLayer({id:'ruta',type:'line',source:'ruta',paint:{'line-color':cssVar('--primary-500'),'line-width':['interpolate',['linear'],['zoom'],11,3.5,16,6]},layout:{'line-cap':'round','line-join':'round'}});
    mapa.addLayer({id:'avance',type:'line',source:'avance',paint:{'line-color':cssVar('--sun-400'),'line-width':['interpolate',['linear'],['zoom'],11,4,16,7]},layout:{'line-cap':'round','line-join':'round'}});
    (o.fotos||[]).filter(f=>f.lat!=null).forEach(f=>{const el=document.createElement('div');el.className='td-foto';el.innerHTML='<img src="'+f.data+'" alt="">';
      fotosMarc.push({f,m:new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([f.lng,f.lat]).addTo(mapa),el});});
  });
  // Vuelo: la cámara sigue el trazado mirando un poco adelante; la duración crece con la distancia
  const DUR=Math.min(40000,Math.max(12000,total*7000));
  let rumboSuave=null;
  function volar(alTerminar){
    cancelAnimationFrame(vista3D.raf);const t0=performance.now();
    fotosMarc.forEach(x=>x.el.classList.remove('visible'));
    const paso=ahora=>{
      if(!vista3D)return;
      const k=Math.min(1,(ahora-t0)/DUR),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,d=total*e;
      const {p,i}=puntoEn(o.linea,acum,d),mira=puntoEn(o.linea,acum,Math.min(total,d+Math.max(.15,total*.08))).p;
      let b=rumbo(p,mira);if(rumboSuave==null)rumboSuave=b;let dif=((b-rumboSuave+540)%360)-180;rumboSuave=(rumboSuave+dif*.06+360)%360;
      mapa.jumpTo({center:[p[1],p[0]],bearing:rumboSuave,pitch:62,zoom:15.3});
      const coords=linea.slice(0,i);coords.push([p[1],p[0]]);
      const src=mapa.getSource('avance');if(src)src.setData({type:'Feature',geometry:{type:'LineString',coordinates:coords}});
      fotosMarc.forEach(x=>{if(x.f.i<=i)x.el.classList.add('visible');});
      vista3D.k=k;vista3D.idx=i;
      $('#tdAvance').style.width=(k*100)+'%';
      $('#tdEstado').textContent=fmtKm(d)+' de '+fmtKm(total);
      if(k<1)vista3D.raf=requestAnimationFrame(paso);
      else{mapa.fitBounds(lim,{padding:60,pitch:50,duration:sinMovimiento()?0:1500});if(alTerminar)setTimeout(alTerminar,sinMovimiento()?100:1700);}
    };
    vista3D.raf=requestAnimationFrame(paso);
  }
  $('#tdPlay').onclick=()=>{if(mapa.loaded()||mapa.isStyleLoaded())volar();else mapa.once('load',()=>volar());};
  const bg=$('#tdGrabar');
  if(bg)bg.onclick=()=>grabarVideo3D(mapa,o,volar,bg);
}
/* Video: cada cuadro del mapa 3D se copia a un lienzo vertical 1080 x 1920 con los datos encima y MediaRecorder lo graba */
function tipoVideo(){
  if(!window.MediaRecorder)return null;
  return ['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||null;
}
async function grabarVideo3D(mapa,o,volar,boton){
  const tipo=tipoVideo();
  const lienzo=document.createElement('canvas');lienzo.width=1080;lienzo.height=1920;
  if(!tipo||!lienzo.captureStream){toast('Este navegador no puede grabar video. Usa «Compartir tarjeta».');return;}
  const ctx=lienzo.getContext('2d'),fuente=getComputedStyle(document.body).fontFamily,r=o.rec;
  const fotos=await Promise.all([...(o.fotos||[])].sort((a,b)=>(a.i||0)-(b.i||0)).map(f=>cargarImagen(f.data).then(img=>({f,img})).catch(()=>null))).then(l=>l.filter(Boolean));
  const C=n=>cssVarClaro(n);
  let iFotoVista=-1,desde=0;
  function cuadro(){
    const fuente2=mapa.getCanvas(),W=1080,H=1920;
    ctx.fillStyle=C('--tinta-fija');ctx.fillRect(0,0,W,H);
    // El mapa llena el lienzo vertical (recorte tipo "cover")
    const s=Math.max(W/fuente2.width,H/fuente2.height),w=fuente2.width*s,h=fuente2.height*s;
    try{ctx.drawImage(fuente2,(W-w)/2,(H-h)/2,w,h);}catch(e){}
    const velo=C('--velo-escaner');
    const g1=ctx.createLinearGradient(0,0,0,360);g1.addColorStop(0,velo);g1.addColorStop(1,'transparent');ctx.fillStyle=g1;ctx.fillRect(0,0,W,360);
    const g2=ctx.createLinearGradient(0,H-520,0,H);g2.addColorStop(0,'transparent');g2.addColorStop(1,velo);ctx.fillStyle=g2;ctx.fillRect(0,H-520,W,520);
    ctx.fillStyle=C('--blanco');ctx.textBaseline='alphabetic';
    ctx.font='800 64px '+fuente;ctx.fillText(recortar(ctx,r.nombre,W-120),60,130);
    ctx.font='500 36px '+fuente;ctx.fillText(fechaCorta(r.inicio)+' · Fusa Conecta',60,190);
    const stats=[[fmtKm(r.distancia),'Distancia'],[fmtDuracion(r.activo),'Tiempo'],[(r.desnivel||0)+' m','Desnivel']];
    stats.forEach(([v,t],k)=>{const x=60+k*330;ctx.font='700 58px '+fuente;ctx.fillText(v,x,H-170);ctx.font='500 32px '+fuente;ctx.fillText(t,x,H-120);});
    ctx.fillStyle=C('--sun-400');ctx.fillRect(60,H-70,(W-120)*Math.min(1,vista3D?vista3D.k:1),10);
    // La foto del punto por donde va el vuelo aparece unos segundos
    const idx=vista3D?vista3D.idx:0,ultima=fotos.reduce((u,x,n)=>x.f.i!=null&&x.f.i<=idx?n:u,-1);
    if(ultima>iFotoVista){iFotoVista=ultima;desde=performance.now();}
    if(iFotoVista>=0&&performance.now()-desde<2200){
      const im=fotos[iFotoVista].img,fw=760,fh=Math.round(fw*im.height/im.width);
      ctx.fillStyle=C('--blanco');ctx.fillRect((W-fw)/2-14,560-14,fw+28,Math.min(fh,900)+28);
      ctx.drawImage(im,0,0,im.width,Math.min(im.height,im.width*900/fw),(W-fw)/2,560,fw,Math.min(fh,900));
    }
  }
  const flujo=lienzo.captureStream(30),grab2=new MediaRecorder(flujo,{mimeType:tipo,videoBitsPerSecond:6000000}),trozos=[];
  vista3D.grabador=grab2;
  grab2.ondataavailable=e=>{if(e.data&&e.data.size)trozos.push(e.data);};
  let activo=true;const bucle=()=>{if(!activo)return;cuadro();requestAnimationFrame(bucle);};
  grab2.onstop=async()=>{
    activo=false;boton.disabled=false;boton.innerHTML=icon('video',18)+'Grabar video';
    if(!trozos.length)return;
    const ext=tipo.includes('mp4')?'mp4':'webm',blob=new Blob(trozos,{type:tipo.split(';')[0]});
    const archivo=new File([blob],'recorrido-fusa-conecta.'+ext,{type:blob.type});
    medir('recorrido_video',{ext});
    entregarArchivo(archivo,'Mi recorrido por '+r.nombre+' en Fusa Conecta');
  };
  boton.disabled=true;boton.innerHTML=icon('loader-circle',18,'gira')+'Grabando…';
  grab2.start(500);bucle();
  volar(()=>{setTimeout(()=>{if(grab2.state==='recording')grab2.stop();},1200);});
}
function recortar(ctx,t,max){if(ctx.measureText(t).width<=max)return t;while(t.length>3&&ctx.measureText(t+'…').width>max)t=t.slice(0,-1);return t+'…';}
// Compartir con el menú del teléfono (WhatsApp, Instagram...) o descargar si no se puede
async function entregarArchivo(archivo,texto){
  try{if(navigator.canShare&&navigator.canShare({files:[archivo]})){await navigator.share({files:[archivo],title:'Fusa Conecta',text:texto});return;}}catch(e){if(e&&e.name==='AbortError')return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(archivo);a.download=archivo.name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('Guardado en tus descargas');
}
/* Tarjeta 1080 x 1920 (sin mapa: trazado dibujado, perfil de elevación, datos y fotos). Colores del tema claro. */
async function compartirTarjeta(r,fotos){
  const W=1080,H=1920,cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const ctx=cv.getContext('2d'),C=n=>cssVarClaro(n),fuente=getComputedStyle(document.body).fontFamily;
  ctx.fillStyle=C('--primary-500');ctx.fillRect(0,0,W,H);
  ctx.fillStyle=C('--primary-600');ctx.beginPath();ctx.arc(W+80,-60,520,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=C('--blanco');ctx.textBaseline='alphabetic';
  ctx.font='600 40px '+fuente;ctx.fillText(r.completo?'META ALCANZADA':'MI RECORRIDO',80,150);
  ctx.font='800 76px '+fuente;ctx.fillText(recortar(ctx,r.nombre,W-160),80,250);
  ctx.font='500 38px '+fuente;ctx.fillText(fechaHora(r.inicio),80,310);
  // Trazado normalizado dentro de un recuadro (norte arriba)
  const pts=r.puntos,cx={x:80,y:380,w:W-160,h:760};
  const la=pts.map(p=>p[0]),lo=pts.map(p=>p[1]),mla=Math.min(...la),xla=Math.max(...la),mlo=Math.min(...lo),xlo=Math.max(...lo);
  const k=Math.cos(((mla+xla)/2)*Math.PI/180),ew=(xlo-mlo)*k||1e-6,eh=(xla-mla)||1e-6,s=Math.min(cx.w/ew,cx.h/eh)*.9;
  const X=p=>cx.x+cx.w/2+((p[1]-(mlo+xlo)/2)*k)*s,Y=p=>cx.y+cx.h/2-(p[0]-(mla+xla)/2)*s;
  ctx.fillStyle=C('--blanco-14');ctx.beginPath();ctx.roundRect?ctx.roundRect(cx.x-20,cx.y-20,cx.w+40,cx.h+40,40):ctx.rect(cx.x-20,cx.y-20,cx.w+40,cx.h+40);ctx.fill();
  ctx.lineJoin=ctx.lineCap='round';
  ctx.strokeStyle=C('--blanco');ctx.lineWidth=22;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(X(p),Y(p)):ctx.moveTo(X(p),Y(p)));ctx.stroke();
  ctx.strokeStyle=C('--sun-400');ctx.lineWidth=12;ctx.stroke();
  const punto=(p,col)=>{ctx.fillStyle=C('--blanco');ctx.beginPath();ctx.arc(X(p),Y(p),22,0,Math.PI*2);ctx.fill();ctx.fillStyle=C(col);ctx.beginPath();ctx.arc(X(p),Y(p),13,0,Math.PI*2);ctx.fill();};
  punto(pts[0],'--mint-600');punto(pts[pts.length-1],'--primary-700');
  // Datos
  ctx.fillStyle=C('--blanco');
  [[fmtKm(r.distancia),'Distancia'],[fmtDuracion(r.activo),'Tiempo'],[(r.desnivel||0)+' m','Desnivel']].forEach(([v,t],i)=>{
    const x=80+i*320;ctx.font='700 60px '+fuente;ctx.fillText(v,x,1260);ctx.font='500 32px '+fuente;ctx.fillText(t,x,1308);});
  // Perfil de elevación
  const al=pts.filter(p=>p[2]!=null);
  if(al.length>2){const v=al.map(p=>p[2]),mn=Math.min(...v),mx=Math.max(...v)||mn+1,px=80,py=1360,pw=W-160,ph=170;
    ctx.fillStyle=C('--blanco-20');ctx.beginPath();ctx.moveTo(px,py+ph);
    al.forEach((p,i)=>ctx.lineTo(px+i/(al.length-1)*pw,py+ph-(p[2]-mn)/((mx-mn)||1)*ph));ctx.lineTo(px+pw,py+ph);ctx.closePath();ctx.fill();}
  // Hasta 3 fotos
  const imgs=await Promise.all((fotos||[]).slice(0,3).map(f=>cargarImagen(f.data).catch(()=>null))).then(l=>l.filter(Boolean));
  imgs.forEach((im,i)=>{const t=290,x=80+i*(t+25),y=1570;ctx.save();ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,t,t*.66,24):ctx.rect(x,y,t,t*.66);ctx.clip();
    const sc=Math.max(t/im.width,t*.66/im.height);ctx.drawImage(im,x+(t-im.width*sc)/2,y+(t*.66-im.height*sc)/2,im.width*sc,im.height*sc);ctx.restore();});
  // Marca
  const iso=await imagenDeSVG(isoSVG('','lila',true).replace('<svg ','<svg width="194" height="276" ')).catch(()=>null);
  ctx.fillStyle=C('--blanco');ctx.font='800 44px '+fuente;
  if(iso)ctx.drawImage(iso,W-80-44-240,H-112,44,62);
  ctx.fillText('Fusa Conecta',W-80-232,H-62);
  const blob=await new Promise(ok=>cv.toBlob(ok,'image/png'));
  medir('recorrido_tarjeta');
  entregarArchivo(new File([blob],'recorrido-fusa-conecta.png',{type:'image/png'}),'Mi recorrido por '+r.nombre+' en Fusa Conecta');
}

async function renderRuta(id){
  const d=buscar(id),r=RUTAS[id];const cuerpo=$('#cuerpo');
  if(!d||!r){cuerpo.innerHTML='<div class="vacio">'+icon('route',48)+'<b>Ruta no disponible</b></div>';return;}
  cuerpo.innerHTML='<div class="vista-ruta">'
    +'<div id="mapaRuta">'+(estado.online?'':'<div class="mapa-off">'+icon('wifi-off',24)+'Mapa base sin conexión. La ruta y tu progreso siguen disponibles.</div>')+'</div>'
    +'<div class="ruta-panel"><h2>'+esc(r.nombre)+'</h2>'
    +'<div class="ruta-stats"><div><b>'+String(r.distanciaTotal).replace('.',',')+' km</b><span>Distancia</span></div><div><b>'+esc(r.duracionEstimada)+'</b><span>Tiempo</span></div><div><b>'+(r.elevacionMaxima-r.elevacionMinima)+' m</b><span>Desnivel</span></div><div><b>'+esc(r.dificultad)+'</b><span>Dificultad</span></div></div>'
    +'<div class="elev-head"><span>Perfil de elevación</span><span>'+r.elevacionMinima+' – '+r.elevacionMaxima+' m s. n. m.</span></div>'+perfilSVG(r)
    +'<div id="grabPendiente"></div>'
    +'<div class="ruta-prog" id="rutaProg" role="status">'+icon('navigation',18)+'<span>Toca «Grabar recorrido» para seguir tu posición y guardar tu recorrido con fotos.</span></div>'
    +'<div class="grab-panel" id="grabPanel" hidden><div class="grab-datos" aria-live="off"><div><b id="gTiempo">0 min</b><span>Tiempo</span></div><div><b id="gDist">0,00 km</b><span>Distancia</span></div><div><b id="gDesn">0 m</b><span>Desnivel</span></div></div>'
    +'<div class="grab-btns"><button class="btn btn-secundario" id="gPausa">'+icon('pause',18)+'Pausar</button>'
    +'<label class="btn btn-secundario" id="gFotoBtn">'+icon('camera',18)+'Foto<input type="file" accept="image/*" capture="environment" id="gFoto" class="sr-only"></label>'
    +'<button class="btn btn-primario" id="gTerminar">'+icon('square',18)+'Terminar</button></div>'
    +'<p class="ruta-nota">La pantalla se mantiene encendida mientras grabas. Si bloqueas el teléfono, el GPS puede detenerse.</p></div>'
    +'<div class="ruta-btns" id="rutaBtns"><button class="btn btn-primario" id="rIniciar">'+icon('play')+'Grabar recorrido</button><button class="btn btn-secundario" id="rSimular">Simular</button></div>'
    +'<div id="r3DCaja"><p class="trazado-prep" role="status">'+icon('route',16)+'Trazado en preparación. Pronto podrás recorrer esta ruta en 3D.</p></div>'
    +'<button class="btn btn-ghost btn-bloque" id="rMis">'+icon('award',18)+'Mis recorridos e insignias</button>'
    +'<p class="ruta-nota">Trazado de referencia: verifica siempre la señalización del sendero. La ruta queda guardada en tu teléfono para consultarla sin conexión.</p>'
    +r.puntosInteres.map(p=>'<div class="poi">'+icon('map-pin')+'<div><b>'+esc(p.nombre)+'</b><small>'+esc(p.descripcion)+'</small></div></div>').join('')
    +'</div></div>';
  let marcadorUsuario=null,m=null,trazo=null;
  if(estado.online){
    try{
      await cargarLeaflet();
      if(vistaActual().tipo!=='ruta'||!$('#mapaRuta'))return;
      m=L.map('mapaRuta');mapaActivo=m;
      capaBase().addTo(m);
      const verde=cssVar('--primary-700'),blanco=cssVar('--bg');
      const linea=L.polyline(r.rutaWaypoints,{color:verde,weight:5,opacity:.9}).addTo(m);
      r.rutaWaypoints.forEach((w,i)=>L.circleMarker(w,{radius:5,color:verde,fillColor:blanco,fillOpacity:1,weight:2}).addTo(m).bindPopup('Punto '+(i+1)));
      r.puntosInteres.forEach(p=>L.marker(r.rutaWaypoints[p.wp],{icon:pinIcono('map-pin'),title:p.nombre}).addTo(m).bindPopup('<b>'+esc(p.nombre)+'</b><br><small>'+esc(p.descripcion)+'</small>'));
      L.marker(r.puntoLlegada,{icon:pinIcono('flag','pin-fc meta'),title:'Punto de llegada'}).addTo(m).bindPopup('Punto de llegada');
      m.fitBounds(linea.getBounds(),{padding:[24,24]});
      setTimeout(()=>m.invalidateSize(),200);
    }catch(e){}
  }
  if(vistaActual().tipo!=='ruta')return;
  const wps=r.rutaWaypoints;
  const restanteDesde=(pos,idx)=>{let s=distanciaKm(pos,wps[idx]);for(let i=idx;i<wps.length-1;i++)s+=distanciaKm(wps[i],wps[i+1]);return s;};
  const prog=html=>{const e=$('#rutaProg');if(e)e.innerHTML=icon('navigation',18)+'<span>'+html+'</span>';};
  // Tu trazo grabado (amarillo) sobre la ruta de referencia
  function pintarTrazo(){
    const rec=grab.rec;if(!m||!rec)return;
    const pts=rec.puntos.map(p=>[p[0],p[1]]);
    if(!trazo)trazo=L.polyline(pts,{color:cssVar('--sun-800'),weight:4,opacity:.95}).addTo(m);else trazo.setLatLngs(pts);
  }
  function pintarDatos(){
    const rec=grab.rec;if(!rec||!$('#gTiempo'))return;
    $('#gTiempo').textContent=fmtDuracion(tiempoActivo(rec));$('#gDist').textContent=fmtKm(distanciaDe(rec.puntos));$('#gDesn').textContent=desnivelPositivo(rec.puntos)+' m';
    $('#gPausa').innerHTML=grab.pausado?icon('play',18)+'Seguir':icon('pause',18)+'Pausar';
  }
  function modoGrabando(on){
    $('#grabPanel').hidden=!on;$('#rutaBtns').hidden=on;$('#grabPendiente').innerHTML='';
    if(on){pintarDatos();pintarTrazo();}
  }
  async function terminar(completo){
    const rec=await terminarGrabacion(completo);
    if(!rec)return;
    if(rec.puntos.length<2){toast('El recorrido quedó guardado, pero sin suficientes puntos de GPS');}
    navegar({tipo:'recorrido',id:rec.id});
  }
  function actualizar(pos){
    if(vistaActual().tipo!=='ruta'||vistaActual().id!==id)return;
    if(m){if(!marcadorUsuario)marcadorUsuario=L.marker(pos,{icon:pinUsuario(),title:'Tu posición'}).addTo(m);else marcadorUsuario.setLatLng(pos);
      if(grab.sim)m.panTo(pos);}
    pintarTrazo();pintarDatos();
    let cerca=0,best=Infinity;wps.forEach((w,i)=>{const k=distanciaKm(pos,w);if(k<best){best=k;cerca=i;}});
    const sig=Math.min(cerca+(best<0.03?1:0),wps.length-1);
    if(distanciaKm(pos,r.puntoLlegada)<0.04&&grab.rec&&grab.rec.rutaId===id){
      prog('<b>¡Llegaste!</b> Completaste '+esc(r.nombre)+'.');
      terminar(true);return;
    }
    prog('Siguiente punto: <b>'+fmtDist(distanciaKm(pos,wps[sig]))+'</b> · Falta para la meta: <b>'+fmtDist(restanteDesde(pos,sig))+'</b>');
  }
  grab.alCambiar=p=>{if(p)actualizar(p);else{pintarDatos();if(!grab.rec)modoGrabando(false);}};
  // Reloj del panel mientras se graba en esta pantalla
  const reloj=setInterval(()=>{if(vistaActual().tipo!=='ruta'||!$('#gTiempo')){clearInterval(reloj);return;}pintarDatos();},1000);
  $('#rIniciar').onclick=async()=>{
    if(grab.rec){toast('Ya estás grabando un recorrido');return;}
    if(!navigator.geolocation){toast('Tu dispositivo no permite usar el GPS');return;}
    await empezarGrabacion(id,false);modoGrabando(true);prog('Buscando tu ubicación GPS…');
  };
  $('#rSimular').onclick=async()=>{
    if(grab.rec){toast('Ya estás grabando un recorrido');return;}
    await empezarGrabacion(id,true);modoGrabando(true);
    // Puntos intermedios con la altura del perfil de la ruta (para probar sin salir de casa)
    const pts=[];const per=r.perfilElevacion;
    for(let i=0;i<wps.length-1;i++)for(let k=0;k<8;k++){const f=k/8;pts.push([wps[i][0]+(wps[i+1][0]-wps[i][0])*f,wps[i][1]+(wps[i+1][1]-wps[i][1])*f]);}
    pts.push(r.puntoLlegada);
    pts.forEach((p,i)=>{p[2]=Math.round(per[Math.min(per.length-1,Math.floor(i/(pts.length-1)*(per.length-1)))]);});
    let i=0;grab.sim=setInterval(()=>{if(!grab.rec||grab.pausado)return;if(i>=pts.length){clearInterval(grab.sim);grab.sim=null;return;}
      sumarPunto(pts[i++],5);},450);
  };
  $('#gPausa').onclick=()=>{grab.pausado?reanudarGrabacion():pausarGrabacion();pintarDatos();prog(grab.pausado?'Recorrido en pausa. El tiempo no corre.':'Grabando de nuevo.');};
  $('#gFoto').onchange=async e=>{await fotoDeRecorrido(e.target.files[0]);e.target.value='';};
  $('#gTerminar').onclick=async()=>{
    if(!await confirmar('Terminar recorrido','Se guarda en «Mis recorridos» y podrás verlo en 3D, crear un video y compartir tu tarjeta.','Terminar','Seguir grabando','flag'))return;
    terminar(false);
  };
  trazadoReal(id).then(coords=>{
    const caja=$('#r3DCaja');if(!coords||!caja)return;
    caja.innerHTML='<button class="btn btn-tonal btn-bloque mt-16" id="r3D">'+icon('mountain',18)+'Recorrer en 3D</button>';
    $('#r3D').onclick=()=>abrir3D({titulo:r.nombre,linea:coords.map(c=>[c[0],c[1]])});
    // El trazado real reemplaza la línea de referencia en el mapa
    if(m&&mapaActivo===m)L.polyline(coords.map(c=>[c[0],c[1]]),{color:cssVar('--primary-700'),weight:5,opacity:.95}).addTo(m);
  });
  $('#rMis').onclick=()=>navegar({tipo:'recorridos'});
  // Volviste a esta pantalla mientras grababas, o quedó un recorrido sin terminar tras cerrar la app
  if(grab.rec&&grab.rec.rutaId===id){modoGrabando(true);const u=grab.rec.puntos[grab.rec.puntos.length-1];if(u)actualizar([u[0],u[1]]);}
  else if(!grab.rec){
    const pend=await recorridoSinTerminar();
    if(pend&&vistaActual().tipo==='ruta'&&$('#grabPendiente')){
      $('#grabPendiente').innerHTML='<div class="grab-pend" role="status">'+icon('footprints',20)+'<span>Tienes un recorrido sin terminar: <b>'+esc(pend.nombre)+'</b> ('+fmtKm(pend.distancia)+').</span>'
        +'<div class="dc-actions">'+(pend.rutaId===id?'<button class="btn btn-primario btn-sm" id="gpSeguir">Continuar</button>':'')+'<button class="btn btn-secundario btn-sm" id="gpCerrar">Terminarlo</button></div></div>';
      const s=$('#gpSeguir');if(s)s.onclick=async()=>{await continuarGrabacion(pend);modoGrabando(true);prog('Grabando de nuevo.');};
      $('#gpCerrar').onclick=async()=>{grab.rec=pend;pend.reanudado=null;grab.pausado=true;const rec=await terminarGrabacion(false);navegar({tipo:'recorrido',id:rec.id});};
    }
  }
}

/* ===== EMERGENCIAS SIN CONEXIÓN (RF-16, RNF-02, CU-14) ===== */
function renderSOS(){
  const cuerpo=$('#cuerpo');
  const mun=estado.sosMunicipio;const lista=listaEmergencias(mun);
  const sync=(estado.emergencias[mun]&&estado.emergencias[mun].actualizado)||ls.get('fc_sos_sync',Date.now());
  ls.set('fc_sos_consulta',Date.now());
  const grupos={};lista.forEach(e=>(grupos[e.tipo]=grupos[e.tipo]||[]).push(e));
  cuerpo.innerHTML='<div class="vista">'
    +'<div class="sos-head"><h2>'+icon('siren',24)+'Emergencias</h2><p>'+icon('circle-check',16)+'Disponible sin conexión · Actualizado: '+fechaCorta(sync)+'</p></div>'
    +'<div class="seg" role="tablist" aria-label="Municipio"><button data-mun="fusagasuga" role="tab" aria-selected="'+(mun==='fusagasuga')+'" class="'+(mun==='fusagasuga'?'on':'')+'">Fusagasugá</button><button data-mun="pasca" role="tab" aria-selected="'+(mun==='pasca')+'" class="'+(mun==='pasca'?'on':'')+'">Pasca</button></div>'
    +(mun==='pasca'?'<p class="sos-nota">Líneas nacionales que operan en Pasca, Cundinamarca.</p>':'')
    +Object.entries(grupos).map(([tipo,l])=>'<h3 class="sos-grupo">'+esc(tipo)+'</h3>'+l.map(e=>
      '<div class="sos-fila"><span class="sos-ic">'+icon(iconoEmergencia(e))+'</span><div class="sos-info"><b>'+esc(e.entidad)+'</b><span>'+esc(e.detalle)+'</span><span class="sos-num">'+esc(e.numero)+'</span></div>'
      +'<button class="sos-llamar" data-llamar="'+esc(e.numero)+'" data-ent="'+esc(e.entidad)+'" aria-label="Llamar a '+esc(e.entidad)+', '+esc(e.numero)+'">'+icon('phone')+'</button></div>').join('')).join('')
    +'</div>'+footerHTML();
  $$('.seg [data-mun]').forEach(b=>b.onclick=()=>{estado.sosMunicipio=b.dataset.mun;render();});
  $$('[data-llamar]').forEach(b=>b.onclick=()=>confirmarLlamada(b.dataset.ent,b.dataset.llamar));
  enlazarFooter();
}
function confirmarLlamada(entidad,numero){
  abrirHoja('<div class="hoja-pad hoja-centro"><div class="mc-ic peligro">'+icon('phone',28)+'</div><h2>'+esc(entidad)+'</h2><div class="num-grande">'+esc(numero)+'</div>'
    +'<div class="hoja-acc"><a class="btn btn-peligro btn-bloque" href="tel:'+esc(numero)+'">'+icon('phone')+'Llamar ahora</a>'
    +'<button class="btn btn-secundario btn-bloque" id="bCopiar">'+icon('copy')+'Copiar número</button></div>'
    +'<p class="nota">Esta información está guardada en tu teléfono y no requiere internet.</p>'
    +'<div class="mapa-off atenuado">'+icon('map',24)+'Mapa desactivado en modo emergencia</div></div>');
  $('#bCopiar').onclick=async()=>{try{await navigator.clipboard.writeText(numero);toast('Número copiado');}catch(e){toast('Número: '+numero);}};
}

/* ===== PERFIL (RF-04, RNF-05) ===== */
function renderPerfil(){
  const cuerpo=$('#cuerpo');
  if(!logueado()){
    cuerpo.innerHTML='<div class="vista"><div class="perfil-card"><div class="pf-av">'+icon('user',28)+'</div><h2>Estás explorando como invitado</h2>'
      +'<p>Crea tu cuenta gratis para guardar favoritos, calificar comercios y generar cupones de descuento.</p>'
      +'<div class="perfil-acc"><button class="btn btn-primario btn-bloque" id="pfRegistro">Crear cuenta</button><button class="btn btn-secundario btn-bloque" id="pfIngresar">Ya tengo cuenta</button>'
      +'<button class="btn btn-secundario btn-bloque" id="pfProductor">'+icon('store')+'Registrar mi negocio</button></div></div>'
      +'<button class="pf-item pf-suelto" id="pfAgenda">'+icon('calendar-days')+'<span class="flex-1">Agenda de eventos</span>'+icon('chevron-right')+'</button>'
    +'<button class="pf-item pf-suelto" id="pfRecorridos">'+icon('footprints')+'<span class="flex-1">Mis recorridos e insignias</span>'+icon('chevron-right')+'</button>'
    +'<button class="tarjeta-opinion" id="pfOpinion"><span class="to-ic">'+icon('message-circle-heart',22)+'</span><span class="to-tx"><b>Ayúdanos a mejorar</b><small>Cuéntanos qué te gustó y qué cambiarías</small></span>'+icon('chevron-right')+'</button>'
      +'<div class="seccion">'+(puedeInstalar()?'<button class="pf-item" id="pfInstalar">'+icon('download')+'Instalar la app en mi celular</button>':'')
      +'<button class="pf-item" id="pfLegal">'+icon('file-text')+'Aviso legal y privacidad (Ley 1581)</button></div></div>'+footerHTML();
    const pi=$('#pfInstalar');if(pi)pi.onclick=instalarApp;
    $('#pfRegistro').onclick=()=>abrirLogin('registro');$('#pfIngresar').onclick=()=>abrirLogin('ingresar');
    $('#pfProductor').onclick=registrarMiNegocio;$('#pfLegal').onclick=()=>abrir('ovLegal');
    $('#pfOpinion').onclick=()=>abrirOpinion('perfil');
  $('#pfRecorridos').onclick=()=>navegar({tipo:'recorridos'});
  $('#pfAgenda').onclick=()=>irAgenda();
    enlazarFooter();return;
  }
  const u=estado.usuario,p=estado.perfil||{};
  const cupones=cuponesLocales().filter(c=>estadoCupon(c)==='activo');
  const notifOn=p.notificaciones_push!==false;
  const rol=esAdmin()?['shield-check','Administrador']:esComerciante()?['store','Vecino con negocio']:esOrganizador()?['calendar-days','Organizador de eventos'+(organizadorConfiable()?' · confiable':'')]:['user','Vecino / turista'];
  const nAprobar=esAdmin()?porAprobar():0,nPrem=esAdmin()?premiumPorActivar():0;
  cuerpo.innerHTML='<div class="vista">'
    +(esAdmin()?'<button class="admin-card" id="pfAdmin"><span class="admin-ic">'+icon('shield-check',24)+'</span><span class="admin-tx"><b>Panel de administración</b>'
      +'<small>'+(nPrem?nPrem+' Premium por activar':'Aprueba comercios y activa Premium')+'</small></span>'
      +(nAprobar||nPrem?'<span class="globo alerta"><span class="punto-alerta" aria-hidden="true"></span>'+(nAprobar+nPrem)+' por aprobar</span>':'')+icon('chevron-right')+'</button>'
      +'<button class="pf-item pf-suelto" id="pfSplash">'+icon('play')+'<span class="flex-1">Ver animación de entrada</span>'+icon('chevron-right')+'</button>':'')
    +'<div class="perfil-card"><div class="pf-av">'+esc(u.nombre.charAt(0).toUpperCase())+'</div><h2>'+esc(u.nombre)+'</h2><p>'+esc(u.email)+'</p>'
    +'<span class="pf-rol">'+icon(rol[0],14)+rol[1]+'</span>'
    +(u.verificado||u.proveedor==='google.com'?'':'<div class="pf-alerta">'+icon('mail',16)+'Verifica tu correo para proteger tu cuenta.<button class="enlace" id="pfReenviar">Reenviar correo</button></div>')
    +'</div>'
    +(comerciosPropios.some(c=>c.estado_publicacion==='aprobado')?'<button class="negocio-card" id="pfPanel"><span class="admin-ic">'+icon('store',24)+'</span><span class="admin-tx"><b>Panel de mi negocio</b>'
      +'<small>Estadísticas, fotos, cupones, escanear y mi QR</small></span>'+icon('chevron-right')+'</button>':'')
    +misNegociosHTML()
    +'<button class="btn btn-secundario btn-bloque mt-16" id="pfSerComerciante">'+icon('plus')+(comerciosPropios.length?'Registrar otro negocio':'Registrar mi negocio')+'</button>'
    +'<button class="pf-item pf-suelto" id="pfAgenda">'+icon('calendar-days')+'<span class="flex-1">Agenda de eventos</span>'+icon('chevron-right')+'</button>'
    +'<button class="pf-item pf-suelto" id="pfRecorridos">'+icon('footprints')+'<span class="flex-1">Mis recorridos e insignias</span>'+icon('chevron-right')+'</button>'
    +'<button class="tarjeta-opinion" id="pfOpinion"><span class="to-ic">'+icon('message-circle-heart',22)+'</span><span class="to-tx"><b>Ayúdanos a mejorar</b><small>Cuéntanos qué te gustó y qué cambiarías</small></span>'+icon('chevron-right')+'</button>'
    +'<div class="seccion"><h3>'+icon('ticket',18)+'Mis cupones</h3>'
    +'<button class="pf-item" id="pfBilletera">'+icon('wallet')+'<span class="flex-1">Abrir mi billetera</span>'+(cupones.length?'<span class="globo">'+cupones.length+(cupones.length===1?' activo':' activos')+'</span>':'')+icon('chevron-right')+'</button>'
    +'<p class="nota-c izq">Tus cupones quedan guardados en el teléfono y funcionan sin conexión.</p></div>'
    +'<div class="seccion"><h3 id="tTema">'+icon('sun-moon',18)+'Apariencia</h3><div class="seg seg-tema" role="radiogroup" aria-labelledby="tTema">'
      +[['sistema','smartphone','Sistema'],['claro','sun','Claro'],['oscuro','moon','Oscuro']].map(([k,ic,t])=>'<button type="button" role="radio" aria-checked="'+(temaElegido()===k)+'" class="'+(temaElegido()===k?'on':'')+'" data-tema-op="'+k+'">'+icon(ic,16)+t+'</button>').join('')
      +'</div><p class="nota-c izq">«Sistema» sigue el modo claro u oscuro de tu celular.</p></div>'
    +'<div class="seccion"><h3>'+icon('bell',18)+'Novedades</h3><label class="switch-row"><span>Mostrarme las novedades de los comercios destacados</span><input type="checkbox" id="pfNotif" '+(notifOn?'checked':'')+'></label></div>'
    +'<div class="seccion"><h3>'+icon('shield-check',18)+'Privacidad (Ley 1581 de 2012)</h3>'
    +'<p class="nota-c izq">Autorizaste el tratamiento de tus datos el '+fechaCorta(aMs(p.fecha_consentimiento))+'.</p>'
    +'<button class="pf-item" id="pfLegal">'+icon('file-text')+'Ver aviso legal y privacidad</button>'
    +'<button class="pf-item peligro" id="pfEliminar">'+icon('trash-2')+'Eliminar mi cuenta y mis datos</button></div>'
    +'<div class="perfil-acc">'+(puedeInstalar()?'<button class="btn btn-secundario btn-bloque" id="pfInstalar">'+icon('download')+'Instalar la app en mi celular</button>':'')
    +'<button class="btn btn-secundario btn-bloque" id="pfSalir">'+icon('log-out')+'Cerrar sesión</button></div>'
    +'</div>'+footerHTML();
  const r=$('#pfReenviar');if(r)r.onclick=()=>auth.currentUser.sendEmailVerification().then(()=>toast('Te enviamos el correo de verificación')).catch(()=>toast('Intenta de nuevo en unos minutos'));
  const pn=$('#pfPanel');if(pn)pn.onclick=()=>navegar({tipo:'dashboard'});
  const pa=$('#pfAdmin');if(pa)pa.onclick=irAlPanelAdmin;
  const ps=$('#pfSplash');if(ps)ps.onclick=verAnimacionEntrada;
  $$('[data-tema-op]').forEach(b=>b.onclick=()=>{elegirTema(b.dataset.temaOp);render(true);const n=$('[data-tema-op="'+b.dataset.temaOp+'"]');if(n)n.focus();});
  const sc=$('#pfSerComerciante');if(sc)sc.onclick=registrarMiNegocio;
  enlazarMisNegocios();
  $('#pfBilletera').onclick=irABilletera;
  $('#pfOpinion').onclick=()=>abrirOpinion('perfil');
  $('#pfRecorridos').onclick=()=>navegar({tipo:'recorridos'});
  $('#pfAgenda').onclick=()=>irAgenda();
  $('#pfNotif').onchange=async e=>{
    const on=e.target.checked;
    if(on&&'Notification'in window&&Notification.permission==='default'){try{await Notification.requestPermission();}catch(_){}}
    db.collection('usuarios').doc(u.uid).update({notificaciones_push:on}).catch(()=>{});
    estado.perfil.notificaciones_push=on;ls.set('fc_perfil_'+u.uid,estado.perfil);
    toast(on?'Te mostraremos las novedades':'Novedades desactivadas');
  };
  $('#pfLegal').onclick=()=>abrir('ovLegal');
  const pi=$('#pfInstalar');if(pi)pi.onclick=instalarApp;
  $('#pfEliminar').onclick=eliminarCuenta;
  $('#pfSalir').onclick=cerrarSesion;
  enlazarFooter();
  sincronizarCupones();
}
async function sincronizarCupones(){
  if(!logueado()||!estado.online)return;
  try{
    const s=await db.collection('canjes').where('usuario_uid','==',estado.usuario.uid).get();
    const antes=JSON.stringify(cuponesLocales());
    const l=s.docs.map(x=>serializarCupon({id:x.id,...x.data()})).sort((a,b)=>(b.fecha_vencimiento||0)-(a.fecha_vencimiento||0));
    ls.set('fc_cupones_'+estado.usuario.uid,l.slice(0,30));
    if(JSON.stringify(l.slice(0,30))===antes)return;
    if(vistaActual().tipo==='perfil')render(true);else actualizarBilletera();
  }catch(e){}
}

/* ===== PANEL DEL COMERCIANTE "Mi negocio" (Fase 2.2) ===== */
// Comercios del dueño en cualquier estado (vienen de su propio listener)
function misComercios(){return logueado()?comerciosPropios:[];}
let solicitudesPremium=new Set();
let canjesPropios=[];
function estadoPublicacionHTML(d){
  const e=d.estado_publicacion||'pendiente';
  if(e==='aprobado')return '<span class="chip-estado pub">'+icon('circle-check',14)+'Publicado</span>';
  if(e==='rechazado')return '<span class="chip-estado rech">'+icon('circle-alert',14)+'Rechazado</span>';
  return '<span class="chip-estado rev">'+icon('clock',14)+'En revisión</span>';
}
// Estadísticas del mes: comercios/{id}/estadisticas/{aaaa-mm} con incrementos atómicos
function mesClave(t=new Date()){return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0');}
function registrarEvento(d,campo){
  if(!d||!d.propietario_uid||!auth.currentUser)return;
  if(logueado()&&d.propietario_uid===estado.usuario.uid)return; // el dueño no infla sus propias cifras
  db.collection('comercios').doc(String(d.id)).collection('estadisticas').doc(mesClave()).set({[campo]:FV.increment(1)},{merge:true}).catch(()=>{});
}
function renderDashboard(){
  const cuerpo=$('#cuerpo');
  if(!logueado()){cuerpo.innerHTML='<div class="vacio">'+icon('store',48)+'<b>Panel de mi negocio</b><p>Inicia sesión para ver y administrar tu negocio.</p></div>';return;}
  const mis=misComercios();
  if(!mis.length){
    cuerpo.innerHTML='<div class="vista"><div class="dash-top"><h2>Mi negocio</h2></div>'
      +'<div class="vacio">'+icon('store',48)+'<b>Aún no tienes tu negocio en Fusa Conecta</b><p>Regístralo en 4 pasos. Un administrador lo revisará antes de publicarlo.</p>'
      +'<button class="btn btn-primario mt-16" id="bDashNuevo">'+icon('plus')+'Registrar mi negocio</button>'
      +'<p class="nota">¿Ya aparece en el directorio? Ábrelo y toca «¿Es tu negocio? Reclámalo».</p></div></div>'+footerHTML();
    $('#bDashNuevo').onclick=()=>abrirFormComercio(null);enlazarFooter();return;
  }
  if(!mis.some(d=>d.id===estado.comercioSel))estado.comercioSel=mis[0].id;
  const d=mis.find(x=>x.id===estado.comercioSel);
  const prem=premiumVigente(d),pedido=solicitudesPremium.has(d.id),e=d.estado_publicacion||'pendiente';
  const tarjetaEstado=e==='aprobado'
    ?'<div class="estado-card pub">'+icon('circle-check',22)+'<div><b>Publicado</b><span>Tu negocio aparece en el directorio de Fusa Conecta.</span></div></div>'
    :e==='rechazado'
    ?'<div class="estado-card rech">'+icon('circle-alert',22)+'<div><b>Rechazado'+(d.motivo_rechazo?': '+esc(d.motivo_rechazo):'')+'</b><span>Corrige la información y envíala de nuevo a revisión.</span><button class="btn btn-secundario btn-sm mt-8" id="bCorregir">'+icon('pencil',16)+'Corregir y reenviar</button></div></div>'
    :'<div class="estado-card rev">'+icon('clock',22)+'<div><b>En revisión</b><span>Un administrador revisará tu negocio pronto. Mientras tanto no aparece en el directorio.</span></div></div>';
  const plan='<div class="plan-fila">'+(prem
      ?'<span class="dc-plan prem">'+icon('star',14,'ic-fill')+'Premium · '+textoVencePremium(d)+'</span>'
      :'<span class="dc-plan">Plan Gratis</span>'+(pedido?'<span class="nota-c">Solicitud enviada, te avisaremos</span>':'<button class="btn btn-ghost" id="bPremium">'+icon('star',16)+'Ver planes</button>'))+'</div>';
  const cupones=estado.cuponesFS.filter(c=>c.comercio_id===d.id);
  const canjeadosDe=id=>canjesPropios.filter(k=>k.cupon_id===id&&k.estado==='usado').length;
  const listaCupones=cupones.length?'<p class="dash-section">Mis cupones</p>'+cupones.map(c=>{
      const total=c.cupo_total||0,obt=total-(c.cupo_restante||0),can=canjeadosDe(c.id),est=c.estado||'activo';
      return '<div class="cupon-panel"><div class="cp-tit"><b>'+esc(c.descripcion)+'</b><span class="chip-estado '+(est==='activo'?'pub':'rev')+'">'+({activo:'Activo',pausado:'Pausado',finalizado:'Finalizado'})[est]+'</span></div>'
        +'<div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+obt+'" aria-label="Cupones obtenidos"><span style="width:'+(total?Math.round(obt/total*100):0)+'%"></span></div>'
        +'<p class="nota-c izq">'+obt+' de '+total+' obtenidos · '+can+' canjeados · vence '+fechaCorta(aMs(c.vigencia))+'</p>'
        +(est==='finalizado'?'':'<div class="dc-actions">'+(est==='activo'?'<button class="btn btn-secundario btn-sm" data-cest="pausado" data-cid="'+esc(c.id)+'">Pausar</button>':'<button class="btn btn-secundario btn-sm" data-cest="activo" data-cid="'+esc(c.id)+'">Reanudar</button>')
          +'<button class="btn btn-ghost" data-cest="finalizado" data-cid="'+esc(c.id)+'">Finalizar</button></div>')+'</div>';
    }).join(''):'';
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const canjesHoy=canjesPropios.filter(k=>k.comercio_id===d.id&&k.estado==='usado'&&(aMs(k.fecha_canje)||0)>=hoy.getTime())
    .sort((a,b)=>(aMs(b.fecha_canje)||0)-(aMs(a.fecha_canje)||0));
  cuerpo.innerHTML='<div class="vista">'
    +'<div class="dash-top"><h2>Mi negocio</h2>'
    +(mis.length>1?'<label class="sr-only" for="selComercio">Elegir negocio</label><select class="input" id="selComercio">'+mis.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===d.id?' selected':'')+'>'+esc(x.nombre)+'</option>').join('')+'</select>':'<p class="dash-nombre">'+esc(d.nombre)+'</p>')
    +'</div>'+tarjetaEstado+plan
    +'<p class="dash-section">Este mes</p><div class="metricas">'
    +[['mVistas','eye','Vistas de la ficha'],['mToques','phone','Toques en WhatsApp o llamar']].concat(prem?[['mObt','ticket','Cupones obtenidos'],['mCanj','badge-check','Cupones canjeados']]:[])
      .map(([id,ic,t])=>'<div class="metrica">'+icon(ic,18)+'<b id="'+id+'">…</b><span>'+t+'</span></div>').join('')
    +(prem?'':'<button class="metrica bloqueada" data-planes>'+icon('trending-up',18)+chipPremium()+'<span>Estadísticas completas: cupones obtenidos y canjeados</span></button>')+'</div>'
    +'<div class="acciones-grid">'
    +'<button class="accion destacada" id="aEscanear">'+icon('scan-line',28)+'<b>Escanear cupón</b><span>Valida el cupón de un cliente</span></button>'
    +(prem?'<button class="accion" id="aCupon">'+icon('ticket',28)+'<b>Crear cupón</b><span>Atrae clientes con un beneficio</span></button>'
          :'<button class="accion bloqueada" id="aCupon" aria-label="Crear cupón: función Premium. Ver planes">'+icon('ticket',28)+chipPremium()+'<b>Crear cupón</b><span>Atrae clientes con un beneficio</span></button>')
    +'<button class="accion" id="aEditar">'+icon('pencil',28)+'<b>Editar mi ficha</b><span>Datos, horario y foto</span></button>'
    +'<button class="accion" id="aQR">'+icon('qr-code',28)+'<b>Mi código QR</b><span>Para tu mostrador</span></button>'
    +'<button class="accion" id="aFotos">'+icon('images',28)+'<b>Fotos</b><span>'+(d.fotos||[]).length+' de '+limiteFotos(d)+' · la primera es la portada</span></button>'
    +'<button class="accion" id="aPlan">'+icon('star',28)+'<b>Mi plan</b><span>'+(prem?'Premium activo':'Gratis · ver Premium')+'</span></button>'
    +'</div>'
    +'<p class="dash-section">Canjes de hoy</p>'
    +(canjesHoy.length?canjesHoy.map(k=>'<div class="canje-fila">'+icon('badge-check',18)+'<div><b>'+esc(k.descripcion||'Cupón')+'</b><span>'+esc(k.usuario_nombre||'Cliente')+' · '+fechaHora(aMs(k.fecha_canje))+'</span></div></div>').join('')
      :'<p class="nota-c izq">Hoy aún no has canjeado cupones.</p>')
    +(prem?'<button class="btn btn-secundario btn-bloque mt-16" id="aNovedad">'+icon('megaphone')+'Publicar una novedad</button>'
      :'<button class="btn btn-secundario btn-bloque mt-16 btn-bloqueado" data-planes aria-label="Publicar una novedad: función Premium. Ver planes">'+icon('megaphone')+'Publicar una novedad'+chipPremium()+'</button>')
    +listaCupones
    +'<div class="perfil-acc mt-16"><button class="btn btn-secundario btn-bloque" id="bVerFicha">'+icon('eye')+'Ver mi ficha pública</button>'
    +'<button class="btn btn-ghost" id="bDashNuevo">'+icon('plus',18)+'Registrar otro negocio</button></div>'
    +'</div>'+footerHTML();
  const sel=$('#selComercio');if(sel)sel.onchange=()=>{estado.comercioSel=sel.value;render(true);};
  const bc=$('#bCorregir');if(bc)bc.onclick=()=>abrirFormComercio(d);
  const bp=$('#bPremium');if(bp)bp.onclick=()=>irAPlanes(d);
  $$('#cuerpo [data-planes]').forEach(b=>b.onclick=()=>irAPlanes(d));
  $('#aEscanear').onclick=()=>abrirEscaner(d);
  $('#aCupon').onclick=()=>prem?formCupon(d):irAPlanes(d);
  $('#aEditar').onclick=()=>abrirFormComercio(d);
  $('#aQR').onclick=()=>miCodigoQR(d);
  $('#aFotos').onclick=()=>abrirFormComercio(d,{paso:4});
  $('#aPlan').onclick=()=>irAPlanes(d);
  const an=$('#aNovedad');if(an)an.onclick=()=>formPromo(d);
  $('#bVerFicha').onclick=()=>abrirDetalle(d.id);
  $('#bDashNuevo').onclick=()=>abrirFormComercio(null);
  $$('[data-cest]').forEach(b=>b.onclick=()=>cambiarEstadoCupon(b.dataset.cid,b.dataset.cest));
  enlazarFooter();
  // Métricas del mes (solo las lee el dueño)
  db.collection('comercios').doc(d.id).collection('estadisticas').doc(mesClave()).get().then(s=>{
    const x=s.exists?s.data():{};const pon=(id,v)=>{const el=$('#'+id);if(el)el.textContent=v||0;};
    pon('mVistas',x.vistas);pon('mToques',(x.toques_wa||0)+(x.toques_llamar||0));pon('mObt',x.cupones_obtenidos);pon('mCanj',x.cupones_canjeados);
  }).catch(()=>['mVistas','mToques','mObt','mCanj'].forEach(id=>{const el=$('#'+id);if(el)el.textContent='—';}));
  // Canjes de los cupones del comerciante (para el historial del día y el avance de cada cupón)
  db.collection('canjes').where('propietario_uid','==',estado.usuario.uid).get().then(s=>{
    const antes=JSON.stringify(canjesPropios.map(k=>k.id+k.estado));
    canjesPropios=s.docs.map(x=>({id:x.id,...x.data()}));
    if(JSON.stringify(canjesPropios.map(k=>k.id+k.estado))!==antes&&vistaActual().tipo==='dashboard')render(true);
  }).catch(()=>{});
  // Solicitudes de Premium pendientes (para no duplicarlas)
  db.collection('solicitudes').where('uid','==',estado.usuario.uid).where('tipo','==','premium').get().then(s=>{
    const antes=[...solicitudesPremium].join();
    solicitudesPremium=new Set(s.docs.filter(x=>x.data().estado==='pendiente').map(x=>x.data().comercio_id));
    if([...solicitudesPremium].join()!==antes&&vistaActual().tipo==='dashboard')render(true);
  }).catch(()=>{});
}
async function cambiarEstadoCupon(id,est){
  if(est==='finalizado'&&!await confirmar('Finalizar cupón','Nadie más podrá obtenerlo. Los clientes que ya lo tienen aún pueden canjearlo.','Finalizar','Cancelar','ticket'))return;
  try{await db.collection('cupones').doc(id).update({estado:est});toast(est==='pausado'?'Cupón pausado':est==='activo'?'Cupón activo de nuevo':'Cupón finalizado');render(true);}
  catch(e){console.error(e);toast('No se pudo actualizar el cupón');}
}
// El Premium ya no se autoactiva: se solicita y lo activa un administrador
async function solicitarPremium(d){
  if(!d)return;
  if(solicitudesPremium.has(d.id)){toast('Solicitud enviada, te avisaremos cuando se active.');return;}
  abrirHoja('<div class="hoja-pad"><h2 class="hoja-tit">Solicitar Premium</h2><p class="nota">Premium es gratis durante la fase de pruebas. Incluye cupones con QR, 10 fotos, posición destacada, novedades, redes sociales y sitio web.</p>'
    +'<div class="campo mt-16"><label for="premMsg">Mensaje para el administrador <span class="opc">(opcional)</span></label><textarea id="premMsg" maxlength="300" placeholder="Ej: queremos publicar cupones para la temporada de fin de año"></textarea></div>'
    +'<button class="btn btn-primario btn-bloque" id="premEnviar">'+icon('star',18)+'Enviar solicitud</button></div>');
  $('#premEnviar').onclick=async()=>{
    const b=$('#premEnviar');b.disabled=true;
    try{
      await db.collection('solicitudes').add({tipo:'premium',plan:'premium',mensaje:$('#premMsg').value.trim().slice(0,300),comercio_id:d.id,comercio_nombre:d.nombre,uid:estado.usuario.uid,
        usuario_nombre:estado.usuario.nombre,correo:estado.usuario.email,estado:'pendiente',fecha:FV.serverTimestamp()});
      solicitudesPremium.add(d.id);cerrar('ovGen');toast('Solicitud enviada, te avisaremos.');render(true);medir('premium_solicitado');
    }catch(e){console.error(e);b.disabled=false;toast('No se pudo enviar la solicitud. Revisa tu conexión.');}
  };
}
function formPromo(d){
  abrirHoja('<div class="form-head"><h2>Publicar novedad</h2><p>'+esc(d.nombre)+' · máximo 3 por semana</p></div><div class="form-body">'
    +'<div class="campo"><label for="pTit">Título <span class="req">*</span></label><input id="pTit" maxlength="50" placeholder="Ej: Hoy 2x1 en postres"></div>'
    +'<div class="campo"><label for="pMsg">Mensaje <span class="req">*</span></label><textarea id="pMsg" maxlength="280" placeholder="Cuéntales a los vecinos tu promoción o anuncio..."></textarea></div>'
    +'<div class="campo"><label for="pSeg">¿A quién se envía?</label><select id="pSeg"><option value="todos">Todos los usuarios</option><option value="favoritos">Usuarios que me tienen en favoritos</option></select></div>'
    +'<button class="btn btn-primario btn-bloque" id="pEnviar">'+icon('megaphone')+'Publicar novedad</button></div>');
  $('#pEnviar').onclick=async()=>{
    const t=$('#pTit').value.trim(),msg=$('#pMsg').value.trim();
    if(!t||!msg){toast('Escribe el título y el mensaje');return;}
    try{
      const s=await db.collection('notificaciones').where('comercio_id','==',d.id).get();
      const semana=s.docs.filter(x=>(aMs(x.data().fecha_envio)||0)>Date.now()-7*86400000).length;
      if(semana>=3){toast('Ya publicaste 3 novedades esta semana');return;}
      await db.collection('notificaciones').add({comercio_id:d.id,comercio_nombre:d.nombre,titulo:t,mensaje:msg,segmento:$('#pSeg').value,fecha_envio:FV.serverTimestamp(),estado:'enviada'});
      cerrar('ovGen');toast('Novedad publicada ('+(semana+1)+'/3 esta semana)');
    }catch(e){console.error(e);toast('No se pudo publicar la novedad');}
  };
}
/* ===== FOTOS DE LOS NEGOCIOS (v4) =====
   Plan Spark: cada foto va en su propio documento comercios/{id}/fotos/{fotoId} (WebP, lado mayor 1280 px,
   calidad 0,8, máx. ~250 KB). El documento del negocio solo guarda el orden (fotos: [ids]) y una miniatura
   de portada de ~20 KB en "imagen" para la tarjeta del directorio. Gratis: 4 fotos · Premium: 10. */
const FOTOS_MAX={gratis:4,premium:10};
function limiteFotos(d){return d&&premiumVigente(d)?FOTOS_MAX.premium:FOTOS_MAX.gratis;}
function bytesDataURL(u){return Math.round((u.length-u.indexOf(',')-1)*3/4);}
function cargarImagen(src){return new Promise((ok,mal)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=mal;i.src=src;});}
// Comprime a WebP (o JPEG si el navegador no sabe codificar WebP, como Safari) bajando calidad y tamaño hasta caber
// Fotos de negocios: WebP (JPEG en Safari) de 1280 px y máx. 200 KB, cada una en comercios/{id}/fotos/{n}
async function comprimirFoto(origen,lado=1280,maxBytes=200000,calidad=.8){
  const url=typeof origen==='string'?origen:URL.createObjectURL(origen);
  try{
    const img=await cargarImagen(url);
    let esc=Math.min(1,lado/Math.max(img.naturalWidth,img.naturalHeight));
    for(let intento=0;intento<4;intento++){
      const w=Math.max(1,Math.round(img.naturalWidth*esc)),h=Math.max(1,Math.round(img.naturalHeight*esc));
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);
      let tipo='image/webp',q=calidad,dato=cv.toDataURL(tipo,q);
      if(!dato.startsWith('data:image/webp')){tipo='image/jpeg';dato=cv.toDataURL(tipo,q);}
      while(bytesDataURL(dato)>maxBytes&&q>.5){q=Math.round((q-.1)*10)/10;dato=cv.toDataURL(tipo,q);}
      if(bytesDataURL(dato)<=maxBytes)return {src:dato,ancho:w,alto:h,bytes:bytesDataURL(dato)};
      esc*=.8;
    }
    throw new Error('muy-grande');
  }finally{if(typeof origen!=='string')URL.revokeObjectURL(url);}
}
// Portada en miniatura (320 px, máx. 25 KB; las reglas aceptan hasta 40 KB) que va dentro del documento del negocio
function miniatura(src){return comprimirFoto(src,320,25000,.7).then(r=>r.src);}
function idFoto(){return 'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
async function cargarFotosDe(cid,ids){
  if(!ids||!ids.length)return {};
  const s=await db.collection('comercios').doc(String(cid)).collection('fotos').get();
  const m={};s.forEach(x=>{m[x.id]=x.data().data;});return m;
}

/* ---------- Editor de fotos del asistente (paso 4) ---------- */
function galeriaEditHTML(){
  const f=wiz.datos.fotos,lim=limiteFotos(wiz.original);
  return '<div class="galeria-edit" id="wGaleria" role="list" aria-label="Fotos del negocio">'
    +f.map((x,i)=>'<div class="foto-tile" role="listitem" tabindex="0" data-i="'+i+'" aria-label="Foto '+(i+1)+' de '+f.length+(i===0?', portada':'')+'. Flechas para moverla">'
      +(x.src||x.thumb?'<img src="'+esc(x.src||x.thumb)+'" alt="">':'<span class="foto-cargando">'+icon('loader-circle',22,'gira')+'</span>')
      +(i===0?'<span class="foto-portada">Portada</span>':'')
      +'<button type="button" class="foto-mover" data-mover="'+i+'" aria-label="Arrastrar la foto '+(i+1)+' para cambiar el orden">'+icon('grip',18)+'</button>'
      +'<button type="button" class="foto-quitar" data-quitar-foto="'+i+'" aria-label="Eliminar la foto '+(i+1)+'">'+icon('x',16)+'</button></div>').join('')
    +(f.length<lim?'<label class="foto-agregar" for="wFotos">'+icon('image-plus',26)+'<span>Agregar</span></label>':'')
    +'</div><input type="file" id="wFotos" accept="image/*" multiple class="sr-only">'
    +'<p class="ayuda">'+f.length+' de '+lim+' fotos · La primera es la portada; arrastra para cambiar el orden.'+(lim===FOTOS_MAX.gratis?' Con Premium, hasta '+FOTOS_MAX.premium+'. <button type="button" class="enlace" data-verplanes>Ver planes</button>':'')+'</p>';
}
function pintarGaleriaEdit(){const g=$('#wGaleriaCaja');if(!g)return;g.innerHTML=galeriaEditHTML();enlazarGaleriaEdit();$$('#wGaleriaCaja [data-verplanes]').forEach(b=>b.onclick=verPlanesDesdeRegistro);}
function moverFoto(de,a){
  const f=wiz.datos.fotos;if(a<0||a>=f.length||de===a)return;
  const [x]=f.splice(de,1);f.splice(a,0,x);
}
function enlazarGaleriaEdit(){
  const f=wiz.datos.fotos;
  $('#wFotos').onchange=async e=>{
    const lim=limiteFotos(wiz.original),archivos=[...e.target.files];e.target.value='';
    if(f.length+archivos.length>lim)toast(lim===FOTOS_MAX.gratis?'El plan Gratis permite hasta '+lim+' fotos. Con Premium, hasta '+FOTOS_MAX.premium+'.':'Puedes subir hasta '+lim+' fotos.');
    for(const a of archivos.slice(0,lim-f.length)){
      const n={id:idFoto(),src:'',nueva:true};f.push(n);pintarGaleriaEdit();
      try{const r=await comprimirFoto(a);Object.assign(n,{src:r.src,ancho:r.ancho,alto:r.alto,bytes:r.bytes});}
      catch(err){f.splice(f.indexOf(n),1);toast('No pudimos leer una de las fotos. Prueba con otra.');}
      pintarGaleriaEdit();
    }
  };
  $$('[data-quitar-foto]').forEach(b=>b.onclick=()=>{const [x]=f.splice(+b.dataset.quitarFoto,1);if(!x.nueva)wiz.fotosQuitadas.push(x.id);pintarGaleriaEdit();});
  // Teclado: flechas mueven la foto enfocada
  $$('.foto-tile').forEach(t=>t.onkeydown=e=>{
    const i=+t.dataset.i,a=e.key==='ArrowLeft'||e.key==='ArrowUp'?i-1:e.key==='ArrowRight'||e.key==='ArrowDown'?i+1:null;
    if(a==null)return;e.preventDefault();moverFoto(i,a);pintarGaleriaEdit();const n=$('.foto-tile[data-i="'+Math.max(0,Math.min(f.length-1,a))+'"]');if(n)n.focus();
  });
  // Arrastrar desde la manija (el resto de la foto deja desplazar la hoja normalmente)
  $$('[data-mover]').forEach(h=>h.onpointerdown=e=>{
    e.preventDefault();h.setPointerCapture(e.pointerId);
    let i=+h.dataset.mover;const tile=h.closest('.foto-tile');tile.classList.add('arrastrando');
    h.onpointermove=ev=>{
      tile.style.transform='translate('+(ev.clientX-e.clientX)+'px,'+(ev.clientY-e.clientY)+'px)';
      const debajo=document.elementsFromPoint(ev.clientX,ev.clientY).find(x=>x.classList&&x.classList.contains('foto-tile')&&x!==tile);
      $$('.foto-tile').forEach(x=>x.classList.toggle('destino',x===debajo));
    };
    h.onpointerup=h.onpointercancel=ev=>{
      h.onpointermove=h.onpointerup=h.onpointercancel=null;
      const debajo=document.elementsFromPoint(ev.clientX,ev.clientY).find(x=>x.classList&&x.classList.contains('foto-tile')&&x!==tile);
      if(debajo)moverFoto(i,+debajo.dataset.i);
      pintarGaleriaEdit();
    };
  });
}
// Fotos actuales del negocio al abrir el asistente (las de la nube y, si no hay, la foto antigua para migrarla)
function fotosIniciales(d){
  if(!d)return [];
  if(d.fotos&&d.fotos.length){
    const l=d.fotos.map((id,i)=>({id,src:'',thumb:i===0?imgSegura(d.imagen):''}));
    cargarFotosDe(d.id,d.fotos).then(m=>{l.forEach(x=>{if(m[x.id])x.src=m[x.id];});if(wiz&&wiz.datos.fotos===l)pintarGaleriaEdit();}).catch(()=>{});
    return l;
  }
  const img=imgSegura(d.imagen);
  if(!img)return [];
  // Foto antigua (base64 en el documento o archivo de la app): se convierte en la primera foto de la galería
  const x={id:idFoto(),src:'',nueva:true};
  comprimirFoto(img).then(r=>{Object.assign(x,r);if(wiz)pintarGaleriaEdit();}).catch(()=>{});
  return [x];
}
// Escrituras de fotos dentro del mismo lote que el negocio (las reglas las validan juntas)
async function prepararFotos(ref,lote){
  const f=wiz.datos.fotos.filter(x=>x.src||!x.nueva);
  if(f.some(x=>x.nueva&&!x.src))throw new Error('fotos-cargando');
  f.filter(x=>x.nueva).forEach(x=>lote.set(ref.collection('fotos').doc(x.id),{data:x.src,ancho:x.ancho||0,alto:x.alto||0,bytes:x.bytes||bytesDataURL(x.src),fecha:FV.serverTimestamp()}));
  wiz.fotosQuitadas.forEach(id=>lote.delete(ref.collection('fotos').doc(id)));
  let portada='';
  if(f.length){
    const p=f[0];
    portada=p.src?await miniatura(p.src):(p.thumb||imgSegura(wiz.original&&wiz.original.imagen));
  }
  return {fotos:f.map(x=>x.id),imagen:portada};
}

/* ---------- Galería de la ficha: deslizable, contador "1/4" y pantalla completa ---------- */
function galeriaFichaHTML(d){
  const n=d.fotos&&d.fotos.length;
  if(!n)return '';
  return '<div class="galeria" id="galeriaFicha" aria-label="Fotos de '+esc(d.nombre)+'">'
    +d.fotos.map((id,i)=>'<button type="button" class="gal-foto" data-gal="'+i+'" aria-label="Ver la foto '+(i+1)+' de '+n+' en pantalla completa">'
      +(i===0&&imgSegura(d.imagen)?'<img src="'+esc(d.imagen)+'" alt="">':'<span class="foto-cargando">'+icon('image',28)+'</span>')+'</button>').join('')
    +'</div>'+(n>1?'<span class="gal-contador" id="galContador" aria-live="polite">1/'+n+'</span>':'');
}
function enlazarGaleriaFicha(d){
  const g=$('#galeriaFicha');if(!g)return;
  const n=d.fotos.length;let srcs={};
  g.addEventListener('scroll',()=>{const i=Math.round(g.scrollLeft/g.clientWidth);const c=$('#galContador');if(c)c.textContent=(i+1)+'/'+n;},{passive:true});
  $$('[data-gal]',g).forEach(b=>b.onclick=()=>abrirVisor(d,+b.dataset.gal,srcs));
  cargarFotosDe(d.id,d.fotos).then(m=>{
    srcs=m;
    d.fotos.forEach((id,i)=>{const b=$('[data-gal="'+i+'"]',g);if(b&&m[id])b.innerHTML='<img src="'+m[id]+'" alt="Foto '+(i+1)+' de '+esc(d.nombre)+'"'+(i?' loading="lazy"':'')+'>';});
  }).catch(()=>{});
}
function abrirVisor(d,inicio,srcs){
  const n=d.fotos.length;
  $('#visorFotos').innerHTML='<button class="btn-redondo cerrar" id="visorCerrar" aria-label="Cerrar fotos">'+icon('x')+'</button>'
    +'<div class="visor-pista" id="visorPista">'+d.fotos.map((id,i)=>'<div class="visor-foto">'+(srcs[id]?'<img src="'+srcs[id]+'" alt="Foto '+(i+1)+' de '+esc(d.nombre)+'">':(i===0&&imgSegura(d.imagen)?'<img src="'+esc(d.imagen)+'" alt="">':icon('loader-circle',32,'gira')))+'</div>').join('')+'</div>'
    +'<span class="visor-contador" id="visorContador" aria-live="polite">'+(inicio+1)+'/'+n+'</span>';
  abrir('ovVisor');
  const p=$('#visorPista');p.scrollLeft=inicio*p.clientWidth;
  p.addEventListener('scroll',()=>{$('#visorContador').textContent=(Math.round(p.scrollLeft/p.clientWidth)+1)+'/'+n;},{passive:true});
  $('#visorCerrar').onclick=()=>cerrar('ovVisor');
}

/* ---------- Migrar fotos antiguas (base64 dentro del documento) a la galería ---------- */
async function migrarFotosAntiguas(lista){
  let ok=0;
  for(const c of lista){
    try{
      const r=await comprimirFoto(c.imagen),thumb=await miniatura(r.src),id=idFoto(),ref=db.collection('comercios').doc(c.id),lote=db.batch();
      lote.set(ref.collection('fotos').doc(id),{data:r.src,ancho:r.ancho,alto:r.alto,bytes:r.bytes,fecha:FV.serverTimestamp()});
      lote.update(ref,{fotos:[id],imagen:thumb});
      await lote.commit();ok++;
    }catch(e){console.error('No se pudo migrar',c.nombre,e);}
  }
  return ok;
}

/* ===== UNA SOLA CUENTA PARA TODOS (v4) =====
   Todos se registran como "usuario". Ser comerciante se deriva de tener un negocio aprobado (o ser admin):
   no hay que elegir nada al registrarse ni cambiar de cuenta. */
function misNegociosHTML(){
  const l=comerciosPropios;if(!l.length)return '';
  const chip=c=>({aprobado:'<span class="chip-estado pub">'+icon('circle-check',14)+'Publicado</span>',rechazado:'<span class="chip-estado rech">'+icon('circle-alert',14)+'Rechazado</span>',
    oculto:'<span class="chip-estado rech">'+icon('eye-off',14)+'Oculto por el administrador</span>'})[c.estado_publicacion]||'<span class="chip-estado rev">'+icon('clock',14)+'En revisión</span>';
  return '<div class="seccion"><h3>'+icon('store',18)+'Mis negocios</h3>'+l.map(c=>'<div class="mi-negocio">'
      +'<button class="pf-item" data-minegocio="'+esc(c.id)+'"><span class="mn-tx"><b>'+esc(c.nombre)+'</b>'+chip(c)+'</span>'+icon('chevron-right')+'</button>'
      +(c.estado_publicacion==='rechazado'?'<p class="mn-motivo">'+icon('info',14)+(c.motivo_rechazo?'Motivo: '+esc(c.motivo_rechazo):'Revisa los datos y envíalo de nuevo.')+'</p><button class="btn btn-tonal btn-sm" data-corregir="'+esc(c.id)+'">'+icon('pencil',16)+'Corregir y reenviar</button>'
        :c.estado_publicacion==='oculto'?'<p class="mn-motivo">'+icon('info',14)+'No aparece en el directorio. Escríbenos desde «Ayúdanos a mejorar» si crees que es un error.</p>'
        :c.estado_publicacion!=='aprobado'?'<p class="mn-motivo">Un administrador lo revisará pronto. Te avisaremos aquí mismo.</p>':'')
      +'</div>').join('')+'</div>';
}
function enlazarMisNegocios(){
  $$('[data-minegocio]').forEach(b=>b.onclick=()=>{estado.comercioSel=b.dataset.minegocio;navegar({tipo:'dashboard'});});
  $$('[data-corregir]').forEach(b=>b.onclick=()=>abrirFormComercio(comerciosPropios.find(c=>c.id===b.dataset.corregir)));
}
// Acción que se retoma después de crear la cuenta (por ejemplo, registrar un negocio)
// Vence a los 15 minutos: si la persona cancela el registro, no se le abre el asistente por sorpresa otro día
function guardarAccionPendiente(a){ls.set('fc_accion_pendiente',{a,t:Date.now()});}
function retomarAccionPendiente(){
  const p=ls.get('fc_accion_pendiente',null);ls.del('fc_accion_pendiente');
  if(p&&p.a==='negocio'&&Date.now()-p.t<15*60000&&logueado())abrirFormComercio(null);
}

/* ---------- Bienvenida después del primer registro: "¿Qué te gusta de Fusa?" (saltable) ---------- */
const INTERESES=[['comida','Comida','utensils'],['cafe','Café','coffee'],['campo','Productos del campo','sprout'],['senderos','Senderos','footprints'],
  ['hospedaje','Hospedaje','bed-double'],['cultura','Cultura','landmark'],['compras','Compras','shopping-bag'],['mascotas','Mascotas','paw-print'],['noche','Vida nocturna','music']];
function mostrarBienvenida(){
  const sel=new Set();
  abrirHoja('<div class="hoja-pad bienvenida"><span class="bv-logo">'+logo('iso','claro',{alto:44,decorativo:true})+'</span>'
    +'<h2 class="hoja-tit">¡Bienvenida/o, '+esc(estado.usuario.nombre.split(' ')[0])+'!</h2><p class="nota">¿Qué te gusta de Fusa? Así te mostramos primero lo que más te interesa.</p>'
    +'<div class="chips-motivo mt-16" role="group" aria-label="Intereses">'+INTERESES.map(([k,t,i])=>'<button type="button" class="chip-filtro" data-interes="'+k+'" aria-pressed="false">'+icon(i,16)+t+'</button>').join('')+'</div>'
    +'<div class="bv-acc"><button class="btn btn-ghost" id="bvSaltar">Saltar</button><button class="btn btn-primario" id="bvListo">Listo</button></div></div>');
  $('#sheetGen').setAttribute('aria-label','Bienvenida');
  $$('[data-interes]').forEach(b=>b.onclick=()=>{const k=b.dataset.interes,on=!sel.has(k);on?sel.add(k):sel.delete(k);b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
  const fin=()=>{cerrar('ovGen');retomarAccionPendiente();};
  $('#bvSaltar').onclick=fin;
  $('#bvListo').onclick=()=>{
    if(sel.size){const i=[...sel];estado.perfil.intereses=i;db.collection('usuarios').doc(estado.usuario.uid).update({intereses:i}).catch(()=>{});}
    toast(sel.size?'¡Listo! Ya sabemos qué te gusta':'Puedes elegir tus intereses más tarde');fin();
  };
}

/* ===== PLANES PARA TU NEGOCIO (v4 · Fase 3) =====
   Comparación Gratis / Premium. Premium es gratis durante la fase de pruebas: se solicita y lo activa el admin. */
const PLANES_FILAS=[
  ['Ficha completa, WhatsApp, llamada, mapa y horario',true,true],
  ['Fotos',String(FOTOS_MAX.gratis),String(FOTOS_MAX.premium)],
  ['Cupones de descuento con QR',false,true],
  ['Aparecer en «Destacados» y primero en búsquedas',false,true],
  ['Anuncio en el banner principal',false,'Sí (por turnos)'],
  ['Novedades a usuarios que te siguen',false,true],
  ['Estadísticas','Básicas','Completas'],
  ['Redes sociales y sitio web en la ficha',false,true]
];
function celdaPlan(v){
  if(v===true)return icon('check',20)+'<span class="sr-only">Sí</span>';
  if(v===false)return '<span aria-hidden="true">—</span><span class="sr-only">No incluido</span>';
  return esc(v);
}
// Candado para funciones Premium en el panel de un negocio Gratis (se ven, no se ocultan)
function chipPremium(){return '<span class="chip-premium">'+icon('lock',12)+'Premium</span>';}
function planesHTML(d,enRegistro){
  const prem=d&&premiumVigente(d),pedido=d&&solicitudesPremium.has(d.id),mis=comerciosPropios;
  let cta;
  if(enRegistro)cta='<p class="nota-c">Termina el registro de tu negocio y luego solicita Premium desde su panel.</p><button class="btn btn-primario btn-bloque" id="plVolver">Volver al registro</button>';
  else if(!d)cta='<p class="nota-c">Registra tu negocio gratis y luego solicita Premium.</p><button class="btn btn-primario btn-bloque" id="plRegistrar">'+icon('store',18)+'Registrar mi negocio</button>';
  else if(prem)cta='<p class="plan-estado ok">'+icon('circle-check',20)+'«'+esc(d.nombre)+'» ya es Premium · '+textoVencePremium(d)+'</p>';
  else if(pedido)cta='<p class="plan-estado">'+icon('clock',20)+'Solicitud enviada, te avisaremos.</p>';
  else cta='<button class="btn btn-primario btn-bloque" id="plSolicitar">'+icon('star',18)+'Solicitar Premium</button>';
  return '<div class="planes"><h2 class="titulo-planes">Planes para tu negocio</h2>'
    +'<p class="plan-cinta">'+icon('sparkles',18)+'Premium es gratis durante la fase de pruebas</p>'
    +(!enRegistro&&mis.length>1&&!prem?'<div class="campo mt-16"><label for="plNegocio">¿Para cuál negocio?</label><select class="input" id="plNegocio">'+mis.map(x=>'<option value="'+esc(x.id)+'"'+(d&&x.id===d.id?' selected':'')+'>'+esc(x.nombre)+'</option>').join('')+'</select></div>':'')
    +'<table class="tabla-planes"><caption class="sr-only">Comparación de los planes Gratis y Premium</caption>'
    +'<thead><tr><th scope="col">Beneficio</th><th scope="col">Gratis</th><th scope="col" class="col-prem">'+icon('star',14,'ic-fill')+'Premium</th></tr></thead>'
    +'<tbody>'+PLANES_FILAS.map(([t,g,p])=>'<tr><th scope="row">'+esc(t)+'</th><td>'+celdaPlan(g)+'</td><td class="col-prem">'+celdaPlan(p)+'</td></tr>').join('')+'</tbody></table>'
    +'<div class="planes-cta">'+cta+'</div></div>';
}
function enlazarPlanes(d,alCambiar){
  const s=$('#plSolicitar');if(s)s.onclick=()=>solicitarPremium(d);
  const r=$('#plRegistrar');if(r)r.onclick=registrarMiNegocio;
  const n=$('#plNegocio');if(n)n.onchange=()=>{estado.comercioSel=n.value;alCambiar();};
}
function negocioDePlanes(){return comerciosPropios.find(c=>c.id===estado.comercioSel)||comerciosPropios[0]||null;}
function renderPlanes(){
  const d=negocioDePlanes();
  $('#cuerpo').innerHTML='<div class="vista">'+planesHTML(d)+'</div>'+footerHTML();
  enlazarPlanes(d,()=>render(true));enlazarFooter();
  // Solicitudes ya enviadas (para mostrar "Solicitud enviada")
  if(logueado())db.collection('solicitudes').where('uid','==',estado.usuario.uid).where('tipo','==','premium').get().then(s=>{
    const antes=[...solicitudesPremium].join();
    s.docs.filter(x=>x.data().estado==='pendiente').forEach(x=>solicitudesPremium.add(x.data().comercio_id));
    if([...solicitudesPremium].join()!==antes&&vistaActual().tipo==='planes')render(true);
  }).catch(()=>{});
}
function irAPlanes(d){if(d)estado.comercioSel=d.id;navegar({tipo:'planes'});}
// Desde el registro del negocio: los planes se ven en una hoja encima del asistente
function verPlanesDesdeRegistro(){
  abrirHoja('<div class="hoja-pad">'+planesHTML(wiz&&wiz.original,!(wiz&&wiz.editandoId))+'</div>');
  $('#sheetGen').setAttribute('aria-label','Planes para tu negocio');
  const v=$('#plVolver');if(v)v.onclick=()=>cerrar('ovGen');
  enlazarPlanes(wiz&&wiz.original,()=>{});
}

/* ===== REGISTRO / EDICIÓN DE COMERCIO: asistente de 4 pasos (Fase 2.3) ===== */
let wiz=null,wizMapa=null;
const CATS_FORM=[['comercio','Comercios'],['campo','Vitrina del campo'],['turismo','Turismo y rutas'],['hospedaje','Hospedaje'],['bares','Bares y licores'],['tramite','Trámites']];
const PASOS_WIZ=['Qué es','Dónde','Cuándo','Fotos y descripción'];
function abrirFormComercio(d,opc={}){
  if(!logueado()){guardarAccionPendiente('negocio');pedirLogin('Inicia sesión para registrar tu negocio.');return;}
  const enNube=d&&(comerciosNube.some(c=>c.id===d.id)||comerciosPropios.some(c=>c.id===d.id));
  wiz={paso:opc.paso||1,editandoId:d?d.id:null,original:d||null,esSemilla:!!d&&!enNube,fotosQuitadas:[],
    datos:{nombre:d?d.nombre:'',cat:d?d.cat:'',sub:d?subDe(d):'',direccion:d?d.direccion:'',tel:d?d.tel:'',
      lat:d&&d.lat?d.lat:null,lng:d&&d.lng?d.lng:null,ubicacionExacta:!!(d&&d.lat&&!d.ubicacion_aprox),
      dias:d&&d.dias&&d.dias.length?d.dias.slice():[1,2,3,4,5,6],abre:d&&d.abre?d.abre:'08:00',cierra:d&&d.cierra?d.cierra:'18:00',
      desc:d?d.desc:'',imagen:d?d.imagen:'',redes:{...(d&&d.redesSociales||{})},web:d?d.sitioWeb||'':''}};
  wiz.datos.fotos=fotosIniciales(d);
  pintarWizard();abrir('ovForm');
}
function wizPremium(){return wiz.original&&premiumVigente(wiz.original);}
function pintarWizard(){
  const w=wiz,d=w.datos,p=w.paso,final=p===5;
  if(wizMapa){wizMapa.remove();wizMapa=null;}
  let cuerpo='';
  if(p===1){
    const subs=SUBCATS[d.cat]||[];
    cuerpo='<div class="campo"><label for="wNombre">Nombre del negocio <span class="req">*</span></label><input id="wNombre" maxlength="80" placeholder="Ej: Café de la Abuela" value="'+esc(d.nombre)+'"></div>'
      +'<p class="lbl">Categoría <span class="req">*</span></p><div class="tiles" role="radiogroup" aria-label="Categoría">'
      +CATS_FORM.map(([k,t])=>'<button type="button" class="tile cat-'+k+(d.cat===k?' on':'')+'" data-wcat="'+k+'" role="radio" aria-checked="'+(d.cat===k)+'"><span class="tile-ic">'+icon(ICONO_CAT[k],22)+'</span>'+t+'</button>').join('')+'</div>'
      +(subs.length?'<p class="lbl mt-16">Tipo de negocio <span class="req">*</span></p><div class="tiles tiles-sub" role="radiogroup" aria-label="Tipo de negocio">'
        +subs.map(s=>'<button type="button" class="tile'+(d.sub===s.k?' on':'')+'" data-wsub="'+s.k+'" role="radio" aria-checked="'+(d.sub===s.k)+'"><span class="tile-ic">'+icon(ICONO_SUB[s.k]||'circle-help',20)+'</span>'+nombreSub(d.cat,s.k)+'</button>').join('')+'</div>':'');
  }else if(p===2){
    cuerpo='<div class="campo"><label for="wDir">Dirección</label><input id="wDir" maxlength="120" placeholder="Ej: Cra 7 # 6-32, Centro" value="'+esc(d.direccion)+'"></div>'
      +'<div class="campo"><label for="wTel">WhatsApp o teléfono</label><input id="wTel" type="tel" maxlength="13" placeholder="Ej: 3001234567" value="'+esc(d.tel)+'"><p class="ayuda">Si es celular, los clientes podrán escribirte por WhatsApp.</p></div>'
      +'<p class="lbl">Ubicación en el mapa</p><button type="button" class="btn btn-secundario btn-sm" id="wUbicar">'+icon('locate-fixed')+'Usar mi ubicación</button>'
      +(estado.online?'<div id="wMapa" class="wiz-mapa" role="region" aria-label="Mapa para ubicar tu negocio"></div><p class="ayuda" id="wUbicTxt">'+(d.ubicacionExacta?'Ubicación guardada. Arrastra el pin para ajustarla.':'Toca el mapa o arrastra el pin hasta la puerta de tu negocio.')+'</p>'
        :'<p class="ayuda" id="wUbicTxt">Sin conexión no se puede mostrar el mapa; usaremos la dirección.</p>');
  }else if(p===3){
    const DS=[[1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[0,'Dom']];
    cuerpo='<p class="lbl">Días de atención</p><div class="chips-dias" role="group" aria-label="Días de atención">'
      +DS.map(([i,t])=>'<button type="button" class="chip-dia'+(d.dias.includes(i)?' on':'')+'" data-wdia="'+i+'" aria-pressed="'+d.dias.includes(i)+'">'+t+'</button>').join('')+'</div>'
      +'<div class="horas-row mt-16"><div class="campo"><label for="wAbre">Abre</label><input type="time" id="wAbre" value="'+esc(d.abre)+'"></div><div class="campo"><label for="wCierra">Cierra</label><input type="time" id="wCierra" value="'+esc(d.cierra)+'"></div></div>'
      +'<p class="ayuda">Así se verá: '+esc(textoHorarioWiz())+'</p>';
  }else if(p===4){
    cuerpo='<p class="lbl">Fotos del negocio</p><div id="wGaleriaCaja">'+galeriaEditHTML()+'</div>'
      +'<div class="campo mt-16"><label for="wDesc">Descripción</label><textarea id="wDesc" maxlength="400" placeholder="Cuenta en pocas líneas qué ofreces...">'+esc(d.desc)+'</textarea><p class="ayuda cuenta-car" id="wCont">'+d.desc.length+' / 400</p></div>'
      +(wizPremium()?'<div class="bloque-form"><p class="bloque-tit">'+icon('star')+'Opciones Premium</p>'
        +['instagram','facebook','tiktok','youtube','x'].map(k=>'<div class="campo"><label for="wRed_'+k+'">'+RED_TXT[k]+'</label><input type="url" id="wRed_'+k+'" placeholder="https://..." value="'+esc(d.redes[k]||'')+'"></div>').join('')
        +'<div class="campo"><label for="wWeb">Sitio web</label><input type="url" id="wWeb" placeholder="https://www.tunegocio.com" value="'+esc(d.web)+'"><p class="ayuda">Debe comenzar con https://</p></div></div>'
      :'<button type="button" class="bloque-form bloque-premium-cerrado" data-verplanes>'+icon('globe',20)+'<span><b>Redes sociales y sitio web</b><small>Muéstralos en tu ficha con el plan Premium. Ver planes</small></span>'+chipPremium()+'</button>');
  }else{
    const vista={...(w.original||{}),id:'vista',nombre:d.nombre,cat:d.cat,sub:d.cat==='turismo'?'':d.sub,tipo:d.cat==='turismo'?d.sub:'',
      direccion:d.direccion||'Fusagasugá',desc:d.desc||'Negocio local de Fusagasugá.',imagen:(d.fotos[0]&&(d.fotos[0].src||d.fotos[0].thumb))||'',dias:d.dias,abre:d.abre,cierra:d.cierra,horario:textoHorarioWiz(),tel:d.tel,esPremium:false};
    cuerpo='<p class="nota">Así verán tu negocio en el directorio:</p><div class="vista-previa" aria-hidden="true">'+tarjetaHTML(vista)+'</div>'
      +(w.editandoId&&w.original&&w.original.estado_publicacion==='aprobado'?'':'<p class="nota">'+icon('clock',14)+' Un administrador revisará la información antes de publicarla.</p>');
  }
  const titulo=w.editandoId?'Editar mi negocio':'Registra tu negocio';
  const enviar=w.editandoId&&w.original&&w.original.estado_publicacion==='aprobado'?'Guardar cambios':'Enviar a revisión';
  $('#sheetForm').innerHTML='<div class="grab"></div><button class="btn-redondo cerrar" id="wCerrar" aria-label="Cerrar">'+icon('x')+'</button>'
    +'<div class="form-head"><h2>'+titulo+'</h2><p>'+(final?'Vista previa':'Paso '+p+' de 4 · '+PASOS_WIZ[p-1])+'</p>'
    +'<div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow="'+Math.min(p,4)+'"><span style="width:'+Math.min(p,4)*25+'%"></span></div></div>'
    +'<div class="form-body">'+cuerpo+'</div>'
    +'<div class="wiz-pie">'+(p>1?'<button class="btn btn-secundario" id="wAtras">'+icon('arrow-left')+'Atrás</button>':'')
    +(final?'<button class="btn btn-primario" id="wEnviar">'+enviar+'</button>':'<button class="btn btn-primario" id="wSig">'+(p===4?'Ver vista previa':'Siguiente')+'</button>')+'</div>';
  $('#sheetForm').scrollTop=0;
  $('#wCerrar').onclick=()=>cerrar('ovForm');
  const at=$('#wAtras');if(at)at.onclick=()=>{guardarPasoWiz();wiz.paso--;pintarWizard();};
  const sg=$('#wSig');if(sg)sg.onclick=()=>{guardarPasoWiz();const e=validarPasoWiz();if(e){toast(e);return;}wiz.paso++;pintarWizard();};
  const en=$('#wEnviar');if(en)en.onclick=publicarComercio;
  if(p===1){
    $$('#sheetForm [data-wcat]').forEach(b=>b.onclick=()=>{guardarPasoWiz();if(d.cat!==b.dataset.wcat){d.cat=b.dataset.wcat;d.sub='';}pintarWizard();});
    $$('#sheetForm [data-wsub]').forEach(b=>b.onclick=()=>{guardarPasoWiz();d.sub=b.dataset.wsub;pintarWizard();});
  }
  if(p===2){
    $('#wUbicar').onclick=async()=>{
      $('#wUbicTxt').textContent='Obteniendo tu ubicación…';
      const pos=await pedirUbicacion();
      if(!pos){$('#wUbicTxt').textContent='No pudimos obtener tu ubicación. Activa el GPS o mueve el pin a mano.';return;}
      d.lat=pos[0];d.lng=pos[1];d.ubicacionExacta=true;guardarPasoWiz();pintarWizard();
    };
    if(estado.online)montarMapaWiz();
  }
  if(p===3)$$('#sheetForm [data-wdia]').forEach(b=>b.onclick=()=>{guardarPasoWiz();const i=+b.dataset.wdia;d.dias=d.dias.includes(i)?d.dias.filter(x=>x!==i):[...d.dias,i];pintarWizard();});
  if(p===4){
    enlazarGaleriaEdit();
    $$('#sheetForm [data-verplanes]').forEach(b=>b.onclick=verPlanesDesdeRegistro);
    $('#wDesc').oninput=e=>{$('#wCont').textContent=e.target.value.length+' / 400';};
  }
}
async function montarMapaWiz(){
  try{await cargarLeaflet();}catch(e){return;}
  if(!wiz||wiz.paso!==2||!$('#wMapa'))return;
  const d=wiz.datos,centro=d.lat&&d.lng?[d.lat,d.lng]:PLAZA_FUSA;
  wizMapa=L.map('wMapa').setView(centro,d.lat?17:15);
  capaBase().addTo(wizMapa);
  const pin=L.marker(centro,{draggable:true,icon:pinIcono(d.cat?(ICONO_SUB[d.sub]||ICONO_CAT[d.cat]):'map-pin','pin-fc'+(d.cat?' c-'+d.cat:'')),title:'Ubicación del negocio'}).addTo(wizMapa);
  const fijar=ll=>{d.lat=+ll.lat.toFixed(6);d.lng=+ll.lng.toFixed(6);d.ubicacionExacta=true;$('#wUbicTxt').textContent='Ubicación guardada. Arrastra el pin para ajustarla.';};
  pin.on('dragend',()=>fijar(pin.getLatLng()));
  wizMapa.on('click',e=>{pin.setLatLng(e.latlng);fijar(e.latlng);});
  setTimeout(()=>wizMapa&&wizMapa.invalidateSize(),250);
}
function guardarPasoWiz(){
  const d=wiz.datos,v=id=>{const el=$('#'+id);return el?el.value.trim():null;};
  if($('#wNombre'))d.nombre=v('wNombre');
  if($('#wDir'))d.direccion=v('wDir');
  if($('#wTel'))d.tel=telLimpio(v('wTel'));
  if($('#wAbre'))d.abre=v('wAbre');
  if($('#wCierra'))d.cierra=v('wCierra');
  if($('#wDesc'))d.desc=v('wDesc');
  ['instagram','facebook','tiktok','youtube','x'].forEach(k=>{if($('#wRed_'+k))d.redes[k]=v('wRed_'+k);});
  if($('#wWeb'))d.web=v('wWeb');
}
function validarPasoWiz(){
  const d=wiz.datos;
  if(wiz.paso===1){
    if(!d.nombre)return 'Escribe el nombre del negocio';
    if(!d.cat)return 'Elige una categoría';
    if(SUBCATS[d.cat]&&!d.sub)return 'Elige el tipo de negocio';
  }
  if(wiz.paso===2&&d.tel&&!/^\d{7,10}$/.test(d.tel))return 'Revisa el número de teléfono';
  if(wiz.paso===3){if(!d.dias.length)return 'Elige al menos un día de atención';if(!d.abre||!d.cierra)return 'Indica la hora de apertura y de cierre';}
  if(wiz.paso===4&&wizPremium()){
    for(const k of ['instagram','facebook','tiktok','youtube','x'])if(d.redes[k]&&!urlValida(d.redes[k]))return 'El enlace de '+RED_TXT[k]+' debe comenzar con https://';
    if(d.web&&!urlValida(d.web))return 'El sitio web debe comenzar con https://';
  }
  return '';
}
function textoHorarioWiz(){const d=wiz.datos;return d.dias.length?d.dias.slice().sort().map(i=>DIAS_TXT[i]).join(', ')+' · '+formatearHora(d.abre)+' – '+formatearHora(d.cierra):'Consultar directamente';}
// "08:00" -> "8:00 a. m."
function formatearHora(hhmm){if(!hhmm)return '';const[h,m]=hhmm.split(':').map(Number);return horaTexto(h*60+(m||0));}
function urlValida(u){return /^https:\/\/[^\s.]+\.[^\s]{2,}$/i.test(u);}
async function publicarComercio(){
  if(!logueado()){cerrar('ovForm');pedirLogin('Inicia sesión para registrar tu negocio.');return;}
  const w=wiz,d=w.datos,cat=d.cat,sub=d.sub,tel=telLimpio(d.tel);
  const btn=$('#wEnviar'),txt=btn.innerHTML;btn.innerHTML='Guardando...';btn.disabled=true;
  try{
    const datos={cat,categoria:cat,emoji:CAT[cat].emoji,nombre:d.nombre,desc:d.desc||'Negocio local de Fusagasugá.',
      direccion:d.direccion||'Fusagasugá',tel,whatsapp:esCelular(tel)?tel:'',dias:d.dias,abre:d.abre,cierra:d.cierra,
      horario:textoHorarioWiz(),municipio:'Fusagasugá',fecha_modificacion:FV.serverTimestamp()};
    if(cat==='turismo'){datos.tipo=sub;datos.sub='';}else datos.sub=SUBCATS[cat]?sub:'';
    if(d.lat&&d.lng){datos.lat=d.lat;datos.lng=d.lng;datos.ubicacion_aprox=!d.ubicacionExacta;}
    if(wizPremium()){datos.redesSociales=Object.fromEntries(Object.entries(d.redes).filter(([k,u])=>u));datos.sitioWeb=d.web;}
    // El negocio y sus fotos se guardan juntos (las reglas revisan el límite de fotos en el mismo lote)
    const ref=w.editandoId?db.collection('comercios').doc(w.editandoId):db.collection('comercios').doc();
    const lote=db.batch();
    Object.assign(datos,await prepararFotos(ref,lote));
    if(w.editandoId&&w.esSemilla){
      // Un admin corrige la ficha de un negocio semilla: se crea su documento en la nube con el mismo id
      Object.assign(datos,{imagen:datos.imagen||w.original.imagen||'',estado_publicacion:'aprobado',propietario_uid:null,esPremium:false,prioridadBusqueda:0,fechaCreacion:FV.serverTimestamp()});
      lote.set(ref,datos,{merge:true});await lote.commit();toast('Ficha actualizada');
    }else if(w.editandoId){
      const reenviar=w.original&&w.original.estado_publicacion==='rechazado';
      if(reenviar){datos.estado_publicacion='pendiente';datos.motivo_rechazo=FV.delete();}
      lote.update(ref,datos);await lote.commit();
      toast(reenviar?'Cambios enviados a revisión':'Cambios guardados');
    }else{
      if(!datos.lat){datos.lat=PLAZA_FUSA[0];datos.lng=PLAZA_FUSA[1];datos.ubicacion_aprox=true;}
      Object.assign(datos,{propietario_uid:estado.usuario.uid,propietario:estado.usuario.nombre,estado_publicacion:'pendiente',esPremium:false,prioridadBusqueda:0,
        redesSociales:{},sitioWeb:'',fechaCreacion:FV.serverTimestamp()});
      lote.set(ref,datos);await lote.commit();estado.comercioSel=ref.id;
      toast('Tu negocio quedó en revisión. Lo verás en tu Perfil, en «Mis negocios».');
    }
    cerrar('ovForm');
    if(!w.editandoId){if(vistaActual().tipo!=='perfil')navegar({tipo:'perfil'});else render(true);}else render(true);
  }catch(e){console.error(e);toast(e.message==='fotos-cargando'?'Espera a que terminen de cargar las fotos':e.code==='permission-denied'?'No tienes permiso para guardar este negocio (revisa el límite de fotos de tu plan)':'No se pudo guardar. Revisa tu conexión o usa fotos más livianas.');}
  finally{if(btn.isConnected){btn.innerHTML=txt;btn.disabled=false;}}
}

/* ===== AUTENTICACIÓN REAL CON FIREBASE (RF-02, RF-03, RNF-07) ===== */
let modoLogin='ingresar',registroPendiente=null,creandoPerfil=null,correoAbierto=true;
function abrirLogin(modo='ingresar',productor=false,aviso=''){
  modoLogin=modo;correoAbierto=modo!=='registro';
  $('#loginAviso').innerHTML=aviso?icon('lock',18)+'<span>'+esc(aviso)+'</span>':'';$('#loginAviso').style.display=aviso?'flex':'none';
  pintarModoLogin();abrir('ovLogin');
}
function pedirLogin(msg,productor=false){abrirLogin('ingresar',productor,msg);}
function pintarModoLogin(){
  const reg=modoLogin==='registro';
  $$('#ovLogin .seg button').forEach(b=>{const on=b.dataset.modo===modoLogin;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
  $('#lNombreWrap').style.display=reg?'block':'none';
  $('#lConsentWrap').style.display=reg?'flex':'none';
  $('#lOlvido').style.display=reg?'none':'inline-flex';
  $('#lMail').textContent=reg?'Crear mi cuenta':'Ingresar';
  $('#clave').setAttribute('autocomplete',reg?'new-password':'current-password');
  $('#loginTitulo').textContent=reg?'Crea tu cuenta':'Ingresa a Fusa Conecta';
  // Al registrarse, Google va primero (grande); el correo es la opción secundaria que despliega los campos
  $('#lGoogle').classList.toggle('grande',reg);
  const uc=$('#lUsarCorreo');
  if(uc){uc.hidden=!reg||correoAbierto;uc.setAttribute('aria-expanded',correoAbierto);$('#formLogin').hidden=reg&&!correoAbierto;}
  $('#loginSub').textContent=reg?'Guarda favoritos, califica lugares y genera cupones de descuento.':'Qué bueno verte de nuevo.';
}
function mensajeAuth(e){
  const m={'auth/email-already-in-use':'Ese correo ya tiene una cuenta. Ingresa con tu contraseña.','auth/invalid-email':'El correo no es válido.',
    'auth/weak-password':'La contraseña debe tener mínimo 8 caracteres.','auth/wrong-password':'Correo o contraseña incorrectos.',
    'auth/user-not-found':'No existe una cuenta con ese correo. Crea una nueva.','auth/invalid-credential':'Correo o contraseña incorrectos.',
    'auth/invalid-login-credentials':'Correo o contraseña incorrectos.','auth/too-many-requests':'Demasiados intentos. Espera unos minutos.',
    'auth/network-request-failed':'Sin conexión a internet. Intenta de nuevo.','auth/popup-closed-by-user':'Cerraste la ventana de Google.',
    'auth/cancelled-popup-request':'Ventana de Google cancelada.','auth/unauthorized-domain':'Este dominio no está autorizado para iniciar sesión con Google.',
    'auth/operation-not-allowed':'Este método de ingreso no está habilitado.','auth/requires-recent-login':'Por seguridad, vuelve a iniciar sesión.'};
  return m[e&&e.code]||'No se pudo completar. Intenta de nuevo.';
}
function bloquearLogin(on){$$('#ovLogin button').forEach(b=>b.disabled=on);$('#lMail').textContent=on?'Un momento...':(modoLogin==='registro'?'Crear mi cuenta':'Ingresar');}
async function enviarLogin(e){
  e.preventDefault();
  const email=$('#mail').value.trim(),clave=$('#clave').value,nombre=$('#lNombre').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('Ingresa un correo válido');return;}
  if(clave.length<8){toast('La contraseña debe tener mínimo 8 caracteres');return;}
  const rol='usuario';
  bloquearLogin(true);
  try{
    if(modoLogin==='registro'){
      if(nombre.length<2){toast('Escribe tu nombre');return;}
      if(!$('#lConsent').checked){toast('Debes aceptar el tratamiento de datos (Ley 1581)');return;}
      registroPendiente={consent:true,nombre,rol};
      const actual=auth.currentUser;let cred;
      if(actual&&actual.isAnonymous){
        // RF-03: la sesión de invitado se vincula a la cuenta nueva
        cred=await actual.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email,clave));
      }else cred=await auth.createUserWithEmailAndPassword(email,clave);
      await cred.user.updateProfile({displayName:nombre});
      cred.user.sendEmailVerification().catch(()=>{});
      await procesarUsuario(cred.user);
      toast('¡Bienvenida/o, '+nombre.split(' ')[0]+'! Te enviamos un correo de verificación.');
    }else{
      registroPendiente={consent:false,rol};
      const cred=await auth.signInWithEmailAndPassword(email,clave);
      await procesarUsuario(cred.user);
      toast('Bienvenida/o de nuevo');
    }
    $('#clave').value='';
  }catch(err){console.warn(err.code);toast(mensajeAuth(err));}
  finally{bloquearLogin(false);}
}
async function ingresarGoogle(){
  const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  registroPendiente={consent:modoLogin==='registro'&&$('#lConsent').checked,rol:'usuario'};
  bloquearLogin(true);
  // En celulares y en la app instalada la ventana emergente de Google no puede devolver
  // la sesión: se usa redirección de página completa y se retoma al volver.
  const actual=auth.currentUser;
  if(appInstalada()||/android|iphone|ipad|ipod/i.test(navigator.userAgent)){
    ls.set('fc_registro_pendiente',registroPendiente);
    try{
      if(actual&&actual.isAnonymous)await actual.linkWithRedirect(provider);
      else await auth.signInWithRedirect(provider);
    }catch(err){toast(mensajeAuth(err));bloquearLogin(false);}
    return;
  }
  try{
    let cred;
    if(actual&&actual.isAnonymous){
      try{cred=await actual.linkWithPopup(provider);}
      catch(err){if(err.code==='auth/credential-already-in-use'&&err.credential)cred=await auth.signInWithCredential(err.credential);else throw err;}
    }else cred=await auth.signInWithPopup(provider);
    await procesarUsuario(cred.user);
  }catch(err){
    if(err.code==='auth/popup-blocked'||err.code==='auth/operation-not-supported-in-this-environment'){ls.set('fc_registro_pendiente',registroPendiente);auth.signInWithRedirect(provider);return;}
    if(err.code!=='auth/popup-closed-by-user'&&err.code!=='auth/cancelled-popup-request')toast(mensajeAuth(err));
  }finally{bloquearLogin(false);}
}
async function olvideClave(){
  const email=$('#mail').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('Escribe tu correo arriba y vuelve a tocar «¿Olvidaste tu contraseña?»');return;}
  try{await auth.sendPasswordResetEmail(email);toast('Te enviamos un correo para restablecer tu contraseña');}
  catch(e){toast(mensajeAuth(e));}
}
// Factory: todas las cuentas nacen como "usuario" (el panel de negocio se habilita al aprobarse un negocio)
function crearPerfil(user,datos){
  if(creandoPerfil)return creandoPerfil;
  const perfil={uid:user.uid,nombre:datos.nombre||user.displayName||(user.email||'').split('@')[0]||'Vecino',correo:user.email||'',
    rol:'usuario',consentimiento_ley1581:true,fecha_consentimiento:FV.serverTimestamp(),
    fecha_registro:FV.serverTimestamp(),notificaciones_push:true,favoritos:ls.get('fc_fav_'+user.uid,[])};
  creandoPerfil=db.collection('usuarios').doc(user.uid).set(perfil).then(()=>({...perfil,fecha_consentimiento:Date.now()})).finally(()=>{creandoPerfil=null;});
  return creandoPerfil;
}
// Evita procesar dos veces la misma sesión (onAuthStateChanged + flujo de registro)
let procesoActual=null,procesoUid=null;
function procesarUsuario(user){
  if(!user)return Promise.resolve();
  if(procesoActual&&procesoUid===user.uid)return procesoActual;
  procesoUid=user.uid;
  procesoActual=_procesarUsuario(user).finally(()=>{procesoActual=null;});
  return procesoActual;
}
async function _procesarUsuario(user){
  estado.usuario={uid:user.uid,anonimo:user.isAnonymous,nombre:(registroPendiente&&registroPendiente.nombre)||user.displayName||(user.email?user.email.split('@')[0]:'Invitado'),
    email:user.email||'',verificado:user.emailVerified,proveedor:(user.providerData[0]||{}).providerId||''};
  if(user.isAnonymous){estado.perfil=null;estado.favoritos=[];refrescarTodo();return;}
  cerrar('ovLogin');ocultarSplashSesion();
  estado.favoritos=ls.get(claveFav(),[]);
  estado.perfil=ls.get('fc_perfil_'+user.uid,null);
  let snap=null,cuentaNueva=false;
  try{snap=await db.collection('usuarios').doc(user.uid).get();}catch(e){console.warn('Perfil sin conexión');}
  if(snap&&snap.exists){
    estado.perfil=snap.data();
    const nube=estado.perfil.favoritos||[];
    estado.favoritos=[...new Set([...nube,...estado.favoritos])];
    if(estado.favoritos.length!==nube.length)db.collection('usuarios').doc(user.uid).update({favoritos:estado.favoritos}).catch(()=>{});
    if(estado.perfil.nombre)estado.usuario.nombre=estado.perfil.nombre;
  }else if(snap&&!snap.exists){
    const datos=registroPendiente||ls.get('fc_registro_pendiente',null)||{consent:false,rol:'usuario'};
    if(!datos.consent){
      const r=await pedirConsentimiento();
      if(!r){await auth.signOut();toast('Sin tu autorización no podemos crear la cuenta.');return;}
    }
    try{estado.perfil=await crearPerfil(user,{...datos,nombre:estado.usuario.nombre});cuentaNueva=true;}
    catch(e){console.error(e);const s2=await db.collection('usuarios').doc(user.uid).get().catch(()=>null);estado.perfil=s2&&s2.exists?s2.data():null;}
  }
  ls.del('fc_registro_pendiente');
  if(estado.perfil){const p={...estado.perfil};p.fecha_consentimiento=aMs(p.fecha_consentimiento);ls.set('fc_perfil_'+user.uid,p);}
  ls.set(claveFav(),estado.favoritos);
  registroPendiente=null;
  refrescarTodo();
  escucharPromociones();sincronizarCupones();escucharMisComercios();escucharAdmin();
  // Después del primer registro: "¿Qué te gusta de Fusa?"; luego se retoma lo que iba a hacer (p. ej. registrar su negocio)
  if(cuentaNueva)setTimeout(mostrarBienvenida,400);else retomarAccionPendiente();
  aplicarInvitacion(user);
  if(typeof adminPendiente!=='undefined'&&adminPendiente&&esAdmin()){adminPendiente=false;ocultarSplash();estado.admin.datos=null;navegar({tipo:'admin'});}
}
function pedirConsentimiento(){
  return new Promise(res=>{
    abrir('ovConsent');
    $('#consentSi').onclick=()=>{cerrar('ovConsent');res('usuario');};
    $('#consentNo').onclick=()=>{cerrar('ovConsent');res(null);};
  });
}
function refrescarTodo(){if(stack.length===0)inicio();else render(true);}
async function cerrarSesion(){
  if(!await confirmar('Cerrar sesión','¿Quieres salir de tu cuenta?','Salir','Cancelar','log-out'))return;
  await auth.signOut();
  estado.usuario=null;estado.perfil=null;estado.favoritos=[];
  stack.length=0;mostrarSplash();
  inicio();toast('Hasta pronto');
}
// Derecho de supresión (Ley 1581): borra datos personales y anonimiza las calificaciones
async function eliminarCuenta(){
  if(!await confirmar('Eliminar mi cuenta','Se borrarán tu perfil, favoritos y cupones. Tus calificaciones quedarán anónimas. Esta acción no se puede deshacer.','Eliminar','Cancelar','trash-2',true))return;
  if(!estado.online){toast('Necesitas conexión a internet');return;}
  const user=auth.currentUser;
  try{
    const qs=await db.collection('calificaciones').where('usuario_uid','==',user.uid).get();
    await Promise.all(qs.docs.map(d=>d.ref.set({...d.data(),usuario_nombre:'Usuario eliminado'})));
    await db.collection('usuarios').doc(user.uid).delete();
    ['fc_fav_','fc_perfil_','fc_cupones_'].forEach(k=>ls.del(k+user.uid));
    await user.delete();
    estado.usuario=null;estado.perfil=null;estado.favoritos=[];
    stack.length=0;mostrarSplash();inicio();
    toast('Tu cuenta y tus datos fueron eliminados');
  }catch(e){
    console.error(e);
    if(e.code==='auth/requires-recent-login'){toast('Por seguridad, vuelve a iniciar sesión y repite la eliminación');await auth.signOut();abrirLogin('ingresar');}
    else toast('No se pudo eliminar la cuenta. Intenta de nuevo.');
  }
}
// Regreso del ingreso con Google por redirección
auth.getRedirectResult().catch(async e=>{
  // La cuenta de Google ya existía: se entra con ella en lugar de vincular la sesión de invitado
  if(e&&e.code==='auth/credential-already-in-use'&&e.credential){
    try{await auth.signInWithCredential(e.credential);return;}catch(e2){e=e2;}
  }
  if(e&&e.code)toast(mensajeAuth(e));
});
auth.onAuthStateChanged(user=>{
  marcarSesion(user&&!user.isAnonymous);
  // Se esperaba una sesión que ya no existe: se muestra la entrada completa con sus botones
  if((!user||user.isAnonymous)&&$('#splash').classList.contains('corto'))mostrarSplash();
  if(!user){dejarDeEscucharMisComercios();dejarDeEscucharAdmin();estado.usuario=null;estado.perfil=null;estado.favoritos=[];refrescarTodo();return;}
  if(!registroPendiente)registroPendiente=ls.get('fc_registro_pendiente',null);
  procesarUsuario(user);
});

/* ===== PROMOCIONES PUSH (RF-18) ===== */
let promoUnsub=null;
function escucharPromociones(){
  if(promoUnsub||!logueado())return;
  const desde=ls.get('fc_promo_visto',Date.now());
  promoUnsub=db.collection('notificaciones').where('fecha_envio','>',TS.fromMillis(desde)).onSnapshot(s=>{
    s.docChanges().forEach(ch=>{
      if(ch.type!=='added')return;const n=ch.doc.data();
      ls.set('fc_promo_visto',Math.max(ls.get('fc_promo_visto',0),aMs(n.fecha_envio)||Date.now()));
      if(!logueado()||(estado.perfil&&estado.perfil.notificaciones_push===false))return;
      if(n.segmento==='favoritos'&&!estado.favoritos.includes(String(n.comercio_id)))return;
      mostrarPromo(n);
    });
  },()=>{promoUnsub=null;});
}
function mostrarPromo(n){
  const b=$('#promoBanner');
  b.innerHTML=icon('megaphone')+'<div><b>'+esc(n.comercio_nombre)+': '+esc(n.titulo)+'</b><span>'+esc(n.mensaje)+'</span></div>';
  b.onclick=()=>{b.classList.remove('ver');abrirDetalle(n.comercio_id);};
  b.classList.add('ver');setTimeout(()=>b.classList.remove('ver'),9000);
  if('Notification'in window&&Notification.permission==='granted'&&navigator.serviceWorker){
    navigator.serviceWorker.ready.then(r=>r.showNotification(n.comercio_nombre+': '+n.titulo,{body:n.mensaje,icon:'img/icons/icon-192.png',tag:'promo'})).catch(()=>{});
  }
}

/* ===== NOVEDADES: bandeja con punto de no leído (no es push real; FCM queda para otra versión) ===== */
estado.novedades=[];
db.collection('notificaciones').orderBy('fecha_envio','desc').limit(20).onSnapshot(s=>{
  estado.novedades=s.docs.map(d=>({id:d.id,...d.data()}));actualizarCampana();
},()=>{});
function noLeidas(){const v=ls.get('fc_novedades_leido',0);return estado.novedades.filter(n=>(aMs(n.fecha_envio)||0)>v).length+(typeof avisosAdminNuevos==='function'?avisosAdminNuevos():0);}
function pendientesAdmin(){return esAdmin()?porAprobar()+premiumPorActivar()+(estado.adminPend.eventos||[]).length:0;}
function campanaHTML(){
  const n=noLeidas(),p=pendientesAdmin();
  return '<button class="btn-redondo campana" id="bNovedades" aria-label="Novedades'+(n?', '+n+' sin leer':'')+(p?', '+p+' por aprobar':'')+'">'+icon('bell')+(n||p?'<span class="punto-nuevo'+(p?' alerta':'')+'" aria-hidden="true"></span>':'')+'</button>';
}
function actualizarCampana(){const b=$('#bNovedades');if(b)b.outerHTML=campanaHTML();const nb=$('#bNovedades');if(nb)nb.onclick=abrirNovedades;}
function abrirNovedades(){
  const visto=ls.get('fc_novedades_leido',0);const lista=estado.novedades;
  const pa=esAdmin()?porAprobar():0,pp=esAdmin()?premiumPorActivar():0;
  const bloqueAdmin=(pa||pp)?'<button class="aviso-admin" id="nvAdmin">'+icon('shield-check',22)+'<span><b>'+(pa?pa+' por aprobar':'Nada por aprobar')+'</b>'
    +'<small>'+(pp?pp+' solicitud'+(pp>1?'es':'')+' de Premium · ':'')+'Toca para abrir el panel</small></span>'+icon('chevron-right')+'</button>':'';
  abrirHoja('<div class="hoja-pad"><h2 class="hoja-tit">Novedades</h2>'+bloqueAdmin+'<p class="nota">Promociones y anuncios de los comercios destacados de Fusa.</p>'
    +(lista.length?'<div class="novedades">'+lista.map(n=>'<button class="novedad'+((aMs(n.fecha_envio)||0)>visto?' nueva':'')+'" data-com="'+esc(n.comercio_id)+'">'
        +'<span class="nv-ic">'+icon('megaphone',18)+'</span><span class="nv-tx"><b>'+esc(n.titulo)+'</b><span>'+esc(n.mensaje)+'</span>'
        +'<small>'+esc(n.comercio_nombre||'')+' · '+fechaCorta(aMs(n.fecha_envio))+'</small></span></button>').join('')+'</div>'
      :'<div class="vacio">'+icon('bell',48)+'<b>Aún no hay novedades</b><p>Aquí verás las promociones de los comercios destacados.</p></div>')
    +'</div>');
  $$('#sheetGen [data-com]').forEach(b=>b.onclick=()=>{cerrar('ovGen');abrirDetalle(b.dataset.com);});
  const na=$('#nvAdmin');if(na)na.onclick=irAlPanelAdmin;
  ls.set('fc_novedades_leido',Date.now());actualizarCampana();
}

/* ===== AVISOS PARA EL ADMIN: comercios y solicitudes pendientes en vivo ===== */
let adminUnsubs=[];
estado.adminPend={comercios:[],solicitudes:[],eventos:[]};
function escucharAdmin(){
  if(adminUnsubs.length||!esAdmin())return;
  adminUnsubs.push(db.collection('comercios').where('estado_publicacion','==','pendiente').onSnapshot(s=>{
    estado.adminPend.comercios=s.docs.map(d=>{const x=d.data();return {id:d.id,nombre:x.nombre,fecha:aMs(x.fecha_modificacion)||aMs(x.fechaCreacion)||0};});
    avisosAdminCambiaron();
  },()=>{}));
  adminUnsubs.push(db.collection('solicitudes').where('estado','==','pendiente').onSnapshot(s=>{
    estado.adminPend.solicitudes=s.docs.map(d=>({id:d.id,...d.data(),fecha:aMs(d.data().fecha)||0}));
    avisosAdminCambiaron();
  },()=>{}));
  // Eventos sugeridos o publicados por organizadores (y los de la IA), pendientes de revisión
  adminUnsubs.push(db.collection('eventos').where('estado','==','pendiente').onSnapshot(s=>{
    estado.adminPend.eventos=s.docs.map(d=>{const x=d.data();return {id:d.id,...x,ini:aMs(x.fecha_inicio),fin:aMs(x.fecha_fin),fecha:aMs(x.fecha_creacion)||0};});
    avisosAdminCambiaron();
  },()=>{}));
}
function dejarDeEscucharAdmin(){adminUnsubs.forEach(u=>u());adminUnsubs=[];estado.adminPend={comercios:[],solicitudes:[],eventos:[]};}
// "Por aprobar" = comercios nuevos + reclamos de negocio
function porAprobar(){return estado.adminPend.comercios.length+estado.adminPend.solicitudes.filter(s=>s.tipo==='reclamo').length;}
function premiumPorActivar(){return estado.adminPend.solicitudes.filter(s=>s.tipo==='premium').length;}
// Avisos del admin que llegaron después de la última vez que abrió la campana
function avisosAdminNuevos(){
  if(!esAdmin())return 0;
  const v=ls.get('fc_novedades_leido',0);
  return estado.adminPend.comercios.filter(c=>c.fecha>v).length+estado.adminPend.solicitudes.filter(x=>x.fecha>v).length;
}
function avisosAdminCambiaron(){
  actualizarCampana();
  const v=vistaActual().tipo;
  if(v==='perfil')render(true);
  if(v==='admin')cargarAdmin();
}
function irAlPanelAdmin(){
  cerrar('ovGen');
  if(location.hash==='#/admin'){estado.admin.datos=null;navegar({tipo:'admin'});}
  else location.hash='#/admin';
}

/* ===== RECLAMAR UN NEGOCIO EXISTENTE (Fase 2.4) ===== */
async function reclamarNegocio(d){
  if(!logueado()){pedirLogin('Inicia sesión para reclamar tu negocio.',true);return;}
  abrirHoja('<div class="hoja-pad"><h2 class="hoja-tit">Reclamar «'+esc(d.nombre)+'»</h2>'
    +'<p class="nota">Un administrador te contactará para confirmar que eres el dueño. Cuando lo apruebe, podrás editar la ficha desde «Mi negocio».</p>'
    +'<div class="campo mt-16"><label for="rTel">Teléfono de contacto <span class="req">*</span></label><input id="rTel" type="tel" maxlength="13" placeholder="Ej: 3001234567"></div>'
    +'<div class="campo"><label for="rMsg">¿Cómo podemos confirmarlo? (opcional)</label><textarea id="rMsg" maxlength="300" placeholder="Ej: soy la propietaria desde 2019, mi NIT es..."></textarea></div>'
    +'<button class="btn btn-primario btn-bloque" id="rEnviar">Enviar solicitud</button></div>');
  $('#rEnviar').onclick=async()=>{
    const tel=telLimpio($('#rTel').value);
    if(!/^\d{7,10}$/.test(tel)){toast('Escribe un teléfono válido');return;}
    try{
      const prev=await db.collection('solicitudes').where('uid','==',estado.usuario.uid).where('tipo','==','reclamo').get();
      if(prev.docs.some(x=>x.data().comercio_id===d.id&&x.data().estado==='pendiente')){cerrar('ovGen');toast('Ya enviaste una solicitud para este negocio');return;}
      await db.collection('solicitudes').add({tipo:'reclamo',comercio_id:String(d.id),comercio_nombre:d.nombre,telefono:tel,mensaje:$('#rMsg').value.trim().slice(0,300),
        uid:estado.usuario.uid,usuario_nombre:estado.usuario.nombre,correo:estado.usuario.email,estado:'pendiente',fecha:FV.serverTimestamp()});
      cerrar('ovGen');toast('Solicitud enviada. Te contactaremos pronto.');
    }catch(e){console.error(e);toast('No se pudo enviar la solicitud. Revisa tu conexión.');}
  };
}

/* ===== REPORTAR UN PROBLEMA (ficha o reseña) ===== */
function reportar(d,resena){
  if(!logueado()){pedirLogin('Inicia sesión para reportar un problema.');return;}
  const motivos=resena?['Contenido ofensivo','Información falsa','No es una experiencia real','Otro']
    :['Información incorrecta','Cerró definitivamente','Fotos inapropiadas','Otro'];
  abrirHoja('<div class="hoja-pad"><h2 class="hoja-tit">Reportar '+(resena?'una reseña':'un problema')+'</h2><p class="nota">'+esc(d.nombre)+'</p>'
    +'<div class="chips-motivo mt-16" role="radiogroup" aria-label="Motivo">'+motivos.map(m=>'<button type="button" class="chip-filtro" data-mot="'+esc(m)+'" role="radio" aria-checked="false">'+esc(m)+'</button>').join('')+'</div>'
    +'<div class="campo mt-16"><label for="repTxt">Detalles (opcional)</label><textarea id="repTxt" maxlength="300" placeholder="Cuéntanos qué está mal..."></textarea></div>'
    +'<button class="btn btn-primario btn-bloque" id="repEnviar">Enviar reporte</button></div>');
  let motivo='';
  $$('#sheetGen [data-mot]').forEach(b=>b.onclick=()=>{motivo=b.dataset.mot;$$('#sheetGen [data-mot]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-checked',x===b);});});
  $('#repEnviar').onclick=async()=>{
    if(!motivo){toast('Elige un motivo');return;}
    try{
      await db.collection('reportes').add({tipo:resena?'resena':'ficha',comercio_id:String(d.id),comercio_nombre:d.nombre,calificacion_id:resena?resena._id:null,
        resena_texto:resena?(resena.comentario||''):null,motivo,detalle:$('#repTxt').value.trim().slice(0,300),
        uid:estado.usuario.uid,usuario_nombre:estado.usuario.nombre,estado:'pendiente',fecha:FV.serverTimestamp()});
      cerrar('ovGen');toast('Gracias. Un administrador revisará tu reporte.');
    }catch(e){console.error(e);toast('No se pudo enviar el reporte');}
  };
}

/* ===== PANEL DE ADMINISTRACIÓN (Fase 2.1) — ruta #/admin, solo rol admin ===== */
function esAdmin(){return logueado()&&estado.perfil&&estado.perfil.rol==='admin';}
estado.admin={tab:'aprobar',datos:null,cargando:false};
async function cargarAdmin(){
  if(!esAdmin())return;
  estado.admin.cargando=true;
  try{
    const [com,sol,rep,can,usu,opi]=await Promise.all([
      db.collection('comercios').get(),
      db.collection('solicitudes').where('estado','==','pendiente').get(),
      db.collection('reportes').where('estado','==','pendiente').get(),
      db.collection('canjes').where('estado','==','usado').get(),
      db.collection('usuarios').get(),
      db.collection('opiniones').orderBy('fecha','desc').limit(200).get().catch(()=>({docs:[]}))]);
    const comercios=com.docs.map(x=>({...normalizarNube(x.id,x.data()),_raw:x.data()}));
    const inicioMes=new Date();inicioMes.setDate(1);inicioMes.setHours(0,0,0,0);
    estado.admin.datos={
      pendientes:comercios.filter(c=>c.propietario_uid&&!['aprobado','rechazado','oculto'].includes(c._raw.estado_publicacion)),
      premiumActivos:comercios.filter(c=>premiumVigente(c)).sort((a,b)=>(a.suscripcion_vigente_hasta||0)-(b.suscripcion_vigente_hasta||0)),
      comercios,
      solicitudes:sol.docs.map(x=>({id:x.id,...x.data()})),
      reportes:rep.docs.map(x=>({id:x.id,...x.data()})),
      canjesMes:can.docs.filter(x=>(aMs(x.data().fecha_canje)||0)>=inicioMes.getTime()).length,
      usuarios:usu.size,
      opiniones:opi.docs.map(x=>({id:x.id,...x.data()}))};
  }catch(e){console.error(e);toast('No se pudieron cargar los datos del panel');}
  estado.admin.cargando=false;
  if(vistaActual().tipo==='admin')render(true);
}
function tarjetaComercioAdmin(c,extra){
  const img=imgSegura(c.imagen);
  return '<div class="adm-card"><div class="adm-head"><div class="dc-ico">'+(img?'<img src="'+esc(img)+'" alt="Foto de '+esc(c.nombre)+'">':icon(iconoDe(c)))+'</div>'
    +'<div class="dc-info"><h3>'+esc(c.nombre)+'</h3><p>'+esc(etiquetaDe(c))+' · '+esc(c.direccion)+'</p></div></div>'
    +(c.desc?'<p class="adm-desc">'+esc(c.desc)+'</p>':'')
    +'<p class="nota-c izq">'+icon('phone',14)+' '+esc(c.tel||'Sin teléfono')+' · '+icon('clock',14)+' '+esc(horarioTexto(c))+'</p>'+(extra||'')+'</div>';
}
/* ===== PANEL DE ADMINISTRACIÓN (v4 · Fase 2) — ruta #/admin, solo rol admin =====
   Pestañas: Por aprobar (Negocios nuevos · Solicitudes Premium), Negocios, Reportes, Opiniones y Emergencias. */
const MOTIVOS_RECHAZO=['Datos incompletos','Fotos inadecuadas','Duplicado','No está en Fusagasugá o Pasca','Otro'];
// Mini mapa sin librerías: 3 × 3 teselas de OpenStreetMap centradas en el negocio, con un pin
function miniMapaHTML(lat,lng){
  if(!lat||!lng)return '<div class="mini-mapa sin">'+icon('map-pin',20)+'Sin ubicación en el mapa</div>';
  const z=17,n=2**z,r=lat*Math.PI/180;
  const fx=(lng+180)/360*n,fy=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n;
  const tx=Math.floor(fx),ty=Math.floor(fy),px=(fx-tx)*256,py=(fy-ty)*256;
  let t='';for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)t+='<img src="'+urlTesela(z,tx+dx,ty+dy)+'" alt="" loading="lazy" style="left:'+((dx+1)*256)+'px;top:'+((dy+1)*256)+'px">';
  return '<div class="mini-mapa" role="img" aria-label="Ubicación en el mapa"><div class="mm-teselas" style="left:calc(50% - '+(256+px).toFixed(1)+'px);top:calc(50% - '+(256+py).toFixed(1)+'px)">'+t+'</div>'
    +'<span class="mm-pin">'+icon('map-pin',30)+'</span><span class="mm-atrib">© OpenStreetMap</span></div>';
}
// Vista previa real de la ficha para decidir: fotos, datos, horario, teléfono para llamar y mini mapa
function vistaPreviaAdminHTML(c,acciones){
  const tel=telLimpio(c.tel),n=(c.fotos||[]).length;
  return '<article class="adm-card adm-preview">'
    +'<div class="adm-fotos" data-fotosde="'+esc(c.id)+'">'+(imgSegura(c.imagen)?'<img src="'+esc(c.imagen)+'" alt="Portada de '+esc(c.nombre)+'">':'<span class="foto-cargando">'+icon(iconoDe(c),32)+'</span>')
      +'<span class="gal-contador">'+(n?n+(n===1?' foto':' fotos'):'Sin fotos')+'</span></div>'
    +'<div class="adm-pv-cuerpo"><h3>'+esc(c.nombre)+'</h3><p class="nota-c izq">'+esc(etiquetaDe(c))+' · '+esc(c.municipio||'Fusagasugá')+'</p>'
    +(c.desc?'<p class="adm-desc">'+esc(c.desc)+'</p>':'')
    +'<div class="datos">'+filaDato('map-pin','Dirección',esc(c.direccion))+filaDato('clock','Horario',esc(horarioTexto(c)))
      +filaDato('phone','Teléfono',tel?esc(c.tel)+' <a class="btn btn-secundario btn-sm adm-llamar" href="tel:'+esc(tel)+'">'+icon('phone',16)+'Llamar para verificar</a>':'Sin teléfono')+'</div>'
    +miniMapaHTML(c.lat,c.lng)
    +(acciones||'')+'</div></article>';
}
// Las fotos de la vista previa se cargan después (solo el admin y el dueño pueden leerlas antes de aprobar)
function cargarFotosPreview(){
  $$('[data-fotosde]').forEach(async caja=>{
    const c=estado.admin.datos.comercios.find(x=>x.id===caja.dataset.fotosde);
    if(!c||!(c.fotos||[]).length)return;
    try{
      const m=await cargarFotosDe(c.id,c.fotos);
      const imgs=c.fotos.filter(id=>m[id]).map((id,i)=>'<img src="'+m[id]+'" alt="Foto '+(i+1)+' de '+esc(c.nombre)+'">');
      if(imgs.length)caja.innerHTML='<div class="adm-fotos-pista">'+imgs.join('')+'</div><span class="gal-contador">'+imgs.length+(imgs.length===1?' foto':' fotos')+' · desliza</span>';
    }catch(e){}
  });
}
// Rechazo con motivo obligatorio: opciones rápidas + detalle (obligatorio si es "Otro")
function pedirMotivo(titulo,cb,opciones=MOTIVOS_RECHAZO){
  let elegido='';
  abrirHoja('<div class="hoja-pad"><h2 class="hoja-tit">'+esc(titulo)+'</h2><p class="nota">El motivo es obligatorio: la persona lo verá en su perfil.</p>'
    +'<div class="chips-motivo mt-16" role="radiogroup" aria-label="Motivo">'+opciones.map(m=>'<button type="button" class="chip-filtro" role="radio" aria-checked="false" data-motivo="'+esc(m)+'">'+esc(m)+'</button>').join('')+'</div>'
    +'<div class="campo mt-16"><label for="motTxt">Detalle <span class="opc" id="motOpc">(opcional)</span></label><textarea id="motTxt" maxlength="200" placeholder="Ej: falta la dirección exacta del local"></textarea></div>'
    +'<button class="btn btn-primario btn-bloque" id="motOk">Confirmar</button></div>');
  $$('[data-motivo]').forEach(b=>b.onclick=()=>{
    elegido=b.dataset.motivo;$$('[data-motivo]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',on);});
    $('#motOpc').textContent=elegido==='Otro'?'(obligatorio)':'(opcional)';
  });
  $('#motOk').onclick=()=>{
    const d=$('#motTxt').value.trim();
    if(!elegido){toast('Elige un motivo');return;}
    if(elegido==='Otro'&&d.length<4){toast('Escribe el motivo');return;}
    cerrar('ovGen');cb(elegido==='Otro'?d:elegido+(d?': '+d:''));
  };
}
// Datos de un negocio de muestra (datos.js) para crear su documento en la nube con el mismo id
function datosSemilla(b,extra){
  return {cat:b.cat,categoria:b.cat,emoji:b.emoji||'',nombre:b.nombre,desc:b.desc||'',horario:b.horario||'',direccion:b.direccion||'',tel:b.tel||'',whatsapp:b.whatsapp||'',
    imagen:b.imagen||'',lat:b.lat||null,lng:b.lng||null,ubicacion_aprox:!!b.ubicacion_aprox,sub:b.sub||'',tipo:b.tipo||'',nivelDificultad:b.nivelDificultad||'',
    municipio:b.municipio||'Fusagasugá',redesSociales:{},sitioWeb:b.sitioWeb||'',esPremium:false,prioridadBusqueda:0,fotos:[],
    propietario_uid:null,estado_publicacion:'aprobado',fecha_aprobacion:FV.serverTimestamp(),fechaCreacion:FV.serverTimestamp(),...(extra||{})};
}
// Premium: por defecto sin fecha de fin mientras dure la fase de pruebas; vencimiento opcional
function pedirPremium(nombre,cb){
  abrirHoja('<div class="hoja-pad"><h2 class="hoja-tit">Activar Premium</h2><p class="nota">«'+esc(nombre)+'» tendrá cupones, 10 fotos, posición destacada, novedades y redes en su ficha.</p>'
    +'<label class="fil-fila"><span class="fil-tx">'+icon('infinity',20)+'Sin fecha de fin (fase de pruebas)</span><input type="checkbox" role="switch" class="interruptor" id="premSinFin" checked></label>'
    +'<div class="campo mt-16" id="premFechaCaja" hidden><label for="premFecha">Vence el</label><input type="date" id="premFecha" min="'+isoLocal(Date.now()+86400000)+'" value="'+isoLocal(Date.now()+30*86400000)+'"></div>'
    +'<button class="btn btn-primario btn-bloque mt-16" id="premOk">'+icon('star',18)+'Activar Premium</button></div>');
  $('#premSinFin').onchange=e=>{$('#premFechaCaja').hidden=e.target.checked;};
  $('#premOk').onclick=()=>{
    const sinFin=$('#premSinFin').checked,f=$('#premFecha').value;
    if(!sinFin&&(!f||aMs(f)<Date.now())){toast('Elige una fecha futura');return;}
    cerrar('ovGen');cb(sinFin?null:aMs(f));
  };
}
function cambiosPremium(hasta){
  return {esPremium:true,plan:'premium',prioridadBusqueda:1,prueba_usada:true,suscripcion_vigente_hasta:hasta?TS.fromMillis(hasta):FV.delete()};
}
function textoVencePremium(c){return c.suscripcion_vigente_hasta?'Vence el '+fechaCorta(c.suscripcion_vigente_hasta):'Sin fecha de fin';}
// Lista de la pestaña Negocios: los de la nube (todos los estados) + los de muestra que aún no están en la nube
// Copias de la carga inicial: documentos sin dueño con el nombre de un negocio de muestra (el directorio ya los ignora)
function copiaVieja(c){return !c.propietario_uid&&!idsBase.has(c.id)&&nombresBase.has(norm(c.nombre).trim());}
function negociosAdmin(D){
  const nube=new Map(D.comercios.filter(c=>!copiaVieja(c)).map(c=>[c.id,c]));
  const semillas=COMERCIOS_BASE.filter(b=>!nube.has(b.id)).map(b=>({...b,_semilla:true,estado_publicacion:estado.ocultos.has(b.id)?'oculto':'aprobado'}));
  return [...nube.values(),...semillas].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
}
function chipEstadoAdmin(c){
  const e=c.estado_publicacion;
  return e==='aprobado'?'<span class="chip-estado pub">Publicado</span>':e==='oculto'?'<span class="chip-estado rech">Oculto</span>'
    :e==='rechazado'?'<span class="chip-estado rech">Rechazado</span>':'<span class="chip-estado rev">En revisión</span>';
}
function renderAdmin(){
  const cuerpo=$('#cuerpo');
  if(!esAdmin()){cuerpo.innerHTML='<div class="vacio">'+icon('shield-check',48)+'<b>Panel de administración</b><p>Solo disponible para administradores.</p></div>';return;}
  const A=estado.admin,D=A.datos;
  if(!D){cuerpo.innerHTML='<div class="vista"><div class="dash-top"><h2>Administración</h2></div><div class="vacio">'+icon('clock',48)+'<b>Cargando…</b></div></div>';if(!A.cargando)cargarAdmin();return;}
  const reclamos=D.solicitudes.filter(s=>s.tipo==='reclamo'),premium=D.solicitudes.filter(s=>s.tipo==='premium');
  const nNegocios=D.pendientes.length+reclamos.length;
  const tabs=[['aprobar','Por aprobar','clipboard-check',nNegocios+premium.length],['eventos','Eventos','calendar-days',(estado.adminPend.eventos||[]).length],['negocios','Negocios','store',0],['reportes','Reportes','flag',D.reportes.length],
    ['opiniones','Opiniones','message-circle-heart',0],['banners','Banners','image',0],['emergencias','Emergencias','siren',0]];
  if(!A.subtab)A.subtab='negocios';
  let html='';
  if(A.tab==='aprobar'){
    html='<div class="seg" role="tablist" aria-label="Qué aprobar">'
      +[['negocios','Negocios nuevos',nNegocios],['premium','Solicitudes Premium',premium.length]].map(([k,t,n])=>'<button role="tab" aria-selected="'+(A.subtab===k)+'" class="'+(A.subtab===k?'on':'')+'" data-asub="'+k+'">'+t+(n?' <span class="contador">'+n+'</span>':'')+'</button>').join('')+'</div>';
    if(A.subtab==='negocios'){
      html+=(nNegocios?'':'<div class="vacio">'+icon('circle-check',48)+'<b>Todo al día</b><p>No hay negocios ni reclamos por revisar.</p></div>')
        +(D.pendientes.length?'<p class="dash-section">Negocios nuevos ('+D.pendientes.length+')</p>'+D.pendientes.map(c=>vistaPreviaAdminHTML(c,
          '<p class="nota-c izq">Registrado por '+esc(c._raw.propietario||'un usuario')+' · '+(c.esPremium?'Premium':'Gratis')+' · '+fechaCorta(aMs(c._raw.fecha_modificacion)||aMs(c._raw.fechaCreacion))+'</p>'
          +'<div class="dc-actions"><button class="btn btn-primario btn-sm" data-aprobar="'+esc(c.id)+'">'+icon('check',16)+'Aprobar</button><button class="btn btn-secundario btn-sm" data-rechazar="'+esc(c.id)+'">Rechazar</button></div>')).join(''):'')
        +(reclamos.length?'<p class="dash-section">Reclamos de negocios existentes ('+reclamos.length+')</p>'+reclamos.map(s=>{const c=buscar(s.comercio_id)||D.comercios.find(x=>x.id===s.comercio_id);
            return c?vistaPreviaAdminHTML(c,'<p class="nota-c izq">'+icon('user',14)+' Lo reclama '+esc(s.usuario_nombre||'')+' · '+esc(s.correo||'')+' · Tel. '+esc(s.telefono||'')+'</p>'+(s.mensaje?'<p class="adm-desc">«'+esc(s.mensaje)+'»</p>':'')
              +'<div class="dc-actions"><button class="btn btn-primario btn-sm" data-okreclamo="'+esc(s.id)+'">'+icon('check',16)+'Aprobar reclamo</button><button class="btn btn-secundario btn-sm" data-noreclamo="'+esc(s.id)+'">Rechazar</button></div>')
              :'<div class="adm-card"><h3>'+esc(s.comercio_nombre)+'</h3><p class="nota-c izq">Lo reclama '+esc(s.usuario_nombre||'')+'</p><div class="dc-actions"><button class="btn btn-secundario btn-sm" data-noreclamo="'+esc(s.id)+'">Rechazar</button></div></div>';}).join(''):'');
    }else{
      html+=(premium.length?premium.map(s=>{const c=D.comercios.find(x=>x.id===s.comercio_id);
          return '<div class="adm-card"><div class="adm-head"><div class="dc-ico">'+(c&&imgSegura(c.imagen)?'<img src="'+esc(c.imagen)+'" alt="">':icon('store'))+'</div><div class="dc-info"><h3>'+esc(s.comercio_nombre)+'</h3>'
            +'<p>Plan solicitado: <b>'+(s.plan==='premium'||!s.plan?'Premium':esc(s.plan))+'</b> · '+fechaCorta(aMs(s.fecha))+'</p></div></div>'
            +'<p class="nota-c izq">'+icon('user',14)+' '+esc(s.usuario_nombre||'')+' · '+esc(s.correo||'')+'</p>'
            +(s.mensaje?'<p class="adm-desc">«'+esc(s.mensaje)+'»</p>':'<p class="nota-c izq">Sin mensaje.</p>')
            +'<div class="dc-actions"><button class="btn btn-primario btn-sm" data-okprem="'+esc(s.id)+'">'+icon('star',16)+'Activar Premium</button><button class="btn btn-secundario btn-sm" data-noprem="'+esc(s.id)+'">Rechazar</button></div></div>';}).join('')
          :'<div class="vacio">'+icon('star',48)+'<b>Sin solicitudes de Premium</b></div>')
        +'<p class="dash-section">Premium activos ('+D.premiumActivos.length+')</p>'
        +(D.premiumActivos.length?D.premiumActivos.map(c=>'<div class="canje-fila">'+icon('star',18)+'<div><b>'+esc(c.nombre)+'</b><span>'+textoVencePremium(c)+'</span></div></div>').join(''):'<p class="nota-c izq">Ninguno por ahora.</p>');
    }
  }else if(A.tab==='negocios'){
    const q=norm(A.busca||'').trim(),todos=negociosAdmin(D),lista=todos.filter(c=>!q||norm(c.nombre+' '+etiquetaDe(c)+' '+(c.direccion||'')).includes(q));
    const max=A.max||25;
    html='<div class="campo"><label for="admBuscar" class="sr-only">Buscar negocio</label><input class="input" type="search" id="admBuscar" placeholder="Buscar por nombre, categoría o dirección" value="'+esc(A.busca||'')+'"></div>'
      +'<p class="nota-c izq">'+lista.length+' de '+todos.length+' negocios</p>'
      +lista.slice(0,max).map(c=>'<div class="adm-fila"><div class="dc-info"><b>'+esc(c.nombre)+'</b><span>'+esc(etiquetaDe(c))+(c._semilla?' · de muestra':c.propietario_uid?' · con dueño':'')+'</span>'
        +'<div class="adm-chips">'+chipEstadoAdmin(c)+(premiumVigente(c)?'<span class="chip-estado rev">'+icon('star',12,'ic-fill')+'Premium · '+textoVencePremium(c)+'</span>':'')+'</div></div>'
        +'<div class="dc-actions"><button class="btn btn-secundario btn-sm" data-neditar="'+esc(c.id)+'">'+icon('pencil',16)+'Editar</button>'
        +(c.estado_publicacion==='oculto'?'<button class="btn btn-secundario btn-sm" data-nmostrar="'+esc(c.id)+'">'+icon('eye',16)+'Mostrar</button>'
          :c.estado_publicacion==='aprobado'?'<button class="btn btn-secundario btn-sm" data-nocultar="'+esc(c.id)+'">'+icon('eye-off',16)+'Ocultar</button>':'')
        +(c.propietario_uid?(premiumVigente(c)?'<button class="btn btn-ghost" data-nquitarprem="'+esc(c.id)+'">Quitar Premium</button>':'<button class="btn btn-ghost" data-nactivarprem="'+esc(c.id)+'">'+icon('star',16)+'Activar Premium</button>'):'')
        +'</div></div>').join('')
      +(lista.length>max?'<button class="btn btn-ghost btn-bloque" id="admMas">Mostrar más</button>':'');
  }else if(A.tab==='reportes'){
    html=D.reportes.length?D.reportes.map(r=>'<div class="adm-card"><h3>'+(r.tipo==='resena'?'Reseña en ':'Ficha de ')+esc(r.comercio_nombre)+'</h3>'
      +'<p class="nota-c izq">'+esc(r.motivo)+' · reportado por '+esc(r.usuario_nombre||'')+' · '+fechaCorta(aMs(r.fecha))+'</p>'
      +(r.resena_texto?'<p class="adm-desc">«'+esc(r.resena_texto)+'»</p>':'')+(r.detalle?'<p class="adm-desc">'+esc(r.detalle)+'</p>':'')
      +'<div class="dc-actions">'+(r.tipo==='resena'&&r.calificacion_id?'<button class="btn btn-primario btn-sm" data-ocultar="'+esc(r.id)+'">'+icon('eye-off',16)+'Ocultar reseña</button>'
        :'<button class="btn btn-primario btn-sm" data-ocultarneg="'+esc(r.id)+'">'+icon('eye-off',16)+'Ocultar negocio</button>')
      +'<button class="btn btn-secundario btn-sm" data-editarrep="'+esc(r.id)+'">'+icon('pencil',16)+'Editar ficha</button>'
      +'<button class="btn btn-ghost" data-descartar="'+esc(r.id)+'">Descartar</button></div></div>').join('')
      :'<div class="vacio">'+icon('flag',48)+'<b>No hay reportes pendientes</b></div>';
  }else if(A.tab==='opiniones'){
    html=opinionesAdminHTML(D.opiniones||[]);
  }else if(A.tab==='eventos'){
    html=eventosAdminHTML();
  }else if(A.tab==='banners'){
    html=bannersAdminHTML();
  }else{
    const mun=A.mun||'fusagasuga',lista=(A.borrador&&A.borrador[mun])||listaEmergencias(mun).map(e=>({...e}));
    A.borrador=A.borrador||{};A.borrador[mun]=lista;
    const act=estado.emergencias[mun]&&estado.emergencias[mun].actualizado;
    html='<div class="seg" role="group" aria-label="Municipio"><button data-amun="fusagasuga" class="'+(mun==='fusagasuga'?'on':'')+'">Fusagasugá</button><button data-amun="pasca" class="'+(mun==='pasca'?'on':'')+'">Pasca</button></div>'
      +'<p class="nota-c izq">'+(act?'Última actualización: '+fechaHora(act):'Aún no se han editado; se muestran los números de la app.')+'</p>'
      +lista.map((e,i)=>'<div class="emg-fila"><div class="emg-campos">'
        +'<input class="input" data-emg="'+i+'" data-k="entidad" value="'+esc(e.entidad)+'" aria-label="Entidad" placeholder="Entidad">'
        +'<input class="input" data-emg="'+i+'" data-k="numero" value="'+esc(e.numero)+'" aria-label="Número" placeholder="Número" inputmode="tel">'
        +'<input class="input" data-emg="'+i+'" data-k="detalle" value="'+esc(e.detalle)+'" aria-label="Descripción" placeholder="Descripción">'
        +'<select class="input" data-emg="'+i+'" data-k="tipo" aria-label="Tipo">'+['Seguridad','Salud','Rescate','Atención ciudadana'].map(t=>'<option'+(e.tipo===t?' selected':'')+'>'+t+'</option>').join('')+'</select>'
        +'</div><button class="btn-redondo" data-emgdel="'+i+'" aria-label="Quitar '+esc(e.entidad)+'">'+icon('trash-2')+'</button></div>').join('')
      +'<div class="dc-actions mt-16"><button class="btn btn-secundario btn-sm" id="emgAgregar">'+icon('plus',16)+'Agregar número</button></div>'
      +'<button class="btn btn-primario btn-bloque mt-16" id="emgGuardar">Guardar números de '+(mun==='pasca'?'Pasca':'Fusagasugá')+'</button>';
  }
  const fotosAntiguas=D.comercios.filter(c=>!copiaVieja(c)&&fotoAntigua(c._raw));
  // El admin las migra solo al abrir el panel (una vez por sesión); el botón queda por si alguna falla
  if(fotosAntiguas.length&&!A.migracionAuto){A.migracionAuto=true;
    migrarFotosAntiguas(fotosAntiguas.map(c=>({id:c.id,nombre:c.nombre,imagen:c._raw.imagen}))).then(n=>{if(n){toast(n+(n===1?' foto pasada':' fotos pasadas')+' a la galería');cargarAdmin();}});}
  cuerpo.innerHTML='<div class="vista"><div class="dash-top"><h2>Administración</h2><button class="btn-redondo" id="admRecargar" aria-label="Actualizar datos">'+icon('refresh-cw',20)+'</button></div>'
    +'<div class="metricas">'+[['store',database.length,'Negocios publicados'],['clock',nNegocios+premium.length,'Por aprobar'],['ticket',D.canjesMes,'Cupones canjeados este mes'],['users',D.usuarios,'Usuarios registrados']]
      .map(([ic,n,t])=>'<div class="metrica">'+icon(ic,18)+'<b>'+n+'</b><span>'+t+'</span></div>').join('')+'</div>'
    +(fotosAntiguas.length?'<button class="btn btn-tonal btn-bloque mt-16" id="admMigrar">'+icon('images',18)+'Pasar '+fotosAntiguas.length+(fotosAntiguas.length===1?' foto antigua':' fotos antiguas')+' a la galería</button>':'')
    +'<div class="adm-tabs" role="tablist">'+tabs.map(([k,t,ic,n])=>'<button role="tab" aria-selected="'+(A.tab===k)+'" class="'+(A.tab===k?'on':'')+'" data-atab="'+k+'">'+icon(ic,18)+t+(n?'<span class="contador alerta">'+n+'</span>':'')+'</button>').join('')+'</div>'
    +'<div class="adm-cuerpo">'+html+'</div></div>';
  $('#admRecargar').onclick=()=>{toast('Actualizando…');cargarAdmin();};
  const mg=$('#admMigrar');if(mg)mg.onclick=async()=>{mg.disabled=true;mg.textContent='Pasando fotos…';
    const n=await migrarFotosAntiguas(fotosAntiguas.map(c=>({id:c.id,nombre:c.nombre,imagen:c._raw.imagen})));
    toast(n+(n===1?' foto pasada':' fotos pasadas')+' a la galería');cargarAdmin();};
  $$('[data-atab]').forEach(b=>b.onclick=()=>{A.tab=b.dataset.atab;render(true);});
  $$('[data-asub]').forEach(b=>b.onclick=()=>{A.subtab=b.dataset.asub;render(true);});
  const pend=id=>D.pendientes.find(c=>c.id===id),sol=id=>D.solicitudes.find(s=>s.id===id),rep=id=>D.reportes.find(r=>r.id===id);
  const negocio=id=>negociosAdmin(D).find(c=>c.id===id);
  $$('[data-aprobar]').forEach(b=>b.onclick=()=>adminAccion(()=>db.collection('comercios').doc(b.dataset.aprobar).update({estado_publicacion:'aprobado',fecha_aprobacion:FV.serverTimestamp(),motivo_rechazo:FV.delete()}),'Negocio aprobado y publicado'));
  $$('[data-rechazar]').forEach(b=>b.onclick=()=>pedirMotivo('Rechazar «'+pend(b.dataset.rechazar).nombre+'»',m=>adminAccion(()=>db.collection('comercios').doc(b.dataset.rechazar).update({estado_publicacion:'rechazado',motivo_rechazo:m}),'Negocio rechazado. La persona verá el motivo en su perfil.')));
  $$('[data-okreclamo]').forEach(b=>b.onclick=()=>aprobarReclamo(sol(b.dataset.okreclamo)));
  $$('[data-noreclamo]').forEach(b=>b.onclick=()=>pedirMotivo('Rechazar el reclamo',m=>adminAccion(()=>db.collection('solicitudes').doc(b.dataset.noreclamo).update({estado:'rechazada',motivo:m,fecha_respuesta:FV.serverTimestamp()}),'Reclamo rechazado'),['No se pudo verificar que sea el dueño','Duplicado','Otro']));
  $$('[data-okprem]').forEach(b=>b.onclick=()=>activarPremiumAdmin(sol(b.dataset.okprem)));
  $$('[data-noprem]').forEach(b=>b.onclick=()=>pedirMotivo('Rechazar Premium',m=>adminAccion(()=>db.collection('solicitudes').doc(b.dataset.noprem).update({estado:'rechazada',motivo:m,fecha_respuesta:FV.serverTimestamp()}),'Solicitud rechazada'),['Negocio aún en revisión','Datos incompletos','Otro']));
  // Negocios: buscar, editar, ocultar/mostrar y Premium
  const bu=$('#admBuscar');if(bu){bu.oninput=()=>{A.busca=bu.value;A.max=25;clearTimeout(A._t);A._t=setTimeout(()=>{render(true);const n=$('#admBuscar');n.focus();n.setSelectionRange(n.value.length,n.value.length);},250);};}
  const mas=$('#admMas');if(mas)mas.onclick=()=>{A.max=(A.max||25)+25;render(true);};
  $$('[data-neditar]').forEach(b=>b.onclick=()=>{const c=negocio(b.dataset.neditar);abrirFormComercio(c._semilla?buscar(c.id)||c:c);});
  $$('[data-nocultar]').forEach(b=>b.onclick=()=>ocultarNegocio(negocio(b.dataset.nocultar)));
  $$('[data-nmostrar]').forEach(b=>b.onclick=()=>mostrarNegocio(negocio(b.dataset.nmostrar)));
  $$('[data-nquitarprem]').forEach(b=>b.onclick=async()=>{const c=negocio(b.dataset.nquitarprem);
    if(!await confirmar('Quitar Premium','«'+c.nombre+'» vuelve al plan Gratis: se pausan sus cupones y sale de Destacados.','Quitar','Cancelar','star',true))return;
    adminAccion(()=>db.collection('comercios').doc(c.id).update({esPremium:false,plan:'gratis',prioridadBusqueda:0,suscripcion_vigente_hasta:FV.delete()}),'Premium quitado');});
  $$('[data-nactivarprem]').forEach(b=>b.onclick=()=>{const c=negocio(b.dataset.nactivarprem);pedirPremium(c.nombre,h=>adminAccion(()=>db.collection('comercios').doc(c.id).update(cambiosPremium(h)),'Premium activado'));});
  // Reportes
  $$('[data-ocultar]').forEach(b=>b.onclick=()=>{const r=rep(b.dataset.ocultar);adminAccion(async()=>{
    const bt=db.batch();bt.update(db.collection('calificaciones').doc(r.calificacion_id),{estado_moderacion:'oculto'});
    bt.update(db.collection('reportes').doc(r.id),{estado:'resuelto',accion:'resena_oculta',fecha_respuesta:FV.serverTimestamp()});await bt.commit();},'Reseña oculta');});
  $$('[data-ocultarneg]').forEach(b=>b.onclick=()=>{const r=rep(b.dataset.ocultarneg),c=negocio(r.comercio_id);
    if(!c){toast('No encontramos ese negocio');return;}
    ocultarNegocio(c,()=>db.collection('reportes').doc(r.id).update({estado:'resuelto',accion:'negocio_oculto',fecha_respuesta:FV.serverTimestamp()}));});
  $$('[data-editarrep]').forEach(b=>b.onclick=()=>{const r=rep(b.dataset.editarrep);const c=buscar(r.comercio_id)||D.comercios.find(x=>x.id===r.comercio_id);
    if(!c){toast('No encontramos ese comercio');return;}
    db.collection('reportes').doc(r.id).update({estado:'resuelto',accion:'ficha_editada',fecha_respuesta:FV.serverTimestamp()}).catch(()=>{});abrirFormComercio(c);});
  $$('[data-descartar]').forEach(b=>b.onclick=()=>adminAccion(()=>db.collection('reportes').doc(b.dataset.descartar).update({estado:'descartado',fecha_respuesta:FV.serverTimestamp()}),'Reporte descartado'));
  enlazarBannersAdmin();enlazarEventosAdmin();
  // Editor de emergencias
  $$('[data-amun]').forEach(b=>b.onclick=()=>{A.mun=b.dataset.amun;render(true);});
  const mun=A.mun||'fusagasuga';
  $$('[data-emg]').forEach(el=>el.oninput=el.onchange=()=>{A.borrador[mun][+el.dataset.emg][el.dataset.k]=el.value;});
  $$('[data-emgdel]').forEach(b=>b.onclick=()=>{A.borrador[mun].splice(+b.dataset.emgdel,1);render(true);});
  const ag=$('#emgAgregar');if(ag)ag.onclick=()=>{A.borrador[mun].push({entidad:'',numero:'',detalle:'',tipo:'Seguridad',emoji:''});render(true);};
  const gu=$('#emgGuardar');if(gu)gu.onclick=()=>{
    const lista=A.borrador[mun].map(e=>({entidad:(e.entidad||'').trim(),numero:telLimpio(e.numero),detalle:(e.detalle||'').trim(),tipo:e.tipo||'Seguridad'})).filter(e=>e.entidad&&e.numero);
    if(!lista.length){toast('Agrega al menos un número');return;}
    adminAccion(()=>db.collection('emergencias').doc(mun).set({lista,actualizado:FV.serverTimestamp()}),'Números de emergencia actualizados');
  };
  cargarFotosPreview();
}
/* ---------- Admin · Banners del inicio (v4 · Fase 5) ----------
   banners/destacado: un solo espacio para un negocio (los Premium se turnan). banners/{id}: banners con foto. */
function textoEnlaceBanner(b){
  const t=b.enlace_tipo||'ninguno';
  if(t==='negocio'){const c=buscar(b.enlace_valor);return 'Abre '+(c?'«'+c.nombre+'»':'un negocio');}
  if(t==='categoria')return 'Abre '+(CAT[b.enlace_valor]?CAT[b.enlace_valor].label:'una categoría');
  if(t==='cupones')return 'Abre los cupones';
  if(t==='registrar')return 'Abre «Registrar mi negocio»';
  return 'Sin botón';
}
const fechaDia=s=>{const [a,m,d]=s.split('-').map(Number);return fechaCorta(new Date(a,m-1,d).getTime());};
function estadoBanner(b){
  if(b.activo===false)return 'En pausa';
  if(b.desde&&b.desde>hoyISO())return 'Programado desde el '+fechaDia(b.desde);
  if(b.hasta&&b.hasta<hoyISO())return 'Vencido el '+fechaDia(b.hasta);
  return 'Visible'+(b.hasta?' hasta el '+fechaDia(b.hasta):'');
}
function bannersAdminHTML(){
  const bs=estado.banners||[],dest=bs.find(b=>b.id==='destacado'),dc=dest&&buscar(dest.comercio_id);
  const fotos=bs.filter(b=>b.tipo==='foto').sort(porOrden);
  const opciones=[...database].sort((a,b)=>(premiumVigente(b)-premiumVigente(a))||a.nombre.localeCompare(b.nombre,'es'));
  return '<p class="dash-section">Negocio destacado</p>'
    +'<p class="nota-c izq">Un solo espacio, el primero del banner principal. Ve cambiándolo para que los negocios Premium se turnen.</p>'
    +'<div class="campo"><label for="admDest">Negocio que se muestra</label><select class="input" id="admDest"><option value="">Ninguno</option>'
    +opciones.map(c=>'<option value="'+esc(c.id)+'"'+(dc&&dc.id===c.id?' selected':'')+'>'+esc(c.nombre)+(premiumVigente(c)?' · Premium':'')+'</option>').join('')+'</select></div>'
    +'<button class="btn btn-secundario btn-sm" id="admDestGuardar">'+icon('star',16)+'Guardar destacado</button>'
    +'<p class="dash-section">Banners con foto ('+fotos.length+')</p>'
    +'<p class="nota-c izq">Se muestran después del destacado y antes de los banners propios de la app (Bienvenida, Cupones, Negocios y Opinión).</p>'
    +(fotos.length?fotos.map((b,i)=>'<div class="adm-fila banner-fila"><img class="bf-foto" src="'+esc(b.imagen)+'" alt="">'
        +'<div class="dc-info"><b>'+esc(b.titulo)+'</b><span>'+esc(estadoBanner(b))+' · '+esc(textoEnlaceBanner(b))+'</span></div>'
        +'<div class="dc-actions"><button class="btn-redondo" data-bmover="'+i+'" data-dir="-1" aria-label="Mover «'+esc(b.titulo)+'» antes"'+(i?'':' disabled')+'>'+icon('arrow-up',18)+'</button>'
        +'<button class="btn-redondo" data-bmover="'+i+'" data-dir="1" aria-label="Mover «'+esc(b.titulo)+'» después"'+(i<fotos.length-1?'':' disabled')+'>'+icon('arrow-down',18)+'</button>'
        +'<button class="btn btn-secundario btn-sm" data-beditar="'+esc(b.id)+'">'+icon('pencil',16)+'Editar</button>'
        +'<button class="btn btn-secundario btn-sm" data-bpausa="'+esc(b.id)+'">'+(b.activo===false?icon('eye',16)+'Mostrar':icon('eye-off',16)+'Pausar')+'</button>'
        +'<button class="btn btn-ghost" data-bborrar="'+esc(b.id)+'">Eliminar</button></div></div>').join('')
      :'<p class="nota-c izq">Aún no hay banners con foto: el inicio muestra los banners propios de la app.</p>')
    +'<button class="btn btn-primario btn-bloque mt-16" id="admBannerNuevo">'+icon('image-plus',18)+'Nuevo banner con foto</button>';
}
function enlazarBannersAdmin(){
  const col=db.collection('banners'),fotos=(estado.banners||[]).filter(b=>b.tipo==='foto').sort(porOrden);
  const g=$('#admDestGuardar');if(g)g.onclick=()=>{const id=$('#admDest').value;
    adminAccion(()=>id?col.doc('destacado').set({tipo:'destacado',comercio_id:id,activo:true,fecha:FV.serverTimestamp()}):col.doc('destacado').delete(),
      id?'Negocio destacado guardado':'El espacio destacado quedó libre');};
  $$('[data-bmover]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.bmover,j=i+(+b.dataset.dir);if(j<0||j>=fotos.length)return;
    const l=[...fotos];[l[i],l[j]]=[l[j],l[i]];
    adminAccion(()=>{const bt=db.batch();l.forEach((x,k)=>bt.update(col.doc(x.id),{orden:k}));return bt.commit();},'Orden actualizado');
  });
  $$('[data-beditar]').forEach(b=>b.onclick=()=>formBanner(fotos.find(f=>f.id===b.dataset.beditar)));
  $$('[data-bpausa]').forEach(b=>b.onclick=()=>{const x=fotos.find(f=>f.id===b.dataset.bpausa);
    adminAccion(()=>col.doc(x.id).update({activo:x.activo===false}),x.activo===false?'Banner visible':'Banner en pausa');});
  $$('[data-bborrar]').forEach(b=>b.onclick=async()=>{const x=fotos.find(f=>f.id===b.dataset.bborrar);
    if(!await confirmar('Eliminar banner','«'+x.titulo+'» sale del inicio. Esta acción no se puede deshacer.','Eliminar','Cancelar','trash-2',true))return;
    adminAccion(()=>col.doc(x.id).delete(),'Banner eliminado');});
  const n=$('#admBannerNuevo');if(n)n.onclick=()=>formBanner(null);
}
// Crear o editar un banner con foto: imagen, etiqueta, título, subtítulo, texto del botón, destino y fechas
function formBanner(b){
  let foto=b?{src:b.imagen}:null;
  const v=k=>esc(b&&b[k]||'');
  const opcCat=Object.entries(CAT).map(([k,c])=>'<option value="'+k+'">'+esc(c.label)+'</option>').join('');
  const opcNeg=[...database].sort((a,c)=>a.nombre.localeCompare(c.nombre,'es')).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.nombre)+'</option>').join('');
  const DESTINOS=[['ninguno','Sin botón'],['negocio','Abrir un negocio'],['categoria','Abrir una categoría'],['cupones','Abrir los cupones'],['registrar','Registrar mi negocio']];
  abrirHoja('<div class="hoja-pad"><h2>'+(b?'Editar banner':'Nuevo banner con foto')+'</h2>'
    +'<p class="nota-c izq">Usa una foto horizontal de un lugar de Fusa. El texto va a la izquierda, sobre una capa violeta que lo hace legible.</p>'
    +'<label class="foto-banner" id="fbCaja"><input type="file" accept="image/*" id="fbFoto" class="sr-only">'
    +(foto?'<img src="'+esc(foto.src)+'" alt="Foto actual del banner. Toca para cambiarla">':'<span class="fb-vacio">'+icon('image-plus',28)+'<b>Elegir foto</b></span>')+'</label>'
    +'<div class="campo"><label for="fbEtq">Etiqueta</label><input class="input" id="fbEtq" maxlength="24" placeholder="Ej.: Este fin de semana" value="'+v('etiqueta')+'"></div>'
    +'<div class="campo"><label for="fbTit">Título <span class="req">*</span></label><input class="input" id="fbTit" maxlength="60" placeholder="Ej.: Festival del Café" value="'+v('titulo')+'"></div>'
    +'<div class="campo"><label for="fbTxt">Subtítulo</label><input class="input" id="fbTxt" maxlength="120" placeholder="Ej.: Parque principal, desde las 9 a. m." value="'+v('texto')+'"></div>'
    +'<div class="campo"><label for="fbEnl">Destino del botón</label><select class="input" id="fbEnl">'+DESTINOS.map(([k,t])=>'<option value="'+k+'"'+((b&&b.enlace_tipo||'ninguno')===k?' selected':'')+'>'+t+'</option>').join('')+'</select></div>'
    +'<div class="campo" id="fbValCaja" hidden><label for="fbVal">¿Cuál?</label><select class="input" id="fbVal"></select></div>'
    +'<div class="campo" id="fbBotCaja"><label for="fbBot">Texto del botón</label><input class="input" id="fbBot" maxlength="20" placeholder="Ver más" value="'+v('boton')+'"></div>'
    +'<div class="fb-fechas"><div class="campo"><label for="fbDesde">Desde</label><input class="input" type="date" id="fbDesde" value="'+v('desde')+'"></div>'
    +'<div class="campo"><label for="fbHasta">Hasta</label><input class="input" type="date" id="fbHasta" value="'+v('hasta')+'"></div></div>'
    +'<p class="nota-c izq">Sin fechas, el banner se muestra mientras esté activo.</p>'
    +'<button class="btn btn-primario btn-bloque mt-16" id="fbGuardar">'+(b?'Guardar cambios':'Publicar banner')+'</button></div>');
  $('#sheetGen').setAttribute('aria-label',b?'Editar banner':'Nuevo banner con foto');
  const pintarDestino=()=>{const t=$('#fbEnl').value;$('#fbValCaja').hidden=!['negocio','categoria'].includes(t);$('#fbBotCaja').hidden=t==='ninguno';
    $('#fbVal').innerHTML=t==='negocio'?opcNeg:t==='categoria'?opcCat:'';if(b&&b.enlace_tipo===t&&b.enlace_valor)$('#fbVal').value=b.enlace_valor;};
  $('#fbEnl').onchange=pintarDestino;pintarDestino();
  $('#fbFoto').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    $('#fbCaja').classList.add('cargando');
    try{foto=await comprimirFoto(f,1280,250000,.8);$('#fbCaja').querySelector('img,.fb-vacio').outerHTML='<img src="'+foto.src+'" alt="Foto elegida para el banner">';}
    catch(err){toast('No pudimos usar esa foto. Prueba con otra.');}
    $('#fbCaja').classList.remove('cargando');
  };
  $('#fbGuardar').onclick=async()=>{
    const tit=$('#fbTit').value.trim(),enl=$('#fbEnl').value,desde=$('#fbDesde').value,hasta=$('#fbHasta').value;
    if(!foto){toast('Elige una foto para el banner');return;}
    if(!tit){toast('Escribe un título');$('#fbTit').focus();return;}
    if(desde&&hasta&&hasta<desde){toast('La fecha final debe ser después de la inicial');$('#fbHasta').focus();return;}
    const orden=b?(b.orden||0):Math.max(-1,...(estado.banners||[]).filter(x=>x.tipo==='foto').map(x=>x.orden||0))+1;
    const datos={tipo:'foto',etiqueta:$('#fbEtq').value.trim(),titulo:tit,texto:$('#fbTxt').value.trim(),imagen:foto.src,
      enlace_tipo:enl,enlace_valor:['negocio','categoria'].includes(enl)?$('#fbVal').value:'',boton:enl==='ninguno'?'':$('#fbBot').value.trim(),
      desde,hasta,orden,activo:b?b.activo!==false:true,fecha:FV.serverTimestamp()};
    $('#fbGuardar').disabled=true;
    await adminAccion(()=>b?db.collection('banners').doc(b.id).set(datos):db.collection('banners').add(datos),b?'Banner actualizado':'Banner publicado en el inicio');
    cerrar('ovGen');
  };
}
// Ocultar: los de la nube pasan a "oculto"; los de muestra se anotan en config/directorio (lista pública de ocultos)
async function ocultarNegocio(c,despues){
  if(!c)return;
  if(!await confirmar('Ocultar negocio','«'+c.nombre+'» dejará de aparecer en el directorio. Puedes mostrarlo de nuevo desde la pestaña Negocios.','Ocultar','Cancelar','eye-off',true))return;
  adminAccion(async()=>{
    if(c._semilla||!estado.admin.datos.comercios.some(x=>x.id===c.id))await db.collection('config').doc('directorio').set({ocultos:FV.arrayUnion(c.id)},{merge:true});
    else await db.collection('comercios').doc(c.id).update({estado_publicacion:'oculto'});
    if(despues)await despues();
  },'Negocio oculto');
}
function mostrarNegocio(c){
  if(!c)return;
  adminAccion(async()=>{
    if(c._semilla)await db.collection('config').doc('directorio').set({ocultos:FV.arrayRemove(c.id)},{merge:true});
    else await db.collection('comercios').doc(c.id).update({estado_publicacion:'aprobado'});
  },'El negocio vuelve a aparecer en el directorio');
}
async function adminAccion(fn,msg){
  try{await fn();toast(msg);await cargarAdmin();}
  catch(e){console.error(e);toast('No se pudo completar. Revisa tu conexión y tus permisos.');}
}
// Aprobar un reclamo: el negocio queda con dueño (si era de muestra, se crea en la nube con el mismo id)
async function aprobarReclamo(s){
  if(!s)return;
  if(!await confirmar('Aprobar reclamo','«'+s.comercio_nombre+'» pasará a ser administrado por '+(s.usuario_nombre||'el solicitante')+'.','Aprobar','Cancelar','store'))return;
  adminAccion(async()=>{
    const ref=db.collection('comercios').doc(s.comercio_id);const snap=await ref.get();
    const bt=db.batch();
    if(snap.exists)bt.update(ref,{propietario_uid:s.uid,propietario:s.usuario_nombre||'',estado_publicacion:'aprobado',fecha_aprobacion:FV.serverTimestamp()});
    else{
      const b=COMERCIOS_BASE.find(c=>c.id===s.comercio_id);if(!b)throw new Error('sin-datos');
      bt.set(ref,datosSemilla(b,{propietario_uid:s.uid,propietario:s.usuario_nombre||''}));
    }
    bt.update(db.collection('solicitudes').doc(s.id),{estado:'aprobada',fecha_respuesta:FV.serverTimestamp()});
    await bt.commit();
  },'Reclamo aprobado: la persona ya ve el negocio en su perfil');
}
// Activar Premium desde una solicitud (sin fecha de fin por defecto durante la fase de pruebas)
function activarPremiumAdmin(s){
  if(!s)return;
  pedirPremium(s.comercio_nombre,h=>adminAccion(async()=>{
    const bt=db.batch();
    bt.update(db.collection('comercios').doc(s.comercio_id),cambiosPremium(h));
    bt.update(db.collection('solicitudes').doc(s.id),{estado:'aprobada',fecha_respuesta:FV.serverTimestamp()});
    await bt.commit();
  },h?'Premium activado hasta el '+fechaCorta(h):'Premium activado sin fecha de fin'));
}

/* ===== "AYÚDANOS A MEJORAR": opiniones de la fase de pruebas =====
   Cualquier visitante (incluso invitado) puede enviar; solo el admin las lee (firestore.rules). */
const VERSION_APP=(()=>{const s=$('script[src*="app.js"]'),m=s&&s.getAttribute('src').match(/v=(\d+)/);return m?'v'+m[1]:'dev';})();
const CARAS=[['angry','Muy mala'],['frown','Mala'],['meh','Regular'],['smile','Buena'],['laugh','Excelente']];
const TEMAS_OPINION=['Diseño','Facilidad de uso','Información de lugares','Cupones','Mapa','Velocidad','Otro'];
function abrirOpinion(origen){
  const op={puntaje:0,temas:[]};
  abrirHoja('<div class="hoja-pad opinion"><h2 class="hoja-tit">Ayúdanos a mejorar</h2>'
    +'<p class="nota">Estamos en pruebas: tu opinión hace mejor esta app. Solo el equipo de Fusa Conecta la lee.</p>'
    +'<p class="lbl mt-16" id="lCaras">¿Cómo te pareció la app?</p>'
    +'<div class="caras" role="radiogroup" aria-labelledby="lCaras">'+CARAS.map(([ic,t],i)=>'<button type="button" class="cara c'+(i+1)+'" role="radio" aria-checked="false" data-cara="'+(i+1)+'"><span class="cara-ic">'+icon(ic,34)+'</span><span>'+t+'</span></button>').join('')+'</div>'
    +'<p class="lbl mt-16" id="lTemas">¿Qué mejorarías? <span class="opc">(opcional, puedes elegir varias)</span></p>'
    +'<div class="chips-motivo" role="group" aria-labelledby="lTemas">'+TEMAS_OPINION.map(t=>'<button type="button" class="chip-filtro" data-tema="'+esc(t)+'" aria-pressed="false">'+esc(t)+'</button>').join('')+'</div>'
    +'<div class="campo mt-16"><label for="opCom">Comentario <span class="opc">(opcional)</span></label><textarea id="opCom" maxlength="500" placeholder="¿Qué te gustó? ¿Qué cambiarías?"></textarea><p class="ayuda cuenta-car" id="opCont">0 / 500</p></div>'
    +'<div class="campo"><label for="opCorreo">¿Te podemos contactar? <span class="opc">(opcional)</span></label><input type="email" id="opCorreo" maxlength="120" placeholder="tucorreo@email.com" autocomplete="email"></div>'
    +'<button class="btn btn-primario btn-bloque" id="opEnviar">Enviar opinión</button></div>');
  $('#sheetGen').setAttribute('aria-label','Ayúdanos a mejorar');
  $$('[data-cara]').forEach(b=>b.onclick=()=>{
    op.puntaje=+b.dataset.cara;
    $$('[data-cara]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',on);});
  });
  $$('[data-tema]').forEach(b=>b.onclick=()=>{
    const t=b.dataset.tema,on=!op.temas.includes(t);
    op.temas=on?[...op.temas,t]:op.temas.filter(x=>x!==t);
    b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);
  });
  $('#opCom').oninput=e=>{$('#opCont').textContent=e.target.value.length+' / 500';};
  $('#opEnviar').onclick=()=>enviarOpinion(op,origen);
}
async function enviarOpinion(op,origen){
  if(!op.puntaje){toast('Elige una carita para calificar la app');$('.caras').scrollIntoView({block:'center'});return;}
  const correo=$('#opCorreo').value.trim();
  if(correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){toast('Revisa el correo o déjalo en blanco');return;}
  const u=auth.currentUser,btn=$('#opEnviar');
  const datos={puntaje:op.puntaje,temas:op.temas,comentario:$('#opCom').value.trim().slice(0,500),correo,
    uid:u?u.uid:null,rol:logueado()&&estado.perfil?(estado.perfil.rol||'usuario'):(u?'invitado':'visitante'),
    pantalla_origen:String(origen||vistaActual().tipo).slice(0,30),version_app:VERSION_APP,dispositivo:navigator.userAgent.slice(0,400),fecha:FV.serverTimestamp()};
  btn.disabled=true;btn.textContent='Enviando…';
  // Sin conexión, Firestore la guarda y la envía al volver la señal
  const envio=db.collection('opiniones').add(datos);
  try{
    if(estado.online)await Promise.race([envio,new Promise((_,mal)=>setTimeout(()=>mal(new Error('lento')),10000))]);
    else envio.catch(()=>{});
    graciasOpinion();
  }catch(e){
    if(e.message==='lento'){graciasOpinion();return;}
    console.error(e);btn.disabled=false;btn.textContent='Enviar opinión';toast('No se pudo enviar. Intenta de nuevo.');
  }
}
function graciasOpinion(){
  medir('opinion_enviada');
  $('#sheetGen').innerHTML='<div class="grab"></div><button class="btn-redondo cerrar" id="cerrarGen" aria-label="Cerrar">'+icon('x')+'</button>'
    +'<div class="hoja-pad hoja-centro gracias"><span class="logo-gracias">'+logo('iso','claro',{alto:56,decorativo:true})+'</span><h2>¡Gracias por tu opinión!</h2>'
    +'<p>'+(estado.online?'La leemos con cuidado para mejorar Fusa Conecta.':'Se enviará apenas tengas conexión.')+'</p>'
    +'<button class="btn btn-primario btn-bloque mt-16" id="opListo">Listo</button></div>';
  $('#cerrarGen').onclick=()=>cerrar('ovGen');$('#opListo').onclick=()=>cerrar('ovGen');
  if(!sinMovimiento())confeti();
}
function opinionesAdminHTML(l){
  if(!l.length)return '<div class="vacio">'+icon('message-circle-heart',48)+'<b>Aún no hay opiniones</b><p>Llegarán desde el banner, el pie de página y el Perfil.</p></div>';
  const prom=l.reduce((a,o)=>a+(+o.puntaje||0),0)/l.length;
  const temas={};l.forEach(o=>(o.temas||[]).forEach(t=>temas[t]=(temas[t]||0)+1));
  const max=Math.max(1,...Object.values(temas));
  return '<div class="op-resumen"><span class="op-prom">'+prom.toFixed(1).replace('.',',')+'</span><div><b>de 5 en promedio</b><span>'+l.length+(l.length===1?' opinión':' opiniones')+'</span></div>'
    +'<span class="op-cara c'+Math.round(prom)+'">'+icon(CARAS[Math.min(4,Math.max(0,Math.round(prom)-1))][0],32)+'</span></div>'
    +'<p class="dash-section">Qué mejorarían</p>'
    +(Object.keys(temas).length?Object.entries(temas).sort((a,b)=>b[1]-a[1]).map(([t,n])=>'<div class="op-tema"><span>'+esc(t)+'</span><div class="barra" role="img" aria-label="'+n+' menciones"><span style="width:'+Math.round(n/max*100)+'%"></span></div><b>'+n+'</b></div>').join('')
      :'<p class="nota-c izq">Nadie marcó temas todavía.</p>')
    +'<p class="dash-section">Comentarios</p>'
    +l.map(o=>'<div class="adm-card op-item"><div class="adm-head"><span class="op-cara c'+o.puntaje+'">'+icon((CARAS[o.puntaje-1]||CARAS[2])[0],24)+'</span><div class="dc-info"><h3>'+esc((CARAS[o.puntaje-1]||['',''])[1])+' · '+o.puntaje+'/5</h3>'
      +'<p>'+fechaHora(aMs(o.fecha))+' · '+esc(o.rol||'visitante')+' · desde '+esc(o.pantalla_origen||'')+'</p></div></div>'
      +((o.temas||[]).length?'<div class="chips-car">'+o.temas.map(t=>'<span class="chip-car">'+esc(t)+'</span>').join('')+'</div>':'')
      +(o.comentario?'<p class="adm-desc">«'+esc(o.comentario)+'»</p>':'')
      +(o.correo?'<p class="nota-c izq">'+icon('mail',14)+' <a href="mailto:'+esc(o.correo)+'">'+esc(o.correo)+'</a></p>':'')+'</div>').join('');
}

/* ===== INSTALAR LA APP: tarjeta dentro del inicio (nunca flotante sobre el contenido) =====
   Aparece después de 30 s de uso o desde la segunda visita, y se puede cerrar por 3 días. */
const INICIO_SESION=Date.now();
(function(){try{if(!sessionStorage.getItem('fc_visita')){sessionStorage.setItem('fc_visita','1');ls.set('fc_visitas',ls.get('fc_visitas',0)+1);}}catch(e){}})();
function mostrarInstalar(){
  if(appInstalada()||!puedeInstalar())return false;
  if(Date.now()-ls.get('fc_instalar_cerrado',0)<3*86400000)return false;
  return ls.get('fc_visitas',1)>=2||Date.now()-INICIO_SESION>=30000;
}
function tarjetaInstalarHTML(){
  if(!mostrarInstalar())return '';
  return '<div class="tarjeta-instalar" id="tarjetaInstalar"><img src="img/icons/icon-192.png" alt="" width="44" height="44"><div><b>Instala Fusa Conecta</b><span>Úsala como app, sin navegador y sin conexión</span></div>'
    +'<button class="btn btn-tonal btn-sm" id="tiSi">'+icon('download',18)+'Instalar</button><button class="btn-redondo ti-no" id="tiNo" aria-label="Cerrar aviso de instalación">'+icon('x')+'</button></div>';
}
function enlazarInstalar(){
  const si=$('#tiSi');if(!si)return;
  si.onclick=instalarApp;
  $('#tiNo').onclick=()=>{ls.set('fc_instalar_cerrado',Date.now());$('#tarjetaInstalar').remove();};
}
setTimeout(()=>{if(vistaActual().tipo==='lista'&&!$('#tarjetaInstalar')&&mostrarInstalar())render(true);},30500);

/* ===== Estado abierto/cerrado: una sola función (estadoApertura), refrescada cada 60 s ===== */
setInterval(()=>{
  $$('[data-estado]').forEach(el=>{const d=buscar(el.dataset.estado),ap=d&&estadoApertura(d);if(ap)el.outerHTML=estadoHTML(ap,d.id);});
},60000);

/* ===== RADIO EN VIVO: Vive Fusagasugá 88.1 FM (emisora de la Alcaldía) =====
   Transmisión Icecast en MP3 a 64 kbps (≈ 29 MB por hora). Sigue sonando mientras se navega
   y se controla desde la pantalla de bloqueo (Media Session). Necesita conexión. */
const EMISORA={nombre:'Vive Fusagasugá',frecuencia:'88.1 FM',de:'Emisora de la Alcaldía de Fusagasugá',
  url:'https://estructuraweb.com.co:9372/live',web:'https://vivefusagasuga.gov.co/'};
const radio={audio:null,estado:'apagada'}; // apagada | conectando | sonando | pausada | error
function radioEstado(e){radio.estado=e;pintarRadio();}
function radioReproducir(){
  if(!estado.online){toast('La radio necesita conexión a internet');return;}
  if(!radio.audio){
    radio.audio=new Audio();radio.audio.preload='none';
    radio.audio.addEventListener('playing',()=>radioEstado('sonando'));
    radio.audio.addEventListener('waiting',()=>{if(radio.estado==='sonando')radioEstado('conectando');});
    radio.audio.addEventListener('error',()=>{if(radio.estado!=='apagada'&&radio.estado!=='pausada')radioEstado('error');});
  }
  // Siempre la señal en vivo: al reanudar se reconecta en lugar de seguir con audio viejo del búfer
  radio.audio.src=EMISORA.url+'?t='+Date.now();
  radioEstado('conectando');
  radio.audio.play().catch(()=>radioEstado('error'));
  medir('radio_play');
  if('mediaSession' in navigator){
    navigator.mediaSession.metadata=new MediaMetadata({title:EMISORA.nombre+' '+EMISORA.frecuencia,artist:'En vivo · '+EMISORA.de,album:'Fusa Conecta',
      artwork:[{src:'img/icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:'img/icons/icon-512.png',sizes:'512x512',type:'image/png'}]});
    navigator.mediaSession.setActionHandler('play',radioReproducir);
    navigator.mediaSession.setActionHandler('pause',radioPausar);
    navigator.mediaSession.setActionHandler('stop',radioApagar);
  }
}
// Pausar suelta la conexión (no se gastan datos mientras está en pausa)
function radioPausar(){if(radio.audio){radio.audio.pause();radio.audio.removeAttribute('src');radio.audio.load();}radioEstado('pausada');}
function radioApagar(){radioPausar();radioEstado('apagada');}
function radioAlternar(){['sonando','conectando'].includes(radio.estado)?radioPausar():radioReproducir();}
function botonRadioHTML(id,clase){
  const on=['sonando','conectando'].includes(radio.estado);
  return '<button class="'+clase+'" id="'+id+'" aria-label="'+(on?'Pausar':'Escuchar')+' '+EMISORA.nombre+' en vivo">'
    +(radio.estado==='conectando'?icon('loader-circle',22,'gira'):icon(on?'pause':'play',22))+'</button>';
}
function textoRadio(){
  return {conectando:'Conectando…',sonando:'En vivo',pausada:'En pausa',error:'Sin señal. Toca para reintentar',apagada:'En vivo'}[radio.estado];
}
// Píldora junto al saludo: toca para escuchar o pausar (el mini reproductor aparece abajo).
// La etiqueta accesible empieza con el texto visible «EN VIVO · 88.1 FM» (WCAG 2.5.3)
const etiquetaPildora=on=>'En vivo · '+EMISORA.frecuencia+': '+(on?'pausar':'escuchar')+' '+EMISORA.nombre;
function pildoraRadioHTML(){
  const on=['sonando','conectando'].includes(radio.estado);
  return '<button class="pildora-radio'+(on?' on':'')+'" id="pRadio" aria-pressed="'+on+'" aria-label="'+etiquetaPildora(on)+'">'
    +'<span class="punto-vivo" aria-hidden="true"></span>EN VIVO · '+EMISORA.frecuencia+'</button>';
}
function pintarRadio(){
  const b=$('#radioBarra');
  b.hidden=radio.estado==='apagada';
  if(!b.hidden){
    // Mini reproductor: a la izquierda la emisora, en el centro el hueco curvo del botón de Cupones, a la derecha los controles
    b.className='radio-barra '+radio.estado;
    b.innerHTML='<div class="rb-izq"><span class="rb-ic" aria-hidden="true">'+(radio.estado==='sonando'?'<span class="ecualizador"><i></i><i></i><i></i></span>':icon('radio',18))+'</span>'
      +'<span class="rb-tx"><b><span class="sr-only">'+EMISORA.nombre+' </span>'+EMISORA.frecuencia+'</b><small role="status">'+textoRadio()+'</small></span></div>'
      +'<span class="rb-hueco" aria-hidden="true"></span>'
      +'<div class="rb-der">'+botonRadioHTML('rbPlay','rb-play')+'<button class="rb-cerrar" id="rbCerrar" aria-label="Cerrar la radio">'+icon('x',20)+'</button></div>';
    $('#rbPlay').onclick=radioAlternar;$('#rbCerrar').onclick=radioApagar;
  }
  // La píldora del saludo refleja el mismo estado (se actualiza sin regenerarla para no perder el foco)
  const p=$('#pRadio');
  if(p){const on=['sonando','conectando'].includes(radio.estado);p.classList.toggle('on',on);p.setAttribute('aria-pressed',on);
    p.setAttribute('aria-label',etiquetaPildora(on));}
  if('mediaSession' in navigator)navigator.mediaSession.playbackState=radio.estado==='sonando'?'playing':radio.estado==='apagada'?'none':'paused';
}
window.addEventListener('offline',()=>{if(['sonando','conectando'].includes(radio.estado))radioEstado('error');});

/* ===== FOOTER ===== */
function footerHTML(){
  return '<footer class="footer">'+logo('horizontal','claro',{alto:32})
    +'<p>El directorio digital de Fusagasugá, la Ciudad Jardín del Sumapaz.</p>'
    +'<div class="f-links"><button id="fApoyo">'+icon('message-circle-heart',16)+'Ayúdanos a mejorar</button><button id="fLegal">'+icon('file-text',16)+'Aviso legal</button></div>'
    +'<p>© 2026 Fusa Conecta · Hecho en Fusagasugá</p></footer>';
}
function enlazarFooter(){
  const fa=$('#fApoyo');if(fa)fa.onclick=()=>abrirOpinion('footer');
  const fl=$('#fLegal');if(fl)fl.onclick=()=>abrir('ovLegal');
}

/* ===== BARRA INFERIOR (RF-04) ===== */
function renderBottomNav(){
  const v=vistaActual();
  pintarGloboCupones();
  $$('.bn-btn').forEach(b=>{
    const bn=b.dataset.bn;
    const activo=(bn==='inicio'&&v.tipo==='lista'&&v.cat!=='favoritos')||(bn==='favoritos'&&v.cat==='favoritos')
      ||(bn==='cupones'&&(v.tipo==='billetera'||v.tipo==='cupones'))||(bn==='mapa'&&['mapa','ruta','recorridos','recorrido'].includes(v.tipo))||(bn==='perfil'&&['perfil','dashboard','admin','planes'].includes(v.tipo));
    b.classList.toggle('bn-active',activo);
    if(activo)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
}
$$('.bn-btn').forEach(b=>{
  b.onclick=()=>{
    const bn=b.dataset.bn;
    if(bn==='inicio'){inicio();return;}
    if(bn==='favoritos'){if(!logueado()){pedirLogin('Inicia sesión para ver tus favoritos.');return;}navegar({tipo:'lista',cat:'favoritos'});return;}
    if(bn==='cupones'){const t=logueado()?'billetera':'cupones';if(vistaActual().tipo!==t)navegar({tipo:t});return;}
    if(bn==='mapa'){navegar({tipo:'mapa'});return;}
    if(bn==='perfil'){navegar({tipo:'perfil'});}
  };
});

/* ===== EVENTOS DE LA INTERFAZ ===== */
$('#loginLogo').innerHTML=logo('iso','claro',{alto:44});
// Tocar fuera de la hoja la cierra con cerrar(), para que corran sus tareas de cierre (alCerrar)
$$('.overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov&&ov.id!=='ovConsent'&&ov.id!=='ovConfirm')cerrar(ov.id);}));
alCerrar.ovDetalle=quitarPreviaRelieve;
$$('[data-cerrar]').forEach(b=>{b.onclick=()=>cerrar(b.dataset.cerrar);});
function colorBarra(token){const m=$('meta[name="theme-color"]');if(m)m.setAttribute('content',cssVar(token));}
function ocultarSplash(){$('#splash').classList.add('oculto');colorBarra('--bg');}
// Al volver a la pantalla de entrada (p. ej. al cerrar sesión) se ve completa y quieta, con sus botones
function mostrarSplash(){$('#splash').classList.remove('oculto','corto','demo');$('#splash').classList.add('saltar');colorBarra('--primary-500');}
/* Pantalla de entrada (v4 · Fase 4). Su HTML se pinta una sola vez y nunca se vuelve a generar.
   Invitados: animación completa en cada arranque en frío; la pantalla con botones no avanza sola.
   Con sesión: versión corta de 1,2 s, solo el logo. ?demo=1 siempre muestra la completa. */
// Se cuenta desde que se abrió la página (performance.now() empieza en 0 al navegar), no desde que cargó este archivo
const SPLASH_CORTO=1200,faltaSplash=()=>SPLASH_CORTO-performance.now();
function marcarSesion(on){try{on?localStorage.setItem('fc_con_sesion','1'):localStorage.removeItem('fc_con_sesion');}catch(e){}}
// Con sesión, la entrada se queda al menos 1,2 s desde el arranque (salvo en modo demostración)
function ocultarSplashSesion(){
  const sp=$('#splash');if(sp.classList.contains('oculto')||sp.classList.contains('demo'))return;
  const falta=faltaSplash();
  if(falta>0)setTimeout(()=>{if(!sp.classList.contains('demo'))ocultarSplash();},falta);else ocultarSplash();
}
// Vuelve a reproducir la animación completa sin regenerar el HTML (botón del admin en Perfil)
function verAnimacionEntrada(){
  const sp=$('#splash');
  sp.classList.remove('corto','saltar','oculto');sp.classList.add('demo','reinicio');
  void sp.offsetWidth;sp.classList.remove('reinicio');colorBarra('--primary-500');
}
(function(){
  const sp=$('#splash');
  // Arco (de izquierda a derecha): mascotas, compras, rutas, campo y hospedaje; el punto más bajo es la mitad del isotipo
  const ICONOS_ARCO=[['paw-print',-118,-22],['shopping-bag',-90,-92],['mountain',0,-124],['apple',90,-92],['bed-double',118,-22]];
  // Un solo elemento animado por ícono (.splash-ico-in); el contenedor solo lo ubica en el arco
  const arco=ICONOS_ARCO.map(([n,x,y],i)=>'<span class="splash-ico" style="--x:'+x+'px;--y:'+y+'px;--i:'+i+'" aria-hidden="true"><span class="splash-ico-in">'+icon(n,20)+'</span></span>').join('');
  $('#splashMarca').innerHTML=logo('vertical','lila',{alto:120,lema:true,extraIso:arco});
  if(sp.classList.contains('corto'))setTimeout(()=>{if(sp.classList.contains('corto'))ocultarSplash();},Math.max(0,faltaSplash()));
  // Un toque salta la animación: el invitado ve de una vez los botones; con sesión, entra
  sp.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    if(auth.currentUser&&!auth.currentUser.isAnonymous&&!sp.classList.contains('demo')){ocultarSplash();return;}
    sp.classList.add('saltar');
  });
})();
const conCuenta=()=>!!(auth.currentUser&&!auth.currentUser.isAnonymous);
$('#sInvitado').onclick=()=>{
  ocultarSplash();if(conCuenta())return;
  render();toast('Explorando Fusa Conecta',2000);
  if(!auth.currentUser)auth.signInAnonymously().catch(()=>{});
};
// "Registrarse" abre la hoja de registro encima; al cerrarla se vuelve a esta pantalla
$('#sRegistrar').onclick=()=>{$('#splash').classList.remove('demo');if(conCuenta())ocultarSplash();else abrirLogin('registro');};
$$('#ovLogin .seg button').forEach(b=>b.onclick=()=>{modoLogin=b.dataset.modo;pintarModoLogin();});
$('#formLogin').addEventListener('submit',enviarLogin);
$('#lGoogle').onclick=ingresarGoogle;
$('#lOlvido').onclick=olvideClave;
// Si el navegador aún tiene la página anterior en caché, la app no se detiene por un botón que no existe
{const uc=$('#lUsarCorreo');if(uc)uc.onclick=()=>{correoAbierto=true;pintarModoLogin();setTimeout(()=>$('#lNombre').focus(),50);};}
$('#lVerLegal').onclick=()=>abrir('ovLegal');
$('#cVerLegal').onclick=()=>abrir('ovLegal');
$('#edadSi').onclick=()=>{estado.mayorEdad=true;cerrar('ovEdad');navegar({tipo:'lista',cat:'bares'});};
$('#edadNo').onclick=()=>{cerrar('ovEdad');toast('Solo para mayores de 18 años.');};
$('#bVolver').onclick=volver;
$('#bFiltros').onclick=abrirFiltros;
document.addEventListener('click',e=>{const s=e.target.closest&&e.target.closest('[data-sos]');if(!s)return;$$('.overlay.abierto').forEach(o=>cerrar(o.id));if(vistaActual().tipo!=='sos')navegar({tipo:'sos'});});
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[data-tel]');if(a){const d=buscar(a.dataset.tel);registrarEvento(d,'toques_llamar');if(d)medir('llamar',{comercio:d.nombre,categoria:d.cat});}});

let _deb;
$('#busqueda').addEventListener('input',e=>{
  clearTimeout(_deb);
  _deb=setTimeout(()=>{
    renderSugerencias();
    estado.q=e.target.value.trim();
    if(estado.q.length>=3)medir('busqueda',{termino:estado.q.slice(0,40).toLowerCase()});
    const v=vistaActual();
    if(v.tipo==='lista')render();else navegar({tipo:'lista',cat:'todas'});
  },300);
});
$('#busqueda').addEventListener('focus',renderSugerencias);
$('#busqueda').addEventListener('blur',()=>setTimeout(()=>$('#sugerencias').classList.remove('ver'),150));
$('#busqueda').addEventListener('keydown',e=>{if(e.key==='Enter'){$('#sugerencias').classList.remove('ver');e.target.blur();}});

(function(){
  const topbar=$('#topbar'),cuerpo=$('#cuerpo');
  cuerpo.addEventListener('scroll',()=>{if(vistaActual().tipo==='lista')topbar.classList.toggle('arriba',cuerpo.scrollTop>70);},{passive:true});
})();

/* ===== CONEXIÓN ===== */
function actualizarConexion(){
  estado.online=navigator.onLine;
  $('#offlineBar').classList.toggle('ver',!estado.online);
  if(estado.online)ls.set('fc_sos_sync',Date.now());
}
window.addEventListener('online',()=>{actualizarConexion();toast('Conexión restablecida');render(true);});
window.addEventListener('offline',()=>{actualizarConexion();toast('Sin conexión: mostrando datos guardados');render(true);});
actualizarConexion();

/* ===== PWA: trabajo sin conexión ===== */
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}

/* ===== INSTALAR COMO APP DEL CELULAR (PWA) ===== */
let avisoInstalar=null;
const esIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function appInstalada(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
function puedeInstalar(){return !appInstalada()&&(!!avisoInstalar||esIOS||/android/i.test(navigator.userAgent));}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();avisoInstalar=e;if(['perfil','lista'].includes(vistaActual().tipo))render(true);});
window.addEventListener('appinstalled',()=>{avisoInstalar=null;render(true);toast('Fusa Conecta quedó instalada en tu celular');});
async function instalarApp(){
  medir('instalar_app');
  if(avisoInstalar){
    avisoInstalar.prompt();
    await avisoInstalar.userChoice.catch(()=>null);
    avisoInstalar=null;
    return;
  }
  const pasos=esIOS
    ?'<li>Abre esta página en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> en la barra inferior.</li><li>Elige <b>«Agregar a inicio»</b> y luego <b>«Agregar»</b>.</li>'
    :'<li>Abre esta página en <b>Google Chrome</b>.</li><li>Toca el menú de tres puntos (arriba a la derecha).</li><li>Elige <b>«Instalar aplicación»</b> o <b>«Agregar a la pantalla principal»</b> y confirma con <b>«Instalar»</b>.</li>';
  abrirHoja('<div class="hoja-pad hoja-centro"><img src="img/icons/icon-192.png" alt="Ícono de Fusa Conecta" class="inst-ic"><h2>Instala Fusa Conecta</h2>'
    +'<p>Quedará en tu pantalla de inicio con su propio ícono y se abrirá como una app, sin la barra del navegador.</p>'
    +'<ol class="inst-pasos">'+pasos+'</ol><p class="nota">Funciona sin internet para emergencias, favoritos y cupones guardados.</p></div>');
}

/* ===== ARRANQUE ===== */
try{history.replaceState({n:0},'');}catch(e){}
inicio();
if(navigator.geolocation&&navigator.permissions){
  navigator.permissions.query({name:'geolocation'}).then(p=>{if(p.state==='granted')pedirUbicacion().then(()=>render(true));}).catch(()=>{});
}
// Accesos directos del ícono de la app (mantener presionado): ?ir=sos | ?ir=mapa
(function(){const ir=new URLSearchParams(location.search).get('ir');if(ir==='sos'||ir==='mapa'){ocultarSplash();navegar({tipo:ir});}})();
// Rutas profundas: #/lugar/<id> (QR del comercio), #/evento/<id>, #c/<id> (enlaces antiguos) y #/admin
let adminPendiente=false;
function rutaHash(){
  const h=location.hash,m=h.match(/^#\/lugar\/(.+)$/)||h.match(/^#c\/(.+)$/);
  if(m){ocultarSplash();setTimeout(()=>abrirDetalle(decodeURIComponent(m[1])),300);return;}
  const me=h.match(/^#\/evento\/(.+)$/);if(me){ocultarSplash();abrirEvento(decodeURIComponent(me[1]));return;}
  if(h==='#/admin'){if(esAdmin()){ocultarSplash();estado.admin.datos=null;navegar({tipo:'admin'});}else adminPendiente=true;}
}
window.addEventListener('hashchange',rutaHash);
rutaHash();
