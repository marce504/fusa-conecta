"""Aviso a los admin cuando la agenda automática deja eventos por aprobar (sin Firebase: Firestore simulado)."""

from types import SimpleNamespace

import avisos_admin


class _Ref:
    def __init__(self, base, ruta):
        self.base, self.ruta = base, ruta

    def collection(self, nombre):
        return _Ref(self.base, self.ruta + [nombre])

    def document(self, id_):
        return _Ref(self.base, self.ruta + [id_])

    def where(self, filter=None):  # noqa: A002 - mismo nombre que el SDK
        return self

    def set(self, datos):
        self.base["/".join(self.ruta)] = datos

    def stream(self):
        prefijo = "/".join(self.ruta) + "/"
        out = []
        for k, v in self.base.items():
            resto = k[len(prefijo) :]
            if k.startswith(prefijo) and "/" not in resto:
                if self.ruta == ["usuarios"] and v.get("rol") != "admin":
                    continue
                out.append(SimpleNamespace(id=resto, to_dict=lambda v=v: v))
        return out


def _db():
    return _Ref(
        {
            "usuarios/m": {"rol": "admin", "nombre": "Marcela"},
            "usuarios/j": {"rol": "admin", "nombre": "Jhon", "notificaciones_push": False},
            "usuarios/ana": {"rol": "usuario"},
            "usuarios/m/dispositivos/t1": {},
            "usuarios/j/dispositivos/t2": {},
        },
        [],
    )


def test_texto_del_aviso():
    t, x = avisos_admin.texto_aviso(["Noches de Teatro", "Feria", "Cine", "Danza"])
    assert t == "Eventos por aprobar"
    assert x == "La agenda automática encontró 4 eventos por revisar: «Noches de Teatro», «Feria», «Cine»…"
    assert avisos_admin.texto_aviso(["Uno"])[1].endswith("1 evento por revisar: «Uno»")


def test_avisa_a_cada_admin_y_respeta_quien_apago_los_avisos():
    db, enviados = _db(), []
    r = avisos_admin.avisar_admins(db, ["Noches de Teatro"], "123", enviar=lambda t, a, b: enviados.append(t) or len(t))
    assert r == {"admins": 2, "enviados": 1}
    assert enviados == [["t1"]]
    assert db.base["usuarios/m/notificaciones/agenda-123"]["enlace"] == "#/admin"
    assert "usuarios/j/notificaciones/agenda-123" in db.base
    assert not any(k.startswith("usuarios/ana/notificaciones") for k in db.base)


def test_sin_permiso_de_fcm_la_novedad_queda_igual():
    def falla(*_):
        raise PermissionError("sin rol de FCM")

    db = _db()
    r = avisos_admin.avisar_admins(db, ["Feria"], "9", enviar=falla)
    assert r == {"admins": 2, "enviados": 0}
    assert "usuarios/m/notificaciones/agenda-9" in db.base


def test_sin_pendientes_no_hace_nada():
    assert avisos_admin.avisar_admins(_db(), [], "1") == {"admins": 0, "enviados": 0}
