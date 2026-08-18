// The gallery holds ~80 photos across categories, so it gets a dedicated editor:
// pick a category, manage just that category's photos.

import { el, renderField, repeaterField, normaliseMedia, isVideo, previewUrl, iconButton, enableReorder } from "./fields.js";
import { openMediaPicker } from "./media-library.js";

export function renderGalleryEditor(value) {
  const data = {
    badgeText: value?.badgeText || "",
    categories: (value?.categories || []).map((c) => ({ ...c })),
    images: (value?.images || []).map((i) => ({ ...i })),
  };

  const badgeNode = renderField({ key: "badgeText", label: "Badge text", type: "text" }, data.badgeText);

  const catNode = repeaterField(
    {
      key: "categories",
      label: "Categories",
      type: "repeater",
      itemLabel: "Category",
      titleKey: "label",
      itemFields: [
        { key: "label", label: "Button text", type: "text" },
        { key: "key", label: "Internal id", type: "text", hint: "Lowercase or CapitalisedWord, no spaces. Photos are linked to this id — avoid renaming it once photos exist." },
        { key: "visible", label: "Show this category on the site", type: "checkbox" },
      ],
      newItem: () => ({ key: "", label: "", visible: true }),
    },
    data.categories
  );

  const tabsBar = el("div", { class: "gallery-tabs" });
  const grid = el("div", { class: "media-grid" });
  const countLabel = el("p", { class: "field-hint" });
  let activeKey = data.categories[0]?.key || "";

  function imagesFor(key) {
    return data.images.filter((i) => i.category === key);
  }

  function paintTabs() {
    tabsBar.innerHTML = "";
    catNode.read().forEach((c) => {
      if (!c.key) return;
      tabsBar.appendChild(
        el("button", {
          class: `gallery-tab${c.key === activeKey ? " active" : ""}`,
          type: "button",
          onClick: () => {
            syncGridToData();
            activeKey = c.key;
            paintTabs();
            paintGrid();
          },
        }, [
          el("span", { text: c.label || c.key }),
          el("span", { class: "gallery-tab-count", text: String(imagesFor(c.key).length) }),
          c.visible === false ? el("span", { class: "gallery-tab-hidden", text: "hidden" }) : null,
        ])
      );
    });
  }

  function tile(item) {
    const media = normaliseMedia(item);
    const node = el("div", { class: "media-tile" }, [
      el("span", { class: "row-grip", html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>` }),
      isVideo(media.url)
        ? el("video", { src: previewUrl(media.url), muted: true, playsinline: true, preload: "metadata" })
        : el("img", { src: previewUrl(media.url), alt: "", loading: "lazy" }),
      iconButton("trash", "Remove photo", () => {
        node.remove();
        syncGridToData();
        paintTabs();
        paintCount();
        grid.dispatchEvent(new CustomEvent("field:change", { bubbles: true }));
      }),
    ]);
    node.read = () => ({ ...item, ...media, category: activeKey });
    return node;
  }

  function paintCount() {
    const n = grid.children.length;
    countLabel.textContent = `${n} photo${n === 1 ? "" : "s"} in this category`;
  }

  function paintGrid() {
    grid.innerHTML = "";
    imagesFor(activeKey).forEach((i) => grid.appendChild(tile(i)));
    paintCount();
  }

  // The grid only ever shows one category, so writing back means replacing that
  // category's slice while leaving every other category's photos untouched.
  function syncGridToData() {
    const current = Array.from(grid.children).map((t) => t.read());
    data.images = [...data.images.filter((i) => i.category !== activeKey), ...current];
  }

  enableReorder(grid);
  paintTabs();
  paintGrid();

  catNode.addEventListener("field:change", () => {
    const cats = catNode.read();
    if (!cats.some((c) => c.key === activeKey)) activeKey = cats[0]?.key || "";
    paintTabs();
    paintGrid();
  });

  const addBtn = el("button", {
    class: "btn btn-sm",
    type: "button",
    text: "+ Add photos",
    onClick: async (e) => {
      e.preventDefault();
      if (!activeKey) return alert("Add a category first.");
      const picked = await openMediaPicker({ multiple: true });
      if (!picked || !picked.length) return;
      picked.forEach((p) =>
        grid.appendChild(tile({ id: `g${Date.now()}${Math.random().toString(36).slice(2, 6)}`, category: activeKey, alt: "", ...p }))
      );
      syncGridToData();
      paintTabs();
      paintCount();
      grid.dispatchEvent(new CustomEvent("field:change", { bubbles: true }));
    },
  });

  const wrap = el("div", { class: "gallery-editor" }, [
    badgeNode,
    catNode,
    el("div", { class: "field" }, [
      el("div", { class: "field-head" }, [
        el("label", { class: "field-label", text: "Photos" }),
        el("p", { class: "field-hint", text: "Choose a category, then add or remove its photos. Drag the handle to reorder." }),
      ]),
      tabsBar,
      countLabel,
      grid,
      addBtn,
    ]),
  ]);

  wrap.read = () => {
    syncGridToData();
    const cats = catNode.read().filter((c) => c.key);
    const validKeys = new Set(cats.map((c) => c.key));
    return {
      badgeText: badgeNode.read(),
      categories: cats,
      images: data.images.filter((i) => validKeys.has(i.category) && i.url),
    };
  };
  return wrap;
}
