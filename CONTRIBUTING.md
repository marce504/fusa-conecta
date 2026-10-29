# Cómo contribuir a Fusa Conecta

## Ramas

| Rama | Para qué | Quién escribe |
|---|---|---|
| `main` | **Producción.** Lo que hay aquí está publicado en https://fusa-conecta.web.app y en la API | Solo por Pull Request desde `develop` (o un `fix/` urgente) |
| `develop` | Integración: aquí se juntan los cambios antes de publicar | Pull Requests desde ramas de trabajo |
| `feat/…`, `fix/…`, `docs/…`, `ci/…` | Una rama por cambio, creada desde `develop` | Quien hace el cambio |

Flujo de trabajo:
1. Crea una rama desde `develop`, por ejemplo `git switch -c feat/descargar-reporte develop`.
2. Haz commits pequeños con el formato de abajo.
3. Abre un Pull Request hacia `develop` y espera la integración continua en verde.
4. Para publicar, abre un Pull Request de `develop` a `main`. Al fusionarlo se despliegan la app y la API.
5. Crea la etiqueta de versión en `main` (por ejemplo `v1.1.0`) y agrega la entrada en `CHANGELOG.md`.

## Mensajes de commit: Conventional Commits

```
tipo(alcance opcional): descripción en minúscula y en presente
```

| Tipo | Cuándo |
|---|---|
| `feat` | Función nueva (sube la versión MENOR) |
| `fix` | Corrección de un error (sube el PARCHE) |
| `docs` | Solo documentación |
| `style` | Formato, sin cambiar lo que hace el código |
| `refactor` | Reorganiza código sin cambiar lo que hace |
| `perf` | Rendimiento |
| `test` | Pruebas |
| `build` | Dependencias o empaquetado (por ejemplo, el APK) |
| `ci` | GitHub Actions |
| `chore` | Mantenimiento |
| `revert` | Deshacer un commit |

Alcances usados: `app` (PWA), `android`, `api`, `automatizacion`, `reglas`, `hosting`, `ci`, `docs`.

Ejemplos: `feat(api): exportar rutas en GPX`, `fix(app): el cupón vencido ya no aparece en el inicio`.
Un cambio que rompe la compatibilidad lleva `!` (`feat(api)!: …`) y sube la versión MAYOR.

La integración continua revisa el formato de los commits de cada Pull Request (trabajo **commits** de `ci.yml`).

## Antes de abrir un Pull Request

```bash
npm ci
```

```bash
npm run lint
```

```bash
npm run formato:revisar
```

```bash
python -m black --check api automatizacion
```

```bash
python -m flake8 api automatizacion
```

```bash
cd api && python -m pytest
```

Si cambiaste `datos.js` o `rutas/`, actualiza la copia de la API con `npm run datos:api`. Las normas de código están en
`docs/estandares.md` y las pruebas en `docs/pruebas.md`.

## Reglas del proyecto que no cambian

- **Diseño:** colores como variables en `:root`, cero emojis en la interfaz, íconos Lucide locales, contraste AA, zonas táctiles de 44 px y respeto por `prefers-reduced-motion`.
- **Seguridad en `firestore.rules`:** nada de seguridad que dependa solo del código del cliente.
- **Plan Spark de Firebase:** sin Cloud Functions.
- **Claves:** nunca en el código, solo en los secretos de GitHub o de Render.
- **Datos:** sin scraping de Facebook ni de Instagram.
