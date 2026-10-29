"""Agenda automática de Fusa Conecta (Python; antes herramientas/agenda-ia/extraer.mjs, mismo comportamiento).

Lee las APIs públicas de los sitios oficiales (plataforma gov.co), extrae eventos futuros y los guarda en Firestore:
- Alcaldías de Fusagasugá y Pasca con título, fecha, hora y lugar claros → se publican solos con «Fuente oficial».
- Si falta algo, o la fuente no es una alcaldía (IDECUT) → quedan PENDIENTES para el admin.
- Sin duplicados (título + día + lugar, o mismo lugar a la misma hora) contra todo lo que ya existe.
- Títulos de máximo 60 caracteres (la campaña va a la descripción), «plan» o «aviso» del municipio, imagen principal
  de la
  noticia en WebP ≤ 200 KB, reparación de los automáticos anteriores y borrado de los eventos de ejemplo a las 24 horas.
No usa Facebook ni Instagram. Las claves solo están en los secretos de GitHub Actions (GEMINI_API_KEY, FIREBASE_SA).

Uso:
    python automatizacion/agenda.py --simular       no escribe nada; sin GEMINI_API_KEY tampoco usa la IA
    python automatizacion/agenda.py --modo=diaria   corrida completa
    python automatizacion/agenda.py --revisar       solo corre si el admin tocó «Buscar eventos ahora» en la app
    python automatizacion/agenda.py --reparar       solo arregla los automáticos ya guardados; no lee los sitios
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import math
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any
from urllib.parse import quote, urljoin

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import DIA_MS, ZONA_COL, a_ms, ahora_ms, de_ms, firestore_cliente, igual, registro, servidor  # noqa: E402

log, memoria = registro("agenda")


@dataclass(frozen=True)
class Fuente:
    nombre: str
    sitio: str
    municipio: str | None
    oficial: bool
    filtro: re.Pattern | None = None


FUENTES = [
    Fuente("Alcaldía de Fusagasugá", "https://www.fusagasuga.gov.co", "Fusagasugá", True),
    Fuente("Alcaldía de Pasca", "https://www.pasca-cundinamarca.gov.co", "Pasca", True),
    # Instituto de Cultura y Turismo de Cundinamarca: solo lo que mencione Fusagasugá, Pasca o Sumapaz,
    # y siempre pendiente
    Fuente(
        "IDECUT (Cultura y Turismo de Cundinamarca)",
        "https://www.idecut.gov.co",
        None,
        False,
        re.compile(r"fusagasug|pasca|sumapaz", re.I),
    ),
]
PALABRAS = [
    "evento",
    "eventos",
    "agenda",
    "festival",
    "concierto",
    "feria",
    "celebración",
    "programación",
    "cultura",
    "casa de la cultura",
    "deporte",
    "torneo",
    "caminata",
    "mercado campesino",
    "turismo",
    "danza",
    "teatro",
    "música",
    "exposición",
    "cine",
    "taller",
    "navidad",
]
CATEGORIAS = ["cultura", "musica", "deporte", "gastronomia", "feria", "religioso", "institucional", "otro"]
MODELO = os.environ.get("MODELO_IA", "gemini-flash-lite-latest")  # el mismo que funciona en la app
UA = {"User-Agent": "FusaConecta/1.0 (agenda; https://fusa-conecta.web.app)"}


# ---------- Texto ----------
def norm(s: Any) -> str:
    t = unicodedata.normalize("NFD", str(s or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", t)).strip()


def sin_html(s: Any) -> str:
    t = re.sub(r"<[^>]+>", " ", str(s or ""))
    t = re.sub(r"&[a-z]+;", " ", t.replace("&nbsp;", " "))
    return re.sub(r"\s+", " ", t).strip()


def recortar(s: Any, n: int) -> str:
    return str(s or "").strip()[:n]


def fecha_col(s: Any) -> int | None:
    """Las fechas del sitio vienen sin zona horaria: son hora de Colombia (UTC-5). Devuelve milisegundos o None."""
    if not s:
        return None
    s = str(s).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return None  # sin hora no es una fecha válida (así se comportaba la versión en JavaScript: Date.parse daba NaN)
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        m = re.match(r"(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?)?", s)
        if not m:
            return None
        d = datetime.fromisoformat(m.group(1) + "T" + (m.group(2) or "00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=ZONA_COL)
    return int(d.timestamp() * 1000)


SEPARADOR = re.compile(r"\s+[-–—|]\s+|:\s+")
_CONECTORES = re.compile(r"\s+(de|del|la|las|el|los|en|y|e|o|a|al|con|para|por|un|una)$", re.I)


def titulo_corto(t: Any) -> str:
    """Máximo 60 caracteres y sin el nombre de la campaña pegado («Jornada… - Semana de Acción contra el Mosquito»)."""
    s = SEPARADOR.split(sin_html(t))[0].strip() or sin_html(t)
    if len(s) > 60:
        s = re.sub(r"\s+\S*$", "", s[:61])
    for _ in range(4):  # sin palabras de enlace colgando al final («…en talleres de»)
        s = _CONECTORES.sub("", re.sub(r"[\s,;:.\-–]+$", "", s))
    return s[:60]


def campana_de(t: Any) -> str:
    partes = SEPARADOR.split(sin_html(t))
    return " - ".join(partes[1:]).strip() if len(partes) > 1 else ""


def con_campana(desc: Any, campana: str) -> str:
    if campana and norm(campana) not in norm(desc):
        return recortar("Hace parte de: " + campana + ". " + (desc or ""), 1000)
    return recortar(desc, 1000)


# Avisos del municipio (no son planes): la app y la API usan la misma lista
RE_AVISO = re.compile(
    r"vacunaci|jornada de (salud|vacun)|lavado de tanques|fumigaci|tamizaje|brigada de salud"
    r"|cortes? de (agua|luz|energ|servicio)|suspensi[oó]n del servicio|racionamiento",
    re.I,
)


def tipo_de(titulo: str, categoria: str) -> str:
    return "aviso" if categoria == "institucional" or RE_AVISO.search(titulo or "") else "plan"


def _redondear(x: float) -> int:
    """Math.round de JavaScript (redondea .5 hacia arriba; round() de Python redondea al par)."""
    return math.floor(x + 0.5)


def clave(e: dict) -> str:
    """Título + día en Colombia + lugar."""
    dia = de_ms(e["inicio"] - 5 * 3_600_000).strftime("%Y-%m-%d")
    return norm(e["titulo"]) + "|" + dia + "|" + norm(e["lugar_nombre"])


def clave_lugar_hora(e: dict) -> str:
    """Mismo lugar a la misma hora = mismo evento aunque el título cambie."""
    return norm(e["lugar_nombre"]) + "|" + str(_redondear(e["inicio"] / 60_000))


# ---------- Eventos parecidos (v1.2.0) ----------
# «Celebración del Día Dulce» (9:00, Estadio Fernando Mazuera) y «Día Dulce» (14:00, Estadio municipal Fernando Mazuera)
# son el mismo evento contado en dos noticias: ni la clave ni la hora coinciden, así que se comparan por similitud.
VACIAS_LUGAR = {
    "municipal", "estadio", "coliseo", "parque", "plaza", "polideportivo", "centro", "barrio", "vereda", "sede",
    "principal", "auditorio", "salon", "de", "del", "la", "las", "el", "los", "y", "en", "al",
}  # fmt: skip


def palabras_lugar(lugar: Any) -> set[str]:
    return {p for p in norm(lugar).split() if p not in VACIAS_LUGAR and len(p) > 1}


def dia_col_de(ms: int) -> str:
    return de_ms(ms - 5 * 3_600_000).strftime("%Y-%m-%d")


def parecidos(a: dict, b: dict) -> bool:
    """Mismo día, lugar con ≥ 60 % de palabras en común (sin «municipal», «estadio»…) y un título dentro del otro
    o con similitud ≥ 0,6."""
    if dia_col_de(a["inicio"]) != dia_col_de(b["inicio"]):
        return False
    la, lb = palabras_lugar(a["lugar_nombre"]), palabras_lugar(b["lugar_nombre"])
    if la and lb:
        if len(la & lb) / min(len(la), len(lb)) < 0.6:
            return False
    elif norm(a["lugar_nombre"]) != norm(b["lugar_nombre"]):
        return False
    ta, tb = norm(a["titulo"]), norm(b["titulo"])
    if not ta or not tb:
        return False
    return ta in tb or tb in ta or SequenceMatcher(None, ta, tb).ratio() >= 0.6


def fuentes_de(e: dict) -> list[str]:
    """Enlaces de las noticias que hablan del evento (el principal primero, sin repetir)."""
    lista = [e.get("enlace") or e.get("enlace_fuente") or ""] + list(e.get("fuentes") or [])
    return [u for i, u in enumerate(lista) if u and u not in lista[:i]]


def unir(a: dict, b: dict) -> dict:
    """Un solo evento: el horario más amplio, el título más corto (el otro lo contiene), el lugar más completo,
    la descripción más larga y las dos fuentes."""
    principal, otro = (a, b) if len(a["titulo"]) <= len(b["titulo"]) else (b, a)
    r = dict(principal)
    r["inicio"], r["fin"] = min(a["inicio"], b["inicio"]), max(a["fin"], b["fin"])
    r["lugar_nombre"] = max(a["lugar_nombre"], b["lugar_nombre"], key=len)
    r["descripcion"] = max(a.get("descripcion") or "", b.get("descripcion") or "", key=len)
    r["fuentes"] = fuentes_de({**principal, "fuentes": fuentes_de(principal) + fuentes_de(otro)})
    if not r.get("imagen") and otro.get("imagen"):
        r["imagen"] = otro["imagen"]
    return r


def unir_parecidos(eventos: list[dict]) -> list[dict]:
    """Une, dentro de una corrida, los eventos que la regla de similitud considera el mismo."""
    res: list[dict] = []
    for e in eventos:
        i = next((k for k, x in enumerate(res) if parecidos(x, e)), None)
        if i is None:
            res.append(e)
        else:
            res[i] = unir(res[i], e)
            log.info("Unidos por parecidos: «%s» y «%s»", res[i]["titulo"], e["titulo"])
    return res


# ---------- Red ----------
def _http() -> Any:
    import httpx

    return httpx.Client(headers=UA, follow_redirects=True, timeout=30)


def buscar(cliente: Any, f: Fuente, palabra: str) -> list[dict]:
    r = cliente.get(f"{f.sitio}/api/v1/contents", params={"pageSize": 50, "page": 0, "keyword": palabra})
    r.raise_for_status()
    return r.json().get("results") or []


def atributo(x: dict, nombre: str) -> str:
    a = x.get("attributes")
    if not a:
        return ""
    if isinstance(a, list):
        f = next((z for z in a if z.get("attribute") == nombre), None)
        return str(f.get("value") or "") if f else ""
    m = re.search(r"'attribute': '" + re.escape(nombre) + r"', 'value': '([^']*)'", str(a))
    return m.group(1) if m else ""


def texto_de(x: dict) -> str:
    return (
        sin_html(x.get("name"))
        + "\n"
        + sin_html(x.get("metaDescription"))
        + "\n"
        + sin_html(x.get("body") or x.get("description"))
    )


def con_detalle(cliente: Any, f: Fuente, x: dict) -> dict:
    """La búsqueda trae solo título y resumen; el texto completo (fecha, hora, lugar) está en el detalle."""
    try:
        r = cliente.get(f"{f.sitio}/api/v1/contents/{quote(x.get('friendlyName') or '', safe='')}")
        if r.status_code == 200:
            d = r.json() or {}
            if d.get("body"):
                x["body"] = d["body"]
            if d.get("defaultImage"):
                x["defaultImage"] = d["defaultImage"]
    except Exception as e:  # noqa: BLE001 - el sitio a veces no responde; se sigue con el resumen
        log.warning("Detalle de %s: %s", x.get("friendlyName"), e)
    return x


def municipio_de(f: Fuente, x: dict) -> str:
    return f.municipio or ("Pasca" if re.search(r"pasca", texto_de(x), re.I) else "Fusagasugá")


def imagen_de(cliente: Any, x: dict | None, enlace: str) -> str:
    """Imagen principal de la noticia (defaultImage de la API gov.co u og:image), en WebP de máximo 200 KB."""
    try:
        src = x and (x.get("defaultImage") or x.get("defaultThumbnail"))
        if not src and enlace:
            r = cliente.get(enlace, timeout=20)
            html = r.text if r.status_code == 200 else ""
            m = re.search(
                r"""<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']""", html, re.I
            ) or re.search(r"""<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']""", html, re.I)
            src = m and m.group(1).replace("&amp;", "&")
        if not src:
            return ""
        src = re.sub(r"^http:", "https:", urljoin(enlace or "https://www.fusagasuga.gov.co", src))
        r = cliente.get(src)
        if r.status_code != 200:
            return ""
        return a_webp(r.content)
    except Exception as e:  # noqa: BLE001
        log.warning("Imagen: %s", e)
        return ""


def a_webp(datos: bytes) -> str:
    """Comprime a WebP probando tamaños y calidades hasta quedar en 200 KB (como sharp en la versión anterior)."""
    from PIL import Image, ImageOps

    original = ImageOps.exif_transpose(Image.open(io.BytesIO(datos))).convert("RGB")
    for ancho, calidad in ((1280, 78), (1024, 70), (800, 62), (640, 55), (480, 50)):
        img = original
        if img.width > ancho:  # nunca agranda
            img = img.resize((ancho, round(img.height * ancho / img.width)), Image.LANCZOS)
        salida = io.BytesIO()
        img.save(salida, "WEBP", quality=calidad, method=4)
        if salida.tell() <= 200_000:
            return "data:image/webp;base64," + base64.b64encode(salida.getvalue()).decode()
    return ""


# ---------- Extracción ----------
def de_evento(x: dict, f: Fuente) -> dict | None:
    """Eventos con datos estructurados en el sitio (fecha, lugar y organizador): no necesitan IA."""
    ini = fecha_col(x.get("startingDate"))
    if not ini:
        return None
    lugar = sin_html(atributo(x, "EventLocation"))
    return {
        "titulo": titulo_corto(x.get("name")),
        "descripcion": con_campana(
            sin_html(x.get("metaDescription") or x.get("description")), campana_de(x.get("name"))
        ),
        "categoria": "otro",
        "tipo": tipo_de(sin_html(x.get("name")), "otro"),
        "x": x,
        "inicio": ini,
        "fin": max(fecha_col(x.get("closingDate")) or ini + 2 * 3_600_000, ini),
        "lugar_nombre": recortar(lugar or f.municipio or "Por confirmar", 80),
        "organizador": recortar(sin_html(atributo(x, "EventHost")) or f.nombre, 80),
        "gratis": True,
        "precio": "",
        "municipio": municipio_de(f, x),
        "enlace": f"{f.sitio}/eventos/{x.get('friendlyName')}",
        "completo": bool(lugar and len(sin_html(x.get("name"))) >= 3),
        "F": f,
    }


ESQUEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "titulo": {"type": "STRING"},
            "titulo_corto": {
                "type": "STRING",
                "description": "Nombre de la actividad en máximo 60 caracteres, "
                "sin el nombre de la campaña ni del programa",
            },
            "campana": {
                "type": "STRING",
                "description": "Campaña o programa del que hace parte "
                '(por ejemplo "Semana de Acción contra el Mosquito"), o vacío',
            },
            "tipo": {
                "type": "STRING",
                "enum": ["plan", "aviso"],
                "description": "plan = actividad para disfrutar (cultura, música, deporte, feria, gastronomía, "
                "religioso); aviso = jornada institucional (salud, vacunación, lavado de tanques, fumigación, "
                "cortes de servicio, trámites)",
            },
            "descripcion": {"type": "STRING"},
            "categoria": {"type": "STRING", "enum": CATEGORIAS},
            "inicio": {"type": "STRING", "description": "AAAA-MM-DDTHH:MM hora de Colombia"},
            "fin": {"type": "STRING", "description": "AAAA-MM-DDTHH:MM hora de Colombia"},
            "lugar_nombre": {"type": "STRING"},
            "municipio": {"type": "STRING", "enum": ["Fusagasugá", "Pasca"]},
            "organizador": {"type": "STRING"},
            "gratis": {"type": "BOOLEAN"},
            "precio": {"type": "STRING"},
            "fecha_clara": {"type": "BOOLEAN", "description": "true solo si el texto dice el día Y la hora del evento"},
            "lugar_claro": {
                "type": "BOOLEAN",
                "description": "true solo si el texto dice el sitio exacto (parque, coliseo, vereda...)",
            },
        },
        "required": [
            "titulo",
            "titulo_corto",
            "tipo",
            "inicio",
            "lugar_nombre",
            "municipio",
            "fecha_clara",
            "lugar_claro",
        ],
    },
}


def pedido_ia(x: dict, f: Fuente, ahora: int) -> str:
    hoy = de_ms(ahora - 5 * 3_600_000).strftime("%Y-%m-%d")
    return (
        "Hoy es "
        + hoy
        + " en Colombia. Del siguiente texto oficial ("
        + f.nombre
        + "), extrae SOLO eventos públicos FUTUROS que ocurran en Fusagasugá o Pasca (Cundinamarca). "
        "Devuelve un arreglo vacío si no hay. No inventes datos: si no dice la hora, usa 09:00 y fecha_clara=false; "
        'si no dice el lugar exacto, lugar_nombre="Por confirmar" y lugar_claro=false; '
        "si falta el fin, 2 horas después. gratis=true si dice entrada libre o gratis. "
        "titulo_corto: el nombre de la actividad en máximo 60 caracteres, sin la campaña (ejemplo: "
        '"Jornada de lavado de tanques y sensibilización - Semana de Acción contra el Mosquito" → '
        'titulo_corto "Jornada de lavado de tanques", campana "Semana de Acción contra el Mosquito"). '
        "Si una noticia anuncia varias actividades, devuelve una por cada lugar y hora distintos, "
        "sin repetir el mismo lugar a la misma hora.\n\nTEXTO:\n" + texto_de(x)[:4000]
    )


def de_respuesta_ia(lista: Any, x: dict, f: Fuente) -> list[dict]:
    """Convierte lo que devolvió Gemini en candidatos (misma normalización que la versión anterior)."""
    salida = []
    for e in lista if isinstance(lista, list) else []:
        ini, fin = fecha_col(str(e.get("inicio") or "")[:16]), fecha_col(str(e.get("fin") or "")[:16])
        if not ini:
            continue
        categoria = e.get("categoria") if e.get("categoria") in CATEGORIAS else "otro"
        titulo = titulo_corto(e.get("titulo_corto") or e.get("titulo"))
        salida.append(
            {
                "titulo": titulo,
                "descripcion": con_campana(e.get("descripcion"), e.get("campana") or campana_de(e.get("titulo"))),
                "categoria": categoria,
                "x": x,
                "tipo": (
                    "aviso"
                    if e.get("tipo") == "aviso" or tipo_de(titulo + " " + (e.get("titulo") or ""), categoria) == "aviso"
                    else "plan"
                ),
                "inicio": ini,
                "fin": max(fin or ini + 2 * 3_600_000, ini),
                "lugar_nombre": recortar(e.get("lugar_nombre") or "Por confirmar", 80),
                "organizador": recortar(e.get("organizador") or f.nombre, 80),
                "gratis": e.get("gratis") is not False,
                "precio": recortar(e.get("precio"), 40) if e.get("gratis") is False else "",
                "municipio": "Pasca" if e.get("municipio") == "Pasca" else "Fusagasugá",
                "enlace": f"{f.sitio}/noticias/{x.get('friendlyName')}",
                "completo": e.get("fecha_clara") is True
                and e.get("lugar_claro") is True
                and not re.search(r"por confirmar", e.get("lugar_nombre") or "", re.I),
                "F": f,
            }
        )
    return salida


def con_ia(cliente: Any, x: dict, f: Fuente, ahora: int) -> list[dict]:
    """Noticias recientes: Gemini decide si anuncian eventos futuros y si la fecha y el lugar están claros."""
    r = cliente.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODELO}:generateContent",
        headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
        json={
            "contents": [{"parts": [{"text": pedido_ia(x, f, ahora)}]}],
            "generationConfig": {"responseMimeType": "application/json", "responseSchema": ESQUEMA, "temperature": 0},
        },
    )
    if r.status_code != 200:
        raise RuntimeError(f"IA HTTP {r.status_code}")
    try:
        lista = json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
    except (KeyError, IndexError, ValueError, TypeError):
        return []
    return de_respuesta_ia(lista, x, f)


def depurar(candidatos: list[dict], ahora: int) -> list[dict]:
    """Solo futuros (hasta 6 meses) con título y lugar válidos; sin duplicados dentro de la corrida."""
    validos = [
        e
        for e in candidatos
        if len(e["titulo"]) >= 3
        and len(e["lugar_nombre"]) >= 2
        and e["fin"] >= ahora
        and e["inicio"] < ahora + 183 * DIA_MS
    ]
    por_clave: dict[str, dict] = {}
    for e in validos:  # como un Map de JavaScript: gana el último, conserva la posición del primero
        por_clave[clave(e)] = e
    vistos, unicos = set(), []
    for e in por_clave.values():
        k = clave_lugar_hora(e)
        if k not in vistos:
            vistos.add(k)
            unicos.append(e)
    return unicos


def decidir(e: dict) -> str:
    return "publicado" if e["F"].oficial and e["completo"] else "pendiente"


# ---------- Firestore ----------
def borrar_ejemplos(db: Any, ahora: int) -> int:
    """Eventos de ejemplo (demo:true): se borran solos a las 24 horas de cargados."""
    vencidos = [
        d
        for d in db.collection("eventos").where(filter=igual("demo", True)).stream()
        if (a_ms((d.to_dict() or {}).get("fecha_creacion")) or 0) < ahora - DIA_MS
    ]
    if vencidos:
        lote = db.batch()
        for d in vencidos:
            lote.delete(d.reference)
        lote.commit()
        log.info("%d eventos de ejemplo borrados (más de 24 horas).", len(vencidos))
    return len(vencidos)


def guardar(db: Any, cliente: Any, unicos: list[dict], ahora: int) -> dict:
    from google.cloud.firestore_v1.base_query import FieldFilter

    existentes = list(
        db.collection("eventos").where(filter=FieldFilter("fecha_inicio", ">=", de_ms(ahora - DIA_MS))).stream()
    )
    ya, ya_lh, guardados = set(), set(), []
    for d in existentes:
        x = d.to_dict() or {}
        e = {
            "titulo": x.get("titulo", ""),
            "inicio": a_ms(x.get("fecha_inicio")),
            "lugar_nombre": x.get("lugar_nombre", ""),
        }
        ya.add(clave(e))
        ya_lh.add(clave_lugar_hora(e))
        if e["inicio"] is not None and x.get("estado") in ("publicado", "pendiente"):
            guardados.append((d, {**e, "fin": a_ms(x.get("fecha_fin")) or e["inicio"]}))
    publicados = pendientes = duplicados = 0
    lote, imagenes = db.batch(), {}  # una descarga por noticia aunque traiga varias actividades
    for e in unir_parecidos(unicos):
        if clave(e) in ya or clave_lugar_hora(e) in ya_lh:
            duplicados += 1
            continue
        igual_a = next((d for d, g in guardados if parecidos(g, e)), None)
        if igual_a is not None:
            # Ya está guardado con otro título u hora: se amplía el guardado (horario y fuentes) en vez de duplicarlo
            ampliar(igual_a, e)
            duplicados += 1
            continue
        est = decidir(e)
        publicados, pendientes = (publicados + 1, pendientes) if est == "publicado" else (publicados, pendientes + 1)
        if e["enlace"] not in imagenes:
            imagenes[e["enlace"]] = imagen_de(cliente, e["x"], e["enlace"]) if cliente else ""
        lote.set(
            db.collection("eventos").document(),
            {
                "titulo": e["titulo"],
                "descripcion": e["descripcion"],
                "categoria": e["categoria"],
                "tipo": e["tipo"],
                "fecha_inicio": de_ms(e["inicio"]),
                "fecha_fin": de_ms(e["fin"]),
                "lugar_nombre": e["lugar_nombre"],
                "lat": None,
                "lng": None,
                "municipio": e["municipio"],
                "imagen": imagenes[e["enlace"]],
                "organizador": e["organizador"],
                "enlace_fuente": recortar(e["enlace"], 500),
                "fuentes": [recortar(u, 500) for u in fuentes_de(e)][:5],
                "gratis": e["gratis"],
                "precio": e["precio"],
                "fuente_oficial": e["F"].oficial,
                "estado": est,
                "origen": "automatico",
                "creado_por": "agenda-automatica",
                "fecha_creacion": servidor(),
            },
        )
        log.info("Nuevo [%s · %s] %s · %s", est, e["tipo"], e["titulo"], e["lugar_nombre"])
    lote.commit()
    reparados = reparar(db, cliente, existentes, imagenes)
    unidos = unir_guardados(existentes)
    return {
        "publicados": publicados,
        "pendientes": pendientes,
        "duplicados": duplicados,
        "reparados": reparados,
        "unidos": unidos,
    }


def ampliar(doc: Any, e: dict) -> None:
    """Amplía un evento guardado con el horario y la fuente de otro parecido."""
    x = doc.to_dict() or {}
    ini, fin = a_ms(x.get("fecha_inicio")), a_ms(x.get("fecha_fin")) or a_ms(x.get("fecha_inicio"))
    cambios: dict[str, Any] = {}
    if e["inicio"] < ini:
        cambios["fecha_inicio"] = de_ms(e["inicio"])
    if e["fin"] > fin:
        cambios["fecha_fin"] = de_ms(e["fin"])
    fuentes = fuentes_de({"enlace_fuente": x.get("enlace_fuente"), "fuentes": (x.get("fuentes") or []) + fuentes_de(e)})
    if fuentes != fuentes_de(x):
        cambios["fuentes"] = fuentes[:5]
    if cambios:
        doc.reference.update(cambios)
        log.info("Ampliado: %s", x.get("titulo"))


def unir_guardados(existentes: list) -> int:
    """Repara los duplicados que ya están guardados: deja uno con el horario más amplio y las dos fuentes y borra
    el otro. Nunca borra un evento que publicó una persona: solo los de la agenda automática."""
    docs = []
    for d in existentes:
        x = d.to_dict() or {}
        ini = a_ms(x.get("fecha_inicio"))
        if ini is None or x.get("estado") not in ("publicado", "pendiente") or x.get("demo"):
            continue
        docs.append(
            {
                "d": d,
                "x": x,
                "titulo": x.get("titulo", ""),
                "inicio": ini,
                "fin": a_ms(x.get("fecha_fin")) or ini,
                "lugar_nombre": x.get("lugar_nombre", ""),
                "descripcion": x.get("descripcion") or "",
                "enlace_fuente": x.get("enlace_fuente") or "",
                "fuentes": x.get("fuentes") or [],
                "imagen": x.get("imagen") or "",
            }
        )
    borrados: set[str] = set()
    unidos = 0
    for i, a in enumerate(docs):
        if a["d"].id in borrados:
            continue
        for b in docs[i + 1 :]:
            if b["d"].id in borrados or not parecidos(a, b):
                continue
            auto_a, auto_b = a["x"].get("origen") == "automatico", b["x"].get("origen") == "automatico"
            if not (auto_a or auto_b):
                continue  # dos eventos de personas: los revisa el admin
            # Se conserva el de una persona; entre automáticos, el publicado y luego el de título más corto
            if auto_a != auto_b:
                queda, sale = (b, a) if auto_a else (a, b)
            else:
                queda, sale = sorted(
                    (a, b), key=lambda e: (e["x"].get("estado") != "publicado", len(e["titulo"]), e["d"].id)
                )
            u = unir(queda, sale)
            u["titulo"] = queda["titulo"]  # el título del que queda (si es de una persona, no se cambia)
            cambios = {
                "fecha_inicio": de_ms(u["inicio"]),
                "fecha_fin": de_ms(u["fin"]),
                "lugar_nombre": u["lugar_nombre"],
                "descripcion": u["descripcion"],
                "fuentes": [recortar(f, 500) for f in u["fuentes"]][:5],
            }
            if u.get("imagen") and not queda["imagen"]:
                cambios["imagen"] = u["imagen"]
            queda["d"].reference.update(cambios)
            sale["d"].reference.delete()
            borrados.add(sale["d"].id)
            queda.update(u)
            unidos += 1
            log.info("Unidos (ya guardados): «%s» + «%s»", queda["titulo"], sale["titulo"])
    return unidos


def reparar(db: Any, cliente: Any, existentes: list, imagenes: dict) -> int:
    """Automáticos anteriores (sin «tipo» o sin imagen): título corto, campaña, plan o aviso e imagen de la noticia."""
    reparados = 0
    for d in existentes:
        x = d.to_dict() or {}
        if x.get("origen") != "automatico" or (x.get("tipo") and x.get("imagen")):
            continue
        cambios: dict[str, Any] = {"tipo": x.get("tipo") or tipo_de(x.get("titulo", ""), x.get("categoria", ""))}
        if len(x.get("titulo", "")) > 60 or SEPARADOR.search(x.get("titulo", "")):
            cambios["titulo"] = titulo_corto(x["titulo"])
            cambios["descripcion"] = con_campana(x.get("descripcion"), campana_de(x["titulo"]))
        enlace = x.get("enlace_fuente") or ""
        if not x.get("imagen") and enlace and cliente:
            m = re.match(r"^(https://[^/]+)/(?:noticias|eventos)/([^/?#]+)", enlace)
            det = None
            if m:
                try:
                    r = cliente.get(f"{m.group(1)}/api/v1/contents/{quote(m.group(2), safe='')}")
                    det = r.json() if r.status_code == 200 else None
                except Exception:  # noqa: BLE001
                    det = None
            if enlace not in imagenes:
                imagenes[enlace] = imagen_de(cliente, det, enlace)
            if imagenes[enlace]:
                cambios["imagen"] = imagenes[enlace]
        if x.get("tipo") and len(cambios) == 1:
            continue  # nada nuevo (la imagen sigue sin llegar)
        d.reference.update(cambios)
        reparados += 1
        log.info(
            "Reparado: %s · %s%s",
            cambios.get("titulo", x.get("titulo")),
            cambios["tipo"],
            " · con imagen" if "imagen" in cambios else "",
        )
    return reparados


# ---------- Corrida ----------
def leer_fuentes(cliente: Any, ahora: int) -> tuple[list[dict], list[tuple[dict, Fuente]], list[dict]]:
    candidatos, noticias, resumen = [], [], []
    for f in FUENTES:
        vistos: dict[Any, dict] = {}
        errores = []
        for p in PALABRAS:
            try:
                for x in buscar(cliente, f, p):
                    vistos[x.get("contentID")] = x
            except Exception as e:  # noqa: BLE001
                errores.append(f"{p}: {e}")
        items = [x for x in vistos.values() if not f.filtro or f.filtro.search(texto_de(x))]
        ev = [e for e in (de_evento(x, f) for x in items if x.get("contentType") == "Event") if e and e["fin"] >= ahora]
        nt = [
            x
            for x in items
            if x.get("contentType") == "Article" and (fecha_col(x.get("modifiedDate")) or 0) > ahora - 30 * DIA_MS
        ]
        for x in nt:
            con_detalle(cliente, f, x)
        candidatos += ev
        noticias += [(x, f) for x in nt]
        resumen.append(
            {
                "nombre": f.nombre,
                "sitio": f.sitio,
                "ok": len(errores) < len(PALABRAS),
                "contenidos": len(items),
                "eventos": len(ev),
                "noticias": len(nt),
                "error": f"{len(errores)} búsquedas fallaron ({errores[0]})" if errores else "",
            }
        )
        log.info(
            "%s: %d contenidos · %d eventos con fecha futura · %d noticias recientes%s",
            f.nombre,
            len(items),
            len(ev),
            len(nt),
            f" · {len(errores)} errores" if errores else "",
        )
    return candidatos, noticias, resumen


def main(argv: list[str] | None = None) -> int:
    a = argparse.ArgumentParser(description="Agenda automática de Fusa Conecta")
    a.add_argument("--simular", action="store_true")
    a.add_argument("--revisar", action="store_true")
    a.add_argument("--reparar", action="store_true")
    a.add_argument("--imagenes", action="store_true", help="con --simular: también baja y comprime las imágenes")
    a.add_argument("--modo", default="manual")
    args = a.parse_args(argv)
    t0, ahora, modo = time.time(), ahora_ms(), args.modo
    db = None if args.simular else firestore_cliente()
    estado = db.collection("config").document("agenda_auto") if db else None
    ejemplos = borrar_ejemplos(db, ahora) if db else 0
    if args.revisar:
        if not estado:
            log.info("Sin FIREBASE_SA: nada que revisar.")
            return 0
        s = estado.get().to_dict() or {}
        pedido, ultima = a_ms(s.get("solicitado_en")), a_ms(s.get("ultima_corrida"))
        if not pedido or (ultima and pedido <= ultima):
            log.info("No hay pedidos nuevos desde la app.")
            return 0
        modo = "pedida desde la app"
        log.info("Pedido desde la app: se busca ahora.")
    if not args.simular and not db:
        log.info("Falta FIREBASE_SA (secreto de GitHub): no se hace nada. Ver docs/agenda-ia.md.")
        return 0
    con_clave = bool(os.environ.get("GEMINI_API_KEY"))
    with _http() as cliente:
        candidatos, noticias, resumen = ([], [], []) if args.reparar else leer_fuentes(cliente, ahora)
        errores_ia = 0
        if con_clave and not args.reparar:
            for x, f in noticias:
                try:
                    candidatos += con_ia(cliente, x, f, ahora)
                except Exception as e:  # noqa: BLE001
                    errores_ia += 1
                    log.error("IA: %s", e)
        unicos = depurar(candidatos, ahora)
        if args.simular:
            log.info(
                "%d eventos (sin revisar duplicados en Firestore)%s:",
                len(unicos),
                "" if con_clave else f"; sin GEMINI_API_KEY no se leyeron las {len(noticias)} noticias",
            )
            for e in unicos:
                img = imagen_de(cliente, e["x"], e["enlace"]) if args.imagenes else ""
                log.info(
                    " - [%s · %s] %s · %s (%d) · %s · %s%s",
                    decidir(e),
                    e["tipo"],
                    de_ms(e["inicio"]).astimezone(ZONA_COL).strftime("%Y-%m-%d %H:%M"),
                    e["titulo"],
                    len(e["titulo"]),
                    e["lugar_nombre"],
                    e["enlace"],
                    f" · imagen {len(img) * 3 // 4 // 1024} KB" if img else "",
                )
            return 0
        r = guardar(db, cliente, unicos, ahora)
    if not args.reparar:
        estado.set(
            {
                "ultima_corrida": de_ms(int(t0 * 1000)),
                "modo": modo,
                "duracion_s": round(time.time() - t0),
                "fuentes": resumen,
                "noticias_leidas": len(noticias) - errores_ia if con_clave else 0,
                "noticias_sin_ia": errores_ia if con_clave else len(noticias),
                "con_ia": con_clave,
                "encontrados": len(unicos),
                **r,
                "ejemplos_borrados": ejemplos,
                "motor": "python",
                "registro": memoria.lineas[-20:],
            },
            merge=True,
        )
    log.info(
        "Listo: %d encontrados · %d publicados · %d pendientes · %d ya existían · %d reparados.",
        len(unicos),
        r["publicados"],
        r["pendientes"],
        r["duplicados"],
        r["reparados"],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
