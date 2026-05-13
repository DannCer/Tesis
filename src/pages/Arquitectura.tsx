import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '@styles/arquitectura.css';

type Tab = 'overview' | 'qgis' | 'backend' | 'frontend' | 'spatial' | 'escalabilidad';

const PROYECTOS = [
  { id: '01', nombre: 'Geológicos',                     file: '01_Geologicos.qgz',                        capas: 29  },
  { id: '02', nombre: 'Hidrometeorológicos',            file: '02_Hidrometeorologicos.qgz',               capas: 55  },
  { id: '03', nombre: 'Químico Tecnológicos',           file: '03_Quimico_Tecnologicos.qgz',              capas: 18  },
  { id: '04', nombre: 'Sanitario Ecológico',            file: '04_Sanitario_Ecologico.qgz',               capas: 14  },
  { id: '05', nombre: 'Socio Organizativos',            file: '05_Socio_Organizativos.qgz',               capas: 3   },
  { id: '06', nombre: 'Estudios',                       file: '06_Estudios.qgz',                          capas: 87  },
  { id: '07', nombre: 'Escenarios',                     file: '07_Escenarios.qgz',                        capas: 37  },
  { id: '08', nombre: 'Eventos',                        file: '08_Eventos.qgz',                           capas: 6   },
  { id: '09', nombre: 'Sistema Regulador',              file: '09_Sistema_Regulador.qgz',                 capas: 0   },
  { id: '10', nombre: 'Sistema Expuesto',               file: '10_Sistema_Expuesto.qgz',                  capas: 36  },
  { id: '11', nombre: 'Indicadores',                    file: '11_Indicadores.qgz',                       capas: 9   },
  { id: '12', nombre: 'Infraestructura Estratégica',    file: '12_Infraestructura_Estrategica.qgz',       capas: 1   },
  { id: '13', nombre: 'Límites políticos',              file: '13_Limites_politicos_y_territoriales.qgz', capas: 20  },
];

const ENDPOINTS = {
  auth: [
    { method: 'POST', path: '/login',   desc: 'Retorna access + refresh token (JWT HS256)' },
    { method: 'POST', path: '/refresh', desc: 'Nuevo access token con refresh válido' },
    { method: 'POST', path: '/logout',  desc: 'Añade JTI a blacklist — requiere auth' },
    { method: 'GET',  path: '/me',      desc: 'Datos del usuario autenticado + flag es_admin' },
  ],
  gestion: [
    { method: 'GET',    path: '/',            desc: 'Lista todas las capas activas · público' },
    { method: 'POST',   path: '/',            desc: 'Crear capa · requiere auth' },
    { method: 'PUT',    path: '/{layer_id}',  desc: 'Actualizar capa · requiere auth' },
    { method: 'DELETE', path: '/{layer_id}',  desc: 'Soft delete de capa · requiere auth' },
    { method: 'GET',    path: '/grupos',      desc: 'Lista grupos/proyectos activos · público' },
    { method: 'POST',   path: '/grupos',      desc: 'Crear grupo · requiere auth' },
    { method: 'PUT',    path: '/grupos/{id}', desc: 'Actualizar grupo · requiere auth' },
    { method: 'DELETE', path: '/grupos/{id}', desc: 'Soft delete grupo + cascade capas' },
  ],
  admin: [
    { method: 'POST',   path: '/usuarios',                 desc: 'Crear usuario · solo admin' },
    { method: 'GET',    path: '/usuarios',                 desc: 'Listar usuarios · solo admin' },
    { method: 'DELETE', path: '/usuarios/{id}',            desc: 'Soft delete · no elimina último admin' },
    { method: 'POST',   path: '/usuarios/{id}/make-admin', desc: 'Promover a admin · solo uno permitido' },
  ],
};

const Arquitectura: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="arquitectura-page">

      {/* Hero */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Arquitectura del Sistema</h1>
          <p className="hero-subtitle">
            Geovisor Atlas de Riesgos · CDMX — React + Leaflet · FastAPI + PostgreSQL · QGIS Server WFS/WMS
          </p>
          <button className="btn btn-secondary btn-lg mt-4" onClick={() => navigate('/')}>
            Volver a Inicio
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="content-section bg-light">
        <div className="container-max py-5">
          <div className="arch-stats-grid">
            <div className="arch-stat-card">
              <span className="arch-stat-num">13</span>
              <span className="arch-stat-lbl">Proyectos QGIS (.qgz)</span>
            </div>
            <div className="arch-stat-card">
              <span className="arch-stat-num">280+</span>
              <span className="arch-stat-lbl">Capas geográficas</span>
            </div>
            <div className="arch-stat-card">
              <span className="arch-stat-num">9</span>
              <span className="arch-stat-lbl">Categorías temáticas</span>
            </div>
            <div className="arch-stat-card">
              <span className="arch-stat-num">3</span>
              <span className="arch-stat-lbl">Capas tecnológicas</span>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs nav + content */}
      <section className="content-section">
        <div className="container-max py-5">
          <div className="arch-tabs">
            {([
              ['overview',      'Vista general'],
              ['qgis',          'QGIS Server'],
              ['backend',       'Backend'],
              ['frontend',      'Frontend'],
              ['spatial',       'Análisis espacial'],
              ['escalabilidad', 'Escalabilidad'],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                className={`arch-tab${tab === id ? ' arch-tab--active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── VISTA GENERAL ── */}
          {tab === 'overview' && (
            <div className="arch-tab-content">
              <div className="section-header">
                <span className="section-icon">🏗️</span>
                <h2>Arquitectura de tres capas</h2>
              </div>
              <div className="architecture-layers">
                <div className="arch-layer">
                  <div className="layer-number">1</div>
                  <div className="layer-content">
                    <h3>Capa de Presentación — Frontend</h3>
                    <p className="layer-tech">React 18 + TypeScript · Leaflet 1.9 · react-leaflet 5 · Vite · georaster-layer</p>
                    <ul>
                      <li>Mapa interactivo con capas WMS (ráster) y WFS (vectoriales) sobre OpenStreetMap</li>
                      <li>Herramienta de análisis espacial: dibujo de punto/línea/polígono, conteo por capa y detalles de features</li>
                      <li>Panel de capas con toggle, opacidad y búsqueda por categoría temática</li>
                      <li>Comparador de capas, perfil de elevación, tabla de atributos, exportación a PDF</li>
                    </ul>
                  </div>
                </div>
                <div className="arch-layer">
                  <div className="layer-number">2</div>
                  <div className="layer-content">
                    <h3>Capa de Servicios — QGIS Server</h3>
                    <p className="layer-tech">QGIS Server (Windows) · WMS 1.3.0 · WFS 1.1.0 · FastCGI · 13 proyectos .qgz</p>
                    <ul>
                      <li>Un proyecto .qgz por categoría temática; la URL MAP= se determina dinámicamente desde la BD</li>
                      <li>WMS para capas ráster con estilos QGIS Desktop sincronizados automáticamente</li>
                      <li>WFS con filtro BBOX para consultas espaciales — DWITHIN/INTERSECTS no evaluado en WFS 1.1.0</li>
                      <li>Detección de campo de geometría por capa vía DescribeFeatureType con caché</li>
                    </ul>
                  </div>
                </div>
                <div className="arch-layer">
                  <div className="layer-number">3</div>
                  <div className="layer-content">
                    <h3>Capa de Datos — Backend + Base de Datos</h3>
                    <p className="layer-tech">FastAPI 0.115 + Python 3.12 · SQLAlchemy 2 async · PostgreSQL · psycopg3</p>
                    <ul>
                      <li>API REST con autenticación JWT (access 60 min, refresh 7 días, blacklist en BD)</li>
                      <li>Gestión de capas y grupos/proyectos: CRUD completo con soft delete y vistas SQL</li>
                      <li>Administración de usuarios: un único administrador con permisos especiales</li>
                      <li>Pool de conexiones con pool_pre_ping y pool_recycle=1800 s</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="section-header mt-4">
                <span className="section-icon">🔀</span>
                <h2>Flujo de un análisis espacial</h2>
              </div>
              <div className="data-flow">
                {([
                  ['1', 'Usuario dibuja en el mapa',         'Punto (buffer), línea (buffer) o polígono con Leaflet.js'],
                  ['2', 'buildBboxCql() construye el filtro', 'BBOX(geomField, minLng, minLat, maxLng, maxLat) — único predicado confiable en QGIS WFS 1.1.0'],
                  ['3', 'QGIS Server filtra por BBOX',        'Devuelve GeoJSON con features del área aproximada; srsName=EPSG:4326 obligatorio'],
                  ['4', 'clientSideFilter() — filtro exacto', 'distanceTo() para punto/línea, ray-casting para polígono. Elimina falsos positivos del BBOX'],
                  ['5', 'Resultados y detalles en pantalla',  'Conteo por capa, atributos de features, visualización en el mapa'],
                ] as [string, string, string][]).map(([num, title, desc], i, arr) => (
                  <React.Fragment key={num}>
                    <div className="flow-step">
                      <div className="step-number">{num}</div>
                      <div className="step-content">
                        <h4>{title}</h4>
                        <p>{desc}</p>
                      </div>
                    </div>
                    {i < arr.length - 1 && <div className="flow-arrow">↓</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* ── QGIS SERVER ── */}
          {tab === 'qgis' && (
            <div className="arch-tab-content">
              <div className="section-header">
                <span className="section-icon">🗺️</span>
                <h2>13 Proyectos QGIS</h2>
              </div>
              <div className="arch-projects-grid">
                {PROYECTOS.map(p => (
                  <div key={p.id} className="arch-project-card">
                    <span className="arch-project-id">{p.id}</span>
                    <span className="arch-project-name">{p.nombre}</span>
                    <span className="arch-project-file">{p.file}</span>
                    <span className="arch-project-capas">{p.capas} capas</span>
                  </div>
                ))}
              </div>

              <div className="section-header mt-4">
                <span className="section-icon">⚠️</span>
                <h2>Limitaciones conocidas — QGIS Server WFS 1.1.0</h2>
              </div>
              <div className="arch-limitations">
                {[
                  {
                    type: 'warning',
                    title: 'CQL_FILTER con DWITHIN/INTERSECTS — ignorado silenciosamente',
                    body:  'QGIS Server acepta el parámetro pero devuelve todos los features de la capa sin filtrar cuando el SRS nativo difiere de EPSG:4326. El predicado espacial no se evalúa. Solución adoptada: BBOX en servidor + filtro exacto en cliente con Leaflet distanceTo() y ray-casting.',
                  },
                  {
                    type: 'info',
                    title: 'PROPERTYNAME elimina el contexto de geometría',
                    body:  'Enviar PROPERTYNAME=id junto con un filtro espacial hace que QGIS no pueda acceder a la geometría para evaluarlo. La optimización con PROPERTYNAME solo se aplica cuando no hay filtro espacial activo.',
                  },
                  {
                    type: 'info',
                    title: 'Campo de geometría heterogéneo entre capas',
                    body:  'Distintas capas usan geometry, the_geom, geom, SHAPE. getGeometryFieldName() consulta DescribeFeatureType por capa y cachea el resultado en memoria para la sesión.',
                  },
                  {
                    type: 'info',
                    title: 'Sin totalFeatures en respuesta GeoJSON',
                    body:  'QGIS Server WFS 1.1.0 no incluye el campo estándar totalFeatures. El conteo se realiza sobre el array features[] devuelto tras aplicar el filtro cliente.',
                  },
                ].map((lim, i) => (
                  <div key={i} className={`arch-limitation arch-limitation--${lim.type}`}>
                    <strong>{lim.title}</strong>
                    <p>{lim.body}</p>
                  </div>
                ))}
              </div>

              <div className="section-header mt-4">
                <span className="section-icon">🔗</span>
                <h2>Estructura de URL de consulta</h2>
              </div>
              <div className="arch-url-card">
                <code>
                  http://192.168.100.184/qgis/qgis_mapserv.fcgi.exe<br />
                  ?MAP=C:/mis_proyectos/01_Geologicos.qgz<br />
                  &amp;SERVICE=WFS&amp;VERSION=1.1.0&amp;REQUEST=GetFeature<br />
                  &amp;TYPENAME={'{wfsName}'}&amp;outputFormat=application/vnd.geo+json<br />
                  &amp;srsName=EPSG:4326<br />
                  &amp;CQL_FILTER=BBOX(geometry,minLng,minLat,maxLng,maxLat)
                </code>
                <div className="arch-url-params">
                  <div className="arch-url-param">
                    <strong>MAP=</strong>
                    <span>Ruta al .qgz — uno por grupo, determinada dinámicamente desde la BD.</span>
                  </div>
                  <div className="arch-url-param">
                    <strong>srsName=EPSG:4326</strong>
                    <span>Obligatorio. Sin él QGIS interpreta coordenadas en el SRS nativo de la capa.</span>
                  </div>
                  <div className="arch-url-param">
                    <strong>BBOX(geomField,...)</strong>
                    <span>Único filtro espacial confiable en WFS 1.1.0. El filtro exacto se aplica en JavaScript.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── BACKEND ── */}
          {tab === 'backend' && (
            <div className="arch-tab-content">
              <div className="section-header">
                <span className="section-icon">⚙️</span>
                <h2>API REST — FastAPI 0.115</h2>
              </div>
              {([
                ['Autenticación',    '/api/v1/auth',    ENDPOINTS.auth],
                ['Gestión de capas', '/api/v1/gestion', ENDPOINTS.gestion],
                ['Administración',   '/api/v1/admin',   ENDPOINTS.admin],
              ] as [string, string, typeof ENDPOINTS.auth][]).map(([title, prefix, eps]) => (
                <div key={prefix} className="arch-endpoint-group">
                  <div className="arch-endpoint-group-header">
                    <strong>{title}</strong>
                    <code>{prefix}</code>
                  </div>
                  {eps.map((ep, i) => (
                    <div key={i} className="arch-endpoint">
                      <span className={`arch-method arch-method--${ep.method.toLowerCase()}`}>{ep.method}</span>
                      <code className="arch-path">{ep.path}</code>
                      <span className="arch-desc">{ep.desc}</span>
                    </div>
                  ))}
                </div>
              ))}

              <div className="section-header mt-4">
                <span className="section-icon">🗄️</span>
                <h2>Modelo de datos — PostgreSQL</h2>
              </div>
              <div className="features-grid">
                {[
                  ['📋 grupos_proyectos',  'Campos: id · nombre (único) · url_proyecto · activo. Vista pública: proyectos_activos — solo activo=true. Soft delete en lugar de DELETE.'],
                  ['🗺️ capas_geograficas', 'Campos: id · nombre · descripcion · tipo · wfs_name · wms_layer · grupo_id · activo. Vista: gestion_proyectos.capas (JOIN con grupo).'],
                  ['🔐 usuarios + admin',  'JWT HS256 · bcrypt · blacklist por JTI. Access 60 min · refresh 7 días. Rol admin único — tabla Administrador 1:1 con Usuario.'],
                  ['⚡ Conexiones async',  'SQLAlchemy 2 AsyncSession + psycopg3. pool_pre_ping=True · pool_recycle=1800 s. Patrón flush → commit → retorno sin refresh.'],
                ].map(([title, desc]) => (
                  <div key={title} className="feature-item">
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── FRONTEND ── */}
          {tab === 'frontend' && (
            <div className="arch-tab-content">
              <div className="section-header">
                <span className="section-icon">📦</span>
                <h2>Estructura del Frontend</h2>
              </div>
              <div className="row g-4">
                {[
                  { icon: '🗂️', title: 'Services', items: [
                    ['dynamicWfsService.ts', 'getFeatures() · getFeatureCount() · getGeometryFieldName() · getCapabilities()'],
                    ['rasterService.ts',     'Gestión de capas ráster WMS'],
                    ['printService.ts',      'Exportación de mapas a PDF'],
                  ]},
                  { icon: '🧩', title: 'Components / Map', items: [
                    ['AnalysisTool.tsx',   'Análisis espacial — dibujo · conteo · detalles · estadísticas'],
                    ['LayerMenu.tsx',      'Panel de capas con toggle, opacidad y búsqueda'],
                    ['AttributeTable.tsx', 'Tabla de atributos WFS con paginación y filtrado'],
                    ['PrintDesigner.tsx',  'Diseñador de mapa para exportar a PDF'],
                  ]},
                  { icon: '⚡', title: 'Hooks', items: [
                    ['useWFSLayers.ts',    'Estado y peticiones de capas vectoriales'],
                    ['useRasterLayers.ts', 'Estado y peticiones de capas ráster'],
                  ]},
                  { icon: '🛠️', title: 'Utils', items: [
                    ['symbologyUtils.ts', 'Estilos dinámicos por tipo de geometría'],
                    ['legendData.ts',     'Leyendas desde WMS GetLegendGraphic'],
                    ['fileToGeoJSON.ts',  'Conversión de archivos (SHP, KML, GPX)'],
                  ]},
                ].map(mod => (
                  <div key={mod.title} className="col-12 col-md-6">
                    <div className="module-card">
                      <span className="module-icon">{mod.icon}</span>
                      <h3>{mod.title}</h3>
                      {mod.items.map(([name, desc]) => (
                        <p key={name}><strong>{name}</strong><br />{desc}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="section-header mt-4">
                <span className="section-icon">⚙️</span>
                <h2>Características técnicas</h2>
              </div>
              <div className="features-grid">
                {[
                  ['🎨 Simbología dinámica',   'Estilos configurados en QGIS Desktop, publicados automáticamente vía WMS GetLegendGraphic.'],
                  ['📊 Análisis espacial',      'BBOX servidor + filtro exacto cliente. Tres modos: punto/buffer, línea/buffer, polígono.'],
                  ['↔️ Comparación de capas',  'SwipeControl para comparar dos capas simultáneamente con barra deslizable.'],
                  ['📈 Perfil de elevación',    'Dibuja una línea en el mapa y obtiene el perfil altimétrico desde datos DEM ráster.'],
                  ['🖨️ Exportación a PDF',      'PrintDesigner con escala, leyenda, norte y título personalizado.'],
                  ['🔍 Tabla de atributos',     'Paginación, ordenamiento y filtrado por columna sobre WFS features.'],
                ].map(([title, desc]) => (
                  <div key={title} className="feature-item">
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ANÁLISIS ESPACIAL ── */}
          {tab === 'spatial' && (
            <div className="arch-tab-content">
              <div className="section-header">
                <span className="section-icon">🔍</span>
                <h2>Estrategia de filtrado espacial</h2>
              </div>
              <div className="architecture-layers">
                <div className="arch-layer">
                  <div className="layer-number" style={{ fontSize: '1.2rem' }}>📍</div>
                  <div className="layer-content">
                    <h3>Modo Punto + radio</h3>
                    <p className="layer-tech">BBOX centrado en el punto con el radio como padding → L.latLng.distanceTo(center) en cliente</p>
                    <ul>
                      <li>BBOX padding: distancia convertida a grados según latitud del centro</li>
                      <li>Filtro exacto: featurePoint.distanceTo(center) ≤ distMetros</li>
                      <li>Leaflet distanceTo() usa Haversine — preciso a escala CDMX</li>
                    </ul>
                  </div>
                </div>
                <div className="arch-layer">
                  <div className="layer-number" style={{ fontSize: '1.2rem' }}>〰️</div>
                  <div className="layer-content">
                    <h3>Modo Línea + buffer</h3>
                    <p className="layer-tech">BBOX de todos los vértices + padding del radio → distancia punto-segmento en cliente</p>
                    <ul>
                      <li>BBOX envuelve todos los puntos de la línea más el padding del buffer</li>
                      <li>Filtro exacto: distancia mínima de cada feature a cualquier segmento de la polilínea</li>
                      <li>Proyección plana local — error ±0.1% a escala de la CDMX</li>
                    </ul>
                  </div>
                </div>
                <div className="arch-layer">
                  <div className="layer-number" style={{ fontSize: '1.2rem' }}>⬡</div>
                  <div className="layer-content">
                    <h3>Modo Polígono</h3>
                    <p className="layer-tech">BBOX del polígono dibujado → ray-casting point-in-polygon en cliente</p>
                    <ul>
                      <li>BBOX usa min/max de lat y lng de todos los vértices del polígono</li>
                      <li>Filtro exacto: algoritmo ray-casting estándar en coordenadas geográficas</li>
                      <li>Extrae primera coordenada representativa de cualquier geometría (Point, Line, Polygon, Multi*)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="section-header mt-4">
                <span className="section-icon">❌</span>
                <h2>Por qué no funciona CQL DWITHIN en QGIS WFS 1.1.0</h2>
              </div>
              <div className="migration-comparison">
                <div className="comparison-item">
                  <h4>❌ CQL DWITHIN / INTERSECTS</h4>
                  <ul>
                    <li>QGIS acepta el parámetro sin devolver error</li>
                    <li>Retorna todos los features sin filtrar</li>
                    <li>El campo distance en el JSON muestra 20–83 km</li>
                    <li>Falla silenciosamente cuando SRS nativo ≠ EPSG:4326</li>
                  </ul>
                </div>
                <div className="comparison-item highlight">
                  <h4>✓ BBOX servidor + filtro cliente</h4>
                  <ul>
                    <li>BBOX sí evaluado correctamente por QGIS WFS 1.1.0</li>
                    <li>Reduce features a un área aproximada manejable</li>
                    <li>Filtro exacto en JS con distanceTo() y ray-casting</li>
                    <li>Log de debug: BBOX=N features | exactos=M features</li>
                  </ul>
                </div>
              </div>

              <div className="section-header mt-4">
                <span className="section-icon">🐞</span>
                <h2>Debug en consola del navegador</h2>
              </div>
              <div className="arch-url-card">
                <code>
                  [AnalysisTool] Volcanes_activos | geomField=geometry | BBOX CQL=BBOX(geometry,-99.34,19.23,-99.13,19.43)<br />
                  [AnalysisTool] Volcanes_activos | BBOX=29 | exactos=1
                </code>
                <div className="arch-url-params">
                  <div className="arch-url-param">
                    <strong>BBOX=N</strong>
                    <span>Features que devuelve QGIS Server con el filtro de caja delimitadora.</span>
                  </div>
                  <div className="arch-url-param">
                    <strong>exactos=M</strong>
                    <span>Features que superan el filtro geométrico exacto en cliente. Si N siempre es igual al total de la capa, el BBOX tampoco se evalúa en servidor.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ESCALABILIDAD ── */}
          {tab === 'escalabilidad' && (
            <div className="arch-tab-content">
              <div className="section-header">
                <span className="section-icon">📈</span>
                <h2>Estado actual y limitaciones</h2>
              </div>
              <div className="features-grid">
                {[
                  ['⚠️ Servidor único Windows',   'Un solo servidor LAN — punto de fallo único (SPOF). Sin balanceo de carga ni alta disponibilidad. Adecuado para uso académico y desarrollo.'],
                  ['⚠️ Payload de features',       'Con capas densas (DENUE 2025, miles de puntos), el BBOX trae todos los features al cliente. Sin límite de maxFeatures en análisis espacial.'],
                  ['⚠️ Sin caché de respuestas',   'Cada análisis espacial hace N peticiones HTTP simultáneas (una por capa activa). Sin Redis ni caché HTTP entre sesiones.'],
                  ['⚠️ Rutas locales de Windows',  'Proyectos .qgz en ruta local C:/mis_proyectos/. No portables entre entornos ni versionados en git junto al código fuente.'],
                ].map(([title, desc]) => (
                  <div key={title} className="feature-item">
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                ))}
              </div>

              <div className="section-header mt-4">
                <span className="section-icon">✅</span>
                <h2>Mejoras implementadas</h2>
              </div>
              <div className="benefits-list">
                {[
                  ['01', 'BBOX + filtro cliente exacto',  'Solución robusta a las limitaciones de CQL en QGIS WFS 1.1.0. Elimina falsos positivos con distanceTo() y ray-casting sin dependencias adicionales.'],
                  ['02', 'Caché de campo de geometría',   'getGeometryFieldName() consulta DescribeFeatureType una sola vez por capa por sesión. Caché en Map<string, string> en el servicio.'],
                  ['03', 'Soft delete en BD',             'Capas y grupos se desactivan con activo=false — datos históricos preservados, reversible. Cascade al eliminar un grupo.'],
                  ['04', 'AsyncSession PostgreSQL',       'Backend completamente async — no bloquea el event loop con I/O de BD. pool_pre_ping y pool_recycle para conexiones robustas.'],
                  ['05', 'PROPERTYNAME condicional',      'Se omite cuando hay filtro espacial activo — evita que QGIS pierda el contexto de geometría necesario para evaluar BBOX.'],
                  ['06', 'srsName en todas las peticiones', 'srsName=EPSG:4326 incluido en getFeatureCount y getFeatures — evita que QGIS interprete coordenadas en SRS nativo de cada capa.'],
                ].map(([num, title, desc]) => (
                  <div key={num} className="benefit-item">
                    <span className="benefit-number">{num}</span>
                    <div className="benefit-content">
                      <h4>{title}</h4>
                      <p>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="section-header mt-4">
                <span className="section-icon">🚀</span>
                <h2>Roadmap técnico sugerido</h2>
              </div>
              <div className="tech-stack">
                {[
                  { cat: 'Migrar a PostGIS',    items: ['ST_DWithin / ST_Intersects nativos', 'Filtrado exacto en servidor', 'Sin limitaciones de QGIS WFS', 'Elimina la lógica cliente'] },
                  { cat: 'Caché Redis WFS',      items: ['TTL corto (~5 min)', 'Reduce carga en QGIS Server', 'Respuestas BBOX frecuentes', 'Mejora tiempo de análisis'] },
                  { cat: 'maxFeatures + paginación', items: ['Para capas con >5,000 features', 'DENUE 2025, inmuebles', 'Límite configurable por capa', 'Indicador de resultado parcial'] },
                  { cat: 'Containerización',     items: ['Docker + docker-compose', 'QGIS Server en Linux', 'Rutas relativas en proyectos', 'CI/CD reproducible'] },
                ].map(({ cat, items }) => (
                  <div key={cat} className="tech-category">
                    <h3>{cat}</h3>
                    <div className="tech-list">
                      {items.map(item => <span key={item} className="tech-item">{item}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="container-max py-5">
          <div className="text-center">
            <h2 className="text-white mb-4">Explora el geovisor en acción</h2>
            <div className="cta-buttons">
              <button className="btn btn-light btn-lg me-3" onClick={() => navigate('/geovisor')}>
                Acceder al Geovisor
              </button>
              <button className="btn btn-outline-light btn-lg" onClick={() => navigate('/')}>
                Volver a Inicio
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Arquitectura;
