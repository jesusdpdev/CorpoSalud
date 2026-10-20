const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const VALID_ROLES = new Set([1, 2, 3, 4]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.use(authenticate, requireAdmin);

function validateName(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
}

function validateEmail(value) {
  return typeof value === 'string' &&
    value.trim().length <= 254 &&
    EMAIL_PATTERN.test(value.trim().toLowerCase());
}

function validatePassword(value) {
  return typeof value === 'string' &&
    value.length >= 8 &&
    Buffer.byteLength(value, 'utf8') <= 72 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value);
}

function getDuplicateEmailError(error) {
  if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
    return { status: 409, message: 'Ese correo ya está registrado' };
  }
  return null;
}

router.get('/usuarios', async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, nombre, email, rol_id, activo
       FROM usuarios
       ORDER BY nombre, id`
    );
    return res.json(users);
  } catch (error) {
    console.error('Error al cargar usuarios para administración:', error);
    return res.status(500).json({ error: 'No se pudieron cargar los usuarios' });
  }
});

router.post('/usuarios', async (req, res) => {
  const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const rolId = Number(req.body.rol_id);
  const { password } = req.body;

  if (!validateName(nombre)) {
    return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Ingrese un correo electrónico válido (máximo 254 caracteres)' });
  }
  if (!VALID_ROLES.has(rolId)) {
    return res.status(400).json({ error: 'Seleccione un perfil válido' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({
      error: 'La contraseña requiere 8 caracteres como mínimo, una mayúscula, una minúscula y un número (máximo 72 bytes)',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = pool.postgres
      ? await pool.execute(
        `INSERT INTO usuarios (nombre, email, password_hash, rol_id, activo)
         VALUES (?, ?, ?, ?, 1) RETURNING id`,
        [nombre, email, passwordHash, rolId]
      )
      : await pool.execute(
        `INSERT INTO usuarios (nombre, email, password_hash, rol_id, activo)
         VALUES (?, ?, ?, ?, 1)`,
        [nombre, email, passwordHash, rolId]
      );
    return res.status(201).json({
      id: result.insertId,
      nombre,
      email,
      rol_id: rolId,
      activo: 1,
    });
  } catch (error) {
    const duplicate = getDuplicateEmailError(error);
    if (duplicate) return res.status(duplicate.status).json({ error: duplicate.message });
    console.error('Error al crear usuario desde administración:', error);
    return res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
});

router.put('/usuarios/:id', async (req, res) => {
  const id = Number(req.params.id);
  const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const rolId = Number(req.body.rol_id);
  const activo = req.body.activo;

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Identificador de usuario no válido' });
  }
  if (!validateName(nombre)) {
    return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Ingrese un correo electrónico válido (máximo 254 caracteres)' });
  }
  if (!VALID_ROLES.has(rolId)) {
    return res.status(400).json({ error: 'Seleccione un perfil válido' });
  }
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El estado del usuario no es válido' });
  }

  const isSelf = id === Number(req.user.id);
  if (isSelf && (rolId !== 3 || !activo)) {
    return res.status(400).json({ error: 'No puedes quitarte el perfil de administrador ni desactivar tu propia cuenta' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [admins] = await connection.query(
      'SELECT id FROM usuarios WHERE rol_id = 3 AND activo = 1 FOR UPDATE'
    );
    const [targetRows] = await connection.execute(
      'SELECT id, rol_id, activo FROM usuarios WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!targetRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'No se encontró el usuario' });
    }

    const target = targetRows[0];
    const losesAdminAccess = Number(target.rol_id) === 3 && Number(target.activo) === 1 &&
      (rolId !== 3 || !activo);
    if (losesAdminAccess && admins.length <= 1) {
      await connection.rollback();
      return res.status(409).json({ error: 'Debe quedar al menos una cuenta administradora activa' });
    }

    await connection.execute(
      `UPDATE usuarios
       SET nombre = ?, email = ?, rol_id = ?, activo = ?
       WHERE id = ?`,
      [nombre, email, rolId, activo ? 1 : 0, id]
    );
    await connection.commit();
    return res.json({ id, nombre, email, rol_id: rolId, activo: activo ? 1 : 0 });
  } catch (error) {
    if (connection) await connection.rollback();
    const duplicate = getDuplicateEmailError(error);
    if (duplicate) return res.status(duplicate.status).json({ error: duplicate.message });
    console.error('Error al actualizar usuario desde administración:', error);
    return res.status(500).json({ error: 'No se pudo actualizar el usuario' });
  } finally {
    connection?.release();
  }
});

router.put('/usuarios/:id/password', async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body;

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Identificador de usuario no válido' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({
      error: 'La contraseña requiere 8 caracteres como mínimo, una mayúscula, una minúscula y un número (máximo 72 bytes)',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'UPDATE usuarios SET password_hash = ? WHERE id = ?',
      [passwordHash, id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'No se encontró el usuario' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al restablecer contraseña desde administración:', error);
    return res.status(500).json({ error: 'No se pudo restablecer la contraseña' });
  }
});

module.exports = router;
