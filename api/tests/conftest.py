"""Repositorio falso en memoria: las pruebas de la API no tocan Firestore."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import main
from app.repositorio import usar_repositorio

AHORA = datetime.now(timezone.utc)


class RepoFalso:
    def __init__(self) -> None:
        self.datos = {
            "comercios": [
                {
                    "id": "nube1",
                    "nombre": "Panadería La Espiga",
                    "cat": "comercio",
                    "sub": "panaderias",
                    "desc": "Pan de yuca y almojábanas",
                    "horario": "Lun-Dom 6:00-20:00",
                    "direccion": "Cra 6 # 7-10",
                    "municipio": "Fusagasugá",
                    "propietario_uid": "duena",
                    "estado_publicacion": "aprobado",
                    "esPremium": True,
                    "imagen": "",
                    "fotos": [],
                },
                # Copia antigua de la carga inicial (sin dueño, mismo nombre que un lugar de la base): se ignora
                {
                    "id": "viejo",
                    "nombre": "Café Sutagao",
                    "cat": "campo",
                    "estado_publicacion": "aprobado",
                    "propietario_uid": None,
                },
            ],
            "ocultos": ["c03"],
            "eventos": [
                {
                    "id": "e1",
                    "titulo": "Día Dulce",
                    "categoria": "cultura",
                    "fecha_inicio": AHORA + timedelta(days=2),
                    "fecha_fin": AHORA + timedelta(days=2, hours=3),
                    "lugar_nombre": "Estadio",
                    "municipio": "Fusagasugá",
                    "gratis": True,
                    "origen": "automatico",
                    "fuente_oficial": True,
                    "enlace_fuente": "https://www.fusagasuga.gov.co/noticias/dia-dulce",
                    "tipo": "plan",
                },
                {
                    "id": "e2",
                    "titulo": "Jornada de lavado de tanques",
                    "categoria": "institucional",
                    "fecha_inicio": AHORA + timedelta(days=1),
                    "fecha_fin": AHORA + timedelta(days=1, hours=2),
                    "lugar_nombre": "Barrio Pablo Bello",
                },
                {
                    "id": "e3",
                    "titulo": "Concierto de ejemplo",
                    "categoria": "musica",
                    "demo": True,
                    "fecha_inicio": AHORA + timedelta(days=1),
                    "fecha_fin": AHORA + timedelta(days=1, hours=2),
                    "lugar_nombre": "Parque",
                },
                {
                    "id": "e4",
                    "titulo": "Feria que ya pasó",
                    "categoria": "feria",
                    "fecha_inicio": AHORA - timedelta(days=3),
                    "fecha_fin": AHORA - timedelta(days=2),
                    "lugar_nombre": "Plaza",
                },
            ],
            "cupones": [
                {
                    "id": "cup1",
                    "comercio_id": "nube1",
                    "descripcion": "2x1 en almojábanas",
                    "estado": "activo",
                    "cupo_total": 50,
                    "cupo_restante": 40,
                    "vigencia": (AHORA + timedelta(days=10)).strftime("%Y-%m-%d"),
                }
            ],
            "canjes": [
                {
                    "id": "k1",
                    "cupon_id": "cup1",
                    "comercio_id": "nube1",
                    "estado": "usado",
                    "fecha_emision": AHORA,
                    "fecha_canje": AHORA,
                },
                {"id": "k2", "cupon_id": "cup1", "comercio_id": "nube1", "estado": "reservado", "fecha_emision": AHORA},
            ],
            "estadisticas": {"vistas": 120, "toques_wa": 14, "toques_llamar": 3, "cupones_obtenidos": 1},
            "roles": {"duena": "usuario", "admin1": "admin", "otro": "usuario"},
        }

    def comercios_aprobados(self):
        return self.datos["comercios"]

    def comercio(self, id_):
        return next((c for c in self.datos["comercios"] if c["id"] == id_), None)

    def ocultos(self):
        return self.datos["ocultos"]

    def eventos_publicados(self):
        return self.datos["eventos"]

    def cupones(self):
        return self.datos["cupones"]

    def emergencias(self):
        return {}

    def rutas_oficiales(self):
        return {}

    def rutas_comunidad(self):
        return []

    def estadisticas(self, comercio_id, mes):
        return self.datos["estadisticas"] if comercio_id == "nube1" else {}

    def canjes(self, comercio_id):
        return [k for k in self.datos["canjes"] if k["comercio_id"] == comercio_id]

    def rol(self, uid):
        return self.datos["roles"].get(uid)

    def conteos(self):
        return {"negocios_aprobados": 2, "usuarios": 3, "cupones": 1, "eventos_publicados": 4}

    def salud(self):
        return True


@pytest.fixture
def repo():
    r = RepoFalso()
    usar_repositorio(r)
    yield r
    usar_repositorio(None)


@pytest.fixture
def cliente(repo):
    main.limiter.reset()
    c = TestClient(main.app)
    yield c
    main.app.dependency_overrides.clear()


@pytest.fixture
def como():
    """como('duena') → la petición queda autenticada con ese uid (sin Firebase)."""

    def _como(uid: str | None):
        if uid is None:
            main.app.dependency_overrides.pop(main.usuario_actual, None)
        else:
            main.app.dependency_overrides[main.usuario_actual] = lambda: {"uid": uid}

    return _como
