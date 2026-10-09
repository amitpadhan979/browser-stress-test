/**
 * Device & Hardware Telemetry Probe
 * Probes WebGL2 and WebGPU for multi-adapter detection (iGPU vs dGPU).
 * Classifies whether the active renderer is an Integrated or Dedicated GPU.
 */

export class DeviceInfo {
  constructor() {
    this.data = {
      cpuThreads: navigator.hardwareConcurrency || 4,
      gpuVendor: 'Detecting...',
      gpuRenderer: 'Detecting...',
      cleanGpuModel: 'Detecting...',
      cleanVendor: 'Detecting...',
      gpuType: 'Detecting...', // 'dGPU' | 'iGPU' | 'Unified SoC' | 'Software'
      isDedicated: false,
      hasDualGpus: false,
      adaptersList: [],
      displayHz: 60,
      deviceType: this.detectDeviceType(),
      deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Not exposed by browser',
      memoryNote: navigator.deviceMemory === 8 ? '(Browser privacy-capped at 8 GB max)' : '',
      screenResolution: `${window.screen.width * window.devicePixelRatio}x${window.screen.height * window.devicePixelRatio}`,
      nativeResolution: `${window.screen.width}x${window.screen.height} (DPR: ${window.devicePixelRatio})`,
      os: this.detectOS(),
      browser: this.detectBrowser(),
      webglVersion: 'Detecting...',
      battery: {
        supported: false,
        level: 'N/A',
        charging: 'N/A'
      }
    };
  }

  async init() {
    this.detectWebGL();
    await Promise.all([
      this.detectWebGPUAdapters(),
      this.detectRefreshRate(),
      this.detectBattery()
    ]);
    this.classifyGpuType();
    return this.data;
  }

  detectDeviceType() {
    const ua = navigator.userAgent;
    if (/tablet|ipad/i.test(ua)) return 'Tablet';
    if (/mobile|iphone|ipod|android/i.test(ua)) return 'Smartphone';
    if (/macintosh|mac os x/i.test(ua)) return 'Mac Laptop / Desktop';
    if (/windows/i.test(ua)) return 'Windows PC';
    if (/linux/i.test(ua)) return 'Linux Desktop / Workstation';
    return 'Computer';
  }

  detectOS() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return 'iOS (Apple)';
    if (/android/i.test(ua)) return 'Android';
    if (/Mac OS X 10[._]15|Mac OS X 1[1-9]/i.test(ua)) return 'macOS';
    if (/Windows NT 10\.0/i.test(ua)) return 'Windows 10 / 11';
    if (/Windows NT/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    if (/CrOS/i.test(ua)) return 'Chrome OS';
    return 'Operating System';
  }

  detectBrowser() {
    const ua = navigator.userAgent;
    if (/Edg\//i.test(ua)) return 'Microsoft Edge';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Google Chrome';
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Apple Safari';
    if (/Firefox\//i.test(ua)) return 'Mozilla Firefox';
    if (/OPR\//i.test(ua)) return 'Opera';
    return 'Modern Browser';
  }

  detectWebGL(powerPreference = 'high-performance') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { powerPreference }) ||
                 canvas.getContext('webgl', { powerPreference });

      if (gl) {
        this.data.webglVersion = gl instanceof WebGL2RenderingContext ? 'WebGL 2.0' : 'WebGL 1.0';

        let rawVendor = gl.getParameter(gl.VENDOR) || '';
        let rawRenderer = gl.getParameter(gl.RENDERER) || '';

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          rawVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || rawVendor;
          rawRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || rawRenderer;
        }

        this.data.gpuVendor = rawVendor;
        this.data.gpuRenderer = rawRenderer;

        // Clean up vendor
        let vendor = 'Standard GPU';
        if (/nvidia/i.test(rawVendor) || /nvidia/i.test(rawRenderer)) vendor = 'NVIDIA';
        else if (/amd|ati|radeon/i.test(rawVendor) || /amd|ati|radeon/i.test(rawRenderer)) vendor = 'AMD';
        else if (/apple/i.test(rawVendor) || /apple/i.test(rawRenderer)) vendor = 'Apple';
        else if (/intel/i.test(rawVendor) || /intel/i.test(rawRenderer)) vendor = 'Intel';
        else if (/qualcomm|adreno/i.test(rawVendor) || /qualcomm|adreno/i.test(rawRenderer)) vendor = 'Qualcomm Adreno';
        else if (/arm|mali/i.test(rawVendor) || /arm|mali/i.test(rawRenderer)) vendor = 'ARM Mali';
        else if (/google|swiftshader/i.test(rawRenderer)) vendor = 'Google SwiftShader';
        this.data.cleanVendor = vendor;

        // Clean GPU model
        let clean = rawRenderer;
        clean = clean.replace(/ANGLE \([^,]+,\s*/i, '');
        clean = clean.replace(/Direct3D[0-9]+.*|vs_[0-9]+_[0-9]+.*|OpenGL.*|\(TM\)|\(R\)/gi, '');
        clean = clean.replace(/[,\)]+$/g, '').trim();

        if (!clean || clean.length < 3) {
          clean = `${vendor} Graphics Processor`;
        }

        this.data.cleanGpuModel = clean;
      }
    } catch (e) {
      this.data.cleanGpuModel = 'Standard Graphics Processor';
    }
  }

  async detectWebGPUAdapters() {
    if (!('gpu' in navigator)) return;

    try {
      // 1. Probe High-Performance Adapter (Typically Dedicated GPU)
      const highPerfAdapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      // 2. Probe Low-Power Adapter (Typically Integrated GPU)
      const lowPowerAdapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });

      const adapters = [];

      if (highPerfAdapter) {
        let name = 'High-Performance GPU Adapter';
        if (highPerfAdapter.info) {
          name = `${highPerfAdapter.info.vendor || ''} ${highPerfAdapter.info.device || ''} ${highPerfAdapter.info.architecture || ''}`.trim() || name;
        }
        adapters.push({ type: 'dGPU', name, adapter: highPerfAdapter });
      }

      if (lowPowerAdapter && lowPowerAdapter !== highPerfAdapter) {
        let name = 'Low-Power GPU Adapter (iGPU)';
        if (lowPowerAdapter.info) {
          name = `${lowPowerAdapter.info.vendor || ''} ${lowPowerAdapter.info.device || ''}`.trim() || name;
        }
        adapters.push({ type: 'iGPU', name, adapter: lowPowerAdapter });
        this.data.hasDualGpus = true;
      }

      this.data.adaptersList = adapters;
    } catch (e) {
      // WebGPU not supported or restricted
    }
  }

  classifyGpuType() {
    const raw = `${this.data.gpuVendor} ${this.data.gpuRenderer} ${this.data.cleanGpuModel}`.toLowerCase();

    // Dedicated GPUs
    if (/geforce|rtx|gtx|quadro|titan|radeon rx|radeon pro|intel arc/i.test(raw)) {
      this.data.gpuType = 'dGPU (Dedicated High-Performance)';
      this.data.isDedicated = true;
    }
    // Apple Silicon Unified GPU
    else if (/apple m[0-9]/i.test(raw) || (/apple/i.test(raw) && !/ios/i.test(this.data.os))) {
      this.data.gpuType = 'Unified SoC GPU (Apple Silicon)';
      this.data.isDedicated = true;
    }
    // Mobile SoCs
    else if (/adreno|mali|bionic|snapdragon|dimensity|tensor/i.test(raw)) {
      this.data.gpuType = 'Mobile Integrated GPU';
      this.data.isDedicated = false;
    }
    // Intel / AMD Integrated GPUs
    else if (/intel.*(hd|uhd|iris|graphics)|amd.*radeon\(tm\)|vega|radeon graphics/i.test(raw)) {
      this.data.gpuType = 'iGPU (Integrated Power-Saving)';
      this.data.isDedicated = false;
    }
    // SwiftShader / Software emulation
    else if (/swiftshader|llvmpipe|software/i.test(raw)) {
      this.data.gpuType = 'Software Emulated GPU';
      this.data.isDedicated = false;
    }
    else {
      this.data.gpuType = this.data.cleanVendor === 'NVIDIA' || this.data.cleanVendor === 'AMD' ? 'dGPU (Dedicated)' : 'Standard GPU';
      this.data.isDedicated = this.data.gpuType.includes('dGPU');
    }
  }

  detectRefreshRate() {
    return new Promise((resolve) => {
      let frameCount = 0;
      let startTime = null;
      const samples = [];
      let lastTime = performance.now();

      const measure = (now) => {
        if (!startTime) startTime = now;
        const delta = now - lastTime;
        lastTime = now;

        if (delta > 0 && delta < 50) {
          samples.push(delta);
        }

        frameCount++;
        if (frameCount < 30) {
          requestAnimationFrame(measure);
        } else {
          if (samples.length > 5) {
            const avgDelta = samples.reduce((a, b) => a + b, 0) / samples.length;
            const hz = Math.round(1000 / avgDelta);

            if (Math.abs(hz - 60) <= 4) this.data.displayHz = 60;
            else if (Math.abs(hz - 75) <= 4) this.data.displayHz = 75;
            else if (Math.abs(hz - 90) <= 4) this.data.displayHz = 90;
            else if (Math.abs(hz - 120) <= 5) this.data.displayHz = 120;
            else if (Math.abs(hz - 144) <= 5) this.data.displayHz = 144;
            else if (Math.abs(hz - 165) <= 6) this.data.displayHz = 165;
            else if (Math.abs(hz - 240) <= 8) this.data.displayHz = 240;
            else this.data.displayHz = Math.max(30, hz);
          }
          resolve(this.data.displayHz);
        }
      };

      requestAnimationFrame(measure);
    });
  }

  async detectBattery() {
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        this.data.battery.supported = true;
        this.data.battery.level = `${Math.round(battery.level * 100)}%`;
        this.data.battery.charging = battery.charging ? 'Charging' : 'Discharging';

        battery.addEventListener('levelchange', () => {
          this.data.battery.level = `${Math.round(battery.level * 100)}%`;
          this.onBatteryChange && this.onBatteryChange(this.data.battery);
        });
        battery.addEventListener('chargingchange', () => {
          this.data.battery.charging = battery.charging ? 'Charging' : 'Discharging';
          this.onBatteryChange && this.onBatteryChange(this.data.battery);
        });
      } catch (err) {
        this.data.battery.supported = false;
      }
    }
  }
}
