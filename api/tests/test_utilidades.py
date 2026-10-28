"""Utilidades puras: estado abierto/cerrado, búsqueda sin tildes ni plurales y avisos del municipio."""

from datetime import datetime

import pytest

from app.utilidades import ZONA_COL, coincide, es_aviso, estado_apertura, hora_texto, mes_valido, parsear_dias, parsear_rangos, tokens


def col(dia: str, hora: str) -> datetime:
    return datetime.strptime(f"{dia} {hora}", "%Y-%m-%d %H:%M").replace(tzinfo=ZONA_COL)


# 2026-10-28 es miércoles; 2026-11-01 es domingo
@pytest.mark.parametrize("horario,momento,esperado", [
    ("Lun-Sáb 8:00-18:00", col("2026-10-28", "10:00"), "Abierto"),
    ("Lun-Sáb 8:00-18:00", col("2026-10-28", "17:30"), "Cierra pronto"),
    ("Lun-Sáb 8:00-18:00", col("2026-10-28", "19:00"), "Abre mañana 8:00 a. m."),
    ("Lun-Sáb 8:00-18:00", col("2026-10-28", "07:15"), "Abre pronto · 8:00 a. m."),
    ("Lun-Sáb 8:00-18:00", col("2026-11-01", "10:00"), "Abre mañana 8:00 a. m."),
    ("Lun-Vie 8:00-12:00", col("2026-10-31", "10:00"), "Abre el lunes 8:00 a. m."),
    ("Todos los días 7–9 p. m.", col("2026-10-28", "20:00"), "Cierra pronto"),
    ("Lun-Sáb 9:00-13:00 y 14:00-18:00", col("2026-10-28", "13:30"), "Abre pronto · 2:00 p. m."),   # dos franjas
    ("Abierto 24 horas", col("2026-10-28", "03:00"), "Abierto 24 horas"),
])
def test_estado_apertura(horario, momento, esperado):
    assert estado_apertura({"cat": "comercio", "horario": horario}, momento)["texto"] == esperado


def test_estado_con_dias_y_horas_de_la_nube():
    d = {"cat": "comercio", "dias": [1, 2, 3, 4, 5], "abre": "09:00", "cierra": "17:00"}
    assert estado_apertura(d, col("2026-10-28", "12:00"))["abierto"] is True
    assert estado_apertura(d, col("2026-11-01", "12:00"))["abierto"] is False


def test_senderos_y_sin_horario_no_tienen_estado():
    assert estado_apertura({"cat": "turismo", "tipo": "sendero", "horario": "Recom. 5–4 p.m."}) is None
    assert estado_apertura({"cat": "comercio", "horario": "Consultar"}) is None


def test_rangos_y_dias():
    assert parsear_rangos("8:00-18:00") == [(480, 1080)]
    assert parsear_rangos("7–9 p. m.") == [(420, 1260)]   # igual que la app: de 7 a. m. a 9 p. m.
    assert parsear_dias("Lun-Vie") == [1, 2, 3, 4, 5]
    assert parsear_dias("Sáb-Lun") == [6, 0, 1]
    assert parsear_dias("Todos los días") == list(range(7))
    assert hora_texto(0) == "12:00 a. m." and hora_texto(780) == "1:00 p. m."


@pytest.mark.parametrize("consulta", ["panaderias", "PANADERÍA", "pan de yuca", "almojabanas"])
def test_busqueda_sin_tildes_ni_plurales(consulta):
    assert coincide("Panadería La Espiga · Pan de yuca y almojábanas", consulta)


def test_busqueda_exige_todas_las_palabras():
    assert not coincide("Café Sutagao", "café pizza")
    assert tokens("Droguerías Cafés") == ["drogueria", "caf"]


def test_avisos_del_municipio():
    assert es_aviso({"titulo": "Jornada de vacunación canina", "categoria": "otro"})
    assert es_aviso({"titulo": "Cualquiera", "categoria": "institucional"})
    assert not es_aviso({"titulo": "Día Dulce", "categoria": "cultura"})
    assert not es_aviso({"titulo": "Jornada de lavado de tanques", "tipo": "plan"})   # el tipo guardado manda


def test_mes():
    assert mes_valido("2026-10") == "2026-10"
    with pytest.raises(ValueError):
        mes_valido("2026-13")
