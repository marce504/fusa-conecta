"""Avisos al celular (Firebase Cloud Messaging) cuando el admin aprueba o rechaza algo.

Plan Spark, sin Cloud Functions: el panel admin guarda la decisión en Firestore y después llama a
POST /v1/notificaciones/aprobacion. Esta API busca a la persona, escribe la novedad en su campana
(usuarios/{uid}/notificaciones) y envía el push a sus dispositivos (usuarios/{uid}/dispositivos).

Credenciales: una cuenta de servicio APARTE de la de solo lectura (FIREBASE_SA_FCM, en Render) con el rol
«Firebase Cloud Messaging API Admin» y escritura en Firestore. IAM no limita la escritura por colección, así que
este módulo es el único que la usa y solo escribe en esas dos subcolecciones (lo comprueban las pruebas).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Literal, Protocol

Tipo = Literal["comercio", "evento", "ruta", "premium", "reclamo"]
Resultado = Literal["aprobado", "rechazado"]

APP_URL = os.environ.get("APP_URL", "https://fusa-conecta.web.app").rstrip("/")
ICONO = APP_URL + "/img/icons/icon-192.png"


@dataclass(frozen=True)
class Fuente:
    """Dónde vive cada cosa que el admin revisa y qué campos usa."""

    coleccion: str
    dueno: str  # campo con el uid de quien lo envió
    nombre: str
    motivo: str
    estados: dict[str, str]  # resultado → valor guardado en Firestore


FUENTES: dict[str, Fuente] = {
    "comercio": Fuente(
        "comercios",
        "propietario_uid",
        "nombre",
        "motivo_rechazo",
        {"aprobado": "aprobado", "rechazado": "rechazado"},
    ),
    "evento": Fuente("eventos", "creado_por", "titulo", "motivo", {"aprobado": "publicado", "rechazado": "rechazado"}),
    "ruta": Fuente(
        "rutas_comunidad", "autor_uid", "nombre", "motivo", {"aprobado": "aprobada", "rechazado": "rechazada"}
    ),
    "premium": Fuente(
        "solicitudes", "uid", "comercio_nombre", "motivo", {"aprobado": "aprobada", "rechazado": "rechazada"}
    ),
    "reclamo": Fuente(
        "solicitudes", "uid", "comercio_nombre", "motivo", {"aprobado": "aprobada", "rechazado": "rechazada"}
    ),
}
CAMPO_ESTADO = {"comercios": "estado_publicacion"}  # las demás colecciones usan "estado"


def estado_guardado(tipo: str, doc: dict) -> str | None:
    f = FUENTES[tipo]
    return doc.get(CAMPO_ESTADO.get(f.coleccion, "estado"))


def mensaje(tipo: str, resultado: str, nombre: str, motivo: str = "", id_: str = "") -> tuple[str, str, str]:
    """(título, texto, enlace) del aviso. El enlace abre la app en la pantalla donde se ve el resultado."""
    nombre = (nombre or "tu publicación").strip()
    motivo = (motivo or "necesita algunos ajustes").strip().rstrip(".")
    if tipo == "comercio":
        if resultado == "aprobado":
            return "Negocio aprobado", f"¡Tu negocio {nombre} ya está publicado en Fusa Conecta!", "#/mi-negocio"
        return (
            "Revisamos tu negocio",
            f"Revisamos {nombre}: {motivo}. Puedes corregirlo desde Mi negocio.",
            "#/mi-negocio",
        )
    if tipo == "evento":
        if resultado == "aprobado":
            return "Evento publicado", f"¡Tu evento {nombre} ya está en la agenda de Fusa Conecta!", f"#/evento/{id_}"
        return "Revisamos tu evento", f"Revisamos tu evento {nombre}: {motivo}. Puedes enviarlo de nuevo.", "#/agenda"
    if tipo == "ruta":
        if resultado == "aprobado":
            return "Ruta publicada", f"¡Tu ruta {nombre} ya está publicada en Fusa Conecta!", "#/recorridos"
        return (
            "Revisamos tu ruta",
            f"Revisamos tu ruta {nombre}: {motivo}. Puedes corregirla y enviarla de nuevo.",
            ("#/recorridos"),
        )
    if tipo == "premium":
        if resultado == "aprobado":
            return "Premium activado", f"¡{nombre} ya es Premium en Fusa Conecta!", "#/mi-negocio"
        return (
            "Revisamos tu solicitud Premium",
            f"Revisamos la solicitud Premium de {nombre}: {motivo}.",
            "#/mi-negocio",
        )
    if resultado == "aprobado":  # reclamo
        return (
            "Reclamo aprobado",
            f"Ya administras {nombre} en Fusa Conecta. Complétalo desde Mi negocio.",
            "#/mi-negocio",
        )
    return "Revisamos tu reclamo", f"Revisamos tu reclamo de {nombre}: {motivo}.", "#/perfil"


# ---------- Acceso a Firestore con la cuenta de avisos ----------
class RepositorioAvisos(Protocol):
    def documento(self, coleccion: str, id_: str) -> dict | None: ...
    def dispositivos(self, uid: str) -> list[str]: ...
    def guardar_novedad(self, uid: str, id_: str, datos: dict) -> bool: ...
    def borrar_dispositivos(self, uid: str, tokens: list[str]) -> None: ...


class Avisador(Protocol):
    def enviar(self, tokens: list[str], titulo: str, texto: str, enlace: str, etiqueta: str) -> tuple[int, list[str]]:
        """Devuelve (enviados, tokens que ya no sirven)."""
        ...


class RepositorioAvisosFirestore:
    def __init__(self, cliente: Any) -> None:
        self.db = cliente

    def documento(self, coleccion: str, id_: str) -> dict | None:
        s = self.db.collection(coleccion).document(id_).get()
        return (s.to_dict() or {}) if s.exists else None

    def dispositivos(self, uid: str) -> list[str]:
        return [d.id for d in self.db.collection("usuarios").document(uid).collection("dispositivos").stream()]

    def guardar_novedad(self, uid: str, id_: str, datos: dict) -> bool:
        """Crea la novedad con un id fijo: si el admin reintenta, no se repite (False si ya existía)."""
        from google.api_core.exceptions import AlreadyExists
        from google.cloud.firestore_v1 import SERVER_TIMESTAMP

        try:
            ref = self.db.collection("usuarios").document(uid).collection("notificaciones").document(id_)
            ref.create({**datos, "fecha_envio": SERVER_TIMESTAMP, "leida": False})
            return True
        except AlreadyExists:
            return False

    def borrar_dispositivos(self, uid: str, tokens: list[str]) -> None:
        col = self.db.collection("usuarios").document(uid).collection("dispositivos")
        for t in tokens:
            col.document(t).delete()


class AvisadorFCM:
    """Envía con firebase_admin.messaging.send_each_for_multicast (hasta 500 tokens por llamada)."""

    def __init__(self, app: Any) -> None:
        self.app = app

    def enviar(self, tokens: list[str], titulo: str, texto: str, enlace: str, etiqueta: str) -> tuple[int, list[str]]:
        from firebase_admin import messaging

        # Solo datos: el service worker de la PWA arma la notificación (ícono de la marca y pantalla al tocarla)
        m = messaging.MulticastMessage(
            tokens=tokens,
            data={"titulo": titulo, "texto": texto, "enlace": enlace, "etiqueta": etiqueta, "icono": ICONO},
            webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": str(7 * 24 * 3600)}),
        )
        r = messaging.send_each_for_multicast(m, app=self.app)
        malos = []
        for t, resp in zip(tokens, r.responses):
            codigo = getattr(resp.exception, "code", "") if resp.exception else ""
            # registration-token-not-registered (UNREGISTERED) o token mal formado: ya no sirve
            if resp.exception and (
                isinstance(resp.exception, messaging.UnregisteredError)
                or codigo in ("registration-token-not-registered", "invalid-argument", "NOT_FOUND", "INVALID_ARGUMENT")
            ):
                malos.append(t)
        return r.success_count, malos


_estado: dict[str, Any] = {}


class SinCredenciales(RuntimeError):
    pass


def iniciar_app_avisos() -> Any:
    """App de firebase_admin aparte («avisos»), con FIREBASE_SA_FCM. Con el emulador, sin credenciales."""
    import firebase_admin
    from firebase_admin import credentials

    try:
        return firebase_admin.get_app("avisos")
    except ValueError:
        pass
    proyecto = os.environ.get("FIREBASE_PROJECT", "fusa-conecta")
    sa = os.environ.get("FIREBASE_SA_FCM", "").strip()
    if sa:
        return firebase_admin.initialize_app(
            credentials.Certificate(json.loads(sa)), {"projectId": proyecto}, name="avisos"
        )
    if os.environ.get("FIRESTORE_EMULATOR_HOST"):
        return firebase_admin.initialize_app(options={"projectId": proyecto}, name="avisos")
    raise SinCredenciales("Falta FIREBASE_SA_FCM (cuenta de servicio de avisos). Ver api/LEEME.md.")


def repositorio_avisos() -> RepositorioAvisos:
    if "repo" not in _estado:
        app = iniciar_app_avisos()
        if os.environ.get("FIRESTORE_EMULATOR_HOST") and not os.environ.get("FIREBASE_SA_FCM"):
            from google.auth.credentials import AnonymousCredentials
            from google.cloud import firestore

            cliente = firestore.Client(
                project=os.environ.get("FIREBASE_PROJECT", "fusa-conecta"), credentials=AnonymousCredentials()
            )
        else:
            from firebase_admin import firestore as fs

            cliente = fs.client(app)
        _estado["repo"] = RepositorioAvisosFirestore(cliente)
    return _estado["repo"]


def avisador() -> Avisador:
    if "avisador" not in _estado:
        _estado["avisador"] = AvisadorFCM(iniciar_app_avisos())
    return _estado["avisador"]
