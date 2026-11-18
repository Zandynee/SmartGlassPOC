// ─────────────────────────────────────────────
//  icons.jsx  –  tiny inline SVG icon set (stroke icons, 24×24 grid, 1.5 stroke)
//  No icon library needed; every icon inherits `currentColor`.
// ─────────────────────────────────────────────

function Icon({ size = 18, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p) => (
  <Icon {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></Icon>
)
export const HistoryIcon = (p) => (
  <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></Icon>
)
export const BellIcon = (p) => (
  <Icon {...p}><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></Icon>
)
export const UserIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></Icon>
)
export const ChevronDown = (p) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>
export const ChevronRight = (p) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>
export const ChevronLeft = (p) => <Icon {...p}><path d="m15 6-6 6 6 6" /></Icon>
export const LogoutIcon = (p) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
)
export const BluetoothIcon = (p) => <Icon {...p}><path d="m7 7 10 10-5 5V2l5 5L7 17" /></Icon>
export const PlayIcon = (p) => <Icon {...p}><path d="M7 4v16l13-8z" /></Icon>
export const FilterIcon = (p) => <Icon {...p}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></Icon>
export const RefreshIcon = (p) => (
  <Icon {...p}><path d="M20 11a8 8 0 0 0-14.5-4" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4" /><path d="M20 20v-4h-4" /></Icon>
)
export const CloseIcon = (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>
export const TrashIcon = (p) => (
  <Icon {...p}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></Icon>
)
export const CalendarIcon = (p) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
)
export const GlassesIcon = (p) => (
  <Icon {...p}><circle cx="6.5" cy="14" r="3.5" /><circle cx="17.5" cy="14" r="3.5" /><path d="M10 14h4M3 14l2-7M21 14l-2-7" /></Icon>
)
export const CheckIcon = (p) => <Icon {...p}><path d="m5 12 5 5L20 7" /></Icon>
export const DownloadIcon = (p) => (
  <Icon {...p}><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></Icon>
)