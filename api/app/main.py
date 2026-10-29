"""API REST de Fusa Conecta (FastAPI). Documentación interactiva en /docs y esquema OpenAPI en /openapi.json."""

import logging
import os
import time
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from . import formatos, servicios
from .repositorio import Repositorio, repositorio
from .utilidades import dia_col, mes_valido, nombre_archivo, paginar

VERSION = "1.0.0"
INICIO = time.time()
API_URL = os.environ.get("API_URL", "https://fusa-conecta-api.onrender.com").rstrip("/")
ORIGENES = [o.strip() for o in os.environ.get("ORIGENES", "https://fusa-conecta.web.app").split(",") if o.strip()]
LIMITE = os.environ.get("LIMITE", "60/minute")
log = logging.getLogger("fusa-api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def ip_cliente(request: Request) -> str:
    """Render y Vercel pasan la IP real en X-Forwarded-For."""
    reenviada = request.headers.get("x-forwarded-for", "")
    return reenviada.split(",")[0].strip() or (request.client.host if request.client else "desconocida")


limiter = Limiter(key_func=ip_cliente)
app = FastAPI(
    title="API de Fusa Conecta",
    version=VERSION,
    description=(
        "Servicios web REST de **Fusa Conecta**, la guía de Fusagasugá y Pasca (https://fusa-conecta.web.app).\n\n"
        "- Lectura pública: comercios, agenda (JSON e ICS), rutas (GPX) y números de emergencia.\n"
        "- Protegido con el token de Firebase Auth (`Authorization: Bearer <idToken>`): "
        "reporte del negocio y estadísticas del admin.\n"
        f"- Límite: {LIMITE} por IP. Datos de Firestore en caché de 2 minutos."
    ),
    contact={"name": "Fusa Conecta", "url": "https://fusa-conecta.web.app"},
    openapi_tags=[
        {"name": "Directorio", "description": "Comercios, servicios, turismo y trámites"},
        {"name": "Agenda", "description": "Eventos y avisos del municipio"},
        {"name": "Rutas", "description": "Senderos con trazado y exportación GPX"},
        {"name": "Emergencias"},
        {"name": "Negocios", "description": "Requiere ser dueño del negocio o admin"},
        {"name": "Admin", "description": "Requiere rol admin"},
        {"name": "Servicio"},
    ],
)
app.state.limiter = limiter
app.add_middleware(
    CORSMiddleware, allow_origins=ORIGENES, allow_methods=["GET"], allow_headers=["Authorization"], max_age=86400
)


@app.exception_handler(RateLimitExceeded)
async def demasiadas(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        {"error": "demasiadas_peticiones", "detalle": f"Límite de {exc.detail}. Intenta en un minuto."},
        status_code=429,
        headers={"Retry-After": "60"},
    )


@app.exception_handler(HTTPException)
async def error_http(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        {"error": exc.detail if isinstance(exc.detail, str) else "error", "estado": exc.status_code},
        status_code=exc.status_code,
        headers=exc.headers,
    )


@app.middleware("http")
async def registrar(request: Request, call_next):  # type: ignore[no-untyped-def]
    t0 = time.perf_counter()
    try:
        respuesta = await call_next(request)
    except Exception:  # noqa: BLE001 - se registra y se responde en JSON
        log.exception("Error en %s", request.url.path)
        respuesta = JSONResponse({"error": "error_interno", "estado": 500}, status_code=500)
    log.info(
        "%s %s %s %.0f ms", request.method, request.url.path, respuesta.status_code, (time.perf_counter() - t0) * 1000
    )
    return respuesta


Repo = Annotated[Repositorio, Depends(repositorio)]


# ---------- Autenticación (Firebase Auth) ----------
def usuario_actual(authorization: Annotated[str | None, Header()] = None) -> dict:
    """Verifica el token de Firebase Auth con firebase_admin.auth.verify_id_token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            401, "Falta el token: Authorization: Bearer <idToken de Firebase>", headers={"WWW-Authenticate": "Bearer"}
        )
    from firebase_admin import auth

    from .repositorio import iniciar_firebase

    iniciar_firebase()
    try:
        return auth.verify_id_token(authorization.split(" ", 1)[1].strip(), clock_skew_seconds=10)
    except Exception as e:  # noqa: BLE001 - token vencido, revocado o de otro proyecto
        log.info("Token rechazado: %s", type(e).__name__)
        raise HTTPException(
            401, "Token inválido o vencido. Vuelve a iniciar sesión.", headers={"WWW-Authenticate": "Bearer"}
        ) from e


Usuario = Annotated[dict, Depends(usuario_actual)]


# ---------- Endpoints ----------
@app.get("/", include_in_schema=False)
def raiz() -> RedirectResponse:
    return RedirectResponse("/docs")


@app.get("/v1/salud", tags=["Servicio"], summary="Estado del servicio")
@limiter.exempt
def salud(repo: Repo) -> dict:
    """Responde aunque Firestore falle: indica si la base de datos contesta y cuánto tarda."""
    t0, firestore_ok = time.perf_counter(), False
    try:
        firestore_ok = repo.salud()
    except Exception as e:  # noqa: BLE001
        log.warning("Firestore no responde: %s", e)
    return {
        "estado": "ok" if firestore_ok else "degradado",
        "version": VERSION,
        "firestore": firestore_ok,
        "firestore_ms": round((time.perf_counter() - t0) * 1000),
        "activo_desde_s": round(time.time() - INICIO),
    }


@app.get("/v1/comercios", tags=["Directorio"], summary="Lista de comercios y lugares")
@limiter.limit(LIMITE)
def listar_comercios(
    request: Request,
    repo: Repo,
    categoria: Annotated[
        Literal["comercio", "servicios", "campo", "turismo", "hospedaje", "bares", "tramite"] | None,
        Query(description="Bares solo si se pide explícitamente"),
    ] = None,
    sub: Annotated[
        str | None,
        Query(
            description="Subcategoría: comidas, panaderias, tiendas, ferreterias, g-comida, g-tiendas, "
            "belleza, mecanica, sendero, mirador…"
        ),
    ] = None,
    municipio: Annotated[str | None, Query(description="Fusagasugá o Pasca")] = None,
    abierto: Annotated[bool | None, Query(description="true: abiertos ahora (hora de Colombia)")] = None,
    q: Annotated[
        str | None,
        Query(max_length=80, description="Búsqueda sin tildes ni plurales: «panaderias» encuentra «Panadería»"),
    ] = None,
    pagina: Annotated[int, Query(ge=1)] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return paginar(servicios.filtrar_comercios(repo, categoria, sub, municipio, abierto, q), pagina, por_pagina)


@app.get("/v1/comercios/{id_}", tags=["Directorio"], summary="Ficha pública de un lugar")
@limiter.limit(LIMITE)
def ver_comercio(request: Request, repo: Repo, id_: Annotated[str, Path(max_length=40)]) -> dict:
    d = next((x for x in servicios.directorio(repo) if x["id"] == id_), None)
    if not d:
        raise HTTPException(404, "No existe ese lugar o no está publicado")
    return servicios.ficha(repo, d, completa=True)


def _rango(desde: str | None, hasta: str | None) -> tuple[int | None, int | None]:
    try:
        return (dia_col(desde) if desde else None, dia_col(hasta, fin=True) if hasta else None)
    except ValueError as e:
        raise HTTPException(422, "Las fechas van como AAAA-MM-DD") from e


@app.get("/v1/eventos", tags=["Agenda"], summary="Agenda pública")
@limiter.limit(LIMITE)
def listar_eventos(
    request: Request,
    repo: Repo,
    desde: Annotated[str | None, Query(description="AAAA-MM-DD (por defecto, ahora: solo próximos o en curso)")] = None,
    hasta: Annotated[str | None, Query(description="AAAA-MM-DD, incluido")] = None,
    categoria: Annotated[
        Literal["cultura", "musica", "deporte", "gastronomia", "feria", "religioso", "institucional", "otro"] | None,
        Query(),
    ] = None,
    tipo: Annotated[
        Literal["plan", "aviso"] | None,
        Query(description="plan = para disfrutar; aviso = jornadas y anuncios de la alcaldía"),
    ] = None,
) -> dict:
    d, h = _rango(desde, hasta)
    lista = [servicios.evento_publico(e) for e in servicios.eventos(repo, d, h, categoria, tipo)]
    return {"total": len(lista), "resultados": lista}


@app.get(
    "/v1/eventos.ics",
    tags=["Agenda"],
    summary="Calendario suscribible (iCalendar)",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}},
)
@limiter.limit(LIMITE)
def calendario(
    request: Request, repo: Repo, tipo: Annotated[Literal["plan", "aviso"] | None, Query()] = None
) -> Response:
    texto = formatos.ics(servicios.eventos(repo, tipo=tipo))
    return Response(
        texto,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'inline; filename="fusa-conecta-agenda.ics"',
            "Cache-Control": "public, max-age=900",
        },
    )


@app.get("/v1/rutas", tags=["Rutas"], summary="Rutas y senderos")
@limiter.limit(LIMITE)
def listar_rutas(request: Request, repo: Repo) -> dict:
    lista = [servicios.ruta_publica(r, API_URL) for r in servicios.rutas(repo)]
    return {"total": len(lista), "resultados": lista}


@app.get(
    "/v1/rutas/{id_}.gpx",
    tags=["Rutas"],
    summary="Trazado en GPX",
    response_class=Response,
    responses={200: {"content": {"application/gpx+xml": {}}}, 404: {"description": "Sin trazado real todavía"}},
)
@limiter.limit(LIMITE)
def ruta_gpx(request: Request, repo: Repo, id_: Annotated[str, Path(max_length=40)]) -> Response:
    r = next((x for x in servicios.rutas(repo) if x["id"] == id_), None)
    if not r:
        raise HTTPException(404, "No existe esa ruta")
    if len(r["puntos"]) < 2:
        raise HTTPException(404, "Esta ruta aún no tiene trazado real (trazado en preparación)")
    texto = formatos.gpx(
        r["nombre"], r["puntos"], f"{r['distancia_km']} km · {r['dificultad']} · Fusa Conecta", r["fuente"] or ""
    )
    return Response(
        texto,
        media_type="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{nombre_archivo(r["nombre"])}.gpx"'},
    )


@app.get("/v1/emergencias", tags=["Emergencias"], summary="Números de emergencia")
@limiter.limit(LIMITE)
def numeros_emergencia(
    request: Request, repo: Repo, municipio: Annotated[Literal["fusagasuga", "pasca"], Query()] = "fusagasuga"
) -> dict:
    lista = servicios.emergencias(repo, municipio)
    return {"municipio": servicios.MUNICIPIOS[municipio], "total": len(lista), "resultados": lista}


@app.get(
    "/v1/comercios/{id_}/reporte",
    tags=["Negocios"],
    summary="Reporte mensual del negocio (Excel o PDF)",
    response_class=Response,
    responses={
        200: {
            "content": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}, "application/pdf": {}}
        },
        401: {"description": "Sin token o vencido"},
        403: {"description": "No es el dueño ni admin"},
    },
)
@limiter.limit("20/minute")
def reporte_negocio(
    request: Request,
    repo: Repo,
    usuario: Usuario,
    id_: Annotated[str, Path(max_length=40)],
    formato: Annotated[Literal["xlsx", "pdf"], Query()] = "xlsx",
    mes: Annotated[str | None, Query(description="AAAA-MM (por defecto, el mes actual)")] = None,
) -> Response:
    d = repo.comercio(id_)
    if not d:
        raise HTTPException(404, "No existe ese negocio en la nube o no está aprobado")
    if usuario.get("uid") != d.get("propietario_uid") and repo.rol(usuario.get("uid", "")) != "admin":
        raise HTTPException(403, "Solo el dueño del negocio o un administrador pueden descargar este reporte")
    try:
        m = mes_valido(mes)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    datos = servicios.reporte(repo, d, m)
    archivo = f"reporte-{nombre_archivo(d.get('nombre', 'negocio'))}-{m}"
    if formato == "pdf":
        return Response(
            formatos.reporte_pdf(datos),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{archivo}.pdf"'},
        )
    return Response(
        formatos.reporte_xlsx(datos),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{archivo}.xlsx"'},
    )


@app.get("/v1/admin/estadisticas", tags=["Admin"], summary="Totales de la plataforma")
@limiter.limit("20/minute")
def estadisticas(request: Request, repo: Repo, usuario: Usuario) -> dict:
    if repo.rol(usuario.get("uid", "")) != "admin":
        raise HTTPException(403, "Solo para administradores")
    c = repo.conteos()
    return {
        **c,
        "lugares_directorio": len(servicios.directorio(repo)),
        "generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
