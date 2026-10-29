"""Piezas comunes de los procesos programados: registro (logging), Firestore y fechas de Colombia."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

ZONA_COL = timezone(timedelta(hours=-5), "America/Bogota")
DIA_MS = 86_400_000


class RegistroEnMemoria(logging.Handler):
    """Guarda las últimas líneas del registro para mostrarlas en el panel del admin."""

    def __init__(self, maximo: int = 40) -> None:
        super().__init__(logging.INFO)
        self.maximo, self.lineas = maximo, []

    def emit(self, record: logging.LogRecord) -> None:
        self.lineas.append(self.format(record))
        del self.lineas[: -self.maximo]


def registro(nombre: str) -> tuple[logging.Logger, RegistroEnMemoria]:
    log = logging.getLogger(nombre)
    if not log.handlers:
        log.setLevel(logging.INFO)
        consola = logging.StreamHandler()
        consola.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%H:%M:%S"))
        memoria = RegistroEnMemoria()
        memoria.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
        log.addHandler(consola)
        log.addHandler(memoria)
        log.propagate = False
    memoria = next(h for h in log.handlers if isinstance(h, RegistroEnMemoria))
    return log, memoria


def ahora_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def hoy_col() -> str:
    return datetime.now(ZONA_COL).strftime("%Y-%m-%d")


def a_ms(v: Any) -> int | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    if hasattr(v, "timestamp"):
        return int(v.timestamp() * 1000)
    return None


def de_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, timezone.utc)


def firestore_cliente() -> Any | None:
    """Cliente de Firestore: cuenta de servicio de FIREBASE_SA; con el emulador, sin credenciales; si no hay, None."""
    proyecto = os.environ.get("FIREBASE_PROJECT", "fusa-conecta")
    sa = os.environ.get("FIREBASE_SA", "").strip()
    if os.environ.get("FIRESTORE_EMULATOR_HOST") and not sa:
        from google.auth.credentials import AnonymousCredentials
        from google.cloud import firestore

        return firestore.Client(project=proyecto, credentials=AnonymousCredentials())
    if not sa:
        return None
    import firebase_admin
    from firebase_admin import credentials, firestore as fs

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)), {"projectId": proyecto})
    return fs.client()


def igual(campo: str, valor: Any) -> Any:
    from google.cloud.firestore_v1.base_query import FieldFilter

    return FieldFilter(campo, "==", valor)


def servidor() -> Any:
    """Marca de tiempo del servidor (FieldValue.serverTimestamp)."""
    from google.cloud import firestore

    return firestore.SERVER_TIMESTAMP
