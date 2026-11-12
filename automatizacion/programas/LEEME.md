# Programas verificados

Festivales y ferias cuyo programa sale en **PDF o en imágenes** y que las alcaldías no publican como eventos
(por ejemplo, el FICFUSA). La agenda automática lee cada `*.json` de esta carpeta en cada corrida y publica las
actividades que aún no han pasado, igual que los eventos de una fuente oficial.

Regla: **solo lo que dice el documento oficial**. Una actividad sin lugar en el programa no se agrega; si no trae hora
de cierre se omite `fin` (la agenda pone 2 horas). El precio va solo si el programa lo dice.

```json
{
  "nombre": "Nombre del festival",
  "campana": "Texto que va al inicio de cada descripción («Hace parte de: …»)",
  "organizador": "Quien organiza",
  "sitio": "https://sitio-oficial",
  "enlace": "https://sitio-oficial/programacion/",
  "documento": "https://sitio-oficial/programa.pdf",
  "leido": "AAAA-MM-DD",
  "municipio": "Fusagasugá",
  "categoria": "cultura",
  "eventos": [
    { "titulo": "Máx. 60 caracteres", "inicio": "AAAA-MM-DDTHH:MM", "fin": "AAAA-MM-DDTHH:MM",
      "lugar": "Sede (dirección)", "descripcion": "…", "gratis": true, "precio": "" }
  ]
}
```

- Las horas son de Colombia.
- Dos actividades el mismo día y en el mismo lugar necesitan títulos distintos (el nombre de la película, no
  «Proyección y conversatorio»): la agenda une los eventos con títulos casi iguales. La prueba
  `test_programas_del_repositorio_son_validos_y_no_se_unen_entre_si` lo revisa.
- Para probar sin escribir nada: `python automatizacion/agenda.py --simular`.
- Cuando el festival termina, el archivo puede quedarse (lo pasado no se publica) o borrarse.
