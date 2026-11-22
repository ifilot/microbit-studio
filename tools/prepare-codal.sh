#!/usr/bin/env bash
set -euo pipefail

assets=${1:?Pass the prepared assets directory}
destination="$assets/codal"
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT

fetch_tree() {
    local url=$1 revision=$2 directory=$3
    shift 3
    mkdir -p -- "$directory"
    git -C "$scratch/repository" fetch -q --depth 1 "$url" "$revision"
    git -C "$scratch/repository" archive FETCH_HEAD "$@" | tar -xf - -C "$directory"
}

git init -q "$scratch/repository"
sdk="$scratch/sdk"
fetch_tree https://github.com/lancaster-university/microbit-v2-samples.git \
    04b7089d82af24534f3dcd460a9c343850b60b5d "$sdk" CMakeLists.txt codal.json LICENSE AUTHORS utils/cmake

# CODAL v0.3.5 and the three library revisions from its target-locked.json.
fetch_tree https://github.com/lancaster-university/codal-microbit-v2.git \
    f5d1682fc3882022d3d5a7facb1fddb4b0ea7b52 "$sdk/libraries/codal-microbit-v2"
fetch_tree https://github.com/lancaster-university/codal-core.git \
    e6b061f2a6d8977811e3025da387d3007e5796f2 "$sdk/libraries/codal-core"
fetch_tree https://github.com/lancaster-university/codal-nrf52.git \
    1fbb7240290fe36a55c61378f5cdeb7640f3ec4a "$sdk/libraries/codal-nrf52"
fetch_tree https://github.com/microbit-foundation/codal-microbit-nrf5sdk.git \
    4b8abc690f6c9fca6132e6db5ee13a795a263f88 "$sdk/libraries/codal-microbit-nrf5sdk"
fetch_tree https://github.com/NordicSemiconductor/nrfx.git \
    281cc2e178fd9a470d844b3afdea9eb322a0b0e8 "$sdk/libraries/codal-nrf52/nrfx"

mkdir -p -- "$assets"
rm -rf -- "$destination"
mv -- "$sdk" "$destination"
