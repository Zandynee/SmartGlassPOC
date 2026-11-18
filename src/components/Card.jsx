// ─────────────────────────────────────────────
//  Card.jsx  –  shared card shell for the Beranda page
//  Same look as the Data Riwayat cards: white, 1px blue-grey border,
//  rounded-2xl, soft shadow, small grey title with an optional status dot.
//
//  Props:
//    title     – card heading
//    dot       – colour of the small status dot next to the title
//    right     – optional node on the right side of the heading row
//    className – extra classes
// ─────────────────────────────────────────────

export function Card({ title, dot, right, className = '', children }) {
  return (
    <section
      className={`rounded-2xl bg-white border border-line shadow-sm p-4 md:p-5 ${className}`}
    >
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="m-0 flex items-center gap-2 text-sm font-medium text-ink-soft">
            {dot && (
              <span className="inline-block size-dot rounded-full" style={{ background: dot }} />
            )}
            {title}
          </h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}
