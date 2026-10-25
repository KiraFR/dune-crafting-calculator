// Header controls for guild lists. On the personal list: a Share button that
// turns it into a guild list. On a guild list: its sync status, the link to
// send to the guild, and the way back to the personal list.

import { useState } from 'react';
import { guildUrl, openPersonalList, shareCurrentList, useSyncInfo } from '../state/store';
import { useI18n, type StringKey } from './i18n';

const STATUS_KEY: Record<string, StringKey> = {
  loading: 'statusLoading',
  live: 'statusLive',
  saving: 'statusSaving',
  offline: 'statusOffline',
  missing: 'statusMissing',
};

export function GuildBar() {
  const { t } = useI18n();
  const { listId, status, available } = useSyncInfo();
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string>();

  if (!listId) {
    if (!available) return null;
    const share = async () => {
      setSharing(true);
      setError(undefined);
      try {
        await shareCurrentList();
      } catch (e) {
        setSharing(false);
        setError(t('shareFailed', { error: e instanceof Error ? e.message : String(e) }));
      }
    };
    return (
      <div className="guild-bar">
        <button type="button" className="button" disabled={sharing} onClick={() => void share()}>
          {t('share')}
        </button>
        {error && (
          <span className="guild-bar__error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  const copy = async () => {
    const link = guildUrl(listId);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt(t('copyLink'), link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="guild-bar">
      <span className={`guild-status guild-status--${status}`}>
        <span className="guild-status__dot" aria-hidden="true" />
        <span className="guild-status__name">{t('guildList')}</span>
        <span className="caption">{t(STATUS_KEY[status ?? 'loading']!)}</span>
      </span>
      {status !== 'missing' && (
        <button type="button" className="button" onClick={() => void copy()}>
          {copied ? t('linkCopied') : t('copyLink')}
        </button>
      )}
      <button type="button" className="button button--ghost" onClick={openPersonalList}>
        {t('myList')}
      </button>
    </div>
  );
}
