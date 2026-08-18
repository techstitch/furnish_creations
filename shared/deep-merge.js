// Merging live content over the built-in defaults.
//
// Shared deliberately: the public site and the editor must agree on what a half-filled
// document means, or the page renders correctly while the editor shows empty boxes for
// the very same section.
//
// Live values win, but empty strings, empty arrays and missing keys fall back to the
// default, so a partially saved section can never blank out the site or the editor.

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(base, override) {
  if (override === undefined || override === null || override === "") return base;
  if (Array.isArray(override)) return override.length ? override : base;
  if (!isPlainObject(override) || !isPlainObject(base)) return override;
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
  }
  return out;
}
