"""Limpieza diaria: reglas puras y la corrida completa contra el emulador de Firestore."""

import os
from datetime import datetime, timedelta, timezone

import pytest

import limpieza

AHORA = 1793300000000


def test_cupones_vencidos_hasta_el_final_del_dia():
    l = [{"id": "a", "estado": "activo", "vigencia": "2026-10-28"}, {"id": "b", "estado": "activo", "vigencia": "2026-10-29"},
         {"id": "c", "vigencia": "2026-10-01"}, {"id": "d", "estado": "pausado", "vigencia": "2026-10-01"}, {"id": "e", "estado": "activo"}]
    assert [c["id"] for c in limpieza.cupones_vencidos(l, "2026-10-29")] == ["a", "c"]


def test_ejemplos_con_mas_de_24_horas():
    hace = lambda h: datetime.fromtimestamp((AHORA - h * 3_600_000) / 1000, timezone.utc)  # noqa: E731
    l = [{"id": "viejo", "demo": True, "fecha_creacion": hace(25)}, {"id": "nuevo", "demo": True, "fecha_creacion": hace(2)}, {"id": "real", "fecha_creacion": hace(50)}]
    assert [e["id"] for e in limpieza.ejemplos_vencidos(l, AHORA)] == ["viejo"]


def test_negocios_sin_foto():
    l = [{"id": "1", "nombre": "Zapatería", "imagen": ""}, {"id": "2", "nombre": "Arepas", "fotos": []}, {"id": "3", "nombre": "Con foto", "imagen": "data:x"},
         {"id": "4", "nombre": "Con galería", "fotos": ["f1"]}]
    assert [c["nombre"] for c in limpieza.sin_foto(l)] == ["Arepas", "Zapatería"]


@pytest.mark.integracion
@pytest.mark.skipif(not os.environ.get("FIRESTORE_EMULATOR_HOST"), reason="sin emulador de Firestore")
def test_corrida_contra_el_emulador():
    from comun import firestore_cliente

    db = firestore_cliente()
    ahora = datetime.now(timezone.utc)
    ayer, manana = (ahora - timedelta(days=2)).strftime("%Y-%m-%d"), (ahora + timedelta(days=5)).strftime("%Y-%m-%d")
    db.collection("cupones").document("lim-vencido").set({"estado": "activo", "vigencia": ayer, "comercio_id": "x", "comercio_nombre": "Vivero", "descripcion": "2x1"})
    db.collection("cupones").document("lim-vigente").set({"estado": "activo", "vigencia": manana, "comercio_id": "x", "descripcion": "10%"})
    db.collection("eventos").document("lim-demo").set({"titulo": "Ejemplo viejo", "demo": True, "estado": "publicado", "fecha_creacion": ahora - timedelta(hours=30)})
    db.collection("eventos").document("lim-demo-nuevo").set({"titulo": "Ejemplo nuevo", "demo": True, "estado": "publicado", "fecha_creacion": ahora})
    db.collection("comercios").document("lim-sinfoto").set({"nombre": "Negocio sin foto de prueba", "estado_publicacion": "aprobado", "imagen": ""})
    assert limpieza.main([]) == 0
    assert db.collection("cupones").document("lim-vencido").get().to_dict()["estado"] == "finalizado"
    assert db.collection("cupones").document("lim-vigente").get().to_dict()["estado"] == "activo"
    assert not db.collection("eventos").document("lim-demo").get().exists
    assert db.collection("eventos").document("lim-demo-nuevo").get().exists
    r = db.collection("config").document("limpieza").get().to_dict()
    assert r["cupones_vencidos"] >= 1 and r["ejemplos_borrados"] >= 1 and any(c["id"] == "lim-sinfoto" for c in r["sin_foto"]) and r["registro"]
