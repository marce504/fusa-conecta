# Integración continua y despliegue

## Flujos de GitHub Actions

| Flujo | Cuándo | Qué hace |
|---|---|---|
| `ci.yml` · Integración continua | Cada Pull Request a `main` o `develop`, cada push a esas ramas y a mano | Ver la tabla de abajo |
| `agenda.yml` · Agenda automática | 6:00 a. m., cada 15 min (pedidos desde la app) y a mano | Procesos en Python: agenda y limpieza diaria (`automatizacion/`) |
| `android.yml` · App Android | A mano y con etiquetas `apk-v*` | Compila y firma el APK y el AAB; con la etiqueta los publica en Releases |

Trabajos de `ci.yml`:

| Trabajo | Qué revisa |
|---|---|
| **javascript** | ESLint (0 advertencias), Prettier, sintaxis de la PWA y que `api/app/datos_base.json` esté al día con `datos.js` |
| **python** | black, flake8 y pytest de la API y de los procesos. Los resultados en JUnit XML quedan como artefacto |
| **integracion** | La API y los procesos contra los emuladores de Firestore y Auth (`firebase emulators:exec`, proyecto `demo-fusa-conecta`: nunca toca producción) |
| **commits** | En los Pull Requests: formato Conventional Commits de cada commit y del título |
| **desplegar** | Solo en push a `main` y si todo lo anterior pasó: Firebase Hosting y reglas de Firestore, y comprueba que la versión publicada sea la del repositorio |

La **API** la despliega Render solo cuando la integración continua de ese commit termina en verde
(`render.yaml`: `autoDeployTrigger: checksPass`).

## Configuración que hace la dueña del proyecto (una sola vez)

### 1. Despliegue automático de la PWA (secreto `FIREBASE_DEPLOY_SA`)

Mientras no exista este secreto, el trabajo **desplegar** avisa y no publica: la publicación sigue siendo manual.

1. Entra a https://console.cloud.google.com/iam-admin/serviceaccounts?project=fusa-conecta → **Crear cuenta de servicio** → nombre `despliegue-github` → **Crear y continuar**.
2. Agrega estos tres roles y toca **Listo**:
   - **Administrador de Firebase Hosting**
   - **Administrador de reglas de Firebase**
   - **Consumidor de Service Usage**
3. Ábrela → **Claves** → **Agregar clave** → **JSON**.
4. En https://github.com/marce504/fusa-conecta/settings/secrets/actions toca **New repository secret** → Name `FIREBASE_DEPLOY_SA` → pega todo el JSON → **Add secret**. Luego borra el archivo.

### 2. Proteger la rama `main`

En https://github.com/marce504/fusa-conecta/settings/branches toca **Add branch ruleset** (o *Add rule*) para `main` y activa:
- **Require a pull request before merging**.
- **Require status checks to pass**, eligiendo «JavaScript (ESLint + Prettier)», «Python (black + flake8 + pytest)» e «Integración (emulador de Firestore y Auth)».
- **Block force pushes**.

Haz lo mismo con `develop` si quieres revisar también lo que llega a esa rama.

## Versiones

- Las etiquetas `vMAYOR.MENOR.PARCHE` marcan cada versión del proyecto (`CHANGELOG.md`).
- Las etiquetas `apk-vX.Y.Z` publican el APK.
- Las versiones anteriores se etiquetaron hacia atrás según el historial de commits, desde v0.1.0 (prototipo de junio) hasta v0.9.0 (app Android, API y procesos en Python).
