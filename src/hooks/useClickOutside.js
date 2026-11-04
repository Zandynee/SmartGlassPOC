// Calls onOutside() when the user presses outside `ref` or hits Escape.
// Used by the dropdowns / popovers on the history page.

import { useEffect } from 'react'

export function useClickOutside(ref, onOutside, active = true) {
  useEffect(() => {
    if (!active) return undefined
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onOutside()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onOutside, active])
}
