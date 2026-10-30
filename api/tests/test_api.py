"""Endpoints con el repositorio falso: respuestas, filtros, CORS, protección y límite de peticiones."""

import xml.etree.ElementTree as ET


def test_salud(cliente):
    r = cliente.get("/v1/salud")
    assert r.status_code == 200 and r.json()["estado"] == "ok" and r.json()["firestore"] is True


def test_docs_openapi(cliente):
    esquema = cliente.get("/openapi.json").json()
    rutas = set(esquema["paths"])
    for p in [
        "/v1/comercios",
        "/v1/comercios/{id_}",
        "/v1/eventos",
        "/v1/eventos.ics",
        "/v1/rutas",
        "/v1/rutas/{id_}.gpx",
        "/v1/emergencias",
        "/v1/comercios/{id_}/reporte",
        "/v1/admin/estadisticas",
        "/v1/salud",
    ]:
        assert p in rutas, p
    assert cliente.get("/docs").status_code == 200


def test_comercios_combina_base_y_nube(cliente):
    datos = cliente.get("/v1/comercios", params={"por_pagina": 50}).json()
    ids = [x["id"] for x in datos["resultados"]]
    assert "nube1" in ids and "viejo" not in ids and "c03" not in ids  # copia antigua y oculto fuera
    assert all(x["categoria"] != "bares" for x in datos["resultados"])  # bares solo si se piden
    assert datos["resultados"][0]["id"] == "nube1"  # Premium primero
    assert datos["total"] > 40 and datos["paginas"] >= 1


def test_comercios_filtros(cliente):
    q = cliente.get("/v1/comercios", params={"q": "panaderias"}).json()["resultados"]
    assert any(x["id"] == "nube1" for x in q)
    sub = cliente.get("/v1/comercios", params={"categoria": "comercio", "sub": "g-comida"}).json()["resultados"]
    assert sub and all(x["sub"] in ("comidas", "panaderias") for x in sub)
    pasca = cliente.get("/v1/comercios", params={"municipio": "Pasca", "por_pagina": 50}).json()["resultados"]
    assert all(x["municipio"] == "Pasca" for x in pasca)
    bares = cliente.get("/v1/comercios", params={"categoria": "bares"}).json()
    assert bares["total"] > 0
    abiertos = cliente.get("/v1/comercios", params={"abierto": "true", "por_pagina": 50}).json()["resultados"]
    assert all(x["abierto"] is True for x in abiertos)
    assert cliente.get("/v1/comercios", params={"por_pagina": 51}).status_code == 422


def test_ficha(cliente):
    f = cliente.get("/v1/comercios/nube1").json()
    assert (
        f["nombre"] == "Panadería La Espiga"
        and f["cupones"] == 1
        and f["cupones_activos"][0]["descripcion"] == "2x1 en almojábanas"
    )
    assert cliente.get("/v1/comercios/c01").json()["imagen_url"].startswith("https://fusa-conecta.web.app/img/")
    assert cliente.get("/v1/comercios/no-existe").status_code == 404


def test_eventos_sin_ejemplos_ni_pasados(cliente):
    ids = [e["id"] for e in cliente.get("/v1/eventos").json()["resultados"]]
    assert ids == ["e2", "e1"]  # ordenados por fecha; sin el de ejemplo ni el que ya pasó
    planes = cliente.get("/v1/eventos", params={"tipo": "plan"}).json()["resultados"]
    assert (
        [e["id"] for e in planes] == ["e1"]
        and planes[0]["fuente_oficial"] is True
        and planes[0]["inicio"].endswith("-05:00")
    )
    assert [e["id"] for e in cliente.get("/v1/eventos", params={"tipo": "aviso"}).json()["resultados"]] == ["e2"]
    assert cliente.get("/v1/eventos", params={"desde": "28-10-2026"}).status_code == 422


def test_ics(cliente):
    r = cliente.get("/v1/eventos.ics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    assert "SUMMARY:Aviso: Jornada de lavado de tanques" in r.text and "Concierto de ejemplo" not in r.text


def test_rutas_y_gpx(cliente):
    rutas = {r["id"]: r for r in cliente.get("/v1/rutas").json()["resultados"]}
    assert rutas["c22"]["trazado_real"] is True and rutas["c22"]["gpx"].endswith("/v1/rutas/c22.gpx")
    assert rutas["c21"]["trazado_real"] is False and rutas["c21"]["gpx"] is None
    r = cliente.get("/v1/rutas/c22.gpx")
    assert r.headers["content-disposition"].startswith('attachment; filename="sendero-cara-del-indio') and r.headers[
        "content-disposition"
    ].endswith('quinini.gpx"')
    assert (
        r.status_code == 200
        and r.headers["content-type"] == "application/gpx+xml"
        and "attachment" in r.headers["content-disposition"]
    )
    assert len(ET.fromstring(r.content).findall(".//{http://www.topografix.com/GPX/1/1}trkpt")) == 200
    assert cliente.get("/v1/rutas/c21.gpx").status_code == 404


def test_emergencias(cliente):
    r = cliente.get("/v1/emergencias", params={"municipio": "pasca"}).json()
    assert r["municipio"] == "Pasca" and any(e["numero"] == "123" for e in r["resultados"])
    assert cliente.get("/v1/emergencias", params={"municipio": "bogota"}).status_code == 422


def test_reporte_protegido(cliente, como):
    assert cliente.get("/v1/comercios/nube1/reporte").status_code == 401
    como("otro")
    assert cliente.get("/v1/comercios/nube1/reporte").status_code == 403
    como("duena")
    r = cliente.get("/v1/comercios/nube1/reporte", params={"formato": "xlsx"})
    assert r.status_code == 200 and r.content[:2] == b"PK"  # un .xlsx es un ZIP
    pdf = cliente.get("/v1/comercios/nube1/reporte", params={"formato": "pdf", "mes": "2026-10"})
    assert (
        pdf.status_code == 200
        and pdf.content.startswith(b"%PDF")
        and "reporte-panaderia-la-espiga-2026-10.pdf" in pdf.headers["content-disposition"]
    )
    assert cliente.get("/v1/comercios/nube1/reporte", params={"mes": "octubre"}).status_code == 422
    como("admin1")
    assert cliente.get("/v1/comercios/nube1/reporte").status_code == 200


def test_estadisticas_solo_admin(cliente, como):
    assert cliente.get("/v1/admin/estadisticas").status_code == 401
    como("duena")
    assert cliente.get("/v1/admin/estadisticas").status_code == 403
    como("admin1")
    r = cliente.get("/v1/admin/estadisticas").json()
    assert r["usuarios"] == 3 and r["lugares_directorio"] > 40


def test_cors_solo_web_app(cliente):
    ok = cliente.get("/v1/salud", headers={"Origin": "https://fusa-conecta.web.app"})
    assert ok.headers.get("access-control-allow-origin") == "https://fusa-conecta.web.app"
    otro = cliente.get("/v1/salud", headers={"Origin": "https://sitio-ajeno.com"})
    assert "access-control-allow-origin" not in otro.headers


def test_limite_de_peticiones(cliente):
    codigos = [cliente.get("/v1/emergencias").status_code for _ in range(65)]
    assert codigos.count(200) == 60 and codigos[-1] == 429
    assert cliente.get("/v1/salud").status_code == 200  # la salud no cuenta para el límite


def test_negocio_de_pasca_sale_con_su_municipio(cliente, repo):
    """v1.3.0: un negocio de Pasca aprobado responde en ?municipio=Pasca y no en Fusagasugá."""
    repo.datos["comercios"].append(
        {
            "id": "pasca1",
            "nombre": "Tienda de Prueba Pasca",
            "cat": "comercio",
            "sub": "tiendas",
            "municipio": "Pasca",
            "propietario_uid": "otra",
            "estado_publicacion": "aprobado",
        }
    )
    r = cliente.get("/v1/comercios", params={"municipio": "Pasca"}).json()
    assert r["total"] == 1 and r["resultados"][0]["id"] == "pasca1" and r["resultados"][0]["municipio"] == "Pasca"
    fusa = cliente.get("/v1/comercios", params={"municipio": "Fusagasugá", "por_pagina": 50}).json()
    assert all(x["municipio"] == "Fusagasugá" for x in fusa["resultados"]) and fusa["total"] > 0
    assert "pasca1" not in [x["id"] for x in fusa["resultados"]]
