import { useMemo } from 'react';
import { alternativeFamily } from '../core/recipeChoice';
import { gameData } from '../data';
import { LANGS } from '../state/persist';
import { clearOwned, guildUrl, setLang, useCalcState, useSyncInfo } from '../state/store';
import { usePlan } from '../state/usePlan';
import { BuildList } from '../ui/BuildList';
import { formatDuration } from '../ui/format';
import { GuildBar } from '../ui/GuildBar';
import { useDocumentLanguage, useI18n } from '../ui/i18n';
import { ItemBrowser } from '../ui/ItemBrowser';
import { MachinesPanel } from '../ui/MachinesPanel';
import { leftCount, rawLines, RawList, StepList } from '../ui/PlanLists';
import { Panel } from '../ui/primitives';

export function App() {
  const state = useCalcState();
  const sync = useSyncInfo();
  const i18n = useI18n();
  const { t } = i18n;
  useDocumentLanguage('title');
  const { plan, error } = usePlan(state);
  const inBuild = useMemo(() => new Set(state.build.map((e) => e.item)), [state.build]);
  const hasQuantities = state.build.some((e) => e.qty > 0);
  const hasOwned = Object.keys(state.owned).length > 0;

  // Kinds of refinery the current list has a choice for: only those appear in the Machines panel.
  const families = useMemo(() => {
    const found = new Set<string>();
    for (const line of plan?.crafted ?? []) {
      const family = line.needed > 0 ? alternativeFamily(gameData, line.item) : undefined;
      if (family) found.add(family);
    }
    return found;
  }, [plan]);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          <span className="eyebrow">Dune: Awakening</span>
          {t('title')}
        </h1>
        <div className="app__tools">
          <GuildBar />
          <div className="lang-switch" role="group" aria-label={t('language')}>
            {LANGS.map((lang) => (
              <button
                key={lang}
                type="button"
                className="lang-switch__option"
                aria-pressed={state.lang === lang}
                onClick={() => setLang(lang)}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
          <a
            className="button button--ghost"
            href={sync.listId ? guildUrl(sync.listId, 'overlay') : `${import.meta.env.BASE_URL}overlay/`}
            target="_blank"
            rel="noreferrer"
          >
            {t('overlay')}
          </a>
        </div>
      </header>

      <main className="app__layout">
        <aside className="app__browser">
          <ItemBrowser inBuild={inBuild} />
        </aside>

        <aside className="app__side">
          <MachinesPanel state={state} families={families} />
        </aside>

        <div className="app__work">
          {sync.status === 'missing' && (
            <p className="error" role="alert">
              {t('listMissing')}
            </p>
          )}

          <BuildList state={state} />

          {error && (
            <p className="error" role="alert">
              {t('cannotPlan', { error })}
            </p>
          )}

          {plan && hasQuantities && (
            <>
              <Panel
                title={t('rawMaterials')}
                count={leftCount(rawLines(plan, i18n)) || '✓'}
                actions={
                  hasOwned && (
                    <button type="button" className="button button--ghost" onClick={clearOwned}>
                      {t('untickAll')}
                    </button>
                  )
                }
              >
                <RawList plan={plan} owned={state.owned} />
              </Panel>

              <Panel
                title={t('craftingSteps')}
                count={leftCount(plan.crafted) || '✓'}
                actions={plan.totalDuration > 0 && <span className="caption">{formatDuration(plan.totalDuration)}</span>}
              >
                <StepList plan={plan} owned={state.owned} />
              </Panel>
            </>
          )}
        </div>
      </main>

      <footer className="app__footer caption">
        {t('dataSource', { build: gameData.source.clientBuild, date: gameData.source.generated })}
      </footer>
    </div>
  );
}
