// Shared button used by the measurement screens.
export function Btn({ onClick, children, kind = 'primary', disabled, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${
        kind === 'primary'
          ? 'bg-primary text-white hover:bg-primary-hover'
          : 'bg-white border border-line text-ink-medium hover:bg-mist'
      } ${className}`}
    >
      {children}
    </button>
  )
}
