# Chaos Lab

An interactive, dependency-free playground for nonlinear dynamics and chaos theory.

Open [`docs/index.html`](docs/index.html) directly in a modern browser, or serve the repository:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/docs/`. Everything runs locally, including the plots. No installation, build step, or internet connection is required. For GitHub Pages, publish the `docs/` directory from the `main` branch.

Scripts, styles, and cardiac worker dependencies share an explicit `?v=` release token so a newly deployed page does not reuse an older cached core script. When changing these assets for a release, update the token in `docs/index.html`, the worker URL in `docs/js/cardiac-lab.js`, and the imports in `docs/js/cardiac-worker.js`. After publishing an update, a hard refresh (`Ctrl+Shift+R` in Edge) also refreshes any cached HTML. The site falls back when `ResizeObserver`, `CanvasRenderingContext2D.roundRect`, or `Array.prototype.at` are unavailable. A missing cardiac dependency shows a refresh instruction instead of an uncaught startup error.

## Experiments

- **Logistic map:** adjustable growth rate and starting population; clickable bifurcation diagram; time series and cobweb plots; nearby initial conditions; orbit animation, single steps, cycle detection, and a finite-time Lyapunov estimate.
- **Pendulums:** single and double pendulums; a nearby double pendulum; motion trails and phase portraits; adjustable initial angles, lengths, gravity, and playback speed; an energy-drift diagnostic.
- **Cardiac rhythms:** Julian Landaw’s LR1CellIto cardiac action-potential model; regular, chaos, and EAD presets; voltage traces, APD sequences, APD return maps, and X-gate memory plots; adjustable pacing and current parameters; APD data export.

All three labs include presets and downloadable PNG plots. The page supports small screens, keyboard-operated tabs and controls, and reduced-motion preferences. Animations start on request and pause when switching experiments or leaving the browser tab. Opening the cardiac tab computes the original chaos preset; leaving that experiment cancels unfinished calculations. Cardiac controls mark the displayed result as out of date until you simulate again.

## Models

The logistic map uses `x[n+1] = a*x[n]*(1-x[n])` for `0 ≤ a ≤ 4`. The bifurcation plot discards 700 iterations before plotting 160 points per parameter. The Lyapunov estimate uses 2,048 iterations after 1,000 transients. Cycle detection searches for periods up to 64 with a tolerance of `1e-7`; finite samples cannot prove chaos.

The pendulums have point masses, massless rigid rods, no damping, and no driving. The coupled equations are solved with fixed-step RK4 (`dt = 1/240 s`). The single pendulum uses the full sine equation rather than a small-angle approximation. Its length and initial angle match the double pendulum’s upper arm. All initial angular velocities are zero. The nearby double pendulum differs by `0.01°` in the lower angle. Phase portraits show a two-dimensional projection of the double pendulum’s four-dimensional state.

The cardiac model is vendored from [Julian Landaw’s LR1CellIto](https://github.com/julianlandaw/LR1CellIto), commit `ea478b88f4c2a57f1ab65e99e93e44281f5e1820`, file `docs/assets/js/LR1CellIto.js`. Its equations and integration are unchanged; local edits to the vendored file add attribution and remove trailing whitespace. The new pacing runner preserves the original 10-second unpaced warm-up, 10 conditioning beats, −80 µA/cm² stimulus lasting 0.5 ms, 0.01 ms base step, and ten adaptive substeps when the proposed voltage change exceeds 0.1 mV. It reproduces the original regular, chaos, and EAD parameter sets. The allowed pacing interval is 100–2,000 ms, with up to 100 recorded stimuli.

APDs use upward and downward crossings of −75 mV, not APD90. The runner detects APDs and secondary voltage rises at every integration step. Voltage traces are sampled at 1 ms or coarser to cap output at 30,000 points. Return maps pair successive **completed APDs**, which need not correspond one-to-one with stimuli. The memory plot pairs APD with the delayed rectifier X gate at upstroke. CSV export includes the run’s parameters, upstroke and repolarization times, APDs, X-gate values, and EAD counts. It exports the parameters that generated the displayed result, including when the controls have subsequently changed.

Served pages compute cardiac runs in a Web Worker. Directly opening `docs/index.html`, or a browser that cannot load the worker, uses the same numerical runner in cooperative time slices so the page remains responsive. Canceling a run preserves the previous result. This lab does not calculate a cardiac Lyapunov exponent: an irregular APD sequence alone is not proof of chaos. The deterministic single-cell equations illustrate a nonlinear mechanism; they do not model a whole heart or provide clinical predictions.

The original simulator and analysis are available at [julianlandaw.github.io/LR1CellIto](https://julianlandaw.github.io/LR1CellIto/). The memory mechanism is described in [Landaw et al. (2017)](https://doi.org/10.1103/PhysRevLett.118.138101) and [Landaw and Qu (2018)](https://doi.org/10.1103/PhysRevE.97.042414).

The expandable notes on the site provide equations, numerical details, and references. Numerical integration conserves energy approximately; chaotic trajectories eventually lose agreement with the exact trajectory.

## Files

- `docs/index.html` — layout, controls, explanations, and references.
- `docs/styles.css` — responsive styles.
- `docs/js/math.js` — pure numerical models.
- `docs/js/app.js` — canvas plots, interaction, and animation.
- `docs/js/vendor/lr1-cell.js` — original LR1CellIto numerical model, with source attribution.
- `docs/js/cardiac-simulation.js` — shared cardiac pacing protocol and measurements.
- `docs/js/cardiac-worker.js` — worker entry point for served pages.
- `docs/js/cardiac-lab.js` — cardiac controls, plots, cancellation, and CSV export.
- `tests/browser.html` — numerical and browser interaction checks.
- `tests/fixtures/lr1-reference.js` — reference measurements from the original simulator at the source commit above.

To run the checks, serve the repository and visit `http://localhost:8000/tests/browser.html`. A completed run displays a green PASS or a list of failures.
