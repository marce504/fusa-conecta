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
  // En el sitio publicado el ingreso con Google vuelve al mismo dominio de la app
  // (Netlify reenvía /__/auth/* a Firebase); así Chrome no bloquea el regreso de la sesión.
  authDomain: location.hostname==='fusa-conecta.netlify.app'?'fusa-conecta.netlify.app':'fusa-conecta.firebaseapp.com',
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
const ls={
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},
  del(k){try{localStorage.removeItem(k);}catch(e){}}
};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('ver');if(t._t)clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('ver'),2500);}
function abrir(id){$('#'+id).classList.add('abierto');}
function cerrar(id){$('#'+id).classList.remove('abierto');}
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
  filtros:{abierto:false,cupon:false,municipio:''}  // filtros rápidos del listado
};
function logueado(){return !!(estado.usuario&&!estado.usuario.anonimo);}
function esComerciante(){return logueado()&&estado.perfil&&(estado.perfil.rol==='comerciante'||estado.perfil.rol==='admin');}

/* ===== REPOSITORIO DE COMERCIOS ===== */
const nombresBase=new Set(COMERCIOS_BASE.map(c=>norm(c.nombre).trim()));
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
    estado_publicacion:x.estado_publicacion||'pendiente',motivo_rechazo:x.motivo_rechazo||'',prueba_usada:!!x.prueba_usada};
}
function reconstruirDirectorio(){database=[...COMERCIOS_BASE.map(c=>({...c})),...comerciosNube];}
// La regla pública solo deja leer comercios aprobados; una consulta sin este filtro sería rechazada completa.
db.collection('comercios').where('estado_publicacion','==','aprobado').onSnapshot(snap=>{
  const lista=[];
  snap.forEach(doc=>{
    const x=doc.data();
    // Los registros antiguos de la carga inicial ya están en la copia local (datos.js)
    if(!x.propietario_uid&&nombresBase.has(norm(x.nombre).trim()))return;
    lista.push(normalizarNube(doc.id,x));
  });
  comerciosNube=lista;reconstruirDirectorio();refrescarVista();
},err=>console.warn('Comercios sin conexión:',err.code));

// Comercios del dueño en cualquier estado (pendiente, rechazado, aprobado): solo con sesión de comerciante
let comerciosPropios=[],propiosUnsub=null;
function escucharMisComercios(){
  if(propiosUnsub||!esComerciante())return;
  propiosUnsub=db.collection('comercios').where('propietario_uid','==',estado.usuario.uid).onSnapshot(snap=>{
    comerciosPropios=snap.docs.map(doc=>normalizarNube(doc.id,doc.data()));refrescarVista();
  },()=>{propiosUnsub=null;});
}
function dejarDeEscucharMisComercios(){if(propiosUnsub){propiosUnsub();propiosUnsub=null;}comerciosPropios=[];}

db.collection('calificaciones').onSnapshot(snap=>{
  const c={};
  snap.forEach(doc=>{const x=doc.data();(c[x.comercio_id]=c[x.comercio_id]||[]).push({...x,_id:doc.id});});
  Object.values(c).forEach(l=>l.sort((a,b)=>(aMs(b.fecha)||0)-(aMs(a.fecha)||0)));
  estado.califs=c;refrescarVista();
},err=>console.warn('Calificaciones sin conexión:',err.code));

db.collection('cupones').onSnapshot(snap=>{
  estado.cuponesFS=[];snap.forEach(doc=>estado.cuponesFS.push({id:doc.id,...doc.data()}));
},()=>{});

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
function estadoHTML(ap){return ap?'<span class="estado '+ap.tipo+'"><span class="punto" aria-hidden="true"></span><span class="et">'+esc(ap.texto)+'</span></span>':'';}
function horarioTexto(d){
  if(d.dias&&d.dias.length&&d.abre&&d.cierra)return d.dias.slice().sort().map(i=>DIAS_TXT[i]).join(', ')+' · '+d.abre+' – '+d.cierra;
  return d.horario||'Consultar directamente';
}

/* ===== ÍCONOS POR CATEGORÍA, SUBCATEGORÍA Y SERVICIO ===== */
// Los emojis de datos.js se ignoran: el ícono sale de la categoría o subcategoría
const ICONO_CAT={todas:'layout-grid',comercio:'store',campo:'sprout',turismo:'mountain',hospedaje:'bed-double',bares:'wine',tramite:'landmark',favoritos:'heart'};
const ICONO_SUB={comidas:'utensils',ferreterias:'hammer',mascotas:'paw-print',panaderias:'croissant',salud:'stethoscope',talleres:'car',tiendas:'shopping-bag',
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
  return cal.total?'<span class="calif">'+icon('star',16,'ic-fill')+cal.prom.toFixed(1).replace('.',',')+' ('+cal.total+')</span>':'<span class="nuevo">Nuevo</span>';
}
function estrellasFijas(n){return Array.from({length:5},(_,i)=>'<span class="'+(i<n?'on':'')+'">'+icon('star',14,'ic-fill')+'</span>').join('');}
const PTO='<span class="pto" aria-hidden="true">·</span>';

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
  if(ab){ab.classList.remove('abierto');history.pushState({n:stack.length},'');return;}
  if(stack.length>1){stack.pop();render();return;}
  history.pushState({n:stack.length},'');
  confirmar('Salir de Fusa Conecta','¿Estás seguro que deseas salir de Fusa Conecta?','Sí, salir','No','log-out').then(si=>{
    if(!si)return;saliendo=true;window.close();history.back();
  });
});

/* ===== CABECERA ===== */
// Logo vectorial: copia estática (sin animación) de las hojas del logo de bienvenida
const LOGO_SVG=(()=>{
  const s=$('#splash .splash-logo-svg');if(!s)return '';
  const c=s.cloneNode(true);
  c.querySelectorAll('style,defs').forEach(x=>x.remove());
  c.querySelectorAll('path').forEach(p=>p.removeAttribute('class'));
  c.setAttribute('class','logo-svg');c.setAttribute('aria-hidden','true');c.removeAttribute('role');c.removeAttribute('aria-label');
  return c.outerHTML;
})();
const MARCA_HTML='<span class="marca">'+LOGO_SVG+'<span>Fusa Conecta</span></span>';
function renderHeader(){
  const v=vistaActual();
  $('#bVolver').classList.toggle('invisible',stack.length<=1);
  const enLista=v.tipo==='lista';
  $('#descubre').style.display=enLista?'block':'none';
  if(!enLista)return;
  if(document.activeElement!==$('#busqueda'))$('#busqueda').value=estado.q;
  const ses=$('#sesion');
  if(logueado()){
    const nom=estado.usuario.nombre;
    ses.innerHTML=MARCA_HTML+'<div class="sesion-acciones">'+campanaHTML()+'<button class="saludo" id="bPerfilTop" aria-label="Ver mi perfil"><span class="av">'+esc(nom.charAt(0).toUpperCase())+'</span>'+esc(nom.split(' ')[0])+'</button>'
      +'<button class="btn btn-secundario btn-sm" id="bSalir">Salir</button></div>';
    $('#bSalir').onclick=cerrarSesion;
    $('#bPerfilTop').onclick=()=>navegar({tipo:'perfil'});
  }else{
    ses.innerHTML=MARCA_HTML+'<div class="sesion-acciones">'+campanaHTML()+'<button class="btn btn-primario btn-sm" id="bEntrar">Entrar</button></div>';
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
  const f=estado.filtros;
  const rapidos=[
    {k:'abierto',t:'Abierto ahora',ic:'clock',on:f.abierto},
    {k:'cupon',t:'Con cupón',ic:'ticket',on:f.cupon},
    {k:'mun-Fusagasugá',t:'Fusagasugá',ic:'map-pin',on:f.municipio==='Fusagasugá'},
    {k:'mun-Pasca',t:'Pasca',ic:'map-pin',on:f.municipio==='Pasca'}
  ];
  const grupo=v.cat==='todas'?'comercio':v.cat;
  const subs=v.cat==='favoritos'?[]:(SUBCATS[grupo]||[]).filter(s=>database.some(d=>d.cat===grupo&&subDe(d)===s.k));
  const enGrupo=v.cat===grupo;
  fila.innerHTML=rapidos.map(r=>'<button class="chip-filtro'+(r.on?' on':'')+'" data-rapido="'+r.k+'" aria-pressed="'+r.on+'">'+icon(r.ic,16)+r.t+'</button>').join('')
    +(subs.length?'<span class="sep-chips" aria-hidden="true"></span>'
      +(enGrupo?'<button class="subcat'+(!v.sub?' activa':'')+'" data-sub="">Todos</button>':'')
      +subs.map(s=>'<button class="subcat'+(enGrupo&&v.sub===s.k?' activa':'')+'" data-sub="'+s.k+'">'+icon(ICONO_SUB[s.k]||'circle-help',16)+nombreSub(grupo,s.k)+'</button>').join(''):'');
  cont.classList.remove('vacia');
  $$('#subcats [data-rapido]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.rapido;
    if(k==='abierto')f.abierto=!f.abierto;
    else if(k==='cupon')f.cupon=!f.cupon;
    else{const m=k.slice(4);f.municipio=f.municipio===m?'':m;}
    render();
  });
  $$('#subcats [data-sub]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.sub;
    if(!enGrupo){navegar({tipo:'lista',cat:grupo,sub:k});return;}
    if((v.sub||'')===k)return;
    // Cambiar de subcategoría no llena el historial del botón Atrás
    stack[stack.length-1]={tipo:'lista',cat:grupo,sub:k};render();
  });
  const act=$('#subcats .subcat.activa');if(act)act.scrollIntoView({inline:'nearest',block:'nearest'});
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
function ordenar(items){
  return items.sort((a,b)=>{
    const p=prioridad(b)-prioridad(a);if(p)return p;
    const da=distanciaA(a),dbb=distanciaA(b);
    if(da!=null&&dbb!=null&&Math.abs(da-dbb)>0.05)return da-dbb;
    return calificacionDe(b).prom-calificacionDe(a).prom;
  });
}
function itemsVisibles(cat,sub,conFiltros=true){
  let items=[...database];
  if(cat&&cat!=='todas'&&cat!=='favoritos')items=items.filter(d=>d.cat===cat);
  if(sub)items=items.filter(d=>subDe(d)===sub);
  if(cat==='favoritos')items=items.filter(d=>estado.favoritos.includes(String(d.id)));
  if(cat==='todas'&&!estado.mayorEdad)items=items.filter(d=>d.cat!=='bares');
  if(conFiltros){
    const f=estado.filtros;
    if(f.abierto)items=items.filter(d=>{const a=estadoApertura(d);return a&&a.abierto;});
    if(f.cupon)items=items.filter(d=>cuponesDe(d).length>0);
    if(f.municipio)items=items.filter(d=>(d.municipio||'Fusagasugá')===f.municipio);
  }
  return ordenar(items.filter(d=>coincide(d,estado.q)));
}
function renderSugerencias(){
  const box=$('#sugerencias');const q=$('#busqueda').value.trim();
  if(q.length<3){box.classList.remove('ver');box.innerHTML='';return;}
  estado.q=q;
  const res=itemsVisibles('todas','',false).slice(0,6);estado.q='';
  box.innerHTML=res.length?res.map(d=>'<button data-sug="'+esc(d.id)+'"><span class="sg-ic">'+icon(iconoDe(d),16)+'</span><span class="sg-tx"><b>'+esc(d.nombre)+'</b><small>'+esc(etiquetaDe(d))+(premiumVigente(d)?' · Destacado':'')+'</small></span></button>').join('')
    :'<p class="sg-vacio">Sin coincidencias para «'+esc(q)+'»</p>';
  box.classList.add('ver');
  $$('#sugerencias [data-sug]').forEach(b=>b.onmousedown=e=>{e.preventDefault();box.classList.remove('ver');abrirDetalle(b.dataset.sug);});
}

/* ===== TARJETA DE LUGAR ===== */
function fotoHTML(d,cls){
  const img=imgSegura(d.imagen);
  return '<div class="'+cls+'"><span class="fallback-ic">'+icon(iconoDe(d))+'</span>'
    +(img?'<img src="'+esc(img)+'" alt="Foto de '+esc(d.nombre)+'" loading="lazy" onerror="this.remove()">':'');
}
function badgeDestacado(d){return premiumVigente(d)?'<span class="badge-dest">'+icon('star',14,'ic-fill')+'Destacado</span>':'';}
function cardHTML(d){
  const esFav=estado.favoritos.includes(String(d.id));
  const ap=estadoApertura(d);const km=distanciaA(d);const cal=calificacionDe(d);
  return '<article class="card">'
    +fotoHTML(d,'foto')+badgeDestacado(d)
    +'<button class="fav-btn'+(esFav?' on':'')+'" data-fav="'+esc(d.id)+'" aria-pressed="'+esFav+'" aria-label="'+(esFav?'Quitar de favoritos ':'Guardar en favoritos ')+esc(d.nombre)+'"><span>'+icon('heart')+'</span></button>'
    +'</div><div class="card-cuerpo">'
    +'<h3 class="card-nombre">'+esc(d.nombre)+'</h3>'
    +'<div class="meta"><span>'+esc(etiquetaDe(d))+'</span>'+PTO+califHTML(cal)+(ap?PTO+estadoHTML(ap):'')+'</div>'
    +'<div class="card-dir">'+icon('map-pin',16)+'<span>'+esc(d.direccion)+(km!=null?' · a '+fmtDist(km):'')+'</span></div>'
    +'<p class="card-desc">'+esc(d.desc)+'</p>'
    +'<div class="card-acc">'
    +'<button class="btn btn-primario" data-ver="'+esc(d.id)+'">Ver detalles</button>'
    +'<button class="btn btn-secundario btn-ico" data-wa="'+esc(d.id)+'" aria-label="Escribir por WhatsApp a '+esc(d.nombre)+'">'+icon('whatsapp',20,'ic-wa')+'</button>'
    +'<a class="btn btn-secundario btn-ico" href="tel:'+esc(d.tel)+'" aria-label="Llamar a '+esc(d.nombre)+'">'+icon('phone')+'</a>'
    +'</div></div></article>';
}
function enlazarTarjetas(){
  $$('#cuerpo .card [data-ver]').forEach(b=>b.onclick=()=>abrirDetalle(b.dataset.ver));
  $$('#cuerpo [data-wa]').forEach(b=>b.onclick=e=>{e.stopPropagation();abrirWhatsApp(buscar(b.dataset.wa));});
  $$('#cuerpo .fav-btn').forEach(b=>b.onclick=e=>{
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
  const msg='Hola '+d.nombre+', te encontré en Fusa Conecta. Quisiera más información.';
  window.open('https://wa.me/57'+wa+'?text='+encodeURIComponent(msg),'_blank','noopener');
}
async function compartir(nombre,ruta){
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
  if(['lista','perfil','dashboard'].includes(v.tipo))render(true);
}
function render(conservarScroll){
  const v=vistaActual();const cuerpo=$('#cuerpo');
  const scroll=conservarScroll?cuerpo.scrollTop:0;
  limpiarMapas();
  // Las actualizaciones en vivo no repiten la animación de entrada de las tarjetas
  cuerpo.className='cuerpo'+(conservarScroll?' sin-anim':'');
  if(v.tipo==='dashboard')renderDashboard();
  else if(v.tipo==='perfil')renderPerfil();
  else if(v.tipo==='sos')renderSOS();
  else if(v.tipo==='mapa')renderMapa();
  else if(v.tipo==='ruta')renderRuta(v.id);
  else renderLista(v);
  renderHeader();renderBottomNav();
  cuerpo.scrollTop=scroll;
}
function hayFiltros(){const f=estado.filtros;return f.abierto||f.cupon||!!f.municipio;}
function renderLista(v){
  const items=itemsVisibles(v.cat,v.sub);
  const titulo=v.cat==='favoritos'?'Mis favoritos':(v.cat==='todas'?'Todo Fusa Conecta':(CAT[v.cat]?CAT[v.cat].label:'Resultados'))
    +(v.sub?' · '+nombreSub(v.cat,v.sub):'');
  let html;
  if(items.length){
    html='<div class="head-v"><h2>'+esc(titulo)+'</h2><span class="conteo">'+items.length+(items.length===1?' lugar':' lugares')+'</span></div><div class="grid">'+items.map(cardHTML).join('')+'</div>';
  }else if(v.cat==='favoritos'&&!estado.q&&!hayFiltros()){
    html='<div class="vacio">'+icon('heart',48)+'<b>Aún no tienes favoritos</b><p>Toca el corazón de un lugar para guardarlo aquí. Tus favoritos quedan disponibles sin conexión.</p></div>';
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
    estado.q='';estado.filtros={abierto:false,cupon:false,municipio:''};$('#busqueda').value='';
    navegar({tipo:'lista',cat:b.dataset.sugcat});
  });
  enlazarTarjetas();enlazarFooter();
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
function abrirDetalle(id){
  const d=buscar(id);if(!d)return;
  const esFav=estado.favoritos.includes(String(d.id));
  const esDueno=logueado()&&d.propietario_uid&&d.propietario_uid===estado.usuario.uid;
  const cal=calificacionDe(d);const ap=estadoApertura(d);const km=distanciaA(d);
  const califs=estado.califs[d.id]||[];
  const premium=premiumVigente(d);
  const miCalif=logueado()?califs.find(c=>c.usuario_uid===estado.usuario.uid):null;
  const ruta=RUTAS[d.id];
  const cupones=cuponesDe(d);

  const opiniones=califs.length===0
    ?'<p class="nota-c">Aún no hay opiniones. Sé el primero en calificar este lugar.</p>'
    :califs.map(c=>'<div class="opinion"><div class="op-head"><span class="op-user">'+esc(c.usuario_nombre||'Usuario')+'</span>'
      +'<span class="op-stars" aria-label="'+c.estrellas+' de 5 estrellas">'+estrellasFijas(c.estrellas)+'</span></div>'
      +(c.comentario?'<p class="op-text">'+esc(c.comentario)+'</p>':'')
      +'<span class="op-fecha">'+fechaCorta(aMs(c.fecha))+(c.fueEditada?' · editada':'')+'</span></div>').join('');
  const formCalif=logueado()
    ?'<div class="star-sel" id="starSel" role="radiogroup" aria-label="Tu calificación">'+[1,2,3,4,5].map(n=>'<button data-n="'+n+'" role="radio" aria-label="'+n+(n===1?' estrella':' estrellas')+'">'+icon('star',28)+'</button>').join('')+'</div>'
      +'<div class="campo"><label for="ratingTxt">Tu opinión (opcional)</label><textarea id="ratingTxt" maxlength="500" placeholder="Cuéntanos tu experiencia...">'+esc(miCalif?miCalif.comentario:'')+'</textarea></div>'
      +'<button class="btn btn-primario btn-bloque" id="bCalificar">'+(miCalif?'Actualizar mi calificación':'Enviar calificación')+'</button>'
    :'<button class="btn btn-secundario btn-bloque" id="bLoginCalif">Inicia sesión para calificar</button>';

  const redes=premium?Object.entries(d.redesSociales||{}).filter(([k,u])=>u&&/^https:\/\//.test(u)).slice(0,5):[];
  const webOk=d.sitioWeb&&/^https:\/\//.test(d.sitioWeb);
  const bloquePremium=premium&&(redes.length||webOk)
    ?'<div class="bloque bloque-premium"><p class="bloque-tit">'+icon('globe',18)+'Redes y sitio web</p>'
      +(redes.length?'<div class="redes">'+redes.map(([k,u])=>'<a href="'+esc(u)+'" target="_blank" rel="noopener" class="btn btn-secundario btn-sm">'+icon(RED_IC[k]||'link',18)+(RED_TXT[k]||esc(k))+'</a>').join('')+'</div>':'')
      +(webOk?'<a class="btn btn-secundario btn-bloque" href="'+esc(d.sitioWeb)+'" target="_blank" rel="noopener">'+icon('globe')+'Visitar sitio web'+icon('external-link',16)+'</a>':'')
      +'</div>':'';
  const bloqueCupones=cupones.length
    ?'<div class="bloque bloque-cupon"><p class="bloque-tit">'+icon('ticket',18)+'Cupones disponibles</p>'
      +cupones.map(c=>'<div class="cupon-item"><div><b>'+esc(c.descripcion)+'</b><small>Vence: '+fechaCorta(aMs(c.vigencia))+(c.cupo_restante!=null?' · quedan '+c.cupo_restante:'')+'</small></div><button class="btn btn-secundario btn-sm" data-cupon="'+esc(c.id)+'">Obtener cupón</button></div>').join('')
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
    +fotoHTML(d,'det-hero')
    +'<span class="pill-cat">'+icon(iconoDe(d),14)+esc(etiquetaDe(d))+'</span>'
    +badgeDestacado(d)
    +'<div class="det-top-acc">'
    +'<button class="btn-redondo" id="detShare" aria-label="Compartir '+esc(d.nombre)+'">'+icon('share-2')+'</button>'
    +'<button class="btn-redondo'+(esFav?' on':'')+'" id="detFav" aria-pressed="'+esFav+'" aria-label="'+(esFav?'Quitar de favoritos':'Guardar en favoritos')+'">'+icon('heart')+'</button>'
    +'<button class="btn-redondo" id="cerrarDet" aria-label="Cerrar ficha">'+icon('x')+'</button>'
    +'</div></div>'
    +'<div class="det-body">'
    +'<h2>'+esc(d.nombre)+'</h2>'
    +'<div class="meta">'+califHTML(cal)+(ap?PTO+estadoHTML(ap):'')+'</div>'
    +chipsHTML
    +'<p class="det-desc">'+esc(d.desc)+'</p>'
    +'<div class="datos">'
    +filaDato('map-pin','Dirección',esc(d.direccion)+(km!=null?' · a '+fmtDist(km)+' de ti':''))
    +filaDato('clock','Horario',esc(horarioTexto(d)))
    +filaDato('phone','Contacto',esc(d.tel))
    +'</div>'
    +(ruta?'<button class="btn btn-secundario btn-bloque btn-ruta" id="detRuta">'+icon('route')+'Iniciar navegación guiada</button>':'')
    +bloqueCupones+bloquePremium
    +'<p class="mapa-label">'+icon('map',18)+'Ubicación'+(d.ubicacion_aprox?' aproximada del sector':'')+'</p>'
    +mapaHTML
    +(esDueno?'<button class="btn btn-secundario btn-bloque mt-16" id="btnEditar">'+icon('pencil')+'Editar mi comercio</button>':'')
    +'<div class="seccion-det"><h3>Calificaciones'+(califs.length?' ('+califs.length+')':'')+'</h3>'
    +formCalif+'<div class="opiniones">'+opiniones+'</div></div>'
    +'</div>'
    +'<div class="det-acc-fija">'
    +'<a class="btn btn-primario" href="tel:'+esc(d.tel)+'" aria-label="Llamar a '+esc(d.nombre)+'">'+icon('phone')+'Llamar</a>'
    +'<button class="btn btn-secundario" id="detWa" aria-label="Escribir por WhatsApp">'+icon('whatsapp',20,'ic-wa')+'WhatsApp</button>'
    +'<a class="btn btn-secundario" href="'+llegar+'" target="_blank" rel="noopener">'+icon('navigation')+'Cómo llegar</a>'
    +'</div>';

  $('#sheetDetalle').innerHTML=html;
  $('#sheetDetalle').setAttribute('aria-label','Ficha de '+d.nombre);
  $('#sheetDetalle').scrollTop=0;
  abrir('ovDetalle');
  $('#cerrarDet').onclick=()=>cerrar('ovDetalle');
  $('#detWa').onclick=()=>abrirWhatsApp(d);
  $('#detShare').onclick=()=>compartir(d.nombre,'c/'+d.id);
  $('#detFav').onclick=()=>{if(toggleFavorito(d.id)){const on=estado.favoritos.includes(String(d.id));$('#detFav').classList.toggle('on',on);$('#detFav').setAttribute('aria-pressed',on);}};
  if(ruta)$('#detRuta').onclick=()=>{cerrar('ovDetalle');navegar({tipo:'ruta',id:d.id});};
  $$('#sheetDetalle [data-cupon]').forEach(b=>b.onclick=()=>generarCupon(d,cupones.find(c=>c.id===b.dataset.cupon)));
  if(esDueno)$('#btnEditar').onclick=()=>{cerrar('ovDetalle');abrirFormComercio(d);};
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

/* ===== CUPONES CON QR (RF-11) ===== */
function codigoCupon(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';const r=crypto.getRandomValues(new Uint8Array(8));r.forEach(n=>s+=a[n%a.length]);return 'FC-'+s.slice(0,4)+'-'+s.slice(4);}
function hoyClave(){const d=new Date();return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');}
function cuponesLocales(){return ls.get('fc_cupones_'+(estado.usuario?estado.usuario.uid:''),[]);}
function guardarCuponLocal(c){const l=cuponesLocales().filter(x=>x.id!==c.id);l.unshift(c);ls.set('fc_cupones_'+estado.usuario.uid,l.slice(0,30));}
// Obtener un cupón (transacción): verifica estado, vigencia y cupo; un cupón por persona (id {cuponId}_{uid});
// descuenta 1 al cupo y crea el canje "reservado". Las reglas exigen ambas escrituras juntas.
async function generarCupon(d,cupon){
  if(!cupon)return;
  if(!logueado()){pedirLogin('Inicia sesión para obtener cupones de descuento.');return;}
  const uid=estado.usuario.uid;const id=cupon.id+'_'+uid;
  const local=cuponesLocales().find(c=>c.id===id);
  if(local){toast('Ya tienes este cupón');mostrarCupon(local);return;}
  if(!estado.online){toast('Necesitas conexión para obtener un cupón nuevo');return;}
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
        propietario_uid:c.propietario_uid,usuario_uid:uid,usuario_nombre:estado.usuario.nombre,codigo:codigoCupon(),
        estado:'reservado',fecha_emision:FV.serverTimestamp(),fecha_vencimiento:TS.fromMillis(vig||Date.now()+30*86400000)};
      tx.update(cuponRef,{cupo_restante:c.cupo_restante-1});
      tx.set(canjeRef,datos);
      return {ya:false,datos};
    });
    const c=serializarCupon({id,...r.datos,fecha_emision:Date.now()});
    guardarCuponLocal(c);mostrarCupon(c);
    toast(r.ya?'Ya tienes este cupón':'Cupón guardado en tu billetera');
  }catch(e){
    console.warn(e);
    const m={agotado:'Este cupón ya se agotó',vencido:'Este cupón ya venció',inactivo:'Este cupón no está disponible por ahora','no-existe':'Este cupón ya no existe'};
    toast(m[e.message]||'No se pudo obtener el cupón. Intenta de nuevo.');
  }
}
function serializarCupon(c){return {id:c.id,comercio_id:c.comercio_id,codigo:c.codigo,descripcion:c.descripcion,comercio_nombre:c.comercio_nombre,estado:c.estado,fecha_vencimiento:aMs(c.fecha_vencimiento)};}
function estadoCupon(c){if(c.estado==='usado')return 'usado';if(c.fecha_vencimiento&&c.fecha_vencimiento<Date.now())return 'vencido';return 'activo';}
function fechaHora(ms){return ms?new Date(ms).toLocaleString('es-CO',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';}
async function mostrarCupon(c){
  const est=estadoCupon(c);const usado=est==='usado';const vencido=est==='vencido';
  abrirHoja('<div class="hoja-pad hoja-centro"><div class="mc-ic ambar">'+icon('ticket',28)+'</div><h2>'+esc(c.comercio_nombre)+'</h2><p>'+esc(c.descripcion)+'</p>'
    +'<div class="qr-box'+(usado||vencido?' apagado':'')+'" id="qrBox" role="img" aria-label="Código QR del cupón"></div>'
    +'<div class="codigo">'+esc(c.codigo)+'</div>'
    +'<p class="nota">'+(usado?'Este cupón ya fue canjeado.':vencido?'Este cupón está vencido.':'Presenta este código en el establecimiento. Vence el '+fechaCorta(c.fecha_vencimiento)+'. También queda disponible sin conexión en tu Perfil.')+'</p></div>');
  try{
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
    new QRCode($('#qrBox'),{text:'FUSACONECTA:'+c.codigo,width:190,height:190,colorDark:cssVar('--gray-900'),colorLight:cssVar('--bg')});
  }catch(e){$('#qrBox').innerHTML='<p class="nota">Muestra el código alfanumérico.</p>';}
}

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
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(m);
  const grupo=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:50,
    iconCreateFunction:c=>L.divIcon({className:'cluster-fc',html:'<span>'+c.getChildCount()+'</span>',iconSize:[40,40]})});
  const items=database.filter(d=>d.lat&&d.lng&&(d.cat!=='bares'||estado.mayorEdad));
  items.forEach(d=>{
    const mk=L.marker([d.lat,d.lng],{icon:pinIcono(iconoDe(d)),title:d.nombre,alt:d.nombre});
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
  }else if(mapaActivo===m){$('#mapaInfo').textContent+=' · sin GPS: centrado en la plaza principal';}
  setTimeout(()=>m.invalidateSize(),200);
}

/* ===== NAVEGACIÓN GUIADA DE SENDEROS (RF-17) ===== */
function perfilSVG(r){
  const p=r.perfilElevacion,w=320,h=84,min=r.elevacionMinima-20,max=r.elevacionMaxima+20;
  const pts=p.map((e,i)=>(i/(p.length-1)*w).toFixed(1)+','+(h-(e-min)/(max-min)*h).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 '+w+' '+(h+4)+'" class="perfil-elev" preserveAspectRatio="none" role="img" aria-label="Perfil de elevación de la ruta"><polygon class="area" points="0,'+h+' '+pts+' '+w+','+h+'"/><polyline class="linea" points="'+pts+'"/></svg>';
}
async function renderRuta(id){
  const d=buscar(id),r=RUTAS[id];const cuerpo=$('#cuerpo');
  if(!d||!r){cuerpo.innerHTML='<div class="vacio">'+icon('route',48)+'<b>Ruta no disponible</b></div>';return;}
  cuerpo.innerHTML='<div class="vista-ruta">'
    +'<div id="mapaRuta">'+(estado.online?'':'<div class="mapa-off">'+icon('wifi-off',24)+'Mapa base sin conexión. La ruta y tu progreso siguen disponibles.</div>')+'</div>'
    +'<div class="ruta-panel"><h2>'+esc(r.nombre)+'</h2>'
    +'<div class="ruta-stats"><div><b>'+String(r.distanciaTotal).replace('.',',')+' km</b><span>Distancia</span></div><div><b>'+esc(r.duracionEstimada)+'</b><span>Tiempo</span></div><div><b>'+(r.elevacionMaxima-r.elevacionMinima)+' m</b><span>Desnivel</span></div><div><b>'+esc(r.dificultad)+'</b><span>Dificultad</span></div></div>'
    +'<div class="elev-head"><span>Perfil de elevación</span><span>'+r.elevacionMinima+' – '+r.elevacionMaxima+' m s. n. m.</span></div>'+perfilSVG(r)
    +'<div class="ruta-prog" id="rutaProg" role="status">'+icon('navigation',18)+'<span>Pulsa «Iniciar ruta» para seguir tu posición en tiempo real.</span></div>'
    +'<div class="ruta-btns"><button class="btn btn-primario" id="rIniciar">'+icon('play')+'Iniciar ruta</button><button class="btn btn-secundario" id="rSimular">Simular recorrido</button></div>'
    +'<p class="ruta-nota">Trazado de referencia: verifica siempre la señalización del sendero. La ruta queda guardada en tu teléfono para consultarla sin conexión.</p>'
    +r.puntosInteres.map(p=>'<div class="poi">'+icon('map-pin')+'<div><b>'+esc(p.nombre)+'</b><small>'+esc(p.descripcion)+'</small></div></div>').join('')
    +'</div></div>';
  let marcadorUsuario=null,m=null;
  if(estado.online){
    try{
      await cargarLeaflet();
      if(vistaActual().tipo!=='ruta'||!$('#mapaRuta'))return;
      m=L.map('mapaRuta');mapaActivo=m;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(m);
      const verde=cssVar('--primary-700'),blanco=cssVar('--bg');
      const linea=L.polyline(r.rutaWaypoints,{color:verde,weight:5,opacity:.9}).addTo(m);
      r.rutaWaypoints.forEach((w,i)=>L.circleMarker(w,{radius:5,color:verde,fillColor:blanco,fillOpacity:1,weight:2}).addTo(m).bindPopup('Punto '+(i+1)));
      r.puntosInteres.forEach(p=>L.marker(r.rutaWaypoints[p.wp],{icon:pinIcono('map-pin'),title:p.nombre}).addTo(m).bindPopup('<b>'+esc(p.nombre)+'</b><br><small>'+esc(p.descripcion)+'</small>'));
      L.marker(r.puntoLlegada,{icon:pinIcono('flag'),title:'Punto de llegada'}).addTo(m).bindPopup('Punto de llegada');
      m.fitBounds(linea.getBounds(),{padding:[24,24]});
      setTimeout(()=>m.invalidateSize(),200);
    }catch(e){}
  }
  const wps=r.rutaWaypoints;
  const restanteDesde=(pos,idx)=>{let s=distanciaKm(pos,wps[idx]);for(let i=idx;i<wps.length-1;i++)s+=distanciaKm(wps[i],wps[i+1]);return s;};
  const prog=html=>{$('#rutaProg').innerHTML=icon('navigation',18)+'<span>'+html+'</span>';};
  let terminado=false;
  function actualizar(pos){
    if(terminado||vistaActual().tipo!=='ruta')return;
    if(m){if(!marcadorUsuario)marcadorUsuario=L.marker(pos,{icon:pinUsuario(),title:'Tu posición'}).addTo(m);else marcadorUsuario.setLatLng(pos);}
    let cerca=0,best=Infinity;wps.forEach((w,i)=>{const k=distanciaKm(pos,w);if(k<best){best=k;cerca=i;}});
    const sig=Math.min(cerca+(best<0.03?1:0),wps.length-1);
    const fin=distanciaKm(pos,r.puntoLlegada);
    if(fin<0.04){terminado=true;limpiarSeguimiento();
      $('#rutaProg').innerHTML=icon('flag',18)+'<span><b>¡Llegaste!</b> Completaste '+esc(r.nombre)+'.</span>';
      confirmar('¡Felicitaciones!','Completaste «'+r.nombre+'» ('+String(r.distanciaTotal).replace('.',',')+' km). ¿Quieres compartir tu logro?','Compartir','Ahora no','flag').then(si=>{if(si)compartir('Completé '+r.nombre+' en Fusagasugá','c/'+id);});
      return;}
    prog('Siguiente punto: <b>'+fmtDist(distanciaKm(pos,wps[sig]))+'</b> · Falta para la meta: <b>'+fmtDist(restanteDesde(pos,sig))+'</b>');
  }
  function limpiarSeguimiento(){
    if(rutaWatch!=null){navigator.geolocation.clearWatch(rutaWatch);rutaWatch=null;}
    if(rutaSim){clearInterval(rutaSim);rutaSim=null;}
    $('#rIniciar').innerHTML=icon('play')+'Iniciar ruta';
  }
  $('#rIniciar').onclick=()=>{
    if(rutaWatch!=null||rutaSim){limpiarSeguimiento();prog('Seguimiento detenido.');return;}
    if(!navigator.geolocation){toast('Tu dispositivo no permite usar el GPS');return;}
    terminado=false;$('#rIniciar').innerHTML=icon('square')+'Detener';prog('Buscando tu ubicación GPS…');
    rutaWatch=navigator.geolocation.watchPosition(p=>actualizar([p.coords.latitude,p.coords.longitude]),
      ()=>{limpiarSeguimiento();toast('Activa el GPS y permite el acceso a tu ubicación');},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  };
  $('#rSimular').onclick=()=>{
    limpiarSeguimiento();terminado=false;$('#rIniciar').innerHTML=icon('square')+'Detener';
    const pts=[];for(let i=0;i<wps.length-1;i++)for(let k=0;k<6;k++){const f=k/6;pts.push([wps[i][0]+(wps[i+1][0]-wps[i][0])*f,wps[i][1]+(wps[i+1][1]-wps[i][1])*f]);}pts.push(r.puntoLlegada);
    let i=0;rutaSim=setInterval(()=>{if(i>=pts.length){limpiarSeguimiento();return;}actualizar(pts[i++]);if(m&&marcadorUsuario)m.panTo(marcadorUsuario.getLatLng());},700);
  };
}

/* ===== EMERGENCIAS SIN CONEXIÓN (RF-16, RNF-02, CU-14) ===== */
function renderSOS(){
  const cuerpo=$('#cuerpo');
  const mun=estado.sosMunicipio;const lista=EMERGENCIAS[mun];
  const sync=ls.get('fc_sos_sync',Date.now());
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
      +'<button class="btn btn-secundario btn-bloque" id="pfProductor">'+icon('store')+'Soy productor / comerciante</button></div></div>'
      +'<div class="seccion">'+(puedeInstalar()?'<button class="pf-item" id="pfInstalar">'+icon('download')+'Instalar la app en mi celular</button>':'')
      +'<button class="pf-item" id="pfLegal">'+icon('file-text')+'Aviso legal y privacidad (Ley 1581)</button></div></div>'+footerHTML();
    const pi=$('#pfInstalar');if(pi)pi.onclick=instalarApp;
    $('#pfRegistro').onclick=()=>abrirLogin('registro');$('#pfIngresar').onclick=()=>abrirLogin('ingresar');
    $('#pfProductor').onclick=()=>abrirLogin('registro',true);$('#pfLegal').onclick=()=>abrir('ovLegal');
    enlazarFooter();return;
  }
  const u=estado.usuario,p=estado.perfil||{};
  const cupones=cuponesLocales();
  const notifOn=p.notificaciones_push!==false;
  const rol=p.rol==='comerciante'?[ 'store','Productor / comerciante']:p.rol==='admin'?['shield-check','Administrador']:['user','Vecino / turista'];
  cuerpo.innerHTML='<div class="vista">'
    +'<div class="perfil-card"><div class="pf-av">'+esc(u.nombre.charAt(0).toUpperCase())+'</div><h2>'+esc(u.nombre)+'</h2><p>'+esc(u.email)+'</p>'
    +'<span class="pf-rol">'+icon(rol[0],14)+rol[1]+'</span>'
    +(u.verificado||u.proveedor==='google.com'?'':'<div class="pf-alerta">'+icon('mail',16)+'Verifica tu correo para proteger tu cuenta.<button class="enlace" id="pfReenviar">Reenviar correo</button></div>')
    +'<div class="perfil-acc">'+(esComerciante()?'<button class="btn btn-primario btn-bloque" id="pfPanel">'+icon('store')+'Mi panel, mi negocio</button>':'<button class="btn btn-secundario btn-bloque" id="pfSerComerciante">'+icon('store')+'Registrar mi negocio</button>')+'</div></div>'
    +'<div class="seccion"><h3>'+icon('ticket',18)+'Mis cupones</h3>'
    +(cupones.length?cupones.map(c=>'<button class="pf-cupon" data-mic="'+esc(c.id)+'"><b>'+esc(c.comercio_nombre)+'</b><small>'+esc(c.descripcion)+' · '+esc(c.codigo)+'</small><span class="'+(estadoCupon(c)!=='activo'?'usado':'')+'">'+({usado:'Canjeado',vencido:'Vencido',activo:'Ver QR'})[estadoCupon(c)]+'</span></button>').join(''):'<p class="nota-c izq">Aún no has generado cupones. Búscalos en los comercios destacados.</p>')
    +'</div>'
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
  const sc=$('#pfSerComerciante');if(sc)sc.onclick=async()=>{
    if(!await confirmar('Registrar mi negocio','Tu cuenta pasará a ser de productor y podrás publicar tus comercios.','Continuar','Cancelar','store'))return;
    try{await db.collection('usuarios').doc(u.uid).update({rol:'comerciante'});estado.perfil.rol='comerciante';ls.set('fc_perfil_'+u.uid,estado.perfil);navegar({tipo:'dashboard'});}
    catch(e){toast('No se pudo actualizar tu cuenta. Revisa tu conexión.');}
  };
  $$('[data-mic]').forEach(b=>b.onclick=()=>mostrarCupon(cupones.find(c=>c.id===b.dataset.mic)));
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
    if(JSON.stringify(l.slice(0,30))!==antes&&vistaActual().tipo==='perfil')render(true);
  }catch(e){}
}

/* ===== PANEL DEL COMERCIANTE (CU-15, CU-16, CU-17) ===== */
// Comercios del dueño en cualquier estado (vienen de su propio listener)
function misComercios(){return logueado()?comerciosPropios:[];}
let solicitudesPremium=new Set();
function estadoPublicacionHTML(d){
  const e=d.estado_publicacion||'pendiente';
  if(e==='aprobado')return '<span class="chip-estado pub">'+icon('circle-check',14)+'Publicado</span>';
  if(e==='rechazado')return '<span class="chip-estado rech">'+icon('circle-alert',14)+'Rechazado'+(d.motivo_rechazo?': '+esc(d.motivo_rechazo):'')+'</span>';
  return '<span class="chip-estado rev">'+icon('clock',14)+'En revisión</span>';
}
function renderDashboard(){
  const cuerpo=$('#cuerpo');
  if(!esComerciante()){cuerpo.innerHTML='<div class="vacio">'+icon('store',48)+'<b>Panel de productores</b><p>Inicia sesión con tu cuenta de productor.</p></div>';return;}
  const nom=estado.usuario.nombre;const mis=misComercios();
  const publicados=mis.filter(d=>d.estado_publicacion==='aprobado').length;
  const enRevision=mis.filter(d=>d.estado_publicacion==='pendiente').length;
  const cards=mis.length===0
    ?'<div class="vacio">'+icon('store',48)+'<b>Aún no tienes comercios registrados</b><p>Toca «Registrar nuevo comercio». Un administrador lo revisará antes de publicarlo.</p></div>'
    :mis.map(d=>{
      const prem=premiumVigente(d);const img=imgSegura(d.imagen);const cal=calificacionDe(d);
      const pedido=solicitudesPremium.has(d.id);
      return '<div class="dash-card"><div class="dc-ico">'+(img?'<img src="'+esc(img)+'" alt="Foto de '+esc(d.nombre)+'">':icon(iconoDe(d)))+'</div>'
        +'<div class="dc-info"><h3>'+esc(d.nombre)+'</h3><p>'+esc(etiquetaDe(d))+' · '+esc(d.direccion)+'</p>'
        +estadoPublicacionHTML(d)
        +(cal.total?'<div class="meta">'+califHTML(cal)+'</div>':'')
        +'<p class="dc-plan '+(prem?'prem':'')+'">'+(prem?icon('star',14,'ic-fill')+'Premium hasta '+fechaCorta(d.suscripcion_vigente_hasta):'Plan Gratis')+'</p>'
        +'<div class="dc-actions"><button class="btn btn-primario btn-sm" data-eid="'+esc(d.id)+'">'+icon('pencil',16)+'Editar</button>'
        +'<button class="btn btn-secundario btn-sm" data-ver="'+esc(d.id)+'">Ver ficha</button>'
        +(prem?'<button class="btn btn-secundario btn-sm" data-cup="'+esc(d.id)+'">'+icon('ticket',16)+'Cupón</button><button class="btn btn-secundario btn-sm" data-promo="'+esc(d.id)+'">'+icon('megaphone',16)+'Novedad</button>'
          :(pedido?'<button class="btn btn-secundario btn-sm" disabled>'+icon('clock',16)+'Premium solicitado</button>'
                  :'<button class="btn btn-secundario btn-sm" data-prem="'+esc(d.id)+'">'+icon('star',16)+'Solicitar Premium</button>'))
        +'</div></div></div>';
    }).join('');
  cuerpo.innerHTML='<div class="dash-hero"><h2>Mi panel, mi negocio</h2><p>Hola, '+esc(nom)+'. Gestiona tus comercios en Fusa Conecta.</p>'
    +'<div class="dash-stats"><div class="dash-stat"><div class="ds-n">'+publicados+'</div><div class="ds-l">Publicados</div></div>'
    +'<div class="dash-stat"><div class="ds-n">'+enRevision+'</div><div class="ds-l">En revisión</div></div>'
    +'<div class="dash-stat"><div class="ds-n" id="dsCanjes">…</div><div class="ds-l">Cupones canjeados</div></div></div></div>'
    +'<div class="dash-body"><button class="btn btn-primario btn-bloque" id="bDashNuevo">'+icon('plus')+'Registrar nuevo comercio</button>'
    +'<p class="dash-section">Mis negocios</p><div id="dashGrid">'+cards+'</div>'
    +'<p class="dash-section">Validar cupón de un cliente</p><div class="validar-row"><label for="vCodigo" class="sr-only">Código del cupón</label><input class="input" id="vCodigo" placeholder="FC-XXXX-XXXX" maxlength="12" autocapitalize="characters"><button class="btn btn-secundario" id="vValidar">'+icon('badge-check')+'Validar</button></div><p class="nota-c izq" id="vRes" role="status"></p>'
    +'<button class="btn btn-secundario btn-bloque mt-16" id="bExplorar">'+icon('search')+'Ver directorio completo</button></div>';
  $('#bDashNuevo').onclick=()=>abrirFormComercio(null);
  $('#bExplorar').onclick=()=>inicio();
  $$('#dashGrid [data-eid]').forEach(b=>b.onclick=()=>abrirFormComercio(buscar(b.dataset.eid)));
  $$('#dashGrid [data-ver]').forEach(b=>b.onclick=()=>abrirDetalle(b.dataset.ver));
  $$('#dashGrid [data-prem]').forEach(b=>b.onclick=()=>solicitarPremium(buscar(b.dataset.prem)));
  $$('#dashGrid [data-cup]').forEach(b=>b.onclick=()=>formCupon(buscar(b.dataset.cup)));
  $$('#dashGrid [data-promo]').forEach(b=>b.onclick=()=>formPromo(buscar(b.dataset.promo)));
  $('#vValidar').onclick=validarCupon;
  $('#vCodigo').addEventListener('keydown',e=>{if(e.key==='Enter')validarCupon();});
  db.collection('canjes').where('propietario_uid','==',estado.usuario.uid).get()
    .then(s=>{const el=$('#dsCanjes');if(el)el.textContent=s.docs.filter(x=>x.data().estado==='usado').length;})
    .catch(()=>{const el=$('#dsCanjes');if(el)el.textContent='—';});
  // Solicitudes de Premium pendientes del comerciante (para no duplicarlas)
  db.collection('solicitudes').where('uid','==',estado.usuario.uid).where('tipo','==','premium').get().then(s=>{
    const antes=solicitudesPremium.size;
    solicitudesPremium=new Set(s.docs.filter(x=>x.data().estado==='pendiente').map(x=>x.data().comercio_id));
    if(solicitudesPremium.size!==antes&&vistaActual().tipo==='dashboard')render(true);
  }).catch(()=>{});
}
// El Premium ya no se autoactiva: se solicita y lo activa un administrador
async function solicitarPremium(d){
  if(!d)return;
  if(solicitudesPremium.has(d.id)){toast('Ya enviaste la solicitud. Un administrador activará tu plan.');return;}
  const prueba=d.prueba_usada?'':' Si es tu primera vez, puede activarte una prueba gratuita de 30 días.';
  if(!await confirmar('Solicitar Premium','Un administrador revisará tu solicitud. Premium incluye posición destacada, cupones con QR, novedades, redes sociales y sitio web.'+prueba,'Enviar solicitud','Cancelar','star'))return;
  try{
    await db.collection('solicitudes').add({tipo:'premium',comercio_id:d.id,comercio_nombre:d.nombre,uid:estado.usuario.uid,
      usuario_nombre:estado.usuario.nombre,correo:estado.usuario.email,estado:'pendiente',fecha:FV.serverTimestamp()});
    solicitudesPremium.add(d.id);toast('Solicitud enviada. Te avisaremos cuando se active.');render(true);
  }catch(e){console.error(e);toast('No se pudo enviar la solicitud. Revisa tu conexión.');}
}
// Canjear (transacción): solo el dueño del comercio, una sola vez, de "reservado" a "usado". El cupo ya se descontó al obtenerlo.
async function validarCupon(){
  const cod=$('#vCodigo').value.trim().toUpperCase();const res=$('#vRes');
  if(!/^FC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cod)){res.textContent='Escribe el código completo, por ejemplo FC-AB12-CD34.';return;}
  res.textContent='Validando…';
  const uid=estado.usuario.uid;
  try{
    const s=await db.collection('canjes').where('propietario_uid','==',uid).where('codigo','==',cod).get();
    if(s.empty){res.textContent='Este código no corresponde a un cupón de tus comercios.';return;}
    const ref=s.docs[0].ref;
    const r=await db.runTransaction(async tx=>{
      const k=await tx.get(ref);const c=k.data();
      if(c.estado==='usado')return {tipo:'usado',c};
      if((aMs(c.fecha_vencimiento)||Infinity)<Date.now())return {tipo:'vencido',c};
      tx.update(ref,{estado:'usado',fecha_canje:FV.serverTimestamp(),canjeado_por:uid});
      return {tipo:'ok',c};
    });
    if(r.tipo==='usado')res.textContent='Este cupón ya fue canjeado'+(r.c.fecha_canje?' el '+fechaHora(aMs(r.c.fecha_canje)):'.');
    else if(r.tipo==='vencido')res.textContent='Este cupón está vencido.';
    else{res.textContent='Cupón válido y canjeado: '+r.c.descripcion+' · Cliente: '+r.c.usuario_nombre;$('#vCodigo').value='';}
  }catch(e){console.error(e);res.textContent='No se pudo validar. Revisa tu conexión.';}
}
function formCupon(d){
  abrirHoja('<div class="form-head"><h2>Publicar cupón</h2><p>'+esc(d.nombre)+'</p></div><div class="form-body">'
    +'<div class="campo"><label for="cDesc">Descripción del descuento <span class="req">*</span></label><input id="cDesc" maxlength="80" placeholder="Ej: 10% en tu primera compra"></div>'
    +'<div class="campo"><label for="cPct">Porcentaje de descuento</label><input id="cPct" type="number" min="1" max="100" value="10"></div>'
    +'<div class="campo"><label for="cCupo">Cupos disponibles</label><input id="cCupo" type="number" min="1" max="10000" value="50"></div>'
    +'<div class="campo"><label for="cVig">Válido hasta <span class="req">*</span></label><input id="cVig" type="date"></div>'
    +'<div class="campo"><label for="cTer">Términos y condiciones</label><input id="cTer" maxlength="140" placeholder="Ej: Un cupón por persona al día"></div>'
    +'<button class="btn btn-primario btn-bloque" id="cGuardar">Publicar cupón</button></div>');
  const m=new Date(Date.now()+30*86400000);$('#cVig').value=m.toISOString().slice(0,10);
  $('#cGuardar').onclick=async()=>{
    const desc=$('#cDesc').value.trim(),vig=$('#cVig').value,cupo=Math.max(1,parseInt($('#cCupo').value,10)||1);
    if(!desc){toast('Describe el descuento');return;}
    if(!vig||Date.parse(vig)<Date.now()-86400000){toast('Elige una fecha de vigencia futura');return;}
    try{
      await db.collection('cupones').add({comercio_id:d.id,propietario_uid:estado.usuario.uid,comercio_nombre:d.nombre,descripcion:desc,porcentajeDescuento:Math.min(100,Math.max(1,parseInt($('#cPct').value,10)||10)),
        cupo_total:cupo,cupo_restante:cupo,vigencia:vig,terminos:$('#cTer').value.trim(),estado:'activo',fecha_creacion:FV.serverTimestamp()});
      cerrar('ovGen');toast('Cupón publicado');
    }catch(e){console.error(e);toast('No se pudo publicar el cupón');}
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
/* ===== FORMULARIO: PUBLICAR / EDITAR COMERCIO ===== */
let editandoId=null,ubicacionForm=null;
function abrirFormComercio(d){
  if(!esComerciante()){pedirLogin('Ingresa con tu cuenta de productor para publicar comercios.',true);return;}
  editandoId=d?d.id:null;ubicacionForm=d&&d.lat?[d.lat,d.lng]:null;
  $('#fNombre').value=d?d.nombre:'';$('#fCat').value=d?d.cat:'';$('#fDesc').value=d?d.desc:'';
  $('#fDir').value=d?d.direccion:'';$('#fTel').value=d?d.tel:'';$('#fFoto').value='';
  pintarSubForm(d?subDe(d):'');
  $('#fAbre').value=d&&d.abre?d.abre:'08:00';$('#fCierra').value=d&&d.cierra?d.cierra:'18:00';
  const dias=d&&d.dias?d.dias:[1,2,3,4,5,6];
  $$('#fDias input').forEach(i=>i.checked=dias.includes(+i.value));
  $('#fUbicTxt').textContent=ubicacionForm?'Ubicación guardada':'Sin ubicación exacta (se usará la dirección)';
  const prem=d&&premiumVigente(d);
  $('#fPremium').style.display=prem?'block':'none';
  ['instagram','facebook','tiktok','youtube','x'].forEach(k=>{$('#fRed_'+k).value=d&&d.redesSociales&&d.redesSociales[k]||'';});
  $('#fWeb').value=d?d.sitioWeb||'':'';
  $('#formIntro h2').textContent=d?'Editar comercio':'Suma tu comercio';
  $('#formIntro p').textContent=d?'Actualiza la información de tu negocio.':'Publica tu negocio, finca, ruta o servicio en Fusa Conecta.';
  $('#bPublicar').innerHTML=d?'Guardar cambios':'Publicar';
  abrir('ovForm');
}
// Subcategoría del formulario: solo para Comercios y Turismo
function pintarSubForm(valor){
  const subs=SUBCATS[$('#fCat').value]||[];
  $('#fSubWrap').style.display=subs.length?'block':'none';
  $('#fSub').innerHTML='<option value="">Selecciona el tipo</option>'+subs.map(s=>'<option value="'+s.k+'">'+nombreSub($('#fCat').value,s.k)+'</option>').join('');
  $('#fSub').value=subs.some(s=>s.k===valor)?valor:'';
}
$('#fCat').addEventListener('change',()=>pintarSubForm(''));
function comprimirImagen(file){
  return new Promise(res=>{
    if(!file)return res('');
    const reader=new FileReader();
    reader.onload=ev=>{const img=new Image();img.onload=()=>{
      let w=img.width,h=img.height;if(w>800){h=Math.round(h*800/w);w=800;}
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);
      res(cv.toDataURL('image/jpeg',0.6));};img.onerror=()=>res('');img.src=ev.target.result;};
    reader.onerror=()=>res('');reader.readAsDataURL(file);
  });
}
function urlValida(u){return /^https:\/\/[^\s.]+\.[^\s]{2,}$/i.test(u);}
async function publicarComercio(){
  if(!esComerciante()){cerrar('ovForm');pedirLogin('Ingresa con tu cuenta de productor.',true);return;}
  const nombre=$('#fNombre').value.trim(),cat=$('#fCat').value,tel=telLimpio($('#fTel').value);
  if(!nombre){toast('Escribe el nombre del negocio');return;}
  if(!cat){toast('Selecciona una categoría');return;}
  const sub=$('#fSub').value;
  if(SUBCATS[cat]&&!sub){toast('Selecciona el tipo de negocio');return;}
  if(tel&&!/^\d{7,10}$/.test(tel)){toast('Revisa el número de teléfono');return;}
  const dias=[...$$('#fDias input:checked')].map(i=>+i.value);
  const abre=$('#fAbre').value,cierra=$('#fCierra').value;
  const redes={};let errorRed='';
  if($('#fPremium').style.display!=='none'){
    ['instagram','facebook','tiktok','youtube','x'].forEach(k=>{const v=$('#fRed_'+k).value.trim();if(v){if(urlValida(v))redes[k]=v;else errorRed=k;}});
    const web=$('#fWeb').value.trim();
    if(web&&!urlValida(web)){toast('El sitio web debe comenzar con https://');return;}
  }
  if(errorRed){toast('El enlace de '+RED_TXT[errorRed]+' debe comenzar con https://');return;}
  const btn=$('#bPublicar'),txt=btn.innerHTML;btn.innerHTML='Guardando...';btn.disabled=true;
  try{
    const img=await comprimirImagen($('#fFoto').files[0]);
    const datos={cat,categoria:cat,emoji:CAT[cat].emoji,nombre,desc:$('#fDesc').value.trim()||'Negocio local de Fusagasugá.',
      direccion:$('#fDir').value.trim()||'Fusagasugá',tel,whatsapp:esCelular(tel)?tel:'',dias,abre,cierra,
      horario:dias.length?dias.slice().sort().map(i=>DIAS_TXT[i]).join(', ')+' · '+abre+' – '+cierra:'Consultar directamente',
      propietario_uid:estado.usuario.uid,propietario:estado.usuario.nombre,municipio:'Fusagasugá',fecha_modificacion:FV.serverTimestamp()};
    if(cat==='turismo'){datos.tipo=sub;datos.sub='';}else datos.sub=SUBCATS[cat]?sub:'';
    if(ubicacionForm){datos.lat=ubicacionForm[0];datos.lng=ubicacionForm[1];datos.ubicacion_aprox=false;}
    if(img)datos.imagen=img;
    if($('#fPremium').style.display!=='none'){datos.redesSociales=redes;datos.sitioWeb=$('#fWeb').value.trim();}
    if(editandoId){
      const actual=buscar(editandoId);const reenviar=actual&&actual.estado_publicacion==='rechazado';
      if(reenviar){datos.estado_publicacion='pendiente';datos.motivo_rechazo=FV.delete();}
      await db.collection('comercios').doc(editandoId).update(datos);
      toast(reenviar?'Cambios enviados a revisión':'"'+nombre+'" actualizado');
    }
    else{
      if(!ubicacionForm){datos.lat=PLAZA_FUSA[0];datos.lng=PLAZA_FUSA[1];datos.ubicacion_aprox=true;}
      Object.assign(datos,{estado_publicacion:'pendiente',esPremium:false,prioridadBusqueda:0,redesSociales:{},sitioWeb:'',imagen:img||'',fechaCreacion:FV.serverTimestamp()});
      await db.collection('comercios').add(datos);toast('Tu comercio quedó en revisión. Aparecerá en el directorio cuando un administrador lo apruebe.');
    }
    editandoId=null;cerrar('ovForm');
    if(vistaActual().tipo!=='dashboard')navegar({tipo:'dashboard'});
  }catch(e){console.error(e);toast(e.code==='permission-denied'?'No tienes permiso para editar este comercio':'No se pudo guardar. Revisa tu conexión o usa una foto más liviana.');}
  finally{btn.innerHTML=txt;btn.disabled=false;}
}
/* ===== AUTENTICACIÓN REAL CON FIREBASE (RF-02, RF-03, RNF-07) ===== */
let modoLogin='ingresar',registroPendiente=null,creandoPerfil=null;
function abrirLogin(modo='ingresar',productor=false,aviso=''){
  modoLogin=modo;
  $('#lComerciante').checked=productor;
  $('#loginAviso').innerHTML=aviso?icon('lock',18)+'<span>'+esc(aviso)+'</span>':'';$('#loginAviso').style.display=aviso?'flex':'none';
  pintarModoLogin();abrir('ovLogin');
}
function pedirLogin(msg,productor=false){abrirLogin('ingresar',productor,msg);}
function pintarModoLogin(){
  const reg=modoLogin==='registro';
  $$('#ovLogin .seg button').forEach(b=>{const on=b.dataset.modo===modoLogin;b.classList.toggle('on',on);b.setAttribute('aria-selected',on);});
  $('#lNombreWrap').style.display=reg?'block':'none';
  $('#lConsentWrap').style.display=reg?'flex':'none';
  $('#lOlvido').style.display=reg?'none':'inline-flex';
  $('#lMail').textContent=reg?'Crear mi cuenta':'Ingresar';
  $('#clave').setAttribute('autocomplete',reg?'new-password':'current-password');
  $('#loginTitulo').textContent=$('#lComerciante').checked?(reg?'Crea tu cuenta de productor':'Ingresa como productor'):(reg?'Crea tu cuenta':'Ingresa a Fusa Conecta');
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
  const rol=$('#lComerciante').checked?'comerciante':'usuario';
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
  registroPendiente={consent:modoLogin==='registro'&&$('#lConsent').checked,rol:$('#lComerciante').checked?'comerciante':'usuario'};
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
// Factory: crea el perfil según el rol elegido (usuario o comerciante)
function crearPerfil(user,datos){
  if(creandoPerfil)return creandoPerfil;
  const perfil={uid:user.uid,nombre:datos.nombre||user.displayName||(user.email||'').split('@')[0]||'Vecino',correo:user.email||'',
    rol:datos.rol==='comerciante'?'comerciante':'usuario',consentimiento_ley1581:true,fecha_consentimiento:FV.serverTimestamp(),
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
  cerrar('ovLogin');ocultarSplash();
  estado.favoritos=ls.get(claveFav(),[]);
  estado.perfil=ls.get('fc_perfil_'+user.uid,null);
  let snap=null;
  try{snap=await db.collection('usuarios').doc(user.uid).get();}catch(e){console.warn('Perfil sin conexión');}
  if(snap&&snap.exists){
    estado.perfil=snap.data();
    const nube=estado.perfil.favoritos||[];
    estado.favoritos=[...new Set([...nube,...estado.favoritos])];
    if(estado.favoritos.length!==nube.length)db.collection('usuarios').doc(user.uid).update({favoritos:estado.favoritos}).catch(()=>{});
    if(registroPendiente&&registroPendiente.rol==='comerciante'&&estado.perfil.rol==='usuario'){
      await db.collection('usuarios').doc(user.uid).update({rol:'comerciante'}).catch(()=>{});estado.perfil.rol='comerciante';
    }
    if(estado.perfil.nombre)estado.usuario.nombre=estado.perfil.nombre;
  }else if(snap&&!snap.exists){
    const datos=registroPendiente||ls.get('fc_registro_pendiente',null)||{consent:false,rol:'usuario'};
    if(!datos.consent){
      const r=await pedirConsentimiento(datos.rol);
      if(!r){await auth.signOut();toast('Sin tu autorización no podemos crear la cuenta.');return;}
      datos.rol=r;
    }
    try{estado.perfil=await crearPerfil(user,{...datos,nombre:estado.usuario.nombre});}
    catch(e){console.error(e);const s2=await db.collection('usuarios').doc(user.uid).get().catch(()=>null);estado.perfil=s2&&s2.exists?s2.data():null;}
  }
  ls.del('fc_registro_pendiente');
  if(estado.perfil){const p={...estado.perfil};p.fecha_consentimiento=aMs(p.fecha_consentimiento);ls.set('fc_perfil_'+user.uid,p);}
  ls.set(claveFav(),estado.favoritos);
  const quiereProductor=registroPendiente&&registroPendiente.rol==='comerciante';
  registroPendiente=null;
  if(quiereProductor&&esComerciante()){stack.length=0;navegar({tipo:'dashboard'});}
  else refrescarTodo();
  escucharPromociones();sincronizarCupones();escucharMisComercios();
}
function pedirConsentimiento(rol){
  return new Promise(res=>{
    $('#cComerciante').checked=rol==='comerciante';abrir('ovConsent');
    $('#consentSi').onclick=()=>{cerrar('ovConsent');res($('#cComerciante').checked?'comerciante':'usuario');};
    $('#consentNo').onclick=()=>{cerrar('ovConsent');res(null);};
  });
}
function refrescarTodo(){if(stack.length===0)inicio();else render(true);}
async function cerrarSesion(){
  if(!await confirmar('Cerrar sesión','¿Quieres salir de tu cuenta?','Salir','Cancelar','log-out'))return;
  await auth.signOut();
  estado.usuario=null;estado.perfil=null;estado.favoritos=[];
  stack.length=0;$('#splash').classList.remove('oculto');
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
    stack.length=0;$('#splash').classList.remove('oculto');inicio();
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
  if(!user){dejarDeEscucharMisComercios();estado.usuario=null;estado.perfil=null;estado.favoritos=[];refrescarTodo();return;}
  if(!registroPendiente)registroPendiente=ls.get('fc_registro_pendiente',null);
  procesarUsuario(user);
  if(!user.isAnonymous&&!$('#splash').classList.contains('oculto'))setTimeout(ocultarSplash,2600);
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
function noLeidas(){const v=ls.get('fc_novedades_leido',0);return estado.novedades.filter(n=>(aMs(n.fecha_envio)||0)>v).length;}
function campanaHTML(){
  const n=noLeidas();
  return '<button class="btn-redondo campana" id="bNovedades" aria-label="Novedades'+(n?', '+n+' sin leer':'')+'">'+icon('bell')+(n?'<span class="punto-nuevo" aria-hidden="true"></span>':'')+'</button>';
}
function actualizarCampana(){
  const b=$('#bNovedades');if(!b)return;const n=noLeidas();
  b.setAttribute('aria-label','Novedades'+(n?', '+n+' sin leer':''));
  const p=b.querySelector('.punto-nuevo');
  if(n&&!p)b.insertAdjacentHTML('beforeend','<span class="punto-nuevo" aria-hidden="true"></span>');
  if(!n&&p)p.remove();
}
function abrirNovedades(){
  const visto=ls.get('fc_novedades_leido',0);const lista=estado.novedades;
  abrirHoja('<div class="hoja-pad"><h2 class="hoja-tit">Novedades</h2><p class="nota">Promociones y anuncios de los comercios destacados de Fusa.</p>'
    +(lista.length?'<div class="novedades">'+lista.map(n=>'<button class="novedad'+((aMs(n.fecha_envio)||0)>visto?' nueva':'')+'" data-com="'+esc(n.comercio_id)+'">'
        +'<span class="nv-ic">'+icon('megaphone',18)+'</span><span class="nv-tx"><b>'+esc(n.titulo)+'</b><span>'+esc(n.mensaje)+'</span>'
        +'<small>'+esc(n.comercio_nombre||'')+' · '+fechaCorta(aMs(n.fecha_envio))+'</small></span></button>').join('')+'</div>'
      :'<div class="vacio">'+icon('bell',48)+'<b>Aún no hay novedades</b><p>Aquí verás las promociones de los comercios destacados.</p></div>')
    +'</div>');
  $$('#sheetGen [data-com]').forEach(b=>b.onclick=()=>{cerrar('ovGen');abrirDetalle(b.dataset.com);});
  ls.set('fc_novedades_leido',Date.now());actualizarCampana();
}

/* ===== FOOTER ===== */
function footerHTML(){
  return '<footer class="footer">'+MARCA_HTML
    +'<p>El directorio digital de Fusagasugá, la Ciudad Jardín del Sumapaz.</p>'
    +'<div class="f-links"><button id="fApoyo">'+icon('heart',16)+'Apoyar el proyecto</button><button id="fLegal">'+icon('file-text',16)+'Aviso legal</button></div>'
    +'<p>© 2026 Fusa Conecta · Hecho en Fusagasugá</p></footer>';
}
function enlazarFooter(){
  const fa=$('#fApoyo');if(fa)fa.onclick=()=>abrir('ovApoyo');
  const fl=$('#fLegal');if(fl)fl.onclick=()=>abrir('ovLegal');
}

/* ===== BARRA INFERIOR (RF-04) ===== */
function renderBottomNav(){
  const v=vistaActual();
  $$('.bn-btn').forEach(b=>{
    const bn=b.dataset.bn;
    const activo=(bn==='inicio'&&v.tipo==='lista'&&v.cat!=='favoritos')||(bn==='favoritos'&&v.cat==='favoritos')
      ||(bn==='sos'&&v.tipo==='sos')||(bn==='mapa'&&(v.tipo==='mapa'||v.tipo==='ruta'))||(bn==='perfil'&&(v.tipo==='perfil'||v.tipo==='dashboard'));
    b.classList.toggle('bn-active',activo);
    if(activo)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
}
$$('.bn-btn').forEach(b=>{
  b.onclick=()=>{
    const bn=b.dataset.bn;
    if(bn==='inicio'){inicio();return;}
    if(bn==='favoritos'){if(!logueado()){pedirLogin('Inicia sesión para ver tus favoritos.');return;}navegar({tipo:'lista',cat:'favoritos'});return;}
    if(bn==='sos'){navegar({tipo:'sos'});return;}
    if(bn==='mapa'){navegar({tipo:'mapa'});return;}
    if(bn==='perfil'){navegar({tipo:'perfil'});}
  };
});

/* ===== EVENTOS DE LA INTERFAZ ===== */
$('#loginLogo').innerHTML=LOGO_SVG;
$$('.overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov&&ov.id!=='ovConsent'&&ov.id!=='ovConfirm')ov.classList.remove('abierto');}));
$$('[data-cerrar]').forEach(b=>{b.onclick=()=>cerrar(b.dataset.cerrar);});
function ocultarSplash(){$('#splash').classList.add('oculto');}
$('#sInvitado').onclick=()=>{
  ocultarSplash();render();toast('Explorando Fusa Conecta');
  if(!auth.currentUser)auth.signInAnonymously().catch(()=>{});
};
$('#sRegistrar').onclick=()=>abrirLogin('registro');
$$('#ovLogin .seg button').forEach(b=>b.onclick=()=>{modoLogin=b.dataset.modo;pintarModoLogin();});
$('#formLogin').addEventListener('submit',enviarLogin);
$('#lGoogle').onclick=ingresarGoogle;
$('#lOlvido').onclick=olvideClave;
$('#lComerciante').onchange=pintarModoLogin;
$('#lVerLegal').onclick=()=>abrir('ovLegal');
$('#cVerLegal').onclick=()=>abrir('ovLegal');
$('#edadSi').onclick=()=>{estado.mayorEdad=true;cerrar('ovEdad');navegar({tipo:'lista',cat:'bares'});};
$('#edadNo').onclick=()=>{cerrar('ovEdad');toast('Solo para mayores de 18 años.');};
$('#bPublicar').onclick=publicarComercio;
$('#fUbicar').onclick=async()=>{
  $('#fUbicTxt').textContent='Obteniendo ubicación…';
  const p=await pedirUbicacion();
  if(p){ubicacionForm=p;$('#fUbicTxt').textContent='Ubicación guardada ('+p[0].toFixed(5)+', '+p[1].toFixed(5)+')';}
  else $('#fUbicTxt').textContent='No pudimos obtener tu ubicación. Activa el GPS.';
};
$$('.monto').forEach(b=>b.onclick=()=>{$$('.monto').forEach(x=>{x.classList.remove('sel');x.setAttribute('aria-pressed','false');});b.classList.add('sel');b.setAttribute('aria-pressed','true');});
$('#bEnviarApoyo').onclick=()=>{const sel=$('.monto.sel');if(!sel){toast('Selecciona un monto');return;}cerrar('ovApoyo');toast('¡Gracias por apoyar! Monto: $'+sel.dataset.m);};
$('#bVolver').onclick=volver;

let _deb;
$('#busqueda').addEventListener('input',e=>{
  clearTimeout(_deb);
  _deb=setTimeout(()=>{
    renderSugerencias();
    estado.q=e.target.value.trim();
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
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();avisoInstalar=e;mostrarBannerInstalar();if(vistaActual().tipo==='perfil')render(true);});
window.addEventListener('appinstalled',()=>{avisoInstalar=null;ocultarBannerInstalar();toast('Fusa Conecta quedó instalada en tu celular');});
async function instalarApp(){
  ocultarBannerInstalar();
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
function mostrarBannerInstalar(){
  if(appInstalada()||!puedeInstalar())return;
  if(Date.now()-ls.get('fc_instalar_cerrado',0)<3*86400000)return;
  if(!$('#splash').classList.contains('oculto'))return;
  let b=$('#bannerInstalar');
  if(!b){
    b=document.createElement('div');b.id='bannerInstalar';b.className='banner-instalar';b.setAttribute('role','dialog');b.setAttribute('aria-label','Instalar la app');
    b.innerHTML='<img src="img/icons/icon-192.png" alt=""><div><b>Instala Fusa Conecta</b><span>Úsala como app, sin navegador</span></div>'
      +'<button class="btn btn-primario btn-sm bi-si">'+icon('download',18)+'Instalar</button><button class="btn-redondo bi-no" aria-label="Cerrar aviso de instalación">'+icon('x')+'</button>';
    $('#shell').appendChild(b);
    b.querySelector('.bi-si').onclick=instalarApp;
    b.querySelector('.bi-no').onclick=()=>{ls.set('fc_instalar_cerrado',Date.now());ocultarBannerInstalar();};
  }
  requestAnimationFrame(()=>b.classList.add('ver'));
}
function ocultarBannerInstalar(){const b=$('#bannerInstalar');if(b)b.classList.remove('ver');}
new MutationObserver(()=>{if($('#splash').classList.contains('oculto'))setTimeout(mostrarBannerInstalar,3800);})
  .observe($('#splash'),{attributes:true,attributeFilter:['class']});

/* ===== ARRANQUE ===== */
try{history.replaceState({n:0},'');}catch(e){}
inicio();
if(navigator.geolocation&&navigator.permissions){
  navigator.permissions.query({name:'geolocation'}).then(p=>{if(p.state==='granted')pedirUbicacion().then(()=>render(true));}).catch(()=>{});
}
// Accesos directos del ícono de la app (mantener presionado): ?ir=sos | ?ir=mapa
(function(){const ir=new URLSearchParams(location.search).get('ir');if(ir==='sos'||ir==='mapa'){ocultarSplash();navegar({tipo:ir});}})();
// Enlace compartido: #c/<id> abre la ficha del lugar
if(/^#c\//.test(location.hash)){const id=decodeURIComponent(location.hash.slice(3));ocultarSplash();setTimeout(()=>abrirDetalle(id),300);}
