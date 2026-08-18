import { SCHEMA, SECTION_BY_ID } from "./schema.js";
import { el, renderField } from "./fields.js";
import { renderGalleryEditor } from "./gallery-editor.js";
import { renderAnalytics } from "./analytics-dashboard.js";
import { loadContent, saveSection, seedDefaults, defaults } from "./content-repo.js";
import { signIn, signOut, onAuthChange, friendlyAuthError } from "./auth.js";

const view = {
  login: document.getElementById("loginView"),
  app: document.getElementById("appView"),
};
const nav = document.getElementById("nav");
const panel = document.getElementById("panel");
const userEmail = document.getElementById("userEmail");

let content = null;
let activeId = "dashboard";
let editorNode = null;
let dirty = false;
let saveBar = null;

// One delegated listener for the whole app: renderPanel() runs on every section switch,
// so registering there would stack up a listener per visit, each holding a detached bar.
panel.addEventListener("field:change", () => {
  dirty = true;
  if (saveBar) saveBar.hidden = false;
});

/* ---------------- toasts ---------------- */

function toast(message, kind = "ok") {
  const node = el("div", { class: `toast toast-${kind}`, text: message });
  document.getElementById("toasts").appendChild(node);
  setTimeout(() => node.classList.add("out"), 2600);
  setTimeout(() => node.remove(), 3100);
}

/* ---------------- login ---------------- */

const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const button = loginForm.querySelector("button");
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    await signIn(loginForm.email.value.trim(), loginForm.password.value);
  } catch (err) {
    loginError.textContent = friendlyAuthError(err.message);
    loginError.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

document.getElementById("signOutBtn").addEventListener("click", async () => {
  if (dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
  dirty = false;
  await signOut();
});

/* ---------------- navigation ---------------- */

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", group: "Insights" },
  ...SCHEMA.map((s) => ({ id: s.id, label: s.label, group: "Page content" })),
];

function buildNav() {
  nav.innerHTML = "";
  let lastGroup = null;
  for (const item of NAV_ITEMS) {
    if (item.group !== lastGroup) {
      nav.appendChild(el("p", { class: "nav-group", text: item.group }));
      lastGroup = item.group;
    }
    nav.appendChild(
      el("button", {
        class: `nav-item${item.id === activeId ? " active" : ""}`,
        type: "button",
        "data-id": item.id,
        text: item.label,
        onClick: () => go(item.id),
      })
    );
  }
}

function go(id) {
  if (dirty && !confirm("You have unsaved changes. Leave this section?")) return;
  dirty = false;
  activeId = id;
  buildNav();
  renderPanel();
  document.querySelector(".main").scrollTo({ top: 0 });
  if (window.innerWidth < 900) document.body.classList.remove("nav-open");
}

/* ---------------- panels ---------------- */

function renderPanel() {
  panel.innerHTML = "";
  editorNode = null;
  saveBar = null;

  if (activeId === "dashboard") {
    panel.appendChild(
      el("header", { class: "panel-head" }, [
        el("div", {}, [
          el("h2", { text: "Dashboard" }),
          el("p", { class: "panel-blurb", text: "How many people visited and what they clicked. Counts are grouped by India time." }),
        ]),
      ])
    );
    panel.appendChild(renderAnalytics());
    return;
  }

  const section = SECTION_BY_ID[activeId];
  if (!section) return;

  const saveBtn = el("button", { class: "btn btn-primary", type: "button", text: "Save changes", onClick: save });
  const resetBtn = el("button", {
    class: "btn btn-ghost",
    type: "button",
    text: "Reset section",
    title: "Put this section back to the wording and photos the site launched with",
    onClick: resetSection,
  });

  panel.appendChild(
    el("header", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", { text: section.label }),
        section.blurb ? el("p", { class: "panel-blurb", text: section.blurb }) : null,
      ]),
      el("div", { class: "btn-row" }, [resetBtn, saveBtn]),
    ])
  );

  const body = el("div", { class: "panel-body" });
  editorNode = buildEditor(section, content[section.id]);
  body.appendChild(editorNode);
  panel.appendChild(body);

  saveBar = el("div", { class: "save-bar", hidden: true }, [
    el("span", { text: "You have unsaved changes" }),
    el("button", { class: "btn btn-primary btn-sm", type: "button", text: "Save changes", onClick: save }),
  ]);
  panel.appendChild(saveBar);
}

function buildEditor(section, value) {
  if (section.type === "gallery") return renderGalleryEditor(value);
  if (section.type === "repeater" || section.type === "media-list") {
    return renderField({ ...section, label: null }, value);
  }
  const nodes = section.fields.map((f) => renderField(f, value?.[f.key]));
  const wrap = el("div", { class: "fields" }, nodes);
  wrap.read = () => Object.fromEntries(section.fields.map((f, i) => [f.key, nodes[i].read()]));
  return wrap;
}

async function save() {
  const section = SECTION_BY_ID[activeId];
  if (!section || !editorNode) return;
  const value = editorNode.read();
  try {
    await saveSection(section.id, value);
    content[section.id] = value;
    dirty = false;
    if (saveBar) saveBar.hidden = true;
    toast("Saved. Your website is updated.");
  } catch (err) {
    toast(`Could not save: ${err.code || err.message}`, "error");
  }
}

async function resetSection() {
  const section = SECTION_BY_ID[activeId];
  if (!confirm(`Put “${section.label}” back to the original wording and photos? Your current changes to this section will be lost.`)) return;
  content[section.id] = defaults()[section.id];
  try {
    await saveSection(section.id, content[section.id]);
    renderPanel();
    toast("Section reset to the original version.");
  } catch (err) {
    toast(`Could not reset: ${err.code || err.message}`, "error");
  }
}

/* ---------------- first-run seeding ---------------- */

function showSeedPrompt() {
  const banner = el("div", { class: "seed-banner" }, [
    el("div", {}, [
      el("strong", { text: "One-time setup" }),
      el("p", { text: "Your website content hasn't been copied into the editor yet. Do this once and every section will open with the wording and photos that are on the site right now." }),
    ]),
    el("button", {
      class: "btn btn-primary",
      type: "button",
      text: "Copy website content in",
      onClick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = "Copying…";
        try {
          await seedDefaults();
          content = await loadContent({ force: true });
          banner.remove();
          renderPanel();
          toast("Done — you can start editing.");
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Copy website content in";
          toast(`Failed: ${err.code || err.message}`, "error");
        }
      },
    }),
  ]);
  document.getElementById("bannerHost").appendChild(banner);
}

/* ---------------- boot ---------------- */

window.addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault();
});

document.getElementById("navToggle").addEventListener("click", () => {
  document.body.classList.toggle("nav-open");
});
document.querySelector(".nav-scrim").addEventListener("click", () => {
  document.body.classList.remove("nav-open");
});

async function boot() {
  await onAuthChange(async (user) => {

    if (!user) {
      view.login.hidden = false;
      view.app.hidden = true;
      return;
    }
    view.login.hidden = true;
    view.app.hidden = false;
    userEmail.textContent = user.email;

    try {
      content = await loadContent({ force: true });
      if (!content.__seeded) showSeedPrompt();
    } catch (err) {
      content = defaults();
      toast(`Could not read saved content: ${err.code || err.message}`, "error");
    }
    buildNav();
    renderPanel();
  });
}

boot();
