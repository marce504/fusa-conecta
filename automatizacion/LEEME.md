# Procesos automáticos de Fusa Conecta (Python)

Dos procesos en **Python 3.12** que corren gratis en **GitHub Actions** (`.github/workflows/agenda.yml`). Escriben en
Firestore con la cuenta de servicio del secreto `FIREBASE_SA` y dejan su resumen y su registro en **Panel → Eventos**.

| Proceso | Cuándo | Qué hace | Resumen en |
|---|---|---|---|
| `agenda.py` | 6:00 a. m. (hora de Colombia), a mano y cada 15 min si el admin tocó «Buscar eventos ahora» | Lee las alcaldías de Fusagasugá y Pasca y el IDECUT, extrae eventos con Gemini, quita duplicados, los guarda (publicados o pendientes) y arregla los automáticos anteriores | `config/agenda_auto` → «Agenda automática» |
| `limpieza.py` | 6:00 a. m. y a mano | Pasa a «finalizado» los cupones vencidos, borra los eventos de ejemplo con más de 24 horas y lista los negocios publicados sin foto | `config/limpieza` → «Limpieza diaria» |

- **Registro:** cada proceso usa `logging`. Las últimas 20 líneas quedan en su resumen («Ver registro (Python)» en el panel) y el registro completo en la corrida de GitHub Actions.
- **Ninguna clave va en el código:** `GEMINI_API_KEY` y `FIREBASE_SA` son secretos de GitHub. Sin ellos, los procesos terminan sin hacer nada.

## Migración desde JavaScript (Fase 3)

`agenda.py` reemplaza a `herramientas/agenda-ia/extraer.mjs` (Node) **sin cambiar su comportamiento**:

- **Mismas reglas:** fuentes, palabras de búsqueda, instrucción y esquema de Gemini, reglas de publicación, deduplicación, títulos cortos, plan o aviso, imágenes (WebP ≤ 200 KB, ahora con Pillow en vez de sharp), reparación y borrado de ejemplos.
- **Prueba de paridad:** `tests/test_paridad.py` compara las funciones de Python con los resultados de la versión en JavaScript (`tests/resultados_js.json`, generado con `tests/paridad_js.mjs` sobre el commit `9d48ce4`):
  - títulos cortos, campañas, plan o aviso, textos y fechas;
  - la respuesta de Gemini convertida en eventos;
  - las claves de duplicado y la deduplicación.
- **Lo que encontró la paridad:** JavaScript descartaba las fechas sin hora (`Date.parse("2026-11-01-05:00")` da `NaN`) y Python las aceptaba. Se dejó igual que JavaScript.
- **Detalles cuidados:** `Math.round` de JavaScript redondea .5 hacia arriba (Python redondea al par), y en un `Map` gana el último valor pero conserva la posición del primero. Los dos se replicaron.
- **Simulación real** (2026-10-28) contra los sitios oficiales, con las mismas cifras que la versión anterior:

  | Fuente | Contenidos | Noticias recientes |
  |---|---|---|
  | Fusagasugá | 380 | 17 |
  | Pasca | 527 | 0 |
  | IDECUT | 21 | 0 |

## Uso

```bash
pip install -r automatizacion/requirements.txt
```

```bash
python automatizacion/agenda.py --simular --imagenes
```

```bash
python automatizacion/limpieza.py --simular
```

`--simular` no escribe nada; sin `GEMINI_API_KEY` tampoco usa la IA. Otras opciones de `agenda.py`: `--modo=diaria`, `--revisar` y `--reparar` (solo arregla lo guardado, sin leer los sitios).

## Pruebas

```bash
pip install -r automatizacion/requirements-dev.txt
```

```bash
cd automatizacion
```

```bash
python -m pytest -v
```

| Archivo | Qué prueba |
|---|---|
| `test_paridad.py` | Mismos resultados que la versión en JavaScript |
| `test_agenda.py` | Títulos, campaña, plan o aviso, deduplicación, eventos estructurados, decisión publicado o pendiente, WebP ≤ 200 KB |
| `test_limpieza.py` | Cupones vencidos (hasta el final del día), ejemplos con más de 24 horas, negocios sin foto y la corrida completa contra el emulador |
| `test_integracion_agenda.py` | Guardar, publicar o dejar pendiente, no duplicar (también en una segunda corrida), reparar y borrar ejemplos contra el emulador |

Las pruebas de integración necesitan el emulador. Corren con `FIRESTORE_EMULATOR_HOST=127.0.0.1:8099`; si no está, se saltan.
