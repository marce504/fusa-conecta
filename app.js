/* =====================================================================
 * FUSA CONECTA — lógica de la aplicación
 * Arquitectura en capas + MVVM ligero (Documento Técnico, cap. 5 y 6):
 *  - Singleton: una sola conexión a Firebase (app, auth, firestore).
 *  - Repository: los datos se leen de la copia local (datos.js + caché
 *    offline de Firestore) y se actualizan en vivo desde la nube.
 *  - Factory: creación del perfil de usuario según su rol.
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
const LOGO_SRC=$('#sesion img')?$('#sesion img').getAttribute('src'):'logo.png';
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();}
const ls={
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},
  del(k){try{localStorage.removeItem(k);}catch(e){}}
};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('ver');if(t._t)clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('ver'),3200);}
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
  cargarCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css');
  await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
  await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js');
}
function confirmar(titulo,texto,si='Sí',no='No',icono='❓'){
  return new Promise(res=>{
    $('#cfIc').textContent=icono;$('#cfTit').textContent=titulo;$('#cfTxt').textContent=texto;
    $('#cfSi').textContent=si;$('#cfNo').textContent=no;
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
  sosMunicipio:'fusagasuga'
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
    tipo:x.tipo||'',nivelDificultad:x.nivelDificultad||''};
}
function reconstruirDirectorio(){database=[...COMERCIOS_BASE.map(c=>({...c})),...comerciosNube];}
db.collection('comercios').onSnapshot(snap=>{
  const lista=[];
  snap.forEach(doc=>{
    const x=doc.data();
    // Los registros antiguos de la carga inicial ya están en la copia local (datos.js)
    if(!x.propietario_uid&&nombresBase.has(norm(x.nombre).trim()))return;
    lista.push(normalizarNube(doc.id,x));
  });
  comerciosNube=lista;reconstruirDirectorio();refrescarVista();
},err=>console.warn('Comercios sin conexión:',err.code));

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
function calificacionDe(d){
  const l=estado.califs[d.id]||[];
  if(l.length)return {prom:l.reduce((a,c)=>a+c.estrellas,0)/l.length,total:l.length};
  return {prom:d.rating||0,total:0};
}
function distanciaA(d){return (estado.pos&&d.lat&&d.lng)?distanciaKm(estado.pos,[d.lat,d.lng]):null;}

/* ===== HORARIOS: estado Abierto/Cerrado en tiempo real (RF-08) ===== */
const DIA_IDX={dom:0,lun:1,mar:2,mie:3,jue:4,vie:5,sab:6};
const DIAS_TXT=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
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
    out.push([s*60,e*60]);
  }
  return out;
}
// Licoreras y bares que atienden las 24 horas (se destacan con una etiqueta en la tarjeta y la ficha)
function es24h(d){return d.cat==='bares'&&/24\s*h|24 horas/i.test(d.horario||'');}
function estadoApertura(d){
  let dias,rangos;
  if(d.dias&&d.dias.length&&d.abre&&d.cierra){
    const hm=x=>{const[h,mi]=x.split(':');return +h*60+(+mi||0);};
    dias=d.dias;rangos=[[hm(d.abre),hm(d.cierra)]];
  }else{
    const h=d.horario||'';
    if(/24\s*h|24 horas/i.test(h))return {abierto:true,texto:'Abierto 24 h'};
    rangos=parsearRangos(h);if(!rangos.length)return null;dias=parsearDias(h);
  }
  const ahora=new Date(),dia=ahora.getDay(),min=ahora.getHours()*60+ahora.getMinutes(),ayer=(dia+6)%7;
  const abierto=rangos.some(([s,e])=>e>s?(dias.includes(dia)&&min>=s&&min<e):((dias.includes(dia)&&min>=s)||(dias.includes(ayer)&&min<e)));
  return {abierto,texto:abierto?'Abierto ahora':'Cerrado ahora'};
}
function horarioTexto(d){
  if(d.dias&&d.dias.length&&d.abre&&d.cierra)return d.dias.slice().sort().map(i=>DIAS_TXT[i]).join(', ')+' · '+d.abre+' – '+d.cierra;
  return d.horario||'Consultar directamente';
}

/* ===== ÍCONOS ===== */
const IC={
  reloj:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>',
  pin:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  tel:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.09 5.18 2 2 0 0 1 5.09 3h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L9.91 10.91a16 16 0 0 0 6.18 6.18l1.27-1.34a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 24 18z"/></svg>',
  wa:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.27-.13-1.59-.78-1.84-.87s-.42-.13-.6.13-.69.87-.84 1.05-.31.19-.58.06a7.3 7.3 0 0 1-2.14-1.32 8 8 0 0 1-1.48-1.84c-.16-.27 0-.42.12-.55s.27-.31.4-.47a1.7 1.7 0 0 0 .27-.45.5.5 0 0 0 0-.47c-.06-.13-.6-1.44-.82-1.97s-.43-.45-.59-.46h-.51a1 1 0 0 0-.72.34A3 3 0 0 0 8 10.87a5.26 5.26 0 0 0 1.1 2.79 12 12 0 0 0 4.61 4.06c.64.28 1.14.44 1.53.57a3.68 3.68 0 0 0 1.69.11 2.76 2.76 0 0 0 1.81-1.28 2.24 2.24 0 0 0 .16-1.28c-.07-.12-.25-.18-.51-.31zM12 2a10 10 0 0 0-8.65 15L2 22l5.17-1.35A10 10 0 1 0 12 2z"/></svg>',
  map:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  sos:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  web:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  ruta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
  ticket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>'
};
const RED_IC={instagram:'📸',facebook:'📘',tiktok:'🎵',youtube:'▶️',x:'✖️'};
const RED_TXT={instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',youtube:'YouTube',x:'X'};
const CAT_IC={
  todas:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  comercio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>',
  campo:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  turismo:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.5"/><path d="M7.5 14l2-6 3 4 2-3 2.5 5"/><path d="M10 8l-3 6"/><path d="M16 8l2 6"/><line x1="18" y1="8" x2="18" y2="18"/></svg>',
  hospedaje:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  bares:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14l-2.5 7A5.5 5.5 0 0 1 12 12a5.5 5.5 0 0 1-4.5-2L5 3z"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="17" y1="5" x2="20" y2="2"/><circle cx="19" cy="3" r="1.5"/></svg>',
  tramite:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
};
function estrellas(n,total){
  if(!n)return '<span class="sin-calif">Sin calificaciones aún</span>';
  return Array.from({length:5},(_,i)=>`<svg viewBox="0 0 24 24" fill="${i<Math.round(n)?'#DAB23F':'#e0ddd4'}" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`).join('')
    +`<span class="num">${n.toFixed(1)}${total?' ('+total+')':''}</span>`;
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
  if(ab){ab.classList.remove('abierto');history.pushState({n:stack.length},'');return;}
  if(stack.length>1){stack.pop();render();return;}
  history.pushState({n:stack.length},'');
  confirmar('Salir de Fusa Conecta','¿Estás seguro que deseas salir de Fusa Conecta?','Sí','No','🌿').then(si=>{
    if(!si)return;saliendo=true;window.close();history.back();
  });
});

/* ===== HEADER ===== */
function renderHeader(){
  const v=vistaActual();
  $('#bVolver').classList.toggle('invisible',stack.length<=1);
  const enLista=v.tipo==='lista';
  $('#descubre').style.display=enLista?'block':'none';
  if(!enLista)return;
  if(document.activeElement!==$('#busqueda'))$('#busqueda').value=estado.q;
  const ses=$('#sesion');
  const logo='<img src="'+LOGO_SRC+'" alt="Fusa Conecta" class="sesion-logo">';
  if(logueado()){
    const nom=estado.usuario.nombre;
    ses.innerHTML=logo+'<div class="sesion-acciones"><button class="saludo" id="bPerfilTop"><span class="av">'+esc(nom.charAt(0).toUpperCase())+'</span>Veci, '+esc(nom.split(' ')[0])+'</button>'
      +'<button class="btn-mini salir" id="bSalir">Salir</button></div>';
    $('#bSalir').onclick=cerrarSesion;
    $('#bPerfilTop').onclick=()=>navegar({tipo:'perfil'});
  }else{
    ses.innerHTML=logo+'<button class="btn-mini" id="bEntrar">Entrar</button>';
    $('#bEntrar').onclick=()=>abrirLogin('ingresar');
  }
  const chips=[{k:'todas',t:'Todas'},{k:'comercio',t:'Directorio'},{k:'campo',t:'Campo'},{k:'turismo',t:'Turismo'},
    {k:'hospedaje',t:'Hospedaje'},{k:'bares',t:'Bares y Licores'},{k:'tramite',t:'Trámites'}];
  $('#cats').innerHTML=chips.map(c=>'<button class="cat'+(v.cat===c.k?' activa':'')+'" data-cat="'+c.k+'"><span class="cat-ic">'+CAT_IC[c.k]+'</span>'+c.t+'</button>').join('');
  $$('#cats .cat').forEach(b=>b.onclick=()=>{
    const k=b.dataset.cat;if(v.cat===k)return;
    if(k==='bares'){irABares();return;}
    navegar({tipo:'lista',cat:k});
  });
}
function irABares(){if(estado.mayorEdad){navegar({tipo:'lista',cat:'bares'});return;}abrir('ovEdad');}

/* ===== BÚSQUEDA Y ORDEN (RF-05, RF-19) ===== */
function coincide(d,q){
  if(!q)return true;
  const txt=norm(d.nombre+' '+d.desc+' '+d.direccion+' '+(CAT[d.cat]?CAT[d.cat].label:'')+' '+(d.tipo||''));
  return norm(q).split(/\s+/).filter(Boolean).every(t=>txt.includes(t));
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
function itemsVisibles(cat){
  let items=[...database];
  if(cat&&cat!=='todas'&&cat!=='favoritos')items=items.filter(d=>d.cat===cat);
  if(cat==='favoritos')items=items.filter(d=>estado.favoritos.includes(String(d.id)));
  if(cat==='todas'&&!estado.mayorEdad)items=items.filter(d=>d.cat!=='bares');
  return ordenar(items.filter(d=>coincide(d,estado.q)));
}
function renderSugerencias(){
  const box=$('#sugerencias');const q=$('#busqueda').value.trim();
  if(q.length<3){box.classList.remove('ver');box.innerHTML='';return;}
  estado.q=q;
  const res=itemsVisibles('todas').slice(0,6);estado.q='';
  box.innerHTML=res.length?res.map(d=>'<button data-sug="'+esc(d.id)+'"><span class="sg-em">'+esc(d.emoji)+'</span><span class="sg-tx"><b>'+esc(d.nombre)+'</b><small>'+esc(CAT[d.cat].label)+(premiumVigente(d)?' · Destacado':'')+'</small></span></button>').join('')
    :'<p class="sg-vacio">Sin coincidencias para “'+esc(q)+'”</p>';
  box.classList.add('ver');
  $$('#sugerencias [data-sug]').forEach(b=>b.onmousedown=e=>{e.preventDefault();box.classList.remove('ver');abrirDetalle(b.dataset.sug);});
}

/* ===== TARJETAS ===== */
function heroHTML(d,cls){
  const cat=CAT[d.cat]||CAT.comercio;const img=imgSegura(d.imagen);
  return '<div class="'+cls+'" style="background:'+cat.hero+'"><span class="hero-em">'+esc(d.emoji)+'</span>'
    +(img?'<img src="'+esc(img)+'" alt="'+esc(d.nombre)+'" loading="lazy" onerror="this.remove()">':'');
}
function cardHTML(d){
  const cat=CAT[d.cat]||CAT.comercio;
  const esFav=estado.favoritos.includes(String(d.id));
  const ap=estadoApertura(d);const km=distanciaA(d);const cal=calificacionDe(d);
  return '<div class="card" data-ver="'+esc(d.id)+'">'
    +heroHTML(d,'hero')
    +'<span class="badge" style="background:'+cat.bg+';color:'+cat.fg+'">'+cat.label+'</span>'
    +(premiumVigente(d)?'<span class="badge-dest">★ Destacado</span>':'')
    +(es24h(d)?'<span class="badge-24h">🕐 Abierto 24 horas</span>':'')
    +'<button class="fav-btn'+(esFav?' on':'')+'" data-fav="'+esc(d.id)+'" aria-label="Favorito">'+IC.heart+'</button>'
    +'</div><div class="cuerpo-c">'
    +'<h3>'+esc(d.nombre)+'</h3>'
    +'<div class="stars">'+estrellas(cal.prom,cal.total)+'</div>'
    +'<p class="desc">'+esc(d.desc)+'</p>'
    +'<div class="row-mini">'+IC.pin+'<span>'+esc(d.direccion)+(km!=null?' · a '+fmtDist(km):'')+'</span>'
    +(ap?'<span class="chip-ap '+(ap.abierto?'si':'no')+'">'+ap.texto+'</span>':'')+'</div>'
    +'<div class="acciones-c">'
    +'<button class="btn-cta" data-ver="'+esc(d.id)+'">'+IC.reloj+' Ver detalles</button>'
    +'<button class="btn-ico wa" data-wa="'+esc(d.id)+'" aria-label="WhatsApp">'+IC.wa+'</button>'
    +'<a class="btn-ico tel" href="tel:'+esc(d.tel)+'" aria-label="Llamar">'+IC.tel+'</a>'
    +'</div></div></div>';
}
function enlazarTarjetas(){
  $$('#cuerpo .card [data-ver]').forEach(b=>b.onclick=()=>abrirDetalle(b.dataset.ver));
  $$('#cuerpo [data-wa]').forEach(b=>b.onclick=e=>{e.stopPropagation();abrirWhatsApp(buscar(b.dataset.wa));});
  $$('#cuerpo .fav-btn').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    if(!toggleFavorito(b.dataset.fav))return;
    const on=estado.favoritos.includes(b.dataset.fav);
    b.classList.toggle('on',on);b.classList.add('pop');setTimeout(()=>b.classList.remove('pop'),400);
    if(vistaActual().cat==='favoritos')render();
  });
}
function buscar(id){return database.find(x=>String(x.id)===String(id));}

/* ===== ACCIONES DE CONTACTO (RF-09, RF-13) ===== */
function abrirWhatsApp(d){
  if(!d)return;
  const wa=d.whatsapp||(esCelular(d.tel)?telLimpio(d.tel):'');
  if(!wa){toast('Este comercio no tiene WhatsApp registrado. Puedes llamar al '+d.tel);return;}
  const msg='Hola '+d.nombre+', te encontré en Fusa Conecta 🌿 Quisiera más información.';
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
  toast(i===-1?'Agregado a favoritos ❤️':'Quitado de favoritos');
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
function renderLista(v){
  const items=itemsVisibles(v.cat);
  const titulo=v.cat==='favoritos'?'Mis Favoritos':(v.cat==='todas'?'Todo Fusa Conecta':(CAT[v.cat]?CAT[v.cat].label:'Resultados'));
  const vacio=v.cat==='favoritos'?'Toca el corazón de un lugar para guardarlo aquí. Tus favoritos quedan disponibles sin conexión.':(estado.q?'No encontramos “'+esc(estado.q)+'”. Prueba con otra palabra.':'Pronto habrá más aquí.');
  const html=items.length===0
    ?'<div class="vacio"><div class="em">🌿</div><b>Sin resultados</b><p>'+vacio+'</p></div>'
    :'<div class="head-v"><h2>'+titulo+'</h2><span class="conteo">'+items.length+' lugares</span></div><div class="grid">'+items.map(cardHTML).join('')+'</div>';
  $('#cuerpo').innerHTML='<div class="vista">'+html+'</div>'+footerHTML();
  enlazarTarjetas();enlazarFooter();
}

/* ===== DETALLE DEL COMERCIO (RF-08 a RF-13, RF-20, RF-21) ===== */
function cuponesDe(d){
  if(!premiumVigente(d))return [];
  const hoy=Date.now();
  const base=CUPONES_BASE.filter(c=>c.comercio_id===d.id);
  const nube=estado.cuponesFS.filter(c=>c.comercio_id===d.id&&c.estado!=='inactivo'&&(c.cupo_restante==null||c.cupo_restante>0));
  return [...base,...nube].filter(c=>{const v=aMs(c.vigencia);return !v||v>hoy;});
}
function abrirDetalle(id){
  const d=buscar(id);if(!d)return;
  const cat=CAT[d.cat]||CAT.comercio;
  const esFav=estado.favoritos.includes(String(d.id));
  const esDueno=logueado()&&d.propietario_uid&&d.propietario_uid===estado.usuario.uid;
  const cal=calificacionDe(d);const ap=estadoApertura(d);const km=distanciaA(d);
  const califs=estado.califs[d.id]||[];
  const premium=premiumVigente(d);
  const miCalif=logueado()?califs.find(c=>c.usuario_uid===estado.usuario.uid):null;
  const ruta=RUTAS[d.id];
  const cupones=cuponesDe(d);

  const opiniones=califs.length===0
    ?'<p class="nota-c">Sé el primero en calificar este lugar.</p>'
    :califs.map(c=>'<div class="opinion-item"><div class="op-header"><span class="op-user">'+esc(c.usuario_nombre||'Usuario')+'</span>'
      +'<span class="op-stars">'+Array.from({length:5},(_,i)=>`<svg viewBox="0 0 24 24" fill="${i<c.estrellas?'#DAB23F':'#ddd'}" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`).join('')+'</span></div>'
      +(c.comentario?'<p class="op-text">'+esc(c.comentario)+'</p>':'')
      +'<span class="op-fecha">'+fechaCorta(aMs(c.fecha))+(c.fueEditada?' · editada':'')+'</span></div>').join('');
  const formCalif=logueado()
    ?'<div id="ratingForm"><div class="star-selector" id="starSel">'+[1,2,3,4,5].map(n=>'<button data-n="'+n+'" aria-label="'+n+' estrellas"><svg viewBox="0 0 24 24" fill="#e0ddd4" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg></button>').join('')
      +'</div><textarea class="rating-comment" id="ratingTxt" maxlength="500" placeholder="Escribe tu opinión (opcional)...">'+esc(miCalif?miCalif.comentario:'')+'</textarea>'
      +'<button class="btn-calificar" id="bCalificar">⭐ '+(miCalif?'Actualizar mi calificación':'Enviar calificación')+'</button></div>'
    :'<button class="btn-secundario" id="bLoginCalif">Inicia sesión para calificar</button>';

  const redes=premium?Object.entries(d.redesSociales||{}).filter(([k,u])=>u&&/^https:\/\//.test(u)).slice(0,5):[];
  const bloquePremium=premium&&(redes.length||d.sitioWeb)
    ?'<div class="premium-box"><div class="pb-tit">★ Comercio destacado</div>'
      +(redes.length?'<div class="redes">'+redes.map(([k,u])=>'<a href="'+esc(u)+'" target="_blank" rel="noopener" class="red-btn">'+(RED_IC[k]||'🔗')+' '+(RED_TXT[k]||esc(k))+'</a>').join('')+'</div>':'')
      +(d.sitioWeb&&/^https:\/\//.test(d.sitioWeb)?'<a class="btn-web" href="'+esc(d.sitioWeb)+'" target="_blank" rel="noopener">'+IC.web+' Visitar sitio web <span class="ext">↗ sale de la app</span></a>':'')
      +'</div>':'';
  const bloqueCupones=cupones.length
    ?'<div class="cupones-box"><div class="pb-tit">'+IC.ticket+' Cupones disponibles</div>'
      +cupones.map(c=>'<div class="cupon-item"><div><b>'+esc(c.descripcion)+'</b><small>Vence: '+fechaCorta(aMs(c.vigencia))+(c.cupo_restante!=null?' · quedan '+c.cupo_restante:'')+'</small></div><button class="btn-cupon" data-cupon="'+esc(c.id)+'">Generar cupón</button></div>').join('')
      +'</div>':'';
  const turismoInfo=d.cat==='turismo'&&(d.tipo||d.nivelDificultad)
    ?'<div class="chips-tur">'+(d.tipo?'<span>🧭 '+esc(d.tipo)+'</span>':'')+(d.nivelDificultad?'<span>⛰️ Dificultad '+esc(d.nivelDificultad)+'</span>':'')+'<span>📍 '+esc(d.municipio||'Fusagasugá')+'</span>'
      +(ruta?'<span>📏 '+String(ruta.distanciaTotal).replace('.',',')+' km</span><span>⏱️ '+esc(ruta.duracionEstimada)+'</span>':'')+'</div>':'';
  const destinoMapa=(d.lat&&d.lng&&!d.ubicacion_aprox)?d.lat+','+d.lng:d.direccion+', Fusagasugá, Cundinamarca';
  const embed='https://maps.google.com/maps?q='+encodeURIComponent(destinoMapa)+'&z='+(d.ubicacion_aprox?14:16)+'&output=embed';
  const llegar='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destinoMapa);
  const mapaHTML=estado.online
    ?'<div class="mapa-wrap"><iframe src="'+embed+'" allowfullscreen loading="lazy" title="Mapa de '+esc(d.nombre)+'"></iframe></div>'
    :'<div class="mapa-off">🗺️ El mapa no está disponible sin conexión.<br><small>La dirección sigue disponible arriba.</small></div>';

  const html='<div class="grab"></div>'
    +'<button class="cerrar" id="cerrarDet" aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'
    +heroHTML(d,'det-hero')
    +'<span class="badge" style="background:'+cat.bg+';color:'+cat.fg+'">'+cat.label+'</span>'
    +(premium?'<span class="badge-dest det">★ Destacado</span>':'')
    +(es24h(d)?'<span class="badge-24h det">🕐 Abierto 24 horas</span>':'')
    +'<button class="det-fav'+(esFav?' on':'')+'" id="detFav" aria-label="Favorito">'+IC.heart+'</button></div>'
    +'<div class="det-body">'
    +'<h2>'+esc(d.nombre)+'</h2>'
    +'<div class="stars">'+estrellas(cal.prom,cal.total)+(ap?'<span class="chip-ap '+(ap.abierto?'si':'no')+'">'+ap.texto+'</span>':'')+'</div>'
    +turismoInfo
    +'<p class="desc">'+esc(d.desc)+'</p>'
    +'<div class="det-row">'+IC.pin+'<span><b>Dirección:</b> '+esc(d.direccion)+(km!=null?' · a '+fmtDist(km)+' de ti':'')+'</span></div>'
    +'<div class="det-row">'+IC.reloj+'<span><b>Horario:</b> '+esc(horarioTexto(d))+'</span></div>'
    +'<div class="det-row">'+IC.tel+'<span><b>Contacto:</b> '+esc(d.tel)+'</span></div>'
    +'<div class="det-acciones">'
    +'<a class="a-wa" href="#" id="detWa">'+IC.wa+' WhatsApp</a>'
    +'<a class="a-call" href="tel:'+esc(d.tel)+'">'+IC.tel+' Llamar</a>'
    +'<a class="a-share" href="#" id="detShare" aria-label="Compartir">'+IC.share+'</a>'
    +'</div>'
    +(ruta?'<button class="btn-ruta" id="detRuta">'+IC.ruta+' Iniciar navegación guiada</button>':'')
    +bloqueCupones+bloquePremium
    +'<div class="mapa-label">'+IC.map+' Ubicación'+(d.ubicacion_aprox?' aproximada del sector':'')+'</div>'
    +mapaHTML
    +'<a class="btn-llegar" href="'+llegar+'" target="_blank" rel="noopener">'+IC.map+' Cómo llegar</a>'
    +(esDueno?'<button class="btn-editar-det" id="btnEditar">'+IC.edit+' Editar mi comercio</button>':'')
    +'<div class="rating-section"><h3>Calificaciones ('+(califs.length?califs.length+' opiniones':'sin calificaciones')+')</h3>'
    +formCalif+'<div class="opinions-list">'+opiniones+'</div></div></div>';

  $('#sheetDetalle').innerHTML=html;
  $('#sheetDetalle').scrollTop=0;
  abrir('ovDetalle');
  $('#cerrarDet').onclick=()=>cerrar('ovDetalle');
  $('#detWa').onclick=e=>{e.preventDefault();abrirWhatsApp(d);};
  $('#detShare').onclick=e=>{e.preventDefault();compartir(d.nombre,'c/'+d.id);};
  $('#detFav').onclick=()=>{if(toggleFavorito(d.id))$('#detFav').classList.toggle('on',estado.favoritos.includes(String(d.id)));};
  if(ruta)$('#detRuta').onclick=()=>{cerrar('ovDetalle');navegar({tipo:'ruta',id:d.id});};
  $$('#sheetDetalle [data-cupon]').forEach(b=>b.onclick=()=>generarCupon(d,cupones.find(c=>c.id===b.dataset.cupon)));
  if(esDueno)$('#btnEditar').onclick=()=>{cerrar('ovDetalle');abrirFormComercio(d);};
  if(!logueado()){$('#bLoginCalif').onclick=()=>pedirLogin('Inicia sesión para calificar y comentar.');return;}
  let val=miCalif?miCalif.estrellas:0;
  const stars=$$('#starSel button');
  const pintar=n=>stars.forEach((s,i)=>s.querySelector('svg').setAttribute('fill',i<n?'#DAB23F':'#e0ddd4'));
  pintar(val);
  stars.forEach(s=>{
    s.onclick=()=>{val=+s.dataset.n;pintar(val);};
    s.onmouseenter=()=>pintar(+s.dataset.n);s.onmouseleave=()=>pintar(val);
  });
  $('#bCalificar').onclick=()=>enviarCalificacion(d,val,$('#ratingTxt').value.trim(),!!miCalif);
}

/* ===== CALIFICACIONES (RF-12): una por usuario, se actualiza si vuelve a calificar ===== */
async function enviarCalificacion(d,estrellasSel,comentario,editada){
  if(!estrellasSel){toast('Selecciona de 1 a 5 estrellas ⭐');return;}
  if(!estado.online){toast('Necesitas conexión a internet para calificar');return;}
  const uid=estado.usuario.uid;const btn=$('#bCalificar');btn.disabled=true;btn.textContent='Enviando...';
  try{
    await db.collection('calificaciones').doc(d.id+'_'+uid).set({
      comercio_id:String(d.id),usuario_uid:uid,usuario_nombre:estado.usuario.nombre,estrellas:estrellasSel,
      comentario:comentario.slice(0,500),fecha:FV.serverTimestamp(),fueEditada:editada,estado_moderacion:'publicado'
    });
    toast(editada?'Actualizamos tu calificación ⭐':'¡Gracias por tu calificación! ⭐');
    setTimeout(()=>abrirDetalle(d.id),400);
  }catch(e){console.error(e);toast('No se pudo guardar la calificación. Intenta de nuevo.');btn.disabled=false;btn.textContent='⭐ Enviar calificación';}
}

/* ===== CUPONES CON QR (RF-11) ===== */
function codigoCupon(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';const r=crypto.getRandomValues(new Uint8Array(8));r.forEach(n=>s+=a[n%a.length]);return 'FC-'+s.slice(0,4)+'-'+s.slice(4);}
function hoyClave(){const d=new Date();return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');}
function cuponesLocales(){return ls.get('fc_cupones_'+(estado.usuario?estado.usuario.uid:''),[]);}
function guardarCuponLocal(c){const l=cuponesLocales().filter(x=>x.id!==c.id);l.unshift(c);ls.set('fc_cupones_'+estado.usuario.uid,l.slice(0,30));}
async function generarCupon(d,cupon){
  if(!cupon)return;
  if(!logueado()){pedirLogin('Inicia sesión para generar cupones de descuento.');return;}
  const uid=estado.usuario.uid;const id=cupon.id+'_'+uid+'_'+hoyClave();
  const local=cuponesLocales().find(c=>c.id===id);
  if(local){mostrarCupon(local);return;}
  if(!estado.online){toast('Necesitas conexión para generar un cupón nuevo');return;}
  try{
    const mios=await db.collection('canjes').where('usuario_uid','==',uid).get();
    const previo=mios.docs.find(x=>x.id===id);
    if(previo){const c={id,...previo.data()};guardarCuponLocal(serializarCupon(c));mostrarCupon(serializarCupon(c));toast('Ya generaste este cupón hoy');return;}
    const finDia=new Date();finDia.setHours(23,59,59,0);
    const vence=Math.min(finDia.getTime()+6*86400000,aMs(cupon.vigencia)||Infinity);
    const datos={cupon_id:cupon.id,comercio_id:String(d.id),comercio_nombre:d.nombre,descripcion:cupon.descripcion,
      propietario_uid:d.propietario_uid||null,usuario_uid:uid,usuario_nombre:estado.usuario.nombre,codigo:codigoCupon(),
      estado:'activo',fecha_emision:FV.serverTimestamp(),fecha_vencimiento:TS.fromMillis(vence)};
    await db.collection('canjes').doc(id).set(datos);
    const c=serializarCupon({id,...datos,fecha_emision:Date.now()});
    guardarCuponLocal(c);mostrarCupon(c);
  }catch(e){console.error(e);toast('No se pudo generar el cupón. Intenta de nuevo.');}
}
function serializarCupon(c){return {id:c.id,codigo:c.codigo,descripcion:c.descripcion,comercio_nombre:c.comercio_nombre,estado:c.estado,fecha_vencimiento:aMs(c.fecha_vencimiento)};}
async function mostrarCupon(c){
  const usado=c.estado==='usado';const vencido=c.fecha_vencimiento&&c.fecha_vencimiento<Date.now();
  abrirHoja('<div class="cupon-ver"><div class="em">🎟️</div><h2>'+esc(c.comercio_nombre)+'</h2><p>'+esc(c.descripcion)+'</p>'
    +'<div class="qr-box'+(usado||vencido?' apagado':'')+'" id="qrBox"></div>'
    +'<div class="codigo">'+esc(c.codigo)+'</div>'
    +'<p class="cv-nota">'+(usado?'Este cupón ya fue canjeado.':vencido?'Este cupón está vencido.':'Presenta este código en el establecimiento. Vence el '+fechaCorta(c.fecha_vencimiento)+'. Disponible también sin conexión en tu Perfil.')+'</p></div>');
  try{
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
    new QRCode($('#qrBox'),{text:'FUSACONECTA:'+c.codigo,width:190,height:190,colorDark:'#163520',colorLight:'#ffffff'});
  }catch(e){$('#qrBox').innerHTML='<p class="cv-nota">Muestra el código alfanumérico.</p>';}
}

/* ===== HOJA GENÉRICA ===== */
function abrirHoja(html){
  $('#sheetGen').innerHTML='<div class="grab"></div><button class="cerrar" id="cerrarGen" aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'+html;
  $('#cerrarGen').onclick=()=>cerrar('ovGen');abrir('ovGen');
}

/* ===== MAPA GENERAL CON CLÚSTERES (RF-10, RNF-06) ===== */
function pedirUbicacion(){
  return new Promise(res=>{
    if(!navigator.geolocation){res(null);return;}
    navigator.geolocation.getCurrentPosition(p=>{estado.pos=[p.coords.latitude,p.coords.longitude];res(estado.pos);},()=>res(null),{enableHighAccuracy:true,timeout:8000,maximumAge:60000});
  });
}
async function renderMapa(){
  const cuerpo=$('#cuerpo');
  if(!estado.online){cuerpo.innerHTML='<div class="vista"><div class="mapa-off grande">🗺️ <b>Mapa no disponible sin conexión</b><br><small>El directorio, tus favoritos y las emergencias siguen funcionando.</small></div></div>';return;}
  cuerpo.innerHTML='<div class="vista-mapa"><div class="mapa-head"><h2>Mapa de Fusa</h2><span id="mapaInfo">Cargando mapa…</span></div><div id="mapaGeneral"></div></div>';
  try{await cargarLeaflet();}catch(e){$('#mapaInfo').textContent='No se pudo cargar el mapa.';return;}
  if(vistaActual().tipo!=='mapa'||!$('#mapaGeneral'))return;
  const m=L.map('mapaGeneral',{zoomControl:true}).setView(PLAZA_FUSA,14);mapaActivo=m;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(m);
  const grupo=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:50});
  const items=database.filter(d=>d.lat&&d.lng&&(d.cat!=='bares'||estado.mayorEdad));
  items.forEach(d=>{
    const icon=L.divIcon({className:'pin-fc',html:'<span style="background:'+(CAT[d.cat]||CAT.comercio).bg+'"><i>'+esc(d.emoji)+'</i></span>',iconSize:[34,34],iconAnchor:[17,34]});
    const mk=L.marker([d.lat,d.lng],{icon});
    mk.bindPopup('<b>'+esc(d.nombre)+'</b><br><small>'+esc(CAT[d.cat].label)+(d.ubicacion_aprox?' · ubicación aproximada':'')+'</small><br><button class="pop-ver" data-ver="'+esc(d.id)+'">Ver ficha</button>');
    grupo.addLayer(mk);
  });
  m.addLayer(grupo);
  m.on('popupopen',e=>{const b=e.popup.getElement().querySelector('[data-ver]');if(b)b.onclick=()=>abrirDetalle(b.dataset.ver);});
  $('#mapaInfo').textContent=items.length+' lugares · toca un grupo para acercarte';
  const pos=await pedirUbicacion();
  if(pos&&mapaActivo===m){
    L.circleMarker(pos,{radius:8,color:'#fff',weight:3,fillColor:'#1a73e8',fillOpacity:1}).addTo(m).bindPopup('Estás aquí');
    if(distanciaKm(pos,PLAZA_FUSA)<25)m.setView(pos,15);
  }else if(mapaActivo===m){$('#mapaInfo').textContent+=' · sin GPS: centrado en la plaza principal';}
  setTimeout(()=>m.invalidateSize(),200);
}

/* ===== NAVEGACIÓN GUIADA DE SENDEROS (RF-17) ===== */
function perfilSVG(r){
  const p=r.perfilElevacion,w=320,h=90,min=r.elevacionMinima-20,max=r.elevacionMaxima+20;
  const pts=p.map((e,i)=>(i/(p.length-1)*w).toFixed(1)+','+(h-(e-min)/(max-min)*h).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 '+w+' '+(h+4)+'" class="perfil-elev" preserveAspectRatio="none"><polygon points="0,'+h+' '+pts+' '+w+','+h+'" fill="rgba(166,193,162,.55)"/><polyline points="'+pts+'" fill="none" stroke="#204F2E" stroke-width="2.5"/></svg>';
}
async function renderRuta(id){
  const d=buscar(id),r=RUTAS[id];const cuerpo=$('#cuerpo');
  if(!d||!r){cuerpo.innerHTML='<div class="vacio"><b>Ruta no disponible</b></div>';return;}
  cuerpo.innerHTML='<div class="vista-ruta">'
    +'<div id="mapaRuta">'+(estado.online?'':'<div class="mapa-off grande">🗺️ Mapa base sin conexión. La ruta y tu progreso siguen disponibles.</div>')+'</div>'
    +'<div class="ruta-panel"><h2>'+esc(r.nombre)+'</h2>'
    +'<div class="ruta-stats"><div><b>'+String(r.distanciaTotal).replace('.',',')+' km</b><span>Distancia</span></div><div><b>'+esc(r.duracionEstimada)+'</b><span>Tiempo est.</span></div><div><b>'+(r.elevacionMaxima-r.elevacionMinima)+' m</b><span>Desnivel</span></div><div><b>'+esc(r.dificultad)+'</b><span>Dificultad</span></div></div>'
    +'<div class="elev-head"><span>Perfil de elevación</span><span>'+r.elevacionMinima+' – '+r.elevacionMaxima+' m s. n. m.</span></div>'+perfilSVG(r)
    +'<div class="ruta-prog" id="rutaProg">Pulsa «Iniciar» para seguir tu posición en tiempo real.</div>'
    +'<div class="ruta-btns"><button class="btn-calificar" id="rIniciar">▶ Iniciar ruta</button><button class="btn-secundario" id="rSimular">Simular recorrido</button></div>'
    +'<p class="ruta-nota">Trazado de referencia: verifica siempre la señalización del sendero. La ruta queda guardada en tu teléfono para consultarla sin conexión.</p>'
    +'<div class="poi-list">'+r.puntosInteres.map(p=>'<div class="poi"><b>📍 '+esc(p.nombre)+'</b><small>'+esc(p.descripcion)+'</small></div>').join('')+'</div>'
    +'</div></div>';
  let marcadorUsuario=null,m=null;
  if(estado.online){
    try{
      await cargarLeaflet();
      if(vistaActual().tipo!=='ruta'||!$('#mapaRuta'))return;
      m=L.map('mapaRuta');mapaActivo=m;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(m);
      const linea=L.polyline(r.rutaWaypoints,{color:'#BC487D',weight:5,opacity:.9}).addTo(m);
      r.rutaWaypoints.forEach((w,i)=>L.circleMarker(w,{radius:5,color:'#204F2E',fillColor:'#fff',fillOpacity:1,weight:2}).addTo(m).bindPopup('Punto '+(i+1)));
      r.puntosInteres.forEach(p=>L.marker(r.rutaWaypoints[p.wp],{icon:L.divIcon({className:'pin-fc',html:'<span style="background:#204F2E"><i>📍</i></span>',iconSize:[34,34],iconAnchor:[17,34]})}).addTo(m).bindPopup('<b>'+esc(p.nombre)+'</b><br><small>'+esc(p.descripcion)+'</small>'));
      L.marker(r.puntoLlegada,{icon:L.divIcon({className:'pin-fc',html:'<span style="background:#DAB23F"><i>🏁</i></span>',iconSize:[34,34],iconAnchor:[17,34]})}).addTo(m).bindPopup('Punto de llegada');
      m.fitBounds(linea.getBounds(),{padding:[24,24]});
      setTimeout(()=>m.invalidateSize(),200);
    }catch(e){}
  }
  const wps=r.rutaWaypoints;
  const restanteDesde=(pos,idx)=>{let s=distanciaKm(pos,wps[idx]);for(let i=idx;i<wps.length-1;i++)s+=distanciaKm(wps[i],wps[i+1]);return s;};
  let terminado=false;
  function actualizar(pos){
    if(terminado||vistaActual().tipo!=='ruta')return;
    if(m){if(!marcadorUsuario)marcadorUsuario=L.circleMarker(pos,{radius:9,color:'#fff',weight:3,fillColor:'#1a73e8',fillOpacity:1}).addTo(m);else marcadorUsuario.setLatLng(pos);}
    let cerca=0,best=Infinity;wps.forEach((w,i)=>{const k=distanciaKm(pos,w);if(k<best){best=k;cerca=i;}});
    const sig=Math.min(cerca+(best<0.03?1:0),wps.length-1);
    const fin=distanciaKm(pos,r.puntoLlegada);
    if(fin<0.04){terminado=true;limpiarSeguimiento();
      $('#rutaProg').innerHTML='🏁 <b>¡Llegaste!</b> Completaste '+esc(r.nombre)+'.';
      confirmar('¡Felicitaciones! 🎉','Completaste «'+r.nombre+'» ('+String(r.distanciaTotal).replace('.',',')+' km). ¿Quieres compartir tu logro?','Compartir','Ahora no','🏁').then(si=>{if(si)compartir('Completé '+r.nombre+' en Fusagasugá','c/'+id);});
      return;}
    $('#rutaProg').innerHTML='Siguiente punto: <b>'+fmtDist(distanciaKm(pos,wps[sig]))+'</b> · Falta para la meta: <b>'+fmtDist(restanteDesde(pos,sig))+'</b>';
  }
  function limpiarSeguimiento(){
    if(rutaWatch!=null){navigator.geolocation.clearWatch(rutaWatch);rutaWatch=null;}
    if(rutaSim){clearInterval(rutaSim);rutaSim=null;}
    $('#rIniciar').textContent='▶ Iniciar ruta';
  }
  $('#rIniciar').onclick=()=>{
    if(rutaWatch!=null||rutaSim){limpiarSeguimiento();$('#rutaProg').textContent='Seguimiento detenido.';return;}
    if(!navigator.geolocation){toast('Tu dispositivo no permite usar el GPS');return;}
    terminado=false;$('#rIniciar').textContent='■ Detener';$('#rutaProg').textContent='Buscando tu ubicación GPS…';
    rutaWatch=navigator.geolocation.watchPosition(p=>actualizar([p.coords.latitude,p.coords.longitude]),
      ()=>{limpiarSeguimiento();toast('Activa el GPS y permite el acceso a tu ubicación');},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  };
  $('#rSimular').onclick=()=>{
    limpiarSeguimiento();terminado=false;$('#rIniciar').textContent='■ Detener';
    const pts=[];for(let i=0;i<wps.length-1;i++)for(let k=0;k<6;k++){const f=k/6;pts.push([wps[i][0]+(wps[i+1][0]-wps[i][0])*f,wps[i][1]+(wps[i+1][1]-wps[i][1])*f]);}pts.push(r.puntoLlegada);
    let i=0;rutaSim=setInterval(()=>{if(i>=pts.length){limpiarSeguimiento();return;}actualizar(pts[i++]);if(m&&marcadorUsuario)m.panTo(marcadorUsuario.getLatLng());},700);
  };
}

/* ===== EMERGENCIAS SIN CONEXIÓN (RF-16, RNF-02, CU-14) ===== */
function renderSOS(){
  const cuerpo=$('#cuerpo');cuerpo.classList.add('tinta-sos');
  const mun=estado.sosMunicipio;const lista=EMERGENCIAS[mun];
  const sync=ls.get('fc_sos_sync',Date.now());
  ls.set('fc_sos_consulta',Date.now());
  const grupos={};lista.forEach(e=>(grupos[e.tipo]=grupos[e.tipo]||[]).push(e));
  cuerpo.innerHTML='<div class="vista">'
    +'<div class="sos-offline">✅ Disponible sin conexión · Actualizado: '+fechaCorta(sync)+'</div>'
    +'<div class="sos-tabs"><button data-mun="fusagasuga" class="'+(mun==='fusagasuga'?'on':'')+'">Fusagasugá</button><button data-mun="pasca" class="'+(mun==='pasca'?'on':'')+'">Pasca</button></div>'
    +(mun==='pasca'?'<p class="sos-nota">Líneas nacionales que operan en Pasca, Cundinamarca.</p>':'')
    +Object.entries(grupos).map(([tipo,l])=>'<h3 class="sos-grupo">'+esc(tipo)+'</h3>'+l.map(e=>
      '<div class="sos-card"><div class="ico">'+e.emoji+'</div><div class="info"><b>'+esc(e.entidad)+'</b><span>'+esc(e.detalle)+'</span><span class="sos-num">'+esc(e.numero)+'</span></div>'
      +'<button class="call" data-llamar="'+esc(e.numero)+'" data-ent="'+esc(e.entidad)+'">'+IC.tel+' Llamar</button></div>').join('')).join('')
    +'</div>'+footerHTML();
  $$('.sos-tabs button').forEach(b=>b.onclick=()=>{estado.sosMunicipio=b.dataset.mun;render();});
  $$('[data-llamar]').forEach(b=>b.onclick=()=>confirmarLlamada(b.dataset.ent,b.dataset.llamar));
  enlazarFooter();
}
function confirmarLlamada(entidad,numero){
  abrirHoja('<div class="llamar-ver"><div class="em">📞</div><h2>'+esc(entidad)+'</h2><div class="num-grande">'+esc(numero)+'</div>'
    +'<a class="btn-llamar-ya" href="tel:'+esc(numero)+'">'+IC.tel+' Llamar ahora</a>'
    +'<button class="btn-secundario" id="bCopiar">Copiar número</button>'
    +'<p class="cv-nota">🔒 Esta información está guardada en tu teléfono y no requiere internet.</p>'
    +'<div class="mapa-off atenuado">🗺️ Mapa desactivado en modo emergencia</div></div>');
  $('#bCopiar').onclick=async()=>{try{await navigator.clipboard.writeText(numero);toast('Número copiado');}catch(e){toast('Número: '+numero);}};
}

/* ===== PERFIL (RF-04, RNF-05) ===== */
function renderPerfil(){
  const cuerpo=$('#cuerpo');
  if(!logueado()){
    cuerpo.innerHTML='<div class="vista"><div class="perfil-card"><div class="pf-av">🌿</div><h2>Estás explorando como invitado</h2>'
      +'<p>Crea tu cuenta gratis para guardar favoritos, calificar comercios y generar cupones de descuento.</p>'
      +'<button class="btn-calificar" id="pfRegistro">Crear cuenta</button><button class="btn-secundario" id="pfIngresar">Ya tengo cuenta</button>'
      +'<button class="btn-secundario" id="pfProductor">🏪 Soy productor / comerciante</button></div>'
      +'<div class="perfil-seccion">'+(puedeInstalar()?'<button class="pf-item" id="pfInstalar">📲 Instalar la app en mi celular</button>':'')
      +'<button class="pf-item" id="pfLegal">📋 Aviso legal y privacidad (Ley 1581)</button></div></div>'+footerHTML();
    const pi=$('#pfInstalar');if(pi)pi.onclick=instalarApp;
    $('#pfRegistro').onclick=()=>abrirLogin('registro');$('#pfIngresar').onclick=()=>abrirLogin('ingresar');
    $('#pfProductor').onclick=()=>abrirLogin('registro',true);$('#pfLegal').onclick=()=>abrir('ovLegal');
    enlazarFooter();return;
  }
  const u=estado.usuario,p=estado.perfil||{};
  const cupones=cuponesLocales();
  const notifOn=p.notificaciones_push!==false;
  cuerpo.innerHTML='<div class="vista">'
    +'<div class="perfil-card"><div class="pf-av">'+esc(u.nombre.charAt(0).toUpperCase())+'</div><h2>'+esc(u.nombre)+'</h2><p>'+esc(u.email)+'</p>'
    +'<span class="pf-rol">'+(p.rol==='comerciante'?'🏪 Productor / comerciante':p.rol==='admin'?'🛡️ Administrador':'🌿 Vecino / turista')+'</span>'
    +(u.verificado||u.proveedor==='google.com'?'':'<div class="pf-alerta">📧 Verifica tu correo para proteger tu cuenta. <button id="pfReenviar">Reenviar correo</button></div>')+'</div>'
    +(esComerciante()?'<button class="btn-dash-nuevo" id="pfPanel">🏪 Mi panel, mi negocio</button>':'<button class="btn-secundario" id="pfSerComerciante">🏪 Registrar mi negocio</button>')
    +'<div class="perfil-seccion"><h3>'+IC.ticket+' Mis cupones</h3>'
    +(cupones.length?cupones.map(c=>'<button class="pf-cupon" data-mic="'+esc(c.id)+'"><b>'+esc(c.comercio_nombre)+'</b><small>'+esc(c.descripcion)+' · '+esc(c.codigo)+'</small><span class="'+(c.estado==='usado'?'usado':'')+'">'+(c.estado==='usado'?'Canjeado':'Ver QR')+'</span></button>').join(''):'<p class="nota-c">Aún no has generado cupones. Búscalos en los comercios destacados.</p>')
    +'</div>'
    +'<div class="perfil-seccion"><h3>🔔 Notificaciones</h3><label class="switch-row"><span>Recibir promociones de comercios destacados</span><input type="checkbox" id="pfNotif" '+(notifOn?'checked':'')+'></label></div>'
    +'<div class="perfil-seccion"><h3>🛡️ Privacidad (Ley 1581 de 2012)</h3>'
    +'<p class="nota-c izq">Autorizaste el tratamiento de tus datos el '+fechaCorta(aMs(p.fecha_consentimiento))+'.</p>'
    +'<button class="pf-item" id="pfLegal">📋 Ver aviso legal y privacidad</button>'
    +'<button class="pf-item peligro" id="pfEliminar">🗑️ Eliminar mi cuenta y mis datos</button></div>'
    +(puedeInstalar()?'<button class="btn-dash-nuevo" id="pfInstalar">📲 Instalar la app en mi celular</button>':'')
    +'<button class="btn-secundario" id="pfSalir">Cerrar sesión</button>'
    +'</div>'+footerHTML();
  const r=$('#pfReenviar');if(r)r.onclick=()=>auth.currentUser.sendEmailVerification().then(()=>toast('Te enviamos el correo de verificación 📧')).catch(()=>toast('Intenta de nuevo en unos minutos'));
  const pn=$('#pfPanel');if(pn)pn.onclick=()=>navegar({tipo:'dashboard'});
  const sc=$('#pfSerComerciante');if(sc)sc.onclick=async()=>{
    if(!await confirmar('Registrar mi negocio','Tu cuenta pasará a ser de productor y podrás publicar tus comercios.','Continuar','Cancelar','🏪'))return;
    try{await db.collection('usuarios').doc(u.uid).update({rol:'comerciante'});estado.perfil.rol='comerciante';ls.set('fc_perfil_'+u.uid,estado.perfil);navegar({tipo:'dashboard'});}
    catch(e){toast('No se pudo actualizar tu cuenta. Revisa tu conexión.');}
  };
  $$('[data-mic]').forEach(b=>b.onclick=()=>mostrarCupon(cupones.find(c=>c.id===b.dataset.mic)));
  $('#pfNotif').onchange=async e=>{
    const on=e.target.checked;
    if(on&&'Notification'in window&&Notification.permission==='default'){try{await Notification.requestPermission();}catch(_){}}
    db.collection('usuarios').doc(u.uid).update({notificaciones_push:on}).catch(()=>{});
    estado.perfil.notificaciones_push=on;ls.set('fc_perfil_'+u.uid,estado.perfil);
    toast(on?'Recibirás promociones 🔔':'Notificaciones desactivadas');
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
function misComercios(){return logueado()?database.filter(d=>d.propietario_uid===estado.usuario.uid):[];}
function renderDashboard(){
  const cuerpo=$('#cuerpo');
  if(!esComerciante()){cuerpo.innerHTML='<div class="vacio"><div class="em">🏪</div><b>Panel de productores</b><p>Inicia sesión con tu cuenta de productor.</p></div>';return;}
  const nom=estado.usuario.nombre;const mis=misComercios();
  const proms=mis.map(d=>calificacionDe(d)).filter(c=>c.total);
  const promedio=proms.length?(proms.reduce((a,c)=>a+c.prom,0)/proms.length).toFixed(1):'—';
  const cards=mis.length===0
    ?'<div class="vacio"><div class="em">🏪</div><b>Aún no tienes comercios registrados</b><p>Toca «Registrar nuevo comercio» para publicar tu primer negocio.</p></div>'
    :mis.map(d=>{
      const cat=CAT[d.cat]||CAT.comercio;const prem=premiumVigente(d);const img=imgSegura(d.imagen);
      return '<div class="dash-card"><div class="dc-ico" style="background:'+cat.hero+'">'+(img?'<img src="'+esc(img)+'" alt="">':esc(d.emoji))+'</div>'
        +'<div class="dc-info"><h3>'+esc(d.nombre)+'</h3><p>'+cat.label+' · '+esc(d.direccion)+'</p>'
        +'<div class="stars" style="margin-top:4px">'+estrellas(calificacionDe(d).prom,calificacionDe(d).total)+'</div>'
        +'<p class="dc-plan '+(prem?'prem':'')+'">'+(prem?'★ Premium hasta '+fechaCorta(d.suscripcion_vigente_hasta):'Plan Gratis')+'</p>'
        +'<div class="dc-actions"><button class="btn-dc-edit" data-eid="'+esc(d.id)+'">'+IC.edit+' Editar</button>'
        +'<button class="btn-dc-edit alt" data-ver="'+esc(d.id)+'">Ver ficha</button>'
        +(prem?'<button class="btn-dc-edit alt" data-cup="'+esc(d.id)+'">🎟️ Cupón</button><button class="btn-dc-edit alt" data-promo="'+esc(d.id)+'">🔔 Promoción</button>'
          :'<button class="btn-dc-edit gold" data-prem="'+esc(d.id)+'">★ Activar Premium</button>')
        +'</div></div></div>';
    }).join('');
  cuerpo.innerHTML='<div class="dash-hero"><h2>🏪 Mi panel, mi negocio</h2><p>Hola, '+esc(nom)+'. Gestiona tus comercios en Fusa Conecta.</p>'
    +'<div class="dash-stats"><div class="dash-stat"><div class="ds-n">'+mis.length+'</div><div class="ds-l">Publicados</div></div>'
    +'<div class="dash-stat"><div class="ds-n">'+promedio+'</div><div class="ds-l">Rating prom.</div></div>'
    +'<div class="dash-stat"><div class="ds-n" id="dsCanjes">…</div><div class="ds-l">Cupones canjeados</div></div></div></div>'
    +'<div class="dash-body"><button class="btn-dash-nuevo" id="bDashNuevo">➕ Registrar nuevo comercio</button>'
    +'<p class="dash-section">Mis negocios</p><div id="dashGrid">'+cards+'</div>'
    +'<div class="validar-box"><p class="dash-section">Validar cupón de un cliente</p><div class="validar-row"><input id="vCodigo" placeholder="FC-XXXX-XXXX" maxlength="12" autocapitalize="characters"><button id="vValidar">Validar</button></div><p class="nota-c izq" id="vRes"></p></div>'
    +'<button class="btn-explorar-dash" id="bExplorar">🔍 Ver directorio completo</button></div>';
  $('#bDashNuevo').onclick=()=>abrirFormComercio(null);
  $('#bExplorar').onclick=()=>inicio();
  $$('#dashGrid [data-eid]').forEach(b=>b.onclick=()=>abrirFormComercio(buscar(b.dataset.eid)));
  $$('#dashGrid [data-ver]').forEach(b=>b.onclick=()=>abrirDetalle(b.dataset.ver));
  $$('#dashGrid [data-prem]').forEach(b=>b.onclick=()=>activarPremium(buscar(b.dataset.prem)));
  $$('#dashGrid [data-cup]').forEach(b=>b.onclick=()=>formCupon(buscar(b.dataset.cup)));
  $$('#dashGrid [data-promo]').forEach(b=>b.onclick=()=>formPromo(buscar(b.dataset.promo)));
  $('#vValidar').onclick=validarCupon;
  $('#vCodigo').addEventListener('keydown',e=>{if(e.key==='Enter')validarCupon();});
  db.collection('canjes').where('propietario_uid','==',estado.usuario.uid).get()
    .then(s=>{const el=$('#dsCanjes');if(el)el.textContent=s.docs.filter(x=>x.data().estado==='usado').length;})
    .catch(()=>{const el=$('#dsCanjes');if(el)el.textContent='—';});
}
async function activarPremium(d){
  if(!d)return;
  if(!await confirmar('Plan Premium','Activa 30 días de prueba: posición destacada en búsquedas, cupones QR, promociones, redes sociales y sitio web.','Activar','Cancelar','★'))return;
  try{
    await db.collection('comercios').doc(d.id).update({esPremium:true,prioridadBusqueda:1,plan:'premium',
      suscripcion_vigente_hasta:TS.fromMillis(Date.now()+30*86400000),fecha_modificacion:FV.serverTimestamp()});
    toast('¡Plan Premium activado por 30 días! ★');
  }catch(e){console.error(e);toast('No se pudo activar. Revisa tu conexión.');}
}
async function validarCupon(){
  const cod=$('#vCodigo').value.trim().toUpperCase();const res=$('#vRes');
  if(!/^FC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cod)){res.textContent='Escribe el código completo, por ejemplo FC-AB12-CD34.';return;}
  res.textContent='Validando…';
  try{
    const s=await db.collection('canjes').where('propietario_uid','==',estado.usuario.uid).where('codigo','==',cod).get();
    if(s.empty){res.textContent='❌ Código no encontrado en tus comercios.';return;}
    const doc=s.docs[0],c=doc.data();
    if(c.estado==='usado'){res.textContent='⚠️ Este cupón ya fue canjeado.';return;}
    if(aMs(c.fecha_vencimiento)<Date.now()){res.textContent='⚠️ Este cupón está vencido.';return;}
    await doc.ref.update({estado:'usado',fecha_canje:FV.serverTimestamp()});
    const cup=estado.cuponesFS.find(x=>x.id===c.cupon_id);
    if(cup&&cup.cupo_restante>0)db.collection('cupones').doc(cup.id).update({cupo_restante:FV.increment(-1)}).catch(()=>{});
    res.textContent='✅ Cupón válido y canjeado: '+c.descripcion+' · Cliente: '+c.usuario_nombre;
    $('#vCodigo').value='';
  }catch(e){console.error(e);res.textContent='No se pudo validar. Revisa tu conexión.';}
}
function formCupon(d){
  abrirHoja('<div class="form-head"><div class="form-intro"><h2>Publicar cupón</h2><p>'+esc(d.nombre)+'</p></div></div><div class="form-body">'
    +'<div class="campo"><label>Descripción del descuento <span class="req">*</span></label><input id="cDesc" maxlength="80" placeholder="Ej: 10% en tu primera compra"></div>'
    +'<div class="campo"><label>Porcentaje de descuento</label><input id="cPct" type="number" min="1" max="100" value="10"></div>'
    +'<div class="campo"><label>Cupos disponibles</label><input id="cCupo" type="number" min="1" max="10000" value="50"></div>'
    +'<div class="campo"><label>Válido hasta <span class="req">*</span></label><input id="cVig" type="date"></div>'
    +'<div class="campo"><label>Términos y condiciones</label><input id="cTer" maxlength="140" placeholder="Ej: Un cupón por persona al día"></div>'
    +'<button class="btn-publicar" id="cGuardar">Publicar cupón</button></div>');
  const m=new Date(Date.now()+30*86400000);$('#cVig').value=m.toISOString().slice(0,10);
  $('#cGuardar').onclick=async()=>{
    const desc=$('#cDesc').value.trim(),vig=$('#cVig').value,cupo=Math.max(1,parseInt($('#cCupo').value,10)||1);
    if(!desc){toast('Describe el descuento');return;}
    if(!vig||Date.parse(vig)<Date.now()-86400000){toast('Elige una fecha de vigencia futura');return;}
    try{
      await db.collection('cupones').add({comercio_id:d.id,comercio_nombre:d.nombre,descripcion:desc,porcentajeDescuento:Math.min(100,Math.max(1,parseInt($('#cPct').value,10)||10)),
        cupo_total:cupo,cupo_restante:cupo,vigencia:vig,terminos:$('#cTer').value.trim(),estado:'activo',fecha_creacion:FV.serverTimestamp()});
      cerrar('ovGen');toast('Cupón publicado 🎟️');
    }catch(e){console.error(e);toast('No se pudo publicar el cupón');}
  };
}
function formPromo(d){
  abrirHoja('<div class="form-head"><div class="form-intro"><h2>Enviar promoción</h2><p>'+esc(d.nombre)+' · máximo 3 por semana</p></div></div><div class="form-body">'
    +'<div class="campo"><label>Título <span class="req">*</span></label><input id="pTit" maxlength="50" placeholder="Ej: ¡Hoy 2x1 en postres!"></div>'
    +'<div class="campo"><label>Mensaje <span class="req">*</span></label><textarea id="pMsg" maxlength="280" placeholder="Cuéntales a los vecinos tu promoción..."></textarea></div>'
    +'<div class="campo"><label>¿A quién se envía?</label><select id="pSeg"><option value="todos">Todos los usuarios</option><option value="favoritos">Usuarios que me tienen en favoritos</option></select></div>'
    +'<button class="btn-publicar" id="pEnviar">Enviar promoción</button></div>');
  $('#pEnviar').onclick=async()=>{
    const t=$('#pTit').value.trim(),msg=$('#pMsg').value.trim();
    if(!t||!msg){toast('Escribe el título y el mensaje');return;}
    try{
      const s=await db.collection('notificaciones').where('comercio_id','==',d.id).get();
      const semana=s.docs.filter(x=>(aMs(x.data().fecha_envio)||0)>Date.now()-7*86400000).length;
      if(semana>=3){toast('Ya enviaste 3 promociones esta semana');return;}
      await db.collection('notificaciones').add({comercio_id:d.id,comercio_nombre:d.nombre,titulo:t,mensaje:msg,segmento:$('#pSeg').value,fecha_envio:FV.serverTimestamp(),estado:'enviada'});
      cerrar('ovGen');toast('Promoción enviada 🔔 ('+(semana+1)+'/3 esta semana)');
    }catch(e){console.error(e);toast('No se pudo enviar la promoción');}
  };
}

/* ===== FORMULARIO: PUBLICAR / EDITAR COMERCIO ===== */
let editandoId=null,ubicacionForm=null;
function abrirFormComercio(d){
  if(!esComerciante()){pedirLogin('Ingresa con tu cuenta de productor para publicar comercios.',true);return;}
  editandoId=d?d.id:null;ubicacionForm=d&&d.lat?[d.lat,d.lng]:null;
  $('#fNombre').value=d?d.nombre:'';$('#fCat').value=d?d.cat:'';$('#fDesc').value=d?d.desc:'';
  $('#fDir').value=d?d.direccion:'';$('#fTel').value=d?d.tel:'';$('#fFoto').value='';
  $('#fAbre').value=d&&d.abre?d.abre:'08:00';$('#fCierra').value=d&&d.cierra?d.cierra:'18:00';
  const dias=d&&d.dias?d.dias:[1,2,3,4,5,6];
  $$('#fDias input').forEach(i=>i.checked=dias.includes(+i.value));
  $('#fUbicTxt').textContent=ubicacionForm?'Ubicación guardada ✔':'Sin ubicación exacta (se usará la dirección)';
  const prem=d&&premiumVigente(d);
  $('#fPremium').style.display=prem?'block':'none';
  ['instagram','facebook','tiktok','youtube','x'].forEach(k=>{$('#fRed_'+k).value=d&&d.redesSociales&&d.redesSociales[k]||'';});
  $('#fWeb').value=d?d.sitioWeb||'':'';
  $('#formIntro h2').textContent=d?'Editar comercio':'Suma tu comercio';
  $('#formIntro p').textContent=d?'Actualiza la información de tu negocio.':'Publica tu negocio, finca, ruta o servicio en Fusa Conecta.';
  $('#bPublicar').innerHTML=d?'Guardar cambios':'Publicar';
  abrir('ovForm');
}
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
  const btn=$('#bPublicar'),txt=btn.innerHTML;btn.innerHTML='⏳ Guardando...';btn.disabled=true;
  try{
    const img=await comprimirImagen($('#fFoto').files[0]);
    const datos={cat,categoria:cat,emoji:CAT[cat].emoji,nombre,desc:$('#fDesc').value.trim()||'Negocio local de Fusagasugá.',
      direccion:$('#fDir').value.trim()||'Fusagasugá',tel,whatsapp:esCelular(tel)?tel:'',dias,abre,cierra,
      horario:dias.length?dias.slice().sort().map(i=>DIAS_TXT[i]).join(', ')+' · '+abre+' – '+cierra:'Consultar directamente',
      propietario_uid:estado.usuario.uid,propietario:estado.usuario.nombre,municipio:'Fusagasugá',fecha_modificacion:FV.serverTimestamp()};
    if(ubicacionForm){datos.lat=ubicacionForm[0];datos.lng=ubicacionForm[1];datos.ubicacion_aprox=false;}
    if(img)datos.imagen=img;
    if($('#fPremium').style.display!=='none'){datos.redesSociales=redes;datos.sitioWeb=$('#fWeb').value.trim();}
    if(editandoId){await db.collection('comercios').doc(editandoId).update(datos);toast('"'+nombre+'" actualizado ✅');}
    else{
      if(!ubicacionForm){datos.lat=PLAZA_FUSA[0];datos.lng=PLAZA_FUSA[1];datos.ubicacion_aprox=true;}
      Object.assign(datos,{rating:0,esPremium:false,prioridadBusqueda:0,redesSociales:{},sitioWeb:'',imagen:img||'',fechaCreacion:FV.serverTimestamp()});
      await db.collection('comercios').add(datos);toast('"'+nombre+'" publicado en Fusa Conecta 🌿');
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
  $('#loginAviso').textContent=aviso;$('#loginAviso').style.display=aviso?'block':'none';
  pintarModoLogin();abrir('ovLogin');
}
function pedirLogin(msg,productor=false){abrirLogin('ingresar',productor,'🔒 '+msg);}
function pintarModoLogin(){
  const reg=modoLogin==='registro';
  $$('.login-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.modo===modoLogin));
  $('#lNombre').style.display=reg?'block':'none';
  $('#lConsentWrap').style.display=reg?'flex':'none';
  $('#lOlvido').style.display=reg?'none':'block';
  $('#lMail').textContent=reg?'Crear mi cuenta':'Ingresar';
  $('#clave').setAttribute('autocomplete',reg?'new-password':'current-password');
  $('#loginTitulo').textContent=$('#lComerciante').checked?'Cuenta de productor':(reg?'Crea tu cuenta':'Ingresa a Fusa Conecta');
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
      toast('¡Bienvenida/o, '+nombre.split(' ')[0]+'! Te enviamos un correo de verificación 📧');
    }else{
      registroPendiente={consent:false,rol};
      const cred=await auth.signInWithEmailAndPassword(email,clave);
      await procesarUsuario(cred.user);
      toast('Bienvenida/o de nuevo 🌸');
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
  try{await auth.sendPasswordResetEmail(email);toast('Te enviamos un correo para restablecer tu contraseña 📧');}
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
  escucharPromociones();sincronizarCupones();
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
  if(!await confirmar('Cerrar sesión','¿Quieres salir de tu cuenta?','Salir','Cancelar','👋'))return;
  await auth.signOut();
  estado.usuario=null;estado.perfil=null;estado.favoritos=[];
  stack.length=0;$('#splash').classList.remove('oculto');
  inicio();toast('Hasta pronto 👋');
}
// Derecho de supresión (Ley 1581): borra datos personales y anonimiza las calificaciones
async function eliminarCuenta(){
  if(!await confirmar('Eliminar mi cuenta','Se borrarán tu perfil, favoritos y cupones. Tus calificaciones quedarán anónimas. Esta acción no se puede deshacer.','Eliminar','Cancelar','🗑️'))return;
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
  if(!user){estado.usuario=null;estado.perfil=null;estado.favoritos=[];refrescarTodo();return;}
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
  b.innerHTML='<b>🔔 '+esc(n.comercio_nombre)+': '+esc(n.titulo)+'</b><span>'+esc(n.mensaje)+'</span>';
  b.onclick=()=>{b.classList.remove('ver');abrirDetalle(n.comercio_id);};
  b.classList.add('ver');setTimeout(()=>b.classList.remove('ver'),9000);
  if('Notification'in window&&Notification.permission==='granted'&&navigator.serviceWorker){
    navigator.serviceWorker.ready.then(r=>r.showNotification(n.comercio_nombre+': '+n.titulo,{body:n.mensaje,icon:'icono-app.png',tag:'promo'})).catch(()=>{});
  }
}

/* ===== FOOTER ===== */
function footerHTML(){
  return '<footer class="footer">'
    +'<img src="'+LOGO_SRC+'" alt="Fusa Conecta" class="f-logo">'
    +'<p>El directorio digital de Fusagasugá, la Ciudad Jardín del Sumapaz.</p>'
    +'<div class="f-links"><button id="fApoyo">💚 Apoyar el proyecto</button><button id="fLegal">📋 Aviso legal</button></div>'
    +'<p class="f-copy">© 2026 Fusa Conecta<br>Hecho con amor en Fusagasugá <span style="color:var(--sage)">♥</span></p></footer>';
}
function enlazarFooter(){
  const fa=$('#fApoyo');if(fa)fa.onclick=()=>abrir('ovApoyo');
  const fl=$('#fLegal');if(fl)fl.onclick=()=>abrir('ovLegal');
}

/* ===== BOTTOM NAV (RF-04) ===== */
function renderBottomNav(){
  const v=vistaActual();
  $$('.bn-btn').forEach(b=>{
    const bn=b.dataset.bn;
    const activo=(bn==='inicio'&&v.tipo==='lista'&&v.cat!=='favoritos')||(bn==='favoritos'&&v.cat==='favoritos')
      ||(bn==='sos'&&v.tipo==='sos')||(bn==='mapa'&&(v.tipo==='mapa'||v.tipo==='ruta'))||(bn==='perfil'&&(v.tipo==='perfil'||v.tipo==='dashboard'));
    b.classList.toggle('bn-active',activo);
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
$$('.overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov&&ov.id!=='ovConsent'&&ov.id!=='ovConfirm')ov.classList.remove('abierto');}));
$$('[data-cerrar]').forEach(b=>{b.onclick=()=>cerrar(b.dataset.cerrar);});
function ocultarSplash(){$('#splash').classList.add('oculto');}
$('#sInvitado').onclick=()=>{
  ocultarSplash();render();toast('Explorando Fusa Conecta 🌿');
  if(!auth.currentUser)auth.signInAnonymously().catch(()=>{});
};
$('#sRegistrar').onclick=()=>abrirLogin('registro');
$$('.login-tabs button').forEach(b=>b.onclick=()=>{modoLogin=b.dataset.modo;pintarModoLogin();});
$('#formLogin').addEventListener('submit',enviarLogin);
$('#lGoogle').onclick=ingresarGoogle;
$('#lOlvido').onclick=olvideClave;
$('#lComerciante').onchange=pintarModoLogin;
$('#lProductor').onclick=()=>{$('#lComerciante').checked=true;pintarModoLogin();toast('Ingresa o crea tu cuenta de productor');$('#mail').focus();};
$('#lVerLegal').onclick=()=>abrir('ovLegal');
$('#cVerLegal').onclick=()=>abrir('ovLegal');
$('#edadSi').onclick=()=>{estado.mayorEdad=true;cerrar('ovEdad');navegar({tipo:'lista',cat:'bares'});};
$('#edadNo').onclick=()=>{cerrar('ovEdad');toast('Solo para mayores de 18 años.');};
$('#bPublicar').onclick=publicarComercio;
$('#fUbicar').onclick=async()=>{
  $('#fUbicTxt').textContent='Obteniendo ubicación…';
  const p=await pedirUbicacion();
  if(p){ubicacionForm=p;$('#fUbicTxt').textContent='Ubicación guardada ✔ ('+p[0].toFixed(5)+', '+p[1].toFixed(5)+')';}
  else $('#fUbicTxt').textContent='No pudimos obtener tu ubicación. Activa el GPS.';
};
$$('.monto').forEach(b=>b.onclick=()=>{$$('.monto').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');});
$('#bEnviarApoyo').onclick=()=>{const sel=$('.monto.sel');if(!sel){toast('Selecciona un monto');return;}cerrar('ovApoyo');toast('¡Gracias por apoyar! 💚 Monto: '+sel.dataset.m);};
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
window.addEventListener('online',()=>{actualizarConexion();toast('Conexión restablecida ✅');render(true);});
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
window.addEventListener('appinstalled',()=>{avisoInstalar=null;ocultarBannerInstalar();toast('¡Fusa Conecta quedó instalada en tu celular! 📲');});
async function instalarApp(){
  ocultarBannerInstalar();
  if(avisoInstalar){
    avisoInstalar.prompt();
    const r=await avisoInstalar.userChoice.catch(()=>null);
    avisoInstalar=null;
    if(r&&r.outcome==='accepted')return;
    return;
  }
  const pasos=esIOS
    ?'<li>Abre esta página en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> <span class="ico-paso">⬆️</span> en la barra inferior.</li><li>Elige <b>«Agregar a inicio»</b> y luego <b>«Agregar»</b>.</li>'
    :'<li>Abre esta página en <b>Google Chrome</b>.</li><li>Toca el menú <b>⋮</b> (arriba a la derecha).</li><li>Elige <b>«Instalar aplicación»</b> o <b>«Agregar a la pantalla principal»</b> y confirma con <b>«Instalar»</b>.</li>';
  abrirHoja('<div class="instalar-ver"><img src="img/icons/icon-192.png" alt="Fusa Conecta" class="inst-ic"><h2>Instala Fusa Conecta</h2>'
    +'<p>Quedará en tu pantalla de inicio con su propio ícono y se abrirá como una app, sin la barra del navegador.</p>'
    +'<ol class="inst-pasos">'+pasos+'</ol><p class="cv-nota">Funciona sin internet para emergencias, favoritos y cupones guardados.</p></div>');
}
function mostrarBannerInstalar(){
  if(appInstalada()||!puedeInstalar())return;
  if(Date.now()-ls.get('fc_instalar_cerrado',0)<3*86400000)return;
  if(!$('#splash').classList.contains('oculto'))return;
  let b=$('#bannerInstalar');
  if(!b){
    b=document.createElement('div');b.id='bannerInstalar';b.className='banner-instalar';
    b.innerHTML='<img src="img/icons/icon-192.png" alt=""><div><b>Instala Fusa Conecta</b><span>Úsala como app, sin navegador</span></div><button class="bi-si">Instalar</button><button class="bi-no" aria-label="Cerrar">✕</button>';
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
