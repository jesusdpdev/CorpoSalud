import { useState } from 'react';
import logoImg from '../assets/logo-corposalud.png';
import { Link, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../servicios/api';

const passwordRequirements = [
  { label: 'Mínimo 8 caracteres', test: value => value.length >= 8 },
  { label: 'Al menos una letra mayúscula', test: value => /[A-Z]/.test(value) },
  { label: 'Al menos una letra minúscula', test: value => /[a-z]/.test(value) },
  { label: 'Al menos un número', test: value => /[0-9]/.test(value) },
  { label: 'Máximo 72 bytes', test: value => new TextEncoder().encode(value).length <= 72 },
];

function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nombre: '', email: '', password: '' });
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const handleChange = event => {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setMensaje('');
    setCargando(true);

    try {
      await api.post('/auth/register', {
        nombre: form.nombre.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      await Swal.fire({
        icon: 'success',
        title: 'Registro exitoso',
        text: 'Tu cuenta se creó con perfil de consulta.',
        confirmButtonText: 'Continuar',
      });
      navigate('/login', { state: { email: form.email.trim().toLowerCase() } });
    } catch (error) {
      const descripcion = error.response?.data?.error || 'No se pudo completar el registro. Verifique su conexión.';
      setMensaje(descripcion);
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo registrar',
        text: descripcion,
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-lg rounded-3xl border border-white bg-white p-7 shadow-[0_28px_80px_-18px_rgba(15,23,42,0.32)] ring-1 ring-slate-200 sm:p-9">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logoImg} alt="Logo de Corposalud" className="mb-4 w-32" />
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-800">Alta de usuario</span>
          <h1 className="text-2xl font-bold text-slate-900">Crear cuenta</h1>
          <p className="mt-2 text-sm text-slate-600">Registra tus datos para acceder al sistema de reportes.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Nombre completo
            <input
              type="text"
              name="nombre"
              autoComplete="name"
              placeholder="Ej. María Pérez"
              value={form.nombre}
              onChange={handleChange}
              minLength={2}
              maxLength={100}
              required
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 font-normal outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">Entre 2 y 100 caracteres.</span>
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Correo electrónico
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nombre@ejemplo.com"
              value={form.email}
              onChange={handleChange}
              maxLength={254}
              required
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 font-normal outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Contraseña
            <span className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-300 bg-slate-50 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
              <input
                type={mostrarPassword ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                placeholder="Crea una contraseña segura"
                value={form.password}
                onChange={handleChange}
                maxLength={72}
                required
                className="min-w-0 flex-1 bg-transparent px-3.5 py-3 font-normal outline-none"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(value => !value)}
                className="px-3 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {mostrarPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </span>
            <span className="mt-2 block text-xs font-medium text-slate-600">La contraseña debe incluir:</span>
            <ul className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
              {passwordRequirements.map(requirement => {
                const cumple = requirement.test(form.password);
                return (
                  <li key={requirement.label} className={cumple ? 'text-green-700' : 'text-slate-500'}>
                    <span aria-hidden="true">{cumple ? '✓' : '•'} </span>{requirement.label}
                  </li>
                );
              })}
            </ul>
          </label>

          <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-3 text-xs leading-5 text-blue-950">
            La cuenta nueva tendrá perfil de consulta. Los perfiles ASIR y ASIC son asignados por administración.
          </div>

          {mensaje && <p role="alert" className="text-sm text-red-700">{mensaje}</p>}

          <button
            type="submit"
            disabled={cargando || !passwordRequirements.every(rule => rule.test(form.password))}
            className="w-full rounded-xl bg-gradient-to-r from-blue-900 to-blue-700 px-4 py-3 font-bold text-white shadow-lg shadow-blue-900/15 transition hover:-translate-y-0.5 hover:from-blue-950 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargando ? 'Creando cuenta…' : 'Registrarse'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-semibold text-blue-700 hover:underline">Inicia sesión</Link>
        </p>
      </section>
    </main>
  );
}

export default Register;
