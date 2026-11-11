import { useEffect, useMemo, useState } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import type { AnalyzeResult } from '../api/types'

export type PhraseMatch = { start: number; end: number; phraseIndex: number }

export function findPhraseMatches(message: string, phrases: string[]): PhraseMatch[] {
  const lower = message.toLowerCase()
  const candidates: PhraseMatch[] = []
  phrases.forEach((phrase, phraseIndex) => {
    const needle = phrase.trim().toLowerCase()
    if (!needle) return
    let from = 0
    while (from < lower.length) {
      const start = lower.indexOf(needle, from)
      if (start === -1) break
      candidates.push({ start, end: start + needle.length, phraseIndex })
      from = start + Math.max(needle.length, 1)
    }
  })
  candidates.sort((a, b) => a.start - b.start || b.end - a.end || a.phraseIndex - b.phraseIndex)
  const matches: PhraseMatch[] = []
  let lastEnd = -1
  for (const candidate of candidates) {
    if (candidate.start < lastEnd) continue
    matches.push(candidate)
    lastEnd = candidate.end
  }
  return matches
}

function AskCount({ value }: { value: number }) {
  const reducedMotion = useReducedMotion()
  const motionValue = useMotionValue(reducedMotion ? value : 0)
  const rounded = useTransform(motionValue, Math.round)
  const [shown, setShown] = useState(reducedMotion ? value : 0)
  useEffect(() => {
    if (reducedMotion) { setShown(value); return }
    const controls = animate(motionValue, value, { duration: .48, ease: 'easeOut' })
    return controls.stop
  }, [motionValue, reducedMotion, value])
  useEffect(() => rounded.on('change', setShown), [rounded])
  return <span>{shown === 0 ? 'No extra asks found' : `${shown} extra ${shown === 1 ? 'ask' : 'asks'} found`}</span>
}

type Props = {
  message: string
  quote: string
  result: AnalyzeResult
  activeLink: number | null
  onActiveLink: (index: number | null) => void
  lineItemCount: number
}

export default function ScopeCheck({ message, quote, result, activeLink, onActiveLink, lineItemCount }: Props) {
  const reducedMotion = useReducedMotion()
  const [scanned, setScanned] = useState(Boolean(reducedMotion))
  const phrases = result.extraPhrases ?? []
  const matches = useMemo(() => findPhraseMatches(message, phrases), [message, phrases])
  const foundCount = new Set(matches.map((match) => match.phraseIndex)).size
  const canLink = phrases.length === lineItemCount

  useEffect(() => {
    if (reducedMotion) { setScanned(true); return }
    setScanned(false)
    const timer = window.setTimeout(() => setScanned(true), 900)
    return () => window.clearTimeout(timer)
  }, [message, reducedMotion])

  const renderMessage = () => {
    const parts = []
    let cursor = 0
    for (const [matchIndex, match] of matches.entries()) {
      if (match.start > cursor) parts.push(<span key={`text-${cursor}`}>{message.slice(cursor, match.start)}</span>)
      const phrase = message.slice(match.start, match.end)
      const linkIndex = canLink ? match.phraseIndex : null
      const delay = reducedMotion ? 0 : match.phraseIndex * .1
      parts.push(
        <motion.button
          key={`phrase-${match.phraseIndex}-${matchIndex}`}
          type="button"
          className={`extra-phrase ${activeLink === linkIndex && linkIndex !== null ? 'is-linked' : ''}`}
          aria-label={`Extra work: ${phrase}`}
          onMouseEnter={() => linkIndex !== null && onActiveLink(linkIndex)}
          onMouseLeave={() => linkIndex !== null && onActiveLink(null)}
          onFocus={() => linkIndex !== null && onActiveLink(linkIndex)}
          onBlur={() => linkIndex !== null && onActiveLink(null)}
          style={{ backgroundSize: scanned ? '100% 100%' : '0% 100%' }}
          initial={false}
          animate={{ backgroundSize: scanned ? '100% 100%' : '0% 100%' }}
          transition={{ duration: reducedMotion ? 0 : .34, delay }}
        >{phrase}</motion.button>,
      )
      cursor = match.end
    }
    if (cursor < message.length) parts.push(<span key={`text-${cursor}`}>{message.slice(cursor)}</span>)
    return parts
  }

  return <div className="scope-check-grid">
    <div className="scope-copy-column">
      <section className="quote-context" aria-label="Agreed quote">
        <span className="panel-caption">In the agreed quote</span>
        <p>{quote}</p>
      </section>
      <section className="client-message-card" aria-label="Client message and extra asks">
        <div className="message-card-head"><span>Client message</span><span className="ask-count"><AskCount value={foundCount} /></span></div>
        <motion.div className="client-message" initial={reducedMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .32 }}>
          {!reducedMotion && !scanned && <motion.span className="scan-line" aria-hidden="true" initial={{ top: '0%' }} animate={{ top: '100%' }} transition={{ duration: .9, ease: 'linear' }} />}
          <p>{renderMessage()}</p>
        </motion.div>
        {foundCount > 0 && canLink && <p className="link-hint">Focus a highlighted phrase or line item to trace the match.</p>}
      </section>
    </div>
    <aside className={`scope-verdict ${result.verdict}`} aria-label="Scope verdict">
      <span className="verdict-status"><i />{result.verdict === 'out_of_scope' ? 'Extra work' : result.verdict === 'in_scope' ? 'In scope' : 'Needs review'}</span>
      <p>{result.reason}</p>
    </aside>
  </div>
}
