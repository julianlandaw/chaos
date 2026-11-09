# Chaos Lab

An interactive, dependency-free playground for nonlinear dynamics and chaos theory.

Open [`docs/index.html`](docs/index.html) directly in a modern browser, or serve the repository:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/docs/`. Everything runs locally, including the plots. No installation, build step, or internet connection is required. For GitHub Pages, publish the `docs/` directory from the `main` branch.

## Experiments

- **Logistic map:** adjustable growth rate and starting population; clickable bifurcation diagram; time series and cobweb plots; nearby initial conditions; orbit animation, single steps, cycle detection, and a finite-time Lyapunov estimate.
- **Pendulums:** single and double pendulums; a nearby double pendulum; motion trails and phase portraits; adjustable initial angles, lengths, gravity, and playback speed; an energy-drift diagnostic.

Both labs include presets and downloadable PNG plots. The page supports small screens, keyboard-operated tabs and controls, and reduced-motion preferences. Animations start on request and pause when switching experiments or leaving the browser tab.

## Models

The logistic map uses `x[n+1] = a*x[n]*(1-x[n])` for `0 ≤ a ≤ 4`. The bifurcation plot discards 700 iterations before plotting 160 points per parameter. The Lyapunov estimate uses 2,048 iterations after 1,000 transients. Cycle detection searches for periods up to 64 with a tolerance of `1e-7`; finite samples cannot prove chaos.

The pendulums have point masses, massless rigid rods, no damping, and no driving. The coupled equations are solved with fixed-step RK4 (`dt = 1/240 s`). The single pendulum uses the full sine equation rather than a small-angle approximation. Its length and initial angle match the double pendulum’s upper arm. All initial angular velocities are zero. The nearby double pendulum differs by `0.01°` in the lower angle. Phase portraits show a two-dimensional projection of the double pendulum’s four-dimensional state.

The expandable notes on the site provide equations, numerical details, and references. Numerical integration conserves energy approximately; chaotic trajectories eventually lose agreement with the exact trajectory.

## Files

- `docs/index.html` — layout, controls, explanations, and references.
- `docs/styles.css` — responsive styles.
- `docs/js/math.js` — pure numerical models.
- `docs/js/app.js` — canvas plots, interaction, and animation.
- `tests/browser.html` — numerical and browser interaction checks.

To run the checks, serve the repository and visit `http://localhost:8000/tests/browser.html`. A completed run displays a green PASS or a list of failures.
