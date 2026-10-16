import { el, loadJSON, shuffle, signFace, recordSign, getProgress, isMastered, renderChrome } from "./common.js";

const site = await renderChrome("signs-quiz.html");
const signs = await loadJSON("content/signs.json");
const stage = document.getElementById("stage");

// The table was extracted from a PDF, so a few titles come out with the brackets reversed:
// "מעבר עילי)עם מדרגות(" becomes "מעבר עילי (עם מדרגות)". Display only; the data file is untouched.
const fixBrackets = (text) => text.replace(/\)([^()]*)\(/g, " ($1)").replace(/\s{2,}/g, " ").trim();
const label = (s) => fixBrackets(s.title);
const meaningOf = (s) => fixBrackets(s.meaning);

const countBy = (fn) => signs.reduce((m, s) => m.set(fn(s), (m.get(fn(s)) ?? 0) + 1), new Map());
const titleCount = countBy(label);
const meaningCount = countBy(meaningOf);
// A sign can be asked "from its meaning" only when nothing else shares that meaning or title.
const hasUniqueMeaning = (s) => titleCount.get(label(s)) === 1 && meaningCount.get(meaningOf(s)) === 1;

const parts = [...new Map(signs.map((s) => [s.part, s.category])).entries()].sort((a, b) => a[0] - b[0]);
const LENGTHS = [10, 20, 30, 0]; // 0 = every sign in the chosen part
const DIRECTIONS = [
  ["sign", "רואים תמרור, בוחרים פירוש"],
  ["meaning", "רואים פירוש, בוחרים תמרור"],
  ["mixed", "מעורב"],
];

const initialPart = Number(new URLSearchParams(location.search).get("part"));
const setup = {
  part: parts.some(([p]) => p === initialPart) ? initialPart : 0,
  length: 20,
  direction: "sign",
};

let keyHandler = null;
const bindKeys = (fn) => {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = fn;
  if (fn) document.addEventListener("keydown", fn);
};

const poolFor = (part) => signs.filter((s) => !part || s.part === part);
const allowedMistakes = (n) => Math.floor((n * site.exam.maxMistakes) / site.exam.questions);
const mistakesText = (n) => (n === 0 ? "בלי טעויות" : n === 1 ? "עד טעות אחת" : `עד ${n} טעויות`);

function chipGroup(title, items, current, onPick) {
  const buttons = items.map(([value, text]) =>
    el("button", { class: "chip", type: "button", "aria-pressed": value === current, onclick: () => onPick(value) }, text));
  return el("div", { class: "setup-group" },
    el("h2", {}, title),
    el("div", { class: "filters", role: "group", "aria-label": title }, buttons),
  );
}

function showSetup() {
  bindKeys(null);
  const pool = poolFor(setup.part);
  const known = getProgress().s;
  const mastered = pool.filter((s) => isMastered(known[s.number])).length;
  const count = setup.length ? Math.min(setup.length, pool.length) : pool.length;
  const rule = allowedMistakes(count);

  const redraw = (patch) => { Object.assign(setup, patch); showSetup(); };
  stage.replaceChildren(
    el("p", { class: "hint" },
      "המבחן בודק את כל לוח התמרורים הרשמי. אפשר לבחור חלק אחד בלוח או את כולם, וכל תשובה נספרת גם בכמה אתה קרוב לידע."),
    chipGroup("חלק בלוח", [[0, "כל התמרורים"], ...parts], setup.part, (part) => redraw({ part })),
    chipGroup("מספר שאלות", LENGTHS.map((n) => [n, n ? String(n) : "כל התמרורים בחלק"]), setup.length, (length) => redraw({ length })),
    chipGroup("סוג שאלה", DIRECTIONS, setup.direction, (direction) => redraw({ direction })),
    el("p", { class: "hint" },
      `${count} שאלות מתוך ${pool.length} תמרורים (${mastered} בשליטה). עוברים עם ${mistakesText(rule)}.`),
    el("div", { class: "actions" },
      el("button", { class: "btn", type: "button", onclick: () => start(shuffle(pool).slice(0, count)) }, "להתחיל מבחן"),
      el("a", { class: "btn ghost", href: "signs.html" }, "ללוח התמרורים")),
  );
}

// Wrong answers come from the same part when possible (they look alike), then from anywhere.
function distractors(source, accept, want = 3) {
  const out = [];
  const used = new Set([label(source)]);
  for (const list of [signs.filter((s) => s.part === source.part), signs]) {
    for (const s of shuffle(list)) {
      if (out.length >= want) return out;
      if (s === source || used.has(label(s)) || !accept(s)) continue;
      used.add(label(s));
      out.push(s);
    }
  }
  return out;
}

function makeQuestion(source, direction) {
  const reverse = (direction === "meaning" || (direction === "mixed" && Math.random() < 0.5)) && hasUniqueMeaning(source);
  if (reverse) {
    const others = distractors(source, (s) => hasUniqueMeaning(s) && meaningOf(s) !== meaningOf(source));
    const options = shuffle([source, ...others]);
    return {
      source,
      title: "איזה תמרור זה?",
      prompt: el("p", { class: "prompt-text" }, meaningOf(source)),
      options: options.map((s) => ({ node: signFace(s), isImage: true })),
      correct: options.indexOf(source),
    };
  }
  const options = shuffle([source, ...distractors(source, () => true)]);
  return {
    source,
    title: "מה פירוש התמרור?",
    prompt: el("div", { class: "game-sign" }, signFace(source)),
    options: options.map((s) => ({ node: label(s), isImage: false })),
    correct: options.indexOf(source),
  };
}

function start(queue) {
  const total = queue.length;
  const wrong = [];
  let index = 0;

  function ask() {
    const q = makeQuestion(queue[index], setup.direction);
    const feedback = el("div", { class: "feedback", role: "status" });
    const next = el("button", { class: "btn", type: "button", hidden: true, onclick: advance },
      index === total - 1 ? "לסיום" : "לשאלה הבאה");
    let locked = false;

    const buttons = q.options.map((o, i) =>
      el("button", { class: o.isImage ? "answer img" : "answer", type: "button", onclick: () => choose(i) },
        el("span", { class: "key" }, i + 1), o.node));

    function choose(i) {
      if (locked) return;
      locked = true;
      const ok = i === q.correct;
      recordSign(q.source.number, ok);
      if (!ok) wrong.push(q.source);
      buttons.forEach((b, n) => {
        b.disabled = true;
        if (n === q.correct) b.classList.add("correct");
        else if (n === i) b.classList.add("wrong");
      });
      const full = meaningOf(q.source);
      feedback.replaceChildren(
        el("strong", {}, ok ? "נכון. " : "לא נכון. "),
        ok ? (full !== label(q.source) ? full : "") : `תמרור ${q.source.number}: ${full}`,
        q.source.validity && el("small", { class: "source" }, `בתוקף: ${q.source.validity}`),
      );
      feedback.className = ok ? "feedback ok" : "feedback bad";
      next.hidden = false;
      next.focus();
    }

    bindKeys((e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= buttons.length) choose(n - 1);
    });

    stage.replaceChildren(
      el("p", { class: "progress" }, `שאלה ${index + 1} מתוך ${total}`),
      el("div", { class: "meter small", "aria-hidden": "true" }, el("span", { style: `width:${(index / total) * 100}%` })),
      el("h2", { class: "question" }, q.title),
      q.prompt,
      el("div", { class: q.options[0].isImage ? "answers imgs" : "answers" }, buttons),
      feedback,
      next,
    );
  }

  function advance() {
    if (++index >= total) finish();
    else ask();
  }

  function finish() {
    bindKeys(null);
    const allowed = allowedMistakes(total);
    const passed = wrong.length <= allowed;
    stage.replaceChildren(...[
      el("h2", {}, "סיימת"),
      el("p", { class: "score" }, `${total - wrong.length} תשובות נכונות מתוך ${total}`),
      el("p", { class: passed ? "ok" : "bad" },
        passed ? "עברת את המבחן." : `לא עברת. עוברים עם ${mistakesText(allowed)}.`),
      wrong.length > 0 && el("h2", {}, "התמרורים שטעית בהם"),
      wrong.length > 0 && el("ul", { class: "review" },
        wrong.map((s) => el("li", {}, signFace(s),
          el("span", {}, el("strong", {}, `${s.number} · ${label(s)}`), el("br"), meaningOf(s))))),
      el("div", { class: "actions" },
        wrong.length > 0 && el("button", { class: "btn", type: "button", onclick: () => start(shuffle(wrong)) }, "לתרגל את הטעויות"),
        el("button", { class: wrong.length ? "btn ghost" : "btn", type: "button", onclick: () => start(shuffle(queue)) }, "שוב"),
        el("button", { class: "btn ghost", type: "button", onclick: showSetup }, "הגדרות המבחן"),
        el("a", { class: "btn ghost", href: "index.html" }, "לעמוד הראשי")),
    ].filter(Boolean));
  }

  ask();
}

showSetup();
