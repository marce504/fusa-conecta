# QR de descarga de la app Android

Lleva a la última versión del APK en GitHub Releases:
https://github.com/marce504/fusa-conecta/releases/latest/download/fusa-conecta.apk

Como usa `releases/latest`, el QR sirve para siempre: cada Release nueva (`apk-v…`) queda detrás del mismo código.

| Archivo | Para qué |
|---|---|
| `qr-descarga-tarjeta.png` | Tarjeta de 1080 × 1350 (al doble de resolución) para imprimir o compartir en redes: título, QR, tres pasos y nota para iPhone |
| `qr-descarga.png` | Solo el QR, 1000 × 1000 sobre blanco |
| `qr-descarga.svg` | Solo el QR, en vector, para imprimir en cualquier tamaño |

Diseño: paleta Orquídea (puntos `#4F35D8`, centros de los ojos `#047857`), Poppins y el isotipo al centro. Se generó
con corrección de errores alta (H) y se comprobó con jsQR, el mismo lector del escáner de la app.

Para imprimirlo, el QR debe medir al menos 2,5 cm de lado. En iPhone el APK no sirve: la tarjeta indica entrar a
https://fusa-conecta.web.app y agregarla a la pantalla de inicio.
