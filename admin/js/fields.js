// Renders schema fields into DOM and reads values back out.
// Every renderer returns an element; every element carries a `read()` that produces
// the field's current value, so a section's value is just a walk over its children.

import { openMediaPicker } from "./media-library.js";

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function labelBlock(field) {
  return el("div", { class: "field-head" }, [
    el("label", { class: "field-label", text: field.label }),
    field.hint ? el("p", { class: "field-hint", text: field.hint }) : null,
  ]);
}

function markDirty(node) {
  node.dispatchEvent(new CustomEvent("field:change", { bubbles: true }));
}

/* ---------- individual field types ---------- */

function textField(field, value, { multiline = false } = {}) {
  const input = multiline
    ? el("textarea", { class: "input", rows: field.type === "html" ? 6 : 3 })
    : el("input", { class: "input", type: field.type === "number" ? "number" : "text" });
  input.value = value ?? "";
  input.addEventListener("input", () => markDirty(input));

  const wrap = el("div", { class: "field" }, [labelBlock(field), input]);
  wrap.read = () => (field.type === "number" ? Number(input.value) : input.value);
  return wrap;
}

function checkboxField(field, value) {
  const input = el("input", { type: "checkbox", class: "checkbox" });
  input.checked = value !== false;
  input.addEventListener("change", () => markDirty(input));

  const wrap = el("div", { class: "field field-inline" }, [
    el("label", { class: "checkbox-row" }, [input, el("span", { text: field.label })]),
    field.hint ? el("p", { class: "field-hint", text: field.hint }) : null,
  ]);
  wrap.read = () => input.checked;
  return wrap;
}

export function mediaField(field, value) {
  let current = normaliseMedia(value);

  const preview = el("div", { class: "media-preview" });
  const caption = el("p", { class: "media-caption" });

  function paint() {
    preview.innerHTML = "";
    if (current.url) {
      preview.appendChild(
        isVideo(current.url)
          ? el("video", { src: previewUrl(current.url), muted: true, playsinline: true, preload: "metadata" })
          : el("img", { src: previewUrl(current.url), alt: "" })
      );
      caption.textContent = fileLabel(current.url);
    } else {
      preview.appendChild(el("div", { class: "media-empty", text: "No file chosen" }));
      caption.textContent = "";
    }
  }
  paint();

  const chooseBtn = el("button", {
    class: "btn btn-sm",
    type: "button",
    text: "Choose file",
    onClick: async () => {
      const picked = await openMediaPicker();
      if (picked) {
        current = { url: picked.url, storagePath: picked.storagePath };
        paint();
        markDirty(preview);
      }
    },
  });

  const clearBtn = el("button", {
    class: "btn btn-sm btn-ghost",
    type: "button",
    text: "Remove",
    onClick: () => {
      current = { url: "", storagePath: null };
      paint();
      markDirty(preview);
    },
  });

  const wrap = el("div", { class: "field" }, [
    labelBlock(field),
    el("div", { class: "media-field" }, [
      preview,
      el("div", { class: "media-actions" }, [caption, el("div", { class: "btn-row" }, [chooseBtn, clearBtn])]),
    ]),
  ]);
  wrap.read = () => current;
  return wrap;
}

function listTextField(field, value) {
  const rows = el("div", { class: "rows" });

  function addRow(text = "") {
    const input = el("input", { class: "input", type: "text", value: text });
    input.addEventListener("input", () => markDirty(input));
    const row = el("div", { class: "row" }, [
      el("span", { class: "row-grip", html: gripSvg() }),
      input,
      iconButton("trash", "Remove", () => {
        row.remove();
        markDirty(rows);
      }),
    ]);
    row.read = () => input.value;
    rows.appendChild(row);
    return row;
  }

  (value || []).forEach((v) => addRow(v));
  enableReorder(rows);

  const wrap = el("div", { class: "field" }, [
    labelBlock(field),
    rows,
    el("button", {
      class: "btn btn-sm btn-ghost",
      type: "button",
      text: `+ Add ${(field.itemLabel || "item").toLowerCase()}`,
      onClick: (e) => {
        e.preventDefault();
        const row = addRow("");
        row.querySelector("input").focus();
        markDirty(rows);
      },
    }),
  ]);
  wrap.read = () =>
    Array.from(rows.children)
      .map((r) => r.read())
      .filter((v) => String(v).trim() !== "");
  return wrap;
}

export function repeaterField(field, value) {
  const list = el("div", { class: "repeater" });

  function addItem(item, expand = false) {
    const body = el("div", { class: "repeater-body" });
    const fieldNodes = (field.itemFields || []).map((f) => renderField(f, item?.[f.key]));
    fieldNodes.forEach((n) => body.appendChild(n));

    const title = el("span", {
      class: "repeater-title",
      text: itemTitle(item, field) || `New ${(field.itemLabel || "item").toLowerCase()}`,
    });

    const card = el("div", { class: `repeater-item${expand ? " open" : ""}` }, [
      el("div", { class: "repeater-head" }, [
        el("span", { class: "row-grip", html: gripSvg() }),
        title,
        el("div", { class: "repeater-head-actions" }, [
          iconButton("trash", "Delete", (e) => {
            e.stopPropagation();
            card.remove();
            markDirty(list);
          }),
          el("span", { class: "chevron", html: chevronSvg() }),
        ]),
      ]),
      body,
    ]);

    card.querySelector(".repeater-head").addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      card.classList.toggle("open");
    });

    body.addEventListener("field:change", () => {
      title.textContent = itemTitle(card.read(), field) || `New ${(field.itemLabel || "item").toLowerCase()}`;
    });

    card.read = () =>
      Object.fromEntries([
        ...Object.entries(item || {}).filter(([k]) => !(field.itemFields || []).some((f) => f.key === k)),
        ...(field.itemFields || []).map((f, i) => [f.key, fieldNodes[i].read()]),
      ]);

    list.appendChild(card);
    return card;
  }

  (value || []).forEach((item) => addItem(item));
  enableReorder(list);

  const wrap = el("div", { class: "field" }, [
    field.label ? labelBlock(field) : null,
    list,
    el("button", {
      class: "btn btn-sm",
      type: "button",
      text: `+ Add ${(field.itemLabel || "item").toLowerCase()}`,
      onClick: (e) => {
        e.preventDefault();
        const card = addItem(field.newItem ? field.newItem() : {}, true);
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        markDirty(list);
      },
    }),
  ]);
  wrap.read = () => Array.from(list.children).map((c) => c.read());
  return wrap;
}

function groupField(field, value) {
  const nodes = field.fields.map((f) => renderField(f, value?.[f.key]));
  const wrap = el("div", { class: "field field-group" }, [
    el("h4", { class: "group-title", text: field.label }),
    ...nodes,
  ]);
  wrap.read = () => Object.fromEntries(field.fields.map((f, i) => [f.key, nodes[i].read()]));
  return wrap;
}

export function mediaListField(field, value) {
  const grid = el("div", { class: "media-grid" });

  function addTile(item) {
    const media = normaliseMedia(item);
    const tile = el("div", { class: "media-tile" }, [
      el("span", { class: "row-grip", html: gripSvg() }),
      isVideo(media.url)
        ? el("video", { src: previewUrl(media.url), muted: true, playsinline: true, preload: "metadata" })
        : el("img", { src: previewUrl(media.url), alt: "", loading: "lazy" }),
      iconButton("trash", "Remove", () => {
        tile.remove();
        markDirty(grid);
      }),
    ]);
    tile.read = () => media;
    grid.appendChild(tile);
    return tile;
  }

  (value || []).forEach(addTile);
  enableReorder(grid);

  const wrap = el("div", { class: "field" }, [
    field.label ? labelBlock(field) : null,
    grid,
    el("button", {
      class: "btn btn-sm",
      type: "button",
      text: `+ Add ${(field.itemLabel || "photo").toLowerCase()}`,
      onClick: async (e) => {
        e.preventDefault();
        const picked = await openMediaPicker({ multiple: true });
        if (picked) {
          [].concat(picked).forEach(addTile);
          markDirty(grid);
        }
      },
    }),
  ]);
  wrap.read = () => Array.from(grid.children).map((t) => t.read());
  return wrap;
}

/* ---------- dispatcher ---------- */

export function renderField(field, value) {
  switch (field.type) {
    case "textarea":
    case "html":
      return textField(field, value, { multiline: true });
    case "checkbox":
      return checkboxField(field, value);
    case "media":
      return mediaField(field, value);
    case "list-text":
      return listTextField(field, value);
    case "repeater":
      return repeaterField(field, value);
    case "group":
      return groupField(field, value);
    case "media-list":
      return mediaListField(field, value);
    default:
      return textField(field, value);
  }
}

/* ---------- helpers ---------- */

export function normaliseMedia(v) {
  if (!v) return { url: "", storagePath: null };
  if (typeof v === "string") return { url: v, storagePath: null };
  return { url: v.url || "", storagePath: v.storagePath ?? null, ...v };
}

export function isVideo(url = "") {
  return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url);
}

// Content stores site-root-relative paths ("Assets/…") because that is what the public
// page needs. The admin lives one directory deeper, so previews must climb out — the
// stored value is never rewritten.
export function previewUrl(url = "") {
  if (!url || /^(https?:|data:|blob:|\/)/i.test(url)) return url;
  return `../${url}`;
}

export function fileLabel(url = "") {
  try {
    const clean = decodeURIComponent(url.split("?")[0]);
    return clean.split("/").pop();
  } catch {
    return url;
  }
}

function itemTitle(item, field) {
  const raw = item?.[field.titleKey || "label"] || "";
  return String(raw).slice(0, 70);
}

export function iconButton(name, title, onClick) {
  return el("button", {
    class: `icon-btn icon-btn-${name}`,
    type: "button",
    title,
    "aria-label": title,
    html: name === "trash" ? trashSvg() : "",
    onClick,
  });
}

function trashSvg() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6"/></svg>`;
}

function gripSvg() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.6"/>
    <circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
    <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;
}

function chevronSvg() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
}

// Drag-to-reorder using the grip handle. Keeps it dependency-free.
export function enableReorder(container) {
  let dragging = null;

  container.addEventListener("pointerdown", (e) => {
    const grip = e.target.closest(".row-grip");
    if (!grip || !container.contains(grip)) return;
    dragging = grip.closest(".row, .repeater-item, .media-tile");
    if (!dragging) return;
    dragging.classList.add("dragging");
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  container.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const siblings = Array.from(container.children).filter((c) => c !== dragging);
    const after = siblings.find((s) => {
      const box = s.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2 && e.clientX < box.right;
    });
    container.insertBefore(dragging, after || null);
  });

  container.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging.classList.remove("dragging");
    dragging = null;
    markDirty(container);
  });
}
