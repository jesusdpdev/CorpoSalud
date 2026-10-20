import React, { useEffect, useState } from 'react';
import api from '../../servicios/api'; // tu axios/fetch configurado

const DashboardASIR = () => {
  const [stats, setStats] = useState({
    totalCentros: 0, reportesEnviados: 0,
    centrosSinReportar: 0, conObservaciones: 0,
  });
  const [ultimos, setUltimos] = useState([]);
  const [loading, setLoading] = useState(true);

  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes]   = useState(hoy.getMonth() + 1);

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      try {
        const [s, u] = await Promise.all([
          api.get(`/asir/stats?anio=${anio}&mes=${mes}`),
          api.get(`/asir/ultimos-reportes?anio=${anio}&mes=${mes}&limit=8`),
        ]);
        setStats(s.data);
        setUltimos(u.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [anio, mes]);

  if (loading) return <p className="text-center py-10 text-gray-500">⏳ Cargando...</p>;

  return (
    <>
      {/* Filtros */}
      <div className="bg-white rounded-xl p-4 mb-6 flex gap-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-medium">
          Año:
          <select value={anio} onChange={(e) => setAnio(+e.target.value)}
            className="border rounded-md px-3 py-1.5 bg-gray-50">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          Mes:
          <select value={mes} onChange={(e) => setMes(+e.target.value)}
            className="border rounded-md px-3 py-1.5 bg-gray-50">
            {['Enero','Febrero','Marzo','Abril','Mayo','Junio',
              'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
              .map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </label>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        <StatCard numero={stats.totalCentros}        label="🏥 Total centros operativos" color="blue" />
        <StatCard numero={stats.reportesEnviados}    label="✅ Reportes enviados"        color="green" />
        <StatCard numero={stats.centrosSinReportar}  label="⚠️ Centros sin reportar"     color="red" />
        <StatCard numero={stats.conObservaciones}    label="📌 Con observaciones"        color="yellow" />
      </div>

      {/* Últimos reportes */}
      <div className="bg-white rounded-2xl shadow-md p-7">
        <h2 className="text-lg font-bold text-blue-900 mb-4">📋 Últimos reportes recibidos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b-2 border-blue-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Centro</th>
                <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold">Consultas</th>
                <th className="text-left px-4 py-3 font-semibold">Indicadores</th>
                <th className="text-left px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ultimos.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{r.centro}</td>
                  <td className="px-4 py-3">{new Date(r.fecha_ultimo_reporte).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3">{r.total_consultas}</td>
                  <td className="px-4 py-3">{r.indicadores_reportados}</td>
                  <td className="px-4 py-3">
                    <BadgeEstado estado={r.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// Subcomponentes reutilizables
const StatCard = ({ numero, label, color }) => {
  const colores = {
    blue:   'border-blue-900 text-blue-900',
    green:  'border-green-700 text-green-700',
    red:    'border-red-600 text-red-600',
    yellow: 'border-yellow-500 text-orange-700',
  };
  return (
    <div className={`bg-white rounded-xl p-5 border-l-4 ${colores[color]} shadow hover:-translate-y-1 transition`}>
      <div className="text-3xl font-bold">{numero}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  );
};

export const BadgeEstado = ({ estado }) => {
  const map = {
    validado:   { cls: 'bg-green-100 text-green-800',  txt: '✅ Validado' },
    revisar:    { cls: 'bg-orange-100 text-orange-800', txt: '⚠️ Revisar' },
    incompleto: { cls: 'bg-red-100 text-red-800',     txt: '❌ Incompleto' },
    pendiente:  { cls: 'bg-blue-100 text-blue-800',   txt: '⏳ Pendiente' },
  };
  const cfg = map[estado] || map.pendiente;
  return <span className={`${cfg.cls} px-3 py-1 rounded-full text-xs font-semibold`}>{cfg.txt}</span>;
};

export default DashboardASIR;