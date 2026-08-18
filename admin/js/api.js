// One place that talks to the site's own PHP endpoints.
//
// Authentication is the session cookie, which the browser attaches automatically and
// JavaScript cannot read. What this helper must add is the CSRF token on every
// state-changing request — keeping that in one place is what stops an endpoint from
// being called without it by accident.

import { csrfHeader, handleSessionLoss } from "./auth.js";

// Relative to /admin/, which is where every caller of this module runs.
const BASE = "../api/";

// The endpoints always answer JSON, but a misconfigured host can return an HTML error
// page instead; surfacing that as "unexpected token <" would tell the admin nothing.
async function parse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function describe(res, body) {
  if (body && body.error) return body.error;
  if (res.status === 404) return "That part of the website's server code is missing — re-upload the api folder.";
  if (res.status === 401) return "You have been signed out. Please sign in again.";
  if (res.status === 419) return "The page is stale. Reload the editor and try again.";
  if (res.status === 413) return "That file was too large for the server.";
  return `The server returned ${res.status}.`;
}

export async function apiFetch(path, { method = "GET", json, body, headers = {} } = {}) {
  const init = {
    method,
    credentials: "same-origin",
    headers: { ...csrfHeader(), ...headers },
  };
  if (json !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(json);
  } else if (body !== undefined) {
    init.body = body; // FormData sets its own multipart boundary — never set it by hand
  }

  let res;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new Error("Could not reach the website's server. Check your connection.");
  }

  const parsed = await parse(res);
  if (!res.ok || !parsed || !parsed.ok) {
    // A lapsed session should return the editor to the login screen rather than leave
    // it showing stale content that can no longer be saved.
    if (res.status === 401) handleSessionLoss();
    throw new Error(describe(res, parsed));
  }
  return parsed;
}

// The public read of the content file, used by the editor to load what is currently
// live. No session needed: this is the same file every visitor's browser fetches.
export async function fetchPublicContent() {
  const res = await fetch("../data/content.json", { cache: "no-cache" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read the site content (${res.status}).`);
  return res.json();
}
