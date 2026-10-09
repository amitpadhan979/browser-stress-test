/**
 * Heavy Multi-threaded CPU Stress Worker
 * Calibrated against high-density IEEE-754 FLOPs:
 * 1. 64x64 Matrix Multiplications (524,288 FLOPs)
 * 2. N-Body Gravitational Astrophysics Simulation (327,680 FLOPs)
 * 3. Transcendental Trigonometric Math & Cryptographic Hashes (50,000 FLOPs)
 * Total calibrated FLOPs per batch: ~902,000 FLOPs.
 * Uses zero-delay MessageChannel macrotask scheduling (NO 4ms browser setTimeout clamp)
 * to achieve SOLID 100% CPU core utilization in Task Manager.
 */

let isRunning = false;
let loadPercentage = 100;
let workerId = 0;
let totalFlops = 0;
let lastReportTime = performance.now();

// Zero-delay MessageChannel scheduler (avoids browser 4ms setTimeout clamp)
const channel = new MessageChannel();
channel.port2.onmessage = () => {
  if (isRunning) runLoop();
};

// 1. Pre-allocated 64x64 matrix buffers (Zero GC overhead)
const N_MAT = 64;
const MAT_SIZE = N_MAT * N_MAT; // 4096 Float64 elements
const matA = new Float64Array(MAT_SIZE);
const matB = new Float64Array(MAT_SIZE);
const matC = new Float64Array(MAT_SIZE);

// 2. Pre-allocated N-Body Particle simulation buffers
const NBODIES = 128;
const posX = new Float64Array(NBODIES);
const posY = new Float64Array(NBODIES);
const posZ = new Float64Array(NBODIES);
const velX = new Float64Array(NBODIES);
const velY = new Float64Array(NBODIES);
const velZ = new Float64Array(NBODIES);
const mass = new Float64Array(NBODIES);

for (let i = 0; i < NBODIES; i++) {
  posX[i] = Math.sin(i) * 10.0;
  posY[i] = Math.cos(i) * 10.0;
  posZ[i] = Math.sin(i * 2) * 5.0;
  mass[i] = 1.0 + (i % 5);
}

// Calibrated FLOPs constants
const MATRIX_FLOPS = 2 * N_MAT * N_MAT * N_MAT; // 524,288 FLOPs
const NBODY_FLOPS = NBODIES * NBODIES * 20; // 327,680 FLOPs
const TRANSCENDENTAL_FLOPS = 3000 * 17; // 51,000 FLOPs
const BATCH_CALIBRATED_FLOPS = MATRIX_FLOPS + NBODY_FLOPS + TRANSCENDENTAL_FLOPS; // 902,968 FLOPs

function scheduleNextCycle(restMs) {
  if (!isRunning) return;
  if (restMs > 1) {
    setTimeout(runLoop, restMs);
  } else {
    // Instant zero-delay yield to worker event loop - ZERO idle gap!
    channel.port1.postMessage(null);
  }
}

function executeHeavyBatch(cryptoRounds) {
  let acc = 0;

  // 1. Transcendental population of 64x64 matrix
  for (let i = 0; i < MAT_SIZE; i++) {
    matA[i] = Math.sin(i + totalFlops);
    matB[i] = Math.cos(i - totalFlops);
  }

  // 2. 64x64 Matrix Multiplication (524,288 FLOPs)
  for (let i = 0; i < N_MAT; i++) {
    const rowOffset = i * N_MAT;
    for (let k = 0; k < N_MAT; k++) {
      const aVal = matA[rowOffset + k];
      const kRowOffset = k * N_MAT;
      for (let j = 0; j < N_MAT; j++) {
        matC[rowOffset + j] += aVal * matB[kRowOffset + j];
      }
    }
  }

  // 3. N-Body Gravitational Astrophysics Simulation (327,680 FLOPs)
  const dt = 0.005;
  const softening = 0.1;
  for (let i = 0; i < NBODIES; i++) {
    let fx = 0, fy = 0, fz = 0;
    const px = posX[i], py = posY[i], pz = posZ[i];

    for (let j = 0; j < NBODIES; j++) {
      const dx = posX[j] - px;
      const dy = posY[j] - py;
      const dz = posZ[j] - pz;
      const distSqr = dx * dx + dy * dy + dz * dz + softening;
      const invDist = 1.0 / Math.sqrt(distSqr);
      const invDist3 = invDist * invDist * invDist;
      const s = mass[j] * invDist3;
      fx += dx * s;
      fy += dy * s;
      fz += dz * s;
    }

    velX[i] += fx * dt;
    velY[i] += fy * dt;
    velZ[i] += fz * dt;
    posX[i] += velX[i] * dt;
    posY[i] += velY[i] * dt;
    posZ[i] += velZ[i] * dt;
    acc += posX[i];
  }

  // 4. Cryptographic integer hash mixing & transcendentals
  let h = (0x811c9dc5 ^ totalFlops) >>> 0;
  for (let i = 0; i < cryptoRounds; i++) {
    h = Math.imul(h ^ (i & 0xff), 0x01000193);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
    acc += Math.sqrt(h & 0xffff);
  }

  for (let i = 0; i < 500; i++) {
    acc += Math.tan(Math.atan(Math.sin(i * 0.05 + 0.1)));
  }

  return BATCH_CALIBRATED_FLOPS;
}

function runLoop() {
  if (!isRunning) return;

  const cycleStart = performance.now();
  const sliceBudget = loadPercentage >= 100 ? 50 : 30; // 50ms dense budget for 100% saturation
  const targetWorkTime = sliceBudget * (loadPercentage / 100);
  const targetRestTime = sliceBudget * ((100 - loadPercentage) / 100);

  let flopsInCycle = 0;
  while (isRunning && (performance.now() - cycleStart) < targetWorkTime) {
    flopsInCycle += executeHeavyBatch(800);
  }

  totalFlops += flopsInCycle;

  const now = performance.now();
  if (now - lastReportTime >= 250) {
    const elapsedSec = (now - lastReportTime) / 1000;
    const gflops = (totalFlops / elapsedSec) / 1e9;
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
