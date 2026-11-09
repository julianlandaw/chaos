/* Paced experiments using Julian Landaw's original LR1CellIto equations. */
"use strict";
globalThis.CardiacSimulation = (() => {
  const DT = 0.01;
  const WARMUP_MS = 10000;
  const CONDITIONING_BEATS = 10;
  const DEFAULTS = { inafac: 1, itofac: 0, icalfac: 1, ikfac: 1, ikifac: 1, tauXfac: 1, yshift: 0, beats: 10, pcl: 500 };
  const PRESETS = {
    regular: { ...DEFAULTS },
    chaos: { ...DEFAULTS, itofac: 1.05, icalfac: 1.15, ikifac: 2.2, tauXfac: 5, yshift: 8, beats: 50, pcl: 378 },
    eads: { ...DEFAULTS, tauXfac: 10, beats: 15, pcl: 1575 },
  };
  const LIMITS = { inafac: [0, 5], itofac: [0, 5], icalfac: [0, 5], ikfac: [0, 5], ikifac: [0, 5], tauXfac: [.1, 25], yshift: [-40, 40], beats: [1, 100], pcl: [100, 2000] };
  const STATE_KEYS = ["v", "cai", "m", "h", "j", "xr", "d", "f", "xtos", "ytos", "xtof", "ytof"];

  function validate(inputs) {
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (!Number.isFinite(inputs[key]) || inputs[key] < min || inputs[key] > max) throw new RangeError(`${key} must be between ${min} and ${max}.`);
    }
    if (!Number.isInteger(inputs.beats) || !Number.isInteger(inputs.pcl)) throw new RangeError("Beats and pacing interval must be whole numbers.");
  }

  function checkCell(cell) {
    if (cell.cai <= 0 || !STATE_KEYS.every(key => Number.isFinite(cell[key]))) throw new Error("The model became numerically unstable. Try a preset or a less extreme parameter combination.");
  }

  // This generator yields every 5,000 base steps. The worker and the file://
  // fallback use the identical generator, so responsiveness does not change dt.
  function* simulate(input) {
    const inputs = { ...input };
    validate(inputs);
    const cell = new globalThis.LR1CellIto();
    for (const key of Object.keys(DEFAULTS)) if (!["beats", "pcl"].includes(key)) cell[key] = inputs[key];
    cell.cacheFixedIonConstants(); cell.fixedConductanceRun = true;
    if (cell.dt !== DT) throw new Error("The model step no longer matches the pacing schedule.");
    const pclSteps = Math.round(inputs.pcl / DT);
    const firstStimStep = Math.round(Math.min(100, inputs.pcl / 2) / DT);
    const stimSteps = Math.round(cell.stimduration / DT);
    const warmupSteps = Math.round(WARMUP_MS / DT);
    const conditioningSteps = CONDITIONING_BEATS * pclSteps;
    const recordingSteps = firstStimStep + inputs.beats * pclSteps;
    const totalSteps = warmupSteps + conditioningSteps - 1 + recordingSteps - 1;
    const sampleSteps = Math.max(100, Math.ceil(recordingSteps / 30000));
    let done = 0;
    const started = performance.now();

    function step(stimulus) { cell.stepdt(stimulus); done++; }
    function progress(stage) { checkCell(cell); return { percent: Math.min(99, Math.floor(100 * done / totalSteps)), stage }; }
    for (let i = 0; i < warmupSteps; i++) {
      step(0);
      if (done % 5000 === 0) yield progress("Resting warm-up");
    }
    let nextStim = firstStimStep, stimEnd = 0;
    for (let i = 1; i < conditioningSteps; i++) {
      if (i === nextStim) { stimEnd = i + stimSteps; nextStim += pclSteps; }
      step(i < stimEnd ? cell.stimulus : 0);
      if (done % 5000 === 0) yield progress("Conditioning 10 beats");
    }

    const result = { inputs, ts: [0], vs: [cell.v], xs: [cell.xr], apds: [], xsInit: [], xsRepolarized: [], apdStartTimes: [], apdEndTimes: [], eadCounts: [], stimulusTimes: [], sampleIntervalMs: sampleSteps * DT };
    let startAPD = null, initialX = null, eadCount = 0;
    let trough = Infinity, peak = -Infinity, rising = false;
    nextStim = firstStimStep; stimEnd = 0;
    for (let i = 1; i < recordingSteps; i++) {
      const oldV = cell.v, time = i * DT;
      if (i === nextStim) { stimEnd = i + stimSteps; nextStim += pclSteps; result.stimulusTimes.push(time); }
      step(i < stimEnd ? cell.stimulus : 0);
      if (oldV <= cell.threshold && cell.v > cell.threshold) {
        startAPD = time; initialX = cell.xr; eadCount = 0;
        trough = Infinity; peak = -Infinity; rising = false;
      } else if (oldV >= cell.threshold && cell.v < cell.threshold && startAPD !== null) {
        result.apds.push(time - startAPD); result.xsInit.push(initialX);
        result.xsRepolarized.push(cell.xr); result.apdStartTimes.push(startAPD);
        result.apdEndTimes.push(time); result.eadCounts.push(eadCount);
        startAPD = null;
      } else if (startAPD !== null && time - startAPD >= 100) {
        // Match the original simulator's operational EAD detector.
        if (!rising) {
          trough = Math.min(trough, cell.v);
          if (trough <= -15 && cell.v - trough >= 5) { eadCount++; rising = true; peak = cell.v; }
        } else {
          peak = Math.max(peak, cell.v);
          if (peak - cell.v >= 5) { rising = false; trough = cell.v; }
        }
      }
      if (i % sampleSteps === 0 || i === recordingSteps - 1) {
        result.ts.push(time / 1000); result.vs.push(cell.v); result.xs.push(cell.xr);
      }
      if (done % 5000 === 0) yield progress("Recording paced beats");
    }
    checkCell(cell);
    result.runtimeMs = performance.now() - started;
    result.metrics = {
      minAPD: result.apds.length ? Math.min(...result.apds) : null,
      maxAPD: result.apds.length ? Math.max(...result.apds) : null,
      totalEADs: result.eadCounts.reduce((sum, n) => sum + n, 0),
      completeAPDs: result.apds.length, deliveredStimuli: result.stimulusTimes.length,
    };
    return result;
  }

  async function run(inputs, { onProgress = () => {}, signal, cooperative = true } = {}) {
    const simulation = simulate(inputs);
    let lastYield = performance.now(), lastProgress = -1;
    for (;;) {
      if (signal?.aborted) throw new DOMException("Simulation canceled.", "AbortError");
      const next = simulation.next();
      if (next.done) { onProgress({ percent: 100, stage: "Complete" }); return next.value; }
      if (next.value.percent !== lastProgress) { onProgress(next.value); lastProgress = next.value.percent; }
      if (cooperative && performance.now() - lastYield > 12) {
        await new Promise(resolve => setTimeout(resolve, 0)); lastYield = performance.now();
      }
    }
  }
  return { PRESETS, LIMITS, DT, WARMUP_MS, CONDITIONING_BEATS, simulate, run, validate };
})();
