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
    assert r == {"publicados": 1, "pendientes": 2, "duplicados": 1, "reparados": 1, "unidos": 0}
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


def test_une_los_dia_dulce_ya_guardados():
    """Repara los duplicados guardados: queda uno de 9:00 a 16:00 con las dos fuentes; el de una persona no se borra."""
    db, ahora = firestore_cliente(), ahora_ms()
    for d in db.collection("eventos").stream():
        d.reference.delete()
    dia = datetime.fromtimestamp(ahora / 1000, timezone.utc).astimezone(timezone(timedelta(hours=-5))) + timedelta(
        days=2
    )
    a_las = lambda h: dia.replace(hour=h, minute=0, second=0, microsecond=0)  # noqa: E731
    comun = {"origen": "automatico", "estado": "publicado", "categoria": "cultura", "imagen": "", "tipo": "plan"}
    db.collection("eventos").document("manana").set(
        {
            **comun,
            "titulo": "Celebración del Día Dulce",
            "lugar_nombre": "Estadio Fernando Mazuera",
            "fecha_inicio": a_las(9),
            "fecha_fin": a_las(11),
            "descripcion": "Con las familias.",
            "enlace_fuente": "https://www.fusagasuga.gov.co/noticias/familias",
        }
    )
    db.collection("eventos").document("tarde").set(
        {
            **comun,
            "titulo": "Día Dulce",
            "lugar_nombre": "Estadio municipal Fernando Mazuera",
            "fecha_inicio": a_las(14),
            "fecha_fin": a_las(16),
            "descripcion": "Dulces y diversión para niños y niñas.",
            "enlace_fuente": "https://www.fusagasuga.gov.co/noticias/preparate-dia-dulce",
            "imagen": "data:image/webp;base64,AAAA",
        }
    )
    # Un evento parecido que publicó una persona nunca se borra
    db.collection("eventos").document("de-persona").set(
        {
            **comun,
            "origen": "organizador",
            "titulo": "Feria del Día Dulce",
            "lugar_nombre": "Coliseo Carlos Lleras",
            "fecha_inicio": a_las(10),
            "fecha_fin": a_las(12),
        }
    )
    r = agenda.guardar(db, None, [], ahora)
    assert r["unidos"] == 1
    ids = {d.id for d in db.collection("eventos").stream()}
    assert ids == {"tarde", "de-persona"}
    x = db.collection("eventos").document("tarde").get().to_dict()
    assert x["titulo"] == "Día Dulce" and x["lugar_nombre"] == "Estadio municipal Fernando Mazuera"
    assert (a_ms(x["fecha_inicio"]), a_ms(x["fecha_fin"])) == (
        int(a_las(9).timestamp() * 1000),
        int(a_las(16).timestamp() * 1000),
    )
    assert x["fuentes"] == [
        "https://www.fusagasuga.gov.co/noticias/preparate-dia-dulce",
        "https://www.fusagasuga.gov.co/noticias/familias",
    ]
    # Una corrida nueva que trae otra vez la noticia de la mañana no lo vuelve a crear
    manana = {
        "titulo": "Celebración del Día Dulce",
        "inicio": int(a_las(9).timestamp() * 1000),
        "fin": int(a_las(11).timestamp() * 1000),
        "lugar_nombre": "Estadio Fernando Mazuera",
        "enlace": "https://www.fusagasuga.gov.co/noticias/familias",
    }
    r = agenda.guardar(db, None, [manana], ahora)
    assert r["duplicados"] == 1 and r["publicados"] == 0 and r["unidos"] == 0
    assert {d.id for d in db.collection("eventos").stream()} == {"tarde", "de-persona"}
