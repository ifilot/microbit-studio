'use strict';

const {readFileSync, writeFileSync} = require('node:fs');
const {join} = require('node:path');
const loadPxt = require('./pxt-runtime.cjs');

// Tells the app which stage finished and where the next one ends, as percentages.
// The stage boundaries follow measured timings: compiling takes about two thirds of the run.
function progress(reached, next) {
    process.stdout.write(`progress ${reached} ${next}\n`);
}

async function compile(assets, input, output) {
    progress(0, 25);
    const {pxt, ts} = loadPxt(assets);
    progress(25, 40);
    const source = readFileSync(input, 'utf8');
    const dependencies = {core: '*', radio: '*', microphone: '*'};
    if (/^\s*datalogger\.log\(/m.test(source)) dependencies.datalogger = '*';
    const files = {
        'pxt.json': JSON.stringify({
            name: 'microbit-studio',
            binaryonly: true,
            dependencies,
            files: ['main.ts'],
        }),
        'main.ts': source,
    };
    const host = {
        readFile(pkg, name) {
            const bundled = pkg.id === 'this' ? files : pxt.appTarget.bundledpkgs[pkg.id];
            return bundled?.[name] ?? null;
        },
        writeFile(pkg, name, contents) {
            if (pkg.id === 'this') files[name] = contents;
        },
        async cacheStoreAsync() {},
        async cacheGetAsync() { return null; },
        async downloadPackageAsync(pkg) {
            if (pkg.id !== 'this' && !Object.hasOwn(pxt.appTarget.bundledpkgs, pkg.id))
                throw new Error(`Package ${pkg.id} is unavailable offline.`);
        },
        async getHexInfoAsync(extension) {
            const file = join(assets, 'hexcache', extension.sha + '.hex');
            return {hex: readFileSync(file, 'utf8').trimEnd().split(/\r?\n/)};
        },
    };
    const pkg = new pxt.MainPackage(host);
    await pkg.installAllAsync();
    const targetOptions = pkg.getTargetOptions();
    targetOptions.isNative = true;
    const options = await pkg.getCompileOptionsAsync(targetOptions);
    progress(40, 95);
    const result = ts.pxtc.compile(options);
    progress(95, 100);
    if (!result.success || !result.outfiles['binary.hex']) {
        throw new Error(result.diagnostics.map(item =>
            ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n') ||
            'MakeCode did not produce a firmware image.');
    }
    writeFileSync(output, result.outfiles['binary.hex']);
    progress(100, 100);
}

compile(...process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
});
