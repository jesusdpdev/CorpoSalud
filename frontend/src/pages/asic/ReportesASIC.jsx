import React, { useEffect, useState } from 'react';
import api from '../../servicios/api';
import { BadgeEstado } from './DashboardASIC';

const ReportesASIC = () => {
  const [reportes, setReportes] = useState([]);
  const [hospitales, setHospitales] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filtroHospital, setFiltroHospital] = useState('');
  const [filtroEstado, setFiltroEstado]     = useState('');
  const [busqueda, setBusqueda]             = useState('');
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes]   = useState(hoy.getMonth() + 1);

  // Paginación
  const [pagina, setPagina] = useState(1);
  const porPagina = 15;

  useEffect(() => {
    api.get('/hospitales').then(r => setHospitales(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/asir/reportes', {
          params: { anio, mes, hospital_id: filtroHospital, estado: filtroEstado },
        });
        setReportes(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [anio, mes, filtroHospital, filtroEstado]);

  // Filtrado local por búsqueda
  const filtrados = reportes.filter(r =>
    r.centro.toLowerCase().includes(busqueda.toLowerCase()) ||
    r.codigo?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalPaginas = Math.ceil(filtrados.length / porPagina);
  const visibles = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina);

  return (
    <>
      {/* Filtros */}
      <div className="bg-white rounded-xl p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="🔍 Buscar centro..."
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <select value={filtroHospital}
            onChange={(e) => { setFiltroHospital(e.target.value); setPagina(1); }}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todos los hospitales</option>
            {hospitales.map(h => (
              <option key={h.id} value={h.id}>{h.nombre}</option>
            ))}
          </select>
          <select value={filtroEstado}
            onChange={(e) => { setFiltroEstado(e.target.value); setPagina(1); }}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todos los estados</option>
            <option value="validado">✅ Validado</option>
            <option value="revisar">⚠️ Revisar</option>
            <option value="incompleto">❌ Incompleto</option>
            <option value="pendiente">⏳ Pendiente</option>
          </select>
          <div className="flex gap-2">
            <select value={anio} onChange={(e) => setAnio(+e.target.value)}
              className="border rounded-md px-3 py-2 text-sm flex-1">
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={mes} onChange={(e) => setMes(+e.target.value)}
              className="border rounded-md px-3 py-2 text-sm flex-1">
              {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                .map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-md p-7">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-blue-900">
            📋 Reportes ({filtrados.length})
          </h2>
        </div>

        {loading ? (
          <p className="text-center py-10 text-gray-500">⏳ Cargando reportes...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b-2 border-blue-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Código</th>
                  <th className="text-left px-4 py-3 font-semibold">Centro</th>
                  <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold">Consultas</th>
                  <th className="text-left px-4 py-3 font-semibold">Indicadores</th>
                  <th className="text-left px-4 py-3 font-semibold">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{r.codigo}</td>
                    <td className="px-4 py-3 font-semibold">{r.centro}</td>
                    <td className="px-4 py-3">{new Date(r.fecha_ultimo_reporte).toLocaleDateString('es-VE')}</td>
                    <td className="px-4 py-3">{r.total_consultas}</td>
                    <td className="px-4 py-3">{r.indicadores_reportados}</td>
                    <td className="px-4 py-3"><BadgeEstado estado={r.estado} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => window.location.href = `/reporte/${r.id}`}
                        className="text-blue-700 hover:text-blue-900 font-medium"
                      >
                        Ver →
                      </button>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-400">
                      Sin reportes que coincidan con los filtros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex justify-center items-center gap-2 mt-6">
            <button
              disabled={pagina === 1}
              onClick={() => setPagina(p => p - 1)}
              className="px-3 py-1.5 border rounded-md text-sm disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página {pagina} de {totalPaginas}
            </span>
            <button
              disabled={pagina === totalPaginas}
              onClick={() => setPagina(p => p + 1)}
              className="px-3 py-1.5 border rounded-md text-sm disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default ReportesASIC;