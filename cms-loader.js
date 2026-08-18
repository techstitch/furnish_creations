// Hydrates index.html from data/content.json, falling back to the literal hardcoded
// markup.
//
// Contract with the page: the existing HTML is never emptied up front — it IS the
// fallback. We only overwrite nodes for which live content actually exists. The page's
// animation/carousel scripts wait for the `cms:hydrated` event (always fired exactly
// once, success or failure) before measuring or cloning the DOM.
//
// The content is a static file on the same server, so the public site loads no SDK and
// makes no third-party request. A 404 here simply means nothing has been published yet,
// which is indistinguishable — correctly — from the fallback case.

import DEFAULT_CONTENT from "./shared/default-content.js";

const CONTENT_URL = "data/content.json";
const FETCH_TIMEOUT_MS = 2500;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Live values win, but empty strings / empty arrays / missing keys fall back to defaults
// so a half-filled admin form can never blank out a section of the live site.
function deepMerge(base, override) {
  if (override === undefined || override === null || override === "") return base;
  if (Array.isArray(override)) return override.length ? override : base;
  if (!isPlainObject(override) || !isPlainObject(base)) return override;
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
  }
  return out;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("cms timeout")), ms)),
  ]);
}

async function fetchLiveContent() {
  const res = await fetch(CONTENT_URL, { cache: "no-cache" });
  if (!res.ok) return null; // 404 = nothing published yet; the markup already on the page stands
  const data = await res.json();
  return data && typeof data === "object" ? data : null;
}

const mediaUrl = (m) => (typeof m === "string" ? m : m && m.url) || "";

function setText(el, value) {
  if (el && value) el.textContent = value;
}

function setHtml(el, value) {
  if (el && value) el.innerHTML = value;
}

function setImg(el, media) {
  const url = mediaUrl(media);
  if (el && url) el.setAttribute("src", url);
}

function renderContact(contact) {
  const number = (contact.whatsappNumber || "").replace(/\D/g, "");
  const waHref = number
    ? `https://wa.me/${number}?text=${encodeURIComponent(contact.whatsappMessage || "Hi")}`
    : null;

  $$("[data-tel-link]").forEach((a) => {
    if (contact.phone) a.setAttribute("href", `tel:${contact.phone}`);
  });
  $$("[data-whatsapp-link]").forEach((a) => {
    if (waHref) a.setAttribute("href", waHref);
  });
  $$("[data-contact-label='call']").forEach((el) => setText(el, contact.callLabel));
  $$("[data-contact-label='whatsapp']").forEach((el) => setText(el, contact.whatsappLabel));
  setText($("[data-cms='floating-whatsapp-label']"), contact.floatingLabel);
}

function renderHero(hero) {
  setImg($("[data-cms='hero-image']"), hero.heroImage);
  setImg($("[data-cms='hero-brush']"), hero.brushImage);
  setText($("[data-cms='hero-heading']"), hero.heading);
  setText($("[data-cms='hero-paragraph-prefix']"), hero.paragraphPrefix);
  setText($("[data-cms='hero-highlight']"), hero.highlightText);
  setText($("[data-cms='hero-paragraph-suffix']"), hero.paragraphSuffix);
  setText($("[data-cms='hero-badge']"), hero.badgeLabel);
  setText($("[data-cms='hero-form-heading']"), hero.formHeading);
  setText($("[data-cms='hero-form-button']"), hero.formButtonLabel);

  const list = $("[data-cms='hero-usp-list']");
  if (list && hero.uspList && hero.uspList.length) {
    list.innerHTML = hero.uspList.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }
}

function renderTestimonials(testimonials) {
  const track = $("[data-cms='testimonial-track']");
  if (!track || !testimonials || !testimonials.length) return;
  const template = track.querySelector(".testimonial");
  if (!template) return;

  const markup = testimonials
    .map((t) => {
      const node = template.cloneNode(true);
      setText(node.querySelector(".testimonial-name"), t.name);
      const body = node.querySelector(".testimonial-content");
      if (body) body.textContent = `“${t.text}”`;
      return node.outerHTML;
    })
    .join("");
  track.innerHTML = markup;
}

function renderQuotation(q) {
  setText($("[data-cms='quotation-heading']"), q.heading);
  setHtml($("[data-cms='quotation-paragraph']"), q.paragraphHtml);
  setText($("[data-cms='quotation-cta-label']"), q.ctaLabel);
}

function renderCarousel(items) {
  const track = $("[data-cms='carousel-track']");
  if (!track || !items || !items.length) return;
  track.innerHTML = items
    .map(
      (item) =>
        `<div class="carousel-card"><img draggable="false" src="${escapeAttr(mediaUrl(item))}" /></div>`
    )
    .join("");
}

function renderTabs(section) {
  setText($("[data-cms='tabs-heading']"), section.heading);
  setText($("[data-cms='tabs-cta-label']"), section.ctaLabel);

  const list = $("[data-cms='tab-list']");
  const visible = (section.tabs || []).filter((t) => t.visible !== false);
  if (list && visible.length) {
    list.innerHTML = visible
      .map((t) => `<div class="tab" data-tab="${escapeAttr(t.key)}">${escapeHtml(t.label)}</div>`)
      .join("");
  }

  // The tabs script reads this map for background images + copy; it is rebuilt wholesale
  // so hidden tabs stop participating in the auto-cycle.
  if (visible.length) {
    window.__cmsTabData = Object.fromEntries(
      visible.map((t) => [t.key, { bg: mediaUrl(t.bg), label: t.label, content: t.content }])
    );
  }
}

function renderGallery(gallery) {
  setText($("[data-cms='gallery-badge']"), gallery.badgeText);

  const cats = (gallery.categories || []).filter((c) => c.visible !== false);
  const buttonWrap = $("[data-cms='gallery-buttons']");
  const display = $("[data-cms='gallery-display']");
  if (!cats.length || !buttonWrap || !display) return;

  // Replace only the buttons — the rotating badge is a sibling inside the same flex row.
  $$(".category-btn", buttonWrap).forEach((btn) => btn.remove());
  cats.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.className = `category-btn${i === 0 ? " active" : ""}`;
    btn.dataset.gallery = c.key;
    btn.dataset.analyticsType = "generic_click";
    btn.dataset.analyticsLabel = `gallery:${c.key}`;
    btn.textContent = c.label;
    buttonWrap.appendChild(btn);
  });

  const byCat = new Map(cats.map((c) => [c.key, []]));
  (gallery.images || []).forEach((img) => {
    if (byCat.has(img.category)) byCat.get(img.category).push(img);
  });

  display.innerHTML = cats
    .map((c, i) => {
      const imgs = byCat
        .get(c.key)
        .map((im) => `<img src="${escapeAttr(mediaUrl(im))}" alt="${escapeAttr(im.alt || "")}">`)
        .join("");
      return `<div class="image-collection${i === 0 ? " active" : ""}" data-gallery="${escapeAttr(
        c.key
      )}">${imgs}</div>`;
    })
    .join("");
}

function renderOurStory(story) {
  setText($("[data-cms='story-heading']"), story.heading);
  setText($("[data-cms='story-p1']"), story.paragraph1);
  setText($("[data-cms='story-p2']"), story.paragraph2);
  setText($("[data-cms='story-p3']"), story.paragraph3);

  const list = $("[data-cms='story-bullets']");
  if (list && story.bulletList && story.bulletList.length) {
    list.innerHTML = story.bulletList.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  }

  const milestones = $("[data-cms='story-counters']");
  if (milestones && story.counters && story.counters.length) {
    milestones.innerHTML = story.counters
      .map(
        (c) =>
          `<div class="milestone"><div class="counter" data-target="${escapeAttr(
            c.target
          )}" data-suffix="${escapeAttr(c.suffix || "")}">0</div><span>${escapeHtml(
            c.label
          )}</span></div>`
      )
      .join("");
  }

  if (story.guarantee) {
    setText($("[data-cms='guarantee-heading']"), story.guarantee.heading);
    setHtml($("[data-cms='guarantee-paragraph']"), story.guarantee.paragraphHtml);
  }
}

function renderMaps(locations) {
  const wrap = $("[data-cms='map-section']");
  // Admins paste this URL by hand, so a mistyped or non-https value is dropped rather
  // than rendered into an iframe src.
  const valid = (locations || []).filter((l) => /^https:\/\//i.test(l.embedSrc || ""));
  if (!wrap || !valid.length) return;
  wrap.innerHTML = valid
    .map(
      (loc) => `<div class="map-block">
          <h3>${escapeHtml(loc.heading)}</h3>
          <iframe src="${escapeAttr(loc.embedSrc)}" width="100%" height="350" style="border:0;"
            allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>`
    )
    .join("");
}

function renderFooterLinks(footer) {
  const wrap = $("[data-cms='footer-links']");
  if (!wrap || !footer || !footer.links || !footer.links.length) return;
  wrap.innerHTML = footer.links
    .map(
      (l, i) =>
        `${i ? "<span>|</span>" : ""}<a href="${escapeAttr(l.href)}" data-analytics-type="generic_click" data-analytics-label="nav:${escapeAttr(
          l.label
        )}">${escapeHtml(l.label)}</a>`
    )
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

function render(content) {
  renderContact(content.contact);
  renderHero(content.hero);
  renderTestimonials(content.testimonials);
  renderQuotation(content.quotation);
  renderCarousel(content.carousel);
  renderTabs(content.tabsSection);
  renderGallery(content.gallery);
  renderOurStory(content.ourStory);
  renderMaps(content.mapLocations);
  renderFooterLinks(content.footer);
}

async function hydrate() {
  let content = DEFAULT_CONTENT;
  try {
    const live = await withTimeout(fetchLiveContent(), FETCH_TIMEOUT_MS);
    if (live) {
      content = deepMerge(DEFAULT_CONTENT, live);
      render(content);
    }
    // No live doc: the hardcoded markup already in the page is correct as-is.
  } catch (err) {
    console.warn("[cms] falling back to built-in content:", err.message);
  }

  window.__cmsContent = content;
  document.dispatchEvent(new CustomEvent("cms:hydrated", { detail: { content } }));
}

hydrate();
