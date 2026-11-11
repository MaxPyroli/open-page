import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  viewer: $("viewer"),
  pages: $("pages"),
  welcome: $("welcome"),
  frame: $<HTMLIFrameElement>("html-frame"),
  error: $("error"),
  pageInput: $<HTMLInputElement>("page-input"),
  pageTotal: $("page-total"),
  zoomLabel: $("zoom-label"),
  searchInput: $<HTMLInputElement>("search-input"),
  searchCount: $("search-count"),
  theme: $("btn-theme"),
};

// ---------------------------------------------------------------- état

interface PageView {
  index: number; // 1-based
  el: HTMLDivElement;
  page: PDFPageProxy | null;
  baseWidth: number; // largeur à l'échelle 1
  baseHeight: number;
  rendered: boolean;
  renderToken: number;
  renderTask: RenderTask | null;
}

let pdf: PDFDocumentProxy | null = null;
let pdfTask: PDFDocumentLoadingTask | null = null;
let views: PageView[] = [];
let scale = 1;
let fitWidth = true;
let observer: IntersectionObserver | null = null;
let loadId = 0; // invalide les chargements obsolètes

// ---------------------------------------------------------------- utilitaires

function showError(msg: string) {
  els.error.textContent = msg;
  els.error.hidden = false;
  window.setTimeout(() => (els.error.hidden = true), 6000);
}

function setMode(mode: "none" | "pdf" | "html") {
  document.body.classList.remove("mode-none", "mode-pdf", "mode-html");
  document.body.classList.add(`mode-${mode}`);
  els.welcome.hidden = mode !== "none";
  els.pages.hidden = mode !== "pdf";
  els.frame.hidden = mode !== "html";
  els.viewer.style.overflow = mode === "html" ? "hidden" : "auto";
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

// ---------------------------------------------------------------- ouverture

async function openPath(path: string) {
  const lower = path.toLowerCase();
  try {
    if (lower.endsWith(".pdf")) {
      await openPdf(path);
    } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      await openHtml(path);
    } else {
      showError("Format non pris en charge (PDF ou HTML uniquement).");
      return;
    }
    await getCurrentWindow().setTitle(`${fileName(path)} – Open Page`);
  } catch (e) {
    showError(`Impossible d'ouvrir ${fileName(path)} : ${String((e as Error)?.message ?? e)}`);
  }
}

async function chooseFile() {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF et HTML", extensions: ["pdf", "html", "htm"] }],
  });
  if (typeof picked === "string") await openPath(picked);
}

/**
 * URL `asset:` d'un fichier local, avec les `/` du chemin conservés.
 * (`convertFileSrc` encode tout le chemin, `/` compris : le navigateur ne retrouve alors
 * plus le dossier du fichier et les images / CSS relatifs de la page HTML sont cassés.)
 */
function assetUrl(path: string): string {
  const base = convertFileSrc(""); // ex. "asset://localhost/" ou "http://asset.localhost/"
  return base + path.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
}

async function openHtml(path: string) {
  closePdf();
  await invoke("allow_dir", { path });
  setMode("html");
  els.frame.src = assetUrl(path);
}

async function openPdf(path: string) {
  const myLoad = ++loadId;
  const bytes = new Uint8Array(await invoke<ArrayBuffer>("read_file", { path }));
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/standard_fonts/",
  });
  const doc = await task.promise;
  if (myLoad !== loadId) {
    void task.destroy();
    return;
  }

  closePdf();
  els.frame.removeAttribute("src");
  pdf = doc;
  pdfTask = task;
  setMode("pdf");
  els.pageTotal.textContent = `/ ${doc.numPages}`;
  els.pageInput.max = String(doc.numPages);
  els.pageInput.value = "1";
  els.viewer.scrollTop = 0;
  clearSearch();

  const first = await doc.getPage(1);
  if (myLoad !== loadId) return;
  const vp = first.getViewport({ scale: 1 });
  fitWidth = true;
  views = [];
  els.pages.replaceChildren();
  observer?.disconnect();
  observer = new IntersectionObserver(onIntersect, { root: els.viewer, rootMargin: "1500px 0px" });

  for (let i = 1; i <= doc.numPages; i++) {
    const el = document.createElement("div");
    el.className = "page";
    el.dataset.page = String(i);
    const v: PageView = {
      index: i,
      el,
      page: i === 1 ? first : null,
      baseWidth: vp.width,
      baseHeight: vp.height,
      rendered: false,
      renderToken: 0,
      renderTask: null,
    };
    views.push(v);
    els.pages.appendChild(el);
  }
  applyScale(computeFitScale(), undefined, 1); // pages encore sans hauteur : on force la page 1
  views.forEach((v) => observer!.observe(v.el));
  void measureAllPages(doc, myLoad);
}

function closePdf() {
  observer?.disconnect();
  views.forEach((v) => v.renderTask?.cancel());
  views = [];
  els.pages.replaceChildren();
  if (pdfTask) void pdfTask.destroy();
  pdfTask = null;
  pdf = null;
}

/** Récupère la vraie taille de chaque page en arrière-plan (documents à formats mixtes). */
async function measureAllPages(doc: PDFDocumentProxy, myLoad: number) {
  for (const v of views) {
    if (myLoad !== loadId) return;
    if (!v.page) v.page = await doc.getPage(v.index);
    const vp = v.page.getViewport({ scale: 1 });
    if (vp.width !== v.baseWidth || vp.height !== v.baseHeight) {
      v.baseWidth = vp.width;
      v.baseHeight = vp.height;
      sizePage(v);
    }
  }
}

// ---------------------------------------------------------------- mise en page / zoom

function sizePage(v: PageView) {
  v.el.style.width = `${Math.floor(v.baseWidth * scale)}px`;
  v.el.style.height = `${Math.floor(v.baseHeight * scale)}px`;
}

function computeFitScale() {
  const maxW = Math.max(...views.map((v) => v.baseWidth), 1);
  return Math.max(0.1, (els.viewer.clientWidth - 32) / maxW);
}

interface Anchor { cx: number; cy: number; vx: number; vy: number }

/** Change l'échelle. Avec `anchor`, le point sous le curseur reste en place. */
function applyScale(next: number, anchor?: Anchor, forcePage?: number) {
  const page = forcePage ?? currentPage();
  const old = scale;
  scale = Math.min(5, Math.max(0.1, next));
  els.zoomLabel.textContent = `${Math.round(scale * 100)} %`;
  els.pages.style.setProperty("--total-scale-factor", String(scale));
  els.pages.style.setProperty("--scale-factor", String(scale));
  for (const v of views) {
    cancelRender(v);
    sizePage(v);
  }
  if (anchor) {
    const r = scale / old;
    els.viewer.scrollLeft = anchor.cx * r - anchor.vx;
    els.viewer.scrollTop = anchor.cy * r - anchor.vy;
  } else {
    views[page - 1]?.el.scrollIntoView({ block: "start" });
  }
  // Re-déclenche le rendu des pages visibles.
  observer?.disconnect();
  views.forEach((v) => observer?.observe(v.el));
}

/**
 * Zoom fluide centré sur un point (trackpad, pincement, Ctrl+molette).
 * Pendant le geste on met simplement la zone à l'échelle (CSS, instantané) ;
 * les pages ne sont re-rendues nettes qu'une fois le geste terminé.
 */
let pinch: { factor: number; anchor: Anchor; timer: number } | null = null;

function zoomAt(factor: number, clientX: number, clientY: number, immediate = false) {
  if (!pdf) return;
  fitWidth = false;
  if (!pinch) {
    const vr = els.viewer.getBoundingClientRect();
    const vx = clientX - vr.left;
    const vy = clientY - vr.top;
    const cx = els.viewer.scrollLeft + vx;
    const cy = els.viewer.scrollTop + vy;
    pinch = { factor: 1, anchor: { cx, cy, vx, vy }, timer: 0 };
    els.pages.style.transformOrigin = `${cx - els.pages.offsetLeft}px ${cy - els.pages.offsetTop}px`;
  }
  pinch.factor = Math.min(5 / scale, Math.max(0.1 / scale, pinch.factor * factor));
  els.pages.style.transform = `scale(${pinch.factor})`;
  els.zoomLabel.textContent = `${Math.round(scale * pinch.factor * 100)} %`;
  window.clearTimeout(pinch.timer);
  if (immediate) commitZoom();
  else pinch.timer = window.setTimeout(commitZoom, 140);
}

function commitZoom() {
  if (!pinch) return;
  const p = pinch;
  pinch = null;
  window.clearTimeout(p.timer);
  els.pages.style.transform = "";
  els.pages.style.transformOrigin = "";
  applyScale(scale * p.factor, p.anchor);
}

/** Zoom des boutons / raccourcis : centré sur le milieu de la zone visible. */
function zoomBy(factor: number) {
  const r = els.viewer.getBoundingClientRect();
  zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2, true);
}

// ---------------------------------------------------------------- rendu paresseux

function onIntersect(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    const v = views[Number((entry.target as HTMLElement).dataset.page) - 1];
    if (!v) continue;
    if (entry.isIntersecting) void renderPage(v);
    else cancelRender(v);
  }
}

function cancelRender(v: PageView) {
  v.renderToken++;
  v.renderTask?.cancel();
  v.renderTask = null;
  if (v.rendered || v.el.firstChild) v.el.replaceChildren();
  v.rendered = false;
}

async function renderPage(v: PageView) {
  if (!pdf || v.rendered) return;
  const token = ++v.renderToken;
  const doc = pdf;
  v.rendered = true;
  try {
    if (!v.page) v.page = await doc.getPage(v.index);
    if (token !== v.renderToken) return;

    const viewport = v.page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    const ctx = canvas.getContext("2d")!;

    const task = v.page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });
    v.renderTask = task;
    await task.promise;
    if (token !== v.renderToken) return;

    const textDiv = document.createElement("div");
    textDiv.className = "textLayer";
    v.el.replaceChildren(canvas, textDiv);
    const textLayer = new pdfjs.TextLayer({
      textContentSource: v.page.streamTextContent(),
      container: textDiv,
      viewport,
    });
    await textLayer.render();
    if (token === v.renderToken) highlightPage(v);
  } catch (e) {
    if ((e as Error)?.name === "RenderingCancelledException") return;
    v.rendered = false;
    console.error(e);
  }
}

// ---------------------------------------------------------------- navigation

function currentPage(): number {
  if (!views.length) return 1;
  const top = els.viewer.getBoundingClientRect().top + 8;
  let best = 1;
  for (const v of views) {
    const r = v.el.getBoundingClientRect();
    if (r.bottom > top + 20) {
      best = v.index;
      break;
    }
  }
  return best;
}

function goToPage(n: number) {
  if (!pdf) return;
  const i = Math.min(pdf.numPages, Math.max(1, Math.round(n)));
  views[i - 1]?.el.scrollIntoView({ block: "start" });
  els.pageInput.value = String(i);
}

let scrollQueued = false;
els.viewer.addEventListener("scroll", () => {
  if (scrollQueued || !pdf) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    if (document.activeElement !== els.pageInput) els.pageInput.value = String(currentPage());
  });
});

// ---------------------------------------------------------------- recherche

interface Hit { page: number; occurrence: number }
let hits: Hit[] = [];
let hitIndex = -1;
let query = "";
let searchToken = 0;

function clearSearch() {
  searchToken++;
  hits = [];
  hitIndex = -1;
  query = "";
  els.searchCount.textContent = "";
  els.searchInput.value = "";
}

async function runSearch(text: string) {
  const token = ++searchToken;
  query = text.trim().toLowerCase();
  hits = [];
  hitIndex = -1;
  els.searchCount.textContent = "";
  views.forEach((v) => v.rendered && highlightPage(v));
  if (!pdf || !query) return;
  const doc = pdf;
  els.searchCount.textContent = "…";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    if (token !== searchToken) return;
    let occurrence = 0;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      let from = 0;
      const s = item.str.toLowerCase();
      while ((from = s.indexOf(query, from)) !== -1) {
        hits.push({ page: p, occurrence: occurrence++ });
        from += query.length;
      }
    }
  }
  els.searchCount.textContent = hits.length ? `0 / ${hits.length}` : "0";
  views.forEach((v) => v.rendered && highlightPage(v));
  if (hits.length) stepHit(1);
}

function stepHit(dir: 1 | -1) {
  if (!hits.length) return;
  hitIndex = (hitIndex + dir + hits.length) % hits.length;
  els.searchCount.textContent = `${hitIndex + 1} / ${hits.length}`;
  const hit = hits[hitIndex];
  goToPage(hit.page);
  views.forEach((v) => v.rendered && highlightPage(v));
  requestAnimationFrame(() =>
    views[hit.page - 1]?.el.querySelector("span.hit.current")?.scrollIntoView({ block: "center" }),
  );
}

/** Surligne les segments de texte contenant la requête sur une page rendue. */
function highlightPage(v: PageView) {
  const spans = v.el.querySelectorAll<HTMLSpanElement>(".textLayer span:not(.markedContent)");
  let occurrence = 0;
  const current = hits[hitIndex];
  spans.forEach((span) => {
    span.classList.remove("hit", "current");
    if (!query) return;
    const s = (span.textContent ?? "").toLowerCase();
    let from = 0;
    let found = false;
    let isCurrent = false;
    while ((from = s.indexOf(query, from)) !== -1) {
      found = true;
      if (current && current.page === v.index && current.occurrence === occurrence) isCurrent = true;
      occurrence++;
      from += query.length;
    }
    if (found) span.classList.add("hit");
    if (isCurrent) span.classList.add("current");
  });
}

// ---------------------------------------------------------------- événements UI

$("btn-open").addEventListener("click", chooseFile);
$("btn-open-welcome").addEventListener("click", chooseFile);
$("btn-prev").addEventListener("click", () => goToPage(currentPage() - 1));
$("btn-next").addEventListener("click", () => goToPage(currentPage() + 1));
els.pageInput.addEventListener("change", () => goToPage(Number(els.pageInput.value) || 1));
$("btn-zoom-in").addEventListener("click", () => zoomBy(1.2));
$("btn-zoom-out").addEventListener("click", () => zoomBy(1 / 1.2));
$("btn-fit").addEventListener("click", () => {
  fitWidth = true;
  if (views.length) applyScale(computeFitScale());
});
$("btn-search-next").addEventListener("click", () => stepHit(1));
$("btn-search-prev").addEventListener("click", () => stepHit(-1));

let searchTimer = 0;
els.searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void runSearch(els.searchInput.value), 250);
});
els.searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") stepHit(e.shiftKey ? -1 : 1);
  if (e.key === "Escape") {
    clearSearch();
    els.searchInput.blur();
    views.forEach((v) => v.rendered && highlightPage(v));
  }
});

// Thème : Auto (suit le système) → Clair → Sombre. « Sombre » assombrit aussi les pages.
type Theme = "auto" | "light" | "dark";
const THEMES: Theme[] = ["auto", "light", "dark"];
const THEME_LABEL: Record<Theme, string> = { auto: "Thème : Auto", light: "Thème : Clair", dark: "Thème : Sombre" };
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
let theme: Theme = "auto";

function applyTheme(t: Theme, save = true) {
  theme = t;
  const root = document.documentElement;
  if (t === "auto") root.removeAttribute("data-theme");
  else root.dataset.theme = t;
  document.body.classList.toggle("night", t === "dark" || (t === "auto" && systemDark.matches));
  els.theme.textContent = THEME_LABEL[t];
  if (save) {
    try { localStorage.setItem("theme", t); } catch { /* ignoré */ }
  }
}
els.theme.addEventListener("click", () => applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]));
systemDark.addEventListener("change", () => applyTheme(theme, false));

window.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); void chooseFile(); }
  else if (mod && e.key.toLowerCase() === "f" && pdf) { e.preventDefault(); els.searchInput.focus(); els.searchInput.select(); }
  else if (mod && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoomBy(1.2); }
  else if (mod && e.key === "-") { e.preventDefault(); zoomBy(1 / 1.2); }
  else if (mod && e.key === "0") { e.preventDefault(); fitWidth = true; if (views.length) applyScale(computeFitScale()); }
});

els.viewer.addEventListener("wheel", (e) => {
  if (!e.ctrlKey || !pdf) return;
  e.preventDefault();
  // Un cran de molette ≈ ±22 % ; un pincement de trackpad envoie de petits deltas → zoom progressif.
  const unit = e.deltaMode === 1 ? 33 : 1;
  zoomAt(Math.exp(-e.deltaY * unit * 0.0025), e.clientX, e.clientY);
}, { passive: false });

// Pincement tactile à deux doigts.
let lastPinchDist = 0;
const touchDist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
els.viewer.addEventListener("touchstart", (e) => {
  lastPinchDist = e.touches.length === 2 ? touchDist(e.touches) : 0;
}, { passive: true });
els.viewer.addEventListener("touchmove", (e) => {
  if (e.touches.length !== 2 || !pdf) return;
  e.preventDefault();
  const d = touchDist(e.touches);
  if (lastPinchDist > 0) {
    zoomAt(d / lastPinchDist, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
  }
  lastPinchDist = d;
}, { passive: false });
els.viewer.addEventListener("touchend", () => { lastPinchDist = 0; }, { passive: true });

let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => { if (fitWidth && views.length) applyScale(computeFitScale()); }, 120);
});

// ---------------------------------------------------------------- à propos

const about = $<HTMLDialogElement>("about");
const privacyFrame = $<HTMLIFrameElement>("privacy-frame");
const aboutMain = $("about-main");
const privacyBtn = $("btn-privacy");

function showPrivacy(on: boolean) {
  privacyFrame.hidden = !on;
  aboutMain.hidden = on;
  if (on) privacyFrame.src = "/confidentialite.html";
  privacyBtn.textContent = on ? "Retour" : "Confidentialité";
}

$("btn-about").addEventListener("click", async () => {
  showPrivacy(false);
  try { $("about-version").textContent = `Version ${await getVersion()}`; } catch { /* hors Tauri */ }
  about.showModal();
});
privacyBtn.addEventListener("click", () => showPrivacy(Boolean(privacyFrame.hidden)));
$("btn-about-close").addEventListener("click", () => about.close());
about.addEventListener("click", (e) => { if (e.target === about) about.close(); });

// ---------------------------------------------------------------- démarrage

window.addEventListener("DOMContentLoaded", async () => {
  setMode("none");
  let saved: string | null = null;
  try { saved = localStorage.getItem("theme"); } catch { /* ignoré */ }
  applyTheme(THEMES.includes(saved as Theme) ? (saved as Theme) : "auto", false);

  await getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === "enter" || p.type === "over") document.body.classList.add("dragging");
    else document.body.classList.remove("dragging");
    if (p.type === "drop" && p.paths.length) void openPath(p.paths[0]);
  });

  const initial = await invoke<string | null>("initial_file");
  if (initial) await openPath(initial);
});
