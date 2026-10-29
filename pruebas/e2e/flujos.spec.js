// Flujos de extremo a extremo de la PWA en un celular (390×844), contra el emulador de Firebase.
import { expect, test } from '@playwright/test';
import { CLAVE, CUENTAS, CUPON, NEGOCIO } from './semilla.mjs';

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
  // Queda en la billetera: «Ver en mi billetera» → «Mostrar en caja» lo muestra en pantalla completa con el QR y el código
  const verBilletera = page.locator('#sheetDetalle [data-cupon]').first();
  await expect(verBilletera).toContainText('Ver en mi billetera');
  await verBilletera.click();
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
