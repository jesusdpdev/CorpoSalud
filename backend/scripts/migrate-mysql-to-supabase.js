require('dotenv').config();

const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');

const TABLES = [
  'roles',
  'municipios',
  'categorias_indicador',
  'servicios',
  'especialidades',
  'tipos_atencion',
  'periodos',
  'hospitales',
  'indicadores',
  'usuarios',
  'hospital_servicios',
  'movimientos',
  'atenciones',
  'auditoria',
  'alertas_contactos',
  'excel_importaciones',
  'excel_importacion_hojas',
];

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function validateEnvironment() {
  const required = [
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
  }
}

async function ensureStorageBucket(storage, bucketName) {
  const { data, error } = await storage.listBuckets();
  if (error) throw new Error(`No se pudo consultar Supabase Storage: ${error.message}`);
  if (data.some(bucket => bucket.name === bucketName)) return;

  const { error: createError } = await storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: '50MB',
  });
  if (createError) throw new Error(`No se pudo crear el bucket privado: ${createError.message}`);
}

async function migrate() {
  validateEnvironment();
  const source = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.SOURCE_DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
  const target = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    max: 2,
  });
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'excel-imports';
  const uploadedPaths = [];

  try {
    await ensureStorageBucket(supabase.storage, bucketName);
    for (const table of TABLES) {
      await target.query(`SELECT 1 FROM ${quoteIdentifier(table)} LIMIT 1`);
      const { rows } = await target.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`);
      if (rows[0].count > 0) {
        throw new Error(`La tabla "${table}" en Supabase no está vacía; se cancela la migración para evitar duplicar datos.`);
      }
    }

    const migrationPrefix = `migration-${randomUUID()}`;
    await target.query('BEGIN');
    const migratedCounts = [];

    for (const table of TABLES) {
      const [sourceRows] = await source.query(`SELECT * FROM \`${table}\``);
      const targetColumns = table === 'excel_importaciones'
        ? Object.keys(sourceRows[0] || {}).filter(column => column !== 'archivo').concat('storage_path')
        : Object.keys(sourceRows[0] || {});

      for (const sourceRow of sourceRows) {
        const row = { ...sourceRow };
        if (table === 'excel_importaciones') {
          const filename = String(row.nombre_archivo).replace(/[\\/:*?"<>|]/g, '_');
          const path = `${migrationPrefix}/${row.id}/${filename}`;
          const isMacroEnabled = filename.toLowerCase().endsWith('.xlsm');
          const { error } = await supabase.storage.from(bucketName).upload(path, row.archivo, {
            contentType: isMacroEnabled
              ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            upsert: false,
          });
          if (error) throw new Error(`No se pudo migrar un Excel a Storage: ${error.message}`);
          uploadedPaths.push(path);
          row.storage_path = path;
          delete row.archivo;
        }

        const values = targetColumns.map(column => row[column]);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        const columnsSql = targetColumns.map(quoteIdentifier).join(', ');
        await target.query(
          `INSERT INTO ${quoteIdentifier(table)} (${columnsSql}) VALUES (${placeholders})`,
          values
        );
      }
      migratedCounts.push({ table, count: sourceRows.length });
      console.log(`Migrated ${sourceRows.length} rows from ${table}.`);
    }

    for (const table of TABLES) {
      const { rows } = await target.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST(COALESCE(MAX(id), 1), 1), COUNT(*) > 0)
         FROM ${quoteIdentifier(table)}`,
        [`public.${table}`]
      );
      if (!rows) throw new Error(`No se pudo sincronizar la secuencia de ${table}.`);
    }
    await target.query('COMMIT');
    console.log('Migration completed. Row counts:', JSON.stringify(migratedCounts));
    console.log(`Excel files were copied to the private "${bucketName}" bucket.`);
  } catch (error) {
    try {
      await target.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Could not roll back the target database transaction:', rollbackError.message);
    }
    if (uploadedPaths.length) {
      const { error: cleanupError } = await supabase.storage.from(bucketName).remove(uploadedPaths);
      if (cleanupError) {
        console.error('Could not clean up uploaded Excel files after migration failure:', cleanupError.message);
      }
    }
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

migrate().catch(error => {
  console.error('MySQL to Supabase migration failed:', error.message);
  process.exitCode = 1;
});
