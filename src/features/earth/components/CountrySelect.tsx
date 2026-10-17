import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { COUNTRIES, filterCountries, type Capital } from '../lib/locations';
import './CountrySelect.css';

interface CountrySelectProps {
  selected: Capital | null;
  onSelect: (capital: Capital) => void;
}

export default function CountrySelect({ selected, onSelect }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const matches = filterCountries(query);

  useEffect(() => {
    if (!open) return;
    filter.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children.item(active)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, query]);

  function showOptions() {
    setQuery('');
    setActive(Math.max(0, COUNTRIES.findIndex((capital) => capital.id === selected?.id)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery('');
    trigger.current?.focus();
  }

  function choose(capital: Capital) {
    onSelect(capital);
    close();
  }

  return (
    <div
      ref={container}
      className="country-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="capital-trigger"
        aria-label={selected ? `Country: ${selected.country}` : 'Choose a country'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => open ? close() : showOptions()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            showOptions();
          }
        }}
      >
        <span>{selected ? selected.country : 'Choose a country'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="capital-menu">
          <input
            ref={filter}
            className="capital-filter"
            role="combobox"
            aria-label="Search countries"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={matches[active] ? `${id}-${matches[active].id}` : undefined}
            aria-describedby={`${id}-status`}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search countries"
            maxLength={100}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              switch (event.key) {
                case 'ArrowDown':
                  if (matches.length) setActive((index) => (index + 1) % matches.length);
                  break;
                case 'ArrowUp':
                  if (matches.length) setActive((index) => (index + matches.length - 1) % matches.length);
                  break;
                case 'Enter':
                  if (matches[active]) choose(matches[active]);
                  break;
                case 'Escape':
                  close();
                  break;
                default:
                  return;
              }
              event.preventDefault();
            }}
          />
          <div ref={list} id={`${id}-list`} className="capital-options" role="listbox" aria-label="Countries">
            {matches.map((capital, index) => (
              <div
                id={`${id}-${capital.id}`}
                key={capital.id}
                className="capital-option"
                role="option"
                aria-selected={capital.id === selected?.id}
                data-active={index === active}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(capital)}
              >
                <span>{capital.country}</span>
                {capital.id === selected?.id && <Check size={15} aria-hidden="true" />}
              </div>
            ))}
          </div>
          <p id={`${id}-status`} className={matches.length ? 'visually-hidden' : 'capital-empty'} role="status">
            {matches.length ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'} available.` : 'No countries found. Try another country name.'}
          </p>
        </div>
      )}
    </div>
  );
}
