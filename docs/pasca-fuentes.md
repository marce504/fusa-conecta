# Pasca: lugares verificados y sus fuentes

Regla: ningún dato de Pasca se inventa. Cada lugar de `datos.js` (ids `c72` a `c77`) lleva su fuente en el campo
`fuentes` y la fecha de revisión en `verificado`. La app muestra las fuentes en la ficha y la API las devuelve en
`GET /v1/comercios/{id}`. Revisado el 2026-10-30.

| Id | Lugar | Datos | Fuente | Ubicación |
|---|---|---|---|---|
| c72 | Alcaldía Municipal de Pasca (Trámites) | Cra. 1 No. 2-06, Centro. Lunes a viernes 8:00 a. m.–1:00 p. m. y 2:00–5:00 p. m.; sábados 8:00 a. m.–12:00 m. contactenos@pasca-cundinamarca.gov.co | [Alcaldía de Pasca · Turismo](https://www.pasca-cundinamarca.gov.co/tema/turismo) | OpenStreetMap (4.30896, -74.30040) |
| c73 | Casa de la Cultura de Pasca (Turismo · Cultura) | Calle 8a No. 6-57, barrio Chapinero. Lunes a viernes 8:00 a. m.–1:00 p. m. y 2:00–5:00 p. m. | Misma página | No está en OSM: centro del casco urbano, marcada como **aproximada** |
| c74 | CDI de Pasca (Servicios · Educación) | Diagonal 3 # 5-02, segundo piso. Lunes a viernes 8:00 a. m.–1:00 p. m. y 2:00–5:00 p. m. | Misma página | No está en OSM: **aproximada** |
| c75 | Parroquia de Nuestra Señora de la Encarnación (Turismo · Cultura) | Iglesia de la plaza principal; en su fachada se conserva el escudo de la Monarquía Hispánica. Sin horario (no se muestra) | Nombre y ubicación: [OpenStreetMap](https://www.openstreetmap.org/?mlat=4.30837&mlon=-74.29951#map=18/4.30837/-74.29951). Escudo: [Wikipedia](https://es.wikipedia.org/wiki/Pasca) | OpenStreetMap (4.30837, -74.29951), Calle 3 |
| c76 | Museo Arqueológico de Pasca (Turismo · Cultura) | El municipio es conocido por su museo arqueológico y por la balsa muisca hallada en 1969 en la vereda Lázaro Fonte. Horario: «Consulta horarios en la Casa de la Cultura» | [Wikipedia](https://es.wikipedia.org/wiki/Pasca) | OpenStreetMap (4.30846, -74.29920), Calle 2 |
| c77 | Páramo de Sumapaz (desde Pasca) (Turismo, solo informativo) | Pasca es uno de los municipios desde donde se accede al páramo de Sumapaz (Laguna de Chisacá, valle de frailejones). Sin trazado, sin teléfono y sin «Cómo llegar» | [Wikipedia](https://es.wikipedia.org/wiki/Pasca), [Komoot](https://www.komoot.com/guide/3960485/natural-monuments-in-pasca) y [Parques Nacionales Naturales](https://www.parquesnacionales.gov.co/sala-prensa/noticias/el-parque-nacional-natural-sumapaz-no-esta-habilitado-al-ecoturismo/) | Centro del casco urbano, **aproximada** |

Ninguna fuente trae teléfono (la de la Alcaldía dice «-»), así que la app no muestra «Llamar» ni «WhatsApp» en
estos lugares: muestra el correo, «Cómo llegar» y «Compartir».

## Diferencias con lo que pedía el prompt v10

- **Iglesia.** Wikipedia no dice que la iglesia sea de 1760. «Nuestra Señora de Encarnación de Pasca (1760)» aparece
  como nombre histórico del pueblo, no de la iglesia. El nombre de la parroquia sale de OpenStreetMap, y la ficha no
  menciona el año.
- **Páramo de Sumapaz.** Parques Nacionales Naturales publicó el 13 de marzo de 2026 que el PNN Sumapaz **no está
  habilitado para el ecoturismo**: no tiene zonificación, rutas autorizadas, infraestructura para visitantes ni
  protocolos. El aviso «no ingreses sin guía autorizado» habría dado a entender que con guía sí se puede entrar, así
  que la ficha usa este aviso, que enlaza la nota oficial:

  > El Parque Nacional Natural Sumapaz no está habilitado para el ecoturismo: no tiene rutas autorizadas ni atención a
  > visitantes, según Parques Nacionales Naturales. Consulta las condiciones antes de ir.

- **Museo.** OpenStreetMap lo ubica en la Calle 2, sin número. La ficha dice «Calle 2 (según OpenStreetMap)».
- **CDI.** La página de la Alcaldía solo dice «CDI», sin explicar la sigla. Quedó en Servicios › Educación, y la
  descripción no dice más de lo que dice la fuente.
- **Veredas de Pasca.** No las agregué como sugerencias en «Registrar mi negocio» porque no encontré una lista oficial
  verificable.

## Rutas

Las tres rutas oficiales (`c21`, `c22` y `c23`) tienen ahora `"municipio": "Fusagasugá"` en `datos.js`.
`GET /v1/rutas?municipio=` las filtra. Pasca no tiene senderos con trazado verificado. Con «Pasca» elegido, la app
dice: «Aún no hay senderos de Pasca con trazado real. ¿Conoces uno? Grábalo con «Grabar mi recorrido» y propónlo»,
con el botón para grabar.
