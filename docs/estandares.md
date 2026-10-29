# Estándares de codificación

| Lenguaje | Herramienta | Configuración | Comando |
|---|---|---|---|
| JavaScript (PWA, service worker, herramientas Node) | **ESLint 9** con la guía de **Airbnb** (`eslint-config-airbnb-base` 15) adaptada | `eslint.config.js` | `npm run lint` |
| JavaScript, JSON y YAML | **Prettier 3** (120 caracteres, comillas simples) | `.prettierrc.json`, `.prettierignore` | `npm run formato:revisar` |
| Python (API y procesos) | **black 24** (formato, 120 caracteres) | `pyproject.toml` | `black --check api automatizacion` |
| Python | **flake8 7** (PEP 8: estilo, errores y complejidad) | `.flake8` | `flake8 api automatizacion` |
| Python | **Type hints** en todas las funciones públicas (`from __future__ import annotations`, `str \| None`, `Protocol` para el repositorio) | — | revisión en Pull Request |

La integración continua (`.github/workflows/ci.yml`) corre todo esto en cada Pull Request. Si algo falla, el PR no pasa.

## Estado al adoptarlos (2026-10-28)

| Revisión | Antes | Después |
|---|---|---|
| ESLint con Airbnb sin adaptar | 1 393 observaciones | — |
| ESLint con la configuración final | — | **0** |
| flake8 | 123 | **0** |
| black | 16 archivos por formatear | **0** |
| Prettier | 11 archivos por formatear | **0** |

## Cómo se llegó a 0 sin cambiar lo que hace la app

- **Arreglos automáticos de ESLint (`--fix`):** `x['a']` → `x.a`, `let` → `const`, `Math.pow` → `**` y claves sin comillas innecesarias.
- **Cambios con equivalencia exacta**, aplicados sobre el árbol sintáctico de JavaScript (espree, el analizador de ESLint), en la posición exacta de cada nodo:
  - `b=>b.onclick=fn` → `b=>(b.onclick=fn)`: 119 casos.
  - `location`/`history` → `window.location`/`window.history`: 25 casos. Es el mismo objeto.
  - `isNaN(x)`/`isFinite(x)` → `Number.isNaN(Number(x))`/`Number.isFinite(Number(x))`: 10 casos. La versión global ya convierte con `Number`.
- **Casos revisados a mano:**
  - 3 variables que tapaban a otra con el mismo nombre (`esc`, `inicio`, `ls`).
  - 2 declaraciones repetidas de `TS`.
  - 3 promesas que devolvían un valor sin usar.
  - 3 funciones que nadie llamaba (`formaSVG`, `estadoPublicacionHTML`, `tarjetaComercioAdmin`), que se quitaron.
- **Prueba en el navegador**, contra el emulador, de cada función tocada:
  - QR, compresión de fotos, filtros, visor de fotos, tarjeta para compartir, números de emergencia del admin, Diagnóstico y navegación;
  - más las suites completas de la agenda, el admin, los cupones, eventos con IA, rutas y la entrada.
- **Python:** black reformateó 16 archivos. flake8 pidió partir textos largos; se comprobó byte a byte que la instrucción y el esquema que van a Gemini siguen idénticos.

## Reglas de Airbnb adaptadas (y por qué)

| Regla | Ajuste | Motivo |
|---|---|---|
| `prefer-template` | apagada | La interfaz arma HTML corto concatenando (`'<b>'+esc(x)+'</b>'`). Convertir unas 900 concatenaciones que funcionan no mejora la lectura y arriesga la PWA. El código nuevo puede usar plantillas. |
| `one-var` | apagada | `const a=1,b=2` agrupa los datos de un mismo cálculo. |
| `no-return-assign` | `except-parens` | Permite `b=>(b.onclick=fn)`, el patrón para conectar botones. |
| `no-param-reassign` | apagada en la PWA | Normalizar argumentos al entrar (`texto=String(texto\|\|'').trim()`) es intencional. |
| `no-plusplus`, `no-continue`, `no-nested-ternary`, `no-await-in-loop` | apagadas | Ciclos y textos con variantes; los pasos del Diagnóstico deben ir en orden. |
| `no-use-before-define` | solo variables | Las funciones se declaran donde se agrupan por tema. |
| `no-empty` | permite `catch` vacío | `try{localStorage…}catch(e){}`: en navegación privada no hay almacenamiento y la app sigue. |
| `no-cond-assign` | `except-parens` | `while((m=re.exec(t)))` para recorrer coincidencias. |
| `no-underscore-dangle` | lista de excepciones | Campos internos ya existentes (`_coords`, `_raw`, `_id`…). |
| `no-restricted-syntax` | permite `for…of` | Es más claro que `forEach` cuando hay `break` o `await`. |

## Prettier: alcance

Prettier formatea el código JavaScript, JSON y YAML nuevo o pequeño:
- el service worker;
- las herramientas Node;
- los flujos de GitHub Actions;
- `manifest.json` y `firebase.json`.

Los archivos grandes de la PWA (`app.js`, `datos.js`, `icons.js`, `app.css`, `index.html`) están en `.prettierignore`. Están escritos en formato compacto, y reformatearlos de golpe cambiaría miles de líneas sin cambiar nada de lo que hacen. ESLint sí los revisa completos, con 0 errores.

## Convenciones del proyecto

- Nombres en español, descriptivos y sin abreviaturas raras (`cuponesVencidos`, `estado_apertura`).
- Comentarios que explican el **porqué**, no el qué.
- CSS: colores, espacios y radios como variables en `:root`, con modo oscuro en `[data-tema="oscuro"]`.
- Accesibilidad: contraste AA, zonas táctiles de 44 px, `aria-*` en diálogos y respeto por `prefers-reduced-motion`.
- Commits con **Conventional Commits** y ramas `main`/`develop` (ver `CONTRIBUTING.md`).
