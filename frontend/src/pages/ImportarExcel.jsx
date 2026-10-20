import { useEffect, useMemo, useState } from 'react';
import api from '../servicios/api';

const MONTH_COLUMNS = [3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17];
const QUARTER_HEADERS = [
  { column: 6, label: 'Trimestre 1' },
  { column: 10, label: 'Trimestre 2' },
  { column: 14, label: 'Trimestre 3' },
  { column: 18, label: 'Trimestre 4' },
];
const MONTH_NAMES = new Map([
  ['ENE', 'Enero'], ['FEB', 'Febrero'], ['MAR', 'Marzo'], ['ABR', 'Abril'],
  ['MAY', 'Mayo'], ['JUN', 'Junio'], ['JUL', 'Julio'], ['AGO', 'Agosto'],
  ['SEP', 'Septiembre'], ['OCT', 'Octubre'], ['NOV', 'Noviembre'], ['DIC', 'Diciembre'],
]);
const MAIN_SECTIONS = [
  { row: 12, name: 'Movimiento hospitalario' },
  { row: 24, name: 'Radiología' },
  { row: 41, name: 'Imagenología' },
  { row: 53, name: 'Anatomía patológica' },
  { row: 61, name: 'Laboratorio' },
  { row: 72, name: 'Consultas' },
  { row: 82, name: 'Cirugía y obstetricia' },
  { row: 115, name: 'Indicadores de gestión' },
];

function columnNumber(address) {
  const letters = address.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return 0;
  return [...letters].reduce((column, letter) => (
    column * 26 + letter.charCodeAt(0) - 64
  ), 0);
}

function normalizeMonth(value) {
  return String(value ?? '')
    .trim()
    .replace(/\./g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 3)
    .toUpperCase();
}

function readableText(value) {
  const text = String(value ?? '').trim();
  const knownServiceNames = new Map([
    ['OBST.', 'Obstetricia'],
    ['GINEC.', 'Ginecología'],
    ['CIRUG.', 'Cirugía'],
    ['TRAUM', 'Traumatología'],
    ['TRAUMA', 'Traumatología'],
    ['MED.', 'Medicina'],
    ['PED.', 'Pediatría'],
    ['UPAP', 'Unidad de pacientes agudos psiquiátricos'],
    ['UTIN', 'Unidad de terapia intensiva neonatal'],
    ['UCIN', 'Unidad de cuidados intermedios neonatal'],
    ['UCC', 'Unidad de cuidados coronarios'],
    ['UCI ADULTOS', 'Unidad de cuidados intensivos adultos'],
    ['UCI PEDIATRICO', 'Unidad de cuidados intensivos pediátricos'],
  ]);
  const expandedServiceName = knownServiceNames.get(text.toLocaleUpperCase('es-VE'));
  if (expandedServiceName) return expandedServiceName;
  if (text !== text.toLocaleUpperCase('es-VE')) return text;
  return text
    .toLocaleLowerCase('es-VE')
    .replace(/^./, character => character.toLocaleUpperCase('es-VE'))
    .replace(/\bcirugia\b/gi, 'cirugía')
    .replace(/\bradiologia\b/gi, 'radiología')
    .replace(/\banatomia\b/gi, 'anatomía')
    .replace(/\bimagenologia\b/gi, 'imagenología')
    .replace(/\bdias\b/gi, 'días')
    .replace(/\bhospitalizaci[oò]n\b/gi, 'hospitalización')
    .replace(/\btorax\b/gi, 'tórax')
    .replace(/\bUci\b/g, 'UCI')
    .replace(/\bUcin\b/g, 'UCIN')
    .replace(/\bUpap\b/g, 'UPAP')
    .replace(/\bUcc\b/g, 'UCC');
}

function displayValue(cell, label = '') {
  if (!cell || cell.value === null || cell.value === undefined || cell.value === '') return '—';
  if (typeof cell.value !== 'number') return String(cell.value);

  let value = cell.value;
  const isPercent = String(label).includes('%');
  if (cell.numberFormat?.includes('%') || (isPercent && Math.abs(value) <= 1)) value *= 100;
  const formatted = new Intl.NumberFormat('es-VE', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
  return cell.numberFormat?.includes('%') || isPercent ? `${formatted} %` : formatted;
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-VE')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getWorkbookMetadata(sheet, hospitals) {
  const metadataText = (sheet?.celdas || [])
    .filter(cell => Number(cell.address.match(/\d+$/)?.[0]) <= 10)
    .map(cell => String(cell.value ?? ''))
    .join(' / ');
  const readField = labelPattern => {
    const match = metadataText.match(new RegExp(`${labelPattern}\\s*:\\s*([^/|]+)`, 'i'));
    return match?.[1]?.trim() || '';
  };
  const name = sheet?.centro_nombre || '';
  const hospital = hospitals.find(item => normalizeName(item.nombre) === normalizeName(name));
  const code = readField('C[ÓO]DIGO') || hospital?.codigo || '';

  return {
    name,
    code,
    codeSource: readField('C[ÓO]DIGO') ? 'libro' : hospital ? 'base de datos' : '',
    state: readField('ESTADO'),
    municipality: readField('MUNICIPIO'),
    type: readField('TIPO'),
    population: readField('POBLACI[ÓO]N'),
    address: readField('DIRECCI[ÓO]N'),
    parish: readField('PARROQUIA'),
    phone: readField('TEL[ÉE]FONOS?'),
    email: readField('CORREO ELECTR[ÓO]NICO'),
  };
}

function buildDataQualityAlerts(sheet, sections, metadata) {
  const alerts = [];
  if (!sheet?.anio) {
    alerts.push({ level: 'warning', title: 'Año no identificado', detail: 'El libro no indica el año de este centro.' });
  }
  if (!metadata.code) {
    alerts.push({
      level: 'info',
      title: 'Centro sin código vinculado',
      detail: 'El Excel no trae un código y no hay una coincidencia exacta en el catálogo de centros. No se asignó uno automáticamente.',
    });
  }

  const beds = sections.find(section => section.id === 'beds');
  const missingBedFields = beds?.stats.filter(stat => stat.value === '—') || [];
  if (missingBedFields.length) {
    alerts.push({
      level: 'warning',
      title: 'Datos de capacidad incompletos',
      detail: `Faltan ${missingBedFields.length} datos: ${missingBedFields.map(stat => stat.label.toLocaleLowerCase('es-VE')).join(', ')}.`,
    });
  }

  const keySections = sections.filter(section =>
    ['main-12', 'main-72', 'main-82'].includes(section.id)
  );
  const emptySections = keySections.filter(section => section.rows.length === 0);
  if (emptySections.length) {
    alerts.push({
      level: 'warning',
      title: 'Secciones principales sin datos',
      detail: emptySections.map(section => section.title).join(', '),
    });
  }
  if (!alerts.length) {
    alerts.push({
      level: 'success',
      title: 'Información principal disponible',
      detail: 'El año, la identificación del centro y los datos principales están presentes en el libro.',
    });
  }
  return alerts;
}

function DataQualityAlerts({ alerts }) {
  const colors = {
    warning: 'border-amber-300 bg-amber-50 text-amber-950',
    info: 'border-blue-200 bg-blue-50 text-blue-950',
    success: 'border-green-200 bg-green-50 text-green-950',
  };
  return (
    <ul className="space-y-3">
      {alerts.map(alert => (
        <li key={alert.title} className={`rounded-xl border p-4 ${colors[alert.level]}`}>
          <p className="font-semibold">{alert.title}</p>
          <p className="mt-1 text-sm">{alert.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function MonthlyChart({ section, selectedLabel, onSelect }) {
  const availableRows = section?.rows?.filter(row =>
    row.values.some(value =>
      value.numeric !== null && MONTH_NAMES.has(normalizeMonth(value.label))
    )
  ) || [];
  const selectedRow = availableRows.find(row => row.label === selectedLabel) || availableRows[0];
  const values = selectedRow?.values.filter(value =>
    value.numeric !== null && MONTH_NAMES.has(normalizeMonth(value.label))
  ) || [];
  const maxValue = Math.max(0, ...values.map(value => value.numeric));

  if (!availableRows.length) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No hay valores mensuales para graficar.</p>;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-blue-50/40 p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Tendencia anual</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Evolución durante el año</h3>
          <p className="text-sm text-slate-500">Selecciona un indicador y compara sus valores mes a mes.</p>
        </div>
        {onSelect && (
          <label className="text-sm font-medium text-slate-700">
            Indicador
            <select
              value={selectedRow.label}
              onChange={event => onSelect(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 sm:w-72"
            >
              {availableRows.map(row => <option key={row.id} value={row.label}>{row.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-12" role="img" aria-label={`Valores mensuales: ${selectedRow.label}`}>
        {values.map(value => {
          const height = maxValue > 0 ? Math.max((value.numeric / maxValue) * 100, 4) : 4;
          return (
            <div key={value.label} className="flex min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-2 transition hover:bg-white">
              <span className="max-w-full truncate text-xs font-bold text-slate-700" title={value.value}>{value.value}</span>
              <div className="flex h-28 w-full items-end overflow-hidden rounded-lg border border-blue-100 bg-white p-1 shadow-inner">
                <div className="w-full rounded-md bg-gradient-to-t from-blue-800 to-cyan-500 transition-all duration-500" style={{ height: `${height}%` }} />
              </div>
              <span className="text-center text-[11px] font-semibold text-slate-600">{value.label.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm font-semibold text-blue-950">{selectedRow.label}</p>
    </div>
  );
}

function buildWorkbookSections(cells) {
  const rows = new Map();
  const cellsByAddress = new Map();
  for (const cell of cells) {
    const match = cell.address.match(/^[A-Z]+(\d+)$/i);
    if (!match) continue;
    const rowNumber = Number(match[1]);
    const row = rows.get(rowNumber) || new Map();
    row.set(columnNumber(cell.address), cell);
    rows.set(rowNumber, row);
    cellsByAddress.set(cell.address, cell);
  }

  const getCell = (rowNumber, column) => rows.get(rowNumber)?.get(column);
  const getLabel = rowNumber => readableText(getCell(rowNumber, 2)?.value);
  const hasData = (rowNumber, columns) => columns.some(column => {
    const value = getCell(rowNumber, column)?.value;
    return value !== null && value !== undefined && value !== '';
  });
  const monthlyHeaders = MONTH_COLUMNS.map(column => {
    const label = getCell(12, column)?.value;
    return { column, label: MONTH_NAMES.get(normalizeMonth(label)) || `Mes ${column}` };
  });

  const makeMonthlyRows = (startRow, endRow, headers = monthlyHeaders) => {
    const valueHeaders = [...headers, ...QUARTER_HEADERS].sort((a, b) => a.column - b.column);
    const result = [];
    for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
      const label = getLabel(rowNumber);
      if (!label || !hasData(rowNumber, [...valueHeaders.map(header => header.column), 19])) continue;
      result.push({
        id: rowNumber,
        label,
        values: valueHeaders.map(header => ({
          label: header.label,
          value: displayValue(getCell(rowNumber, header.column), label),
          numeric: typeof getCell(rowNumber, header.column)?.value === 'number'
            ? getCell(rowNumber, header.column).value
            : null,
        })),
        annual: displayValue(getCell(rowNumber, 19), label),
        annualNumeric: typeof getCell(rowNumber, 19)?.value === 'number'
          ? getCell(rowNumber, 19).value
          : null,
      });
    }
    return result;
  };

  const sections = [{
    id: 'beds',
    title: 'Camas y capacidad',
    type: 'beds',
    stats: [
      ['Camas de hospitalización', 'G10'],
      ['Camas del quinto departamento', 'M10'],
      ['Total de camas', 'R10'],
      ['Capacidad arquitectónica', 'C11'],
      ['Capacidad operativa', 'K11'],
      ['Capacidad presupuestaria', 'S11'],
    ].map(([label, address]) => ({
      label,
      value: displayValue(cellsByAddress.get(address), label),
    })),
  }];

  MAIN_SECTIONS.forEach((section, index) => {
    const nextSection = MAIN_SECTIONS[index + 1];
    const endRow = nextSection ? nextSection.row - 1 : 145;
    sections.push({
      id: `main-${section.row}`,
      title: section.name,
      type: 'monthly',
      rows: makeMonthlyRows(section.row + 1, endRow),
    });
  });

  sections.push({
    id: 'usage-indicators',
    title: 'Indicadores de uso',
    type: 'monthly',
    rows: makeMonthlyRows(147, 148),
  });

  const orderedRows = [...rows.keys()].sort((a, b) => a - b);
  const isClinicalHeader = rowNumber => {
    if (rowNumber < 500) return false;
    const monthCount = MONTH_COLUMNS.filter(column =>
      MONTH_NAMES.has(normalizeMonth(getCell(rowNumber, column)?.value))
    ).length;
    return monthCount >= 10;
  };
  const clinicalHeaders = orderedRows.filter(isClinicalHeader);
  const firstClinicalHeader = clinicalHeaders[0] || 571;
  const departmentMarkers = [...rows.keys()]
    .sort((a, b) => a - b)
    .filter(rowNumber => ['MESES', 'PERIODO'].includes(getLabel(rowNumber).toUpperCase()));
  departmentMarkers.forEach((markerRow, index) => {
    const headerRow = markerRow + 1;
    const columns = [...(rows.get(headerRow)?.entries() || [])]
      .filter(([column, cell]) => column >= 3 && column <= 17 &&
        typeof cell.value === 'string' && cell.value.trim())
      .map(([column, cell]) => ({ column, label: readableText(cell.value) }));
    if (columns.length < 4) return;

    const nextMarker = departmentMarkers[index + 1];
    const endRow = markerRow <= 298
      ? Math.min((nextMarker || 299) - 1, 298)
      : Math.min((nextMarker || firstClinicalHeader) - 1, firstClinicalHeader - 1, 570);
    const title = readableText(getCell(markerRow, 3)?.value || 'Detalle por servicio');
    const sourceRows = [];
    for (let rowNumber = headerRow + 1; rowNumber <= endRow; rowNumber += 1) {
      const label = getLabel(rowNumber);
      if (!label || !hasData(rowNumber, columns.map(column => column.column))) continue;
      sourceRows.push({
        id: rowNumber,
        label,
        values: columns.map(column => ({
          label: column.label,
          value: displayValue(getCell(rowNumber, column.column), label),
          numeric: typeof getCell(rowNumber, column.column)?.value === 'number'
            ? getCell(rowNumber, column.column).value
            : null,
        })),
      });
    }
    if (sourceRows.length) {
      const firstMetric = sourceRows.find(row => /CAMAS OPERATIVAS/i.test(row.label));
      const period = firstMetric?.label.match(/\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b/i)?.[0];
      sections.push({
        id: `department-${markerRow}`,
        title: markerRow > 298 && period
          ? `Por servicio · ${title} · ${period[0]}${period.slice(1).toLowerCase()}`
          : `Por servicio · ${title}`,
        type: 'departments',
        columns,
        rows: sourceRows,
      });
    }
  });

  clinicalHeaders.forEach((headerRow, index) => {
    const title = getLabel(headerRow);
    if (!title) return;
    const endRow = (clinicalHeaders[index + 1] || (orderedRows[orderedRows.length - 1] + 1)) - 1;
    const headerColumns = MONTH_COLUMNS.map(column => ({
      column,
      label: MONTH_NAMES.get(normalizeMonth(getCell(headerRow, column)?.value)) || `Mes ${column}`,
    }));
    const dataRows = makeMonthlyRows(headerRow + 1, endRow, headerColumns);
    if (dataRows.length) {
      sections.push({
        id: `clinical-${headerRow}`,
        title: `Área clínica · ${readableText(title)}`,
        type: 'monthly',
        rows: dataRows,
      });
    }
  });

  return sections;
}

function createSheetName(title, index, usedNames) {
  const base = String(title).replace(/[\x5B\x5D/:*?\\]/g, ' ').trim().slice(0, 25) || `Datos ${index + 1}`;
  let name = base;
  let suffix = 1;
  while (usedNames.has(name.toLocaleLowerCase())) {
    const ending = ` ${suffix}`;
    name = `${base.slice(0, 31 - ending.length)}${ending}`;
    suffix += 1;
  }
  usedNames.add(name.toLocaleLowerCase());
  return name;
}

function excelColumnName(column) {
  let name = '';
  let current = column;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function addExportCover(workbook, metadata, categoria, sheet, sections) {
  const worksheet = workbook.addWorksheet('Resumen');
  worksheet.properties.tabColor = '0F766E';
  worksheet.columns = [
    { width: 34 },
    { width: 34 },
    { width: 24 },
    { width: 24 },
  ];
  worksheet.mergeCells('A1:D1');
  worksheet.getCell('A1').value = 'CORPOSALUD · INFORME HOSPITALARIO';
  worksheet.getCell('A1').font = { name: 'Aptos Display', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12304A' } };
  worksheet.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  worksheet.getRow(1).height = 42;
  worksheet.mergeCells('A2:D2');
  worksheet.getCell('A2').value = 'Resumen del centro de salud';
  worksheet.getCell('A2').font = { size: 14, bold: true, color: { argb: 'FF0F766E' } };
  worksheet.getCell('A2').alignment = { vertical: 'middle', indent: 1 };
  worksheet.getRow(2).height = 30;
  worksheet.addRow([]);
  [
    ['Centro', metadata.name || sheet.centro_nombre],
    ['Clasificación', categoria.toUpperCase()],
    ['Código institucional', metadata.code || 'No vinculado'],
    ['Año reportado', sheet.anio || 'No indicado'],
    ['Hojas de información', sections.length],
    ['Fecha de exportación', new Date().toLocaleDateString('es-VE')],
  ].forEach(([label, value], index) => {
    const row = worksheet.addRow([label, value]);
    row.height = 25;
    row.getCell(1).font = { bold: true, color: { argb: 'FF334155' } };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F6' } };
    row.getCell(2).font = { color: { argb: 'FF0F172A' } };
    row.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' },
    };
    row.eachCell(cell => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  });
  worksheet.addRow([]);
  const sectionHeader = worksheet.addRow(['Contenido del archivo']);
  worksheet.mergeCells(`A${sectionHeader.number}:D${sectionHeader.number}`);
  sectionHeader.height = 28;
  sectionHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sectionHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  sections.forEach((section, index) => {
    const row = worksheet.addRow([index + 1, section.title]);
    row.height = 22;
    row.getCell(1).font = { color: { argb: 'FF64748B' } };
    row.getCell(2).font = { color: { argb: 'FF1E293B' } };
    row.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' },
      };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
  });
  worksheet.views = [{ state: 'frozen', ySplit: 2 }];
}

function addExportSection(workbook, section, index, usedNames) {
  const worksheet = workbook.addWorksheet(createSheetName(section.title, index, usedNames));
  const dataColumnCount = section.type === 'beds'
    ? 2
    : section.type === 'monthly'
      ? (section.rows[0]?.values.length || 0) + 2
      : section.columns.length + 1;
  const lastColumn = excelColumnName(Math.max(dataColumnCount, 2));
  worksheet.properties.tabColor = section.type === 'beds'
    ? '2563EB'
    : section.type === 'departments'
      ? 'D97706'
      : '0F766E';
  worksheet.mergeCells(`A1:${lastColumn}1`);
  worksheet.getCell('A1').value = section.title.toLocaleUpperCase('es-VE');
  worksheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12304A' } };
  worksheet.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  worksheet.getRow(1).height = 34;
  worksheet.mergeCells(`A2:${lastColumn}2`);
  worksheet.getCell('A2').value = 'Valores reportados por el centro · Las celdas vacías se muestran como guion';
  worksheet.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  worksheet.getCell('A2').alignment = { vertical: 'middle', indent: 1 };
  worksheet.addRow([]);
  const headerRow = 4;
  if (section.type === 'beds') {
    worksheet.addRow(['Dato', 'Cantidad']);
    section.stats.forEach(stat => worksheet.addRow([stat.label, stat.value]));
  } else if (section.type === 'monthly') {
    worksheet.addRow([
      'Indicador',
      ...(section.rows[0]?.values.map(value => value.label) || []),
      'Total anual',
    ]);
    section.rows.forEach(row => worksheet.addRow([
      row.label,
      ...row.values.map(value => value.value),
      row.annual,
    ]));
  } else {
    worksheet.addRow(['Indicador', ...section.columns.map(column => column.label)]);
    section.rows.forEach(row => worksheet.addRow([
      row.label,
      ...row.values.map(value => value.value),
    ]));
  }
  const headings = worksheet.getRow(headerRow);
  headings.height = 30;
  headings.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headings.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };
  headings.alignment = { vertical: 'middle', wrapText: true };
  worksheet.views = [{ state: 'frozen', ySplit: headerRow }];
  worksheet.columns.forEach((column, columnIndex) => {
    column.width = columnIndex === 0 ? 40 : 19;
  });
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 22;
    row.eachCell(cell => {
      cell.font = { color: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowNumber % 2 === 0 ? 'FFF1F7F9' : 'FFFFFFFF' },
      };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
  }
  worksheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: worksheet.columnCount },
  };
}

function ImportarExcel({ categoria, vista = 'importar', permitirImportar = false }) {
  const [importaciones, setImportaciones] = useState([]);
  const [hospitalesBD, setHospitalesBD] = useState([]);
  const [errorCatalogo, setErrorCatalogo] = useState('');
  const [importacionId, setImportacionId] = useState('');
  const [hojaId, setHojaId] = useState('');
  const [hojaEstado, setHojaEstado] = useState({ id: '', data: null });
  const [archivo, setArchivo] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [seccionId, setSeccionId] = useState('beds');
  const [rama, setRama] = useState('');
  const [cargando, setCargando] = useState(true);
  const [descargandoOriginal, setDescargandoOriginal] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [indicadorDashboard, setIndicadorDashboard] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tipoMensaje, setTipoMensaje] = useState('info');

  const importacionActiva = importaciones.find(item => String(item.id) === String(importacionId));
  const hojas = importacionActiva?.hojas || [];
  const hoja = hojaEstado.id === hojaId ? hojaEstado.data : null;
  const cargandoHoja = Boolean(hojaId) && hojaEstado.id !== hojaId;
  const metadata = useMemo(() => getWorkbookMetadata(hoja, hospitalesBD), [hoja, hospitalesBD]);
  const secciones = useMemo(
    () => buildWorkbookSections(hoja?.celdas || []),
    [hoja]
  );
  const seccionActiva = secciones.find(section => section.id === seccionId) || secciones[0];
  const alertasCalidad = useMemo(
    () => buildDataQualityAlerts(hoja, secciones, metadata),
    [hoja, secciones, metadata]
  );
  const seccionMovimiento = secciones.find(section => section.id === 'main-12');
  const buscarIndicador = (section, matcher) =>
    section?.rows.find(row => matcher.test(row.label));
  const admissions = buscarIndicador(seccionMovimiento, /admisiones/i);
  const discharges = buscarIndicador(seccionMovimiento, /^altas\b/i);
  const consultations = buscarIndicador(secciones.find(section => section.id === 'main-72'), /externas totales/i);
  const surgeries = buscarIndicador(secciones.find(section => section.id === 'main-82'), /^electivas$/i);
  const filasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase();
    if (!seccionActiva?.rows) return [];
    return seccionActiva.rows.filter(row =>
      [row.label, ...row.values.map(value => value.label)]
        .some(value => String(value ?? '').toLocaleLowerCase().includes(termino))
    );
  }, [seccionActiva, busqueda]);

  const cargarImportaciones = async (idPreferido = '') => {
    setCargando(true);
    try {
      const { data } = await api.get(`/importaciones/${categoria}`);
      setImportaciones(data);
      const idDisponible = data.some(item => String(item.id) === String(idPreferido))
        ? String(idPreferido)
        : String(data[0]?.id || '');
      setImportacionId(idDisponible);
      const hojasDisponibles = data.find(item => String(item.id) === idDisponible)?.hojas || [];
      setHojaId(hojasDisponibles.length ? String(hojasDisponibles[0].id) : '');
    } catch (error) {
      setMensaje(error.response?.data?.error || 'No se pudieron cargar las importaciones.');
      setTipoMensaje('error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    let activa = true;
    api.get(`/importaciones/${categoria}`)
      .then(({ data }) => {
        if (!activa) return;
        setImportaciones(data);
        const primera = data[0];
        setImportacionId(String(primera?.id || ''));
        setHojaId(String(primera?.hojas[0]?.id || ''));
      })
      .catch(error => {
        if (activa) {
          setMensaje(error.response?.data?.error || 'No se pudieron cargar las importaciones.');
          setTipoMensaje('error');
        }
      })
      .finally(() => {
        if (activa) setCargando(false);
      });

    return () => {
      activa = false;
    };
  }, [categoria]);

  useEffect(() => {
    let activa = true;
    api.get('/hospitales')
      .then(({ data }) => {
        if (activa) {
          setHospitalesBD(data);
          setErrorCatalogo('');
        }
      })
      .catch(error => {
        if (activa) {
          setErrorCatalogo(error.response?.data?.error || 'No se pudo consultar el catálogo para vincular códigos.');
        }
      });
    return () => {
      activa = false;
    };
  }, []);

  useEffect(() => {
    if (!importacionId || !hojaId) return undefined;

    let activa = true;
    api.get(`/importaciones/${categoria}/${importacionId}/hojas/${hojaId}`)
      .then(({ data }) => {
        if (activa) setHojaEstado({ id: hojaId, data });
      })
      .catch(error => {
        if (activa) {
          setHojaEstado({ id: hojaId, data: null });
          setMensaje(error.response?.data?.error || 'No se pudo abrir la hoja.');
          setTipoMensaje('error');
        }
      })

    return () => {
      activa = false;
    };
  }, [categoria, importacionId, hojaId]);

  const importar = async (event) => {
    event.preventDefault();
    if (!archivo) {
      setMensaje('Seleccione un archivo de Excel antes de importar.');
      setTipoMensaje('error');
      return;
    }
    if (archivo.size > 25 * 1024 * 1024) {
      setMensaje('El archivo no puede superar 25 MB.');
      setTipoMensaje('error');
      return;
    }

    setCargando(true);
    setMensaje('');
    try {
      const { data } = await api.post(`/importaciones/${categoria}`, archivo, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(archivo.name),
        },
        timeout: 120000,
      });
      setArchivo(null);
      event.target.reset();
      setMensaje(
        `Importación completada: ${data.hojas_importadas} hojas y ${data.centros.length} centros asociados.` +
        (data.hojas_plantilla_omitidas
          ? ` Se omitieron ${data.hojas_plantilla_omitidas} pestañas de plantilla sin centro asignado.`
          : '')
      );
      setTipoMensaje('success');
      await cargarImportaciones(data.id);
    } catch (error) {
      setMensaje(error.response?.data?.error || 'No se pudo importar el archivo. Verifique la conexión e inténtelo de nuevo.');
      setTipoMensaje('error');
    } finally {
      setCargando(false);
    }
  };

  const descargarOriginal = async () => {
    if (!importacionActiva) return;
    setDescargandoOriginal(true);
    try {
      const { data } = await api.get(
        `/importaciones/${categoria}/${importacionActiva.id}/archivo`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(data);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = importacionActiva.nombre_archivo;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setMensaje(error.response?.data?.error || 'No se pudo descargar el archivo original.');
      setTipoMensaje('error');
    } finally {
      setDescargandoOriginal(false);
    }
  };

  const seleccionarImportacion = (event) => {
    const seleccion = importaciones.find(item => String(item.id) === event.target.value);
    setImportacionId(event.target.value);
    setHojaId(seleccion?.hojas.length ? String(seleccion.hojas[0].id) : '');
    setBusqueda('');
    setSeccionId('beds');
    setRama('');
  };

  const seleccionarHoja = (event) => {
    setHojaId(event.target.value);
    setBusqueda('');
    setSeccionId('beds');
    setRama('');
  };

  const seleccionarSeccion = event => {
    setSeccionId(event.target.value);
    setRama('');
    setBusqueda('');
  };

  const exportarCentro = async () => {
    if (!hoja) return;
    setExportando(true);
    setMensaje('');
    try {
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Corposalud';
      workbook.subject = `${categoria.toUpperCase()} · ${hoja.centro_nombre}`;
      workbook.title = `Datos de ${hoja.centro_nombre}`;
      workbook.created = new Date();
      addExportCover(workbook, metadata, categoria, hoja, secciones);
      const usedNames = new Set();
      secciones.forEach((section, index) => addExportSection(workbook, section, index, usedNames));

      const bytes = await workbook.xlsx.writeBuffer();
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      const nombreCentro = hoja.centro_nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      enlace.href = url;
      enlace.download = `${categoria.toUpperCase()}_${nombreCentro}_${hoja.anio || 'datos'}.xlsx`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMensaje(`El archivo de ${metadata.name} se descargó correctamente.`);
      setTipoMensaje('success');
    } catch (error) {
      console.error('Error al crear Excel organizado:', error);
      setMensaje(`No se pudo crear el Excel. ${error.message || 'Inténtalo nuevamente.'}`);
      setTipoMensaje('error');
    } finally {
      setExportando(false);
    }
  };

  const tituloVista = {
    dashboard: 'Resumen del centro',
    reportes: 'Indicadores y reportes del centro',
    exportar: 'Exportar datos organizados',
    alertas: 'Información y centros incluidos en el libro',
    datos: 'Datos detallados del centro',
    importar: permitirImportar ? 'Importar y consultar información' : 'Consultar información',
  }[vista] || 'Información del centro';

  return (
    <section className="space-y-6">
      <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-white via-white to-blue-50 p-6 shadow-sm ring-1 ring-slate-200/80 sm:p-8">
        <div className="absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full bg-blue-100/60 blur-2xl" aria-hidden="true" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-900">
                {categoria.toUpperCase()} · Corposalud
              </span>
              {hoja && (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
                  {hoja.anio ? `Reporte ${hoja.anio}` : 'Año no indicado'}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{tituloVista}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Explora la información por centro de salud. Camas, actividad y servicios aparecen organizados para una consulta rápida y clara.
            </p>
          </div>
          {hoja && (
            <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Centro seleccionado</p>
              <p className="mt-1 max-w-sm font-bold text-slate-900">{metadata.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {metadata.code ? `Código ${metadata.code}` : 'Código pendiente de vincular'}
              </p>
            </div>
          )}
        </div>
      </div>
      {permitirImportar && (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            {categoria.toUpperCase()} · Importación Excel
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Libro de movimiento hospitalario</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Selecciona un centro para consultar sus camas, indicadores y datos por servicio en tablas claras.
            Los cálculos se muestran como resultados y nunca se presentan fórmulas ni referencias de Excel.
            Las pestañas genéricas sin centro se conservan en el libro original, pero no se mezclan con los centros.
          </p>
        </div>

        <form onSubmit={importar} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-slate-700">
            Archivo Excel
            <input
              type="file"
              accept=".xlsx,.xlsm"
              onChange={event => setArchivo(event.target.files?.[0] || null)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-800"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Formatos .xlsx o .xlsm. Tamaño máximo: 25 MB.
            </span>
          </label>
          <button
            type="submit"
            disabled={cargando}
            className="rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargando ? 'Procesando…' : 'Importar libro'}
          </button>
        </form>

        {mensaje && (
          <p
            role="status"
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              tipoMensaje === 'error'
                ? 'bg-red-50 text-red-800'
                : tipoMensaje === 'success'
                  ? 'bg-green-50 text-green-800'
                  : 'bg-blue-50 text-blue-800'
            }`}
          >
            {mensaje}
          </p>
        )}
      </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Elige qué información consultar</h3>
            <p className="mt-1 text-sm text-slate-500">Los datos mostrados pertenecen únicamente a {categoria.toUpperCase()}.</p>
          </div>
          {hoja && (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              {hojas.length} centros disponibles
            </span>
          )}
        </div>
        <div className="mb-5 grid gap-4 rounded-2xl bg-slate-50/80 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex-1 text-sm font-medium text-slate-700">
            Libro de información
            <select
              value={importacionId}
              onChange={seleccionarImportacion}
              disabled={cargando || importaciones.length === 0}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
            >
              {importaciones.length === 0 && <option value="">Todavía no hay importaciones</option>}
              {importaciones.map(item => (
                <option key={item.id} value={item.id}>
                  {item.nombre_archivo} · {new Date(item.creado_en).toLocaleString('es-VE')}
                </option>
              ))}
            </select>
          </label>

          <label className="flex-1 text-sm font-medium text-slate-700">
            Centro de salud
            <select
              value={hojaId}
              onChange={seleccionarHoja}
              disabled={hojas.length === 0}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
            >
              {hojas.length === 0 && <option value="">No hay centros clasificados</option>}
              {hojas.map(item => (
                <option key={item.id} value={item.id}>
                  {item.centro_nombre}
                  {item.anio ? ` · ${item.anio}` : ''}
                </option>
              ))}
            </select>
          </label>

          {hoja && ['reportes', 'exportar', 'datos'].includes(vista) && (
            <label className="text-sm font-medium text-slate-700">
              {vista === 'exportar'
                ? 'Sección para la vista previa'
                : vista === 'datos'
                  ? 'Sección de datos'
                  : 'Reporte o sección'}
              <select
                value={seccionActiva?.id || ''}
                onChange={seleccionarSeccion}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {secciones.map(section => (
                  <option key={section.id} value={section.id}>{section.title}</option>
                ))}
              </select>
            </label>
          )}

          {['reportes', 'exportar', 'datos'].includes(vista) && seccionActiva?.type === 'departments' && (
            <label className="text-sm font-medium text-slate-700">
              Servicio o rama
              <select
                value={rama}
                onChange={event => setRama(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Todos los servicios</option>
                {seccionActiva.columns.map(column => (
                  <option key={column.column} value={column.label}>{column.label}</option>
                ))}
              </select>
            </label>
          )}

          {['reportes', 'importar', 'datos', 'exportar'].includes(vista) &&
            seccionActiva?.type !== 'beds' && (
            <label className="text-sm font-medium text-slate-700">
              Buscar indicador o servicio
              <input
                type="search"
                value={busqueda}
                onChange={event => setBusqueda(event.target.value)}
                placeholder="Ej.: camas, consultas, laboratorio"
                disabled={!hoja}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>
          )}
        </div>

        {importacionActiva && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              <span><strong className="text-blue-950">{hojas.length}</strong> centros clasificados</span>
              <span><strong className="text-blue-950">{importacionActiva.hojas_omitidas}</strong> plantillas omitidas</span>
              {hoja && (
                <>
                  {hoja.anio && <span>Año del reporte: <strong className="text-slate-900">{hoja.anio}</strong></span>}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={descargarOriginal}
              disabled={descargandoOriginal}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
            >
              {descargandoOriginal ? 'Preparando…' : 'Descargar Excel original'}
            </button>
          </div>
        )}
        {errorCatalogo && (
          <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {errorCatalogo}
          </p>
        )}

        {cargandoHoja || cargando ? (
          <p className="py-12 text-center text-slate-500">Cargando datos…</p>
        ) : !importacionActiva ? (
          <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-slate-500">
            Aún no hay un libro importado para {categoria.toUpperCase()}. Administración puede cargarlo desde la pestaña de importación.
          </p>
        ) : !seccionActiva ? (
          <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-slate-500">
            Esta hoja no contiene información que se pueda mostrar.
          </p>
        ) : vista === 'dashboard' ? (
          <>
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Centro de salud</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{metadata.name}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {[
                  metadata.state && `Estado ${metadata.state}`,
                  metadata.municipality && `Municipio ${metadata.municipality}`,
                  metadata.type && `Tipo ${metadata.type}`,
                ].filter(Boolean).join(' · ') || 'El libro no incluye municipio ni tipo de centro.'}
              </p>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Código institucional: {metadata.code
                  ? `${metadata.code}${metadata.codeSource ? ` (tomado de ${metadata.codeSource})` : ''}`
                  : 'no indicado en el libro ni vinculado a un centro con nombre coincidente en la base de datos'}
              </p>
            </div>
            <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: 'Camas totales',
                  value: secciones[0]?.stats.find(stat => stat.label === 'Total de camas')?.value || '—',
                  group: 'Capacidad',
                  color: 'border-blue-200 bg-blue-50 text-blue-950',
                },
                {
                  label: 'Camas de hospitalización',
                  value: secciones[0]?.stats.find(stat => stat.label === 'Camas de hospitalización')?.value || '—',
                  group: 'Capacidad',
                  color: 'border-blue-200 bg-blue-50 text-blue-950',
                },
                {
                  label: 'Capacidad operativa',
                  value: secciones[0]?.stats.find(stat => stat.label === 'Capacidad operativa')?.value || '—',
                  group: 'Capacidad',
                  color: 'border-blue-200 bg-blue-50 text-blue-950',
                },
                { label: 'Admisiones en el año', value: admissions?.annual || '—', group: 'Actividad', color: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
                { label: 'Altas en el año', value: discharges?.annual || '—', group: 'Actividad', color: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
                { label: 'Consultas externas anuales', value: consultations?.annual || '—', group: 'Actividad', color: 'border-violet-200 bg-violet-50 text-violet-950' },
                { label: 'Cirugías electivas anuales', value: surgeries?.annual || '—', group: 'Actividad', color: 'border-violet-200 bg-violet-50 text-violet-950' },
                { label: 'Año del libro', value: hoja.anio || 'No indicado', group: 'Reporte', color: 'border-amber-200 bg-amber-50 text-amber-950' },
              ].map(card => (
                <article key={card.label} className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${card.color}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">{card.group}</span>
                    <span className="h-2 w-2 rounded-full bg-current opacity-50" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium opacity-80">{card.label}</p>
                  <p className="mt-1 break-words text-2xl font-bold tracking-tight">{card.value}</p>
                </article>
              ))}
            </div>
            <MonthlyChart
              section={seccionMovimiento}
              selectedLabel={indicadorDashboard}
              onSelect={setIndicadorDashboard}
            />
          </>
        ) : vista === 'reportes' ? (
          <>
            <div className="mb-5 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 text-sm text-blue-950">
              Reportes de <strong>{metadata.name}</strong>
              {metadata.code && <> · Código <strong>{metadata.code}</strong></>}
              {metadata.municipality && <> · Municipio <strong>{metadata.municipality}</strong></>}
            </div>
            {seccionActiva.type === 'monthly' && (
              <MonthlyChart
                section={seccionActiva}
                selectedLabel={indicadorDashboard}
                onSelect={setIndicadorDashboard}
              />
            )}
            <div className="mt-6">
              <DataSection section={seccionActiva} rows={filasFiltradas} rama={rama} busqueda={busqueda} />
            </div>
          </>
        ) : vista === 'alertas' ? (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Camas totales', secciones[0]?.stats.find(stat => stat.label === 'Total de camas')?.value || '—'],
                ['Camas operativas', secciones[0]?.stats.find(stat => stat.label === 'Capacidad operativa')?.value || '—'],
                ['Datos guardados', new Intl.NumberFormat('es-VE').format(hoja.cantidad_celdas)],
                ['Año reportado', hoja.anio || 'No indicado'],
              ].map(([label, value]) => (
                <article key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-600">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
                </article>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm">
                <h3 className="mb-4 text-lg font-bold text-slate-900">Revisión de calidad de datos</h3>
                <DataQualityAlerts alerts={alertasCalidad} />
                <p className="mt-4 text-xs text-slate-500">
                  Estas alertas revisan el contenido del Excel. No indican si el centro envió o no un reporte mensual por otro medio.
                </p>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm">
                <h3 className="mb-4 text-lg font-bold text-slate-900">
                  Centros incluidos en {categoria.toUpperCase()} ({hojas.length})
                </h3>
                <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                  {hojas.map(center => (
                    <button
                      key={center.id}
                      type="button"
                      onClick={() => seleccionarHoja({ target: { value: String(center.id) } })}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left text-sm transition ${
                        String(center.id) === String(hojaId)
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-medium text-slate-800">{center.centro_nombre}</span>
                      <span className="shrink-0 text-slate-500">
                        {center.anio || 'Año s/d'} · {new Intl.NumberFormat('es-VE').format(center.cantidad_celdas)} datos
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  La lista corresponde solo al libro y la clasificación seleccionados.
                </p>
              </section>
            </div>
          </>
        ) : vista === 'exportar' ? (
          <>
            <div className="mb-5 overflow-hidden rounded-2xl border border-green-200 bg-white shadow-sm">
              <div className="bg-gradient-to-r from-green-800 to-emerald-700 px-5 py-5 text-white sm:px-7">
                <p className="text-sm font-semibold uppercase tracking-wide text-green-100">
                  Archivo listo para preparar
                </p>
                <h3 className="mt-1 text-xl font-bold">Exportar datos de {metadata.name}</h3>
                <p className="mt-1 text-sm text-green-50">
                  Solo se incluirá la información del centro y la clasificación seleccionados.
                </p>
              </div>
              <div className="p-5 sm:p-7">
                <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      title: 'Camas y capacidad',
                      count: secciones.filter(section => section.type === 'beds').length,
                      color: 'border-blue-100 bg-blue-50 text-blue-950',
                    },
                    {
                      title: 'Actividad hospitalaria',
                      count: secciones.filter(section =>
                        section.id.startsWith('main-') || section.id === 'usage-indicators'
                      ).length,
                      color: 'border-violet-100 bg-violet-50 text-violet-950',
                    },
                    {
                      title: 'Servicios y ramas',
                      count: secciones.filter(section => section.type === 'departments').length,
                      color: 'border-amber-100 bg-amber-50 text-amber-950',
                    },
                    {
                      title: 'Áreas clínicas',
                      count: secciones.filter(section => section.id.startsWith('clinical-')).length,
                      color: 'border-teal-100 bg-teal-50 text-teal-950',
                    },
                  ].map(group => (
                    <article key={group.title} className={`rounded-xl border p-4 ${group.color}`}>
                      <p className="text-sm font-medium">{group.title}</p>
                      <p className="mt-1 text-2xl font-bold">{group.count}</p>
                      <p className="text-xs opacity-80">{group.count === 1 ? 'hoja' : 'hojas'} en el Excel</p>
                    </article>
                  ))}
                </div>
                <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-700">
                      <strong>{metadata.code ? `Código ${metadata.code}` : 'Código no vinculado'}</strong>
                      <span className="mx-2 text-slate-300">·</span>
                      Año {hoja.anio || 'no indicado'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Formato Excel (.xlsx) · {secciones.length} hojas organizadas por tema
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportarCentro}
                    disabled={!hoja || exportando}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                  >
                    {exportando ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                        Preparando {secciones.length} hojas…
                      </>
                    ) : 'Descargar Excel del centro'}
                  </button>
                </div>
                {mensaje && (
                  <p
                    role="status"
                    className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                      tipoMensaje === 'error'
                        ? 'bg-red-50 text-red-800'
                        : tipoMensaje === 'success'
                          ? 'bg-green-50 text-green-800'
                          : 'bg-blue-50 text-blue-800'
                    }`}
                  >
                    {mensaje}
                  </p>
                )}
              </div>
            </div>
            <p className="mb-3 text-sm font-medium text-slate-600">
              Vista previa de datos: {seccionActiva.title}
            </p>
            <DataSection section={seccionActiva} rows={filasFiltradas} rama={rama} busqueda={busqueda} />
          </>
        ) : (
          <DataSection section={seccionActiva} rows={filasFiltradas} rama={rama} busqueda={busqueda} />
        )}
      </div>
    </section>
  );
}

function DataSection({ section, rows, rama, busqueda }) {
  if (section.type === 'beds') {
    return (
      <section aria-label="Camas y capacidad">
        <h3 className="mb-4 text-lg font-bold text-slate-900">{section.title}</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {section.stats.map(stat => (
            <article key={stat.label} className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="absolute right-4 top-4 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">Capacidad</div>
              <p className="pr-20 text-sm font-medium text-slate-600">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold tracking-tight text-blue-950">{stat.value}</p>
              <p className="mt-1 text-xs text-slate-500">según el reporte del centro</p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          La capacidad operativa y presupuestaria se muestran según los valores informados por el centro.
        </p>
      </section>
    );
  }

  if (!rows.length) {
    return (
      <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-slate-500">
        {busqueda ? 'No se encontraron indicadores con ese nombre.' : 'Esta sección no contiene datos para mostrar.'}
      </p>
    );
  }

  return (
    <section>
      <h3 className="mb-4 text-lg font-bold text-slate-900">{section.title}</h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="min-w-64 px-4 py-3">Indicador</th>
              {section.type === 'departments'
                ? section.columns
                  .filter(column => !rama || column.label === rama)
                  .map(column => <th key={column.column} className="min-w-28 px-4 py-3">{column.label}</th>)
                : section.rows[0]?.values.map(value => (
                  <th key={value.label} className="min-w-24 px-4 py-3">{value.label}</th>
                ))}
              {section.type === 'monthly' && <th className="min-w-28 px-4 py-3">Total anual</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-t border-slate-100 align-top transition-colors odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/70">
                <th scope="row" className="min-w-64 px-4 py-3 text-left font-semibold text-slate-800">
                  {row.label}
                </th>
                {section.type === 'departments'
                  ? row.values
                    .filter(value => !rama || value.label === rama)
                    .map(value => <td key={value.label} className="whitespace-nowrap px-4 py-3 text-slate-700">{value.value}</td>)
                  : row.values.map(value => (
                    <td key={value.label} className="whitespace-nowrap px-4 py-3 text-slate-700">{value.value}</td>
                  ))}
                {section.type === 'monthly' && (
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">{row.annual}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Se muestran los valores reportados por el centro. Los guiones indican que no hay un dato registrado.
      </p>
    </section>
  );
}

export default ImportarExcel;
