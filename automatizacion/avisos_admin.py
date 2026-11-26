"""Avisos de la agenda automática.

- A los admin, cuando deja eventos por aprobar (v95): la novedad en la campana de cada uno
  (usuarios/{uid}/notificaciones) y, si la cuenta de servicio de la agenda (FIREBASE_SA) puede usar Firebase Cloud
  Messaging, el push a sus celulares.
- A todos, cuando publica eventos nuevos (v103): un solo push por corrida («3 eventos nuevos en Fusagasugá y Pasca»)
  a quienes tienen los avisos encendidos y no apagaron «Eventos nuevos» (avisos_eventos en su perfil).

Si FCM no responde, la agenda sigue: un aviso que no sale nunca detiene la búsqueda de eventos.
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


def _enviar_fcm(
    tokens: list[str], titulo: str, texto: str, enlace: str = "#/admin", etiqueta: str = "agenda-pendientes"
) -> int:
    from firebase_admin import messaging

    m = messaging.MulticastMessage(
        tokens=tokens[:500],
        data={
            "titulo": titulo,
            "texto": texto,
            "enlace": enlace,
            "etiqueta": etiqueta,
            "icono": APP_URL + "/img/icons/icon-192.png",
        },
        webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": str(24 * 3600)}),
    )
    return messaging.send_each_for_multicast(m).success_count


# ---------- Eventos nuevos, a todos (v103) ----------
def texto_eventos(eventos: list[dict]) -> tuple[str, str, str]:
    """(título, texto, enlace). eventos: [{"id", "titulo", "municipio", "lugar_nombre"}]."""
    n = len(eventos)
    if n == 1:
        e = eventos[0]
        texto = " · ".join(p for p in (f"«{e['titulo']}»", e.get("lugar_nombre") or "") if p)
        return f"Nuevo evento en {e.get('municipio') or 'Fusagasugá'}", texto, f"#/evento/{e['id']}"
    lugar = " y ".join(sorted({e.get("municipio") or "Fusagasugá" for e in eventos}))
    muestra = ", ".join(f"«{e['titulo']}»" for e in eventos[:2]) + (f" y {n - 2} más" if n > 2 else "")
    return f"{n} eventos nuevos en {lugar}", muestra, "#/agenda"


def avisar_eventos_nuevos(db: Any, eventos: list[dict], id_corrida: str, enviar: Any = None) -> dict:
    """Devuelve {"dispositivos": n, "enviados": n}. «enviar» permite probar sin FCM (por defecto, firebase_admin)."""
    if not eventos or db is None:
        return {"dispositivos": 0, "enviados": 0}
    titulo, texto, enlace = texto_eventos(eventos)
    perfiles: dict[str, dict] = {}
    tokens: list[str] = []
    for d in db.collection_group("dispositivos").stream():
        padre = d.reference.parent.parent
        if padre is None or padre.parent.id != "usuarios":
            continue
        if padre.id not in perfiles:
            perfiles[padre.id] = db.collection("usuarios").document(padre.id).get().to_dict() or {}
        p = perfiles[padre.id]
        if p.get("notificaciones_push") is not False and p.get("avisos_eventos") is not False:
            tokens.append(d.id)
    r = {"dispositivos": len(tokens), "enviados": 0}
    for i in range(0, len(tokens), 500):
        r["enviados"] += (enviar or _enviar_fcm)(tokens[i : i + 500], titulo, texto, enlace, f"eventos-{id_corrida}")
    return r
