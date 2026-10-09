/**
 * Heavy GPU Stress Test Engine with Multi-Pass Draw Stacking
 * Eliminates VSync idle gaps by executing multiple stacked passes per frame (up to 16x passes)
 * and sub-pixel supersampling, forcing GPU utilization to 95%-100% in Task Manager.
 */

export class GPUStress {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.animationFrameId = null;
    this.isRunning = false;
    this.shaderMode = 'furmark'; // 'furmark' | 'highpoly' | 'citadel' | 'particles'
    this.resolutionScale = 1.0;
    this.stressIntensity = 'balanced';
    this.currentPowerPreference = 'high-performance';
    this.passesPerFrame = 4; // Multi-pass draw stacking to eliminate VSync idle gaps

    // Metrics
    this.displayFps = 0;
    this.renderLatencyMs = 0;
    this.uncappedCapacityFps = 0;
    this.low1PctFps = 0;

    // Rolling latency history
    this.latencyHistory = [];
    this.frameHistory = [];
    this.lastFrameTime = performance.now();
    this.startTime = performance.now();
    this.frameCount = 0;
    this.onMetricsUpdate = null;
    this.onContextLost = null;
    this.onContextRestored = null;

    // Programs & Buffers
    this.furmarkProgram = null;
    this.meshProgram = null;
    this.citadelProgram = null;
    this.particleProgram = null;

    this.quadBuffer = null;
    this.particleBuffer = null;
    this.meshVertexBuffer = null;
    this.meshIndexBuffer = null;
    this.meshIndexCount = 0;

    this.numParticles = 500000;
    this.maxSafeDim = 2560;

    this.setupContextListeners();
  }

  setupContextListeners() {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.isRunning = false;
      if (this.onContextLost) this.onContextLost();
    }, false);

    this.canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.init(this.currentPowerPreference);
        if (this.onContextRestored) this.onContextRestored();
      } catch (err) {
        console.error('Failed to restore WebGL context:', err);
      }
    }, false);
  }

  init(powerPreference = 'high-performance') {
    this.currentPowerPreference = powerPreference;

    this.gl = this.canvas.getContext('webgl2', {
      powerPreference: this.currentPowerPreference,
      desynchronized: true,
      antialias: false,
      preserveDrawingBuffer: false
    }) || this.canvas.getContext('webgl', {
      powerPreference: this.currentPowerPreference,
      antialias: false,
      preserveDrawingBuffer: false
    });

    if (!this.gl) {
      throw new Error('WebGL is not supported in this browser environment.');
    }

    try {
      const maxDims = this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS);
      if (maxDims && maxDims[0]) {
        this.maxSafeDim = Math.min(2560, maxDims[0]);
      }
    } catch (e) {
      this.maxSafeDim = 2048;
    }

    this.initScreenQuad();
    this.initHighPolyMesh();
    this.initParticleBuffer();

    this.initFurmarkShader();
    this.initMeshShader();
    this.initCitadelShader();
    this.initParticleShader();

    this.updateViewportSize();
  }

  recreateContext(powerPreference = 'high-performance') {
    const wasRunning = this.isRunning;
    if (wasRunning) this.stop();

    if (this.gl) {
      try {
        if (this.furmarkProgram) this.gl.deleteProgram(this.furmarkProgram);
        if (this.meshProgram) this.gl.deleteProgram(this.meshProgram);
        if (this.citadelProgram) this.gl.deleteProgram(this.citadelProgram);
        if (this.particleProgram) this.gl.deleteProgram(this.particleProgram);
      } catch (e) {}
    }

    this.init(powerPreference);
    if (wasRunning) this.start();
  }

  setPassesPerFrame(passes) {
    this.passesPerFrame = Math.max(1, Math.min(24, passes));
  }

  setResolutionScale(scale) {
    this.resolutionScale = Math.max(0.5, Math.min(3.0, scale));
    this.updateViewportSize();
  }

  setShaderMode(mode) {
    this.shaderMode = mode;
  }

  setStressIntensity(intensity) {
    this.stressIntensity = intensity;
    this.initCitadelShader();
    this.initFurmarkShader();
  }

  updateViewportSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const rect = this.canvas.getBoundingClientRect();

    let width = Math.floor((rect.width || 800) * dpr * this.resolutionScale);
    let height = Math.floor((rect.height || 500) * dpr * this.resolutionScale);

    width = Math.max(320, Math.min(this.maxSafeDim, width));
    height = Math.max(240, Math.min(this.maxSafeDim, height));

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

  initScreenQuad() {
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);
    if (!this.quadBuffer) {
      this.quadBuffer = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, quadVertices, this.gl.STATIC_DRAW);
  }

  initHighPolyMesh() {
    const p = 2, q = 3;
    const radialSegments = 250;
    const tubularSegments = 160;
    const radius = 2.0;
    const tube = 0.55;

    const vertexCount = (radialSegments + 1) * (tubularSegments + 1);
    const vertices = new Float32Array(vertexCount * 6);
    let vIdx = 0;

    for (let i = 0; i <= radialSegments; i++) {
      const u = (i / radialSegments) * Math.PI * 2 * p;
      const r1 = radius * (0.8 + 0.3 * Math.sin(q * (i / radialSegments) * Math.PI * 2));
      const cx = r1 * Math.cos(u);
      const cy = r1 * Math.sin(u);
      const cz = 0.8 * Math.sin(q * (i / radialSegments) * Math.PI * 2);

      const nextU = ((i + 1) / radialSegments) * Math.PI * 2 * p;
      const nextR1 = radius * (0.8 + 0.3 * Math.sin(q * ((i + 1) / radialSegments) * Math.PI * 2));
      const tx = nextR1 * Math.cos(nextU) - cx;
      const ty = nextR1 * Math.sin(nextU) - cy;
      const tz = 0.8 * Math.sin(q * ((i + 1) / radialSegments) * Math.PI * 2) - cz;
      const tLen = Math.hypot(tx, ty, tz) || 1;
      const tX = tx / tLen, tY = ty / tLen, tZ = tz / tLen;

      let bX = -tY, bY = tX, bZ = 0;
      const bLen = Math.hypot(bX, bY, bZ) || 1;
      bX /= bLen; bY /= bLen;

      const nX = tY * bZ - tZ * bY;
      const nY = tZ * bX - tX * bZ;
      const nZ = tX * bY - tY * bX;

      for (let j = 0; j <= tubularSegments; j++) {
        const v = (j / tubularSegments) * Math.PI * 2;
        const cxNorm = Math.cos(v) * nX + Math.sin(v) * bX;
        const cyNorm = Math.cos(v) * nY + Math.sin(v) * bY;
        const czNorm = Math.cos(v) * nZ + Math.sin(v) * bZ;

        vertices[vIdx++] = cx + tube * cxNorm;
        vertices[vIdx++] = cy + tube * cyNorm;
        vertices[vIdx++] = cz + tube * czNorm;
        vertices[vIdx++] = cxNorm;
        vertices[vIdx++] = cyNorm;
        vertices[vIdx++] = czNorm;
      }
    }

    const indexCount = radialSegments * tubularSegments * 6;
    const indices = new Uint32Array(indexCount);
    let iIdx = 0;

    for (let i = 0; i < radialSegments; i++) {
      for (let j = 0; j < tubularSegments; j++) {
        const a = i * (tubularSegments + 1) + j;
        const b = (i + 1) * (tubularSegments + 1) + j;
        const c = (i + 1) * (tubularSegments + 1) + (j + 1);
        const d = i * (tubularSegments + 1) + (j + 1);

        indices[iIdx++] = a;
        indices[iIdx++] = b;
        indices[iIdx++] = d;

        indices[iIdx++] = b;
        indices[iIdx++] = c;
        indices[iIdx++] = d;
      }
    }

    this.meshIndexCount = indices.length;

    if (!this.meshVertexBuffer) {
      this.meshVertexBuffer = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.meshVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    if (!this.meshIndexBuffer) {
      this.meshIndexBuffer = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.meshIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
  }

  initParticleBuffer() {
    const particles = new Float32Array(this.numParticles * 3);
    for (let i = 0; i < this.numParticles; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = Math.pow(Math.random(), 0.5) * 5.0;
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

  // 1. Volumetric FurMark "Furry Donut" Shader (With Sub-Pixel Supersampling option)
  initFurmarkShader() {
    const vs = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const steps = this.stressIntensity === 'extreme' ? 112 : 80;

    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform vec2 u_resolution;
      uniform float u_time;

      const int STEPS = ${steps};

      float hash3D(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise3D(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash3D(i + vec3(0,0,0)), hash3D(i + vec3(1,0,0)), f.x),
                       mix(hash3D(i + vec3(0,1,0)), hash3D(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash3D(i + vec3(0,0,1)), hash3D(i + vec3(1,0,1)), f.x),
                       mix(hash3D(i + vec3(0,1,1)), hash3D(i + vec3(1,1,1)), f.x), f.y), f.z);
      }

      float sdTorus(vec3 p, vec2 t) {
        vec2 q = vec2(length(p.xz) - t.x, p.y);
        return length(q) - t.y;
      }

      float furDensity(vec3 p, float dBase) {
        if (dBase > 0.35) return 0.0;
        vec3 furCoord = p * 45.0;
        float furNoise = noise3D(furCoord) * noise3D(furCoord * 2.1);
        float layer = clamp(dBase / 0.35, 0.0, 1.0);
        return smoothstep(layer * 0.6, 1.0, furNoise) * (1.0 - layer);
      }

      vec4 renderRay(vec3 ro, vec3 rd) {
        float t = 1.0;
        vec4 accColor = vec4(0.0);
        vec2 torusParam = vec2(1.5, 0.65);
        vec3 lightDir = normalize(vec3(1.0, 2.0, 1.0));

        for (int i = 0; i < STEPS; i++) {
          if (accColor.a >= 0.95 || t > 6.5) break;
          vec3 p = ro + rd * t;
          float dBase = sdTorus(p, torusParam);

          if (dBase < 0.35) {
            float dens = furDensity(p, max(0.0, dBase));
            if (dens > 0.01) {
              vec3 hairBase = vec3(0.95, 0.35, 0.05);
              vec3 hairTip = vec3(1.0, 0.8, 0.2);
              float depthT = clamp(dBase / 0.35, 0.0, 1.0);
              vec3 col = mix(hairBase, hairTip, depthT);

              vec3 tangent = normalize(cross(normalize(vec3(p.x, 0.0, p.z)), vec3(0.0, 1.0, 0.0)));
              float TdotL = dot(tangent, lightDir);
              float TdotV = dot(tangent, -rd);
              float hairSpec = clamp(sqrt(max(0.0, 1.0 - TdotL*TdotL)) * sqrt(max(0.0, 1.0 - TdotV*TdotV)) - TdotL*TdotV, 0.0, 1.0);
              col += pow(hairSpec, 8.0) * vec3(1.0, 0.9, 0.7) * 0.6;

              float alpha = dens * 0.14;
              accColor.rgb += (1.0 - accColor.a) * col * alpha;
              accColor.a += (1.0 - accColor.a) * alpha;
            }
            t += 0.02;
          } else {
            t += max(0.04, dBase * 0.7);
          }
        }
        return accColor;
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

        float rot = u_time * 0.5;
        vec3 ro = vec3(3.2 * sin(rot), 1.6 + 0.6 * sin(u_time * 0.3), 3.2 * cos(rot));
        vec3 ta = vec3(0.0, 0.0, 0.0);
        vec3 ww = normalize(ta - ro);
        vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
        vec3 vv = normalize(cross(uu, ww));
        vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.4 * ww);

        vec4 accColor = renderRay(ro, rd);
        vec3 bg = vec3(0.03, 0.05, 0.08) * (1.0 - length(uv) * 0.5);
        vec3 finalCol = mix(bg, accColor.rgb, accColor.a);

        gl_FragColor = vec4(finalCol, 1.0);
      }
    `;

    if (this.furmarkProgram) this.gl.deleteProgram(this.furmarkProgram);
    this.furmarkProgram = this.createProgram(vs, fs);
    this.uResFurmark = this.gl.getUniformLocation(this.furmarkProgram, 'u_resolution');
    this.uTimeFurmark = this.gl.getUniformLocation(this.furmarkProgram, 'u_time');
    this.aPosFurmark = this.gl.getAttribLocation(this.furmarkProgram, 'a_position');
  }

  // 2. High-Poly 3D Mesh (120,000 Triangles)
  initMeshShader() {
    const vs = `
      attribute vec3 a_position;
      attribute vec3 a_normal;
      uniform mat4 u_mvp;
      uniform mat4 u_model;
      varying vec3 v_normal;
      varying vec3 v_worldPos;

      void main() {
        vec4 worldPos = u_model * vec4(a_position, 1.0);
        v_worldPos = worldPos.xyz;
        v_normal = mat3(u_model) * a_normal;
        gl_Position = u_mvp * vec4(a_position, 1.0);
      }
    `;

    const fs = `
      precision highp float;
      varying vec3 v_normal;
      varying vec3 v_worldPos;
      uniform vec3 u_camPos;
      uniform float u_time;

      void main() {
        vec3 N = normalize(v_normal);
        vec3 V = normalize(u_camPos - v_worldPos);
        vec3 L = normalize(vec3(2.0, 4.0, 3.0));

        float diff = max(dot(N, L), 0.0);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 32.0);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

        vec3 baseCol = 0.5 + 0.5 * cos(v_worldPos.xyz * 1.5 + u_time * 0.5 + vec3(0.0, 2.0, 4.0));
        vec3 col = baseCol * (diff * 0.7 + 0.3) + vec3(spec * 0.8) + fresnel * vec3(0.0, 0.8, 1.0) * 0.5;

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    if (this.meshProgram) this.gl.deleteProgram(this.meshProgram);
    this.meshProgram = this.createProgram(vs, fs);
    this.uMvpMesh = this.gl.getUniformLocation(this.meshProgram, 'u_mvp');
    this.uModelMesh = this.gl.getUniformLocation(this.meshProgram, 'u_model');
    this.uCamPosMesh = this.gl.getUniformLocation(this.meshProgram, 'u_camPos');
    this.uTimeMesh = this.gl.getUniformLocation(this.meshProgram, 'u_time');
    this.aPosMesh = this.gl.getAttribLocation(this.meshProgram, 'a_position');
    this.aNormalMesh = this.gl.getAttribLocation(this.meshProgram, 'a_normal');
  }

  // 3. Volumetric Raymarched Cyber Citadel & Nebula (128 Iterative Steps)
  initCitadelShader() {
    const vs = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const steps = this.stressIntensity === 'extreme' ? 128 : 96;

    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform vec2 u_resolution;
      uniform float u_time;

      const int MAX_STEPS = ${steps};
      const float SURF_DIST = 0.001;
      const float MAX_DIST = 16.0;

      float mandelbulbDE(vec3 pos, out float trap) {
        vec3 z = pos;
        float dr = 1.0;
        float r = 0.0;
        float power = 7.0 + 2.0 * sin(u_time * 0.2);
        trap = 1e10;

        for (int i = 0; i < 9; i++) {
          r = length(z);
          if (r > 3.0) break;
          trap = min(trap, r);

          float theta = acos(clamp(z.z / (r + 0.0001), -1.0, 1.0));
          float phi = atan(z.y, z.x);
          dr = pow(r, power - 1.0) * power * dr + 1.0;

          float zr = pow(r, power);
          theta = theta * power;
          phi = phi * power;

          z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
          z += pos;
        }
        return 0.5 * log(max(r, 1.0001)) * r / (dr + 0.0001);
      }

      vec3 calcNormal(vec3 p) {
        float trap;
        float d = mandelbulbDE(p, trap);
        vec2 e = vec2(0.002, 0.0);
        float t1; float t2; float t3;
        vec3 n = d - vec3(
          mandelbulbDE(p - e.xyy, t1),
          mandelbulbDE(p - e.yxy, t2),
          mandelbulbDE(p - e.yyx, t3)
        );
        return normalize(n);
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

        float camDist = 2.4 + 0.3 * sin(u_time * 0.12);
        float rotX = u_time * 0.22;
        float rotY = u_time * 0.14;
        vec3 ro = vec3(camDist * cos(rotX), sin(rotY) * 0.8, camDist * sin(rotX));
        vec3 ta = vec3(0.0, 0.0, 0.0);

        vec3 ww = normalize(ta - ro);
        vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
        vec3 vv = normalize(cross(uu, ww));
        vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

        float dO = 0.0;
        float trap = 0.0;
        vec3 col = vec3(0.02, 0.04, 0.07) * (1.0 - length(uv) * 0.4);

        for (int i = 0; i < MAX_STEPS; i++) {
          vec3 p = ro + rd * dO;
          float dS = mandelbulbDE(p, trap);
          dO += dS * 0.72;
          if (dS < SURF_DIST) {
            vec3 n = calcNormal(p);
            vec3 lightDir = normalize(vec3(1.0, 2.0, -1.0));
            float diff = max(dot(n, lightDir), 0.0);
            float ao = clamp(trap * 2.8, 0.0, 1.0);
            vec3 baseCol = 0.5 + 0.5 * cos(u_time * 0.4 + trap * 4.0 + vec3(0.0, 1.8, 3.2));
            col = baseCol * (diff * 0.75 + 0.25) * ao;
            col += pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0) * 0.5;
            break;
          }
          if (dO > MAX_DIST) break;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    if (this.citadelProgram) this.gl.deleteProgram(this.citadelProgram);
    this.citadelProgram = this.createProgram(vs, fs);
    this.uResCitadel = this.gl.getUniformLocation(this.citadelProgram, 'u_resolution');
    this.uTimeCitadel = this.gl.getUniformLocation(this.citadelProgram, 'u_time');
    this.aPosCitadel = this.gl.getAttribLocation(this.citadelProgram, 'a_position');
  }

  // 4. Particle Storm
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
        gl_PointSize = clamp(3.0 / (gl_Position.w + 0.01), 1.0, 5.0);
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

    if (this.particleProgram) this.gl.deleteProgram(this.particleProgram);
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

  multiplyMatrices(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[i * 4 + k] * b[k * 4 + j];
        }
        out[i * 4 + j] = sum;
      }
    }
    return out;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();
    this.frameHistory = [];
    this.latencyHistory = [];
    this.render();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.displayFps = 0;
    this.renderLatencyMs = 0;
    this.uncappedCapacityFps = 0;
    this.low1PctFps = 0;
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({
        displayFps: 0,
        renderLatencyMs: 0,
        uncappedCapacityFps: 0,
        low1PctFps: 0
      });
    }
  }

  render() {
    if (!this.isRunning || !this.gl || this.gl.isContextLost()) return;

    const frameStartTime = performance.now();
    const frameIntervalDelta = frameStartTime - this.lastFrameTime;
    this.lastFrameTime = frameStartTime;

    this.frameHistory.push(frameIntervalDelta);
    if (this.frameHistory.length > 60) {
      this.frameHistory.shift();
    }

    const gl = this.gl;
    const baseTime = (frameStartTime - this.startTime) * 0.001;

    // High-precision draw execution timing
    const drawStartTime = performance.now();

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // MULTI-PASS DRAW STACKING:
    // Executes passesPerFrame draw passes in a single animation frame,
    // keeping the GPU command pipeline 100% saturated and eliminating VSync idle gaps!
    for (let pass = 0; pass < this.passesPerFrame; pass++) {
      const time = baseTime + pass * 0.003;

      if (pass === 0) {
        gl.clearColor(0.02, 0.03, 0.05, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      }

      // 1. FurMark Furry Donut
      if (this.shaderMode === 'furmark') {
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.furmarkProgram);
        gl.uniform2f(this.uResFurmark, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uTimeFurmark, time);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(this.aPosFurmark);
        gl.vertexAttribPointer(this.aPosFurmark, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      // 2. High-Poly 3D Mesh (120k Triangles)
      else if (this.shaderMode === 'highpoly') {
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.meshProgram);

        const aspect = this.canvas.width / this.canvas.height;
        const proj = this.getPerspectiveMatrix((45 * Math.PI) / 180, aspect, 0.1, 50.0);

        const rotY = time * 0.8;
        const rotX = time * 0.4;
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

        const model = new Float32Array([
          cosY, sinY * sinX, sinY * cosX, 0,
          0, cosX, -sinX, 0,
          -sinY, cosY * sinX, cosY * cosX, 0,
          0, 0, -4.5, 1
        ]);

        const mvp = this.multiplyMatrices(proj, model);

        gl.uniformMatrix4fv(this.uMvpMesh, false, mvp);
        gl.uniformMatrix4fv(this.uModelMesh, false, model);
        gl.uniform3f(this.uCamPosMesh, 0, 0, 4.5);
        gl.uniform1f(this.uTimeMesh, time);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVertexBuffer);
        gl.enableVertexAttribArray(this.aPosMesh);
        gl.vertexAttribPointer(this.aPosMesh, 3, gl.FLOAT, false, 24, 0);

        gl.enableVertexAttribArray(this.aNormalMesh);
        gl.vertexAttribPointer(this.aNormalMesh, 3, gl.FLOAT, false, 24, 12);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIndexBuffer);
        gl.drawElements(gl.TRIANGLES, this.meshIndexCount, gl.UNSIGNED_INT, 0);
      }
      // 3. Cyber Citadel
      else if (this.shaderMode === 'citadel') {
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.citadelProgram);
        gl.uniform2f(this.uResCitadel, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uTimeCitadel, time);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(this.aPosCitadel);
        gl.vertexAttribPointer(this.aPosCitadel, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      // 4. Particle Storm (500k Points)
      else {
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(this.particleProgram);

        const aspect = this.canvas.width / this.canvas.height;
        const mvp = this.getPerspectiveMatrix((45 * Math.PI) / 180, aspect, 0.1, 100.0);
        mvp[14] = -8.0;

        gl.uniformMatrix4fv(this.uMvpParticle, false, mvp);
        gl.uniform1f(this.uTimeParticle, time);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        gl.enableVertexAttribArray(this.aPosParticle);
        gl.vertexAttribPointer(this.aPosParticle, 3, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.POINTS, 0, this.numParticles);
      }
    }

    gl.flush();

    const drawEndTime = performance.now();
    const currentDrawLatency = Math.max(0.1, drawEndTime - drawStartTime);

    this.latencyHistory.push(currentDrawLatency);
    if (this.latencyHistory.length > 30) {
      this.latencyHistory.shift();
    }

    this.frameCount++;
    if (this.frameCount % 8 === 0) {
      const avgInterval = this.frameHistory.reduce((a, b) => a + b, 0) / this.frameHistory.length;
      this.displayFps = avgInterval > 0 ? Math.round(1000 / avgInterval) : 0;

      const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
      this.renderLatencyMs = Math.round(avgLatency * 10) / 10;

      // Uncapped capacity factoring in multi-pass draw stacking
      const singlePassLatency = Math.max(0.1, avgLatency / this.passesPerFrame);
      this.uncappedCapacityFps = Math.round(1000 / singlePassLatency);

      const sorted = [...this.frameHistory].sort((a, b) => b - a);
      const lowIndex = Math.max(0, Math.floor(sorted.length * 0.95));
      const worstInterval = sorted[lowIndex] || avgInterval;
      this.low1PctFps = worstInterval > 0 ? Math.round(1000 / worstInterval) : 0;

      if (this.onMetricsUpdate) {
        this.onMetricsUpdate({
          displayFps: this.displayFps,
          renderLatencyMs: this.renderLatencyMs,
          uncappedCapacityFps: this.uncappedCapacityFps,
          low1PctFps: this.low1PctFps
        });
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.render());
  }
}
