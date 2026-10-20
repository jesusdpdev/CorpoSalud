const ExcelJS = require('exceljs');

const MAX_WORKSHEETS = 100;
const MAX_CELLS = 1000000;

function createInputError(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.statusCode = 400;
  return error;
}

function getSourceValue(cell) {
  return cell.isMerged ? cell.master.value : cell.value;
}

function getValue(cell) {
  const sourceValue = getSourceValue(cell);
  if (sourceValue instanceof Date) return sourceValue.toISOString();
  if (sourceValue && typeof sourceValue === 'object') {
    if ('formula' in sourceValue || 'sharedFormula' in sourceValue) {
      return sourceValue.result ?? null;
    }
    if ('richText' in sourceValue) {
      return sourceValue.richText.map(part => part.text).join('');
    }
    if ('text' in sourceValue && 'hyperlink' in sourceValue) return sourceValue.text;
    if ('error' in sourceValue) return sourceValue.error;
    return JSON.stringify(sourceValue);
  }
  return sourceValue ?? null;
}

function getCenterName(worksheet) {
  const topValues = [];
  for (let rowNumber = 1; rowNumber <= 12; rowNumber += 1) {
    worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, cell => {
      const value = String(getValue(cell) ?? '').trim();
      if (value) topValues.push(value);
    });
  }

  const hospitalLabel = topValues.find(value => /^HOSPITAL\s*:/i.test(value));
  const hospitalName = hospitalLabel?.replace(/^HOSPITAL\s*:\s*/i, '').trim();
  if (hospitalName) {
    const quote = hospitalName[0];
    if ((quote === '"' || quote === "'") && hospitalName.endsWith(quote)) {
      return hospitalName.slice(1, -1).trim();
    }
    return hospitalName;
  }
  if (/^hoja\d+$/i.test(worksheet.name)) return null;
  const stateTotal = topValues.find(value => /^TOTAL ESTADO\b/i.test(value));
  if (stateTotal) return stateTotal;
  return worksheet.name.trim();
}

function getCellPosition(address) {
  const match = address.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  let column = 0;
  for (const character of match[1].toUpperCase()) {
    column = (column * 26) + character.charCodeAt(0) - 64;
  }
  return { column, row: Number(match[2]) };
}

function getColumnName(column) {
  let name = '';
  while (column > 0) {
    const remainder = (column - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    column = Math.floor((column - 1) / 26);
  }
  return name;
}

function getRange(cells) {
  let minRow = Infinity;
  let maxRow = 0;
  let minColumn = Infinity;
  let maxColumn = 0;
  for (const cell of cells) {
    const position = getCellPosition(cell.address);
    if (!position) continue;
    minRow = Math.min(minRow, position.row);
    maxRow = Math.max(maxRow, position.row);
    minColumn = Math.min(minColumn, position.column);
    maxColumn = Math.max(maxColumn, position.column);
  }
  if (!Number.isFinite(minRow)) return null;
  return `${getColumnName(minColumn)}${minRow}:${getColumnName(maxColumn)}${maxRow}`;
}

function getYear(worksheet) {
  for (let rowNumber = 1; rowNumber <= 12; rowNumber += 1) {
    let year = null;
    worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, cell => {
      const match = String(getValue(cell) ?? '').match(/AÑO\s*:\s*(20\d{2})/i);
      if (match) year = Number(match[1]);
    });
    if (year) return year;
  }
  return null;
}

function serializeCell(cell) {
  const sourceValue = getSourceValue(cell);
  const value = getValue(cell);
  let formula = null;

  if (sourceValue && typeof sourceValue === 'object' &&
      ('formula' in sourceValue || 'sharedFormula' in sourceValue)) {
    formula = sourceValue.formula || `shared:${sourceValue.sharedFormula}`;
  }

  return {
    address: cell.address,
    value: value ?? null,
    formatted: value == null ? null : String(value),
    formula,
    type: formula ? 'formula' : cell.type,
    numberFormat: cell.numFmt || null,
  };
}

async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (cause) {
    throw createInputError(
      'No se pudo leer el archivo. Verifique que sea un Excel .xlsx/.xlsm válido y que no esté protegido con contraseña.',
      cause
    );
  }

  if (workbook.worksheets.length > MAX_WORKSHEETS) {
    throw createInputError(`El libro supera el máximo de ${MAX_WORKSHEETS} hojas`);
  }

  const sheets = [];
  let skippedSheets = 0;
  let totalCells = 0;

  for (const worksheet of workbook.worksheets) {
    const centerName = getCenterName(worksheet);
    if (!centerName) {
      skippedSheets += 1;
      continue;
    }

    const cells = [];
    worksheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        if ((!cell.isMerged || cell.master.address === cell.address) &&
            cell.value !== null && cell.value !== undefined) {
          cells.push(serializeCell(cell));
        }
      });
    });

    totalCells += cells.length;
    if (totalCells > MAX_CELLS) {
      throw createInputError('El libro supera el máximo permitido de celdas con datos');
    }

    sheets.push({
      sheetName: worksheet.name,
      centerName,
      year: getYear(worksheet),
      range: getRange(cells),
      cellCount: cells.length,
      cells,
    });
  }

  if (sheets.length === 0) {
    throw createInputError(
      'No se encontraron hojas asociadas a centros. Complete el nombre del centro o renombre la hoja antes de importar.'
    );
  }

  return { sheets, skippedSheets };
}

module.exports = { parseWorkbook };
