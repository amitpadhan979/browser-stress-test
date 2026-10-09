/**
 * GPU Stress Test Engine
 * WebGL 2.0 / WebGL 1.0 Shader Pipeline
 * Features heavy raymarched 3D fractal and 400k+ dynamic particle storm.
 */

export class GPUStress {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.animationFrameId = null;
    this.isRunning = false;
    this.shaderMode = 'fractal'; // 'fractal' | 'particles'
    this.resolutionScale = 1.0; // 0.5, 1.0, 1.5, 2.0, 4.0

    // Performance telemetry
    this.fps = 0;
    this.frameTimeMs = 0;
    this.low1PctFps = 0;
    this.frameHistory = [];
    this.lastFrameTime = performance.now();
    this.startTime = performance.now();
    this.frameCount = 0;
    this.onMetricsUpdate = null;

    // WebGL Objects
    this.fractalProgram = null;
    this.particleProgram = null;
    this.quadBuffer = null;
    this.particleBuffer = null;
    this.numParticles = 300000;
  }

  init() {
    this.gl = this.canvas.getContext('webgl2', {
      powerPreference: 'high-performance',
      desynchronized: true,
      antialias: false
    }) || this.canvas.getContext('webgl', {
      powerPreference: 'high-performance',
      antialias: false
    });

    if (!this.gl) {
      throw new Error('WebGL is not supported in this browser environment.');
    }

    this.initBuffers();
    this.initFractalShader();
    this.initParticleShader();
    this.updateViewportSize();
  }

  setResolutionScale(scale) {
    this.resolutionScale = Math.max(0.5, Math.min(4.0, scale));
    this.updateViewportSize();
  }

  setShaderMode(mode) {
    this.shaderMode = mode;
  }

  setParticleCount(count) {
    this.numParticles = Math.max(10000, Math.min(1000000, count));
    this.initParticleBuffer();
  }

  updateViewportSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(300, Math.floor((rect.width || 800) * dpr * this.resolutionScale));
    const height = Math.max(200, Math.floor((rect.height || 500) * dpr * this.resolutionScale));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error('Shader compilation error: ' + info);
    }
    return shader;
  }

  createProgram(vsSource, fsSource) {
    const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      throw new Error('Program link error: ' + info);
    }
    return program;
  }

  initBuffers() {
    // Screen quad for raymarching
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);
    this.quadBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, quadVertices, this.gl.STATIC_DRAW);

    this.initParticleBuffer();
  }

  initParticleBuffer() {
    const particles = new Float32Array(this.numParticles * 3);
    for (let i = 0; i < this.numParticles; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = Math.pow(Math.random(), 0.5) * 4.0;
      particles[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      particles[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      particles[i * 3 + 2] = r * Math.cos(phi);
    }

    if (!this.particleBuffer) {
      this.particleBuffer = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.particleBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, particles, this.gl.STATIC_DRAW);
  }

  initFractalShader() {
    const vs = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Heavy Raymarched Mandelbulb Fractal Shader (Iterative Math)
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform vec2 u_resolution;
      uniform float u_time;

      const int MAX_STEPS = 96;
      const float SURF_DIST = 0.0015;
      const float MAX_DIST = 15.0;

      // Mandelbulb Distance Estimator
      float mandelbulbDE(vec3 pos, out float trap) {
        vec3 z = pos;
        float dr = 1.0;
        float r = 0.0;
        float power = 6.0 + 2.0 * sin(u_time * 0.25);
        trap = 1e10;

        for (int i = 0; i < 9; i++) {
          r = length(z);
          if (r > 3.0) break;
          trap = min(trap, r);

          float theta = acos(clamp(z.z / r, -1.0, 1.0));
          float phi = atan(z.y, z.x);
          dr = pow(r, power - 1.0) * power * dr + 1.0;

          float zr = pow(r, power);
          theta = theta * power;
          phi = phi * power;

          z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
          z += pos;
        }
        return 0.5 * log(r) * r / dr;
      }

      vec3 calcNormal(vec3 p) {
        float trap;
        float d = mandelbulbDE(p, trap);
        vec2 e = vec2(0.002, 0.0);
        float t1; float t2; float t3; float t4;
        vec3 n = d - vec3(
          mandelbulbDE(p - e.xyy, t1),
          mandelbulbDE(p - e.yxy, t2),
          mandelbulbDE(p - e.yyx, t3)
        );
        return normalize(n);
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

        float camDist = 2.4 + 0.3 * sin(u_time * 0.15);
        float rotX = u_time * 0.2;
        float rotY = u_time * 0.13;
        vec3 ro = vec3(camDist * cos(rotX), sin(rotY) * 1.0, camDist * sin(rotX));
        vec3 ta = vec3(0.0, 0.0, 0.0);

        vec3 ww = normalize(ta - ro);
        vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
        vec3 vv = normalize(cross(uu, ww));
        vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

        float dO = 0.0;
        float trap = 0.0;
        vec3 col = vec3(0.04, 0.06, 0.09) * (1.0 - length(uv) * 0.4);

        for (int i = 0; i < MAX_STEPS; i++) {
          vec3 p = ro + rd * dO;
          float dS = mandelbulbDE(p, trap);
          dO += dS * 0.75;
          if (dS < SURF_DIST) {
            vec3 n = calcNormal(p);
            vec3 lightDir = normalize(vec3(1.0, 2.0, -1.0));
            float diff = max(dot(n, lightDir), 0.0);
            float ao = clamp(trap * 2.5, 0.0, 1.0);
            vec3 baseCol = 0.5 + 0.5 * cos(u_time * 0.5 + trap * 4.0 + vec3(0.0, 1.8, 3.2));
            col = baseCol * (diff * 0.7 + 0.3) * ao;
            col += pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 16.0) * 0.4;
            break;
          }
          if (dO > MAX_DIST) break;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    this.fractalProgram = this.createProgram(vs, fs);
    this.uResolutionFractal = this.gl.getUniformLocation(this.fractalProgram, 'u_resolution');
    this.uTimeFractal = this.gl.getUniformLocation(this.fractalProgram, 'u_time');
    this.aPosFractal = this.gl.getAttribLocation(this.fractalProgram, 'a_position');
  }

  initParticleShader() {
    const vs = `
      attribute vec3 a_position;
      uniform mat4 u_mvp;
      uniform float u_time;
      varying vec3 v_color;

      void main() {
        vec3 pos = a_position;
        float angle = u_time * 0.8 + length(pos) * 1.2;
        float cosA = cos(angle);
        float sinA = sin(angle);
        vec3 rotPos = vec3(
          pos.x * cosA - pos.z * sinA,
          pos.y + sin(u_time * 2.0 + pos.x) * 0.4,
          pos.x * sinA + pos.z * cosA
        );

        gl_Position = u_mvp * vec4(rotPos, 1.0);
        gl_PointSize = clamp(3.0 / (gl_Position.w + 0.01), 1.0, 6.0);
        v_color = 0.5 + 0.5 * sin(vec3(0.0, 1.5, 3.0) + angle + u_time);
      }
    `;

    const fs = `
      precision highp float;
      varying vec3 v_color;

      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        if (dot(coord, coord) > 0.25) discard;
        gl_FragColor = vec4(v_color, 0.85);
      }
    `;

    this.particleProgram = this.createProgram(vs, fs);
    this.uMvpParticle = this.gl.getUniformLocation(this.particleProgram, 'u_mvp');
    this.uTimeParticle = this.gl.getUniformLocation(this.particleProgram, 'u_time');
    this.aPosParticle = this.gl.getAttribLocation(this.particleProgram, 'a_position');
  }

  getPerspectiveMatrix(fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0
    ]);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();
    this.frameHistory = [];
    this.render();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.fps = 0;
    this.frameTimeMs = 0;
    this.low1PctFps = 0;
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({
        fps: 0,
        frameTimeMs: 0,
        low1PctFps: 0
      });
    }
  }

  render() {
    if (!this.isRunning) return;

    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.frameTimeMs = delta;

    this.frameHistory.push(delta);
    if (this.frameHistory.length > 60) {
      this.frameHistory.shift();
    }

    this.frameCount++;
    if (this.frameCount % 10 === 0) {
      const avgDelta = this.frameHistory.reduce((a, b) => a + b, 0) / this.frameHistory.length;
      this.fps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 0;

      // Calculate 1% low FPS
      const sorted = [...this.frameHistory].sort((a, b) => b - a);
      const lowIndex = Math.max(0, Math.floor(sorted.length * 0.95));
      const worstDelta = sorted[lowIndex] || avgDelta;
      this.low1PctFps = worstDelta > 0 ? Math.round(1000 / worstDelta) : 0;

      if (this.onMetricsUpdate) {
        this.onMetricsUpdate({
          fps: this.fps,
          frameTimeMs: Math.round(this.frameTimeMs * 10) / 10,
          low1PctFps: this.low1PctFps
        });
      }
    }

    const gl = this.gl;
    const time = (now - this.startTime) * 0.001;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.02, 0.03, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (this.shaderMode === 'fractal') {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(this.fractalProgram);
      gl.uniform2f(this.uResolutionFractal, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uTimeFractal, time);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(this.aPosFractal);
      gl.vertexAttribPointer(this.aPosFractal, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(this.particleProgram);

      const aspect = this.canvas.width / this.canvas.height;
      const mvp = this.getPerspectiveMatrix((45 * Math.PI) / 180, aspect, 0.1, 100.0);
      mvp[14] = -8.0; // translate camera back

      gl.uniformMatrix4fv(this.uMvpParticle, false, mvp);
      gl.uniform1f(this.uTimeParticle, time);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
      gl.enableVertexAttribArray(this.aPosParticle);
      gl.vertexAttribPointer(this.aPosParticle, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, this.numParticles);
    }

    this.animationFrameId = requestAnimationFrame(() => this.render());
  }
}
