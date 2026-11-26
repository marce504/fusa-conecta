"""Miniaturas de las fotos locales para las tarjetas (420 × 315 px, WebP).

Las tarjetas miden ~170-210 px de ancho (el doble en pantallas de alta densidad), pero mostraban la foto de 800 px:
el Inicio bajaba ~770 KB de fotos al abrir. La miniatura se recorta al centro en 4:3, igual que la tarjeta
(object-fit: cover), así que se ve el mismo encuadre. La ficha del lugar sigue usando la foto original.

Uso (desde la raíz del proyecto, con Pillow instalado):
    python scripts/miniaturas.py            crea las que faltan o están desactualizadas
    python scripts/miniaturas.py --revisar  solo dice cuáles faltan (sale con error si falta alguna)

Cada foto img/<carpeta>/<nombre>.<ext> queda en img/mini/<carpeta>/<nombre>.webp. La app usa la miniatura y, si no
existe, vuelve a la foto original.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parent.parent
CARPETAS = ("categorias", "comercios", "turismo")
ANCHO, CALIDAD = 420, 72
EXTENSIONES = {".jpg", ".jpeg", ".png", ".webp"}


def destino(foto: Path) -> Path:
    relativa = foto.relative_to(RAIZ / "img")
    return (RAIZ / "img" / "mini" / relativa).with_suffix(".webp")


def fotos() -> list[Path]:
    return sorted(
        f for c in CARPETAS for f in (RAIZ / "img" / c).rglob("*") if f.suffix.lower() in EXTENSIONES and f.is_file()
    )


def crear(foto: Path, salida: Path) -> None:
    img = ImageOps.exif_transpose(Image.open(foto)).convert("RGB")
    ancho = min(ANCHO, img.width)  # nunca agranda
    img = ImageOps.fit(img, (ancho, round(ancho * 3 / 4)), Image.LANCZOS, centering=(0.5, 0.5))
    salida.parent.mkdir(parents=True, exist_ok=True)
    img.save(salida, "WEBP", quality=CALIDAD, method=6)


def main(argv: list[str]) -> int:
    if "--revisar" in argv:
        # Solo si existe: en una copia recién bajada de GitHub las fechas de los archivos no dicen nada
        faltan = [f for f in fotos() if not destino(f).exists()]
        for f in faltan:
            print("Falta la miniatura de", f.relative_to(RAIZ).as_posix())
        if faltan:
            print("Corre: python scripts/miniaturas.py")
        return 1 if faltan else 0
    faltan = [f for f in fotos() if not destino(f).exists() or destino(f).stat().st_mtime < f.stat().st_mtime]
    antes = despues = 0
    for f in faltan:
        crear(f, destino(f))
        antes += f.stat().st_size
        despues += destino(f).stat().st_size
        kb_antes, kb_despues = f.stat().st_size // 1024, destino(f).stat().st_size // 1024
        print(f"{f.relative_to(RAIZ).as_posix()}: {kb_antes} KB -> {kb_despues} KB")
    print(f"{len(faltan)} miniaturas · {antes // 1024} KB -> {despues // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
