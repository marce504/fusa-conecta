"""Limpieza diaria de Fusa Conecta (GitHub Actions, 6:00 a. m. de Colombia).

1. Cupones vencidos: los que siguen «activo» con la vigencia ya pasada pasan a «finalizado». La app ya no los mostraba
   (filtra por fecha), pero así el panel del comerciante y las estadísticas dicen la verdad. Los cupones que ya están
   en la
   billetera de cada persona no cambian: allí pasan solos a «Vencidos».
2. Eventos de ejemplo (demo:true) con más de 24 horas: se borran.
3. Negocios publicados sin foto o sin WhatsApp: se listan en el resumen para el admin. Cada dueño ve en «Mi negocio» el
   aviso «Tu ficha está incompleta: agrega una foto y tu WhatsApp para recibir más clientes».

El resumen queda en config/limpieza y se ve en Panel → Eventos → Procesos automáticos.

Uso:
    python automatizacion/limpieza.py              hace la limpieza
    python automatizacion/limpieza.py --simular    solo dice qué haría
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import DIA_MS, a_ms, ahora_ms, de_ms, firestore_cliente, hoy_col, igual, registro, servidor  # noqa: E402

log, memoria = registro("limpieza")


def cupones_vencidos(cupones: list[dict], hoy: str) -> list[dict]:
    """La vigencia es «AAAA-MM-DD» y vale hasta el final de ese día en Colombia."""
    return [
        c for c in cupones if (c.get("estado") or "activo") == "activo" and c.get("vigencia") and c["vigencia"] < hoy
    ]


def ejemplos_vencidos(eventos: list[dict], ahora: int) -> list[dict]:
    return [e for e in eventos if e.get("demo") and (a_ms(e.get("fecha_creacion")) or 0) < ahora - DIA_MS]


def sin_foto(comercios: list[dict]) -> list[dict]:
    return sorted(
        (
            {"id": c["id"], "nombre": c.get("nombre", "")}
            for c in comercios
            if not c.get("imagen") and not c.get("fotos")
        ),
        key=lambda c: c["nombre"].lower(),
    )


def sin_whatsapp(comercios: list[dict]) -> list[dict]:
    """Publicados sin un número de WhatsApp (v1.2.0): el dueño ve en Mi negocio que su ficha está incompleta."""
    return sorted(
        (
            {"id": c["id"], "nombre": c.get("nombre", "")}
            for c in comercios
            if not re.sub(r"\D", "", str(c.get("whatsapp") or ""))
        ),
        key=lambda c: c["nombre"].lower(),
    )


def _docs(consulta: Any) -> list[tuple[Any, dict]]:
    return [(d.reference, {**(d.to_dict() or {}), "id": d.id}) for d in consulta.stream()]


def main(argv: list[str] | None = None) -> int:
    a = argparse.ArgumentParser(description="Limpieza diaria de Fusa Conecta")
    a.add_argument("--simular", action="store_true")
    args = a.parse_args(argv)
    t0, ahora, hoy = time.time(), ahora_ms(), hoy_col()
    db = firestore_cliente()
    if not db:
        log.info("Falta FIREBASE_SA (secreto de GitHub): no se hace nada.")
        return 0
    cupones = _docs(db.collection("cupones").where(filter=igual("estado", "activo")))
    vencidos = [(ref, c) for ref, c in cupones if c in cupones_vencidos([c], hoy)]
    demos = [
        (ref, e)
        for ref, e in _docs(db.collection("eventos").where(filter=igual("demo", True)))
        if ejemplos_vencidos([e], ahora)
    ]
    publicados = [c for _, c in _docs(db.collection("comercios").where(filter=igual("estado_publicacion", "aprobado")))]
    faltan_foto, faltan_wa = sin_foto(publicados), sin_whatsapp(publicados)
    for _, c in vencidos:
        log.info(
            "Cupón vencido el %s: %s · %s", c.get("vigencia"), c.get("comercio_nombre", ""), c.get("descripcion", "")
        )
    for _, e in demos:
        log.info("Evento de ejemplo con más de 24 horas: %s", e.get("titulo", ""))
    for c in faltan_foto:
        log.info("Negocio publicado sin foto: %s", c["nombre"])
    for c in faltan_wa:
        log.info("Negocio publicado sin WhatsApp: %s", c["nombre"])
    if args.simular:
        log.info(
            "Simulación: %d cupones vencidos, %d eventos de ejemplo, %d negocios sin foto, %d sin WhatsApp. "
            "No se cambió nada.",
            len(vencidos),
            len(demos),
            len(faltan_foto),
            len(faltan_wa),
        )
        return 0
    lote = db.batch()
    for ref, _ in vencidos:
        lote.update(ref, {"estado": "finalizado", "finalizado_por": "limpieza", "fecha_finalizado": servidor()})
    for ref, _ in demos:
        lote.delete(ref)
    lote.commit()
    log.info(
        "Listo: %d cupones vencidos ocultados · %d eventos de ejemplo borrados · %d negocios sin foto · "
        "%d sin WhatsApp.",
        len(vencidos),
        len(demos),
        len(faltan_foto),
        len(faltan_wa),
    )
    db.collection("config").document("limpieza").set(
        {
            "ultima_corrida": de_ms(int(t0 * 1000)),
            "duracion_s": round(time.time() - t0),
            "cupones_vencidos": len(vencidos),
            "cupones_lista": [f"{c.get('comercio_nombre', '')} · {c.get('descripcion', '')}" for _, c in vencidos][:20],
            "ejemplos_borrados": len(demos),
            "sin_foto": faltan_foto[:50],
            "sin_foto_total": len(faltan_foto),
            "sin_whatsapp": faltan_wa[:50],
            "sin_whatsapp_total": len(faltan_wa),
            "registro": memoria.lineas[-20:],
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
