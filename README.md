# Geovisor CDMX

Visor geoespacial web para la consulta y visualización de datos territoriales de la Ciudad de México, desarrollado como proyecto de tesis de la Facultad de Ingeniería, UNAM.

Construido con **React 19**, **TypeScript**, **Vite 7** y **Leaflet**, integrado con **QGIS Server** como servidor de mapas y un **backend FastAPI** para gestión de usuarios, grupos y capas.

---

## Funcionalidades Implementadas

### Visualización de Capas
- **Capas vectoriales WFS** — Consultas dinámicas a capas publicadas en QGIS Server con filtros CQL
- **Capas ráster WMS** — Series temporales de imágenes satelitales y datos rasterizados
- **Capas externas** — Importación local de GeoJSON, KML, Shapefile (.zip), GeoTIFF
- **Servicios OGC externos** — Conexión a capas WMS/WFS de terceros

### Panel de Capas y Leyenda
- **LayerMenu** — Menú lateral con grupos paginados, activación/desactivación y opacidad por capa
- **Leyenda dinámica** — Simbología single, categorical y classified con rampas de color
- **Tabla de atributos** — Tabla paginada (300 filas/página) con búsqueda y descarga multi-formato (Shapefile, GeoJSON, KML, GeoTIFF)
- **PixelInfoPanel** — GetFeatureInfo para valores de píxel en capas ráster

### Herramientas de Análisis
- **AnalysisTool** — Análisis espacial interactivo: dibuja punto (+ buffer), línea (+ buffer) o polígono, y consulta cuántos features de cada capa vectorial intersectan la geometría. Usa CQL_FILTER sobre WFS sin dependencias externas.
- **ElevationProfile** — Perfil topográfico a lo largo de una línea trazada en el mapa. Fuente de elevación: AWS Terrain Tiles (codificación Terrarium, sin API key). Gráfico interactivo con múltiples resoluciones.
- **SwipeControl / SwipePanel** — Comparador deslizable para contrastar dos capas temporalmente (p.ej. dos años de una misma cobertura)
- **TimeController** — Control de series temporales para capas ráster con dimensión TIME

### Impresión
- **PrintDesigner** — Diseñador de mapas para impresión: selección de tamaño de papel (A3/A4/Carta/…), orientación, DPI (72/150/300), escala estándar, vista previa WMS en vivo y descarga directa como imagen.

### Gestión de Proyectos y Capas (panel administrativo)
- **GestionProyectos** — Interfaz con pestañas para administrar grupos, capas e ítems publicados:
  - **GruposManager** — CRUD de grupos de capas vía API REST
  - **CapasManager** — CRUD de capas (vectoriales y ráster) vía API REST con asignación a grupos
  - **CapasPublicadas** — Listado de capas publicadas en el geovisor, con control de visibilidad
- **ProjectsManager** — Gestión de proyectos QGIS Server (múltiples proyectos .qgz, detección automática de capas vía GetCapabilities)
- **ProjectLayersView** — Vista de capas detectadas por proyecto con estado de publicación

### Autenticación
- **Login / AuthContext** — Autenticación JWT (access + refresh token). Roles diferenciados: usuario estándar y administrador (`es_admin`).
- **AdminDashboard** — Panel exclusivo para administradores: gestión de usuarios (alta, activación/desactivación).
- **ProtectedRoute** — Rutas protegidas; redirige al login si no hay sesión activa.

### Página de Arquitectura
- **Arquitectura** — Página informativa que documenta la evolución del sistema (migración GeoServer → QGIS Server) y describe el stack tecnológico, pensada para la presentación de tesis.

---

## Tecnologías

| Tecnología | Versión |
|---|---|
| React | 19.2.0 |
| TypeScript | 5.9.3 |
| Vite | 7.2.4 |
| Leaflet | 1.9.4 |
| React-Leaflet | 5.0.0 |
| Bootstrap | 5.3.8 |
| georaster + georaster-layer-for-leaflet | 1.6.0 / 4.1.2 |
| shpjs | 6.2.0 |
| jszip | 3.10.1 |
| react-router-dom | 7.12.0 |
| Vitest | 3.1.1 |

**Backend esperado:** FastAPI con PostgreSQL/PostGIS (autenticación JWT + API REST para grupos y capas).

---

## Requisitos Previos

- **Node.js** >= 20.x
- **npm** >= 10.x
- **QGIS Server** corriendo y accesible (para el backend de mapas)
- **Backend FastAPI** corriendo (para autenticación y gestión de capas)

---

## Instalación

### 1. Clonar el repositorio
```bash
git clone <repository-url>
cd Tesis
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno

Crear `.env.development`:

```bash
# Backend FastAPI
VITE_API_URL=http://localhost:8000

# QGIS Server
VITE_QGIS_SERVER_URL=http://localhost/qgis/qgis_mapserv.fcgi.exe

# Tiempo de espera y límite de features WFS
VITE_WFS_TIMEOUT=30000
VITE_MAX_FEATURES=0

# Vista inicial del mapa (CDMX)
VITE_MAP_CENTER_LAT=19.4326
VITE_MAP_CENTER_LNG=-99.1332
VITE_MAP_ZOOM=11
VITE_MAP_MIN_ZOOM=8
VITE_MAP_MAX_ZOOM=19

# Aplicación
VITE_APP_NAME=Geovisor
VITE_APP_VERSION=1.0.0
VITE_DEBUG_MODE=true
```

> **Nota:** `VITE_QGIS_VECTOR_PROJECT` y `VITE_QGIS_RASTER_PROJECT` ya no son necesarios en el `.env`. Los proyectos QGIS se gestionan desde la interfaz de **Gestión de Proyectos** y se persisten en `localStorage`.

### 4. Ejecutar en desarrollo
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

---

## Scripts Disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR (expuesto en red local con `--host`) |
| `npm run build` | Compila para producción |
| `npm run preview` | Vista previa del build de producción |
| `npm run typecheck` | Verificación de tipos TypeScript |
| `npm run lint` | ESLint |
| `npm run test` | Vitest en modo watch |
| `npm run test:run` | Vitest en modo CI (una pasada) |
| `npm run test:coverage` | Reporte de cobertura con V8 |

---

## Estructura del Proyecto

```
src/
├── components/
│   ├── common/              # AlertModal, ConfirmModal, ErrorBoundary
│   ├── layout/              # AppLayout, Header, LayoutGeovisor, LayoutPrincipal
│   └── map/
│       ├── controls/        # BaseLayerControls, SwipeControl, TimeController
│       ├── layers/          # GeoRasterLayerComponent, VectorLayer
│       ├── management/      # CapasManager, CapasPublicadas, GruposManager,
│       │                    #   ProjectsManager, ProjectLayersView
│       ├── panels/          # AttributeTable, LayerMenu, Legend,
│       │                    #   PaginatedLayerGroup, PixelInfoPanel
│       ├── tools/           # AnalysisTool, ElevationProfile,
│       │                    #   PrintDesigner, SwipePanel
│       ├── MapContent.tsx
│       └── MapView.tsx
├── config/
│   ├── env.ts               # Config centralizada + logger (lee variables VITE_*)
│   ├── constants.ts         # Constantes globales (breakpoints, clases USV, etc.)
│   ├── layers.ts            # Derivación de LayerConfig[]
│   └── index.ts
├── contexts/
│   ├── AuthContext.tsx       # Estado de autenticación JWT (reducer)
│   ├── LayersContext/        # Estado global de capas activas
│   ├── MapContext/           # Instancia del mapa Leaflet
│   └── SelectedProjectContext.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── api/                 # useApiLayersLoader, usePublishedLayers
│   ├── map/                 # useWFSLayers, useRasterLayers,
│   │                        #   useProjectLayers, useSelectedProjectLayers
│   └── ui/                  # useResponsive
├── pages/
│   ├── Principal.tsx        # Página de inicio / landing
│   ├── Geovisor.tsx         # Visor de mapas principal
│   ├── Arquitectura.tsx     # Documentación de arquitectura (tesis)
│   ├── GestionProyectos.tsx # Panel de gestión (grupos, capas, publicadas)
│   ├── AdminDashboard.tsx   # Panel de administrador (gestión de usuarios)
│   ├── Login.tsx
│   └── NotFound.tsx
├── services/
│   ├── api/                 # apiService.ts — Auth, grupos, capas, usuarios
│   ├── geoserver/           # wfsService, rasterService,
│   │                        #   dynamicWfsService, dynamicRasterService
│   ├── print/               # printService.ts — tamaños de papel, GetMap, etc.
│   └── projects/            # projectsService.ts — gestión local de proyectos .qgz
├── styles/                  # CSS por componente + variables + global
├── tests/                   # Vitest: wfsService, rasterService, symbologyUtils
├── types/                   # api.ts, geo.ts, map.ts, projects.ts
└── utils/
    ├── geo/                 # fileToGeoJSON, georasterLoader, symbologyUtils
    ├── map/                 # layerStyleFactory, legendData
    ├── bboxLayerPrefs.ts
    ├── mapCapture.ts
    └── validation.ts
```

---

## Gestión de Capas desde la Interfaz

Las capas se administran desde **Geovisor → Gestión de Proyectos**, sin necesidad de modificar código:

1. Ir a **Grupos** → crear un grupo (nombre + URL del proyecto .qgz).
2. Ir a **Capas** → agregar una capa al grupo con su `wfsName` y `wmsLayer` (deben coincidir exactamente con los nombres en GetCapabilities).
3. Ir a **Publicadas** → activar la capa para que aparezca en el mapa.

Los cambios se persisten en el backend FastAPI y se reflejan en el geovisor sin recompilar.

---

## Variables de Entorno de Referencia

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_API_URL` | URL base del backend FastAPI | `http://localhost:8000` |
| `VITE_QGIS_SERVER_URL` | URL del ejecutable de QGIS Server | `http://localhost/qgis/qgis_mapserv.fcgi.exe` |
| `VITE_WFS_TIMEOUT` | Timeout de requests WFS (ms) | `30000` |
| `VITE_MAX_FEATURES` | Límite de features por request WFS (0 = sin límite) | `0` |
| `VITE_MAP_CENTER_LAT` | Latitud del centro inicial del mapa | `19.4326` |
| `VITE_MAP_CENTER_LNG` | Longitud del centro inicial del mapa | `-99.1332` |
| `VITE_MAP_ZOOM` | Zoom inicial | `11` |
| `VITE_APP_NAME` | Nombre de la aplicación | `Geovisor` |
| `VITE_APP_VERSION` | Versión de la aplicación | `1.0.0` |
| `VITE_DEBUG_MODE` | Activar logs de depuración | `true` |

---

## Build para Producción

```bash
# Crear .env.production con las URLs del servidor real
npm run build
# Los archivos compilados quedan en dist/
```

Desplegar el contenido de `dist/` en cualquier servidor web estático (nginx, Apache, S3, etc.).

---

## Tests

El proyecto incluye tests unitarios con **Vitest**:

```bash
npm run test:run        # CI
npm run test:coverage   # Con reporte de cobertura
```

Archivos de test en `src/tests/`:
- `wfsService.test.ts` — Consultas WFS, filtros CQL, manejo de errores
- `rasterService.test.ts` — Consultas WMS, GetFeatureInfo
- `symbologyUtils.test.ts` — Clasificación de simbología y rampas de color

---

## Solución de Problemas

**"No se pudo conectar con QGIS Server"**
- Verificar que QGIS Server esté corriendo
- Confirmar que `VITE_QGIS_SERVER_URL` sea accesible desde el navegador
- Revisar que el archivo `.qgz` sea legible por el servidor web

**"Capa no encontrada"**
- El `wfsName` debe coincidir exactamente con el `<Name>` del WFS GetCapabilities
- El `wmsLayer` debe coincidir exactamente con el `<Name>` del WMS GetCapabilities

**"Error de autenticación / 401"**
- Verificar que el backend FastAPI esté corriendo en `VITE_API_URL`
- El token de acceso se almacena en `localStorage`; limpiar caché del navegador si persiste

**CORS al cargar capas externas**
- El servidor remoto debe permitir CORS
- Configurar un proxy en `vite.config.ts` si es necesario

**Error TypeScript "Cannot find module"**
```bash
npm install
npm run typecheck
```

---

## Configuración de QGIS Server

### Publicar un proyecto WMS/WFS

1. En **QGIS Desktop**: abrir/crear proyecto `.qgz` → Proyecto → Propiedades → QGIS Server → activar WMS/WFS y configurar nombres de capa.
2. Verificar acceso:
```bash
curl "http://localhost/qgis/qgis_mapserv.fcgi.exe?SERVICE=WMS&REQUEST=GetCapabilities&MAP=/ruta/proyecto.qgz"
curl "http://localhost/qgis/qgis_mapserv.fcgi.exe?SERVICE=WFS&REQUEST=GetCapabilities&MAP=/ruta/proyecto.qgz"
```

---

## Recursos

- [Documentación de QGIS Server](https://docs.qgis.org/latest/es/docs/server_manual/)
- [React-Leaflet Documentation](https://react-leaflet.js.org/)
- [Leaflet Documentation](https://leafletjs.com/)
- [AWS Terrain Tiles (Elevation)](https://registry.opendata.aws/terrain-tiles/)
- [Vite Documentation](https://vitejs.dev/)
- [Vitest Documentation](https://vitest.dev/)

---

## Licencia

Proyecto de tesis académica — Facultad de Ingeniería, UNAM.