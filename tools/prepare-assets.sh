#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
destination=${1:-"$root/assets"}
mkdir -p -- "$destination"
destination=$(cd -- "$destination" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
cd -- "$scratch"

npm pack --ignore-scripts --silent pxt-core@13.2.17 pxt-microbit@9.1.2 blockly@11.2.2
mkdir pxt-core target blockly
tar -xzf pxt-core-13.2.17.tgz --strip-components=1 -C pxt-core
tar -xzf pxt-microbit-9.1.2.tgz --strip-components=1 -C target
tar -xzf blockly-11.2.2.tgz --strip-components=1 -C blockly

# The tutorial artwork and the complete third-party notices are in the source tree.
revision=380b0504b6ff42208d9dedfcad04192982bab0b5
git init -q upstream
git -C upstream fetch -q --depth 1 https://github.com/microsoft/pxt-microbit.git "$revision"
git -C upstream checkout -q --detach FETCH_HEAD
curl -fsSL https://raw.githubusercontent.com/google/blockly/blockly-v11.2.2/LICENSE -o blockly-LICENSE

mkdir -p "$destination"/{pxt,blockly/msg,lessons,licenses}
cp pxt-core/built/web/{typescript,pxtlib,pxtcompiler}.js "$destination/pxt/"
cp target/built/{target.json,compiler.js} "$destination/pxt/"
cp -R target/built/hexcache "$destination/pxt/"
# The pinned target's npm archive omits the V2 data logger build.
logger_hex=8dca226ea46e0a5b5ae5844c8cd04e55f2f24469edcc51af5a9f50bd27c87b8b.hex
curl -fsSL "https://cdn.makecode.com/compile/$logger_hex" -o "$logger_hex"
printf '%s  %s\n' '482e03f66662b3b71d39ff92d1a1af356511beef43719be658fd72ad51fe1f3f' "$logger_hex" | sha256sum -c -
cp "$logger_hex" "$destination/pxt/hexcache/"
cp blockly/{blockly_compressed.js,blocks_compressed.js} "$destination/blockly/"
cp blockly/msg/{en,ja,nl,zh-hans}.js "$destination/blockly/msg/"
cp -R blockly/media "$destination/blockly/"
cp blockly-LICENSE "$destination/licenses/Blockly-LICENSE.txt"
cp pxt-core/LICENSE "$destination/licenses/PXT-LICENSE.txt"
cp target/LICENSE.txt "$destination/licenses/MakeCode-microbit-LICENSE.txt"
cp upstream/THIRD-PARTY-NOTICES.txt "$destination/licenses/MakeCode-THIRD-PARTY-NOTICES.txt"

node "$root/tools/prepare-editor-data.cjs" upstream "$destination"
