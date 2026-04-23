import React from 'react';
import MapView from '@components/map/MapView';
import { ErrorBoundary } from '@components/common';

const Geovisor: React.FC = () => {
    return (
        <ErrorBoundary>
            <MapView />
        </ErrorBoundary>
    );
};

export default Geovisor;