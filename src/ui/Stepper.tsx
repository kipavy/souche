interface Props {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}

export function Stepper({ label, value, min, max, onChange }: Props) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <span className="stepper__label">{label}</span>
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Moins de ${label.toLowerCase()}`}>−</button>
      <span className="stepper__value" aria-live="polite">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Plus de ${label.toLowerCase()}`}>+</button>
    </span>
  )
}
