// Shared helpers: DOM builder, content loading, progress storage, page chrome.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

async function fetchOk(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res;
}

export const loadJSON = async (path) => (await fetchOk(path)).json();
export const loadText = async (path) => (await fetchOk(path)).text();

export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Progress is a per-browser convenience; the site works if storage is blocked.
// q[id] = { a: attempts, c: correct count, last: was the latest answer correct }
const KEY = "theory-progress-v2";
const OLD_KEY = "theory-progress-v1";
const empty = () => ({ q: {}, s: {}, exams: [], best: {}, lessons: {} });

export function getProgress() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return { ...empty(), ...JSON.parse(stored) };
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? "null");
    if (old) {
      const migrated = empty();
      for (const [id, ok] of Object.entries(old.answered ?? {}))
        migrated.q[id] = { a: 1, c: ok ? 1 : 0, last: ok };
      migrated.exams = old.exams ?? [];
      return migrated;
    }
  } catch {
    /* fall through to empty */
  }
  return empty();
}

function saveProgress(progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage unavailable */
  }
}

function bump(map, id, ok) {
  const prev = map[id] ?? { a: 0, c: 0 };
  map[id] = { a: prev.a + 1, c: prev.c + (ok ? 1 : 0), last: ok };
}

export function recordAnswer(questionId, ok) {
  const progress = getProgress();
  bump(progress.q, questionId, ok);
  saveProgress(progress);
}

export function recordSign(signId, ok) {
  const progress = getProgress();
  bump(progress.s, signId, ok);
  saveProgress(progress);
}

// lessons[topicId] = { read: finished the lesson steps, passed: passed the comprehension check }
export function recordLesson(topicId, patch) {
  const progress = getProgress();
  progress.lessons[topicId] = { ...progress.lessons[topicId], ...patch };
  saveProgress(progress);
}

export function recordExam(result) {
  const progress = getProgress();
  progress.exams = [...progress.exams.slice(-9), result];
  saveProgress(progress);
}

// Returns true when the score is a new personal best for this game mode.
export function recordBest(mode, score) {
  const progress = getProgress();
  const isBest = score > (progress.best[mode] ?? 0);
  if (isBest) {
    progress.best[mode] = score;
    saveProgress(progress);
  }
  return isBest;
}

export function resetProgress() {
  saveProgress(empty());
}

// Backup / restore, so progress can move between devices (storage is per browser).
export function exportProgress() {
  return JSON.stringify({ app: "driving-theory", version: 2, savedAt: Date.now(), progress: getProgress() });
}

export function importProgress(text) {
  const data = JSON.parse(text);
  const p = data?.progress;
  if (data?.app !== "driving-theory" || !p || typeof p.q !== "object" || typeof p.s !== "object" || !Array.isArray(p.exams))
    throw new Error("הקובץ לא נראה כמו גיבוי של האתר הזה");
  saveProgress({ ...empty(), ...p });
}

// "Mastered" = answered correctly at least twice AND the latest answer was correct.
export const isMastered = (entry) => Boolean(entry && entry.last && entry.c >= 2);

export function statsFor(questions, progress = getProgress()) {
  const seen = questions.filter((q) => progress.q[q.id]);
  const mastered = questions.filter((q) => isMastered(progress.q[q.id]));
  const attempts = seen.reduce((n, q) => n + progress.q[q.id].a, 0);
  const correct = seen.reduce((n, q) => n + progress.q[q.id].c, 0);
  return {
    total: questions.length,
    seen: seen.length,
    mastered: mastered.length,
    weak: seen.filter((q) => !progress.q[q.id].last).length,
    masteryPct: questions.length ? Math.round((mastered.length / questions.length) * 100) : 0,
    accuracyPct: attempts ? Math.round((correct / attempts) * 100) : null,
  };
}

export function readinessLabel(pct) {
  if (pct >= 90) return "מוכן למבחן";
  if (pct >= 70) return "קרוב מאוד";
  if (pct >= 40) return "בדרך הנכונה";
  if (pct > 0) return "בתחילת הדרך";
  return "עוד לא התחלת";
}

// A sign can have several pictures (variants shown side by side in the official table).
export function signFace(s) {
  return el("span", { class: "sign-imgs" },
    s.images.map((src) => el("img", { src, alt: `תמרור ${s.number}`, loading: "lazy" })));
}

const NAV = [
  ["index.html", "ראשי"],
  ["learn.html", "חומר לימוד"],
  ["signs.html", "תמרורים"],
  ["signs-quiz.html", "מבחן תמרורים"],
  ["game.html", "משחק"],
  ["quiz.html?mode=exam", "מבחן"],
];

export async function renderChrome(active) {
  const site = await loadJSON("content/site.json");
  document.title = `${document.title} | ${site.name}`;
  const header = el(
    "header",
    { class: "site-header" },
    el(
      "div",
      { class: "wrap bar" },
      el("a", { class: "brand", href: "index.html" }, site.name),
      el(
        "nav",
        { "aria-label": "ראשי" },
        NAV.map(([href, label]) =>
          el("a", { href, "aria-current": href.startsWith(active) ? "page" : false }, label),
        ),
      ),
    ),
  );
  const footer = el("footer", { class: "site-footer" }, el("div", { class: "wrap" }, site.footer));
  document.body.prepend(header);
  document.body.append(footer);
  return site;
}
