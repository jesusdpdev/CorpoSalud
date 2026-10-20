const express = require('express');
const pool = require('../database');
const { authenticate, authorizeCategory, requireAdmin } = require('../middleware/auth');
const { parseWorkbook } = require('../services/excelParser');
const { uploadExcel, downloadExcel, removeExcel } = require('../services/excelStorage');
const { randomUUID } = require('node:crypto');

const router = express.Router();
const MAX_FILE_SIZE = 25 * 1024 * 1024;

router.use(authenticate);

async function ensureTables() {
  if (pool.postgres) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS excel_importaciones (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      categoria ENUM('asir', 'asic') NOT NULL,
      nombre_archivo VARCHAR(255) NOT NULL,
      importado_por BIGINT UNSIGNED NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cantidad_hojas INT UNSIGNED NOT NULL DEFAULT 0,
      hojas_omitidas INT UNSIGNED NOT NULL DEFAULT 0,
      archivo LONGBLOB NOT NULL,
      INDEX idx_excel_categoria_fecha (categoria, creado_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS excel_importacion_hojas (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      importacion_id BIGINT UNSIGNED NOT NULL,
      nombre_hoja VARCHAR(255) NOT NULL,
      centro_nombre VARCHAR(255) NOT NULL,
      anio SMALLINT UNSIGNED NULL,
      rango_usado VARCHAR(32) NULL,
      cantidad_celdas INT UNSIGNED NOT NULL DEFAULT 0,
      celdas_json LONGTEXT NOT NULL,
      UNIQUE KEY uq_excel_importacion_hoja (importacion_id, nombre_hoja),
      CONSTRAINT fk_excel_importacion_hojas
        FOREIGN KEY (importacion_id) REFERENCES excel_importaciones(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function decodeFileName(value) {
  if (!value) return 'reporte.xlsx';
  try {
    return decodeURIComponent(value).replace(/[\\/:*?"<>|]/g, '_').slice(0, 255);
  } catch (error) {
    return 'reporte.xlsx';
  }
}

router.post('/:categoria', requireAdmin, authorizeCategory, express.raw({
  type: 'application/octet-stream',
  limit: MAX_FILE_SIZE,
}), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Seleccione un archivo Excel válido' });
  }

  let workbookData;
  try {
    workbookData = await parseWorkbook(req.body);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }

  const { sheets, skippedSheets } = workbookData;
  const nombreArchivo = decodeFileName(req.headers['x-file-name']);
  let storagePath = null;
  try {
    await ensureTables();
    if (pool.postgres) {
      const extension = nombreArchivo.toLowerCase().endsWith('.xlsm') ? 'xlsm' : 'xlsx';
      const contentType = extension === 'xlsm'
        ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      storagePath = `${req.params.categoria}/${randomUUID()}/${nombreArchivo}`;
      await uploadExcel(storagePath, req.body, contentType);
    }
    const connection = await pool.getConnection();
    let importId;
    try {
      await connection.beginTransaction();
      const [result] = pool.postgres
        ? await connection.execute(
          `INSERT INTO excel_importaciones
            (categoria, nombre_archivo, importado_por, cantidad_hojas, hojas_omitidas, storage_path)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
          [req.params.categoria, nombreArchivo, req.user.id, sheets.length, skippedSheets, storagePath]
        )
        : await connection.execute(
          `INSERT INTO excel_importaciones
            (categoria, nombre_archivo, importado_por, cantidad_hojas, hojas_omitidas, archivo)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.params.categoria, nombreArchivo, req.user.id, sheets.length, skippedSheets, req.body]
        );
      importId = result.insertId;

      for (const sheet of sheets) {
        await connection.execute(
          `INSERT INTO excel_importacion_hojas
            (importacion_id, nombre_hoja, centro_nombre, anio, rango_usado, cantidad_celdas, celdas_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            importId,
            sheet.sheetName,
            sheet.centerName,
            sheet.year,
            sheet.range,
            sheet.cellCount,
            JSON.stringify(sheet.cells),
          ]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return res.status(201).json({
      id: importId,
      categoria: req.params.categoria,
      nombre_archivo: nombreArchivo,
      hojas_importadas: sheets.length,
      hojas_plantilla_omitidas: skippedSheets,
      centros: sheets.map(({ sheetName, centerName, year, cellCount }) => ({
        hoja: sheetName,
        centro: centerName,
        anio: year,
        casillas: cellCount,
      })),
    });
  } catch (error) {
    if (storagePath) {
      try {
        await removeExcel(storagePath);
      } catch (cleanupError) {
        console.error('No se pudo limpiar un archivo Excel después de una importación fallida:', cleanupError);
      }
    }
    console.error('Error al importar libro Excel:', error);
    return res.status(500).json({ error: 'No se pudo guardar la importación. Verifique la conexión y permisos de la base de datos.' });
  }
});

router.get('/:categoria', authorizeCategory, async (req, res) => {
  try {
    await ensureTables();
    const [imports] = await pool.execute(
      `SELECT id, nombre_archivo, creado_en, cantidad_hojas, hojas_omitidas
       FROM excel_importaciones
       WHERE categoria = ?
       ORDER BY creado_en DESC
       LIMIT 50`,
      [req.params.categoria]
    );

    if (imports.length === 0) return res.json([]);
    const ids = imports.map(item => item.id);
    const placeholders = ids.map(() => '?').join(', ');
    const [sheets] = await pool.query(
      `SELECT id, importacion_id, nombre_hoja, centro_nombre, anio, rango_usado, cantidad_celdas
       FROM excel_importacion_hojas
       WHERE importacion_id IN (${placeholders})
       ORDER BY centro_nombre, nombre_hoja`,
      ids
    );
    const sheetsByImport = new Map();
    for (const sheet of sheets) {
      const importSheets = sheetsByImport.get(sheet.importacion_id) || [];
      importSheets.push(sheet);
      sheetsByImport.set(sheet.importacion_id, importSheets);
    }
    return res.json(imports.map(item => ({
      ...item,
      hojas: sheetsByImport.get(item.id) || [],
    })));
  } catch (error) {
    console.error('Error al consultar importaciones Excel:', error);
    return res.status(500).json({ error: 'No se pudieron cargar las importaciones' });
  }
});

router.get('/:categoria/:importacionId/archivo', authorizeCategory, async (req, res) => {
  const importId = Number(req.params.importacionId);
  if (!Number.isSafeInteger(importId)) {
    return res.status(400).json({ error: 'Identificador de importación no válido' });
  }

  try {
    await ensureTables();
    const [rows] = await pool.execute(
      `SELECT nombre_archivo, ${pool.postgres ? 'storage_path' : 'archivo'}
       FROM excel_importaciones
       WHERE id = ? AND categoria = ?`,
      [importId, req.params.categoria]
    );
    if (!rows.length) return res.status(404).json({ error: 'No se encontró el archivo importado' });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].nombre_archivo)}`,
    });
    const file = pool.postgres
      ? await downloadExcel(rows[0].storage_path)
      : rows[0].archivo;
    return res.send(file);
  } catch (error) {
    console.error('Error al descargar archivo Excel importado:', error);
    return res.status(500).json({ error: 'No se pudo descargar el archivo original' });
  }
});

router.get('/:categoria/:importacionId/hojas/:hojaId', authorizeCategory, async (req, res) => {
  const importId = Number(req.params.importacionId);
  const sheetId = Number(req.params.hojaId);
  if (!Number.isSafeInteger(importId) || !Number.isSafeInteger(sheetId)) {
    return res.status(400).json({ error: 'Identificador de importación no válido' });
  }

  try {
    await ensureTables();
    const [rows] = await pool.execute(
      `SELECT h.id, h.nombre_hoja, h.centro_nombre, h.anio, h.rango_usado,
              h.cantidad_celdas, h.celdas_json
       FROM excel_importacion_hojas h
       JOIN excel_importaciones i ON i.id = h.importacion_id
       WHERE i.id = ? AND h.id = ? AND i.categoria = ?`,
      [importId, sheetId, req.params.categoria]
    );
    if (!rows.length) return res.status(404).json({ error: 'No se encontró la hoja solicitada' });
    const { celdas_json: cellsJson, ...sheet } = rows[0];
    return res.json({ ...sheet, celdas: JSON.parse(cellsJson) });
  } catch (error) {
    console.error('Error al leer hoja Excel importada:', error);
    return res.status(500).json({ error: 'No se pudo cargar el contenido de la hoja' });
  }
});

module.exports = router;
