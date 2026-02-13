import { useState } from 'react';
import './App.css';
import { SSTVEncoder, SSTV_MODES } from './utils/SSTVEncoder';
import { SSTVDecoder } from './utils/SSTVDecoder';
import ExampleSelector from './components/ExampleSelector';

function App() {
  const [mode, setMode] = useState('encode');
  const [selectedMode, setSelectedMode] = useState('ROBOT36');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files?.[0]) {
      await processFile(files[0]);
    }
  };

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (files?.[0]) {
      await processFile(files[0]);
    }
  };

  const processFile = async (file) => {
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      if (mode === 'encode') {
        // Check if it's an image
        if (!file.type.startsWith('image/')) {
          throw new Error('Please select an image file (JPG, PNG, etc.)');
        }

        const encoder = new SSTVEncoder(selectedMode);
        const audioBlob = await encoder.encodeImage(file);

        setResult({
          type: 'audio',
          blob: audioBlob,
          url: URL.createObjectURL(audioBlob),
          filename: `sstv_${selectedMode.toLowerCase()}_${Date.now()}.wav`
        });
      } else {
        // Decode mode
        if (!file.type.startsWith('audio/')) {
          throw new Error('Please select an audio file (WAV, MP3, etc.)');
        }

        const decoder = new SSTVDecoder();
        const imageDataUrl = await decoder.decodeAudio(file);

        setResult({
          type: 'image',
          url: imageDataUrl,
          filename: `sstv_decoded_${Date.now()}.png`
        });
      }
    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;

    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.filename;
    link.click();
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="app">
      <header>
        <h1>SSTV Encoder/Decoder</h1>
        <p>Convert images to SSTV audio signals and decode SSTV transmissions</p>
      </header>

      <div className="mode-selector">
        <button
          type="button"
          className={mode === 'encode' ? 'active' : ''}
          onClick={() => { setMode('encode'); reset(); }}
        >
          Encode (Image → Audio)
        </button>
        <button
          type="button"
          className={mode === 'decode' ? 'active' : ''}
          onClick={() => { setMode('decode'); reset(); }}
        >
          Decode (Audio → Image)
        </button>
      </div>

      {mode === 'encode' && (
        <div className="mode-options">
          <label>
            SSTV Mode:
            <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value)}>
              {Object.entries(SSTV_MODES).map(([key, mode]) => (
                <option key={key} value={key}>
                  {mode.name} ({mode.width}x{mode.lines})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <section
        aria-label="File drop zone"
        className={`drop-zone ${dragActive ? 'active' : ''} ${processing ? 'processing' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-input"
          accept={mode === 'encode' ? 'image/*' : 'audio/*'}
          onChange={handleFileSelect}
          disabled={processing}
        />
        <label htmlFor="file-input">
          {processing ? (
            <>
              <div className="spinner"></div>
              <p>Processing...</p>
            </>
          ) : (
            <>
              <div className="icon">
                {mode === 'encode' ? '🖼️' : '🎵'}
              </div>
              <p>
                Drag & drop {mode === 'encode' ? 'an image' : 'an audio file'} here
              </p>
              <p className="or">or</p>
              <button
                type="button"
                className="select-btn"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('file-input').click();
                }}
              >
                Select File
              </button>
              <p className="hint">
                {mode === 'encode'
                  ? 'Supported: JPG, PNG, GIF, WebP'
                  : 'Supported: WAV, MP3, OGG'}
              </p>
            </>
          )}
        </label>
      </section>

      {!processing && !result && (
        <ExampleSelector mode={mode} onSelectExample={processFile} />
      )}

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="result">
          <h2>Result</h2>

          {result.type === 'audio' ? (
            <div className="audio-result">
              <audio controls src={result.url} aria-label="SSTV audio output">
                Your browser does not support the audio element.
              </audio>
              <p>Duration: ~{Math.round((result.blob.size / 88200) * 10) / 10}s</p>
            </div>
          ) : (
            <div className="image-result">
              <img src={result.url} alt="Decoded SSTV" />
            </div>
          )}

          <div className="actions">
            <button type="button" onClick={downloadResult} className="download-btn">
              Download {result.type === 'audio' ? 'WAV' : 'PNG'}
            </button>
            <button type="button" onClick={reset} className="reset-btn">
              Process Another File
            </button>
          </div>
        </div>
      )}

      <footer>
        <p>
          <strong>Supported SSTV Modes:</strong> Robot 36, Martin M1, Scottie S1
        </p>
        <p>
          Built with React • Open source on{' '}
          <a href="https://github.com/milesburton/sstv-webapp" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
