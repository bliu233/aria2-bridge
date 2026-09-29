#!/usr/bin/env bash
# 把扩展打包成 xpi。
# 注意：这里只做 zip 打包，没有任何代码生成、压缩或转译 —— 包里的文件就是源码本身。
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
OUT="dist/aria2-bridge-${VERSION}.xpi"
FILES=(manifest.json background.js options.html options.js LICENSE)

mkdir -p dist
rm -f "$OUT"

if command -v zip >/dev/null 2>&1; then
  zip -q -X "$OUT" "${FILES[@]}"
else
  python3 - "$OUT" "${FILES[@]}" <<'PY'
import sys, zipfile
out, files = sys.argv[1], sys.argv[2:]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, f)
PY
fi

echo "已生成 $OUT"
python3 - "$OUT" <<'PY'
import sys, json, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print("版本:", json.loads(z.read("manifest.json"))["version"])
    print("内容:", ", ".join(z.namelist()))
PY
