// Flujos de extremo a extremo de la PWA en un celular (390×844), contra el emulador de Firebase.
import { expect, test } from '@playwright/test';
import { CLAVE, CUENTAS, CUPON, NEGOCIO, poner } from './semilla.mjs';

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

test('explorar: entrada → «Solo explorar» → buscar «café» → ficha → WhatsApp', async ({ page }, info) => {
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
  const resultado = page.locator('#sugerencias button', { hasText: 'Café Sutagao' });
  await expect(resultado).toBeVisible();
  await sinAvisoEmulador(page);
  await page.screenshot({ path: info.outputPath('2-busqueda-cafe.png') });
  await resultado.click();
  const ficha = page.locator('#ovDetalle');
  await expect(ficha).toHaveClass(/abierto/);
  await expect(ficha).toContainText('Café Sutagao');
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
  expect(url.pathname).toBe('/573101110001');
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
                      functionCalls: () => [{ name: 'buscarLugares', args: { texto: 'panaderia' } }],
                      text: () => '',
                    },
                  }
                : {
                    response: {
                      functionCalls: () => [],
                      text: () => 'Te recomiendo Panadería y Café El Cedro, en el centro.',
                    },
                  };
            },
          };
        },
      });
    });
  }
  await page.evaluate(() => window.irAsistente());
  await page.locator('#asisTx').fill('panadería cerca');
  await page.locator('#asisEnviar').click();
  const respuesta = page.locator('.asis-msg.fusa').last();
  await expect(respuesta.locator('.asis-item').first()).toBeVisible({ timeout: 60_000 });
  await expect(respuesta).toContainText(/Panader/);
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
  await expect(page.locator('#cuerpo h2').first()).toHaveText('Qué hacer en Fusa');
  await page.screenshot({ path: info.outputPath('1-agenda-desde-la-barra.png') });
  // Un favorito guardado desde la ficha (el corazón sigue igual) aparece en Perfil → «Mis favoritos» con su contador
  await page.evaluate(() => window.abrirDetalle('c14'));
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
  await expect(page.locator('#cuerpo')).toContainText('Panadería y Café El Cedro');
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
