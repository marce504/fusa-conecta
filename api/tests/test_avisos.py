"""POST /v1/notificaciones/aprobacion con repositorio falso y FCM simulado (sin Firebase)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import avisos, main


class RepoAvisosFalso:
    def __init__(self) -> None:
        self.docs = {
            ("comercios", "neg1"): {
                "nombre": "MG Washers",
                "estado_publicacion": "aprobado",
                "propietario_uid": "duena",
            },
            ("comercios", "neg2"): {
                "nombre": "Ornamentación Primiciero",
                "estado_publicacion": "rechazado",
                "motivo_rechazo": "Falta la foto del local",
                "propietario_uid": "duena",
            },
            ("comercios", "neg3"): {
                "nombre": "Pendiente",
                "estado_publicacion": "pendiente",
                "propietario_uid": "duena",
            },
            ("eventos", "ev1"): {"titulo": "Feria del Café", "estado": "publicado", "creado_por": "organiza"},
            ("eventos", "auto"): {"titulo": "Día Dulce", "estado": "publicado"},
            ("rutas_comunidad", "r1"): {"nombre": "Cerro Fusacatán", "estado": "rechazada", "motivo": "Trazado corto"},
            ("solicitudes", "s1"): {
                "tipo": "premium",
                "comercio_nombre": "MG Washers",
                "estado": "aprobada",
                "uid": "duena",
            },
            ("solicitudes", "s2"): {
                "tipo": "reclamo",
                "comercio_nombre": "Café Sutagao",
                "estado": "aprobada",
                "uid": "otro",
            },
            ("usuarios", "duena"): {"nombre": "Marcela Estrella", "notificaciones_push": True},
            ("usuarios", "organiza"): {"nombre": "Pedro", "notificaciones_push": False},
            ("usuarios", "otro"): {"nombre": "Luz"},
        }
        self.tokens = {"duena": ["tok-bueno", "tok-viejo"], "organiza": ["tok-p"], "otro": []}
        self.novedades: dict[str, dict] = {}
        self.borrados: list[tuple[str, list[str]]] = []

    def documento(self, coleccion, id_):
        return self.docs.get((coleccion, id_))

    def dispositivos(self, uid):
        return list(self.tokens.get(uid, []))

    def guardar_novedad(self, uid, id_, datos):
        clave = f"{uid}/{id_}"
        if clave in self.novedades:
            return False
        self.novedades[clave] = datos
        return True

    def borrar_dispositivos(self, uid, tokens):
        self.borrados.append((uid, tokens))
        self.tokens[uid] = [t for t in self.tokens[uid] if t not in tokens]


class AvisadorFalso:
    """Simula messaging.send_each_for_multicast: «tok-viejo» responde registration-token-not-registered."""

    def __init__(self) -> None:
        self.enviados: list[dict] = []

    def enviar(self, tokens, titulo, texto, enlace, etiqueta):
        self.enviados.append({"tokens": tokens, "titulo": titulo, "texto": texto, "enlace": enlace})
        malos = [t for t in tokens if t == "tok-viejo"]
        return len(tokens) - len(malos), malos


@pytest.fixture
def avisar(cliente, como):
    ra, fcm = RepoAvisosFalso(), AvisadorFalso()
    main.app.dependency_overrides[main._repo_avisos] = lambda: ra
    main.app.dependency_overrides[main._avisador] = lambda: fcm
    como("admin1")

    def _avisar(tipo, id_, resultado):
        return cliente.post("/v1/notificaciones/aprobacion", json={"tipo": tipo, "id": id_, "resultado": resultado})

    return SimpleNamespace(post=_avisar, repo=ra, fcm=fcm, como=como, cliente=cliente)


def test_sin_token_401(cliente):
    r = cliente.post("/v1/notificaciones/aprobacion", json={"tipo": "comercio", "id": "neg1", "resultado": "aprobado"})
    assert r.status_code == 401


def test_quien_no_es_admin_recibe_403(avisar):
    avisar.como("duena")
    assert avisar.post("comercio", "neg1", "aprobado").status_code == 403
    assert avisar.repo.novedades == {} and avisar.fcm.enviados == []


def test_aprobado_envia_push_y_deja_la_novedad(avisar):
    r = avisar.post("comercio", "neg1", "aprobado")
    assert r.status_code == 200
    j = r.json()
    assert j == {"novedad": True, "repetido": False, "dispositivos": 1, "enviados": 1, "destinatario": "Marcela"}
    envio = avisar.fcm.enviados[0]
    assert envio["texto"] == "¡Tu negocio MG Washers ya está publicado en Fusa Conecta!"
    assert envio["enlace"] == "#/mi-negocio"
    assert avisar.repo.novedades["duena/comercio-neg1-aprobado"]["mensaje"] == envio["texto"]


def test_tokens_invalidos_se_borran(avisar):
    avisar.post("comercio", "neg1", "aprobado")
    assert avisar.repo.borrados == [("duena", ["tok-viejo"])]
    assert avisar.repo.tokens["duena"] == ["tok-bueno"]


def test_rechazado_lleva_el_motivo(avisar):
    avisar.post("comercio", "neg2", "rechazado")
    assert avisar.fcm.enviados[0]["texto"] == (
        "Revisamos Ornamentación Primiciero: Falta la foto del local. Puedes corregirlo desde Mi negocio."
    )


def test_reintento_no_repite_el_aviso(avisar):
    avisar.post("comercio", "neg1", "aprobado")
    j = avisar.post("comercio", "neg1", "aprobado").json()
    assert j["repetido"] is True and len(avisar.fcm.enviados) == 1


def test_decision_no_guardada_409(avisar):
    assert avisar.post("comercio", "neg3", "aprobado").status_code == 409
    assert avisar.post("comercio", "neg1", "rechazado").status_code == 409


def test_no_existe_404(avisar):
    assert avisar.post("comercio", "nada", "aprobado").status_code == 404
    # Una solicitud Premium no se puede avisar como reclamo
    assert avisar.post("reclamo", "s1", "aprobado").status_code == 404


def test_sin_permiso_de_push_igual_queda_en_la_campana(avisar):
    # Pedro apagó los avisos: no hay push, pero la novedad queda
    j = avisar.post("evento", "ev1", "aprobado").json()
    assert j["novedad"] is True and j["enviados"] == 0 and avisar.fcm.enviados == []
    assert avisar.repo.novedades["organiza/evento-ev1-aprobado"]["enlace"] == "#/evento/ev1"
    # Luz no tiene dispositivos
    j = avisar.post("reclamo", "s2", "aprobado").json()
    assert j["novedad"] is True and j["dispositivos"] == 0


def test_evento_sin_autor_no_avisa_a_nadie(avisar):
    j = avisar.post("evento", "auto", "aprobado").json()
    assert j["novedad"] is False and j["destinatario"] is None


def test_entrada_invalida_422(avisar):
    assert avisar.post("cupon", "neg1", "aprobado").status_code == 422
    assert avisar.post("comercio", "../usuarios", "aprobado").status_code == 422


@pytest.mark.parametrize(
    "tipo,resultado,esperado",
    [
        ("evento", "rechazado", "Revisamos tu evento X: Fecha pasada. Puedes enviarlo de nuevo."),
        ("ruta", "aprobado", "¡Tu ruta X ya está publicada en Fusa Conecta!"),
        ("premium", "aprobado", "¡X ya es Premium en Fusa Conecta!"),
        ("premium", "rechazado", "Revisamos la solicitud Premium de X: Fecha pasada."),
        ("reclamo", "rechazado", "Revisamos tu reclamo de X: Fecha pasada."),
    ],
)
def test_mensajes(tipo, resultado, esperado):
    assert avisos.mensaje(tipo, resultado, "X", "Fecha pasada.", "id")[1] == esperado


def test_sin_cuenta_de_avisos_503(cliente, como, monkeypatch):
    como("admin1")
    monkeypatch.delenv("FIREBASE_SA_FCM", raising=False)
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    monkeypatch.setattr(avisos, "_estado", {})
    import firebase_admin

    monkeypatch.setattr(firebase_admin, "get_app", lambda name: (_ for _ in ()).throw(ValueError()))
    r = cliente.post("/v1/notificaciones/aprobacion", json={"tipo": "comercio", "id": "neg1", "resultado": "aprobado"})
    assert r.status_code == 503


def test_cors_permite_post_desde_la_web(cliente):
    r = cliente.options(
        "/v1/notificaciones/aprobacion",
        headers={
            "Origin": "https://fusa-conecta.web.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert r.status_code == 200 and "POST" in r.headers["access-control-allow-methods"]


def test_avisador_fcm_con_messaging_simulado(monkeypatch):
    """AvisadorFCM arma un mensaje de solo datos y reconoce los tokens que FCM ya no acepta."""
    from firebase_admin import messaging

    capturado = {}

    def enviar(mensaje, app=None):
        capturado["m"], capturado["app"] = mensaje, app
        ok = SimpleNamespace(exception=None, success=True)
        viejo = SimpleNamespace(
            exception=messaging.UnregisteredError("registration-token-not-registered"), success=False
        )
        otro = SimpleNamespace(exception=SimpleNamespace(code="internal"), success=False)
        return SimpleNamespace(success_count=1, responses=[ok, viejo, otro])

    monkeypatch.setattr(messaging, "send_each_for_multicast", enviar)
    enviados, malos = avisos.AvisadorFCM("app-avisos").enviar(
        ["t1", "t2", "t3"], "Negocio aprobado", "¡Listo!", "#/mi-negocio", "comercio-x"
    )
    assert (enviados, malos) == (1, ["t2"])
    m = capturado["m"]
    assert capturado["app"] == "app-avisos" and m.tokens == ["t1", "t2", "t3"]
    assert m.data["enlace"] == "#/mi-negocio" and m.data["icono"].endswith("/img/icons/icon-192.png")
    assert m.notification is None  # solo datos: el service worker arma el aviso


class _Doc:
    def __init__(self, datos=None, id_="d"):
        self._d, self.id, self.exists = datos, id_, datos is not None

    def to_dict(self):
        return self._d


class _Ref:
    def __init__(self, base, ruta):
        self.base, self.ruta = base, ruta

    def collection(self, nombre):
        return _Ref(self.base, self.ruta + [nombre])

    def document(self, id_):
        return _Ref(self.base, self.ruta + [id_])

    def get(self):
        return _Doc(self.base.get("/".join(self.ruta)))

    def stream(self):
        prefijo = "/".join(self.ruta) + "/"
        return [
            _Doc(v, k[len(prefijo) :])
            for k, v in self.base.items()
            if k.startswith(prefijo) and "/" not in k[len(prefijo) :]
        ]

    def create(self, datos):
        from google.api_core.exceptions import AlreadyExists

        clave = "/".join(self.ruta)
        if clave in self.base:
            raise AlreadyExists("ya existe")
        self.base[clave] = datos

    def delete(self):
        self.base.pop("/".join(self.ruta), None)


def test_repositorio_firestore_solo_escribe_novedades_y_dispositivos():
    base = {
        "comercios/n1": {"nombre": "MG"},
        "usuarios/u1/dispositivos/tA": {"plataforma": "android"},
        "usuarios/u1/dispositivos/tB": {"plataforma": "android"},
    }
    cliente = _Ref(base, [])
    repo = avisos.RepositorioAvisosFirestore(cliente)
    antes = set(base)
    assert repo.documento("comercios", "n1") == {"nombre": "MG"} and repo.documento("comercios", "nada") is None
    assert sorted(repo.dispositivos("u1")) == ["tA", "tB"]
    assert repo.guardar_novedad("u1", "comercio-n1-aprobado", {"titulo": "x"}) is True
    assert repo.guardar_novedad("u1", "comercio-n1-aprobado", {"titulo": "x"}) is False
    repo.borrar_dispositivos("u1", ["tB"])
    cambios = set(base) ^ antes
    assert cambios == {"usuarios/u1/notificaciones/comercio-n1-aprobado", "usuarios/u1/dispositivos/tB"}
    assert all(c.startswith("usuarios/u1/") for c in cambios)
