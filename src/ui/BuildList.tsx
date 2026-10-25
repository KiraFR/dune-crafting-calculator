import { makeRecipeResolver } from '../core/recipeChoice';
import { gameData } from '../data';
import type { CalcState } from '../state/persist';
import { addToBuild, clearBuild, removeFromBuild, setBuildQty, setBuildQuality } from '../state/store';
import { useI18n } from './i18n';
import { ItemIcon, Panel, QtyInput } from './primitives';

const EXAMPLES = [
  { item: 'SteelBar', qty: 10 },
  { item: 'MelangeSpice', qty: 20 },
];

export function BuildList({ state }: { state: CalcState }) {
  const { t, item } = useI18n();
  const recipeFor = makeRecipeResolver(gameData, {}, state.machines);

  return (
    <Panel
      title={t('selectedItems')}
      count={state.build.length || undefined}
      actions={
        state.build.length > 0 && (
          <button type="button" className="button button--ghost" onClick={clearBuild}>
            {t('clear')}
          </button>
        )
      }
    >
      {state.build.length === 0 ? (
        <div className="empty">
          <p>{t('emptyHint')}</p>
          <div className="empty__examples">
            {EXAMPLES.map((ex) => (
              <button key={ex.item} type="button" className="button" onClick={() => addToBuild(ex.item, ex.qty)}>
                {t('tryExample', { qty: ex.qty, name: item(ex.item) })}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="build">
          {state.build.map((entry) => {
            const recipe = recipeFor(entry.item);
            const levels = recipe ? gameData.recipes[recipe]!.levels.length : 1;
            const name = item(entry.item);
            return (
              <li key={entry.item} className="build__row">
                <ItemIcon item={entry.item} size={32} />
                <span className="build__name">{name}</span>
                {levels > 1 && (
                  <select
                    className="select select--compact"
                    aria-label={t('qualityOf', { name })}
                    value={Math.min(entry.quality, levels - 1)}
                    onChange={(e) => setBuildQuality(entry.item, Number(e.target.value))}
                  >
                    {Array.from({ length: levels }, (_, q) => (
                      <option key={q} value={q}>
                        {t('quality', { q })}
                      </option>
                    ))}
                  </select>
                )}
                <QtyInput value={entry.qty} onChange={(v) => setBuildQty(entry.item, v)} label={t('quantityOf', { name })} />
                <button
                  type="button"
                  className="button button--icon"
                  aria-label={t('remove', { name })}
                  title={t('remove', { name })}
                  onClick={() => removeFromBuild(entry.item)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
