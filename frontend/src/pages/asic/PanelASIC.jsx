import { useNavigate } from 'react-router-dom'; 
import React, { useState } from 'react';
import Swal from 'sweetalert2'
import ImportarExcel from '../ImportarExcel';

const PanelASIC = () => {
  const [tabActiva, setTabActiva] = useState('dashboard');
  const navigate = useNavigate();
  const usuario = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const logout = () => {
    Swal.fire({
      title: '¿Deseas cerrar sesión?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#45A162',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar, volver al panel'
    }).then((result) =>{
      if(result.isConfirmed) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Si usas 'usuario' en lugar de 'user':
        // localStorage.removeItem('usuario');
        navigate('/login');
      }
    })
    
  };

  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'reportes',  label: '📋 Reportes' },
    { id: 'exportar',  label: '📤 Exportar' },
    { id: 'alertas',   label: '🔔 Alertas' },
    { id: 'datos',     label: '📊 Datos Excel' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50/50 to-slate-100">
      <header className="relative overflow-hidden bg-gradient-to-r from-cyan-950 via-teal-900 to-blue-900 px-5 py-5 text-white shadow-xl sm:px-8">
        <div className="absolute -right-16 -top-32 h-72 w-72 rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-teal-200">Corposalud · Sistema de reportes</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Panel de información hospitalaria</h1>
            <p className="mt-1 text-sm text-cyan-100">Consulta organizada de centros, capacidad y actividad</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 font-bold">Área ASIC</span>
            <span className="font-medium text-cyan-50">Hola, {usuario.nombre || 'Usuario'}</span>
          <button
            onClick={logout}
              className="rounded-lg border border-white/25 bg-white/5 px-4 py-2 font-semibold text-white transition hover:bg-white/15"
          >
              Cerrar sesión
          </button>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:px-8">
        <nav aria-label="Secciones ASIC" className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tabActiva === t.id ? 'page' : undefined}
              onClick={() => setTabActiva(t.id)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                tabActiva === t.id
                  ? 'bg-teal-900 text-white shadow-md shadow-teal-900/15'
                  : 'text-slate-600 hover:bg-teal-50 hover:text-teal-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <ImportarExcel categoria="asic" vista={tabActiva} />
      </main>
    </div>
  );
};

export default PanelASIC;