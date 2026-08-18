// Modal media picker: upload new files to the site's own server or reuse existing ones.
// Also lists the images that ship with the site so the original photos remain pickable
// without re-uploading them.

import { el, isVideo, fileLabel, previewUrl } from "./fields.js";
import { uploadMedia, deleteMedia, listMedia, defaults } from "./content-repo.js";

let overlay = null;
let resolvePick = null;
let allowMultiple = false;
let selected = [];
let cachedRemote = null;

// Photos that shipped with the site under Assets/ — collected from the seed defaults
// so nothing that is currently on the live site becomes unpickable.
function repoMedia() {
  const d = defaults();
  const urls = new Set();
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      if (typeof node.url === "string" && node.url.startsWith("Assets/")) urls.add(node.url);
      return Object.values(node).forEach(walk);
    }
  };
  walk(d);
  return Array.from(urls)
    .sort()
    .map((url) => ({ url, storagePath: null, name: fileLabel(url), builtIn: true }));
}

function tile(item) {
  const node = el("button", {
    class: "picker-tile",
    type: "button",
    title: item.name || fileLabel(item.url),
  }, [
    isVideo(item.url)
      ? el("video", { src: previewUrl(item.url), muted: true, playsinline: true, preload: "metadata" })
      : el("img", { src: previewUrl(item.url), alt: "", loading: "lazy" }),
    el("span", { class: "picker-tile-name", text: item.name || fileLabel(item.url) }),
    item.builtIn ? el("span", { class: "picker-badge", text: "site file" }) : null,
  ]);

  node.addEventListener("click", () => {
    if (allowMultiple) {
      const at = selected.findIndex((s) => s.url === item.url);
      if (at >= 0) selected.splice(at, 1);
      else selected.push({ url: item.url, storagePath: item.storagePath });
      node.classList.toggle("selected");
      updateFooter();
    } else {
      finish({ url: item.url, storagePath: item.storagePath });
    }
  });

  if (!item.builtIn) {
    node.appendChild(
      el("span", {
        class: "picker-delete",
        title: "Delete from storage",
        html: "&times;",
        onClick: async (e) => {
          e.stopPropagation();
          if (!confirm(`Permanently delete ${item.name}? Any section still using it will show a broken image.`)) return;
          await deleteMedia(item.storagePath);
          cachedRemote = null;
          refresh();
        },
      })
    );
  }
  return node;
}

function updateFooter() {
  const btn = overlay.querySelector(".picker-confirm");
  if (!btn) return;
  btn.disabled = selected.length === 0;
  btn.textContent = selected.length ? `Add ${selected.length} selected` : "Add selected";
}

async function refresh() {
  const grid = overlay.querySelector(".picker-grid");
  const status = overlay.querySelector(".picker-status");
  grid.innerHTML = "";
  status.textContent = "Loading…";
  let failed = false;
  try {
    if (!cachedRemote) cachedRemote = await listMedia();
  } catch (err) {
    failed = true;
    cachedRemote = [];
    status.textContent = `Uploads unavailable — ${err.message} Every photo already on your site is still listed below.`;
  }
  const items = [...cachedRemote, ...repoMedia()];
  const query = overlay.querySelector(".picker-search").value.trim().toLowerCase();
  const shown = query
    ? items.filter((i) => (i.name || i.url).toLowerCase().includes(query))
    : items;
  shown.forEach((i) => grid.appendChild(tile(i)));
  if (!failed) {
    status.textContent = `${shown.length} file${shown.length === 1 ? "" : "s"}`;
  }
}

async function handleFiles(files) {
  const status = overlay.querySelector(".picker-status");
  const list = Array.from(files);
  const uploaded = [];
  for (const [i, file] of list.entries()) {
    status.textContent = `Uploading ${i + 1} of ${list.length}: ${file.name}…`;
    try {
      uploaded.push(await uploadMedia(file, (pct) => {
        status.textContent = `Uploading ${i + 1} of ${list.length}: ${file.name} — ${pct}%`;
      }));
    } catch (err) {
      status.textContent = `Upload failed: ${err.code || err.message}`;
      return;
    }
  }
  cachedRemote = null;
  if (allowMultiple) {
    selected.push(...uploaded);
    await refresh();
    updateFooter();
    status.textContent = `Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"} — they are live on the website now.`;
  } else if (uploaded.length) {
    finish(uploaded[0]);
  }
}

function finish(value) {
  const done = resolvePick;
  close();
  done?.(value);
}

function close() {
  overlay?.remove();
  overlay = null;
  resolvePick = null;
  selected = [];
}

function build() {
  const fileInput = el("input", {
    type: "file",
    accept: "image/*,video/*",
    multiple: true,
    class: "visually-hidden",
    onChange: (e) => handleFiles(e.target.files),
  });

  const dropzone = el("div", { class: "picker-drop" }, [
    el("p", { text: "Drag files here, or" }),
    el("button", { class: "btn btn-sm", type: "button", text: "Browse your computer", onClick: () => fileInput.click() }),
    el("p", {
      class: "picker-drop-note",
      text: "Large photos are shrunk automatically. New uploads go live on the website straight away.",
    }),
    fileInput,
  ]);

  ["dragover", "dragenter"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("over");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("over");
    })
  );
  dropzone.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));

  const panel = el("div", { class: "picker" }, [
    el("header", { class: "picker-head" }, [
      el("h3", { text: "Media library" }),
      el("button", { class: "icon-btn", type: "button", html: "&times;", title: "Close", onClick: close }),
    ]),
    dropzone,
    el("div", { class: "picker-toolbar" }, [
      el("input", { class: "input picker-search", type: "search", placeholder: "Search files…", onInput: refresh }),
      el("span", { class: "picker-status" }),
    ]),
    el("div", { class: "picker-grid" }),
    allowMultiple
      ? el("footer", { class: "picker-foot" }, [
          el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onClick: close }),
          el("button", {
            class: "btn picker-confirm",
            type: "button",
            text: "Add selected",
            disabled: true,
            onClick: () => finish(selected.slice()),
          }),
        ])
      : null,
  ]);

  overlay = el("div", { class: "overlay", onClick: (e) => e.target === overlay && close() }, [panel]);
  document.body.appendChild(overlay);
  refresh();
}

export function openMediaPicker({ multiple = false } = {}) {
  return new Promise((resolve) => {
    allowMultiple = multiple;
    selected = [];
    resolvePick = resolve;
    build();
  });
}
