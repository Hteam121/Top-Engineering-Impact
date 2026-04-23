import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface Props {
  /** ARIA label for the trigger button. */
  label: string
  /** Tooltip body. */
  children: ReactNode
  /** Preferred side; auto-flipped if the viewport doesn't have room. */
  placement?: 'top' | 'bottom'
  /** Tooltip width in pixels. Default 300. */
  width?: number
  className?: string
}

const GAP = 8
const EDGE_PAD = 12

export default function InfoTooltip({
  label,
  children,
  placement = 'top',
  width = 300,
  className = '',
}: Props) {
  const [clicked, setClicked] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const id = useId()

  const btnRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)

  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const visible = clicked || hovered || focused

  // Position the tooltip after it renders, measuring actual size so we can
  // auto-flip when the preferred side would overflow the viewport.
  useLayoutEffect(() => {
    if (!visible) {
      setCoords(null)
      return
    }
    const btn = btnRef.current
    const tip = tipRef.current
    if (!btn || !tip) return

    const btnRect = btn.getBoundingClientRect()
    const tipH = tip.offsetHeight
    const topSpace = btnRect.top
    const bottomSpace = window.innerHeight - btnRect.bottom

    let useBottom = placement === 'bottom'
    if (placement === 'top' && topSpace < tipH + GAP + EDGE_PAD) {
      useBottom = true
    } else if (placement === 'bottom' && bottomSpace < tipH + GAP + EDGE_PAD) {
      useBottom = false
    }

    const top = useBottom
      ? btnRect.bottom + GAP
      : btnRect.top - tipH - GAP

    const rawLeft = btnRect.left + btnRect.width / 2 - width / 2
    const left = Math.max(
      EDGE_PAD,
      Math.min(window.innerWidth - width - EDGE_PAD, rawLeft),
    )

    setCoords({ top, left })
  }, [visible, placement, width, children])

  // Close the click-opened tooltip on outside click.
  useEffect(() => {
    if (!clicked) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (tipRef.current?.contains(t)) return
      setClicked(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [clicked])

  // Dismiss hover state on scroll (avoid a stale tooltip floating in place).
  useEffect(() => {
    if (!visible || clicked) return
    function onScroll() {
      setHovered(false)
      setFocused(false)
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [visible, clicked])

  return (
    <span
      className="relative inline-flex align-baseline"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-describedby={visible ? id : undefined}
        onClick={(e) => {
          e.stopPropagation()
          setClicked((c) => !c)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setClicked(false)
            ;(e.currentTarget as HTMLButtonElement).blur()
          }
        }}
        className={[
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          'border border-slate-400/60 bg-white/[0.06] font-sans text-[11px] font-semibold italic leading-none text-slate-200',
          'transition-colors hover:border-accent hover:bg-accent/15 hover:text-accent',
          'focus:outline-none focus-visible:border-accent focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-accent/30',
          className,
        ].join(' ')}
      >
        i
      </button>

      {visible && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            width,
            visibility: coords ? 'visible' : 'hidden',
            pointerEvents: 'none',
          }}
          className={[
            'z-50 rounded-lg border border-slate-600 bg-slate-800 p-4 text-left shadow-xl',
            'font-sans text-sm font-normal leading-relaxed text-slate-100',
          ].join(' ')}
        >
          {children}
        </span>
      )}
    </span>
  )
}
