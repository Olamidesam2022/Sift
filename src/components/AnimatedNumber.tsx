import { useEffect, useState } from 'react'
import { animate, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'

type Props = { value: number; currency?: string; format?: 'currency' | 'number' }
export const formatCurrency = (value: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)

export default function AnimatedNumber({ value, currency = 'USD', format = 'currency' }: Props) {
  const reduceMotion = useReducedMotion()
  const motionValue = useMotionValue(reduceMotion ? value : 0)
  const rounded = useTransform(motionValue, (current) => Number(current.toFixed(2)))
  const [display, setDisplay] = useState(reduceMotion ? value : 0)
  useEffect(() => {
    if (reduceMotion) { motionValue.set(value); setDisplay(value); return }
    const controls = animate(motionValue, value, { duration: .42, ease: 'easeOut' })
    return controls.stop
  }, [motionValue, reduceMotion, value])
  useEffect(() => rounded.on('change', setDisplay), [rounded])
  const output = format === 'number'
    ? new Intl.NumberFormat('en-US').format(display)
    : formatCurrency(display, currency)
  return <span>{output}</span>
}
