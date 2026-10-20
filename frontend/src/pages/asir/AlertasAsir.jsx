import React, { useEffect, useState } from 'react';
import api from '../../servicios/api';

const AlertasASIR = () => {
  const [alertas, setAlertas] = useState([]);
  const [sinReportar, setSinReportar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes]   = useState(hoy.getMonth() + 1);

  useEffect(() => {
    let activa = true;
    Promise.all([
      api.get(`/asir/alertas?anio=${anio}&mes=${mes}`),
      api.get(`/asir/sin-reportar?anio=${anio}&mes=${mes}`),
    ])
      .then(([a, s]) => {
        if (!activa) return;
        setAlertas(a.data);
        setSinReportar(s.data);
        setErrorCarga('');
      })
      .catch(error => {
        if (!activa) return;
        console.error('Error al cargar alertas ASIR:', error);
        setErrorCarga(error.response?.data?.error || 'No se pudieron cargar las alertas.');
      })
      .finally(() => {
        if (activa) setLoading(false);
      });

    return () => {
      activa = false;
    };
  }, [anio, mes]);

  const marcarContactado = async (id) => {
    try {
      await api.post(`/asir/alertas/${id}/contactar`, { anio, mes });
      setAlertas(a => a.map(x => x.id === id ? { ...x, contactado: true } : x));
    } catch (error) {
      alert(error.response?.data?.error || 'Error al marcar como contactado');
    }
  };

  if (loading) return <p className="text-center py-10 text-gray-500">⏳ Cargando alertas...</p>;

  return (
    <>
      {/* Filtros */}
      <div className="bg-white rounded-xl p-4 mb-6 flex gap-4 shadow-sm">
        <select value={anio} onChange={(e) => { setLoading(true); setAnio(+e.target.value); }}
          className="border rounded-md px-3 py-1.5 bg-gray-50 text-sm">
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={mes} onChange={(e) => { setLoading(true); setMes(+e.target.value); }}
          className="border rounded-md px-3 py-1.5 bg-gray-50 text-sm">
          {['Enero','Febrero','Marzo','Abril','Mayo','Junio',
            'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
            .map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
      </div>

      {errorCarga && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{errorCarga}</p>}

      {/* Resumen de alertas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-7">
        <div className="bg-white rounded-xl p-5 border-l-4 border-red-600 shadow">
          <div className="text-3xl font-bold text-red-600">
            {alertas.filter(a => a.tipo === 'danger').length}
          </div>
          <div className="text-sm text-gray-600 mt-1">⛔ Alertas críticas</div>
        </div>
        <div className="bg-white rounded-xl p-5 border-l-4 border-yellow-500 shadow">
          <div className="text-3xl font-bold text-orange-700">
            {alertas.filter(a => a.tipo === 'warning').length}
          </div>
          <div className="text-sm text-gray-600 mt-1">⚠️ Advertencias</div>
        </div>
        <div className="bg-white rounded-xl p-5 border-l-4 border-blue-900 shadow">
          <div className="text-3xl font-bold text-blue-900">
            {alertas.filter(a => a.tipo === 'info').length}
          </div>
          <div className="text-sm text-gray-600 mt-1">ℹ️ Informativas</div>
        </div>
      </div>

      {/* Lista de alertas */}
      <div className="bg-white rounded-2xl shadow-md p-7 mb-6">
        <h2 className="text-lg font-bold text-blue-900 mb-4">🚨 Alertas activas</h2>

        {alertas.length === 0 ? (
          <p className="text-center py-8 text-gray-400">✅ No hay alertas activas</p>
        ) : (
          <div className="flex flex-col gap-3">
            {alertas.map(a => {
              const colores = {
                danger:  'bg-red-50 border-red-600 text-red-900',
                warning: 'bg-yellow-50 border-yellow-500 text-yellow-900',
                info:    'bg-blue-50 border-blue-900 text-blue-900',
              };
              const iconos = { danger: '⛔', warning: '⚠️', info: 'ℹ️' };
              return (
                <div key={a.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border-l-4 ${colores[a.tipo]}`}>
                  <span className="text-xl">{iconos[a.tipo]}</span>
                  <div className="flex-1">
                    <p className="font-semibold">{a.centro}</p>
                    <p className="text-sm">{a.mensaje}</p>
                  </div>
                  {a.contactado ? (
                    <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full">
                      ✅ Contactado
                    </span>
                  ) : (
                    <button
                      onClick={() => marcarContactado(a.id)}
                      className="bg-blue-900 hover:bg-blue-800 text-white text-xs px-3 py-1.5 rounded-md"
                    >
                      Marcar contactado
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Centros sin reportar */}
      <div className="bg-white rounded-2xl shadow-md p-7">
        <h2 className="text-lg font-bold text-blue-900 mb-4">
          ⚠️ Centros sin reportar ({sinReportar.length})
        </h2>

        {sinReportar.length === 0 ? (
          <p className="text-center py-8 text-gray-400">✅ Todos los centros han reportado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b-2 border-blue-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Código</th>
                  <th className="text-left px-4 py-3 font-semibold">Centro</th>
                  <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold">Municipio</th>
                  <th className="text-left px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sinReportar.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{c.codigo}</td>
                    <td className="px-4 py-3 font-semibold">{c.nombre}</td>
                    <td className="px-4 py-3">{c.tipo}</td>
                    <td className="px-4 py-3">{c.municipio}</td>
                    <td className="px-4 py-3">
                      <button className="text-blue-700 hover:text-blue-900 font-medium text-xs">
                        📧 Enviar recordatorio
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

export default AlertasASIR;