/**
 * CPU Stress Test Manager
 * Manages worker thread pool with SMT/Hyperthread overdrive for 100% Task Manager saturation.
 */

export class CPUManager {
  constructor() {
    this.workers = [];
    this.baseThreads = navigator.hardwareConcurrency || 4;
    this.numThreads = this.baseThreads;
    this.loadPercentage = 100;
    this.isOverdrive = false;
    this.isRunning = false;
    this.totalCumulativeFlops = 0;
    this.currentGflops = 0;
    this.workerGflopsMap = new Map();
    this.onMetricsUpdate = null;
    this.workerScriptUrl = 'js/cpu-worker.js';
  }

  setThreads(threads) {
    this.numThreads = Math.max(1, Math.min(64, threads));
    if (this.isRunning) {
      this.restart();
    }
  }

  setOverdrive(enabled) {
    this.isOverdrive = enabled;
    if (enabled) {
      // Scale to 1.5x concurrency (max 32) to saturate physical cores + SMT hyperthreads
      this.numThreads = Math.min(32, Math.max(this.baseThreads, Math.round(this.baseThreads * 1.5)));
    } else {
      this.numThreads = this.baseThreads;
    }
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
    this.totalCumulativeFlops = 0;
    this.currentGflops = 0;
    this.workerGflopsMap.clear();

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
          console.error(`CPU Worker ${workerId} error:`, err);
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
    this.totalCumulativeFlops += data.flops;
    this.workerGflopsMap.set(data.workerId, data.gflops);

    let sumGflops = 0;
    for (const gflops of this.workerGflopsMap.values()) {
      sumGflops += gflops;
    }
    this.currentGflops = Math.round(sumGflops * 100) / 100;

    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({
        currentGflops: this.currentGflops,
        totalCumulativeFlops: this.totalCumulativeFlops,
        activeThreads: this.workers.length
      });
    }
  }

  stop() {
    this.isRunning = false;
    this.workers.forEach(w => {
      try {
        w.postMessage({ type: 'STOP' });
        w.terminate();
      } catch (e) {}
    });
    this.workers = [];
    this.currentGflops = 0;
    this.workerGflopsMap.clear();

    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({
        currentGflops: 0,
        totalCumulativeFlops: this.totalCumulativeFlops,
        activeThreads: 0
      });
    }
  }

  restart() {
    this.stop();
    this.start();
  }
}
