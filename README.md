# fx Calc

An offline scientific calculator modeled on the Casio fx-991 series. It's a PWA: open the link once on your phone, choose **Add to Home Screen**, and from then on it runs with no internet.

Features: exact fractions, surds and π results (S⇔D), history, variables A–F/X/Y/M, STO/RECALL, M+/M−, CALC, SOLVE, ∫, d/dx, Σ, ∏, nPr/nCr, Pol/Rec, DMS, ENG, FACT, constants and unit conversions.

Modes (MENU): Calculate, Complex, Base-N, Matrix, Vector, Statistics, Distribution, Table, Equation, Inequality and Ratio.

Tests: `node tests/engine.test.js` (also run before every Android build).

## Android app

Download the APK: **https://github.com/KaranDhamiSac/fx-calc/releases/latest/download/fx-calc.apk**

Open it on your phone and allow installing from your browser when Android asks. The app bundles the calculator, needs no internet permission, and every push to `main` builds a new release (`.github/workflows/android.yml`). The Android wrapper lives in `android/`.
