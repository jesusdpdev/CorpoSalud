const jwt = require('jsonwebtoken');
const pool = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? '' : 'clave_secreta_solo_desarrollo'
);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET debe configurarse en el entorno del servidor.');
}

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Debe iniciar sesión para continuar' });
  }

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: 'La sesión no es válida o ha vencido' });
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, email, rol_id, activo FROM usuarios WHERE id = ?',
      [claims.id]
    );
    if (!users.length || Number(users[0].activo) === 0) {
      return res.status(401).json({ error: 'La cuenta no existe o está desactivada' });
    }
    req.user = {
      ...claims,
      id: users[0].id,
      email: users[0].email,
      rol_id: Number(users[0].rol_id),
    };
    return next();
  } catch (error) {
    console.error('No se pudo verificar el estado actual de la cuenta:', error);
    return res.status(503).json({ error: 'No se pudo verificar la sesión. Intente de nuevo.' });
  }
}

function authorizeCategory(req, res, next) {
  const rolesByCategory = { asir: 1, asic: 2 };
  const category = req.params.categoria;
  const role = Number(req.user?.rol_id);

  if (!rolesByCategory[category]) {
    return res.status(400).json({ error: 'Clasificación no válida' });
  }

  if (role !== rolesByCategory[category] && role !== 3) {
    return res.status(403).json({ error: 'No tiene permiso para acceder a esta clasificación' });
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (Number(req.user?.rol_id) !== 3) {
    return res.status(403).json({ error: 'Solo administración puede realizar esta acción' });
  }
  return next();
}

module.exports = { authenticate, authorizeCategory, requireAdmin };
