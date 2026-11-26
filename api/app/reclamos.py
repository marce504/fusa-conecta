"""Decisión de los reclamos de comercios (Fase 5): la toma el servidor, no el navegador del admin.

Antes, el panel del admin escribía en un lote el dueño del comercio. Ahora el panel llama a
POST /v1/reclamos/{id}/decision y la API, con su cuenta de servicio, revisa todo en una transacción:
- quien decide es admin y no es quien reclamó;
- el reclamo sigue pendiente y el comercio no tiene otro dueño;
- al aprobar: dueño del comercio (o su copia en la nube si es del directorio base), Premium de la campaña de
  lanzamiento y rol «comerciante»; al rechazar: el motivo (obligatorio).
Las reglas de Firestore ya no dejan que ningún navegador cambie propietario_uid.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

from . import avisos, servicios

ZONA_COL = timezone(timedelta(hours=-5))
# Campaña de lanzamiento (la misma de app.js): quien se una hasta el 31-ene-2027 tiene Premium hasta el 30-abr-2027
CAMPANA_UNIRSE_HASTA = datetime(2027, 1, 31, 23, 59, 59, tzinfo=ZONA_COL)
CAMPANA_PREMIUM_HASTA = datetime(2027, 4, 30, 23, 59, 59, tzinfo=ZONA_COL)


class ErrorReclamo(Exception):
    """Error con su código HTTP y un mensaje para la persona."""

    def __init__(self, codigo: int, mensaje: str) -> None:
        super().__init__(mensaje)
        self.codigo = codigo
        self.mensaje = mensaje


def validar_decision(reclamo: dict | None, admin_uid: str, resultado: str, motivo: str) -> None:
    if reclamo is None:
        raise ErrorReclamo(404, "No existe ese reclamo")
    if reclamo.get("estado") != "pendiente":
        raise ErrorReclamo(409, "Ese reclamo ya fue revisado")
    if reclamo.get("usuario_uid") == admin_uid:
        raise ErrorReclamo(403, "No puedes aprobar ni rechazar tu propio reclamo")
    if resultado == "rechazado" and len((motivo or "").strip()) < 3:
        raise ErrorReclamo(422, "Escribe el motivo del rechazo")


def _a_datetime(v: Any) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return None


def premium_campana(comercio: dict | None, ahora: datetime) -> dict:
    """Premium de la campaña; nunca acorta un Premium que ya tenía una fecha más lejana o ninguna."""
    if ahora > CAMPANA_UNIRSE_HASTA:
        return {}
    if comercio and comercio.get("esPremium"):
        hasta = _a_datetime(comercio.get("suscripcion_vigente_hasta"))
        if hasta is None or hasta >= CAMPANA_PREMIUM_HASTA:
            return {}
    return {
        "esPremium": True,
        "plan": "premium",
        "prioridadBusqueda": 1,
        "prueba_usada": True,
        "suscripcion_vigente_hasta": CAMPANA_PREMIUM_HASTA,
    }


def datos_semilla(b: dict) -> dict:
    """Copia en la nube de un lugar del directorio base (como datosSemilla en app.js)."""
    return {
        "cat": b.get("cat"),
        "categoria": b.get("cat"),
        "nombre": b.get("nombre", ""),
        "desc": b.get("desc") or "",
        "horario": b.get("horario") or "",
        "direccion": b.get("direccion") or "",
        "tel": b.get("tel") or "",
        "whatsapp": b.get("whatsapp") or "",
        "imagen": b.get("imagen") or "",
        "lat": b.get("lat"),
        "lng": b.get("lng"),
        "ubicacion_aprox": bool(b.get("ubicacion_aprox")),
        "sub": b.get("sub") or "",
        "tipo": b.get("tipo") or "",
        "nivelDificultad": b.get("nivelDificultad") or "",
        "municipio": b.get("municipio") or "Fusagasugá",
        "redesSociales": {},
        "sitioWeb": b.get("sitioWeb") or "",
        "esPremium": False,
        "prioridadBusqueda": 0,
        "fotos": [],
    }


def cambios_aprobacion(uid: str, nombre: str, comercio: dict | None, ahora: datetime) -> dict:
    """Lo que cambia en el comercio al aprobar. Falla si ya tiene otro dueño."""
    actual = (comercio or {}).get("propietario_uid")
    if actual and actual != uid:
        raise ErrorReclamo(409, "Este comercio ya tiene dueño")
    return {
        "propietario_uid": uid,
        "propietario": nombre,
        "estado_publicacion": "aprobado",
        **premium_campana(comercio, ahora),
    }


def lugar_base(comercio_id: str) -> dict | None:
    return next((c for c in servicios.base()["comercios"] if c["id"] == comercio_id), None)


@dataclass
class Resultado:
    comercio_id: str
    comercio_nombre: str
    resultado: str


class RepositorioReclamos(Protocol):
    def decidir(self, id_: str, admin_uid: str, resultado: str, motivo: str) -> Resultado: ...

    def migrar_solicitud(self, id_: str, admin_uid: str) -> Resultado: ...


class RepositorioReclamosFirestore:
    """Escribe con la cuenta de servicio de la API (la misma de los avisos), en transacciones."""

    def __init__(self, cliente: Any) -> None:
        self.db = cliente

    def _aprobar(self, tx: Any, comercio_id: str, uid: str, nombre: str) -> None:
        from google.cloud.firestore_v1 import SERVER_TIMESTAMP

        cref = self.db.collection("comercios").document(comercio_id)
        csnap = cref.get(transaction=tx)
        uref = self.db.collection("usuarios").document(uid)
        usnap = uref.get(transaction=tx)
        ahora = datetime.now(timezone.utc)
        cambios = cambios_aprobacion(uid, nombre, csnap.to_dict() if csnap.exists else None, ahora)
        if csnap.exists:
            tx.update(cref, {**cambios, "fecha_aprobacion": SERVER_TIMESTAMP})
        else:
            b = lugar_base(comercio_id)
            if b is None:
                raise ErrorReclamo(404, "No existe ese comercio")
            tx.set(
                cref,
                {
                    **datos_semilla(b),
                    **cambios,
                    "fecha_aprobacion": SERVER_TIMESTAMP,
                    "fechaCreacion": SERVER_TIMESTAMP,
                },
            )
        if usnap.exists and (usnap.to_dict() or {}).get("rol") == "usuario":
            tx.update(uref, {"rol": "comerciante"})

    def decidir(self, id_: str, admin_uid: str, resultado: str, motivo: str) -> Resultado:
        from google.cloud import firestore
        from google.cloud.firestore_v1 import SERVER_TIMESTAMP

        ref = self.db.collection("reclamos_comercio").document(id_)

        @firestore.transactional
        def en_transaccion(tx: Any) -> Resultado:
            snap = ref.get(transaction=tx)
            r = snap.to_dict() if snap.exists else None
            validar_decision(r, admin_uid, resultado, motivo)
            assert r is not None
            if resultado == "aprobado":
                self._aprobar(tx, r["comercio_id"], r["usuario_uid"], r.get("nombre", ""))
            cambios = {"estado": resultado, "fecha_revision": SERVER_TIMESTAMP, "revisado_por": admin_uid}
            if resultado == "rechazado":
                cambios["motivo_rechazo"] = motivo.strip()[:200]
            tx.update(ref, cambios)
            return Resultado(r["comercio_id"], r.get("comercio_nombre", ""), resultado)

        return en_transaccion(self.db.transaction())

    def migrar_solicitud(self, id_: str, admin_uid: str) -> Resultado:
        """Aprueba un reclamo anterior (colección solicitudes, sin verificación) y lo registra en reclamos_comercio."""
        from google.cloud import firestore
        from google.cloud.firestore_v1 import SERVER_TIMESTAMP

        sref = self.db.collection("solicitudes").document(id_)

        @firestore.transactional
        def en_transaccion(tx: Any) -> Resultado:
            snap = sref.get(transaction=tx)
            s = snap.to_dict() if snap.exists else None
            if s is None or s.get("tipo") != "reclamo":
                raise ErrorReclamo(404, "No existe ese reclamo")
            validar_decision({**s, "usuario_uid": s.get("uid")}, admin_uid, "aprobado", "")
            cid, uid = str(s["comercio_id"]), s["uid"]
            self._aprobar(tx, cid, uid, s.get("usuario_nombre", ""))
            tx.update(sref, {"estado": "aprobada", "fecha_respuesta": SERVER_TIMESTAMP})
            tx.set(
                self.db.collection("reclamos_comercio").document(f"{cid}__{uid}"),
                {
                    "comercio_id": cid,
                    "comercio_nombre": s.get("comercio_nombre", ""),
                    "usuario_uid": uid,
                    "nombre": s.get("usuario_nombre", ""),
                    "estado": "aprobado",
                    "migrado_de": id_,
                    "fecha_revision": SERVER_TIMESTAMP,
                    "revisado_por": admin_uid,
                },
            )
            return Resultado(cid, s.get("comercio_nombre", ""), "aprobado")

        return en_transaccion(self.db.transaction())


_estado: dict[str, Any] = {}


def repositorio_reclamos() -> RepositorioReclamos:
    if "repo" not in _estado:
        _estado["repo"] = RepositorioReclamosFirestore(avisos.cliente_firestore())
    return _estado["repo"]


def usar_repositorio_reclamos(r: RepositorioReclamos | None) -> None:
    """Para las pruebas: reemplaza el repositorio."""
    if r is None:
        _estado.pop("repo", None)
    else:
        _estado["repo"] = r
