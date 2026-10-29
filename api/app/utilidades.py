"""Utilidades puras de la API (sin Firestore): búsqueda, horarios, fechas de Colombia y avisos del municipio.

Son traducciones directas de las funciones de la PWA (app.js) para que la API responda igual que la app:
`norm`, `raiz`, `tokens`, `coincide`, `parsearDias`, `parsearRangos`, `estadoApertura`, `horaTexto` y `esAviso`.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

# Colombia no tiene horario de verano: UTC-5 todo el año (no hace falta la base tzdata en Windows)
ZONA_COL = timezone(timedelta(hours=-5), "America/Bogota")
DIA_IDX = {"dom": 0, "lun": 1, "mar": 2, "mie": 3, "jue": 4, "vie": 5, "sab": 6}
DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
TIPOS_NATURALES = ("sendero", "mirador")
RE_NATURAL = re.compile(r"\b(cerro|sendero|mirador|camino real|alto de)\b", re.I)
# Misma lista que la app y la agenda automática
RE_AVISO = re.compile(
    r"vacunaci|jornada de (salud|vacun)|lavado de tanques|fumigaci|tamizaje|brigada de salud"
    r"|cortes? de (agua|luz|energ|servicio)|suspensi[oó]n del servicio|racionamiento",
    re.I,
)


def ahora_col() -> datetime:
    """Fecha y hora actual en Colombia."""
    return datetime.now(ZONA_COL)


# ---------- Búsqueda sin tildes, sin mayúsculas y sin plurales ----------
def norm(texto: Any) -> str:
    """Quita tildes y pasa a minúsculas (como `norm` de la app)."""
    s = unicodedata.normalize("NFD", str(texto or ""))
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def raiz(palabra: str) -> str:
    """Singular aproximado: «droguerias» → «drogueria», «cafes» → «caf»."""
    if len(palabra) > 4 and palabra.endswith("es"):
        return palabra[:-2]
    if len(palabra) > 3 and palabra.endswith("s"):
        return palabra[:-1]
    return palabra


def tokens(texto: Any) -> list[str]:
    return [raiz(t) for t in re.split(r"[^a-z0-9]+", norm(texto)) if t]


def coincide(texto_lugar: str, consulta: str) -> bool:
    """Todas las palabras de la consulta aparecen en el texto del lugar."""
    if not consulta:
        return True
    txt = " ".join(tokens(texto_lugar))
    return all(t in txt for t in tokens(consulta))


# ---------- Horarios ----------
def parsear_dias(texto: str) -> list[int]:
    n = norm(texto)
    if re.search(r"todos|todo el dia|diari|24 ?h", n) and not re.search(r"(lun|mar|mie|jue|vie|sab|dom)\s*-", n):
        return list(range(7))
    r = re.search(r"(lun|mar|mie|jue|vie|sab|dom)\s*-\s*(lun|mar|mie|jue|vie|sab|dom)", n)
    if r:
        b, salida, i = DIA_IDX[r.group(2)], [], DIA_IDX[r.group(1)]
        while True:
            salida.append(i)
            if i == b:
                return salida
            i = (i + 1) % 7
    sueltos = [DIA_IDX[m] for m in re.findall(r"\b(lun|mar|mie|jue|vie|sab|dom)\b", n)]
    return sueltos or list(range(7))


_RE_RANGO = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|m\.)?", re.I)


def parsear_rangos(texto: str) -> list[tuple[int, int]]:
    """«8:00–18:00», «7–9 p. m.» → minutos desde medianoche [(inicio, fin)]."""
    salida = []
    for m in _RE_RANGO.finditer(texto or ""):
        s = int(m.group(1)) + (int(m.group(2) or 0)) / 60
        e = int(m.group(3)) + (int(m.group(4) or 0)) / 60
        suf = (m.group(5) or "").lower()[:1]
        if suf == "p" and e < 12:
            e += 12
        elif suf == "a" and int(e) == 12:
            e = 24
        elif suf == "m":
            e = 12
        elif not suf and e <= 7:
            e += 12
        if suf == "a":
            if e == 24:
                if s < 8:
                    s += 12
            elif s > e:
                s += 12
        elif s < 5 and s + 12 < e:
            s += 12
        salida.append((round(s * 60), round(e * 60)))
    return salida


def hora_texto(minutos: int) -> str:
    """540 → «9:00 a. m.»"""
    minutos = ((minutos % 1440) + 1440) % 1440
    h, m = divmod(minutos, 60)
    return f"{h % 12 or 12}:{m:02d} " + ("a. m." if h < 12 else "p. m.")


def es_natural(d: dict) -> bool:
    return d.get("cat") == "turismo" and (
        d.get("tipo") in TIPOS_NATURALES or bool(RE_NATURAL.search(d.get("nombre") or ""))
    )


def estado_apertura(d: dict, ahora: datetime | None = None) -> dict | None:
    """{tipo: ab|pronto|cerr, abierto, texto} o None si no hay horario calculable (senderos, sin horario)."""
    if es_natural(d):
        return None
    if d.get("dias") and d.get("abre") and d.get("cierra"):

        def hm(x: str) -> int:
            h, _, mi = x.partition(":")
            return int(h) * 60 + int(mi or 0)

        dias, rangos = list(d["dias"]), [(hm(d["abre"]), hm(d["cierra"]))]
    else:
        h = d.get("horario") or ""
        if re.search(r"24\s*h|24 horas", h, re.I):
            return {"tipo": "ab", "abierto": True, "texto": "Abierto 24 horas"}
        rangos = parsear_rangos(h)
        if not rangos:
            return None
        dias = parsear_dias(h)
    t = ahora or ahora_col()
    dia = (t.weekday() + 1) % 7  # Python: lunes=0 → domingo=0 como en JavaScript
    minuto, ayer = t.hour * 60 + t.minute, (dia + 6) % 7
    for s, e in rangos:
        resta = None
        if e > s:
            if dia in dias and s <= minuto < e:
                resta = e - minuto
        elif dia in dias and minuto >= s:
            resta = 1440 - minuto + e
        elif ayer in dias and minuto < e:
            resta = e - minuto
        if resta is not None:
            return (
                {"tipo": "pronto", "abierto": True, "texto": "Cierra pronto"}
                if resta <= 60
                else {"tipo": "ab", "abierto": True, "texto": "Abierto"}
            )
    prox = None
    for o in range(8):
        di = (dia + o) % 7
        if di not in dias:
            continue
        inicios = sorted(s for s, _ in rangos if o > 0 or s > minuto)
        if inicios:
            prox = (o, di, inicios[0])
            break
    if not prox:
        return {"tipo": "cerr", "abierto": False, "texto": "Cerrado"}
    o, di, ini = prox
    if o * 1440 + ini - minuto <= 60:
        return {"tipo": "pronto", "abierto": False, "texto": "Abre pronto · " + hora_texto(ini)}
    cuando = (
        "Abre a las " + hora_texto(ini)
        if o == 0
        else "Abre mañana " + hora_texto(ini) if o == 1 else f"Abre el {DIAS_LARGO[di]} {hora_texto(ini)}"
    )
    return {"tipo": "cerr", "abierto": False, "texto": cuando}


# ---------- Eventos ----------
def es_aviso(e: dict) -> bool:
    """Aviso del municipio (jornadas, vacunación, cortes de servicio) y no un plan."""
    if e.get("tipo") in ("plan", "aviso"):
        return e["tipo"] == "aviso"
    return e.get("categoria") == "institucional" or bool(RE_AVISO.search(e.get("titulo") or ""))


def iso_col(ms: int | float | None) -> str | None:
    """Milisegundos → «2026-10-31T14:00:00-05:00»."""
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, ZONA_COL).isoformat(timespec="seconds")


def dia_col(texto: str, fin: bool = False) -> int:
    """«2026-10-31» → milisegundos del inicio (o del final) de ese día en Colombia."""
    d = datetime.strptime(texto[:10], "%Y-%m-%d").replace(tzinfo=ZONA_COL)
    if fin:
        d += timedelta(days=1, milliseconds=-1)
    return int(d.timestamp() * 1000)


def nombre_archivo(texto: str) -> str:
    """«Panadería La Espiga» → «panaderia-la-espiga» (los encabezados HTTP solo admiten ASCII)."""
    return re.sub(r"[^a-z0-9]+", "-", norm(texto)).strip("-") or "archivo"


def mes_valido(mes: str | None) -> str:
    """«2026-10» (por defecto, el mes actual en Colombia)."""
    if not mes:
        return ahora_col().strftime("%Y-%m")
    if not re.fullmatch(r"20\d\d-(0[1-9]|1[0-2])", mes):
        raise ValueError("mes debe tener la forma AAAA-MM")
    return mes


def paginar(lista: list, pagina: int, por_pagina: int) -> dict:
    total = len(lista)
    inicio = (pagina - 1) * por_pagina
    return {
        "total": total,
        "pagina": pagina,
        "por_pagina": por_pagina,
        "paginas": max(1, -(-total // por_pagina)),
        "resultados": lista[inicio : inicio + por_pagina],
    }


def unicos(valores: Iterable[str]) -> list[str]:
    vistos: set[str] = set()
    return [v for v in valores if not (v in vistos or vistos.add(v))]
