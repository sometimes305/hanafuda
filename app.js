const STORAGE_KEY = "hanafuda-koikoi-state-v1";
const MONTH_NAMES = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const MATCH_LENGTHS = [3, 6, 12];
const MATCH_LENGTH_LABELS = { 3: "三局", 6: "六局", 12: "十二局" };
const CAPTURE_GROUPS = [["bright", "光"], ["animal", "たね"], ["ribbon", "短冊"], ["chaff", "かす"]];
const DRAW_REVEAL_DURATION = 2200;
const CAPTURE_FLIGHT_DURATION = 1300;
const CAPTURE_FLIGHT_STAGGER = 110;
const FIELD_OVERLAP_OFFSET_RATIO = .2;
const FIELD_SLOT_COUNT = 12;
const FIELD_SLOT_PRIORITY = [1, 2, 3, 4, 7, 8, 9, 10, 0, 5, 6, 11];
const PLAY_FLIGHT_DURATION = 1150;
const DRAW_TO_FIELD_DURATION = 1200;
const MATCH_SLIDE_DURATION = 650;
const PLAY_LAND_HOLD_DURATION = 400;
const DRAW_TO_FIELD_HOLD_DURATION = 360;
const MATCH_LAND_HOLD_DURATION = 300;
const CAPTURE_LAND_HOLD_DURATION = 380;
const REDUCED_DRAW_REVEAL_DURATION = 380;
const REDUCED_PLAY_FLIGHT_DURATION = 260;
const REDUCED_DRAW_TO_FIELD_DURATION = 280;
const REDUCED_CAPTURE_FLIGHT_DURATION = 280;
const REDUCED_MATCH_SLIDE_DURATION = 220;
const REDUCED_PLAY_LAND_HOLD_DURATION = 60;
const REDUCED_DRAW_TO_FIELD_HOLD_DURATION = 60;
const REDUCED_MATCH_LAND_HOLD_DURATION = 50;
const REDUCED_CAPTURE_LAND_HOLD_DURATION = 60;
const LAYOUT_REFLOW_DURATION = 480;
const REDUCED_LAYOUT_REFLOW_DURATION = 300;
const CARD_MAP = new Map(window.HanafudaCards.cards.map((card) => [card.id, card]));
const CARD_ID_BY_KEY = new Map(window.HanafudaCards.cards.filter((card) => card.key !== "plain").map((card) => [card.key, card.id]));

let localPlayerName = "Player";
let localPlayerIcon = null;
let mode = "lobby";
let viewerSeat = 0;
let clientSecret = null;
let applyingRemoteState = false;
let aiTimer = null;
let toastTimer = null;
let drawTimer = null;
let phaseTimer = null;
let interactionLocked = false;
let interactionUnlockTimer = null;
let selectedHandCardId = null;
let queuedInput = null;
let activeOutgoingCardId = null;
const captureFlightIds = new Set();
const motionOrigins = new Map();
const drawFlightClones = new Map();
let remoteStateQueue = Promise.resolve();
let remoteDrawStartedAt = 0;

let state = createInitialState();

const els = {
  lobby: document.querySelector("#lobby"),
  game: document.querySelector("#game"),
  field: document.querySelector("#fieldCards"),
  hand: document.querySelector("#playerHand"),
  opponentHand: document.querySelector("#opponentHand"),
  turnBanner: document.querySelector("#turnBanner"),
  choice: document.querySelector("#choiceOverlay"),
  toast: document.querySelector("#toast"),
  deckPile: document.querySelector("#deckPile"),
  drawnCardPreview: document.querySelector("#drawnCardPreview")
};

function createInitialState() {
  return {
    active: false,
    round: 1,
    matchLength: 12,
    dealer: 0,
    currentPlayer: 0,
    players: ["あなた", "相手"],
    playerIcons: [null, null],
    scores: [0, 0],
    hands: [[], []],
    handCounts: [0, 0],
    field: [],
    fieldMonthSlots: {},
    deck: [],
    captures: [[], []],
    phase: "lobby",
    pending: null,
    lastDeclared: [0, 0],
    koiCount: [0, 0],
    lastResult: null,
    message: ""
  };
}

function normalizeMatchLength(value, fallback = 12) {
  const length = Number(value);
  return MATCH_LENGTHS.includes(length) ? length : fallback;
}

function selectedMatchLength(name, fallback = 12) {
  return normalizeMatchLength(document.querySelector(`input[name="${name}"]:checked`)?.value, fallback);
}

function matchLengthLabel(value = state.matchLength) {
  return MATCH_LENGTH_LABELS[normalizeMatchLength(value)] || `${value}局`;
}

function updateOnlineMatchSummary(value = selectedMatchLength("onlineMatchLength")) {
  const length = normalizeMatchLength(value);
  const summary = document.querySelector("#roomMatchLength");
  if (summary) summary.textContent = `${length}局勝負`;
}

function previewSetup(settings = {}) {
  const length = normalizeMatchLength(settings.matchLength);
  document.querySelectorAll('input[name="onlineMatchLength"]').forEach((input) => {
    input.checked = Number(input.value) === length;
  });
  updateOnlineMatchSummary(length);
}

function readSetupForm() {
  const matchLength = selectedMatchLength("onlineMatchLength");
  updateOnlineMatchSummary(matchLength);
  return { matchLength };
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function dealRound() {
  clearTimeout(drawTimer);
  clearTimeout(phaseTimer);
  clearTimeout(interactionUnlockTimer);
  interactionUnlockTimer = null;
  interactionLocked = false;
  selectedHandCardId = null;
  queuedInput = null;
  activeOutgoingCardId = null;
  motionOrigins.clear();
  captureFlightIds.clear();
  drawFlightClones.forEach((element) => element.remove());
  drawFlightClones.clear();
  let deck;
  let hands;
  let field;
  let attempts = 0;
  do {
    deck = shuffle(window.HanafudaCards.cards.map((card) => card.id));
    hands = [[], []];
    for (let i = 0; i < 8; i += 1) {
      hands[0].push(deck.pop());
      hands[1].push(deck.pop());
    }
    field = deck.splice(-8);
    attempts += 1;
  } while (fieldHasFourOfMonth(field) && attempts < 50);
  state.hands = hands;
  state.field = field;
  state.fieldMonthSlots = {};
  ensureFieldMonthSlots();
  state.deck = deck;
  state.captures = [[], []];
  state.handCounts = [8, 8];
  state.currentPlayer = state.dealer;
  state.phase = "play";
  state.pending = null;
  state.lastDeclared = [0, 0];
  state.koiCount = [0, 0];
  state.lastResult = null;
  state.message = "";
  sortHands();
  persistAndRender();
  scheduleAiIfNeeded();
}

function fieldHasFourOfMonth(field) {
  const counts = {};
  field.forEach((id) => {
    const month = CARD_MAP.get(id).month;
    counts[month] = (counts[month] || 0) + 1;
  });
  return Object.values(counts).some((count) => count === 4);
}

function sortHands() {
  state.hands.forEach((hand) => hand.sort((a, b) => {
    const ca = CARD_MAP.get(a);
    const cb = CARD_MAP.get(b);
    return ca.month - cb.month || ca.type.localeCompare(cb.type);
  }));
}

function startSolo() {
  clearTimeout(aiTimer);
  mode = "solo";
  viewerSeat = 0;
  clientSecret = null;
  state = createInitialState();
  state.matchLength = selectedMatchLength("soloMatchLength");
  state.active = true;
  state.players = [localPlayerName === "Player" ? "あなた" : localPlayerName, "花見の達人"];
  state.playerIcons = [localPlayerIcon, null];
  dealRound();
}

function startOnlineGame() {
  if (!window.TierOnline || !window.TierOnline.isHost()) {
    showToast("対局はホストが開始します");
    return;
  }
  const participants = window.TierOnline.getGameParticipants();
  if (participants.length < 2) {
    showToast("もう一人の参加を待っています");
    return;
  }
  mode = "online";
  viewerSeat = 0;
  state = createInitialState();
  state.matchLength = selectedMatchLength("onlineMatchLength");
  state.active = true;
  state.players = participants.slice(0, 2).map((participant) => participant.name);
  state.playerIcons = participants.slice(0, 2).map((participant) => participant.icon || null);
  dealRound();
}

function localSeat() {
  if (mode === "solo") return 0;
  if (window.TierOnline?.online && window.TierOnline.host) return 0;
  if (clientSecret && Number.isInteger(clientSecret.seat)) return clientSecret.seat;
  const index = state.players.findIndex((name) => normalizeName(name) === normalizeName(localPlayerName));
  return index >= 0 ? index : viewerSeat;
}

function isLocalTurn() {
  return state.phase === "play" && state.currentPlayer === localSeat();
}

function visibleHand() {
  const seat = localSeat();
  if (mode === "online" && seat === 1 && clientSecret?.hand) return clientSecret.hand;
  return state.hands[seat] || [];
}

function cardSizedRect(centerX, centerY, width, height) {
  return { left: centerX - width / 2, top: centerY - height / 2, width, height };
}

function ensureFieldMonthSlots(fieldCards = state.field) {
  if (!state.fieldMonthSlots || typeof state.fieldMonthSlots !== "object" || Array.isArray(state.fieldMonthSlots)) {
    state.fieldMonthSlots = {};
  }
  const usedSlots = new Set(Object.values(state.fieldMonthSlots)
    .map(Number)
    .filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < FIELD_SLOT_COUNT));
  fieldCards.forEach((id) => {
    const month = CARD_MAP.get(id)?.month;
    const assignedSlot = Number(state.fieldMonthSlots[month]);
    if (!month || (Number.isInteger(assignedSlot) && assignedSlot >= 0 && assignedSlot < FIELD_SLOT_COUNT)) return;
    const availableSlot = FIELD_SLOT_PRIORITY.find((slot) => !usedSlots.has(slot));
    if (availableSlot === undefined) return;
    state.fieldMonthSlots[month] = availableSlot;
    usedSlots.add(availableSlot);
  });
}

function fieldSlotIndexForCard(cardId) {
  ensureFieldMonthSlots([cardId]);
  const month = CARD_MAP.get(cardId)?.month;
  const slot = Number(state.fieldMonthSlots?.[month]);
  return Number.isInteger(slot) && slot >= 0 && slot < FIELD_SLOT_COUNT ? slot : 0;
}

function snapshotCardRects(elements, keyFor) {
  return new Map([...elements].map((element, index) => {
    const rect = element.getBoundingClientRect();
    return [keyFor(element, index), { left: rect.left, top: rect.top }];
  }));
}

function animateCardReflow(elements, previousRects, keyFor) {
  const duration = prefersReducedMotion() ? REDUCED_LAYOUT_REFLOW_DURATION : LAYOUT_REFLOW_DURATION;
  [...elements].forEach((element, index) => {
    const previous = previousRects.get(keyFor(element, index));
    if (!previous) return;
    const current = element.getBoundingClientRect();
    const dx = previous.left - current.left;
    const dy = previous.top - current.top;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    element.animate([
      { translate: `${dx}px ${dy}px` },
      { translate: "0px 0px" }
    ], { duration, easing: "cubic-bezier(.16, 1, .3, 1)" });
  });
}

function captureSourceRect(cardId) {
  const remembered = motionOrigins.get(cardId);
  if (remembered) return remembered;
  const source = els.field.querySelector(`[data-card-id="${cardId}"]`)
    || els.drawnCardPreview.querySelector(`[data-card-id="${cardId}"]`)
    || els.hand.querySelector(`[data-card-id="${cardId}"]`);
  if (source) {
    const rect = source.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  const fieldRect = els.field.getBoundingClientRect();
  const reference = els.field.querySelector(".card")?.getBoundingClientRect();
  const width = reference?.width || 48;
  const height = reference?.height || 80;
  return cardSizedRect(fieldRect.left + fieldRect.width / 2, fieldRect.top + fieldRect.height / 2, width, height);
}

function captureCardOffset(index, count) {
  if (count <= 1) return 0;
  const step = Math.min(12, 48 / (count - 1));
  return (index - (count - 1) / 2) * step;
}

function captureTargetPoint(actorSeat, cardId, incomingIds) {
  const rail = actorSeat === localSeat()
    ? document.querySelector("#capturedBoardRail")
    : document.querySelector("#opponentCapturedRail");
  const type = CARD_MAP.get(cardId)?.type;
  const target = rail?.querySelector(`[data-capture-type="${type}"] .capture-pile-cards`);
  const rect = target?.getBoundingClientRect();
  if (!rect) return null;

  const finalIds = [
    ...(state.captures[actorSeat] || []).filter((id) => CARD_MAP.get(id)?.type === type),
    ...incomingIds.filter((id) => CARD_MAP.get(id)?.type === type)
  ].sort((a, b) => CARD_MAP.get(a).month - CARD_MAP.get(b).month);
  const finalIndex = finalIds.indexOf(cardId);
  const offset = captureCardOffset(Math.max(0, finalIndex), finalIds.length);
  const width = Number.parseFloat(getComputedStyle(rail).getPropertyValue("--rail-card-w")) || 22;
  return { x: rect.left + rect.width / 2 + offset, y: rect.top + rect.height / 2, width, height: rect.height };
}

function animateCapturedCards(actorSeat, ids) {
  if (!ids.length) return Promise.resolve();
  const reducedMotion = prefersReducedMotion();
  const flights = ids.map((id, index) => {
    const source = captureSourceRect(id);
    const target = captureTargetPoint(actorSeat, id, ids);
    motionOrigins.delete(id);
    if (!source || !target) {
      captureFlightIds.delete(id);
      return Promise.resolve();
    }
    captureFlightIds.add(id);
    const clone = createCardElement(id);
    clone.classList.add("capture-flight");
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, {
      left: `${source.left}px`,
      top: `${source.top}px`,
      width: `${source.width}px`,
      height: `${source.height}px`
    });
    document.body.append(clone);
    clearDrawFlightClone(id);
    const sourceX = source.left + source.width / 2;
    const sourceY = source.top + source.height / 2;
    const dx = target.x - sourceX;
    const dy = target.y - sourceY;
    const sweep = (index - (ids.length - 1) / 2) * 9;
    const landingScale = Math.min(target.width / source.width, target.height / source.height);
    const approachScale = landingScale + (1 - landingScale) * .18;
    const keyframes = reducedMotion
      ? [
        { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
        { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${landingScale})`, opacity: 1 }
      ]
      : [
        { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)", opacity: 1, filter: "brightness(1.14)" },
        { offset: .42, transform: `translate3d(${dx * .38 + sweep}px, ${dy * .3 - Math.sign(dy || 1) * 22}px, 0) rotate(${sweep * .12}deg) scale(.94)`, opacity: 1, filter: "brightness(1.22)" },
        { offset: .82, transform: `translate3d(${dx * .86}px, ${dy * .84}px, 0) rotate(${sweep * -.08}deg) scale(${approachScale})`, opacity: 1, filter: "brightness(1.08)" },
        { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(${landingScale})`, opacity: 1, filter: "brightness(1)" }
      ];
    const animation = clone.animate(keyframes, {
      duration: reducedMotion ? REDUCED_CAPTURE_FLIGHT_DURATION : CAPTURE_FLIGHT_DURATION,
      delay: index * (reducedMotion ? 30 : CAPTURE_FLIGHT_STAGGER),
      easing: "cubic-bezier(.16, 1, .3, 1)",
      fill: "forwards"
    });
    return animation.finished.catch(() => {}).finally(() => {
      captureFlightIds.delete(id);
      const rail = actorSeat === localSeat()
        ? document.querySelector("#capturedBoardRail")
        : document.querySelector("#opponentCapturedRail");
      rail?.querySelector(`.capture-rail-card[data-card-id="${id}"]`)?.classList.remove("newly-captured");
      clone.remove();
    });
  });
  return Promise.all(flights);
}

async function captureCards(actorSeat, ids) {
  const captureMotion = animateCapturedCards(actorSeat, ids);
  state.captures[actorSeat].push(...ids);
  state.phase = "capture";
  state.pending = { actorSeat, capturedCards: [...ids] };
  persistAndRender();
  await captureMotion;
  await waitForMotion(prefersReducedMotion() ? REDUCED_CAPTURE_LAND_HOLD_DURATION : CAPTURE_LAND_HOLD_DURATION);
}

async function playCard(cardId, actorSeat = localSeat()) {
  if (state.phase !== "play" || actorSeat !== state.currentPlayer) return;
  let hand = state.hands[actorSeat] || [];
  let index = hand.indexOf(cardId);
  if (index < 0) return;
  if (!motionOrigins.has(cardId)) await animatePlayedCardForSeat(cardId, actorSeat);
  if (state.phase !== "play" || actorSeat !== state.currentPlayer) return;
  hand = state.hands[actorSeat] || [];
  index = hand.indexOf(cardId);
  if (index < 0) return;
  hand.splice(index, 1);
  state.handCounts[actorSeat] = hand.length;
  await beginResolve(cardId, "hand", actorSeat);
}

async function beginResolve(cardId, source, actorSeat) {
  const card = CARD_MAP.get(cardId);
  const matches = state.field.filter((id) => CARD_MAP.get(id).month === card.month);
  if (matches.length === 3) {
    state.field = state.field.filter((id) => !matches.includes(id));
    await captureCards(actorSeat, [cardId, ...matches]);
    if (source === "hand") drawCard(actorSeat);
    else finishResolution(actorSeat);
    return;
  }
  if (matches.length === 2) {
    state.phase = "select";
    state.pending = { cardId, source, actorSeat, matches };
    state.message = `${card.monthName}の札を選んでください`;
    persistAndRender();
    flushQueuedInput();
    if (mode === "solo" && actorSeat === 1) {
      aiTimer = window.setTimeout(() => chooseMatch(matches[0], 1), 850);
    }
    return;
  }
  await resolveAgainstField(cardId, matches[0] || null, actorSeat);
  if (source === "hand") drawCard(actorSeat);
  else finishResolution(actorSeat);
}

async function chooseMatch(fieldCardId, actorSeat = localSeat(), options = {}) {
  if (state.phase !== "select" || !state.pending || state.pending.actorSeat !== actorSeat) return;
  if (!state.pending.matches.includes(fieldCardId)) return;
  const { cardId, source } = state.pending;
  if (!options.preAnimated) await animatePendingCardToMatch(cardId, fieldCardId);
  if (state.phase !== "select" || state.pending?.cardId !== cardId || state.pending?.actorSeat !== actorSeat) return;
  state.pending = null;
  await resolveAgainstField(cardId, fieldCardId, actorSeat);
  if (source === "hand") drawCard(actorSeat);
  else finishResolution(actorSeat);
}

async function resolveAgainstField(cardId, matchId, actorSeat) {
  if (!matchId) {
    motionOrigins.delete(cardId);
    state.field.push(cardId);
    return;
  }
  state.field = state.field.filter((id) => id !== matchId);
  await captureCards(actorSeat, [cardId, matchId]);
}

function drawCard(actorSeat) {
  const drawn = state.deck.pop();
  if (!drawn) {
    finishResolution(actorSeat);
    return;
  }
  state.phase = "draw";
  state.pending = { actorSeat, drawnCard: drawn };
  persistAndRender();
  clearTimeout(drawTimer);
  drawTimer = window.setTimeout(() => {
    if (state.phase !== "draw" || state.pending?.drawnCard !== drawn || state.pending?.actorSeat !== actorSeat) return;
    const month = CARD_MAP.get(drawn)?.month;
    const matches = state.field.filter((id) => CARD_MAP.get(id)?.month === month);
    state.phase = "drawReady";
    state.pending = { actorSeat, drawnCard: drawn, matches };
    persistAndRender();
    flushQueuedInput();
    if (mode === "solo" && actorSeat === 1) {
      aiTimer = window.setTimeout(() => resolveDraw(matches.length === 2 ? matches[0] : null, actorSeat), 1050);
    }
  }, drawRevealDuration());
}

async function resolveDraw(fieldCardId, actorSeat = localSeat(), options = {}) {
  if (state.phase !== "drawReady" || !state.pending || state.pending.actorSeat !== actorSeat) return;
  const drawnCard = state.pending.drawnCard;
  const matches = [...(state.pending.matches || [])].filter((id) => state.field.includes(id));
  if (matches.length === 2 && !matches.includes(fieldCardId)) return;
  const chosenMatch = matches.length === 2 ? fieldCardId : matches.length === 1 ? matches[0] : null;
  state.phase = "drawMoving";
  if (!options.preAnimated) await animateDrawnCardToField(drawnCard, chosenMatch, { keepAtTarget: true });
  if (state.phase !== "drawMoving" || state.pending?.drawnCard !== drawnCard || state.pending?.actorSeat !== actorSeat) return;
  state.pending = null;
  if (matches.length === 3) {
    state.field = state.field.filter((id) => !matches.includes(id));
    await captureCards(actorSeat, [drawnCard, ...matches]);
  } else {
    await resolveAgainstField(drawnCard, chosenMatch, actorSeat);
  }
  finishResolution(actorSeat);
  clearDrawFlightClone(drawnCard);
}

function finishResolution(actorSeat) {
  const result = evaluateYaku(state.captures[actorSeat]);
  if (result.points > state.lastDeclared[actorSeat]) {
    if (!state.hands[0].length && !state.hands[1].length) {
      let forcedPoints = result.points;
      if (state.koiCount[actorSeat] > 0) forcedPoints *= 2;
      state.phase = "yakuReveal";
      state.pending = { actorSeat, yaku: result.yaku, points: result.points, potentialPoints: forcedPoints, forced: true, awardedPoints: forcedPoints };
      persistAndRender();
      scheduleYakuChoice(actorSeat);
      return;
    }
    state.phase = "yakuReveal";
    state.pending = { actorSeat, yaku: result.yaku, points: result.points, potentialPoints: result.points * (state.koiCount[actorSeat] > 0 ? 2 : 1) };
    persistAndRender();
    scheduleYakuChoice(actorSeat);
    return;
  }
  endTurn();
}

function isAuthoritativeGame() {
  return mode === "solo" || !window.TierOnline?.online || Boolean(window.TierOnline?.host);
}

function cutInHoldDuration(kind) {
  if (prefersReducedMotion()) return kind === "yaku" ? 1400 : 1200;
  return kind === "yaku" ? 3200 : 2700;
}

function scheduleYakuChoice(actorSeat) {
  clearTimeout(phaseTimer);
  if (!isAuthoritativeGame()) return;
  phaseTimer = window.setTimeout(() => {
    if (state.phase !== "yakuReveal" || state.pending?.actorSeat !== actorSeat) return;
    if (state.pending.forced) {
      beginDecisionReveal("agari", actorSeat);
      return;
    }
    state.phase = "koi";
    persistAndRender();
    if (mode === "solo" && actorSeat === 1) {
      const shouldFinish = state.pending.points >= 5 || state.deck.length < 8 || Math.random() > .55;
      aiTimer = window.setTimeout(() => chooseKoi(shouldFinish ? "agari" : "koi", 1), prefersReducedMotion() ? 750 : 1900);
    }
  }, cutInHoldDuration("yaku"));
}

function chooseKoi(choice, actorSeat = localSeat()) {
  if (state.phase !== "koi" || !state.pending || state.pending.actorSeat !== actorSeat) return;
  beginDecisionReveal(choice === "stop" ? "agari" : choice, actorSeat);
}

function beginDecisionReveal(choice, actorSeat) {
  if (!state.pending || state.pending.actorSeat !== actorSeat) return;
  if (choice !== "koi" && choice !== "agari") return;
  const result = state.pending;
  const awardedPoints = choice === "agari"
    ? result.awardedPoints || result.potentialPoints || result.points * (state.koiCount[actorSeat] > 0 ? 2 : 1)
    : 0;
  state.phase = "decisionReveal";
  state.pending = { ...result, actorSeat, choice, awardedPoints };
  persistAndRender();
  scheduleDecisionResolution(actorSeat, choice);
}

function scheduleDecisionResolution(actorSeat, choice) {
  clearTimeout(phaseTimer);
  if (!isAuthoritativeGame()) return;
  phaseTimer = window.setTimeout(() => {
    if (state.phase !== "decisionReveal" || state.pending?.actorSeat !== actorSeat || state.pending?.choice !== choice) return;
    const result = state.pending;
    if (choice === "koi") {
      state.lastDeclared[actorSeat] = result.points;
      state.koiCount[actorSeat] += 1;
      state.pending = null;
      endTurn();
      return;
    }
    state.scores[actorSeat] += result.awardedPoints;
    state.lastResult = { winner: actorSeat, points: result.awardedPoints, yaku: result.yaku };
    state.pending = null;
    state.phase = state.round >= state.matchLength ? "matchEnd" : "roundEnd";
    persistAndRender();
  }, cutInHoldDuration("decision"));
}

function endTurn() {
  if (!state.hands[0].length && !state.hands[1].length) {
    state.scores[state.dealer] += 6;
    state.lastResult = { winner: state.dealer, points: 6, yaku: ["親権 6文"] };
    state.phase = state.round >= state.matchLength ? "matchEnd" : "roundEnd";
    state.pending = null;
    persistAndRender();
    return;
  }
  state.currentPlayer = 1 - state.currentPlayer;
  state.phase = "play";
  state.pending = null;
  state.message = "";
  activeOutgoingCardId = null;
  if (queuedInput?.type !== "hand") queuedInput = null;
  persistAndRender();
  flushQueuedInput();
  scheduleAiIfNeeded();
}

function nextRound() {
  if (state.round >= state.matchLength) return;
  state.round += 1;
  state.dealer = state.lastResult?.winner ?? state.dealer;
  dealRound();
}

function rematch() {
  const players = [...state.players];
  const playerIcons = [...(state.playerIcons || [null, null])];
  const matchLength = state.matchLength;
  state = createInitialState();
  state.matchLength = matchLength;
  state.active = true;
  state.players = players;
  state.playerIcons = playerIcons;
  dealRound();
}

function evaluateYaku(ids) {
  const cards = ids.map((id) => CARD_MAP.get(id)).filter(Boolean);
  const has = (key) => cards.some((card) => card.key === key);
  const bright = cards.filter((card) => card.type === "bright");
  const animals = cards.filter((card) => card.type === "animal");
  const ribbons = cards.filter((card) => card.type === "ribbon");
  const chaffCount = cards.filter((card) => card.type === "chaff").length + (has("sake") ? 1 : 0);
  const yaku = [];
  let points = 0;

  if (bright.length === 5) { yaku.push("五光 15文"); points += 15; }
  else if (bright.length === 4 && has("rain")) { yaku.push("雨四光 8文"); points += 8; }
  else if (bright.length === 4) { yaku.push("四光 10文"); points += 10; }
  else if (bright.length === 3 && !has("rain")) { yaku.push("三光 5文"); points += 5; }

  const inoShikaCho = has("boar") && has("deer") && has("butterfly");
  if (inoShikaCho) { yaku.push(`猪鹿蝶 ${5 + Math.max(0, animals.length - 3)}文`); points += 5 + Math.max(0, animals.length - 3); }
  else if (animals.length >= 5) { yaku.push(`たね ${animals.length - 4}文`); points += animals.length - 4; }

  const poetryCount = ribbons.filter((card) => card.key === "poetry").length;
  const blueCount = ribbons.filter((card) => card.key === "blue").length;
  if (poetryCount === 3 && blueCount === 3) { yaku.push("赤短青短 10文"); points += 10; }
  else {
    if (poetryCount === 3) { yaku.push("赤短 5文"); points += 5; }
    if (blueCount === 3) { yaku.push("青短 5文"); points += 5; }
  }
  if (ribbons.length >= 5) { yaku.push(`短冊 ${ribbons.length - 4}文`); points += ribbons.length - 4; }
  if (chaffCount >= 10) { yaku.push(`かす ${chaffCount - 9}文`); points += chaffCount - 9; }
  if (has("curtain") && has("sake")) { yaku.push("花見酒 5文"); points += 5; }
  if (has("moon") && has("sake")) { yaku.push("月見酒 5文"); points += 5; }

  return { yaku, points };
}

function scheduleAiIfNeeded() {
  clearTimeout(aiTimer);
  if (mode !== "solo" || state.phase !== "play" || state.currentPlayer !== 1) return;
  aiTimer = window.setTimeout(aiTurn, 1500);
}

function aiTurn() {
  if (mode !== "solo" || state.phase !== "play" || state.currentPlayer !== 1) return;
  const hand = state.hands[1];
  const scored = hand.map((id) => {
    const card = CARD_MAP.get(id);
    const matches = state.field.filter((fieldId) => CARD_MAP.get(fieldId).month === card.month);
    return { id, score: matches.length * 4 + (card.type === "bright" ? 3 : card.type === "animal" ? 2 : 0) + Math.random() };
  }).sort((a, b) => b.score - a.score);
  playCard(scored[0].id, 1);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function drawRevealDuration() {
  return prefersReducedMotion() ? REDUCED_DRAW_REVEAL_DURATION : DRAW_REVEAL_DURATION;
}

function waitForMotion(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function previewCaptureFor(cardId, active = true) {
  const month = CARD_MAP.get(cardId)?.month;
  els.field.querySelectorAll(".card").forEach((element) => {
    element.classList.toggle("preview-match", Boolean(active && Number(element.dataset.month) === month));
  });
}

function clearCapturePreview() {
  els.field.querySelectorAll(".card.preview-match").forEach((element) => element.classList.remove("preview-match"));
}

function requiresTapConfirmation() {
  return Boolean(window.matchMedia?.("(hover: none), (pointer: coarse), (max-width: 720px)").matches);
}

function updateHandSelection(cardId = null) {
  selectedHandCardId = cardId;
  els.hand.querySelectorAll(".card").forEach((element) => {
    const selected = element.dataset.cardId === cardId;
    element.classList.toggle("selected", selected);
    element.setAttribute("aria-pressed", String(selected));
  });
  if (cardId) previewCaptureFor(cardId, true);
  else clearCapturePreview();
  renderTurnBanner(localSeat());
}

function queueNextInput(intent) {
  if (!intent) return;
  queuedInput = intent;
  els.turnBanner.classList.remove("input-buffered");
  void els.turnBanner.offsetWidth;
  els.turnBanner.classList.add("input-buffered");
}

function flushQueuedInput() {
  if (!queuedInput || interactionLocked) return;
  const intent = queuedInput;
  if (state.phase === "select" && state.pending?.actorSeat === localSeat()) {
    queuedInput = null;
    if (intent.type !== "match" || !state.pending.matches?.includes(intent.cardId)) return;
    const target = els.field.querySelector(`[data-card-id="${intent.cardId}"]`);
    if (target) handleMatchClick(intent.cardId, target);
    return;
  }
  if (state.phase === "drawReady" && state.pending?.actorSeat === localSeat()) {
    const matches = state.pending.matches || [];
    queuedInput = null;
    if (matches.length === 2) {
      if (intent.type === "drawMatch" && matches.includes(intent.cardId)) handleDrawConfirm(intent.cardId);
      return;
    }
    if (intent.type === "advance") handleDrawConfirm();
    return;
  }
  if (state.phase === "play" && state.currentPlayer === localSeat() && intent.type === "hand") {
    queuedInput = null;
    if (visibleHand().includes(intent.cardId)) updateHandSelection(intent.cardId);
  }
}

function clearDrawFlightClone(cardId) {
  const clone = drawFlightClones.get(cardId);
  clone?.remove();
  drawFlightClones.delete(cardId);
}

function matchingFieldLandingPoint(elements) {
  if (!elements.length) return null;
  const rects = elements.map((element) => element.getBoundingClientRect());
  const x = rects.reduce((sum, rect) => sum + rect.left + rect.width / 2, 0) / rects.length;
  const y = rects.reduce((sum, rect) => sum + rect.top + rect.height / 2, 0) / rects.length;
  const overlapOffset = rects.length === 1 ? rects[0].width * FIELD_OVERLAP_OFFSET_RATIO : 0;
  return { x: x + overlapOffset, y: y + overlapOffset };
}

async function animateDrawnCardToField(cardId, fieldCardId = null, options = {}) {
  const sourceElement = els.drawnCardPreview.querySelector(`[data-card-id="${cardId}"]`);
  const sourceRect = sourceElement?.getBoundingClientRect();
  if (!sourceRect) return;
  const month = CARD_MAP.get(cardId)?.month;
  const allMatches = [...els.field.querySelectorAll(".card")].filter((element) => Number(element.dataset.month) === month);
  const selectedMatch = fieldCardId ? els.field.querySelector(`[data-card-id="${fieldCardId}"]`) : null;
  const landingMatches = selectedMatch ? [selectedMatch] : allMatches;
  const fallbackRect = els.field.getBoundingClientRect();
  const matchingLanding = matchingFieldLandingPoint(landingMatches);
  const placement = allMatches.length ? null : nextFieldPlacementPoint(cardId);
  const targetX = matchingLanding?.x ?? placement?.x ?? fallbackRect.left + fallbackRect.width / 2;
  const targetY = matchingLanding?.y ?? placement?.y ?? fallbackRect.top + fallbackRect.height / 2;
  const targetRect = cardSizedRect(targetX, targetY, sourceRect.width, sourceRect.height);
  motionOrigins.set(cardId, targetRect);

  clearDrawFlightClone(cardId);
  const clone = sourceElement.cloneNode(true);
  clone.removeAttribute("id");
  clone.setAttribute("aria-hidden", "true");
  clone.className = "card card-flight drawn-flight";
  Object.assign(clone.style, {
    left: `${sourceRect.left}px`,
    top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`
  });
  document.body.append(clone);
  sourceElement.classList.add("committed");

  const dx = targetRect.left - sourceRect.left;
  const dy = targetRect.top - sourceRect.top;
  const arc = Math.min(26, Math.max(14, Math.abs(dx) * .16));
  const reducedMotion = prefersReducedMotion();
  const animation = clone.animate(reducedMotion
    ? [
      { transform: "translate3d(0, 0, 0) scale(1)" },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(1)` }
    ]
    : [
      { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)", filter: "brightness(1.08)" },
      { offset: .38, transform: `translate3d(${dx * .3}px, ${dy * .24 - arc}px, 0) rotate(-1.2deg) scale(1.035)`, filter: "brightness(1.18)" },
      { offset: .82, transform: `translate3d(${dx * .88}px, ${dy * .84 - 7}px, 0) rotate(.45deg) scale(1.02)`, filter: "brightness(1.12)" },
      { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(1)`, filter: "brightness(1)" }
    ], {
      duration: reducedMotion ? REDUCED_DRAW_TO_FIELD_DURATION : DRAW_TO_FIELD_DURATION,
      easing: "cubic-bezier(.16, 1, .3, 1)",
      fill: "forwards"
    });
  await animation.finished.catch(() => {});
  animation.cancel();
  Object.assign(clone.style, {
    left: `${targetRect.left}px`,
    top: `${targetRect.top}px`,
    width: `${targetRect.width}px`,
    height: `${targetRect.height}px`,
    transform: "none"
  });
  await waitForMotion(reducedMotion ? REDUCED_DRAW_TO_FIELD_HOLD_DURATION : DRAW_TO_FIELD_HOLD_DURATION);
  if (options.keepAtTarget) drawFlightClones.set(cardId, clone);
  else clone.remove();
}

async function animatePlayedCard(sourceElement, cardId, options = {}) {
  const sourceRect = options.sourceRect || sourceElement?.getBoundingClientRect();
  if (!sourceRect) return;
  const month = CARD_MAP.get(cardId)?.month;
  const matchingFields = [...els.field.querySelectorAll(".card")].filter((element) => Number(element.dataset.month) === month);
  const fallbackRect = els.field.getBoundingClientRect();
  const matchingLanding = matchingFieldLandingPoint(matchingFields);
  const placement = matchingFields.length ? null : nextFieldPlacementPoint(cardId);
  const targetX = matchingLanding?.x ?? placement?.x ?? fallbackRect.left + fallbackRect.width / 2;
  const targetY = matchingLanding?.y ?? placement?.y ?? fallbackRect.top + fallbackRect.height / 2;
  const fieldCardRect = matchingFields[0]?.getBoundingClientRect() || els.field.querySelector(".card")?.getBoundingClientRect();
  const targetWidth = fieldCardRect?.width || sourceRect.width;
  const targetHeight = fieldCardRect?.height || sourceRect.height;
  const landingScale = Math.min(targetWidth / sourceRect.width, targetHeight / sourceRect.height);
  const sourceX = sourceRect.left + sourceRect.width / 2;
  const sourceY = sourceRect.top + sourceRect.height / 2;
  motionOrigins.set(cardId, cardSizedRect(targetX, targetY, targetWidth, targetHeight));
  const faceDownSource = Boolean(options.faceDown || sourceElement?.classList.contains("back"));
  const clone = faceDownSource ? createCardElement(cardId) : sourceElement.cloneNode(true);
  clone.removeAttribute("id");
  clone.removeAttribute("tabindex");
  if ("disabled" in clone) clone.disabled = true;
  clone.querySelector(".capture-indicator")?.remove();
  clone.setAttribute("aria-hidden", "true");
  clone.className = "card card-flight";
  Object.assign(clone.style, {
    left: `${sourceRect.left}px`,
    top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`
  });
  document.body.append(clone);
  sourceElement?.classList.add("committed");
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const arc = Math.min(24, Math.max(12, Math.abs(dy) * .08));
  const reducedMotion = prefersReducedMotion();
  const keyframes = reducedMotion
    ? [
      { transform: `translate3d(0, 0, 0) rotateY(${faceDownSource ? 88 : 0}deg) scale(1)`, opacity: faceDownSource ? .35 : 1 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) rotateY(0) scale(${landingScale})`, opacity: 1 }
    ]
    : [
      { transform: `translate3d(0, 0, 0) rotateY(${faceDownSource ? 88 : 0}deg) rotate(0deg) scale(1)`, opacity: faceDownSource ? .4 : 1, filter: "brightness(1)" },
      { offset: .2, transform: `translate3d(${dx * .08}px, ${dy * .05 - arc * .45}px, 0) rotateY(0) rotate(-.7deg) scale(${1 + (landingScale - 1) * .18})`, opacity: 1, filter: "brightness(1.08)" },
      { offset: .42, transform: `translate3d(${dx * .38}px, ${dy * .31 - arc}px, 0) rotateY(0) rotate(-1.2deg) scale(${1 + (landingScale - 1) * .46})`, opacity: 1, filter: "brightness(1.08)" },
      { offset: .82, transform: `translate3d(${dx * .88}px, ${dy * .86 - arc * .25}px, 0) rotateY(0) rotate(.45deg) scale(${1 + (landingScale - 1) * .9})`, opacity: 1, filter: "brightness(1.14)" },
      { transform: `translate3d(${dx}px, ${dy}px, 0) rotateY(0) rotate(0deg) scale(${landingScale})`, opacity: 1, filter: "brightness(1)" }
    ];
  const animation = clone.animate(keyframes, {
    duration: reducedMotion ? REDUCED_PLAY_FLIGHT_DURATION : PLAY_FLIGHT_DURATION,
    easing: "cubic-bezier(.16, 1, .3, 1)",
    fill: "forwards"
  });
  await animation.finished.catch(() => {});
  await waitForMotion(reducedMotion ? REDUCED_PLAY_LAND_HOLD_DURATION : PLAY_LAND_HOLD_DURATION);
  clone.remove();
  if (!options.keepSourceCommitted) sourceElement?.classList.remove("committed");
}

function sourceForPlayedCard(cardId, actorSeat) {
  const ownSeat = localSeat();
  const sourceElement = actorSeat === ownSeat
    ? els.hand.querySelector(`[data-card-id="${cardId}"]`)
    : els.opponentHand.querySelector(".card:last-child");
  if (sourceElement) return { sourceElement, sourceRect: sourceElement.getBoundingClientRect(), faceDown: actorSeat !== ownSeat };

  const zone = actorSeat === ownSeat ? els.hand : els.opponentHand;
  const zoneRect = zone.getBoundingClientRect();
  const reference = els.field.querySelector(".card")?.getBoundingClientRect();
  const width = reference?.width || 48;
  const height = reference?.height || 80;
  return {
    sourceElement: null,
    sourceRect: cardSizedRect(zoneRect.left + zoneRect.width / 2, zoneRect.top + zoneRect.height / 2, width, height),
    faceDown: actorSeat !== ownSeat
  };
}

async function animatePlayedCardForSeat(cardId, actorSeat) {
  if (motionOrigins.has(cardId)) return;
  const source = sourceForPlayedCard(cardId, actorSeat);
  await animatePlayedCard(source.sourceElement, cardId, { sourceRect: source.sourceRect, faceDown: source.faceDown });
}

function renderPendingPlayedCard() {
  document.querySelectorAll(".pending-played-card").forEach((element) => element.remove());
  if (state.phase !== "select" || !state.pending?.cardId) return;
  const cardId = state.pending.cardId;
  let rect = motionOrigins.get(cardId);
  if (!rect) {
    const matches = [...els.field.querySelectorAll(".card")].filter((element) => state.pending.matches?.includes(element.dataset.cardId));
    const landing = matchingFieldLandingPoint(matches);
    const reference = matches[0]?.getBoundingClientRect() || els.field.querySelector(".card")?.getBoundingClientRect();
    if (!landing || !reference) return;
    rect = cardSizedRect(landing.x, landing.y, reference.width, reference.height);
    motionOrigins.set(cardId, rect);
  }
  const pendingCard = createCardElement(cardId);
  pendingCard.classList.add("pending-played-card");
  pendingCard.setAttribute("aria-hidden", "true");
  Object.assign(pendingCard.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  });
  document.body.append(pendingCard);
}

async function animatePendingCardToMatch(cardId, fieldCardId) {
  const chosen = els.field.querySelector(`[data-card-id="${fieldCardId}"]`);
  if (!chosen) return;
  let pendingCard = document.querySelector(`.pending-played-card[data-card-id="${cardId}"]`);
  if (!pendingCard) {
    renderPendingPlayedCard();
    pendingCard = document.querySelector(`.pending-played-card[data-card-id="${cardId}"]`);
  }
  const chosenRect = chosen.getBoundingClientRect();
  const sourceRect = pendingCard?.getBoundingClientRect() || motionOrigins.get(cardId) || chosenRect;
  const overlapOffset = chosenRect.width * FIELD_OVERLAP_OFFSET_RATIO;
  const targetRect = cardSizedRect(
    chosenRect.left + chosenRect.width / 2 + overlapOffset,
    chosenRect.top + chosenRect.height / 2 + overlapOffset,
    chosenRect.width,
    chosenRect.height
  );
  chosen.classList.add("chosen-match");
  motionOrigins.set(cardId, targetRect);
  if (!pendingCard) {
    await waitForMotion(prefersReducedMotion() ? REDUCED_MATCH_SLIDE_DURATION : MATCH_SLIDE_DURATION);
    await waitForMotion(prefersReducedMotion() ? REDUCED_MATCH_LAND_HOLD_DURATION : MATCH_LAND_HOLD_DURATION);
    return;
  }
  const dx = targetRect.left - sourceRect.left;
  const dy = targetRect.top - sourceRect.top;
  const scale = Math.min(targetRect.width / sourceRect.width, targetRect.height / sourceRect.height);
  const reducedMotion = prefersReducedMotion();
  const animation = pendingCard.animate(reducedMotion
    ? [
      { transform: "translate3d(0, 0, 0) scale(1)" },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})` }
    ]
    : [
      { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)", filter: "brightness(1)" },
      { offset: .72, transform: `translate3d(${dx * .86}px, ${dy * .82 - 7}px, 0) rotate(-.7deg) scale(${scale + (1 - scale) * .08})`, filter: "brightness(1.16)" },
      { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(${scale})`, filter: "brightness(1)" }
    ], {
      duration: reducedMotion ? REDUCED_MATCH_SLIDE_DURATION : MATCH_SLIDE_DURATION,
      easing: "cubic-bezier(.16, 1, .3, 1)",
      fill: "forwards"
    });
  await animation.finished.catch(() => {});
  animation.cancel();
  Object.assign(pendingCard.style, {
    left: `${targetRect.left}px`,
    top: `${targetRect.top}px`,
    width: `${targetRect.width}px`,
    height: `${targetRect.height}px`,
    transform: "none"
  });
  await waitForMotion(reducedMotion ? REDUCED_MATCH_LAND_HOLD_DURATION : MATCH_LAND_HOLD_DURATION);
}

async function handleHandClick(cardId, sourceElement) {
  if (!isLocalTurn() || interactionLocked) return;
  if (requiresTapConfirmation() && selectedHandCardId !== cardId) {
    updateHandSelection(cardId);
    return;
  }
  selectedHandCardId = null;
  activeOutgoingCardId = cardId;
  interactionLocked = true;
  const sendsOnline = Boolean(window.TierOnline?.shouldSendAction());
  previewCaptureFor(cardId, true);
  await animatePlayedCard(sourceElement, cardId, { keepSourceCommitted: sendsOnline });
  clearCapturePreview();
  if (sendsOnline) {
    window.TierOnline.sendAction({ type: "play", cardId, playerName: localPlayerName });
    scheduleInteractionUnlock(6000, () => sourceElement.classList.remove("committed"));
  } else await playCard(cardId, localSeat());
  if (!sendsOnline) scheduleInteractionUnlock(160);
}

async function handleMatchClick(cardId, sourceElement) {
  if (state.phase !== "select" || state.pending?.actorSeat !== localSeat() || interactionLocked) return;
  interactionLocked = true;
  const sendsOnline = Boolean(window.TierOnline?.shouldSendAction());
  await animatePendingCardToMatch(state.pending.cardId, cardId);
  if (sendsOnline) {
    window.TierOnline.sendAction({ type: "match", cardId, playerName: localPlayerName });
    scheduleInteractionUnlock(6000);
  } else await chooseMatch(cardId, localSeat(), { preAnimated: true });
  if (!sendsOnline) scheduleInteractionUnlock(130);
}

async function handleDrawConfirm(fieldCardId = null) {
  if (state.phase !== "drawReady" || state.pending?.actorSeat !== localSeat() || interactionLocked) return;
  const matches = state.pending.matches || [];
  if (matches.length === 2 && !matches.includes(fieldCardId)) return;
  const targetId = matches.length === 2 ? fieldCardId : matches.length === 1 ? matches[0] : null;
  const drawnCard = state.pending.drawnCard;
  interactionLocked = true;
  const sendsOnline = Boolean(window.TierOnline?.shouldSendAction());
  await animateDrawnCardToField(drawnCard, targetId, { keepAtTarget: true });
  if (sendsOnline) {
    window.TierOnline.sendAction({ type: "drawConfirm", cardId: fieldCardId, playerName: localPlayerName });
    scheduleInteractionUnlock(6000, () => {
      clearDrawFlightClone(drawnCard);
      els.drawnCardPreview.querySelector(`[data-card-id="${drawnCard}"]`)?.classList.remove("committed");
    });
  } else await resolveDraw(fieldCardId, localSeat(), { preAnimated: true });
  if (!sendsOnline) scheduleInteractionUnlock(130);
}

function handleGameTap(event) {
  const handCard = event.target.closest("#playerHand .card[data-card-id]");
  const fieldCard = event.target.closest("#fieldCards .card[data-card-id]");
  if (handCard && state.currentPlayer !== localSeat()) {
    queueNextInput({ type: "hand", cardId: handCard.dataset.cardId });
    return;
  }
  if (handCard && interactionLocked && handCard.dataset.cardId !== activeOutgoingCardId) {
    queueNextInput({ type: "hand", cardId: handCard.dataset.cardId });
    return;
  }
  if (state.phase === "draw") {
    const drawnCard = state.pending?.drawnCard;
    const month = CARD_MAP.get(drawnCard)?.month;
    const matches = state.field.filter((id) => CARD_MAP.get(id)?.month === month);
    if (matches.length === 2) {
      if (fieldCard && matches.includes(fieldCard.dataset.cardId)) queueNextInput({ type: "drawMatch", cardId: fieldCard.dataset.cardId });
    } else if (event.target.closest(".table-zone")) queueNextInput({ type: "advance" });
    return;
  }
  if (state.phase === "capture") {
    if (handCard) queueNextInput({ type: "hand", cardId: handCard.dataset.cardId });
    else if (event.target.closest(".table-zone")) queueNextInput({ type: "advance" });
    return;
  }
  if (state.phase === "play" && interactionLocked && activeOutgoingCardId) {
    const month = CARD_MAP.get(activeOutgoingCardId)?.month;
    const matches = state.field.filter((id) => CARD_MAP.get(id)?.month === month);
    if (matches.length === 2 && fieldCard && matches.includes(fieldCard.dataset.cardId)) {
      queueNextInput({ type: "match", cardId: fieldCard.dataset.cardId });
    } else if (event.target.closest(".table-zone")) {
      queueNextInput({ type: "advance" });
    }
    return;
  }
  if (selectedHandCardId && !handCard) updateHandSelection(null);
}

function handleTableTap(event) {
  if (state.phase !== "drawReady" || state.pending?.actorSeat !== localSeat()) return;
  if ((state.pending.matches || []).length === 2) return;
  if (event.target.closest("button, [role='button']")) return;
  handleDrawConfirm();
}

function scheduleInteractionUnlock(delay, onFallback) {
  clearTimeout(interactionUnlockTimer);
  interactionUnlockTimer = window.setTimeout(() => {
    interactionLocked = false;
    interactionUnlockTimer = null;
    onFallback?.();
    flushQueuedInput();
  }, delay);
}

function releaseInteractionLock() {
  clearTimeout(interactionUnlockTimer);
  interactionUnlockTimer = null;
  interactionLocked = false;
  flushQueuedInput();
}

function handleKoi(choice) {
  if (state.phase !== "koi" || state.pending?.actorSeat !== localSeat()) return;
  if (window.TierOnline?.shouldSendAction()) {
    window.TierOnline.sendAction({ type: "koi", choice, playerName: localPlayerName });
  } else chooseKoi(choice, localSeat());
}

function createCardElement(id, options = {}) {
  const card = CARD_MAP.get(id);
  const element = document.createElement(options.button ? "button" : "div");
  if (options.button) element.type = "button";
  element.className = `card${options.back ? " back" : ""}${options.playable ? " playable" : ""}${options.matchable ? " matchable" : ""}${options.canCapture ? " can-capture" : ""}${options.takeable ? " takeable" : ""}${options.drawn ? " drawn-card" : ""}`;
  if (options.back) {
    element.setAttribute("aria-label", "伏せ札");
    return element;
  }
  element.dataset.cardId = id;
  element.dataset.month = card.month;
  element.dataset.palette = card.palette;
  element.dataset.type = card.type;
  element.dataset.key = card.key;
  element.innerHTML = `<span class="card-face"><img class="card-art" src="${card.asset}" alt="" draggable="false" /></span>${options.canCapture || options.takeable ? '<span class="capture-indicator" aria-hidden="true">取</span>' : ""}`;
  element.setAttribute("aria-label", `${card.month}月 ${card.monthName} ${typeLabel(card.type)}${options.canCapture || options.takeable ? "、取れる札" : ""}`);
  return element;
}

function createRulesCard(id, className) {
  const card = createCardElement(id);
  card.classList.add(className);
  return card;
}

function appendRulesCards(target, ids, className) {
  ids.filter(Boolean).forEach((id) => target.append(createRulesCard(id, className)));
}

function renderRulesPlayExamples() {
  const match = document.querySelector('[data-rules-example="match"]');
  const draw = document.querySelector('[data-rules-example="draw"]');
  const yaku = document.querySelector('[data-rules-example="yaku"]');
  if (!match || !draw || !yaku) return;

  match.replaceChildren(
    createRulesCard("3-2", "rules-play-card"),
    Object.assign(document.createElement("span"), { className: "rules-visual-label", textContent: "同じ三月" }),
    createRulesCard("3-1", "rules-play-card"),
    Object.assign(document.createElement("span"), { className: "rules-visual-arrow", textContent: "→" }),
    Object.assign(document.createElement("span"), { className: "rules-visual-label", textContent: "二枚とも取る" })
  );

  const deckBack = createCardElement("1-1", { back: true });
  deckBack.classList.add("rules-play-card");
  draw.replaceChildren(
    deckBack,
    Object.assign(document.createElement("span"), { className: "rules-visual-arrow", textContent: "→" }),
    createRulesCard("9-1", "rules-play-card"),
    Object.assign(document.createElement("span"), { className: "rules-visual-label", textContent: "場の九月と合わせる" })
  );

  appendRulesCards(yaku, ["1-2", "2-2", "3-2"], "rules-play-card");
  yaku.append(Object.assign(document.createElement("span"), { className: "rules-visual-label", textContent: "赤短成立\n5文" }));
}

function renderRulesYakuList() {
  const target = document.querySelector("#rulesYakuList");
  if (!target) return;
  const key = (name) => CARD_ID_BY_KEY.get(name);
  const byType = (type, count) => window.HanafudaCards.cards.filter((card) => card.type === type).slice(0, count).map((card) => card.id);
  const guides = [
    { name: "五光", points: "15文", note: "五種類すべての光札", ids: [key("crane"), key("curtain"), key("moon"), key("rain"), key("phoenix")] },
    { name: "四光", points: "10文", note: "雨を除く四種類の光札", ids: [key("crane"), key("curtain"), key("moon"), key("phoenix")] },
    { name: "雨四光", points: "8文", note: "雨を含む光札四枚。この組み合わせは成立例です", ids: [key("crane"), key("curtain"), key("moon"), key("rain")] },
    { name: "三光", points: "5文", note: "雨を除く光札三枚。この組み合わせは成立例です", ids: [key("crane"), key("curtain"), key("moon")] },
    { name: "猪鹿蝶", points: "5文", note: "萩の猪、紅葉の鹿、牡丹の蝶", ids: [key("boar"), key("deer"), key("butterfly")] },
    { name: "赤短", points: "5文", note: "松・梅・桜の文字入り短冊", ids: ["1-2", "2-2", "3-2"] },
    { name: "青短", points: "5文", note: "牡丹・菊・紅葉の青短冊", ids: ["6-2", "9-2", "10-2"] },
    { name: "花見酒", points: "5文", note: "桜の幕と菊の盃", ids: [key("curtain"), key("sake")] },
    { name: "月見酒", points: "5文", note: "芒の月と菊の盃", ids: [key("moon"), key("sake")] },
    { name: "たね", points: "1文〜", note: "たね札を五枚。以後一枚増えるごとに一文追加", ids: byType("animal", 5) },
    { name: "短冊", points: "1文〜", note: "短冊札を五枚。以後一枚増えるごとに一文追加", ids: byType("ribbon", 5) },
    { name: "かす", points: "1文〜", note: "かす札を十枚。菊の盃もかすとして数えます", ids: byType("chaff", 5) }
  ];

  target.replaceChildren();
  guides.forEach((guide) => {
    const item = document.createElement("section");
    item.className = "rules-yaku-item";
    item.setAttribute("aria-label", `${guide.name} ${guide.points}`);
    const head = document.createElement("div");
    head.className = "rules-yaku-head";
    head.innerHTML = `<strong>${guide.name}</strong><b>${guide.points}</b>`;
    const note = document.createElement("p");
    note.textContent = guide.note;
    const cards = document.createElement("div");
    cards.className = "rules-yaku-cards";
    appendRulesCards(cards, guide.ids, "rules-yaku-card");
    item.append(head, note, cards);
    target.append(item);
  });
}

function renderRulesMonthList() {
  const target = document.querySelector("#rulesMonthList");
  if (!target) return;
  target.replaceChildren();
  window.HanafudaCards.months.forEach((month, index) => {
    const monthNumber = index + 1;
    const item = document.createElement("section");
    item.className = "rules-month-item";
    item.setAttribute("aria-label", `${MONTH_NAMES[index]} ${month.name}の札`);
    const title = document.createElement("div");
    title.className = "rules-month-title";
    title.innerHTML = `<strong>${MONTH_NAMES[index]}</strong><span>${month.name}</span>`;
    const cards = document.createElement("div");
    cards.className = "rules-month-cards";
    appendRulesCards(cards, window.HanafudaCards.cards.filter((card) => card.month === monthNumber).map((card) => card.id), "rules-month-card");
    item.append(title, cards);
    target.append(item);
  });
}

function renderRulesGuide() {
  const dialog = document.querySelector("#rulesDialog");
  if (!dialog || dialog.dataset.rendered === "true") return;
  renderRulesPlayExamples();
  renderRulesYakuList();
  renderRulesMonthList();
  dialog.dataset.rendered = "true";
}

function selectRulesTab(name, focus = false) {
  const dialog = document.querySelector("#rulesDialog");
  const tabs = [...dialog.querySelectorAll("[data-rules-tab]")];
  const panels = [...dialog.querySelectorAll("[data-rules-panel]")];
  const selected = tabs.find((tab) => tab.dataset.rulesTab === name) || tabs[0];
  tabs.forEach((tab) => {
    const active = tab === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  panels.forEach((panel) => { panel.hidden = panel.dataset.rulesPanel !== selected.dataset.rulesTab; });
  if (focus) selected.focus();
  dialog.scrollTop = 0;
}

function openRulesDialog() {
  renderRulesGuide();
  selectRulesTab("play");
  const menu = document.querySelector("#menuDialog");
  if (menu.open) menu.close();
  document.querySelector("#rulesDialog").showModal();
}

function typeLabel(type) {
  return ({ bright: "光", animal: "たね", ribbon: "短冊", chaff: "かす" })[type] || type;
}

function cardLabel(id) {
  const card = CARD_MAP.get(id);
  if (!card) return "札";
  const special = card.key === "plain" ? typeLabel(card.type) : card.glyph;
  return `${card.monthName}の${special}`;
}

function createMiniCardMarkup(id, className, offset = null) {
  const card = CARD_MAP.get(id);
  if (!card) return "";
  const style = offset == null ? "" : ` style="--card-offset:${offset}px"`;
  return `<span class="${className}" data-card-id="${id}"${style} role="img" aria-label="${escapeHtml(cardLabel(id))}" title="${escapeHtml(cardLabel(id))}"><img src="${card.asset}" alt="" draggable="false" /></span>`;
}

function getYakuProgress(ids) {
  const captured = new Set(ids);
  const cards = ids.map((id) => CARD_MAP.get(id)).filter(Boolean);
  const byType = (type) => cards.filter((card) => card.type === type).length;
  const hasKey = (key) => cards.some((card) => card.key === key);
  const brightIds = window.HanafudaCards.cards.filter((card) => card.type === "bright").map((card) => card.id);
  const nonRainBrightIds = brightIds.filter((id) => CARD_MAP.get(id).key !== "rain");
  const rainId = CARD_ID_BY_KEY.get("rain");
  const tracks = [];

  const addExactTrack = (id, name, targetIds, points, minimum = 1) => {
    const current = targetIds.filter((cardId) => captured.has(cardId)).length;
    if (current < minimum || current >= targetIds.length) return;
    const missingIds = targetIds.filter((cardId) => !captured.has(cardId));
    tracks.push({ id, name, current, target: targetIds.length, points, missingIds, status: missingIds.length === 1 ? "reach" : "progress" });
  };

  const addCountTrack = (id, name, current, target, points, noun) => {
    if (current <= 0 || current >= target) return;
    tracks.push({ id, name, current, target, points, missingIds: [], status: current === target - 1 ? "reach" : "progress", noun });
  };

  const capturedBright = brightIds.filter((id) => captured.has(id));
  const capturedNonRain = nonRainBrightIds.filter((id) => captured.has(id));
  if (capturedBright.length === 4) {
    addExactTrack("goko", "五光", brightIds, 15, 1);
  } else if (capturedBright.length < 4 && hasKey("rain") && capturedNonRain.length >= 1) {
    const missingCandidates = nonRainBrightIds.filter((id) => !captured.has(id));
    tracks.push({ id: "ameshiko", name: "雨四光", current: capturedBright.length, target: 4, points: 8, missingIds: missingCandidates, status: capturedBright.length === 3 ? "reach" : "progress" });
  } else if (capturedNonRain.length >= 1 && capturedNonRain.length < 3) {
    const missingCandidates = nonRainBrightIds.filter((id) => !captured.has(id));
    tracks.push({ id: "sanko", name: "三光", current: capturedNonRain.length, target: 3, points: 5, missingIds: missingCandidates, status: capturedNonRain.length === 2 ? "reach" : "progress" });
  } else if (capturedNonRain.length === 3 && !captured.has(rainId)) {
    addExactTrack("shiko", "四光", nonRainBrightIds, 10, 1);
  }

  addExactTrack("inoshikacho", "猪鹿蝶", [CARD_ID_BY_KEY.get("boar"), CARD_ID_BY_KEY.get("deer"), CARD_ID_BY_KEY.get("butterfly")], 5);
  addExactTrack("akatan", "赤短", ["1-2", "2-2", "3-2"], 5);
  addExactTrack("aotan", "青短", ["6-2", "9-2", "10-2"], 5);
  addExactTrack("hanamizake", "花見酒", [CARD_ID_BY_KEY.get("curtain"), CARD_ID_BY_KEY.get("sake")], 5);
  addExactTrack("tsukimizake", "月見酒", [CARD_ID_BY_KEY.get("moon"), CARD_ID_BY_KEY.get("sake")], 5);

  addCountTrack("tane", "たね", byType("animal"), 5, 1, "たね札");
  addCountTrack("tanzaku", "短冊", byType("ribbon"), 5, 1, "短冊札");
  const chaffCount = byType("chaff") + (hasKey("sake") ? 1 : 0);
  addCountTrack("kasu", "かす", chaffCount, 10, 1, "かす札");

  return tracks
    .sort((a, b) => (a.status === "reach" ? -1 : 0) - (b.status === "reach" ? -1 : 0) || (b.current / b.target) - (a.current / a.target) || b.points - a.points);
}

function captureCounts(ids) {
  const counts = { bright: 0, animal: 0, ribbon: 0, chaff: 0 };
  ids.forEach((id) => {
    const card = CARD_MAP.get(id);
    if (card) counts[card.type] += 1;
  });
  return counts;
}

function captureSummaryMarkup(ids) {
  const counts = captureCounts(ids);
  return [["光", counts.bright], ["たね", counts.animal], ["短冊", counts.ribbon], ["かす", counts.chaff]]
    .map(([label, count]) => `<span class="capture-chip">${label}<b>${count}</b></span>`)
    .join("");
}

function renderCapturedRail(target, ids) {
  if (!target) return;
  const previousRects = snapshotCardRects(target.querySelectorAll(".capture-rail-card"), (element) => element.dataset.cardId);
  const groups = CAPTURE_GROUPS.map(([type, label]) => ({
    type,
    label,
    ids: ids.filter((id) => CARD_MAP.get(id)?.type === type).sort((a, b) => CARD_MAP.get(a).month - CARD_MAP.get(b).month)
  }));

  target.innerHTML = groups.map((group) => {
    const cards = group.ids.map((id, index) => createMiniCardMarkup(
      id,
      `capture-rail-card${captureFlightIds.has(id) ? " newly-captured" : ""}`,
      captureCardOffset(index, group.ids.length)
    )).join("");
    return `<span class="capture-pile${group.ids.length ? "" : " empty"}" data-capture-type="${group.type}" aria-label="${group.label} ${group.ids.length}枚"><span class="capture-pile-label"><b>${group.label}</b><span>${group.ids.length}</span></span><span class="capture-pile-cards">${cards}</span></span>`;
  }).join("");
  animateCardReflow(target.querySelectorAll(".capture-rail-card"), previousRects, (element) => element.dataset.cardId);
}

function renderCaptureDialog(seat) {
  const dialog = document.querySelector("#captureDialog");
  const groupsRoot = document.querySelector("#captureDialogGroups");
  if (!dialog || !groupsRoot) return;
  const self = localSeat();
  const ids = state.captures[seat] || [];
  const owner = seat === self ? "自分" : (state.players[seat] || "相手");
  const counts = captureCounts(ids);
  dialog.dataset.seat = String(seat);
  document.querySelector("#captureDialogTitle").textContent = `${owner}の取札`;
  document.querySelector("#captureDialogSummary").textContent = `${ids.length}枚　光 ${counts.bright}・たね ${counts.animal}・短冊 ${counts.ribbon}・かす ${counts.chaff}`;
  groupsRoot.replaceChildren();

  if (!ids.length) {
    const empty = document.createElement("p");
    empty.className = "capture-dialog-empty";
    empty.textContent = `${owner}はまだ札を取っていません`;
    groupsRoot.append(empty);
    return;
  }

  CAPTURE_GROUPS.forEach(([type, label]) => {
    const groupIds = ids
      .filter((id) => CARD_MAP.get(id)?.type === type)
      .sort((a, b) => CARD_MAP.get(a).month - CARD_MAP.get(b).month);
    if (!groupIds.length) return;
    const group = document.createElement("section");
    group.className = "capture-dialog-group";
    group.setAttribute("aria-label", `${label} ${groupIds.length}枚`);
    const heading = document.createElement("div");
    heading.className = "capture-dialog-group-head";
    heading.innerHTML = `<strong>${label}</strong><span>${groupIds.length}枚</span>`;
    const cards = document.createElement("div");
    cards.className = "capture-dialog-cards";
    groupIds.forEach((id, index) => {
      const card = createCardElement(id);
      card.classList.add("capture-dialog-card");
      card.style.setProperty("--capture-card-index", index);
      cards.append(card);
    });
    group.append(heading, cards);
    groupsRoot.append(group);
  });
}

function openCaptureDialog(seat) {
  if (!state.active) return;
  const dialog = document.querySelector("#captureDialog");
  if (!dialog || dialog.open) return;
  renderCaptureDialog(seat);
  dialog.showModal();
}

function bindCaptureArea(selector, seatResolver) {
  const area = document.querySelector(selector);
  if (!area) return;
  area.addEventListener("click", () => openCaptureDialog(seatResolver()));
  area.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openCaptureDialog(seatResolver());
  });
}

function nextFieldPlacementPoint(cardId) {
  const slot = els.field.querySelector(`[data-field-slot="${fieldSlotIndexForCard(cardId)}"]`);
  const rect = slot?.getBoundingClientRect();
  if (!rect?.width || !rect?.height) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function drawReadyPrompt(matchCount) {
  if (matchCount === 1) return "画面をタップして札を取る";
  if (matchCount === 2) return "取る場札を一枚選ぶ";
  if (matchCount === 3) return "画面をタップして三枚とも取る";
  return "画面をタップして場へ出す";
}

function renderDeck() {
  const count = state.deck.length;
  document.querySelector("#deckPileCount").textContent = count;
  els.deckPile.setAttribute("aria-label", `山札 残り${count}枚`);
  els.deckPile.classList.toggle("empty", count === 0);
  els.deckPile.classList.toggle("drawing", state.phase === "draw");
  els.drawnCardPreview.replaceChildren();
  const drawPhase = state.phase === "draw" || state.phase === "drawReady" || state.phase === "drawMoving";
  const drawnId = drawPhase ? state.pending?.drawnCard : null;
  if (!drawnId || !CARD_MAP.has(drawnId)) {
    document.querySelector("#deckLabel").textContent = "山札";
    document.querySelector("#deckLabel").classList.remove("revealed");
    els.drawnCardPreview.classList.add("hidden");
    els.drawnCardPreview.classList.remove("revealing", "ready");
    return;
  }
  const revealed = createCardElement(drawnId, { drawn: true });
  els.drawnCardPreview.append(revealed);
  const matches = state.pending?.matches || [];
  const instruction = state.phase === "drawReady" && state.pending?.actorSeat === localSeat()
    ? `。${drawReadyPrompt(matches.length)}操作です`
    : "";
  els.drawnCardPreview.setAttribute("aria-label", `山札から${cardLabel(drawnId)}をめくりました${instruction}`);
  document.querySelector("#deckLabel").textContent = cardLabel(drawnId);
  document.querySelector("#deckLabel").classList.add("revealed");
  els.drawnCardPreview.classList.remove("hidden");
  els.drawnCardPreview.classList.toggle("revealing", state.phase === "draw");
  els.drawnCardPreview.classList.toggle("ready", state.phase === "drawReady");
}

function render() {
  const active = Boolean(state.active);
  els.lobby.classList.toggle("hidden", active);
  els.game.classList.toggle("hidden", !active);
  renderProfile();
  renderRoomStartState();
  if (!active) return;
  ensureFieldMonthSlots();

  const self = localSeat();
  const opponent = 1 - self;
  document.querySelector("#monthLabel").textContent = MONTH_NAMES[Math.max(0, state.round - 1)] || `${state.round}局`;
  document.querySelector("#roundProgress").textContent = `${state.round} / ${state.matchLength}局`;
  document.querySelector("#deckCount").textContent = `残り${state.deck.length}枚`;
  document.querySelector("#selfName").textContent = state.players[self] || "あなた";
  document.querySelector("#opponentName").textContent = state.players[opponent] || "相手";
  renderAvatar(document.querySelector("#selfAvatar"), state.players[self] || "あなた", state.playerIcons?.[self]);
  renderAvatar(document.querySelector("#opponentAvatar"), state.players[opponent] || "相手", state.playerIcons?.[opponent]);
  document.querySelector("#selfCaptured").textContent = `取札 ${(state.captures[self] || []).length}枚`;
  document.querySelector("#opponentCaptured").textContent = `取札 ${(state.captures[opponent] || []).length}枚`;
  document.querySelector("#topScore").textContent = state.scores[opponent] || 0;
  document.querySelector("#bottomScore").textContent = state.scores[self] || 0;
  document.querySelector("#topRole").textContent = state.dealer === opponent ? "親" : "子";
  document.querySelector("#bottomRole").textContent = state.dealer === self ? "親" : "子";

  const previousOpponentHandRects = snapshotCardRects(els.opponentHand.querySelectorAll(".card"), (_element, index) => index);
  const previousFieldRects = snapshotCardRects(els.field.querySelectorAll(".card"), (element) => element.dataset.cardId);
  const previousHandRects = snapshotCardRects(els.hand.querySelectorAll(".card"), (element) => element.dataset.cardId);

  els.opponentHand.replaceChildren();
  const opponentCount = state.handCounts?.[opponent] ?? state.hands[opponent]?.length ?? 0;
  for (let i = 0; i < opponentCount; i += 1) els.opponentHand.append(createCardElement("1-1", { back: true }));
  animateCardReflow(els.opponentHand.querySelectorAll(".card"), previousOpponentHandRects, (_element, index) => index);

  const canPlay = isLocalTurn();
  const localHand = visibleHand();
  if (!canPlay || !localHand.includes(selectedHandCardId)) selectedHandCardId = null;
  const playableMonths = new Set(canPlay ? localHand.map((id) => CARD_MAP.get(id)?.month) : []);
  els.field.replaceChildren();
  const fieldSlots = Array.from({ length: FIELD_SLOT_COUNT }, (_unused, slotIndex) => {
    const slot = document.createElement("div");
    slot.className = "field-slot";
    slot.dataset.fieldSlot = String(slotIndex);
    slot.setAttribute("role", "presentation");
    els.field.append(slot);
    return slot;
  });
  const fieldCardsByMonth = new Map();
  state.field.forEach((id) => {
    const month = CARD_MAP.get(id)?.month;
    if (!fieldCardsByMonth.has(month)) fieldCardsByMonth.set(month, []);
    fieldCardsByMonth.get(month).push(id);
  });
  state.field.forEach((id) => {
    const month = CARD_MAP.get(id)?.month;
    const monthCards = fieldCardsByMonth.get(month) || [id];
    const stackIndex = monthCards.indexOf(id);
    const centeredStackIndex = stackIndex - (monthCards.length - 1) / 2;
    const layer = document.createElement("div");
    layer.className = "field-card-layer";
    layer.style.setProperty("--field-stack-offset", `${centeredStackIndex * FIELD_OVERLAP_OFFSET_RATIO * 100}%`);
    layer.style.zIndex = String(stackIndex + 1);
    const handMatchable = state.phase === "select" && state.pending?.matches?.includes(id) && state.pending.actorSeat === self;
    const drawMatchable = state.phase === "drawReady" && state.pending?.actorSeat === self && state.pending?.matches?.length === 2 && state.pending.matches.includes(id);
    const drawTarget = state.phase === "drawReady" && state.pending?.actorSeat === self && state.pending?.matches?.includes(id);
    const matchable = handMatchable || drawMatchable;
    const takeable = (canPlay && playableMonths.has(CARD_MAP.get(id)?.month)) || drawTarget;
    const element = createCardElement(id, { button: matchable, matchable, takeable });
    const fieldSlotIndex = fieldSlotIndexForCard(id);
    element.dataset.fieldSlot = String(fieldSlotIndex);
    if (handMatchable) element.addEventListener("click", () => handleMatchClick(id, element));
    else if (drawMatchable) element.addEventListener("click", () => handleDrawConfirm(id));
    layer.append(element);
    fieldSlots[fieldSlotIndex].append(layer);
  });
  animateCardReflow(els.field.querySelectorAll(".card"), previousFieldRects, (element) => element.dataset.cardId);

  els.hand.replaceChildren();
  localHand.forEach((id) => {
    const month = CARD_MAP.get(id)?.month;
    const canCapture = canPlay && state.field.some((fieldId) => CARD_MAP.get(fieldId)?.month === month);
    const element = createCardElement(id, { button: canPlay, playable: canPlay, canCapture });
    const selected = canPlay && selectedHandCardId === id;
    element.classList.toggle("selected", selected);
    if (canPlay) element.setAttribute("aria-pressed", String(selected));
    if (canPlay) {
      element.addEventListener("pointerenter", () => previewCaptureFor(id, true));
      element.addEventListener("pointerleave", () => {
        if (selectedHandCardId !== id) clearCapturePreview();
      });
      element.addEventListener("pointerdown", () => previewCaptureFor(id, true));
      element.addEventListener("focus", () => previewCaptureFor(id, true));
      element.addEventListener("blur", () => {
        if (selectedHandCardId !== id) clearCapturePreview();
      });
      element.addEventListener("click", () => handleHandClick(id, element));
    }
    els.hand.append(element);
  });
  animateCardReflow(els.hand.querySelectorAll(".card"), previousHandRects, (element) => element.dataset.cardId);

  renderDeck();
  renderPendingPlayedCard();
  renderCapturedSummary(self);
  renderTurnBanner(self);
  renderChoice(self);
}

function renderCapturedSummary(seat) {
  const ids = state.captures[seat] || [];
  const opponentIds = state.captures[1 - seat] || [];
  const result = evaluateYaku(ids);
  const progress = getYakuProgress(ids);
  const reaches = progress.filter((item) => item.status === "reach");

  document.querySelector("#captureTotal").textContent = ids.length;
  document.querySelector("#capturedSummary").innerHTML = captureSummaryMarkup(ids);
  document.querySelector("#opponentCapturedSummary").innerHTML = captureSummaryMarkup(opponentIds);
  renderCapturedRail(document.querySelector("#capturedBoardRail"), ids);
  renderCapturedRail(document.querySelector("#opponentCapturedRail"), opponentIds);
  const openDialog = document.querySelector("#captureDialog");
  if (openDialog?.open && Number.isInteger(Number(openDialog.dataset.seat))) {
    renderCaptureDialog(Number(openDialog.dataset.seat));
  }

  const yakuChips = [
    ...result.yaku.map((name) => `<span class="yaku-status-chip earned">成立 ${escapeHtml(name)}</span>`),
    ...reaches.map((item) => {
      const need = item.missingIds.length === 1 ? cardLabel(item.missingIds[0]) : item.noun ? `${item.noun}1枚` : "候補札1枚";
      return `<span class="yaku-status-chip reach">リーチ ${item.name} → ${escapeHtml(need)}</span>`;
    })
  ];
  if (!yakuChips.length && progress.length) {
    const next = progress[0];
    yakuChips.push(`<span class="yaku-status-chip">役の進み ${next.name} ${next.current}/${next.target}</span>`);
  }
  document.querySelector("#captureYakuStrip").innerHTML = yakuChips.length ? yakuChips.join("") : "札を取ると役の進みを表示";
}

function renderTurnBanner(self) {
  let text = "";
  if (state.phase === "select") {
    const pendingCard = CARD_MAP.get(state.pending?.cardId);
    text = state.pending?.actorSeat === self ? `${pendingCard?.monthName || "同じ月"}に合わせる札を選ぶ` : `${state.players[state.currentPlayer]}が選んでいます`;
  }
  else if (state.phase === "capture") text = state.pending?.actorSeat === self ? "取札へ運んでいます" : `${state.players[state.pending?.actorSeat] || "相手"}が札を取っています`;
  else if (state.phase === "draw") text = state.pending?.actorSeat === self ? "山札をめくっています" : `${state.players[state.currentPlayer]}が山札をめくっています`;
  else if (state.phase === "drawReady") {
    const matches = state.pending?.matches || [];
    if (state.pending?.actorSeat !== self) text = `${state.players[state.pending?.actorSeat] || "相手"}がめくった札を確認中`;
    else text = drawReadyPrompt(matches.length);
  }
  else if (state.phase === "drawMoving") text = "めくった札を場へ運んでいます";
  else if (state.phase === "yakuReveal") text = `${state.players[state.pending?.actorSeat] || "プレイヤー"}の役が成立`;
  else if (state.phase === "koi") text = state.pending?.actorSeat === self ? "こいこいか上がりを選ぶ" : `${state.players[state.pending?.actorSeat]}が選んでいます`;
  else if (state.phase === "decisionReveal") text = state.pending?.choice === "koi" ? "こいこい" : "上がり";
  else if (state.phase === "roundEnd") text = "この局は終了";
  else if (state.phase === "matchEnd") text = "対局終了";
  else text = state.currentPlayer === self ? (selectedHandCardId ? "もう一度タップして札を出す" : "あなたの番") : `${state.players[state.currentPlayer]}の番`;
  els.turnBanner.textContent = text;
  const interactive = (state.phase === "play" && state.currentPlayer === self)
    || (state.phase === "select" && state.pending?.actorSeat === self)
    || (state.phase === "drawReady" && state.pending?.actorSeat === self);
  els.turnBanner.classList.toggle("waiting", !interactive);
  const confirmsDraw = state.phase === "drawReady" && state.pending?.actorSeat === self && state.pending?.matches?.length !== 2;
  els.turnBanner.classList.toggle("tap-prompt", confirmsDraw);
  els.turnBanner.tabIndex = confirmsDraw ? 0 : -1;
  if (confirmsDraw) els.turnBanner.setAttribute("role", "button");
  else els.turnBanner.removeAttribute("role");
  els.turnBanner.classList.remove("state-change");
  void els.turnBanner.offsetWidth;
  els.turnBanner.classList.add("state-change");
}

function resultAtmosphereMarkup(variant) {
  const particles = [
    [8, -22, -18, 0], [18, 16, 24, 90], [29, -12, 30, 180], [41, 22, -28, 40],
    [55, -18, 22, 150], [67, 14, -24, 70], [78, -10, 28, 220], [90, 20, -20, 120]
  ].map(([x, drift, turn, delay], index) => `<i class="result-particle result-particle-${index + 1}" style="--x:${x}%;--drift:${drift}px;--turn:${turn}deg;--delay:${delay}ms"></i>`).join("");
  return `<div class="result-atmosphere result-atmosphere-${variant}" aria-hidden="true"><span class="result-aura"></span><span class="result-ring"></span>${particles}</div>`;
}

function resultYakuMarkup(yaku = []) {
  return yaku.map((name, index) => `<span style="--item:${index}">${escapeHtml(name)}</span>`).join("");
}

function yakuDisplayName(label) {
  return String(label || "役").replace(/\s+\d+文$/, "");
}

function yakuNamesFrom(yaku = []) {
  return yaku.map(yakuDisplayName);
}

function yakuTitleMarkup(yaku = []) {
  return yakuNamesFrom(yaku).map((name) => `<span>${escapeHtml(name)}</span>`).join('<i aria-hidden="true">・</i>');
}

function renderChoice(self) {
  els.choice.replaceChildren();
  els.choice.removeAttribute("data-scene");
  els.choice.removeAttribute("aria-labelledby");
  els.choice.removeAttribute("aria-describedby");
  els.choice.classList.remove("cut-in-overlay", "decision-overlay");
  if (state.phase === "yakuReveal" && state.pending) {
    const actorSeat = state.pending.actorSeat;
    const actorName = state.players[actorSeat] || "プレイヤー";
    const yakuNames = yakuNamesFrom(state.pending.yaku);
    const panel = document.createElement("div");
    panel.className = "cut-in-panel cut-in-yaku";
    panel.innerHTML = `${resultAtmosphereMarkup("yaku")}<p class="cut-in-player">${escapeHtml(actorName)}</p><p class="result-kicker">役成立</p><h2 id="choiceHeading" class="yaku-title${yakuNames.length > 2 ? " many" : ""}" aria-label="${escapeHtml(yakuNames.join("、"))}">${yakuTitleMarkup(state.pending.yaku)}</h2><div id="choiceScore" class="choice-score yaku-score"><strong>${state.pending.potentialPoints || state.pending.points}</strong><small>文</small></div>`;
    els.choice.append(panel);
    els.choice.dataset.scene = "yaku-reveal";
    els.choice.classList.add("cut-in-overlay");
    els.choice.setAttribute("aria-labelledby", "choiceHeading");
    els.choice.setAttribute("aria-describedby", "choiceScore");
    els.choice.classList.remove("hidden");
    return;
  }
  if (state.phase === "koi" && state.pending?.actorSeat === self) {
    const yakuNames = yakuNamesFrom(state.pending.yaku);
    const panel = document.createElement("div");
    panel.className = "choice-panel choice-panel-koi";
    panel.innerHTML = `<div class="result-seal choice-seal" aria-hidden="true">決</div><p class="result-kicker">${escapeHtml(state.players[self] || "あなた")}の選択</p><h2 id="choiceHeading">勝負を続けますか</h2><div class="choice-yaku choice-yaku-reminder"><span>${escapeHtml(yakuNames.join("・"))}</span><b>${state.pending.potentialPoints || state.pending.points}文</b></div><div class="choice-buttons"><button class="button" data-koi="koi">こいこい</button><button class="button primary" data-koi="agari">上がり</button></div>`;
    panel.querySelectorAll("[data-koi]").forEach((button) => button.addEventListener("click", () => handleKoi(button.dataset.koi)));
    els.choice.append(panel);
    els.choice.dataset.scene = "koi-choice";
    els.choice.setAttribute("aria-labelledby", "choiceHeading");
    els.choice.classList.remove("hidden");
    return;
  }
  if (state.phase === "decisionReveal" && state.pending) {
    const actorName = state.players[state.pending.actorSeat] || "プレイヤー";
    const continued = state.pending.choice === "koi";
    const heading = continued ? "こいこい" : "上がり";
    const caption = continued ? "勝負を続けます" : "この局を締めます";
    const panel = document.createElement("div");
    panel.className = `cut-in-panel cut-in-decision decision-${continued ? "koi" : "agari"}`;
    panel.innerHTML = `${resultAtmosphereMarkup(continued ? "koi" : "agari")}<p class="cut-in-player">${escapeHtml(actorName)}</p><p class="result-kicker">選択</p><h2 id="choiceHeading">${heading}</h2><p class="cut-in-caption">${caption}</p>${continued ? "" : `<div id="choiceScore" class="choice-score decision-score">${state.pending.awardedPoints}<small>文</small></div>`}`;
    els.choice.append(panel);
    els.choice.dataset.scene = continued ? "decision-koi" : "decision-agari";
    els.choice.classList.add("cut-in-overlay", "decision-overlay");
    els.choice.setAttribute("aria-labelledby", "choiceHeading");
    if (!continued) els.choice.setAttribute("aria-describedby", "choiceScore");
    els.choice.classList.remove("hidden");
    return;
  }
  if (state.phase === "roundEnd" || state.phase === "matchEnd") {
    const result = state.lastResult || { winner: null, points: 0, yaku: ["流局"] };
    const final = state.phase === "matchEnd";
    const winner = final
      ? state.scores[0] === state.scores[1] ? null : state.scores[0] > state.scores[1] ? 0 : 1
      : result.winner;
    const outcome = winner == null ? "draw" : winner === self ? "win" : "loss";
    const seal = outcome === "win" ? "勝" : outcome === "loss" ? "敗" : "分";
    const heading = final
      ? outcome === "win" ? "対局 勝利" : outcome === "loss" ? "対局 敗北" : "対局 引き分け"
      : outcome === "win" ? "勝ち" : outcome === "loss" ? "負け" : "流局";
    const matchLabel = matchLengthLabel();
    const caption = final
      ? outcome === "win" ? `${matchLabel}の勝負を制しました` : outcome === "loss" ? `${escapeHtml(state.players[winner])}が${matchLabel}を制しました` : `${matchLabel}を終え、互いに譲らず`
      : outcome === "win" ? "この局を取りました" : outcome === "loss" ? `${escapeHtml(state.players[winner])}がこの局を取りました` : "札が尽き、この局は流れました";
    const score = final ? `${state.scores[self]}<i>対</i>${state.scores[1 - self]}` : `${result.points}<small>文</small>`;
    const scoreLabel = final ? `<div class="result-score-label"><span>${escapeHtml(state.players[self])}</span><span>${escapeHtml(state.players[1 - self])}</span></div>` : "";
    const panel = document.createElement("div");
    panel.className = `choice-panel choice-panel-result result-${outcome}${final ? " result-final" : ""}`;
    panel.innerHTML = `${resultAtmosphereMarkup(outcome)}<div class="result-seal" aria-hidden="true">${seal}</div><p class="result-kicker">${final ? `${matchLabel}決着` : "一局決着"}</p><h2 id="choiceHeading">${heading}</h2><p class="result-caption">${caption}</p><div class="choice-score">${score}</div>${scoreLabel}<div class="choice-yaku">${resultYakuMarkup(result.yaku)}</div><button class="button primary result-next" data-next>${final ? "もう一度" : "次の局へ"}</button>`;
    panel.querySelector("[data-next]").addEventListener("click", () => {
      if (window.TierOnline?.shouldSendAction()) window.TierOnline.sendAction({ type: final ? "rematch" : "nextRound", playerName: localPlayerName });
      else if (final) rematch();
      else nextRound();
    });
    els.choice.append(panel);
    els.choice.dataset.scene = outcome;
    els.choice.setAttribute("aria-labelledby", "choiceHeading");
    els.choice.classList.remove("hidden");
    return;
  }
  els.choice.classList.add("hidden");
}

function renderProfile() {
  document.querySelector("#displayUsername").textContent = localPlayerName === "Player" ? "名無し" : localPlayerName;
  renderAvatar(document.querySelector("#profileAvatar"), localPlayerName === "Player" ? "名" : localPlayerName, localPlayerIcon);
}

function renderAvatar(target, name, icon) {
  if (!target) return;
  target.replaceChildren();
  target.style.backgroundImage = "";
  target.style.backgroundSize = "";
  if (icon) {
    const image = document.createElement("img");
    image.src = String(icon);
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      target.replaceChildren(document.createTextNode(String(name || "名").slice(0, 1)));
    }, { once: true });
    target.append(image);
    return;
  }
  target.textContent = String(name || "名").slice(0, 1);
}

function renderRoomStartState() {
  const button = document.querySelector("#startOnlineButton");
  if (!button || !window.TierOnline) return;
  const connected = window.TierOnline.online;
  const host = window.TierOnline.host;
  const count = window.TierOnline.getGameParticipantNames().length;
  const title = document.querySelector("#roomStateTitle");
  const text = document.querySelector("#roomStateText");
  button.classList.toggle("hidden", !connected || !host);
  button.disabled = count < 2;
  button.textContent = count < 2 ? "参加者を待っています" : "対局を始める";
  if (title) title.textContent = host ? (count < 2 ? "参加者を待っています" : "対局の準備完了") : "対局開始を待っています";
  if (text) {
    text.textContent = host
      ? (count < 2 ? "もう一人が入室すると対局を始められます。" : "参加者がそろいました。局数を確認して対局を始めてください。")
      : "ホストが対局を始めるまで、この画面でお待ちください。";
  }
}

function persistAndRender() {
  ensureFieldMonthSlots();
  state.handCounts = [state.hands[0]?.length || state.handCounts[0] || 0, state.hands[1]?.length || state.handCounts[1] || 0];
  if (!applyingRemoteState && (mode === "solo" || window.TierOnline?.host)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, state }));
  }
  render();
  if (!applyingRemoteState && window.TierOnline?.online && window.TierOnline.host) {
    window.TierOnline.broadcastState(state);
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  toastTimer = window.setTimeout(() => els.toast.classList.add("hidden"), 2200);
}

function normalizeName(value) { return String(value || "").trim().toLowerCase(); }
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function exportOnlineStateForPlayer() {
  const copy = JSON.parse(JSON.stringify(state));
  copy.hands = [[], []];
  return copy;
}

function exportSecretForPlayer(playerName) {
  const seat = state.players.findIndex((name) => normalizeName(name) === normalizeName(playerName));
  if (seat < 0) return null;
  return { seat, hand: [...state.hands[seat]] };
}

function motionClock() {
  return window.performance?.now?.() ?? Date.now();
}

function inferPlayedCard(previousState, nextState) {
  if (!previousState?.active || previousState.phase !== "play") return null;
  const actorSeat = previousState.currentPlayer;
  const previousCount = previousState.handCounts?.[actorSeat] ?? previousState.hands?.[actorSeat]?.length ?? 0;
  const nextCount = nextState.handCounts?.[actorSeat] ?? nextState.hands?.[actorSeat]?.length ?? previousCount;
  if (nextCount >= previousCount) return null;

  if (nextState.phase === "select" && nextState.pending?.actorSeat === actorSeat && nextState.pending?.cardId) {
    return { cardId: nextState.pending.cardId, actorSeat };
  }

  const previousField = new Set(previousState.field || []);
  const addedFieldCard = (nextState.field || []).find((id) => !previousField.has(id));
  if (addedFieldCard) return { cardId: addedFieldCard, actorSeat };

  const previousCaptures = new Set(previousState.captures?.[actorSeat] || []);
  const addedCaptures = (nextState.captures?.[actorSeat] || []).filter((id) => !previousCaptures.has(id));
  const playedCard = addedCaptures.find((id) => !previousField.has(id));
  return playedCard ? { cardId: playedCard, actorSeat } : null;
}

function inferDrawnCardMove(previousState, nextState) {
  if (!previousState?.active || (previousState.phase !== "drawReady" && previousState.phase !== "drawMoving")) return null;
  const cardId = previousState.pending?.drawnCard;
  const actorSeat = previousState.pending?.actorSeat;
  if (!cardId || !Number.isInteger(actorSeat)) return null;
  const samePendingDraw = (nextState.phase === "draw" || nextState.phase === "drawReady" || nextState.phase === "drawMoving")
    && nextState.pending?.drawnCard === cardId;
  if (samePendingDraw) return null;
  const nextField = new Set(nextState.field || []);
  const removedMatches = (previousState.field || []).filter((id) => {
    return !nextField.has(id) && CARD_MAP.get(id)?.month === CARD_MAP.get(cardId)?.month;
  });
  return { cardId, actorSeat, fieldCardId: removedMatches.length === 1 ? removedMatches[0] : null };
}

async function waitForRemoteDrawToLand(nextState) {
  const sameDraw = state.phase === "draw"
    && nextState.phase === "draw"
    && state.pending?.drawnCard === nextState.pending?.drawnCard;
  if (state.phase !== "draw" || !remoteDrawStartedAt || sameDraw) return;
  const remaining = drawRevealDuration() - (motionClock() - remoteDrawStartedAt);
  if (remaining > 0) await waitForMotion(remaining);
}

async function applyOnlineState(nextState) {
  clearTimeout(phaseTimer);
  await waitForRemoteDrawToLand(nextState);
  const previousState = state;
  mode = "online";
  if (nextState.fieldMonthSlots && typeof nextState.fieldMonthSlots === "object" && !Array.isArray(nextState.fieldMonthSlots)) {
    state.fieldMonthSlots = { ...(state.fieldMonthSlots || {}), ...nextState.fieldMonthSlots };
  }
  const played = inferPlayedCard(previousState, nextState);
  if (played && !motionOrigins.has(played.cardId)) {
    await animatePlayedCardForSeat(played.cardId, played.actorSeat);
  }
  const drawnMove = inferDrawnCardMove(previousState, nextState);
  if (drawnMove && !motionOrigins.has(drawnMove.cardId)) {
    await animateDrawnCardToField(drawnMove.cardId, drawnMove.fieldCardId, { keepAtTarget: true });
  }
  const previousCaptures = state.captures || [[], []];
  const nextCaptures = nextState.captures || [[], []];
  const addedBySeat = [0, 1].map((seat) => {
    const previous = new Set(previousCaptures[seat] || []);
    return (nextCaptures[seat] || []).filter((id) => !previous.has(id));
  });
  const captureMotion = Promise.all(addedBySeat.map((ids, seat) => animateCapturedCards(seat, ids)));
  applyingRemoteState = true;
  state = { ...createInitialState(), ...nextState, hands: nextState.hands || [[], []] };
  state.matchLength = normalizeMatchLength(state.matchLength);
  ensureFieldMonthSlots();
  render();
  state.field.forEach((id) => motionOrigins.delete(id));
  drawFlightClones.forEach((_element, id) => {
    if (!addedBySeat.some((ids) => ids.includes(id))) clearDrawFlightClone(id);
  });
  applyingRemoteState = false;
  remoteDrawStartedAt = state.phase === "draw" ? motionClock() : 0;
  releaseInteractionLock();
  await captureMotion;
  if (addedBySeat.some((ids) => ids.length)) {
    await waitForMotion(prefersReducedMotion() ? REDUCED_CAPTURE_LAND_HOLD_DURATION : CAPTURE_LAND_HOLD_DURATION);
  }
}

function importOnlineState(nextState) {
  if (!nextState || typeof nextState !== "object") return;
  const queuedState = JSON.parse(JSON.stringify(nextState));
  remoteStateQueue = remoteStateQueue
    .then(() => applyOnlineState(queuedState))
    .catch((error) => console.warn("[HanafudaMotion] state transition failed:", error));
}

function importSecret(secret) {
  if (!secret || !Number.isInteger(secret.seat)) return;
  clientSecret = { seat: secret.seat, hand: Array.isArray(secret.hand) ? secret.hand : [] };
  viewerSeat = secret.seat;
  render();
}

function seatForPlayer(playerName) {
  return state.players.findIndex((name) => normalizeName(name) === normalizeName(playerName));
}

function applyRemoteAction(action) {
  if (!action || typeof action !== "object") return;
  const seat = seatForPlayer(action.playerName);
  if (action.type === "play" && seat >= 0) playCard(action.cardId, seat);
  if (action.type === "match" && seat >= 0) chooseMatch(action.cardId, seat);
  if (action.type === "drawConfirm" && seat >= 0) resolveDraw(action.cardId || null, seat);
  if (action.type === "koi" && seat >= 0) chooseKoi(action.choice, seat);
  if (action.type === "nextRound" && state.phase === "roundEnd") nextRound();
  if (action.type === "rematch" && state.phase === "matchEnd") rematch();
}

window.HanafudaGame = {
  exportState: () => state,
  exportStateForPlayer: exportOnlineStateForPlayer,
  exportSecretForPlayer,
  importState: importOnlineState,
  importSecret,
  applyRemoteAction,
  getPlayerName: () => localPlayerName,
  setPlayerName(name, icon) {
    localPlayerName = String(name || "Player").trim() || "Player";
    localPlayerIcon = icon || null;
    render();
  },
  previewSetup,
  readSetupForm,
  refresh: render
};
window.TierGame = window.HanafudaGame;

document.querySelector("#soloButton").addEventListener("click", startSolo);
document.querySelector("#startOnlineButton").addEventListener("click", startOnlineGame);
els.game.addEventListener("click", handleGameTap);
document.querySelector(".table-zone").addEventListener("click", handleTableTap);
els.turnBanner.addEventListener("click", () => {
  if (state.phase === "drawReady" && state.pending?.actorSeat === localSeat() && state.pending?.matches?.length !== 2) handleDrawConfirm();
});
els.turnBanner.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (state.phase !== "drawReady" || state.pending?.actorSeat !== localSeat() || state.pending?.matches?.length === 2) return;
  event.preventDefault();
  handleDrawConfirm();
});
bindCaptureArea(".board-captures-self", () => localSeat());
bindCaptureArea(".board-captures-opponent", () => 1 - localSeat());
document.querySelectorAll('input[name="onlineMatchLength"]').forEach((input) => input.addEventListener("change", () => {
  const settings = readSetupForm();
  if (window.TierOnline?.online && window.TierOnline.host) window.TierOnline.broadcastConfig(settings);
}));
document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#menuDialog").showModal());
document.querySelector("#rulesButton").addEventListener("click", openRulesDialog);
document.querySelectorAll("[data-help-button]").forEach((button) => button.addEventListener("click", openRulesDialog));
document.querySelectorAll("[data-rules-tab]").forEach((button) => {
  button.addEventListener("click", () => selectRulesTab(button.dataset.rulesTab));
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll("[data-rules-tab]")];
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const index = (tabs.indexOf(button) + offset + tabs.length) % tabs.length;
    selectRulesTab(tabs[index].dataset.rulesTab, true);
  });
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelector("#captureDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector("#backLobbyButton").addEventListener("click", () => {
  document.querySelector("#menuDialog").close();
  if (window.TierOnline?.online) window.TierOnline.exitRoom();
  clearTimeout(aiTimer);
  clearTimeout(drawTimer);
  clearTimeout(phaseTimer);
  clearTimeout(interactionUnlockTimer);
  interactionUnlockTimer = null;
  interactionLocked = false;
  selectedHandCardId = null;
  queuedInput = null;
  activeOutgoingCardId = null;
  drawFlightClones.forEach((element) => element.remove());
  drawFlightClones.clear();
  mode = "lobby";
  state = createInitialState();
  render();
});

updateOnlineMatchSummary();
render();
if (new URLSearchParams(window.location.search).has("demo")) startSolo();
