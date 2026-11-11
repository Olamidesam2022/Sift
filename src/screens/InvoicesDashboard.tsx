import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { AlertCircle, ArrowRight, Check, ChevronDown, Copy, RefreshCw, X } from 'lucide-react'
import type { MouseEvent } from 'react'
import { createPaymentPlan, getInvoice, listInvoices, markMockInvoicePaid, resetMockInvoices, USE_MOCK } from '../api'
import type { InvoiceStatus, InvoiceSummary } from '../api/types'
import AnimatedNumber, { formatCurrency } from '../components/AnimatedNumber'

type Filter = 'All' | 'Outstanding' | 'Paid' | 'Overdue'
const filters: Filter[] = ['All', 'Outstanding', 'Paid', 'Overdue']
const isPaid = (invoice: InvoiceSummary) => invoice.status === 'PAID'
const isOverdue = (invoice: InvoiceSummary) => invoice.overdue && !isPaid(invoice)
const isOutstanding = (invoice: InvoiceSummary) => !isPaid(invoice) && invoice.status !== 'CANCELLED'
const balance = (invoice: InvoiceSummary) => Math.max(0, invoice.total - (invoice.amountPaid ?? 0))
const formatDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}
const relativeDueText = (invoice: InvoiceSummary) => {
  if (isPaid(invoice)) return `Paid ${formatDate(invoice.dueDate)}`
  const dueDate = new Date(`${invoice.dueDate.slice(0, 10)}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const days = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000)
  if (isOverdue(invoice) || days < 0) {
    const late = Math.max(1, Math.abs(days))
    return `${late} ${late === 1 ? 'day' : 'days'} late`
  }
  if (days === 0) return 'Due today'
  return `in ${days} ${days === 1 ? 'day' : 'days'}`
}
const statusLabel: Record<InvoiceStatus, string> = { DRAFT: 'Draft', SENT: 'Sent', PAID: 'Paid', PARTIALLY_PAID: 'Part paid', CANCELLED: 'Cancelled' }

function StatusPill({ invoice }: { invoice: InvoiceSummary }) {
  const reduceMotion = useReducedMotion()
  const overdue = isOverdue(invoice)
  const status = overdue ? 'OVERDUE' : invoice.status
  const planOffered = invoice.paymentPlanOffered && invoice.status !== 'PARTIALLY_PAID'
  const label = planOffered ? 'Plan offered' : overdue ? 'Overdue' : statusLabel[invoice.status]
  return <span className={`status-pill ${planOffered ? 'plan-offered' : overdue ? 'overdue' : invoice.status.toLowerCase()}`} aria-label={`Invoice status: ${label}`}>
    {overdue && <i aria-hidden="true" />}
    <AnimatePresence mode="wait" initial={false}><motion.span key={status} initial={reduceMotion ? false : { opacity: 0, scale: .88 }} animate={{ opacity: 1, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, scale: .92 }} transition={{ duration: reduceMotion ? 0 : .18 }}>{label}</motion.span></AnimatePresence>
  </span>
}

function SkeletonBlock({ className = '' }: { className?: string }) { return <span className={`skeleton ${className}`} aria-hidden="true" /> }

function DashboardSkeleton() {
  return <div className="dashboard-skeleton" role="status" aria-label="Loading invoices" aria-busy="true">
    <div className="summary-grid">{[0, 1, 2].map((key) => <div className="summary-card" key={key}><SkeletonBlock className="sk-label" /><SkeletonBlock className="sk-amount" /><SkeletonBlock className="sk-count" /></div>)}</div>
    <div className="filter-skeleton">{[0, 1, 2, 3].map((key) => <SkeletonBlock className="sk-chip" key={key} />)}</div>
    <div className="invoice-list-skeleton">{[0, 1, 2, 3].map((key) => <div className="skeleton-row" key={key}><SkeletonBlock className="sk-client" /><SkeletonBlock className="sk-amount" /><SkeletonBlock className="sk-date" /><SkeletonBlock className="sk-status" /></div>)}</div>
  </div>
}

function currencyGroups(invoices: InvoiceSummary[], getAmount: (invoice: InvoiceSummary) => number) {
  const groups = new Map<string, number>()
  invoices.forEach((invoice) => groups.set(invoice.currency, (groups.get(invoice.currency) ?? 0) + getAmount(invoice)))
  if (!groups.size) groups.set('USD', 0)
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function SummaryAmount({ invoices, getAmount }: { invoices: InvoiceSummary[]; getAmount: (invoice: InvoiceSummary) => number }) {
  const groups = currencyGroups(invoices, getAmount)
  return <span className="summary-amount">{groups.map(([currency, value]) => <span key={currency}><AnimatedNumber value={value} currency={currency} />{groups.length > 1 && <small>{currency}</small>}</span>)}</span>
}

function InvoiceRow({ invoice, index, changed, fresh, onClick }: { invoice: InvoiceSummary; index: number; changed: boolean; fresh: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void }) {
  const reduceMotion = useReducedMotion()
  return <motion.button
    type="button"
    layout={!reduceMotion}
    className={`invoice-row ${isOverdue(invoice) ? 'overdue-row' : ''} ${changed ? 'row-updated' : ''} ${fresh ? 'row-new' : ''}`}
    aria-label={`${invoice.clientName}, invoice ${invoice.invoiceId}, ${formatCurrency(invoice.total, invoice.currency)}, ${relativeDueText(invoice)}, ${isOverdue(invoice) ? 'overdue' : statusLabel[invoice.status]}${(invoice.amountPaid ?? 0) > 0 && invoice.status !== 'PAID' ? `, ${formatCurrency(invoice.amountPaid ?? 0, invoice.currency)} received` : ''}`}
    onClick={onClick}
    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
    transition={{ duration: reduceMotion ? 0 : .24, delay: reduceMotion ? 0 : index * .035 }}
  >
    <span className="row-client"><strong>{invoice.clientName}</strong><small>{invoice.invoiceId}</small></span>
    <span className="row-amount">{formatCurrency(invoice.total, invoice.currency)}</span>
    <span className="row-date">{formatDate(invoice.dueDate)}</span>
    <StatusPill invoice={invoice} />
    <ArrowRight className="row-arrow" size={15} aria-hidden="true" />
    <span className="mobile-row">
      <span className="mobile-row-avatar">{invoice.clientName.trim().charAt(0).toUpperCase() || '?'}</span>
      <span className="mobile-row-client">{invoice.clientName}</span>
      <span className="mobile-row-amount"><strong>{formatCurrency(invoice.total, invoice.currency)}</strong>{(invoice.amountPaid ?? 0) > 0 && invoice.status !== 'PAID' && <small>{formatCurrency(invoice.amountPaid ?? 0, invoice.currency)} received</small>}</span>
      <span className="mobile-row-details">
        <span className="mobile-row-meta"><span>{invoice.invoiceId}</span><i aria-hidden="true" /><span>{formatDate(invoice.dueDate)}</span><span className={isOverdue(invoice) ? 'mobile-relative late' : isPaid(invoice) ? 'mobile-relative paid' : 'mobile-relative'}>{relativeDueText(invoice)}</span></span>
        <StatusPill invoice={invoice} />
      </span>
    </span>
  </motion.button>
}

function DrawerSkeleton() {
  return <div className="drawer-skeleton" aria-label="Loading invoice details"><SkeletonBlock className="sk-drawer-title" /><SkeletonBlock className="sk-drawer-amount" /><SkeletonBlock className="sk-drawer-row" /><SkeletonBlock className="sk-drawer-row" /><SkeletonBlock className="sk-drawer-link" /></div>
}

type Props = { highlightInvoiceId?: string | null; onNewInvoice: () => void }

export default function InvoicesDashboard({ highlightInvoiceId, onNewInvoice }: Props) {
  const reduceMotion = useReducedMotion()
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [initialError, setInitialError] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [clock, setClock] = useState(Date.now())
  const [filter, setFilter] = useState<Filter>('All')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InvoiceSummary | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [demoMessage, setDemoMessage] = useState('')
  const [toast, setToast] = useState('')
  const [planPicker, setPlanPicker] = useState(false)
  const [planInstallments, setPlanInstallments] = useState<2 | 3>(2)
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState('')
  const [planConfirmation, setPlanConfirmation] = useState<{ invoiceId: string; minimumAmountDue: number; installments: number } | null>(null)
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set())
  const [freshId, setFreshId] = useState<string | null>(highlightInvoiceId ?? null)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const hasBaseline = useRef(false)
  const statuses = useRef(new Map<string, InvoiceStatus>())
  const offeredPlanIds = useRef(new Set<string>())
  const flashTimer = useRef<number | undefined>(undefined)
  const toastTimer = useRef<number | undefined>(undefined)
  const freshTimer = useRef<number | undefined>(undefined)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  useLayoutEffect(() => { window.scrollTo(0, 0) }, [])

  const refreshInvoices = useCallback(async () => {
    if (document.hidden || inFlight.current) return
    inFlight.current = true
    if (!hasBaseline.current) setLoading(true)
    try {
      const listed = await listInvoices()
      const next = listed.map((invoice) => offeredPlanIds.current.has(invoice.invoiceId) ? { ...invoice, paymentPlanOffered: true } : invoice)
      if (!mounted.current) return
      const changes = hasBaseline.current ? next.filter((invoice) => statuses.current.has(invoice.invoiceId) && statuses.current.get(invoice.invoiceId) !== invoice.status) : []
      if (changes.length) {
        const ids = new Set(changes.map((invoice) => invoice.invoiceId))
        setFlashingIds(ids)
        window.clearTimeout(flashTimer.current)
        flashTimer.current = window.setTimeout(() => setFlashingIds(new Set()), 1100)
        const paymentChange = changes.find((invoice) => invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID')
        if (paymentChange) {
          setToast(paymentChange.status === 'PAID' ? `Invoice for ${paymentChange.clientName} was paid` : `Invoice for ${paymentChange.clientName} was partially paid`)
          window.clearTimeout(toastTimer.current)
          toastTimer.current = window.setTimeout(() => setToast(''), 3600)
        }
      }
      statuses.current = new Map(next.map((invoice) => [invoice.invoiceId, invoice.status]))
      hasBaseline.current = true
      setInvoices(next)
      setDetail((current) => current ? { ...current, ...(next.find((invoice) => invoice.invoiceId === current.invoiceId) ?? {}) } : null)
      setInitialError(false)
      setReconnecting(false)
      setLoading(false)
      setLastUpdated(Date.now())
    } catch {
      if (!mounted.current) return
      setLoading(false)
      if (hasBaseline.current) setReconnecting(true)
      else setInitialError(true)
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      window.clearTimeout(flashTimer.current)
      window.clearTimeout(toastTimer.current)
      window.clearTimeout(freshTimer.current)
      window.clearTimeout(copyTimer.current)
    }
  }, [])

  useEffect(() => {
    let interval: number | undefined
    const syncVisibility = () => {
      window.clearInterval(interval)
      interval = undefined
      if (!document.hidden) {
        void refreshInvoices()
        interval = window.setInterval(() => { void refreshInvoices() }, 5000)
      }
    }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', syncVisibility)
    }
  }, [refreshInvoices])

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => { setPage(0) }, [filter, highlightInvoiceId])

  useLayoutEffect(() => {
    if (!invoices.length) return
    let frame = 0
    const measure = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const table = tableRef.current
        if (!table) return
        const tableTop = table.getBoundingClientRect().top
        const headerHeight = table.querySelector('.invoice-table-head')?.getBoundingClientRect().height ?? 32
        const rowHeight = table.querySelector('.invoice-row')?.getBoundingClientRect().height ?? 50
        const footerHeight = document.querySelector('footer')?.getBoundingClientRect().height ?? 24
        const available = window.innerHeight - tableTop - headerHeight - footerHeight - 68
        const fit = Math.max(1, Math.min(10, Math.floor(available / Math.max(rowHeight, 1))))
        setPageSize((current) => current === fit ? current : fit)
      })
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (tableRef.current) observer?.observe(tableRef.current)
    const summary = document.querySelector('.summary-grid')
    const tools = document.querySelector('.invoice-list-tools')
    if (summary) observer?.observe(summary)
    if (tools) observer?.observe(tools)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [filter, invoices.length, loading])

  useEffect(() => {
    if (!highlightInvoiceId || !invoices.some((invoice) => invoice.invoiceId === highlightInvoiceId)) return
    setFreshId(highlightInvoiceId)
    window.clearTimeout(freshTimer.current)
    freshTimer.current = window.setTimeout(() => setFreshId(null), 2600)
  }, [highlightInvoiceId, invoices])

  const closeDetail = () => {
    setDetail(null)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!detail) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeDetail(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) { event.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [detail?.invoiceId])

  const openDetail = async (invoice: InvoiceSummary, trigger?: HTMLElement) => {
    if (trigger) triggerRef.current = trigger
    setSelectedId(invoice.invoiceId)
    setDetail(invoice)
    setDetailError(false)
    setDetailLoading(true)
    setCopied(false)
    setCopyError(false)
    try { setDetail(await getInvoice(invoice.invoiceId)) }
    catch { setDetailError(true) }
    finally { setDetailLoading(false) }
  }
  const retryList = () => { setInitialError(false); setLoading(true); void refreshInvoices() }
  const retryDetail = () => { if (selectedId) void openDetail(invoices.find((invoice) => invoice.invoiceId === selectedId) ?? { invoiceId: selectedId } as InvoiceSummary) }
  const copyLink = async () => {
    if (!detail?.payerViewUrl) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(detail.payerViewUrl)
      else {
        const input = document.createElement('textarea')
        input.value = detail.payerViewUrl
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        const copiedToClipboard = document.execCommand('copy')
        input.remove()
        if (!copiedToClipboard) throw new Error('Clipboard unavailable')
      }
      setCopied(true)
      setCopyError(false)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch { setCopyError(true) }
  }
  const markSelectedPaid = () => {
    if (!selectedId) { setDemoMessage('Select an invoice row first.'); return }
    const selected = invoices.find((invoice) => invoice.invoiceId === selectedId)
    if (!selected) { setDemoMessage('That invoice is no longer in the list.'); return }
    if (selected.status === 'PAID') { setDemoMessage('This invoice is already paid.'); return }
    if (markMockInvoicePaid(selectedId)) {
      setDemoMessage('Marked paid. Checking for the update…')
      void refreshInvoices()
    }
    else setDemoMessage('Could not update that invoice. Try again.')
  }

  const suggestPaymentPlan = async () => {
    if (!detail || planBusy) return
    setPlanBusy(true)
    setPlanError('')
    try {
      const result = await createPaymentPlan(detail.invoiceId, { installments: planInstallments })
      if (!result.partialPaymentEnabled) throw new Error('Plan unavailable')
      if (result.partialPaymentEnabled) offeredPlanIds.current.add(result.invoiceId)
      const updated = { ...detail, paymentPlanOffered: result.partialPaymentEnabled }
      setDetail(updated)
      setInvoices((current) => current.map((invoice) => invoice.invoiceId === result.invoiceId ? { ...invoice, paymentPlanOffered: result.partialPaymentEnabled } : invoice))
      setPlanConfirmation({ invoiceId: result.invoiceId, minimumAmountDue: result.minimumAmountDue, installments: planInstallments })
      setPlanPicker(false)
      setToast(`Payment plan offered to ${detail.clientName}`)
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(''), 3600)
    } catch {
      setPlanError('Pay in parts isn’t available right now')
    } finally { setPlanBusy(false) }
  }

  const resetDemo = () => {
    const seeded = resetMockInvoices()
    offeredPlanIds.current.clear()
    setInvoices(seeded)
    setDetail(null)
    setSelectedId(null)
    setPlanPicker(false)
    setPlanConfirmation(null)
    statuses.current = new Map(seeded.map((invoice) => [invoice.invoiceId, invoice.status]))
    hasBaseline.current = true
    setLastUpdated(Date.now())
    setToast('Demo data reset')
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2800)
  }

  const totals = useMemo(() => {
    const outstanding = invoices.filter(isOutstanding)
    const paid = invoices.filter(isPaid)
    const overdue = invoices.filter(isOverdue)
    const extra = invoices.filter((invoice) => invoice.draftType === 'change_order')
    return { outstanding, paid, overdue, extra }
  }, [invoices])
  const counts: Record<Filter, number> = {
    All: invoices.length,
    Outstanding: totals.outstanding.length,
    Paid: totals.paid.length,
    Overdue: totals.overdue.length,
  }
  const visibleInvoices = useMemo(() => {
    const rows = invoices.filter((invoice) => filter === 'All'
      || filter === 'Outstanding' && isOutstanding(invoice)
      || filter === 'Paid' && isPaid(invoice)
      || filter === 'Overdue' && isOverdue(invoice))
    return rows.sort((a, b) => {
      if (a.invoiceId === highlightInvoiceId) return -1
      if (b.invoiceId === highlightInvoiceId) return 1
      if (isOverdue(a) !== isOverdue(b)) return isOverdue(a) ? -1 : 1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [filter, highlightInvoiceId, invoices])
  const pageCount = Math.max(1, Math.ceil(visibleInvoices.length / pageSize))
  const pageInvoices = visibleInvoices.slice(page * pageSize, (page + 1) * pageSize)
  const rangeStart = visibleInvoices.length ? page * pageSize + 1 : 0
  const rangeEnd = Math.min((page + 1) * pageSize, visibleInvoices.length)
  useEffect(() => { if (page >= pageCount) setPage(Math.max(0, pageCount - 1)) }, [page, pageCount])
  const updatedText = lastUpdated === null ? 'Waiting for first update' : clock - lastUpdated < 5000 ? 'Updated just now' : `Updated ${Math.floor((clock - lastUpdated) / 1000)}s ago`

  return <div className="dashboard-screen">
    <div className="dashboard-toolbar">
      <div className="live-meta"><span className={`data-mode-badge ${USE_MOCK ? 'mock' : 'live'}`}>{USE_MOCK ? 'Demo data' : 'Live (PayPal sandbox)'}</span><span>{updatedText}</span>{reconnecting && <span className="reconnecting"><RefreshCw size={12} />Reconnecting…</span>}</div>
      {USE_MOCK && <div className="demo-control-wrap">
        <button className="reset-demo-button" type="button" onClick={resetDemo}>Reset demo</button>
        <button className="demo-controls-button" type="button" aria-expanded={demoOpen} aria-controls="demo-controls-panel" onClick={() => { setDemoOpen((open) => !open); setDemoMessage('') }}>Demo controls<ChevronDown size={13} /></button>
        <AnimatePresence>{demoOpen && <motion.div id="demo-controls-panel" className="demo-controls-panel" initial={reduceMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -4 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
          <strong>Demo controls</strong><p>Select an invoice row, then mark it paid to preview live updates.</p><button type="button" onClick={markSelectedPaid} disabled={!selectedId || invoices.find((invoice) => invoice.invoiceId === selectedId)?.status === 'PAID'}>Mark selected invoice as paid</button>{demoMessage && <span role="status">{demoMessage}</span>}
        </motion.div>}</AnimatePresence>
      </div>}
    </div>

    {loading && !invoices.length ? <DashboardSkeleton /> : initialError && !invoices.length ? <div className="dashboard-error" role="alert"><AlertCircle size={18} /><div><strong>Invoices couldn’t load.</strong><p>Check your connection and try again.</p></div><button className="small-button" type="button" onClick={retryList}>Retry</button></div> : <>
      <div className={`summary-grid ${invoices.some((invoice) => invoice.draftType !== undefined) ? 'has-extra-card' : ''}`}>
        <SummaryCard title="Outstanding" tone="outstanding" invoices={totals.outstanding} amount={balance} />
        <SummaryCard title="Paid" tone="paid" invoices={totals.paid} amount={(invoice) => invoice.total} />
        <SummaryCard title="Overdue" tone="overdue" invoices={totals.overdue} amount={balance} />
        {invoices.some((invoice) => invoice.draftType !== undefined) && <SummaryCard title="Extra work billed" tone="extra" invoices={totals.extra} amount={(invoice) => invoice.total} />}
      </div>
      <div className="invoice-list-tools"><div className="filter-chips" role="group" aria-label="Filter invoices">{filters.map((name) => <button key={name} className={`filter-chip ${filter === name ? 'active' : ''}`} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}<span><AnimatedNumber value={counts[name]} format="number" /></span></button>)}</div><span className="invoice-total-count">{invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}</span></div>
      {invoices.length === 0 ? <div className="invoice-empty"><strong>No invoices yet</strong><p>Invoices you send will show up here.</p><button className="primary-button" type="button" onClick={onNewInvoice}>Create an invoice <ArrowRight size={15} /></button></div> : visibleInvoices.length === 0 ? <div className="filter-empty">No {filter.toLowerCase()} invoices.</div> : <div className="invoice-list-pager">
        <div className="invoice-table" ref={tableRef}>
          <div className="invoice-table-head"><span>Client</span><span>Amount</span><span>Due date</span><span>Status</span><span /></div>
          <LayoutGroup><div className="invoice-rows"><AnimatePresence initial={false}>{pageInvoices.map((invoice, index) => <InvoiceRow key={invoice.invoiceId} invoice={invoice} index={index} changed={flashingIds.has(invoice.invoiceId)} fresh={invoice.invoiceId === freshId} onClick={(event) => void openDetail(invoice, event.currentTarget)} />)}</AnimatePresence></div></LayoutGroup>
        </div>
        {visibleInvoices.length > pageSize && <div className="invoice-pagination"><span>Showing {rangeStart}–{rangeEnd} of {visibleInvoices.length}</span><div><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous {pageSize}</button><button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>Next {pageSize}<ArrowRight size={13} /></button></div></div>}
      </div>}
    </>}

    <AnimatePresence>{toast && <motion.div className="payment-toast" role="status" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: 5 }} transition={{ duration: reduceMotion ? 0 : .2 }}><Check size={15} />{toast}<button type="button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></motion.div>}</AnimatePresence>

    {createPortal(<AnimatePresence>{detail && <motion.div className="invoice-drawer-backdrop" role="presentation" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetail() }}>
      <motion.aside ref={panelRef} className="invoice-drawer" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title" initial={reduceMotion ? false : { x: 420 }} animate={{ x: 0 }} exit={reduceMotion ? undefined : { x: 420 }} transition={{ duration: reduceMotion ? 0 : .28, ease: [.22, .7, .2, 1] }}>
        <div className="drawer-header"><div><span>Invoice details</span><h2 id="invoice-detail-title">{detail.clientName}</h2></div><button ref={closeRef} className="icon-button" type="button" aria-label="Close invoice details" onClick={closeDetail}><X size={18} /></button></div>
        {detailLoading ? <DrawerSkeleton /> : detailError ? <div className="drawer-error" role="alert"><p>Invoice details couldn’t load.</p><button className="small-button" type="button" onClick={retryDetail}>Retry</button></div> : <>
          <div className="drawer-total"><span>Invoice total</span><strong>{formatCurrency(detail.total, detail.currency)}</strong><StatusPill invoice={detail} /></div>
          <dl className="detail-fields"><div><dt>Invoice number</dt><dd>{detail.invoiceId}</dd></div><div><dt>Client</dt><dd>{detail.clientEmail || detail.clientName}</dd></div><div><dt>Due date</dt><dd>{formatDate(detail.dueDate)}</dd></div>{detail.draftType && <div><dt>Type</dt><dd>{detail.draftType === 'change_order' ? 'Change order' : 'Invoice'}</dd></div>}</dl>
          {detail.lineItems?.length ? <div className="drawer-lines"><h3>Line items</h3>{detail.lineItems.map((item, index) => <div key={index}><span>{item.description}</span><strong>{formatCurrency(item.amount, detail.currency)}</strong></div>)}</div> : null}
          {detail.note && <div className="drawer-note"><span>Note</span><p>{detail.note}</p></div>}
          {isOutstanding(detail) && <section className="payment-plan-card" aria-labelledby="payment-plan-title">
            <AnimatePresence mode="wait" initial={false}>
              {detail.paymentPlanOffered ? <motion.div key="confirmed" className="plan-confirmation" initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .22 }}><span className="plan-check"><Check size={15} /></span><div><h3 id="payment-plan-title">Plan offered</h3><p>{detail.status === 'PARTIALLY_PAID' ? 'A payment has already been made toward this invoice.' : 'The client can now pay this invoice in parts.'}</p>{planConfirmation?.invoiceId === detail.invoiceId && <small>First payment due today: {formatCurrency(planConfirmation.minimumAmountDue, detail.currency)} · {planConfirmation.installments} instalments</small>}</div></motion.div> : !planPicker ? <motion.div key="offer" initial={false}><h3 id="payment-plan-title">Offer pay in parts?</h3><p>Let the client split the remaining balance into smaller payments.</p><button type="button" className="small-button" onClick={() => { setPlanPicker(true); setPlanError('') }}>Suggest a plan <ArrowRight size={14} /></button></motion.div> : <motion.div key="picker" initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
                <h3 id="payment-plan-title">Choose a payment plan</h3><div className="plan-options" role="group" aria-label="Number of instalments">{([2, 3] as const).map((count) => <button type="button" key={count} className={planInstallments === count ? 'selected' : ''} aria-pressed={planInstallments === count} onClick={() => setPlanInstallments(count)}>{count} instalments</button>)}</div>
                {(() => { const cents = Math.round(balance(detail) * 100); const each = Math.floor(cents / planInstallments); const amounts = Array.from({ length: planInstallments }, () => each); amounts[planInstallments - 1] = cents - each * (planInstallments - 1); const money = (amount: number) => formatCurrency(amount / 100, detail.currency); return <p className="plan-preview">The client pays {money(amounts[0])} now, then {amounts.slice(1).map(money).join(', then ')}. The last payment includes any rounding difference.</p> })()}
                {planError && <p className="plan-error" role="alert">{planError}</p>}<div className="plan-actions"><button type="button" className="plan-cancel" onClick={() => { setPlanPicker(false); setPlanError('') }} disabled={planBusy}>Cancel</button><button type="button" className="small-button" onClick={() => void suggestPaymentPlan()} disabled={planBusy}>{planBusy ? 'Sending…' : 'Send plan'}</button></div>
              </motion.div>}
            </AnimatePresence>
          </section>}
          <div className="payer-link-box"><div><span>Payer link</span>{detail.payerViewUrl ? <a href={detail.payerViewUrl} target="_blank" rel="noreferrer">{detail.payerViewUrl}</a> : <p>Payment link isn’t available for this invoice.</p>}</div>{detail.payerViewUrl && <button className={`copy-link-button ${copied ? 'copied' : ''}`} type="button" onClick={() => void copyLink()} aria-label={copied ? 'Payment link copied' : 'Copy payer link'}>{copied ? <Check size={15} /> : <Copy size={15} />}<AnimatePresence mode="wait" initial={false}><motion.span key={copied ? 'copied' : 'copy'} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: reduceMotion ? 0 : .14 }}>{copied ? 'Copied' : 'Copy'}</motion.span></AnimatePresence></button>}</div>
          {copyError && <p className="copy-error" role="alert">Couldn’t copy the link. Select and copy it instead.</p>}
        </>}
      </motion.aside>
    </motion.div>}</AnimatePresence>, document.body)}
  </div>
}

function SummaryCard({ title, tone, invoices, amount }: { title: string; tone: string; invoices: InvoiceSummary[]; amount: (invoice: InvoiceSummary) => number }) {
  return <section className={`summary-card ${tone}`} aria-label={`${title}: ${invoices.length} invoices`}><h2>{title}</h2><SummaryAmount invoices={invoices} getAmount={amount} /><p><AnimatedNumber value={invoices.length} format="number" /> {invoices.length === 1 ? 'invoice' : 'invoices'}</p></section>
}


