# Directorio base: verificación de los 71 lugares de Fusagasugá

Revisado el 2026-10-30. **No se borró ni se cambió nada**: esta lista es para que decidas. Un directorio público no
debe mostrar negocios que no existen. Los 6 lugares de Pasca (`c72` a `c77`) no están aquí porque ya entraron
verificados (ver `docs/pasca-fuentes.md`).

## Resumen

| Verificado | Lugares | Qué significa |
|---|---|---|
| **sí** | 13 | Una fuente independiente confirma que existe: OpenStreetMap, el sitio oficial o el registro de su dueño en la app. Ojo: muchos tienen el **teléfono inventado** (ver «Notas») |
| **no** | 40 | Hay señales de que es un **dato de ejemplo**: el teléfono sigue el patrón 310-111-00NN, 310-222-00NN, 310-444-00NN o 310-555-00NN, con NN igual al número del lugar, y el nombre no aparece en OpenStreetMap |
| **no sé** | 18 | Puede existir, pero no se pudo confirmar con una fuente que se pueda enlazar |

## Cómo se revisó

1. **Teléfonos.** Los lugares `c01` a `c50` tienen teléfonos que siguen una secuencia: los de campo empiezan por
   310-111, los de comercio por 310-222, los de turismo por 310-333, los de hospedaje por 310-444 y los de bares por
   310-555, y terminan en 00 más el número del lugar. Ningún negocio real tiene esa numeración: son datos del
   prototipo. Lo mismo pasa con las calificaciones de `datos.js` (`rating`); la app no las muestra.
2. **OpenStreetMap.** Cada nombre se buscó en Nominatim, dentro de la zona de Fusagasugá. También se descargaron de
   Overpass los 653 lugares con nombre del área (comercios, servicios, turismo, oficinas) y se compararon por
   similitud.
3. **Búsqueda web** de las instituciones y atractivos que OSM no confirma (sitios oficiales y directorios).

Que un negocio no aparezca en OSM no prueba que no exista: OSM tiene pocos comercios de Fusagasugá. Por eso «no» se
usa solo cuando además el teléfono es de ejemplo.

## Lista

| Id | Lugar | Categoría | Teléfono en datos.js | Verificado | Fuente | Notas |
|---|---|---|---|---|---|---|
| c01 | Café Sutagao | campo | 3101110001 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110001) y no aparece en OpenStreetMap. |
| c02 | Miel La Aguadita | campo | 3101110002 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110002) y no aparece en OpenStreetMap. En OSM hay algo parecido pero no igual: «Cuchilla de la Aguadita». |
| c03 | Artesanías de Balay | campo | 3101110003 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110003) y no aparece en OpenStreetMap. |
| c04 | Vivero de Orquídeas de Fusa | campo | 3101110004 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110004) y no aparece en OpenStreetMap. |
| c05 | Quesos Campesinos El Triunfo | campo | 3101110005 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110005) y no aparece en OpenStreetMap. |
| c06 | Conservas Doña Rosa | campo | 3101110006 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110006) y no aparece en OpenStreetMap. |
| c07 | Huerta Orgánica San José | campo | 3101110007 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110007) y no aparece en OpenStreetMap. |
| c08 | Lácteos La Pradera | campo | 3101110008 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110008) y no aparece en OpenStreetMap. |
| c09 | Tejidos Manos Campesinas | campo | 3101110009 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110009) y no aparece en OpenStreetMap. |
| c10 | Vivero Verde Plantas Nativas | campo | 3101110010 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3101110010) y no aparece en OpenStreetMap. |
| c11 | Ferretería El Tornillo de Oro | comercio | 3102220011 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220011) y no aparece en OpenStreetMap. |
| c12 | Pizzería Nápoles Fusa | comercio | 3102220012 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220012) y no aparece en OpenStreetMap. |
| c13 | La Casona Sumapaceña | comercio | 3102220013 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220013) y no aparece en OpenStreetMap. |
| c14 | Panadería y Café El Cedro | comercio | 3102220014 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220014) y no aparece en OpenStreetMap. En OSM hay algo parecido pero no igual: «Panaderia Pan & Cafe». |
| c15 | Droguería Salud Total | servicios | 3102220015 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220015) y no aparece en OpenStreetMap. |
| c16 | Calzado El Paso | comercio | 3102220016 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220016) y no aparece en OpenStreetMap. |
| c17 | Heladería Fusa Fresh | comercio | 3102220017 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220017) y no aparece en OpenStreetMap. |
| c18 | Papelería Mil Ideas | comercio | 3102220018 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220018) y no aparece en OpenStreetMap. |
| c19 | Taller RápidoMoto | servicios | 3102220019 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220019) y no aparece en OpenStreetMap. En OSM hay algo parecido pero no igual: «Taller de motos». |
| c20 | Veterinaria Huellitas | servicios | 3102220020 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3102220020) y no aparece en OpenStreetMap. |
| c21 | Cerro Fusacatán | turismo | 3103330021 | **sí** | [OpenStreetMap: «Cerro de Fusacatán» (natural=peak)](https://www.openstreetmap.org/node/12481799123) | El teléfono 3103330021 sigue el patrón de ejemplo: quitarlo (un cerro no tiene teléfono). |
| c22 | Sendero Cara del Indio | turismo | 3103330022 | **sí** | [OpenStreetMap: pico «Cara del Indio» y el trazado del Camino Real del Quininí que usa la app](https://www.openstreetmap.org/node/4222010918) | Teléfono de ejemplo (3103330022): quitarlo. |
| c23 | Corregimiento La Aguadita | turismo | 3103330023 | **sí** | OpenStreetMap: «La Aguadita» (place=village) | Teléfono de ejemplo (3103330023): quitarlo. |
| c24 | Pueblito Fusagasugueño | turismo | 3103330024 | **sí** | [OpenStreetMap: «Pueblito Fusagasugeño» (leisure=park)](https://www.openstreetmap.org/way/1351841449) | Teléfono de ejemplo (3103330024). En OSM se escribe «Fusagasugeño». |
| c25 | Ruta de los Sutagaos | turismo | 3103330025 | **no sé** | — | No aparece en OpenStreetMap ni en las búsquedas. Teléfono de ejemplo (3103330025). |
| c26 | Camino Real de Alaska | turismo | 3103330026 | **no sé** | — | No aparece en OpenStreetMap. Teléfono de ejemplo (3103330026). |
| c27 | Mirador de Ricaurte | turismo | 3103330027 | **no sé** | — | No aparece en OpenStreetMap; el mirador cercano que sí aparece es el de Chinauta. Teléfono de ejemplo. |
| c28 | Alto de San Benito | turismo | 3103330028 | **no sé** | — | No aparece en OpenStreetMap. Teléfono de ejemplo (3103330028). |
| c29 | Iglesia de Belén | turismo | 3103330029 | **sí** | OpenStreetMap: «Iglesia Nuestra Señora de Belén» (place_of_worship) | Teléfono de ejemplo (3103330029): quitarlo. |
| c30 | Hacienda Coloma – Museo del Café | turismo | 3103330030 | **sí** | [Sitio oficial: haciendacoloma.com.co](https://haciendacoloma.com.co/) | Teléfono de ejemplo (3103330030): usar el del sitio oficial. El horario no está confirmado. |
| c31 | Hotel Casa Tarará | hospedaje | 3104440031 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440031) y no aparece en OpenStreetMap. En OSM hay algo parecido pero no igual: «Hotel Catama». |
| c32 | Hotel Boutique La Quinta | hospedaje | 3104440032 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440032) y no aparece en OpenStreetMap. |
| c33 | Hostal Viajero Sumapaz | hospedaje | 3104440033 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440033) y no aparece en OpenStreetMap. |
| c34 | Glamping Cielo Verde | hospedaje | 3104440034 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440034) y no aparece en OpenStreetMap. |
| c35 | Hotel Campestre El Vergel | hospedaje | 3104440035 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440035) y no aparece en OpenStreetMap. |
| c36 | Aparta-hotel Ciudad Jardín | hospedaje | 3104440036 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440036) y no aparece en OpenStreetMap. |
| c37 | Glamping Bosque de Niebla | hospedaje | 3104440037 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440037) y no aparece en OpenStreetMap. |
| c38 | Hotel Plaza Centro | hospedaje | 3104440038 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440038) y no aparece en OpenStreetMap. |
| c39 | Finca-Hotel Los Cerezos | hospedaje | 3104440039 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440039) y no aparece en OpenStreetMap. |
| c40 | Hostal Mochilero Fusa | hospedaje | 3104440040 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3104440040) y no aparece en OpenStreetMap. |
| c41 | Gastrobar La Terraza | bares | 3105550041 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550041) y no aparece en OpenStreetMap. |
| c42 | Discoteca Luna Club | bares | 3105550042 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550042) y no aparece en OpenStreetMap. |
| c43 | Estanco El Trago Express | bares | 3105550043 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550043) y no aparece en OpenStreetMap. |
| c44 | Bar de Vinos Uvas & Co | bares | 3105550044 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550044) y no aparece en OpenStreetMap. |
| c45 | Cervecería Artesanal Fusa Beer | bares | 3105550045 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550045) y no aparece en OpenStreetMap. |
| c46 | Karaoke Las Vegas | bares | 3105550046 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550046) y no aparece en OpenStreetMap. |
| c47 | Licorera 24h Don Licor | bares | 3105550047 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550047) y no aparece en OpenStreetMap. |
| c48 | Lounge Bar Selva | bares | 3105550048 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550048) y no aparece en OpenStreetMap. |
| c49 | Bar Rockola El Recuerdo | bares | 3105550049 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550049) y no aparece en OpenStreetMap. |
| c50 | Cocktail Bar Mixología 360 | bares | 3105550050 | **no** | — | Parece de ejemplo: teléfono con patrón secuencial (3105550050) y no aparece en OpenStreetMap. |
| c51 | Alcaldía Municipal de Fusagasugá | tramite | 6018868181 | **sí** | [OpenStreetMap: «Alcaldía Municipal de Fusagasugá» (townhall)](https://www.openstreetmap.org/node/12947683646) | Teléfono y horario por confirmar con la Alcaldía. |
| c52 | Notaría Primera de Fusagasugá | tramite | 6018731234 | **no sé** | — | La notaría probablemente existe, pero el teléfono 6018731234 parece inventado (termina en 1234) y la ubicación es aproximada. |
| c53 | Notaría Segunda de Fusagasugá | tramite | 6018735678 | **no sé** | — | La notaría probablemente existe, pero el teléfono 6018735678 parece inventado (termina en 5678) y la ubicación es aproximada. |
| c54 | Bomberos Voluntarios de Fusagasugá | tramite | 3115853577 | **sí** | [OpenStreetMap: «Bomberos» (amenity=fire_station)](https://www.openstreetmap.org/way/816816187) | El teléfono 3115853577 no está confirmado. |
| c55 | SENA – Centro Agroecológico | tramite | 6018673476 | **sí** | [SENA: Centro Agroecológico y Empresarial de Fusagasugá (página oficial en Facebook y directorios)](https://www.facebook.com/SENAFusagasugaOficial/) | Teléfono por confirmar. |
| c56 | Cruz Roja – Fusagasugá | tramite | 132 | **no sé** | — | El 132 es la línea nacional de la Cruz Roja; la dirección dice solo «Centro». |
| c57 | Fiscalía General – Fusagasugá | tramite | 122 | **sí** | [OpenStreetMap: «Fiscalía» (amenity=courthouse)](https://www.openstreetmap.org/node/2835771552) | El 122 es la línea nacional de la Fiscalía; la dirección dice solo «Centro». |
| c58 | Comisaría de Familia | tramite | 6018868181 | **sí** | [OpenStreetMap: «Comisaría de Familia» (amenity=courthouse)](https://www.openstreetmap.org/node/2835771551) | Usa el mismo teléfono de la Alcaldía; por confirmar. |
| c59 | Casa de la Mujer | tramite | 155 | **no sé** | — | El 155 es la línea nacional de orientación a mujeres; no se encontró la sede en Fusagasugá. |
| c60 | Bancolombia – Sucursal Fusagasugá | tramite | 6014040 | **sí** | [OpenStreetMap: «Bancolombia» (amenity=bank)](https://www.openstreetmap.org/node/1480226505) | El 6014040 no es un número de Fusagasugá; por confirmar. |
| c61 | Ofalahiatu Vivero | campo | 3015472950 | **sí** | Registrado por su dueño en la app (Firestore: «Ofalahiatu Vivero Virtual», aprobado) |  |
| c62 | Licorera La Tasca VIP | bares | 3203175876 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c63 | Licores & Estanco B Y K 24/7 | bares | 3214280188 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c64 | Licorera Alquimia CC | bares | 3108996802 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c65 | Licorera 24 Horas El Beber Me Llama | bares | 3160438182 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c66 | Beer City Fusagasugá | bares | 3228585656 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c67 | Licores Express Fusa | bares | 3008575460 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c68 | Licores San Valentín | bares | 3243467138 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c69 | Licorera Barril sin Fondo | bares | 3046351223 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c70 | La Tequilera Licores | bares | 3115473710 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |
| c71 | Regional Licores | bares | 3219147653 | **no sé** | — | Se agregó el 2026-10-19 como «verificada en Google Maps», pero no se guardó el enlace. No se volvió a comprobar: Fusa Conecta no lee Google Maps de forma automatizada. |

## Qué sugiero (tú decides)

1. **Ocultar los «no»** (negocios, hoteles y bares de ejemplo). El panel admin ya permite ocultar lugares de muestra
   (`config/directorio.ocultos`) sin borrarlos de `datos.js`, y vuelven con un toque si cambias de opinión.
2. **Quitar los teléfonos de ejemplo** de los lugares reales (`c21` a `c30`): un cerro o una iglesia no tienen
   teléfono. Sin teléfono, la ficha muestra «Cómo llegar» en lugar de «Llamar».
3. **Confirmar por teléfono o en persona** los «no sé»: las notarías, la Cruz Roja, la Casa de la Mujer, los
   miradores y senderos, y las licoreras de Google Maps. Al confirmarlos, guarda la fuente como en los lugares de
   Pasca (`fuentes` y `verificado`).
4. Los negocios reales que se registren desde la app ya pasan por la aprobación del admin.
