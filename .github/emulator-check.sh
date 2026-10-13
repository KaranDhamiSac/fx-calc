#!/usr/bin/env bash
# Smoke test run inside the CI Android emulator: launch, tap a calculation, menu + back, restart, history.
set -x
mkdir -p shots
adb install -r fx-calc.apk
# Let the freshly booted emulator finish its own startup work before timing our launch.
sleep 60
shot() { adb exec-out screencap -p > "shots/$1.png"; }
wait_render() { for i in $(seq 1 60); do shot "$1"; [ "$(stat -c%s "shots/$1.png")" -gt 150000 ] && return; sleep 1; done; }
t() { adb shell input tap "$1" "$2"; sleep 0.6; }

start=$(date +%s)
adb shell am start -W -n io.github.karandhamisac.fxcalc/.MainActivity
wait_render 1-launch
echo "first launch rendered after $(( $(date +%s) - start ))s" | tee shots/timing.txt

# 1 / 3 + 1 / 6 =
t 118 2054; t 104 1199; t 540 2054; t 751 2054; t 118 2054; t 104 1199; t 540 1866; t 962 2242
sleep 1; shot 2-result
t 805 911; sleep 1; shot 3-menu
adb shell input keyevent KEYCODE_BACK; sleep 2; shot 4-after-back

adb shell am force-stop io.github.karandhamisac.fxcalc
start=$(date +%s)
adb shell am start -W -n io.github.karandhamisac.fxcalc/.MainActivity
wait_render 5-relaunch
echo "second launch rendered after $(( $(date +%s) - start ))s" | tee -a shots/timing.txt
t 540 882; sleep 1; shot 6-history-after-restart
# A true first launch again (app data wiped) on the settled system.
adb shell pm clear io.github.karandhamisac.fxcalc
start=$(date +%s)
adb shell am start -W -n io.github.karandhamisac.fxcalc/.MainActivity
wait_render 7-fresh-first-launch
echo "fresh first launch (data cleared) rendered after $(( $(date +%s) - start ))s" | tee -a shots/timing.txt
# Memory: total app footprint (PSS) including the WebView renderer process
sleep 5
{
  echo "== app process =="; adb shell dumpsys meminfo io.github.karandhamisac.fxcalc | grep -E "TOTAL PSS|TOTAL RSS|Java Heap|Native Heap|Graphics|TOTAL:" | head -12
  echo "== all processes (fxcalc + webview sandbox) =="; adb shell dumpsys meminfo | grep -iE "fxcalc|sandboxed_process" | head -10
  echo "== for comparison: system calculator/clock =="; adb shell dumpsys meminfo | grep -iE "deskclock|calculator|launcher" | head -5
} | tee shots/memory.txt
adb logcat -d | grep -iE "chromium|console|AndroidRuntime" | tail -100 > shots/logcat.txt || true
