'use strict';

const {spawnSync} = require('node:child_process');
const {copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync} = require('node:fs');
const {availableParallelism, cpus} = require('node:os');
const {dirname, join, resolve} = require('node:path');

function progress(reached, next) {
    process.stdout.write(`progress ${reached} ${next}\n`);
}

function run(command, args, cwd) {
    const result = spawnSync(command, args, {cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true});
    if (result.error?.code === 'ENOENT')
        throw new Error(`${command} was not found. Install CMake, Ninja, and the Arm GNU Toolchain (arm-none-eabi).`);
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const details = `${result.stdout}${result.stderr}`
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/^(FAILED:[^\r\n]*\r?\n)[^\r\n]*\r?\n/gm, '$1');
        throw new Error(details || `${command} failed.`);
    }
}

function compile(assets, input, output) {
    const sdk = resolve(assets);
    const work = join(dirname(resolve(output)), 'codal-build');
    const build = join(work, 'build');
    const source = join(work, 'source');
    const image = join(work, 'MICROBIT.hex');
    const dependencies = ['codal-microbit-v2', 'codal-core', 'codal-nrf52', 'codal-microbit-nrf5sdk'];
    progress(0, 20);
    if (!existsSync(join(sdk, 'CMakeLists.txt')) ||
        dependencies.some(name => !existsSync(join(sdk, 'libraries', name, 'CMakeLists.txt'))) ||
        !existsSync(join(sdk, 'libraries/codal-nrf52/nrfx/nrfx.h')))
        throw new Error('The bundled CODAL SDK is incomplete. Reinstall Microbit Studio or run tools/prepare-assets.sh.');

    // Keep the toolchain cache beside the temporary source so subsequent builds can reuse CODAL objects.
    if (!existsSync(work)) {
        const staging = mkdtempSync(`${work}-`);
        try {
            cpSync(sdk, staging, {recursive: true});
            renameSync(staging, work);
        } finally {
            rmSync(staging, {recursive: true, force: true});
        }
    }
    mkdirSync(source, {recursive: true});
    copyFileSync(input, join(source, 'main.cpp'));
    run('cmake', ['-S', work, '-B', build, '-G', 'Ninja', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5'], work);
    progress(20, 95);
    const jobs = Math.min(6, availableParallelism?.() ?? (cpus().length || 1));
    run('cmake', ['--build', build, '--parallel', String(jobs), '--target', 'MICROBIT_hex'], work);
    progress(95, 100);
    copyFileSync(image, output);
    progress(100, 100);
}

try {
    compile(...process.argv.slice(2));
} catch (error) {
    process.stderr.write(error.message.trimEnd() + '\n');
    process.exitCode = 1;
}
