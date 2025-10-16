import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import AdminHelpCard from '../components/AdminHelpCard'

const defaultForm = { idactividad: '', total: '' }

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function AdminPayments(){
  const [actividades, setActividades] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  const fetchActividades = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('actividad')
      .select('id, fechareserva, estado, cliente:cliente ( id, nombrecompleto, telefono, correo ), pago:pagoactividad ( id, total, fecharegistro )')
      .order('fechareserva', { ascending: false })

    if (error) {
      console.error('No se pudieron cargar los pagos', error)
      setActividades([])
      setFeedback({ type: 'error', message: 'No pudimos cargar la información de pagos.' })
    } else {
      setActividades(data ?? [])
      setFeedback({ type: '', message: '' })
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchActividades()
  }, [])

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const actividadesSinPago = useMemo(() => {
    return actividades.filter(actividad => {
      const pago = Array.isArray(actividad.pago) ? actividad.pago[0] : actividad.pago
      return !pago
    })
  }, [actividades])

  const onSubmit = async (event) => {
    event.preventDefault()
    setFeedback({ type: '', message: '' })

    if (!form.idactividad || !form.total) {
      setFeedback({ type: 'error', message: 'Selecciona una reserva y especifica el monto cobrado.' })
      return
    }

    const total = Number(form.total)
    if (Number.isNaN(total)) {
      setFeedback({ type: 'error', message: 'El monto debe ser un número válido.' })
      return
    }

    setSaving(true)
    const payload = {
      idactividad: Number(form.idactividad),
      total
    }
    const { data, error } = await supabase
      .from('pagoactividad')
      .insert([payload])
      .select('id, idactividad, total, fecharegistro')
      .single()

    if (error || !data) {
      console.error('No se pudo registrar el pago', error)
      setFeedback({ type: 'error', message: 'No se pudo registrar el pago.' })
      setSaving(false)
      return
    }

    await supabase.from('actividad').update({ estado: 'pagado' }).eq('id', payload.idactividad)

    const actividadAsociada = actividades.find(item => Number(item.id) === Number(payload.idactividad))
    const cliente = actividadAsociada?.cliente

    setSelectedInvoice({
      actividad: {
        id: payload.idactividad,
        fechareserva: actividadAsociada?.fechareserva,
        estado: 'pagado',
        cliente
      },
      pago: data
    })

    setFeedback({ type: 'success', message: 'Pago registrado correctamente. Se actualizó el estado a pagado.' })
    setForm(defaultForm)
    fetchActividades()
    setSaving(false)
  }

  const onVerFactura = (actividad) => {
    const pago = Array.isArray(actividad.pago) ? actividad.pago[0] : actividad.pago
    if (!pago) return
    setSelectedInvoice({ actividad, pago })
  }

  const onImprimir = () => {
    window.print()
  }

  return (
    <>
      <div className="space-y-6 no-print">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="card flex-1 p-5 space-y-4">
            <header>
              <h1 className="text-xl font-semibold text-umber">Control de pagos</h1>
              <p className="muted text-sm">Registra pagos realizados y genera facturas imprimibles.</p>
            </header>

            <form onSubmit={onSubmit} className="grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Selecciona una reserva</span>
                <select
                  value={form.idactividad}
                  onChange={event => updateField('idactividad', event.target.value)}
                  className="border rounded-xl2 px-3 py-2"
                >
                  <option value="">Reservas sin pago registrado</option>
                  {actividadesSinPago.map(actividad => {
                    const cliente = actividad.cliente?.nombrecompleto || 'Cliente sin nombre'
                    const fecha = actividad.fechareserva ? new Date(actividad.fechareserva).toLocaleDateString('es-GT') : 'Sin fecha'
                    return (
                      <option key={actividad.id} value={actividad.id}>
                        #{actividad.id} — {cliente} ({fecha})
                      </option>
                    )
                  })}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Monto cobrado (Q)</span>
                <input
                  value={form.total}
                  onChange={event => updateField('total', event.target.value)}
                  className="border rounded-xl2 px-3 py-2"
                  placeholder="Ej. 1800"
                />
              </label>
              <button className="btn btn-primary w-fit" disabled={saving}>
                {saving ? 'Registrando…' : 'Registrar pago'}
              </button>
              {feedback.message && (
                <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {feedback.message}
                </p>
              )}
            </form>
          </div>
          <div className="lg:w-[320px]">
            <AdminHelpCard title="Consejos para facturación">
              <p>Registra un pago por cada actividad completada. El estado se actualiza automáticamente a pagado.</p>
              <p>Utiliza montos exactos para llevar un historial confiable y generar reportes financieros.</p>
              <p>Imprime la factura directamente desde el navegador usando el botón dedicado.</p>
            </AdminHelpCard>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-semibold text-umber mb-3">Historial de pagos</h2>
          {loading ? (
            <p className="muted text-sm">Cargando historial…</p>
          ) : actividades.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-sand text-left uppercase text-xs tracking-wide text-slate-600">
                  <tr>
                    <th className="p-2">Reserva</th>
                    <th className="p-2">Cliente</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Pago</th>
                    <th className="p-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {actividades.map(actividad => {
                    const pago = Array.isArray(actividad.pago) ? actividad.pago[0] : actividad.pago
                    return (
                      <tr key={actividad.id} className="border-b last:border-0">
                        <td className="p-2">
                          <div className="font-medium text-slate-700">Reserva #{actividad.id}</div>
                          <div className="text-xs text-slate-500">{actividad.fechareserva ? new Date(actividad.fechareserva).toLocaleDateString('es-GT') : 'Sin fecha'}</div>
                        </td>
                        <td className="p-2 text-sm text-slate-600">
                          <div>{actividad.cliente?.nombrecompleto || 'Cliente sin nombre'}</div>
                          <div className="text-xs text-slate-500">{actividad.cliente?.correo || '—'} · {actividad.cliente?.telefono || '—'}</div>
                        </td>
                        <td className="p-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase ${actividad.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {actividad.estado || 'pendiente'}
                          </span>
                        </td>
                        <td className="p-2 text-sm text-slate-600">
                          {pago ? (
                            <div>
                              <div className="font-semibold text-umber">Q{Number(pago.total ?? 0).toLocaleString('es-GT')}</div>
                              <div className="text-xs text-slate-500">{formatDate(pago.fecharegistro)}</div>
                            </div>
                          ) : (
                            <span className="muted">Pendiente</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {pago ? (
                            <button type="button" className="btn btn-ghost" onClick={() => onVerFactura(actividad)}>
                              Ver Comprobante
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Registra un pago para habilitar la factura</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted text-sm">No hay reservas registradas todavía.</p>
          )}
        </div>
      </div>
      <div
        id="print-area"
        className={selectedInvoice ? 'mt-6' : ''}
        style={{ display: selectedInvoice ? 'block' : 'none' }}
      >
        {selectedInvoice && (
          <div id="printable-invoice">
            <div
              className="card print-sheet p-6 md:p-8 print:mx-auto print:max-w-3xl print:border print:shadow-none print:bg-white print:text-black"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Comprobante oficial</p>
                  <h2 className="text-2xl font-semibold text-umber">Fotografia Aguin</h2>
                  <p className="text-sm text-slate-500">Comprobante de actividad #{selectedInvoice.actividad.id}</p>
                </div>
                <div className="text-sm text-right text-slate-500">
                  <p className="font-semibold text-slate-700">#{selectedInvoice.pago.id}</p>
                  <p>Emitido {formatDate(selectedInvoice.pago.fecharegistro)}</p>
                  <p>Estado: {selectedInvoice.actividad.estado}</p>
                </div>
                <button type="button" className="btn btn-primary h-fit print:hidden" onClick={onImprimir}>
                  Imprimir Comprobante
                </button>
              </div>

              <div className="mt-6 grid gap-6 text-sm md:grid-cols-2">
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Datos del cliente</h3>
                  <p className="text-base font-medium text-slate-700">{selectedInvoice.actividad.cliente?.nombrecompleto || 'Cliente sin nombre'}</p>
                  <p className="text-slate-500">{selectedInvoice.actividad.cliente?.correo || '—'}</p>
                  <p className="text-slate-500">{selectedInvoice.actividad.cliente?.telefono || '—'}</p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detalle de la sesión</h3>
                  <dl className="space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <dt className="font-medium text-slate-500">Reserva</dt>
                      <dd className="text-right">#{selectedInvoice.actividad.id}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium text-slate-500">Fecha solicitada</dt>
                      <dd className="text-right">{selectedInvoice.actividad.fechareserva ? new Date(selectedInvoice.actividad.fechareserva).toLocaleDateString('es-GT') : 'Sin fecha'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium text-slate-500">Estado actual</dt>
                      <dd className="text-right capitalize">{selectedInvoice.actividad.estado}</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <div className="mt-8 rounded-xl2 border border-[var(--border)] bg-sand/60 p-6 print:bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 text-lg font-semibold text-umber">
                  <span>Total pagado</span>
                  <span>Q{Number(selectedInvoice.pago.total ?? 0).toLocaleString('es-GT')}</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Este comprobante confirma la recepción del pago correspondiente a la actividad seleccionada. Para tus registros, conserva una copia digital o imprime utilizando el botón indicado.
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Atención al cliente · hola@fotografiaaguin.com · (502) 5555-0000
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
