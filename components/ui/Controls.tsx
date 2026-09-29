import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

type SwitchProps = { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string };

/** On/off control with its label; a button with role="switch" instead of a native checkbox. */
export function Switch({ checked, onChange, label, hint }: SwitchProps) {
  const id = useId();
  return (
    <div className="switch-row">
      <span className="switch-text" id={id}><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="switch" onClick={() => onChange(!checked)}><i /></button>
    </div>
  );
}

type SegmentOption<T extends string> = { value: T; label: ReactNode; ariaLabel?: string };
type SegmentedProps<T extends string> = { value: T; onChange: (value: T) => void; options: Array<SegmentOption<T>>; label: string };

/** Radio group drawn as a segmented control; the thumb slides between options. */
export function Segmented<T extends string>({ value, onChange, options, label }: SegmentedProps<T>) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const onKey = (event: KeyboardEvent) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="segmented-field">
      <span className="segmented-label" id={id}>{label}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={id} onKeyDown={onKey} style={{ "--count": options.length, "--index": index } as React.CSSProperties}>
        <span className="segmented-thumb" aria-hidden="true" />
        {options.map((option, i) => (
          <button key={option.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={i === index} aria-label={option.ariaLabel} tabIndex={i === index ? 0 : -1} onClick={() => onChange(option.value)}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}
