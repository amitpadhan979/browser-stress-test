/**
 * Main Application Coordinator
 * Connects UI, Hardware Telemetry, CPU Worker Pool, GPU WebGL Pipeline, and Benchmark Suite.
 */

import { DeviceInfo } from './device-info.js';
import { CPUManager } from './cpu-manager.js';
import { GPUStress } from './gpu-stress.js';
import { TelemetryChart } from './chart.js';

class StressApp {
  constructor() {
    this.deviceInfo = new DeviceInfo();
    this.cpuManager = new CPUManager();
    this.gpuStress = null;
    this.chart = null;

    // Test state
    this.currentMode = 'combined'; // 'cpu' | 'gpu' | 'combined' | 'benchmark'
    this.isRunning = false;
    this.isPaused = false;
    this.testDurationSeconds = 60; // 0 = infinite
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.chartInterval = null;

    // Metrics snapshot for scoring
    this.scoreSamples = [];

    this.initDOM();
  }

  async init() {
    // Probe Hardware
    const info = await this.deviceInfo.init();
    this.renderDeviceInfo(info);

    // Initialize GPU Stress Engine
    const glCanvas = document.getElementById('gpuCanvas');
    try {
      this.gpuStress = new GPUStress(glCanvas);
      this.gpuStress.init();
      this.log('GPU WebGL pipeline initialized successfully.', 'success');
    } catch (e) {
      this.log(`WebGL Init Error: ${e.message}`, 'error');
    }

    // Initialize Chart
    const chartCanvas = document.getElementById('telemetryChart');
    this.chart = new TelemetryChart(chartCanvas);
    this.chart.resize();
    window.addEventListener('resize', () => {
      this.chart.resize();
      if (this.gpuStress) this.gpuStress.updateViewportSize();
    });

    // Wire Metrics Callbacks
    this.cpuManager.onMetricsUpdate = (metrics) => this.handleCpuMetrics(metrics);
    if (this.gpuStress) {
      this.gpuStress.onMetricsUpdate = (metrics) => this.handleGpuMetrics(metrics);
    }

    // Set Default UI states
    this.updateControlsUI();
    this.log(`Ready. Detected ${info.cpuCores} logical CPU cores and ${info.gpuRenderer}.`, 'info');
  }

  initDOM() {
    // Mode Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.isRunning) return;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentMode = btn.dataset.mode;
        this.updateControlsUI();
      });
    });

    // Main Control Buttons
    document.getElementById('startBtn').addEventListener('click', () => this.toggleStart());
    document.getElementById('emergencyBtn').addEventListener('click', () => this.emergencyStop());

    // Sliders & Selectors
    const threadsSlider = document.getElementById('threadsSlider');
    const threadsVal = document.getElementById('threadsVal');
    threadsSlider.max = Math.max(16, (navigator.hardwareConcurrency || 4) * 2);
    threadsSlider.value = navigator.hardwareConcurrency || 4;
    threadsVal.textContent = threadsSlider.value;

    threadsSlider.addEventListener('input', (e) => {
      threadsVal.textContent = e.target.value;
      this.cpuManager.setThreads(parseInt(e.target.value, 10));
    });

    const loadSlider = document.getElementById('loadSlider');
    const loadVal = document.getElementById('loadVal');
    loadSlider.addEventListener('input', (e) => {
      loadVal.textContent = `${e.target.value}%`;
      this.cpuManager.setLoadPercentage(parseInt(e.target.value, 10));
    });

    const resScale = document.getElementById('resScale');
    resScale.addEventListener('change', (e) => {
      if (this.gpuStress) this.gpuStress.setResolutionScale(parseFloat(e.target.value));
    });

    const shaderMode = document.getElementById('shaderMode');
    shaderMode.addEventListener('change', (e) => {
      if (this.gpuStress) this.gpuStress.setShaderMode(e.target.value);
    });

    const durationSelect = document.getElementById('durationSelect');
    durationSelect.addEventListener('change', (e) => {
      this.testDurationSeconds = parseInt(e.target.value, 10);
    });

    // Clear Logs
    document.getElementById('clearLogBtn').addEventListener('click', () => {
      document.getElementById('logContainer').innerHTML = '';
    });
  }

  renderDeviceInfo(info) {
    document.getElementById('specCpuCores').textContent = `${info.cpuCores} Cores`;
    document.getElementById('specGpuRenderer').textContent = info.gpuRenderer;
    document.getElementById('specGpuVendor').textContent = info.gpuVendor;
    document.getElementById('specPlatform').textContent = `${info.os} (${info.browser})`;
    document.getElementById('specResolution').textContent = info.screenResolution;
    document.getElementById('specMemory').textContent = info.deviceMemory;

    if (info.battery.supported) {
      document.getElementById('specBattery').textContent = `${info.battery.level} (${info.battery.charging})`;
      this.deviceInfo.onBatteryChange = (bat) => {
        document.getElementById('specBattery').textContent = `${bat.level} (${bat.charging})`;
      };
    } else {
      document.getElementById('specBattery').textContent = 'Not Available';
    }
  }

  updateControlsUI() {
    const isCpuMode = this.currentMode === 'cpu';
    const isGpuMode = this.currentMode === 'gpu';
    const isBenchmark = this.currentMode === 'benchmark';

    document.getElementById('cpuControls').style.opacity = isGpuMode ? '0.35' : '1';
    document.getElementById('gpuControls').style.opacity = isCpuMode ? '0.35' : '1';

    if (isBenchmark) {
      document.getElementById('durationSelect').value = '60';
      document.getElementById('durationSelect').disabled = true;
      this.testDurationSeconds = 60;
    } else {
      document.getElementById('durationSelect').disabled = false;
    }
  }

  toggleStart() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    this.isRunning = true;
    this.elapsedSeconds = 0;
    this.scoreSamples = [];
    document.getElementById('startBtn').textContent = '⏹ STOP STRESS TEST';
    document.getElementById('startBtn').classList.add('btn-danger');
    document.getElementById('statusBadge').textContent = `RUNNING [${this.currentMode.toUpperCase()}]`;
    document.getElementById('statusBadge').className = 'status-badge running';
    document.getElementById('benchmarkResultCard').style.display = 'none';

    this.chart.clear();

    const threads = parseInt(document.getElementById('threadsSlider').value, 10);
    this.cpuManager.setThreads(threads);
    this.cpuManager.setLoadPercentage(parseInt(document.getElementById('loadSlider').value, 10));

    // Start CPU Engine
    if (this.currentMode === 'cpu' || this.currentMode === 'combined' || this.currentMode === 'benchmark') {
      this.cpuManager.start();
      this.log(`CPU Stress launched with ${threads} threads.`, 'info');
    }

    // Start GPU Engine
    if (this.currentMode === 'gpu' || this.currentMode === 'combined' || this.currentMode === 'benchmark') {
      if (this.gpuStress) {
        this.gpuStress.setResolutionScale(parseFloat(document.getElementById('resScale').value));
        this.gpuStress.setShaderMode(document.getElementById('shaderMode').value);
        this.gpuStress.start();
        this.log('GPU Stress WebGL render loop started.', 'info');
      }
    }

    // Timer Loop
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.updateTimerDisplay();

      // Check auto stop
      if (this.testDurationSeconds > 0 && this.elapsedSeconds >= this.testDurationSeconds) {
        this.log(`Test duration (${this.testDurationSeconds}s) reached. Halting stress test.`, 'success');
        this.stop(true);
      }
    }, 1000);

    // Chart telemetry sampler (every 500ms)
    this.chartInterval = setInterval(() => {
      const currentFps = this.gpuStress ? this.gpuStress.fps : 0;
      const currentMops = (this.cpuManager.currentOpsPerSec / 1000000);
      this.chart.addPoint(currentFps, currentMops);

      if (this.currentMode === 'benchmark') {
        this.scoreSamples.push({
          fps: currentFps,
          mops: currentMops
        });
      }
    }, 500);

    this.log(`Stress test started in ${this.currentMode.toUpperCase()} mode.`, 'warning');
  }

  stop(finishedNaturally = false) {
    this.isRunning = false;
    clearInterval(this.timerInterval);
    clearInterval(this.chartInterval);

    this.cpuManager.stop();
    if (this.gpuStress) this.gpuStress.stop();

    document.getElementById('startBtn').textContent = '▶ START STRESS TEST';
    document.getElementById('startBtn').classList.remove('btn-danger');
    document.getElementById('statusBadge').textContent = 'IDLE';
    document.getElementById('statusBadge').className = 'status-badge idle';

    // Calculate score if benchmark mode finished
    if (this.currentMode === 'benchmark' && (finishedNaturally || this.scoreSamples.length >= 10)) {
      this.calculateBenchmarkScore();
    }

    this.log('Stress test stopped.', 'info');
  }

  emergencyStop() {
    this.log('EMERGENCY THERMAL HALT TRIGGERED BY USER!', 'error');
    this.stop(false);
  }

  updateTimerDisplay() {
    const elapsedEl = document.getElementById('metricElapsed');
    const remainingEl = document.getElementById('metricRemaining');

    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    elapsedEl.textContent = fmt(this.elapsedSeconds);

    if (this.testDurationSeconds > 0) {
      const rem = Math.max(0, this.testDurationSeconds - this.elapsedSeconds);
      remainingEl.textContent = fmt(rem);
    } else {
      remainingEl.textContent = '∞';
    }
  }

  handleCpuMetrics(metrics) {
    const mops = (metrics.currentOpsPerSec / 1000000).toFixed(2);
    document.getElementById('metricCpuOps').textContent = `${mops} M/s`;
    document.getElementById('metricTotalOps').textContent = (metrics.totalCalculations).toLocaleString();
  }

  handleGpuMetrics(metrics) {
    document.getElementById('metricFps').textContent = metrics.fps;
    document.getElementById('metricFrameTime').textContent = `${metrics.frameTimeMs} ms`;
    document.getElementById('metricLowFps').textContent = metrics.low1PctFps;
  }

  calculateBenchmarkScore() {
    if (this.scoreSamples.length === 0) return;

    // Discard initial warm-up samples
    const valid = this.scoreSamples.slice(Math.min(3, this.scoreSamples.length - 1));
    const avgFps = valid.reduce((a, b) => a + b.fps, 0) / valid.length;
    const avgMops = valid.reduce((a, b) => a + b.mops, 0) / valid.length;

    // Weighted composite score
    const cpuScore = Math.round(avgMops * 150);
    const gpuScore = Math.round(avgFps * 85);
    const totalScore = cpuScore + gpuScore;

    document.getElementById('benchmarkResultCard').style.display = 'block';
    document.getElementById('scoreTotal').textContent = totalScore.toLocaleString();
    document.getElementById('scoreCpu').textContent = cpuScore.toLocaleString();
    document.getElementById('scoreGpu').textContent = gpuScore.toLocaleString();

    this.log(`Benchmark completed! Total Score: ${totalScore} (CPU: ${cpuScore}, GPU: ${gpuScore})`, 'success');
  }

  log(message, type = 'info') {
    const container = document.getElementById('logContainer');
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${message}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const app = new StressApp();
  app.init();
});
