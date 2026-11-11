export type Verdict = 'in_scope' | 'out_of_scope' | 'unclear'
export type DraftType = 'invoice' | 'change_order'
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED'
export type LineItem = { description: string; amount: number }
export type AnalyzeInput = { quote: string; clientMessage: string }
export type AnalyzeResult = {
  verdict: Verdict
  reason: string
  draftType?: DraftType
  lineItems: LineItem[]
  total: number
  currency: string
  extraPhrases?: string[]
}
export type CreateInvoiceInput = { clientEmail: string; draftType: DraftType; lineItems: LineItem[]; total: number; currency: string; note: string }
export type InvoiceResult = { invoiceId: string; status: InvoiceStatus; payerViewUrl: string }
export type InvoiceSummary = {
  invoiceId: string
  clientName: string
  clientEmail?: string
  total: number
  amountPaid?: number
  currency: string
  status: InvoiceStatus
  dueDate: string
  overdue: boolean
  draftType?: DraftType
  payerViewUrl?: string
  lineItems?: LineItem[]
  note?: string
  paymentPlanOffered?: boolean
}
export type CreatePaymentPlanResult = { invoiceId: string; partialPaymentEnabled: boolean; minimumAmountDue: number }
