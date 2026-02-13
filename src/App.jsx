import { useState } from 'react';
import './App.css';
import { SSTVDecoder } from './utils/SSTVDecoder';
import { SSTV_MODES, SSTVEncoder } from './utils/SSTVEncoder';

function App() {
  // Encoder state
  const [selectedMode, setSelectedMode] = useState('ROBOT36');
  const [encodeProcessing, setEncodeProcessing] = useState(false);
  const [encodeResult, setEncodeResult] = useState(null);
  const [encodeError, setEncodeError] = useState(null);
  const [encodeDragActive, setEncodeDragActive] = useState(false);
  const [encodeImagePreview, setEncodeImagePreview] = useState(null);

  // Decoder state
  const [decodeProcessing, setDecodeProcessing] = useState(false);
  const [decodeResult, setDecodeResult] = useState(null);
  const [decodeError, setDecodeError] = useState(null);
  const [decodeDragActive, setDecodeDragActive] = useState(false);

  // Encoder handlers
  const handleEncodeDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setEncodeDragActive(true);
    } else if (e.type === 'dragleave') {
      setEncodeDragActive(false);
    }
  };

  const handleEncodeDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setEncodeDragActive(false);
    const files = e.dataTransfer.files;
    if (files?.[0]) await handleEncodeFile(files[0]);
  };

  const handleEncodeFileSelect = async (e) => {
    const files = e.target.files;
    if (files?.[0]) await handleEncodeFile(files[0]);
  };

  const handleEncodeFile = async (file) => {
    setEncodeProcessing(true);
    setEncodeError(null);
    setEncodeResult(null);

    // Set preview
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setEncodeImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }

    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file (JPG, PNG, etc.)');
      }

      const encoder = new SSTVEncoder(selectedMode);
      const audioBlob = await encoder.encodeImage(file);

      setEncodeResult({
        blob: audioBlob,
        url: URL.createObjectURL(audioBlob),
        filename: `sstv_${selectedMode.toLowerCase()}_${Date.now()}.wav`,
      });
    } catch (err) {
      setEncodeError(err.message);
      console.error(err);
    } finally {
      setEncodeProcessing(false);
    }
  };

  const downloadEncode = () => {
    if (!encodeResult) return;
    const link = document.createElement('a');
    link.href = encodeResult.url;
    link.download = encodeResult.filename;
    link.click();
  };

  const resetEncode = () => {
    setEncodeResult(null);
    setEncodeError(null);
    setEncodeImagePreview(null);
  };

  // Decoder handlers
  const handleDecodeDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDecodeDragActive(true);
    } else if (e.type === 'dragleave') {
      setDecodeDragActive(false);
    }
  };

  const handleDecodeDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDecodeDragActive(false);
    const files = e.dataTransfer.files;
    if (files?.[0]) await handleDecodeFile(files[0]);
  };

  const handleDecodeFileSelect = async (e) => {
    const files = e.target.files;
    if (files?.[0]) await handleDecodeFile(files[0]);
  };

  const handleDecodeFile = async (file) => {
    setDecodeProcessing(true);
    setDecodeError(null);
    setDecodeResult(null);

    try {
      if (!file.type.startsWith('audio/')) {
        throw new Error('Please select an audio file (WAV, MP3, etc.)');
      }

      const decoder = new SSTVDecoder();
      const imageDataUrl = await decoder.decodeAudio(file);

      setDecodeResult({
        url: imageDataUrl,
        filename: `sstv_decoded_${Date.now()}.png`,
      });
    } catch (err) {
      setDecodeError(err.message);
      console.error(err);
    } finally {
      setDecodeProcessing(false);
    }
  };

  const downloadDecode = () => {
    if (!decodeResult) return;
    const link = document.createElement('a');
    link.href = decodeResult.url;
    link.download = decodeResult.filename;
    link.click();
  };

  const resetDecode = () => {
    setDecodeResult(null);
    setDecodeError(null);
  };

  return (
    <div className="app">
      <header>
        <h1>📡 SSTV Toolkit</h1>
        <p>Encode images to SSTV audio and decode SSTV transmissions</p>
      </header>

      <main className="side-by-side">
        {/* Encoder Section */}
        <div className="panel">
          <div className="panel-header">
            <h2>🖼️ Encoder</h2>
            <p>Image → SSTV Audio</p>
          </div>

          <div className="mode-options">
            <label>
              SSTV Mode:
              <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value)}>
                {Object.entries(SSTV_MODES).map(([key, mode]) => (
                  <option key={key} value={key}>
                    {mode.name} ({mode.width}×{mode.lines})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section
            className={`drop-zone ${encodeDragActive ? 'active' : ''} ${encodeProcessing ? 'processing' : ''}`}
            onDragEnter={handleEncodeDrag}
            onDragLeave={handleEncodeDrag}
            onDragOver={handleEncodeDrag}
            onDrop={handleEncodeDrop}
          >
            <input
              type="file"
              id="encode-input"
              accept="image/*"
              onChange={handleEncodeFileSelect}
              disabled={encodeProcessing}
            />
            <label htmlFor="encode-input">
              {encodeProcessing ? (
                <>
                  <div className="spinner"></div>
                  <p>Encoding...</p>
                </>
              ) : (
                <>
                  <div className="icon">🖼️</div>
                  <p>Drag & drop an image</p>
                  <p className="or">or</p>
                  <button
                    type="button"
                    className="select-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById('encode-input').click();
                    }}
                  >
                    Choose Image
                  </button>
                  <p className="hint">JPG, PNG, GIF, WebP</p>
                </>
              )}
            </label>
          </section>

          {encodeImagePreview && !encodeResult && (
            <div className="preview">
              <img src={encodeImagePreview} alt="Preview" />
            </div>
          )}

          {encodeError && <div className="error">❌ {encodeError}</div>}

          {encodeResult && (
            <div className="result">
              <h3>✅ Encoded Successfully</h3>
              <audio controls src={encodeResult.url}>
                Your browser does not support the audio element.
              </audio>
              <div className="actions">
                <button onClick={downloadEncode} className="download-btn">
                  💾 Download WAV
                </button>
                <button onClick={resetEncode} className="reset-btn">
                  🔄 Encode Another
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Decoder Section */}
        <div className="panel">
          <div className="panel-header">
            <h2>📻 Decoder</h2>
            <p>SSTV Audio → Image</p>
          </div>

          <div className="mode-options">
            <p className="auto-detect-note">🔍 Automatic mode detection via VIS code</p>
          </div>

          <section
            className={`drop-zone ${decodeDragActive ? 'active' : ''} ${decodeProcessing ? 'processing' : ''}`}
            onDragEnter={handleDecodeDrag}
            onDragLeave={handleDecodeDrag}
            onDragOver={handleDecodeDrag}
            onDrop={handleDecodeDrop}
          >
            <input
              type="file"
              id="decode-input"
              accept="audio/*"
              onChange={handleDecodeFileSelect}
              disabled={decodeProcessing}
            />
            <label htmlFor="decode-input">
              {decodeProcessing ? (
                <>
                  <div className="spinner"></div>
                  <p>Decoding...</p>
                </>
              ) : (
                <>
                  <div className="icon">🎵</div>
                  <p>Drag & drop SSTV audio</p>
                  <p className="or">or</p>
                  <button
                    type="button"
                    className="select-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById('decode-input').click();
                    }}
                  >
                    Choose Audio File
                  </button>
                  <p className="hint">WAV, MP3, OGG</p>
                </>
              )}
            </label>
          </section>

          {decodeError && <div className="error">❌ {decodeError}</div>}

          {decodeResult && (
            <div className="result">
              <h3>✅ Decoded Successfully</h3>
              <img src={decodeResult.url} alt="Decoded SSTV" />
              <div className="actions">
                <button onClick={downloadDecode} className="download-btn">
                  💾 Download PNG
                </button>
                <button onClick={resetDecode} className="reset-btn">
                  🔄 Decode Another
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="info-section">
        <h3>ℹ️ About SSTV</h3>
        <ul>
          <li>
            <strong>Encode:</strong> Convert images to audio signals for radio transmission
          </li>
          <li>
            <strong>Decode:</strong> Extract images from SSTV audio (automatic mode detection via
            VIS code)
          </li>
          <li>
            <strong>Modes:</strong> Robot 36 (fast, 36s), Martin M1 (high quality, 114s), Scottie S1
            (balanced, 110s)
          </li>
          <li>
            <strong>Privacy:</strong> All processing happens in your browser - no data sent to
            servers
          </li>
          <li>
            <strong>Use Cases:</strong> Amateur radio, emergency communications, ISS contact,
            digital archaeology
          </li>
        </ul>
      </div>

      <footer>
        <p>
          <a
            href="https://github.com/milesburton/sstv-toolkit"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
          {' • '}
          <span className="version">v1.0.1</span>
          {' • '}
          <span className="build-info">
            Build {new Date().toISOString().slice(0, 16).replace('T', ' ')}
          </span>
        </p>
      </footer>
    </div>
  );
}

export default App;
