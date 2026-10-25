// The machine used for each kind of refinery, as picture cards. Only the kinds
// the current list has a choice for are shown; the choice applies to every
// item of that kind.

import { DEFAULT_SIZE, machineFamilies } from '../core/recipeChoice';
import { gameData } from '../data';
import type { CalcState } from '../state/persist';
import { setMachine } from '../state/store';
import { useI18n } from './i18n';
import { Panel, StationIcon } from './primitives';

const FAMILIES = machineFamilies(gameData);

export function MachinesPanel({ state, families }: { state: CalcState; families: ReadonlySet<string> }) {
  const { t, station, family: familyName } = useI18n();
  const shown = FAMILIES.filter((f) => families.has(f.family));
  if (!shown.length) return null;

  return (
    <Panel title={t('machines')}>
      <div className="machines">
        {shown.map(({ family, stations }) => {
          const chosen = state.machines[family] ?? DEFAULT_SIZE;
          return (
            <section key={family} className="machines__kind">
              <h3 className="machines__title">{familyName(family)}</h3>
              <div className="machines__options" role="radiogroup" aria-label={familyName(family)}>
                {stations.map((s) => (
                  <button
                    key={s.size}
                    type="button"
                    role="radio"
                    aria-checked={s.size === chosen}
                    className="machine"
                    onClick={() => setMachine(family, s.size)}
                  >
                    <StationIcon station={s.station} size={40} />
                    <span className="machine__name">{station(s.station)}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
