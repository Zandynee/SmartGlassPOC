// Tracks the pixel size of an element (used so the SVG chart is drawn at
// real size instead of being stretched, which would distort the text).

import { useEffect, useState } from 'react'

export function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return size
}
