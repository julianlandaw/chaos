"use strict";
(() => {
  const Lab = window.ChaosLab, Model = window.CardiacSimulation;
  const $ = id => document.getElementById(id);
  const buttons = selector => [...document.querySelectorAll(selector)];
  const { setupCanvas, plotArea, axes, line, dot, text, colors } = Lab.plot;
  const keys = Object.keys(Model.PRESETS.chaos);
  const state = { inputs: { ...Model.PRESETS.chaos }, result: null, view: "voltage", window: "8", stale: false, running: false, id: 0, worker: null, controller: null, started: false, percent: 0 };

  function ticks(min, max, count = 4, decimals = 0) {
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = min + (max - min) * i / count;
      return { value, label: value.toFixed(decimals) };
    });
  }
  function status(message, error = false) {
    $("cardiac-status").textContent = message;
    $("cardiac-panel").classList.toggle("cardiac-error", error);
  }
  function updateButton() {
    $("cardiac-run").innerHTML = state.running ? '<span class="play-icon" aria-hidden="true">■</span><span>Cancel run</span>' : '<span class="play-icon" aria-hidden="true">▶</span><span>Simulate beats</span>';
    $("cardiac-progress").hidden = !state.running;
    $("cardiac-panel").setAttribute("aria-busy", String(state.running));
  }
  function syncControls() {
    for (const key of keys) {
      const input = $(`cardiac-${key}`); input.value = state.inputs[key];
      if (input.type === "range") Lab.paintRange(input);
    }
    $("cardiac-pcl-value").textContent = `${state.inputs.pcl} ms`;
    $("cardiac-itofac-value").textContent = `${state.inputs.itofac.toFixed(2)}×`;
    $("cardiac-tauXfac-value").textContent = `${state.inputs.tauXfac.toFixed(1)}×`;
    $("cardiac-beats-value").textContent = state.inputs.beats;
    buttons("[data-cardiac-preset]").forEach(button => {
      const preset = Model.PRESETS[button.dataset.cardiacPreset];
      button.classList.toggle("selected", keys.every(key => preset[key] === state.inputs[key]));
    });
  }
  function cancel(message = "Run canceled. Simulate again when you’re ready.") {
    state.id++; state.worker?.terminate(); state.worker = null;
    state.controller?.abort(); state.controller = null; state.running = false;
    $("cardiac-panel").dataset.state = state.result ? "complete" : "ready";
    updateButton(); status(message);
  }
  function markStale() {
    if (state.running) cancel();
    state.stale = !!state.result;
    $("cardiac-panel").dataset.stale = String(state.stale);
    status("Parameters changed — simulate to update the plots.");
    draw();
  }
  function progress(data, id) {
    if (id !== state.id) return;
    state.percent = data.percent; $("cardiac-progress").value = data.percent;
    status(`${data.stage} · ${data.percent}%`);
    if (!state.result) draw();
  }
  function fail(message, id) {
    if (id !== state.id) return;
    state.worker?.terminate(); state.worker = null; state.running = false;
    $("cardiac-panel").dataset.state = "error"; updateButton(); status(message, true); draw();
  }
  function complete(result, id) {
    if (id !== state.id) return;
    state.worker?.terminate(); state.worker = null; state.controller = null;
    state.running = false; state.stale = false; state.result = result;
    $("cardiac-panel").dataset.state = "complete"; $("cardiac-panel").dataset.stale = "false";
    updateButton(); $("cardiac-csv").disabled = false;
    status(`${result.metrics.deliveredStimuli} stimuli · ${result.apds.length} complete APDs · ${(result.ts.at(-1)).toFixed(1)} s recorded`);
    $("cardiac-count").textContent = `${result.apds.length} / ${result.metrics.deliveredStimuli}`;
    $("cardiac-range").textContent = result.apds.length ? `${result.metrics.minAPD.toFixed(1)}–${result.metrics.maxAPD.toFixed(1)}` : "No complete APDs";
    $("cardiac-eads").textContent = result.metrics.totalEADs;
    const spread = result.apds.length ? result.metrics.maxAPD - result.metrics.minAPD : 0;
    $("cardiac-insight").innerHTML = !result.apds.length ? "<strong>No complete action potentials were measured.</strong> A response may fail to capture, remain depolarized, or extend beyond the recording. Try a longer run or one of the original presets."
      : result.metrics.totalEADs > 0 ? "<strong>A second rise before the beat is over.</strong> The detector found secondary voltage rises on completed action potentials. Inspect the voltage trace: a longer duration alone is not an EAD."
      : spread < 1 ? "<strong>A rhythm that comes back to itself.</strong> The recorded durations are almost identical. Try the chaos preset to see how slow gate recovery and a changed current balance alter the next beat."
      : "<strong>Same pacing, different durations.</strong> Each beat inherits the previous state of the cell. Compare the APD series, return map, and X-gate memory view. Variation alone does not prove chaos.";
    draw();
  }
  async function runLocal(inputs, id) {
    if (id !== state.id) return;
    $("cardiac-panel").dataset.engine = "cooperative";
    state.controller = new AbortController();
    try {
      const result = await Model.run(inputs, { onProgress: data => progress(data, id), signal: state.controller.signal });
      complete(result, id);
    } catch (error) { if (error.name !== "AbortError") fail(error.message, id); }
  }
  function run() {
    if (state.running) cancel();
    const inputs = {};
    try {
      for (const key of keys) {
        const input = $(`cardiac-${key}`);
        if (!input.checkValidity() || !input.value) { input.reportValidity(); throw new Error("Enter a valid value for every model parameter."); }
        inputs[key] = Number(input.value);
      }
      Model.validate(inputs);
    } catch (error) { status(error.message, true); return; }
    state.inputs = inputs; state.started = true; state.running = true; state.percent = 0;
    const id = ++state.id;
    $("cardiac-panel").dataset.state = "running"; $("cardiac-progress").value = 0;
    updateButton(); status("Preparing the cell · 0%"); draw();
    if (location.protocol === "file:" || typeof Worker === "undefined") { runLocal(inputs, id); return; }
    try {
      const worker = new Worker("js/cardiac-worker.js");
      state.worker = worker; $("cardiac-panel").dataset.engine = "worker";
      worker.onmessage = ({ data }) => {
        if (data.id !== id || id !== state.id) return;
        if (data.kind === "progress") progress(data, id);
        else if (data.kind === "result") complete(data.result, id);
        else if (data.kind === "error") fail(data.message, id);
      };
      worker.onerror = event => {
        event.preventDefault(); worker.terminate();
        if (id === state.id) { state.worker = null; runLocal(inputs, id); }
      };
      worker.postMessage({ kind: "run", id, inputs });
    } catch (_) { state.worker?.terminate(); state.worker = null; runLocal(inputs, id); }
  }

  function drawVoltage(size, result) {
    const { ctx } = size, area = plotArea(size.w, size.h);
    const end = result.ts.at(-1), start = state.window === "all" ? 0 : Math.max(0, end - 8 * result.inputs.pcl / 1000);
    const xMap = t => area.left + (t - start) / (end - start || 1) * (area.right - area.left);
    const yMap = v => area.bottom - (v + 100) / 160 * (area.bottom - area.top);
    axes(size, area, ticks(start, end, size.w < 400 ? 3 : 4, 1), [-100, -60, -20, 20, 60], xMap, yMap, "Recorded time (s)", "Voltage (mV)");
    line(ctx, area.left, yMap(-75), area.right, yMap(-75), "#bdcaa44d", .8, [3, 4]);
    text(ctx, "−75 mV", area.right - 3, yMap(-75) - 8, colors.muted, 7, "right");
    ctx.save(); ctx.beginPath(); ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top); ctx.clip();
    for (const stimulus of result.stimulusTimes) {
      const t = stimulus / 1000;
      if (t >= start) line(ctx, xMap(t), area.bottom - 4, xMap(t), area.bottom - 11, colors.green, 1.4);
    }
    ctx.beginPath(); ctx.strokeStyle = colors.amber; ctx.lineWidth = 1.5;
    let begun = false;
    for (let n = 0; n < result.ts.length; n++) {
      if (result.ts[n] < start && result.ts[n + 1] < start) continue;
      if (begun) ctx.lineTo(xMap(result.ts[n]), yMap(result.vs[n]));
      else { ctx.moveTo(xMap(result.ts[n]), yMap(result.vs[n])); begun = true; }
    }
    ctx.stroke(); ctx.restore();
    text(ctx, `${result.inputs.pcl} ms pacing`, area.right - 3, area.top + 10, colors.green, size.w < 400 ? 7 : 9, "right");
  }
  function apdBounds(result) {
    const maximum = result.metrics.maxAPD || 100;
    const step = maximum > 700 ? 250 : maximum > 300 ? 100 : 50;
    return Math.ceil((maximum * 1.08) / step) * step;
  }
  function drawAPDs(size, result) {
    const { ctx } = size, area = plotArea(size.w, size.h), count = result.apds.length, maxY = apdBounds(result);
    const xMap = n => area.left + (n - 1) / Math.max(1, count - 1) * (area.right - area.left);
    const yMap = v => area.bottom - v / maxY * (area.bottom - area.top);
    const xTicks = [...new Set([1, Math.max(1, Math.round(count / 2)), Math.max(1, count)])];
    axes(size, area, xTicks, ticks(0, maxY), xMap, yMap, "Completed action potential n", "APD (ms)");
    ctx.beginPath(); ctx.lineWidth = 1; ctx.strokeStyle = "#e8a65a80";
    result.apds.forEach((value, i) => { if (i) ctx.lineTo(xMap(i + 1), yMap(value)); else ctx.moveTo(xMap(i + 1), yMap(value)); });
    ctx.stroke(); result.apds.forEach((value, i) => dot(ctx, xMap(i + 1), yMap(value), 2.8, result.eadCounts[i] ? colors.purple : colors.amber));
  }
  function drawScatter(size, result, memory) {
    const { ctx } = size, area = plotArea(size.w, size.h), maxAPD = apdBounds(result);
    const xs = memory ? result.xsInit : result.apds.slice(0, -1);
    const ys = memory ? result.apds : result.apds.slice(1);
    let minX = 0, maxX = memory ? 1 : maxAPD;
    if (memory && xs.length) { minX = Math.max(0, Math.min(...xs) * .9); maxX = Math.max(minX + .01, Math.max(...xs) * 1.1); }
    const xMap = x => area.left + (x - minX) / (maxX - minX) * (area.right - area.left);
    const yMap = y => area.bottom - y / maxAPD * (area.bottom - area.top);
    axes(size, area, ticks(minX, maxX, 4, memory ? 3 : 0), ticks(0, maxAPD), xMap, yMap, memory ? "X gate xᵣ at upstroke" : "APDₙ (ms)", memory ? "APD (ms)" : "APDₙ₊₁ (ms)");
    if (!memory) line(ctx, area.left, area.bottom, area.right, area.top, "#a5b49355", .8, [3, 4]);
    xs.forEach((x, i) => { ctx.globalAlpha = .35 + .65 * (i + 1) / xs.length; dot(ctx, xMap(x), yMap(ys[i]), 3.2, colors.amber); });
    ctx.globalAlpha = 1;
    if (xs.length) text(ctx, "FAINT → EARLY   BRIGHT → LATE", area.left + 7, area.top + 10, colors.muted, size.w < 400 ? 6 : 7);
    if (!memory && result.apds.length === 1) text(ctx, "Two completed APDs are needed for a pair.", (area.left + area.right) / 2, (area.top + area.bottom) / 2, colors.text, size.w < 400 ? 7 : 10, "center");
  }
  function draw() {
    if (Lab.activeExperiment !== "cardiac") return;
    const size = setupCanvas("cardiac-canvas"); if (!size) return;
    const { ctx, w, h } = size;
    if (!state.result) {
      text(ctx, state.running ? "Let the cell find its rhythm…" : "One cell. A new rhythm.", w / 2, h / 2 - 14, colors.amber, w < 400 ? 12 : 17, "center");
      text(ctx, state.running ? `${state.percent}% · Warming up, conditioning, recording` : "Choose a preset, then simulate beats.", w / 2, h / 2 + 14, colors.muted, w < 400 ? 7 : 9, "center");
    } else if (state.view === "voltage") drawVoltage(size, state.result);
    else if (state.view === "apd") drawAPDs(size, state.result);
    else drawScatter(size, state.result, state.view === "memory");
    if (state.result && state.view !== "voltage" && !state.result.apds.length) text(ctx, "No complete APDs in this run.", w / 2, h / 2, colors.text, w < 400 ? 9 : 12, "center");
    $("cardiac-corner").textContent = state.stale ? "PREVIOUS RUN · PARAMETERS CHANGED" : "LR1 + Iₜₒ · DETERMINISTIC PACING";
    $("cardiac-canvas").setAttribute("aria-label", state.result ? `${state.view === "voltage" ? "Voltage trace" : state.view === "apd" ? "APD sequence" : state.view === "memory" ? "APD versus initial X gate" : "APD return map"} for ${state.result.inputs.beats} stimuli at ${state.result.inputs.pcl} millisecond intervals. ${state.result.apds.length} complete action potentials.${state.stale ? " Previous run; simulate to apply the changed parameters." : ""}` : "Cardiac model is ready to compute. Use Simulate beats to generate a trace.");
  }
  function setView(view) {
    state.view = view;
    buttons("[data-cardiac-view]").forEach(button => {
      const selected = button.dataset.cardiacView === view;
      button.classList.toggle("active", selected); button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    $("cardiac-plot-panel").setAttribute("aria-labelledby", `cardiac-${view}-tab`);
    const titles = { voltage: "The rhythm inside a single cell", apd: "Every beat has its own duration", return: "The next beat remembers the last", memory: "The slow gate carries a history" };
    const captions = { voltage: "APD uses crossings of −75 mV, rather than APD90. Sage ticks mark stimuli.", apd: "All completed APDs after conditioning; purple points include detected EADs.", return: "Successive complete APDs; a scatter plot alone does not prove chaos.", memory: "Measured APD versus xᵣ at its upstroke; a projection of the full state." };
    $("cardiac-plot-title").textContent = titles[view]; $("cardiac-caption").textContent = captions[view];
    $("cardiac-plot-key").textContent = view === "voltage" ? "Membrane voltage" : "Completed APDs";
    $("cardiac-window-label").hidden = view !== "voltage";
    document.querySelector('[data-canvas="cardiac-canvas"]').dataset.filename = `cardiac-${view}`;
    draw();
  }
  function applyPreset(name) { cancel(); state.inputs = { ...Model.PRESETS[name] }; syncControls(); markStale(); run(); }

  for (const key of keys) {
    const input = $(`cardiac-${key}`);
    input.addEventListener(input.type === "range" ? "input" : "change", () => {
      if (!input.checkValidity() || !input.value) { markStale(); status("Enter a valid value for every model parameter.", true); return; }
      state.inputs[key] = Number(input.value); syncControls(); markStale();
    });
  }
  buttons("[data-cardiac-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.cardiacView)));
  buttons("[data-cardiac-preset]").forEach(button => button.addEventListener("click", () => applyPreset(button.dataset.cardiacPreset)));
  $("cardiac-run").addEventListener("click", () => state.running ? cancel() : run());
  $("cardiac-reset").addEventListener("click", () => applyPreset("chaos"));
  $("cardiac-window").addEventListener("change", () => { state.window = $("cardiac-window").value; draw(); });
  $("cardiac-csv").addEventListener("click", () => {
    if (!state.result) return;
    const result = state.result;
    const header = ["completed_apd", "upstroke_ms", "repolarization_ms", "apd_ms", "xr_at_upstroke", "xr_at_repolarization", "detected_eads", ...keys];
    const rows = result.apds.map((apd, i) => [i + 1, result.apdStartTimes[i], result.apdEndTimes[i], apd, result.xsInit[i], result.xsRepolarized[i], result.eadCounts[i], ...keys.map(key => result.inputs[key])].join(","));
    const url = URL.createObjectURL(new Blob([[header.join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "chaos-lab-cardiac-apds.csv";
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  buttons("[data-cardiac-note]").forEach(button => button.addEventListener("click", () => {
    Lab.selectExperiment("cardiac"); $("experiments").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    $("cardiac-tab").focus({ preventScroll: true });
  }));
  document.querySelector('a[href="#cardiac-model-notes"]').addEventListener("click", () => {
    $("cardiac-model-notes").querySelector("details").open = true;
  });
  Lab.bindTabKeys("[data-cardiac-view]");
  Lab.registerExperiment("cardiac", { onSelect() { draw(); if (!state.started) run(); }, onDeactivate() { if (state.running) cancel("Run canceled when leaving the experiment. Simulate to run it again."); } });
  new ResizeObserver(draw).observe($("cardiac-canvas").parentElement);
  syncControls(); setView("voltage");
  $("cardiac-panel").dataset.state = "ready";
  document.body.dataset.cardiacReady = "true";
})();
