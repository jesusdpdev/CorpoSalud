import './App.css'
import Register from './pages/Register'
import Login from './pages/Login'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RutaProtegida from './servicios/RutaProtegida'
import PanelASIR from './pages/asir/PanelASIR'
import PanelASIC from './pages/asic/PanelASIC'
import PanelAdministrador from './pages/admin/PanelAdministrador'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Ruta raíz redirige al login */}
                <Route path="/" element={<Navigate to="/login" replace />} />

                {/* Rutas públicas */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Rutas protegidas por rol */}
                <Route
                    path="/panel-asir"
                    element={
                        <RutaProtegida rolesPermitidos={[1]}>
                            <PanelASIR />
                        </RutaProtegida>
                    }
                />

                <Route
                    path="/panel-asic"
                    element={
                        <RutaProtegida rolesPermitidos={[2]}>
                          <PanelASIC />
                        </RutaProtegida>
                    }
                />

                <Route
                    path="/admin"
                    element={
                        <RutaProtegida rolesPermitidos={[3]}>
                              <PanelAdministrador />
                        </RutaProtegida>
                    }
                />

                <Route path="/cargador" element={<Navigate to="/admin" replace />} />

                <Route
                    path="/visor"
                    element={
                        <RutaProtegida rolesPermitidos={[4]}>
                            <div className="flex justify-center items-center min-h-screen bg-blue-700 text-white text-3xl font-bold">
                                Panel Visor
                            </div>
                        </RutaProtegida>
                    }
                />

                {/* Ruta 404 */}
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;