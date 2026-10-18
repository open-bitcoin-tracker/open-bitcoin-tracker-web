import type { EarthCopy } from '../../../i18n/earth';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { createPlaceIndex, loadCities, placeLabel, searchPlaces, type CityRecord, type Place } from '../lib/places';
import './PlaceSelect.css';

interface PlaceSelectProps {
  lang: string;
  copy: EarthCopy;
  selected: Place | null;
  onSelect: (place: Place) => void;
}

export default function PlaceSelect({ lang, copy, selected, onSelect }: PlaceSelectProps) {
  const [open, setOpen] = useState(false);
  const [selectionFocus, setSelectionFocus] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [cities, setCities] = useState<CityRecord[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const index = useMemo(() => createPlaceIndex(lang, cities ?? []), [lang, cities]);
  const matches = useMemo(() => searchPlaces(query, index), [query, index]);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const loading = open && cities === null && !loadFailed;

  useEffect(() => {
    if (!open || cities !== null) return;
    let current = true;
    loadCities().then((rows) => { if (current) setCities(rows); })
      .catch(() => { if (current) setLoadFailed(true); });
    return () => { current = false; };
  }, [open, cities, attempt]);

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
    if (open) list.current?.children.item(activeIndex)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, query, matches]);

  function showOptions() {
    setQuery('');
    setActive(0);
    if (loadFailed) { setLoadFailed(false); setAttempt((value) => value + 1); }
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery('');
    trigger.current?.focus();
  }

  function choose(place: Place) {
    setSelectionFocus(true);
    onSelect(place);
    close();
  }

  return (
    <div
      ref={container}
      className="place-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="place-trigger"
        data-selection-focus={selectionFocus || undefined}
        onBlur={() => setSelectionFocus(false)}
        aria-label={selected ? copy.placeSelection.replace('{name}', placeLabel(selected)) : copy.choosePlace}
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
        <span>{selected ? placeLabel(selected) : copy.choosePlace}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="place-menu">
          <input
            ref={filter}
            className="place-filter"
            role="combobox"
            aria-label={copy.searchPlaces}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={matches[activeIndex] ? `${id}-${matches[activeIndex].id}` : undefined}
            aria-describedby={`${id}-status`}
            autoComplete="off"
            spellCheck={false}
            placeholder={copy.searchPlaces}
            maxLength={100}
            autoCorrect="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              switch (event.key) {
                case 'ArrowDown':
                  if (matches.length) setActive((activeIndex + 1) % matches.length);
                  break;
                case 'ArrowUp':
                  if (matches.length) setActive((activeIndex + matches.length - 1) % matches.length);
                  break;
                case 'Enter':
                  if (matches[activeIndex]) choose(matches[activeIndex]);
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
          <div ref={list} id={`${id}-list`} className="place-options" role="listbox" aria-label={copy.places} aria-busy={loading || undefined}>
            {matches.map((place, index) => (
              <div
                id={`${id}-${place.id}`}
                key={place.id}
                className="place-option"
                role="option"
                aria-selected={place.id === selected?.id}
                data-active={index === activeIndex}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
              >
                <span className="place-option-copy">
                  <span>{place.kind === 'country' ? place.country : place.name}</span>
                  <small>{place.kind === 'country' ? copy.countryResult
                    : [place.admin !== place.name ? place.admin : '', place.country].filter(Boolean).join(' · ')}</small>
                </span>
                {place.id === selected?.id && <Check size={15} aria-hidden="true" />}
              </div>
            ))}
          </div>
          <p id={`${id}-status`} className={matches.length || loading ? 'sr-only' : 'place-empty'} role="status">
            {loading ? copy.loadingPlaces : matches.length ? copy.results.replace('{count}', new Intl.NumberFormat(lang).format(matches.length)) : copy.noPlaces}
          </p>
          {loadFailed && <div className="place-load-error" role="status">
            <p>{copy.placesUnavailable}</p>
            <button type="button" onClick={() => { setLoadFailed(false); setAttempt((value) => value + 1); }}>{copy.retryPlaces}</button>
          </div>}
        </div>
      )}
    </div>
  );
}
