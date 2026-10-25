/** 45s, 1m 10s, 2h 05m. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const rest = s % 60;
    return rest ? `${Math.floor(s / 60)}m ${String(rest).padStart(2, '0')}s` : `${s / 60}m`;
  }
  const minutes = Math.round((s % 3600) / 60);
  return `${Math.floor(s / 3600)}h ${String(minutes).padStart(2, '0')}m`;
}

/** Case-, accent- and apostrophe-insensitive form used for search. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘`´]/g, "'")
    .toLowerCase();
}
