/**
 * Real-time Canvas Telemetry Chart
 * High-precision rolling graph showing GPU Capacity (FPS) and CPU Compute (GFLOPS).
 */

export class TelemetryChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = 60;
    this.fpsData = [];
    this.gflopsData = [];
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.draw();
  }

  addPoint(fps, gflops) {
    this.fpsData.push(fps);
    this.gflopsData.push(gflops);

    if (this.fpsData.length > this.maxPoints) this.fpsData.shift();
    if (this.gflopsData.length > this.maxPoints) this.gflopsData.shift();

    this.draw();
  }

  clear() {
    this.fpsData = [];
    this.gflopsData = [];
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

    // Dark Background
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, w, h);

    // Subtle Gridlines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting real-time benchmark telemetry stream...', w / 2, h / 2 + 4);
      ctx.restore();
      return;
    }

    const maxFps = Math.max(120, ...this.fpsData);
    const maxGflops = Math.max(5, ...this.gflopsData);

    const stepX = w / (this.maxPoints - 1);
    const startIndex = this.maxPoints - this.fpsData.length;

    // Draw GPU FPS (Cyan Glow)
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < this.fpsData.length; i++) {
      const x = (startIndex + i) * stepX;
      const y = h - (this.fpsData[i] / maxFps) * (h - 28) - 14;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw CPU GFLOPS (Green Glow)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < this.gflopsData.length; i++) {
      const x = (startIndex + i) * stepX;
      const y = h - (this.gflopsData[i] / maxGflops) * (h - 28) - 14;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Legends & Max labels
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#00d2ff';
    ctx.fillText(`● GPU FPS / Capacity (Max: ${Math.round(maxFps)})`, 12, 18);

    ctx.fillStyle = '#10b981';
    ctx.fillText(`● CPU GFLOPS (Max: ${maxGflops.toFixed(1)} GFLOPS)`, 240, 18);

    ctx.restore();
  }
}
