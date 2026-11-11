import { motion, useReducedMotion } from 'framer-motion'

const steps = ['Request', 'Scope check', 'Invoice', 'Invoices']

export default function Stepper({ current, onInvoices }: { current: number; onInvoices: () => void }) {
  const reduceMotion = useReducedMotion()
  return <div className="stepper" aria-label={`Step ${current + 1} of 4`}>
    <div className="step-track" aria-hidden="true"><motion.div className="step-fill" animate={{ width: `${(current / 3) * 100}%` }} transition={{ duration: reduceMotion ? 0 : .48, ease: 'easeInOut' }} /></div>
    {steps.map((step, index) => {
      const className = `step ${index === current ? 'active' : ''} ${index < current ? 'complete' : ''} ${index === 3 ? 'step-link' : ''}`
      const content = <><span className="step-number">{index < current ? '✓' : `0${index + 1}`}</span><span>{step}</span></>
      return index === 3
        ? <button className={className} type="button" key={step} aria-current={index === current ? 'step' : undefined} aria-label="Open invoices dashboard" onClick={onInvoices}>{content}</button>
        : <div className={className} key={step} aria-current={index === current ? 'step' : undefined}>{content}</div>
    })}
  </div>
}
