const historyQuestions = window.HISTORY_HUNT_QUESTIONS || [];

const ROUND_COUNT = 5;
const DIFFICULTY_LEVELS = ["easy", "medium", "hard"];

const DEFAULT_AVATAR =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#d6a641" />
          <stop offset="100%" stop-color="#8f1d1d" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="28" fill="url(#g)" />
      <circle cx="80" cy="58" r="28" fill="rgba(255,245,221,0.85)" />
      <path d="M34 136c10-26 28-40 46-40s36 14 46 40" fill="rgba(255,245,221,0.85)" />
    </svg>
  `);

const TOKEN_KEY = "historyHuntPH.token";
const RUN_KEY = "historyHuntPH.currentRun";
const PERSONAL_BEST_KEY = "historyHuntPH.personalBest";
const NETWORK_ERROR_MESSAGE =
  "Could not reach the backend. Start the app with `npm.cmd start` and open it through http://localhost:3000.";

const VIEW_META = {
  game: {
    tag: "Archive Mission",
    title: "Game",
    intro: "Focus on the clue, answer within 3 tries, and earn score and hint coins."
  },
  profile: {
    tag: "Player Profile",
    title: "Profile",
    intro: "Manage your public identity and keep your account ready for the leaderboard."
  },
  leaderboard: {
    tag: "Hall of Fame",
    title: "Leaderboard",
    intro: "See the top players, best scores, and longest streaks without reloading the app."
  }
};

const state = {
  token: window.localStorage.getItem(TOKEN_KEY) || "",
  user: null,
  isGuest: false,
  profileReady: false,
  pendingProfileImage: "",
  difficulty: "easy",
  activeView: "game",
  questions: buildQuestionRun("easy"),
  currentIndex: 0,
  attemptsLeft: 3,
  score: 0,
  coins: 0,
  solved: 0,
  streak: 0,
  roundLocked: false
};

restoreSavedRun();

const pageName = document.body.dataset.page || "home";
const isStandalonePage = pageName !== "home";
const authScreen = document.querySelector("#auth-screen");
const appShell = document.querySelector("#app-shell");
const authElements = {
  guestPlayButton: document.querySelector("#guest-play-button"),
  heroLoginButton: document.querySelector("#hero-login-button"),
  loginPanel: document.querySelector("#login-panel"),
  registerPanel: document.querySelector("#register-panel"),
  loginForm: document.querySelector("#login-form"),
  registerForm: document.querySelector("#register-form"),
  loginUsername: document.querySelector("#login-username-input"),
  loginPassword: document.querySelector("#login-password-input"),
  registerUsername: document.querySelector("#register-username-input"),
  registerPassword: document.querySelector("#register-password-input"),
  registerRepeatPassword: document.querySelector("#register-repeat-password-input"),
  showRegisterButton: document.querySelector("#show-register-button"),
  showLoginButton: document.querySelector("#show-login-button"),
  registerButton: document.querySelector("#register-button"),
  loginButton: document.querySelector("#login-button"),
  passwordToggles: Array.from(document.querySelectorAll("[data-toggle-password]")),
  feedback: document.querySelector("#auth-feedback")
};

const navElements = {
  buttons: Array.from(document.querySelectorAll(".menu-link[data-view]")),
  profileButton: document.querySelector('.menu-link[data-view="profile"]'),
  logoutButton: document.querySelector("#logout-button")
};

const shellHeader = {
  tag: document.querySelector("#section-tag"),
  title: document.querySelector("#section-title"),
  intro: document.querySelector("#section-intro")
};

const views = {
  game: document.querySelector("#view-game"),
  profile: document.querySelector("#view-profile"),
  leaderboard: document.querySelector("#view-leaderboard")
};

const sharedElements = {
  leaderboardBody: document.querySelector("#leaderboard-body")
};

const gameElements = {
  image: document.querySelector("#history-image"),
  cardFrame: document.querySelector(".card-frame"),
  contentPanel: document.querySelector(".content-panel"),
  roundLabel: document.querySelector("#round-label"),
  attemptsLabel: document.querySelector("#attempts-label"),
  title: document.querySelector("#prompt-title"),
  description: document.querySelector("#prompt-description"),
  form: document.querySelector("#guess-form"),
  input: document.querySelector("#guess-input"),
  submitButton: document.querySelector("#guess-form button"),
  feedback: document.querySelector("#feedback"),
  hintButton: document.querySelector("#hint-button"),
  hintText: document.querySelector("#hint-text"),
  nextButton: document.querySelector("#next-question-button"),
  saveRunButton: document.querySelector("#save-run-button"),
  playerStatus: document.querySelector("#player-status-label"),
  progressLabel: document.querySelector("#mission-progress-label"),
  progressBar: document.querySelector("#mission-progress-bar"),
  difficultyLabel: document.querySelector("#difficulty-label"),
  score: document.querySelector("#score-value"),
  coins: document.querySelector("#coins-value"),
  solved: document.querySelector("#solved-value"),
  streak: document.querySelector("#streak-value")
};

const gameOverElements = {
  modal: document.querySelector("#game-over-modal"),
  message: document.querySelector("#game-over-message"),
  score: document.querySelector("#game-over-score"),
  solved: document.querySelector("#game-over-solved"),
  rank: document.querySelector("#game-over-rank"),
  best: document.querySelector("#game-over-best"),
  rankCopy: document.querySelector("#game-over-rank-copy"),
  retryButton: document.querySelector("#game-over-retry-button"),
  shareButton: document.querySelector("#game-over-share-button"),
  leaderboardButton: document.querySelector("#game-over-leaderboard-button")
};

const profileElements = {
  avatar: document.querySelector("#profile-view-avatar"),
  name: document.querySelector("#profile-view-name"),
  username: document.querySelector("#profile-view-username"),
  gender: document.querySelector("#profile-view-gender"),
  bestScore: document.querySelector("#profile-best-score"),
  bestSolved: document.querySelector("#profile-best-solved"),
  bestStreak: document.querySelector("#profile-best-streak"),
  coins: document.querySelector("#profile-coins"),
  form: document.querySelector("#profile-form"),
  gameNameInput: document.querySelector("#game-name-input"),
  genderInput: document.querySelector("#gender-input"),
  imageInput: document.querySelector("#profile-image-input"),
  preview: document.querySelector("#profile-preview"),
  feedback: document.querySelector("#profile-feedback")
};

let transitionTimer = null;
let autoAdvanceTimer = null;

bindEvents();
initialize();

function bindEvents() {
  authElements.guestPlayButton?.addEventListener("click", startGuestRun);
  authElements.heroLoginButton?.addEventListener("click", () => {
    document.querySelector(".auth-card-primary")?.scrollIntoView({ behavior: "smooth", block: "center" });
    authElements.loginUsername?.focus();
  });
  authElements.showRegisterButton?.addEventListener("click", () => switchAuthMode("register"));
  authElements.showLoginButton?.addEventListener("click", () => switchAuthMode("login"));
  authElements.passwordToggles.forEach((button) => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
  authElements.loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleLogin();
  });
  authElements.registerForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleRegister();
  });
  navElements.buttons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  navElements.logoutButton?.addEventListener("click", logoutUser);
  gameElements.form?.addEventListener("submit", handleGuessSubmit);
  gameElements.hintButton?.addEventListener("click", handleBuyHint);
  gameElements.nextButton?.addEventListener("click", moveToNextQuestion);
  gameElements.saveRunButton?.addEventListener("click", promptSaveRun);
  gameOverElements.retryButton?.addEventListener("click", restartAfterGameOver);
  gameOverElements.shareButton?.addEventListener("click", copyGameOverResult);
  gameOverElements.leaderboardButton?.addEventListener("click", () => {
    closeGameOverModal();
    switchView("leaderboard");
    refreshLeaderboard().catch(() => {});
  });
  profileElements.imageInput?.addEventListener("change", handleProfileImageChange);
  profileElements.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProfile();
  });
}

async function initialize() {
  if (profileElements.preview) {
    profileElements.preview.src = DEFAULT_AVATAR;
  }

  if (!isStandalonePage) {
    switchAuthMode("login");
    renderQuestion();
    switchView("game");

    try {
      await refreshLeaderboard();
    } catch {
      setAuthFeedback(NETWORK_ERROR_MESSAGE, "error");
    }
  }

  if (!state.token) {
    if (state.isGuest && state.questions.length) {
      state.user = {
        id: "guest",
        username: "guest",
        gameName: "Guest Player",
        gender: "",
        avatar: "",
        bestScore: 0,
        bestSolved: 0,
        bestStreak: 0
      };
      state.profileReady = true;
      showShell();
      updateGuestNavigation();
      switchView("game");
      renderQuestion();
      updateGameStats();
      setGameplayAvailability();
      return;
    }
    if (isStandalonePage) {
      window.location.href = "/";
    }
    return;
  }

  try {
    const { user } = await apiRequest("/api/auth/me");
    applyUser(user);
    state.isGuest = false;
    updateProfilePage();
    showShell();
    updateGuestNavigation();

    if (!state.profileReady) {
      if (isStandalonePage && pageName !== "profile") {
        window.location.href = "/profile.html";
        return;
      }
      switchView("profile");
      setProfileFeedback("Complete your profile to unlock the game.", "error");
      setGameplayAvailability();
      return;
    }

    switchView(isStandalonePage ? pageName : "game");
    renderQuestion();
    updateGameStats();
    setGameplayAvailability();
    if (pageName === "leaderboard") {
      await refreshLeaderboard();
    }
  } catch {
    clearToken();
    if (isStandalonePage) {
      window.location.href = "/";
    }
  }
}

async function handleLogin() {
  const username = authElements.loginUsername?.value.trim() || "";
  const password = authElements.loginPassword?.value.trim() || "";

  if (!username || !password) {
    setAuthFeedback("Enter both username and password.", "error");
    return;
  }

  try {
    const result = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { username, password }
    }, false);

    saveToken(result.token);
    applyUser(result.user);
    state.isGuest = false;
    state.difficulty = getDifficultyForStreak(state.streak);
    if (!restoreSavedRun()) {
      state.questions = buildQuestionRun(state.difficulty);
      state.currentIndex = 0;
      saveCurrentRun();
    }
    authElements.loginForm?.reset();
    authElements.registerForm?.reset();
    updateProfilePage();
    showShell();
    updateGuestNavigation();

    if (!state.profileReady) {
      switchView("profile");
      setProfileFeedback("Complete your profile to start playing.", "success");
    } else {
      switchView("game");
      renderQuestion();
      updateGameStats();
    }
  } catch (error) {
    setAuthFeedback(error.message || "Could not complete that request.", "error");
  }
}

async function handleRegister() {
  const username = authElements.registerUsername?.value.trim() || "";
  const password = authElements.registerPassword?.value.trim() || "";
  const repeatPassword = authElements.registerRepeatPassword?.value.trim() || "";

  if (!username || !password || !repeatPassword) {
    setAuthFeedback("Complete username, password, and repeat password.", "error");
    return;
  }

  if (password !== repeatPassword) {
    setAuthFeedback("Passwords do not match.", "error");
    return;
  }

  try {
    const result = await apiRequest("/api/auth/register", {
      method: "POST",
      body: { username, password }
    }, false);

    saveToken(result.token);
    applyUser(result.user);
    state.isGuest = false;
    state.difficulty = getDifficultyForStreak(state.streak);
    if (!restoreSavedRun()) {
      state.questions = buildQuestionRun(state.difficulty);
      state.currentIndex = 0;
      saveCurrentRun();
    }
    authElements.loginForm?.reset();
    authElements.registerForm?.reset();
    updateProfilePage();
    showShell();
    updateGuestNavigation();
    switchAuthMode("login");

    if (!state.profileReady) {
      switchView("profile");
      setProfileFeedback("Complete your profile to start playing.", "success");
    } else {
      switchView("game");
      renderQuestion();
      updateGameStats();
    }
  } catch (error) {
    setAuthFeedback(error.message || "Could not complete that request.", "error");
  }
}

function logoutUser() {
  clearToken();
  state.user = null;
  state.isGuest = false;
  state.profileReady = false;
  state.pendingProfileImage = "";
  state.activeView = "game";
    state.score = 0;
  state.coins = 0;
  state.solved = 0;
  state.streak = 0;
  state.attemptsLeft = 3;
  state.roundLocked = false;
  state.currentIndex = 0;
  state.difficulty = getDifficultyForStreak(state.streak);
  state.questions = buildQuestionRun(state.difficulty);
  saveCurrentRun();

  if (autoAdvanceTimer) {
    window.clearTimeout(autoAdvanceTimer);
  }
  if (transitionTimer) {
    window.clearTimeout(transitionTimer);
  }

  authElements.loginForm?.reset();
  authElements.registerForm?.reset();
  clearSavedRun();
  switchAuthMode("login");
  if (isStandalonePage) {
    window.location.href = "/";
    return;
  }
  if (authScreen) {
    authScreen.hidden = false;
  }
  if (appShell) {
    appShell.hidden = true;
  }
  updateGuestNavigation();
  switchView("game");
  renderQuestion();
  updateGameStats();
  updateProfilePage();
  setGameplayAvailability();
  setAuthFeedback("Logged out. Register or log in to continue playing.", "success");
}

function startGuestRun() {
  state.isGuest = true;
  state.user = {
    id: "guest",
    username: "guest",
    gameName: "Guest Player",
    gender: "",
    avatar: "",
    bestScore: 0,
    bestSolved: 0,
    bestStreak: 0
  };
  state.profileReady = true;
  state.pendingProfileImage = "";
  state.score = 0;
  state.coins = 0;
  state.solved = 0;
  state.streak = 0;
  state.currentIndex = 0;
  state.attemptsLeft = 3;
  state.roundLocked = false;
  state.difficulty = getDifficultyForStreak(state.streak);
  state.questions = buildQuestionRun(state.difficulty);
  saveCurrentRun();
  showShell();
  updateGuestNavigation();
  switchView("game");
  renderQuestion();
  updateGameStats();
  setGameplayAvailability();
}

async function handleGuessSubmit(event) {
  event.preventDefault();

  if (!state.user || !state.profileReady || state.roundLocked) {
    return;
  }

  const question = state.questions[state.currentIndex];
  const guess = normalizeText(gameElements.input?.value || "");

  if (!guess) {
    showGameFeedback("Type an answer before submitting your guess.", "error");
    return;
  }

  if (isCorrectGuess(guess, question)) {
    const earnedPoints = getPointsForAttempt(state.attemptsLeft);
    const previousDifficulty = state.difficulty;
    state.score += earnedPoints;
    state.coins += earnedPoints;
    state.solved += 1;
    state.streak += 1;
    state.difficulty = getDifficultyForStreak(state.streak);
    state.roundLocked = true;
    await persistProgress();
    saveCurrentRun();
    const levelUpMessage = state.difficulty !== previousDifficulty
      ? ` Level up: ${formatDifficulty(state.difficulty)} questions unlocked.`
      : "";
    showGameFeedback(
      `Correct. The answer is ${question.answer}. You earned ${earnedPoints} point${earnedPoints === 1 ? "" : "s"} and ${earnedPoints} hint coin${earnedPoints === 1 ? "" : "s"}.${levelUpMessage}`,
      "success"
    );
    lockRound();
    updateGameStats();
    showRoundActions(true);
    autoAdvanceTimer = window.setTimeout(moveToNextQuestion, 80);
    return;
  }

  state.attemptsLeft -= 1;
  gameElements.attemptsLabel.textContent = `Attempts left: ${state.attemptsLeft}`;

  if (state.attemptsLeft <= 0) {
    state.streak = 0;
    state.difficulty = getDifficultyForStreak(state.streak);
    state.roundLocked = true;
    await persistProgress();
    saveCurrentRun();
    showGameFeedback(`No more attempts. The correct answer was ${question.answer}. Your streak has ended.`, "error");
    lockRound();
    updateGameStats();
    showRoundActions(false);
    await showGameOver(question);
    return;
  }

  showGameFeedback(`Not quite. Try again. You still have ${state.attemptsLeft} attempts left.`, "error");
  saveCurrentRun();
  updateGameStats();
  gameElements.input?.select();
}

async function handleBuyHint() {
  if (!state.user || !state.profileReady || state.roundLocked) {
    return;
  }

  const question = state.questions[state.currentIndex];
  const revealedHints = Number.parseInt(gameElements.hintButton?.dataset.revealedHints || "0", 10);

  if (revealedHints >= question.hints.length) {
    gameElements.hintText.textContent = "No more hints available for this question.";
    return;
  }

  if (state.coins < 3) {
    gameElements.hintText.textContent = "You need at least 3 hint coins to buy a hint.";
    return;
  }

  state.coins -= 3;
  gameElements.hintText.textContent = question.hints[revealedHints];
  gameElements.hintButton.dataset.revealedHints = String(revealedHints + 1);
  await persistProgress();
  saveCurrentRun();
  updateGameStats();
}

async function handleProfileImageChange(event) {
  const file = event.target.files?.[0];

  if (!file) {
    state.pendingProfileImage = state.user?.avatar || "";
    profileElements.preview.src = state.pendingProfileImage || DEFAULT_AVATAR;
    return;
  }

  try {
    state.pendingProfileImage = await readFileAsDataUrl(file);
    profileElements.preview.src = state.pendingProfileImage;
    setProfileFeedback("Profile image ready.", "success");
  } catch {
    setProfileFeedback("Could not read that image. Please try another file.", "error");
  }
}

async function saveProfile() {
  if (!state.user) {
    return;
  }

  const gameName = profileElements.gameNameInput?.value.trim() || "";
  const gender = profileElements.genderInput?.value.trim() || "";
  const avatar = state.pendingProfileImage || state.user.avatar || "";

  if (!gameName || gameName.length < 3) {
    setProfileFeedback("Game name must be at least 3 characters.", "error");
    return;
  }

  if (!gender) {
    setProfileFeedback("Select a gender to continue.", "error");
    return;
  }

  if (!avatar) {
    setProfileFeedback("Upload a profile image to continue.", "error");
    return;
  }

  try {
    const { user } = await apiRequest("/api/profile", {
      method: "PUT",
      body: { gameName, gender, avatar }
    });
    applyUser(user);
    updateProfilePage();
    await refreshLeaderboard();
    setProfileFeedback("Profile saved successfully.", "success");
    if (state.profileReady) {
      switchView("game");
      renderQuestion();
      updateGameStats();
    }
  } catch (error) {
    setProfileFeedback(error.message || "Could not save your profile.", "error");
  }
}

function renderQuestion() {
  if (!gameElements.image || !gameElements.roundLabel || !gameElements.attemptsLabel) {
    return;
  }

  const question = state.questions[state.currentIndex];

  if (transitionTimer) {
    window.clearTimeout(transitionTimer);
  }

  gameElements.cardFrame?.classList.add("is-transitioning");
  gameElements.contentPanel?.classList.add("is-transitioning");
  gameElements.roundLabel.textContent = `Round ${state.currentIndex + 1}`;
  gameElements.attemptsLabel.textContent = `Attempts left: ${state.attemptsLeft}`;
  gameElements.title.textContent = question.title;
  gameElements.description.textContent = question.description;
  gameElements.image.alt = `Historical image clue for ${question.title}`;
  gameElements.image.classList.add("is-loading");
  gameElements.image.src = createQuestionPlaceholder(question);
  loadQuestionImage(question);
  gameElements.feedback.textContent = "Look closely at the image and clue, then enter your answer. First try gives 3 points, second try gives 2, third try gives 0.";
  gameElements.feedback.className = "feedback";
  gameElements.hintText.textContent = "Earn points from correct answers to unlock hints in later rounds.";
  gameElements.hintButton.dataset.revealedHints = "0";
  gameElements.input.value = "";
  showRoundActions(state.roundLocked);
  updateGameStats();
  setGameplayAvailability();
  if (state.roundLocked) {
    lockRound();
  }

  transitionTimer = window.setTimeout(() => {
    gameElements.cardFrame?.classList.remove("is-transitioning");
    gameElements.contentPanel?.classList.remove("is-transitioning");
    if (state.activeView === "game" && state.profileReady) {
      gameElements.input.focus();
    }
  }, 120);
}

function loadQuestionImage(question) {
  const image = new Image();
  let fallbackTimer = window.setTimeout(() => {
    if (state.questions[state.currentIndex] === question && gameElements.image) {
      gameElements.image.classList.remove("is-loading");
    }
  }, 900);

  image.onload = () => {
    window.clearTimeout(fallbackTimer);
    if (state.questions[state.currentIndex] !== question || !gameElements.image) {
      return;
    }
    gameElements.image.src = question.image;
    gameElements.image.classList.remove("is-loading");
  };
  image.onerror = () => {
    window.clearTimeout(fallbackTimer);
    if (state.questions[state.currentIndex] === question && gameElements.image) {
      gameElements.image.src = createQuestionPlaceholder(question);
      gameElements.image.classList.remove("is-loading");
    }
  };
  image.referrerPolicy = "no-referrer";
  image.src = question.image;
}

function moveToNextQuestion() {
  if (autoAdvanceTimer) {
    window.clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  state.currentIndex += 1;
  state.attemptsLeft = 3;
  state.roundLocked = false;

  if (state.currentIndex >= state.questions.length) {
    state.difficulty = getDifficultyForStreak(state.streak);
    state.questions = buildQuestionRun(state.difficulty);
    state.currentIndex = 0;
  }

  saveCurrentRun();
  renderQuestion();
}

function lockRound() {
  if (!gameElements.input || !gameElements.submitButton) {
    return;
  }
  gameElements.input.disabled = true;
  gameElements.submitButton.disabled = true;
}

function updateGameStats() {
  if (!gameElements.score || !gameElements.coins || !gameElements.solved || !gameElements.streak) {
    updateProfilePage();
    return;
  }

  gameElements.score.textContent = String(state.score);
  gameElements.coins.textContent = String(state.coins);
  gameElements.solved.textContent = String(state.solved);
  gameElements.streak.textContent = String(state.streak);

  const question = state.questions[state.currentIndex];
  const revealedHints = Number.parseInt(gameElements.hintButton?.dataset.revealedHints || "0", 10);
  gameElements.hintButton.disabled = !state.user || !state.profileReady || state.roundLocked || state.coins < 3 || revealedHints >= question.hints.length;
  updateMissionProgress();
  updateProfilePage();
}

function updateProfilePage() {
  if (!profileElements.avatar) {
    return;
  }

  if (!state.user) {
    profileElements.avatar.src = DEFAULT_AVATAR;
    profileElements.name.textContent = "Guest";
    profileElements.username.textContent = "@guest";
    profileElements.gender.textContent = "Gender: Not set";
    profileElements.bestScore.textContent = "0";
    profileElements.bestSolved.textContent = "0";
    profileElements.bestStreak.textContent = "0";
    profileElements.coins.textContent = "0";
    return;
  }

  profileElements.avatar.src = state.user.avatar || DEFAULT_AVATAR;
  profileElements.name.textContent = state.user.gameName || state.user.username;
  profileElements.username.textContent = `@${state.user.username}`;
  profileElements.gender.textContent = `Gender: ${state.user.gender || "Not set"}`;
  profileElements.bestScore.textContent = String(state.user.bestScore || 0);
  profileElements.bestSolved.textContent = String(state.user.bestSolved || 0);
  profileElements.bestStreak.textContent = String(state.user.bestStreak || 0);
  profileElements.coins.textContent = String(state.coins || 0);
  profileElements.gameNameInput.value = state.user.gameName || "";
  profileElements.genderInput.value = state.user.gender || "";
  profileElements.preview.src = state.pendingProfileImage || state.user.avatar || DEFAULT_AVATAR;
}

function setGameplayAvailability() {
  const isPlayable = Boolean(state.user) && state.profileReady && !state.roundLocked;
  if (gameElements.input) {
    gameElements.input.disabled = !isPlayable;
  }
  if (gameElements.submitButton) {
    gameElements.submitButton.disabled = !isPlayable;
  }
  if (!state.user || !state.profileReady) {
    if (gameElements.hintButton) {
      gameElements.hintButton.disabled = true;
    }
  }
}

function updateMissionProgress() {
  state.difficulty = getDifficultyForStreak(state.streak);

  if (gameElements.playerStatus) {
    gameElements.playerStatus.textContent = state.isGuest ? "Guest Run" : `${state.user?.gameName || state.user?.username || "Player"} Run`;
  }

  if (gameElements.progressLabel) {
    gameElements.progressLabel.textContent = `Round ${state.currentIndex + 1} of ${state.questions.length} - ${formatDifficulty(state.difficulty)}`;
  }

  if (gameElements.progressBar) {
    const progress = ((state.currentIndex + 1) / state.questions.length) * 100;
    gameElements.progressBar.style.width = `${Math.min(progress, 100)}%`;
  }

  if (gameElements.difficultyLabel) {
    gameElements.difficultyLabel.textContent = `${formatDifficulty(state.difficulty)} Level`;
    gameElements.difficultyLabel.dataset.level = state.difficulty;
  }
}

function showRoundActions(showNext) {
  if (gameElements.nextButton) {
    gameElements.nextButton.hidden = !showNext;
  }
  if (gameElements.saveRunButton) {
    gameElements.saveRunButton.hidden = !state.isGuest;
  }
}

async function showGameOver(question) {
  if (!gameOverElements.modal) {
    return;
  }

  const rankInfo = await getCurrentLeaderboardRank();
  const bestInfo = updateLocalBestStats();
  gameOverElements.message.textContent = `The correct answer was ${question.answer}.`;
  gameOverElements.score.textContent = String(state.score);
  gameOverElements.solved.textContent = String(state.solved);
  gameOverElements.rank.textContent = rankInfo.label;
  gameOverElements.best.textContent = String(bestInfo.personalBest);
  gameOverElements.rankCopy.textContent = rankInfo.copy;
  if (gameOverElements.retryButton) {
    gameOverElements.retryButton.hidden = false;
  }
  gameOverElements.modal.hidden = false;

  window.requestAnimationFrame(() => {
    gameOverElements.modal.classList.add("is-open");
  });
}

function closeGameOverModal() {
  if (!gameOverElements.modal) {
    return;
  }

  gameOverElements.modal.classList.remove("is-open");
  window.setTimeout(() => {
    gameOverElements.modal.hidden = true;
  }, 180);
}

function restartAfterGameOver() {
  closeGameOverModal();
  state.score = 0;
  state.coins = 0;
  state.solved = 0;
  state.streak = 0;
  state.currentIndex = 0;
  state.attemptsLeft = 3;
  state.roundLocked = false;
  state.difficulty = getDifficultyForStreak(state.streak);
  state.questions = buildQuestionRun(state.difficulty);
  saveCurrentRun();
  renderQuestion();
  updateGameStats();
  setGameplayAvailability();
}

async function getCurrentLeaderboardRank() {
  if (state.isGuest || !state.user) {
    return {
      label: "--",
      copy: "Create an account to save your score and join the leaderboard."
    };
  }

  try {
    const players = await refreshLeaderboard();
    const index = players.findIndex((player) => player.username === state.user.username);
    if (index >= 0) {
      return {
        label: `#${index + 1}`,
        copy: `You are rank #${index + 1} on the leaderboard.`
      };
    }
  } catch {
    return {
      label: "--",
      copy: "Could not load leaderboard rank right now."
    };
  }

  return {
    label: "50+",
    copy: "You are not in the top 50 yet. Keep climbing."
  };
}

function promptSaveRun() {
  clearSavedRun();
  authScreen.hidden = false;
  appShell.hidden = true;
  state.isGuest = false;
  state.user = null;
  state.profileReady = false;
  updateGuestNavigation();
  switchAuthMode("register");
  setAuthFeedback("Create an account to save future scores on the leaderboard.", "success");
}

async function copyGameOverResult() {
  const text = `I scored ${state.score} on History Hunt PH with ${state.solved} solved and a ${state.streak} streak.`;

  try {
    await navigator.clipboard.writeText(text);
    gameOverElements.rankCopy.textContent = "Result copied. Share it with your friends.";
  } catch {
    gameOverElements.rankCopy.textContent = text;
  }
}

function switchView(viewName) {
  if (state.isGuest && viewName === "profile") {
    viewName = "game";
  }

  state.activeView = viewName;

  Object.entries(views).forEach(([key, element]) => {
    if (!element) {
      return;
    }
    element.hidden = key !== viewName;
  });

  navElements.buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });

  const meta = VIEW_META[viewName];
  if (shellHeader.tag && shellHeader.title && shellHeader.intro && meta) {
    shellHeader.tag.textContent = meta.tag;
    shellHeader.title.textContent = meta.title;
    shellHeader.intro.textContent = meta.intro;
  }
}

function showShell() {
  if (authScreen) {
    authScreen.hidden = true;
  }
  if (appShell) {
    appShell.hidden = false;
  }
}

function updateGuestNavigation() {
  if (navElements.profileButton) {
    navElements.profileButton.hidden = state.isGuest;
  }
}

function switchAuthMode(mode) {
  if (!authElements.loginPanel || !authElements.registerPanel) {
    return;
  }

  const isRegister = mode === "register";
  authElements.loginPanel.hidden = isRegister;
  authElements.registerPanel.hidden = !isRegister;

  if (isRegister) {
    setAuthFeedback("Set up your account details, then continue to profile creation.", "");
    authElements.registerUsername?.focus();
    return;
  }

  setAuthFeedback("Log in to save your score and join the leaderboard.", "");
  authElements.loginUsername?.focus();
}

function togglePasswordVisibility(button) {
  const input = document.getElementById(button.dataset.togglePassword);
  if (!input) {
    return;
  }

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.setAttribute("aria-pressed", String(shouldShow));
  button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
  button.querySelector("span").textContent = shouldShow ? "Hide" : "Show";
  input.focus();
}

async function persistProgress() {
  if (state.isGuest) {
    updateGameStats();
    return;
  }

  const { user } = await apiRequest("/api/game/progress", {
    method: "POST",
    body: {
      score: state.score,
      coins: state.coins,
      solved: state.solved,
      streak: state.streak
    }
  });

  applyUser(user);
  updateGameStats();
  await refreshLeaderboard();
}

async function refreshLeaderboard() {
  const { players } = await apiRequest("/api/leaderboard", { method: "GET" }, false);
  renderLeaderboard(players || []);
  return players || [];
}

function renderLeaderboard(players) {
  if (!sharedElements.leaderboardBody) {
    return;
  }

  if (!players.length) {
    sharedElements.leaderboardBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No players yet. Register the first account to start the board.</td>
      </tr>
    `;
    return;
  }

  sharedElements.leaderboardBody.innerHTML = players.map((player, index) => {
    const isCurrent = player.username === state.user?.username;
    return `
      <tr class="${isCurrent ? "current-player-row" : ""}">
        <td>${index + 1}</td>
        <td>
          <div class="leaderboard-player">
            <img class="leaderboard-avatar" src="${escapeAttribute(player.avatar || DEFAULT_AVATAR)}" alt="${escapeAttribute(player.gameName || player.username)} avatar">
            <div>
              <strong>${escapeHtml(player.gameName || player.username)}</strong>
              <div>${escapeHtml(player.username)}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(player.gender || "Not set")}</td>
        <td>${player.bestScore || 0}</td>
        <td>${player.bestSolved || 0}</td>
        <td>${player.bestStreak || 0}</td>
      </tr>
    `;
  }).join("");
}

function applyUser(user) {
  state.user = {
    id: user.id,
    username: user.username,
    gameName: user.gameName || "",
    gender: user.gender || "",
    avatar: user.avatar || "",
    bestScore: user.bestScore || 0,
    bestSolved: user.bestSolved || 0,
    bestStreak: user.bestStreak || 0
  };
  state.profileReady = Boolean(user.gameName && user.gender && user.avatar);
  state.pendingProfileImage = user.avatar || "";
  state.score = user.score || 0;
  state.coins = user.coins || 0;
  state.solved = user.solved || 0;
  state.streak = user.streak || 0;
}

async function apiRequest(path, options = {}, includeAuth = true) {
  try {
    const requestOptions = {
      method: options.method || "GET",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(includeAuth && state.token ? { Authorization: `Bearer ${state.token}` } : {})
      }
    };

    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, requestOptions);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        clearToken();
      }
      throw new Error(payload.error || "Request failed.");
    }

    return payload;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    throw error;
  }
}

function saveToken(token) {
  state.token = token;
  window.localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  state.token = "";
  window.localStorage.removeItem(TOKEN_KEY);
}

function setAuthFeedback(message, type) {
  if (!authElements.feedback) {
    return;
  }
  authElements.feedback.textContent = message;
  authElements.feedback.className = `feedback auth-feedback ${type}`;
}

function setProfileFeedback(message, type) {
  if (!profileElements.feedback) {
    return;
  }
  profileElements.feedback.textContent = message;
  profileElements.feedback.className = `feedback auth-feedback ${type}`;
}

function showGameFeedback(message, type) {
  if (!gameElements.feedback) {
    return;
  }
  gameElements.feedback.textContent = message;
  gameElements.feedback.className = `feedback ${type}`;
}

function getPointsForAttempt(attemptsLeft) {
  if (attemptsLeft === 3) {
    return 3;
  }
  if (attemptsLeft === 2) {
    return 2;
  }
  return 0;
}

function isCorrectGuess(userGuess, question) {
  const acceptedAnswers = [question.answer, ...(question.aliases || [])].map(normalizeText);
  return acceptedAnswers.some((answer) => answer === userGuess);
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function buildQuestionRun(difficulty) {
  const filteredQuestions = getQuestionsForDifficulty(difficulty);
  const source = filteredQuestions.length >= ROUND_COUNT ? filteredQuestions : historyQuestions;
  return shuffle([...source]).slice(0, Math.min(ROUND_COUNT, source.length));
}

function getDailySeed() {
  const today = new Date();
  const utcYear = today.getUTCFullYear();
  const start = Date.UTC(utcYear, 0, 0);
  const current = Date.UTC(utcYear, today.getUTCMonth(), today.getUTCDate());
  return Math.floor((current - start) / 86400000);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function updateLocalBestStats() {
  const personalBest = Math.max(readStoredNumber(PERSONAL_BEST_KEY), state.score);
  window.localStorage.setItem(PERSONAL_BEST_KEY, String(personalBest));
  return {
    personalBest
  };
}

function readStoredNumber(key) {
  const value = Number.parseInt(window.localStorage.getItem(key) || "0", 10);
  return Number.isNaN(value) ? 0 : value;
}

function saveCurrentRun() {
  const payload = {
    questionAnswers: state.questions.map((question) => question.answer),
    currentIndex: state.currentIndex,
    attemptsLeft: state.attemptsLeft,
    score: state.score,
    coins: state.coins,
    solved: state.solved,
    streak: state.streak,
    difficulty: state.difficulty,
    isGuest: state.isGuest,
    roundLocked: state.roundLocked
  };

  window.localStorage.setItem(RUN_KEY, JSON.stringify(payload));
}

function restoreSavedRun() {
  try {
    const rawRun = window.localStorage.getItem(RUN_KEY);
    if (!rawRun) {
      return false;
    }

    const savedRun = JSON.parse(rawRun);
    const questions = Array.isArray(savedRun.questionAnswers)
      ? savedRun.questionAnswers
          .map((answer) => historyQuestions.find((question) => question.answer === answer))
          .filter(Boolean)
      : [];

    if (!questions.length) {
      return false;
    }

    state.questions = questions;
    state.currentIndex = clampNumber(savedRun.currentIndex, 0, questions.length - 1);
    state.attemptsLeft = clampNumber(savedRun.attemptsLeft, 0, 3);
    state.score = clampNumber(savedRun.score, 0, 999999);
    state.coins = clampNumber(savedRun.coins, 0, 999999);
    state.solved = clampNumber(savedRun.solved, 0, 999999);
    state.streak = clampNumber(savedRun.streak, 0, 999999);
    state.difficulty = savedRun.difficulty || getDifficultyForStreak(state.streak);
    state.isGuest = Boolean(savedRun.isGuest);
    state.roundLocked = Boolean(savedRun.roundLocked);
    return true;
  } catch {
    clearSavedRun();
    return false;
  }
}

function clearSavedRun() {
  window.localStorage.removeItem(RUN_KEY);
}

function clampNumber(value, min, max) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) {
    return min;
  }
  return Math.min(Math.max(numeric, min), max);
}

function getQuestionsForDifficulty(difficulty) {
  const maxLevelIndex = DIFFICULTY_LEVELS.indexOf(difficulty);
  const allowedLevels = DIFFICULTY_LEVELS.slice(0, maxLevelIndex + 1);
  return historyQuestions.filter((question) => allowedLevels.includes(question.difficulty));
}

function getDifficultyForStreak(streak) {
  if (streak >= 10) {
    return "hard";
  }

  if (streak >= 5) {
    return "medium";
  }

  return "easy";
}

function formatDifficulty(difficulty) {
  if (difficulty === "hard") {
    return "Hard";
  }

  if (difficulty === "medium") {
    return "Medium";
  }

  return "Easy";
}

function createQuestionPlaceholder(question) {
  const safeTitle = escapeHtml(question.title);
  const safeLevel = escapeHtml(formatDifficulty(question.difficulty || "easy"));
  return "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1040">
        <defs>
          <linearGradient id="paper" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f8efd8"/>
            <stop offset="55%" stop-color="#e5d4ac"/>
            <stop offset="100%" stop-color="#b98b4b"/>
          </linearGradient>
          <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M 42 0 L 0 0 0 42" fill="none" stroke="#8a6637" stroke-opacity="0.13" stroke-width="2"/>
          </pattern>
        </defs>
        <rect width="900" height="1040" fill="url(#paper)"/>
        <rect width="900" height="1040" fill="url(#grid)"/>
        <rect x="70" y="70" width="760" height="900" rx="46" fill="#fff7e4" opacity="0.58" stroke="#8f1d1d" stroke-opacity="0.2" stroke-width="6"/>
        <circle cx="450" cy="330" r="150" fill="#8f1d1d" opacity="0.22"/>
        <circle cx="450" cy="292" r="72" fill="#8f1d1d" opacity="0.28"/>
        <path d="M278 605c44-116 112-174 172-174s128 58 172 174" fill="#8f1d1d" opacity="0.2"/>
        <path d="M235 705h430" stroke="#a86c13" stroke-width="10" stroke-linecap="round" opacity="0.36"/>
        <text x="450" y="730" text-anchor="middle" font-family="Georgia, serif" font-size="46" font-weight="700" fill="#24170f">${safeTitle}</text>
        <text x="450" y="792" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#654731" letter-spacing="4">${safeLevel.toUpperCase()} CLUE</text>
        <text x="450" y="855" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#654731">Image clue loading...</text>
      </svg>
    `);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
