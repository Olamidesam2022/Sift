import type { AnalyzeInput, AnalyzeResult, CreateInvoiceInput, CreatePaymentPlanResult, InvoiceResult, InvoiceStatus, InvoiceSummary } from './types'

const STORE_KEY = 'sift.mock.invoices.v1'
let inMemoryInvoices: InvoiceSummary[] | null = null
const wait = (min = 1200, max = 1800) => new Promise((resolve) => window.setTimeout(resolve, min + Math.random() * (max - min)))
const dateOffset = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function seedInvoices(): InvoiceSummary[] {
  return [
    { invoiceId: 'SFT-24001', clientName: 'Northstar Studio', clientEmail: 'billing@northstar.studio', total: 2400, amountPaid: 2400, currency: 'USD', status: 'PAID', dueDate: dateOffset(-2), overdue: false, draftType: 'invoice', payerViewUrl: 'https://sift.demo/pay/sft-24001', lineItems: [{ description: 'Brand identity', amount: 1600 }, { description: 'Landing page', amount: 800 }] },
    { invoiceId: 'SFT-24002', clientName: 'Fieldwork Co.', clientEmail: 'finance@fieldwork.co', total: 1200, amountPaid: 0, currency: 'USD', status: 'SENT', dueDate: dateOffset(9), overdue: false, draftType: 'invoice', payerViewUrl: 'https://sift.demo/pay/sft-24002', lineItems: [{ description: 'Landing page design', amount: 1200 }] },
    { invoiceId: 'SFT-24003', clientName: 'Morrow Goods', clientEmail: 'accounts@morrowgoods.com', total: 800, amountPaid: 250, currency: 'USD', status: 'PARTIALLY_PAID', dueDate: dateOffset(12), overdue: false, draftType: 'invoice', payerViewUrl: 'https://sift.demo/pay/sft-24003', lineItems: [{ description: 'Packaging design', amount: 800 }] },
    { invoiceId: 'SFT-24004', clientName: 'Goodland Market', clientEmail: 'ap@goodland.market', total: 450, amountPaid: 0, currency: 'USD', status: 'SENT', dueDate: dateOffset(-6), overdue: true, draftType: 'change_order', payerViewUrl: 'https://sift.demo/pay/sft-24004', lineItems: [{ description: 'Additional campaign graphics', amount: 450 }] },
  ]
}

function saveInvoices(invoices: InvoiceSummary[]) {
  inMemoryInvoices = invoices
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(invoices)) } catch { /* Storage can be unavailable in private browsing. */ }
}

function readInvoices(): InvoiceSummary[] {
  try {
    const saved = window.localStorage.getItem(STORE_KEY)
    if (saved !== null) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) { inMemoryInvoices = parsed as InvoiceSummary[]; return inMemoryInvoices }
    }
  } catch { /* Fall back to the in-memory copy when storage is unavailable or malformed. */ }
  if (inMemoryInvoices) return inMemoryInvoices
  const seeded = seedInvoices()
  saveInvoices(seeded)
  return seeded
}

export async function mockAnalyze({ quote, clientMessage }: AnalyzeInput): Promise<AnalyzeResult> {
  await wait()
  const extra = /extra|additional|new page|another|also|while you're|could you add|one more/i.test(clientMessage)
    || /landing page|brand identity/i.test(quote) && /social|email campaign|new page/i.test(clientMessage)
  const lineItems = extra
    ? [{ description: 'Additional social media assets', amount: 350 }, { description: 'Expanded creative revisions', amount: 150 }]
    : [{ description: 'Work included in agreed project quote', amount: 850 }]
  return {
    verdict: extra ? 'out_of_scope' : 'in_scope',
    reason: extra ? 'The quote covers the landing page and logo. The social graphics and extra revision round are additional work.' : 'This request fits the work described in the quote.',
    draftType: extra ? 'change_order' : 'invoice',
    lineItems,
    total: lineItems.reduce((sum, item) => sum + item.amount, 0),
    currency: 'USD',
    extraPhrases: extra ? ['three social media graphics', 'one more round of revisions'] : [],
  }
}

export async function mockCreateInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
  await wait()
  const invoiceId = `SFT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const localName = input.clientEmail.split('@')[0].replace(/[._-]+/g, ' ')
  const clientName = localName.replace(/\b\w/g, (letter) => letter.toUpperCase())
  const invoice: InvoiceSummary = {
    invoiceId,
    clientName: clientName || input.clientEmail,
    clientEmail: input.clientEmail,
    total: input.total,
    amountPaid: 0,
    currency: input.currency,
    status: 'SENT',
    dueDate: dateOffset(14),
    overdue: false,
    draftType: input.draftType,
    payerViewUrl: `https://sift.demo/pay/${invoiceId.toLowerCase()}`,
    lineItems: input.lineItems,
    note: input.note,
  }
  saveInvoices([invoice, ...readInvoices()])
  return { invoiceId, status: 'SENT', payerViewUrl: invoice.payerViewUrl! }
}

export async function mockListInvoices(): Promise<InvoiceSummary[]> {
  await wait()
  return readInvoices().map((invoice) => ({ ...invoice, lineItems: invoice.lineItems?.map((item) => ({ ...item })) }))
}

export async function mockGetInvoice(id: string): Promise<InvoiceSummary> {
  await wait()
  const invoice = readInvoices().find((item) => item.invoiceId === id)
  if (!invoice) throw new Error('Invoice not found.')
  return { ...invoice, lineItems: invoice.lineItems?.map((item) => ({ ...item })) }
}

export async function mockCreatePaymentPlan(id: string, input: { installments: number }): Promise<CreatePaymentPlanResult> {
  await wait(1200, 1200)
  if (input.installments !== 2 && input.installments !== 3) throw new Error('Choose two or three instalments.')
  const invoices = readInvoices()
  const invoice = invoices.find((item) => item.invoiceId === id)
  if (!invoice || invoice.status === 'PAID' || invoice.status === 'CANCELLED') throw new Error('Pay in parts isn’t available right now')
  const balanceCents = Math.round(Math.max(0, invoice.total - (invoice.amountPaid ?? 0)) * 100)
  const minimumAmountDue = Math.floor(balanceCents / input.installments) / 100
  saveInvoices(invoices.map((item) => item.invoiceId === id ? { ...item, paymentPlanOffered: true } : item))
  return { invoiceId: id, partialPaymentEnabled: true, minimumAmountDue }
}

export function resetMockInvoices(): InvoiceSummary[] {
  try { window.localStorage.removeItem(STORE_KEY) } catch { /* Storage can be unavailable in private browsing. */ }
  const seeded = seedInvoices()
  inMemoryInvoices = seeded
  return seeded.map((invoice) => ({ ...invoice, lineItems: invoice.lineItems?.map((item) => ({ ...item })) }))
}

export function markMockInvoicePaid(id: string): boolean {
  let found = false
  const invoices = readInvoices().map((invoice) => {
    if (invoice.invoiceId !== id) return invoice
    found = true
    return { ...invoice, status: 'PAID' as InvoiceStatus, amountPaid: invoice.total, overdue: false }
  })
  if (found) saveInvoices(invoices)
  return found
}
