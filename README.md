# ⚡ Browser Stress Test

> Universal, zero-dependency, cross-platform CPU & GPU stress testing and stability benchmark tool that runs entirely inside any modern web browser.

[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-brightgreen)](https://amitpadhan979.github.io/browser-stress-test/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Desktop%20%7C%20Mobile%20%7C%20Tablet-orange)](#device-compatibility)

---

## 🌟 Simple for Everyone, Powerful Under the Hood

- **1-Click Test Experience**:
  - No complex configurations required. Choose between **🟢 Gentle**, **🟡 Standard**, or **🔴 Maximum**, press **▶ START SPEED TEST**, and get results in seconds.
- **Understandable Letter Grades & Ratings**:
  - Automatically awards an easy-to-understand **Letter Grade (S, A+, A, B, C)** with human explanations of device gaming and multitasking capability.
- **Device Health & Thermal Slowdown Tracker**:
  - Plain-English status shows whether your device is running **🟢 Cool & Stable**, **🟡 Getting Warm**, or **🔴 Slowing Down (Overheating)** to protect hardware.
- **Collapsible Advanced Tools for Power Users**:
  - Manual CPU thread count sliders, duty cycles, WebGL resolution scaling, and real-time dual-axis charts are neatly organized inside an optional **Advanced Settings** drawer.
- **Heavy 3D Benchmark Models**:
  - 🍩 **FurMark Furry Donut**: Legendary GPU torture test featuring volumetric fur shelling, micro-hair noise, and anisotropic Kajiya-Kay lighting.
  - 💎 **120,000 Triangle 3D Mesh**: High-density geometric torus knot stressing GPU vertex fetch, rasterization, and PBR metallic reflections.
  - 🪐 **Volumetric Cyber Citadel**: Deep 128-step raymarching with self-shadows, ambient occlusion, and dynamic multi-light reflections.
  - 🌪️ **500,000 Particle Storm**: High-throughput vertex stream testing memory bandwidth.
- **Dedicated GPU (dGPU) Permission & Switching**:
  - Automatically identifies whether your browser is running on the power-saving Integrated GPU (iGPU) or High-Performance Dedicated GPU (dGPU).
  - Provides a 1-click **"Request dGPU"** modal to re-initialize graphics with `powerPreference: 'high-performance'` and guided steps for Windows Graphics Settings, macOS Battery options, and Chrome flags.
- **Heavy N-Body Physics & 64x64 Matrix Multi-Core CPU Engine**:
  - Simulates gravitational interactions between celestial bodies and calculates $64 \times 64$ matrix multiplications for genuine 100% CPU thermal saturation with zero memory leaks.

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
├── benchmarks/
│   └── performance-monitor.js # Telemetry sampler for FPS, heap memory, and stress metrics
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
