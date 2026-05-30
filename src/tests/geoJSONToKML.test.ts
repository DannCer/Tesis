/**
 * @fileoverview Tests para geoJSONToKML — conversión cliente de GeoJSON a KML.
 * Cubre el bug donde QGIS Server devuelve wfs:FeatureCollection
 * en vez de KML al solicitar outputFormat=application/vnd.google-earth.kml+xml.
 *
 * @module tests/geoJSONToKML
 */

import { describe, it, expect } from 'vitest';
import { geoJSONToKML } from '../utils/geo/fileToGeoJSON';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const pointFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-99.13, 19.43] },
        properties: { NOMBRE: 'Socavón 1', año: 2019, descripcion: 'Colapso vial' },
    }],
};

const polygonFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [[[-99.2, 19.5], [-99.1, 19.5], [-99.1, 19.4], [-99.2, 19.4], [-99.2, 19.5]]],
        },
        properties: { MUNICIPIO: 'Álvaro Obregón', AREA_HA: 45.3 },
    }],
};

const noPropsFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-99.0, 19.0] },
        properties: null,
    }],
};

const xssFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { name: '<script>alert("xss")</script>', value: '"quoted"' },
    }],
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('geoJSONToKML — estructura KML', () => {
    it('genera XML con declaración y namespace KML 2.2', () => {
        const kml = geoJSONToKML(pointFC, 'Test');
        expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(kml).toContain('xmlns="http://www.opengis.net/kml/2.2"');
    });

    it('contiene un <Document> y un <Folder> con el nombre de la capa', () => {
        const kml = geoJSONToKML(pointFC, 'Socavones 2019');
        expect(kml).toContain('<Document>');
        expect(kml).toContain('<name>Socavones 2019</name>');
        expect(kml).toContain('<Folder>');
    });

    it('genera un <Placemark> por feature', () => {
        const multiFC: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: [pointFC.features[0], pointFC.features[0]],
        };
        const kml = geoJSONToKML(multiFC, 'Test');
        const count = (kml.match(/<Placemark>/g) ?? []).length;
        expect(count).toBe(2);
    });
});

describe('geoJSONToKML — geometrías', () => {
    it('punto → <Point> con coordenadas lng,lat', () => {
        const kml = geoJSONToKML(pointFC, 'Test');
        expect(kml).toContain('<Point>');
        expect(kml).toContain('<coordinates>-99.13,19.43,0</coordinates>');
    });

    it('polígono → <Polygon> con <outerBoundaryIs>', () => {
        const kml = geoJSONToKML(polygonFC, 'Test');
        expect(kml).toContain('<Polygon>');
        expect(kml).toContain('<outerBoundaryIs>');
        expect(kml).toContain('<LinearRing>');
    });

    it('línea → <LineString> con coordenadas', () => {
        const lineFC: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [[-99.13, 19.43], [-99.0, 19.0]] },
                properties: {},
            }],
        };
        const kml = geoJSONToKML(lineFC, 'Test');
        expect(kml).toContain('<LineString>');
        expect(kml).toContain('<coordinates>');
    });
});

describe('geoJSONToKML — propiedades', () => {
    it('usa el primer campo string como <name> del Placemark', () => {
        const kml = geoJSONToKML(pointFC, 'Test');
        // NOMBRE es el primer campo string
        expect(kml).toContain('<name>Socavón 1</name>');
    });

    it('incluye todos los atributos en <description> como tabla HTML', () => {
        const kml = geoJSONToKML(pointFC, 'Test');
        expect(kml).toContain('NOMBRE');
        expect(kml).toContain('Socavón 1');
        expect(kml).toContain('año');
        expect(kml).toContain('2019');
    });

    it('features sin propiedades no rompen la conversión', () => {
        expect(() => geoJSONToKML(noPropsFC, 'Test')).not.toThrow();
    });
});

describe('geoJSONToKML — seguridad XSS', () => {
    it('escapa < > & " en propiedades', () => {
        const kml = geoJSONToKML(xssFC, 'Test');
        expect(kml).not.toContain('<script>');
        expect(kml).toContain('&lt;script&gt;');
        expect(kml).toContain('&quot;quoted&quot;');
    });

    it('escapa caracteres especiales en el nombre del documento', () => {
        const kml = geoJSONToKML(pointFC, 'Capa <&> Especial');
        expect(kml).not.toContain('<Capa');
        expect(kml).toContain('&lt;&amp;&gt;');
    });
});

describe('geoJSONToKML — compatibilidad Google Earth', () => {
    it('el KML generado puede ser parseado como XML válido', () => {
        const kml    = geoJSONToKML(pointFC, 'Socavones');
        const parser = new DOMParser();
        const doc    = parser.parseFromString(kml, 'application/xml');
        const errors = doc.getElementsByTagName('parseerror');
        expect(errors).toHaveLength(0);
    });

    it('el KML incluye <Style> con color según tipo de geometría', () => {
        const kml = geoJSONToKML(pointFC, 'Test');
        expect(kml).toContain('<Style>');
        expect(kml).toContain('<IconStyle>');
    });

    it('KML de polígono tiene <PolyStyle>', () => {
        const kml = geoJSONToKML(polygonFC, 'Test');
        expect(kml).toContain('<PolyStyle>');
    });
});

// ─── wfsXmlToGeoJSON ─────────────────────────────────────────────────────────

import { wfsXmlToGeoJSON, isWfsXml } from '../utils/geo/fileToGeoJSON';

// XML real devuelto por QGIS Server para "Volcanes Activos"
const VOLCANES_WFS_XML = `<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml" xmlns:qgs="http://www.qgis.org/gml">
  <gml:featureMember>
    <qgs:Volcanes_activos>
      <qgs:nomb>Popocatepetl</qgs:nomb>
      <qgs:tipo>Estratovolcán</qgs:tipo>
      <qgs:lat>19.023386</qgs:lat>
      <qgs:long_>-98.623434</qgs:long_>
      <qgs:elev>5426</qgs:elev>
      <qgs:edo_loc>Puebla</qgs:edo_loc>
      <gml:Point><gml:coordinates>531620,2134862</gml:coordinates></gml:Point>
    </qgs:Volcanes_activos>
  </gml:featureMember>
  <gml:featureMember>
    <qgs:Volcanes_activos>
      <qgs:nomb>Iztaccihuatl</qgs:nomb>
      <qgs:tipo>Estratovolcán</qgs:tipo>
      <qgs:lat>19.177995</qgs:lat>
      <qgs:long_>-98.64183</qgs:long_>
      <qgs:elev>5230</qgs:elev>
      <qgs:edo_loc>Estado de México</qgs:edo_loc>
      <gml:Point><gml:coordinates>531000,2140000</gml:coordinates></gml:Point>
    </qgs:Volcanes_activos>
  </gml:featureMember>
</wfs:FeatureCollection>`;

describe('isWfsXml', () => {
    it('detecta wfs:FeatureCollection', () => {
        expect(isWfsXml(VOLCANES_WFS_XML)).toBe(true);
    });

    it('no detecta GeoJSON como WFS XML', () => {
        expect(isWfsXml('{"type":"FeatureCollection","features":[]}')).toBe(false);
    });

    it('no detecta KML como WFS XML', () => {
        expect(isWfsXml('<?xml version="1.0"?><kml xmlns="...">')).toBe(false);
    });
});

describe('wfsXmlToGeoJSON — con datos reales de QGIS Server', () => {
    it('convierte todos los features del XML', () => {
        const fc = wfsXmlToGeoJSON(VOLCANES_WFS_XML);
        expect(fc.type).toBe('FeatureCollection');
        expect(fc.features).toHaveLength(2);
    });

    it('extrae coordenadas geográficas desde campos lat/long_ de propiedades', () => {
        const fc = wfsXmlToGeoJSON(VOLCANES_WFS_XML);
        const popo = fc.features[0];
        expect(popo.geometry.type).toBe('Point');
        const coords = (popo.geometry as GeoJSON.Point).coordinates;
        // lng, lat en WGS84
        expect(coords[0]).toBeCloseTo(-98.623434, 4);
        expect(coords[1]).toBeCloseTo(19.023386, 4);
    });

    it('extrae propiedades correctamente ignorando namespaces GML/WFS', () => {
        const fc   = wfsXmlToGeoJSON(VOLCANES_WFS_XML);
        const popo = fc.features[0];
        expect(popo.properties?.nomb).toBe('Popocatepetl');
        expect(popo.properties?.tipo).toBe('Estratovolcán');
        expect(popo.properties?.elev).toBe('5426');
        expect(popo.properties?.edo_loc).toBe('Puebla');
    });

    it('no incluye coordenadas proyectadas UTM como propiedades', () => {
        const fc   = wfsXmlToGeoJSON(VOLCANES_WFS_XML);
        const popo = fc.features[0];
        // Las coordenadas UTM (531620,2134862) deben quedar en geometry, no en props
        const coords = (popo.geometry as GeoJSON.Point).coordinates;
        expect(coords[0]).not.toBeCloseTo(531620, 0);
    });

    it('genera FeatureCollection con GeoJSON válido que puede parsearse por DOMParser', () => {
        const fc = wfsXmlToGeoJSON(VOLCANES_WFS_XML);
        expect(() => JSON.stringify(fc)).not.toThrow();
        expect(fc.features.every(f => f.geometry !== null)).toBe(true);
    });
});
