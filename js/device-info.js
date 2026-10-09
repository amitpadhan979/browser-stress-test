/**
 * Device & Hardware Telemetry Probe
 * Detects CPU cores, GPU renderer/vendor, device memory, battery, and display specs.
 */

export class DeviceInfo {
  constructor() {
    this.data = {
      cpuCores: navigator.hardwareConcurrency || 4,
      gpuVendor: 'Detecting...',
      gpuRenderer: 'Detecting...',
      deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Not exposed by browser',
      screenResolution: `${window.screen.width * window.devicePixelRatio}x${window.screen.height * window.devicePixelRatio} (DPR: ${window.devicePixelRatio})`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
      os: this.detectOS(),
      browser: this.detectBrowser(),
      battery: {
        supported: false,
        level: 'N/A',
        charging: 'N/A'
      }
    };
  }

  async init() {
    this.detectGPU();
    await this.detectBattery();
    return this.data;
  }

  detectOS() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'Android';
    if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
    if (/Mac OS X/i.test(ua)) return 'macOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    if (/CrOS/i.test(ua)) return 'Chrome OS';
    return 'Unknown OS';
  }

  detectBrowser() {
    const ua = navigator.userAgent;
    if (/Edg\//i.test(ua)) return 'Microsoft Edge';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Google Chrome';
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Apple Safari';
    if (/Firefox\//i.test(ua)) return 'Mozilla Firefox';
    if (/OPR\//i.test(ua)) return 'Opera';
    return 'Browser';
  }

  detectGPU() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          this.data.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown Vendor';
          this.data.gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown GPU';
        } else {
          this.data.gpuVendor = gl.getParameter(gl.VENDOR) || 'Standard Vendor';
          this.data.gpuRenderer = gl.getParameter(gl.RENDERER) || 'Standard WebGL Renderer';
        }
        this.data.webglVersion = gl instanceof WebGL2RenderingContext ? 'WebGL 2.0' : 'WebGL 1.0';
      } else {
        this.data.gpuVendor = 'WebGL Unavailable';
        this.data.gpuRenderer = 'Software / Disabled';
        this.data.webglVersion = 'None';
      }
    } catch (e) {
      this.data.gpuVendor = 'Error';
      this.data.gpuRenderer = 'Unable to probe GPU';
    }
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
