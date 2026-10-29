"""Agenda contra el emulador de Firestore: guarda, publica o deja pendiente, no duplica, repara y borra ejemplos (sin red)."""

import os
from datetime import datetime, timedelta, timezone

import pytest

import agenda
from comun import a_ms, ahora_ms, firestore_cliente

pytestmark = [
    pytest.mark.integracion,
    pytest.mark.skipif(not os.environ.get("FIRESTORE_EMULATOR_HOST"), reason="sin emulador de Firestore"),
]


def test_guardar_reparar_y_borrar_ejemplos():
    db, ahora = firestore_cliente(), ahora_ms()
    for d in db.collection("eventos").stream():  # empezar limpio
        d.reference.delete()
    manana = ahora + 86_400_000
    # Uno ya guardado antes de v8: título largo con campaña, sin tipo ni imagen
    db.collection("eventos").document("viejo").set(
        {
            "titulo": "Jornada de lavado de tanques y sensibilización - Semana de Acción contra el Mosquito",
            "descripcion": "En el barrio.",
            "categoria": "institucional",
            "origen": "automatico",
            "estado": "publicado",
            "lugar_nombre": "Barrio Pablo Bello",
            "imagen": "",
            "enlace_fuente": "",
            "fecha_inicio": datetime.fromtimestamp(manana / 1000, timezone.utc),
            "fecha_fin": datetime.fromtimestamp((manana + 7_200_000) / 1000, timezone.utc),
        }
    )
    db.collection("eventos").document("demo-viejo").set(
        {
            "titulo": "Ejemplo",
            "demo": True,
            "estado": "publicado",
            "fecha_creacion": datetime.now(timezone.utc) - timedelta(hours=25),
        }
    )
    assert agenda.borrar_ejemplos(db, ahora) == 1
    oficial, idecut = agenda.FUENTES[0], agenda.FUENTES[2]
    base = {
        "descripcion": "",
        "categoria": "cultura",
        "tipo": "plan",
        "x": {},
        "organizador": "Alcaldía",
        "gratis": True,
        "precio": "",
        "municipio": "Fusagasugá",
        "enlace": "https://www.fusagasuga.gov.co/noticias/prueba",
        "fin": manana + 3 * 3_600_000,
    }
    unicos = agenda.depurar(
        [
            {
                **base,
                "titulo": "Concierto de prueba",
                "inicio": manana + 3_600_000,
                "lugar_nombre": "Concha acústica",
                "completo": True,
                "F": oficial,
            },
            {
                **base,
                "titulo": "Feria sin hora clara",
                "inicio": manana + 7_200_000,
                "lugar_nombre": "Plaza",
                "completo": False,
                "F": oficial,
            },
            {
                **base,
                "titulo": "Taller de IDECUT",
                "inicio": manana + 10_800_000,
                "lugar_nombre": "Casa de la Cultura",
                "completo": True,
                "F": idecut,
            },
            # mismo lugar y hora que el evento viejo: no se duplica
            {
                **base,
                "titulo": "Otra jornada",
                "inicio": manana,
                "lugar_nombre": "Barrio Pablo Bello",
                "completo": True,
                "F": oficial,
            },
        ],
        ahora,
    )
    r = agenda.guardar(db, None, unicos, ahora)
    assert r == {"publicados": 1, "pendientes": 2, "duplicados": 1, "reparados": 1}
    eventos = {d.to_dict()["titulo"]: d.to_dict() for d in db.collection("eventos").stream()}
    assert (
        eventos["Concierto de prueba"]["estado"] == "publicado"
        and eventos["Concierto de prueba"]["fuente_oficial"] is True
    )
    assert (
        eventos["Taller de IDECUT"]["estado"] == "pendiente"
        and eventos["Feria sin hora clara"]["estado"] == "pendiente"
    )
    reparado = eventos["Jornada de lavado de tanques y sensibilización"]
    assert reparado["tipo"] == "aviso" and reparado["descripcion"].startswith(
        "Hace parte de: Semana de Acción contra el Mosquito."
    )
    assert a_ms(eventos["Concierto de prueba"]["fecha_inicio"]) == manana + 3_600_000
    # Segunda corrida igual: no crea nada nuevo
    assert agenda.guardar(db, None, unicos, ahora)["duplicados"] == 4
