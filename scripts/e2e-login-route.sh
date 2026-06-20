#!/usr/bin/env bash
set -e

cd /Volumes/nvme512/app_coleta_mobile

export JAVA_HOME="/Volumes/NVME/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH:$HOME/.maestro/bin:/Users/leandrodeodato/Library/Android/sdk/platform-tools"

tap_pct() {
  local PX="$1"
  local PY="$2"

  local SIZE
  SIZE=$(adb shell wm size | tr -d '\r' | grep -oE '[0-9]+x[0-9]+' | tail -1)

  local W="${SIZE%x*}"
  local H="${SIZE#*x}"

  local X=$(( W * PX / 100 ))
  local Y=$(( H * PY / 100 ))

  echo "Tap em ${PX}%,${PY}% => ${X},${Y} / tela ${W}x${H}"
  adb shell input tap "$X" "$Y"
}

lsof -ti tcp:8081 | xargs kill -9 2>/dev/null || true
lsof -ti tcp:8082 | xargs kill -9 2>/dev/null || true

adb wait-for-device
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8082 tcp:8082 2>/dev/null || true

npx expo start --android -c > /tmp/omni-expo-e2e.log 2>&1 &
EXPO_PID=$!

sleep 8

for i in $(seq 1 60); do
  if nc -z 127.0.0.1 8081; then
    break
  fi
  sleep 1
done

adb reverse tcp:8081 tcp:8081
adb reverse tcp:8082 tcp:8082 2>/dev/null || true

maestro test .maestro/prepare_expo.yml

# Permissões nativas do Expo Go
adb shell pm grant host.exp.exponent android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true
adb shell pm grant host.exp.exponent android.permission.ACCESS_COARSE_LOCATION 2>/dev/null || true
adb shell appops set host.exp.exponent FINE_LOCATION allow 2>/dev/null || true
adb shell appops set host.exp.exponent COARSE_LOCATION allow 2>/dev/null || true

# Vai até a primeira visita
maestro test .maestro/login_route_open_visit.yml

# Popups internos do Expo Go: pode pedir coarse e fine location em sequência.
# Lê a hierarquia e clica no botão nativo android:id/button1 enquanto ele existir.
for i in 1 2 3 4; do
  if maestro hierarchy | grep -q '"resource-id" : "android:id/button1"'; then
    echo "Popup de permissão Expo encontrado. Clicando em ALLOW ($i)..."
    maestro test .maestro/allow_expo_permission_click.yml
    sleep 2
  else
    echo "Nenhum popup de permissão Expo pendente."
    break
  fi
done

# Valida tela da visita
maestro test .maestro/visit_assert.yml

# Volta da visita para o roteiro
maestro test .maestro/visit_back_to_route.yml

kill "$EXPO_PID" 2>/dev/null || true
