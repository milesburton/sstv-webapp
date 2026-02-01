# SSTV Encoder/Decoder

A web-based SSTV (Slow Scan Television) encoder and decoder built with React. Convert images to SSTV audio signals and decode SSTV transmissions directly in your browser.

## Features

### Encoding (Image → Audio)
- Drag & drop image files or use file picker
- Support for multiple SSTV modes:
  - Robot 36 (320x240)
  - Martin M1 (320x256)
  - Scottie S1 (320x256)
- Generates WAV audio files
- Play audio directly in browser or download

### Decoding (Audio → Image)
- Drag & drop audio files (WAV, MP3, OGG)
- Automatic SSTV mode detection via VIS code
- Decodes image from SSTV signal
- Download decoded images as PNG

## How It Works

**SSTV** is a picture transmission method used mainly by amateur radio operators to transmit and receive static pictures via radio. Each pixel is encoded as an audio frequency:
- 1200 Hz = Sync pulse
- 1500 Hz = Black level
- 2300 Hz = White level

## Technology

- **React** - UI framework
- **Vite** - Build tool
- **Web Audio API** - Audio generation and processing
- **Canvas API** - Image manipulation
- Pure frontend - no backend required

## Usage

### Encoding an Image
1. Click "Encode (Image → Audio)"
2. Select SSTV mode (Robot 36, Martin M1, or Scottie S1)
3. Drag & drop an image or click "Select File"
4. Wait for processing
5. Play or download the generated WAV file

### Decoding SSTV Audio
1. Click "Decode (Audio → Image)"
2. Drag & drop an SSTV audio file
3. Wait for processing (mode auto-detected from VIS code)
4. View and download the decoded image

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

This app is configured for GitHub Pages deployment:

```bash
npm run build
npm run deploy
```

## SSTV Modes

| Mode | Resolution | Scan Time | Color |
|------|-----------|-----------|-------|
| Robot 36 | 320x240 | ~36s | YUV (grayscale in current implementation) |
| Martin M1 | 320x256 | ~114s | RGB |
| Scottie S1 | 320x256 | ~110s | RGB |

## Browser Compatibility

Requires a modern browser with support for:
- Web Audio API
- Canvas API
- ES6+ JavaScript
- File API

## License

MIT

## Credits

Built with React and deployed on GitHub Pages.
