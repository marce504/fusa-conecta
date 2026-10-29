## Qué cambia

<!-- Una o dos frases. El título del Pull Request sigue Conventional Commits: tipo(alcance): descripción -->

## Por qué

<!-- Problema que resuelve o requisito (enlace al issue si existe) -->

## Cómo se probó

- [ ] `npm run lint` y `npm run formato:revisar` sin errores
- [ ] `black --check` y `flake8` sin errores (si tocaste Python)
- [ ] Pruebas: `pytest` en `api/` y `automatizacion/` (si tocaste Python)
- [ ] Probado en el navegador con el emulador (`?emulador`) a 390×844 y en modo oscuro (si tocaste la PWA)
- [ ] Capturas o evidencia adjuntas

## Lista de revisión

- [ ] Commits con formato Conventional Commits
- [ ] Sin claves ni datos personales en el código
- [ ] Las reglas de seguridad nuevas están en `firestore.rules` (no solo en el cliente)
- [ ] Si cambió la PWA: subí `?v=` y el service worker (`fusa-vNN`)
- [ ] Si cambió `datos.js` o `rutas/`: `npm run datos:api`
- [ ] `CHANGELOG.md` actualizado en «Sin publicar»
- [ ] Documentación actualizada (README o `docs/`)
