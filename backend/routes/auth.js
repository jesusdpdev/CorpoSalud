const express = require("express");
const bcrypt = require("bcrypt");
const pool = require('../database');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || (
    process.env.NODE_ENV === 'production' ? '' : 'clave_secreta_solo_desarrollo'
);

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET debe configurarse en el entorno del servidor.');
}

const router = express.Router();

// ============ RUTA DE REGISTRO ============
router.post('/register', async (req, res) => {
    try {
        const { email, password, nombre } = req.body;

        const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : '';
        const nombreNormalizado = typeof nombre === 'string' ? nombre.trim() : '';

        if (!emailNormalizado || !password || !nombreNormalizado) {
            return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailNormalizado)) {
            return res.status(400).json({ error: "El formato de email es inválido." });
        }
        if (emailNormalizado.length > 254) {
            return res.status(400).json({ error: 'El correo no puede superar los 254 caracteres' });
        }

        if (nombreNormalizado.length < 2 || nombreNormalizado.length > 100) {
            return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres' });
        }

        if (typeof password !== 'string' || password.length < 8 ||
            Buffer.byteLength(password, 'utf8') > 72 ||
            !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
            return res.status(400).json({
                error: 'La contraseña debe tener 8 caracteres como mínimo, máximo 72 bytes, una mayúscula, una minúscula y un número',
            });
        }

        const [existing] = await pool.execute(
            'SELECT id FROM usuarios WHERE email = ?', [emailNormalizado]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: "El email ya está registrado" });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const rol_id = 4;
        const [result] = pool.postgres
            ? await pool.execute(
                'INSERT INTO usuarios (email, password_hash, nombre, rol_id) VALUES (?, ?, ?, ?) RETURNING id',
                [emailNormalizado, hashedPassword, nombreNormalizado, rol_id]
            )
            : await pool.execute(
                'INSERT INTO usuarios (email, password_hash, nombre, rol_id) VALUES (?, ?, ?, ?)',
                [emailNormalizado, hashedPassword, nombreNormalizado, rol_id]
            );

        res.status(201).json({
            message: "Usuario registrado correctamente",
            user: {
                id: result.insertId,
                nombre: nombreNormalizado,
                email: emailNormalizado,
                rol_id
            }
        });

    } catch (error) {
        console.error('Error en /register:', error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
}); // <-- CIERRE CORRECTO DEL REGISTER

// ============ RUTA DE LOGIN ============
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : '';

        if (!emailNormalizado || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
        }

        const [users] = await pool.execute(
            'SELECT * FROM usuarios WHERE email = ?', [emailNormalizado]
        );
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailNormalizado)) {
            return res.status(400).json({ error: "El formato de email es inválido." });
        }

        if (users.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const user = users[0];

        if (Number(user.activo) === 0) {
            return res.status(403).json({ error: 'Usuario desactivado' });
        }

        const passwordValida = await bcrypt.compare(password, user.password_hash);
        if (!passwordValida) {
            return res.status(401).json({ error: 'Contraseña inválida' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, rol_id: user.rol_id },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            message: 'Login exitoso',
            token,
            user: {
                id: user.id,
                nombre: user.nombre,
                email: user.email,
                rol_id: Number(user.rol_id)
            }
        });

    } catch (error) {
        console.error('Error en /login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;