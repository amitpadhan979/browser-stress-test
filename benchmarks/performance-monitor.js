/**
 * Browser Stress Test - Performance Telemetry & Metrics Monitor
 * Real-time performance monitoring utility to track memory heap, FPS jitter, and stress load throughput.
 */

class PerformanceMonitor {
  constructor() {
    this.samples = [];
    this.isRunning = false;
    this.timerId = null;
    this.startTime = 0;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.fps = 60;
  }

  start(intervalMs = 1000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();
    this.samples = [];

    // Frame tracking loop
    const frameLoop = (timestamp) => {
      if (!this.isRunning) return;
      this.frameCount++;
      const delta = timestamp - this.lastFrameTime;
      if (delta >= 1000) {
        this.fps = (this.frameCount * 1000) / delta;
        this.frameCount = 0;
        this.lastFrameTime = timestamp;
      }
      requestAnimationFrame(frameLoop);
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(frameLoop);
    }

    // Metric sampling interval
    this.timerId = setInterval(() => {
      this.recordSample();
    }, intervalMs);
  }

  recordSample() {
    const elapsedSeconds = ((performance.now() - this.startTime) / 1000).toFixed(2);
    const sample = {
      timestamp: new Date().toISOString(),
      elapsedSeconds: parseFloat(elapsedSeconds),
      fps: Math.round(this.fps),
      memory: this.getMemoryUsage()
    };
    this.samples.push(sample);
    return sample;
  }

  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        usedHeapMB: (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
        totalHeapMB: (performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2),
        heapLimitMB: (performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2)
      };
    }
    return { status: 'unsupported' };
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    return this.exportSummary();
  }

  exportSummary() {
    const totalSamples = this.samples.length;
    if (totalSamples === 0) return { samples: 0, status: 'no-data' };

    const avgFps = (
      this.samples.reduce((acc, curr) => acc + curr.fps, 0) / totalSamples
    ).toFixed(1);

    return {
      durationSeconds: ((performance.now() - this.startTime) / 1000).toFixed(2),
      sampleCount: totalSamples,
      averageFps: parseFloat(avgFps),
      samples: this.samples
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceMonitor;
}
