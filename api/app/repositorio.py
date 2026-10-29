"""Acceso a Firestore (solo lectura) con caché en memoria.

El plan Spark permite 50 000 lecturas al día: las listas públicas se guardan 2 minutos en memoria, así cien visitas
seguidas a /v1/eventos cuestan las mismas lecturas que una. La cuenta de servicio salta las reglas de Firestore, por eso
aquí se filtra lo público (comercios aprobados, eventos publicados, rutas aprobadas) igual que en firestore.rules.
"""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Callable, Protocol


class Repositorio(Protocol):
    """Lo que la API lee. La implementación real usa Firestore; las pruebas usan un diccionario."""

    def comercios_aprobados(self) -> list[dict]: ...
    def comercio(self, id_: str) -> dict | None: ...
    def ocultos(self) -> list[str]: ...
    def eventos_publicados(self) -> list[dict]: ...
    def cupones(self) -> list[dict]: ...
    def emergencias(self) -> dict[str, list[dict]]: ...
    def rutas_oficiales(self) -> dict[str, dict]: ...
    def rutas_comunidad(self) -> list[dict]: ...
    def estadisticas(self, comercio_id: str, mes: str) -> dict: ...
    def canjes(self, comercio_id: str) -> list[dict]: ...
    def rol(self, uid: str) -> str | None: ...
    def conteos(self) -> dict[str, int]: ...
    def salud(self) -> bool: ...


def _igual(campo: str, valor: Any) -> Any:
    from google.cloud.firestore_v1.base_query import FieldFilter

    return FieldFilter(campo, "==", valor)


def a_ms(v: Any) -> int | None:
    """Timestamp de Firestore, fecha ISO o número → milisegundos."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    if hasattr(v, "timestamp"):
        return int(v.timestamp() * 1000)
    return None


def _plano(doc: Any) -> dict:
    d = doc.to_dict() or {}
    d["id"] = doc.id
    return d


class _Cache:
    def __init__(self, segundos: int) -> None:
        self.segundos, self._datos, self._candado = segundos, {}, threading.Lock()

    def obtener(self, clave: str, fn: Callable[[], Any]) -> Any:
        with self._candado:
            hit = self._datos.get(clave)
            if hit and time.monotonic() - hit[0] < self.segundos:
                return hit[1]
        valor = fn()
        with self._candado:
            self._datos[clave] = (time.monotonic(), valor)
        return valor

    def limpiar(self) -> None:
        with self._candado:
            self._datos.clear()


class RepositorioFirestore:
    def __init__(self, cliente: Any, cache_segundos: int = 120) -> None:
        self.db, self.cache = cliente, _Cache(cache_segundos)

    def _lista(self, clave: str, consulta: Callable[[], Any]) -> list[dict]:
        return self.cache.obtener(clave, lambda: [_plano(d) for d in consulta().stream()])

    def comercios_aprobados(self) -> list[dict]:
        return self._lista(
            "comercios", lambda: self.db.collection("comercios").where(filter=_igual("estado_publicacion", "aprobado"))
        )

    def comercio(self, id_: str) -> dict | None:
        return next((c for c in self.comercios_aprobados() if c["id"] == id_), None)

    def ocultos(self) -> list[str]:
        def leer() -> list[str]:
            s = self.db.collection("config").document("directorio").get()
            return list((s.to_dict() or {}).get("ocultos") or []) if s.exists else []

        return self.cache.obtener("ocultos", leer)

    def eventos_publicados(self) -> list[dict]:
        return self._lista("eventos", lambda: self.db.collection("eventos").where(filter=_igual("estado", "publicado")))

    def cupones(self) -> list[dict]:
        return self._lista("cupones", lambda: self.db.collection("cupones"))

    def emergencias(self) -> dict[str, list[dict]]:
        return self.cache.obtener(
            "emergencias",
            lambda: {d.id: (d.to_dict() or {}).get("lista") or [] for d in self.db.collection("emergencias").stream()},
        )

    def rutas_oficiales(self) -> dict[str, dict]:
        return {d["id"]: d for d in self._lista("rutas_oficiales", lambda: self.db.collection("rutas_oficiales"))}

    def rutas_comunidad(self) -> list[dict]:
        return self._lista(
            "rutas_comunidad", lambda: self.db.collection("rutas_comunidad").where(filter=_igual("estado", "aprobada"))
        )

    # Datos privados: sin caché (cada reporte lee lo último)
    def estadisticas(self, comercio_id: str, mes: str) -> dict:
        s = self.db.collection("comercios").document(comercio_id).collection("estadisticas").document(mes).get()
        return (s.to_dict() or {}) if s.exists else {}

    def canjes(self, comercio_id: str) -> list[dict]:
        return [
            _plano(d) for d in self.db.collection("canjes").where(filter=_igual("comercio_id", comercio_id)).stream()
        ]

    def rol(self, uid: str) -> str | None:
        s = self.db.collection("usuarios").document(uid).get()
        return (s.to_dict() or {}).get("rol") if s.exists else None

    def conteos(self) -> dict[str, int]:
        """Conteos con agregación (1 lectura por cada 1000 documentos)."""

        def contar(q: Any) -> int:
            return int(q.count().get()[0][0].value)

        def leer() -> dict[str, int]:
            c = self.db.collection
            return {
                "negocios_aprobados": contar(c("comercios").where(filter=_igual("estado_publicacion", "aprobado"))),
                "negocios_pendientes": contar(c("comercios").where(filter=_igual("estado_publicacion", "pendiente"))),
                "usuarios": contar(c("usuarios")),
                "cupones": contar(c("cupones")),
                "cupones_obtenidos": contar(c("canjes")),
                "cupones_canjeados": contar(c("canjes").where(filter=_igual("estado", "usado"))),
                "eventos_publicados": contar(c("eventos").where(filter=_igual("estado", "publicado"))),
                "eventos_pendientes": contar(c("eventos").where(filter=_igual("estado", "pendiente"))),
                "rutas_comunidad": contar(c("rutas_comunidad").where(filter=_igual("estado", "aprobada"))),
            }

        return self.cache.obtener("conteos", leer)

    def salud(self) -> bool:
        self.db.collection("config").document("directorio").get()
        return True


_repo: Repositorio | None = None


def iniciar_firebase() -> Any:
    """Inicializa firebase_admin una vez: cuenta de servicio de FIREBASE_SA o, con el emulador, sin credenciales."""
    import firebase_admin
    from firebase_admin import credentials

    if firebase_admin._apps:
        return firebase_admin.get_app()
    proyecto = os.environ.get("FIREBASE_PROJECT", "fusa-conecta")
    sa = os.environ.get("FIREBASE_SA", "").strip()
    if sa:
        return firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)), {"projectId": proyecto})
    if os.environ.get("FIRESTORE_EMULATOR_HOST"):
        return firebase_admin.initialize_app(options={"projectId": proyecto})
    raise RuntimeError("Falta FIREBASE_SA (cuenta de servicio de solo lectura). Ver api/LEEME.md.")


def repositorio() -> Repositorio:
    global _repo
    if _repo is None:
        iniciar_firebase()
        if os.environ.get("FIRESTORE_EMULATOR_HOST") and not os.environ.get("FIREBASE_SA"):
            from google.auth.credentials import AnonymousCredentials
            from google.cloud import firestore

            cliente = firestore.Client(
                project=os.environ.get("FIREBASE_PROJECT", "fusa-conecta"), credentials=AnonymousCredentials()
            )
        else:
            from firebase_admin import firestore as fs

            cliente = fs.client()
        _repo = RepositorioFirestore(cliente, int(os.environ.get("CACHE_SEGUNDOS", "120")))
    return _repo


def usar_repositorio(r: Repositorio | None) -> None:
    """Para las pruebas: reemplaza el repositorio."""
    global _repo
    _repo = r
