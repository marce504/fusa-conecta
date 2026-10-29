# App Android de Fusa Conecta (Trusted Web Activity)

La app Android es **la misma PWA** de https://fusa-conecta.web.app abierta en pantalla completa con Chrome mediante una
*Trusted Web Activity* (TWA). Tiene el mismo código, las mismas funciones y los mismos datos que la web, y se actualiza al
publicar la web: no hay que subir un APK nuevo por cada cambio de la app.

| Dato | Valor |
|---|---|
| Nombre | Fusa Conecta |
| Paquete | `co.fusaconecta.app` |
| Versión | 1.0.0 (código 1) |
| Abre | `https://fusa-conecta.web.app/?origen=app` |
| Android mínimo | 7.0 (API 24, lo que exige la librería de Google para TWA); compila con la API 36 |
| Ícono | `img/icons/icon-512.png` e `icon-maskable-512.png` (los mismos de la PWA) |
| Pantalla de inicio | Fondo violeta `#6B4EFF` con el ícono, como el splash de la PWA |
| Barras del sistema | Blancas en modo claro y `#121420` en oscuro |
| Atajos | Emergencias (SOS) y Mapa de Fusa, como en el manifiesto web |
| Ubicación | Delegación de ubicación activada: el GPS de las rutas funciona dentro de la app |

## Cómo se generó

1. `twa-manifest.json` describe la app a partir del `manifest.json` de la PWA.
2. Con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) 1.24.1 se generó el proyecto Gradle de esta carpeta:
   ```bash
   npx @bubblewrap/cli@1.24.1 update --skipVersionUpgrade
   ```
   Ese comando también actualiza el proyecto si cambias `twa-manifest.json`, por ejemplo al subir la versión: `appVersionCode` debe aumentar en cada entrega a Google Play.
3. La compilación y la firma corren en GitHub Actions (`.github/workflows/android.yml`).

## Llave de firma (fuera del repositorio)

- **Archivo:** `C:\Users\Marcela\.fusa-conecta-firma\fusa-conecta.keystore`
- **Alias:** `fusaconecta`
- **Contraseña:** en `C:\Users\Marcela\.fusa-conecta-firma\LEEME-CONTRASENA.txt`
- **Huella SHA-256:** `EE:27:C7:C0:80:CC:CA:38:5C:6F:6F:C0:1D:51:A1:71:69:E0:E5:87:BC:79:4F:54:FE:AA:AD:EC:F2:FA:93:D6`

Haz una copia de esa carpeta en un lugar seguro, como una USB o un gestor de contraseñas. **Sin esa llave no se puede publicar
una actualización con el mismo paquete.** Si más adelante usas «Firma de apps de Google Play», Google te dará una segunda
huella; tendrás que agregarla a `.well-known/assetlinks.json`.

## Sin barra del navegador: `/.well-known/assetlinks.json`

`.well-known/assetlinks.json` (en la raíz del sitio) declara que el paquete `co.fusaconecta.app`, firmado con la huella de arriba,
puede abrir `fusa-conecta.web.app` en pantalla completa. `firebase.json` lo publica con `Content-Type: application/json`; antes,
la regla `**/.*` ignoraba todas las carpetas que empiezan por punto.

Comprobarlo después de publicar:

```bash
curl -s https://fusa-conecta.web.app/.well-known/assetlinks.json
```

```bash
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://fusa-conecta.web.app&relation=delegate_permission/common.handle_all_urls"
```

Si la huella no coincide, la app abre igual pero muestra la barra de Chrome arriba.

## Compilar el APK y el AAB (GitHub Actions)

Hazlo una sola vez. En https://github.com/marce504/fusa-conecta/settings/secrets/actions, toca **New repository secret** dos veces:

| Name | Secret |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Todo el contenido de `C:\Users\Marcela\.fusa-conecta-firma\keystore-base64-para-github.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | Todo el contenido de `C:\Users\Marcela\.fusa-conecta-firma\contrasena-para-github.txt` (solo la contraseña) |

Luego:

- **Probar:** abre Actions → **App Android** → **Run workflow**. En unos 5 minutos el artefacto **fusa-conecta-android** trae `fusa-conecta.apk` y `fusa-conecta.aab`.
- **Publicar con enlace de descarga:** crea una etiqueta `apk-v…` con la versión de `twa-manifest.json`. El APK queda en
  *Releases* (https://github.com/marce504/fusa-conecta/releases):
  ```bash
  git tag apk-v1.1.0
  ```
  ```bash
  git push origin apk-v1.1.0
  ```

| Versión | Qué cambió |
|---|---|
| 1.0.0 (`apk-v1.0.0`) | Primera versión: TWA de la PWA, atajos SOS y Mapa, ubicación delegada |
| 1.1.0 (`apk-v1.1.0`, `versionCode` 2) | Avisos al celular: `enableNotifications: true`. Los avisos salen como «Fusa Conecta», con el isotipo en blanco (`res/drawable/ic_notification_icon.xml`), y en Android 13 o superior la app pide el permiso `POST_NOTIFICATIONS` cuando la web lo pide. Atajo nuevo: Agenda (`?ir=agenda`) |

El proyecto se generó con Bubblewrap. Los cambios de 1.1.0 se hicieron a mano, igual que los haría `bubblewrap update`,
en `twa-manifest.json`, `app/build.gradle` y `AndroidManifest.xml`.

El proceso verifica que la huella del APK coincida con `assetlinks.json` y muestra el paquete y el nombre con `aapt2`.

## Instalar el APK de prueba

1. En el celular, descarga `fusa-conecta.apk` del artefacto o de *Releases*.
2. Ábrelo. Android pide permitir «Instalar apps desconocidas» para el navegador o el administrador de archivos: acéptalo solo para esto.
3. Abre **Fusa Conecta**. Debe verse sin la barra de direcciones de Chrome.

## Google Play (más adelante)

Para Google Play se sube el `fusa-conecta.aab`. La cuenta de desarrollador cuesta USD 25 una sola vez, y la decidimos después.
