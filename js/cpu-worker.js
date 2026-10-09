/**
 * Dedicated Multi-threaded CPU Stress Worker
 * Performs heavy numerical, floating point, bitwise, and matrix operations.
 */

let isRunning = false;
let loadPercentage = 100;
let workerId = 0;
let totalOps = 0;
let lastReportTime = performance.now();

// Heavy benchmark kernel combining floating-point, integer bitwise, and matrix math
function executeStressBatch(batchSize) {
  let acc = 0;
  // Matrix / numerical stress
  const N = 32;
  const A = new Float64Array(N * N);
  const B = new Float64Array(N * N);
  const C = new Float64Array(N * N);

  for (let i = 0; i < N * N; i++) {
    A[i] = Math.sin(i + totalOps);
    B[i] = Math.cos(i - totalOps);
  }

  // Multiply matrices
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < N; k++) {
      const a = A[i * N + k];
      for (let j = 0; j < N; j++) {
        C[i * N + j] += a * B[k * N + j];
      }
    }
  }

  // Bitwise integer cryptographic hashing loop (Murmur/SHA-style mix)
  let h = 0x811c9dc5 ^ totalOps;
  for (let i = 0; i < batchSize; i++) {
    h = Math.imul(h ^ (i & 0xff), 0x01000193);
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
    acc += Math.sqrt(Math.abs(h & 0xffff));
  }

  // Transcendental transcendental stress
  for (let i = 0; i < 500; i++) {
    acc += Math.tan(Math.atan(Math.sin(i + 0.1)));
  }

  return batchSize + (N * N * N) + 500;
}

function runLoop() {
  if (!isRunning) return;

  const cycleStart = performance.now();
  const targetWorkTime = 40 * (loadPercentage / 100); // work slice
  const targetRestTime = 40 * ((100 - loadPercentage) / 100); // sleep slice for duty cycle

  let opsInCycle = 0;
  while (isRunning && (performance.now() - cycleStart) < targetWorkTime) {
    opsInCycle += executeStressBatch(1200);
  }

  totalOps += opsInCycle;

  const now = performance.now();
  if (now - lastReportTime >= 200) {
    const elapsedSec = (now - lastReportTime) / 1000;
    self.postMessage({
      type: 'METRICS',
      workerId,
      ops: totalOps,
      opsPerSec: totalOps / elapsedSec
    });
    totalOps = 0;
    lastReportTime = now;
  }

  if (!isRunning) return;

  if (targetRestTime > 1) {
    setTimeout(runLoop, targetRestTime);
  } else {
    // Zero rest time for 100% full CPU saturation
    Promise.resolve().then(runLoop);
  }
}

self.onmessage = function(e) {
  const data = e.data;
  switch (data.type) {
    case 'START':
      workerId = data.workerId || 0;
      loadPercentage = data.loadPercentage || 100;
      isRunning = true;
      totalOps = 0;
      lastReportTime = performance.now();
      runLoop();
      break;

    case 'STOP':
      isRunning = false;
      break;

    case 'SET_LOAD':
      loadPercentage = Math.max(10, Math.min(100, data.loadPercentage || 100));
      break;
  }
};
