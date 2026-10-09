/**
 * CPU Stress Test Manager
 * Manages the worker thread pool, aggregates calculation metrics, and throttles load.
 */

export class CPUManager {
  constructor() {
    this.workers = [];
    this.numThreads = navigator.hardwareConcurrency || 4;
    this.loadPercentage = 100;
    this.isRunning = false;
    this.totalCalculations = 0;
    this.currentOpsPerSec = 0;
    this.workerOpsMap = new Map();
    this.onMetricsUpdate = null;
    this.workerScriptUrl = 'js/cpu-worker.js';
  }

  setThreads(threads) {
    this.numThreads = Math.max(1, Math.min(64, threads));
    if (this.isRunning) {
      this.restart();
    }
  }

  setLoadPercentage(pct) {
    this.loadPercentage = Math.max(10, Math.min(100, pct));
    this.workers.forEach(w => {
      w.postMessage({ type: 'SET_LOAD', loadPercentage: this.loadPercentage });
    });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.totalCalculations = 0;
    this.currentOpsPerSec = 0;
    this.workerOpsMap.clear();

    for (let i = 0; i < this.numThreads; i++) {
      try {
        const worker = new Worker(this.workerScriptUrl);
        const workerId = i + 1;

        worker.onmessage = (e) => {
          if (e.data && e.data.type === 'METRICS') {
            this.handleWorkerMetrics(e.data);
          }
        };

        worker.onerror = (err) => {
          console.error(`Worker ${workerId} error:`, err);
        };

        worker.postMessage({
          type: 'START',
          workerId: workerId,
          loadPercentage: this.loadPercentage
        });

        this.workers.push(worker);
      } catch (err) {
        console.error('Failed to instantiate Web Worker:', err);
      }
    }
  }

  handleWorkerMetrics(data) {
    if (!this.isRunning) return;
    this.totalCalculations += data.ops;
    this.workerOpsMap.set(data.workerId, data.opsPerSec);

    // Sum ops per second across active workers
    let sumOps = 0;
    for (const ops of this.workerOpsMap.values()) {
      sumOps += ops;
    }
    this.currentOpsPerSec = sumOps;

    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({
        currentOpsPerSec: this.currentOpsPerSec,
        totalCalculations: this.totalCalculations,
        activeThreads: this.workers.length
      });
    }
  }

  stop() {
    this.isRunning = false;
    this.workers.forEach(w => {
      w.postMessage({ type: 'STOP' });
      w.terminate();
    });
    this.workers = [];
    this.currentOpsPerSec = 0;
    this.workerOpsMap.clear();

    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({
        currentOpsPerSec: 0,
        totalCalculations: this.totalCalculations,
        activeThreads: 0
      });
    }
  }

  restart() {
    this.stop();
    this.start();
  }
}
