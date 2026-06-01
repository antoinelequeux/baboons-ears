const STORAGE_KEY = "baboons-ears-progress-v1";

const state = {
  cards: [],
  filteredCards: [],
  filters: {
    search: "",
    troop: "All",
    ageSex: "All",
  },
  study: {
    mode: "ears-to-name",
    pool: "all",
    length: "10",
    current: null,
    queue: [],
    seenIds: new Set(),
    progress: {
      done: 0,
      correct: 0,
      wrong: 0,
      total: 0,
    },
  },
  history: {},
};

const elements = {
  searchInput: document.querySelector("#search-input"),
  troopFilter: document.querySelector("#troop-filter"),
  ageFilter: document.querySelector("#age-filter"),
  resultsSummary: document.querySelector("#results-summary"),
  cardGrid: document.querySelector("#card-grid"),
  browseCardTemplate: document.querySelector("#browse-card-template"),
  tabs: [...document.querySelectorAll(".tab")],
  views: {
    browse: document.querySelector("#browse-view"),
    quiz: document.querySelector("#quiz-view"),
    guide: document.querySelector("#guide-view"),
  },
  studyCard: document.querySelector("#quiz-card"),
  studyScore: document.querySelector("#study-score"),
  studyMode: document.querySelector("#study-mode"),
  studyPool: document.querySelector("#study-pool"),
  studyLength: document.querySelector("#study-length"),
  startSession: document.querySelector("#start-session"),
  connectionDot: document.querySelector("#connection-dot"),
  connectionLabel: document.querySelector("#connection-label"),
};

const shuffle = (items) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

function setConnectionState() {
  const online = navigator.onLine;
  elements.connectionDot.classList.toggle("is-online", online);
  elements.connectionLabel.textContent = online ? "Online or cached" : "Offline mode";
}

async function warmImages(cards) {
  if (!("caches" in window)) {
    return;
  }

  try {
    const cache = await caches.open("baboons-ears-v2");
    const imageUrls = cards.flatMap((card) => card.images.map((image) => image.src));

    await Promise.all(
      imageUrls.map(async (url) => {
        const existing = await cache.match(url);
        if (!existing) {
          await cache.add(url);
        }
      }),
    );
  } catch (error) {
    console.warn("Image cache warmup skipped:", error);
  }
}

function loadHistory() {
  try {
    state.history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    state.history = {};
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
}

function getCardHistory(cardId) {
  if (!state.history[cardId]) {
    state.history[cardId] = {
      seen: 0,
      wrong: 0,
      correct: 0,
      streak: 0,
    };
  }
  return state.history[cardId];
}

function buildFilterChips(target, values, activeValue, onClick) {
  target.replaceChildren();
  ["All", ...values].forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${value === activeValue ? " is-active" : ""}`;
    button.textContent = value;
    button.addEventListener("click", () => onClick(value));
    target.append(button);
  });
}

function renderFilters() {
  const troopValues = [...new Set(state.cards.map((card) => card.troop))].sort();
  const ageValues = [...new Set(state.cards.map((card) => card.ageSex))].sort();

  buildFilterChips(elements.troopFilter, troopValues, state.filters.troop, (value) => {
    state.filters.troop = value;
    renderFilters();
    applyFilters();
  });

  buildFilterChips(elements.ageFilter, ageValues, state.filters.ageSex, (value) => {
    state.filters.ageSex = value;
    renderFilters();
    applyFilters();
  });
}

function renderBrowseCards() {
  elements.cardGrid.replaceChildren();

  if (!state.filteredCards.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "No matching cards. Try a broader search or clear the filters.";
    elements.cardGrid.append(empty);
    return;
  }

  state.filteredCards.forEach((card) => {
    const fragment = elements.browseCardTemplate.content.cloneNode(true);
    const gallery = fragment.querySelector(".animal-card__gallery");
    const kicker = fragment.querySelector(".animal-card__kicker");
    const title = fragment.querySelector(".animal-card__title");
    const subtitle = fragment.querySelector(".animal-card__subtitle");
    const marks = fragment.querySelector(".animal-card__marks");

    kicker.textContent = `${card.troop} • ${card.ageSex}`;
    title.textContent = card.subject;
    subtitle.textContent = card.subtitle || "No extra notes";
    marks.textContent = card.marksLabel;

    if (card.images.length === 1) {
      gallery.classList.add("is-single");
    }

    if (!card.images.length) {
      const empty = document.createElement("div");
      empty.className = "image-empty";
      empty.textContent = "No image in export";
      gallery.append(empty);
    } else {
      card.images.forEach((image) => {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = image.src;
        img.alt = `${card.subject} ${image.slot}`;
        gallery.append(img);
      });
    }

    elements.cardGrid.append(fragment);
  });
}

function updateResultsSummary() {
  elements.resultsSummary.textContent = `${state.filteredCards.length} shown out of ${state.cards.length}`;
}

function applyFilters() {
  const query = state.filters.search.trim().toLowerCase();

  state.filteredCards = state.cards.filter((card) => {
    const searchHaystack = [card.title, card.subtitle, card.troop, card.ageSex, card.subject, card.marksLabel]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !query || searchHaystack.includes(query);
    const matchesTroop = state.filters.troop === "All" || card.troop === state.filters.troop;
    const matchesAge = state.filters.ageSex === "All" || card.ageSex === state.filters.ageSex;

    return matchesSearch && matchesTroop && matchesAge;
  });

  updateResultsSummary();
  renderBrowseCards();
}

function getStudyPool() {
  let cards = state.study.pool === "with-images" ? state.cards.filter((card) => card.images.length > 0) : state.cards;
  if (["ears-to-name", "name-to-ears", "ears-to-marks"].includes(state.study.mode)) {
    cards = cards.filter((card) => card.images.length > 0);
  }
  return cards.filter((card) => card.subject);
}

function getTargetSessionSize(poolLength) {
  if (state.study.length === "all") {
    return poolLength;
  }
  return Math.min(poolLength, Number.parseInt(state.study.length, 10) || 10);
}

function getWeight(card) {
  const history = getCardHistory(card.id);
  return 1 + history.wrong * 3 + Math.max(0, 2 - history.streak);
}

function buildSessionQueue() {
  const pool = getStudyPool();
  const total = getTargetSessionSize(pool.length);
  const weighted = shuffle(
    pool
      .map((card) => ({
        card,
        weight: getWeight(card) + Math.random(),
      }))
      .sort((left, right) => right.weight - left.weight)
      .map((entry) => entry.card),
  );

  state.study.queue = weighted.slice(0, total);
  state.study.seenIds = new Set();
  state.study.progress = {
    done: 0,
    correct: 0,
    wrong: 0,
    total,
  };
}

function renderStudyStatus() {
  const { done, correct, wrong, total } = state.study.progress;
  if (!total) {
    elements.studyScore.textContent = "Ready for a new study session.";
    return;
  }
  elements.studyScore.textContent = `Target set: ${total} cards • Reviewed: ${done} • Correct: ${correct} • Wrong: ${wrong}`;
}

function renderImageGrid(images, subject) {
  if (!images.length) {
    return '<div class="image-empty">No image in export</div>';
  }

  return `
    <div class="quiz-media quiz-media--grid">
      ${images
        .map((image) => `<img class="quiz-photo" src="${image.src}" alt="${subject} ${image.slot}">`)
        .join("")}
    </div>
  `;
}

function getStudyTexts(card) {
  const mode = state.study.mode;

  if (mode === "ears-to-name") {
    return {
      eyebrow: "Basic",
      prompt: "Look at the ears. Say the name before revealing the answer.",
      front: renderImageGrid(card.images, card.subject),
      answerTitle: card.subject,
      answerMeta: `${card.troop} • ${card.ageSex}`,
      answerExtra: card.marksLabel,
    };
  }

  if (mode === "name-to-ears") {
    return {
      eyebrow: "Basic",
      prompt: "Read the name. Picture the ears before revealing the answer.",
      front: `
        <p class="flashcard__display-name">${card.subject}</p>
        <p class="flashcard__meta">${card.troop} • ${card.ageSex}</p>
      `,
      answerTitle: "Ear photos",
      answerMeta: card.marksLabel,
      answerExtra: renderImageGrid(card.images, card.subject),
      answerIsHtml: true,
    };
  }

  if (mode === "ears-to-marks") {
    return {
      eyebrow: "Hard",
      prompt: "Look at the ears. Say the right and left codes before revealing.",
      front: renderImageGrid(card.images, card.subject),
      answerTitle: card.marksLabel,
      answerMeta: `${card.subject} • ${card.troop} • ${card.ageSex}`,
      answerExtra: "",
    };
  }

  return {
    eyebrow: "Hard",
    prompt: "Read the name. Say the right and left ear codes before revealing.",
    front: `
      <p class="flashcard__display-name">${card.subject}</p>
      <p class="flashcard__meta">${card.troop} • ${card.ageSex}</p>
    `,
    answerTitle: card.marksLabel,
    answerMeta: "",
    answerExtra: renderImageGrid(card.images, card.subject),
    answerIsHtml: true,
  };
}

function renderCurrentCard() {
  renderStudyStatus();

  const card = state.study.current;
  if (!card) {
    elements.studyCard.innerHTML = `
      <p class="quiz-empty">Session finished. Start another one whenever you want.</p>
    `;
    return;
  }

  const view = getStudyTexts(card);
  const history = getCardHistory(card.id);

  elements.studyCard.innerHTML = `
    <div class="flashcard">
      <div class="flashcard__top">
        <div>
          <p class="eyebrow">${view.eyebrow}</p>
          <h2 class="flashcard__prompt">${view.prompt}</h2>
        </div>
        <p class="meta">Seen: ${history.seen} • Wrong: ${history.wrong}</p>
      </div>

      <div class="flashcard__panel">
        ${view.front}
      </div>

      <div class="flashcard__actions">
        <button id="reveal-answer" class="button" type="button">Reveal answer</button>
      </div>

      <div id="flashcard-answer" class="flashcard__answer is-hidden">
        <div class="flashcard__panel">
          <p class="flashcard__small">Answer</p>
          <p class="flashcard__display-name">${view.answerTitle}</p>
          ${view.answerMeta ? `<p class="flashcard__marks">${view.answerMeta}</p>` : ""}
          ${
            view.answerExtra
              ? view.answerIsHtml
                ? view.answerExtra
                : `<p class="flashcard__small">${view.answerExtra}</p>`
              : ""
          }
        </div>
        <div class="flashcard__grade">
          <button id="grade-correct" class="button" type="button">I got it right</button>
          <button id="grade-wrong" class="button button--ghost" type="button">I got it wrong</button>
        </div>
      </div>
    </div>
  `;

  elements.studyCard.querySelector("#reveal-answer").addEventListener("click", () => {
    elements.studyCard.querySelector("#flashcard-answer").classList.remove("is-hidden");
  });

  elements.studyCard.querySelector("#grade-correct").addEventListener("click", () => gradeCard(true));
  elements.studyCard.querySelector("#grade-wrong").addEventListener("click", () => gradeCard(false));
}

function nextCard() {
  state.study.current = state.study.queue.shift() || null;
  renderCurrentCard();
}

function gradeCard(correct) {
  const card = state.study.current;
  if (!card) {
    return;
  }

  const history = getCardHistory(card.id);
  history.seen += 1;

  state.study.progress.done += 1;

  if (correct) {
    history.correct += 1;
    history.streak += 1;
    state.study.progress.correct += 1;
  } else {
    history.wrong += 1;
    history.streak = 0;
    state.study.progress.wrong += 1;

    const insertionIndex = Math.min(2, state.study.queue.length);
    state.study.queue.splice(insertionIndex, 0, card);
  }

  saveHistory();
  nextCard();
}

function startSession() {
  const pool = getStudyPool();
  if (!pool.length) {
    elements.studyCard.innerHTML = '<p class="quiz-empty">No cards available for this study mode.</p>';
    elements.studyScore.textContent = "No cards available.";
    return;
  }

  buildSessionQueue();
  nextCard();
  setActiveView("quiz");
}

function setActiveView(viewName) {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === viewName);
  });

  Object.entries(elements.views).forEach(([key, view]) => {
    view.classList.toggle("is-active", key === viewName);
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("service-worker.js");
    } catch (error) {
      console.error("Service worker registration failed:", error);
    }
  });
}

function wireEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    applyFilters();
  });

  elements.studyMode.addEventListener("change", (event) => {
    state.study.mode = event.target.value;
  });

  elements.studyPool.addEventListener("change", (event) => {
    state.study.pool = event.target.value;
  });

  elements.studyLength.addEventListener("change", (event) => {
    state.study.length = event.target.value;
  });

  elements.startSession.addEventListener("click", startSession);

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveView(tab.dataset.view));
  });

  window.addEventListener("online", setConnectionState);
  window.addEventListener("offline", setConnectionState);
}

async function loadCards() {
  const response = await fetch("data/individuals.json");
  const payload = await response.json();

  state.cards = payload.cards;
  renderFilters();
  state.filteredCards = [...state.cards];
  updateResultsSummary();
  renderBrowseCards();
  renderStudyStatus();
  warmImages(state.cards);
}

async function init() {
  setConnectionState();
  loadHistory();
  wireEvents();
  registerServiceWorker();

  try {
    await loadCards();
  } catch (error) {
    console.error(error);
    elements.cardGrid.innerHTML = '<p class="meta">Could not load the dataset. Make sure the generated files are present.</p>';
    elements.studyCard.innerHTML = '<p class="quiz-empty">Dataset loading failed.</p>';
  }
}

init();
