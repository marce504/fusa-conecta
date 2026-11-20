// Flujos de extremo a extremo de la PWA en un celular (390×844), contra el emulador de Firebase.
import { expect, test } from '@playwright/test';
import { CLAVE, CUENTAS, CUPON, NEGOCIO, NEGOCIO_PASCA, poner } from './semilla.mjs';

const APP = '/?emulador';

// El aviso del emulador tapa la barra inferior en las capturas
async function sinAvisoEmulador(page) {
  await page.evaluate(() => document.querySelectorAll('.firebase-emulator-warning').forEach(e => e.remove()));
}
async function entrarComo(page, correo) {
  await page.evaluate(
    async ([c, k]) => {
      await window.firebase.auth().signOut();
      await window.firebase.auth().signInWithEmailAndPassword(c, k);
    },
    [correo, CLAVE],
  );
  await page.waitForFunction(
    () => typeof estado !== 'undefined' && estado.usuario && !estado.usuario.anonimo && estado.perfil,
  );
  await page.evaluate(() => window.ocultarSplash());
}

test('explorar: entrada → «Solo explorar» → buscar «café» y un negocio → ficha → WhatsApp', async ({ page }, info) => {
  await page.goto(APP);
  // La entrada muestra los botones cuando la app está lista
  const explorar = page.locator('#sInvitado');
  await expect(explorar).toBeVisible();
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('1-entrada.png') });
  await explorar.click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  // «Solo explorar» abre una sesión de invitado; se espera a que termine, como haría una persona antes de escribir
  await page.waitForFunction(() => !!auth.currentUser);
  await page.waitForTimeout(800);
  // Búsqueda sin tilde: «cafe» sugiere los lugares con «Café»
  await page.locator('#busqueda').fill('cafe');
  await expect(page.locator('#sugerencias button', { hasText: 'Museo del Café' })).toBeVisible();
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('2-busqueda-cafe.png') });
  // Un negocio registrado por su dueña (solo existe en el emulador) con WhatsApp
  await page.locator('#busqueda').fill('vivero de prueba');
  const resultado = page.locator('#sugerencias button', { hasText: NEGOCIO.nombre });
  await expect(resultado).toBeVisible();
  await resultado.click();
  const ficha = page.locator('#ovDetalle');
  await expect(ficha).toHaveClass(/abierto/);
  await expect(ficha).toContainText(NEGOCIO.nombre);
  await page.screenshot({ path: info.outputPath('3-ficha.png') });
  // WhatsApp abre wa.me con el número de Colombia y un mensaje que menciona Fusa Conecta
  // (se intercepta la petición para no salir a internet ni depender de la redirección de WhatsApp)
  let enlace = '';
  await page.context().route(/wa\.me/, ruta => {
    enlace = ruta.request().url();
    return ruta.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' });
  });
  await page.locator('#detWa').click();
  await expect.poll(() => enlace).toContain('wa.me');
  const url = new URL(enlace);
  expect(url.hostname).toBe('wa.me');
  expect(url.pathname).toBe('/573001234567');
  expect(decodeURIComponent(url.search)).toContain('te encontré en Fusa Conecta');
});

test('cupón: Ana lo obtiene → lo muestra con QR → la comerciante valida el código y lo canjea', async ({
  page,
}, info) => {
  await page.goto(APP);
  await page.waitForFunction(() => typeof arranque !== 'undefined' && arranque.listo);
  await entrarComo(page, CUENTAS.ana);
  // Ficha del negocio Premium con su cupón
  await page.evaluate(id => window.abrirDetalle(id), NEGOCIO.id);
  const obtener = page.locator('#sheetDetalle [data-cupon]').first();
  await expect(obtener).toContainText('Obtener cupón');
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('1-ficha-con-cupon.png') });
  await obtener.click();
  // Queda en la billetera: la ficha ofrece «Ver en mi billetera» y el botón Cupones de la barra muestra el globo
  await expect(page.locator('#sheetDetalle [data-cupon]').first()).toContainText('Ver en mi billetera');
  await expect(page.locator('#bnBadge')).toHaveText('1');
  // Se entra a la billetera por la barra inferior (Cupones ya no es el botón central)
  await page.locator('#cerrarDet').click();
  await page.locator('[data-bn="cupones"]').click();
  await expect(page.locator('[data-bn="cupones"]')).toHaveAttribute('aria-current', 'page');
  // «Mostrar en caja» lo muestra en pantalla completa con el QR y el código
  await page.locator('.cupon-bill [data-mostrar]').first().click();
  const qr = page.locator('#pcQR');
  await expect(qr).toBeVisible();
  await expect(qr.locator('img, svg, canvas:visible').first()).toBeVisible(); // la librería dibuja en canvas y muestra una imagen
  const codigo = (await page.locator('#pantallaCupon .codigo').innerText()).trim();
  expect(codigo).toMatch(/^FC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('2-cupon-con-qr.png') });
  await page.locator('#pcCerrar').click();
  // La comerciante entra, abre el escáner y escribe el código a mano
  await entrarComo(page, CUENTAS.rosa);
  await page.evaluate(() => window.navegar({ tipo: 'dashboard' }));
  await page.locator('#aEscanear').click();
  await page.locator('#escManual').click();
  await page.locator('#vCodigo').fill(codigo);
  await page.locator('#vValidar').click();
  await expect(page.locator('.esc-res')).toContainText('Cupón válido');
  await expect(page.locator('.esc-res')).toContainText(CUPON.descripcion);
  await page.screenshot({ path: info.outputPath('3-codigo-valido.png') });
  await page.locator('#escConfirmar').click();
  await expect(page.locator('.esc-res')).toContainText('Canje confirmado');
  await page.screenshot({ path: info.outputPath('4-canje-confirmado.png') });
  // Un segundo intento con el mismo código ya no es válido
  await page.locator('#escManual').click();
  await page.locator('#vCodigo').fill(codigo);
  await page.locator('#vValidar').click();
  await expect(page.locator('.esc-res')).toContainText('Ya fue canjeado');
});

test('SOS sin conexión: los números de emergencia funcionan en modo avión', async ({ page, context }, info) => {
  await page.goto(APP);
  // El service worker guarda la app la primera vez; desde la segunda carga la sirve aunque no haya internet
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  // Sin internet la entrada no espera a la nube: «Solo explorar» aparece y la app abre con lo guardado en el teléfono
  await expect(page.locator('#sInvitado')).toBeVisible();
  await page.locator('#sInvitado').click();
  const sos = page.locator('[data-sos]:visible').first();
  await expect(sos).toBeVisible();
  await sos.click();
  await expect(page.locator('#cuerpo')).toContainText('123');
  await expect(page.locator('#cuerpo')).toContainText('Bomberos');
  // Cada número tiene su botón de llamar (pide confirmación antes de marcar)
  const llamar = page.locator('[data-llamar]').first();
  await expect(llamar).toHaveAttribute('data-llamar', /^\d+$/);
  expect(await page.locator('[data-llamar]').count()).toBeGreaterThanOrEqual(7);
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('sos-sin-conexion.png') });
  await context.setOffline(false);
});

test('asistente: una pregunta con llamada a funciones y tarjetas del directorio', async ({ page }, info) => {
  await page.goto(APP);
  await page.waitForFunction(() => typeof arranque !== 'undefined' && arranque.listo);
  await page.evaluate(async () => {
    window.ocultarSplash();
    if (!auth.currentUser) await auth.signInAnonymously();
  });
  // Con E2E_IA_REAL=1 responde Gemini de verdad; si no, un modelo de prueba que pide la función buscarLugares
  // (así la prueba es repetible y no gasta la cuota de IA en cada Pull Request)
  if (!process.env.E2E_IA_REAL) {
    await page.evaluate(() => {
      window.contarPregunta = async () => 29;
      window.modeloAsistente = async () => ({
        startChat: () => {
          let vuelta = 0;
          return {
            sendMessage: async () => {
              vuelta += 1;
              return vuelta === 1
                ? {
                    response: {
                      functionCalls: () => [{ name: 'buscarLugares', args: { texto: 'vivero' } }],
                      text: () => '',
                    },
                  }
                : {
                    response: {
                      functionCalls: () => [],
                      text: () => 'Te recomiendo el Vivero de Prueba E2E, en el centro.',
                    },
                  };
            },
          };
        },
      });
    });
  }
  await page.evaluate(() => window.irAsistente());
  await page.locator('#asisTx').fill('vivero cerca');
  await page.locator('#asisEnviar').click();
  const respuesta = page.locator('.asis-msg.fusa').last();
  await expect(respuesta.locator('.asis-item').first()).toBeVisible({ timeout: 60_000 });
  await expect(respuesta).toContainText(/Vivero/);
  await expect(respuesta.locator('.asis-ia')).toBeVisible(); // recomienda lugares: lleva la nota de IA
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('asistente.png') });
});

// Entrada rápida (v1.2.0). Los tiempos se cuentan desde que se abrió la página (performance.now()).
test('entrada con sesión: se va en 3,5 s como máximo', async ({ page }, info) => {
  await page.goto(APP);
  await page.waitForFunction(() => typeof arranque !== 'undefined' && arranque.listo);
  await entrarComo(page, CUENTAS.ana);
  // Se anota el instante exacto en que la entrada recibe la clase «oculto»
  await page.addInitScript(() => {
    new MutationObserver((_, obs) => {
      const sp = document.getElementById('splash');
      if (sp && sp.classList.contains('oculto')) {
        window.entradaOculta = performance.now();
        obs.disconnect();
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.reload();
  await page.waitForFunction(() => window.entradaOculta > 0, null, { timeout: 10_000 });
  const ms = await page.evaluate(() => window.entradaOculta);
  info.annotations.push({ type: 'entrada con sesión (ms)', description: String(Math.round(ms)) });
  expect(ms).toBeLessThanOrEqual(3500);
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('1-inicio-con-sesion.png') });
});

test('entrada con sesión y la nube lenta: no la espera y se va a los 3 s', async ({ page }, info) => {
  await page.goto(APP);
  await page.waitForFunction(() => typeof arranque !== 'undefined' && arranque.listo);
  await entrarComo(page, CUENTAS.ana);
  // Sin copia del perfil ni del directorio, y Firestore tarda 6 s en responder
  await page.evaluate(() =>
    Object.keys(localStorage)
      .filter(k => /^fc_(perfil_|nube_ok)/.test(k))
      .forEach(k => localStorage.removeItem(k)),
  );
  await page.route(/:8099\//, async ruta => {
    await new Promise(r => {
      setTimeout(r, 6000);
    });
    await ruta.continue().catch(() => {});
  });
  await page.addInitScript(() => {
    new MutationObserver((_, obs) => {
      const sp = document.getElementById('splash');
      if (sp && sp.classList.contains('oculto')) {
        window.entradaOculta = performance.now();
        window.listaAlSalir = arranque.listo;
        obs.disconnect();
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.reload();
  await page.waitForFunction(() => window.entradaOculta > 0, null, { timeout: 10_000 });
  const { ms, lista } = await page.evaluate(() => ({ ms: window.entradaOculta, lista: window.listaAlSalir }));
  info.annotations.push({ type: 'entrada con la nube lenta (ms)', description: String(Math.round(ms)) });
  expect(lista).toBe(false);
  expect(ms).toBeGreaterThanOrEqual(2900);
  expect(ms).toBeLessThanOrEqual(3500);
});

test('entrada como invitado: «Registrarse» y «Solo explorar» visibles en 2,6 s como máximo', async ({ page }, info) => {
  await page.goto(APP);
  // Visible de verdad: la entrada está lista y la animación de los botones terminó (opacidad 1)
  await page.waitForFunction(
    () => {
      const cta = document.querySelector('.splash-cta');
      if (!cta) return false;
      const c = getComputedStyle(cta);
      return c.visibility === 'visible' && c.opacity === '1';
    },
    null,
    { timeout: 10_000, polling: 'raf' },
  );
  // Se cuenta desde la primera pintura (cuando la persona empieza a ver la entrada): antes, el teléfono descarga la página
  const { ms, pintura } = await page.evaluate(() => {
    const p = performance.getEntriesByName('first-paint')[0];
    const inicio = p ? p.startTime : 0;
    return { ms: performance.now() - inicio, pintura: inicio };
  });
  info.annotations.push({ type: 'primera pintura (ms)', description: String(Math.round(pintura)) });
  info.annotations.push({ type: 'botones de la entrada (ms)', description: String(Math.round(ms)) });
  expect(ms).toBeLessThanOrEqual(2600);
  await expect(page.locator('#sInvitado')).toBeVisible();
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('1-entrada-invitado.png') });
});

test('barra inferior: Mapa · Cupones · Inicio · Agenda · Perfil y Perfil → «Mis favoritos»', async ({ page }, info) => {
  await page.goto(APP);
  await page.waitForFunction(() => typeof arranque !== 'undefined' && arranque.listo);
  await entrarComo(page, CUENTAS.ana);
  await sinAvisoEmulador(page);
  const barra = page.locator('#bottomNav .bn-btn');
  await expect(page.locator('#bottomNav .bn-btn > span:last-child')).toHaveText([
    'Mapa',
    'Cupones',
    'Inicio',
    'Agenda',
    'Perfil',
  ]);
  // Inicio es el botón central grande
  await expect(page.locator('.bn-centro')).toHaveAttribute('data-bn', 'inicio');
  // Cada botón abre su pantalla y queda marcado (aria-current) como el único activo
  const pantallas = [
    ['mapa', 'mapa'],
    ['cupones', 'billetera'],
    ['inicio', 'lista'],
    ['agenda', 'agenda'],
    ['perfil', 'perfil'],
  ];
  for (const [boton, tipo] of pantallas) {
    await page.locator(`[data-bn="${boton}"]`).click();
    await expect.poll(() => page.evaluate(() => window.vistaActual().tipo)).toBe(tipo);
    await expect(page.locator('.bn-btn[aria-current="page"]')).toHaveAttribute('data-bn', boton);
    // Todos los botones tienen al menos 44×44 px de área táctil (WCAG 2.5.5)
    const cajas = await barra.evaluateAll(bs => bs.map(b => b.getBoundingClientRect()));
    for (const c of cajas) expect(Math.min(c.width, c.height)).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('#cuerpo h2').first()).toBeVisible();
  // La Agenda es la misma vista de «Ver agenda»
  await page.locator('[data-bn="agenda"]').click();
  await expect(page.locator('#cuerpo h2').first()).toHaveText('Qué hacer en Fusa y Pasca');
  await page.screenshot({ path: info.outputPath('1-agenda-desde-la-barra.png') });
  // Un favorito guardado desde la ficha (el corazón sigue igual) aparece en Perfil → «Mis favoritos» con su contador
  await page.evaluate(() => window.abrirDetalle('c30'));
  await page.locator('#detFav').click();
  await expect(page.locator('#detFav')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#cerrarDet').click();
  await page.locator('[data-bn="perfil"]').click();
  const misFavoritos = page.locator('#pfFavoritos');
  await expect(page.locator('#cuerpo .pf-item').first()).toHaveAttribute('id', 'pfFavoritos');
  await expect(misFavoritos).toContainText('1 guardado');
  await page.screenshot({ path: info.outputPath('2-perfil-mis-favoritos.png') });
  await misFavoritos.click();
  await expect(page.locator('#cuerpo')).toContainText('Mis favoritos');
  await expect(page.locator('#cuerpo')).toContainText('Hacienda Coloma');
  // Desde Perfil se marca la pestaña Perfil y hay «Volver»
  await expect(page.locator('.bn-btn[aria-current="page"]')).toHaveAttribute('data-bn', 'perfil');
  await expect(page.locator('#bVolver')).not.toHaveClass(/invisible/);
  await page.screenshot({ path: info.outputPath('3-mis-favoritos.png') });
  await page.locator('#bVolver').click();
  await expect.poll(() => page.evaluate(() => window.vistaActual().tipo)).toBe('perfil');
});

// Avisos al celular (v1.2.0). FCM no se puede probar sin un celular real: aquí se prueba lo que sí depende de la app
// (no pedir permiso al abrir, la pregunta después de registrar el negocio, las reglas de dispositivos y la campana).
test('avisos: sin permiso al abrir, reglas de dispositivos y aviso «Para ti» en la campana', async ({ page }, info) => {
  // Cuenta las veces que la app pide el permiso de notificaciones. El estado del permiso se fija a mano: Chromium sin
  // ventana (el del CI) lo trae bloqueado, y Chrome, por preguntar
  await page.addInitScript(() => {
    window.pidioPermiso = 0;
    window.permisoSimulado = 'default';
    if (window.Notification) {
      Object.defineProperty(window.Notification, 'permission', { get: () => window.permisoSimulado });
      window.Notification.requestPermission = async () => {
        window.pidioPermiso += 1;
        return 'default';
      };
    }
  });
  await page.goto(APP);
  await page.waitForFunction(() => typeof arranque !== 'undefined' && arranque.listo);
  await entrarComo(page, CUENTAS.rosa);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.pidioPermiso)).toBe(0);
  await sinAvisoEmulador(page);

  // Reglas: Rosa crea y borra sus dispositivos; no puede leerlos ni tocar los de otra persona
  const reglas = await page.evaluate(async () => {
    const db = window.firebase.firestore();
    const FV = window.firebase.firestore.FieldValue;
    const uid = window.firebase.auth().currentUser.uid;
    const mio = db.collection('usuarios').doc(uid).collection('dispositivos').doc('token-e2e');
    const intento = async p => p.then(() => 'ok').catch(e => e.code);
    return {
      uid,
      crear: await intento(
        mio.set({ plataforma: 'android', creado: FV.serverTimestamp(), ultimo_uso: FV.serverTimestamp() }),
      ),
      leer: await intento(mio.get()),
      campoDeMas: await intento(
        db
          .collection('usuarios')
          .doc(uid)
          .collection('dispositivos')
          .doc('token-2')
          .set({ plataforma: 'android', creado: FV.serverTimestamp(), ultimo_uso: FV.serverTimestamp(), rol: 'admin' }),
      ),
      ajeno: await intento(
        db
          .collection('usuarios')
          .doc('otra-persona')
          .collection('dispositivos')
          .doc('t')
          .set({ plataforma: 'android', creado: FV.serverTimestamp(), ultimo_uso: FV.serverTimestamp() }),
      ),
      escribirNovedad: await intento(
        db.collection('usuarios').doc(uid).collection('notificaciones').doc('falsa').set({ titulo: 'x' }),
      ),
      borrar: await intento(mio.delete()),
    };
  });
  expect(reglas).toMatchObject({
    crear: 'ok',
    leer: 'permission-denied',
    campoDeMas: 'permission-denied',
    ajeno: 'permission-denied',
    escribirNovedad: 'permission-denied',
    borrar: 'ok',
  });

  // La API de avisos deja la novedad en usuarios/{uid}/notificaciones (aquí, la semilla hace de API)
  await poner(`usuarios/${reglas.uid}/notificaciones/comercio-${NEGOCIO.id}-aprobado`, {
    tipo: 'comercio',
    ref_id: NEGOCIO.id,
    resultado: 'aprobado',
    titulo: 'Negocio aprobado',
    mensaje: `¡Tu negocio ${NEGOCIO.nombre} ya está publicado en Fusa Conecta!`,
    enlace: '#/mi-negocio',
    fecha_envio: new Date(),
    leida: false,
  });
  await expect(page.locator('#bNovedades')).toHaveAttribute('aria-label', /sin leer/);
  await page.locator('#bNovedades').click();
  const aviso = page.locator('#sheetGen [data-enlace="#/mi-negocio"]');
  await expect(aviso).toContainText(`¡Tu negocio ${NEGOCIO.nombre} ya está publicado en Fusa Conecta!`);
  await page.screenshot({ path: info.outputPath('1-campana-para-ti.png') });
  // Al tocarlo abre Mi negocio (Rosa tiene un negocio aprobado) y la novedad queda leída
  await aviso.click();
  await expect.poll(() => page.evaluate(() => window.vistaActual().tipo)).toBe('dashboard');
  await expect.poll(() => page.evaluate(() => estado.misAvisos.every(n => n.leida))).toBe(true);
  // Abrir el aviso no debe parecer «Atrás»: no aparece la pregunta de salir de la app
  await expect(page.locator('#ovConfirm')).not.toHaveClass(/abierto/);

  // Con el permiso bloqueado no se insiste: no aparece la pregunta
  await page.evaluate(() => {
    window.permisoSimulado = 'denied';
    window.ofrecerAvisoAprobacion('Vivero de Prueba E2E');
  });
  await expect(page.locator('#ovGen')).not.toHaveClass(/abierto/);
  // Después de registrar un negocio se ofrece el aviso (una sola vez) con «Sí, avisarme» y «Ahora no»
  await page.evaluate(() => {
    window.permisoSimulado = 'default';
    window.ofrecerAvisoAprobacion('Vivero de Prueba E2E');
  });
  const hoja = page.locator('#sheetGen');
  await expect(hoja).toContainText('¿Quieres que te avisemos aquí cuando tu negocio sea aprobado?');
  await expect(hoja.locator('#aaSi')).toHaveText('Sí, avisarme');
  await page.screenshot({ path: info.outputPath('2-pregunta-al-registrar.png') });
  await hoja.locator('#aaNo').click();
  await expect(page.locator('#ovGen')).not.toHaveClass(/abierto/);
  expect(await page.evaluate(() => window.pidioPermiso)).toBe(0);
});

// Pasca en Fusa Conecta (v1.3.0): el selector de municipio del Inicio
test('municipio: «Pasca» muestra solo Pasca y la invitación a publicar; «Fusa y Pasca» muestra los dos', async ({
  page,
}, info) => {
  await page.goto(APP);
  await page.locator('#sInvitado').click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  await page.waitForFunction(() => database.some(d => d.municipio === 'Pasca'));
  await sinAvisoEmulador(page);
  const selector = page.locator('#selMunicipio [data-selmun]');
  await expect(selector).toHaveText(['Fusa y Pasca', 'Fusagasugá', 'Pasca']);
  await expect(page.locator('#selMunicipio [data-selmun=""]')).toHaveAttribute('aria-checked', 'true');
  // Fusa y Pasca: la sección de Pasca y lugares de los dos municipios
  const seccion = page.locator('.seccion-pasca');
  await expect(seccion.locator('h2')).toHaveText('Pasca, puerta del Sumapaz');
  await expect(seccion).toContainText(NEGOCIO_PASCA.nombre);
  const municipios = () =>
    page.evaluate(() => [...new Set(window.itemsVisibles('todas', '', true).map(d => window.municipioDe(d)))].sort());
  expect(await municipios()).toEqual(['Fusagasugá', 'Pasca']);
  await expect(page.locator('#tEventos')).toHaveText('Qué hacer en Fusa y Pasca');
  // Pasca: solo lugares de Pasca y, como son pocos, «¿Tienes un negocio en Pasca?»
  await page.locator('#selMunicipio [data-selmun="Pasca"]').click();
  await expect(page.locator('#selMunicipio [data-selmun="Pasca"]')).toHaveAttribute('aria-checked', 'true');
  expect(await municipios()).toEqual(['Pasca']);
  await expect(page.locator('#todoFusa h2')).toHaveText('Todo Pasca');
  // v1.4.0: Pasca tiene más lugares oficiales; el negocio con dueña va primero en el carrusel de Pasca
  await expect(seccion.locator('.tarjeta').first()).toContainText(NEGOCIO_PASCA.nombre);
  await expect(page.locator('.grid-tc')).not.toContainText('Hacienda Coloma');
  await expect(seccion.locator('.tarjeta-publica')).toContainText('¿Tienes un negocio en Pasca?');
  // Lugares verificados de Pasca (parte 2) y el aviso de senderos
  await expect(seccion).toContainText('Alcaldía Municipal de Pasca');
  await expect(page.locator('#tRutas')).toHaveText('Rutas y senderos');
  await expect(page.locator('#cuerpo [data-grabar-ruta]')).toHaveText('Grabar mi recorrido');
  await page.screenshot({ path: info.outputPath('1-inicio-pasca.png') });
  // Ficha del páramo: aviso oficial de Parques Nacionales, fuentes y sin «Llamar» ni «Cómo llegar»
  await page.evaluate(() => window.abrirDetalle('c77'));
  const ficha = page.locator('#sheetDetalle');
  await expect(ficha.locator('.aviso-oficial')).toContainText('no está habilitado para el ecoturismo');
  await expect(ficha.locator('.aviso-oficial a')).toHaveAttribute('href', /parquesnacionales\.gov\.co/);
  await expect(ficha).toContainText('Parques Nacionales Naturales (13 de marzo de 2026)');
  await expect(ficha.locator('[data-tel], #detWa, #detLlegar')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('1b-ficha-paramo.png') });
  await page.locator('#cerrarDet').click();
  // Ficha de la Alcaldía: correo y fuente oficial, sin teléfono inventado
  await page.evaluate(() => window.abrirDetalle('c72'));
  await expect(ficha).toContainText('contactenos@pasca-cundinamarca.gov.co');
  await expect(ficha).toContainText('Alcaldía de Pasca · Turismo');
  await expect(ficha.locator('[data-tel]')).toHaveCount(0);
  await expect(ficha.locator('#detLlegar')).toBeVisible();
  await page.locator('#cerrarDet').click();
  // La elección queda guardada en el teléfono
  await page.reload();
  await page.waitForFunction(() => typeof arranque !== 'undefined' && arranque.listo);
  await page.evaluate(() => window.ocultarSplash());
  await sinAvisoEmulador(page);
  await expect(page.locator('#selMunicipio [data-selmun="Pasca"]')).toHaveAttribute('aria-checked', 'true');
  // «Publicar» abre el registro (pide cuenta a un invitado)
  await page.locator('[data-pasca-negocio]').click();
  await expect(page.locator('#ovLogin')).toHaveClass(/abierto/);
  await page.locator('#ovLogin [data-cerrar], #ovLogin .cerrar').first().click();
  // El mapa se centra en Pasca
  await page.locator('[data-bn="mapa"]').click();
  await expect(page.locator('.mapa-head h2')).toHaveText('Mapa de Pasca');
  await expect(page.locator('#mapaIrPasca')).toBeVisible();
  await page.screenshot({ path: info.outputPath('2-mapa-pasca.png') });
  // Fusa y Pasca de nuevo
  await page.locator('[data-bn="inicio"]').click();
  await page.locator('#selMunicipio [data-selmun=""]').click();
  expect(await municipios()).toEqual(['Fusagasugá', 'Pasca']);
  await page.screenshot({ path: info.outputPath('3-inicio-fusa-y-pasca.png') });
});

// Invitación de organizador (v1.3.0): el enlace abre «Crea tu cuenta» con el correo invitado
test('invitación de organizador: el enlace abre el registro con el correo escrito', async ({ page }, info) => {
  const correo = 'cultura.pasca.e2e@fusa.test';
  await page.goto(`${APP}&organizador=${encodeURIComponent(correo)}`);
  await expect(page.locator('#ovLogin')).toHaveClass(/abierto/);
  await expect(page.locator('#loginTitulo')).toHaveText('Crea tu cuenta');
  await expect(page.locator('#mail')).toHaveValue(correo);
  await expect(page.locator('#loginAviso')).toContainText('Invitación para publicar los eventos');
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('1-registro-invitacion.png') });
  // El mensaje que copia el admin trae ese mismo enlace
  const mensaje = await page.evaluate(c => window.mensajeInvitacion(c), correo);
  expect(mensaje).toContain(`https://fusa-conecta.web.app/?organizador=${encodeURIComponent(correo)}`);
});

// v1.4.0: el admin sube una foto a un lugar del directorio sin perder su fuente, su crédito ni su horario
test('admin: foto nueva en un lugar del directorio, con su fuente, crédito y horario', async ({ page }, info) => {
  await page.goto(APP);
  await page.locator('#sInvitado').click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  await entrarComo(page, CUENTAS.admin);
  await sinAvisoEmulador(page);
  await page.waitForFunction(() => estado.perfil && estado.perfil.rol === 'admin');
  await page.evaluate(() => window.abrirFormComercio(window.buscar('c29')));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQ0lEQVR4nO3PQQ0AIBDAsAP/nuEFCZZsrNvO7t3tGBEREREREREREREREREREREREREREREREREREREREREREfnfAR8BAWEB06p/AAAAAElFTkSuQmCC',
    'base64',
  );
  for (let paso = 1; paso < 5; paso++) {
    if (paso === 4) {
      await page.locator('#wFotos').setInputFiles({ name: 'iglesia.png', mimeType: 'image/png', buffer: png });
      await expect(page.locator('#wGaleria .foto-tile img')).toHaveCount(2);
    }
    await page.locator('#wSig').click();
  }
  await page.locator('#wEnviar').click();
  await expect(page.locator('#toast')).toContainText('Ficha actualizada');
  await page.waitForFunction(() => window.buscar('c29').fotos.length === 2);
  const d = await page.evaluate(() => {
    const x = window.buscar('c29');
    return { fuentes: x.fuentes, credito: x.foto_credito, horario: x.horario, dias: x.dias };
  });
  expect(d.fuentes[0].url).toContain('openstreetmap.org');
  expect(d.credito.licencia).toBe('CC BY-SA 4.0');
  expect(d.horario).toBe('Según horario misas');
  expect(d.dias || []).toEqual([]);
  await page.evaluate(() => window.abrirDetalle('c29'));
  const ficha = page.locator('#sheetDetalle');
  await expect(ficha).toContainText('OpenStreetMap');
  await expect(ficha).toContainText('CC BY-SA 4.0');
  await expect(ficha).not.toContainText('Lun-Sáb');
  // Trámites y turismo no se reclaman; un negocio del directorio sí
  await expect(ficha.locator('#bReclamar')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('admin-foto-c29.png') });
  await page.locator('#cerrarDet').click();
  await page.evaluate(() => window.abrirDetalle(database.find(x => x.nombre === 'Paneton').id));
  await expect(page.locator('#sheetDetalle #bReclamar')).toBeVisible();
});

// v1.4.5: el admin escribe por WhatsApp a un negocio del directorio y queda el seguimiento
test('admin: contactar un negocio por WhatsApp desde el panel y anotar el seguimiento', async ({ page }, info) => {
  await page.goto(APP);
  await page.locator('#sInvitado').click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  await entrarComo(page, CUENTAS.admin);
  await sinAvisoEmulador(page);
  await page.waitForFunction(() => estado.perfil && estado.perfil.rol === 'admin');
  await page.evaluate(() => {
    estado.admin.tab = 'contactar';
    window.navegar({ tipo: 'admin' });
  });
  const fila = page.locator('.adm-fila.contacto').first();
  await expect(fila).toBeVisible({ timeout: 20000 });
  const nombre = (await fila.locator('b').textContent()).trim();
  await expect(page.locator('.adm-cuerpo')).toContainText('Premium gratis hasta el 30 de abril de 2027');
  // No se abre WhatsApp de verdad: se guarda el enlace que abriría
  await page.evaluate(() => {
    window.abiertosWa = [];
    window.open = u => {
      window.abiertosWa.push(u);
      return null;
    };
  });
  await fila.locator('[data-cwa]').click();
  const enlace = await page.evaluate(() => window.abiertosWa[0]);
  expect(enlace).toMatch(/^https:\/\/wa\.me\/573\d{9}\?text=/);
  const texto = decodeURIComponent(enlace.split('?text=')[1]);
  expect(texto).toContain('¿hablo con ' + nombre + '?');
  expect(texto).toContain('fusa-conecta.web.app/#/lugar/c');
  // Queda en «Mensaje enviado» y se guarda en contactos/{id} (reglas: solo el admin)
  await page.locator('[data-cfiltro="enviado"]').click();
  await expect(page.locator('.adm-fila.contacto').first()).toContainText(nombre);
  const guardado = await page.evaluate(async () => {
    const s = await window.firebase.firestore().collection('contactos').get();
    return s.docs.map(d => d.data().estado);
  });
  expect(guardado).toEqual(['enviado']);
  await page.screenshot({ path: info.outputPath('admin-contactar.png') });
  // Modo rápido: escribe al siguiente, salta otro y termina
  await page.locator('[data-cfiltro="pendiente"]').click();
  await page.locator('#cRapido').click();
  const rapido = page.locator('.contacto-rapido');
  await expect(rapido).toContainText('Hoy: 1 de 25');
  const primero = (await rapido.locator('.cr-sig b').textContent()).trim();
  page.on('dialog', d => d.accept());
  await page.evaluate(() => {
    window.confirmar = async () => true; // fuera del horario de la Ley 2300 la app pide confirmar
  });
  await rapido.locator('[data-crapido="escribir"]').click();
  await expect(rapido).toContainText('Hoy: 2 de 25');
  await expect(rapido).toContainText('Listo: ' + primero);
  const segundo = (await rapido.locator('.cr-sig b').textContent()).trim();
  expect(segundo).not.toBe(primero);
  await rapido.locator('[data-crapido="saltar"]').click();
  await expect(rapido.locator('.cr-sig b')).not.toHaveText(segundo);
  expect(await page.evaluate(() => window.abiertosWa.length)).toBe(2);
  await page.screenshot({ path: info.outputPath('admin-contactar-rapido.png') });
  await rapido.locator('[data-crapido="terminar"]').click();
  await expect(page.locator('.contacto-rapido')).toHaveCount(0);
});

// v89: alertas municipales. Solo el admin publica (con fuente https); se ven en el inicio y en Emergencias
test('alertas: el admin publica una alerta, se ve en el inicio y nadie más puede publicar', async ({ page }, info) => {
  await page.goto(APP);
  await page.locator('#sInvitado').click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  await entrarComo(page, CUENTAS.admin);
  await sinAvisoEmulador(page);
  await page.waitForFunction(() => estado.perfil && estado.perfil.rol === 'admin');
  await page.evaluate(() => {
    estado.admin.tab = 'emergencias';
    window.navegar({ tipo: 'admin' });
  });
  await page.locator('#alTipo').selectOption('agua');
  await page.locator('#alTitulo').fill('Corte de agua de prueba E2E');
  await page.locator('#alMensaje').fill('Mañana de 8 a. m. a 12 m. por arreglos de la red.');
  await page.locator('#alFuente').fill('Fuente de prueba');
  await page.locator('#alUrl').fill('http://sin-https.test');
  await page.locator('#alPush').uncheck();
  await page.locator('#alPublicar').click();
  await expect(page.locator('#toast')).toContainText('https');
  await page.locator('#alUrl').fill('https://ejemplo.test/aviso');
  await page.locator('#alPublicar').click();
  await expect(page.locator('#toast')).toContainText('Alerta publicada');
  await page.screenshot({ path: info.outputPath('alerta-admin.png') });
  // Reglas: Ana no puede publicar ni retirar; sin fuente https tampoco el admin
  const reglas = await page.evaluate(async () => {
    const fs = window.firebase.firestore();
    const base = {
      titulo: 'Falsa',
      mensaje: 'Una alerta que no es oficial.',
      tipo: 'otro',
      municipio: 'Ambos',
      fuente: 'Nadie',
      fuente_url: 'https://x.test',
      vence: window.firebase.firestore.Timestamp.fromMillis(Date.now() + 3600e3),
      estado: 'publicada',
      por: window.firebase.auth().currentUser.uid,
    };
    const intentar = async p => p.then(() => 'ok').catch(e => e.code);
    return { adminSinHttps: await intentar(fs.collection('alertas').add({ ...base, fuente_url: 'http://x.test' })) };
  });
  expect(reglas.adminSinHttps).toBe('permission-denied');
  await entrarComo(page, CUENTAS.ana);
  const ana = await page.evaluate(async () => {
    const fs = window.firebase.firestore();
    const s = await fs.collection('alertas').where('estado', '==', 'publicada').get();
    const id = s.docs[0].id;
    const intentar = async p => p.then(() => 'ok').catch(e => e.code);
    return {
      lee: s.size,
      crea: await intentar(
        fs.collection('alertas').add({
          titulo: 'Falsa',
          mensaje: 'Una alerta que no es oficial.',
          tipo: 'otro',
          municipio: 'Ambos',
          fuente: 'Nadie',
          fuente_url: 'https://x.test',
          vence: window.firebase.firestore.Timestamp.fromMillis(Date.now() + 3600e3),
          estado: 'publicada',
          por: window.firebase.auth().currentUser.uid,
        }),
      ),
      retira: await intentar(fs.collection('alertas').doc(id).update({ estado: 'retirada' })),
      envios: await intentar(fs.collection('alertas').doc(id).collection('envios').doc('push').get()),
    };
  });
  expect(ana).toEqual({ lee: 1, crea: 'permission-denied', retira: 'permission-denied', envios: 'permission-denied' });
  // En el inicio y en Emergencias
  await page.evaluate(() => window.navegar({ tipo: 'lista', cat: 'todas' }));
  const alerta = page.locator('#cuerpo .alerta-muni').first();
  await expect(alerta).toContainText('Corte de agua de prueba E2E');
  await expect(alerta).toContainText('Fuente de prueba');
  await page.screenshot({ path: info.outputPath('alerta-inicio.png') });
  await alerta.locator('[data-cerraralerta]').click();
  await expect(page.locator('#cuerpo .alerta-muni')).toHaveCount(0);
  await page.evaluate(() => window.navegar({ tipo: 'sos' }));
  await expect(page.locator('#cuerpo .alerta-muni')).toContainText('Corte de agua de prueba E2E');
});

// v90: horarios de transporte. Solo el admin los publica, con fuente y fecha; se ven en «Cómo moverse»
test('transporte: el admin publica un horario con su fuente y se ve en «Cómo moverse»', async ({ page }, info) => {
  await page.goto(APP);
  await page.locator('#sInvitado').click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  // Sin horarios publicados: lo dice en vez de inventar
  await page.evaluate(() => window.navegar({ tipo: 'transporte' }));
  await expect(page.locator('#cuerpo')).toContainText('Aún no tenemos horarios verificados');
  await expect(page.locator('#cuerpo')).toContainText('Terminal de Transporte de Fusagasugá');
  await entrarComo(page, CUENTAS.admin);
  await sinAvisoEmulador(page);
  await page.waitForFunction(() => estado.perfil && estado.perfil.rol === 'admin');
  await page.evaluate(() => {
    estado.admin.tab = 'transporte';
    window.navegar({ tipo: 'admin' });
  });
  await page.locator('#trEmpresa').fill('Empresa de prueba E2E');
  await page.locator('#trDestino').fill('Bogotá');
  await page.locator('#trSalidas').fill('Cada 30 min, de 5:00 a. m. a 8:00 p. m.');
  await page.locator('#trFuente').fill('Página de prueba');
  await page.locator('#trUrl').fill('https://ejemplo.test/horarios');
  await page.locator('#trGuardar').click();
  await expect(page.locator('#toast')).toContainText('Horario publicado');
  await entrarComo(page, CUENTAS.ana);
  const ana = await page.evaluate(async () => {
    const fs = window.firebase.firestore();
    const s = await fs.collection('transporte').where('activo', '==', true).get();
    const intentar = async p => p.then(() => 'ok').catch(e => e.code);
    return {
      lee: s.size,
      borra: await intentar(fs.collection('transporte').doc(s.docs[0].id).delete()),
      crea: await intentar(
        fs.collection('transporte').add({
          empresa: 'Falsa',
          origen: 'Fusagasugá',
          destino: 'Pasca',
          salidas: 'Siempre',
          fuente: 'Nadie',
          fuente_url: 'https://x.test',
          verificado: window.firebase.firestore.Timestamp.now(),
          activo: true,
        }),
      ),
    };
  });
  expect(ana).toEqual({ lee: 1, borra: 'permission-denied', crea: 'permission-denied' });
  await page.evaluate(() => window.navegar({ tipo: 'transporte' }));
  const ruta = page.locator('#cuerpo .ruta-tr');
  await expect(ruta).toContainText('Fusagasugá → Bogotá');
  await expect(ruta).toContainText('Empresa de prueba E2E');
  await expect(ruta).toContainText('Página de prueba');
  await page.screenshot({ path: info.outputPath('transporte.png') });
});

// v91: servicios a domicilio. El dueño lo marca en su ficha; nadie califica su propio negocio
test('a domicilio: la dueña lo marca, aparece en el filtro y no puede calificarse a sí misma', async ({
  page,
}, info) => {
  await page.goto(APP);
  await page.locator('#sInvitado').click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  await entrarComo(page, CUENTAS.rosa);
  await sinAvisoEmulador(page);
  await page.waitForFunction(id => window.buscar(id), NEGOCIO.id);
  await page.evaluate(id => window.abrirFormComercio(window.buscar(id), { paso: 2 }), NEGOCIO.id);
  await page.locator('#wDomi').check();
  await expect(page.locator('#wZona')).toBeVisible();
  await page.locator('#wZona').fill('Todo Fusagasugá y Chinauta');
  await page.screenshot({ path: info.outputPath('domicilio-registro.png') });
  for (let paso = 2; paso < 5; paso++) await page.locator('#wSig').click();
  await page.locator('#wEnviar').click();
  await expect(page.locator('#toast')).toBeVisible();
  const guardado = await page.evaluate(async id => {
    const s = await window.firebase.firestore().collection('comercios').doc(id).get();
    return { a: s.data().a_domicilio, z: s.data().zona_cobertura };
  }, NEGOCIO.id);
  expect(guardado).toEqual({ a: true, z: 'Todo Fusagasugá y Chinauta' });
  // Regla: Rosa no puede calificar su propio negocio; Ana sí
  const propia = await page.evaluate(async id => {
    const uid = window.firebase.auth().currentUser.uid;
    return window.firebase
      .firestore()
      .collection('calificaciones')
      .doc(id + '_' + uid)
      .set({ comercio_id: id, usuario_uid: uid, estrellas: 5, comentario: 'El mejor' })
      .then(() => 'ok')
      .catch(e => e.code);
  }, NEGOCIO.id);
  expect(propia).toBe('permission-denied');
  await entrarComo(page, CUENTAS.ana);
  const ana = await page.evaluate(async id => {
    const uid = window.firebase.auth().currentUser.uid;
    return window.firebase
      .firestore()
      .collection('calificaciones')
      .doc(id + '_' + uid)
      .set({ comercio_id: id, usuario_uid: uid, estrellas: 4, comentario: 'Muy amables' })
      .then(() => 'ok')
      .catch(e => e.code);
  }, NEGOCIO.id);
  expect(ana).toBe('ok');
  // El filtro «A domicilio» lo muestra y la ficha dice las zonas
  await page.waitForFunction(id => window.aDomicilio(window.buscar(id)), NEGOCIO.id);
  const enFiltro = await page.evaluate(
    id => window.itemsVisibles('todas', '', true, { ...estado.filtros, domicilio: true }).some(d => d.id === id),
    NEGOCIO.id,
  );
  expect(enFiltro).toBe(true);
  await page.evaluate(id => window.abrirDetalle(id), NEGOCIO.id);
  await expect(page.locator('#sheetDetalle')).toContainText('Todo Fusagasugá y Chinauta');
  await page.screenshot({ path: info.outputPath('domicilio-ficha.png') });
});

// v92: mercado campesino. Las fechas salen de la Agenda; las plazas son lugares reales del directorio
test('mercado campesino: plazas del directorio y el próximo mercado de la agenda en Campo y en el inicio', async ({
  page,
}, info) => {
  await page.goto(APP);
  await page.locator('#sInvitado').click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  await page.evaluate(() => window.navegar({ tipo: 'lista', cat: 'campo' }));
  const sec = page.locator('#cuerpo .mercado-c');
  await expect(sec).toContainText('No hay mercados campesinos anunciados');
  await expect(sec).toContainText('Plaza de Mercado de Pasca');
  // Un evento publicado en la agenda (solo en el emulador)
  const ini = Date.now() + 3 * 24 * 3600e3;
  await poner('eventos/e2e-mercado', {
    titulo: 'Mercado Campesino de prueba E2E',
    descripcion: 'Productores de la región.',
    estado: 'publicado',
    categoria: 'feria',
    tipo: 'plan',
    municipio: 'Fusagasugá',
    lugar_nombre: 'Parque principal',
    fecha_inicio: new Date(ini),
    fecha_fin: new Date(ini + 6 * 3600e3),
  });
  await page.waitForFunction(() => mercadosCampesinos().length === 1);
  await page.evaluate(() => window.render(true));
  await expect(sec).toContainText('Mercado Campesino de prueba E2E');
  await page.screenshot({ path: info.outputPath('mercado-campo.png') });
  await page.evaluate(() => window.navegar({ tipo: 'lista', cat: 'todas' }));
  await expect(page.locator('#cuerpo')).toContainText('Mercado campesino:');
});

// v93: menú y pedidos por WhatsApp. La dueña arma el menú; el cliente elige y se abre WhatsApp con el pedido
test('menú: la dueña lo guarda y el cliente arma un pedido que se abre en WhatsApp', async ({ page }, info) => {
  await page.goto(APP);
  await page.locator('#sInvitado').click();
  await expect(page.locator('#splash')).toHaveClass(/oculto/);
  await entrarComo(page, CUENTAS.rosa);
  await sinAvisoEmulador(page);
  await page.waitForFunction(id => window.buscar(id), NEGOCIO.id);
  await page.evaluate(() => window.navegar({ tipo: 'dashboard' }));
  await page.locator('#aMenu').click();
  await page.locator('[data-mi="0"][data-k="n"]').fill('Orquídea mini');
  await page.locator('[data-mi="0"][data-k="p"]').fill('25000');
  await page.locator('#mAgregar').click();
  await page.locator('[data-mi="1"][data-k="n"]').fill('Abono orgánico');
  await page.locator('[data-mi="1"][data-k="p"]').fill('8000');
  await page.screenshot({ path: info.outputPath('menu-editor.png') });
  await page.locator('#mGuardar').click();
  await expect(page.locator('#toast')).toContainText('Menú guardado: 2 productos');
  // Las reglas no dejan guardar más de 40 productos
  const demasiado = await page.evaluate(async id => {
    const menu = Array.from({ length: 41 }, (_, i) => ({ n: 'P' + i, p: 1, d: '', x: true }));
    return window.firebase
      .firestore()
      .collection('comercios')
      .doc(id)
      .update({ menu })
      .then(() => 'ok')
      .catch(e => e.code);
  }, NEGOCIO.id);
  expect(demasiado).toBe('permission-denied');
  await entrarComo(page, CUENTAS.ana);
  await page.waitForFunction(id => (window.buscar(id).menu || []).length === 2, NEGOCIO.id);
  await page.evaluate(() => {
    window.abiertosWa = [];
    window.open = u => {
      window.abiertosWa.push(u);
      return null;
    };
  });
  await page.evaluate(id => window.abrirDetalle(id), NEGOCIO.id);
  const menu = page.locator('#sheetDetalle .menu-ficha');
  await expect(menu).toContainText('Orquídea mini');
  await expect(page.locator('#mfPedir')).toBeDisabled();
  await menu.locator('[data-mas="0"]').click();
  await menu.locator('[data-mas="0"]').click();
  await menu.locator('[data-mas="1"]').click();
  await expect(page.locator('#mfPedir')).toContainText('3 productos · $ 58.000');
  await page.locator('#mfNota').fill('Para recoger el sábado');
  await page.screenshot({ path: info.outputPath('menu-ficha.png') });
  await page.locator('#mfPedir').click();
  const enlace = await page.evaluate(() => window.abiertosWa[0]);
  expect(enlace).toMatch(/^https:\/\/wa\.me\/573\d{9}\?text=/);
  const texto = decodeURIComponent(enlace.split('?text=')[1]);
  expect(texto).toContain('2 × Orquídea mini ($ 25.000) = $ 50.000');
  expect(texto).toContain('Total: $ 58.000');
  expect(texto).toContain('Nota: Para recoger el sábado');
});
