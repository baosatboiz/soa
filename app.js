const QUESTIONS_PER_SET = 100;
const API_BASE = "/api";
const STORAGE_KEY = "exam_tracking_v1";
const DRAFT_STORAGE_KEY = "exam_draft_v1";
const SESSION_KEY = "current_user_session";

const difficultyOrder = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
};

const ui = {
  loginView: document.getElementById("loginView"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  togglePasswordBtn: document.getElementById("togglePasswordBtn"),
  loginLoading: document.getElementById("loginLoading"),
  loginLoadingText: document.querySelector("#loginLoading p"),
  loginSubmitBtn: document.querySelector('#loginForm button[type="submit"]'),
  currentUserInfo: document.getElementById("currentUserInfo"),
  logoutBtn: document.getElementById("logoutBtn"),
  draftSummary: document.getElementById("draftSummary"),

  setupView: document.getElementById("setupView"),
  examView: document.getElementById("examView"),
  resultView: document.getElementById("resultView"),

  setupForm: document.getElementById("setupForm"),
  setMeta: document.getElementById("setMeta"),
  examSetsList: document.getElementById("examSetsList"),

  historyView: document.getElementById("historyView"),
  historyContainer: document.getElementById("historyContainer"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  historySummary: document.getElementById("historySummary"),
  backToHomeFromHistoryBtn: document.getElementById("backToHomeFromHistoryBtn"),
  attemptDetailModal: document.getElementById("attemptDetailModal"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  attemptModalBody: document.getElementById("attemptModalBody"),
  attemptModalTitle: document.getElementById("attemptModalTitle"),

  examTitle: document.getElementById("examTitle"),
  examMeta: document.getElementById("examMeta"),
  saveDraftBtn: document.getElementById("saveDraftBtn"),
  reviewExamBtn: document.getElementById("reviewExamBtn"),
  backToSetupBtn: document.getElementById("backToSetupBtn"),

  questionNav: document.getElementById("questionNav"),
  questionIndexLabel: document.getElementById("questionIndexLabel"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  questionContent: document.getElementById("questionContent"),
  answerArea: document.getElementById("answerArea"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),

  resultMeta: document.getElementById("resultMeta"),
  reviewSummary: document.getElementById("reviewSummary"),
  reviewTitle: document.getElementById("reviewTitle"),
  reviewNav: document.getElementById("reviewNav"),
  reviewIndexLabel: document.getElementById("reviewIndexLabel"),
  reviewDifficultyBadge: document.getElementById("reviewDifficultyBadge"),
  reviewQuestionContent: document.getElementById("reviewQuestionContent"),
  reviewAnswerSection: document.getElementById("reviewAnswerSection"),
  reviewPrevBtn: document.getElementById("reviewPrevBtn"),
  reviewNextBtn: document.getElementById("reviewNextBtn"),
  resultDetails: document.getElementById("resultDetails"),
  restartBtn: document.getElementById("restartBtn"),
  showHistoryAfterResultBtn: document.getElementById("showHistoryAfterResultBtn"),
  leaderboardBody: document.getElementById("leaderboardBody"),
  refreshLeaderboardBtn: document.getElementById("refreshLeaderboardBtn"),
  refreshLeaderboardBtn2: document.getElementById("refreshLeaderboardBtn2"),
  mainNav: document.getElementById("mainNav"),
  navHomeBtn: document.getElementById("navHomeBtn"),
  navHistoryBtn: document.getElementById("navHistoryBtn"),
  navLeaderboardBtn: document.getElementById("navLeaderboardBtn"),
  leaderboardView: document.getElementById("leaderboardView"),
  backToHomeFromLeaderboardBtn: document.getElementById("backToHomeFromLeaderboardBtn"),
  questionSearch: document.getElementById("questionSearch"),
  searchResults: document.getElementById("searchResults"),
  searchBox: document.querySelector(".search-box"),
};

const state = {
  allQuestions: [],
  examSets: [],
  selectedExamSetIndex: 0,
  currentSession: null,
  currentUser: null,
  allUsers: [],
  historyAttempts: [],
  draftSetIds: [],
  reviewIndex: 0,
};

init();

async function init() {
  wireEvents();
  try {
    const sessionUser = readSessionUser();
    if (sessionUser) {
      state.currentUser = sessionUser;
      await initializeExamData();
      showView("setup");
    } else {
      showView("login");
    }
  } catch (err) {
    alert(`Loi khoi tao he thong: ${err.message}`);
  } finally {
    document.body.classList.add("app-ready");
    setLoginLoading(false);
  }
}

async function initializeExamData() {
  try {
    const response = await fetch(`${API_BASE}/questions`);
    if (!response.ok) {
      throw new Error(`Khong the tai cau hoi tu backend`);
    }

    const raw = await response.json();
    state.allQuestions = normalizeQuestions(raw);
    state.examSets = buildExamSets(state.allQuestions, QUESTIONS_PER_SET);

    if (state.examSets.length === 0) {
      throw new Error("Khong tao duoc bo de nao. Kiem tra du lieu hiem thi trong JSON.");
    }

    state.selectedExamSetIndex = Math.min(state.selectedExamSetIndex, state.examSets.length - 1);
    renderSetMeta();
    updateUserInfo();
    await loadUserHomeState();
    void renderLeaderboard();
  } catch (err) {
    alert(`Loi khoi tao de thi: ${err.message}`);
  }
}

async function loadUserHomeState() {
  if (!state.currentUser) {
    state.historyAttempts = [];
    state.draftSetIds = [];
    return;
  }

  const [attemptsResponse, draftsResponse] = await Promise.all([
    fetch(`${API_BASE}/users/${encodeURIComponent(state.currentUser.userId)}/attempts`),
    fetch(`${API_BASE}/users/${encodeURIComponent(state.currentUser.userId)}/drafts`),
  ]);

  if (attemptsResponse.ok) {
    const attemptsPayload = await attemptsResponse.json();
    state.historyAttempts = Array.isArray(attemptsPayload.attempts) ? attemptsPayload.attempts : [];
  } else {
    state.historyAttempts = [];
  }

  if (draftsResponse.ok) {
    const draftsPayload = await draftsResponse.json();
    state.draftSetIds = Array.isArray(draftsPayload.drafts)
      ? draftsPayload.drafts.map((draft) => draft.setId)
      : [];
  } else {
    state.draftSetIds = [];
  }

  renderExamSetsList();
  renderHistory();
}

function wireEvents() {
  ui.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleLogin();
  });

  ui.togglePasswordBtn.addEventListener("click", () => {
    const passwordInput = document.getElementById("password");
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    ui.togglePasswordBtn.textContent = isHidden ? "🙈" : "👁";
    ui.togglePasswordBtn.setAttribute("aria-pressed", String(isHidden));
    ui.togglePasswordBtn.setAttribute("aria-label", isHidden ? "An mat khau" : "Hien mat khau");
  });

  ui.logoutBtn.addEventListener("click", () => {
    handleLogout();
  });

  ui.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void startExam();
  });


  ui.clearHistoryBtn.addEventListener("click", () => {
    if (!state.currentUser) {
      alert("Ban chua dang nhap.");
      return;
    }
    void clearHistory(state.currentUser.userId).then(() => renderHistory());
  });

  ui.navHomeBtn.addEventListener("click", () => showView("setup"));
  ui.navHistoryBtn.addEventListener("click", () => {
    showView("history");
    void renderHistory();
  });
  ui.navLeaderboardBtn.addEventListener("click", () => {
    showView("leaderboard");
    void renderLeaderboard();
  });

  ui.refreshHistoryBtn.addEventListener("click", () => {
    void renderHistory();
  });

  ui.closeModalBtn.addEventListener("click", () => {
    ui.attemptDetailModal.style.display = "none";
  });

  ui.attemptDetailModal.addEventListener("click", (event) => {
    if (event.target === ui.attemptDetailModal) {
      ui.attemptDetailModal.style.display = "none";
    }
  });

  ui.prevBtn.addEventListener("click", () => moveQuestion(-1));
  ui.nextBtn.addEventListener("click", () => moveQuestion(1));
  ui.saveDraftBtn.addEventListener("click", async () => {
    await saveCurrentDraft();
    void renderHistory();
  });
  ui.reviewExamBtn.addEventListener("click", submitForReview);

  ui.backToSetupBtn.addEventListener("click", async () => {
    if (state.currentSession && !state.currentSession.submitted) {
      await saveCurrentDraft(true);
    }
    showView("setup");
  });

  ui.restartBtn.addEventListener("click", () => showView("setup"));
  ui.showHistoryAfterResultBtn.addEventListener("click", () => {
    showView("setup");
    void renderHistory();
  });

  ui.reviewPrevBtn.addEventListener("click", () => moveReviewQuestion(-1));
  
  ui.questionSearch.addEventListener("input", (e) => {
    handleSearch(e.target.value);
  });

  document.addEventListener("click", (e) => {
    if (ui.searchResults && !ui.searchBox?.contains(e.target)) {
      ui.searchResults.style.display = "none";
    }
  });
  ui.reviewNextBtn.addEventListener("click", () => moveReviewQuestion(1));
  if (ui.refreshLeaderboardBtn) {
    ui.refreshLeaderboardBtn.addEventListener("click", () => renderLeaderboard());
  }
  if (ui.refreshLeaderboardBtn2) {
    ui.refreshLeaderboardBtn2.addEventListener("click", () => renderLeaderboard());
  }
  ui.backToHomeFromLeaderboardBtn.addEventListener("click", () => showView("setup"));
  ui.backToHomeFromHistoryBtn.addEventListener("click", () => showView("setup"));
}

async function handleLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  ui.loginError.style.display = "none";
  ui.loginError.textContent = "";
  setLoginLoading(true);

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Tai khoan hoac mat khau khong dung.");
    }

    const user = await response.json();
    state.currentUser = user;
    writeSessionUser(user);
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";

    await initializeExamData();
    setLoginLoading(false);
    showView("setup");
  } catch (error) {
    setLoginLoading(false);
    ui.loginError.textContent = error.message || "Dang nhap khong thanh cong.";
    ui.loginError.style.display = "block";
  }
}

function handleLogout() {
  state.currentUser = null;
  clearSessionUser();
  ui.loginError.style.display = "none";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  state.historyAttempts = [];
  state.draftSetIds = [];
  showView("login");
}

function setLoginLoading(isLoading) {
  if (ui.loginLoading) {
    ui.loginLoading.style.display = isLoading ? "grid" : "none";
  }

  if (ui.loginLoadingText && isLoading) {
    ui.loginLoadingText.textContent = "Đang đăng nhập...";
  }

  if (ui.loginSubmitBtn) {
    ui.loginSubmitBtn.disabled = isLoading;
    ui.loginSubmitBtn.textContent = isLoading ? "Đang đăng nhập..." : "Đăng nhập";
  }

  if (ui.togglePasswordBtn) {
    ui.togglePasswordBtn.disabled = isLoading;
  }
}

function readSessionUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeSessionUser(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSessionUser() {
  sessionStorage.removeItem(SESSION_KEY);
}

function updateUserInfo() {
  if (state.currentUser) {
    ui.currentUserInfo.textContent = `Đăng nhập: ${state.currentUser.userId}`;
  }
}

async function renderLeaderboard() {
  if (!ui.leaderboardBody) return;

  try {
    const response = await fetch(`${API_BASE}/leaderboard`);
    if (!response.ok) throw new Error("Không thể tải bảng xếp hạng");
    
    const data = await response.json();
    ui.leaderboardBody.innerHTML = "";

    if (data.length === 0) {
      ui.leaderboardBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--muted);">Chưa có dữ liệu xếp hạng.</td></tr>`;
      return;
    }

    data.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${row.username}</strong><br><small style="color: var(--muted)">${row.userId}</small></td>
        <td>${row.correctAnswers}</td>
        <td>${row.attemptCount}</td>
      `;
      ui.leaderboardBody.appendChild(tr);
    });
  } catch (err) {
    ui.leaderboardBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--bad);">Lỗi: ${err.message}</td></tr>`;
  }
}

function normalizeQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  return rawQuestions
    .filter((q) => q && q.isVisible)
    .map((q) => ({
      questionId: q.questionId,
      content: q.content || "",
      type: q.type || "singleChoice",
      difficultyLevel: ["Easy", "Medium", "Hard"].includes(q.difficultyLevel)
        ? q.difficultyLevel
        : "Medium",
      questionAnswers: Array.isArray(q.questionAnswers)
        ? q.questionAnswers.map((ans) => ({
            id: ans.id,
            content: ans.content || "",
            correct: Boolean(ans.correct),
          }))
        : [],
    }))
    .filter((q) => q.questionId && q.questionAnswers.length > 0);
}

function buildExamSets(questions, perSet) {
  const pools = {
    Easy: seededShuffle(questions.filter((q) => q.difficultyLevel === "Easy"), 20261),
    Medium: seededShuffle(questions.filter((q) => q.difficultyLevel === "Medium"), 20262),
    Hard: seededShuffle(questions.filter((q) => q.difficultyLevel === "Hard"), 20263),
  };

  const total = pools.Easy.length + pools.Medium.length + pools.Hard.length;
  const setCount = Math.floor(total / perSet);
  const result = [];

  for (let i = 0; i < setCount; i += 1) {
    const remain = {
      Easy: pools.Easy.length,
      Medium: pools.Medium.length,
      Hard: pools.Hard.length,
    };

    let quota = proportionalQuota(remain, perSet);
    quota = ensureQuotaFeasible(quota, remain, perSet);

    const selected = [];
    selected.push(...pullMany(pools.Easy, quota.Easy));
    selected.push(...pullMany(pools.Medium, quota.Medium));
    selected.push(...pullMany(pools.Hard, quota.Hard));

    if (selected.length < perSet) {
      const fillOrder = [pools.Easy, pools.Medium, pools.Hard];
      let pointer = 0;
      while (selected.length < perSet && pointer < 1000) {
        const pool = fillOrder[pointer % fillOrder.length];
        const pulled = pullMany(pool, 1);
        if (pulled.length > 0) {
          selected.push(pulled[0]);
        }
        pointer += 1;
      }
    }

    const ordered = selected
      .sort((a, b) => {
        const diffA = difficultyOrder[a.difficultyLevel] || 99;
        const diffB = difficultyOrder[b.difficultyLevel] || 99;
        if (diffA !== diffB) {
          return diffA - diffB;
        }
        return a.questionId.localeCompare(b.questionId);
      })
      .slice(0, perSet);

    result.push({
      id: `SET-${String(i + 1).padStart(2, "0")}`,
      questions: ordered,
      distribution: countByDifficulty(ordered),
    });
  }

  return result;
}

function ensureQuotaFeasible(quota, remain, totalWanted) {
  const safeQuota = { ...quota };
  let assigned = safeQuota.Easy + safeQuota.Medium + safeQuota.Hard;

  ["Easy", "Medium", "Hard"].forEach((key) => {
    if (safeQuota[key] > remain[key]) {
      safeQuota[key] = remain[key];
    }
  });

  assigned = safeQuota.Easy + safeQuota.Medium + safeQuota.Hard;

  if (assigned < totalWanted) {
    const order = ["Medium", "Easy", "Hard"];
    let idx = 0;
    while (assigned < totalWanted && idx < 300) {
      const key = order[idx % order.length];
      if (safeQuota[key] < remain[key]) {
        safeQuota[key] += 1;
        assigned += 1;
      }
      idx += 1;
    }
  }

  return safeQuota;
}

function proportionalQuota(remain, totalWanted) {
  const total = remain.Easy + remain.Medium + remain.Hard;
  if (total === 0) {
    return { Easy: 0, Medium: 0, Hard: 0 };
  }

  const raw = {
    Easy: (remain.Easy / total) * totalWanted,
    Medium: (remain.Medium / total) * totalWanted,
    Hard: (remain.Hard / total) * totalWanted,
  };

  const quota = {
    Easy: Math.floor(raw.Easy),
    Medium: Math.floor(raw.Medium),
    Hard: Math.floor(raw.Hard),
  };

  let used = quota.Easy + quota.Medium + quota.Hard;
  const leftovers = ["Easy", "Medium", "Hard"].sort((a, b) => (raw[b] - quota[b]) - (raw[a] - quota[a]));
  let i = 0;
  while (used < totalWanted) {
    const key = leftovers[i % leftovers.length];
    quota[key] += 1;
    used += 1;
    i += 1;
  }

  return quota;
}

function pullMany(arr, count) {
  if (count <= 0) {
    return [];
  }
  return arr.splice(0, Math.min(count, arr.length));
}

function countByDifficulty(questions) {
  return questions.reduce(
    (acc, q) => {
      if (q.difficultyLevel in acc) {
        acc[q.difficultyLevel] += 1;
      }
      return acc;
    },
    { Easy: 0, Medium: 0, Hard: 0 }
  );
}

function renderSetMeta() {
  const idx = Number(state.selectedExamSetIndex || 0);
  const set = state.examSets[idx];
  if (!set) {
    ui.setMeta.textContent = "Hay chon mot dong bo de ben duoi.";
    return;
  }

  ui.setMeta.textContent = `Dang chon: ${set.id}`;
}

function renderExamSetsList() {
  const attempts = Array.isArray(state.historyAttempts) ? state.historyAttempts : [];
  const attemptsBySetId = {};

  attempts.forEach((attempt) => {
    if (!attemptsBySetId[attempt.setId]) {
      attemptsBySetId[attempt.setId] = [];
    }
    attemptsBySetId[attempt.setId].push(attempt);
  });

  const draftCount = Array.isArray(state.draftSetIds) ? state.draftSetIds.length : 0;
  if (ui.draftSummary) {
    if (draftCount > 0) {
      ui.draftSummary.innerHTML = `<span>📝 Bạn đang có <strong>${draftCount}</strong> bài làm dở. Hãy chọn bộ đề có biểu tượng 📝 để tiếp tục!</span>`;
      ui.draftSummary.style.display = "flex";
    } else {
      ui.draftSummary.style.display = "none";
    }
  }

  ui.examSetsList.innerHTML = "";
  const selectedIdx = Number(state.selectedExamSetIndex || 0);

  state.examSets.forEach((set, index) => {
    const card = document.createElement("div");
    card.className = "exam-set-card";
    if (index === selectedIdx) {
      card.classList.add("selected");
    }

    const attempts = attemptsBySetId[set.id] || [];
    const attempted = attempts.length > 0;
    const drafted = Array.isArray(state.draftSetIds) && state.draftSetIds.includes(set.id);
    if (attempted) {
      card.classList.add("attempted");
    }
    if (drafted) {
      card.classList.add("drafted");
    }
    const maxScore = attempted ? Math.max(...attempts.map((a) => a.score100)) : null;
    const latestScore = attempted ? attempts[attempts.length - 1].score100 : null;
    const latestDate = attempted ? formatDate(attempts[attempts.length - 1].submittedAt) : null;

    let statusHtml = "";
    if (attempted) {
      statusHtml = `<span class="exam-set-status done">Đã làm ${attempts.length} lần | Max: ${maxScore} | Last: ${latestScore}</span>`;
    } else if (drafted) {
      statusHtml = `<span class="exam-set-status draft">Đang làm dở</span>`;
    } else {
      statusHtml = `<span class="exam-set-status new">Chưa thi</span>`;
    }

    card.innerHTML = `
      <div class="exam-set-title">${set.id}</div>
      <div class="exam-set-meta">
        <span class="exam-set-meta-label">Phan bo:</span>
        <span>Easy ${set.distribution.Easy} | Medium ${set.distribution.Medium} | Hard ${set.distribution.Hard}</span>
      </div>
      ${statusHtml}
    `;

    card.addEventListener("click", () => {
      state.selectedExamSetIndex = index;
      renderSetMeta();
      renderExamSetsList();
    });

    ui.examSetsList.appendChild(card);
  });
}

async function startExam() {
  if (!state.currentUser) {
    alert("Ban chua dang nhap.");
    return;
  }

  const userId = state.currentUser.userId;
  const setIndex = Number(state.selectedExamSetIndex || 0);
  const selectedSet = state.examSets[setIndex];
  if (!selectedSet) {
    alert("Khong tim thay bo de.");
    return;
  }

  const draft = await readDraft(userId, selectedSet.id);
  const sessionQuestions = selectedSet.questions.map((q) => ({ ...q }));

  state.currentSession = {
    userId,
    setId: selectedSet.id,
    startedAt: (draft && draft.startedAt) ? draft.startedAt : new Date().toISOString(),
    questions: sessionQuestions,
    answers: (draft && typeof draft.answers === "object" && draft.answers) ? draft.answers : {},
    currentIndex: (draft && draft.currentIndex !== undefined) ? Math.min(Math.max(Number(draft.currentIndex) || 0, 0), selectedSet.questions.length - 1) : 0,
    submitted: false,
    result: null,
  };

  ui.examTitle.textContent = `Dang thi - ${selectedSet.id}`;
  ui.examMeta.textContent = `User: ${state.currentUser.userId} | So cau: ${sessionQuestions.length}`;

  renderQuestionNav();
  renderCurrentQuestion();
  showView("exam");
}

function renderQuestionNav() {
  const session = state.currentSession;
  if (!session) {
    return;
  }

  ui.questionNav.innerHTML = "";
  if (session.isPractice) {
    ui.questionNav.style.display = "none";
    return;
  }
  ui.questionNav.style.display = "grid";
  
  session.questions.forEach((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-btn";
    if (index === session.currentIndex) {
      button.classList.add("current");
    }
    if (isAnswered(index)) {
      const q = session.questions[index];
      const uAns = session.answers[q.questionId];
      const cAns = q.questionAnswers.filter((a) => a.correct).map((a) => a.id);
      if (checkCorrect(q, uAns, cAns)) {
        button.classList.add("correct");
      } else {
        button.classList.add("wrong");
      }
    }
    button.textContent = String(index + 1);
    button.addEventListener("click", () => {
      session.currentIndex = index;
      renderQuestionNav();
      renderCurrentQuestion();
    });
    ui.questionNav.appendChild(button);
  });
}

function renderCurrentQuestion() {
  const session = state.currentSession;
  if (!session) {
    return;
  }

  const index = session.currentIndex;
  const question = session.questions[index];
  if (!question) {
    return;
  }

  ui.questionIndexLabel.textContent = `Cau ${index + 1}/${session.questions.length}`;
  ui.difficultyBadge.textContent = question.difficultyLevel;
  ui.questionContent.innerHTML = formatQuestionContent(question.content);

  ui.answerArea.innerHTML = "";

  const currentAnswer = session.answers[question.questionId];
  if (question.type === "textAnswer") {
    const textarea = document.createElement("textarea");
    textarea.rows = 5;
    textarea.placeholder = "Nhap cau tra loi";
    textarea.value = typeof currentAnswer === "string" ? currentAnswer : "";
    textarea.addEventListener("input", () => {
      session.answers[question.questionId] = textarea.value;
      renderQuestionNav();
    });
    ui.answerArea.appendChild(textarea);
  } else {
    const isMultiple = question.type === "multipleChoice";
    const currentSet = new Set(Array.isArray(currentAnswer) ? currentAnswer : currentAnswer ? [currentAnswer] : []);

    question.questionAnswers.forEach((ans) => {
      const label = document.createElement("label");
      label.className = "option-item";

      const currentAns = session.answers[question.questionId];
      const isSelected = isMultiple 
        ? (Array.isArray(currentAns) && currentAns.includes(ans.id))
        : (currentAns === ans.id);

      if (isSelected) {
        if (ans.correct) {
          label.classList.add("feedback-correct");
        } else {
          label.classList.add("feedback-wrong");
        }
      } else if (!isMultiple && currentAns && ans.correct) {
        // For single choice, also show the correct one if user chose wrong
        label.classList.add("feedback-correct-indicator");
      }

      const input = document.createElement("input");
      input.type = isMultiple ? "checkbox" : "radio";
      input.name = `answer-${question.questionId}`;
      input.value = ans.id;
      input.checked = currentSet.has(ans.id);
      input.addEventListener("change", () => {
        if (isMultiple) {
          const selected = new Set(Array.isArray(session.answers[question.questionId]) ? session.answers[question.questionId] : []);
          if (input.checked) {
            selected.add(ans.id);
          } else {
            selected.delete(ans.id);
          }
          session.answers[question.questionId] = Array.from(selected);
        } else {
          session.answers[question.questionId] = input.checked ? ans.id : "";
        }
        renderQuestionNav();
        renderCurrentQuestion(); // Re-render to show feedback colors
      });

      const content = document.createElement("div");
      content.className = "option-content-text";
      content.innerHTML = formatQuestionContent(ans.content);

      label.appendChild(input);
      label.appendChild(content);
      ui.answerArea.appendChild(label);
    });
  }

  ui.prevBtn.style.display = session.isPractice ? "none" : "inline-flex";
  ui.nextBtn.style.display = session.isPractice ? "none" : "inline-flex";
  ui.reviewExamBtn.textContent = session.isPractice ? "Nộp bài luyện tập" : "Nộp bài thi";
  
  ui.prevBtn.disabled = index === 0;
  ui.nextBtn.disabled = index === session.questions.length - 1;
}

function isAnswered(index) {
  const session = state.currentSession;
  if (!session) {
    return false;
  }

  const question = session.questions[index];
  const value = session.answers[question.questionId];

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return false;
}

function moveQuestion(delta) {
  const session = state.currentSession;
  if (!session) {
    return;
  }
  session.currentIndex += delta;
  if (session.currentIndex < 0) {
    session.currentIndex = 0;
  }
  if (session.currentIndex > session.questions.length - 1) {
    session.currentIndex = session.questions.length - 1;
  }
  renderQuestionNav();
  renderCurrentQuestion();
}

async function submitForReview() {
  const session = state.currentSession;
  if (!session || session.submitted) {
    return;
  }

  const result = gradeSession(session);
  session.submitted = true;
  session.result = result;
  await persistAttempt(session);
  await clearDraft(session.userId, session.setId);
  renderResult(session);
  showView("result");
  void renderLeaderboard();
}

async function saveCurrentDraft(silent = false) {
  const session = state.currentSession;
  if (!session || session.submitted) {
    return;
  }

  const payload = {
    userId: session.userId,
    setId: session.setId,
    startedAt: session.startedAt,
    currentIndex: session.currentIndex,
    answers: session.answers,
    savedAt: new Date().toISOString(),
  };

  await writeDraft(payload);
  if (!state.draftSetIds.includes(session.setId)) {
    state.draftSetIds.push(session.setId);
  }
  
  if (!silent) {
    showView("setup");
  }
}

function gradeSession(session) {
  let correctCount = 0;
  let answeredCount = 0;
  const details = session.questions.map((question, idx) => {
    if (isAnswered(idx)) {
      answeredCount += 1;
    }
    const userAnswer = session.answers[question.questionId];
    const correctAnswers = question.questionAnswers.filter((ans) => ans.correct).map((ans) => ans.id);

    const isCorrect = checkCorrect(question, userAnswer, correctAnswers);
    if (isCorrect) {
      correctCount += 1;
    }

    return {
      index: idx + 1,
      questionId: question.questionId,
      difficultyLevel: question.difficultyLevel,
      questionContent: question.content,
      questionType: question.type,
      isCorrect,
      userAnswer,
      correctAnswers,
      options: question.questionAnswers,
    };
  });

  const total = session.questions.length;
  const wrongCount = total - correctCount;

  const byDifficulty = {
    Easy: { total: 0, correct: 0 },
    Medium: { total: 0, correct: 0 },
    Hard: { total: 0, correct: 0 },
  };

  details.forEach((d) => {
    byDifficulty[d.difficultyLevel].total += 1;
    if (d.isCorrect) {
      byDifficulty[d.difficultyLevel].correct += 1;
    }
  });

  return {
    submittedAt: new Date().toISOString(),
    total,
    answeredCount,
    correctCount,
    wrongCount,
    score100: Number(((correctCount / total) * 100).toFixed(2)),
    byDifficulty,
    details,
  };
}

function checkCorrect(question, userAnswer, correctAnswers) {
  if (question.type === "multipleChoice") {
    const user = new Set(Array.isArray(userAnswer) ? userAnswer : []);
    const correct = new Set(correctAnswers);
    if (user.size !== correct.size) {
      return false;
    }
    for (const id of correct) {
      if (!user.has(id)) {
        return false;
      }
    }
    return true;
  }

  if (question.type === "textAnswer") {
    const expected = stripHtmlById(question.questionAnswers.find((ans) => ans.correct)?.content || "").toLowerCase().trim();
    const actual = (typeof userAnswer === "string" ? userAnswer : "").toLowerCase().trim();
    return expected.length > 0 && actual === expected;
  }

  const selected = typeof userAnswer === "string" ? userAnswer : "";
  return correctAnswers.length === 1 && selected === correctAnswers[0];
}

function renderResult(session) {
  const { result } = session;
  ui.resultMeta.textContent = `User: ${session.userId} | Bo de: ${session.setId} | Cham: ${formatDate(result.submittedAt)}`;

  ui.reviewSummary.innerHTML = "";
  const summaryStats = [
    { label: "Tong cau", value: result.total },
    { label: "Dung", value: result.correctCount },
    { label: "Sai", value: result.wrongCount },
    { label: "Diem", value: `${result.score100}/100` },
  ];

  summaryStats.forEach((stat) => {
    const div = document.createElement("div");
    div.className = "review-stat";
    div.innerHTML = `<div class="review-stat-label">${stat.label}</div><div class="review-stat-value">${stat.value}</div>`;
    ui.reviewSummary.appendChild(div);
  });

  state.reviewIndex = 0;
  renderReviewNav(session);
  renderReviewQuestion(session);
}

function renderReviewNav(session) {
  if (!session || !session.result) {
    return;
  }

  const { result } = session;
  ui.reviewNav.innerHTML = "";

  result.details.forEach((detail, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-btn";

    if (index === state.reviewIndex) {
      button.classList.add("current");
    }

    if (detail.isCorrect) {
      button.classList.add("correct");
    } else {
      button.classList.add("wrong");
    }

    button.textContent = String(index + 1);
    button.addEventListener("click", () => {
      state.reviewIndex = index;
      renderReviewNav(session);
      renderReviewQuestion(session);
    });

    ui.reviewNav.appendChild(button);
  });
}

function renderReviewQuestion(session) {
  if (!session || !session.result) {
    return;
  }

  const { result } = session;
  const index = state.reviewIndex;
  const detail = result.details[index];

  if (!detail) {
    return;
  }

  const question = session.questions[index];
  ui.reviewIndexLabel.textContent = `Cau ${index + 1}/${result.total}`;
  ui.reviewDifficultyBadge.textContent = detail.difficultyLevel;
  ui.reviewQuestionContent.innerHTML = formatQuestionContent(detail.questionContent || (question ? question.content : ""));

  ui.reviewAnswerSection.innerHTML = "";

  const resultBadge = document.createElement("div");
  resultBadge.style.marginBottom = "10px";
  resultBadge.innerHTML = `<strong>Ket qua: </strong><span style="color: ${detail.isCorrect ? "#1f7a46" : "#b42318"}; font-weight: 700;">${detail.isCorrect ? "DUNG" : "SAI"}</span>`;
  ui.reviewAnswerSection.appendChild(resultBadge);

  if (question && question.type === "textAnswer") {
    const userBlock = document.createElement("div");
    userBlock.className = `review-answer-block ${detail.isCorrect ? "user-correct" : "user-wrong"}`;
    userBlock.innerHTML = `
      <span class="review-answer-label">Ban chon:</span>
      <div class="review-answer-content">${escapeHtml(typeof detail.userAnswer === "string" ? detail.userAnswer : "(bo trong)")}</div>
    `;
    ui.reviewAnswerSection.appendChild(userBlock);

    const correctBlock = document.createElement("div");
    correctBlock.className = "review-answer-block correct-answer";
    correctBlock.innerHTML = `
      <span class="review-answer-label">Đáp án đúng:</span>
      <div class="review-answer-content">${answerText(detail.options, detail.correctAnswers, "textAnswer")}</div>
    `;
    ui.reviewAnswerSection.appendChild(correctBlock);
  } else {
    const userAnswerIds = Array.isArray(detail.userAnswer) ? detail.userAnswer : detail.userAnswer ? [detail.userAnswer] : [];
    const correctAnswerIds = detail.correctAnswers || [];

    detail.options.forEach((option) => {
      const isUserSelected = userAnswerIds.includes(option.id);
      const isCorrectAnswer = correctAnswerIds.includes(option.id);

      const block = document.createElement("div");
      let blockClass = "review-answer-block";

      if (isCorrectAnswer) {
        blockClass += " correct-answer";
      } else if (isUserSelected && !isCorrectAnswer) {
        blockClass += " user-wrong";
      }

      const label = isCorrectAnswer
        ? "✓ Đáp án đúng"
        : isUserSelected
          ? "✗ Bạn chọn (sai)"
          : "Không chọn";

      block.className = blockClass;
      block.innerHTML = `
        <span class="review-answer-label">${label}</span>
        <div class="review-answer-content">${formatQuestionContent(option.content)}</div>
      `;
      ui.reviewAnswerSection.appendChild(block);
    });
  }

  ui.reviewPrevBtn.disabled = index === 0;
  ui.reviewNextBtn.disabled = index === result.details.length - 1;
}

function moveReviewQuestion(delta) {
  const session = state.currentSession;
  if (!session || !session.result) {
    return;
  }

  state.reviewIndex += delta;
  const maxIndex = session.result.details.length - 1;
  if (state.reviewIndex < 0) {
    state.reviewIndex = 0;
  }
  if (state.reviewIndex > maxIndex) {
    state.reviewIndex = maxIndex;
  }

  renderReviewNav(session);
  renderReviewQuestion(session);
}

function answerText(options, answerValue, type) {
  if (type === "textAnswer") {
    return escapeHtml(typeof answerValue === "string" ? answerValue : "");
  }

  const values = Array.isArray(answerValue) ? answerValue : typeof answerValue === "string" && answerValue ? [answerValue] : [];

  if (values.length === 0) {
    return "";
  }

  return values
    .map((id) => options.find((op) => op.id === id))
    .filter(Boolean)
    .map((op) => op.content)
    .join("; ");
}

async function renderHistory() {
  if (!state.currentUser) {
    state.historyAttempts = [];
    ui.historySummary.style.display = "none";
    ui.historyContainer.className = "history-container empty";
    ui.historyContainer.textContent = "Ban chua dang nhap.";
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/users/${encodeURIComponent(state.currentUser.userId)}/attempts`);
    if (!response.ok) {
      throw new Error("Khong the tai lich su thi.");
    }

    const payload = await response.json();
    const attempts = Array.isArray(payload.attempts) ? payload.attempts : [];
    state.historyAttempts = attempts;

    if (attempts.length === 0) {
      ui.historySummary.style.display = "none";
      ui.historyContainer.className = "history-container empty";
      ui.historyContainer.textContent = "Ban chua lam bai thi nao.";
      renderExamSetsList();
      return;
    }

  const maxScore = Math.max(...attempts.map((a) => a.score100));
  const avgScore = (attempts.reduce((sum, a) => sum + a.score100, 0) / attempts.length).toFixed(2);

  ui.historySummary.style.display = "grid";
  document.getElementById("totalAttempts").textContent = attempts.length;
  document.getElementById("maxScore").textContent = maxScore;
  document.getElementById("avgScore").textContent = avgScore;

  ui.historyContainer.className = "history-container";
  ui.historyContainer.innerHTML = "";

  attempts
    .slice()
    .reverse()
    .forEach((at, idx) => {
      const row = document.createElement("div");
      row.className = "history-row";

      const info = document.createElement("div");
      info.className = "history-row-info";
      info.innerHTML = `
        <span class="history-row-number">Lần #${idx + 1}</span>
        <div class="history-row-details">
          <div class="history-row-detail-item"><strong>Bộ đề:</strong> ${at.setId}</div>
          <div class="history-row-detail-item"><strong>Điểm:</strong> ${at.score100}/100 (${at.correctCount}/${at.total} đúng)</div>
          <div class="history-row-detail-item"><strong>Nộp:</strong> ${formatDate(at.submittedAt)}</div>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "history-row-actions";
      const viewBtn = document.createElement("button");
      viewBtn.className = "btn btn-soft";
      viewBtn.type = "button";
      viewBtn.textContent = "Xem chi tiết";
      viewBtn.style.padding = "6px 10px";
      viewBtn.style.fontSize = "0.85rem";
      viewBtn.addEventListener("click", () => {
        showAttemptDetail(at, idx + 1);
      });

      actions.appendChild(viewBtn);

      row.appendChild(info);
      row.appendChild(actions);
      ui.historyContainer.appendChild(row);
    });

    renderExamSetsList();
  } catch (error) {
    state.historyAttempts = [];
    ui.historySummary.style.display = "none";
    ui.historyContainer.className = "history-container empty";
    ui.historyContainer.textContent = error.message || "Khong the tai lich su thi.";
    renderExamSetsList();
  }
}

function showAttemptDetail(attempt, attemptNumber) {
  ui.attemptModalTitle.textContent = `Chi tiet - Lan ${attemptNumber}: ${attempt.setId}`;

  ui.attemptModalBody.innerHTML = "";

  const stats = document.createElement("div");
  stats.className = "attempt-detail-stat";
  stats.innerHTML = `
    <div class="attempt-detail-card">
      <div class="attempt-detail-label">Tổng câu</div>
      <div class="attempt-detail-value">${attempt.total}</div>
    </div>
    <div class="attempt-detail-card">
      <div class="attempt-detail-label">Đúng</div>
      <div class="attempt-detail-value" style="color: #1f7a46;">${attempt.correctCount}</div>
    </div>
    <div class="attempt-detail-card">
      <div class="attempt-detail-label">Sai</div>
      <div class="attempt-detail-value" style="color: #b42318;">${attempt.wrongCount}</div>
    </div>
    <div class="attempt-detail-card">
      <div class="attempt-detail-label">Điểm</div>
      <div class="attempt-detail-value">${attempt.score100}/100</div>
    </div>
  `;
  ui.attemptModalBody.appendChild(stats);

  const timeInfo = document.createElement("div");
  timeInfo.style.fontSize = "0.9rem";
  timeInfo.style.color = "var(--muted)";
  timeInfo.style.marginBottom = "12px";
  timeInfo.innerHTML = `<strong>Thời gian nộp:</strong> ${formatDate(attempt.submittedAt)}`;
  ui.attemptModalBody.appendChild(timeInfo);

  if (attempt.details && Array.isArray(attempt.details) && attempt.details.length > 0) {
    const detailsTitle = document.createElement("h4");
    detailsTitle.textContent = "Chi tiết từng câu";
    detailsTitle.style.marginTop = "12px";
    detailsTitle.style.marginBottom = "8px";
    ui.attemptModalBody.appendChild(detailsTitle);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(40px, 1fr))";
    grid.style.gap = "4px";

    attempt.details.forEach((detail) => {
      const cell = document.createElement("div");
      cell.style.display = "flex";
      cell.style.alignItems = "center";
      cell.style.justifyContent = "center";
      cell.style.borderRadius = "6px";
      cell.style.padding = "6px";
      cell.style.fontSize = "0.85rem";
      cell.style.fontWeight = "700";
      cell.style.border = "1px solid var(--line)";

      if (detail.isCorrect) {
        cell.style.background = "#d4f1e0";
        cell.style.borderColor = "#1f7a46";
        cell.style.color = "#1f7a46";
      } else {
        cell.style.background = "#fce6e3";
        cell.style.borderColor = "#b42318";
        cell.style.color = "#b42318";
      }

      cell.textContent = detail.index;
      cell.title = `Cau ${detail.index}: ${detail.isCorrect ? "Dung" : "Sai"} (${detail.difficultyLevel})`;

      grid.appendChild(cell);
    });

    ui.attemptModalBody.appendChild(grid);
  }

  ui.attemptDetailModal.style.display = "flex";
}

async function persistAttempt(session) {
  const userId = session.userId;
  const resultDetails = session.result.details.map((d) => ({
    index: d.index,
    isCorrect: d.isCorrect,
    difficultyLevel: d.difficultyLevel,
  }));

  await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/attempts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      setId: session.setId,
      startedAt: session.startedAt,
      submittedAt: session.result.submittedAt,
      total: session.result.total,
      answeredCount: session.result.answeredCount,
      correctCount: session.result.correctCount,
      wrongCount: session.result.wrongCount,
      score100: session.result.score100,
      details: resultDetails,
    }),
  });
}

async function clearHistory(userId) {
  await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/attempts`, {
    method: "DELETE",
  });

  await clearCandidateDrafts(userId);
  state.historyAttempts = [];
  state.draftSetIds = [];
}

async function writeDraft(draftPayload) {
  await fetch(`${API_BASE}/users/${encodeURIComponent(draftPayload.userId)}/drafts/${encodeURIComponent(draftPayload.setId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(draftPayload),
  });
}

async function readDraft(userId, setId) {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/drafts/${encodeURIComponent(setId)}`);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return payload.draft || null;
}

async function clearDraft(userId, setId) {
  await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/drafts/${encodeURIComponent(setId)}`, {
    method: "DELETE",
  });
  state.draftSetIds = state.draftSetIds.filter((id) => id !== setId);
}

async function clearCandidateDrafts(userId) {
  await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/drafts`, {
    method: "DELETE",
  });
  state.draftSetIds = [];
}

function showView(viewName) {
  ui.loginView.classList.remove("active");
  ui.setupView.classList.remove("active");
  ui.historyView.classList.remove("active");
  ui.examView.classList.remove("active");
  ui.resultView.classList.remove("active");
  ui.leaderboardView.classList.remove("active");

  ui.navHomeBtn.classList.remove("active");
  ui.navHistoryBtn.classList.remove("active");
  ui.navLeaderboardBtn.classList.remove("active");

  if (viewName === "login") {
    ui.loginView.classList.add("active");
    ui.mainNav.style.display = "none";
    return;
  }

  ui.mainNav.style.display = "flex";

  if (viewName === "setup") {
    ui.setupView.classList.add("active");
    ui.navHomeBtn.classList.add("active");
    updateUserInfo();
    renderExamSetsList();
    renderHistory();
    return;
  }

  if (viewName === "history") {
    ui.historyView.classList.add("active");
    ui.navHistoryBtn.classList.add("active");
    renderHistory();
    return;
  }

  if (viewName === "leaderboard") {
    ui.leaderboardView.classList.add("active");
    ui.navLeaderboardBtn.classList.add("active");
    renderLeaderboard();
    return;
  }

  if (viewName === "exam") {
    ui.examView.classList.add("active");
    ui.mainNav.style.display = "none"; // Hide nav during exam
    return;
  }

  ui.resultView.classList.add("active");
}

function sanitizeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 60);
}

function stripHtmlById(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch (_) {
    return iso;
  }
}

function seededShuffle(arr, seed) {
  const clone = arr.slice();
  const rand = mulberry32(seed);
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function mulberry32(a) {
  return function random() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatQuestionContent(html) {
  if (!html) return "";

  const safeTags = [
    "p", "br", "b", "i", "u", "strong", "em", "span", "div",
    "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
    "img", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
    "pre", "code", "sub", "sup", "hr"
  ];

  const temp = document.createElement("div");
  temp.innerHTML = html;

  const processNode = (node) => {
    if (node.nodeType === 1) { // Element
      const tagName = node.tagName.toLowerCase();
      if (!safeTags.includes(tagName)) {
        // Escape this non-standard tag
        const textNode = document.createTextNode(node.outerHTML);
        node.parentNode.replaceChild(textNode, node);
      } else {
        // Standard tag, process children
        Array.from(node.childNodes).forEach(processNode);
      }
    }
  };

  Array.from(temp.childNodes).forEach(processNode);
  return temp.innerHTML;
}

function handleSearch(query) {
  if (!query || query.trim().length < 2) {
    ui.searchResults.style.display = "none";
    return;
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matches = state.allQuestions.filter(q => 
    q.content.toLowerCase().includes(normalizedQuery) || 
    q.questionAnswers.some(a => a.content.toLowerCase().includes(normalizedQuery))
  ).slice(0, 15);

  if (matches.length === 0) {
    ui.searchResults.innerHTML = `<div class="search-no-results">Không tìm thấy câu hỏi nào phù hợp.</div>`;
  } else {
    ui.searchResults.innerHTML = matches.map(q => {
      const setIndex = state.examSets.findIndex(set => set.questions.some(sq => sq.questionId === q.questionId));
      const setName = setIndex !== -1 ? `Bộ đề ${setIndex + 1}` : "Không xác định";
      
      return `
        <div class="search-item" onclick="startQuickPractice('${q.questionId}')">
          <div class="search-item-header">
            <span>${setName}</span>
            <span class="difficulty-tag ${q.difficultyLevel.toLowerCase()}">${q.difficultyLevel}</span>
          </div>
          <div class="search-item-content">${q.content.replace(/<[^>]*>?/gm, '')}</div>
        </div>
      `;
    }).join("");
  }
  ui.searchResults.style.display = "block";
}

window.startQuickPractice = async (questionId) => {
  const question = state.allQuestions.find(q => q.questionId === questionId);
  if (!question) return;

  const userId = state.currentUser.userId;
  
  // Tạo session chỉ có 1 câu hỏi
  state.currentSession = {
    userId,
    setId: "LUYEN-TAP-NHANH",
    startedAt: new Date().toISOString(),
    questions: [{ ...question }],
    answers: {},
    currentIndex: 0,
    submitted: false,
    result: null,
    isPractice: true
  };

  ui.examTitle.textContent = `Luyện tập nhanh - ${questionId.slice(0, 8)}...`;
  ui.examMeta.textContent = `Chế độ luyện tập 1 câu hỏi`;

  renderQuestionNav();
  renderCurrentQuestion();
  showView("exam");
  
  ui.searchResults.style.display = "none";
  ui.questionSearch.value = "";
};

window.selectSearchSet = async (index, questionId) => {
  if (index === -1) return;
  
  // Hiển thị loading nhẹ
  ui.questionSearch.value = "Đang chuyển đến câu hỏi...";
  
  state.selectedExamSetIndex = index;
  renderExamSetsList();
  renderSetMeta();

  // Bắt đầu thi cho bộ đề này
  await startExam();

  // Tìm và nhảy đến câu hỏi cụ thể
  if (state.currentSession && questionId) {
    const qIndex = state.currentSession.questions.findIndex(q => q.questionId === questionId);
    if (qIndex !== -1) {
      state.currentSession.currentIndex = qIndex;
      renderQuestionNav();
      renderCurrentQuestion();
    }
  }

  ui.searchResults.style.display = "none";
  ui.questionSearch.value = "";
};
