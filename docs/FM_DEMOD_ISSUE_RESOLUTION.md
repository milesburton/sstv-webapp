# FM Demodulation Issue Resolution

## Date: 2026-02-15
## Version: 1.2.0

## Problem

The SSTV decoder was producing corrupted images with purple and green artifacts when decoding audio files in the browser. The issue manifested as:
- Green color tint (G channel significantly higher than R and B)
- Purple noise/corruption
- "Decoded Successfully" message but unusable output

## Root Cause Analysis

### Issue #1: Stack Overflow (Critical)
**Location**: `src/utils/SSTVDecoder.js:73`

**Problem**:
```javascript
const min = Math.min(...demodulated); // CRASHES!
const max = Math.max(...demodulated);
```

The spread operator (`...`) was used on a very large Float32Array (potentially millions of samples for a 72-second SSTV transmission at 48kHz = 3,456,000 samples). This caused a "Maximum call stack size exceeded" error in both Node.js and browsers.

**Fix**:
```javascript
let min = Infinity, max = -Infinity, sum = 0;
for (let i = 0; i < demodulated.length; i++) {
  const val = demodulated[i];
  if (val < min) min = val;
  if (val > max) max = val;
  sum += val;
}
```

### Issue #2: FM Demod Produces Worse Results Than Goertzel

**Problem**:
Comparative testing showed FM demodulation produces significantly worse color accuracy than the traditional Goertzel algorithm:

```
Test Results (ISS SSTV transmission):
- Goertzel color imbalance: 2.1 (excellent)
- FM Demod color imbalance: 93.8 (poor - green tint)
```

**Reasons**:
1. FM demodulation measures instantaneous frequency, which is very sensitive to noise
2. Goertzel algorithm averages frequency energy over a window, providing noise immunity
3. ISS signals have significant noise, frequency drift (Doppler), and timing variations
4. The windowed averaging in Goertzel naturally smooths these artifacts

### Issue #3: Unclamped FM Demod Output

**Problem**:
FM demodulator was producing values far outside the expected ±1 range:
- Expected: -1 to +1 (mapping to 1500-2300 Hz)
- Actual: -60 to +60 (mapping to impossible frequencies like 2961 Hz)

This occurred because noisy ISS signals contain frequency components outside the normal SSTV range.

**Fix**:
Added clamping in `src/utils/FMDemodulator.js`:
```javascript
let normalized = this.scale * delta;
// Clamp to expected range to handle noisy signals
normalized = Math.max(-1, Math.min(1, normalized));
return normalized;
```

## Solution

**FM demodulation is now disabled by default** (`useFMDemod: false`):

```javascript
// src/utils/SSTVDecoder.js
this.useFMDemod = options.useFMDemod === true; // Default false
```

### Rationale:
1. **Goertzel produces better results**: Color imbalance 2.1 vs 93.8
2. **All tests pass with Goertzel**: Including ISS decode test
3. **Simpler is better**: Goertzel is proven, battle-tested, and more robust for noisy signals
4. **FM demod remains available**: Can be enabled with `new SSTVDecoder(48000, { useFMDemod: true })`

## Testing

All 54 tests pass with FM demod disabled:
- ✅ 12 encoder tests
- ✅ 11 decoder tests
- ✅ 7 integration tests (encoder-decoder round-trip)
- ✅ 14 FM demodulation component tests
- ✅ 5 FM integration tests (with adjusted expectations for clamping)
- ✅ 2 color diagnostic tests
- ✅ 1 ISS decode test
- ✅ 2 E2E tests

Comparative test results:
```bash
node test-both-methods.js

Goertzel Algorithm:
  Avg RGB: R=84.4, G=84.2, B=86.1
  Color imbalance: 2.1

FM Demodulation:
  Avg RGB: R=64.1, G=111.3, B=64.7
  Color imbalance: 93.8

✅ Goertzel produces better color balance
```

## Deployment

- Version: 1.2.0
- Deployed to: https://[username].github.io/sstv-toolkit/
- All changes committed and pushed

## Lessons Learned

1. **Never use spread operators on large arrays** - Use loops instead
2. **Real-world testing is essential** - Unit tests alone don't catch browser-specific issues
3. **Simpler is often better** - The Goertzel algorithm's windowed averaging provides better noise immunity than instantaneous FM demodulation
4. **Clamp unstable values** - Real-world signals can produce unexpected ranges
5. **Keep proven methods** - Don't replace working code without demonstrated improvement

## Future Considerations

If FM demodulation improvements are desired:
1. Add pre-filtering/smoothing to FM demod output
2. Use adaptive bandwidth based on signal quality
3. Implement AFC (Automatic Frequency Control) to track drift
4. Consider hybrid approach: FM demod for sync, Goertzel for data

However, given Goertzel's excellent performance (color imbalance of 2.1), these improvements are not priority.
