/* Pure numerical models, shared by the lab and its browser checks. */
"use strict";
window.ChaosMath = (() => {
  const TAU = 2 * Math.PI;
  const logistic = (a, x) => a * x * (1 - x);

  function orbit(a, x0, count) {
    const values = [x0];
    for (let n = 0; n < count; n++) values.push(logistic(a, values[n]));
    return values;
  }

  function analyzeLogistic(a, x0, burn = 1000, count = 2048) {
    let x = x0;
    for (let n = 0; n < burn; n++) x = logistic(a, x);
    let sum = 0;
    const tail = [];
    for (let n = 0; n < count; n++) {
      sum += Math.log(Math.abs(a * (1 - 2 * x)));
      x = logistic(a, x);
      if (n >= count - 192) tail.push(x);
    }
    let period = 0;
    for (let p = 1; p <= 64 && !period; p++) {
      let matches = true;
      for (let j = p; j < tail.length; j++) {
        if (Math.abs(tail[j] - tail[j - p]) > 1e-7) { matches = false; break; }
      }
      if (matches) period = p;
    }
    const lyapunov = sum / count;
    const behavior = lyapunov > 0.003 ? (period ? "Unstable orbit" : "Chaotic")
      : Math.abs(lyapunov) <= 0.003 ? "Near the edge"
      : period === 1 ? "Steady state" : period ? `Period ${period}` : "Settling / complex";
    return { lyapunov, period, behavior };
  }

  // y = [theta1, omega1, theta2, omega2]; solve the 2×2 mass matrix.
  function doubleDerivative(y, p) {
    const [t1, w1, t2, w2] = y;
    const delta = t1 - t2, s = Math.sin(delta), c = Math.cos(delta);
    const A = (p.m1 + p.m2) * p.l1, B = p.m2 * p.l2 * c;
    const C = p.l1 * c, D = p.l2;
    const r1 = -p.m2 * p.l2 * w2 * w2 * s - (p.m1 + p.m2) * p.g * Math.sin(t1);
    const r2 = p.l1 * w1 * w1 * s - p.g * Math.sin(t2);
    const det = A * D - B * C;
    return [w1, (r1 * D - B * r2) / det, w2, (A * r2 - C * r1) / det];
  }

  function singleDerivative(y, p) { return [y[1], -p.g / p.l1 * Math.sin(y[0])]; }

  function rk4(y, dt, derivative, p) {
    const k1 = derivative(y, p);
    const k2 = derivative(y.map((v, i) => v + dt * k1[i] / 2), p);
    const k3 = derivative(y.map((v, i) => v + dt * k2[i] / 2), p);
    const k4 = derivative(y.map((v, i) => v + dt * k3[i]), p);
    return y.map((v, i) => v + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
  }

  function position(y, p) {
    const x1 = p.l1 * Math.sin(y[0]), y1 = p.l1 * Math.cos(y[0]);
    return { x1, y1, x2: x1 + p.l2 * Math.sin(y[2]), y2: y1 + p.l2 * Math.cos(y[2]) };
  }

  // Potential is zero when both rods hang straight down.
  function energy(y, p) {
    const [t1, w1, t2, w2] = y;
    const kinetic = 0.5 * (p.m1 + p.m2) * p.l1 ** 2 * w1 ** 2
      + 0.5 * p.m2 * p.l2 ** 2 * w2 ** 2 + p.m2 * p.l1 * p.l2 * w1 * w2 * Math.cos(t1 - t2);
    const potential = (p.m1 + p.m2) * p.g * p.l1 * (1 - Math.cos(t1))
      + p.m2 * p.g * p.l2 * (1 - Math.cos(t2));
    return kinetic + potential;
  }

  const wrapAngle = theta => ((theta + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return { logistic, orbit, analyzeLogistic, doubleDerivative, singleDerivative, rk4, position, energy, wrapAngle };
})();
