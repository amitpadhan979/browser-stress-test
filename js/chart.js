/**
 * Real-time Canvas Telemetry Chart
 * Draws rolling real-time FPS and CPU compute graphs with neon styling.
 */

export class TelemetryChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = 60;
    this.fpsData = [];
    this.cpuData = []; // in Millions of Ops/sec
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 600) * dpr;
    this.canvas.height = (rect.height || 180) * dpr;
    this.ctx.scale(dpr, dpr);
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
    const w = rect.width;
    const h = rect.height;
    const ctx = this.ctx;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, w, h);

    // Gridlines
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
      ctx.fillStyle = '#4a5568';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for stress telemetry stream...', w / 2, h / 2);
      ctx.restore();
      return;
    }

    // Determine max scaling
    const maxFps = Math.max(120, ...this.fpsData);
    const maxCpu = Math.max(20, ...this.cpuData);

    const stepX = w / (this.maxPoints - 1);
    const startIndex = this.maxPoints - this.fpsData.length;

    // Draw FPS Series (Cyan)
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < this.fpsData.length; i++) {
      const x = (startIndex + i) * stepX;
      const y = h - (this.fpsData[i] / maxFps) * (h - 20) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw CPU Series (Neon Pink/Red)
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < this.cpuData.length; i++) {
      const x = (startIndex + i) * stepX;
      const y = h - (this.cpuData[i] / maxCpu) * (h - 20) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Legends & Max labels
    ctx.font = '10px monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.textAlign = 'left';
    ctx.fillText(`FPS (Scale: ${Math.round(maxFps)})`, 10, 16);

    ctx.fillStyle = '#ff0055';
    ctx.fillText(`CPU MOps/s (Scale: ${Math.round(maxCpu)})`, 130, 16);

    ctx.restore();
  }
}
