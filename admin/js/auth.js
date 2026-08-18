// Sign-in against the site's own server. There is deliberately no way to create an
// account here — the single admin's email and password hash live in api/config.php,
// and a registration path would only ever be a way in.
//
// The session itself is an httpOnly cookie, so nothing in this file ever holds the
// credential. What it does hold is the CSRF token, which every write must echo back.

const ENDPOINT = "../api/auth.php";

let csrf = "";
let currentEmail = null;
const listeners = new Set();

export function csrfHeader() {
  return csrf ? { "X-CSRF-Token": csrf } : {};
}

async function call(payload, { method = "POST" } = {}) {
  const init = {
    method,
    // Without this the session cookie is not sent on same-origin fetch in some
    // configurations, and every request would look signed out.
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  };
  if (method === "POST") init.body = JSON.stringify(payload);

  let res;
  try {
    res = await fetch(method === "GET" ? `${ENDPOINT}?action=${payload.action}` : ENDPOINT, init);
  } catch {
    throw new Error("Could not reach the website's server. Check your connection.");
  }

  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* a misconfigured host can return an HTML error page */
  }
  if (!res.ok || !body || !body.ok) {
    throw new Error(body?.error || `The server returned ${res.status}.`);
  }
  return body;
}

function announce() {
  for (const fn of listeners) fn(currentEmail ? { email: currentEmail } : null);
}

export async function signIn(email, password) {
  const body = await call({ action: "login", email, password });
  csrf = body.csrf || "";
  currentEmail = body.email;
  announce();
}

export async function signOut() {
  try {
    await call({ action: "logout" });
  } finally {
    // Even if the request failed, the local view of "signed in" must not survive a
    // deliberate sign-out.
    csrf = "";
    currentEmail = null;
    announce();
  }
}

// Mirrors the shape the app already expected: register a callback, get called with the
// current state immediately and again on every change.
export async function onAuthChange(callback) {
  listeners.add(callback);
  try {
    const body = await call({ action: "me" }, { method: "GET" });
    if (body.signedIn) {
      csrf = body.csrf || "";
      currentEmail = body.email;
    } else {
      csrf = "";
      currentEmail = null;
    }
  } catch {
    csrf = "";
    currentEmail = null;
  }
  callback(currentEmail ? { email: currentEmail } : null);
  return () => listeners.delete(callback);
}

// The session can lapse while the editor sits open. When the server says so, the app
// should fall back to the login screen rather than keep failing silently.
export function handleSessionLoss() {
  if (currentEmail === null) return;
  csrf = "";
  currentEmail = null;
  announce();
}

export function friendlyAuthError(messageOrCode) {
  return typeof messageOrCode === "string" && messageOrCode
    ? messageOrCode
    : "Could not sign in. Please try again.";
}
