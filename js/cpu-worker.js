/**
 * Dedicated Multi-threaded CPU Stress Worker
 * High-performance, zero-allocation computational kernel.
 * Pre-allocates buffers to eliminate GC pauses and memory leaks.
 * Uses macrotask scheduling to ensure message handling (STOP/SET_LOAD) is never starved.
 */

let isRunning = false;
let loadPercentage = 100;
let workerId = 0;
let totalOps = 0;
let lastReportTime = performance.now();

// Pre-allocated static buffers - ZERO GC allocations in hot loop
const N = 32;
const MATRIX_SIZE = N * N;
const bufferA = new Float64Array(MATRIX_SIZE);
const bufferB = new Float64Array(MATRIX_SIZE);
const bufferC = new Float64Array(MATRIX_SIZE);

// Macrotask scheduler: yields to the event loop so onmessage is always processed immediately
function scheduleNextCycle(restMs) {
  if (!isRunning) return;
  if (restMs > 1) {
    setTimeout(runLoop, restMs);
  } else {
    // Macrotask yield via setTimeout 0 allows browser event loop to process IPC messages
    setTimeout(runLoop, 0);
  }
}

// Heavy numerical stress kernel: Floating-point, integer bitwise, matrix multiplications & transcendentals
function executeStressBatch(batchSize) {
  let acc = 0;

  // 1. Populate pre-allocated matrices with transcendental operations
  for (let i = 0; i < MATRIX_SIZE; i++) {
    bufferA[i] = Math.sin(i + totalOps);
    bufferB[i] = Math.cos(i - totalOps);
  }

  // 2. Matrix multiplication (heavy L1/L2 cache + ALU stress)
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

  // 3. Cryptographic bitwise integer hashing loop (Murmur/SHA-style mixing)
  let h = (0x811c9dc5 ^ totalOps) >>> 0;
  for (let i = 0; i < batchSize; i++) {
    h = Math.imul(h ^ (i & 0xff), 0x01000193);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
    acc += Math.sqrt(h & 0xffff);
  }

  // 4. Heavy transcendental calculations (ALU pipeline stress)
  for (let i = 0; i < 400; i++) {
    acc += Math.tan(Math.atan(Math.sin(i * 0.05 + 0.1)));
  }

  return batchSize + (N * N * N) + 400;
}

function runLoop() {
  if (!isRunning) return;

  const cycleStart = performance.now();
  // Time slice budget in ms (30ms chunks prevent thread lockup)
  const sliceBudget = 30;
  const targetWorkTime = sliceBudget * (loadPercentage / 100);
  const targetRestTime = sliceBudget * ((100 - loadPercentage) / 100);

  let opsInCycle = 0;
  while (isRunning && (performance.now() - cycleStart) < targetWorkTime) {
    opsInCycle += executeStressBatch(1000);
  }

  totalOps += opsInCycle;

  // Report metrics back to main thread at a smooth 4Hz cadence
  const now = performance.now();
  if (now - lastReportTime >= 250) {
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
      totalOps = 0;
      lastReportTime = performance.now();
      scheduleNextCycle(0);
      break;

    case 'STOP':
      isRunning = false;
      totalOps = 0;
      break;

    case 'SET_LOAD':
      loadPercentage = Math.max(10, Math.min(100, data.loadPercentage || 100));
      break;
  }
};
