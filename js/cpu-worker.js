/**
 * Dedicated Multi-threaded CPU Stress Worker
 * Calibrated against standard IEEE-754 Floating-Point Operations (FLOPs).
 * 32x32 Matrix Multiply = 65,536 FLOPs
 * 400 Transcendental Math iterations = 6,000 FLOPs
 * Standard Batch = 71,536 FLOPs
 */

let isRunning = false;
let loadPercentage = 100;
let workerId = 0;
let totalFlops = 0;
let lastReportTime = performance.now();

// Pre-allocated static buffers (Zero GC overhead)
const N = 32;
const MATRIX_SIZE = N * N;
const bufferA = new Float64Array(MATRIX_SIZE);
const bufferB = new Float64Array(MATRIX_SIZE);
const bufferC = new Float64Array(MATRIX_SIZE);

// Calibrated FLOPs constants
const MATRIX_FLOPS = 2 * N * N * N; // 65,536 FLOPs
const TRANSCENDENTAL_FLOPS = 400 * 15; // 6,000 FLOPs
const BATCH_CALIBRATED_FLOPS = MATRIX_FLOPS + TRANSCENDENTAL_FLOPS; // 71,536 FLOPs

function scheduleNextCycle(restMs) {
  if (!isRunning) return;
  if (restMs > 1) {
    setTimeout(runLoop, restMs);
  } else {
    setTimeout(runLoop, 0);
  }
}

function executeStressBatch(cryptoHashRounds) {
  let acc = 0;

  // 1. Transcendental population
  for (let i = 0; i < MATRIX_SIZE; i++) {
    bufferA[i] = Math.sin(i + totalFlops);
    bufferB[i] = Math.cos(i - totalFlops);
  }

  // 2. Matrix multiplication (65,536 FLOPs)
  for (let i = 0; i < N; i++) {
    const rowOffset = i * N;
    for (let k = 0; k < N; k++) {
      const aVal = bufferA[rowOffset + k];
      const kRowOffset = k * N;
      for (let j = 0; j < N; j++) {
        bufferC[rowOffset + j] += aVal * bufferB[kRowOffset + j];
      }
    }
  }

  // 3. Cryptographic bitwise hash mixing
  let h = (0x811c9dc5 ^ totalFlops) >>> 0;
  for (let i = 0; i < cryptoHashRounds; i++) {
    h = Math.imul(h ^ (i & 0xff), 0x01000193);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
    acc += Math.sqrt(h & 0xffff);
  }

  // 4. Transcendental operations (6,000 FLOPs)
  for (let i = 0; i < 400; i++) {
    acc += Math.tan(Math.atan(Math.sin(i * 0.05 + 0.1)));
  }

  return BATCH_CALIBRATED_FLOPS;
}

function runLoop() {
  if (!isRunning) return;

  const cycleStart = performance.now();
  const sliceBudget = 30; // 30ms non-blocking chunks
  const targetWorkTime = sliceBudget * (loadPercentage / 100);
  const targetRestTime = sliceBudget * ((100 - loadPercentage) / 100);

  let flopsInCycle = 0;
  while (isRunning && (performance.now() - cycleStart) < targetWorkTime) {
    flopsInCycle += executeStressBatch(1000);
  }

  totalFlops += flopsInCycle;

  const now = performance.now();
  if (now - lastReportTime >= 250) {
    const elapsedSec = (now - lastReportTime) / 1000;
    const gflops = (totalFlops / elapsedSec) / 1e9; // Billion FLOPs per second
    self.postMessage({
      type: 'METRICS',
      workerId,
      flops: totalFlops,
      gflops: gflops
    });
    totalFlops = 0;
    lastReportTime = now;
  }

  scheduleNextCycle(targetRestTime);
}

self.onmessage = function(e) {
  const data = e.data;
  if (!data) return;

  switch (data.type) {
    case 'START':
      workerId = data.workerId || 0;
      loadPercentage = Math.max(10, Math.min(100, data.loadPercentage || 100));
      isRunning = true;
      totalFlops = 0;
      lastReportTime = performance.now();
      scheduleNextCycle(0);
      break;

    case 'STOP':
      isRunning = false;
      totalFlops = 0;
      break;

    case 'SET_LOAD':
      loadPercentage = Math.max(10, Math.min(100, data.loadPercentage || 100));
      break;
  }
};
