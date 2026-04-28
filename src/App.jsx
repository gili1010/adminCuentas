import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const movementTypes = [
  { value: 'expense', label: 'Cuenta a pagar' },
  { value: 'income', label: 'Ingreso propio' },
  { value: 'receivable', label: 'Me deben plata' },
  { value: 'card', label: 'Gasto tarjeta' },
]

const emptyMovement = {
  type: 'expense',
  description: '',
  amount: '',
  due_date: dayjs().startOf('month').format('YYYY-MM-DD'),
  person: '',
  card_name: null,
  installment_mode: 'none',
  installment_label: '',
  notes: '',
}

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

function toAmount(value) {
  return Number.parseFloat(String(value).replace(',', '.'))
}

function formatInstallment(value) {
  const digitsOnly = value.replace(/\D/g, '').slice(0, 4)
  if (digitsOnly.length <= 2) {
    return digitsOnly
  }
  return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`
}

function parseInstallmentLabel(label) {
  const match = String(label ?? '').match(/^(\d{2})\/(\d{2})$/)
  if (!match) {
    return null
  }

  const current = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  if (!Number.isFinite(current) || !Number.isFinite(total) || current <= 0 || total <= 0) {
    return null
  }

  return { current, total }
}

function toInstallmentLabel(current, total) {
  return `${String(current).padStart(2, '0')}/${String(total).padStart(2, '0')}`
}

function App() {
  const [session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [movements, setMovements] = useState([])
  const [movementForm, setMovementForm] = useState(emptyMovement)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'))
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false)
  const [detailsModalType, setDetailsModalType] = useState(null)
  const [editingMovementId, setEditingMovementId] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setMovements([])
      return
    }
    loadMovements()
  }, [session])

  async function loadMovements() {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('movements')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
    } else {
      setMovements(data ?? [])
    }
    setLoading(false)
  }

  async function submitAuth(event) {
    event.preventDefault()
    setAuthLoading(true)
    setAuthMessage('')

    const payload = {
      email: authEmail.trim(),
      password: authPassword,
    }

    if (authMode === 'login') {
      const { error: loginError } = await supabase.auth.signInWithPassword(payload)
      setAuthMessage(loginError ? loginError.message : 'Sesion iniciada correctamente.')
    } else {
      const { error: signUpError } = await supabase.auth.signUp(payload)
      setAuthMessage(
        signUpError
          ? signUpError.message
          : 'Cuenta creada. Si activaste confirmacion por email, revisa tu correo.',
      )
    }

    setAuthLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function saveMovement(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const trimmedDescription = movementForm.description.trim()
    const trimmedPerson = movementForm.person.trim()
    const trimmedInstallment = movementForm.installment_label.trim()
    const trimmedNotes = movementForm.notes.trim()

    if (!trimmedDescription) {
      setError('La descripcion es obligatoria.')
      setSaving(false)
      return
    }

    if (movementForm.type === 'receivable' && !trimmedPerson) {
      setError('La persona es obligatoria en "Me deben plata".')
      setSaving(false)
      return
    }

    const hasInstallments = movementForm.installment_mode === 'with'

    if (hasInstallments && !/^\d{2}\/\d{2}$/.test(trimmedInstallment)) {
      setError('La cuota debe tener formato 00/00.')
      setSaving(false)
      return
    }

    const parsedAmount = toAmount(movementForm.amount)
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('El monto debe ser mayor a 0.')
      setSaving(false)
      return
    }

    const payload = {
      type: movementForm.type,
      description: trimmedDescription,
      amount: parsedAmount,
      due_date: movementForm.due_date || `${selectedMonth}-01`,
      person: movementForm.type === 'receivable' ? trimmedPerson : null,
      card_name: movementForm.type === 'card' ? 'Visa' : null,
      installment_label: hasInstallments ? trimmedInstallment : null,
      notes: trimmedNotes || null,
      status: 'done',
    }

    if (editingMovementId) {
      const { data, error: updateError } = await supabase
        .from('movements')
        .update(payload)
        .eq('id', editingMovementId)
        .select('*')
        .single()

      if (updateError) {
        setError(updateError.message)
      } else {
        setMovements((prev) =>
          prev.map((item) => (item.id === editingMovementId ? data : item)),
        )
        setMovementForm({ ...emptyMovement, due_date: `${selectedMonth}-01` })
        setEditingMovementId(null)
        setIsMovementModalOpen(false)
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('movements')
        .insert(payload)
        .select('*')
        .single()

      if (insertError) {
        setError(insertError.message)
      } else {
        setMovements((prev) => [data, ...prev])
        setMovementForm({ ...emptyMovement, due_date: `${selectedMonth}-01` })
        setIsMovementModalOpen(false)
      }
    }

    setSaving(false)
  }

  function openMovementModal() {
    setError('')
    setEditingMovementId(null)
    setMovementForm({ ...emptyMovement, due_date: `${selectedMonth}-01` })
    setIsMovementModalOpen(true)
  }

  function openEditModal(movement) {
    setError('')
    setDetailsModalType(null)
    setEditingMovementId(movement.id)
    setMovementForm({
      type: movement.type,
      description: movement.description ?? '',
      amount: String(movement.amount ?? ''),
      due_date: movement.due_date || `${selectedMonth}-01`,
      person: movement.person ?? '',
      card_name: movement.card_name ?? null,
      installment_mode: movement.installment_label ? 'with' : 'none',
      installment_label: movement.installment_label ?? '',
      notes: movement.notes ?? '',
    })
    setIsMovementModalOpen(true)
  }

  function closeMovementModal() {
    if (saving) {
      return
    }
    setEditingMovementId(null)
    setIsMovementModalOpen(false)
  }

  function openDetailsModal(type) {
    setDetailsModalType(type)
  }

  function closeDetailsModal() {
    if (saving) {
      return
    }
    setDetailsModalType(null)
  }

  async function deleteMovement(id) {
    const { error: deleteError } = await supabase.from('movements').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setMovements((prev) => prev.filter((item) => item.id !== id))
  }

  const monthlyMovements = useMemo(() => {
    const selectedDate = dayjs(`${selectedMonth}-01`)

    return movements
      .map((movement) => {
        if (!movement.due_date) {
          return null
        }

        const dueDate = dayjs(movement.due_date)
        const monthDiff = selectedDate.diff(dueDate.startOf('month'), 'month')
        if (monthDiff < 0) {
          return null
        }

        const installment = parseInstallmentLabel(movement.installment_label)
        if (!installment) {
          return monthDiff === 0 ? movement : null
        }

        const carriedCurrent = installment.current + monthDiff
        if (carriedCurrent > installment.total) {
          return null
        }

        if (monthDiff === 0) {
          return movement
        }

        return {
          ...movement,
          installment_label: toInstallmentLabel(carriedCurrent, installment.total),
          due_date: selectedDate.format('YYYY-MM-DD'),
        }
      })
      .filter(Boolean)
  }, [movements, selectedMonth])

  const groupedTypes = ['card', 'receivable', 'expense']

  const groupLabels = {
    card: 'Tarjeta Visa',
    receivable: 'Me deben plata',
    expense: 'Cuentas a pagar',
  }

  const groupedMovementsByType = useMemo(
    () => ({
      card: monthlyMovements.filter((movement) => movement.type === 'card'),
      receivable: monthlyMovements.filter((movement) => movement.type === 'receivable'),
      expense: monthlyMovements.filter((movement) => movement.type === 'expense'),
    }),
    [monthlyMovements],
  )

  const detailMovements = detailsModalType ? groupedMovementsByType[detailsModalType] ?? [] : []

  const movementRows = useMemo(() => {
    const rows = []

    groupedTypes.forEach((type) => {
      const group = groupedMovementsByType[type]
      if (group.length === 0) {
        return
      }

      rows.push({
        id: `${type}-summary`,
        type,
        description: groupLabels[type],
        installment_label: 'Sin cuotas',
        person: '-',
        amount: group.reduce((acc, movement) => acc + Number(movement.amount), 0),
        notes: `Total de ${group.length} movimientos`,
        isGroupedSummary: true,
        groupType: type,
      })
    })

    const ungroupedRows = monthlyMovements.filter((movement) => !groupedTypes.includes(movement.type))
    return [...rows, ...ungroupedRows]
  }, [monthlyMovements, groupedMovementsByType])

  const summary = useMemo(() => {
    const plannedIncome = monthlyMovements
      .filter((item) => item.type === 'income')
      .reduce((acc, item) => acc + Number(item.amount), 0)

    const toReceive = monthlyMovements
      .filter((item) => item.type === 'receivable')
      .reduce((acc, item) => acc + Number(item.amount), 0)

    const toPay = monthlyMovements
      .filter((item) => item.type === 'expense' || item.type === 'card')
      .reduce((acc, item) => acc + Number(item.amount), 0)

    return {
      plannedIncome,
      toReceive,
      toPay,
      projectedBalance: plannedIncome + toReceive - toPay,
    }
  }, [monthlyMovements])

  const showInstallmentInput = movementForm.installment_mode === 'with'

  if (!isSupabaseConfigured) {
    return (
      <main className="screen simple">
        <h1>Administrador de Cuentas</h1>
        <p>
          Falta configurar las variables <strong>VITE_SUPABASE_URL</strong> y{' '}
          <strong>VITE_SUPABASE_ANON_KEY</strong> en un archivo .env.
        </p>
        <p>Revisa README.md para el paso a paso con Supabase y Vercel.</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="screen simple">
        <h1>Administrador de Cuentas</h1>
        <p>Ingresa con tu usuario para ver y actualizar tus cuentas desde el celular.</p>

        <form className="auth-form" onSubmit={submitAuth}>
          <label>
            Email
            <input
              type="email"
              required
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
            />
          </label>

          <label>
            Contrasena
            <input
              type="password"
              required
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
            />
          </label>

          <button type="submit" disabled={authLoading}>
            {authLoading ? 'Procesando...' : authMode === 'login' ? 'Iniciar sesion' : 'Crear cuenta'}
          </button>

          <button
            type="button"
            className="ghost"
            onClick={() => setAuthMode((current) => (current === 'login' ? 'signup' : 'login'))}
          >
            {authMode === 'login'
              ? 'No tengo cuenta, quiero registrarme'
              : 'Ya tengo cuenta, quiero entrar'}
          </button>

          {authMessage && <p className="inline-message">{authMessage}</p>}
        </form>
      </main>
    )
  }

  return (
    <main className="screen">
      <header className="topbar">
        <div>
          <h1>Administrador de Cuentas</h1>
          <p>Controla pagos, cobros y tarjeta en un solo lugar.</p>
        </div>
        <div className="topbar-actions">
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
          <button type="button" className="ghost" onClick={signOut}>
            Cerrar sesion
          </button>
        </div>
      </header>

      <section className="kpi-grid">
        <article>
          <h2>Ingreso del mes</h2>
          <strong>{currency.format(summary.plannedIncome)}</strong>
        </article>
        <article>
          <h2>Te tienen que dar</h2>
          <strong>{currency.format(summary.toReceive)}</strong>
        </article>
        <article>
          <h2>Gastos del mes</h2>
          <strong>{currency.format(summary.toPay)}</strong>
        </article>
        <article>
          <h2>Saldo proyectado</h2>
          <strong>{currency.format(summary.projectedBalance)}</strong>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel content-panel">
          <div className="panel-header">
            <h2>Movimientos del mes</h2>
            <div className="panel-header-actions">
              {loading && <span>Cargando...</span>}
              <button type="button" onClick={openMovementModal}>
                Agregar movimiento
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripcion</th>
                  <th>Monto</th>
                  <th>Notas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {movementRows.length === 0 && (
                  <tr className="empty-row">
                    <td className="empty-cell" data-label="Estado" colSpan="5">
                      No hay movimientos para este mes.
                    </td>
                  </tr>
                )}

                {movementRows.map((movement) => (
                  <tr key={movement.id}>
                    <td data-label="Tipo">{movementTypes.find((item) => item.value === movement.type)?.label}</td>
                    <td data-label="Descripcion">{movement.description}</td>
                    <td data-label="Monto">{currency.format(Number(movement.amount))}</td>
                    <td data-label="Notas">{movement.notes || '-'}</td>
                    <td data-label="Acciones">
                      <div className="actions">
                        {movement.isGroupedSummary ? (
                          <button
                            type="button"
                            className="small"
                            onClick={() => openDetailsModal(movement.groupType)}
                          >
                            Ver
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="small"
                              onClick={() => openEditModal(movement)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="small danger"
                              onClick={() => deleteMovement(movement.id)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {isMovementModalOpen && (
        <div className="modal-backdrop" onClick={closeMovementModal}>
          <article className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingMovementId ? 'Editar movimiento' : 'Agregar movimiento'}</h2>
              <button type="button" className="ghost small" onClick={closeMovementModal}>
                Cerrar
              </button>
            </div>

            <form onSubmit={saveMovement} className="movement-form">
              <label>
                Tipo
                <select
                  value={movementForm.type}
                  onChange={(event) =>
                    setMovementForm((prev) => ({
                      ...prev,
                      type: event.target.value,
                      person: event.target.value === 'receivable' ? prev.person : '',
                    }))
                  }
                >
                  {movementTypes.map((type) => (
                    <option value={type.value} key={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cuotas
                <select
                  value={movementForm.installment_mode}
                  onChange={(event) =>
                    setMovementForm((prev) => ({
                      ...prev,
                      installment_mode: event.target.value,
                      installment_label: event.target.value === 'with' ? prev.installment_label : '',
                    }))
                  }
                >
                  <option value="none">Sin cuotas</option>
                  <option value="with">Con cuotas</option>
                </select>
              </label>

              {movementForm.type === 'receivable' && (
                <label>
                  Persona
                  <input
                    required
                    value={movementForm.person}
                    onChange={(event) =>
                      setMovementForm((prev) => ({ ...prev, person: event.target.value }))
                    }
                    placeholder="Ej: Juana"
                  />
                </label>
              )}

              <label>
                Descripcion
                <input
                  required
                  value={movementForm.description}
                  onChange={(event) =>
                    setMovementForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Ej: Internet, adelanto, notebook"
                />
              </label>

              {showInstallmentInput && (
                <label>
                  Cuota
                  <input
                    required
                    inputMode="numeric"
                    maxLength="5"
                    value={movementForm.installment_label}
                    onChange={(event) =>
                      setMovementForm((prev) => ({
                        ...prev,
                        installment_label: formatInstallment(event.target.value),
                      }))
                    }
                    placeholder="00/00"
                  />
                </label>
              )}

              <label>
                Monto
                <input
                  required
                  inputMode="decimal"
                  value={movementForm.amount}
                  onChange={(event) =>
                    setMovementForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  placeholder="Ej: 150000"
                />
              </label>

              <label>
                Notas
                <textarea
                  rows="3"
                  value={movementForm.notes}
                  onChange={(event) =>
                    setMovementForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="Detalle opcional"
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeMovementModal}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}>
                  {saving
                    ? editingMovementId
                      ? 'Guardando cambios...'
                      : 'Guardando...'
                    : editingMovementId
                      ? 'Guardar cambios'
                      : 'Guardar movimiento'}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {detailsModalType && (
        <div className="modal-backdrop" onClick={closeDetailsModal}>
          <article className="modal-card wide" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{groupLabels[detailsModalType]}</h2>
              <button type="button" className="ghost small" onClick={closeDetailsModal}>
                Cerrar
              </button>
            </div>

            <div className="table-scroll modal-mini-table">
              <table>
                <thead>
                  <tr>
                    <th>Descripcion</th>
                    <th>Cuota</th>
                    {detailsModalType === 'receivable' && <th>Persona</th>}
                    <th>Monto</th>
                    <th>Notas</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {detailMovements.length === 0 && (
                    <tr className="empty-row">
                      <td
                        className="empty-cell"
                        data-label="Estado"
                        colSpan={detailsModalType === 'receivable' ? 6 : 5}
                      >
                        No hay movimientos en este grupo para este mes.
                      </td>
                    </tr>
                  )}

                  {detailMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td data-label="Descripcion">{movement.description}</td>
                      <td data-label="Cuota">{movement.installment_label || 'Sin cuotas'}</td>
                      {detailsModalType === 'receivable' && <td data-label="Persona">{movement.person || '-'}</td>}
                      <td data-label="Monto">{currency.format(Number(movement.amount))}</td>
                      <td data-label="Notas">{movement.notes || '-'}</td>
                      <td data-label="Acciones">
                        <div className="actions">
                          <button type="button" className="small" onClick={() => openEditModal(movement)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="small danger"
                            onClick={() => deleteMovement(movement.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={closeDetailsModal}>
                Cerrar
              </button>
            </div>
          </article>
        </div>
      )}

      {error && <p className="error-message">{error}</p>}
    </main>
  )
}

export default App
