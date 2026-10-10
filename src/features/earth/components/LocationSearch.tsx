import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle, MapPin } from 'lucide-react';
import { searchLocations } from '../lib/locations';
import type { Location } from '../lib/locations';
import './LocationSearch.css';

interface LocationSearchProps {
  selectedName: string;
  onSelect: (location: Location) => void;
}

export default function LocationSearch({
  selectedName,
  onSelect,
}: LocationSearchProps) {
  const [query, setQuery] = useState(selectedName);
  const [results, setResults] = useState<Location[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const showClear = searchFocused && query.length > 0;

  function cancelSearch() {
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
    setResults([]);
    setStatus('');
  }

  useEffect(() => {
    cancelSearch();
    setQuery(selectedName);
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [selectedName]);

  async function search(event: FormEvent) {
    event.preventDefault();
    inputRef.current?.blur();
    if (loading || query.trim().length < 2) return;
    cancelSearch();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setStatus('Searching for locations…');
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const locations = await searchLocations(query, controller.signal);
      if (requestRef.current !== controller) return;
      setResults(locations);
      setStatus(
        locations.length
          ? `${locations.length} ${locations.length === 1 ? 'location' : 'locations'} found. Choose one below.`
          : 'No locations found. Try adding a city or country.',
      );
    } catch {
      if (requestRef.current === controller)
        setStatus(
          'Location search could not connect. Please try again, or drag the map to compare places.',
        );
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <form
      className="location-search"
      role="search"
      aria-label="Find a comparison location"
      onSubmit={search}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelSearch();
          setQuery(selectedName);
          inputRef.current?.focus();
        }
      }}
    >
      <div
        className="place-search"
        onFocus={() => setSearchFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setSearchFocused(false);
          }
        }}
      >
        <input
          ref={inputRef}
          id="place"
          type="search"
          enterKeyHint="search"
          value={query}
          placeholder="Search location"
          autoComplete="off"
          maxLength={200}
          aria-label="Search location"
          aria-describedby="place-status"
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          onChange={(event) => {
            cancelSearch();
            setQuery(event.target.value);
          }}
        />
        {showClear && (
          <button
            type="button"
            aria-label="Clear location search"
            title="Clear location search"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              cancelSearch();
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 3 21 21M21 3 3 21" />
            </svg>
          </button>
        )}
        <button
          type="submit"
          hidden={showClear}
          aria-label="Search locations"
          title="Search locations"
          disabled={loading || query.trim().length < 2}
        >
          {loading ? (
            <LoaderCircle
              className="search-spinner"
              size={22}
              aria-hidden="true"
            />
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="7" />
              <path d="M15 15 22 22" />
            </svg>
          )}
        </button>
      </div>
      <p
        id="place-status"
        className={results.length > 0 ? 'visually-hidden' : 'place-status'}
        role="status"
        aria-atomic="true"
      >
        {status}
      </p>
      {results.length > 0 && (
        <ul className="place-results" aria-label="Location search results">
          {results.map((location) => (
            <li key={`${location.name}:${location.center.join(',')}`}>
              <button
                type="button"
                onClick={() => {
                  cancelSearch();
                  setQuery(location.name);
                  onSelect(location);
                  inputRef.current?.blur();
                }}
              >
                <MapPin size={15} aria-hidden="true" />
                <span>{location.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
