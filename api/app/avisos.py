"""Avisos al celular (Firebase Cloud Messaging) cuando el admin aprueba o rechaza algo.

Plan Spark, sin Cloud Functions: el panel admin guarda la decisión en Firestore y después llama a
POST /v1/notificaciones/aprobacion. Esta API busca a la persona, escribe la novedad en su campana
(usuarios/{uid}/notificaciones) y envía el push a sus dispositivos (usuarios/{uid}/dispositivos).

Credenciales: una cuenta de servicio APARTE de la de solo lectura (FIREBASE_SA_FCM, en Render) con el rol
«Firebase Cloud Messaging API Admin» y escritura en Firestore. IAM no limita la escritura por colección, así que
este módulo es el único que la usa y solo escribe en esas dos subcolecciones y, para las alertas municipales,
en alertas/{id}/envios (lo comprueban las pruebas).

Alertas municipales (API v1.4.0): el admin publica alertas/{id} desde el panel y llama a POST /v1/alertas/enviar. La
API manda el push a todos los dispositivos de quienes no apagaron los avisos, una sola vez por alerta.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Literal, Protocol

Tipo = Literal["comercio", "evento", "ruta", "premium", "reclamo", "empleo"]
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
    "empleo": Fuente("empleos", "autor_uid", "titulo", "motivo", {"aprobado": "publicado", "rechazado": "rechazado"}),
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
    if tipo == "empleo":
        if resultado == "aprobado":
            return "Oferta publicada", f"¡Tu oferta «{nombre}» ya está en Empleos de Fusa Conecta!", "#/empleos"
        return "Revisamos tu oferta", f"Revisamos tu oferta «{nombre}»: {motivo}. Puedes corregirla.", "#/mi-negocio"
    if resultado == "aprobado":  # reclamo
        return (
            "Reclamo aprobado",
            f"Ya administras {nombre} en Fusa Conecta. Complétalo desde Mi negocio.",
            "#/mi-negocio",
        )
    return "Revisamos tu reclamo", f"Revisamos tu reclamo de {nombre}: {motivo}.", "#/perfil"


TIPOS_ALERTA = {
    "agua": "Corte de agua",
    "energia": "Corte de energía",
    "via": "Vía cerrada",
    "clima": "Clima",
    "salud": "Salud",
    "seguridad": "Seguridad",
    "otro": "Aviso",
}
LOTE_FCM = 500  # máximo de tokens por llamada a send_each_for_multicast


@dataclass(frozen=True)
class Pendiente:
    """Algo que alguien envió a revisión: dónde vive, quién lo envió, cómo se llama y el campo de su estado."""

    coleccion: str
    dueno: str
    nombre: str
    campo_estado: str
    texto: str  # «registró el negocio», «sugirió el evento»…
    tipo_doc: str = ""  # en «solicitudes», el campo tipo debe coincidir


PENDIENTES: dict[str, Pendiente] = {
    "comercio": Pendiente("comercios", "propietario_uid", "nombre", "estado_publicacion", "registró el negocio"),
    "evento": Pendiente("eventos", "creado_por", "titulo", "estado", "sugirió el evento"),
    "ruta": Pendiente("rutas_comunidad", "autor_uid", "nombre", "estado", "propuso la ruta"),
    "premium": Pendiente("solicitudes", "uid", "comercio_nombre", "estado", "pidió Premium para", "premium"),
    "reclamo": Pendiente("solicitudes", "uid", "comercio_nombre", "estado", "reclamó el negocio", "reclamo"),
    "reporte": Pendiente("reportes", "uid", "comercio_nombre", "estado", "reportó un problema en"),
    "empleo": Pendiente("empleos", "autor_uid", "titulo", "estado", "publicó la oferta de empleo"),
}
TITULO_PENDIENTE = {
    "comercio": "Negocio por aprobar",
    "evento": "Evento por aprobar",
    "ruta": "Ruta por aprobar",
    "premium": "Solicitud Premium",
    "reclamo": "Reclamo de negocio",
    "reporte": "Reporte por revisar",
    "empleo": "Oferta de empleo por aprobar",
}


def mensaje_pendiente(tipo: str, quien: str, nombre: str) -> tuple[str, str, str]:
    """(título, texto, enlace) del aviso al admin. El enlace abre el panel."""
    p = PENDIENTES[tipo]
    quien = (quien or "Alguien").strip().split(" ")[0] or "Alguien"
    nombre = (nombre or "").strip() or "sin nombre"
    return TITULO_PENDIENTE[tipo], f"{quien} {p.texto} «{nombre}». Revísalo en el panel.", "#/admin"


def mensaje_alerta(doc: dict, id_: str) -> tuple[str, str, str]:
    """(título, texto, enlace) del push de una alerta municipal."""
    tipo = TIPOS_ALERTA.get(doc.get("tipo", ""), "Aviso")
    mun = doc.get("municipio") or "Ambos"
    lugar = "" if mun == "Ambos" else f" en {mun}"
    titulo = f"{tipo}{lugar}: {(doc.get('titulo') or '').strip()}"[:110]
    texto = (doc.get("mensaje") or "").strip()[:300]
    return titulo, texto, f"#/alerta/{id_}"


# ---------- Acceso a Firestore con la cuenta de avisos ----------
class RepositorioAvisos(Protocol):
    def documento(self, coleccion: str, id_: str) -> dict | None: ...
    def dispositivos(self, uid: str) -> list[str]: ...
    def guardar_novedad(self, uid: str, id_: str, datos: dict) -> bool: ...
    def borrar_dispositivos(self, uid: str, tokens: list[str]) -> None: ...
    def todos_los_dispositivos(self) -> dict[str, list[str]]: ...
    def admins(self) -> list[str]: ...
    def registrar_envio_alerta(self, id_: str, datos: dict) -> bool: ...
    def completar_envio_alerta(self, id_: str, datos: dict) -> None: ...


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

    def admins(self) -> list[str]:
        from google.cloud.firestore_v1.base_query import FieldFilter

        q = self.db.collection("usuarios").where(filter=FieldFilter("rol", "==", "admin"))
        return [d.id for d in q.stream()]

    def todos_los_dispositivos(self) -> dict[str, list[str]]:
        """uid → tokens, de todas las subcolecciones usuarios/{uid}/dispositivos."""
        out: dict[str, list[str]] = {}
        for d in self.db.collection_group("dispositivos").stream():
            padre = d.reference.parent.parent
            if padre is not None and padre.parent.id == "usuarios":
                out.setdefault(padre.id, []).append(d.id)
        return out

    def registrar_envio_alerta(self, id_: str, datos: dict) -> bool:
        """Marca la alerta como enviada con un id fijo: si el admin reintenta, no se repite (False si ya estaba)."""
        from google.api_core.exceptions import AlreadyExists
        from google.cloud.firestore_v1 import SERVER_TIMESTAMP

        try:
            ref = self.db.collection("alertas").document(id_).collection("envios").document("push")
            ref.create({**datos, "fecha": SERVER_TIMESTAMP})
            return True
        except AlreadyExists:
            return False

    def completar_envio_alerta(self, id_: str, datos: dict) -> None:
        self.db.collection("alertas").document(id_).collection("envios").document("push").set(datos, merge=True)


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
