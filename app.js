const state = {
  cards: [],
  filteredCards: [],
  filters: {
    search: "",
    troop: "All",
    ageSex: "All",
  },
  quiz: {
    question: null,
    score: 0,
    total: 0,
    mode: "name-from-photo",
    pool: "all",
  },
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
  quizCard: document.querySelector("#quiz-card"),
  quizScore: document.querySelector("#quiz-score"),
  quizMode: document.querySelector("#quiz-mode"),
  quizPool: document.querySelector("#quiz-pool"),
  newQuizQuestion: document.querySelector("#new-quiz-question"),
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

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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
    const cache = await caches.open("baboons-ears-v1");
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

    kicker.textContent = `${card.troop} • ${card.ageSex}`;
    title.textContent = card.subject;
    subtitle.textContent = card.subtitle || "No extra notes";

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
    const searchHaystack = [card.title, card.subtitle, card.troop, card.ageSex, card.subject]
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

function getQuizPool() {
  const source = state.quiz.pool === "with-images" ? state.cards.filter((card) => card.images.length) : state.cards;
  return source.filter((card) => card.subject);
}

function getRandomChoices(answerCard, count = 4) {
  const candidates = shuffle(state.cards.filter((card) => card.id !== answerCard.id && card.subject));
  return shuffle([answerCard, ...candidates.slice(0, count - 1)]);
}

function renderQuizQuestion() {
  const { question } = state.quiz;
  elements.quizScore.textContent = `Score: ${state.quiz.score} / ${state.quiz.total}`;

  if (!question) {
    elements.quizCard.innerHTML = '<p class="quiz-empty">Press "New question" to start.</p>';
    return;
  }

  const answer = question.answer;
  const choicesHtml = question.choices
    .map(
      (choice) => `
        <button type="button" class="quiz-option" data-card-id="${choice.id}">
          <strong>${escapeHtml(choice.subject)}</strong><br>
          <span class="quiz-copy">${escapeHtml(`${choice.troop} • ${choice.ageSex}`)}</span>
        </button>
      `
    )
    .join("");

  let prompt = "";
  let media = "";

  if (question.mode === "name-from-photo") {
    prompt = "Which individual matches these ear photo(s)?";
    media = answer.images.length
      ? `
        <div class="quiz-media quiz-media--grid">
          ${answer.images
            .map((image) => `<img class="quiz-photo" src="${image.src}" alt="${escapeHtml(answer.subject)} ${escapeHtml(image.slot)}">`)
            .join("")}
        </div>
      `
      : '<div class="image-empty">This card has no image in the export.</div>';
  } else {
    prompt = `Which photo belongs to ${escapeHtml(answer.subject)}?`;
    media = `
      <div class="quiz-options">
        ${question.choices
          .map((choice) => {
            const image = choice.images[0];
            if (!image) {
              return `
                <button type="button" class="quiz-option" data-card-id="${choice.id}">
                  <div class="image-empty">No image</div>
                </button>
              `;
            }

            return `
              <button type="button" class="quiz-option" data-card-id="${choice.id}">
                <img class="quiz-photo" src="${image.src}" alt="${escapeHtml(choice.subject)}">
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  elements.quizCard.innerHTML = `
    <div class="quiz-header">
      <div>
        <p class="eyebrow">Quiz</p>
        <h2>${prompt}</h2>
      </div>
      <p class="meta">${escapeHtml(answer.troop)} • ${escapeHtml(answer.ageSex)}</p>
    </div>
    ${question.mode === "name-from-photo" ? media : `<p class="quiz-copy"><strong>${escapeHtml(answer.subject)}</strong></p>${media}`}
    ${question.mode === "name-from-photo" ? `<div class="quiz-options">${choicesHtml}</div>` : ""}
    <p class="quiz-feedback" id="quiz-feedback"></p>
  `;

  elements.quizCard.querySelectorAll(".quiz-option").forEach((button) => {
    button.addEventListener("click", () => evaluateQuizAnswer(button.dataset.cardId));
  });
}

function generateQuizQuestion() {
  const pool = getQuizPool();
  if (pool.length < 4) {
    state.quiz.question = null;
    elements.quizCard.innerHTML = '<p class="quiz-empty">Not enough cards in the selected pool for a 4-choice quiz.</p>';
    return;
  }

  const answer = shuffle(pool)[0];
  const mode = state.quiz.mode;
  const sourcePool = mode === "photo-from-name" ? pool.filter((card) => card.images.length) : pool;
  const safeAnswer = mode === "photo-from-name" && !answer.images.length ? shuffle(sourcePool)[0] : answer;

  state.quiz.question = {
    mode,
    answer: safeAnswer,
    choices: getRandomChoices(safeAnswer),
    locked: false,
  };

  renderQuizQuestion();
}

function evaluateQuizAnswer(cardId) {
  const question = state.quiz.question;
  if (!question || question.locked) {
    return;
  }

  question.locked = true;
  state.quiz.total += 1;

  const correct = cardId === question.answer.id;
  if (correct) {
    state.quiz.score += 1;
  }

  const feedback = elements.quizCard.querySelector("#quiz-feedback");
  if (feedback) {
    feedback.textContent = correct
      ? `Correct: ${question.answer.subject}`
      : `Not this one. Correct answer: ${question.answer.subject}`;
  }

  elements.quizCard.querySelectorAll(".quiz-option").forEach((button) => {
    const isAnswer = button.dataset.cardId === question.answer.id;
    button.classList.toggle("is-correct", isAnswer);
    button.classList.toggle("is-wrong", !isAnswer && button.dataset.cardId === cardId);
    button.disabled = true;
  });

  elements.quizScore.textContent = `Score: ${state.quiz.score} / ${state.quiz.total}`;
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

  elements.quizMode.addEventListener("change", (event) => {
    state.quiz.mode = event.target.value;
    generateQuizQuestion();
  });

  elements.quizPool.addEventListener("change", (event) => {
    state.quiz.pool = event.target.value;
    generateQuizQuestion();
  });

  elements.newQuizQuestion.addEventListener("click", generateQuizQuestion);

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
  warmImages(state.cards);
  generateQuizQuestion();
}

async function init() {
  setConnectionState();
  wireEvents();
  registerServiceWorker();

  try {
    await loadCards();
  } catch (error) {
    console.error(error);
    elements.cardGrid.innerHTML = '<p class="meta">Could not load the dataset. Make sure the generated files are present.</p>';
    elements.quizCard.innerHTML = '<p class="quiz-empty">Dataset loading failed.</p>';
  }
}

init();
