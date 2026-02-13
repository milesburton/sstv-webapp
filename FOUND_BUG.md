# ROOT CAUSE FOUND: Frequency Detection Accuracy

## The Bug
Decoded SSTV images appear green instead of showing correct colors.

## Root Cause
The Goertzel frequency detection algorithm is returning **1500Hz** (FREQ_BLACK) instead of the actual encoded frequency for mid-range chroma values like **1900Hz**.

## Evidence
E2E test shows for neutral gray RGB(128,128,128):
- **Expected**: Encoder sends Cr=128 → 1900Hz, Decoder reads 1900Hz → Cr=128
- **Actual**: Encoder sends Cr=128 → 1900Hz, Decoder reads **1500Hz** → Cr=**16**

Result: `U=128, V=16` instead of `U=128, V=128`

This causes the YCbCr→RGB conversion to produce:
- R=0.3, **G=57.0**, B=0.5 (PURE GREEN!)

## Why Green?
When V (Cr) = 16 instead of 128:
```
yTerm = 298.082 * (Y - 16)
R = 0.003906 * (yTerm + 408.583 * (16 - 128)) = LOW
G = 0.003906 * (yTerm - 100.291 * (128 - 128) - 208.12 * (16 - 128)) = HIGH
B = 0.003906 * (yTerm + 516.411 * (128 - 128)) = LOW

→ R ≈ 0, G ≈ 57, B ≈ 0 = GREEN!
```

## Reproduction
```bash
npm test test/e2e-node.spec.js
```

Output shows:
```
✅ Gray Test Results:
   Avg R: 0.3, G: 57.0, B: 0.5
   Balance: 56.7 (should be < 80)

Pixel[0,0] U=128 V=16  ← V should be 128!
```

## Next Steps
1. **Investigate Goertzel algorithm** in `detectFrequency()` and `detectFrequencyRange()`
2. **Check if**:
   - Sample window too short for accurate detection?
   - Coarse sweep step size (25Hz) causing quantization error?
   - Fine sweep range too narrow?
   - Test data generation issue in encoder?
3. **Fix frequency detection** to accurately detect 1500-2300Hz range
4. **Verify with E2E test** - test will pass when fixed

## Files Involved
- `src/utils/SSTVDecoder.js` - lines 284-318 (`detectFrequencyRange`)
- `src/utils/SSTVDecoder.js` - lines 493-529 (`detectFrequency`)
- `src/utils/SSTVDecoder.js` - lines 532-551 (`goertzel`)
- `test/e2e-node.spec.js` - E2E test that reproduces the bug
