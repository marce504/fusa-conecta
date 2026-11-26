// Pruebas unitarias del código real de la PWA (app.js y datos.js), cargado con cargar-app.js.
// La zona horaria es America/Bogota (vitest.config.js): la app calcula los horarios con la hora local del teléfono.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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
  'tramosDe',
  'horario24h',
  'estadoApertura',
  'NOCHE_MIN',
  'abreDeNoche',
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
    // v1.3.0: grupos de días separados por «;» (horario de la Alcaldía de Pasca)
    ['Lun-Vie 8:00-13:00 y 14:00-17:00; Sáb 8:00-12:00', '2026-10-31T10:00', 'ab', 'Abierto'],
    ['Lun-Vie 8:00-13:00 y 14:00-17:00; Sáb 8:00-12:00', '2026-10-31T13:00', 'cerr', 'Abre el lunes 8:00 a. m.'],
    ['Lun-Vie 8:00-13:00 y 14:00-17:00; Sáb 8:00-12:00', '2026-10-30T18:00', 'cerr', 'Abre mañana 8:00 a. m.'],
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

  it('las cascadas son lugares naturales: sin abierto ni cerrado', () => {
    expect(estado({ cat: 'turismo', tipo: 'cascada', horario: '6-17' }, '2026-10-28T10:00')).toBeNull();
    expect(estado({ cat: 'turismo', nombre: 'Cascada del Cacique', horario: '6-17' }, '2026-10-28T10:00')).toBeNull();
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
const busqueda = cargar(
  [
    'norm',
    'raiz',
    'tokens',
    'NIVEL',
    'toleranciaDe',
    'distanciaEdicion',
    'gruposSinonimos',
    'sinonimosDe',
    'GRUPOS_SUB',
    'subDe',
    'nombreSub',
    'camposBusqueda',
    'camposDe',
    'nivelPalabra',
    'nivelCoincidencia',
    'coincide',
  ],
  {},
  ['CAT', 'SUBCATS', 'SINONIMOS'],
);
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
    cupones.leerTextoQR('https://fusa-conecta.web.app/#/lugar/c21');
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

// ---------------------------------------------------------------- agenda de Pasca (v1.3.0)
describe('Agenda: Pasca en las tarjetas y fuentes desactualizadas', () => {
  const esc = t => String(t);
  const a = cargar(['municipioDe', 'lugarEv', 'diasDesde', 'textoUltima'], { esc, fechaCorta: () => '19 de oct' });
  it('los eventos de Pasca dicen «Pasca»; los de Fusagasugá no cambian', () => {
    expect(a.lugarEv({ lugar_nombre: 'Coliseo', municipio: 'Pasca' })).toBe('Coliseo · Pasca');
    expect(a.lugarEv({ lugar_nombre: 'Parque principal de Pasca', municipio: 'Pasca' })).toBe(
      'Parque principal de Pasca',
    );
    expect(a.lugarEv({ lugar_nombre: 'Estadio' })).toBe('Estadio');
  });
  it('textoUltima: más de 60 días es un sitio desactualizado', () => {
    const ahora = Date.parse('2026-10-30T12:00:00-05:00');
    const hace = d => ahora - d * 864e5;
    expect(a.textoUltima(hace(11), 'eventos', ahora)).toEqual({
      texto: 'Último evento publicado: 19 de oct (hace 11 días)',
      vieja: false,
    });
    expect(a.textoUltima(hace(249), 'noticias', ahora).vieja).toBe(true);
    expect(a.textoUltima(null, 'noticias', ahora)).toEqual({ texto: 'Sin noticias publicados', vieja: true });
  });
});

describe('formatearHorario con grupos de días', () => {
  const { formatearHorario } = cargar(['parsearRangos', 'horaTexto', 'formatearHorario']);
  it('el horario de la Alcaldía de Pasca conserva el sábado', () => {
    expect(formatearHorario('Lun-Vie 8:00-13:00 y 14:00-17:00; Sáb 8:00-12:00')).toBe(
      'Lun-Vie 8:00 a. m. – 1:00 p. m., 2:00 p. m. – 5:00 p. m. · Sáb 8:00 a. m. – 12:00 p. m.',
    );
  });
});

describe('destinoDe: mapa y «Cómo llegar»', () => {
  const { destinoDe } = cargar(['municipioDe', 'PLAZA_PASCA', 'destinoDe']);
  it('usa las coordenadas exactas cuando las hay', () => {
    expect(destinoDe({ lat: 4.34, lng: -74.36, ubicacion_aprox: false, direccion: 'Cl 1' })).toBe('4.34,-74.36');
  });
  it('en Fusagasugá busca la dirección si la ubicación es aproximada o no existe', () => {
    expect(destinoDe({ lat: null, lng: null, ubicacion_aprox: true, direccion: 'Cl 6 # 7 - 41' })).toBe(
      'Cl 6 # 7 - 41, Fusagasugá, Cundinamarca',
    );
  });
  it('en Pasca no manda la dirección a Google (la ubica en Fusagasugá): punto aproximado o casco urbano', () => {
    const base = { municipio: 'Pasca', ubicacion_aprox: true, direccion: 'Cl 6 # 3 - 87' };
    expect(destinoDe({ ...base, lat: 4.3085, lng: -74.3 })).toBe('4.3085,-74.3');
    expect(destinoDe({ ...base, lat: null, lng: null })).toBe('4.30783,-74.30018');
  });
});

describe('creditoFotoHTML: autor y licencia de la foto', () => {
  const { creditoFotoHTML } = cargar(['esc', 'imgSegura', 'filaDato', 'creditoFotoHTML'], { icon: () => '' });
  const credito = {
    autor: 'Petruss',
    licencia: 'CC BY-SA 4.0',
    licencia_url: 'https://creativecommons.org/licenses/by-sa/4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Estatua_Lucho_Herrera.jpg',
    fuente: 'Wikimedia Commons',
  };
  it('muestra autor, licencia y fuente con sus enlaces', () => {
    const html = creditoFotoHTML({ imagen: 'img/comercios/x.jpg', foto_credito: credito });
    expect(html).toContain('>Petruss</a>');
    expect(html).toContain('>CC BY-SA 4.0</a>');
    expect(html).toContain('Wikimedia Commons');
  });
  it('no muestra nada sin foto o sin crédito', () => {
    expect(creditoFotoHTML({ imagen: '', foto_credito: credito })).toBe('');
    expect(creditoFotoHTML({ imagen: 'img/comercios/x.jpg' })).toBe('');
  });
  it('foto propia del equipo: autor y fuente, sin licencia vacía', () => {
    const html = creditoFotoHTML({
      imagen: 'img/turismo/x.jpg',
      foto_credito: { autor: 'Equipo Fusa Conecta', fuente: 'fotos propias' },
    });
    expect(html).toContain('Equipo Fusa Conecta · fotos propias');
    expect(html).not.toContain('·  ');
  });
});

describe('cargarFotosDe: fotos propias del directorio base', () => {
  it('las rutas img/… se usan tal cual, sin consultar Firestore', async () => {
    const db = {
      collection: () => {
        throw new Error('no debe ir a Firestore');
      },
    };
    const { cargarFotosDe } = cargar(['cargarFotosDe'], { db });
    const m = await cargarFotosDe('c589', ['img/turismo/san-rafael/1-a.jpg', 'img/turismo/san-rafael/2-b.jpg']);
    expect(m['img/turismo/san-rafael/2-b.jpg']).toBe('img/turismo/san-rafael/2-b.jpg');
  });
});

const RAIZ = path.resolve(import.meta.dirname, '../..');
describe('Parque Natural San Rafael en el directorio base', () => {
  it('es una cascada con fuentes, ubicación aproximada y fotos propias', () => {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(
      fs.readFileSync(path.join(RAIZ, 'datos.js'), 'utf8') + ';this.B=COMERCIOS_BASE;this.S=SUBCATS',
      ctx,
    );
    const p = ctx.B.find(d => d.id === 'c589');
    expect(p.tipo).toBe('cascada');
    expect(p.ubicacion_aprox).toBe(true);
    expect(p.fuentes.filter(f => /^https:\/\//.test(f.url || '')).length).toBeGreaterThanOrEqual(2);
    expect(p.fotos.every(f => fs.existsSync(path.join(RAIZ, f)))).toBe(true);
    expect(ctx.S.turismo.some(s => s.k === 'cascada')).toBe(true);
  });
});

describe('pistaDiagnostico: errores de la IA con arreglo conocido', () => {
  const { pistaDiagnostico } = cargar(['pistaDiagnostico']);
  it('explica el 401 de App Check con el paso de la consola', () => {
    const e = new Error(
      'AI: Error fetching from https://firebasevertexai.googleapis.com/…: [401 ] Firebase App Check token is invalid.',
    );
    expect(pistaDiagnostico(e)).toContain('App Check → APIs → Firebase AI Logic');
  });
  it('distingue cupo agotado y modelo saturado, y calla ante lo desconocido', () => {
    expect(pistaDiagnostico(new Error('[429 ] Quota exceeded'))).toContain('cupo');
    expect(pistaDiagnostico(new Error('[503 ] The model is overloaded'))).toContain('saturado');
    expect(pistaDiagnostico(new Error('Sin respuesta en 25 s'))).toBe('');
  });
});

describe('fechaEvento: eventos sin hora de cierre', () => {
  const { fechaEvento } = cargar(['horaTexto', 'horaEv', 'enCurso', 'fechaEvento'], {
    DIAS_EV: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    MESES3: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  });
  const ini = new Date('2026-11-14T08:00:00-05:00').getTime();
  it('dice «desde las» y no inventa la hora de fin', () => {
    const fin = new Date('2026-11-14T23:59:00-05:00').getTime();
    expect(fechaEvento({ ini, fin, sin_hora_fin: true })).toBe('Sáb 14 de nov · desde las 8:00 a. m.');
  });
  it('con hora de cierre muestra el rango', () => {
    const fin = new Date('2026-11-14T12:00:00-05:00').getTime();
    expect(fechaEvento({ ini, fin })).toBe('Sáb 14 de nov · 8:00 a. m. – 12:00 p. m.');
  });
});

describe('iPhone: navegador y pasos para agregar la app al inicio', () => {
  const { navegadorIphone, pasosIphone } = cargar(['esc', 'navegadorIphone', 'pasosIphone'], {
    icon: n => `[${n}]`,
  });
  const base = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  it('Safari 26 (el sistema congela «OS 18_6» pero la versión dice 26): «•••» y luego Compartir', () => {
    const n = navegadorIphone(base + ' Version/26.1 Mobile/15E148 Safari/604.1');
    expect(n.tipo).toBe('safari26');
    expect(pasosIphone(n)[0]).toContain('[ellipsis]');
    expect(pasosIphone(n).join(' ')).toContain('Agregar a inicio');
  });
  it('Safari 18 o anterior: Compartir en la barra de abajo', () => {
    const n = navegadorIphone(base + ' Version/18.6 Mobile/15E148 Safari/604.1');
    expect(n.tipo).toBe('safari');
    expect(pasosIphone(n)[0]).toContain('[share]Compartir');
  });
  it('Chrome en iPhone: Compartir en la barra de dirección', () => {
    const n = navegadorIphone(base + ' CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1');
    expect(n.tipo).toBe('chrome');
    expect(pasosIphone(n).join(' ')).toContain('Agregar a pantalla de inicio');
  });
  it('dentro de Instagram o Facebook: primero abrir en Safari', () => {
    const ig = navegadorIphone(base + ' Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_6)');
    expect(ig).toEqual({ tipo: 'interno', app: 'Instagram' });
    expect(pasosIphone(ig)[1]).toContain('Abrir en Safari');
    expect(navegadorIphone(base + ' Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]').app).toBe('Facebook');
  });
  it('Firefox o Edge en iPhone: pasar a Safari', () => {
    expect(navegadorIphone(base + ' FxiOS/133.0 Mobile/15E148').tipo).toBe('otro');
  });
});

describe('modeloDoble: Firebase AI Logic y, si exige App Check, la API de respaldo', () => {
  const armar = () => {
    const guardado = {},
      pedidos = [];
    const ls = { get: k => guardado[k], set: (k, v) => (guardado[k] = v) };
    const auth = { currentUser: { getIdToken: async () => 'token-de-prueba' } };
    const fetch = async (url, o) => {
      const cuerpo = JSON.parse(o.body);
      pedidos.push({ url, auth: o.headers.Authorization, cuerpo });
      const ultimo = cuerpo.contents.at(-1).parts[0];
      const parts = ultimo.functionResponse
        ? [{ text: 'Te recomiendo el Vivero.' }]
        : cuerpo.uso === 'asistente'
          ? [{ functionCall: { name: 'buscarLugares', args: { texto: 'vivero' } } }]
          : [{ text: '{"titulo":"Feria"}' }];
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { role: 'model', parts } }] }) };
    };
    const m = cargar(
      ['iaPorAPI', 'bloqueoAppCheck', 'usarIAporAPI', 'partesIA', 'respuestaIA', 'pedirIA', 'modeloDoble'],
      { ls, auth, fetch, API_URL: 'https://api.prueba', console: { warn() {} } },
    );
    return { ...m, pedidos, guardado };
  };
  const appCheck = () => {
    throw new Error('[401 ] Firebase App Check token is invalid. (AI/fetch-error)');
  };

  it('usa el SDK mientras funciona', async () => {
    const { modeloDoble, pedidos } = armar();
    const sdk = { generateContent: async () => ({ response: { text: () => 'directo' } }) };
    const r = await modeloDoble({ uso: 'evento', sdk: () => sdk }).generateContent('hola');
    expect(r.response.text()).toBe('directo');
    expect(pedidos).toHaveLength(0);
  });

  it('con App Check pasa a la API, con sesión y el esquema, y se queda ahí', async () => {
    const { modeloDoble, pedidos, guardado } = armar();
    let usosSDK = 0;
    const sdk = {
      generateContent: async () => {
        usosSDK++;
        appCheck();
      },
    };
    const esquema = { type: 'OBJECT', properties: { titulo: { type: 'STRING' } } };
    const m = modeloDoble({ uso: 'evento', generationConfig: { responseSchema: esquema }, sdk: () => sdk });
    expect(JSON.parse((await m.generateContent('Feria el sábado')).response.text())).toEqual({ titulo: 'Feria' });
    expect(pedidos[0].url).toBe('https://api.prueba/v1/ia/generar');
    expect(pedidos[0].auth).toBe('Bearer token-de-prueba');
    expect(pedidos[0].cuerpo).toMatchObject({ uso: 'evento', generationConfig: { responseSchema: esquema } });
    expect(pedidos[0].cuerpo.contents).toEqual([{ role: 'user', parts: [{ text: 'Feria el sábado' }] }]);
    await m.generateContent('otra');
    expect(usosSDK).toBe(1);
    expect(guardado.fc_ia_api).toBeGreaterThan(0);
  });

  it('el asistente por la API conserva el historial y la respuesta de las funciones', async () => {
    const { modeloDoble, pedidos } = armar();
    const sdk = { startChat: () => ({ sendMessage: async () => appCheck() }) };
    const m = modeloDoble({
      uso: 'asistente',
      systemInstruction: 'Eres Fusa',
      tools: [{ functionDeclarations: [] }],
      sdk: () => sdk,
    });
    const chat = m.startChat({ history: [{ role: 'user', parts: [{ text: 'antes' }] }] });
    const x = await chat.sendMessage('¿Dónde compro plantas?');
    expect(x.response.functionCalls()[0].name).toBe('buscarLugares');
    const y = await chat.sendMessage([{ functionResponse: { name: 'buscarLugares', response: { lugares: [] } } }]);
    expect(y.response.text()).toBe('Te recomiendo el Vivero.');
    const ultimo = pedidos.at(-1).cuerpo;
    expect(ultimo.systemInstruction).toEqual({ parts: [{ text: 'Eres Fusa' }] });
    expect(ultimo.contents.map(c => c.role)).toEqual(['user', 'user', 'model', 'user']);
    expect(ultimo.contents[2].parts[0].functionCall.name).toBe('buscarLugares');
  });

  it('otros errores del SDK no cambian de camino', async () => {
    const { modeloDoble, pedidos } = armar();
    const sdk = {
      generateContent: async () => {
        throw new Error('[503 ] overloaded');
      },
    };
    await expect(modeloDoble({ uso: 'evento', sdk: () => sdk }).generateContent('x')).rejects.toThrow('503');
    expect(pedidos).toHaveLength(0);
  });
});

describe('campaña de lanzamiento y contactos por WhatsApp', () => {
  const m = cargar(
    [
      'CAMPANA',
      'campanaVigente',
      'cambiosPremium',
      'premiumCampana',
      'ESTADOS_CONTACTO',
      'estadoContacto',
      'EQUIPO_CONTACTO',
      'mensajeContacto',
      'horarioContactoOK',
    ],
    { aMs: x => x, TS: { fromMillis: x => ({ ms: x }) }, FV: { delete: () => 'borrar' } },
  );
  const col = t => new Date(t + '-05:00').getTime();
  it('quien se une hasta el 31 de enero de 2027 recibe Premium hasta el 30 de abril', () => {
    const p = m.premiumCampana(null, col('2027-01-31T20:00:00'));
    expect(p.esPremium).toBe(true);
    expect(p.suscripcion_vigente_hasta.ms).toBe(col('2027-04-30T23:59:59'));
    expect(m.premiumCampana(null, col('2027-02-01T08:00:00'))).toEqual({});
  });
  it('no acorta un Premium más largo o sin fecha', () => {
    const ahora = col('2026-12-01T10:00:00');
    expect(m.premiumCampana({ esPremium: true }, ahora)).toEqual({});
    expect(m.premiumCampana({ esPremium: true, suscripcion_vigente_hasta: col('2027-12-31T00:00:00') }, ahora)).toEqual(
      {},
    );
    expect(
      m.premiumCampana({ esPremium: true, suscripcion_vigente_hasta: col('2026-12-15T00:00:00') }, ahora).esPremium,
    ).toBe(true);
  });
  it('el mensaje lleva el nombre, el enlace a la ficha, la campaña y el agradecimiento', () => {
    const t = m.mensajeContacto({ id: 'c331', nombre: 'El Peon' }, 'Marcela Estrella', col('2026-11-18T10:00:00'));
    expect(t).toContain('¿hablo con El Peon?');
    expect(t).toContain('Le saludan Marcela y Jhon, de Fusa Conecta.');
    expect(m.mensajeContacto({ id: 'c1', nombre: 'X' }, 'Jhon', col('2026-11-18T10:00:00'))).toContain(
      'Le saludan Jhon y Marcela, de Fusa Conecta.',
    );
    expect(t).toContain('estudiantes del SENA de Análisis y Desarrollo de Software');
    expect(t).toContain('todo el que venda algo en Fusagasugá y Pasca');
    expect(t).toContain('https://fusa-conecta.web.app/#/lugar/c331');
    expect(t).toContain('«¿Es tu negocio? Reclámalo»');
    expect(t).toContain('Premium gratis hasta el 30 de abril de 2027');
    expect(t.endsWith('¡Muchas gracias por su tiempo!')).toBe(true);
    expect(m.mensajeContacto({ id: 'c1', nombre: 'X' }, '', col('2027-03-01T10:00:00'))).not.toContain('Premium');
  });
  it('se une si ya tiene dueño o pidió el reclamo; si no, el estado guardado', () => {
    expect(m.estadoContacto({ id: 'a', propietario_uid: 'u' }, null, new Set())).toBe('unido');
    expect(m.estadoContacto({ id: 'a' }, null, new Set(['a']))).toBe('unido');
    expect(m.estadoContacto({ id: 'a' }, { estado: 'respondio' }, new Set())).toBe('respondio');
    expect(m.estadoContacto({ id: 'a' }, null, new Set())).toBe('pendiente');
  });
  it('horario de la Ley 2300: lunes a viernes 7-19, sábado 8-15, domingo no', () => {
    expect(m.horarioContactoOK(new Date('2026-11-18T10:00:00-05:00'))).toBe(true);
    expect(m.horarioContactoOK(new Date('2026-11-18T19:30:00-05:00'))).toBe(false);
    expect(m.horarioContactoOK(new Date('2026-11-21T14:00:00-05:00'))).toBe(true);
    expect(m.horarioContactoOK(new Date('2026-11-21T15:30:00-05:00'))).toBe(false);
    expect(m.horarioContactoOK(new Date('2026-11-22T10:00:00-05:00'))).toBe(false);
  });
});

describe('modo rápido de contactos', () => {
  const { siguienteContacto, enviadosDelDia } = cargar(['siguienteContacto', 'enviadosDelDia']);
  const x = (id, nombre, e) => ({ d: { id, nombre }, e });
  const todos = [
    x('c3', 'Zagus', 'pendiente'),
    x('c1', 'Árbol', 'enviado'),
    x('c2', 'Bambú', 'pendiente'),
    x('c4', 'Café', 'unido'),
  ];
  it('sigue el primer pendiente en orden alfabético y respeta los saltados', () => {
    expect(siguienteContacto(todos, new Set()).d.id).toBe('c2');
    expect(siguienteContacto(todos, new Set(['c2'])).d.id).toBe('c3');
    expect(siguienteContacto(todos, new Set(['c2', 'c3']))).toBeNull();
  });
  it('cuenta solo los enviados de hoy', () => {
    const hoy = new Date('2026-11-18T10:00:00-05:00');
    const c = new Map([
      ['a', { estado: 'enviado', fecha: new Date('2026-11-18T08:00:00-05:00').getTime() }],
      ['b', { estado: 'enviado', fecha: new Date('2026-11-17T08:00:00-05:00').getTime() }],
      ['c', { estado: 'respondio', fecha: new Date('2026-11-18T09:00:00-05:00').getTime() }],
    ]);
    expect(enviadosDelDia(c, hoy)).toBe(1);
  });
});

describe('abreDeNoche: filtro «De noche» según el horario real', () => {
  const noche = l => horarios.abreDeNoche({ cat: 'comercio', ...l });
  it.each([
    ['Lun-Sáb 8:00-18:00', false],
    ['Lun-Dom 6:00-21:00', false],
    ['Lun-Dom 7:00-22:00', true],
    ['Jue-Sáb 20:00-02:00', true],
    ['Vie-Sáb 6-11 p. m.', true],
    ['Abierto 24 horas', true],
    ['', false],
  ])('«%s» → %s', (horario, esperado) => expect(noche({ horario })).toBe(esperado));
  it('usa el horario estructurado si existe', () => {
    expect(noche({ dias: [5, 6], abre: '20:00', cierra: '02:00' })).toBe(true);
    expect(noche({ dias: [1, 2], abre: '08:00', cierra: '17:00', horario: '24 horas' })).toBe(false);
  });
  it('senderos y cascadas nunca entran', () => {
    expect(horarios.abreDeNoche({ cat: 'turismo', tipo: 'cascada', horario: '24 horas' })).toBe(false);
  });
});

describe('Droguería de turno: solo con fuente oficial y dentro de las fechas', () => {
  const { turnoVigente } = cargar(['hoyISO', 'turnoVigente']);
  const t = {
    fusagasuga: {
      comercio_id: 'c422',
      nombre: 'Cruz Verde',
      desde: '2026-11-17',
      hasta: '2026-11-23',
      fuente: 'Secretaría de Salud',
      fuente_url: 'https://ejemplo.gov.co/turnos',
    },
  };
  it('vigente dentro del rango', () => {
    expect(turnoVigente(t, 'fusagasuga', '2026-11-17').nombre).toBe('Cruz Verde');
    expect(turnoVigente(t, 'fusagasuga', '2026-11-23')).not.toBeNull();
  });
  it('fuera de fechas, sin fuente o sin enlace https no se muestra', () => {
    expect(turnoVigente(t, 'fusagasuga', '2026-11-24')).toBeNull();
    expect(turnoVigente(t, 'pasca', '2026-11-18')).toBeNull();
    const sinUrl = { fusagasuga: { ...t.fusagasuga, fuente_url: 'http://x.co' } };
    expect(turnoVigente(sinUrl, 'fusagasuga', '2026-11-18')).toBeNull();
    expect(turnoVigente({ fusagasuga: { ...t.fusagasuga, fuente: '' } }, 'fusagasuga', '2026-11-18')).toBeNull();
    expect(turnoVigente(null, 'fusagasuga')).toBeNull();
  });
});

describe('datosTurno: validación del formulario del admin', () => {
  const database = [
    { id: 'c422', cat: 'servicios', sub: 'salud', nombre: 'Cruz Verde', desc: 'Droguería.', municipio: 'Fusagasugá' },
    { id: 'c1', cat: 'comercio', nombre: 'Panadería', municipio: 'Fusagasugá' },
  ];
  const { datosTurno } = cargar(['municipioDe', 'droguerias', 'datosTurno'], { database });
  const base = {
    comercio_id: 'c422',
    desde: '2026-11-17',
    hasta: '2026-11-23',
    fuente: ' Secretaría de Salud ',
    fuente_url: 'https://ejemplo.gov.co/turnos',
  };
  it('devuelve el turno limpio', () => {
    expect(datosTurno('fusagasuga', base)).toEqual({ ...base, nombre: 'Cruz Verde', fuente: 'Secretaría de Salud' });
  });
  it('rechaza lo que no es droguería, fechas al revés y fuentes sin enlace', () => {
    expect(datosTurno('fusagasuga', { ...base, comercio_id: 'c1' })).toBe('Elige la droguería');
    expect(datosTurno('fusagasuga', { ...base, hasta: '2026-11-10' })).toMatch(/después/);
    expect(datosTurno('fusagasuga', { ...base, fuente: '  ' })).toMatch(/de dónde/);
    expect(datosTurno('fusagasuga', { ...base, fuente_url: 'ejemplo.gov.co' })).toMatch(/https/);
  });
});

describe('Alertas municipales: vigencia, municipio y validación del admin', () => {
  const { alertasVigentes, datosAlerta } = cargar(['TIPOS_ALERTA', 'MUN_ALERTA', 'alertasVigentes', 'datosAlerta']);
  const ahora = Date.parse('2026-11-18T10:00:00-05:00');
  const a = (id, municipio, vence, est = 'publicada') => ({ id, municipio, vence, estado: est, creada: vence - 1 });
  const l = [
    a('fusa', 'Fusagasugá', ahora + 3600e3),
    a('pasca', 'Pasca', ahora + 3600e3),
    a('ambos', 'Ambos', ahora + 7200e3),
    a('vieja', 'Ambos', ahora - 1),
    a('retirada', 'Ambos', ahora + 3600e3, 'retirada'),
  ];
  it('solo las publicadas y vigentes, del municipio elegido o de los dos', () => {
    expect(alertasVigentes(l, 'Pasca', ahora).map(x => x.id)).toEqual(['ambos', 'pasca']);
    expect(alertasVigentes(l, '', ahora).map(x => x.id)).toEqual(['ambos', 'fusa', 'pasca']);
    expect(alertasVigentes(null, '', ahora)).toEqual([]);
  });
  const ok = {
    tipo: 'agua',
    municipio: 'Fusagasugá',
    titulo: 'Corte de agua en Pekín',
    mensaje: 'Mañana de 8 a 12 por arreglos de la red.',
    fuente: 'Emserfusa',
    fuente_url: 'https://emserfusa.gov.co/aviso',
    vence: '2026-11-19T12:00',
  };
  it('devuelve la alerta lista para guardar', () => {
    const r = datosAlerta(ok, ahora);
    expect(r.titulo).toBe('Corte de agua en Pekín');
    expect(r.vence).toBe(new Date('2026-11-19T12:00').getTime());
  });
  it('exige fuente https, mensaje y una fecha futura de máximo 30 días', () => {
    expect(datosAlerta({ ...ok, fuente_url: 'http://x.co' }, ahora)).toMatch(/https/);
    expect(datosAlerta({ ...ok, fuente: '' }, ahora)).toMatch(/de dónde/);
    expect(datosAlerta({ ...ok, mensaje: 'corto' }, ahora)).toMatch(/qué pasa/);
    expect(datosAlerta({ ...ok, vence: '2026-11-17T12:00' }, ahora)).toMatch(/más adelante/);
    expect(datosAlerta({ ...ok, vence: '2027-01-30T12:00' }, ahora)).toMatch(/30 días/);
    expect(datosAlerta({ ...ok, tipo: 'fiesta' }, ahora)).toMatch(/tipo/);
  });
});

describe('Horarios de transporte: solo con fuente y fecha de verificación', () => {
  const ahora = Date.parse('2026-11-18T10:00:00-05:00');
  const { rutasTransporte, datosRutaTransporte, rutaTransporteHTML } = cargar(
    ['telLimpio', 'esc', 'fechaCorta', 'DIAS_VIEJO', 'rutasTransporte', 'datosRutaTransporte', 'rutaTransporteHTML'],
    { icon: () => '' },
  );
  const ok = {
    empresa: 'Empresa de prueba',
    origen: 'Fusagasugá',
    destino: 'Bogotá',
    salidas: 'Cada 30 min, de 5:00 a. m. a 8:00 p. m.',
    precio: '$ 16.000',
    tel: '301 234 5678',
    fuente: 'Página de la empresa',
    fuente_url: 'https://ejemplo.test/horarios',
    verificado: '2026-11-18',
  };
  it('limpia y valida los datos del admin', () => {
    const r = datosRutaTransporte(ok, ahora);
    expect(r.tel).toBe('3012345678');
    expect(r.verificado).toBe(new Date('2026-11-18T12:00:00').getTime());
    expect(datosRutaTransporte({ ...ok, fuente_url: 'ejemplo.test' }, ahora)).toMatch(/https/);
    expect(datosRutaTransporte({ ...ok, salidas: '' }, ahora)).toMatch(/salidas/);
    expect(datosRutaTransporte({ ...ok, verificado: '2025-10-01' }, ahora)).toMatch(/más de un año/);
    expect(datosRutaTransporte({ ...ok, verificado: '2026-12-01' }, ahora)).toMatch(/futura/);
    expect(datosRutaTransporte({ ...ok, tel: '12' }, ahora)).toMatch(/teléfono/);
  });
  it('solo se muestran las activas con fuente https y avisa si el dato es viejo', () => {
    const l = [
      {
        id: 'b',
        activo: true,
        empresa: 'B',
        origen: 'Fusagasugá',
        destino: 'Girardot',
        fuente: 'F',
        fuente_url: 'https://x.test',
      },
      {
        id: 'a',
        activo: true,
        empresa: 'A',
        origen: 'Fusagasugá',
        destino: 'Bogotá',
        fuente: 'F',
        fuente_url: 'https://x.test',
      },
      { id: 'c', activo: false, empresa: 'C', origen: 'X', destino: 'Y', fuente: 'F', fuente_url: 'https://x.test' },
      { id: 'd', activo: true, empresa: 'D', origen: 'X', destino: 'Y', fuente: 'F', fuente_url: 'http://x.test' },
    ];
    expect(rutasTransporte(l).map(r => r.id)).toEqual(['a', 'b']);
    const viejo = rutaTransporteHTML({ ...l[1], salidas: 'x', verificado: ahora - 100 * 24 * 3600e3 }, ahora);
    expect(viejo).toContain('puede haber cambiado');
    expect(rutaTransporteHTML({ ...l[1], salidas: 'x', verificado: ahora }, ahora)).not.toContain(
      'puede haber cambiado',
    );
  });
});

describe('aDomicilio: lo marca el dueño o lo dice la ficha real', () => {
  const { aDomicilio } = cargar(['aDomicilio']);
  it.each([
    [{ a_domicilio: true }, true],
    [{ desc: 'Licorera con servicio a domicilio las 24 horas.' }, true],
    [{ horario: 'Todos los días, domicilios hasta las 4:00 a. m.' }, true],
    [{ desc: 'Plomería y electricidad.' }, false],
    [{ a_domicilio: 'sí' }, false],
    [null, false],
  ])('%o → %s', (d, esperado) => expect(aDomicilio(d)).toBe(esperado));
});

describe('Mercado campesino: reconoce los eventos de la agenda', () => {
  const { esMercadoCampesino } = cargar(['RE_MERCADO', 'esMercadoCampesino']);
  it.each([
    [{ titulo: 'Mercado Campesino Provincial' }, true],
    [{ titulo: 'Gran feria campesina del Sumapaz' }, true],
    [{ titulo: 'Festival de cine', descripcion: 'Habrá mercado de productores en la plaza.' }, true],
    [{ titulo: 'Concierto en el parque' }, false],
    [{ titulo: 'Mercado campesino', demo: true }, false],
    [null, false],
  ])('%o → %s', (e, esperado) => expect(esMercadoCampesino(e)).toBe(esperado));
});

describe('Menú y pedido por WhatsApp', () => {
  const { menuLimpio, mensajePedido } = cargar(['MENU_MAX', 'menuLimpio', 'pesos', 'mensajePedido']);
  const d = {
    nombre: 'Restaurante de prueba',
    menu: [
      { n: 'Almuerzo ejecutivo', p: 15000, d: 'Sopa, seco y jugo', x: true },
      { n: 'Jugo natural', p: 4500, x: true },
      { n: 'Postre agotado', p: 5000, x: false },
    ],
  };
  it('limpia el menú: sin nombre no entra, precios enteros y máximo 40', () => {
    expect(menuLimpio([{ n: ' ', p: 1 }, { n: 'Café', p: '2500.4' }, null])).toEqual([
      { n: 'Café', p: 2500, d: '', x: true },
    ]);
    expect(menuLimpio(Array.from({ length: 50 }, (_, i) => ({ n: 'P' + i, p: 1 }))).length).toBe(40);
    expect(menuLimpio('nada')).toEqual([]);
  });
  it('arma el mensaje con cantidades, total y nota; ignora lo agotado', () => {
    const m = mensajePedido(d, { 0: 2, 1: 1, 2: 3 }, ' sin cebolla ');
    expect(m).toContain('Hola Restaurante de prueba, quiero hacer un pedido');
    expect(m).toContain('• 2 × Almuerzo ejecutivo ($ 15.000) = $ 30.000');
    expect(m).toContain('• 1 × Jugo natural ($ 4.500) = $ 4.500');
    expect(m).not.toContain('Postre agotado');
    expect(m).toContain('Total: $ 34.500');
    expect(m).toContain('Nota: sin cebolla');
    expect(mensajePedido(d, { 2: 1 }, '')).toBe('');
  });
});

describe('IA de respaldo: cuándo se pasa a la API', () => {
  const { bloqueoAppCheck } = cargar(['bloqueoAppCheck']);
  it.each([
    ['AI: App Check token is invalid', true],
    ['AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/…', true],
    ['TypeError: Failed to fetch', true],
    ['AI: 429 quota exceeded', false],
  ])('«%s» → %s', (m, esperado) => expect(bloqueoAppCheck(new Error(m))).toBe(esperado));
});

describe('Perdidos y encontrados: validación y qué se muestra', () => {
  const ahora = Date.parse('2026-11-20T10:00:00-05:00');
  const { datosPerdido, perdidosVisibles } = cargar(['telLimpio', 'datosPerdido', 'perdidosVisibles']);
  const ok = {
    tipo: 'mascota',
    situacion: 'perdido',
    titulo: 'Perrita criolla café',
    zona: 'Barrio Pekín',
    municipio: 'Fusagasugá',
    fecha: '2026-11-19',
    whatsapp: '301 234 5678',
    acepta: true,
  };
  it('limpia los datos y exige WhatsApp, fecha y aceptar mostrar el número', () => {
    expect(datosPerdido(ok, ahora).whatsapp).toBe('3012345678');
    expect(datosPerdido({ ...ok, acepta: false }, ahora)).toMatch(/Acepta/);
    expect(datosPerdido({ ...ok, whatsapp: '6018671234' }, ahora)).toMatch(/celular/);
    expect(datosPerdido({ ...ok, fecha: '2026-12-01' }, ahora)).toMatch(/futura/);
    expect(datosPerdido({ ...ok, fecha: '2026-07-01' }, ahora)).toMatch(/3 meses/);
    expect(datosPerdido({ ...ok, tipo: 'vehiculo' }, ahora)).toMatch(/mascota o un objeto/);
  });
  it('muestra activos y resueltos sin vencer, primero los activos', () => {
    const p = (id, estadoP, vence, extra = {}) => ({
      id,
      estado: estadoP,
      vence,
      creado: 1,
      tipo: 'mascota',
      situacion: 'perdido',
      municipio: 'Fusagasugá',
      ...extra,
    });
    const l = [
      p('res', 'resuelto', ahora + 1),
      p('act', 'activo', ahora + 1),
      p('venc', 'activo', ahora - 1),
      p('oc', 'oculto', ahora + 1),
      p('pasca', 'activo', ahora + 1, { municipio: 'Pasca' }),
      p('obj', 'activo', ahora + 1, { tipo: 'objeto' }),
    ];
    expect(perdidosVisibles(l, { tipo: 'mascota', mun: 'Fusagasugá' }, ahora).map(x => x.id)).toEqual(['act', 'res']);
    expect(perdidosVisibles(l, { tipo: 'objeto' }, ahora).map(x => x.id)).toEqual(['obj']);
  });
});

describe('Empleos locales: validación de la oferta', () => {
  const { datosEmpleo } = cargar(['telLimpio', 'esCelular', 'municipioDe', 'JORNADAS', 'RE_EMPLEO_MAL', 'datosEmpleo']);
  const d = {
    id: 'c1',
    nombre: 'Café de prueba',
    estado_publicacion: 'aprobado',
    whatsapp: '3012345678',
    direccion: 'Cra 6',
    municipio: 'Fusagasugá',
  };
  const ok = {
    titulo: 'Mesero(a) fines de semana',
    descripcion: 'Atención en mesas sábados y domingos de 8 a 4.',
    jornada: 'por_dias',
    salario: '$ 60.000 por día',
  };
  it('arma la oferta con los datos del negocio', () => {
    const r = datosEmpleo(ok, d);
    expect(r).toMatchObject({
      comercio_id: 'c1',
      comercio_nombre: 'Café de prueba',
      whatsapp: '3012345678',
      municipio: 'Fusagasugá',
      lugar: 'Cra 6',
    });
  });
  it('rechaza negocios sin publicar o sin WhatsApp, cobros y requisitos discriminatorios', () => {
    expect(datosEmpleo(ok, { ...d, estado_publicacion: 'pendiente' })).toMatch(/publicado/);
    expect(datosEmpleo(ok, { ...d, whatsapp: '', tel: '6018671234' })).toMatch(/WhatsApp/);
    expect(datosEmpleo({ ...ok, descripcion: 'Debe pagar la inscripción de 50.000 para empezar.' }, d)).toMatch(
      /pagos/,
    );
    expect(datosEmpleo({ ...ok, descripcion: 'Solo mujeres menores de 25 años, buena presencia.' }, d)).toMatch(
      /edad, sexo/,
    );
    expect(datosEmpleo({ ...ok, jornada: 'noche' }, d)).toMatch(/jornada/);
  });
});

describe('Rutas turísticas, pico y placa, cajeros y parqueaderos', () => {
  const lugares = {
    a: { id: 'a', nombre: 'Uno', lat: 4.344, lng: -74.361 },
    b: { id: 'b', nombre: 'Dos', lat: 4.3406, lng: -74.3609 },
    c: { id: 'c', nombre: 'Tres', lat: 4.3386, lng: -74.3606 },
  };
  const { datosRutaTuristica, datosPicoPlaca, picoPlacaVigente, esCajeroOBanco, esParqueadero } = cargar(
    ['kmEntre', 'datosRutaTuristica', 'datosPicoPlaca', 'picoPlacaVigente', 'esCajeroOBanco', 'esParqueadero'],
    { buscar: id => lugares[id] },
  );
  it('la ruta usa solo paradas que existen, suma la distancia y arma el enlace con paradas intermedias', () => {
    const r = datosRutaTuristica({ modo: 'walking', paradas: ['a', 'falta', 'b', 'c'] });
    expect(r.paradas.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(r.km).toBeGreaterThan(0.5);
    expect(r.km).toBeLessThan(0.7);
    expect(r.enlace).toContain('origin=4.344,-74.361');
    expect(r.enlace).toContain('waypoints=4.3406%2C-74.3609');
    expect(r.enlace).toContain('travelmode=walking');
  });
  it('el pico y placa solo se publica con decreto y enlace https', () => {
    expect(
      datosPicoPlaca({
        fusagasuga: { texto: 'Lun a vie 6-9 a. m.', decreto: 'Decreto 1 de 2026', fuente_url: 'https://x.gov.co/d' },
        pasca: {},
      }).fusagasuga.decreto,
    ).toBe('Decreto 1 de 2026');
    expect(datosPicoPlaca({ fusagasuga: { texto: 'Lun a vie', decreto: '', fuente_url: 'https://x.gov.co' } })).toMatch(
      /decreto/,
    );
    expect(
      datosPicoPlaca({ fusagasuga: { texto: 'Lun a vie', decreto: 'Decreto 1', fuente_url: 'x.gov.co' } }),
    ).toMatch(/https/);
    expect(picoPlacaVigente({ pasca: { texto: 'x', decreto: 'D', fuente_url: 'http://x' } }, 'pasca')).toBeNull();
  });
  it('reconoce cajeros, bancos y parqueaderos públicos', () => {
    expect(esCajeroOBanco({ cat: 'tramite', nombre: 'Cajero Davivienda · Centro' })).toBe(true);
    expect(esCajeroOBanco({ cat: 'tramite', nombre: 'Alcaldía de Fusagasugá' })).toBe(false);
    expect(esParqueadero({ nombre: 'Parqueadero del Centro Comercial Manila' })).toBe(true);
    expect(esParqueadero({ nombre: 'Parqueadero de busetas' })).toBe(false);
  });
});

describe('Agenda: cada evento una sola vez (E1)', () => {
  const { sinRepetidos } = cargar(['norm', 'claveEvento', 'sinRepetidos']);
  const ini = new Date('2026-11-24T14:00:00-05:00').getTime();
  const expo = {
    titulo: 'Exposiciones de la Escuela de Artes Visuales EFAC',
    ini,
    lugar_nombre: 'Casona Quinta Balmoral',
  };
  it('quita las copias guardadas varias veces y deja los eventos distintos', () => {
    const l = [
      { id: 'a', ...expo },
      { id: 'b', ...expo },
      { id: 'c', ...expo, titulo: 'Exposiciones de la  Escuela de Artes Visuales efac' },
      { id: 'd', ...expo, titulo: 'Taller Tribu: gestión cultural' },
      { id: 'e', ...expo, ini: ini + 864e5 },
    ];
    expect(sinRepetidos(l).map(e => e.id)).toEqual(['a', 'd', 'e']);
  });
});

describe('fechaEvento: eventos en curso (E8)', () => {
  const { fechaEvento } = cargar(['horaTexto', 'horaEv', 'enCurso', 'fechaEvento'], {
    DIAS_EV: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    MESES3: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  });
  const expo = {
    ini: new Date('2026-11-24T14:00:00-05:00').getTime(),
    fin: new Date('2026-11-28T18:00:00-05:00').getTime(),
  };
  it('el 26 dice «En curso · hasta el sáb 28 de nov» y no «mar 24»', () => {
    vi.useFakeTimers();
    enColombia('2026-11-26T10:00');
    expect(fechaEvento(expo)).toBe('En curso · hasta el sáb 28 de nov');
  });
  it('antes de empezar muestra la fecha de inicio', () => {
    vi.useFakeTimers();
    enColombia('2026-11-23T10:00');
    expect(fechaEvento(expo)).toBe('mar 24 de nov · 2:00 p. m. al sáb 28 de nov');
  });
  it('un evento de un solo día en curso dice hasta qué hora', () => {
    vi.useFakeTimers();
    enColombia('2026-11-26T16:00');
    const taller = {
      ini: new Date('2026-11-26T15:00:00-05:00').getTime(),
      fin: new Date('2026-11-26T17:00:00-05:00').getTime(),
    };
    expect(fechaEvento(taller)).toBe('En curso · hasta las 5:00 p. m.');
  });
});

describe('Buscador tolerante: sinónimos, errores de escritura y orden (E2)', () => {
  // El directorio base real (datos.js); el orden secundario no importa aquí
  const { COMERCIOS_BASE } = cargar([], {}, ['COMERCIOS_BASE']);
  const b = cargar(
    [
      'norm',
      'raiz',
      'tokens',
      'NIVEL',
      'toleranciaDe',
      'distanciaEdicion',
      'gruposSinonimos',
      'sinonimosDe',
      'GRUPOS_SUB',
      'subDe',
      'nombreSub',
      'camposBusqueda',
      'camposDe',
      'nivelPalabra',
      'nivelCoincidencia',
      'coincide',
      'filtrarYOrdenar',
      'vocabularioBusqueda',
      'vocabulario',
      'quisisteDecir',
    ],
    { database: COMERCIOS_BASE, ordenar: l => l },
    ['CAT', 'SUBCATS', 'SINONIMOS'],
  );
  const buscar = q => b.filtrarYOrdenar([...COMERCIOS_BASE], q, 'recomendados');
  const esDrogueria = d => d.sub === 'salud' && /drog|farma|rebaja/i.test(d.nombre);

  it.each(['drogeria', 'farmacia', 'drogueria', 'Droguerías', 'farmasia'])('«%s» encuentra las droguerías', q => {
    const r = buscar(q);
    expect(r.filter(esDrogueria).length).toBeGreaterThanOrEqual(6);
    expect(r.map(d => d.nombre)).toContain('Farmacenter');
    expect(esDrogueria(r[0])).toBe(true);
  });
  it('«doctor» encuentra lugares de salud', () => {
    expect(buscar('doctor').filter(d => d.sub === 'salud').length).toBeGreaterThan(3);
  });
  it('«almuerzo» encuentra restaurantes y comidas', () => {
    expect(buscar('almuerzo').filter(d => d.sub === 'comidas').length).toBeGreaterThan(5);
  });
  it('«hotel» encuentra hospedaje', () => {
    expect(buscar('hotel').filter(d => d.cat === 'hospedaje').length).toBeGreaterThan(3);
  });
  it('«alcaldia» pone primero las alcaldías', () => {
    const r = buscar('alcaldia');
    expect(r[0].nombre).toMatch(/^Alcaldía/);
    expect(r.some(d => /Notaría/.test(d.nombre))).toBe(true);
  });
  it('ordena exactas, después parciales y al final aproximadas', () => {
    const lugares = [
      { id: 'aprox', nombre: 'Drogeria Mal Escrita', desc: '', cat: 'servicios', sub: 'salud' },
      { id: 'parcial', nombre: 'Superdroguerías', desc: '', cat: 'servicios', sub: 'salud' },
      { id: 'exacta', nombre: 'Droguería Central', desc: '', cat: 'servicios', sub: 'salud' },
    ];
    expect(b.filtrarYOrdenar(lugares, 'drogueria', 'recomendados').map(d => d.id)).toEqual([
      'exacta',
      'parcial',
      'aprox',
    ]);
  });
  it('tolerancia: nada en palabras cortas, 1 letra de 4 a 7 y 2 en las largas', () => {
    expect([
      b.toleranciaDe('pan'),
      b.toleranciaDe('cafe'),
      b.toleranciaDe('hospital'),
      b.toleranciaDe('drogueria'),
    ]).toEqual([0, 1, 2, 2]);
    expect(b.distanciaEdicion('drogeria', 'drogueria', 2)).toBe(1);
    expect(b.distanciaEdicion('pizza', 'plaza', 1)).toBe(2);
    expect(b.coincide({ nombre: 'Pan del día', desc: '', cat: 'comercio' }, 'par')).toBe(false);
  });
  it('«¿Quisiste decir…?» propone la palabra más parecida del directorio', () => {
    expect(b.quisisteDecir('restaurnte')).toBe('restaurante');
    expect(b.quisisteDecir('xyzqw')).toBe('');
  });
});

describe('Pregúntale a Fusa: tarjetas del directorio y salida a SOS (E3)', () => {
  const { COMERCIOS_BASE } = cargar([], {}, ['COMERCIOS_BASE']);
  const a = cargar(
    [
      'norm',
      'raiz',
      'tokens',
      'NIVEL',
      'toleranciaDe',
      'distanciaEdicion',
      'gruposSinonimos',
      'sinonimosDe',
      'GRUPOS_SUB',
      'subDe',
      'nombreSub',
      'camposBusqueda',
      'camposDe',
      'nivelPalabra',
      'nivelCoincidencia',
      'coincide',
      'VACIAS_ASIS',
      'RE_URGENCIA',
      'esUrgenciaAsis',
      'palabrasAsis',
      'busquedaDeAsis',
      'rangoApertura',
      'lugaresAsis',
    ],
    {
      database: COMERCIOS_BASE,
      estado: { mayorEdad: false, pos: null },
      ASIS: { maxTarjetas: 5 },
      municipioElegido: () => '',
      enMunicipio: () => true,
      ordenar: l => l,
      estadoApertura: () => null,
    },
    ['CAT', 'SUBCATS', 'SINONIMOS'],
  );
  it('«necesito una drogeria abierta cerca» muestra droguerías del directorio', () => {
    const l = a.lugaresAsis('necesito una drogeria abierta cerca');
    expect(l.length).toBe(5);
    expect(l.every(d => d.sub === 'salud')).toBe(true);
  });
  it.each(['necesito una drogeria abierta', 'me duele el pecho', 'urgencias del hospital', 'ambulancia'])(
    '«%s» es de salud o urgencia: lleva el botón de emergencias',
    q => expect(a.esUrgenciaAsis(q)).toBe(true),
  );
  it('una pregunta de comida no es urgencia', () => {
    expect(a.esUrgenciaAsis('¿dónde almuerzo?')).toBe(false);
  });
  it('propone buscar con las palabras útiles tal como se escribieron', () => {
    expect(a.palabrasAsis('¿Dónde venden xilófonos cerca?')).toEqual(['xilofono']);
    expect(a.busquedaDeAsis('¿Dónde venden xilófonos cerca?')).toBe('xilófonos');
  });
});
