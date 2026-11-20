"""Aviso a los admin cuando la agenda automática deja eventos por aprobar (v95).

Escribe la novedad en la campana de cada admin (usuarios/{uid}/notificaciones) y, si la cuenta de servicio de la
agenda (FIREBASE_SA) puede usar Firebase Cloud Messaging, manda el push a sus celulares. Si no puede, la novedad queda
en la campana igual y la agenda sigue: un aviso que no sale nunca detiene la búsqueda de eventos.
"""

from __future__ import annotations

import logging
import os
from typing import Any

log = logging.getLogger("agenda")
APP_URL = os.environ.get("APP_URL", "https://fusa-conecta.web.app").rstrip("/")


def texto_aviso(titulos: list[str]) -> tuple[str, str]:
    n = len(titulos)
    muestra = ", ".join(f"«{t}»" for t in titulos[:3]) + ("…" if n > 3 else "")
    return (
        "Eventos por aprobar",
        f"La agenda automática encontró {n} evento{'s' if n != 1 else ''} por revisar: {muestra}",
    )


def avisar_admins(db: Any, titulos: list[str], id_corrida: str, enviar: Any = None) -> dict:
    """Devuelve {"admins": n, "enviados": n}. «enviar» permite probar sin FCM (por defecto, firebase_admin)."""
    if not titulos or db is None:
        return {"admins": 0, "enviados": 0}
    from google.cloud.firestore_v1 import SERVER_TIMESTAMP

    from comun import igual

    titulo, texto = texto_aviso(titulos)
    datos = {"tipo": "pendiente", "titulo": titulo, "mensaje": texto, "enlace": "#/admin", "leida": False}
    r = {"admins": 0, "enviados": 0}
    for a in db.collection("usuarios").where(filter=igual("rol", "admin")).stream():
        r["admins"] += 1
        ref = db.collection("usuarios").document(a.id)
        ref.collection("notificaciones").document(f"agenda-{id_corrida}").set(
            {**datos, "fecha_envio": SERVER_TIMESTAMP}
        )
        if (a.to_dict() or {}).get("notificaciones_push") is False:
            continue
        tokens = [d.id for d in ref.collection("dispositivos").stream()]
        if not tokens:
            continue
        try:
            r["enviados"] += (enviar or _enviar_fcm)(tokens, titulo, texto)
        except Exception as e:  # noqa: BLE001 - sin permiso de FCM la novedad igual queda en la campana
            log.warning("Aviso al celular del admin no enviado: %s", e)
    return r


def _enviar_fcm(tokens: list[str], titulo: str, texto: str) -> int:
    from firebase_admin import messaging

    m = messaging.MulticastMessage(
        tokens=tokens[:500],
        data={
            "titulo": titulo,
            "texto": texto,
            "enlace": "#/admin",
            "etiqueta": "agenda-pendientes",
            "icono": APP_URL + "/img/icons/icon-192.png",
        },
        webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": str(24 * 3600)}),
    )
    return messaging.send_each_for_multicast(m).success_count
