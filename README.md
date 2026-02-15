# SSTV Toolkit

Web-based SSTV encoder/decoder. Converts images to SSTV audio and decodes SSTV transmissions in-browser.

**Live App:** https://milesburton.github.io/sstv-toolkit/

## Features

- Encode images to SSTV audio (WAV)
- Decode SSTV audio to images (PNG)
- Supports Robot 36, Martin M1, Scottie S1
- Automatic VIS code detection
- Client-side only - no server required

## Usage

### Encode
1. Select SSTV mode
2. Upload image
3. Download WAV file

### Decode
1. Upload SSTV audio (WAV/MP3/OGG)
2. Mode auto-detected from VIS code
3. Download decoded PNG

## SSTV Modes

| Mode | Resolution | Time | Color |
|------|-----------|------|-------|
| Robot 36 | 320x240 | 36s | YUV |
| Martin M1 | 320x256 | 114s | RGB |
| Scottie S1 | 320x256 | 110s | RGB |

## Development

```bash
npm install
npm run dev        # Development server
npm test          # Run tests (requires Node 20+)
npm run build     # Production build
```

## Requirements

- Modern browser with Web Audio API and Canvas API support
- Node.js 20+ for development/testing

## License

MIT
