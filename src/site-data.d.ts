// The data file is ~480 KB; letting TypeScript infer a literal type for it would
// be slow and useless, so `resolveJsonModule` stays off and the import is typed here.
declare module '*/site-data.json' {
  const data: import('./core/gameData').RawSiteData;
  export default data;
}

/** Names in another language, written by tools/build_translations.py. */
declare module '*/names.fr.json' {
  const names: import('./core/gameData').Translation;
  export default names;
}
