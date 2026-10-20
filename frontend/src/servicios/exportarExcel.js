export async function descargarLibroExcel(datos, nombreArchivo, nombreHoja) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(nombreHoja);
  const headers = Object.keys(datos[0]);

  worksheet.columns = headers.map(header => ({
    header,
    key: header,
    width: Math.min(Math.max(header.length + 2, 12), 36),
  }));
  worksheet.addRows(datos);

  const contenido = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([contenido], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
