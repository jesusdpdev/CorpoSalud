const assert = require('node:assert/strict');
const test = require('node:test');
const ExcelJS = require('exceljs');
const { parseWorkbook } = require('../services/excelParser');

async function createWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const center = workbook.addWorksheet('CENTRO DE SALUD');
  center.getCell('B5').value = 'HOSPITAL: Centro de Salud Santa Ana';
  center.getCell('B6').value = 'ESTADO: TACHIRA';
  center.getCell('Q4').value = 'AÑO: 2024';
  center.getCell('C10').value = 12;
  center.getCell('D10').value = { formula: 'C10*2', result: 24 };

  const template = workbook.addWorksheet('Hoja2');
  template.getCell('B5').value = 'HOSPITAL: ';
  template.getCell('C10').value = 'Plantilla';

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('clasifica centros, conserva casillas y fórmulas, y omite hojas plantilla', async () => {
  const { sheets, skippedSheets } = await parseWorkbook(await createWorkbookBuffer());

  assert.equal(sheets.length, 1);
  assert.equal(skippedSheets, 1);
  assert.equal(sheets[0].centerName, 'Centro de Salud Santa Ana');
  assert.equal(sheets[0].year, 2024);
  assert.equal(sheets[0].range, 'B4:Q10');
  assert.equal(sheets[0].cellCount, 5);
  assert.deepEqual(
    sheets[0].cells.find(cell => cell.address === 'D10'),
    {
      address: 'D10',
      value: 24,
      formatted: '24',
      formula: 'C10*2',
      type: 'formula',
      numberFormat: null,
    }
  );
});

test('rechaza archivos que no son libros Excel válidos', async () => {
  await assert.rejects(
    parseWorkbook(Buffer.from('no es un libro Excel')),
    error => error.statusCode === 400 && /No se pudo leer el archivo/.test(error.message)
  );
});
