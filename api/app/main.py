"""API REST de Fusa Conecta (FastAPI). Documentación interactiva en /docs y esquema OpenAPI en /openapi.json."""

import logging
import os
import time
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from . import avisos, formatos, ia, servicios
from .repositorio import Repositorio, repositorio
from .utilidades import dia_col, mes_valido, nombre_archivo, norm, paginar

VERSION = "1.6.0"
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
        "reporte del negocio, estadísticas del admin, avisos al celular cuando el admin aprueba o rechaza "
        "e IA de respaldo.\n"
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
        {"name": "Avisos", "description": "Notificaciones push (Firebase Cloud Messaging). Requiere rol admin"},
        {"name": "IA", "description": "Respaldo de Firebase AI Logic cuando Google exige App Check. Requiere sesión"},
        {"name": "Servicio"},
    ],
)
app.state.limiter = limiter
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENES,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=86400,
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
def listar_rutas(
    request: Request,
    repo: Repo,
    municipio: Annotated[str | None, Query(description="Fusagasugá o Pasca (sin tildes también sirve)")] = None,
) -> dict:
    rutas = servicios.rutas(repo)
    if municipio:
        rutas = [r for r in rutas if norm(r["municipio"]) == norm(municipio)]
    lista = [servicios.ruta_publica(r, API_URL) for r in rutas]
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


class Decision(BaseModel):
    tipo: Literal["comercio", "evento", "ruta", "premium", "reclamo", "reclamo_comercio", "empleo"] = Field(
        description="Qué revisó el admin"
    )
    id: str = Field(min_length=1, max_length=60, pattern=r"^[A-Za-z0-9_-]+$", description="Id del documento")
    resultado: Literal["aprobado", "rechazado"]

    model_config = {"json_schema_extra": {"examples": [{"tipo": "comercio", "id": "AbC123", "resultado": "aprobado"}]}}


def _repo_avisos() -> avisos.RepositorioAvisos:
    try:
        return avisos.repositorio_avisos()
    except avisos.SinCredenciales as e:
        raise HTTPException(503, "Los avisos al celular aún no están configurados (falta FIREBASE_SA_FCM)") from e


def _avisador() -> avisos.Avisador:
    try:
        return avisos.avisador()
    except avisos.SinCredenciales as e:
        raise HTTPException(503, "Los avisos al celular aún no están configurados (falta FIREBASE_SA_FCM)") from e


@app.post(
    "/v1/notificaciones/aprobacion",
    tags=["Avisos"],
    summary="Avisar a la persona que el admin aprobó o rechazó lo que envió",
    responses={
        401: {"description": "Sin token o vencido"},
        403: {"description": "No es admin"},
        404: {"description": "No existe lo que se revisó"},
        409: {"description": "La decisión aún no está guardada en Firestore"},
        503: {"description": "Falta la cuenta de servicio de avisos"},
    },
)
@limiter.limit("20/minute")
def avisar_decision(
    request: Request,
    repo: Repo,
    usuario: Usuario,
    decision: Decision,
    repo_avisos: Annotated[avisos.RepositorioAvisos, Depends(_repo_avisos)],
    avisador: Annotated[avisos.Avisador, Depends(_avisador)],
) -> dict:
    """El panel admin lo llama **después** de guardar la decisión en Firestore.

    1. Comprueba que quien llama es admin y que la decisión ya está guardada.
    2. Escribe la novedad en la campana de la persona (`usuarios/{uid}/notificaciones`), aunque no haya dado permiso.
    3. Si tiene dispositivos y no apagó los avisos, envía el push con FCM y borra los tokens que ya no sirven.

    Es idempotente: si el admin reintenta, no se repite el aviso (`repetido: true`).
    """
    if repo.rol(usuario.get("uid", "")) != "admin":
        raise HTTPException(403, "Solo para administradores")
    fuente = avisos.FUENTES[decision.tipo]
    doc = repo_avisos.documento(fuente.coleccion, decision.id)
    if doc is None or (decision.tipo in ("premium", "reclamo") and doc.get("tipo") != decision.tipo):
        raise HTTPException(404, "No existe eso que se revisó")
    if avisos.estado_guardado(decision.tipo, doc) != fuente.estados[decision.resultado]:
        raise HTTPException(409, "Primero guarda la decisión: el estado en Firestore todavía no coincide")
    uid = doc.get(fuente.dueno) or ""
    base = {"novedad": False, "repetido": False, "dispositivos": 0, "enviados": 0, "destinatario": None}
    if not uid:  # p. ej. un evento de la agenda automática: no hay a quién avisar
        return base
    perfil = repo_avisos.documento("usuarios", uid) or {}
    nombre_persona = (perfil.get("nombre") or "").split(" ")[0] or "la persona"
    titulo, texto, enlace = avisos.mensaje(
        decision.tipo, decision.resultado, doc.get(fuente.nombre, ""), doc.get(fuente.motivo, ""), decision.id
    )
    nueva = repo_avisos.guardar_novedad(
        uid,
        f"{decision.tipo}-{decision.id}-{decision.resultado}",
        {
            "tipo": decision.tipo,
            "ref_id": decision.id,
            "resultado": decision.resultado,
            "titulo": titulo,
            "mensaje": texto,
            "enlace": enlace,
        },
    )
    respuesta = {**base, "novedad": True, "repetido": not nueva, "destinatario": nombre_persona}
    if not nueva:
        return respuesta
    tokens = repo_avisos.dispositivos(uid)
    respuesta["dispositivos"] = len(tokens)
    if not tokens or perfil.get("notificaciones_push") is False:
        return respuesta
    enviados, malos = avisador.enviar(tokens, titulo, texto, enlace, f"{decision.tipo}-{decision.id}")
    if malos:
        repo_avisos.borrar_dispositivos(uid, malos)
        log.info("Tokens borrados por inválidos: %d", len(malos))
    respuesta.update(enviados=enviados, dispositivos=len(tokens) - len(malos))
    return respuesta


class PedidoPendiente(BaseModel):
    tipo: Literal["comercio", "evento", "ruta", "premium", "reclamo", "reclamo_comercio", "reporte", "empleo"] = Field(
        description="Qué se envió"
    )
    id: str = Field(min_length=1, max_length=60, pattern=r"^[A-Za-z0-9_-]+$", description="Id del documento")

    model_config = {"json_schema_extra": {"examples": [{"tipo": "comercio", "id": "AbC123"}]}}


@app.post(
    "/v1/notificaciones/pendiente",
    tags=["Avisos"],
    summary="Avisar a los admin que alguien envió algo a revisión",
    responses={
        401: {"description": "Sin token o vencido"},
        403: {"description": "Quien llama no es quien lo envió"},
        404: {"description": "No existe"},
        409: {"description": "Ya no está pendiente"},
        503: {"description": "Falta la cuenta de servicio de avisos"},
    },
)
@limiter.limit("10/minute")
def avisar_pendiente(
    request: Request,
    usuario: Usuario,
    pedido: PedidoPendiente,
    repo_avisos: Annotated[avisos.RepositorioAvisos, Depends(_repo_avisos)],
    avisador: Annotated[avisos.Avisador, Depends(_avisador)],
) -> dict:
    """La app lo llama **después** de guardar algo pendiente (negocio, evento, ruta, Premium, reclamo o reporte).

    1. Comprueba que existe, que sigue pendiente y que lo envió quien llama (nadie avisa por otro).
    2. Deja la novedad en la campana de cada admin (`usuarios/{admin}/notificaciones`), una sola vez.
    3. Manda el push a los celulares de los admin que no apagaron los avisos y borra los tokens que ya no sirven.
    """
    p = avisos.PENDIENTES[pedido.tipo]
    doc = repo_avisos.documento(p.coleccion, pedido.id)
    if doc is None or (p.tipo_doc and doc.get("tipo") != p.tipo_doc):
        raise HTTPException(404, "No existe eso que se envió")
    uid = usuario.get("uid", "")
    if doc.get(p.dueno) != uid:
        raise HTTPException(403, "Solo quien lo envió puede avisar")
    if doc.get(p.campo_estado) != "pendiente":
        raise HTTPException(409, "Ya no está pendiente")
    quien = (repo_avisos.documento("usuarios", uid) or {}).get("nombre", "")
    titulo, texto, enlace = avisos.mensaje_pendiente(pedido.tipo, quien, doc.get(p.nombre, ""))
    respuesta = {"admins": 0, "nuevos": 0, "enviados": 0}
    for admin in repo_avisos.admins():
        respuesta["admins"] += 1
        nueva = repo_avisos.guardar_novedad(
            admin,
            f"pendiente-{pedido.tipo}-{pedido.id}",
            {"tipo": "pendiente", "ref_id": pedido.id, "titulo": titulo, "mensaje": texto, "enlace": enlace},
        )
        if not nueva:
            continue
        respuesta["nuevos"] += 1
        perfil = repo_avisos.documento("usuarios", admin) or {}
        tokens = repo_avisos.dispositivos(admin)
        if not tokens or perfil.get("notificaciones_push") is False:
            continue
        enviados, malos = avisador.enviar(tokens, titulo, texto, enlace, f"pendiente-{pedido.tipo}-{pedido.id}")
        respuesta["enviados"] += enviados
        if malos:
            repo_avisos.borrar_dispositivos(admin, malos)
    return respuesta


class PedidoAlerta(BaseModel):
    id: str = Field(min_length=1, max_length=60, pattern=r"^[A-Za-z0-9_-]+$", description="Id de alertas/{id}")

    model_config = {"json_schema_extra": {"examples": [{"id": "Xy12AbC"}]}}


def _ms(v: Any) -> float | None:
    """Timestamp de Firestore (datetime) o milisegundos → milisegundos."""
    if v is None:
        return None
    if hasattr(v, "timestamp"):
        return v.timestamp() * 1000
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


@app.post(
    "/v1/alertas/enviar",
    tags=["Avisos"],
    summary="Enviar al celular una alerta municipal que el admin ya publicó",
    responses={
        401: {"description": "Sin token o vencido"},
        403: {"description": "No es admin"},
        404: {"description": "No existe la alerta"},
        409: {"description": "La alerta está retirada o ya venció"},
        503: {"description": "Falta la cuenta de servicio de avisos"},
    },
)
@limiter.limit("5/minute")
def enviar_alerta(
    request: Request,
    repo: Repo,
    usuario: Usuario,
    pedido: PedidoAlerta,
    repo_avisos: Annotated[avisos.RepositorioAvisos, Depends(_repo_avisos)],
    avisador: Annotated[avisos.Avisador, Depends(_avisador)],
) -> dict:
    """El panel admin lo llama **después** de guardar `alertas/{id}` en Firestore.

    1. Comprueba que quien llama es admin y que la alerta está publicada y vigente.
    2. Registra el envío con un id fijo (`alertas/{id}/envios/push`): un reintento no repite el aviso.
    3. Manda el push a todos los dispositivos de quienes no apagaron los avisos, en lotes de 500,
       y borra los tokens que ya no sirven.
    """
    uid_admin = usuario.get("uid", "")
    if repo.rol(uid_admin) != "admin":
        raise HTTPException(403, "Solo para administradores")
    doc = repo_avisos.documento("alertas", pedido.id)
    if doc is None:
        raise HTTPException(404, "No existe esa alerta")
    vence = _ms(doc.get("vence"))
    if doc.get("estado") != "publicada" or vence is None or vence <= time.time() * 1000:
        raise HTTPException(409, "La alerta está retirada o ya venció")
    if not repo_avisos.registrar_envio_alerta(pedido.id, {"por": uid_admin}):
        return {"repetido": True, "dispositivos": 0, "enviados": 0}
    titulo, texto, enlace = avisos.mensaje_alerta(doc, pedido.id)
    duenos: dict[str, str] = {}
    for uid, tokens in repo_avisos.todos_los_dispositivos().items():
        perfil = repo_avisos.documento("usuarios", uid) or {}
        if perfil.get("notificaciones_push") is False:
            continue
        for t in tokens:
            duenos[t] = uid
    todos = list(duenos)
    enviados, malos = 0, []
    for i in range(0, len(todos), avisos.LOTE_FCM):
        e, m = avisador.enviar(todos[i : i + avisos.LOTE_FCM], titulo, texto, enlace, f"alerta-{pedido.id}")
        enviados += e
        malos += m
    por_uid: dict[str, list[str]] = {}
    for t in malos:
        por_uid.setdefault(duenos[t], []).append(t)
    for uid, tokens in por_uid.items():
        repo_avisos.borrar_dispositivos(uid, tokens)
    respuesta = {"repetido": False, "dispositivos": len(todos) - len(malos), "enviados": enviados}
    repo_avisos.completar_envio_alerta(pedido.id, {"dispositivos": respuesta["dispositivos"], "enviados": enviados})
    log.info("Alerta %s enviada a %d celulares", pedido.id, enviados)
    return respuesta


# ---------- IA de respaldo (v1.3.0) ----------
MAX_BYTES_IA = 1_500_000  # un afiche comprimido (unos 600 KB) en base64 más el texto


def _gemini() -> ia.Gemini:
    try:
        return ia.gemini()
    except ia.SinClave as e:
        raise HTTPException(503, "La IA de respaldo aún no está configurada (falta GEMINI_API_KEY en Render)") from e


def _contador() -> ia.Contador:
    return ia.contador()


@app.post(
    "/v1/ia/generar",
    tags=["IA"],
    summary="Gemini por la API cuando Firebase AI Logic exige App Check",
    responses={
        401: {"description": "Sin token o vencido"},
        413: {"description": "El pedido es demasiado grande"},
        429: {"description": "Cupo diario agotado o Gemini sin cupo"},
        503: {"description": "Falta GEMINI_API_KEY o Gemini no responde"},
    },
)
@limiter.limit("30/minute")
def generar_ia(
    request: Request,
    usuario: Usuario,
    pedido: ia.PedidoIA,
    modelo: Annotated[ia.Gemini, Depends(_gemini)],
    cupo: Annotated[ia.Contador, Depends(_contador)],
) -> dict:
    """Recibe lo mismo que el SDK de Firebase AI Logic le enviaría a Gemini y devuelve la respuesta de Gemini
    (`candidates`). Solo para la app: «evento» (leer un afiche o texto, salida JSON) y «asistente» (con funciones).
    El modelo, la temperatura y el largo de la respuesta los fija la API, y cada persona tiene un cupo diario."""
    if int(request.headers.get("content-length") or 0) > MAX_BYTES_IA:
        raise HTTPException(413, "El pedido es demasiado grande")
    try:
        restantes = cupo.usar(usuario.get("uid", ""))
        r = modelo.generar(ia.cuerpo_gemini(pedido))
    except ia.ErrorIA as e:
        estado = 429 if e.estado == 429 else 503
        raise HTTPException(estado, str(e) if estado == 429 else "La IA no respondió. Intenta de nuevo.") from e
    return {"candidates": r.get("candidates") or [], "usageMetadata": r.get("usageMetadata") or {}, "cupo": restantes}
