// First-party analytics: one pageview per load + delegated click tracking.
//
// Events POST to api/track.php on this same server — no SDK, no third-party request,
// and the data lands in a MySQL table you own. Writes are fire-and-forget; every tracked
// CTA opens in a new tab (target="_blank"), so the current document never unloads
// mid-write.

const ENDPOINT = "api/track.php";

const EVENT_TYPES = [
  "pageview",
  "whatsapp_click",
  "call_click",
  "cta_click",
  "generic_click",
];

function sessionId() {
  const KEY = "fc_session_id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

function track(eventType, label) {
  if (!EVENT_TYPES.includes(eventType)) return;

  const payload = JSON.stringify({
    eventType,
    label: String(label || "").slice(0, 120),
    page: location.pathname,
    sessionId: sessionId(),
    referrer: document.referrer.slice(0, 200),
  });

  // sendBeacon survives the page being closed or backgrounded mid-request, which a
  // fetch() does not — it is the difference between counting a bounce and losing it.
  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    } catch {
      /* fall through to fetch */
    }
  }

  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch((err) => {
    // Analytics must never surface to visitors or block anything.
    console.debug("[analytics] dropped event:", err.message);
  });
}

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-analytics-type]");
  if (!el) return;
  track(el.dataset.analyticsType, el.dataset.analyticsLabel);
});

document.addEventListener("cms:analytics", (event) => {
  track(event.detail.type, event.detail.label);
});

track("pageview", document.title);

export { track };
