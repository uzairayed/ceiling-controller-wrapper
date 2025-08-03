# Ceiling Light Controller Web App

A modern web application for controlling ceiling lights with advanced disco mode features and color cycling support.

## 🌟 Features

- **Individual Light Control**: Toggle individual lights (0-9)
- **Bulk Operations**: Toggle all lights at once
- **Random Mode**: Randomly activate lights
- **Disco Mode**: 8 different disco patterns with color cycling
- **Color-Aware Patterns**: Takes advantage of light color states (White → Yellow → Mixed → Reset)
- **Keyboard Shortcuts**: Quick access to all features
- **Real-time Status**: Live connection and light status monitoring

## 🎨 Disco Patterns

1. **🌊 Wave**: Sequential light activation
2. **⚡ Alternating**: Even/odd light alternation
3. **🎲 Random**: Random light selection
4. **💫 Pulse**: Synchronized light pulsing
5. **🌀 Spiral**: Spiral pattern activation
6. **🌈 Color Cycle**: Advanced color state cycling
7. **🌈 Rainbow**: Systematic color progression
8. **🎨 Color Pulse**: Color-changing synchronized pulses

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- Your ceiling light controller running on a local network

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ceiling-light-controller
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your ceiling controller URL:
   ```
   CEILING_CONTROLLER_URL=http://your-controller-ip:port
   ```

4. **Start the application**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## 🎮 Usage

### Basic Controls
- **Click individual lights** to toggle them
- **Toggle All**: Turn all lights on/off
- **Random**: Randomly activate lights
- **Reset**: Turn all lights off
- **Refresh**: Update light status

### Disco Mode
1. Click the **"Disco"** button
2. Choose from 8 different patterns
3. Patterns run continuously until stopped
4. Click **"Stop Disco"** to end

### Keyboard Shortcuts
- **0-9**: Toggle individual lights
- **A**: Toggle all lights
- **R**: Reset all lights
- **X**: Random lights
- **D**: Toggle disco mode

## 🔧 Configuration

### Environment Variables
- `PORT`: Web app port (default: 3000)
- `CEILING_CONTROLLER_URL`: Your ceiling controller URL
- `NODE_ENV`: Environment (development/production)

### Light Color System
The app is designed for lights with color cycling:
- **First toggle**: White
- **Second toggle**: Yellow
- **Third toggle**: Mixed colors
- **Fourth toggle**: Resets to White

## 🛠️ Development

### Running in Development Mode
```bash
npm run dev
```

### Project Structure
```
ceiling-light-controller/
├── public/
│   ├── index.html      # Main UI
│   └── app.js          # Frontend logic
├── server.js           # Backend API
├── package.json        # Dependencies
├── .env.example        # Environment template
└── README.md          # This file
```

## 🔒 Security

- `.env` file is gitignored to protect sensitive configuration
- No hardcoded credentials or IP addresses
- Environment variables for all configuration

## 📝 License

MIT License - feel free to use and modify as needed.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

**Note**: Make sure your ceiling controller is accessible on your network and the URL in `.env` is correct. 