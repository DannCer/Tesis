import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/principal.css';

function Principal() {
  const navigate = useNavigate();

  return (
    <div className="principal-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Geovisor de Monitoreo del Cambio en el Uso de Suelo Urbano</h1>
          <p className="hero-subtitle">
            Herramienta interactiva para el análisis y planificación territorial 
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
                <div className="col-12 col-md-6">
                  <div className="feature-card">
                    <div className="feature-icon">🗺️</div>
                    <h3>Visualización Histórica</h3>
                    <p>Capas históricas de uso de suelo por año o periodo</p>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="feature-card">
                    <div className="feature-icon">🔄</div>
                    <h3>Análisis Comparativo</h3>
                    <p>Comparación de cambios entre diferentes años o fuentes catastrales</p>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="feature-card">
                    <div className="feature-icon">⚠️</div>
                    <h3>Identificación de Áreas Críticas</h3>
                    <p>Detección de cambios no autorizados o de alto impacto ambiental</p>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="feature-card">
                    <div className="feature-icon">🗄️</div>
                    <h3>Integración de Datos</h3>
                    <p>Atributos descriptivos desde PostgreSQL/PostGIS</p>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="feature-card">
                    <div className="feature-icon">🌐</div>
                    <h3>Servicios Estándar</h3>
                    <p>Publicación de datos mediante GeoServer (WMS/WFS)</p>
                  </div>
                </div>
                <div className="col-12 col-md-6">
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
            <div className="col-12 col-md-10 offset-md-1">
              <div className="section-header">
                <span className="section-icon">🛠️</span>
                <h2>Stack Tecnológico</h2>
              </div>
              <div className="row g-4 mt-3">
                <div className="col-6 col-md-3">
                  <div className="tech-badge">
                    <strong>PostgreSQL</strong>
                    <span>Base de Datos</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="tech-badge">
                    <strong>PostGIS</strong>
                    <span>Extensión Espacial</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="tech-badge">
                    <strong>GeoServer</strong>
                    <span>Servidor de Mapas</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="tech-badge">
                    <strong>React</strong>
                    <span>Framework Frontend</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="tech-badge">
                    <strong>Leaflet</strong>
                    <span>Biblioteca de Mapas</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
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
}

export default Principal;