import { useState } from 'react';
import logoImg from '../assets/logo-corposalud.png';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import Swal from 'sweetalert2'
import api from '../servicios/api';

function Login() {
    const navigate = useNavigate();
    const location = useLocation();

    const emailPrellenado = location.state?.email || '';

    const [form, setForm] = useState({
        email: emailPrellenado,
        password: ''
    });

    const [mensaje, setMensaje] = useState('');
    const [cargando, setCargando] = useState(false);

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setCargando(true);
        setMensaje('');

        try {
            const { data } = await api.post('/auth/login', {
                email: form.email.trim().toLowerCase(),
                password: form.password,
            });

            if (!data.token || !data.user) {
                Swal.fire(
                {
                    icon: 'error',
                    title: 'Error al iniciar sesión',
                    text: 'La respuesta del servidor no contiene una sesión válida.',
                }
                )
                return;
            }

            // Guardar token y usuario
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            Swal.fire({
                icon: 'success',
                title: 'Login Exitoso',
                text: 'Iniciando sesión',
                timer: 2000,              
                showConfirmButton: false, 
                timerProgressBar: true    
                });

            // ✅ Redirigir según el rol — CORREGIDO
            setTimeout(() => {
                if (Number(data.user.rol_id) === 1) {
                    navigate('/panel-asir');
                } else if (Number(data.user.rol_id) === 2) {
                    navigate('/panel-asic');
                } else if (Number(data.user.rol_id) === 3) {
                    navigate('/admin');
                } else {
                    navigate('/visor');
                }
            }, 800);

        } catch (error) {
            console.error(error);
            setMensaje(error.response?.data?.error || 'Error de conexión con el servidor');
        } finally {
            setCargando(false);
        }
    };

    return (
        <main className="relative min-h-screen overflow-hidden bg-slate-50">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-cyan-100 via-slate-50 to-blue-100" aria-hidden="true" />
            <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-8 md:grid-cols-[1.05fr_0.95fr] md:px-8">
                <section className="hidden rounded-[2rem] bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-800 p-10 text-white shadow-2xl md:block">
                    <img src={logoImg} alt="Corposalud" className="mb-12 w-40 rounded-xl bg-white p-3" />
                    <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200">Sistema de reportes hospitalarios</p>
                    <h1 className="mt-4 max-w-lg text-4xl font-bold leading-tight">Información de salud, clara y organizada.</h1>
                    <p className="mt-5 max-w-lg leading-7 text-blue-100">
                        Consulta datos por centro, revisa indicadores y explora reportes de forma sencilla.
                    </p>
                    <div className="mt-10 grid grid-cols-2 gap-3">
                        {['Centros clasificados', 'Datos por servicio'].map(item => (
                            <div key={item} className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold">{item}</div>
                        ))}
                    </div>
                </section>

                <section className="mx-auto w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-7 shadow-xl shadow-blue-950/10 backdrop-blur sm:p-9">
                    <div className="mb-7 flex flex-col items-center text-center md:items-start md:text-left">
                        <img src={logoImg} alt="Logo de Corposalud" className="mb-5 w-32 md:hidden" />
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-800">Acceso seguro</span>
                        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Bienvenido</h2>
                        <p className="mt-2 text-sm text-slate-600">Ingresa tus credenciales para continuar al sistema.</p>
                    </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col">
                        <label htmlFor="login-email" className="text-sm font-semibold text-slate-700">Correo electrónico</label>
                        <input
                            id="login-email"
                            type="email"
                            name="email"
                            autoComplete="email"
                            placeholder="correo@ejemplo.com"
                            value={form.email}
                            onChange={handleChange}
                            required
                            className="mt-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                    </div>

                    <div className="flex flex-col">
                        <label htmlFor="login-password" className="text-sm font-semibold text-slate-700">Contraseña</label>
                        <input
                            id="login-password"
                            type="password"
                            name="password"
                            autoComplete="current-password"
                            placeholder="********"
                            value={form.password}
                            onChange={handleChange}
                            required
                            className="mt-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={cargando}
                        className="mt-1 rounded-xl bg-gradient-to-r from-blue-900 to-blue-700 px-4 py-3 font-bold text-white shadow-lg shadow-blue-900/15 transition hover:-translate-y-0.5 hover:from-blue-950 hover:to-blue-800 disabled:cursor-wait disabled:opacity-60"
                    >
                        {cargando ? 'Verificando acceso…' : 'Iniciar sesión'}
                    </button>

                    {mensaje && (
                        <p className={`text-center text-sm font-medium ${mensaje.includes('exitoso') ? 'text-green-600' : 'text-red-500'}`}>
                            {mensaje}
                        </p>
                    )}

                    <p className="mt-2 text-center text-sm text-slate-600">
                        ¿No tienes cuenta?{' '}
                        <Link to="/register" className="font-bold text-blue-800 hover:text-blue-950 hover:underline">
                            Regístrate aquí
                        </Link>
                    </p>
                </form>
                </section>
            </div>
        </main>
    );
}

export default Login;