"use strict";
importScripts("vendor/lr1-cell.js", "cardiac-simulation.js");
self.onmessage = async ({ data }) => {
  if (data?.kind !== "run") return;
  try {
    const result = await CardiacSimulation.run(data.inputs, {
      cooperative: false,
      onProgress: progress => self.postMessage({ kind: "progress", id: data.id, ...progress }),
    });
    self.postMessage({ kind: "result", id: data.id, result });
  } catch (error) {
    self.postMessage({ kind: "error", id: data.id, message: error.message || "Simulation failed." });
  }
};
