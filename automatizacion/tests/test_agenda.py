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


# ---------- Programas verificados (automatizacion/programas/*.json) ----------
def test_programas_del_repositorio_son_validos_y_no_se_unen_entre_si():
    """Cada programa guardado se lee completo: fechas válidas, textos dentro del límite y ninguna función
    se pierde por la regla de eventos parecidos (mismo día y lugar con títulos casi iguales)."""
    antes = 0  # con «ahora» en 0 entran todas las actividades, también las que ya pasaron
    candidatos, resumen = agenda.leer_programas(antes)
    assert resumen and all(r["ok"] and not r["error"] for r in resumen)
    assert len(candidatos) == sum(r["contenidos"] for r in resumen)
    for e in candidatos:
        assert 3 <= len(e["titulo"]) <= 60 and 2 <= len(e["lugar_nombre"]) <= 80
        assert e["fin"] >= e["inicio"] and e["enlace"].startswith("https://")
        assert agenda.decidir(e) == "publicado"
    assert len(agenda.unir_parecidos(candidatos)) == len(candidatos)


def test_programa_ficfusa_2026_fechas_en_hora_de_colombia():
    candidatos, _ = agenda.leer_programas(0)
    apertura = next(e for e in candidatos if e["titulo"] == "Película de apertura: MU-KI-RA")
    assert agenda.de_ms(apertura["inicio"]).isoformat().startswith("2026-11-13T20:00")  # 3:00 p. m. en Colombia
    assert apertura["gratis"] and "13.º FICFUSA" in apertura["descripcion"]
    fiesta = next(e for e in candidatos if e["titulo"].startswith("Fiesta 13 años"))
    assert not fiesta["gratis"] and fiesta["precio"].startswith("$50.000")
    assert fiesta["fin"] - fiesta["inicio"] == 2 * 3_600_000  # sin hora de cierre en el programa: 2 horas


def test_programa_mal_escrito_no_detiene_la_agenda(tmp_path):
    (tmp_path / "roto.json").write_text('{"nombre": "X", "sitio": "https://x.co", "eventos": [{"titulo": "A"}]}')
    (tmp_path / "bien.json").write_text(
        '{"nombre": "Feria", "sitio": "https://feria.co", "eventos": '
        '[{"titulo": "Desfile", "inicio": "2026-12-01T10:00", "lugar": "Plaza"}]}',
        encoding="utf-8",
    )
    candidatos, resumen = agenda.leer_programas(AHORA, tmp_path)
    assert [e["titulo"] for e in candidatos] == ["Desfile"]
    assert [r["ok"] for r in resumen] == [True, False] and "roto.json" in resumen[1]["error"]


# ---------- IA: los errores pasajeros (429 y 5xx) se reintentan ----------
class _Respuesta:
    def __init__(self, codigo, datos=None):
        self.status_code, self._datos = codigo, datos

    def json(self):
        return self._datos


class _ClienteIA:
    def __init__(self, respuestas):
        self.respuestas, self.llamadas = list(respuestas), 0

    def post(self, *_, **__):
        self.llamadas += 1
        return self.respuestas.pop(0)


def test_ia_reintenta_503_y_luego_responde(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "clave-de-prueba")
    monkeypatch.setattr(agenda.time, "sleep", lambda s: None)
    vacia = _Respuesta(200, {"candidates": [{"content": {"parts": [{"text": "[]"}]}}]})
    cliente = _ClienteIA([_Respuesta(503), _Respuesta(429), vacia])
    assert agenda.con_ia(cliente, {"name": "Noticia", "friendlyName": "noticia"}, F_OFICIAL, AHORA) == []
    assert cliente.llamadas == 3


def test_ia_se_rinde_tras_los_reintentos(monkeypatch):
    import pytest

    monkeypatch.setenv("GEMINI_API_KEY", "clave-de-prueba")
    monkeypatch.setattr(agenda.time, "sleep", lambda s: None)
    cliente = _ClienteIA([_Respuesta(503)] * (agenda.REINTENTOS_IA + 1))
    with pytest.raises(RuntimeError, match="IA HTTP 503"):
        agenda.con_ia(cliente, {"name": "Noticia", "friendlyName": "noticia"}, F_OFICIAL, AHORA)
    assert cliente.llamadas == agenda.REINTENTOS_IA + 1


def test_reparar_no_toca_los_eventos_de_un_programa():
    """«Charla: El reto de construir y destruir Macondo» no puede quedar en «Charla» ni recibir el afiche repetido."""

    class Doc:
        def __init__(self, datos):
            self.datos, self.cambios, self.reference = datos, None, self

        def to_dict(self):
            return self.datos

        def update(self, cambios):
            self.cambios = cambios

    base = {"origen": "automatico", "tipo": "plan", "imagen": "", "enlace_fuente": ""}
    de_programa = Doc({**base, "titulo": "Charla: El reto de construir y destruir Macondo", "programa": "ficfusa-2026"})
    de_noticia = Doc({**base, "titulo": "Feria: muestra artesanal"})
    assert agenda.reparar(None, None, [de_programa, de_noticia], {}) == 1
    assert de_programa.cambios is None and de_noticia.cambios["titulo"] == "Feria"


def test_motivo_para_correr_en_la_revision_de_cada_15_minutos():
    hora = 3_600_000
    assert agenda.motivo_para_correr(AHORA - hora, AHORA - 2 * hora, AHORA) == "pedida desde la app"
    assert agenda.motivo_para_correr(AHORA - 2 * hora, AHORA - hora, AHORA) == ""  # el pedido ya se atendió
    assert agenda.motivo_para_correr(None, AHORA - 5 * hora, AHORA) == ""
    # GitHub no ejecutó la corrida diaria: la siguiente revisión la recupera
    assert agenda.motivo_para_correr(None, AHORA - 21 * hora, AHORA) == "diaria (recuperada)"
    assert agenda.motivo_para_correr(None, None, AHORA) == "diaria (recuperada)"


def test_evento_publicado_el_mismo_dia_despues_de_empezar_sigue_vigente():
    """Pasca publicó el Festival de Juventudes a las 9:28 a. m. con inicio a las 8:00 y sin hora de cierre;
    la siguiente corrida de GitHub fue después del mediodía."""
    inicio = 1794661200000  # 2026-11-14 08:00 en Colombia
    corrida = inicio + 5 * 3_600_000  # 1:00 p. m.
    festival = ev("Festival de Juventudes Pasca 2026", inicio, "Gusta Guchipas")
    assert festival["fin"] < corrida  # 2 horas por defecto: ya habría «terminado»
    assert agenda.depurar([festival], corrida) == [festival]
    assert agenda.depurar([festival], inicio + agenda.DIA_MS) == []  # al día siguiente ya no


def test_evento_sin_hora_de_cierre_dura_todo_su_dia():
    x = {
        "name": "FESTIVAL DE JUVENTUDES PASCA 2026",
        "friendlyName": "festival-de-juventudes-pasca-2026",
        "startingDate": "2026-11-14T08:00:00",
        "closingDate": None,
        "attributes": [{"attribute": "EventLocation", "value": "Gusta Guchipas"}],
    }
    e = agenda.de_evento(x, agenda.FUENTES[1])
    assert e["sin_hora_fin"] is True
    assert agenda.de_ms(e["fin"]).astimezone(agenda.ZONA_COL).strftime("%Y-%m-%d %H:%M") == "2026-11-14 23:59"
    con_cierre = agenda.de_evento({**x, "closingDate": "2026-11-14T12:00:00"}, agenda.FUENTES[1])
    assert "sin_hora_fin" not in con_cierre


def test_sin_hora_clara_queda_pendiente_y_marcada_para_revisar():
    """v95: «Conexión Sumapaz» quedó a las 9:00 a. m. porque la noticia no decía la hora; el panel debe avisarlo."""
    f = agenda.Fuente("Alcaldía de Fusagasugá", "https://www.fusagasuga.gov.co", "Fusagasugá", True)
    base = {"titulo": "Noches de Teatro", "inicio": "2026-11-20T09:00", "lugar_nombre": "Casona Quinta Balmoral"}
    sin_hora = agenda.de_respuesta_ia([{**base, "fecha_clara": False, "lugar_claro": True}], {"friendlyName": "n"}, f)[
        0
    ]
    assert sin_hora["hora_por_confirmar"] is True and sin_hora["lugar_por_confirmar"] is False
    assert agenda.decidir(sin_hora) == "pendiente"
    clara = agenda.de_respuesta_ia([{**base, "fecha_clara": True, "lugar_claro": True}], {"friendlyName": "n"}, f)[0]
    assert clara["hora_por_confirmar"] is False and agenda.decidir(clara) == "publicado"


def test_programa_con_actividades_en_paralelo_no_se_pierden():
    """v96: en «Conexión Sumapaz» la exposición y el Taller Tribu empiezan a la misma hora y en el mismo lugar."""
    ev, _ = agenda.leer_programas(agenda.fecha_col("2026-11-20T08:00"))
    unicos = agenda.depurar(
        [e for e in ev if e.get("programa") == "conexion-sumapaz-2026"], agenda.fecha_col("2026-11-20T08:00")
    )
    titulos = {e["titulo"] for e in unicos}
    assert len(unicos) == 16
    assert {"Exposiciones de la Escuela de Artes Visuales EFAC", "Taller Tribu: producción y escenografía"} <= titulos
