"""Fase 5: la decisión de los reclamos de comercios la toma la API (reglas puras y endpoint con repositorio falso)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app import main, reclamos

ANTES = datetime(2026, 11, 26, tzinfo=timezone.utc)
DESPUES = datetime(2027, 3, 1, tzinfo=timezone.utc)
PENDIENTE = {"estado": "pendiente", "usuario_uid": "ana", "comercio_id": "c354", "nombre": "Ana"}


@pytest.mark.parametrize(
    "reclamo,admin,resultado,motivo,codigo",
    [
        (None, "admin1", "aprobado", "", 404),
        ({**PENDIENTE, "estado": "aprobado"}, "admin1", "aprobado", "", 409),
        (PENDIENTE, "ana", "aprobado", "", 403),
        (PENDIENTE, "admin1", "rechazado", " ", 422),
    ],
)
def test_validar_decision_rechaza(reclamo, admin, resultado, motivo, codigo):
    with pytest.raises(reclamos.ErrorReclamo) as e:
        reclamos.validar_decision(reclamo, admin, resultado, motivo)
    assert e.value.codigo == codigo


def test_validar_decision_acepta():
    reclamos.validar_decision(PENDIENTE, "admin1", "aprobado", "")
    reclamos.validar_decision(PENDIENTE, "admin1", "rechazado", "La foto no se ve")


def test_aprobar_asigna_dueño_y_premium_de_la_campaña():
    c = reclamos.cambios_aprobacion("ana", "Ana", None, ANTES)
    assert c["propietario_uid"] == "ana" and c["estado_publicacion"] == "aprobado"
    assert c["esPremium"] is True and c["suscripcion_vigente_hasta"] == reclamos.CAMPANA_PREMIUM_HASTA
    # Pasada la campaña, sin Premium; un Premium sin fecha de fin no se acorta
    assert "esPremium" not in reclamos.cambios_aprobacion("ana", "Ana", None, DESPUES)
    assert "esPremium" not in reclamos.cambios_aprobacion("ana", "Ana", {"esPremium": True}, ANTES)


def test_no_se_aprueba_un_comercio_con_otro_dueño():
    with pytest.raises(reclamos.ErrorReclamo) as e:
        reclamos.cambios_aprobacion("ana", "Ana", {"propietario_uid": "rosa"}, ANTES)
    assert e.value.codigo == 409


def test_copia_del_directorio_base():
    b = reclamos.lugar_base("c354")
    d = reclamos.datos_semilla(b)
    assert d["nombre"] == "Droguería La Rebaja Plus 3" and d["sub"] == "salud" and d["fotos"] == []
    assert reclamos.lugar_base("no-existe") is None


class RepoReclamosFalso:
    def __init__(self) -> None:
        self.llamadas: list[tuple] = []

    def decidir(self, id_, admin_uid, resultado, motivo):
        self.llamadas.append((id_, admin_uid, resultado, motivo))
        if id_ == "propio":
            raise reclamos.ErrorReclamo(403, "No puedes aprobar ni rechazar tu propio reclamo")
        return reclamos.Resultado("c354", "Droguería", resultado)

    def migrar_solicitud(self, id_, admin_uid):
        self.llamadas.append((id_, admin_uid))
        return reclamos.Resultado("c354", "Droguería", "aprobado")


@pytest.fixture
def decidir(cliente, como):
    rr = RepoReclamosFalso()
    main.app.dependency_overrides[main._repo_reclamos] = lambda: rr
    return rr


def test_el_admin_decide(cliente, como, decidir):
    como("admin1")
    r = cliente.post("/v1/reclamos/c354__ana/decision", json={"resultado": "rechazado", "motivo": "La foto no se ve"})
    assert r.status_code == 200 and r.json()["resultado"] == "rechazado"
    assert decidir.llamadas == [("c354__ana", "admin1", "rechazado", "La foto no se ve")]
    assert cliente.post("/v1/reclamos/anteriores/sol9/aprobar").status_code == 200


def test_quien_no_es_admin_recibe_403(cliente, como, decidir):
    como("duena")
    assert cliente.post("/v1/reclamos/c354__ana/decision", json={"resultado": "aprobado"}).status_code == 403
    assert decidir.llamadas == []


def test_errores_del_reclamo_se_devuelven_con_su_codigo(cliente, como, decidir):
    como("admin1")
    r = cliente.post("/v1/reclamos/propio/decision", json={"resultado": "aprobado"})
    assert r.status_code == 403 and "propio" in r.json()["error"]


def test_entrada_invalida_422(cliente, como, decidir):
    como("admin1")
    assert cliente.post("/v1/reclamos/c354__ana/decision", json={"resultado": "quizas"}).status_code == 422
    assert cliente.post("/v1/reclamos/../decision", json={"resultado": "aprobado"}).status_code in (404, 422)
