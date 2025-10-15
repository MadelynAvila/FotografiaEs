import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import AdminHelpCard from '../components/AdminHelpCard'

const defaultStats = {
  reservas: 0,
  pendientes: 0,
  pagos: 0,
  clientes: 0,
  fotografos: 0,
  servicios: 0,
  paquetes: 0,
  resenas: 0
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(date)
}

function formatEstado(value) {
  if (!value) return 'Pendiente'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const pastelGradients = [
  'from-rose-100 to-pink-50 text-rose-900',
  'from-sky-100 to-cyan-50 text-sky-900',
  'from-amber-100 to-orange-50 text-amber-900',
  'from-emerald-100 to-green-50 text-emerald-900',
  'from-violet-100 to-purple-50 text-violet-900',
  'from-blue-100 to-indigo-50 text-indigo-900',
  'from-lime-100 to-green-50 text-lime-900',
  'from-fuchsia-100 to-pink-50 text-fuchsia-900'
]

function formatMonthKey(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const formatter = new Intl.DateTimeFormat('es-GT', { month: 'short' })
  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    label: `${formatter.format(date)} ${date.getFullYear()}`
  }
}

export default function AdminDashboard(){
  const [stats, setStats] = useState(defaultStats)
  const [reservas, setReservas] = useState([])
  const [proximas, setProximas] = useState([])
  const [estadoStats, setEstadoStats] = useState([])
  const [actividadMensual, setActividadMensual] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')

      const [
        actividadesRes,
        pagosRes,
        clientesRes,
        fotografosRes,
        serviciosRes,
        paquetesRes,
        resenasRes
      ] = await Promise.all([
        supabase
          .from('actividad')
          .select(`
            id,
            comentarios,
            estado,
            fechareserva,
            cliente:cliente (nombrecompleto),
            pago:pagoactividad (id)
          `)
          .order('fechareserva', { ascending: false }),
        supabase.from('pagoactividad').select('id'),
        supabase.from('cliente').select('id'),
        supabase.from('fotografo').select('id'),
        supabase.from('servicio').select('id'),
        supabase.from('paquete').select('id'),
        supabase.from('resena').select('id')
      ])

      if (!active) return

      const errors = [
        actividadesRes.error,
        pagosRes.error,
        clientesRes.error,
        fotografosRes.error,
        serviciosRes.error,
        paquetesRes.error,
        resenasRes.error
      ].filter(Boolean)

      if (errors.length) {
        errors.forEach(err => console.error('Error al cargar el dashboard', err))
        setError('No pudimos obtener la información del panel. Revisa tu configuración de Supabase o intenta nuevamente.')
        setStats(defaultStats)
        setReservas([])
        setProximas([])
        setEstadoStats([])
        setActividadMensual([])
        setLoading(false)
        return
      }

      const actividades = actividadesRes.data ?? []
      const formatted = actividades.map(item => ({
        id: item.id,
        cliente: item.cliente?.nombrecompleto || 'Cliente sin nombre',
        comentarios: item.comentarios || '',
        fecha: item.fechareserva,
        estado: (item.estado || 'pendiente').toLowerCase(),
        pago: Array.isArray(item.pago) ? item.pago[0] : item.pago
      }))

      const sortedByFechaDesc = formatted
        .slice()
        .sort((a, b) => {
          const aDate = new Date(a.fecha || 0)
          const bDate = new Date(b.fecha || 0)
          return bDate - aDate
        })

      const upcoming = formatted
        .filter(item => {
          if (!item.fecha) return false
          const fecha = new Date(item.fecha)
          if (Number.isNaN(fecha.getTime())) return false
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          fecha.setHours(0, 0, 0, 0)
          return fecha >= today
        })
        .sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0))

      setReservas(sortedByFechaDesc.slice(0, 5))
      setProximas(upcoming.slice(0, 5))

      const estadoMap = formatted.reduce((acc, item) => {
        const estado = (item.estado || 'pendiente').toLowerCase()
        acc[estado] = (acc[estado] || 0) + 1
        return acc
      }, {})

      const estadosOrdenados = Object.entries(estadoMap)
        .map(([estado, total]) => ({ estado, total }))
        .sort((a, b) => b.total - a.total)

      const mesMap = formatted.reduce((acc, item) => {
        const monthInfo = formatMonthKey(item.fecha)
        if (!monthInfo) return acc
        acc[monthInfo.key] = {
          label: monthInfo.label,
          total: (acc[monthInfo.key]?.total || 0) + 1
        }
        return acc
      }, {})

      const actividadOrdenada = Object.entries(mesMap)
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => (a.key > b.key ? 1 : -1))
        .slice(-6)

      setStats({
        reservas: actividades.length,
        pendientes: formatted.filter(item => item.estado === 'pendiente').length,
        pagos: pagosRes.data?.length ?? 0,
        clientes: clientesRes.data?.length ?? 0,
        fotografos: fotografosRes.data?.length ?? 0,
        servicios: serviciosRes.data?.length ?? 0,
        paquetes: paquetesRes.data?.length ?? 0,
        resenas: resenasRes.data?.length ?? 0
      })

      setEstadoStats(estadosOrdenados)
      setActividadMensual(actividadOrdenada)

      setLoading(false)
    }

    load()
    return () => {
      active = false
    }
  }, [])

  const resumen = useMemo(() => ([
    { label: 'Reservas totales', value: stats.reservas, icon: '📷' },
    { label: 'Reservas pendientes', value: stats.pendientes, icon: '⏳' },
    { label: 'Pagos registrados', value: stats.pagos, icon: '💳' },
    { label: 'Clientes activos', value: stats.clientes, icon: '👥' },
    { label: 'Fotógrafos', value: stats.fotografos, icon: '📸' },
    { label: 'Servicios', value: stats.servicios, icon: '🛠️' },
    { label: 'Paquetes', value: stats.paquetes, icon: '🎁' },
    { label: 'Reseñas', value: stats.resenas, icon: '⭐' }
  ]), [stats])

  const maxResumen = useMemo(() => {
    const valores = resumen.map(item => item.value)
    return Math.max(1, ...valores)
  }, [resumen])

  const totalEstados = useMemo(
    () => estadoStats.reduce((acc, item) => acc + item.total, 0),
    [estadoStats]
  )

  const maxActividad = useMemo(
    () => Math.max(1, ...actividadMensual.map(item => item.total)),
    [actividadMensual]
  )

  return (
    <div className="space-y-6">
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {resumen.map((item, index) => (
          <div
            key={item.label}
            className={`card overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-gradient-to-br ${pastelGradients[index % pastelGradients.length]}`}
          >
            <div className="flex items-start justify-between">
              <span className="text-2xl">{item.icon}</span>
              <span className="text-xs uppercase tracking-wide font-semibold opacity-70">
                {item.label}
              </span>
            </div>
            <strong className="mt-6 block text-3xl font-extrabold">{item.value}</strong>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/40">
              <div
                className="h-full rounded-full bg-white/80 transition-all duration-500"
                style={{ width: `${Math.min(100, (item.value / maxResumen) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="card flex flex-col gap-6 p-4">
          <section>
            <h3 className="font-semibold mb-2">Reservas recientes</h3>
            {loading ? (
              <p className="muted text-sm">Cargando información…</p>
            ) : reservas.length ? (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sand text-left">
                    <tr>
                      <th className="p-2">Cliente</th>
                      <th className="p-2">Comentarios</th>
                      <th className="p-2">Fecha solicitada</th>
                      <th className="p-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservas.map(reserva => (
                      <tr key={reserva.id} className="border-b last:border-0">
                        <td className="p-2 font-medium">{reserva.cliente}</td>
                        <td className="p-2">{reserva.comentarios || '—'}</td>
                        <td className="p-2">{formatDate(reserva.fecha)}</td>
                        <td className="p-2">
                          <span className="inline-flex items-center rounded-full bg-sand px-2 py-1 text-xs font-semibold uppercase tracking-wide">
                            {formatEstado(reserva.estado)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted text-sm">Todavía no hay reservas registradas.</p>
            )}
          </section>

          <section>
            <h3 className="font-semibold mb-2">Próximas sesiones</h3>
            {loading ? (
              <p className="muted text-sm">Cargando información…</p>
            ) : proximas.length ? (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sand text-left">
                    <tr>
                      <th className="p-2">Cliente</th>
                      <th className="p-2">Fecha</th>
                      <th className="p-2">Estado</th>
                      <th className="p-2">Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proximas.map(item => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-2 font-medium text-slate-700">{item.cliente}</td>
                        <td className="p-2">{formatDate(item.fecha)}</td>
                        <td className="p-2">
                          <span className="inline-flex items-center rounded-full bg-umber/10 px-3 py-1 text-xs font-semibold uppercase text-umber">
                            {formatEstado(item.estado)}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-slate-600">{item.pago ? 'Pagado' : 'Pendiente'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted text-sm">Todavía no hay sesiones programadas para las próximas fechas.</p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card p-4">
            <h3 className="font-semibold mb-3">Estado de reservas</h3>
            {loading ? (
              <p className="muted text-sm">Preparando resumen visual…</p>
            ) : estadoStats.length ? (
              <ul className="space-y-3">
                {estadoStats.map(({ estado, total }, idx) => {
                  const percentage = totalEstados ? Math.round((total / totalEstados) * 100) : 0
                  return (
                    <li key={estado}>
                      <div className="flex justify-between text-xs font-semibold uppercase text-neutral-600">
                        <span>{formatEstado(estado)}</span>
                        <span>{percentage}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-200">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${pastelGradients[idx % pastelGradients.length]}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">{total} {total === 1 ? 'reserva' : 'reservas'}</p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted text-sm">Todavía no hay suficientes datos para visualizar.</p>
            )}
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-3">Actividad mensual</h3>
            {loading ? (
              <p className="muted text-sm">Analizando tendencias…</p>
            ) : actividadMensual.length ? (
              <div className="flex items-end gap-3">
                {actividadMensual.map(({ key, label, total }, idx) => (
                  <div key={key} className="flex flex-col items-center gap-2 text-xs text-neutral-600">
                    <div className="flex h-32 w-10 items-end justify-center rounded-xl bg-neutral-100 p-1">
                      <div
                        className={`w-full rounded-lg bg-gradient-to-t ${pastelGradients[idx % pastelGradients.length]}`}
                        style={{ height: `${(total / maxActividad) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
                    <span className="text-[11px] text-neutral-500">{total}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted text-sm">Cuando haya reservas registradas podrás ver la tendencia mensual aquí.</p>
            )}
          </div>

          <AdminHelpCard title="Sugerencias de uso del panel">
            <p>Revisa este resumen a diario para validar que todas las reservas pendientes tengan un fotógrafo asignado y un pago planificado.</p>
            <p>Utiliza el historial de pagos para confirmar que las facturas hayan sido generadas y entregadas al cliente.</p>
            <p>Las reseñas ayudan a nutrir tus páginas públicas; recuerda actualizarlas desde la sección correspondiente.</p>
          </AdminHelpCard>
        </div>
      </div>
    </div>
  )
}
