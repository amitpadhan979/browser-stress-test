/**
 * Real-time Canvas Telemetry Chart
 * High-performance, memory-safe dual-axis graph with neon glow aesthetics.
 */

export class TelemetryChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = 60;
    this.fpsData = [];
    this.cpuData = []; // Millions of Ops/sec
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.draw();
  }

  addPoint(fps, cpuMops) {
    this.fpsData.push(fps);
    this.cpuData.push(cpuMops);

    if (this.fpsData.length > this.maxPoints) this.fpsData.shift();
    if (this.cpuData.length > this.maxPoints) this.cpuData.shift();

    this.draw();
  }

  clear() {
    this.fpsData = [];
    this.cpuData = [];
    this.draw();
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 200;
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    ctx.scale(dpr, dpr);

    // Deep Dark Canvas Background
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, w, h);

    // Subtle Gridlines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridRows = 4;
    for (let i = 1; i <= gridRows; i++) {
      const y = (h / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (this.fpsData.length < 2) {
      ctx.fillStyle = '#55657e';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting live telemetry stream...', w / 2, h / 2 + 4);
      ctx.restore();
      return;
    }

    const maxFps = Math.max(100, ...this.fpsData);
    const maxCpu = Math.max(10, ...this.cpuData);

    const stepX = w / (this.maxPoints - 1);
    const startIndex = this.maxPoints - this.fpsData.length;

    // Draw FPS Gradient & Line (Cyan Glow)
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i < this.fpsData.length; i++) {
      const x = (startIndex + i) * stepX;
      const y = h - (this.fpsData[i] / maxFps) * (h - 28) - 14;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw CPU Gradient & Line (Neon Magenta/Pink)
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255, 0, 85, 0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i < this.cpuData.length; i++) {
      const x = (startIndex + i) * stepX;
      const y = h - (this.cpuData[i] / maxCpu) * (h - 28) - 14;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Labels & Legends
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`● GPU FPS (Peak: ${Math.round(maxFps)})`, 12, 18);

    ctx.fillStyle = '#ff0055';
    ctx.fillText(`● CPU MOps/s (Peak: ${maxCpu.toFixed(1)})`, 180, 18);

    ctx.restore();
  }
}
