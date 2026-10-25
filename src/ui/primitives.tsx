// Small building blocks shared by every view. Class names match components.css
// and the component cards of the design system.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { iconFile } from '../core/gameData';
import type { PlanLine } from '../core/plan';
import { gameData } from '../data';
import { changeOwned, setOwned } from '../state/store';
import { useI18n } from './i18n';

export function Panel({ title, count, actions, children }: { title: string; count?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="panel" aria-labelledby={id}>
      <header className="panel__head">
        <h2 id={id} className="label">
          {title}
          {count !== undefined && <span className="panel__count">{count}</span>}
        </h2>
        {actions && <div className="panel__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Game icon in a fixed tile, so rows stay aligned when there is none (Water) or it fails to load. */
function GameIcon({ icon, size }: { icon: string | undefined; size: number }) {
  const [failed, setFailed] = useState(false);
  // Exported by `RecipeExport icons` into public/icons.
  const file = iconFile(icon);
  const src = file && `${import.meta.env.BASE_URL}icons/${file}`;
  if (!src || failed) return <span className="item-icon" style={{ width: size, height: size }} aria-hidden />;
  return (
    <img
      className="item-icon"
      src={src}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function ItemIcon({ item, size = 32 }: { item: string; size?: number }) {
  return <GameIcon icon={gameData.items[item]?.icon} size={size} />;
}

export function StationIcon({ station, size = 40 }: { station: string; size?: number }) {
  return <GameIcon icon={gameData.stationIcons[station]} size={size} />;
}

export function QtyInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <input
      className="qty-input"
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      value={value || ''}
      placeholder="0"
      aria-label={label}
      onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
      onFocus={(e) => e.target.select()}
    />
  );
}

/** Ticks a line as fully owned (owned = needed); unticking clears the owned quantity. */
export function HaveCheck({ line }: { line: PlanLine }) {
  const { t, item } = useI18n();
  const covered = line.remaining === 0;
  return (
    <input
      className="have-check"
      type="checkbox"
      checked={covered}
      aria-label={t('haveAll', { name: item(line.item) })}
      onChange={(e) => setOwned(line.item, e.target.checked ? line.needed : 0)}
    />
  );
}

/**
 * − / + on a row of the overlay app, acting on the quantity left that the row
 * shows: − is one more owned, + one fewer. + stops once nothing is owned, when
 * the row is back to everything needed.
 */
export function LeftStepper({ line, owned }: { line: PlanLine; owned: number }) {
  const { t, item } = useI18n();
  const name = item(line.item);
  return (
    <span className="stepper">
      <button
        type="button"
        className="stepper__btn"
        title={t('leftLess', { name })}
        aria-label={t('leftLess', { name })}
        onClick={() => changeOwned(line.item, 1)}
      >
        −
      </button>
      <button
        type="button"
        className="stepper__btn"
        disabled={owned === 0}
        title={t('leftMore', { name })}
        aria-label={t('leftMore', { name })}
        onClick={() => changeOwned(line.item, -1)}
      >
        +
      </button>
    </span>
  );
}

/**
 * Quantity still needed. Clicking it opens a small field to enter how many you
 * already have, for when you own part of it; Enter or leaving the field saves.
 * `onEditing` hears when the field opens and closes (the overlay app lends the
 * keyboard only then); every open is followed by a close, even on unmount.
 */
export function QtyEdit({ line, owned, onEditing }: { line: PlanLine; owned: number; onEditing?: (editing: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const { t, item, qty } = useI18n();
  const name = item(line.item);
  useEffect(() => {
    if (!editing || !onEditing) return;
    onEditing(true);
    return () => onEditing(false);
  }, [editing, onEditing]);
  if (editing) {
    return (
      <input
        className="qty-input qty-edit__input"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        defaultValue={owned || ''}
        aria-label={t('ownedOf', { name })}
        autoFocus
        onFocus={(e) => {
          cancelled.current = false;
          e.target.select();
        }}
        onBlur={(e) => {
          if (!cancelled.current) setOwned(line.item, Number.parseInt(e.target.value, 10) || 0);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancelled.current = true;
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />
    );
  }
  const shown = line.remaining || line.needed;
  return (
    <button
      type="button"
      className="qty-edit num"
      title={t('enterOwned')}
      aria-label={`${qty(shown)} ${name}. ${t('enterOwned')}`}
      onClick={() => setEditing(true)}
    >
      {qty(shown)}
    </button>
  );
}
