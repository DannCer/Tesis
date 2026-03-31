# Geovisor CDMX

Visor geoespacial web para la consulta y visualización de datos territoriales de la Ciudad de México, desarrollado con **React 19**, **TypeScript**, **Vite 7** y **Leaflet**, integrado con **QGIS Server** como backend de mapas.

## Características

### Funcionalidades Principales
- **Capas vectoriales WFS**: Consultas dinámicas a capas publicadas en QGIS Server
- **Capas ráster WMS**: Series temporales de imágenes satelitales y datos rasterizados
- **Consulta de píxeles**: GetFeatureInfo para obtener valores de capas ráster
- **Comparador Swipe**: Herramienta de deslizamiento para comparar dos capas temporalmente
- **Tabla de atributos**: Visualización de datos tabulares de features vectoriales
- **Simbología dinámica**: Estilos single, categorical y classified con rampas de color
- **Carga de capas externas**: Importar GeoJSON, KML, Shapefile (.zip), GeoTIFF local
- **Conexión a servicios OGC**: Consumir capas WMS/WFS externas
- **Descarga multi-formato**: Exportar datos como Shapefile, GeoJSON, KML, GeoTIFF

### Tecnologías
| Tecnología | Versión |
|------------|---------|
| React | 19.2.0 |
| TypeScript | 5.9.3 |
| Vite | 7.2.4 |
| Leaflet | 1.9.4 |
| React-Leaflet | 5.0.0 |
| Bootstrap | 5.3.8 |

---

## Requisitos Previos

### Software Requerido
- **Node.js** >= 20.x
- **npm** >= 10.x
- **QGIS Server** (para el backend de mapas)

### QGIS Server Setup

1. **Instalar QGIS Server**
   - Windows: [Descargar QGIS](https://qgis.org/es/site/forusers/download.html)
   - Linux: `sudo apt install qgis-server` (Debian/Ubuntu)

2. **Configurar el proyecto QGIS**
   - Crear un proyecto `.qgz` con las capas deseadas
   - Publicar como WMS/WFS en QGIS Server
   - Asegurar que las capas tengan nombres únicos

3. **Verificar el servicio**
   ```bash
   # Probar WMS GetCapabilities
   curl "http://localhost/qgis/qgis_mapserv.fcgi.exe?SERVICE=WMS&REQUEST=GetCapabilities&MAP=C:/mis_proyectos/01_Geologicos.qgz"
   
   # Probar WFS GetCapabilities
   curl "http://localhost/qgis/qgis_mapserv.fcgi.exe?SERVICE=WFS&REQUEST=GetCapabilities&MAP=C:/mis_proyectos/01_Geologicos.qgz"
   ```

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
```bash
# Copiar el archivo de ejemplo
cp .env.example .env.development
```

Editar `.env.development` con tus configuraciones:

```bash
# QGIS Server
VITE_QGIS_SERVER_URL=http://localhost/qgis/qgis_mapserv.fcgi.exe
VITE_QGIS_VECTOR_PROJECT=C:/mis_proyectos/01_Geologicos.qgz
VITE_QGIS_RASTER_PROJECT=C:/mis_proyectos/01_Geologicos.qgz

# Mapa
VITE_MAP_CENTER_LAT=19.4326
VITE_MAP_CENTER_LNG=-99.1332
VITE_MAP_ZOOM=11
```

### 4. Ejecutar en desarrollo
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

---

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor de desarrollo con HMR |
| `npm run build` | Compila para producción |
| `npm run preview` | Vista previa del build de producción |
| `npm run typecheck` | Verifica tipos TypeScript |
| `npm run lint` | Ejecuta ESLint |

---

## Estructura del Proyecto

```
src/
├── components/
│   ├── layout/          # Componentes de layout (Header, Layouts)
│   └── map/             # Componentes del mapa (MapView, LayerMenu, etc.)
├── config/
│   ├── env.ts           # Configuración de entorno y logger
│   ├── layers.ts        # Derivación de LayerConfig[]
│   └── layersConfig.ts  # Definición de capas vectoriales y ráster
├── hooks/
│   ├── useWFSLayers.ts  # Hook para manejo de capas WFS
│   └── useRasterLayers.ts # Hook para manejo de capas WMS
├── services/
│   ├── wfsService.ts    # Servicio para consultas WFS
│   └── rasterService.ts # Servicio para consultas WMS/GetFeatureInfo
├── utils/
│   ├── symbologyUtils.ts # Utilidades de simbología y clasificación
│   ├── layerStyleFactory.ts # Factory de estilos Leaflet
│   ├── fileToGeoJSON.ts # Conversión de archivos a GeoJSON
│   └── georasterLoader.ts # Carga de archivos GeoTIFF
├── pages/
│   ├── Principal.tsx    # Página de inicio
│   ├── Geovisor.tsx     # Página del visor de mapas
│   └── NotFound.tsx     # Página 404
└── styles/              # Hojas de estilo CSS
```

---

## Agregar Nuevas Capas

### Capas Vectoriales

Editar `src/config/layersConfig.ts` y agregar al array `VECTOR_LAYERS`:

```typescript
{
    id:          'mi_nueva_capa',           // ID único interno
    name:        'Mi Nueva Capa',           // Nombre visible en el menú
    description: 'Descripción de la capa',  // Descripción corta
    group:       '🌋 Geológicos',           // Grupo (con emoji opcional)
    wfsName:     'mi_nueva_capa',          // TypeName exacto del WFS
    wmsLayer:    'Mi Nueva Capa',          // Nombre exacto del WMS
}
```

### Capas Ráster

Agregar al array `RASTER_LAYERS`:

```typescript
{
    id:          'raster_2024',
    name:        'Raster 2024',
    description: 'Descripción',
    group:       '🌋 Geológicos',           // Mismo sistema de grupos
    wmsLayer:    'nombre_capa_wms',
    year:        2024,                      // Año para badge
    timeValue:   '2024-01-01',             // Valor TIME para WMS
}
```

### Notas Importantes

- **wfsName**: Debe coincidir EXACTAMENTE con el `<Name>` del WFS GetCapabilities (guiones bajos, sin acentos)
- **wmsLayer**: Debe coincidir EXACTAMENTE con el `<Name>` del WMS GetCapabilities (puede tener espacios/acentos)
- **group**: Las capas vectoriales y ráster comparten el mismo sistema de grupos

---

## Configuración de QGIS Server

### Publicar un Proyecto WMS/WFS

1. **En QGIS Desktop:**
   - Abrir/crear proyecto `.qgz`
   - Capa → Propiedades → QGIS Server → Configurar nombres WMS/WFS
   - Proyecto → Propiedades → QGIS Server → Activar WMS/WFS

2. **Configurar el servidor:**
   ```bash
   # Windows (IIS/Apache)
   # Asegurar que qgis_mapserv.fcgi.exe sea accesible
   
   # Linux (systemd)
   sudo systemctl enable qgis-server
   sudo systemctl start qgis-server
   ```

3. **Permisos:**
   - El usuario del servidor web debe tener acceso de lectura al archivo `.qgz`
   - Las capas de datos deben ser legibles por el servidor

### GetCapabilities URLs

```
# WMS GetCapabilities
http://localhost/qgis/qgis_mapserv.fcgi.exe?SERVICE=WMS&REQUEST=GetCapabilities&MAP=C:/proyecto.qgz

# WFS GetCapabilities  
http://localhost/qgis/qgis_mapserv.fcgi.exe?SERVICE=WFS&REQUEST=GetCapabilities&MAP=C:/proyecto.qgz
```

---

## Build para Producción

### 1. Build estándar
```bash
npm run build
```

Los archivos compilados se generan en `dist/`

### 2. Servir archivos estáticos
```bash
npm run preview
```

### 3. Deploy a servidor web

Copiar el contenido de `dist/` a tu servidor web:

```bash
# Ejemplo con nginx
sudo cp -r dist/* /var/www/geovisor/
```

### Variables de entorno para producción

Crear `.env.production`:

```bash
VITE_QGIS_SERVER_URL=https://tuservidor.com/qgis/qgis_mapserv.fcgi.exe
VITE_QGIS_VECTOR_PROJECT=/ruta/al/proyecto.qgz
VITE_QGIS_RASTER_PROJECT=/ruta/al/proyecto.qgz
VITE_APP_NAME=Geovisor CDMX
VITE_APP_VERSION=1.0.0
VITE_DEBUG_MODE=false
```

---

## Solución de Problemas

### Error: "No se pudo conectar con QGIS Server"
- Verificar que QGIS Server esté corriendo
- Confirmar que la URL en `.env` sea correcta
- Verificar permisos del archivo `.qgz`

### Error: "Capa no encontrada"
- Confirmar que el `wfsName` o `wmsLayer` coincida exactamente con GetCapabilities
- Verificar que la capa esté publicada en QGIS Server

### Error: CORS al cargar capas externas
- El servidor remoto debe permitir CORS
- Configurar proxy si es necesario

### Error: TypeScript "Cannot find module"
```bash
npm install
npm run typecheck
```

---

## Licencia

Este proyecto es parte de una tesis académica de la Facultad de Ingeniería, UNAM.

---

## Autores

- **Geovisor CDMX** - Visor geoespacial para monitoreo territorial

---

## Recursos Adicionales

- [Documentación de QGIS Server](https://docs.qgis.org/latest/es/docs/server_manual/)
- [React-Leaflet Documentation](https://react-leaflet.js.org/)
- [Leaflet Documentation](https://leafletjs.com/)
- [Vite Documentation](https://vitejs.dev/)
