#!/usr/bin/env bash
# pi-vendor 빌드 스크립트 (재현 가능)
# 사용법: ./build.sh  (app/vendor/ 에서 실행)
set -euo pipefail
cd "$(dirname "$0")"

TSC="node node_modules/typescript/bin/tsc"

echo "==> step 0: 의존성 설치"
npm install --no-fund --no-audit

echo "==> step 1: pi-telemetry"
$TSC -p pi-telemetry/tsconfig.build.json

echo "==> step 2: pi-ai"
$TSC -p pi-ai/tsconfig.build.json

echo "==> step 3: pi-agent-core"
$TSC -p pi-agent-core/tsconfig.build.json

echo "==> step 4: pi-coding-agent"
$TSC -p pi-coding-agent/tsconfig.build.json

echo "==> step 5: pi-ai 모델 데이터 JSON 복사 (npm dist에서 추출된 src/providers/data)"
mkdir -p pi-ai/dist/providers/data
cp pi-ai/src/providers/data/*.json pi-ai/dist/providers/data/

echo "==> step 6: coding-agent 정적 자산 복사"
cd pi-coding-agent
mkdir -p dist/modes/interactive/theme dist/modes/interactive/assets dist/core/export-html/vendor
cp src/modes/interactive/theme/*.json dist/modes/interactive/theme/ 2>/dev/null || true
cp src/modes/interactive/assets/*.png dist/modes/interactive/assets/ 2>/dev/null || true
cp src/core/export-html/template.html src/core/export-html/template.css src/core/export-html/template.js dist/core/export-html/
cp src/core/export-html/vendor/*.js dist/core/export-html/vendor/ 2>/dev/null || true
cd ..

echo "==> 완료: 4개 패키지 dist 생성"
