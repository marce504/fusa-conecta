"""La versión en Python da exactamente los mismos resultados que la versión en JavaScript que reemplaza.

resultados_js.json se generó con la versión anterior (herramientas/agenda-ia/extraer.mjs, commit 9d48ce4):
    node automatizacion/tests/paridad_js.mjs herramientas/agenda-ia/extraer.mjs > automatizacion/tests/resultados_js.json
"""

import json
from pathlib import Path

import pytest

import agenda

AQUI = Path(__file__).parent
CASOS = json.loads((AQUI / "casos_paridad.json").read_text(encoding="utf-8"))
JS = json.loads((AQUI / "resultados_js.json").read_text(encoding="utf-8"))
FUENTE = agenda.Fuente("Alcaldía de Fusagasugá", "https://www.fusagasuga.gov.co", "Fusagasugá", True)


@pytest.mark.parametrize(
    "nombre,fn",
    [
        ("titulo_corto", agenda.titulo_corto),
        ("campana", agenda.campana_de),
        ("norm", agenda.norm),
        ("sin_html", agenda.sin_html),
        ("tipo", lambda t: agenda.tipo_de(t, "cultura")),
    ],
)
def test_textos_iguales(nombre, fn):
    assert [fn(t) for t in CASOS["titulos"]] == JS[nombre]


def test_fechas_iguales():
    assert [agenda.fecha_col(s) for s in CASOS["fechas"]] == JS["fecha_col"]


def test_campana_en_descripcion_igual():
    assert [agenda.con_campana(d, c) for c, d in CASOS["descripciones"]] == JS["con_campana"]


def test_respuesta_de_la_ia_igual():
    py = [
        {k: v for k, v in e.items() if k not in ("x", "F")}
        for e in agenda.de_respuesta_ia(CASOS["ia"], {"friendlyName": "noticia-prueba"}, FUENTE)
    ]
    assert py == JS["ia"]
    assert [agenda.clave(e) for e in py] == JS["claves"]
    assert [agenda.clave_lugar_hora(e) for e in py] == JS["lugar_hora"]


def test_deduplicacion_igual():
    cand = agenda.de_respuesta_ia(CASOS["ia"], {"friendlyName": "noticia-prueba"}, FUENTE)
    assert [e["titulo"] for e in agenda.depurar(cand, CASOS["ahora"])] == JS["unicos"]
