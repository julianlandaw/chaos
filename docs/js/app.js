"use strict";
(() => {
  const M = window.ChaosMath;
  const $ = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const colors = { bg: "#202f29", grid: "#36443b", muted: "#8f9d8e", text: "#cbd3c6", amber: "#e8a65a", purple: "#bbabdb", green: "#bac9aa" };
  const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
  let activeExperiment = "logistic";
  const experimentExtensions = new Map();
  const logistic = { a: 3.7, x0: 0.2, iterations: 120, compare: false, view: "bifurcation", range: "focus", running: false, visible: 120, lastTick: 0 };
  const pendulum = { p: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 }, angle1: 120, angle2: -20, compare: true, trails: true, speed: 1, running: false, view: "motion", t: 0, accumulator: 0, trail: [], phase: [], sample: 0 };
  const canvases = new Map();
  let bifurcationCache = null, logisticFrame = 0;

  function paintRange(input) {
    input.style.setProperty("--fill", `${100 * (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))}%`);
  }

  function observeResize(element, callback) {
    if (typeof window.ResizeObserver === "function") new window.ResizeObserver(callback).observe(element);
    else window.addEventListener("resize", callback);
  }

  function setupCanvas(id) {
    const canvas = $(id), rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width), height = Math.round(rect.height);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, width, height);
    const size = { canvas, ctx, w: width, h: height, ratio };
    canvases.set(id, size);
    return size;
  }

  function plotArea(w, h) { return { left: w < 400 ? 40 : 49, top: 61, right: w - 24, bottom: h - 53 }; }
  function line(ctx, x1, y1, x2, y2, color, width = 1, dash = []) {
    ctx.beginPath(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  }
  function dot(ctx, x, y, radius, color) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function text(ctx, content, x, y, color = colors.muted, size = 9, align = "left") {
    ctx.fillStyle = color; ctx.font = `${size}px ${mono}`; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(content, x, y);
  }
  function axes(size, area, xTicks, yTicks, xMap, yMap, xLabel, yLabel) {
    const { ctx, w, h } = size;
    ctx.lineWidth = 0.6;
    for (const tick of xTicks) {
      const value = typeof tick === "number" ? tick : tick.value;
      const label = typeof tick === "number" ? String(tick) : tick.label;
      const x = xMap(value);
      line(ctx, x, area.top, x, area.bottom, colors.grid, 0.6);
      text(ctx, label, x, area.bottom + 15, colors.muted, w < 400 ? 7 : 8, "center");
    }
    for (const tick of yTicks) {
      const value = typeof tick === "number" ? tick : tick.value;
      const label = typeof tick === "number" ? String(tick) : tick.label;
      const y = yMap(value);
      line(ctx, area.left, y, area.right, y, colors.grid, 0.6);
      text(ctx, label, area.left - 10, y, colors.muted, w < 400 ? 7 : 8, "right");
    }
    text(ctx, xLabel, (area.left + area.right) / 2, h - 16, colors.text, w < 400 ? 8 : 9, "center");
    ctx.save(); ctx.translate(14, (area.top + area.bottom) / 2); ctx.rotate(-Math.PI / 2);
    text(ctx, yLabel, 0, 0, colors.text, w < 400 ? 8 : 9, "center"); ctx.restore();
  }

  function drawBifurcation(size) {
    const { ctx, w, h, ratio } = size, area = plotArea(w, h);
    const low = logistic.range === "focus" ? 2.5 : 0;
    const xMap = a => area.left + (a - low) / (4 - low) * (area.right - area.left);
    const yMap = x => area.bottom - x * (area.bottom - area.top);
    const cacheKey = `${w}:${h}:${ratio}:${low}`;
    if (!bifurcationCache || bifurcationCache.key !== cacheKey) {
      const cacheCanvas = document.createElement("canvas"); cacheCanvas.width = size.canvas.width; cacheCanvas.height = size.canvas.height;
      const cacheCtx = cacheCanvas.getContext("2d"); cacheCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
      cacheCtx.fillStyle = colors.bg; cacheCtx.fillRect(0, 0, w, h);
      const xTicks = low === 2.5 ? [2.5, 2.75, 3, 3.25, 3.5, 3.75, 4] : [0, 1, 2, 3, 4];
      axes({ ...size, ctx: cacheCtx }, area, xTicks, [0, .25, .5, .75, 1], xMap, yMap, "Growth rate a", "Long-term x");
      cacheCtx.fillStyle = "rgba(232, 166, 90, 0.28)";
      const columns = Math.ceil((area.right - area.left) * 1.65);
      for (let column = 0; column <= columns; column++) {
        const a = low + (4 - low) * column / columns;
        let x = .314159;
        for (let n = 0; n < 700; n++) x = M.logistic(a, x);
        const px = xMap(a);
        for (let n = 0; n < 160; n++) {
          x = M.logistic(a, x); cacheCtx.fillRect(px, yMap(x), .8, .8);
        }
      }
      bifurcationCache = { key: cacheKey, canvas: cacheCanvas };
    }
    ctx.drawImage(bifurcationCache.canvas, 0, 0, w, h);
    const selected = xMap(logistic.a);
    if (selected >= area.left && selected <= area.right) {
      ctx.fillStyle = "rgba(232,166,90,.09)"; ctx.fillRect(selected - 6, area.top, 12, area.bottom - area.top);
      line(ctx, selected, area.top, selected, area.bottom, "#f0c68b", 1, [3, 4]);
      let x = logistic.x0;
      for (let n = 0; n < 700; n++) x = M.logistic(logistic.a, x);
      for (let n = 0; n < 75; n++) { x = M.logistic(logistic.a, x); dot(ctx, selected, yMap(x), 1.7, "#f6dcb0"); }
      const labelX = Math.max(area.left + 35, Math.min(area.right - 35, selected));
      ctx.fillStyle = "#edc28a"; ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(labelX - 34, area.top - 18, 68, 18, 3);
      else ctx.rect(labelX - 34, area.top - 18, 68, 18);
      ctx.fill();
      text(ctx, `a = ${logistic.a.toFixed(3)}`, labelX, area.top - 9, colors.bg, 8, "center");
    }
  }

  function drawSeries(size) {
    const { ctx } = size, area = plotArea(size.w, size.h);
    const xMap = n => area.left + n / logistic.iterations * (area.right - area.left);
    const yMap = x => area.bottom - x * (area.bottom - area.top);
    const xTicks = Array.from({ length: 5 }, (_, i) => logistic.iterations * i / 4);
    axes(size, area, xTicks, [0, .25, .5, .75, 1], xMap, yMap, "Iteration n", "Population xₙ");
    const visible = Math.min(logistic.visible, logistic.iterations);
    const primary = M.orbit(logistic.a, logistic.x0, logistic.iterations);
    function path(values, count, color, width, dashed = false) {
      ctx.save(); ctx.beginPath(); ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top); ctx.clip();
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dashed ? [4, 3] : []);
      for (let n = 0; n <= count; n++) { const x = xMap(n), y = yMap(values[n]); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); ctx.restore();
    }
    path(primary, logistic.iterations, "#4b5140", .8);
    if (logistic.compare) path(M.orbit(logistic.a, logistic.x0 + 1e-7, logistic.iterations), visible, colors.purple, 1.2, true);
    path(primary, visible, colors.amber, 1.3);
    if (logistic.iterations <= 160) for (let n = 0; n <= visible; n++) dot(ctx, xMap(n), yMap(primary[n]), 1.5, colors.amber);
    if (visible < logistic.iterations) {
      line(ctx, xMap(visible), area.top, xMap(visible), area.bottom, "#cfdbbd55", 1, [3, 4]);
      dot(ctx, xMap(visible), yMap(primary[visible]), 4, "#f6dcb0");
    }
  }

  function drawCobweb(size) {
    const { ctx } = size, area = plotArea(size.w, size.h);
    const xMap = x => area.left + x * (area.right - area.left), yMap = x => area.bottom - x * (area.bottom - area.top);
    axes(size, area, [0, .25, .5, .75, 1], [0, .25, .5, .75, 1], xMap, yMap, "Current state xₙ", "Next state xₙ₊₁");
    line(ctx, xMap(0), yMap(0), xMap(1), yMap(1), "#a5b49388", 1, [4, 4]);
    ctx.beginPath(); ctx.strokeStyle = colors.green; ctx.lineWidth = 1.6;
    for (let i = 0; i <= 200; i++) { const x = i / 200, y = M.logistic(logistic.a, x); if (i) ctx.lineTo(xMap(x), yMap(y)); else ctx.moveTo(xMap(x), yMap(y)); }
    ctx.stroke();
    function web(x0, color) {
      let x = x0, previous = 0;
      ctx.save(); ctx.beginPath(); ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top); ctx.clip();
      ctx.beginPath(); ctx.moveTo(xMap(x), yMap(0)); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = .7;
      for (let n = 0; n < Math.min(60, logistic.visible); n++) {
        const next = M.logistic(logistic.a, x);
        ctx.lineTo(xMap(x), yMap(next)); ctx.lineTo(xMap(next), yMap(next));
        previous = next; x = next;
      }
      ctx.stroke(); ctx.restore(); dot(ctx, xMap(x), yMap(previous), 3, color);
    }
    if (logistic.compare) web(logistic.x0 + 1e-7, colors.purple);
    web(logistic.x0, colors.amber);
    text(ctx, "y = x", xMap(.85), yMap(.9), colors.muted, 8);
    text(ctx, "y = ax(1 − x)", xMap(.5), yMap(Math.min(1, logistic.a / 4)) - 12, colors.green, 8, "center");
  }

  function drawLogistic() {
    logisticFrame = 0;
    if (activeExperiment !== "logistic") return;
    const size = setupCanvas("logistic-canvas"); if (!size) return;
    if (logistic.view === "bifurcation") drawBifurcation(size);
    else if (logistic.view === "series") drawSeries(size);
    else drawCobweb(size);
    $("orbit-progress").textContent = `n = ${Math.min(logistic.visible, logistic.view === "cobweb" ? 60 : logistic.iterations)}`;
  }
  function requestLogisticDraw() { if (!logisticFrame) logisticFrame = requestAnimationFrame(drawLogistic); }

  function syncLogistic() {
    $("growth").value = logistic.a; $("initial").value = logistic.x0; $("iterations").value = logistic.iterations;
    $("growth-value").textContent = logistic.a.toFixed(3); $("initial-value").textContent = logistic.x0.toFixed(3);
    $("iterations-value").textContent = `${logistic.iterations} steps`;
    $("growth").setAttribute("aria-valuetext", logistic.a.toFixed(3));
    $("initial").setAttribute("aria-valuetext", logistic.x0.toFixed(3));
    for (const id of ["growth", "initial", "iterations"]) paintRange($(id));
    $("logistic-compare").checked = logistic.compare;
    $("logistic-canvas").setAttribute("aria-label", `${logistic.view === "bifurcation" ? "Bifurcation diagram" : logistic.view === "series" ? "Time series" : "Cobweb plot"} of the logistic map at growth rate ${logistic.a.toFixed(3)} and initial population ${logistic.x0.toFixed(3)}. Use the controls to explore.`);
    if (logistic.a < 2.5 && logistic.range === "focus") { logistic.range = "full"; $("bifurcation-range").value = "full"; }
    const analysis = M.analyzeLogistic(logistic.a, logistic.x0);
    $("logistic-behavior").textContent = analysis.behavior;
    $("logistic-lyapunov").textContent = analysis.lyapunov === -Infinity ? "−∞" : Number.isNaN(analysis.lyapunov) ? "Undefined" : `${analysis.lyapunov >= 0 ? "+" : "−"}${Math.abs(analysis.lyapunov).toFixed(3)}`;
    $("logistic-pattern").textContent = analysis.period === 1 ? "One fixed point" : analysis.period ? `${analysis.period}-point cycle` : "No short cycle";
    all("[data-logistic-preset]").forEach(button => button.classList.toggle("selected", Math.abs(Number(button.dataset.logisticPreset) - logistic.a) < 1e-6));
    const insight = $("logistic-insight");
    if (analysis.behavior === "Unstable orbit") insight.innerHTML = "<strong>An exceptional starting point.</strong> This orbit lands on an unstable cycle. Positive stretching does not make every special orbit chaotic; try nudging the initial population.";
    else if (analysis.lyapunov > .003) insight.innerHTML = "<strong>Welcome to the chaotic regime.</strong> The rule is deterministic, but nearby starting points tend to drift apart. Try “Compare a nearby start” in the time series.";
    else if (Math.abs(analysis.lyapunov) <= .003) insight.innerHTML = "<strong>Right on the edge of a transition.</strong> The Lyapunov estimate is close to zero. Transients can be very long here; small parameter changes can reveal a new pattern.";
    else if (analysis.period === 1) insight.innerHTML = logistic.a <= 1 ? "<strong>The population fades away.</strong> After the transient, the state approaches zero. The same simple rule can describe both quiet endings and wild fluctuations." : "<strong>A little order in the chaos lab.</strong> The population settles toward a single fixed point. Increase the growth rate past 3 and watch this single branch split in two.";
    else if (analysis.period) insight.innerHTML = `<strong>A repeating rhythm: period ${analysis.period}.</strong> The orbit cycles through ${analysis.period} values. Periodic windows also appear among chaotic parameters. Explore the time series to see the pattern.`;
    else insight.innerHTML = "<strong>Give it a closer look.</strong> No short cycle was detected after the warm-up. Near transitions, settling can take many iterations; compare the time series and cobweb.";
    requestLogisticDraw();
  }

  function stopLogistic() { logistic.running = false; updateLogisticPlayback(); }
  function updateLogisticPlayback() {
    $("logistic-play").innerHTML = logistic.running ? '<span class="play-icon" aria-hidden="true">Ⅱ</span><span>Pause orbit</span>' : '<span class="play-icon" aria-hidden="true">▶</span><span>Animate orbit</span>';
  }
  function setLogisticView(view) {
    logistic.view = view;
    $("logistic-plot-panel").setAttribute("aria-labelledby", `logistic-${view}-tab`);
    all("[data-logistic-view]").forEach(button => { const selected = button.dataset.logisticView === view; button.classList.toggle("active", selected); button.setAttribute("aria-selected", selected); button.tabIndex = selected ? 0 : -1; });
    const bifurcation = view === "bifurcation";
    $("bifurcation-range-label").hidden = !bifurcation; $("orbit-progress").hidden = bifurcation;
    $("logistic-plot-title").textContent = bifurcation ? "A landscape of long-term behavior" : view === "series" ? "One step at a time" : "Follow the rule. Follow the path.";
    $("logistic-key").textContent = bifurcation ? "After the transients" : logistic.compare ? "Orange: x₀ · purple: x₀ + 10⁻⁷" : "Starting from x₀";
    $("logistic-corner").textContent = bifurcation ? "ORDER → CHAOS" : view === "series" ? "DETERMINISTIC. NEVER RANDOM." : "VERTICAL → HORIZONTAL → REPEAT";
    $("logistic-caption").textContent = bifurcation ? "↔ Click or drag the plot to explore a growth rate." : view === "series" ? "Every point is the next application of the same rule." : "Up to 60 steps: to the curve, then to the diagonal.";
    $("logistic-canvas").setAttribute("aria-label", `${bifurcation ? "Bifurcation diagram" : view === "series" ? "Time series" : "Cobweb plot"} of the logistic map at growth rate ${logistic.a.toFixed(3)}. Use the controls to explore.`);
    if (bifurcation) stopLogistic();
    requestLogisticDraw();
  }

  function samplePendulum() {
    const a = M.position(pendulum.y, pendulum.p), b = M.position(pendulum.near, pendulum.p);
    pendulum.trail.push({ a: [a.x2, a.y2], b: [b.x2, b.y2] });
    pendulum.phase.push({ a: [M.wrapAngle(pendulum.y[2]), pendulum.y[3]], b: [M.wrapAngle(pendulum.near[2]), pendulum.near[3]], s: [M.wrapAngle(pendulum.single[0]), pendulum.single[1]] });
    if (pendulum.trail.length > 650) pendulum.trail.shift();
    if (pendulum.phase.length > 2400) pendulum.phase.shift();
  }

  function restartPendulum() {
    const radians = Math.PI / 180;
    pendulum.y = [pendulum.angle1 * radians, 0, pendulum.angle2 * radians, 0];
    pendulum.near = [pendulum.angle1 * radians, 0, (pendulum.angle2 + .01) * radians, 0];
    pendulum.single = [pendulum.angle1 * radians, 0];
    pendulum.initialEnergy = M.energy(pendulum.y, pendulum.p);
    pendulum.t = 0; pendulum.accumulator = 0; pendulum.trail = []; pendulum.phase = []; pendulum.sample = 0;
    samplePendulum(); syncPendulum(); drawPendulum();
  }

  function syncPendulum() {
    $("angle1").value = pendulum.angle1; $("angle2").value = pendulum.angle2;
    $("angle1-value").textContent = `${pendulum.angle1 < 0 ? "−" : ""}${Math.abs(pendulum.angle1)}°`;
    $("angle2-value").textContent = `${pendulum.angle2 < 0 ? "−" : ""}${Math.abs(pendulum.angle2)}°`;
    paintRange($("angle1")); paintRange($("angle2"));
    for (const [id, key] of [["length1", "l1"], ["length2", "l2"], ["gravity", "g"]]) $(id).value = pendulum.p[key];
    all("[data-pendulum-preset]").forEach(button => { const preset = pendulumPresets[button.dataset.pendulumPreset]; button.classList.toggle("selected", preset[0] === pendulum.angle1 && preset[1] === pendulum.angle2); });
    updatePendulumPlayback();
  }

  function advancePendulum(steps) {
    const dt = 1 / 240;
    for (let n = 0; n < steps; n++) {
      pendulum.y = M.rk4(pendulum.y, dt, M.doubleDerivative, pendulum.p);
      pendulum.near = M.rk4(pendulum.near, dt, M.doubleDerivative, pendulum.p);
      pendulum.single = M.rk4(pendulum.single, dt, M.singleDerivative, pendulum.p);
      pendulum.t += dt;
      if (++pendulum.sample % 4 === 0) samplePendulum();
    }
  }

  function updatePendulumPlayback() {
    $("pendulum-play").innerHTML = pendulum.running ? '<span class="play-icon" aria-hidden="true">Ⅱ</span><span>Pause motion</span>' : `<span class="play-icon" aria-hidden="true">▶</span><span>${pendulum.t > 0 ? "Keep swinging" : "Let it swing"}</span>`;
    $("pendulum-state").textContent = pendulum.running ? "SIMULATION RUNNING" : pendulum.t > 0 ? "PAUSED · TAKE A CLOSER LOOK" : "READY WHEN YOU ARE";
  }

  function drawMotion(size) {
    const { ctx, w, h } = size, p = pendulum.p;
    const split = w * .66, pivot = { x: w * .335, y: h * .535 };
    const singlePivot = { x: w * .825, y: pivot.y };
    const scale = Math.min((h * .5 - 49) / (p.l1 + p.l2), (split * .5 - 19) / (p.l1 + p.l2), ((w - split) / 2 - 12) / p.l1);
    // A faint measurement grid gives the paths a stable visual reference.
    for (let x = 20; x < w; x += 30) for (let y = 56; y < h - 29; y += 30) dot(ctx, x, y, .6, "#43504477");
    line(ctx, split, 62, split, h - 43, "#56604c55", .8, [2, 5]);
    text(ctx, "DOUBLE PENDULUM", pivot.x, 59, colors.amber, w < 400 ? 7 : 8, "center");
    text(ctx, "SINGLE", singlePivot.x, 59, colors.green, w < 400 ? 7 : 8, "center");
    const toScreen = point => [pivot.x + point[0] * scale, pivot.y + point[1] * scale];
    if (pendulum.trails) {
      for (const [key, color] of [["b", colors.purple], ["a", colors.amber]]) {
        if (key === "b" && !pendulum.compare) continue;
        const points = pendulum.trail;
        // Draw in batches so older sections fade without an unbounded history.
        for (let start = 1; start < points.length; start += 25) {
          ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = key === "a" ? 1.2 : .9;
          ctx.globalAlpha = .07 + .48 * start / points.length;
          const from = toScreen(points[start - 1][key]); ctx.moveTo(...from);
          for (let i = start; i < Math.min(points.length, start + 25); i++) ctx.lineTo(...toScreen(points[i][key]));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    function drawDouble(y, color, nearby) {
      const pos = M.position(y, p), a = [pivot.x + pos.x1 * scale, pivot.y + pos.y1 * scale], b = [pivot.x + pos.x2 * scale, pivot.y + pos.y2 * scale];
      line(ctx, pivot.x, pivot.y, a[0], a[1], nearby ? "#bbabdb99" : "#d0d7c2", nearby ? 1 : 2, nearby ? [4, 3] : []);
      line(ctx, a[0], a[1], b[0], b[1], nearby ? "#bbabdb99" : "#d0d7c2", nearby ? 1 : 2, nearby ? [4, 3] : []);
      dot(ctx, a[0], a[1], nearby ? 3.5 : 6, color);
      dot(ctx, b[0], b[1], nearby ? 4.5 : 8.5, color);
      if (!nearby) { dot(ctx, a[0], a[1], 1.7, colors.bg); dot(ctx, b[0], b[1], 2.2, colors.bg); }
    }
    if (pendulum.compare) drawDouble(pendulum.near, colors.purple, true);
    drawDouble(pendulum.y, colors.amber, false);
    line(ctx, pivot.x - 15, pivot.y, pivot.x + 15, pivot.y, "#879680", 1);
    dot(ctx, pivot.x, pivot.y, 4, colors.text); dot(ctx, pivot.x, pivot.y, 1.8, colors.bg);
    const sx = singlePivot.x + p.l1 * Math.sin(pendulum.single[0]) * scale;
    const sy = singlePivot.y + p.l1 * Math.cos(pendulum.single[0]) * scale;
    ctx.beginPath(); ctx.ellipse(singlePivot.x, singlePivot.y, p.l1 * scale, p.l1 * scale, 0, 0, Math.PI * 2); ctx.strokeStyle = "#91a68126"; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
    line(ctx, singlePivot.x, singlePivot.y, sx, sy, "#c6d2b4", 2);
    line(ctx, singlePivot.x - 12, singlePivot.y, singlePivot.x + 12, singlePivot.y, "#879680", 1);
    dot(ctx, singlePivot.x, singlePivot.y, 3, colors.text); dot(ctx, sx, sy, 7, colors.green); dot(ctx, sx, sy, 2, colors.bg);
    text(ctx, "Two degrees of freedom", pivot.x, h - 36, colors.muted, w < 400 ? 6 : 8, "center");
    text(ctx, "One degree of freedom", singlePivot.x, h - 36, colors.muted, w < 400 ? 6 : 8, "center");
  }

  function drawPhase(size) {
    const { ctx } = size, area = plotArea(size.w, size.h);
    let maxVelocity = 4;
    for (const point of pendulum.phase) maxVelocity = Math.max(maxVelocity, Math.abs(point.a[1]), Math.abs(point.s[1]), pendulum.compare ? Math.abs(point.b[1]) : 0);
    maxVelocity = Math.ceil(maxVelocity * 1.08 / 2) * 2;
    const xMap = theta => area.left + (theta + Math.PI) / (2 * Math.PI) * (area.right - area.left);
    const yMap = omega => area.bottom - (omega + maxVelocity) / (2 * maxVelocity) * (area.bottom - area.top);
    axes(size, area, [{ value: -Math.PI, label: "−π" }, { value: -Math.PI / 2, label: "−π/2" }, 0, { value: Math.PI / 2, label: "π/2" }, { value: Math.PI, label: "π" }], [-maxVelocity, -maxVelocity / 2, 0, maxVelocity / 2, maxVelocity], xMap, yMap, "Angle θ (rad)", "Velocity ω (rad/s)");
    for (const [key, color] of [["s", colors.green], ["b", colors.purple], ["a", colors.amber]]) {
      if (key === "b" && !pendulum.compare) continue;
      const history = pendulum.trails ? pendulum.phase : pendulum.phase.slice(-1);
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = key === "a" ? 1.3 : 1; ctx.globalAlpha = .75;
      for (let n = 0; n < history.length; n++) {
        const [theta, omega] = history[n][key];
        if (!n || Math.abs(theta - history[n - 1][key][0]) > Math.PI) ctx.moveTo(xMap(theta), yMap(omega));
        else ctx.lineTo(xMap(theta), yMap(omega));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      const point = pendulum.phase[pendulum.phase.length - 1][key];
      dot(ctx, xMap(point[0]), yMap(point[1]), 3, color);
    }
    text(ctx, "ORANGE: DOUBLE   SAGE: SINGLE", area.left + 8, area.top + 12, colors.text, size.w < 400 ? 6 : 8);
  }

  function drawPendulum() {
    if (activeExperiment !== "pendulum") return;
    const size = setupCanvas("pendulum-canvas"); if (!size) return;
    if (pendulum.view === "motion") drawMotion(size); else drawPhase(size);
    const a = M.position(pendulum.y, pendulum.p), b = M.position(pendulum.near, pendulum.p);
    const separation = Math.hypot(a.x2 - b.x2, a.y2 - b.y2);
    const drift = Math.abs(M.energy(pendulum.y, pendulum.p) - pendulum.initialEnergy) / Math.max(pendulum.initialEnergy, 1e-10) * 100;
    $("pendulum-time").innerHTML = `${pendulum.t.toFixed(2)} <small>s</small>`;
    $("pendulum-separation").innerHTML = pendulum.compare ? `${separation.toFixed(separation < .01 ? 4 : 3)} <small>m</small>` : "—";
    $("pendulum-energy").innerHTML = `${drift.toFixed(3)} <small>%</small>`;
    $("pendulum-corner").textContent = pendulum.view === "motion" ? "IDEAL RODS · NO FRICTION" : "A 2D WINDOW INTO A 4D SYSTEM";
  }

  function setPendulumView(view) {
    pendulum.view = view;
    $("pendulum-plot-panel").setAttribute("aria-labelledby", `pendulum-${view}-tab`);
    all("[data-pendulum-view]").forEach(button => { const selected = button.dataset.pendulumView === view; button.classList.toggle("active", selected); button.setAttribute("aria-selected", selected); button.tabIndex = selected ? 0 : -1; });
    $("pendulum-plot-title").textContent = view === "motion" ? "Same physics. Different futures." : "The shape of a system’s motion";
    $("pendulum-caption").textContent = view === "motion" ? "Angles are measured from the downward vertical." : "Double: lower arm. Single: its only arm. Angles wrap at ±π.";
    $("pendulum-canvas").setAttribute("aria-label", view === "motion" ? "Motion of single and double pendulums. Orange is the double pendulum, purple is a nearby start, and sage is the single pendulum." : "Phase portrait showing angle versus angular velocity. Orange and purple show each double pendulum's lower arm. Sage shows the single pendulum.");
    drawPendulum();
  }

  function selectExperiment(experiment) {
    for (const [name, extension] of experimentExtensions) if (name !== experiment) extension.onDeactivate?.();
    activeExperiment = experiment;
    stopLogistic(); pendulum.running = false; updatePendulumPlayback();
    all("[data-experiment]").forEach(button => {
      const selected = button.dataset.experiment === experiment;
      button.classList.toggle("active", selected); button.setAttribute("aria-selected", selected); button.tabIndex = selected ? 0 : -1;
      $(button.getAttribute("aria-controls")).hidden = !selected;
    });
    if (experiment === "logistic") drawLogistic();
    else if (experiment === "pendulum") drawPendulum();
    else experimentExtensions.get(experiment)?.onSelect();
  }

  // Roving keyboard focus keeps the tab controls usable without a pointer.
  function bindTabKeys(selector) {
    const buttons = all(selector);
    for (const button of buttons) button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = buttons.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click(); buttons[next].focus();
    });
  }

  window.ChaosLab = {
    registerExperiment(name, extension) { experimentExtensions.set(name, extension); },
    selectExperiment,
    get activeExperiment() { return activeExperiment; },
    plot: { setupCanvas, plotArea, axes, line, dot, text, colors },
    paintRange, bindTabKeys, observeResize,
  };

  all("[data-experiment]").forEach(button => button.addEventListener("click", () => selectExperiment(button.dataset.experiment)));
  all("[data-logistic-view]").forEach(button => button.addEventListener("click", () => setLogisticView(button.dataset.logisticView)));
  all("[data-pendulum-view]").forEach(button => button.addEventListener("click", () => setPendulumView(button.dataset.pendulumView)));
  bindTabKeys("[data-experiment]"); bindTabKeys("[data-logistic-view]"); bindTabKeys("[data-pendulum-view]");

  for (const [id, key] of [["growth", "a"], ["initial", "x0"], ["iterations", "iterations"]]) $(id).addEventListener("input", () => {
    logistic[key] = Number($(id).value); stopLogistic(); logistic.visible = logistic.iterations; syncLogistic();
  });
  $("bifurcation-range").addEventListener("change", () => { logistic.range = $("bifurcation-range").value; requestLogisticDraw(); });
  $("logistic-compare").addEventListener("change", () => { logistic.compare = $("logistic-compare").checked; if (logistic.compare && logistic.view === "bifurcation") setLogisticView("series"); else setLogisticView(logistic.view); });
  $("logistic-reset").addEventListener("click", () => {
    stopLogistic(); Object.assign(logistic, { a: 3.7, x0: .2, iterations: 120, visible: 120, compare: false, range: "focus" });
    $("bifurcation-range").value = "focus"; setLogisticView("bifurcation"); syncLogistic();
  });
  all("[data-logistic-preset]").forEach(button => button.addEventListener("click", () => {
    stopLogistic(); logistic.a = Number(button.dataset.logisticPreset); logistic.visible = logistic.iterations; syncLogistic();
  }));
  $("logistic-play").addEventListener("click", () => {
    if (logistic.view === "bifurcation") setLogisticView("series");
    if (!logistic.running && logistic.visible >= (logistic.view === "cobweb" ? 60 : logistic.iterations)) logistic.visible = 0;
    logistic.running = !logistic.running; logistic.lastTick = performance.now(); updateLogisticPlayback(); requestLogisticDraw();
  });
  $("logistic-step").addEventListener("click", () => {
    if (logistic.view === "bifurcation") setLogisticView("series");
    stopLogistic(); const limit = logistic.view === "cobweb" ? 60 : logistic.iterations;
    logistic.visible = logistic.visible >= limit ? 1 : logistic.visible + 1; requestLogisticDraw();
  });
  let pointerDown = false, pointerStart = null, draggingPlot = false;
  function selectPlotParameter(event) {
    if (logistic.view !== "bifurcation") return;
    const canvas = $("logistic-canvas"), rect = canvas.getBoundingClientRect(), area = plotArea(rect.width, rect.height);
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - area.left) / (area.right - area.left)));
    const low = logistic.range === "focus" ? 2.5 : 0;
    logistic.a = Math.round((low + fraction * (4 - low)) * 1000) / 1000; syncLogistic();
  }
  $("logistic-canvas").addEventListener("pointerdown", event => {
    if (logistic.view !== "bifurcation" || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointerDown = true; pointerStart = [event.clientX, event.clientY]; draggingPlot = event.pointerType === "mouse";
    if (draggingPlot) { $("logistic-canvas").setPointerCapture(event.pointerId); selectPlotParameter(event); }
  });
  $("logistic-canvas").addEventListener("pointermove", event => {
    if (!pointerDown) return;
    if (!draggingPlot && Math.abs(event.clientX - pointerStart[0]) > 8 && Math.abs(event.clientX - pointerStart[0]) > Math.abs(event.clientY - pointerStart[1])) { draggingPlot = true; $("logistic-canvas").setPointerCapture(event.pointerId); }
    if (draggingPlot) selectPlotParameter(event);
  });
  $("logistic-canvas").addEventListener("pointerup", event => { if (pointerDown && !draggingPlot && Math.abs(event.clientY - pointerStart[1]) < 8) selectPlotParameter(event); pointerDown = false; draggingPlot = false; });
  $("logistic-canvas").addEventListener("pointercancel", () => { pointerDown = false; draggingPlot = false; });

  const pendulumPresets = { gentle: [15, 15], chaotic: [120, -20], upright: [170, 170] };
  for (const [id, key] of [["angle1", "angle1"], ["angle2", "angle2"]]) $(id).addEventListener("input", () => { pendulum[key] = Number($(id).value); restartPendulum(); });
  for (const [id, key] of [["length1", "l1"], ["length2", "l2"], ["gravity", "g"]]) $(id).addEventListener("change", () => {
    const input = $(id);
    if (!input.validity.valid || !input.value || !Number.isFinite(Number(input.value))) { input.value = pendulum.p[key]; return; }
    pendulum.p[key] = Number(input.value); restartPendulum();
  });
  $("pendulum-compare").addEventListener("change", () => { pendulum.compare = $("pendulum-compare").checked; document.querySelector(".pendulum-plot .plot-key").style.visibility = pendulum.compare ? "visible" : "hidden"; drawPendulum(); });
  $("pendulum-trails").addEventListener("change", () => { pendulum.trails = $("pendulum-trails").checked; drawPendulum(); });
  $("pendulum-speed").addEventListener("change", () => { pendulum.speed = Number($("pendulum-speed").value); });
  $("pendulum-play").addEventListener("click", () => { pendulum.running = !pendulum.running; updatePendulumPlayback(); });
  $("pendulum-step").addEventListener("click", () => { pendulum.running = false; advancePendulum(4); updatePendulumPlayback(); drawPendulum(); });
  $("pendulum-reset").addEventListener("click", () => { pendulum.running = false; restartPendulum(); });
  all("[data-pendulum-preset]").forEach(button => button.addEventListener("click", () => { [pendulum.angle1, pendulum.angle2] = pendulumPresets[button.dataset.pendulumPreset]; restartPendulum(); }));
  all("[data-note-action]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.noteAction;
    selectExperiment(action === "fork" ? "logistic" : "pendulum");
    if (action === "fork") { logistic.a = 3.2; logistic.visible = logistic.iterations; setLogisticView("series"); syncLogistic(); }
    else {
      [pendulum.angle1, pendulum.angle2] = action === "phase" ? pendulumPresets.gentle : pendulumPresets.chaotic;
      pendulum.compare = true; $("pendulum-compare").checked = true;
      document.querySelector(".pendulum-plot .plot-key").style.visibility = "visible";
      restartPendulum(); setPendulumView(action === "phase" ? "phase" : "motion");
      pendulum.running = !window.matchMedia("(prefers-reduced-motion: reduce)").matches; updatePendulumPlayback();
    }
    $("experiments").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    $(action === "fork" ? "logistic-tab" : "pendulum-tab").focus({ preventScroll: true });
  }));

  all(".export-plot").forEach(button => button.addEventListener("click", () => {
    const canvas = $(button.dataset.canvas);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `chaos-lab-${button.dataset.filename || (button.dataset.canvas === "logistic-canvas" ? logistic.view : `pendulum-${pendulum.view}`)}.png`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }));

  observeResize($("logistic-canvas").parentElement, () => { if (activeExperiment === "logistic") requestLogisticDraw(); else drawPendulum(); });
  observeResize($("pendulum-canvas").parentElement, () => { if (activeExperiment === "pendulum") drawPendulum(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopLogistic(); pendulum.running = false; updatePendulumPlayback(); pendulum.accumulator = 0; }
  });
  let previousFrame = 0;
  function animate(now) {
    const elapsed = previousFrame ? Math.min((now - previousFrame) / 1000, .05) : 0; previousFrame = now;
    if (!document.hidden && activeExperiment === "pendulum" && pendulum.running) {
      pendulum.accumulator += elapsed * pendulum.speed;
      const steps = Math.floor(pendulum.accumulator * 240);
      if (steps) { advancePendulum(steps); pendulum.accumulator -= steps / 240; drawPendulum(); }
    }
    if (!document.hidden && activeExperiment === "logistic" && logistic.running && now - logistic.lastTick >= (logistic.view === "cobweb" ? 140 : 65)) {
      logistic.lastTick = now;
      const limit = logistic.view === "cobweb" ? 60 : logistic.iterations;
      logistic.visible = Math.min(limit, logistic.visible + 1);
      if (logistic.visible >= limit) stopLogistic();
      requestLogisticDraw();
    }
    requestAnimationFrame(animate);
  }
  restartPendulum(); syncLogistic(); setLogisticView("bifurcation");
  requestAnimationFrame(animate);
  document.body.dataset.ready = "true";
})();
