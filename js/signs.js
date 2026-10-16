import { el, loadJSON, shuffle, signFace, getProgress, isMastered, renderChrome } from "./common.js";

await renderChrome("signs.html");
const signs = await loadJSON("content/signs.json");
const grid = document.getElementById("signs");
const filters = document.getElementById("filters");
const flipHint = document.getElementById("flip-hint");
const count = document.getElementById("count");
const search = document.getElementById("search");
const known = getProgress().s;

let activePart = 0; // 0 = all
let hideMeaning = false;

const parts = [...new Map(signs.map((s) => [s.part, s.category])).entries()].sort((a, b) => a[0] - b[0]);
const chip = (label, onclick, pressed = false) =>
  el("button", { class: "chip", type: "button", "aria-pressed": pressed, onclick }, label);

const partButtons = [[0, "הכל"], ...parts].map(([part, label]) => {
  const button = chip(label, () => {
    activePart = part;
    testLink.href = part ? `signs-quiz.html?part=${part}` : "signs-quiz.html";
    partButtons.forEach((b) => b.setAttribute("aria-pressed", b === button));
    render();
  }, part === activePart);
  return button;
});
filters.append(...partButtons);

const quizToggle = chip("מצב בוחן: הסתר פירוש", () => {
  hideMeaning = !hideMeaning;
  quizToggle.setAttribute("aria-pressed", hideMeaning);
  flipHint.hidden = !hideMeaning;
  render();
}, false);
const testLink = el("a", { class: "chip", href: "signs-quiz.html" }, "למבחן תמרורים");
document.getElementById("tools").append(quizToggle, testLink);
search.addEventListener("input", render);

function card(s) {
  const body = el("span", { class: "sign-text" },
    el("span", { class: "meaning", hidden: hideMeaning }, s.meaning),
    s.validity && el("span", { class: "validity", hidden: hideMeaning }, `בתוקף: ${s.validity}`),
  );
  const mastered = isMastered(known[s.number]);
  const button = el("button", {
    class: "card sign-card",
    type: "button",
    "aria-expanded": !hideMeaning,
    onclick: () => {
      for (const part of body.children) part.hidden = !part.hidden;
      button.setAttribute("aria-expanded", !body.firstChild.hidden);
    },
  },
    signFace(s),
    el("span", { class: "sign-head" },
      el("span", { class: "num" }, s.number),
      mastered && el("span", { class: "badge" }, "שלטת"),
    ),
    body,
  );
  return el("li", {}, button);
}

function render() {
  const query = search.value.trim();
  const shown = signs.filter((s) =>
    (!activePart || s.part === activePart) &&
    (!query || s.number.includes(query) || s.meaning.includes(query)),
  );
  count.textContent = `${shown.length} תמרורים`;
  grid.replaceChildren(...(hideMeaning ? shuffle(shown) : shown).map(card));
}

render();
