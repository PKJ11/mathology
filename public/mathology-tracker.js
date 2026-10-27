/*
 * Mathology interaction tracker.
 *
 * Injected into every chapter page (see app/lab/[chapter]/route.ts) BEFORE the chapter's own
 * scripts run. It does three things without changing any chapter code:
 *
 *  1. Namespaces the chapter's localStorage keys per signed-in learner, so two people on one
 *     device never share progress, and restores the learner's last synced state from the server.
 *  2. Diffs every chapter save (Chapter 1 event log, Chapter 2–14 progress/evidence/drafts/
 *     exposure stores) into a normalised, timestamped event stream.
 *  3. Adds what the chapters never recorded: page/route views, clicks, disclosure toggles,
 *     input changes, rejected submissions, per-question active time, idle/visibility, exit and
 *     storage failures.
 *
 * Events are queued in a per-session outbox in localStorage and sent in batches to
 * /api/track/events. Every event has a stable ID, so retries never create duplicates.
 */
(function () {
  "use strict";

  var BOOT = window.__MTH__;
  if (!BOOT || !BOOT.uid || window.__MTH_TRACKER__) return;
  window.__MTH_TRACKER__ = true;

  var CH = BOOT.chapter;
  var KEYS = BOOT.keys || [];
  var API = BOOT.endpoint || "/api/track";
  var NS = "mth:u:" + BOOT.uid + ":";
  var IDLE_MS = 90000;
  var MAX_OUTBOX = 1500;

  // ---------------------------------------------------------------------------
  // Raw storage access (bypasses the namespacing hooks installed below)
  // ---------------------------------------------------------------------------

  var ls = null;
  try { ls = window.localStorage; } catch (e) { /* storage blocked */ }
  var proto = window.Storage && Storage.prototype;
  var rawGet = proto && proto.getItem;
  var rawSet = proto && proto.setItem;
  var rawRemove = proto && proto.removeItem;

  function lget(k) { try { return ls ? rawGet.call(ls, k) : null; } catch (e) { return null; } }
  function lset(k, v) { try { if (!ls) return false; rawSet.call(ls, k, v); return true; } catch (e) { return false; } }
  function ldel(k) { try { if (ls) rawRemove.call(ls, k); } catch (e) { /* ignore */ } }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  var SESSION = uuid();
  var TAB = (function () {
    try {
      var t = sessionStorage.getItem("mth:tab");
      if (!t) { t = uuid(); sessionStorage.setItem("mth:tab", t); }
      return t;
    } catch (e) { return null; }
  })();
  var OUTBOX = NS + "outbox:" + SESSION;
  var pageStartedAt = Date.now();
  var seq = 0;
  var ctx = { chapterId: "M10." + (CH < 10 ? "0" : "") + CH, contentVersion: null, releaseVersion: null };

  function tracked(k) { return typeof k === "string" && /^mathology[:\-]/.test(k); }
  function iso(ms) { return ms == null ? null : new Date(ms).toISOString(); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function parse(raw) { try { return raw == null ? null : JSON.parse(raw); } catch (e) { return null; } }
  function route() { return location.hash.slice(1) || "home"; }
  function clip(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; }
  function omit(o, keys) { var r = {}; for (var k in o) if (keys.indexOf(k) < 0) r[k] = o[k]; return r; }
  function idOf(e) { return e && e.id != null ? String(e.id) : [e && e.at, e && (e.type || e.action), e && (e.skill || e.skillId)].join(":"); }
  function newBy(before, after, keyFn) {
    var seen = {};
    (before || []).forEach(function (x) { seen[keyFn(x)] = 1; });
    return (after || []).filter(function (x) { return !seen[keyFn(x)]; });
  }
  function chapterGlobal() { return CH === 1 ? window.ML : window["Mathology" + CH]; }

  // ---------------------------------------------------------------------------
  // Event queue and transport
  // ---------------------------------------------------------------------------

  var queue = parse(lget(OUTBOX)) || [];
  var flushTimer = null;
  var inflight = false;
  var stopped = false;
  var backoff = 2000;

  function emit(type, payload, opts) {
    if (stopped) return;
    opts = opts || {};
    var M = chapterGlobal();
    var ev = {
      eventId: opts.eventId || uuid(),
      type: type,
      sessionId: SESSION,
      tabId: TAB,
      seq: ++seq,
      chapter: CH,
      chapterId: ctx.chapterId,
      route: route(),
      clientAt: iso(opts.clientAt || Date.now()),
      contentVersion: opts.contentVersion || ctx.contentVersion || (M && M.contentVersion) || null,
      releaseVersion: ctx.releaseVersion || (M && M.releaseVersion) || null,
      source: opts.source || "tracker",
      payload: payload || {},
    };
    queue.push(ev);
    if (queue.length > MAX_OUTBOX) queue.splice(0, queue.length - MAX_OUTBOX);
    persistQueue();
    if (queue.length >= 40) flush();
    else scheduleFlush(4000);
  }

  function persistQueue() {
    if (queue.length) lset(OUTBOX, JSON.stringify(queue));
    else ldel(OUTBOX);
  }

  function scheduleFlush(ms) {
    if (flushTimer || stopped) return;
    flushTimer = setTimeout(function () { flushTimer = null; flush(); }, ms);
  }

  function takeBatch(maxBytes) {
    var batch = [], bytes = 2;
    for (var i = 0; i < queue.length && batch.length < 100; i++) {
      var size = JSON.stringify(queue[i]).length + 1;
      if (batch.length && bytes + size > maxBytes) break;
      batch.push(queue[i]);
      bytes += size;
    }
    return batch;
  }

  function drop(batch) {
    var ids = {};
    batch.forEach(function (e) { ids[e.eventId] = 1; });
    queue = queue.filter(function (e) { return !ids[e.eventId]; });
    persistQueue();
  }

  function body(events) {
    return JSON.stringify({ sessionId: SESSION, chapter: CH, activeMs: Math.round(activeMs), events: events });
  }

  function flush() {
    if (inflight || !queue.length || stopped) return;
    var batch = takeBatch(400000);
    inflight = true;
    fetch(API + "/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: body(batch),
    })
      .then(function (res) {
        if (res.status === 401) { stopped = true; return; }
        // 400 means the batch can never be accepted; drop it rather than retry forever
        if (res.ok || res.status === 400 || res.status === 413) { drop(batch); backoff = 2000; return; }
        throw new Error("HTTP " + res.status);
      })
      .catch(function () { backoff = Math.min(backoff * 2, 60000); })
      .then(function () {
        inflight = false;
        if (queue.length) scheduleFlush(queue.length >= 40 ? 50 : backoff);
      });
  }

  /** Best-effort send while the page is going away. Events stay in the outbox until confirmed. */
  function beaconFlush() {
    if (!queue.length || stopped) return;
    var batch = takeBatch(60000);
    var data = body(batch);
    var sent = false;
    try {
      sent = navigator.sendBeacon && navigator.sendBeacon(API + "/events", new Blob([data], { type: "application/json" }));
    } catch (e) { sent = false; }
    if (!sent) {
      try { fetch(API + "/events", { method: "POST", headers: { "content-type": "application/json" }, body: data, keepalive: true, credentials: "same-origin" }); } catch (e) { /* ignore */ }
    }
  }

  // Outboxes left behind by earlier sessions that closed before their last batch was confirmed
  function adoptOrphanOutboxes() {
    if (!ls) return;
    var prefix = NS + "outbox:";
    for (var i = ls.length - 1; i >= 0; i--) {
      var k = ls.key(i);
      if (!k || k.indexOf(prefix) !== 0 || k === OUTBOX) continue;
      var events = parse(lget(k));
      ldel(k);
      if (Array.isArray(events) && events.length) queue = events.concat(queue);
    }
    if (queue.length > MAX_OUTBOX) queue.splice(0, queue.length - MAX_OUTBOX);
    persistQueue();
  }

  // ---------------------------------------------------------------------------
  // State snapshots (latest raw chapter stores, for cross-device resume)
  // ---------------------------------------------------------------------------

  var stateTimers = {};

  function queueState(k, ms) {
    clearTimeout(stateTimers[k]);
    stateTimers[k] = setTimeout(function () { delete stateTimers[k]; pushState(k, false); }, ms || 3000);
  }

  function pushState(k, leaving) {
    var raw = lget(NS + k);
    if (raw == null || stopped) return;
    var data = JSON.stringify({ chapter: CH, key: k, raw: raw, savedAt: Date.now() });
    if (leaving) {
      if (data.length < 60000) {
        try { fetch(API + "/state", { method: "POST", headers: { "content-type": "application/json" }, body: data, keepalive: true, credentials: "same-origin" }); } catch (e) { /* stays dirty */ }
      }
      return; // too large to send while unloading; the dirty flag resyncs it on the next visit
    }
    fetch(API + "/state", { method: "POST", headers: { "content-type": "application/json" }, body: data, credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) { stopped = true; return; }
        if (res.ok && lget(NS + k) === raw) ldel(NS + "dirty:" + k);
        else if (!res.ok) queueState(k, 15000);
      })
      .catch(function () { queueState(k, 15000); });
  }

  // ---------------------------------------------------------------------------
  // 1. Namespace chapter storage per learner and restore server state
  // ---------------------------------------------------------------------------

  var prev = {};

  KEYS.forEach(function (k) {
    var server = BOOT.state && BOOT.state[k];
    var dirty = lget(NS + "dirty:" + k) === "1";
    var local = lget(NS + k);
    if (server && typeof server.raw === "string" && !dirty) {
      if (local !== server.raw) lset(NS + k, server.raw);
    } else if (local != null) {
      queueState(k, 1500); // unsynced local work, or no server copy yet
    }
    prev[k] = parse(lget(NS + k));
  });

  if (ls && proto) {
    proto.getItem = function (k) {
      return this === ls && tracked(k) ? rawGet.call(this, NS + k) : rawGet.apply(this, arguments);
    };
    proto.removeItem = function (k) {
      return this === ls && tracked(k) ? rawRemove.call(this, NS + k) : rawRemove.apply(this, arguments);
    };
    proto.setItem = function (k, v) {
      if (this !== ls || !tracked(k)) return rawSet.apply(this, arguments);
      var s = String(v);
      try {
        rawSet.call(this, NS + k, s);
      } catch (err) {
        emit("STORAGE_ERROR", { key: k, op: "setItem", message: clip(err && err.message || err, 300), bytes: s.length });
        throw err;
      }
      lset(NS + "dirty:" + k, "1");
      try { onWrite(k, s); } catch (err) { reportError(err, "diff"); }
      queueState(k);
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Diff chapter saves into events
  // ---------------------------------------------------------------------------

  var Q = null; // the question currently on screen in a Chapter 2–14 run, with its timing
  var lastAnswerAt = 0;
  var debounces = {};

  function debounce(key, ms, fn) {
    clearTimeout(debounces[key]);
    debounces[key] = setTimeout(function () { delete debounces[key]; fn(); }, ms);
  }
  function cancelDebounce(key) { clearTimeout(debounces[key]); delete debounces[key]; }
  function flushDebounces() {
    // Run pending debounced emits now (page is leaving)
    Object.keys(debounceFns).forEach(function (k) { if (debounces[k]) { cancelDebounce(k); debounceFns[k](); } });
  }
  var debounceFns = {};
  function debounceEmit(key, ms, fn) { debounceFns[key] = fn; debounce(key, ms, function () { delete debounceFns[key]; fn(); }); }

  function onWrite(k, raw) {
    var next = parse(raw);
    var before = prev[k];
    prev[k] = next;
    if (!next) return;

    if (CH === 1) {
      if (next.releaseVersion) ctx.releaseVersion = next.releaseVersion;
      diffChapter1(before || {}, next);
      return;
    }
    if (next.contentVersion) ctx.contentVersion = next.contentVersion;
    if (next.releaseVersion) ctx.releaseVersion = next.releaseVersion;
    var name = k.slice(k.lastIndexOf(":") + 1);
    var b = (before && before.data) || {};
    var a = next.data || {};
    if (name === "progress") diffProgress(b, a);
    else if (name === "evidence") diffEvidence(b, a);
    else if (name === "drafts") diffDrafts(b, a);
    else if (name === "exposure") diffExposure(b, a);
  }

  // Chapter 1 already keeps a rich event log: forward each new entry with a stable ID.
  function diffChapter1(b, a) {
    newBy(b.events, a.events, idOf).forEach(function (e) {
      if (e.simulated) return; // teacher-lab demo data is never real learner evidence
      if (e.version) ctx.contentVersion = e.version;
      if (e.type === "ANSWER_SUBMITTED") lastAnswerAt = Date.now();
      var payload = omit(e, ["id", "type", "session", "learner", "at", "version"]);
      payload.legacySession = e.session || null;
      emit(e.type, payload, { eventId: "c1:" + idOf(e), clientAt: e.at, source: "chapter-log", contentVersion: e.version });
    });
    newBy(b.decisions, a.decisions, idOf).forEach(function (d) {
      emit("ADAPTIVE_DECISION", d, { eventId: "c1:dec:" + idOf(d), clientAt: d.at, source: "chapter-log" });
    });
    newBy(b.remediations, a.remediations, idOf).forEach(function (r) {
      emit("REMEDIATION_RECORDED", r, { eventId: "c1:rem:" + idOf(r), clientAt: r.startedAt || r.at, source: "chapter-log" });
    });
    diffAdaptive(b.adaptive, a.adaptive);
  }

  function diffAdaptive(b, a) {
    b = b || {};
    a = a || {};
    newBy(b.decisions, a.decisions, idOf).forEach(function (d) {
      emit("ADAPTIVE_DECISION", d, { eventId: "c" + CH + ":adec:" + idOf(d), clientAt: d.at, source: "chapter-log" });
    });
    newBy(b.interventions, a.interventions, idOf).forEach(function (i) {
      emit("ADAPTIVE_INTERVENTION", i, { eventId: "c" + CH + ":aint:" + idOf(i), clientAt: i.at, source: "chapter-log" });
    });
    if (a.scope && a.scope !== (b.scope || "Curriculum core")) emit("SCOPE_CHANGED", { from: b.scope || null, to: a.scope });
  }

  function itemAt(r) { return (r.items || [])[r.index] || null; }

  function runSummary(r) {
    return {
      runId: r.id,
      group: r.group,
      practice: !!r.practice,
      adaptive: !!r.adaptive,
      itemCount: (r.items || []).length,
      startedAt: r.startedAt || null,
      items: (r.items || []).map(function (q) {
        return { id: q.id, skillId: q.skillId || null, format: q.format || null, family: q.family || null };
      }),
    };
  }

  function viewQuestion(r, resumed) {
    var q = itemAt(r);
    if (!q || r.complete) return;
    if (Q && Q.runId === r.id && Q.index === r.index) return;
    accrue();
    Q = {
      runId: r.id, index: r.index, questionId: q.id, skillId: q.skillId, format: q.format,
      openedAt: Date.now(), activeMs: 0, firstInteractionAt: null,
      hintCount: r.help ? 1 : 0, pendingChanges: 0, answerChanged: false, resumed: !!resumed,
    };
    emit("QUESTION_VIEWED", {
      runId: r.id, index: r.index, questionId: q.id, skillId: q.skillId || null, format: q.format || null,
      family: q.family || null, practice: !!r.practice, adaptive: !!r.adaptive, resumed: !!resumed,
      hasPendingAnswer: !!(r.pending && r.pending.length),
    });
  }

  function hasValue(p) {
    return Array.isArray(p) && p.some(function (x) { return x !== null && x !== undefined && x !== ""; });
  }

  function diffProgress(b, a) {
    var old = {};
    (b.runs || []).forEach(function (r) { old[r.id] = r; });

    (a.runs || []).forEach(function (r) {
      var o = old[r.id];
      if (!o) {
        emit("RUN_STARTED", runSummary(r), { eventId: "c" + CH + ":run:" + r.id, clientAt: Date.parse(r.startedAt) || Date.now() });
        viewQuestion(r, false);
        return;
      }
      if (r.index !== o.index) {
        cancelDebounce("pending:" + r.id);
        emit("QUESTION_ADVANCED", { runId: r.id, fromIndex: o.index, toIndex: r.index, itemCount: (r.items || []).length });
        viewQuestion(r, false);
      }
      if (r.complete && !o.complete) {
        emit("RUN_COMPLETED", {
          runId: r.id, group: r.group, practice: !!r.practice, adaptive: !!r.adaptive,
          itemCount: (r.items || []).length, answered: r.index, startedAt: r.startedAt || null,
          durationMs: r.startedAt ? Date.now() - Date.parse(r.startedAt) : null,
        }, { eventId: "c" + CH + ":runc:" + r.id });
        if (Q && Q.runId === r.id) Q = null;
      }
      if (r.index === o.index && !r.complete) {
        var q = itemAt(r);
        if (r.help && !o.help) {
          if (!Q || Q.runId !== r.id || Q.index !== r.index) viewQuestion(r, true);
          if (Q && !Q.hintCount) Q.hintCount = 1;
          emit("HELP_USED", { runId: r.id, index: r.index, questionId: q && q.id, skillId: q && q.skillId, via: lastClickLabel() });
        }
        if (!same(r.pending, o.pending)) notePending(r, o.pending);
        if (r.plotDrawn && !o.plotDrawn) emit("PLOT_DRAWN", { runId: r.id, index: r.index, questionId: q && q.id });
      }
    });

    newBy(b.completed, a.completed, String).forEach(function (g) {
      emit("LEARN_COMPLETED", { group: g, selfReported: true }, { eventId: "c" + CH + ":learn:" + g });
    });

    var bl = b.labState || {};
    var al = a.labState || {};
    Object.keys(al).forEach(function (g) {
      if (same(al[g], bl[g])) return;
      var key = "lab:" + g;
      if (!(key in labFrom)) labFrom[key] = bl[g] === undefined ? null : bl[g];
      debounceEmit(key, 800, function () {
        var latest = ((prevData("progress") || {}).labState || {})[g];
        emit("LAB_STATE_CHANGED", { group: g, value: latest === undefined ? null : latest, previous: labFrom[key] });
        delete labFrom[key];
      });
    });

    diffAdaptive(b.adaptive, a.adaptive);
  }
  var labFrom = {};

  function prevData(name) {
    for (var i = 0; i < KEYS.length; i++) {
      if (KEYS[i].slice(KEYS[i].lastIndexOf(":") + 1) === name) return prev[KEYS[i]] && prev[KEYS[i]].data;
    }
    return null;
  }

  function findRun(id) {
    var p = prevData("progress");
    var runs = (p && p.runs) || [];
    for (var i = runs.length - 1; i >= 0; i--) if (runs[i].id === id) return runs[i];
    return null;
  }

  var pendingCounts = {};
  function notePending(r, oldPending) {
    if (!Q || Q.runId !== r.id || Q.index !== r.index) viewQuestion(r, true);
    if (Q) {
      Q.pendingChanges++;
      if (!Q.firstInteractionAt) Q.firstInteractionAt = Date.now();
      if (Q.format === "choice" && hasValue(oldPending)) Q.answerChanged = true;
    }
    var key = "pending:" + r.id;
    pendingCounts[key] = (pendingCounts[key] || 0) + 1;
    debounceEmit(key, 1200, function () {
      var run = findRun(r.id) || r;
      var q = itemAt(run);
      emit("ANSWER_PENDING_CHANGED", {
        runId: run.id, index: run.index, questionId: q && q.id, skillId: q && q.skillId,
        format: q && q.format, pending: run.pending, changes: pendingCounts[key],
      });
      delete pendingCounts[key];
    });
  }

  function attemptKey(e) { return (e.runId || "") + "|" + (e.questionId || "") + "|" + (e.submittedAt || ""); }

  function diffEvidence(b, a) {
    newBy(b.attempts, a.attempts, attemptKey).forEach(function (e) {
      accrue();
      var run = findRun(e.runId);
      var t = Q && Q.runId === e.runId && Q.questionId === e.questionId ? Q : null;
      var p = omit(e, []);
      p.group = run ? run.group : null;
      p.practice = run ? !!run.practice : null;
      p.adaptive = run ? !!run.adaptive : false;
      p.activeSeconds = t ? Math.round(t.activeMs / 100) / 10 : null;
      p.timingValid = !!t && !t.resumed;
      p.openedAt = t ? iso(t.openedAt) : null;
      p.firstInteractionAt = t && t.firstInteractionAt ? iso(t.firstInteractionAt) : null;
      p.hintCount = t ? t.hintCount : null;
      p.pendingChanges = t ? t.pendingChanges : null;
      p.answerChanged = t ? t.answerChanged : null;
      cancelDebounce("pending:" + e.runId);
      delete debounceFns["pending:" + e.runId];
      lastAnswerAt = Date.now();
      emit("ANSWER_SUBMITTED", p, { eventId: "c" + CH + ":att:" + attemptKey(e), clientAt: Date.parse(e.submittedAt) || Date.now() });
      if (t) Q = null;
    });
  }

  function diffDrafts(b, a) {
    var bw = b.written || {};
    var aw = a.written || {};
    Object.keys(aw).forEach(function (g) {
      var d = aw[g] || {};
      var o = bw[g] || {};
      if (d.text === o.text && d.savedAt === o.savedAt) return;
      emit("DRAFT_SAVED", {
        group: g, text: d.text || "", savedAt: d.savedAt || null, reviewStatus: d.reviewStatus || null,
        length: (d.text || "").length, previousLength: o.text ? o.text.length : null,
      }, { eventId: "c" + CH + ":draft:" + g + ":" + (d.savedAt || Date.now()), clientAt: Date.parse(d.savedAt) || Date.now() });
    });
  }

  function diffExposure(b, a) {
    var fresh = newBy(b.forms, a.forms, String);
    if (fresh.length) emit("EXPOSURE_RECORDED", { forms: fresh, total: (a.forms || []).length });
  }

  // ---------------------------------------------------------------------------
  // 3. Page-level interactions the chapters never recorded
  // ---------------------------------------------------------------------------

  // Active time: visible, focused (this frame or the viewer around it) and not idle
  var activeMs = 0;
  var lastTick = Date.now();
  var lastInputAt = Date.now();
  var idle = false;

  function focused() {
    try {
      if (document.hasFocus()) return true;
      return window.parent !== window && window.parent.document.hasFocus();
    } catch (e) { return false; }
  }

  function accrue() {
    var now = Date.now();
    var d = Math.min(now - lastTick, 5000);
    lastTick = now;
    if (d <= 0) return;
    if (!document.hidden && focused() && now - lastInputAt < IDLE_MS) {
      activeMs += d;
      if (Q) Q.activeMs += d;
    } else if (!idle && !document.hidden && now - lastInputAt >= IDLE_MS) {
      idle = true;
      emit("IDLE_STARTED", { afterMs: IDLE_MS });
    }
  }

  function markInput() {
    var now = Date.now();
    if (idle) {
      idle = false;
      lastTick = now;
      emit("IDLE_ENDED", { idleMs: now - lastInputAt });
    }
    lastInputAt = now;
  }

  ["pointerdown", "keydown", "wheel", "touchstart", "input", "scroll"].forEach(function (t) {
    document.addEventListener(t, markInput, { capture: true, passive: true });
  });
  var lastMove = 0;
  document.addEventListener("pointermove", function () {
    var now = Date.now();
    if (now - lastMove > 5000) { lastMove = now; markInput(); }
  }, { capture: true, passive: true });
  setInterval(accrue, 1000);

  // Routes (the chapters are hash-routed single pages)
  var curRoute = route();
  var routeAt = Date.now();
  window.addEventListener("hashchange", function () {
    var r = route();
    if (r === curRoute) return;
    var from = curRoute;
    var dwell = Date.now() - routeAt;
    curRoute = r;
    routeAt = Date.now();
    emit("ROUTE_VIEWED", { route: r, from: from, dwellMs: dwell });
    setTimeout(checkRouteQuestion, 0);
  });

  // Resuming a Chapter 2–14 run shows a question without saving anything; detect it from the route
  function checkRouteQuestion() {
    if (CH === 1) return;
    var p = prevData("progress");
    var runs = ((p && p.runs) || []).slice().reverse();
    var r = route();
    // Question routes: lab-N/challenge, lab-N/practice, the core "challenge" (group 0),
    // "readiness" (group -1) and "adaptive-check"
    var m = /^lab-(-?\d+)\/(challenge|practice)$/.exec(r);
    var spec = m ? { group: Number(m[1]), practice: m[2] === "practice" }
      : r === "challenge" ? { group: 0, practice: false }
      : r === "readiness" ? { group: -1, practice: false }
      : null;
    var run = null;
    if (spec) {
      run = runs.filter(function (x) { return x.group === spec.group && !!x.practice === spec.practice && !x.adaptive && !x.complete; })[0];
    } else if (r === "adaptive-check") {
      run = runs.filter(function (x) { return x.adaptive && !x.complete; })[0];
    } else if (Q) {
      accrue(); // left the question screen
      Q = null;
    }
    if (run) viewQuestion(run, true);
  }

  // Clicks
  var lastClick = { label: null, at: 0 };
  function lastClickLabel() { return Date.now() - lastClick.at < 1500 ? lastClick.label : null; }

  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest && ev.target.closest("button,a,summary,label,[role=button],[role=tab],input[type=checkbox],input[type=radio]");
    if (!el) return;
    var label = clip(el.getAttribute("aria-label") || el.textContent || el.value, 80);
    var id = el.id || null;
    var data = {};
    for (var k in el.dataset) data[k] = clip(el.dataset[k], 60);
    lastClick = { label: id || label, at: Date.now() };
    emit("UI_CLICK", {
      el: el.tagName.toLowerCase(), id: id, text: label,
      classes: el.className && typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(" ") : null,
      href: el.getAttribute("href"), data: data,
    });
    if (id === "export" || id === "export-progress" || /backup|export/i.test(label)) emit("EXPORT_REQUESTED", { id: id, text: label });
    if (Q && (id === "get-help" || id === "open-hint" || id === "open-explanation" || /\b(hint|help)\b/i.test(label))) Q.hintCount++;
    if (id === "submit-answer" || id === "commit-answer") watchSubmit(id);
  }, true);

  // Answer form submissions (Chapter 2–14): detect rejected empty/invalid answers
  document.addEventListener("submit", function (ev) {
    var form = ev.target;
    if (form && form.id === "answer-form") watchSubmit("answer-form");
  }, true);

  function watchSubmit(via) {
    var at = Date.now();
    var message = null;
    var read = function () {
      var errEl = document.getElementById("answer-error") || document.querySelector("[role=alert]:not(#save-status)");
      var t = errEl ? clip(errEl.textContent, 200) : "";
      if (t) message = t;
    };
    setTimeout(read, 60); // the chapter may clear or re-render the message soon after
    setTimeout(function () {
      read();
      if (lastAnswerAt >= at) return;
      emit("SUBMIT_REJECTED", {
        via: via, message: message,
        runId: Q && Q.runId, index: Q && Q.index, questionId: Q && Q.questionId,
      });
    }, 700);
  }

  // Disclosure widgets (worked reasoning, menus) — "toggle" does not bubble, so capture it
  document.addEventListener("toggle", function (ev) {
    var d = ev.target;
    if (!d || d.tagName !== "DETAILS") return;
    var summary = d.querySelector("summary");
    emit("DETAILS_TOGGLED", { open: d.open, id: d.id || null, summary: clip(summary && summary.textContent, 120), classes: d.className || null });
  }, true);

  // Field changes (sliders, selects, numbers, text). Free text is recorded as unsaved writing.
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.type === "password") return;
    var isText = el.tagName === "TEXTAREA" || el.type === "text" || el.type === "search";
    emit("INPUT_CHANGED", {
      el: el.tagName.toLowerCase(), type: el.type || null, id: el.id || null, name: el.name || null,
      label: clip(el.getAttribute("aria-label") || (el.labels && el.labels[0] && el.labels[0].textContent), 80) || null,
      value: el.type === "checkbox" || el.type === "radio" ? el.checked : String(el.value).slice(0, isText ? 4000 : 200),
      length: isText ? String(el.value).length : null,
      unsavedText: el.tagName === "TEXTAREA",
    });
  }, true);

  // Visibility and exit
  document.addEventListener("visibilitychange", function () {
    accrue();
    emit(document.hidden ? "PAGE_HIDDEN" : "PAGE_VISIBLE", { activeMs: Math.round(activeMs) });
    if (document.hidden) { flushDebounces(); beaconFlush(); }
    else lastTick = Date.now();
  });

  window.addEventListener("pagehide", function (ev) {
    accrue();
    flushDebounces();
    emit("PAGE_EXIT", {
      activeMs: Math.round(activeMs),
      durationMs: Date.now() - pageStartedAt,
      persisted: !!ev.persisted,
      openQuestion: Q ? { runId: Q.runId, index: Q.index, questionId: Q.questionId, activeMs: Math.round(Q.activeMs) } : null,
    });
    beaconFlush();
    Object.keys(stateTimers).forEach(function (k) { clearTimeout(stateTimers[k]); delete stateTimers[k]; pushState(k, true); });
  });

  // Storage failures the chapter reports in its status line
  var statusSeen = "";
  function watchStatus() {
    var el = document.getElementById("save-status");
    if (!el || !window.MutationObserver) return;
    new MutationObserver(function () {
      var t = clip(el.textContent, 240);
      if (t !== statusSeen && /paused|unavailable|could not|another tab/i.test(t)) emit("STORAGE_ERROR", { op: "status", message: t });
      statusSeen = t;
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  // Script errors (capped so a broken loop cannot flood the log)
  var errorCount = 0;
  function reportError(err, where) {
    if (++errorCount > 20) return;
    emit("CLIENT_ERROR", { where: where, message: clip(err && (err.message || err), 300), stack: clip(err && err.stack, 600) });
  }
  window.addEventListener("error", function (ev) {
    if (++errorCount > 20) return;
    emit("CLIENT_ERROR", { where: "window", message: clip(ev.message, 300), source: ev.filename || null, line: ev.lineno || null });
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  adoptOrphanOutboxes();
  emit("PAGE_OPENED", {
    route: route(),
    restoredFromServer: Object.keys(BOOT.state || {}).length > 0,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    embedded: window.parent !== window,
    language: navigator.language || null,
  });

  document.addEventListener("DOMContentLoaded", function () {
    watchStatus();
    if (CH === 1) {
      var M = window.ML;
      if (M && M.contentVersion) ctx.contentVersion = M.contentVersion;
    }
    checkRouteQuestion();
  });
})();
