import React from 'react';
import '../../styles/header.css';

const Header: React.FC = () => {
    return (
        <header className="main-header">
            <nav className="site-nav">
                <div className="container-max">
                    <div className="row align-items-center">
                        <div className="col-6 col-md-4">
                            <div className="logoL">
                                <img src="/img/escudos/logo_UNAM.png" alt="Logo UNAM" />
                            </div>
                        </div>
                        <div className="col-6 col-md-4 offset-md-4 text-end">
                            <div className="logoR">
                                <img src="/img/escudos/logo_FI.png" alt="Logo FI" />
                            </div>
                        </div>
                    </div>
                </div>
            </nav>
        </header>
    );
};

export default Header;
