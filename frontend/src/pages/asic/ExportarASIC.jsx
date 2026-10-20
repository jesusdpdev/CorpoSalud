import React, { useEffect, useState } from 'react';
import api from '../../servicios/api';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { descargarLibroExcel } from '../../servicios/exportarExcel';

const ExportarASIC = () => {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes]   = useState(hoy.getMonth() + 1);
  const [tipo, setTipo] = useState('reportes'); // reportes | movimientos | atenciones
  const [hospitalId, setHospitalId] = useState('');
  const [hospitales, setHospitales] = useState([]);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/hospitales').then(r => setHospitales(r.data)).catch(console.error);
  }, []);

  const cargarPreview = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/asir/exportar/preview', {
        params: { anio, mes, tipo, hospital_id: hospitalId },
      });
      setPreview(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const exportarExcel = async () => {
    if (preview.length === 0) return alert('No hay datos para exportar');
    try {
      await descargarLibroExcel(preview, `ASIC_${tipo}_${anio}_${mes}.xlsx`, 'Reporte ASIC');
    } catch (error) {
      console.error('Error al generar Excel ASIC:', error);
      alert('No se pudo generar el archivo Excel.');
    }
  };

  const exportarPDF = () => {
    if (preview.length === 0) return alert('No hay datos para exportar');
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Reporte ASIC - ${tipo.toUpperCase()} - ${mes}/${anio}`, 14, 15);

    const columnas = Object.keys(preview[0]);
    const filas = preview.map(obj => columnas.map(c => obj[c]));

    doc.autoTable({
      head: [columnas.map(c => c.toUpperCase())],
      body: filas,
      startY: 22,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [13, 71, 161] },
    });

    doc.save(`ASIR_${tipo}_${anio}_${mes}.pdf`);
  };

  return (
    <>
      <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="text-lg font-bold text-blue-900 mb-4">📤 Exportar datos</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
          <label className="text-sm font-medium">
            Tipo de reporte:
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}
              className="w-full border rounded-md px-3 py-2 mt-1">
              <option value="reportes">📋 Reportes por centro</option>
              <option value="movimientos">📊 Movimientos hospitalarios</option>
              <option value="atenciones">🩺 Atenciones / Consulta externa</option>
            </select>
          </label>

          <label className="text-sm font-medium">
            Hospital:
            <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 mt-1">
              <option value="">Todos</option>
              {hospitales.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium">
            Año:
            <select value={anio} onChange={(e) => setAnio(+e.target.value)}
              className="w-full border rounded-md px-3 py-2 mt-1">
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium">
            Mes:
            <select value={mes} onChange={(e) => setMes(+e.target.value)}
              className="w-full border rounded-md px-3 py-2 mt-1">
              {['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                .map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </label>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={cargarPreview}
            className="bg-blue-900 hover:bg-blue-800 text-white px-5 py-2 rounded-md text-sm font-semibold"
          >
            🔄 Generar vista previa
          </button>
          <button
            onClick={exportarExcel}
            disabled={preview.length === 0}
            className="bg-green-700 hover:bg-green-800 text-white px-5 py-2 rounded-md text-sm font-semibold disabled:opacity-40"
          >
            📊 Exportar a Excel
          </button>
          <button
            onClick={exportarPDF}
            disabled={preview.length === 0}
            className="bg-red-700 hover:bg-red-800 text-white px-5 py-2 rounded-md text-sm font-semibold disabled:opacity-40"
          >
            📄 Exportar a PDF
          </button>
        </div>
      </div>

      {/* Preview */}
      {loading ? (
        <p className="text-center py-10 text-gray-500">⏳ Generando vista previa...</p>
      ) : preview.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-md p-7">
          <h3 className="text-md font-bold text-blue-900 mb-4">
            Vista previa ({preview.length} filas)
          </h3>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 border-b-2 border-blue-100">
                <tr>
                  {Object.keys(preview[0]).map(k => (
                    <th key={k} className="text-left px-3 py-2 font-semibold">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-2">{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 50 && (
            <p className="text-xs text-gray-500 mt-3">
              Mostrando las primeras 50 filas. Al exportar se incluirán todas.
            </p>
          )}
        </div>
      ) : null}
    </>
  );
};

export default ExportarASIC;