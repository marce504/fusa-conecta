// Pruebas unitarias del código real de la PWA (app.js y datos.js), cargado con cargar-app.js.
// La zona horaria es America/Bogota (vitest.config.js): la app calcula los horarios con la hora local del teléfono.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cargar } from './cargar-app.js';

const enColombia = texto => vi.setSystemTime(new Date(`${texto}:00-05:00`));
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------- estado abierto / cerrado (estadoLugar)
const horarios = cargar([
  'norm',
  'DIA_IDX',
  'DIAS_TXT',
  'DIAS_LARGO',
  'parsearDias',
  'parsearRangos',
  'horaTexto',
  'TIPOS_NATURALES',
  'esNatural',
  'estadoApertura',
]);
const estado = (lugar, cuando) => {
  vi.useFakeTimers();
  enColombia(cuando);
  return horarios.estadoApertura({ cat: 'comercio', ...lugar });
};

describe('estadoApertura: abierto, cierra pronto, cerrado y próxima apertura', () => {
  // 2026-10-28 es miércoles; 2026-11-01 es domingo
  it.each([
    ['Lun-Sáb 8:00-18:00', '2026-10-28T10:00', 'ab', 'Abierto'],
    ['Lun-Sáb 8:00-18:00', '2026-10-28T17:30', 'pronto', 'Cierra pronto'],
    ['Lun-Sáb 8:00-18:00', '2026-10-28T07:15', 'pronto', 'Abre pronto · 8:00 a. m.'],
    ['Lun-Sáb 8:00-18:00', '2026-10-28T19:00', 'cerr', 'Abre mañana 8:00 a. m.'],
    ['Lun-Sáb 8:00-18:00', '2026-11-01T10:00', 'cerr', 'Abre mañana 8:00 a. m.'],
    ['Lun-Vie 8:00-12:00', '2026-10-31T10:00', 'cerr', 'Abre el lunes 8:00 a. m.'],
    ['Lun-Sáb 9:00-13:00 y 14:00-18:00', '2026-10-28T13:30', 'pronto', 'Abre pronto · 2:00 p. m.'],
    ['Todos los días 7–9 p. m.', '2026-10-28T20:30', 'pronto', 'Cierra pronto'],
    ['Abierto 24 horas', '2026-10-28T03:00', 'ab', 'Abierto 24 horas'],
  ])('«%s» el %s → %s', (horario, cuando, tipo, texto) => {
    expect(estado({ horario }, cuando)).toMatchObject({ tipo, texto });
  });

  it('usa días y horas guardados en la nube (dias/abre/cierra)', () => {
    const lugar = { dias: [1, 2, 3, 4, 5], abre: '09:00', cierra: '17:00' };
    expect(estado(lugar, '2026-10-28T12:00').abierto).toBe(true);
    expect(estado(lugar, '2026-11-01T12:00').abierto).toBe(false);
  });

  it('horario que pasa la medianoche (bares hasta las 2 a. m.)', () => {
    const lugar = { dias: [5, 6], abre: '20:00', cierra: '02:00' };
    expect(estado(lugar, '2026-10-31T01:00').abierto).toBe(true); // madrugada del sábado: sigue el viernes
    expect(estado(lugar, '2026-10-31T03:00').abierto).toBe(false);
  });

  it('senderos, miradores y lugares sin horario no muestran estado', () => {
    expect(estado({ cat: 'turismo', tipo: 'sendero', horario: 'Recom. 5–4 p.m.' }, '2026-10-28T10:00')).toBeNull();
    expect(estado({ cat: 'turismo', nombre: 'Cerro Fusacatán', horario: '6-17' }, '2026-10-28T10:00')).toBeNull();
    expect(estado({ horario: 'Consultar directamente' }, '2026-10-28T10:00')).toBeNull();
  });
});

describe('parsearRangos y parsearDias', () => {
  it('lee rangos con y sin a. m./p. m.', () => {
    expect(horarios.parsearRangos('8:00-18:00')).toEqual([[480, 1080]]);
    expect(horarios.parsearRangos('7–9 p. m.')).toEqual([[420, 1260]]);
    expect(horarios.parsearRangos('Lun-Sáb 9:00-13:00 y 14:00-18:00')).toEqual([
      [540, 780],
      [840, 1080],
    ]);
    expect(horarios.parsearRangos('Consultar')).toEqual([]);
  });
  it('lee días sueltos, rangos y «todos los días»', () => {
    expect(horarios.parsearDias('Lun-Vie')).toEqual([1, 2, 3, 4, 5]);
    expect(horarios.parsearDias('Sáb-Lun')).toEqual([6, 0, 1]);
    expect(horarios.parsearDias('Sáb y Dom')).toEqual([6, 0]);
    expect(horarios.parsearDias('Todos los días')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

// ---------------------------------------------------------------- formato de la hora
const horas = cargar(['horaTexto', 'formatearHora']);
describe('formatearHora y horaTexto', () => {
  it.each([
    ['00:00', '12:00 a. m.'],
    ['08:05', '8:05 a. m.'],
    ['12:00', '12:00 p. m.'],
    ['13:30', '1:30 p. m.'],
    ['23:59', '11:59 p. m.'],
  ])('%s → %s', (hhmm, texto) => expect(horas.formatearHora(hhmm)).toBe(texto));
  it('vacío y valores fuera del día', () => {
    expect(horas.formatearHora('')).toBe('');
    expect(horas.horaTexto(1440 + 60)).toBe('1:00 a. m.');
    expect(horas.horaTexto(-60)).toBe('11:00 p. m.');
  });
});

// ---------------------------------------------------------------- búsqueda sin tildes ni plurales
const busqueda = cargar(['norm', 'raiz', 'tokens', 'GRUPOS_SUB', 'subDe', 'nombreSub', 'coincide'], {}, [
  'CAT',
  'SUBCATS',
]);
const panaderia = {
  nombre: 'Panadería La Espiga',
  desc: 'Pan de yuca y almojábanas',
  direccion: 'Cra 6',
  cat: 'comercio',
  sub: 'panaderias',
};
describe('búsqueda: sin tildes, sin mayúsculas y sin plurales', () => {
  it.each(['panaderia', 'PANADERÍA', 'panaderias', 'almojabanas', 'pan de yuca', 'comida y tiendas', 'Panaderías'])(
    '«%s» encuentra «Panadería La Espiga»',
    q => expect(busqueda.coincide(panaderia, q)).toBe(true),
  );
  it('exige todas las palabras', () => {
    expect(busqueda.coincide(panaderia, 'pan pizza')).toBe(false);
  });
  it('tokens: quita tildes y plurales («-es» y «-s»)', () => {
    expect(busqueda.tokens('Droguerías CAFÉS árboles')).toEqual(['drogueria', 'caf', 'arbol']);
    expect(busqueda.norm('Fusagasugá ÑANDÚ')).toBe('fusagasuga nandu');
  });
  it('busca también por subcategoría y categoría de servicios', () => {
    const lugar = { nombre: 'Taller Don Luis', desc: '', direccion: '', cat: 'servicios', sub: 'mecanica' };
    expect(busqueda.coincide(lugar, 'mecanica')).toBe(true);
    expect(busqueda.coincide(lugar, 'talleres')).toBe(true);
  });
});

// ---------------------------------------------------------------- validación de cupones
const AHORA = Date.parse('2026-10-28T12:00:00-05:00');
const cuponesFS = [
  { id: 'activo', comercio_id: 'vivero', estado: 'activo', cupo_restante: 5, vigencia: '2026-10-28' },
  { id: 'vencido', comercio_id: 'vivero', estado: 'activo', cupo_restante: 5, vigencia: '2026-10-27' },
  { id: 'agotado', comercio_id: 'vivero', estado: 'activo', cupo_restante: 0, vigencia: '2026-11-30' },
  { id: 'pausado', comercio_id: 'vivero', estado: 'pausado', cupo_restante: 5, vigencia: '2026-11-30' },
  { id: 'otro', comercio_id: 'otro-negocio', estado: 'activo', cupo_restante: 5 },
];
const lectura = { resultado: null, revisado: null };
const cupones = cargar(['aMs', 'premiumVigente', 'cuponesDe', 'estadoCupon', 'codigoCupon', 'leerTextoQR'], {
  estado: { cuponesFS },
  resultadoEscaner: (color, titulo) => (lectura.resultado = { color, titulo }),
  revisarCupon: cod => (lectura.revisado = cod),
});
const vivero = { id: 'vivero', propietario_uid: 'duena', esPremium: true };

describe('cupones: vigencia, cupo, estado y Premium', () => {
  it('cuponesDe solo deja los activos, con cupo y vigentes (la vigencia vale hasta el final del día)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    expect(cupones.cuponesDe(vivero).map(c => c.id)).toEqual(['activo']);
    vi.setSystemTime(Date.parse('2026-10-29T00:00:01-05:00')); // al día siguiente ya no sale
    expect(cupones.cuponesDe(vivero)).toEqual([]);
  });
  it('sin dueño o sin Premium vigente no hay cupones (no podrían canjearse)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    expect(cupones.cuponesDe({ ...vivero, propietario_uid: null })).toEqual([]);
    expect(cupones.cuponesDe({ ...vivero, esPremium: false })).toEqual([]);
    expect(cupones.cuponesDe({ ...vivero, suscripcion_vigente_hasta: AHORA - 1 })).toEqual([]);
    expect(cupones.premiumVigente({ ...vivero, suscripcion_vigente_hasta: AHORA + 864e5 })).toBe(true);
  });
  it('estadoCupon en la billetera: usado, vencido o activo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    expect(cupones.estadoCupon({ estado: 'usado', fecha_vencimiento: AHORA - 1 })).toBe('usado');
    expect(cupones.estadoCupon({ estado: 'reservado', fecha_vencimiento: AHORA - 1 })).toBe('vencido');
    expect(cupones.estadoCupon({ estado: 'reservado', fecha_vencimiento: AHORA + 1 })).toBe('activo');
  });
  it('codigoCupon genera códigos FC-XXXX-XXXX sin letras confusas (I, O, 0, 1)', () => {
    const codigos = Array.from({ length: 200 }, () => cupones.codigoCupon());
    for (const c of codigos) expect(c).toMatch(/^FC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(new Set(codigos).size).toBe(200);
  });
  it('leerTextoQR: acepta solo QR de cupones de Fusa Conecta', () => {
    cupones.leerTextoQR('FUSACONECTA:fc-ab12-cd34');
    expect(lectura.revisado).toBe('FC-AB12-CD34');
    cupones.leerTextoQR('https://fusa-conecta.web.app/#/lugar/c01');
    expect(lectura.resultado).toEqual({ color: 'rojo', titulo: 'Este no es un cupón' });
    cupones.leerTextoQR('https://otro-sitio.com');
    expect(lectura.resultado.titulo).toBe('Este código no es de Fusa Conecta');
  });
  it('aMs: fechas AAAA-MM-DD valen hasta el final de ese día', () => {
    expect(cupones.aMs('2026-10-28')).toBe(new Date('2026-10-28T23:59:59').getTime());
    expect(cupones.aMs(null)).toBeNull();
    expect(cupones.aMs({ toMillis: () => 5 })).toBe(5);
  });
});

// ---------------------------------------------------------------- pantalla de entrada (appLista y el máximo de 3 s)
describe('Entrada: appLista y salidaSplash', () => {
  const nuevo = (arranque, online = true) =>
    cargar(['SPLASH', 'appLista', 'salidaSplash'], { arranque, navigator: { onLine: online } });
  const base = { auth: true, perfil: true, datos: false, copia: false };

  it('sin sesión ni perfil resueltos no está lista', () => {
    expect(nuevo({ ...base, auth: false, datos: true }).appLista()).toBe(false);
    expect(nuevo({ ...base, perfil: false, datos: true }).appLista()).toBe(false);
  });
  it('con conexión y sin copia local espera la primera descarga del directorio', () => {
    expect(nuevo(base).appLista()).toBe(false);
    expect(nuevo({ ...base, datos: true }).appLista()).toBe(true);
  });
  it('con copia local o sin conexión no espera a la nube', () => {
    expect(nuevo({ ...base, copia: true }).appLista()).toBe(true);
    expect(nuevo(base, false).appLista()).toBe(true);
  });
  it('lista: sale al cumplir el mínimo de 1,6 s, no antes', () => {
    const e = nuevo({ ...base, datos: true });
    expect(e.salidaSplash(1000)).toBe(false);
    expect(e.salidaSplash(1600)).toBe(true);
  });
  it('sin estar lista: sale a los 3 s de todas formas', () => {
    const e = nuevo(base);
    expect(e.SPLASH.max).toBe(3000);
    expect(e.salidaSplash(2999)).toBe(false);
    expect(e.salidaSplash(3000)).toBe(true);
  });
});

// ---------------------------------------------------------------- avisos al celular (FCM): cuándo se pide el permiso
describe('Avisos al celular: permiso y textos del panel admin', () => {
  const entorno = ({
    ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/130',
    permiso = 'default',
    instalada = false,
  } = {}) => {
    const Notification = { permission: permiso, requestPermission: vi.fn(async () => 'granted') };
    const navigator = { userAgent: ua, platform: 'Linux', maxTouchPoints: 5, serviceWorker: {}, standalone: false };
    const window = { PushManager: {}, matchMedia: () => ({ matches: instalada }) };
    return { Notification, navigator, window };
  };
  const cargarAvisos = (e, extra = {}) =>
    cargar(['estadoAvisos', 'refrescarDispositivo', 'textoAviso'], {
      ...e,
      estado: { perfil: { notificaciones_push: true } },
      ls: { get: () => 0, set: () => {} },
      registrarDispositivo: vi.fn(async () => true),
      ...extra,
    });

  it('estadoAvisos: Android con permiso por preguntar, concedido o bloqueado', () => {
    expect(cargarAvisos(entorno()).estadoAvisos()).toBe('default');
    expect(cargarAvisos(entorno({ permiso: 'granted' })).estadoAvisos()).toBe('granted');
    expect(cargarAvisos(entorno({ permiso: 'denied' })).estadoAvisos()).toBe('denied');
  });
  it('estadoAvisos: en iPhone solo con la app instalada (iOS 16.4+)', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1';
    expect(cargarAvisos(entorno({ ua: iphone })).estadoAvisos()).toBe('iphone-sin-instalar');
    expect(cargarAvisos(entorno({ ua: iphone, instalada: true })).estadoAvisos()).toBe('default');
  });
  it('al abrir la app nunca se pide el permiso: solo se renueva el token si ya estaba concedido', () => {
    const e = entorno();
    const registrarDispositivo = vi.fn(async () => true);
    cargarAvisos(e, { registrarDispositivo }).refrescarDispositivo();
    expect(e.Notification.requestPermission).not.toHaveBeenCalled();
    expect(registrarDispositivo).not.toHaveBeenCalled();
    const conPermiso = entorno({ permiso: 'granted' });
    cargarAvisos(conPermiso, { registrarDispositivo }).refrescarDispositivo();
    expect(conPermiso.Notification.requestPermission).not.toHaveBeenCalled();
    expect(registrarDispositivo).toHaveBeenCalledTimes(1);
  });
  it('quien apagó los avisos no recibe un token nuevo', () => {
    const registrarDispositivo = vi.fn(async () => true);
    cargarAvisos(entorno({ permiso: 'granted' }), {
      registrarDispositivo,
      estado: { perfil: { notificaciones_push: false } },
    }).refrescarDispositivo();
    expect(registrarDispositivo).not.toHaveBeenCalled();
  });
  it('en app.js, Notification.requestPermission solo aparece dentro de activarAvisos', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
    const usos = [...src.matchAll(/Notification\.requestPermission/g)].map(m => m.index);
    const inicio = src.indexOf('async function activarAvisos(');
    const fin = src.indexOf('async function desactivarAvisos(');
    expect(usos.length).toBe(1);
    expect(usos[0]).toBeGreaterThan(inicio);
    expect(usos[0]).toBeLessThan(fin);
  });
  it('textoAviso: mensaje del panel admin según haya o no celulares', () => {
    const { textoAviso } = cargarAvisos(entorno());
    expect(textoAviso({ destinatario: 'Ana', enviados: 1 }, 'aprobado')).toBe(
      'Aprobado. Le avisamos a Ana en su celular',
    );
    expect(textoAviso({ destinatario: 'Ana', enviados: 0 }, 'aprobado')).toBe(
      'Aprobado. Verá el aviso en la campana de Novedades',
    );
    expect(textoAviso({ destinatario: 'Ana', enviados: 0 }, 'rechazado')).toBe(
      'Rechazado. Verá el aviso en la campana de Novedades',
    );
    expect(textoAviso({ destinatario: null }, 'aprobado')).toBe('');
  });
});

// ---------------------------------------------------------------- ficha incompleta en Mi negocio (v1.2.0)
describe('fichaIncompleta: aviso para el dueño', () => {
  const { fichaIncompleta } = cargar(['imgSegura', 'conFoto', 'fichaIncompleta']);
  it('sin foto ni WhatsApp (caso real: Ornamentación Primiciero)', () => {
    expect(fichaIncompleta({ imagen: '', fotos: [], whatsapp: '' })).toBe(
      'Tu ficha está incompleta: agrega una foto y tu WhatsApp para recibir más clientes',
    );
  });
  it('solo le falta una de las dos', () => {
    expect(fichaIncompleta({ fotos: ['img/x.jpg'], whatsapp: '' })).toBe(
      'Tu ficha está incompleta: agrega tu WhatsApp para recibir más clientes',
    );
    expect(fichaIncompleta({ imagen: '', whatsapp: '3102220014' })).toBe(
      'Tu ficha está incompleta: agrega una foto para recibir más clientes',
    );
  });
  it('completa: sin aviso', () => {
    expect(fichaIncompleta({ fotos: ['img/x.jpg'], whatsapp: '310 222 0014' })).toBe('');
  });
});

// ---------------------------------------------------------------- municipio (v1.3.0): Fusagasugá y Pasca
describe('Municipio: el filtro del selector', () => {
  const m = cargar(['municipioDe', 'enMunicipio', 'MUNICIPIOS']);
  it('sin municipio, un lugar es de Fusagasugá (así se cargó el directorio base)', () => {
    expect(m.municipioDe({})).toBe('Fusagasugá');
    expect(m.municipioDe({ municipio: 'Pasca' })).toBe('Pasca');
    expect(m.municipioDe(undefined)).toBe('Fusagasugá');
  });
  it('«Fusa y Pasca» deja pasar todo; cada municipio, solo lo suyo', () => {
    const lugares = [{ id: 1 }, { id: 2, municipio: 'Fusagasugá' }, { id: 3, municipio: 'Pasca' }];
    const ids = mun => lugares.filter(d => m.enMunicipio(d, mun)).map(d => d.id);
    expect(ids('')).toEqual([1, 2, 3]);
    expect(ids('Fusagasugá')).toEqual([1, 2]);
    expect(ids('Pasca')).toEqual([3]);
  });
  it('las opciones del selector', () => {
    expect(m.MUNICIPIOS.map(x => x[1])).toEqual(['Fusa y Pasca', 'Fusagasugá', 'Pasca']);
  });
  it('municipioGuardado: solo acepta Fusagasugá o Pasca', () => {
    const conLs = v => cargar(['municipioGuardado'], { ls: { get: () => v } }).municipioGuardado();
    expect(conLs('Pasca')).toBe('Pasca');
    expect(conLs('Bogotá')).toBe('');
    expect(conLs('')).toBe('');
  });
});
