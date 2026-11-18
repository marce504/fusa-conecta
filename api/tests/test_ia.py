"""IA de respaldo (/v1/ia/generar): sesión, usos permitidos, cupo diario y errores de Gemini."""

import urllib.error

import pytest

from app import ia, main

PEDIDO_EVENTO = {
    "uso": "evento",
    "contents": [{"role": "user", "parts": [{"text": "Feria campesina el sábado 9 a. m. en el parque principal"}]}],
    "generationConfig": {
        "responseMimeType": "application/json",
        "responseSchema": {"type": "OBJECT", "properties": {"titulo": {"type": "STRING"}}},
        "temperature": 0,
    },
    "tools": [{"functionDeclarations": [{"name": "colada"}]}],
}
RESPUESTA = {"candidates": [{"content": {"role": "model", "parts": [{"text": '{"titulo":"Feria"}'}]}}]}


class GeminiFalso:
    def __init__(self, error=None):
        self.cuerpos, self.error = [], error

    def generar(self, cuerpo):
        self.cuerpos.append(cuerpo)
        if self.error:
            raise self.error
        return RESPUESTA


class CupoFalso:
    def __init__(self, cupo=2):
        self.usos, self.cupo = {}, cupo

    def usar(self, uid):
        self.usos[uid] = self.usos.get(uid, 0) + 1
        if self.usos[uid] > self.cupo:
            raise ia.ErrorIA(429, "Llegaste al límite de IA de hoy")
        return self.cupo - self.usos[uid]


@pytest.fixture
def falsos(cliente):
    g, c = GeminiFalso(), CupoFalso()
    main.app.dependency_overrides[main._gemini] = lambda: g
    main.app.dependency_overrides[main._contador] = lambda: c
    return g, c


def test_sin_sesion_no_hay_ia(cliente, falsos):
    assert cliente.post("/v1/ia/generar", json=PEDIDO_EVENTO).status_code == 401
    assert falsos[0].cuerpos == []


def test_evento_devuelve_lo_de_gemini_y_no_deja_pasar_funciones(cliente, falsos, como):
    como("ana")
    r = cliente.post("/v1/ia/generar", json=PEDIDO_EVENTO)
    assert r.status_code == 200
    assert r.json()["candidates"] == RESPUESTA["candidates"] and r.json()["cupo"] == 1
    cuerpo = falsos[0].cuerpos[0]
    assert "tools" not in cuerpo and "systemInstruction" not in cuerpo
    assert cuerpo["generationConfig"]["responseMimeType"] == "application/json"
    assert cuerpo["generationConfig"]["responseSchema"]["type"] == "OBJECT"
    assert cuerpo["generationConfig"]["maxOutputTokens"] == ia.MAX_TOKENS


def test_asistente_lleva_funciones_e_instruccion_pero_la_api_fija_temperatura_y_largo(cliente, falsos, como):
    como("ana")
    pedido = {
        "uso": "asistente",
        "contents": [{"role": "user", "parts": [{"text": "¿Dónde almuerzo?"}]}],
        "systemInstruction": {"parts": [{"text": "Eres Fusa"}]},
        "tools": [{"functionDeclarations": [{"name": "buscarLugares"}]}],
        "generationConfig": {"temperature": 9, "maxOutputTokens": 999999, "responseMimeType": "application/json"},
    }
    assert cliente.post("/v1/ia/generar", json=pedido).status_code == 200
    cuerpo = falsos[0].cuerpos[0]
    assert cuerpo["tools"][0]["functionDeclarations"][0]["name"] == "buscarLugares"
    assert cuerpo["systemInstruction"]["parts"][0]["text"] == "Eres Fusa"
    assert cuerpo["generationConfig"] == {"temperature": 1.0, "maxOutputTokens": ia.MAX_TOKENS}


def test_solo_los_usos_de_la_app(cliente, falsos, como):
    como("ana")
    assert cliente.post("/v1/ia/generar", json={**PEDIDO_EVENTO, "uso": "poema"}).status_code == 422
    assert cliente.post("/v1/ia/generar", json={**PEDIDO_EVENTO, "contents": []}).status_code == 422


def test_cupo_diario_por_persona(cliente, falsos, como):
    como("ana")
    estados = [cliente.post("/v1/ia/generar", json=PEDIDO_EVENTO).status_code for _ in range(3)]
    assert estados == [200, 200, 429]
    como("rosa")
    assert cliente.post("/v1/ia/generar", json=PEDIDO_EVENTO).status_code == 200


def test_pedido_demasiado_grande(cliente, falsos, como):
    como("ana")
    grande = {**PEDIDO_EVENTO, "contents": [{"role": "user", "parts": [{"text": "x" * (main.MAX_BYTES_IA + 1)}]}]}
    assert cliente.post("/v1/ia/generar", json=grande).status_code == 413
    assert falsos[0].cuerpos == []


def test_gemini_caido_o_sin_cupo(cliente, falsos, como):
    como("ana")
    falsos[0].error = ia.ErrorIA(503, "Gemini respondió 503")
    r = cliente.post("/v1/ia/generar", json=PEDIDO_EVENTO)
    assert r.status_code == 503 and "no respondió" in r.json()["error"]
    falsos[0].error = ia.ErrorIA(429, "Gemini respondió 429")
    assert cliente.post("/v1/ia/generar", json=PEDIDO_EVENTO).status_code == 429


def test_sin_clave_en_render(cliente, como, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    main.app.dependency_overrides[main._contador] = lambda: CupoFalso()
    como("ana")
    r = cliente.post("/v1/ia/generar", json=PEDIDO_EVENTO)
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["error"]


def test_gemini_http_reintenta_lo_pasajero(monkeypatch):
    llamadas = []

    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"candidates": []}'

    def abrir(req, timeout):
        llamadas.append(req.get_header("X-goog-api-key"))
        if len(llamadas) == 1:
            raise urllib.error.HTTPError(req.full_url, 503, "saturado", {}, None)
        return Resp()

    monkeypatch.setattr(ia.urllib.request, "urlopen", abrir)
    monkeypatch.setattr(ia.time, "sleep", lambda s: None)
    assert ia.GeminiHTTP("clave-de-prueba").generar({"contents": []}) == {"candidates": []}
    assert llamadas == ["clave-de-prueba", "clave-de-prueba"]


def test_gemini_http_no_reintenta_un_error_del_pedido(monkeypatch):
    def abrir(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 400, "mal", {}, None)

    monkeypatch.setattr(ia.urllib.request, "urlopen", abrir)
    with pytest.raises(ia.ErrorIA) as e:
        ia.GeminiHTTP("clave-de-prueba").generar({"contents": []})
    assert e.value.estado == 400
