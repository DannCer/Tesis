/**
 * @fileoverview Layout para el Geovisor — pantalla completa sin scroll.
 *
 * Optimizaciones:
 *  - Indentación corregida (era inconsistente en el original).
 *  - memo() ya que no tiene estado propio y sus props (children) son estables.
 *  - Eliminado el import doble de React (no necesario en React 17+ con JSX transform).
 *
 * @module components/layout/LayoutGeovisor
 */

import { memo, type ReactNode } from 'react';
import Header from '@components/layout/Header';
import '@styles/global.css';
import { SelectedProjectProvider } from '@/contexts/SelectedProjectContext';

interface LayoutGeovisorProps {
    children: ReactNode;
}

const LayoutGeovisor = memo<LayoutGeovisorProps>(({ children }) => (
    <SelectedProjectProvider>
        <div className="layout-geovisor">
            <Header />
            <main className="geovisor-content">
                {children}
            </main>
        </div>
    </SelectedProjectProvider>
));

LayoutGeovisor.displayName = 'LayoutGeovisor';

export default LayoutGeovisor;