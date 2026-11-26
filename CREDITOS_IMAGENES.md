# Créditos de las imágenes

Fase 6 del informe de UX. Toda imagen que muestre la app debe tener una licencia que permita usarla y su crédito.
No se copian imágenes de Google Imágenes, Facebook ni Instagram de los negocios.

## Orden de las fuentes

1. **Foto propia o del dueño** (`foto_fuente: propia`): siempre tiene prioridad.
2. **Google Places** (`google_places`): solo con la atribución del autor que entrega la API; no se guarda la imagen.
3. **Wikimedia Commons** (`wikimedia`): solo CC0, dominio público, CC BY o CC BY-SA, con autor y licencia en la ficha.
4. **Imagen genérica por categoría** (`generica`): Unsplash o Pexels, guardada en `img/categorias/` en WebP de menos de 80 KB;
   la ficha muestra «Imagen de referencia». Anótala en la tabla de abajo antes de publicarla.
5. **Sin foto**: degradado del color de la categoría con su ícono grande.

Las propuestas de fotos para los lugares sin foto salen de `node scripts/proponer-fotos.mjs` en `docs/propuestas-fotos.csv`;
se revisan una por una (lugar correcto, licencia y autor) antes de aplicarlas.

## Imágenes genéricas por categoría (`img/categorias/`)

Elegidas el 26-nov-2026 entre las fotos gratuitas de Unsplash (no «Unsplash+»). La [Licencia de Unsplash](https://unsplash.com/license)
permite el uso comercial sin pedir permiso; igual se da el crédito en la ficha. Trámites y Turismo no tienen imagen de referencia:
son lugares oficiales o naturales, y una foto genérica confundiría.

| Archivo | Categoría | Autor | Fuente | Licencia |
|---|---|---|---|---|
| `img/categorias/drogueria.webp` | drogueria (Estante con medicamentos) | David Trinks | [Unsplash](https://unsplash.com/photos/FLntgQJNjD0) | Licencia de Unsplash |
| `img/categorias/salud.webp` | salud (Estetoscopio sobre fondo azul) | Etactics Inc | [Unsplash](https://unsplash.com/photos/g3PsF4_y7ZY) | Licencia de Unsplash |
| `img/categorias/comidas.webp` | comidas (Plato con pollo, papas y verduras) | Alfredo Burgos | [Unsplash](https://unsplash.com/photos/LAhQ2YdD-T8) | Licencia de Unsplash |
| `img/categorias/panaderias.webp` | panaderias (Panes en una estantería) | Yeh Xintong | [Unsplash](https://unsplash.com/photos/go3DT3PpIw4) | Licencia de Unsplash |
| `img/categorias/tiendas.webp` | tiendas (Artículos variados en una tienda) | Eduardo Soares | [Unsplash](https://unsplash.com/photos/e4EmPx91Aj4) | Licencia de Unsplash |
| `img/categorias/ferreterias.webp` | ferreterias (Pared con herramientas de ferretería) | Darien Attridge | [Unsplash](https://unsplash.com/photos/ciY4tc7539I) | Licencia de Unsplash |
| `img/categorias/hogar.webp` | hogar (Herramientas sobre una mesa) | Bermix Studio | [Unsplash](https://unsplash.com/photos/iwz5tmhjl7o) | Licencia de Unsplash |
| `img/categorias/belleza.webp` | belleza (Peluquero secando el pelo) | Adam Winger | [Unsplash](https://unsplash.com/photos/FkAZqQJTbXM) | Licencia de Unsplash |
| `img/categorias/lavanderia.webp` | lavanderia (Fila de lavadoras) | Chris Weiher | [Unsplash](https://unsplash.com/photos/GcB7eqnXnwI) | Licencia de Unsplash |
| `img/categorias/mecanica.webp` | mecanica (Mecánico en un taller) | Dextar Studio | [Unsplash](https://unsplash.com/photos/XP8o9_Arwqg) | Licencia de Unsplash |
| `img/categorias/tecnologia.webp` | tecnologia (Reparación de un celular) | Clint Bustrillos | [Unsplash](https://unsplash.com/photos/K7OUs6y_cm8) | Licencia de Unsplash |
| `img/categorias/transporte.webp` | transporte (Bus con montañas al fondo) | PJH | [Unsplash](https://unsplash.com/photos/PBc3bTUGFb4) | Licencia de Unsplash |
| `img/categorias/profesionales.webp` | profesionales (Mesa con papeles y bolígrafo) | 2H Media | [Unsplash](https://unsplash.com/photos/VnK5iT01HYQ) | Licencia de Unsplash |
| `img/categorias/mascotas.webp` | mascotas (Persona sosteniendo un perro) | Anya Prygunova | [Unsplash](https://unsplash.com/photos/u2H8mUzoF2Q) | Licencia de Unsplash |
| `img/categorias/educacion.webp` | educacion (Aula con pupitres y tablero) | Ivan Aleksic | [Unsplash](https://unsplash.com/photos/PDRFeeDniCk) | Licencia de Unsplash |
| `img/categorias/campo.webp` | campo (Verduras frescas en un puesto de mercado) | Shelley Pauls | [Unsplash](https://unsplash.com/photos/Zaiuy5dKeCk) | Licencia de Unsplash |
| `img/categorias/hospedaje.webp` | hospedaje (Cama con sábanas blancas) | Lisha Riabinina | [Unsplash](https://unsplash.com/photos/qifUgNsrWmU) | Licencia de Unsplash |
| `img/categorias/bares.webp` | bares (Copa de coctel) | M.S. Meeuwesen | [Unsplash](https://unsplash.com/photos/QYWYnzvPTAQ) | Licencia de Unsplash |

## Fotos del directorio base con crédito (datos.js)

| Lugar | Archivo | Autor | Licencia | Fuente |
|---|---|---|---|---|
| Sendero Cara del Indio | `img/comercios/cerro-quinini.jpg` | Juancam.27 | CC BY-SA 4.0 | Wikimedia Commons |
| Parque Natural San Rafael | `img/turismo/san-rafael/1-cascada-san-gabriel.jpg` | Equipo Fusa Conecta | — | fotos propias |
| Iglesia de Belén | `img/comercios/iglesia-de-belen.jpg` | María cristina garzón cifuentes | CC BY-SA 4.0 | Wikimedia Commons |
| Bancolombia – Sucursal Fusagasugá | `img/comercios/logo-bancolombia.jpg` | Bancolombia | Dominio público | Wikimedia Commons (logo de la marca) |
| Parroquia de Nuestra Señora de la Encarnación | `img/comercios/parroquia-pasca-mural.jpg` | Wilferpc | CC0 | Wikimedia Commons |
| Páramo de Sumapaz (desde Pasca) | `img/comercios/paramo-sumapaz-frailejones.jpg` | Camilo.Errante | CC BY-SA 4.0 | Wikimedia Commons |
| Mercado Colsubsidio · Carrera 5 | `img/comercios/logo-colsubsidio.jpg` | Colsubsidio | Dominio público | Wikimedia Commons (logo de la marca) |
| D1 · Diagonal 25 | `img/comercios/logo-tiendas-d1.jpg` | Tiendas D1 | Dominio público | Wikimedia Commons (logo de la marca) |
| Corresponsal Bancario Bancolombia | `img/comercios/logo-bancolombia.jpg` | Bancolombia | Dominio público | Wikimedia Commons (logo de la marca) |
| Olímpica | `img/comercios/logo-supermercado-olimpica.jpg` | Grupo Empresarial Olímpica | Dominio público | Wikimedia Commons (logo de la marca) |
| El Corral | `img/comercios/logo-hamburguesas-el-corral.jpg` | Hamburguesas El Corral | CC BY-SA 4.0 | Wikimedia Commons (logo de la marca) |
| Mercado Colsubsidio · Transversal 12 | `img/comercios/logo-colsubsidio.jpg` | Colsubsidio | Dominio público | Wikimedia Commons (logo de la marca) |
| Universidad Nacional Abierta y a Distancia | `img/comercios/logo-universidad-nacional-abierta-y-a-distancia.jpg` | Universidad Nacional Abierta y a Distancia - UNAD | CC BY-SA 4.0 | Wikimedia Commons (logo de la marca) |
| Frisby | `img/comercios/logo-frisby.jpg` | Frisby (restaurant) | Dominio público | Wikimedia Commons (logo de la marca) |
| Centro Médico Colsubsidio | `img/comercios/logo-colsubsidio.jpg` | Colsubsidio | Dominio público | Wikimedia Commons (logo de la marca) |
| Claro (tienda) | `img/comercios/logo-claro.jpg` | Claro | Dominio público | Wikimedia Commons (logo de la marca) |
| Éxito | `img/comercios/logo-exito.jpg` | Exito Colombia | Dominio público | Wikimedia Commons (logo de la marca) |
| Terpel · Autopista Bogota Girardot - Boquerón - Fusagasugá | `img/comercios/logo-terpel.jpg` | Terpel | Dominio público | Wikimedia Commons (logo de la marca) |
| Banco Caja Social | `img/comercios/logo-banco-caja-social.jpg` | Banco Caja Social | Dominio público | Wikimedia Commons (logo de la marca) |
| Banco Popular | `img/comercios/logo-banco-popular-colombia.jpg` | Banco Popular (Colombia) | Dominio público | Wikimedia Commons (logo de la marca) |
| Banco Agrario | `img/comercios/logo-banco-agrario-de-colombia.jpg` | Banco Agrario de Colombia | Dominio público | Wikimedia Commons (logo de la marca) |
| Oxxo | `img/comercios/logo-oxxo.jpg` | Template:Maria soledad corrales garcia. | Dominio público | Wikimedia Commons (logo de la marca) |
| Nueva EPS - IPS Bienestar | `img/comercios/logo-nueva-eps.jpg` | Nueva Eps | Dominio público | Wikimedia Commons (logo de la marca) |
| Ara | `img/comercios/logo-tiendas-ara.jpg` | Samanieggo | Dominio público | Wikimedia Commons (logo de la marca) |
| Cruz Verde | `img/comercios/logo-farmacias-cruz-verde.jpg` | Farmacias Cruz Verde SpA | Dominio público | Wikimedia Commons (logo de la marca) |
| BBVA | `img/comercios/logo-banco-bilbao-vizcaya-argentaria.jpg` | Banco Bilbao Vizcaya Argentaria, S.A. | Dominio público | Wikimedia Commons (logo de la marca) |
| D1 · Calle 7B | `img/comercios/logo-tiendas-d1.jpg` | Tiendas D1 | Dominio público | Wikimedia Commons (logo de la marca) |
| Ara · Calle 19 | `img/comercios/logo-tiendas-ara.jpg` | Samanieggo | Dominio público | Wikimedia Commons (logo de la marca) |
| Ara · Calle 7B | `img/comercios/logo-tiendas-ara.jpg` | Samanieggo | Dominio público | Wikimedia Commons (logo de la marca) |
| Ara · Carrera 6 | `img/comercios/logo-tiendas-ara.jpg` | Samanieggo | Dominio público | Wikimedia Commons (logo de la marca) |
| Monumento Lucho Herrera | `img/comercios/monumento-lucho-herrera.jpg` | Petruss | CC BY-SA 4.0 | Wikimedia Commons |
| Monumento al Indio Sutagao | `img/comercios/monumento-indio-sutagao.jpg` | Nikacer | CC BY-SA 3.0 | Wikimedia Commons |
| Instituto Técnico Salesiano Valsalice | `img/comercios/salesiano-valsalice.jpg` | Jeormagu | CC BY 3.0 | Wikimedia Commons |
| Banco AV Villas | `img/comercios/logo-banco-av-villas.jpg` | Banco AV Villas | Dominio público | Wikimedia Commons (logo de la marca) |
| Movistar (tienda) | `img/comercios/logo-movistar.jpg` | Telefónica | Dominio público | Wikimedia Commons (logo de la marca) |
| Domino's | `img/comercios/logo-domino-s-pizza.jpg` | Domino's Pizza Inc. | Dominio público | Wikimedia Commons (logo de la marca) |
| Texaco | `img/comercios/logo-texaco.jpg` | Texaco | Dominio público | Wikimedia Commons (logo de la marca) |
| Biblioteca Pública Quinta de Coburgo | `img/comercios/quinta-de-coburgo.jpg` | Juanda097 | CC BY-SA 3.0 | Wikimedia Commons |
| Terpel · Variante de Fusagasugá | `img/comercios/logo-terpel.jpg` | Terpel | Dominio público | Wikimedia Commons (logo de la marca) |
| Cámara de Comercio de Bogotá | `img/comercios/logo-camara-de-comercio-de-bogota.jpg` | Cámara de Comercio de Bogotá | Dominio público | Wikimedia Commons (logo de la marca) |
| Banco Agrario | `img/comercios/logo-banco-agrario-de-colombia.jpg` | Banco Agrario de Colombia | Dominio público | Wikimedia Commons (logo de la marca) |

## Fotos del directorio base sin crédito registrado

Revisar de dónde salen y anotar su autor y licencia (o reemplazarlas):

- Ofalahiatu Vivero (`img/comercios/ofalahiatu-vivero.jpg`)
