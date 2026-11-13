// One dot per 60 s window: done+valid (green), done+invalid (amber), running (blue ring), waiting (grey).
export function WindowDots({ total, windows = [], progress = 0 }) {
  const running = Math.min(total - 1, windows.length)
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${windows.filter((w) => w.ok).length} dari ${total} window valid`}>
      {Array.from({ length: total }, (_, i) => {
        const w = windows[i]
        let cls = 'bg-ink-ghost'
        if (w) cls = w.ok ? 'bg-ok-solid' : 'bg-warning-solid'
        else if (i === running && progress < 1) cls = 'bg-brand animate-pulse'
        return <span key={i} className={`size-dot rounded-full ${cls}`} />
      })}
    </div>
  )
}
