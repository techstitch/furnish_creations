import DEFAULT_CONTENT from "../../shared/default-content.js";
import { apiFetch, fetchPublicContent } from "./api.js";
import { deepMerge } from "../../shared/deep-merge.js";

// Media lives in Assets/uploads/ on the site's own hosting.
export { uploadMedia, deleteMedia, listMedia } from "./server-media.js";

let cache = null;

export function defaults() {
  return structuredClone(DEFAULT_CONTENT);
}

export async function loadContent({ force = false } = {}) {
  if (cache && !force) return cache;
  const live = await fetchPublicContent();
  // Same merge the public site uses, so a section that was saved with only some of
  // its fields still opens here showing the built-in values for the rest.
  cache = live ? deepMerge(defaults(), live) : defaults();
  // Drives the one-time "Copy website content in" banner: a site that has never been
  // published has no content.json at all.
  cache.__seeded = live !== null;
  return cache;
}

export async function saveSection(sectionKey, value) {
  await apiFetch("content.php", {
    method: "POST",
    json: { action: "save-section", section: sectionKey, value },
  });
  if (cache) cache[sectionKey] = value;
}

export async function seedDefaults() {
  await apiFetch("content.php", {
    method: "POST",
    json: { action: "seed", content: defaults() },
  });
  cache = null;
}
