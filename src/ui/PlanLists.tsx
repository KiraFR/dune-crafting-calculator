// The two lists of the plan: raw materials to gather and crafting steps in
// order. Covered lines move to the bottom, struck through, so they can be
// unticked. The overlay shows the same lists without covered lines, read-only,
// or in the overlay app with a tick box, − / + buttons, and the "I have" field
// on a click on the quantity (the app lends the keyboard while it is open).

import { Fragment, type ReactNode } from 'react';
import { BUILD_STATION } from '../core/gameData';
import type { Plan, PlanLine, PlanStep } from '../core/plan';
import { formatDuration } from './format';
import { useI18n, type I18n } from './i18n';
import { HaveCheck, ItemIcon, LeftStepper, QtyEdit } from './primitives';

/** `edit`: the calculator. `read`: the overlay. `tick`: the overlay in the overlay app. */
export type ListMode = 'edit' | 'read' | 'tick';

interface ListProps {
  plan: Plan;
  owned: Readonly<Record<string, number>>;
  mode?: ListMode;
  /** Hears an "I have" field opening and closing. */
  onEditing?: (editing: boolean) => void;
}

/** Lines still needed, then (in the calculator) the covered ones. Lines nothing needs any more are left out. */
function ordered(lines: PlanLine[], mode: ListMode): PlanLine[] {
  const active = lines.filter((l) => l.needed > 0);
  const left = active.filter((l) => l.remaining > 0);
  return mode === 'edit' ? [...left, ...active.filter((l) => l.remaining === 0)] : left;
}

/** Raw materials by name in the current language, water last: it is gathered differently. */
export function rawLines(plan: Plan, { item, lang }: I18n): PlanLine[] {
  return [...plan.raw].sort(
    (a, b) => Number(a.item === 'Water') - Number(b.item === 'Water') || item(a.item).localeCompare(item(b.item), lang),
  );
}

export function leftCount(lines: PlanLine[]): number {
  return lines.filter((l) => l.remaining > 0).length;
}

const MODIFIER: Record<ListMode, string> = { edit: '', read: 'readonly', tick: 'tick' };

/** `plan-list` or `plan-row` with the mode's modifier: the list sets the columns, its rows share them. */
function modeClass(block: 'plan-list' | 'plan-row', mode: ListMode): string {
  return MODIFIER[mode] ? `${block} ${block}--${MODIFIER[mode]}` : block;
}

interface RowProps {
  line: PlanLine;
  owned: number;
  mode: ListMode;
  onEditing?: (editing: boolean) => void;
  children?: ReactNode;
}

function Row({ line, owned, mode, onEditing, children }: RowProps) {
  const { t, item, qty } = useI18n();
  const covered = line.remaining === 0;
  const partial = !covered && line.owned > 0;
  return (
    <li className={`${modeClass('plan-row', mode)}${covered ? ' is-done' : ''}`}>
      {mode !== 'read' && <HaveCheck line={line} />}
      {mode === 'read' ? (
        <span className="num plan-row__qty">{qty(line.remaining)}</span>
      ) : (
        <QtyEdit line={line} owned={owned} onEditing={onEditing} />
      )}
      <ItemIcon item={line.item} size={mode === 'edit' ? 28 : 24} />
      <span className="plan-row__name">
        {item(line.item)}
        {partial && <span className="plan-row__have">{t('have', { n: qty(line.owned) })}</span>}
      </span>
      {children}
      {mode === 'tick' && <LeftStepper line={line} owned={owned} />}
    </li>
  );
}

export function RawList({ plan, owned, mode = 'edit', onEditing }: ListProps) {
  const i18n = useI18n();
  return (
    <ul className={modeClass('plan-list', mode)}>
      {ordered(rawLines(plan, i18n), mode).map((line) => (
        <Row key={line.item} line={line} owned={owned[line.item] ?? 0} mode={mode} onEditing={onEditing} />
      ))}
    </ul>
  );
}

function StepDetails({ step, compact }: { step: PlanStep; compact: boolean }) {
  const { t, item, qty } = useI18n();
  const built = step.stations.includes(BUILD_STATION);
  return (
    <span className="plan-row__details">
      <span>
        {built
          ? t(step.crafts === 1 ? 'buildsOne' : 'buildsOther', { n: qty(step.crafts) })
          : `${t(step.crafts === 1 ? 'craftsOne' : 'craftsOther', { n: qty(step.crafts) })} · ${formatDuration(step.totalDuration)}`}
      </span>
      {!compact &&
        Object.entries(step.inputs).map(([id, n]) => (
          <span key={id} className="ingredient">
            <ItemIcon item={id} size={18} />
            {item(id)} ×{qty(n)}
          </span>
        ))}
    </span>
  );
}

/**
 * Crafting steps. With `wanted` (the build list's items, in the overlay), the
 * materials made along the way come first, then a divider, then the items
 * asked for.
 */
export function StepList({ plan, owned, mode = 'edit', onEditing, wanted }: ListProps & { wanted?: ReadonlySet<string> }) {
  const steps = new Map(plan.steps.map((s) => [s.item, s]));
  const lines = ordered(plan.crafted, mode);
  const groups = wanted ? [lines.filter((l) => !wanted.has(l.item)), lines.filter((l) => wanted.has(l.item))] : [lines];
  const shown = groups.filter((group) => group.length > 0);
  return shown.map((group, i) => (
    <Fragment key={i}>
      {i > 0 && <hr className="plan-divider" />}
      <ol className={modeClass('plan-list', mode)}>
        {group.map((line) => {
          const step = steps.get(line.item);
          return (
            <Row key={line.item} line={line} owned={owned[line.item] ?? 0} mode={mode} onEditing={onEditing}>
              {step && <StepDetails step={step} compact={mode !== 'edit'} />}
            </Row>
          );
        })}
      </ol>
    </Fragment>
  ));
}
