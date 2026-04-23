import React, { useState, memo } from 'react';
import LayerItem from './LayerItem'; // Crear si no existe
import './PaginatedLayerGroup.css';

interface Props {
    groupName: string;
    layers: LayerConfig[];
    layersPerPage?: number;
}

const LAYERS_PER_PAGE = 15;

const PaginatedLayerGroup = memo(({ 
    groupName, 
    layers, 
    layersPerPage = LAYERS_PER_PAGE 
}: Props) => {
    const [currentPage, setCurrentPage] = useState(0);
    const totalPages = Math.ceil(layers.length / layersPerPage);
    
    const startIdx = currentPage * layersPerPage;
    const visibleLayers = layers.slice(startIdx, startIdx + layersPerPage);

    return (
        <div className="paginated-layer-group">
            {visibleLayers.map(layer => (
                <LayerItem key={layer.id} layer={layer} />
            ))}
            
            {totalPages > 1 && (
                <div className="pagination-controls">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="pagination-btn"
                    >
                        ← Anterior
                    </button>
                    
                    <span className="pagination-info">
                        {currentPage + 1} / {totalPages}
                    </span>
                    
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage === totalPages - 1}
                        className="pagination-btn"
                    >
                        Siguiente →
                    </button>
                </div>
            )}
        </div>
    );
});

export default PaginatedLayerGroup;