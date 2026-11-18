"""IA por la API (v1.3.0): respaldo de Firebase AI Logic cuando Google exige App Check.

La app llama a Gemini con Firebase AI Logic. Si la consola exige App Check (Google lo hará solo desde el 21 de enero
de 2027) y la app no puede usarlo en el plan Spark, la app pasa por aquí. La clave GEMINI_API_KEY vive solo en las
variables de Render: nunca en el código de la app.

Límites para que nadie use la API como una IA gratis:
- solo con sesión de Firebase (token verificado);
- solo dos usos: «evento» (leer un afiche o texto con salida JSON) y «asistente» (preguntas con funciones);
- modelo fijo, temperatura y largo de respuesta acotados, y un cupo diario por persona en Firestore (uso_ia_api).
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

log = logging.getLogger("fusa-api")
MODELO = os.environ.get("MODELO_IA", "gemini-flash-lite-latest")
CUPO_DIA = int(os.environ.get("CUPO_IA_DIA", "80"))  # llamadas a Gemini por persona al día (una pregunta usa hasta 5)
MAX_TOKENS = 2048
REINTENTOS = 2
ZONA_COL = timezone(timedelta(hours=-5))
URL = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"


class SinClave(Exception):
    """Falta GEMINI_API_KEY en las variables de Render."""


class ErrorIA(Exception):
    def __init__(self, estado: int, mensaje: str) -> None:
        super().__init__(mensaje)
        self.estado = estado


class PedidoIA(BaseModel):
    """Lo mismo que el SDK de Firebase AI Logic le envía a Gemini, pero con lo justo para la app."""

    uso: Literal["evento", "asistente"]
    contents: list[dict[str, Any]] = Field(min_length=1, max_length=30)
    systemInstruction: dict[str, Any] | None = None
    tools: list[dict[str, Any]] | None = Field(default=None, max_length=1)
    generationConfig: dict[str, Any] | None = None


def cuerpo_gemini(p: PedidoIA) -> dict[str, Any]:
    """Arma el pedido a Gemini sin dejar pasar nada más: sin funciones en «evento», sin JSON en «asistente»."""
    origen = p.generationConfig or {}
    config: dict[str, Any] = {
        "temperature": min(max(float(origen.get("temperature", 0.3)), 0.0), 1.0),
        "maxOutputTokens": MAX_TOKENS,
    }
    cuerpo: dict[str, Any] = {"contents": p.contents, "generationConfig": config}
    if p.uso == "evento":
        config["responseMimeType"] = "application/json"
        if isinstance(origen.get("responseSchema"), dict):
            config["responseSchema"] = origen["responseSchema"]
    else:
        if p.tools:
            cuerpo["tools"] = p.tools
        if p.systemInstruction:
            cuerpo["systemInstruction"] = p.systemInstruction
    return cuerpo


class Gemini(Protocol):
    def generar(self, cuerpo: dict[str, Any]) -> dict[str, Any]: ...


class GeminiHTTP:
    """Llamada directa a la Gemini Developer API (urllib: sin dependencias nuevas en Render)."""

    def __init__(self, clave: str, modelo: str = MODELO, segundos: int = 40) -> None:
        self.clave, self.modelo, self.segundos = clave, modelo, segundos

    def generar(self, cuerpo: dict[str, Any]) -> dict[str, Any]:
        datos = json.dumps(cuerpo).encode()
        for intento in range(REINTENTOS + 1):
            req = urllib.request.Request(
                URL.format(modelo=self.modelo),
                data=datos,
                headers={"Content-Type": "application/json", "x-goog-api-key": self.clave},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=self.segundos) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                pasajero = e.code in (429, 500, 502, 503, 504)
                if not pasajero or intento == REINTENTOS:
                    log.warning("Gemini HTTP %s", e.code)
                    raise ErrorIA(e.code, f"Gemini respondió {e.code}") from e
                time.sleep(2 * (intento + 1))
        raise ErrorIA(503, "Gemini no respondió")  # pragma: no cover


def gemini() -> Gemini:
    clave = os.environ.get("GEMINI_API_KEY", "").strip()
    if not clave:
        raise SinClave
    return GeminiHTTP(clave)


class Contador(Protocol):
    def usar(self, uid: str) -> int: ...


class ContadorFirestore:
    """Cupo diario por persona (día de Colombia) en uso_ia_api/{uid}. Lo escribe solo la API (cuenta de servicio)."""

    def __init__(self, cupo: int = CUPO_DIA) -> None:
        from firebase_admin import firestore

        from .repositorio import iniciar_firebase

        iniciar_firebase()
        self.db, self.firestore, self.cupo = firestore.client(), firestore, cupo

    def usar(self, uid: str) -> int:
        ref = self.db.collection("uso_ia_api").document(uid)
        dia = datetime.now(ZONA_COL).strftime("%Y-%m-%d")
        cupo = self.cupo

        @self.firestore.transactional
        def _usar(t: Any) -> int:
            s = ref.get(transaction=t)
            x = s.to_dict() if s.exists else {}
            n = (x.get("n", 0) if x.get("dia") == dia else 0) + 1
            if n > cupo:
                raise ErrorIA(429, "Llegaste al límite de IA de hoy")
            t.set(ref, {"dia": dia, "n": n, "ultima": self.firestore.SERVER_TIMESTAMP})
            return cupo - n

        return _usar(self.db.transaction())


def contador() -> Contador:
    return ContadorFirestore()
