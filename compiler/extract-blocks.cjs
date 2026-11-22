'use strict';

const {spawnSync} = require('node:child_process');
const {readFileSync, statSync} = require('node:fs');
const loadPxt = require('./pxt-runtime.cjs');

const projectLimit = 2 * 1024 * 1024;

async function extract(assets, input, xz = 'xz') {
    if (statSync(input).size > 8 * 1024 * 1024)
        throw new Error('The HEX file is too large.');
    const bytes = readFileSync(input);
    if (bytes[0] !== 0x3a)
        throw new Error('Expected an Intel HEX file.');
    // Match the pinned PXT reader's metadata records before it allocates the source buffer.
    for (const [, lengths] of bytes.toString('utf8').matchAll(/^:10....0[0E]41140E2FB82FA2BB(.{12}).{6}/gm)) {
        if (!/^[0-9a-f]{12}$/i.test(lengths))
            throw new Error('Invalid embedded source length.');
        const size = Buffer.from(lengths, 'hex');
        if (size.readUInt16LE(0) + size.readUInt32LE(2) > projectLimit)
            throw new Error('The embedded source is too large.');
    }
    const {pxt} = loadPxt(assets);
    // Bound both memory and output for compressed source embedded in imported files.
    pxt.lzmaDecompressAsync = async compressed => {
        const result = spawnSync(xz, ['--format=lzma', '--decompress', '--stdout', '--memlimit-decompress=64MiB'], {
            input: Buffer.from(compressed), maxBuffer: projectLimit, timeout: 5000, windowsHide: true,
        });
        if (result.status !== 0)
            throw new Error('The embedded source could not be decompressed.');
        return result.stdout.toString('utf8');
    };
    const embedded = await pxt.cpp.unpackSourceFromHexAsync(new Uint8Array(bytes));
    if (embedded?.meta?.editor === 'blockly' && embedded.source?.trimStart().startsWith('<xml')) {
        process.stdout.write(embedded.source);
        return;
    }
    const files = JSON.parse(embedded?.source ?? '{}');
    const config = JSON.parse(files['pxt.json'] ?? '{}');
    if (typeof files['main.blocks'] !== 'string' || !files['main.blocks'].trim()
        || (embedded.meta?.editor && embedded.meta.editor !== 'blocksprj')
        || Object.keys(files).some(name => name.endsWith('.ts') && name !== 'main.ts')
        || Object.keys(config.dependencies ?? {}).some(name => !['core', 'radio', 'microphone'].includes(name))) {
        throw new Error('The HEX file does not contain a supported MakeCode Blocks project.');
    }
    process.stdout.write(files['main.blocks']);
}

extract(...process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
});
