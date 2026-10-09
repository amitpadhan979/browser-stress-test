# ⚡ Browser Stress Test

> Universal, zero-dependency, cross-platform CPU & GPU stress testing and stability benchmark tool that runs entirely inside any modern web browser.

[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-brightgreen)](https://amitpadhan979.github.io/browser-stress-test/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Desktop%20%7C%20Mobile%20%7C%20Tablet-orange)](#device-compatibility)

---

## 🌟 Key Features

- **Multi-Threaded CPU Stress Engine**:
  - Leverages browser **Web Workers** scaled to your system's hardware concurrency (`navigator.hardwareConcurrency`).
  - Combines matrix multiplications, heavy 64-bit transcendental floating-point arithmetic (`Math.sin`, `Math.cos`, `Math.tan`, `Math.atan`), and cryptographic hashing rounds.
  - Adjustable worker thread count (1 to 32+ threads) and configurable core duty cycle (20% to 100%).
  - Tracks operations per second (MOps/s) and cumulative calculation count in real-time.

- **GPU Stress Engine (WebGL 2.0 / WebGL Fallback)**:
  - **Volumetric 3D Mandelbulb Fractal**: Computes raymarched sphere tracing with up to 96 iterative steps per pixel, dynamic trigonometric folds, ambient occlusion, and Blinn-Phong specular lighting to heavily tax fragment shader ALUs.
  - **FurMark-Style Particle Vortex**: Simulates 300,000–500,000 instanced dynamic 3D particles swirling in real-time, stressing vertex pipelines and rasterizer fill rates.
  - **Resolution Scaling**: Supports 0.5x (mobile/power-saver), 1.0x (native display), 1.5x, 2.0x, and 4.0x (extreme 4K/8K supersampling) to challenge flagship desktop GPUs.
  - Real-time framerate tracking: Current FPS, Frame Time (ms), and **1% Low FPS** to detect frame drops and thermal stuttering.

- **Combined Thermal & Power Throttling Mode**:
  - Saturates both CPU and GPU concurrently to test device cooling efficiency, fan curves, and battery drain rates under extreme load.

- **Standardized Benchmark Mode (60s)**:
  - Runs a calibrated 60-second test across CPU and GPU pipelines to produce an aggregate **Performance Score** for cross-device comparisons.

- **Live Hardware Telemetry**:
  - Real-time detection of CPU logical cores, unmasked GPU vendor and renderer (`WEBGL_debug_renderer_info`), screen resolution & device pixel ratio, estimated device memory, and battery charging state / level (`navigator.getBattery()`).

- **Safety & Thermal Controls**:
  - Instant **Thermal Halt** emergency abort button.
  - Configurable auto-stop timers (30s, 1m, 5m, 15m, or continuous).

---

## 📱 Device Compatibility

| Device Class | Tested Platforms | Support Status |
| :--- | :--- | :--- |
| **Desktop / Laptop** | Windows 10/11, macOS, Linux, ChromeOS | ✅ Full Support (Multi-core + WebGL2) |
| **Smartphones** | Android (Chrome, Firefox), iOS (Safari, Chrome) | ✅ Full Support (Touch UI, Auto-scaling) |
| **Tablets / iPads** | iPadOS (Safari), Android Tablets | ✅ Full Support |
| **Browsers** | Chrome, Edge, Safari, Firefox, Brave, Opera | ✅ Full Support |

---

## 🚀 Live Demo & Usage

Visit the live version hosted on GitHub Pages:
👉 **[https://amitpadhan979.github.io/browser-stress-test/](https://amitpadhan979.github.io/browser-stress-test/)**

### Running Locally

Since this project has zero build steps and uses native ES modules and Web Workers:

```bash
# Clone the repository
git clone https://github.com/amitpadhan979/browser-stress-test.git
cd browser-stress-test

# Start a local static HTTP server (required for Web Workers)
python3 -m http.server 8080

# Open in browser
# http://localhost:8080
```

---

## 📂 Project Structure

```
browser-stress-test/
├── index.html              # Main responsive dashboard interface
├── css/
│   └── styles.css          # Cyberpunk dark-mode telemetry styles
├── js/
│   ├── app.js              # Coordinator and benchmark logic
│   ├── device-info.js      # Hardware detection and telemetry
│   ├── cpu-manager.js      # Worker pool coordinator
│   ├── cpu-worker.js       # Multi-threaded mathematical stress worker
│   ├── gpu-stress.js       # WebGL 3D raymarched fractal and particle shaders
│   └── chart.js            # Real-time canvas telemetry line graph
├── .github/
│   └── workflows/
│       └── deploy.yml      # Automated GitHub Pages deployment
├── LICENSE                 # MIT License
└── README.md               # Documentation
```

---

## ⚠️ Thermal & Safety Disclaimer

This tool is designed to push your device's hardware to maximum operational capacity. While modern hardware has built-in thermal protection mechanisms (thermal throttling and automatic shutdown), prolonged stress testing may cause elevated temperatures and rapid battery consumption. Use responsibly.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
