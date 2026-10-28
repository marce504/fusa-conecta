"""Reglas de negocio de la API: directorio, agenda, rutas, emergencias y reporte. Replican lo que hace la PWA."""

from __future__ import annotations

import json
import time
from functools import lru_cache
from pathlib import Path

from .repositorio import Repositorio, a_ms
from .utilidades import ahora_col, coincide, es_aviso, estado_apertura, iso_col, norm

SITIO = "https://fusa-conecta.web.app"
SUB_A_SERVICIOS = {"talleres": "mecanica", "mascotas": "mascotas", "salud": "salud", "servicios": "profesionales"}
GRUPOS_SUB = {"g-comida": ("Comida", ["comidas", "panaderias"]), "g-tiendas": ("Tiendas", ["tiendas", "ferreterias"])}
MUNICIPIOS = {"fusagasuga": "Fusagasugá", "pasca": "Pasca"}


@lru_cache(maxsize=1)
def base() -> dict:
    """Copia de datos.js exportada por api/exportar_datos.mjs."""
    return json.loads((Path(__file__).parent / "datos_base.json").read_text(encoding="utf-8"))


def ahora_ms() -> int:
    return int(time.time() * 1000)


# ---------- Directorio ----------
def _normalizar_nube(x: dict) -> dict:
    """Como normalizarNube de la app: categorías antiguas y campos con valores por defecto."""
    cats = base()["categorias"]
    cat = x.get("cat") if x.get("cat") in cats else x.get("categoria") if x.get("categoria") in cats else "comercio"
    sub = x.get("sub") or ""
    if cat == "comercio" and sub in SUB_A_SERVICIOS:
        cat, sub = "servicios", SUB_A_SERVICIOS[sub]
    return {**x, "cat": cat, "sub": sub, "municipio": x.get("municipio") or "Fusagasugá", "nube": True}


def sub_de(d: dict) -> str:
    return (d.get("tipo") or "") if d.get("cat") == "turismo" else (d.get("sub") or "")


def nombre_sub(cat: str, k: str) -> str:
    if k in GRUPOS_SUB:
        return GRUPOS_SUB[k][0]
    return next((s["t"] for s in base()["subcategorias"].get(cat, []) if s["k"] == k), "")


def directorio(repo: Repositorio) -> list[dict]:
    """Base local menos los ocultos, reemplazada por la versión de la nube con el mismo id, más los aprobados nuevos."""
    ocultos = set(repo.ocultos())
    por_id = {c["id"]: dict(c, municipio=c.get("municipio") or "Fusagasugá") for c in base()["comercios"] if c["id"] not in ocultos}
    nombres_base, ids_base = {norm(c["nombre"]).strip() for c in base()["comercios"]}, {c["id"] for c in base()["comercios"]}
    for x in repo.comercios_aprobados():
        # Copias antiguas de la carga inicial (sin dueño y con el nombre de un lugar de la base): la app también las ignora
        if not x.get("propietario_uid") and norm(x.get("nombre")).strip() in nombres_base and x["id"] not in ids_base:
            continue
        por_id[x["id"]] = _normalizar_nube(x)
    return list(por_id.values())


def _imagen_publica(img: str) -> str | None:
    if not img:
        return None
    if img.startswith("img/"):
        return f"{SITIO}/{img}"
    return img if img.startswith("https://") else None


def premium_vigente(d: dict) -> bool:
    if not d.get("esPremium") or not d.get("propietario_uid"):
        return False
    vence = a_ms(d.get("suscripcion_vigente_hasta"))
    return not vence or vence > ahora_ms()


def cupones_activos(repo: Repositorio, d: dict) -> list[dict]:
    if not d.get("propietario_uid") or not premium_vigente(d):
        return []
    hoy = ahora_col().strftime("%Y-%m-%d")
    return [
        c for c in repo.cupones()
        if c.get("comercio_id") == d["id"] and (c.get("estado") or "activo") == "activo"
        and (c.get("cupo_restante") is None or c["cupo_restante"] > 0) and (not c.get("vigencia") or c["vigencia"] >= hoy)
    ]


def ficha(repo: Repositorio, d: dict, completa: bool = False) -> dict:
    ap = estado_apertura(d)
    tiene_foto = bool(d.get("imagen") or d.get("fotos"))
    salida = {
        "id": d["id"], "nombre": d.get("nombre", ""), "categoria": d["cat"], "categoria_nombre": base()["categorias"].get(d["cat"], ""),
        "sub": sub_de(d) or None, "sub_nombre": nombre_sub(d["cat"], sub_de(d)) or None, "municipio": d.get("municipio") or "Fusagasugá",
        "direccion": d.get("direccion") or "", "lat": d.get("lat"), "lng": d.get("lng"), "horario": d.get("horario") or "",
        "estado": ap["texto"] if ap else None, "abierto": ap["abierto"] if ap else None,
        "telefono": d.get("tel") or "", "whatsapp": d.get("whatsapp") or "", "premium": premium_vigente(d),
        "tiene_foto": tiene_foto, "imagen_url": _imagen_publica(d.get("imagen") or ""), "cupones": len(cupones_activos(repo, d)),
        "url": f"{SITIO}/#/lugar/{d['id']}",
    }
    if completa:
        salida.update({
            "descripcion": d.get("desc") or "", "sitio_web": d.get("sitioWeb") or "", "redes": d.get("redesSociales") or {},
            "imagen": d.get("imagen") or None,
            "cupones_activos": [{"id": c["id"], "descripcion": c.get("descripcion", ""), "vence": c.get("vigencia")} for c in cupones_activos(repo, d)],
        })
    return salida


def texto_busqueda(d: dict) -> str:
    return " ".join([d.get("nombre", ""), d.get("desc", ""), d.get("direccion", ""), base()["categorias"].get(d["cat"], ""), d.get("tipo") or "", nombre_sub(d["cat"], sub_de(d))])


def filtrar_comercios(repo: Repositorio, categoria: str | None, sub: str | None, municipio: str | None, abierto: bool | None, q: str | None) -> list[dict]:
    lista = directorio(repo)
    # Bares solo cuando se piden: la app los muestra únicamente a mayores de edad que lo confirman
    lista = [d for d in lista if d["cat"] == categoria] if categoria else [d for d in lista if d["cat"] != "bares"]
    if sub:
        subs = GRUPOS_SUB[sub][1] if sub in GRUPOS_SUB else [sub]
        lista = [d for d in lista if sub_de(d) in subs]
    if municipio:
        lista = [d for d in lista if norm(d.get("municipio") or "Fusagasugá") == norm(municipio)]
    if q:
        lista = [d for d in lista if coincide(texto_busqueda(d), q)]
    fichas = [ficha(repo, d) for d in lista]
    if abierto is not None:
        fichas = [f for f in fichas if bool(f["abierto"]) == abierto]
    # Premium primero, luego los que tienen foto y en orden alfabético
    return sorted(fichas, key=lambda f: (not f["premium"], not f["tiene_foto"], norm(f["nombre"])))


# ---------- Agenda ----------
def eventos(repo: Repositorio, desde: int | None = None, hasta: int | None = None, categoria: str | None = None, tipo: str | None = None) -> list[dict]:
    salida = []
    for x in repo.eventos_publicados():
        if x.get("demo"):  # los de ejemplo nunca salen por la API
            continue
        ini, fin = a_ms(x.get("fecha_inicio")), a_ms(x.get("fecha_fin"))
        if not ini or not fin or fin < (desde or ahora_ms()) or (hasta and ini > hasta):
            continue
        aviso = es_aviso(x)
        if (categoria and x.get("categoria") != categoria) or (tipo and (tipo == "aviso") != aviso):
            continue
        salida.append({**x, "ini": ini, "fin": fin, "aviso": aviso})
    return sorted(salida, key=lambda e: e["ini"])


def evento_publico(e: dict) -> dict:
    return {
        "id": e["id"], "titulo": e.get("titulo", ""), "descripcion": e.get("descripcion") or "", "categoria": e.get("categoria") or "otro",
        "tipo": "aviso" if e["aviso"] else "plan", "inicio": iso_col(e["ini"]), "fin": iso_col(e["fin"]), "lugar": e.get("lugar_nombre") or "",
        "municipio": e.get("municipio") or "Fusagasugá", "lat": e.get("lat"), "lng": e.get("lng"), "gratis": e.get("gratis", True) is not False,
        "precio": e.get("precio") or "", "organizador": e.get("organizador") or "", "fuente_oficial": bool(e.get("fuente_oficial")),
        "enlace_fuente": e.get("enlace_fuente") or None, "tiene_imagen": bool(e.get("imagen")), "url": f"{SITIO}/#/evento/{e['id']}",
    }


# ---------- Rutas ----------
def _linea_de_texto(s: str) -> list[tuple[float, float, float | None]]:
    """«lat,lng,alt;…» (formato de rutas_oficiales y rutas_comunidad) → [(lat, lng, alt)]."""
    puntos = []
    for p in str(s or "").split(";"):
        partes = p.split(",")
        try:
            puntos.append((float(partes[0]), float(partes[1]), float(partes[2]) if len(partes) > 2 and partes[2] != "" else None))
        except (ValueError, IndexError):
            continue
    return puntos


def rutas(repo: Repositorio) -> list[dict]:
    b, oficiales = base(), repo.rutas_oficiales()
    salida = []
    for id_, r in b["rutas"].items():
        t, of = b["trazados"].get(id_), oficiales.get(id_)
        puntos = [tuple(p) for p in t["coordenadas"]] if t else _linea_de_texto(of["linea"]) if of else []
        salida.append({
            "id": id_, "nombre": r["nombre"], "dificultad": r["dificultad"], "duracion": r["duracion"],
            "distancia_km": (t or {}).get("distancia_km") or (of or {}).get("distancia_km") or r["distancia_km"],
            "desnivel_m": (t or {}).get("desnivel_m") or (of or {}).get("desnivel_m") or r["desnivel_m"],
            "fuente": (t or {}).get("fuente") or (of or {}).get("fuente") or None, "comunidad": False, "puntos": puntos,
        })
    for x in repo.rutas_comunidad():
        salida.append({
            "id": "rc-" + x["id"], "nombre": x.get("nombre", ""), "dificultad": x.get("dificultad", ""), "duracion": f"{x.get('duracion_min', 0)} min",
            "distancia_km": x.get("distancia_km"), "desnivel_m": x.get("desnivel_m"), "fuente": f"Propuesta por {x.get('autor_nombre', 'la comunidad')}",
            "comunidad": True, "puntos": _linea_de_texto(x.get("linea", "")),
        })
    return salida


def ruta_publica(r: dict, api: str) -> dict:
    tiene = len(r["puntos"]) >= 2
    return {**{k: v for k, v in r.items() if k != "puntos"}, "trazado_real": tiene, "puntos": len(r["puntos"]),
            "gpx": f"{api}/v1/rutas/{r['id']}.gpx" if tiene else None, "url": f"{SITIO}/#/lugar/{r['id']}"}


# ---------- Emergencias ----------
def emergencias(repo: Repositorio, municipio: str) -> list[dict]:
    """Los números que editó el admin en Firestore; si no hay, los de datos.js (los mismos que funcionan sin conexión)."""
    editados = repo.emergencias().get(municipio) or []
    return [{k: e.get(k, "") for k in ("entidad", "tipo", "numero", "detalle")} for e in (editados or base()["emergencias"][municipio])]


# ---------- Reporte del negocio ----------
def reporte(repo: Repositorio, d: dict, mes: str) -> dict:
    est = repo.estadisticas(d["id"], mes)
    canjes = repo.canjes(d["id"])

    def en_mes(ms: int | None) -> bool:
        return bool(ms) and iso_col(ms)[:7] == mes

    obtenidos = [k for k in canjes if en_mes(a_ms(k.get("fecha_emision")))]
    canjeados = [k for k in canjes if k.get("estado") == "usado" and en_mes(a_ms(k.get("fecha_canje")))]
    cupones = [c for c in repo.cupones() if c.get("comercio_id") == d["id"]]
    return {
        "negocio": d.get("nombre", ""), "mes": mes, "generado": ahora_col().strftime("%Y-%m-%d %H:%M"),
        "cifras": {
            "vistas": int(est.get("vistas", 0)), "toques_wa": int(est.get("toques_wa", 0)), "toques_llamar": int(est.get("toques_llamar", 0)),
            # Los obtenidos se cuentan desde los canjes (fuente exacta); las estadísticas solo suman los de otras personas
            "cupones_obtenidos": max(len(obtenidos), int(est.get("cupones_obtenidos", 0))), "cupones_canjeados": len(canjeados),
        },
        "cupones": [{
            "id": c["id"], "descripcion": c.get("descripcion", ""), "estado": c.get("estado") or "activo", "cupo_total": c.get("cupo_total") or 0,
            "cupo_restante": c.get("cupo_restante") or 0, "vence": c.get("vigencia") or "",
            "obtenidos": sum(1 for k in obtenidos if k.get("cupon_id") == c["id"]), "canjeados": sum(1 for k in canjeados if k.get("cupon_id") == c["id"]),
        } for c in cupones],
    }
