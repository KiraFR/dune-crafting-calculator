// "What is left" page for the in-game overlay window. With `?list=<id>` it
// follows that guild list live (what the overlay app uses); without, the
// personal list of this browser (language included). Read-only, except in the
// overlay app (`app=1`): there the mouse over the panel shows a tick box and
// − / + on each row, a click on a quantity opens the "I have" field (the page
// asks the app for the keyboard meanwhile), and the page reports the panel's
// size to the app.
// `sections=gather` or `sections=craft` shows one section only; the app can
// switch them live.

import { useRef } from 'react';
import { useCalcState, useSyncInfo } from '../state/store';
import { usePlan } from '../state/usePlan';
import { useDocumentLanguage, useI18n, type StringKey } from '../ui/i18n';
import { leftCount, rawLines, RawList, StepList } from '../ui/PlanLists';
import { isAppMode, requestKeyboard, usePanelLayout, useSections, type Section } from './appBridge';

export const APP_MODE = isAppMode(window.location.search);

/** What to say when the sections shown have nothing left; undefined while something is. */
function emptyNote(sections: readonly Section[], gather: number, craft: number): StringKey | undefined {
  if (gather + craft === 0) return 'allCovered';
  if (sections.length === 1 && sections[0] === 'gather' && gather === 0) return 'nothingToGather';
  if (sections.length === 1 && sections[0] === 'craft' && craft === 0) return 'nothingToCraft';
  return undefined;
}

export function Overlay() {
  const state = useCalcState();
  const sync = useSyncInfo();
  const i18n = useI18n();
  const { t, item, qty } = i18n;
  useDocumentLanguage('remaining');
  const panel = useRef<HTMLDivElement>(null);
  usePanelLayout(panel, APP_MODE);
  const sections = useSections(window.location.search, APP_MODE);
  const { plan, error } = usePlan(state);
  const asked = state.build.filter((e) => e.qty > 0);
  const building = asked.map((e) => `${qty(e.qty)} ${item(e.item)}`).join(', ');
  const wanted = new Set(asked.map((e) => e.item));
  const gather = plan ? leftCount(rawLines(plan, i18n)) : 0;
  const craft = plan ? leftCount(plan.crafted) : 0;
  const mode = APP_MODE ? 'tick' : 'read';
  const onEditing = APP_MODE ? requestKeyboard : undefined;
  const note = plan && building ? emptyNote(sections, gather, craft) : undefined;

  return (
    <div ref={panel} className={`overlay${APP_MODE ? ' overlay--app' : ''}`}>
      <header className="overlay__head">
        <span className="label">{t('remaining')}</span>
        {building && <span className="overlay__building">{building}</span>}
      </header>
      {sync.status === 'missing' && <p className="error">{t('listMissing')}</p>}
      {error && <p className="error">{error}</p>}
      {note && <p>{t(note)}</p>}
      {plan && gather > 0 && sections.includes('gather') && (
        <section className="overlay__section">
          <h3 className="label">{t('gather')}</h3>
          <RawList plan={plan} owned={state.owned} mode={mode} onEditing={onEditing} />
        </section>
      )}
      {plan && craft > 0 && sections.includes('craft') && (
        <section className="overlay__section">
          <h3 className="label">{t('craft')}</h3>
          <StepList plan={plan} owned={state.owned} mode={mode} onEditing={onEditing} wanted={wanted} />
        </section>
      )}
    </div>
  );
}
