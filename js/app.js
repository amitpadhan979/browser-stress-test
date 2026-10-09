/**
 * Accurate, User-Friendly Stress Test Coordinator
 * Fixes VSync FPS capping, computes true GPU render latency & uncapped capacity,
 * measures standardized GigaFLOPS, and detects genuine thermal degradation.
 */

import { DeviceInfo } from './device-info.js';
import { CPUManager } from './cpu-manager.js';
import { GPUStress } from './gpu-stress.js';
import { TelemetryChart } from './chart.js';

class AccurateStressApp {
  constructor() {
    this.deviceInfo = new DeviceInfo();
    this.cpuManager = new CPUManager();
    this.gpuStress = null;
    this.chart = null;

    // User settings
    this.selectedIntensity = 'standard'; // 'gentle' | 'standard' | 'maximum'
    this.selectedDuration = 30; // seconds, 0 = continuous
    this.isRunning = false;
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.chartInterval = null;

    // Accurate thermal & performance tracking
    this.baselineGflops = 0;
    this.baselineLatencyMs = 999;
    this.warmupSamples = 0;
    this.scoreSamples = [];
    this.lastUiUpdate = 0;

    this.initDOM();
  }

  async init() {
    // 1. Probe Device specs with clean parsing & refresh rate
    const info = await this.deviceInfo.init();
    this.renderDeviceBanner(info);

    // 2. Initialize GPU Graphics Engine
    const glCanvas = document.getElementById('gpuCanvas');
    try {
      this.gpuStress = new GPUStress(glCanvas);
      this.gpuStress.init();

      this.gpuStress.onContextLost = () => {
        this.updateHealthBadge('🔴 GPU Safety Reset', 'hot', 'Graphics driver paused briefly to cool off');
        this.log('GPU context reset by system to prevent overheating.', 'warning');
      };

      this.gpuStress.onContextRestored = () => {
        this.log('GPU graphics pipeline restored.', 'success');
      };
    } catch (e) {
      console.warn('WebGL init notice:', e.message);
    }

    // 3. Initialize Chart
    const chartCanvas = document.getElementById('telemetryChart');
    if (chartCanvas) {
      this.chart = new TelemetryChart(chartCanvas);
      this.chart.resize();
      window.addEventListener('resize', () => {
        this.chart.resize();
        if (this.gpuStress) this.gpuStress.updateViewportSize();
      });
    }

    // 4. Wire Metrics Callbacks
    this.cpuManager.onMetricsUpdate = (metrics) => this.handleCpuMetrics(metrics);
    if (this.gpuStress) {
      this.gpuStress.onMetricsUpdate = (metrics) => this.handleGpuMetrics(metrics);
    }

    // 5. Apply default intensity
    this.applyIntensity('standard');
    this.log(`Ready: ${info.cpuThreads} CPU threads, ${info.cleanGpuModel}, ${info.displayHz}Hz display.`, 'info');
  }

  initDOM() {
    // Step 1: Intensity Buttons
    document.querySelectorAll('.intensity-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isRunning) return;
        document.querySelectorAll('.intensity-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedIntensity = btn.dataset.level;
        this.applyIntensity(this.selectedIntensity);
      });
    });

    // Step 2: Duration Buttons
    document.querySelectorAll('.duration-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isRunning) return;
        document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedDuration = parseInt(btn.dataset.duration, 10);
        this.updateTimerDisplay();
      });
    });

    // Step 3: Big Start Button
    document.getElementById('startBtn').addEventListener('click', () => this.toggleStart());

    // Fullscreen Viewport
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        const wrapper = document.querySelector('.visualizer-wrapper');
        if (!wrapper) return;
        if (!document.fullscreenElement) {
          wrapper.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen();
        }
      });
    }

    // Copy Results
    const copyReportBtn = document.getElementById('copyReportBtn');
    if (copyReportBtn) {
      copyReportBtn.addEventListener('click', () => this.copyReport());
    }

    // Advanced Sliders (Optional Manual Overrides)
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

    // Clear Logs
    const clearLogBtn = document.getElementById('clearLogBtn');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => {
        document.getElementById('logContainer').innerHTML = '';
      });
    }
  }

  renderDeviceBanner(info) {
    const summaryEl = document.getElementById('quickDeviceSummary');
    const hzStr = info.displayHz ? ` • ${info.displayHz}Hz Display` : '';
    summaryEl.textContent = `${info.os} • ${info.cpuThreads} CPU Threads • ${info.cleanGpuModel}${hzStr}`;

    if (info.battery.supported) {
      const batPill = document.getElementById('batteryPill');
      const batVal = document.getElementById('batteryVal');
      const batIcon = document.getElementById('batteryIcon');
      batPill.style.display = 'flex';
      batVal.textContent = `${info.battery.level} (${info.battery.charging})`;
      batIcon.textContent = info.battery.charging === 'Charging' ? '⚡' : '🔋';

      this.deviceInfo.onBatteryChange = (bat) => {
        batVal.textContent = `${bat.level} (${bat.charging})`;
      };
    }
  }

  applyIntensity(level) {
    const cores = navigator.hardwareConcurrency || 4;
    const threadsSlider = document.getElementById('threadsSlider');
    const threadsVal = document.getElementById('threadsVal');
    const loadSlider = document.getElementById('loadSlider');
    const loadVal = document.getElementById('loadVal');
    const resScale = document.getElementById('resScale');

    switch (level) {
      case 'gentle':
        threadsSlider.value = Math.max(1, Math.floor(cores / 2));
        loadSlider.value = 50;
        resScale.value = '0.5';
        if (this.gpuStress) {
          this.gpuStress.setStressIntensity('light');
          this.gpuStress.setResolutionScale(0.5);
        }
        break;

      case 'standard':
        threadsSlider.value = cores;
        loadSlider.value = 85;
        resScale.value = '1.0';
        if (this.gpuStress) {
          this.gpuStress.setStressIntensity('balanced');
          this.gpuStress.setResolutionScale(1.0);
        }
        break;

      case 'maximum':
        threadsSlider.value = cores;
        loadSlider.value = 100;
        resScale.value = '1.5';
        if (this.gpuStress) {
          this.gpuStress.setStressIntensity('extreme');
          this.gpuStress.setResolutionScale(1.5);
        }
        break;
    }

    threadsVal.textContent = threadsSlider.value;
    loadVal.textContent = `${loadSlider.value}%`;
    this.cpuManager.setThreads(parseInt(threadsSlider.value, 10));
    this.cpuManager.setLoadPercentage(parseInt(loadSlider.value, 10));
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
    this.baselineGflops = 0;
    this.baselineLatencyMs = 999;
    this.warmupSamples = 0;

    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = '⏹ STOP TEST';
    startBtn.classList.add('btn-danger');

    const statusBadge = document.getElementById('statusBadge');
    statusBadge.textContent = '⚡ Running Test...';
    statusBadge.className = 'status-pill running';

    document.getElementById('benchmarkResultCard').style.display = 'none';
    this.updateHealthBadge('🟢 Cool & Stable', 'cool', 'Calibrating baseline temperature...');

    if (this.chart) this.chart.clear();

    // Start Worker Compute
    this.cpuManager.start();

    // Start WebGL 3D graphics
    if (this.gpuStress) {
      this.gpuStress.start();
    }

    // 1-second master timer
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.updateTimerDisplay();

      if (this.selectedDuration > 0 && this.elapsedSeconds >= this.selectedDuration) {
        this.log(`Test completed targeted time (${this.selectedDuration}s).`, 'success');
        this.stop(true);
      }
    }, 1000);

    // 500ms chart and thermal health sampler
    this.chartInterval = setInterval(() => {
      const currentGflops = this.cpuManager.currentGflops || 0;
      const currentLatency = this.gpuStress ? this.gpuStress.renderLatencyMs : 0;
      const currentCapacityFps = this.gpuStress ? this.gpuStress.uncappedCapacityFps : 0;
      const currentDisplayFps = this.gpuStress ? this.gpuStress.displayFps : 0;

      if (this.chart) this.chart.addPoint(currentCapacityFps, currentGflops);

      this.checkThermalHealth(currentGflops, currentLatency);

      this.scoreSamples.push({
        displayFps: currentDisplayFps,
        uncappedFps: currentCapacityFps,
        renderLatencyMs: currentLatency,
        gflops: currentGflops
      });
    }, 500);

    this.log(`Started ${this.selectedIntensity.toUpperCase()} test.`, 'info');
  }

  checkThermalHealth(currentGflops, currentLatency) {
    if (this.elapsedSeconds < 3) return;

    // Warm-up phase: capture peak cold baseline
    if (this.warmupSamples < 6) {
      this.warmupSamples++;
      if (currentGflops > this.baselineGflops) this.baselineGflops = currentGflops;
      if (currentLatency > 0 && currentLatency < this.baselineLatencyMs) this.baselineLatencyMs = currentLatency;
      return;
    }

    // 1. Calculate GPU render latency degradation
    let gpuThrottledRatio = 0;
    if (this.baselineLatencyMs < 100 && currentLatency > 0) {
      // If latency increased by > 30% from cold baseline, GPU is throttling
      gpuThrottledRatio = (currentLatency - this.baselineLatencyMs) / this.baselineLatencyMs;
    }

    // 2. Calculate CPU GFLOPS drop
    let cpuDropRatio = 0;
    if (this.baselineGflops > 0) {
      cpuDropRatio = (this.baselineGflops - currentGflops) / this.baselineGflops;
    }

    const worstDrop = Math.max(gpuThrottledRatio, cpuDropRatio);

    if (worstDrop >= 0.35) {
      this.updateHealthBadge('🔴 Thermal Throttling Active', 'hot', `Performance slowed by ~${Math.round(worstDrop * 100)}% due to heat accumulation`);
    } else if (worstDrop >= 0.15) {
      this.updateHealthBadge('🟡 Device Getting Warm', 'warm', `Minor speed reduction (~${Math.round(worstDrop * 100)}%) as thermals rise`);
    } else {
      this.updateHealthBadge('🟢 Cool & Stable', 'cool', `Steady frame times (~${currentLatency.toFixed(1)} ms), no thermal drop`);
    }
  }

  updateHealthBadge(text, typeClass, detail) {
    const badge = document.getElementById('healthBadge');
    const detailEl = document.getElementById('healthDetail');
    if (badge) {
      badge.textContent = text;
      badge.className = `health-badge ${typeClass}`;
    }
    if (detailEl && detail) {
      detailEl.textContent = detail;
    }
  }

  stop(finishedNaturally = false) {
    this.isRunning = false;
    clearInterval(this.timerInterval);
    clearInterval(this.chartInterval);

    this.cpuManager.stop();
    if (this.gpuStress) this.gpuStress.stop();

    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = '▶ START SPEED TEST';
    startBtn.classList.remove('btn-danger');

    const statusBadge = document.getElementById('statusBadge');
    statusBadge.textContent = 'Test Finished';
    statusBadge.className = 'status-pill idle';

    if (finishedNaturally || this.scoreSamples.length >= 6) {
      this.calculateAccurateGrade();
    }

    this.log('Test completed and stopped.', 'info');
  }

  updateTimerDisplay() {
    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    document.getElementById('metricElapsed').textContent = fmt(this.elapsedSeconds);

    const remainingEl = document.getElementById('metricRemaining');
    if (this.selectedDuration > 0) {
      const rem = Math.max(0, this.selectedDuration - this.elapsedSeconds);
      remainingEl.textContent = fmt(rem);
    } else {
      remainingEl.textContent = 'Continuous';
    }
  }

  handleCpuMetrics(metrics) {
    const now = performance.now();
    if (now - this.lastUiUpdate < 200) return;
    this.lastUiUpdate = now;

    const gflops = metrics.currentGflops.toFixed(2);
    document.getElementById('metricCpuOps').textContent = gflops;

    const totalBillions = (metrics.totalCumulativeFlops / 1e9).toFixed(1);
    document.getElementById('metricCpuState').textContent = `${totalBillions} Billion total FLOPs calculated`;
  }

  handleGpuMetrics(metrics) {
    document.getElementById('metricFps').textContent = metrics.displayFps;
    const fpsState = document.getElementById('metricFpsState');

    if (metrics.uncappedCapacityFps > metrics.displayFps + 5) {
      fpsState.textContent = `${metrics.displayFps} FPS (VSync) • Capable of ~${metrics.uncappedCapacityFps} FPS (${metrics.renderLatencyMs} ms)`;
    } else {
      fpsState.textContent = `${metrics.displayFps} FPS (${metrics.renderLatencyMs} ms latency)`;
    }
  }

  calculateAccurateGrade() {
    if (this.scoreSamples.length === 0) return;

    // Discard initial warm-up samples
    const valid = this.scoreSamples.slice(Math.min(3, this.scoreSamples.length - 1));
    const avgUncappedFps = valid.reduce((a, b) => a + b.uncappedFps, 0) / valid.length;
    const avgDisplayFps = valid.reduce((a, b) => a + b.displayFps, 0) / valid.length;
    const avgLatency = valid.reduce((a, b) => a + b.renderLatencyMs, 0) / valid.length;
    const avgGflops = valid.reduce((a, b) => a + b.gflops, 0) / valid.length;

    // Accurate calibrated scoring:
    // CPU score based on GFLOPS (Billion Floating Point Ops per sec)
    const cpuScore = Math.round(avgGflops * 450);

    // GPU score based on uncapped render capacity and resolution scale
    const resMultiplier = (this.gpuStress ? this.gpuStress.resolutionScale : 1.0);
    const gpuScore = Math.round(avgUncappedFps * 35 * Math.pow(resMultiplier, 0.5));

    const totalScore = cpuScore + gpuScore;

    // Accurate Tiered Letter Grades
    let grade = 'A';
    let title = 'Great Performance!';
    let desc = 'Your device handles everyday tasks, web apps, and casual games with ease.';

    if (totalScore >= 12000) {
      grade = 'S';
      title = 'Flagship Beast! 🚀';
      desc = `Outstanding performance! Capable of ~${Math.round(avgUncappedFps)} FPS rendering at ${avgLatency.toFixed(1)} ms latency and ${avgGflops.toFixed(1)} GFLOPS compute. Crushes heavy 3D games with ease.`;
    } else if (totalScore >= 7500) {
      grade = 'A+';
      title = 'High-End Speed & Gaming! ⚡';
      desc = `Excellent speed with great thermal stability. Capable of ~${Math.round(avgUncappedFps)} FPS rendering (${avgLatency.toFixed(1)} ms latency) and ${avgGflops.toFixed(1)} GFLOPS compute.`;
    } else if (totalScore >= 4500) {
      grade = 'A';
      title = 'Great Everyday Performance 👍';
      desc = `Solid capability across gaming and heavy apps. Delivers steady ${Math.round(avgDisplayFps)} FPS with ${avgGflops.toFixed(1)} GFLOPS processing power.`;
    } else if (totalScore >= 2000) {
      grade = 'B';
      title = 'Good Standard Performance 👌';
      desc = `Comfortable for web browsing, video streaming, and light 3D games (${Math.round(avgDisplayFps)} FPS, ${avgGflops.toFixed(1)} GFLOPS).`;
    } else {
      grade = 'C';
      title = 'Entry-Level Device 📱';
      desc = `Basic speed (${Math.round(avgDisplayFps)} FPS). May experience thermal slowdown in heavy 3D titles.`;
    }

    const card = document.getElementById('benchmarkResultCard');
    card.style.display = 'flex';
    document.getElementById('gradeLetter').textContent = grade;
    document.getElementById('gradeTitle').textContent = title;
    document.getElementById('gradeDesc').textContent = desc;

    document.getElementById('scoreTotal').textContent = totalScore.toLocaleString();
    document.getElementById('scoreCpu').textContent = cpuScore.toLocaleString();
    document.getElementById('scoreGpu').textContent = gpuScore.toLocaleString();

    this.lastReport = {
      grade,
      title,
      totalScore,
      cpuScore,
      gpuScore,
      displayFps: Math.round(avgDisplayFps),
      uncappedFps: Math.round(avgUncappedFps),
      renderLatencyMs: avgLatency.toFixed(1),
      gflops: avgGflops.toFixed(2),
      device: this.deviceInfo.data
    };
  }

  copyReport() {
    if (!this.lastReport) return;
    const r = this.lastReport;
    const text = `⚡ Device Performance Test Result\n` +
      `-----------------------------------\n` +
      `🏆 Grade: ${r.grade} (${r.title})\n` +
      `⭐ Overall Score: ${r.totalScore.toLocaleString()}\n` +
      `⚙️ CPU Compute: ${r.cpuScore.toLocaleString()} (${r.gflops} GFLOPS • ${r.device.cpuThreads} Threads)\n` +
      `🎮 GPU Graphics: ${r.gpuScore.toLocaleString()} (~${r.uncappedFps} Uncapped FPS • ${r.renderLatencyMs} ms latency • ${r.device.cleanGpuModel})\n` +
      `🖥️ Display: ${r.device.displayHz}Hz • ${r.device.os}\n` +
      `🔗 Test yours at: https://amitpadhan979.github.io/browser-stress-test/`;

    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyReportBtn');
      btn.textContent = '✓ Copied to Clipboard!';
      setTimeout(() => { btn.textContent = '📋 Copy Results to Clipboard'; }, 2500);
    }).catch(() => {});
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
  const app = new AccurateStressApp();
  app.init();
});
