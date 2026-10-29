// Datos de prueba de extremo a extremo en el EMULADOR de Firebase (nunca en producción).
// Playwright lo corre antes de las pruebas (globalSetup). Borra el emulador y crea:
// - Rosa (comerciante) dueña del «Vivero de Prueba E2E» con Premium y un cupón activo.
// - Ana (usuaria) que obtiene el cupón.
const PROYECTO = 'fusa-conecta'; // el que usa la PWA; el emulador nunca habla con el proyecto real
const FS = `http://127.0.0.1:8099/v1/projects/${PROYECTO}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099';
export const CLAVE = 'PruebaE2E2026';
export const CUENTAS = { rosa: 'rosa.e2e@fusa.test', ana: 'ana.e2e@fusa.test' };
export const NEGOCIO = { id: 'e2e-vivero', nombre: 'Vivero de Prueba E2E' };
export const CUPON = { id: 'e2e-cupon', descripcion: '2x1 en orquídeas (prueba E2E)' };

function valor(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  if (typeof v === 'object')
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } };
  return { stringValue: String(v) };
}

export async function poner(ruta, datos) {
  const r = await fetch(`${FS}/${ruta}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, valor(v)])) }),
  });
  if (!r.ok) throw new Error(`No se pudo escribir ${ruta}: ${r.status} ${await r.text()}`);
}

async function crearCuenta(email, nombre) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: CLAVE, displayName: nombre, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.localId) throw new Error(JSON.stringify(j));
  return j.localId;
}

export default async function sembrar() {
  // Emulador limpio en cada corrida
  await fetch(`http://127.0.0.1:8099/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await fetch(`${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
  const rosa = await crearCuenta(CUENTAS.rosa, 'Rosa Pérez');
  const ana = await crearCuenta(CUENTAS.ana, 'Ana María Gómez');
  const ahora = new Date();
  const enDias = d => new Date(Date.now() + d * 864e5);
  const perfil = (nombre, correo, rol) => ({
    nombre,
    correo,
    rol,
    consentimiento_ley1581: true,
    fecha_consentimiento: ahora,
    fecha_registro: ahora,
    favoritos: [],
    notificaciones_push: false,
  });
  await poner(`usuarios/${rosa}`, perfil('Rosa Pérez', CUENTAS.rosa, 'usuario'));
  await poner(`usuarios/${ana}`, perfil('Ana María Gómez', CUENTAS.ana, 'usuario'));
  await poner(`comercios/${NEGOCIO.id}`, {
    nombre: NEGOCIO.nombre,
    cat: 'campo',
    categoria: 'campo',
    desc: 'Orquídeas y plantas nativas. Negocio de prueba.',
    direccion: 'Cra 6 # 8-15, Centro',
    tel: '3001234567',
    whatsapp: '3001234567',
    lat: 4.3401,
    lng: -74.364,
    ubicacion_aprox: false,
    municipio: 'Fusagasugá',
    propietario_uid: rosa,
    estado_publicacion: 'aprobado',
    esPremium: true,
    plan: 'premium',
    prioridadBusqueda: 1,
    prueba_usada: true,
    suscripcion_vigente_hasta: enDias(30),
    dias: [0, 1, 2, 3, 4, 5, 6],
    abre: '00:00',
    cierra: '23:59',
    imagen: '',
    fotos: [],
    fechaCreacion: ahora,
    fecha_aprobacion: ahora,
  });
  await poner(`cupones/${CUPON.id}`, {
    comercio_id: NEGOCIO.id,
    propietario_uid: rosa,
    comercio_nombre: NEGOCIO.nombre,
    descripcion: CUPON.descripcion,
    tipo: '2x1',
    porcentajeDescuento: null,
    cupo_total: 10,
    cupo_restante: 10,
    vigencia: enDias(30).toISOString().slice(0, 10),
    dias: [],
    terminos: '',
    estado: 'activo',
    fecha_creacion: ahora,
  });
  return async () => {};
}
