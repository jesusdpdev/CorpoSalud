import { Navigate } from 'react-router-dom';

function RutaProtegida({ children, rolesPermitidos }) {
    const token = localStorage.getItem('token');
    let user = {};
    try {
        user = JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }

    if (!token) {
        return <Navigate to="/login" />;
    }

    if (rolesPermitidos && !rolesPermitidos.includes(Number(user.rol_id))) {
        const routeByRole = {
            1: '/panel-asir',
            2: '/panel-asic',
            3: '/admin',
            4: '/visor',
        };
        return <Navigate to={routeByRole[Number(user.rol_id)] || '/login'} replace />;
    }

    return children;
}

export default RutaProtegida;