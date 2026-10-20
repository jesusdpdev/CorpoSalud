import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../servicios/api';
import ImportarExcel from '../ImportarExcel';

const ROLES = [
  { id: 1, nombre: 'ASIR' },
  { id: 2, nombre: 'ASIC' },
  { id: 3, nombre: 'Administrador' },
  { id: 4, nombre: 'Consulta' },
];

const PASSWORD_RULES = [
  { label: '8 caracteres como mínimo', validate: value => value.length >= 8 },
  { label: 'Una mayúscula', validate: value => /[A-Z]/.test(value) },
  { label: 'Una minúscula', validate: value => /[a-z]/.test(value) },
  { label: 'Un número', validate: value => /[0-9]/.test(value) },
  { label: 'Máximo 72 bytes', validate: value => new TextEncoder().encode(value).length <= 72 },
];

const emptyForm = { nombre: '', email: '', password: '', rol_id: 4 };

function roleName(roleId) {
  return ROLES.find(role => role.id === Number(roleId))?.nombre || 'Desconocido';
}

function PanelAdministrador() {
  const navigate = useNavigate();
  const usuarioActual = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [formNuevo, setFormNuevo] = useState(emptyForm);
  const [editando, setEditando] = useState(null);
  const [passwordCambio, setPasswordCambio] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState('usuarios');
  const [vistaCategoria, setVistaCategoria] = useState('dashboard');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargarUsuarios = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/usuarios');
      setUsuarios(data);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'No se pudieron cargar las cuentas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activa = true;
    api.get('/admin/usuarios')
      .then(({ data }) => {
        if (activa) {
          setUsuarios(data);
          setError('');
        }
      })
      .catch(requestError => {
        if (activa) {
          setError(requestError.response?.data?.error || 'No se pudieron cargar las cuentas.');
        }
      })
      .finally(() => {
        if (activa) setCargando(false);
      });
    return () => {
      activa = false;
    };
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase();
    return usuarios.filter(user => {
      const coincideTexto = !termino ||
        [user.nombre, user.email, String(user.id)]
          .some(value => String(value || '').toLocaleLowerCase().includes(termino));
      const coincideRol = !filtroRol || Number(user.rol_id) === Number(filtroRol);
      const coincideEstado = filtroEstado === '' ||
        Number(user.activo) === Number(filtroEstado);
      return coincideTexto && coincideRol && coincideEstado;
    });
  }, [usuarios, busqueda, filtroRol, filtroEstado]);

  const conteos = useMemo(() => ({
    total: usuarios.length,
    activos: usuarios.filter(user => Number(user.activo) === 1).length,
    administradores: usuarios.filter(user => Number(user.rol_id) === 3 && Number(user.activo) === 1).length,
  }), [usuarios]);

  const seleccionarSeccion = seccion => {
    setSeccionActiva(seccion);
    setVistaCategoria('dashboard');
  };

  const cerrarSesion = async () => {
    const result = await Swal.fire({
      title: '¿Cerrar sesión?',
      text: 'Saldrás del panel de administración.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Cerrar sesión',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#1e3a8a',
    });
    if (!result.isConfirmed) return;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const crearUsuario = async event => {
    event.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.post('/admin/usuarios', {
        nombre: formNuevo.nombre.trim(),
        email: formNuevo.email.trim().toLowerCase(),
        password: formNuevo.password,
        rol_id: Number(formNuevo.rol_id),
      });
      setFormNuevo(emptyForm);
      setMostrarFormulario(false);
      await cargarUsuarios();
      await Swal.fire({ icon: 'success', title: 'Cuenta creada', timer: 1400, showConfirmButton: false });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'No se pudo crear la cuenta.');
    } finally {
      setGuardando(false);
    }
  };

  const guardarCambios = async event => {
    event.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const { data } = await api.put(`/admin/usuarios/${editando.id}`, {
        nombre: editando.nombre.trim(),
        email: editando.email.trim().toLowerCase(),
        rol_id: Number(editando.rol_id),
        activo: Boolean(editando.activo),
      });
      setUsuarios(current => current.map(user => user.id === data.id ? data : user));
      setEditando(null);
      await Swal.fire({ icon: 'success', title: 'Cambios guardados', timer: 1200, showConfirmButton: false });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'No se pudieron guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async user => {
    const activo = Number(user.activo) !== 1;
    const confirmation = await Swal.fire({
      title: activo ? '¿Activar cuenta?' : '¿Desactivar cuenta?',
      text: activo
        ? `${user.nombre} podrá iniciar sesión nuevamente.`
        : `${user.nombre} ya no podrá iniciar sesión.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: activo ? 'Activar cuenta' : 'Desactivar cuenta',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: activo ? '#15803d' : '#b91c1c',
    });
    if (!confirmation.isConfirmed) return;

    setGuardando(true);
    setError('');
    try {
      const { data } = await api.put(`/admin/usuarios/${user.id}`, {
        nombre: user.nombre,
        email: user.email,
        rol_id: Number(user.rol_id),
        activo,
      });
      setUsuarios(current => current.map(item => item.id === data.id ? data : item));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'No se pudo cambiar el estado de la cuenta.');
    } finally {
      setGuardando(false);
    }
  };

  const restablecerPassword = async event => {
    event.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.put(`/admin/usuarios/${passwordCambio.id}/password`, {
        password: passwordCambio.password,
      });
      const nombre = passwordCambio.nombre;
      setPasswordCambio(null);
      await Swal.fire({
        icon: 'success',
        title: 'Contraseña actualizada',
        text: `Se actualizó la contraseña de ${nombre}.`,
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'No se pudo actualizar la contraseña.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-100">
      <header className="relative overflow-hidden bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-900 px-5 py-5 text-white shadow-xl sm:px-8">
        <div className="absolute -right-20 -top-32 h-72 w-72 rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">Corposalud · Control central</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Administración del sistema</h1>
          <p className="mt-1 text-sm text-blue-100">Usuarios, permisos y supervisión de datos hospitalarios</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold">Administrador</span>
          <span className="hidden text-sm sm:inline">{usuarioActual.nombre || 'Administrador'}</span>
          <button
            type="button"
            onClick={cerrarSesion}
            className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10"
          >
            Cerrar sesión
          </button>
        </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:px-8">
      <nav aria-label="Secciones de administración" className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
        {[
          { id: 'usuarios', label: '👥 Usuarios y perfiles' },
          { id: 'asir', label: '📊 ASIR' },
          { id: 'asic', label: '🏥 ASIC' },
        ].map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => seleccionarSeccion(item.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              seccionActiva === item.id
                ? 'bg-blue-900 text-white shadow-md shadow-blue-900/15'
                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      </div>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8">
        {seccionActiva === 'usuarios' ? (
          <>
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Cuentas registradas', value: conteos.total, color: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white text-blue-900', badge: 'Total de perfiles' },
            { label: 'Cuentas activas', value: conteos.activos, color: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-800', badge: 'Acceso habilitado' },
            { label: 'Administradores activos', value: conteos.administradores, color: 'border-violet-200 bg-gradient-to-br from-violet-50 to-white text-violet-800', badge: 'Control del sistema' },
          ].map(card => (
            <article key={card.label} className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.color}`}>
              <p className="text-xs font-bold uppercase tracking-wide opacity-70">{card.badge}</p>
              <p className="mt-3 text-sm font-semibold text-slate-600">{card.label}</p>
              <p className="mt-1 text-3xl font-bold">{card.value}</p>
            </article>
          ))}
        </section>

        {error && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Cerrar aviso" className="font-bold">×</button>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Cuentas de usuario</h2>
              <p className="mt-1 text-sm text-slate-600">
                Asigna perfiles ASIR, ASIC, administrador o consulta; también puedes activar, desactivar o restablecer contraseñas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMostrarFormulario(value => !value);
                setEditando(null);
                setPasswordCambio(null);
              }}
              className="shrink-0 rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {mostrarFormulario ? 'Cancelar' : '+ Crear cuenta'}
            </button>
          </div>

          {mostrarFormulario && (
            <form onSubmit={crearUsuario} className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <h3 className="mb-4 font-semibold text-slate-900">Nueva cuenta</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-medium text-slate-700">
                  Nombre completo
                  <input
                    required minLength={2} maxLength={100}
                    value={formNuevo.nombre}
                    onChange={event => setFormNuevo(current => ({ ...current, nombre: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Correo electrónico
                  <input
                    required type="email" maxLength={254}
                    value={formNuevo.email}
                    onChange={event => setFormNuevo(current => ({ ...current, email: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Perfil
                  <select
                    value={formNuevo.rol_id}
                    onChange={event => setFormNuevo(current => ({ ...current, rol_id: Number(event.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    {ROLES.map(role => <option key={role.id} value={role.id}>{role.nombre}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Contraseña inicial
                  <input
                    required type="password" autoComplete="new-password" maxLength={72}
                    value={formNuevo.password}
                    onChange={event => setFormNuevo(current => ({ ...current, password: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </label>
              </div>
              <PasswordHelp password={formNuevo.password} />
              <button
                type="submit"
                disabled={guardando || !PASSWORD_RULES.every(rule => rule.validate(formNuevo.password))}
                className="mt-4 rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {guardando ? 'Creando…' : 'Crear cuenta'}
              </button>
            </form>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Buscar
              <input
                type="search"
                value={busqueda}
                onChange={event => setBusqueda(event.target.value)}
                placeholder="Nombre, correo o ID"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Perfil
              <select value={filtroRol} onChange={event => setFiltroRol(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="">Todos los perfiles</option>
                {ROLES.map(role => <option key={role.id} value={role.id}>{role.nombre}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Estado
              <select value={filtroEstado} onChange={event => setFiltroEstado(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="">Todos los estados</option>
                <option value="1">Activa</option>
                <option value="0">Inactiva</option>
              </select>
            </label>
          </div>

          

          {editando && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
              <section role="dialog" aria-modal="true" aria-labelledby="edit-user-title" className="my-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_32px_100px_-20px_rgba(15,23,42,0.55)]">
                <div className="bg-gradient-to-r from-blue-950 to-blue-800 px-6 py-5 text-white sm:px-8">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Administración de perfiles</p>
                  <h2 id="edit-user-title" className="mt-1 text-xl font-bold">Editar cuenta #{editando.id}</h2>
                  <p className="mt-1 text-sm text-blue-100">Actualiza los datos y permisos de esta cuenta.</p>
                </div>
                <form onSubmit={guardarCambios} className="space-y-5 p-6 sm:p-8">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Nombre completo
                      <input required minLength={2} maxLength={100} value={editando.nombre} onChange={event => setEditando(current => ({ ...current, nombre: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 font-normal outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Correo electrónico
                      <input required type="email" maxLength={254} value={editando.email} onChange={event => setEditando(current => ({ ...current, email: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 font-normal outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Perfil de acceso
                      <select value={editando.rol_id} onChange={event => setEditando(current => ({ ...current, rol_id: Number(event.target.value) }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                        {ROLES.map(role => <option key={role.id} value={role.id}>{role.nombre}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Estado de la cuenta
                      <select value={String(Boolean(editando.activo))} onChange={event => setEditando(current => ({ ...current, activo: event.target.value === 'true' }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                        <option value="true">Activa</option>
                        <option value="false">Inactiva</option>
                      </select>
                    </label>
                  </div>
                  {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
                  <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                    <button type="button" disabled={guardando} onClick={() => { setEditando(null); setError(''); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                    <button type="submit" disabled={guardando} className="rounded-xl bg-blue-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50">{guardando ? 'Guardando cambios…' : 'Guardar cambios'}</button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {passwordCambio && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
            <form onSubmit={restablecerPassword} role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_32px_100px_-20px_rgba(15,23,42,0.55)]">
              <div className="bg-gradient-to-r from-violet-950 to-violet-800 px-6 py-5 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Seguridad de la cuenta</p>
                <h2 id="change-password-title" className="mt-1 text-xl font-bold">Cambiar contraseña</h2>
                <p className="mt-1 text-sm text-violet-100">Cuenta: {passwordCambio.nombre}</p>
              </div>
              <div className="space-y-5 p-6 sm:p-8">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-slate-600">Define una contraseña segura para este usuario.</p>
                <button type="button" disabled={guardando} onClick={() => { setPasswordCambio(null); setError(''); }} className="text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50">Cancelar</button>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Nueva contraseña
                <input
                  required type="password" autoComplete="new-password" maxLength={72}
                  value={passwordCambio.password}
                  onChange={event => setPasswordCambio(current => ({ ...current, password: event.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 font-normal outline-none transition focus:border-violet-600 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">Debe cumplir todos los requisitos indicados.</span>
              </label>
              <PasswordHelp password={passwordCambio.password} />
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <button type="submit" disabled={guardando || !PASSWORD_RULES.every(rule => rule.validate(passwordCambio.password))} className="w-full rounded-xl bg-violet-800 px-4 py-3 text-sm font-bold text-white hover:bg-violet-900 disabled:cursor-not-allowed disabled:opacity-50">
                {guardando ? 'Actualizando contraseña…' : 'Guardar contraseña'}
              </button>
              </div>
            </form>
            </div>
          )}

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">Cargando cuentas…</td></tr>
                ) : usuariosFiltrados.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No se encontraron cuentas.</td></tr>
                ) : usuariosFiltrados.map(user => {
                  const esPropio = Number(user.id) === Number(usuarioActual.id);
                  return (
                    <tr key={user.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900">{user.nombre}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">ID {user.id}{esPropio ? ' · Tu cuenta' : ''}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">{roleName(user.rol_id)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${Number(user.activo) === 1 ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                          {Number(user.activo) === 1 ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={guardando}
                            onClick={() => {
                              setMostrarFormulario(false);
                              setPasswordCambio(null);
                              setError('');
                              setEditando({ ...user, rol_id: Number(user.rol_id), activo: Number(user.activo) === 1 });
                            }}
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={guardando || esPropio}
                            onClick={() => {
                              setEditando(null);
                              setError('');
                              setPasswordCambio({ id: user.id, nombre: user.nombre, password: '' });
                            }}
                            className="rounded-md border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                          >
                            Contraseña
                          </button>
                          <button
                            type="button"
                            disabled={guardando || esPropio}
                            onClick={() => cambiarEstado(user)}
                            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${Number(user.activo) === 1 ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'border border-green-200 text-green-700 hover:bg-green-50'}`}
                          >
                            {Number(user.activo) === 1 ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Mostrando {usuariosFiltrados.length} de {usuarios.length} cuentas. No se permite desactivar la propia cuenta ni dejar el sistema sin administradores activos.
          </p>
        </section>
          </>
        ) : (
          <section className="space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Supervisión {seccionActiva.toUpperCase()}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {seccionActiva === 'asir' ? 'Sistema de Información de ASIR' : 'Área de Salud Integral Comunitaria'}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Consulta reportes, revisa centros sin envío y administra la importación de Excel de esta clasificación.
              </p>
            </div>

            <nav className="flex gap-2 overflow-x-auto rounded-xl bg-white p-2 shadow-sm">
              {[
                { id: 'dashboard', label: '📊 Resumen' },
                { id: 'reportes', label: '📋 Reportes' },
                { id: 'exportar', label: '📤 Exportar' },
                { id: 'alertas', label: '🔔 Alertas' },
                { id: 'importar', label: '📥 Importar Excel' },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setVistaCategoria(item.id)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    vistaCategoria === item.id
                      ? 'bg-blue-900 text-white'
                      : 'text-slate-700 hover:bg-blue-50 hover:text-blue-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {seccionActiva === 'asir' && (
              <ImportarExcel
                categoria="asir"
                vista={vistaCategoria}
                permitirImportar={vistaCategoria === 'importar'}
              />
            )}
            {seccionActiva === 'asic' && (
              <ImportarExcel
                categoria="asic"
                vista={vistaCategoria}
                permitirImportar={vistaCategoria === 'importar'}
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function PasswordHelp({ password }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {PASSWORD_RULES.map(rule => {
        const cumple = rule.validate(password);
        return <li key={rule.label} className={cumple ? 'text-green-700' : 'text-slate-500'}>{cumple ? '✓' : '•'} {rule.label}</li>;
      })}
    </ul>
  );
}

export default PanelAdministrador;
