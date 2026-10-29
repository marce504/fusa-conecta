# Arquitectura de Fusa Conecta (actualizada a la v1.1.0)

GitHub dibuja los diagramas al abrir este archivo. Para pegarlos en el documento técnico, ábrelos en https://mermaid.live
(pega el bloque) y exporta a PNG o SVG.

## 1. Contexto y despliegue

Hay un solo código de app (la PWA), que la gente usa en el navegador o instalada; en Android, también como app de Google
Play (TWA). Los datos y la seguridad viven en Firebase. Los procesos en Python (API REST y automatizaciones) corren en
servicios gratuitos.

```mermaid
flowchart LR
  subgraph Dispositivo["Celular o computador"]
    PWA["PWA Fusa Conecta<br/>HTML, CSS y JavaScript<br/>service worker e IndexedDB"]
    TWA["App Android co.fusaconecta.app<br/>Trusted Web Activity"]
  end
  subgraph Firebase["Firebase · plan Spark (Google Cloud)"]
    HOST["Firebase Hosting<br/>CDN con HTTPS"]
    AUTH["Firebase Authentication<br/>correo y Google"]
    FS[("Cloud Firestore<br/>reglas de seguridad")]
    AIL["Firebase AI Logic"]
  end
  subgraph Python["Módulos en Python 3.12"]
    API["API REST FastAPI<br/>Render, plan gratuito"]
    AUTO["agenda.py y limpieza.py<br/>GitHub Actions"]
  end
  GEM["Google Gemini<br/>gemini-flash-lite-latest"]
  GOV["Sitios oficiales gov.co<br/>Fusagasugá, Pasca e IDECUT"]
  MAPAS["OpenStreetMap y OpenFreeMap<br/>Terrain Tiles en AWS S3"]
  UMAMI["Umami Cloud<br/>analítica sin cookies"]
  WA["WhatsApp"]

  TWA -->|abre a pantalla completa| PWA
  PWA -->|descarga la app| HOST
  PWA -->|inicia sesión| AUTH
  PWA <-->|lee y escribe en tiempo real| FS
  PWA -->|asistente y afiches| AIL --> GEM
  PWA -->|"ICS, GPX y reportes (HTTPS + token)"| API
  API -->|"Firebase Admin, solo lectura"| FS
  API -->|verifica el token| AUTH
  AUTO -->|lee noticias| GOV
  AUTO -->|extrae eventos| GEM
  AUTO -->|"guarda, repara y limpia"| FS
  PWA -->|mapas y relieve 3D| MAPAS
  PWA -->|uso anónimo| UMAMI
  PWA -->|contacto| WA
```

| Nodo | Tecnología | Costo |
|---|---|---|
| Dispositivo | Navegador moderno o Android 7+ (TWA) | — |
| Firebase Hosting, Auth, Firestore y AI Logic | Google Cloud, plan Spark | $0 |
| API REST | Render, plan gratuito (750 h/mes) | $0 |
| Procesos automáticos e integración continua | GitHub Actions (repositorio público) | $0 |
| Gemini | Cuota gratuita de la API y de AI Logic | $0 |
| Analítica | Umami Cloud, plan gratuito | $0 |

## 2. Capas y componentes

La PWA está organizada **en capas**, sin framework: un solo `app.js` dividido en secciones con un estado global
(`estado`) y funciones de vista `render*()`. La API sigue el mismo esquema en Python, con capas separadas en archivos.

```mermaid
flowchart TB
  subgraph Presentacion["Capa de presentación · PWA"]
    V1["Vistas render*()<br/>inicio, lista, ficha, agenda, mapa,<br/>billetera, perfil, panel admin"]
    V2["Hojas y diálogos<br/>abrirHoja, confirmar, Diagnóstico"]
    V3["Íconos Lucide locales y tokens CSS<br/>modo claro, oscuro y automático"]
  end
  subgraph Logica["Capa de lógica · PWA"]
    L1["Directorio y búsqueda<br/>norm, tokens, coincide"]
    L2["Horarios<br/>estadoApertura"]
    L3["Cupones<br/>generarCupon, revisarCupon"]
    L4["Asistente IA<br/>preguntarFusa, FUNCIONES_ASIS"]
    L5["Rutas y grabación GPS<br/>abrir3D, grabador"]
  end
  subgraph Datos["Capa de datos · PWA"]
    D1["Firestore SDK<br/>con persistencia local"]
    D2["IndexedDB<br/>recorridos y fotos"]
    D3["localStorage<br/>billetera, preferencias"]
    D4["datos.js<br/>directorio base sin conexión"]
    D5["Cliente REST<br/>pedirAPI"]
  end
  subgraph APIpy["API REST · Python"]
    A1["main.py<br/>endpoints, CORS, límite y token"]
    A2["servicios.py<br/>reglas de negocio"]
    A3["formatos.py<br/>GPX, ICS, Excel y PDF"]
    A4["repositorio.py<br/>Firestore con caché"]
  end
  V1 --> L1 & L2 & L3 & L4 & L5
  L1 --> D1 & D4
  L3 --> D1 & D3
  L4 --> D1
  L5 --> D2
  V1 --> D5 --> A1 --> A2 --> A3
  A2 --> A4
```

### Patrones de diseño que sí se usan

| Patrón | Dónde | Para qué |
|---|---|---|
| **Singleton** | `firebase.initializeApp` y `db`/`auth` únicos en `app.js`; `iniciar_firebase()` y `repositorio()` en la API | Una sola conexión a Firebase por app o proceso |
| **Repository** | `api/app/repositorio.py` (`Repositorio` como `Protocol`, `RepositorioFirestore`); `IDB` en la PWA | Separar las reglas de negocio de la fuente de datos; las pruebas usan un repositorio falso |
| **Caché** (proxy) | `_Cache` de la API (2 min); service worker (red primero y copia guardada) | Cuidar la cuota de lecturas del plan Spark; funcionar sin conexión |
| **Strategy** | Funciones de `FUNCIONES_ASIS` que el modelo de IA elige | El asistente decide qué consulta hacer sin código fijo por pregunta |
| **Observer** | `onSnapshot` de Firestore (comercios, eventos, cupones, rutas) | La interfaz se actualiza sola cuando cambian los datos |
| **Inyección de dependencias** | `Depends(repositorio)` y `Depends(usuario_actual)` en FastAPI | Probar la API con datos falsos y con el emulador |

## 3. Modelo de datos (Cloud Firestore)

Base NoSQL de documentos. Toda la seguridad está en `firestore.rules`: lectura pública solo de lo publicado; escritura
según el rol (persona, comerciante dueño, organizador o admin) y con validación de campos, tamaños y transiciones de estado.

```mermaid
erDiagram
  USUARIOS ||--o{ COMERCIOS : "es dueño de"
  USUARIOS ||--o{ CANJES : "obtiene"
  COMERCIOS ||--o{ CUPONES : "publica"
  CUPONES ||--o{ CANJES : "se reserva en"
  COMERCIOS ||--o{ ESTADISTICAS : "acumula por mes"
  COMERCIOS ||--o{ FOTOS : "tiene"
  COMERCIOS ||--o{ CALIFICACIONES : "recibe"
  USUARIOS ||--o{ EVENTOS : "sugiere o publica"
  USUARIOS ||--o{ RUTAS_COMUNIDAD : "propone"
  RUTAS_COMUNIDAD ||--o{ FOTOS : "tiene"
  USUARIOS {
    string uid PK
    string rol "usuario, organizador o admin"
    string nombre
    bool consentimiento_ley1581
    array favoritos
  }
  COMERCIOS {
    string id PK
    string cat
    string sub
    string estado_publicacion "pendiente, aprobado, rechazado u oculto"
    string propietario_uid FK
    bool esPremium
    array dias
    string abre
    string cierra
  }
  CUPONES {
    string id PK
    string comercio_id FK
    string estado "activo, pausado o finalizado"
    int cupo_total
    int cupo_restante
    string vigencia "AAAA-MM-DD"
  }
  CANJES {
    string id PK "cuponId_uid"
    string codigo "FC-XXXX-XXXX"
    string estado "reservado o usado"
    timestamp fecha_vencimiento
  }
  EVENTOS {
    string id PK
    string estado "pendiente, publicado o rechazado"
    string tipo "plan o aviso"
    string origen "admin, organizador, usuario, ia o automatico"
    bool demo
    timestamp fecha_inicio
  }
  ESTADISTICAS {
    string mes PK "AAAA-MM"
    int vistas
    int toques_wa
    int cupones_obtenidos
  }
  RUTAS_COMUNIDAD {
    string id PK
    string estado "pendiente, aprobada o rechazada"
    string linea "lat,lng,alt;..."
    float distancia_km
  }
```

Otras colecciones:
- **Contenido:** `banners`, `notificaciones` (Novedades), `emergencias` (números editados por el admin), `opiniones`, `reportes`, `solicitudes` (Premium y reclamos) e `invitaciones` (organizadores).
- **Límites diarios de IA:** `uso_asistente` y `uso_ia`, validados en las reglas.
- **Trazados oficiales:** `rutas_oficiales`.
- **Configuración y resúmenes:** `config/agenda_auto`, `config/limpieza` y `config/directorio`.

**Sin conexión:**
- `datos.js`: directorio base y números de emergencia.
- Persistencia de Firestore en IndexedDB.
- `fusa-recorridos`: recorridos GPS y fotos, en IndexedDB.
- `localStorage`: billetera de cupones.

## 4. Secuencias críticas

### 4.1 Asistente con llamadas a funciones

```mermaid
sequenceDiagram
  actor P as Persona
  participant App as PWA
  participant FS as Firestore
  participant G as Gemini (AI Logic)
  P->>App: «panadería cerca»
  App->>FS: transacción uso_asistente (cupo del día, validado por reglas)
  FS-->>App: quedan 29
  App->>G: pregunta + instrucción + declaración de funciones
  G-->>App: llama a buscarLugares(texto: panaderia, cercaDeMi: true)
  App->>App: filtra el directorio, calcula «abierto» y la distancia (GPS)
  App->>G: resultado de la función (lugares reales)
  G-->>App: respuesta en texto con los nombres
  App-->>P: texto + tarjetas + «Respuesta con IA: confirma horarios…»
```

### 4.2 Canje de un cupón con QR

```mermaid
sequenceDiagram
  actor C as Cliente
  actor V as Comerciante
  participant App as PWA
  participant FS as Firestore (reglas)
  C->>App: «Obtener cupón»
  App->>FS: transacción: cupo_restante − 1 y canjes/{cupon_uid} reservado
  FS-->>App: confirmado (un cupón por persona)
  App-->>C: QR y código FC-XXXX-XXXX (guardado sin conexión)
  V->>App: escanea el QR o escribe el código
  App->>FS: canjes donde propietario_uid = comerciante y codigo = …
  FS-->>App: reservado, vigente y de este negocio
  V->>App: «Confirmar canje»
  App->>FS: transacción: reservado → usado (solo el dueño, una sola vez)
  App-->>V: «Canje confirmado». Un segundo intento → «Ya fue canjeado»
```

### 4.3 Agenda automática (todos los días, 6:00 a. m.)

```mermaid
sequenceDiagram
  participant GA as GitHub Actions
  participant PY as agenda.py
  participant GOV as Sitios gov.co
  participant G as Gemini API
  participant FS as Firestore
  GA->>PY: cron 0 11 * * * (6:00 a. m. Colombia)
  PY->>FS: borra eventos de ejemplo con más de 24 h
  PY->>GOV: busca 22 palabras clave en 3 fuentes y lee el detalle de las noticias
  PY->>G: noticia + esquema JSON (título corto, campaña, plan o aviso, fecha y lugar claros)
  G-->>PY: eventos extraídos
  PY->>PY: quita duplicados (título+día+lugar y lugar+hora) y decide publicado o pendiente
  PY->>GOV: imagen principal de la noticia → WebP de máximo 200 KB
  PY->>FS: guarda eventos nuevos y repara los anteriores
  PY->>FS: config/agenda_auto con el resumen y el registro (se ve en el panel)
```

## 5. Integración y despliegue continuos

```mermaid
flowchart LR
  DEV["Rama de trabajo<br/>feat/… o fix/…"] -->|Pull Request| DEVELOP["develop"]
  DEVELOP -->|Pull Request| MAIN["main"]
  subgraph CI["ci.yml · en cada Pull Request y push"]
    J1["JavaScript<br/>ESLint, Prettier y Vitest"]
    J2["Python<br/>black, flake8 y pytest con cobertura"]
    J3["Integración<br/>emulador de Firestore y Auth"]
    J4["Extremo a extremo<br/>Playwright 390×844"]
    J5["Lighthouse<br/>PWA y accesibilidad ≥ 90"]
    J6["Informe HTML"]
  end
  DEVELOP --> CI
  MAIN --> CI
  CI -->|"todo en verde en main"| D1["Firebase Hosting<br/>y reglas"]
  CI -->|checksPass| D2["Render: API"]
  TAG["Etiqueta apk-v*"] --> AND["android.yml<br/>APK y AAB firmados → Releases"]
```
