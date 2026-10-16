import { el, loadJSON, getProgress, resetProgress, exportProgress, importProgress, statsFor, readinessLabel, isMastered, renderChrome } from "./common.js";

const site = await renderChrome("index.html");
const [topics, questions, signs] = await Promise.all([
  loadJSON("content/topics.json"),
  loadJSON("content/questions.json"),
  loadJSON("content/signs.json"),
]);

document.getElementById("tagline").textContent = site.tagline;

const stat = (value, label) =>
  el("div", { class: "stat" }, el("strong", {}, value), el("span", {}, label));

// A topic is done once its lesson was read and its comprehension check passed.
const lessonOf = (progress, id) => progress.lessons?.[id] ?? {};
const topicDone = (progress, id) => Boolean(lessonOf(progress, id).read && lessonOf(progress, id).passed);

function nextStep(topicRows, progress) {
  if (!questions.length) return null;
  const open = topicRows.find((r) => !topicDone(progress, r.topic.id));
  if (!open) return { text: "סיימת את כל הנושאים. הגיע הזמן למבחן מלא.", href: "quiz.html?mode=exam", label: "התחל מבחן" };
  const { id, title } = open.topic;
  const lesson = lessonOf(progress, id);
  if (!lesson.read) return { text: `הצעד הבא: ${title}`, href: `learn.html?topic=${id}`, label: "התחל ללמוד" };
  return { text: `הצעד הבא: בדיקת הבנה ב${title}`, href: `quiz.html?mode=check&topic=${id}`, label: "לבדיקת הבנה" };
}

function render() {
  const progress = getProgress();
  const overall = statsFor(questions, progress);
  const topicRows = topics.map((topic) => ({
    topic,
    stats: statsFor(questions.filter((q) => q.topic === topic.id), progress),
  }));

  document.getElementById("ready-pct").textContent = `${overall.masteryPct}%`;
  document.getElementById("ready-label").textContent = readinessLabel(overall.masteryPct);
  const meter = document.getElementById("ready-meter");
  meter.setAttribute("aria-valuenow", overall.masteryPct);
  meter.firstElementChild.style.width = `${overall.masteryPct}%`;
  document.getElementById("ready-note").textContent =
    `${overall.mastered} מתוך ${overall.total} שאלות נחשבות "שלטת בהן": ענית עליהן נכון לפחות פעמיים, והתשובה האחרונה נכונה.`;

  const step = nextStep(topicRows, progress);
  document.getElementById("next-step").replaceChildren(
    ...(step ? [el("p", {}, step.text), el("a", { class: "btn", href: step.href }, step.label)] : []),
  );

  const lastExam = progress.exams.at(-1);
  document.getElementById("stats").replaceChildren(
    stat(`${overall.seen}/${overall.total}`, "שאלות שנענו"),
    stat(overall.accuracyPct == null ? "—" : `${overall.accuracyPct}%`, "דיוק כולל"),
    stat(lastExam ? `${lastExam.mistakes} טעויות` : "—", "מבחן אחרון"),
  );

  document.getElementById("path").replaceChildren(
    ...topicRows.map(({ topic, stats }, i) => {
      const done = topicDone(progress, topic.id);
      const lesson = lessonOf(progress, topic.id);
      return el("li", { class: done ? "step done" : "step" },
        el("div", { class: "step-head" },
          el("span", { class: "step-no", "aria-hidden": "true" }, done ? "✓" : String(i + 1)),
          el("div", {},
            el("h3", {}, topic.title, done && el("span", { class: "badge" }, "הושלם")),
            el("p", {}, topic.summary),
          ),
        ),
        el("div", { class: "meter small", role: "img", "aria-label": `שליטה ${stats.masteryPct}%` },
          el("span", { style: `width:${stats.masteryPct}%` })),
        el("div", { class: "step-foot" },
          el("span", { class: "meta" }, `${stats.mastered}/${stats.total} שאלות בשליטה`),
          el("span", { class: "step-links" },
            el("a", { href: `learn.html?topic=${topic.id}` }, lesson.read ? "✓ שיעור" : "שיעור"),
            el("a", { href: `quiz.html?mode=check&topic=${topic.id}` }, lesson.passed ? "✓ בדיקת הבנה" : "בדיקת הבנה"),
            el("a", { href: `quiz.html?mode=topic&topic=${topic.id}` }, "תרגול"),
          ),
        ),
      );
    }),
    el("li", { class: "step final" },
      el("div", { class: "step-head" },
        el("span", { class: "step-no", "aria-hidden": "true" }, String(topicRows.length + 1)),
        el("div", {},
          el("h3", {}, "מבחן מלא"),
          el("p", {}, `${site.exam.questions} שאלות, ${site.exam.minutes} דקות, עד ${site.exam.maxMistakes} טעויות.`),
        ),
      ),
      el("div", { class: "step-foot" }, el("span"),
        el("span", { class: "step-links" }, el("a", { href: "quiz.html?mode=exam" }, "להתחיל מבחן"))),
    ),
  );

  document.getElementById("more").replaceChildren(
    card("quiz.html?mode=weak", "חזרה על טעויות", overall.weak ? `${overall.weak} שאלות שטעית בהן לאחרונה` : "אין כרגע שאלות לחזרה"),
    card("game.html", "משחק", "מרוץ תמרורים ושאלות ב-60 שניות"),
    card("signs-quiz.html", "מבחן תמרורים", "מבחן על כל לוח התמרורים, או על חלק אחד בו"),
    card("signs.html", "לוח התמרורים", `${signs.filter((s) => isMastered(progress.s[s.number])).length} מתוך ${signs.length} תמרורים בשליטה`),
  );

  const exams = progress.exams.slice(-5).reverse();
  document.getElementById("exams-section").hidden = exams.length === 0;
  document.getElementById("exams").replaceChildren(
    ...exams.map((e) =>
      el("li", { class: e.passed ? "ok" : "bad" },
        new Date(e.date).toLocaleDateString("he-IL"), " · ", `${e.mistakes} טעויות`, " · ", e.passed ? "עברת" : "לא עברת"),
    ),
  );
}

const card = (href, title, text) =>
  el("li", {}, el("a", { class: "card", href }, el("h3", {}, title), el("p", {}, text)));

const backupMsg = document.getElementById("backup-msg");
document.getElementById("export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([exportProgress()], { type: "application/json" }));
  const link = el("a", { href: url, download: `theory-progress-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  backupMsg.textContent = "הגיבוי ירד כקובץ.";
});
const importFile = document.getElementById("import-file");
document.getElementById("import").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;
  try {
    if (!confirm("השחזור יחליף את ההתקדמות הנוכחית בדפדפן הזה. להמשיך?")) return;
    importProgress(await file.text());
    render();
    backupMsg.textContent = "ההתקדמות שוחזרה.";
  } catch (error) {
    backupMsg.textContent = `השחזור נכשל: ${error.message}`;
  }
});

document.getElementById("reset").addEventListener("click", () => {
  if (confirm("למחוק את כל ההתקדמות מהדפדפן הזה?")) {
    resetProgress();
    render();
  }
});

render();
