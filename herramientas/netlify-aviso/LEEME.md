# Aviso en la dirección vieja (fusa-conecta.netlify.app)

Preparado el 2026-10-23, **sin publicar**: Netlify no acepta despliegues hasta que se renueven los créditos del plan Free (**2026-11-12**).
Firebase ignora esta carpeta (`herramientas/**` en `firebase.json`), así que no aparece en fusa-conecta.web.app.

## Qué hace

| Dirección vieja | Resultado |
|---|---|
| `/` y `/?origen=app` (la app instalada abre así) | Página "Fusa Conecta se mudó" con el botón a fusa-conecta.web.app y cómo reinstalarla |
| `/sw.js` | Service worker que borra la app vieja guardada en el teléfono, se da de baja y recarga para mostrar el aviso |
| Cualquier otra (`/lugar/c12`, QR de cupones…) | Redirección permanente (301) a la misma ruta en fusa-conecta.web.app |

Las reglas están en `_redirects` (raíz del repositorio).

## Publicarlo (después del 2026-11-12)

El sitio de Netlify (`3961d7d1-d919-4fa8-83e6-53e31c34f8da`) está ligado a GitHub y publica la raíz del repositorio.
**El primer push a GitHub después de la renovación lo publica solo.** Si quieres hacerlo a mano:

```bash
npx netlify-cli deploy --prod --dir . --site 3961d7d1-d919-4fa8-83e6-53e31c34f8da
```

Después, en Netlify → Site configuration → Build & deploy → **Stop builds**, para que los siguientes pushes no gasten créditos.

## Comprobar

```bash
curl -I https://fusa-conecta.netlify.app/lugar/c12     # 301 a https://fusa-conecta.web.app/lugar/c12
curl -s https://fusa-conecta.netlify.app/ | grep "se mudó"
curl -s https://fusa-conecta.netlify.app/sw.js | head -3
```

## v7 · Fase 7

- **Página de mudanza**:
  - Detecta Android o iPhone y muestra los pasos con ilustraciones: abrir la dirección nueva, instalarla y borrar el ícono viejo.
  - El botón grande **Ir a la nueva Fusa Conecta** lleva a `fusa-conecta.web.app` con la misma ruta y `?desde=netlify`.
- **Bienvenida en el sitio nuevo**:
  - Con `?desde=netlify` aparece una sola vez por teléfono, con Instalar la app, Borrar el ícono viejo y Entrar a mi cuenta.
  - Después se quita el parámetro de la dirección.
- **Aviso en la app vieja (v29), antes de que Netlify se pueda publicar**:
  - Se envía desde Panel de administración → Banners → **Aviso de mudanza**.
  - La v29 lee la misma colección `notificaciones`:
    - en la campana lo ven todos los que la abran;
    - como aviso grande solo lo ven quienes tienen cuenta, las Novedades activadas y la app abierta en el momento del envío.
  - La app nueva lo ignora (`destino: "netlify"`).
