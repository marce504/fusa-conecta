"""Agenda automática: títulos, avisos, deduplicación, eventos estructurados, decisión e imágenes."""

import base64
import io

from PIL import Image

import agenda

F_OFICIAL = agenda.Fuente("Alcaldía de Fusagasugá", "https://www.fusagasuga.gov.co", "Fusagasugá", True)
F_IDECUT = agenda.FUENTES[2]
AHORA = 1793300000000  # 2026-10-29


def ev(titulo, inicio, lugar="Parque principal", fin=None, **extra):
    return {
        "titulo": titulo,
        "inicio": inicio,
        "fin": fin or inicio + 7_200_000,
        "lugar_nombre": lugar,
        "F": F_OFICIAL,
        "completo": True,
        **extra,
    }


def test_titulo_corto_quita_campana_y_conectores():
    assert (
        agenda.titulo_corto("Jornada de lavado de tanques - Semana de Acción contra el Mosquito")
        == "Jornada de lavado de tanques"
    )
    assert (
        agenda.titulo_corto("Actividad educativa y de sensibilización en talleres de caricatura y manga")
        == "Actividad educativa y de sensibilización en talleres"
    )
    assert len(agenda.titulo_corto("x" * 30 + " " + "y" * 40)) <= 60


def test_campana_va_a_la_descripcion_sin_repetirse():
    assert (
        agenda.con_campana("Lavado en el barrio.", "Semana del Mosquito")
        == "Hace parte de: Semana del Mosquito. Lavado en el barrio."
    )
    assert (
        agenda.con_campana("Parte de la semana del mosquito", "Semana del Mosquito")
        == "Parte de la semana del mosquito"
    )


def test_plan_o_aviso():
    assert agenda.tipo_de("Jornada de vacunación", "otro") == "aviso"
    assert agenda.tipo_de("Concierto", "institucional") == "aviso"
    assert agenda.tipo_de("Día Dulce", "cultura") == "plan"


def test_depurar_quita_pasados_lejanos_y_duplicados():
    hora = AHORA + 86_400_000
    lista = [
        ev("Concierto", hora),
        ev("Concierto", hora),  # mismo título, día y lugar
        ev("Otra cosa", hora),  # mismo lugar a la misma hora
        ev("Feria", hora, lugar="Plaza"),
        ev("Ya pasó", AHORA - 10 * 86_400_000),
        ev("Muy lejos", AHORA + 200 * 86_400_000),
        ev("ab", hora, lugar="Coliseo"),  # título muy corto
    ]
    assert [e["titulo"] for e in agenda.depurar(lista, AHORA)] == ["Concierto", "Feria"]


def test_decidir():
    assert agenda.decidir(ev("Concierto", AHORA)) == "publicado"
    assert agenda.decidir({**ev("Concierto", AHORA), "completo": False}) == "pendiente"
    assert agenda.decidir({**ev("Concierto", AHORA), "F": F_IDECUT}) == "pendiente"  # IDECUT siempre pendiente


def test_evento_estructurado_del_sitio():
    x = {
        "name": "Festival de la Gulupa - Fusagasugá 2026",
        "metaDescription": "Feria",
        "startingDate": "2026-11-14T10:00:00",
        "closingDate": "2026-11-14T18:00:00",
        "friendlyName": "festival-gulupa",
        "contentType": "Event",
        "attributes": "[{'attribute': 'EventLocation', 'value': 'Parque de la Cultura'}, {'attribute': 'EventHost', 'value': 'Secretaría de Cultura'}]",
    }
    e = agenda.de_evento(x, F_OFICIAL)
    assert e["titulo"] == "Festival de la Gulupa" and e["descripcion"].startswith("Hace parte de: Fusagasugá 2026.")
    assert (
        e["lugar_nombre"] == "Parque de la Cultura"
        and e["organizador"] == "Secretaría de Cultura"
        and e["completo"] is True
    )
    assert e["fin"] - e["inicio"] == 8 * 3_600_000 and e["enlace"].endswith("/eventos/festival-gulupa")
    assert agenda.de_evento({**x, "startingDate": None}, F_OFICIAL) is None


def test_imagen_webp_de_maximo_200_kb():
    grande = Image.effect_noise((3000, 2000), 100).convert("RGB")  # ruido: comprime mal a propósito
    datos = io.BytesIO()
    grande.save(datos, "PNG")
    url = agenda.a_webp(datos.getvalue())
    crudo = base64.b64decode(url.split(",", 1)[1])
    assert url.startswith("data:image/webp;base64,") and len(crudo) <= 200_000
    assert Image.open(io.BytesIO(crudo)).width <= 1280


# ---------------------------------------------------------------- eventos parecidos (v1.2.0): el caso real del Día Dulce
DIA_DULCE_MANANA = ev(
    "Celebración del Día Dulce",
    1793455200000,  # 2026-10-31 9:00 en Colombia
    "Estadio Fernando Mazuera",
    fin=1793462400000,
    enlace="https://www.fusagasuga.gov.co/noticias/familias-de-fusagasuga-participaron",
    descripcion="Celebración con las familias.",
)
DIA_DULCE_TARDE = ev(
    "Día Dulce",
    1793473200000,  # 2026-10-31 14:00
    "Estadio municipal Fernando Mazuera",
    fin=1793480400000,
    enlace="https://www.fusagasuga.gov.co/noticias/preparate-para-un-dia-dulce-lleno-de-diversion",
    descripcion="Actividades, dulces y diversión para niños y niñas en el estadio.",
)


def test_dia_dulce_son_el_mismo_evento():
    assert agenda.palabras_lugar("Estadio municipal Fernando Mazuera") == {"fernando", "mazuera"}
    assert agenda.parecidos(DIA_DULCE_MANANA, DIA_DULCE_TARDE)


def test_no_son_parecidos_otro_dia_otro_lugar_u_otro_titulo():
    otro_dia = {**DIA_DULCE_TARDE, "inicio": DIA_DULCE_TARDE["inicio"] + 86_400_000}
    otro_lugar = {**DIA_DULCE_TARDE, "lugar_nombre": "Coliseo Carlos Lleras"}
    otro_titulo = {**DIA_DULCE_TARDE, "titulo": "Jornada de vacunación"}
    for e in (otro_dia, otro_lugar, otro_titulo):
        assert not agenda.parecidos(DIA_DULCE_MANANA, e)
    # Títulos con similitud ≥ 0,6 aunque ninguno contenga al otro
    assert agenda.parecidos(
        ev("Festival de la Cosecha", DIA_DULCE_TARDE["inicio"], "Parque principal de Pasca"),
        ev("Festival de la Cosecha 2026", DIA_DULCE_TARDE["inicio"] + 3_600_000, "Parque de Pasca"),
    )


def test_unir_horario_mas_amplio_y_las_dos_fuentes():
    u = agenda.unir(DIA_DULCE_MANANA, DIA_DULCE_TARDE)
    assert u["titulo"] == "Día Dulce"
    assert (u["inicio"], u["fin"]) == (DIA_DULCE_MANANA["inicio"], DIA_DULCE_TARDE["fin"])  # 9:00 a 16:00
    assert u["lugar_nombre"] == "Estadio municipal Fernando Mazuera"
    assert u["descripcion"].startswith("Actividades, dulces")
    assert u["fuentes"] == [DIA_DULCE_TARDE["enlace"], DIA_DULCE_MANANA["enlace"]]


def test_unir_parecidos_en_una_corrida():
    otro = ev("Feria Ruta Mujer Emprende", DIA_DULCE_TARDE["inicio"], "La Querencia Centro Comercial")
    res = agenda.unir_parecidos([DIA_DULCE_MANANA, otro, DIA_DULCE_TARDE])
    assert [e["titulo"] for e in res] == ["Día Dulce", "Feria Ruta Mujer Emprende"]


def test_ultima_publicacion_por_tipo():
    """Caso real de Pasca (2026-10-29): la última noticia es de febrero, pero el último evento se publicó en octubre."""
    items = [
        {"contentType": "Article", "modifiedDate": "2026-02-23T01:01:44.483"},
        {"contentType": "Article", "modifiedDate": "2022-11-29T09:16:55.05"},
        {"contentType": "Event", "modifiedDate": "2026-10-19T10:00:00", "startingDate": "2026-10-25T11:00:00"},
        {"contentType": "Document", "modifiedDate": "2026-10-24T08:00:00"},
    ]
    assert agenda.de_ms(agenda.ultima_publicacion(items, "Article")).astimezone(agenda.ZONA_COL).date().isoformat() == (
        "2026-02-23"
    )
    assert agenda.de_ms(agenda.ultima_publicacion(items, "Event")).astimezone(agenda.ZONA_COL).date().isoformat() == (
        "2026-10-19"
    )
    assert agenda.ultima_publicacion([], "Event") is None
