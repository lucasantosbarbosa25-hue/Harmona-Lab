#!/usr/bin/env bash
# Traz o tocador de SoundFont (SpessaSynth, licença Apache-2.0) para dentro do app, sem etapa de build no app.
#
# Uso:  bash design/vendor_spessasynth.sh
#
# Gera em harmonalab/web/vendor/spessasynth/:
#   spessasynth.min.js            WorkletSynthesizer + Sequencer (lado da página), num único módulo ES
#   spessasynth_processor.min.js  o processador de áudio (AudioWorklet), como vem no pacote
#   LICENSE-*.txt                 as licenças dos pacotes incluídos
# As versões ficam fixas aqui; para atualizar, troque-as, rode de novo e confira os testes.
set -euo pipefail

LIB_VERSION="4.3.14"      # spessasynth_lib (publicada em 2026-08-18)
CORE_VERSION="4.3.22"     # spessasynth_core (publicada em 2026-08-24)
STB_VERSION="0.0.7"       # stb-vorbis, dependência do core
ESBUILD_VERSION="0.28.2"  # só para empacotar

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/harmonalab/web/vendor/spessasynth"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm init -y >/dev/null
npm install --no-audit --no-fund --ignore-scripts --save-exact \
  "spessasynth_lib@$LIB_VERSION" "spessasynth_core@$CORE_VERSION" "stb-vorbis@$STB_VERSION" >/dev/null
npm install --no-audit --no-fund --save-exact "esbuild@$ESBUILD_VERSION" >/dev/null

cat > entry.js <<'JS'
export { WorkletSynthesizer, Sequencer } from "spessasynth_lib";
export { BasicMIDI } from "spessasynth_core"; // para a exportação em áudio (renderização fora do tempo real)
JS

mkdir -p "$OUT"
npx --no-install esbuild entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=none \
  --outfile="$OUT/spessasynth.min.js" --log-level=warning
cp node_modules/spessasynth_lib/dist/spessasynth_processor.min.js "$OUT/spessasynth_processor.min.js"
cp node_modules/spessasynth_lib/LICENSE "$OUT/LICENSE-spessasynth_lib.txt"
cp node_modules/spessasynth_core/LICENSE "$OUT/LICENSE-spessasynth_core.txt"
cp node_modules/stb-vorbis/LICENSE "$OUT/LICENSE-stb-vorbis.txt" 2>/dev/null || true
printf 'spessasynth_lib %s\nspessasynth_core %s\nstb-vorbis %s\nesbuild %s\n' \
  "$LIB_VERSION" "$CORE_VERSION" "$STB_VERSION" "$ESBUILD_VERSION" > "$OUT/VERSIONS.txt"
ls -la "$OUT"
