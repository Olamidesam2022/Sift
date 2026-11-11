import type { AnalyzeInput, AnalyzeResult, CreateInvoiceInput, CreatePaymentPlanResult, DraftType, InvoiceResult, InvoiceStatus, InvoiceSummary, LineItem } from './types'

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid_response'
export class ApiError extends Error {
  constructor(message: string, readonly kind: ApiErrorKind, readonly status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(`The server response is missing ${field}.`, 'invalid_response')
  return value.trim()
}
function requiredNumber(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') throw new ApiError(`The server response is missing ${field}.`, 'invalid_response')
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new ApiError(`The server response has an invalid ${field}.`, 'invalid_response')
  return parsed
}
function optionalDraftType(value: unknown): DraftType | undefined {
  return value === 'invoice' || value === 'change_order' ? value : undefined
}
function requiredCurrency(value: unknown): string {
  const currency = requiredString(value, 'currency').toUpperCase()
  try { new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(0) }
  catch { throw new ApiError('The server response has an invalid currency.', 'invalid_response') }
  return currency
}
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
  } catch { /* Drop malformed links from untrusted responses. */ }
  return undefined
}
function requiredUrl(value: unknown): string {
  const url = safeUrl(value)
  if (!url) throw new ApiError('The server response is missing a valid payer link.', 'invalid_response')
  return url
}
function normalizeStatus(value: unknown): InvoiceStatus {
  const status = typeof value === 'string' ? value.toUpperCase().replace(/[ -]/g, '_') : ''
  if (status === 'DRAFT' || status === 'SENT' || status === 'PAID' || status === 'PARTIALLY_PAID' || status === 'CANCELLED') return status
  throw new ApiError('The server response has an unknown invoice status.', 'invalid_response')
}
function normalizeLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) throw new ApiError('The server response is missing invoice line items.', 'invalid_response')
  return value.map((raw, index) => {
    const item = record(raw)
    if (!item) throw new ApiError(`The server returned an invalid line item (${index + 1}).`, 'invalid_response')
    return {
      description: requiredString(item.description, `line item ${index + 1} description`),
      amount: requiredNumber(item.amount, `line item ${index + 1} amount`),
    }
  })
}
function unwrap(value: unknown, key: string): unknown {
  const obj = record(value)
  return obj && key in obj ? obj[key] : value
}

function normalizeAnalyze(value: unknown): AnalyzeResult {
  const raw = record(unwrap(value, 'analysis'))
  if (!raw) throw new ApiError('The server returned an invalid analysis.', 'invalid_response')
  const verdict = raw.verdict
  if (verdict !== 'in_scope' && verdict !== 'out_of_scope' && verdict !== 'unclear') throw new ApiError('The server response is missing a valid scope verdict.', 'invalid_response')
  const lineItems = normalizeLineItems(raw.lineItems ?? raw.line_items)
  const total = requiredNumber(raw.total, 'total')
  const currency = requiredCurrency(raw.currency)
  const phrasesValue = raw.extraPhrases ?? raw.extra_phrases
  const extraPhrases = Array.isArray(phrasesValue)
    ? phrasesValue.filter((phrase): phrase is string => typeof phrase === 'string' && !!phrase.trim())
    : undefined
  return {
    verdict,
    reason: requiredString(raw.reason, 'analysis reason'),
    draftType: optionalDraftType(raw.draftType ?? raw.draft_type) ?? (verdict === 'out_of_scope' ? 'change_order' : 'invoice'),
    lineItems,
    total,
    currency,
    extraPhrases,
  }
}

function normalizeInvoice(value: unknown): InvoiceSummary {
  const raw = record(unwrap(value, 'invoice'))
  if (!raw) throw new ApiError('The server returned invalid invoice data.', 'invalid_response')
  const status = normalizeStatus(raw.status)
  const dueDate = requiredString(raw.dueDate ?? raw.due_date, 'due date')
  if (Number.isNaN(new Date(dueDate).getTime())) throw new ApiError('The server response has an invalid due date.', 'invalid_response')
  const clientEmail = typeof (raw.clientEmail ?? raw.client_email) === 'string' ? String(raw.clientEmail ?? raw.client_email) : undefined
  const clientNameValue = raw.clientName ?? raw.client_name ?? raw.payerName ?? raw.payer_name ?? (clientEmail ? clientEmail.split('@')[0] : undefined)
  const overdueValue = raw.overdue
  const overdue = typeof overdueValue === 'boolean' ? overdueValue : status !== 'PAID' && new Date(dueDate).getTime() < Date.now()
  const draftType = optionalDraftType(raw.draftType ?? raw.draft_type)
  const lineItemsValue = raw.lineItems ?? raw.line_items
  const lineItems = Array.isArray(lineItemsValue) ? normalizeLineItems(lineItemsValue) : undefined
  const amountPaidValue = raw.amountPaid ?? raw.amount_paid
  const amountPaid = amountPaidValue === undefined ? undefined : requiredNumber(amountPaidValue, 'amount paid')
  const currency = requiredCurrency(raw.currency)
  return {
    invoiceId: requiredString(raw.invoiceId ?? raw.invoice_id, 'invoice ID'),
    clientName: requiredString(clientNameValue, 'client name'),
    clientEmail,
    total: requiredNumber(raw.total ?? raw.amount, 'invoice total'),
    amountPaid,
    currency,
    status,
    dueDate,
    overdue,
    draftType,
    payerViewUrl: safeUrl(raw.payerViewUrl ?? raw.payer_view_url),
    lineItems,
    note: typeof raw.note === 'string' ? raw.note : undefined,
  }
}
function normalizeInvoiceList(value: unknown): InvoiceSummary[] {
  const envelope = record(value)
  const list = Array.isArray(value) ? value : envelope?.invoices ?? envelope?.items
  if (!Array.isArray(list)) throw new ApiError('The server returned an invalid invoice list.', 'invalid_response')
  return list.map(normalizeInvoice)
}
function normalizeCreatedInvoice(value: unknown): InvoiceResult {
  const raw = record(unwrap(value, 'invoice'))
  if (!raw) throw new ApiError('The server returned invalid invoice data.', 'invalid_response')
  return {
    invoiceId: requiredString(raw.invoiceId ?? raw.invoice_id, 'invoice ID'),
    status: normalizeStatus(raw.status),
    payerViewUrl: requiredUrl(raw.payerViewUrl ?? raw.payer_view_url),
  }
}
function normalizePaymentPlan(value: unknown): CreatePaymentPlanResult {
  const raw = record(unwrap(value, 'paymentPlan')) ?? record(value)
  if (!raw) throw new ApiError('The server returned invalid payment plan data.', 'invalid_response')
  const enabled = raw.partialPaymentEnabled ?? raw.partial_payment_enabled
  if (typeof enabled !== 'boolean') throw new ApiError('The server response is missing partial payment status.', 'invalid_response')
  return {
    invoiceId: requiredString(raw.invoiceId ?? raw.invoice_id, 'invoice ID'),
    partialPaymentEnabled: enabled,
    minimumAmountDue: requiredNumber(raw.minimumAmountDue ?? raw.minimum_amount_due, 'minimum amount due'),
  }
}

async function requestJSON(path: string, method: 'GET' | 'POST', body?: unknown, timeoutMs = 10_000): Promise<unknown> {
  const url = `${API_BASE_URL}/api${path}` || `/api${path}`
  const attempts = method === 'GET' ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController()
    let timedOut = false
    const timer = window.setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) {
        const message = response.status >= 500 ? 'The server is having trouble. Try again.' : 'The request could not be completed.'
        throw new ApiError(message, 'http', response.status)
      }
      try { return await response.json() }
      catch { throw new ApiError('The server response could not be read. Try again.', 'invalid_response') }
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (timedOut) throw new ApiError('The request took too long. Try again.', 'timeout')
      if (error instanceof TypeError && attempt + 1 < attempts) continue
      if (error instanceof TypeError) throw new ApiError('Could not reach the server. Check your connection.', 'network')
      throw new ApiError('The request could not be completed. Try again.', 'network')
    } finally {
      window.clearTimeout(timer)
    }
  }
  throw new ApiError('Could not reach the server. Check your connection.', 'network')
}

const real = {
  async analyze(input: AnalyzeInput) { return normalizeAnalyze(await requestJSON('/analyze', 'POST', input, 20_000)) },
  async createInvoice(input: CreateInvoiceInput) { return normalizeCreatedInvoice(await requestJSON('/invoices', 'POST', input)) },
  async listInvoices() { return normalizeInvoiceList(await requestJSON('/invoices', 'GET')) },
  async getInvoice(id: string) { return normalizeInvoice(await requestJSON(`/invoices/${encodeURIComponent(id)}`, 'GET')) },
  async createPaymentPlan(id: string, input: { installments: number }) { return normalizePaymentPlan(await requestJSON(`/invoices/${encodeURIComponent(id)}/payment-plan`, 'POST', input)) },
}

export const analyze = (input: AnalyzeInput): Promise<AnalyzeResult> => real.analyze(input)
export const createInvoice = (input: CreateInvoiceInput): Promise<InvoiceResult> => real.createInvoice(input)
export const listInvoices = (): Promise<InvoiceSummary[]> => real.listInvoices()
export const getInvoice = (id: string): Promise<InvoiceSummary> => real.getInvoice(id)
export const createPaymentPlan = (id: string, input: { installments: number }): Promise<CreatePaymentPlanResult> => real.createPaymentPlan(id, input)
