import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/principal.css';

const Principal: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="principal-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Desarrollo de un Geovisor Web con React-Leaflet, GeoServer y PostgreSQL/PostGIS</h1>
          <p className="hero-subtitle">
            Herramienta interactiva para el análisis y monitoreo de la República Mexicana
          </p>
          <button 
            className="btn btn-primary btn-lg mt-4"
            onClick={() => navigate('/geovisor')}
          >
            Acceder al Geovisor
          </button>
        </div>
      </section>

      {/* Contexto del Problema */}
      <section className="content-section bg-light">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">📌</span>
                <h2>Contexto del Problema</h2>
              </div>
              <p className="section-text">
                En zonas urbanas de rápido crecimiento,
                los cambios en el uso del suelo (por ejemplo, áreas agrícolas transformadas en zonas 
                residenciales o industriales) ocurren a un ritmo acelerado y muchas veces sin una 
                planificación adecuada.
              </p>
              <p className="section-text">
                La falta de <strong>herramientas geoespaciales modernas</strong> limita la capacidad 
                de las autoridades locales para monitorear, evaluar y responder a estos cambios de 
                forma oportuna.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Necesidad del Geovisor */}
      <section className="content-section">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">🧩</span>
                <h2>Necesidad del Geovisor</h2>
              </div>
              <p className="intro-text mb-4">
                Se requiere una plataforma web interactiva que permita:
              </p>
              <div className="row g-4">
                <div className="col-12 ">
                  <div className="feature-card">
                    <div className="feature-icon">🗺️</div>
                    <h3>Visualización Histórica</h3>
                    <p>Capas históricas de uso de suelo por año o periodo</p>
                  </div>
                </div>
                <div className="col-12 ">
                  <div className="feature-card">
                    <div className="feature-icon">🔄</div>
                    <h3>Análisis Comparativo</h3>
                    <p>Comparación de cambios entre diferentes años o fuentes catastrales</p>
                  </div>
                </div>
                <div className="col-12 ">
                  <div className="feature-card">
                    <div className="feature-icon">⚠️</div>
                    <h3>Identificación de Áreas Críticas</h3>
                    <p>Detección de cambios no autorizados o de alto impacto ambiental</p>
                  </div>
                </div>
                <div className="col-12 ">
                  <div className="feature-card">
                    <div className="feature-icon">🗄️</div>
                    <h3>Integración de Datos</h3>
                    <p>Atributos descriptivos desde PostgreSQL/PostGIS</p>
                  </div>
                </div>
                <div className="col-12 ">
                  <div className="feature-card">
                    <div className="feature-icon">🌐</div>
                    <h3>Servicios Estándar</h3>
                    <p>Publicación de datos mediante GeoServer (WMS/WFS)</p>
                  </div>
                </div>
                <div className="col-12 ">
                  <div className="feature-card">
                    <div className="feature-icon">💻</div>
                    <h3>Interfaz Intuitiva</h3>
                    <p>Navegación, filtrado y consulta con React-Leaflet</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Justificación Técnica */}
      <section className="content-section bg-light">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">⚙️</span>
                <h2>Justificación Técnica</h2>
              </div>
              <p className="intro-text mb-4">
                El desarrollo del geovisor permitirá:
              </p>
              <div className="benefits-list">
                <div className="benefit-item">
                  <span className="benefit-number">01</span>
                  <div className="benefit-content">
                    <h4>Gestión Territorial Mejorada</h4>
                    <p>Análisis espacial dinámico para el ordenamiento territorial</p>
                  </div>
                </div>
                <div className="benefit-item">
                  <span className="benefit-number">02</span>
                  <div className="benefit-content">
                    <h4>Apoyo a la Planificación</h4>
                    <p>Estudios de impacto ambiental y planificación urbana basados en datos</p>
                  </div>
                </div>
                <div className="benefit-item">
                  <span className="benefit-number">03</span>
                  <div className="benefit-content">
                    <h4>Democratización del Acceso</h4>
                    <p>Información espacial disponible para tomadores de decisiones y ciudadanos</p>
                  </div>
                </div>
                <div className="benefit-item">
                  <span className="benefit-number">04</span>
                  <div className="benefit-content">
                    <h4>Escalabilidad Futura</h4>
                    <p>Integración con modelos predictivos de expansión urbana</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stack Tecnológico */}
      <section className="content-section">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12  offset-md-1">
              <div className="section-header">
                <span className="section-icon">🛠️</span>
                <h2>Stack Tecnológico</h2>
              </div>
              <div className="row g-4 mt-3">
                <div className="col-6 ">
                  <div className="tech-badge">
                    <strong>PostgreSQL</strong>
                    <span>Base de Datos</span>
                  </div>
                </div>
                <div className="col-6 ">
                  <div className="tech-badge">
                    <strong>PostGIS</strong>
                    <span>Extensión Espacial</span>
                  </div>
                </div>
                <div className="col-6 ">
                  <div className="tech-badge">
                    <strong>GeoServer</strong>
                    <span>Servidor de Mapas</span>
                  </div>
                </div>
                <div className="col-6 ">
                  <div className="tech-badge">
                    <strong>React</strong>
                    <span>Framework Frontend</span>
                  </div>
                </div>
                <div className="col-6 ">
                  <div className="tech-badge">
                    <strong>Leaflet</strong>
                    <span>Biblioteca de Mapas</span>
                  </div>
                </div>
                <div className="col-6 ">
                  <div className="tech-badge">
                    <strong>WMS/WFS</strong>
                    <span>Estándares OGC</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Arquitectura del Sistema */}
      <section className="content-section bg-light">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">🏗️</span>
                <h2>Arquitectura del Sistema</h2>
              </div>
              <p className="intro-text mb-4">
                El proyecto ha evolucionado hacia una arquitectura moderna de tres capas utilizando QGIS Server, 
                React/TypeScript y PostgreSQL/PostGIS. Conoce los detalles técnicos de implementación.
              </p>
              <div className="text-center">
                <button 
                  className="btn btn-primary btn-lg"
                  onClick={() => navigate('/arquitectura')}
                >
                  Ver Arquitectura Detallada
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Índice de la Tesis */}
      <section className="content-section thesis-index-section">
        <div className="container-max py-5">
          <div className="row">
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">📖</span>
                <h2>Índice de la Tesis</h2>
              </div>
              <div className="index-container">
                <div className="index-item">
                  <h3>1. Introducción</h3>
                  <ul>
                    <li>Planteamiento del problema</li>
                    <li>Objetivos generales y específicos</li>
                    <li>Justificación técnica</li>
                    <li>Alcances y limitaciones del sistema</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>2. Fundamentos Teóricos</h3>
                  <ul>
                    <li>Fundamentos de la geomática aplicada</li>
                    <li>Arquitectura cliente-servidor en SIG web</li>
                    <li>Bases de datos espaciales (PostgreSQL + PostGIS)</li>
                    <li>Publicación de datos geoespaciales con GeoServer</li>
                    <li>Visualización cartográfica con React y Leaflet</li>
                    <li>Protocolos OGC (WMS, WFS, etc.)</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>3. Estado del Arte</h3>
                  <ul>
                    <li>Revisión de geovisores similares en el sector público/privado</li>
                    <li>Tecnologías usadas en SIG web contemporáneo</li>
                    <li>Tendencias en la visualización geoespacial en web</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>4. Diseño y Arquitectura del Sistema</h3>
                  <ul>
                    <li>Estructura del sistema: Frontend, Backend, y BD espacial</li>
                    <li>Diagrama de arquitectura tecnológica</li>
                    <li>Requerimientos funcionales y no funcionales</li>
                    <li>Seguridad, rendimiento y escalabilidad</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>5. Implementación del Geovisor</h3>
                  <ul>
                    <li>Configuración de PostgreSQL con PostGIS</li>
                    <li>Administración y publicación de capas geográficas en GeoServer</li>
                    <li>Desarrollo de la interfaz con React y Leaflet</li>
                    <li>Consumo de servicios WMS/WFS desde el frontend</li>
                    <li>Implementación de herramientas (Zoom, filtros, búsqueda, leyenda dinámica)</li>
                    <li>Integración con APIs externas si aplica</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>6. Validación y Pruebas</h3>
                  <ul>
                    <li>Pruebas de rendimiento (tiempo de carga, responsividad)</li>
                    <li>Pruebas de usabilidad y experiencia de usuario</li>
                    <li>Validación de precisión espacial de los datos mostrados</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>7. Resultados y Análisis</h3>
                  <ul>
                    <li>Evaluación técnica del sistema desarrollado</li>
                    <li>Comparación con soluciones existentes</li>
                    <li>Fortalezas y limitaciones del proyecto</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>8. Conclusiones y Recomendaciones</h3>
                  <ul>
                    <li>Aportes a la ingeniería geomática y desarrollo SIG web</li>
                    <li>Recomendaciones para escalabilidad, mejoras y futuras implementaciones</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>9. Bibliografía</h3>
                  <ul>
                    <li>Manuales técnicos, artículos científicos, normativas OGC, documentación oficial</li>
                  </ul>
                </div>
                <div className="index-item">
                  <h3>10. Anexos</h3>
                  <ul>
                    <li>Código fuente comentado</li>
                    <li>Diagramas técnicos (UML, arquitectura, flujo de datos)</li>
                    <li>Capturas de interfaz final</li>
                    <li>Manual de instalación y usuario</li>
                  </ul>
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
            <h2 className="text-white mb-4">¿Listo para explorar los datos?</h2>
            <button 
              className="btn btn-light btn-lg"
              onClick={() => navigate('/geovisor')}
            >
              Iniciar Exploración
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Principal;
