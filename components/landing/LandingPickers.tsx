'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * The selectable lists of the landing mockup — the A–D ladder, the evidence
 * stations and the example picker. Each is a roving-focus group (arrow keys,
 * Home, End) with its detail rendered by the server and only switched here.
 * Without JavaScript the first item's detail is what the page shows.
 */

function roving(count: number, k: number, e: KeyboardEvent, go: (n: number) => void) {
  let n: number | null = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (k + 1) % count;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (k + count - 1) % count;
  if (e.key === 'Home') n = 0;
  if (e.key === 'End') n = count - 1;
  if (n !== null) {
    e.preventDefault();
    go(n);
  }
}

export interface LadderItem {
  level: string;
  levelChip: ReactNode;
  label: string;
  detail: ReactNode;
}

export function LevelLadder({ items }: { items: LadderItem[] }) {
  const [cur, setCur] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const go = (n: number) => {
    setCur(n);
    refs.current[n]?.focus();
  };
  return (
    <>
      <div className="ladder2" role="radiogroup" aria-label="Clean core levels A to D">
        {items.map((it, k) => (
          <button
            key={it.level}
            ref={(el) => {
              refs.current[k] = el;
            }}
            type="button"
            className="lad"
            role="radio"
            aria-checked={cur === k}
            tabIndex={cur === k ? 0 : -1}
            onClick={() => setCur(k)}
            onKeyDown={(e) => roving(items.length, k, e, go)}
          >
            {it.levelChip}
            <span>{it.label}</span>
            <ChevronRight className="i" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="lad-detail" aria-live="polite">
        {items[cur]?.detail}
      </div>
    </>
  );
}

export interface StationItem {
  key: string;
  title: string;
  detail: ReactNode;
}

export function EvidenceStepper({ items }: { items: StationItem[] }) {
  const [cur, setCur] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const go = (n: number) => {
    setCur(n);
    refs.current[n]?.focus();
  };
  return (
    <>
      <div className="steps5" role="tablist" aria-label="Where the evidence comes from">
        {items.map((it, k) => (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[k] = el;
            }}
            type="button"
            className="st5"
            role="tab"
            id={`ev-t-${it.key}`}
            aria-selected={cur === k}
            aria-controls="ev-p"
            tabIndex={cur === k ? 0 : -1}
            onClick={() => setCur(k)}
            onKeyDown={(e) => roving(items.length, k, e, go)}
          >
            <span className="n">{k + 1}</span>
            {it.title}
          </button>
        ))}
      </div>
      <div className="st5-panel" id="ev-p" role="tabpanel" aria-labelledby={`ev-t-${items[cur]?.key}`}>
        {items[cur]?.detail}
      </div>
    </>
  );
}

export interface PickerItem {
  key: string;
  name: string;
  meta: string;
  detail: ReactNode;
}

export function ExamplePicker({ items }: { items: PickerItem[] }) {
  const [cur, setCur] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const go = (n: number) => {
    setCur(n);
    refs.current[n]?.focus();
  };
  return (
    <div className="picker">
      <div className="pk-list" role="radiogroup" aria-label="Examples" data-landing-examples="">
        {items.map((it, k) => (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[k] = el;
            }}
            type="button"
            className="pk"
            role="radio"
            aria-checked={cur === k}
            tabIndex={cur === k ? 0 : -1}
            onClick={() => setCur(k)}
            onKeyDown={(e) => roving(items.length, k, e, go)}
          >
            {it.name}
            <span className="z">{it.meta}</span>
          </button>
        ))}
      </div>
      <div className="pk-detail" aria-live="polite">
        {items[cur]?.detail}
      </div>
    </div>
  );
}
