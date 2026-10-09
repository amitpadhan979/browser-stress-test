/**
 * Simple, User-Friendly Stress Test Coordinator
 * Maps plain-English choices (Gentle, Standard, Maximum) into engine workloads,
 * tracks thermal health, and produces friendly letter grades (S, A+, A, B, C).
 */

import { DeviceInfo } from './device-info.js';
import { CPUManager } from './cpu-manager.js';
import { GPUStress } from './gpu-stress.js';
import { TelemetryChart } from './chart.js';

class FriendlyStressApp {
  constructor() {
    this.deviceInfo = new DeviceInfo();
    this.cpuManager = new CPUManager();
    this.gpuStress = null;
    this.chart = null;

    // Simplified user settings
    this.selectedIntensity = 'standard'; // 'gentle' | 'standard' | 'maximum'
    this.selectedDuration = 30; // seconds, 0 = continuous
    this.isRunning = false;
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.chartInterval = null;

    // Thermal & performance tracking
    this.baselineOps = 0;
    this.baselineFps = 0;
    this.warmupSamples = 0;
    this.scoreSamples = [];
    this.lastUiUpdate = 0;

    this.initDOM();
  }

  async init() {
    // 1. Probe Device
    const info = await this.deviceInfo.init();
    this.renderDeviceBanner(info);

    // 2. Initialize 3D Graphics Viewport
    const glCanvas = document.getElementById('gpuCanvas');
    try {
      this.gpuStress = new GPUStress(glCanvas);
      this.gpuStress.init();

      this.gpuStress.onContextLost = () => {
        this.updateHealthBadge('🔴 GPU Safety Reset', 'hot', 'Graphics driver paused briefly to cool off');
        this.log('GPU context briefly reset by system to prevent overheating.', 'warning');
      };

      this.gpuStress.onContextRestored = () => {
        this.log('GPU graphics pipeline restored.', 'success');
      };
    } catch (e) {
      console.warn('WebGL init notice:', e.message);
    }

    // 3. Initialize Chart in Advanced Settings
    const chartCanvas = document.getElementById('telemetryChart');
    if (chartCanvas) {
      this.chart = new TelemetryChart(chartCanvas);
      this.chart.resize();
      window.addEventListener('resize', () => {
        this.chart.resize();
        if (this.gpuStress) this.gpuStress.updateViewportSize();
      });
    }

    // 4. Connect Worker Metrics
    this.cpuManager.onMetricsUpdate = (metrics) => this.handleCpuMetrics(metrics);
    if (this.gpuStress) {
      this.gpuStress.onMetricsUpdate = (metrics) => this.handleGpuMetrics(metrics);
    }

    // 5. Apply default intensity
    this.applyIntensity('standard');
    this.log(`Device ready: ${info.cpuCores} CPU cores & ${info.gpuRenderer}`, 'info');
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
    const cleanGpu = info.gpuRenderer.replace(/ANGLE \(|Direct3D.*|OpenGL.*|\)/g, '').trim();
    summaryEl.textContent = `${info.os} • ${info.cpuCores} CPU Cores • ${cleanGpu || 'WebGL Graphics'}`;

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
    this.baselineOps = 0;
    this.baselineFps = 0;
    this.warmupSamples = 0;

    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = '⏹ STOP TEST';
    startBtn.classList.add('btn-danger');

    const statusBadge = document.getElementById('statusBadge');
    statusBadge.textContent = '⚡ Running Test...';
    statusBadge.className = 'status-pill running';

    document.getElementById('benchmarkResultCard').style.display = 'none';
    this.updateHealthBadge('🟢 Cool & Stable', 'cool', 'Performance running smoothly');

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

    // 500ms chart and health sampler
    this.chartInterval = setInterval(() => {
      const currentFps = this.gpuStress ? this.gpuStress.fps : 0;
      const currentMops = (this.cpuManager.currentOpsPerSec / 1000000);

      if (this.chart) this.chart.addPoint(currentFps, currentMops);
      this.checkThermalHealth(currentMops, currentFps);

      this.scoreSamples.push({ fps: currentFps, mops: currentMops });
    }, 500);

    this.log(`Started ${this.selectedIntensity.toUpperCase()} test.`, 'info');
  }

  checkThermalHealth(currentMops, currentFps) {
    if (this.elapsedSeconds < 3) return;

    if (this.warmupSamples < 6) {
      this.warmupSamples++;
      if (currentMops > this.baselineOps) this.baselineOps = currentMops;
      if (currentFps > this.baselineFps) this.baselineFps = currentFps;
      return;
    }

    let cpuDecay = 0;
    if (this.baselineOps > 0) {
      cpuDecay = (this.baselineOps - currentMops) / this.baselineOps;
    }

    let gpuDecay = 0;
    if (this.baselineFps > 0) {
      gpuDecay = (this.baselineFps - currentFps) / this.baselineFps;
    }

    const maxDecay = Math.max(cpuDecay, gpuDecay);

    if (maxDecay >= 0.30) {
      this.updateHealthBadge('🔴 Slowing Down (Warm)', 'hot', `Speed dropped by ${Math.round(maxDecay * 100)}% to protect hardware`);
    } else if (maxDecay >= 0.15) {
      this.updateHealthBadge('🟡 Getting Warm', 'warm', `Minor speed drop (${Math.round(maxDecay * 100)}%) as device heats up`);
    } else {
      this.updateHealthBadge('🟢 Cool & Stable', 'cool', 'Steady speed, no thermal throttling');
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

    document.getElementById('metricFpsState').textContent = 'Completed';
    document.getElementById('metricCpuState').textContent = 'Completed';

    if (finishedNaturally || this.scoreSamples.length >= 6) {
      this.calculateFriendlyGrade();
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

    const mops = (metrics.currentOpsPerSec / 1000000).toFixed(1);
    document.getElementById('metricCpuOps').textContent = mops;
    document.getElementById('metricCpuState').textContent = `${(metrics.totalCalculations).toLocaleString()} calculations done`;
  }

  handleGpuMetrics(metrics) {
    document.getElementById('metricFps').textContent = metrics.fps;
    const fpsState = document.getElementById('metricFpsState');
    if (metrics.fps >= 55) {
      fpsState.textContent = 'Super Smooth (60 FPS)';
    } else if (metrics.fps >= 30) {
      fpsState.textContent = 'Good Playable Speed';
    } else {
      fpsState.textContent = 'Reaching GPU Limit (Lagging)';
    }
  }

  calculateFriendlyGrade() {
    if (this.scoreSamples.length === 0) return;

    // Discard warm-up
    const valid = this.scoreSamples.slice(Math.min(3, this.scoreSamples.length - 1));
    const avgFps = valid.reduce((a, b) => a + b.fps, 0) / valid.length;
    const avgMops = valid.reduce((a, b) => a + b.mops, 0) / valid.length;

    const cpuScore = Math.round(avgMops * 150);
    const gpuScore = Math.round(avgFps * 85);
    const totalScore = cpuScore + gpuScore;

    // Determine Letter Grade & Friendly Description
    let grade = 'A';
    let title = 'Great Performance!';
    let desc = 'Your device handles everyday tasks, web apps, and casual games with ease.';

    if (totalScore >= 12000) {
      grade = 'S';
      title = 'Flagship Beast! 🚀';
      desc = 'Super fast hardware! Easily crushes demanding 3D games and heavy creative workloads without breaking a sweat.';
    } else if (totalScore >= 8000) {
      grade = 'A+';
      title = 'Excellent Speed & Gaming! ⚡';
      desc = 'High-performance device with great cooling. Very smooth gaming, video editing, and multitasking.';
    } else if (totalScore >= 5000) {
      grade = 'A';
      title = 'Great Everyday Speed! 👍';
      desc = 'Solid all-around capability. Handles high-definition streaming, office work, and standard games smoothly.';
    } else if (totalScore >= 2500) {
      grade = 'B';
      title = 'Good Standard Performance 👌';
      desc = 'Capable device for web browsing, videos, and light applications.';
    } else {
      grade = 'C';
      title = 'Entry-Level Device 📱';
      desc = 'Basic speed. May experience slowdown or heat when running intensive 3D games.';
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
      avgFps: Math.round(avgFps),
      avgMops: avgMops.toFixed(1),
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
      `⚙️ Processor Score: ${r.cpuScore.toLocaleString()} (${r.avgMops} Mops/s)\n` +
      `🎮 Graphics Score: ${r.gpuScore.toLocaleString()} (${r.avgFps} FPS)\n` +
      `💻 Device: ${r.device.os} • ${r.device.cpuCores} Cores\n` +
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
  const app = new FriendlyStressApp();
  app.init();
});
