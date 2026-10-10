import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './UnitSelect.css';

interface DropdownSelectProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  label: string;
  onChange: (value: T) => void;
}

export default function DropdownSelect<T extends string>({
  value,
  options,
  label,
  onChange,
}: DropdownSelectProps<T>) {
  const units = options.map((option) => option.value);
  const selectedLabel = options.find((option) => option.value === value)!.label;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function choose(unit: T) {
    onChange(unit);
    setOpen(false);
    trigger.current?.focus();
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = units.indexOf(active);
    switch (event.key) {
      case 'ArrowDown':
        setActive(units[(index + 1) % units.length]);
        break;
      case 'ArrowUp':
        setActive(units[(index + units.length - 1) % units.length]);
        break;
      case 'Home':
        setActive(units[0]);
        break;
      case 'End':
        setActive(units[units.length - 1]);
        break;
      case 'Enter':
      case ' ':
        choose(active);
        break;
      case 'Escape':
        setOpen(false);
        trigger.current?.focus();
        break;
      default: {
        const match = options.find((option) =>
          option.label.toLowerCase().startsWith(event.key.toLowerCase()),
        );
        if (!match) return;
        setActive(match.value);
      }
    }
    event.preventDefault();
  }

  return (
    <div
      ref={container}
      className="unit-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="input-unit"
        aria-label={`${label}: ${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setActive(value);
          setOpen((previous) => !previous);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(value);
            setOpen(true);
          }
        }}
      >
        {selectedLabel}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          className="unit-options"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          tabIndex={-1}
          onKeyDown={handleKey}
        >
          {options.map(({ value: unit, label: optionLabel }) => (
            <div
              key={unit}
              id={`${id}-${unit}`}
              className="unit-option"
              role="option"
              aria-selected={unit === value}
              data-active={unit === active}
              onClick={() => choose(unit)}
            >
              <span>{optionLabel}</span>
              {unit === value && <Check size={15} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
