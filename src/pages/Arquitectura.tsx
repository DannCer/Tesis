import React from 'react';
import { useNavigate } from 'react-router-dom';
import '@styles/arquitectura.css';

const Arquitectura: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="arquitectura-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Arquitectura del Sistema</h1>
          <p className="hero-subtitle">
            Diseño modular y escalable del geovisor web con QGIS Server, React y PostgreSQL/PostGIS
          </p>
          <button 
            className="btn btn-secondary btn-lg mt-4"
            onClick={() => navigate('/')}
          >
            Volver a Inicio
          </button>
        </div>
      </section>

      {/* Cambio de GeoServer a QGIS Server */}
      <section className="content-section bg-light">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">🔄</span>
                <h2>Evolución de la Arquitectura</h2>
              </div>
              <p className="section-text">
                El proyecto originalmente se diseñó con <strong>GeoServer</strong> como servidor de mapas. 
                Sin embargo, durante el desarrollo se migró a <strong>QGIS Server</strong> para aprovechar 
                su integración nativa con proyectos QGIS Desktop (.qgz) y su configuración simplificada.
              </p>
              <div className="migration-comparison">
                <div className="comparison-item">
                  <h4>GeoServer (Inicial)</h4>
                  <ul>
                    <li>Requiere workspaces y configuración manual de capas</li>
                    <li>Administración vía interfaz web compleja</li>
                    <li>Mayor curva de aprendizaje</li>
                  </ul>
                </div>
                <div className="comparison-item highlight">
                  <h4>QGIS Server (Actual)</h4>
                  <ul>
                    <li>Usa directamente proyectos .qgz de QGIS Desktop</li>
                    <li>Configuración visual y sencilla</li>
                    <li>Sincronización automática de estilos y simbología</li>
                    <li>Menor tiempo de configuración y mantenimiento</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Diagrama de Arquitectura */}
      <section className="content-section">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">🏗️</span>
                <h2>Arquitectura de Tres Capas</h2>
              </div>
              <p className="intro-text mb-4">
                El sistema sigue un patrón arquitectónico cliente-servidor de tres capas:
              </p>
              <div className="architecture-layers">
                <div className="arch-layer">
                  <div className="layer-number">1</div>
                  <div className="layer-content">
                    <h3>Capa de Presentación (Frontend)</h3>
                    <p className="layer-tech">React + TypeScript + Leaflet</p>
                    <ul>
                      <li>Interfaz de usuario interactiva y responsive</li>
                      <li>Componentes reutilizables para mapas y controles</li>
                      <li>Gestión de estado con React Hooks</li>
                      <li>Visualización de capas vectoriales y ráster</li>
                    </ul>
                  </div>
                </div>
                <div className="arch-layer">
                  <div className="layer-number">2</div>
                  <div className="layer-content">
                    <h3>Capa de Servicios (Middleware)</h3>
                    <p className="layer-tech">QGIS Server + Protocolos OGC</p>
                    <ul>
                      <li>Publicación de servicios WMS para capas ráster</li>
                      <li>Publicación de servicios WFS para capas vectoriales</li>
                      <li>Renderizado dinámico de mapas</li>
                      <li>Consultas espaciales y filtros CQL</li>
                    </ul>
                  </div>
                </div>
                <div className="arch-layer">
                  <div className="layer-number">3</div>
                  <div className="layer-content">
                    <h3>Capa de Datos (Backend)</h3>
                    <p className="layer-tech">PostgreSQL + PostGIS</p>
                    <ul>
                      <li>Almacenamiento de geometrías y atributos</li>
                      <li>Índices espaciales para consultas rápidas</li>
                      <li>Operaciones geoespaciales avanzadas</li>
                      <li>Soporte para múltiples sistemas de coordenadas</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Estructura del Frontend */}
      <section className="content-section bg-light">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">📦</span>
                <h2>Estructura del Frontend</h2>
              </div>
              <p className="intro-text mb-4">
                El código frontend está organizado en módulos especializados:
              </p>
              <div className="row g-4">
                <div className="col-12 col-md-6">
                  <div className="module-card">
                    <div className="module-icon">🧩</div>
                    <h3>Components</h3>
                    <p><strong>Layout:</strong> Estructuras de página (Header, LayoutPrincipal, LayoutGeovisor)</p>
                    <p><strong>Map:</strong> Componentes de mapa (MapView, LayerMenu, Legend, AttributeTable, TimeController, PrintDesigner)</p>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="module-card">
                    <div className="module-icon">⚡</div>
                    <h3>Hooks</h3>
                    <p><strong>useWFSLayers:</strong> Gestión de capas vectoriales WFS</p>
                    <p><strong>useRasterLayers:</strong> Gestión de capas ráster WMS</p>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="module-card">
                    <div className="module-icon">🔧</div>
                    <h3>Services</h3>
                    <p><strong>wfsService:</strong> Peticiones WFS a QGIS Server</p>
                    <p><strong>rasterService:</strong> Gestión de capas ráster</p>
                    <p><strong>printService:</strong> Exportación de mapas a PDF</p>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="module-card">
                    <div className="module-icon">🛠️</div>
                    <h3>Utils</h3>
                    <p><strong>symbologyUtils:</strong> Generación de estilos dinámicos</p>
                    <p><strong>legendData:</strong> Construcción de leyendas</p>
                    <p><strong>fileToGeoJSON:</strong> Conversión de archivos geográficos</p>
                    <p><strong>validation:</strong> Validación de datos</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Flujo de Datos */}
      <section className="content-section">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">🔀</span>
                <h2>Flujo de Datos</h2>
              </div>
              <p className="intro-text mb-4">
                Interacción entre los componentes del sistema:
              </p>
              <div className="data-flow">
                <div className="flow-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Usuario solicita visualización</h4>
                    <p>El usuario interactúa con la interfaz React (selección de capas, filtros, zoom)</p>
                  </div>
                </div>
                <div className="flow-arrow">↓</div>
                <div className="flow-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Servicios frontend realizan peticiones</h4>
                    <p>wfsService o rasterService construyen URLs con parámetros OGC</p>
                  </div>
                </div>
                <div className="flow-arrow">↓</div>
                <div className="flow-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>QGIS Server procesa la solicitud</h4>
                    <p>Lee el proyecto .qgz, aplica estilos y consulta PostgreSQL/PostGIS</p>
                  </div>
                </div>
                <div className="flow-arrow">↓</div>
                <div className="flow-step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h4>PostgreSQL/PostGIS ejecuta consultas</h4>
                    <p>Devuelve geometrías y atributos según los filtros espaciales</p>
                  </div>
                </div>
                <div className="flow-arrow">↓</div>
                <div className="flow-step">
                  <div className="step-number">5</div>
                  <div className="step-content">
                    <h4>Renderizado en el navegador</h4>
                    <p>Leaflet dibuja las capas WMS/WFS en el mapa interactivo</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Características Técnicas */}
      <section className="content-section bg-light">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">⚙️</span>
                <h2>Características Técnicas</h2>
              </div>
              <div className="features-grid">
                <div className="feature-item">
                  <h4>🎨 Simbología Dinámica</h4>
                  <p>Los estilos de las capas se configuran en QGIS Desktop y se renderizan automáticamente en el geovisor</p>
                </div>
                <div className="feature-item">
                  <h4>⏱️ Control Temporal</h4>
                  <p>TimeController permite visualizar cambios históricos mediante capas temporales</p>
                </div>
                <div className="feature-item">
                  <h4>🔍 Consultas Avanzadas</h4>
                  <p>Filtros CQL para consultas complejas y AttributeTable para exploración de datos</p>
                </div>
                <div className="feature-item">
                  <h4>↔️ Comparación de Capas</h4>
                  <p>SwipeControl para comparar visualmente dos capas simultáneamente</p>
                </div>
                <div className="feature-item">
                  <h4>🖨️ Exportación</h4>
                  <p>PrintDesigner para generar mapas en PDF con leyenda y escala</p>
                </div>
                <div className="feature-item">
                  <h4>📊 Información de Píxeles</h4>
                  <p>PixelInfoPanel para consultar valores de capas ráster</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ventajas de la Arquitectura */}
      <section className="content-section">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">✨</span>
                <h2>Ventajas de la Arquitectura</h2>
              </div>
              <div className="benefits-list">
                <div className="benefit-item">
                  <span className="benefit-number">01</span>
                  <div className="benefit-content">
                    <h4>Modularidad</h4>
                    <p>Separación clara entre presentación, servicios y datos facilita el mantenimiento</p>
                  </div>
                </div>
                <div className="benefit-item">
                  <span className="benefit-number">02</span>
                  <div className="benefit-content">
                    <h4>Escalabilidad</h4>
                    <p>Cada capa puede escalar independientemente según las necesidades</p>
                  </div>
                </div>
                <div className="benefit-item">
                  <span className="benefit-number">03</span>
                  <div className="benefit-content">
                    <h4>Interoperabilidad</h4>
                    <p>Uso de estándares OGC permite integración con otras herramientas GIS</p>
                  </div>
                </div>
                <div className="benefit-item">
                  <span className="benefit-number">04</span>
                  <div className="benefit-content">
                    <h4>Flujo de Trabajo Eficiente</h4>
                    <p>Diseñar en QGIS Desktop y publicar automáticamente en QGIS Server acelera el desarrollo</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stack Tecnológico Detallado */}
      <section className="content-section bg-light">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">🛠️</span>
                <h2>Stack Tecnológico Detallado</h2>
              </div>
              <div className="tech-stack">
                <div className="tech-category">
                  <h3>Frontend</h3>
                  <div className="tech-list">
                    <span className="tech-item">React 18</span>
                    <span className="tech-item">TypeScript</span>
                    <span className="tech-item">Leaflet</span>
                    <span className="tech-item">React Router</span>
                    <span className="tech-item">Bootstrap 5</span>
                    <span className="tech-item">Vite</span>
                  </div>
                </div>
                <div className="tech-category">
                  <h3>Backend/Middleware</h3>
                  <div className="tech-list">
                    <span className="tech-item">QGIS Server</span>
                    <span className="tech-item">Apache/Nginx</span>
                    <span className="tech-item">FastCGI</span>
                  </div>
                </div>
                <div className="tech-category">
                  <h3>Base de Datos</h3>
                  <div className="tech-list">
                    <span className="tech-item">PostgreSQL 15+</span>
                    <span className="tech-item">PostGIS 3.3+</span>
                  </div>
                </div>
                <div className="tech-category">
                  <h3>Protocolos y Estándares</h3>
                  <div className="tech-list">
                    <span className="tech-item">WMS 1.3.0</span>
                    <span className="tech-item">WFS 1.1.0</span>
                    <span className="tech-item">GeoJSON</span>
                    <span className="tech-item">CQL Filters</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="cta-section">
        <div className="container-max py-5">
          <div className="text-center">
            <h2 className="text-white mb-4">Explora el geovisor en acción</h2>
            <div className="cta-buttons">
              <button 
                className="btn btn-light btn-lg me-3"
                onClick={() => navigate('/geovisor')}
              >
                Acceder al Geovisor
              </button>
              <button 
                className="btn btn-outline-light btn-lg"
                onClick={() => navigate('/')}
              >
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
