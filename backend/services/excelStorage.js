const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'excel-imports';

let client;

function getStorage() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store Excel files.');
  }
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return client.storage.from(BUCKET);
}

async function uploadExcel(path, data, contentType) {
  const { error } = await getStorage().upload(path, data, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`No se pudo guardar el Excel en Supabase Storage: ${error.message}`);
  return path;
}

async function downloadExcel(path) {
  const { data, error } = await getStorage().download(path);
  if (error) throw new Error(`No se pudo descargar el Excel desde Supabase Storage: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function removeExcel(path) {
  const { error } = await getStorage().remove([path]);
  if (error) throw new Error(`No se pudo limpiar el Excel en Supabase Storage: ${error.message}`);
}

module.exports = { uploadExcel, downloadExcel, removeExcel };
