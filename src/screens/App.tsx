import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { ArrowLeft, ArrowRight, Check, Clock3, ExternalLink, FileText, Moon, Plus, Send, Sun, Trash2 } from 'lucide-react'
import { analyze, createInvoice } from '../api'
import type { AnalyzeResult, LineItem } from '../api/types'
import AnimatedNumber, { formatCurrency } from '../components/AnimatedNumber'
import Logo from '../components/Logo'
import ScopeCheck, { findPhraseMatches } from '../components/ScopeCheck'
import Stepper from '../components/Stepper'
import Thinking from '../components/Thinking'
import InvoicesDashboard from './InvoicesDashboard'

const FLOW_STATE_KEY = 'sift.live-flow-state.v1'
type SavedFlowState = {
  step: number
  quote: string
  message: string
  result: AnalyzeResult | null
  items: LineItem[]
  email: string
  sent: { id: string; url: string } | null
  highlightInvoiceId: string | null
}

function readSavedFlowState(): SavedFlowState | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(FLOW_STATE_KEY) || 'null') as Partial<SavedFlowState> | null
    if (!value || !Number.isInteger(value.step) || value.step! < 0 || value.step! > 3) return null
    const result = value.result && typeof value.result === 'object' ? value.result : null
    return {
      step: (value.step === 1 || value.step === 2) && !result ? 0 : value.step!,
      quote: typeof value.quote === 'string' ? value.quote : '',
      message: typeof value.message === 'string' ? value.message : '',
      result,
      items: Array.isArray(value.items) ? value.items : [],
      email: typeof value.email === 'string' ? value.email : '',
      sent: value.sent && typeof value.sent.id === 'string' && typeof value.sent.url === 'string' ? value.sent : null,
      highlightInvoiceId: typeof value.highlightInvoiceId === 'string' ? value.highlightInvoiceId : null,
    }
  } catch { return null }
}

const slideVariants = {
  initial: (direction: number) => ({ opacity: 0, x: direction * 28 }),
  animate: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -22 }),
}

export default function App() {
  const reduceMotion = useReducedMotion()
  const [savedFlow] = useState(readSavedFlowState)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return window.localStorage.getItem('sift.theme') === 'dark' ? 'dark' : 'light' }
    catch { return 'light' }
  })
  const [step, setStep] = useState(savedFlow?.step ?? 0)
  const [direction, setDirection] = useState(1)
  const [quote, setQuote] = useState(savedFlow?.quote ?? '')
  const [message, setMessage] = useState(savedFlow?.message ?? '')
  const [result, setResult] = useState<AnalyzeResult | null>(savedFlow?.result ?? null)
  const [items, setItems] = useState<LineItem[]>(savedFlow?.items ?? [])
  const [email, setEmail] = useState(savedFlow?.email ?? '')
  const [busy, setBusy] = useState<'analyze' | 'send' | null>(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<{ id: string; url: string } | null>(savedFlow?.sent ?? null)
  const [highlightInvoiceId, setHighlightInvoiceId] = useState<string | null>(savedFlow?.highlightInvoiceId ?? null)
  const [activeLink, setActiveLink] = useState<number | null>(null)
  const sendLock = useRef(false)
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { window.localStorage.setItem('sift.theme', theme) } catch { /* Theme still works for this visit if storage is unavailable. */ }
  }, [theme])
  useEffect(() => {
    try {
      window.localStorage.removeItem('sift.mock.invoices.v1')
      window.sessionStorage.removeItem('sift.flow-state')
    } catch { /* Stale demo data is ignored if storage is unavailable. */ }
  }, [])
  useEffect(() => {
    try { window.sessionStorage.setItem(FLOW_STATE_KEY, JSON.stringify({ step, quote, message, result, items, email, sent, highlightInvoiceId })) }
    catch { /* The current flow still works if session storage is unavailable. */ }
  }, [step, quote, message, result, items, email, sent, highlightInvoiceId])
  const currency = result?.currency || 'USD'
  const phrases = result?.extraPhrases ?? []
  const linkable = !!result && phrases.length === items.length
  const linkedPhrases = new Set(findPhraseMatches(message, phrases).map((match) => match.phraseIndex))

  const go = (next: number) => {
    setDirection(next >= step ? 1 : -1)
    setStep(next)
    setError('')
    setActiveLink(null)
  }

  const startNewRequest = () => {
    setQuote('')
    setMessage('')
    setResult(null)
    setItems([])
    setEmail('')
    setSent(null)
    setHighlightInvoiceId(null)
    setError('')
    setActiveLink(null)
    go(0)
  }

  const runAnalysis = async () => {
    if (!quote.trim() || !message.trim()) {
      setError('Add the quote and the client’s message first.')
      return
    }
    setError('')
    setBusy('analyze')
    try {
      const answer = await analyze({ quote, clientMessage: message })
      setResult(answer)
      setItems(answer.lineItems)
      go(1)
    } catch {
      setError('Couldn’t check the request. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const sendInvoice = async () => {
    if (sendLock.current || busy === 'send') return
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid client email.')
      return
    }
    if (!result) return
    sendLock.current = true
    setBusy('send')
    setError('')
    try {
      const response = await createInvoice({
        clientEmail: email,
        draftType: result.draftType ?? (result.verdict === 'out_of_scope' ? 'change_order' : 'invoice'),
        lineItems: items,
        total,
        currency: result.currency,
        note: result.verdict === 'out_of_scope' ? 'Change order for the additional requested work.' : 'Invoice for the agreed project work.',
      })
      setSent({ id: response.invoiceId, url: response.payerViewUrl })
      go(2)
      window.setTimeout(() => confetti({ particleCount: 90, spread: 68, origin: { y: .7 }, colors: ['#176b4b', '#e9a83b', '#dc705a', '#f8f7f2'] }), 100)
    } catch {
      setError('Couldn’t send the invoice. Try again.')
    } finally {
      sendLock.current = false
      setBusy(null)
    }
  }

  const updateItem = (index: number, key: keyof LineItem, value: string) => {
    setItems((current) => current.map((item, i) => i === index
      ? { ...item, [key]: key === 'amount' ? Number(value) : value }
      : item))
  }

  const pageTitle = step === 0 ? 'What did they ask for?'
    : step === 1 ? 'Here’s what’s extra.'
      : step === 2 ? (sent ? 'Invoice sent' : 'Review and send.')
      : 'Where your money is'
  const pageSubtitle = step === 0 ? 'Paste the agreed quote and the client’s new message. Sift finds the extra work.'
    : step === 1 ? 'Review the marked requests and adjust the draft.'
      : step === 2 ? (sent ? `Payment link ready for ${email}.` : 'Check the amount and recipient before sending.')
        : 'A live view of the invoices you’ve sent.'
  const invoiceDraftType = result?.draftType ?? (result?.verdict === 'out_of_scope' ? 'change_order' : 'invoice')

  return <div className={`app-shell ${step === 3 ? 'dashboard-app' : ''}`}>
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#top" aria-label="Sift"><Logo className="brand-logo" /></a>
        <div className="topbar-account">
          <span className="sandbox-pill"><i />Sandbox</span>
          <button className="theme-toggle" type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-pressed={theme === 'dark'} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
          <div className="profile"><span className="avatar">F</span><span className="profile-name">Freelancer</span></div>
        </div>
      </div>
    </header>

    <main id="top" className={`main-content ${step === 3 ? 'dashboard-main' : ''}`}>
      <section className="content-band">
        <div className="page-heading"><h1>{pageTitle}</h1><p>{pageSubtitle}</p></div>
        <Stepper current={step} onInvoices={() => go(3)} />
      </section>

      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.section
          key={step}
          className="flow-card"
          custom={direction}
          variants={slideVariants}
          initial={reduceMotion ? false : 'initial'}
          animate="animate"
          exit={reduceMotion ? undefined : 'exit'}
          transition={{ duration: reduceMotion ? 0 : .3, ease: [.22, .7, .2, 1] }}
        >
          {step === 0 && <div className="input-layout">
            <div className="form-grid">
              <label className="field-label">Agreed quote
                <textarea className="text-area" rows={5} placeholder="Paste the quote or agreed scope…" value={quote} onChange={(event) => setQuote(event.target.value)} />
              </label>
              <label className="field-label">Client’s new message
                <textarea className="text-area" rows={5} placeholder="Paste the client’s latest message…" value={message} onChange={(event) => setMessage(event.target.value)} />
              </label>
            </div>
            {error && <ErrorNotice message={error} onRetry={() => void runAnalysis()} />}
            <div className="card-actions input-actions">
              <div className="input-secondary-actions">
                <button className="text-button view-invoices-button" type="button" onClick={() => go(3)}><FileText size={15} />View invoices</button>
              </div>
              <button className="primary-button" onClick={runAnalysis} disabled={!!busy} type="button">{busy === 'analyze' ? 'Checking…' : <>Sift this request <ArrowRight size={16} /></>}</button>
            </div>
            {busy === 'analyze' && <Thinking />}
          </div>}

          {step === 1 && result && <div className="scope-layout">
            <ScopeCheck message={message} quote={quote} result={result} activeLink={activeLink} onActiveLink={setActiveLink} lineItemCount={items.length} />
            <section className="items-section" aria-label="Draft line items">
              <div className="items-head"><div><h2>Line items</h2><p>Update the description or amount before sending.</p></div><button className="small-button" type="button" onClick={() => setItems((list) => [...list, { description: '', amount: 0 }])}><Plus size={15} />Add item</button></div>
              <div className="line-items">
                {items.map((item, index) => {
                  const isLinked = linkable && linkedPhrases.has(index)
                  return <motion.div
                    className={`item-row ${activeLink === index && isLinked ? 'linked-highlight' : ''}`}
                    key={index}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : .26, delay: reduceMotion ? 0 : index * .06 }}
                    onMouseEnter={() => isLinked && setActiveLink(index)}
                    onMouseLeave={() => isLinked && setActiveLink(null)}
                    onFocus={() => isLinked && setActiveLink(index)}
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActiveLink(null) }}
                  >
                    <span className="item-index">{String(index + 1).padStart(2, '0')}</span>
                    <input aria-label={`Line item ${index + 1} description`} value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} placeholder="Describe the work" />
                    <div className="amount-wrap"><span>$</span><input aria-label={`Line item ${index + 1} amount`} type="number" min="0" step="1" value={item.amount} onChange={(event) => updateItem(index, 'amount', event.target.value)} /></div>
                    <button className="icon-button remove-button" aria-label={`Remove line item ${index + 1}`} type="button" onClick={() => setItems((list) => list.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
                  </motion.div>
                })}
                {items.length === 0 && <p className="empty-items">No items yet. Add the work and amount.</p>}
              </div>
              <div className="total-row"><span>Total <small>{currency}</small></span><strong><AnimatedNumber value={total} currency={currency} /></strong></div>
            </section>
            {error && <p className="error-message" role="alert">{error}</p>}
            <div className="card-actions"><button className="back-button" type="button" onClick={() => go(0)}><ArrowLeft size={16} />Back</button><button className="primary-button" type="button" onClick={() => go(2)}>Review invoice <ArrowRight size={16} /></button></div>
          </div>}

          {step === 2 && result && <div className="review-layout">
            {sent ? <div className="success-state">
              <motion.div className="success-mark" initial={reduceMotion ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16, duration: reduceMotion ? 0 : .45 }}><Check size={32} strokeWidth={2.5} /></motion.div>
              <Logo variant="icon" className="success-logo" />
              <p className="success-copy">Your {invoiceDraftType === 'change_order' ? 'change order' : 'invoice'} is ready for {email}.</p>
              <div className="invoice-link"><div><span>Payment link</span><a href={sent.url} target="_blank" rel="noreferrer">{sent.url}</a></div><a className="open-link" href={sent.url} target="_blank" rel="noreferrer" aria-label="Open payment link"><ExternalLink size={17} /></a></div>
              <span className="invoice-id">Invoice number · {sent.id}</span>
              <button className="primary-button dashboard-link-button" type="button" onClick={() => { setHighlightInvoiceId(sent.id); go(3) }}>View in dashboard <ArrowRight size={16} /></button>
              <button className="secondary-button" type="button" onClick={startNewRequest}>Create another <ArrowRight size={16} /></button>
            </div> : <>
              <div className="invoice-preview">
                <div className="invoice-preview-head"><div><Logo className="preview-logo" animate={false} /><p className="invoice-type">{invoiceDraftType === 'change_order' ? 'Change order' : 'Invoice'}</p></div><span className="draft-pill"><span />Draft</span></div>
                <div className="preview-meta"><div><span>Client</span><strong>{email || 'Client'}</strong></div><div><span>Issued</span><strong>Today</strong></div></div>
                <div className="preview-lines">{items.map((item, index) => <div className="preview-line" key={index}><span>{item.description || 'Project work'}</span><strong>{formatCurrency(item.amount, currency)}</strong></div>)}</div>
                <div className="preview-total"><span>Total due</span><strong><AnimatedNumber value={total} currency={currency} /></strong></div>
                <div className="due-note"><Clock3 size={14} />Due in 14 days</div>
              </div>
              <label className="field-label email-label">Client email
                <span>We’ll send the payment link here.</span>
                <input className="email-input" type="email" autoComplete="email" placeholder="client@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              {error && <ErrorNotice message={error} onRetry={() => void sendInvoice()} />}
              {busy === 'send' && <p className="send-status" role="status"><i />Sending invoice…</p>}
              <div className="card-actions"><button className="back-button" disabled={!!busy} type="button" onClick={() => go(1)}><ArrowLeft size={16} />Back to line items</button><button className="primary-button" disabled={!!busy} type="button" onClick={sendInvoice}>{busy === 'send' ? 'Sending…' : <>Send invoice <Send size={15} /></>}</button></div>
            </>}
          </div>}

          {step === 3 && <InvoicesDashboard highlightInvoiceId={highlightInvoiceId} onNewRequest={startNewRequest} />}
        </motion.section>
      </AnimatePresence>
      <footer>Sift · Payments are simulated in the PayPal sandbox.</footer>
    </main>
  </div>
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-notice" role="alert"><span>{message}</span><button type="button" onClick={onRetry}>Retry</button></div>
}
