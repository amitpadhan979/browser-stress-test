/**
 * Main Application Coordinator
 * Connects UI, Hardware Telemetry, CPU Worker Pool, GPU WebGL Pipeline,
 * Presets, Thermal Degradation Detection, and Benchmark Suite.
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
    this.testDurationSeconds = 60; // 0 = infinite
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.chartInterval = null;

    // Thermal throttling tracking
    this.baselineOps = 0;
    this.baselineFps = 0;
    this.warmupSamplesCount = 0;
    this.thermalStatus = 'NOMINAL';

    // Benchmark samples
    this.scoreSamples = [];

    // UI Throttle state
    this.lastUiUpdateTime = 0;

    this.initDOM();
  }

  async init() {
    // 1. Probe Hardware
    const info = await this.deviceInfo.init();
    this.renderDeviceInfo(info);

    // 2. Initialize GPU Stress Engine
    const glCanvas = document.getElementById('gpuCanvas');
    try {
      this.gpuStress = new GPUStress(glCanvas);
      this.gpuStress.init();

      this.gpuStress.onContextLost = () => {
        this.log('GPU Context Lost! Performance throttled by OS or driver.', 'error');
        this.updateThermalBadge('GPU CONTEXT RESET', 'throttling-heavy');
      };

      this.gpuStress.onContextRestored = () => {
        this.log('GPU Context Restored successfully.', 'success');
      };

      this.log('GPU WebGL pipeline initialized successfully.', 'success');
    } catch (e) {
      this.log(`WebGL Init Error: ${e.message}`, 'error');
    }

    // 3. Initialize Chart
    const chartCanvas = document.getElementById('telemetryChart');
    this.chart = new TelemetryChart(chartCanvas);
    this.chart.resize();

    window.addEventListener('resize', () => {
      this.chart.resize();
      if (this.gpuStress) this.gpuStress.updateViewportSize();
    });

    // 4. Wire Metrics Callbacks
    this.cpuManager.onMetricsUpdate = (metrics) => this.handleCpuMetrics(metrics);
    if (this.gpuStress) {
      this.gpuStress.onMetricsUpdate = (metrics) => this.handleGpuMetrics(metrics);
    }

    // 5. Default UI Config
    this.applyPreset('balanced');
    this.updateControlsUI();
    this.log(`System ready. Detected ${info.cpuCores} cores & ${info.gpuRenderer}.`, 'info');
  }

  initDOM() {
    // Test Mode Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isRunning) return;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentMode = btn.dataset.mode;
        this.updateControlsUI();
      });
    });

    // Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isRunning) return;
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyPreset(btn.dataset.preset);
      });
    });

    // Main Control Buttons
    document.getElementById('startBtn').addEventListener('click', () => this.toggleStart());
    document.getElementById('emergencyBtn').addEventListener('click', () => this.emergencyStop());

    // Sliders & Selectors
    const threadsSlider = document.getElementById('threadsSlider');
    const threadsVal = document.getElementById('threadsVal');
    const cores = navigator.hardwareConcurrency || 4;
    threadsSlider.max = Math.max(16, cores * 2);
    threadsSlider.value = cores;
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

    const stressIntensity = document.getElementById('stressIntensity');
    if (stressIntensity) {
      stressIntensity.addEventListener('change', (e) => {
        if (this.gpuStress) this.gpuStress.setStressIntensity(e.target.value);
      });
    }

    const durationSelect = document.getElementById('durationSelect');
    durationSelect.addEventListener('change', (e) => {
      this.testDurationSeconds = parseInt(e.target.value, 10);
    });

    // Fullscreen Viewport Toggle
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    // Copy Benchmark Result Button
    const copyReportBtn = document.getElementById('copyReportBtn');
    if (copyReportBtn) {
      copyReportBtn.addEventListener('click', () => this.copyBenchmarkReport());
    }

    // Clear Logs
    document.getElementById('clearLogBtn').addEventListener('click', () => {
      document.getElementById('logContainer').innerHTML = '';
    });
  }

  applyPreset(presetName) {
    const cores = navigator.hardwareConcurrency || 4;
    const threadsSlider = document.getElementById('threadsSlider');
    const threadsVal = document.getElementById('threadsVal');
    const loadSlider = document.getElementById('loadSlider');
    const loadVal = document.getElementById('loadVal');
    const resScale = document.getElementById('resScale');
    const stressIntensity = document.getElementById('stressIntensity');

    switch (presetName) {
      case 'mobile':
        threadsSlider.value = Math.max(1, Math.floor(cores / 2));
        loadSlider.value = 60;
        resScale.value = '0.5';
        if (stressIntensity) stressIntensity.value = 'light';
        if (this.gpuStress) this.gpuStress.setStressIntensity('light');
        break;

      case 'balanced':
        threadsSlider.value = cores;
        loadSlider.value = 85;
        resScale.value = '1.0';
        if (stressIntensity) stressIntensity.value = 'balanced';
        if (this.gpuStress) this.gpuStress.setStressIntensity('balanced');
        break;

      case 'extreme':
        threadsSlider.value = cores;
        loadSlider.value = 100;
        resScale.value = '1.5';
        if (stressIntensity) stressIntensity.value = 'extreme';
        if (this.gpuStress) this.gpuStress.setStressIntensity('extreme');
        break;

      case 'ultra':
        threadsSlider.value = Math.min(32, cores * 2);
        loadSlider.value = 100;
        resScale.value = '2.0';
        if (stressIntensity) stressIntensity.value = 'extreme';
        if (this.gpuStress) this.gpuStress.setStressIntensity('extreme');
        break;
    }

    threadsVal.textContent = threadsSlider.value;
    loadVal.textContent = `${loadSlider.value}%`;
    this.cpuManager.setThreads(parseInt(threadsSlider.value, 10));
    this.cpuManager.setLoadPercentage(parseInt(loadSlider.value, 10));
    if (this.gpuStress) this.gpuStress.setResolutionScale(parseFloat(resScale.value));

    this.log(`Preset applied: [${presetName.toUpperCase()}].`, 'info');
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
    this.baselineOps = 0;
    this.baselineFps = 0;
    this.warmupSamplesCount = 0;

    document.getElementById('startBtn').textContent = '⏹ STOP STRESS TEST';
    document.getElementById('startBtn').classList.add('btn-danger');
    document.getElementById('statusBadge').textContent = `RUNNING [${this.currentMode.toUpperCase()}]`;
    document.getElementById('statusBadge').className = 'status-badge running';
    document.getElementById('benchmarkResultCard').style.display = 'none';

    this.updateThermalBadge('STABLE / CALIBRATING', 'stable');
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

    // Master 1-second interval
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.updateTimerDisplay();

      // Check auto stop
      if (this.testDurationSeconds > 0 && this.elapsedSeconds >= this.testDurationSeconds) {
        this.log(`Completed targeted duration (${this.testDurationSeconds}s).`, 'success');
        this.stop(true);
      }
    }, 1000);

    // Telemetry & Thermal sampling loop (every 500ms)
    this.chartInterval = setInterval(() => {
      const currentFps = this.gpuStress ? this.gpuStress.fps : 0;
      const currentMops = (this.cpuManager.currentOpsPerSec / 1000000);
      this.chart.addPoint(currentFps, currentMops);

      this.checkThermalThrottling(currentMops, currentFps);

      if (this.currentMode === 'benchmark') {
        this.scoreSamples.push({
          fps: currentFps,
          mops: currentMops
        });
      }
    }, 500);

    this.log(`Stress test started: [${this.currentMode.toUpperCase()}].`, 'warning');
  }

  checkThermalThrottling(currentMops, currentFps) {
    if (this.elapsedSeconds < 3) return; // Warm-up phase

    if (this.warmupSamplesCount < 6) {
      this.warmupSamplesCount++;
      if (currentMops > this.baselineOps) this.baselineOps = currentMops;
      if (currentFps > this.baselineFps) this.baselineFps = currentFps;
      return;
    }

    // Calculate performance decay compared to baseline
    let cpuDecay = 0;
    if (this.baselineOps > 0 && (this.currentMode === 'cpu' || this.currentMode === 'combined')) {
      cpuDecay = (this.baselineOps - currentMops) / this.baselineOps;
    }

    let gpuDecay = 0;
    if (this.baselineFps > 0 && (this.currentMode === 'gpu' || this.currentMode === 'combined')) {
      gpuDecay = (this.baselineFps - currentFps) / this.baselineFps;
    }

    const maxDecay = Math.max(cpuDecay, gpuDecay);

    if (maxDecay >= 0.35) {
      this.updateThermalBadge(`HEAVY THROTTLE (-${Math.round(maxDecay * 100)}%)`, 'throttling-heavy');
    } else if (maxDecay >= 0.15) {
      this.updateThermalBadge(`MILD THROTTLE (-${Math.round(maxDecay * 100)}%)`, 'throttling-mild');
    } else {
      this.updateThermalBadge('THERMAL STABLE', 'stable');
    }
  }

  updateThermalBadge(text, className) {
    const badge = document.getElementById('thermalBadge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = `thermal-badge ${className}`;
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

    if (this.currentMode === 'benchmark' && (finishedNaturally || this.scoreSamples.length >= 10)) {
      this.calculateBenchmarkScore();
    }

    this.log('Stress test halted.', 'info');
  }

  emergencyStop() {
    this.log('EMERGENCY THERMAL HALT TRIGGERED BY USER!', 'error');
    this.stop(false);
  }

  toggleFullscreen() {
    const canvasWrapper = document.querySelector('.canvas-wrapper-gpu');
    if (!canvasWrapper) return;

    if (!document.fullscreenElement) {
      canvasWrapper.requestFullscreen().catch(err => {
        console.error('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen();
    }
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
    const now = performance.now();
    if (now - this.lastUiUpdateTime < 150) return; // Smooth RAF limit
    this.lastUiUpdateTime = now;

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

    const valid = this.scoreSamples.slice(Math.min(4, this.scoreSamples.length - 1));
    const avgFps = valid.reduce((a, b) => a + b.fps, 0) / valid.length;
    const avgMops = valid.reduce((a, b) => a + b.mops, 0) / valid.length;

    const cpuScore = Math.round(avgMops * 150);
    const gpuScore = Math.round(avgFps * 85);
    const totalScore = cpuScore + gpuScore;

    document.getElementById('benchmarkResultCard').style.display = 'block';
    document.getElementById('scoreTotal').textContent = totalScore.toLocaleString();
    document.getElementById('scoreCpu').textContent = cpuScore.toLocaleString();
    document.getElementById('scoreGpu').textContent = gpuScore.toLocaleString();

    this.lastBenchmarkReport = {
      totalScore,
      cpuScore,
      gpuScore,
      avgFps: Math.round(avgFps),
      avgMops: avgMops.toFixed(2),
      cpuCores: this.deviceInfo.data.cpuCores,
      gpuRenderer: this.deviceInfo.data.gpuRenderer,
      os: this.deviceInfo.data.os
    };

    this.log(`Benchmark completed! Total Score: ${totalScore.toLocaleString()} (CPU: ${cpuScore}, GPU: ${gpuScore})`, 'success');
  }

  copyBenchmarkReport() {
    if (!this.lastBenchmarkReport) return;
    const r = this.lastBenchmarkReport;
    const text = `⚡ Browser Stress Test Benchmark Result\n` +
      `-----------------------------------------\n` +
      `🏆 Total Composite Score: ${r.totalScore.toLocaleString()}\n` +
      `⚙️ CPU Score: ${r.cpuScore.toLocaleString()} (${r.avgMops} MOps/s | ${r.cpuCores} Cores)\n` +
      `🎮 GPU Score: ${r.gpuScore.toLocaleString()} (${r.avgFps} FPS | ${r.gpuRenderer})\n` +
      `📱 OS/Platform: ${r.os}\n` +
      `🔗 Tested at: https://amitpadhan979.github.io/browser-stress-test/`;

    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyReportBtn');
      btn.textContent = '✓ COPIED TO CLIPBOARD!';
      setTimeout(() => { btn.textContent = '📋 COPY REPORT'; }, 2500);
    }).catch(err => {
      console.error('Copy failed:', err);
    });
  }

  log(message, type = 'info') {
    const container = document.getElementById('logContainer');
    if (!container) return;
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${message}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new StressApp();
  app.init();
});
