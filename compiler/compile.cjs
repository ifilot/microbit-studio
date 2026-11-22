'use strict';

const {readFileSync, writeFileSync} = require('node:fs');
const {join} = require('node:path');
const loadPxt = require('./pxt-runtime.cjs');

async function compile(assets, input, output) {
    const {pxt, ts} = loadPxt(assets);
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
    const result = ts.pxtc.compile(await pkg.getCompileOptionsAsync(targetOptions));
    if (!result.success || !result.outfiles['binary.hex']) {
        throw new Error(result.diagnostics.map(item =>
            ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n') ||
            'MakeCode did not produce a firmware image.');
    }
    writeFileSync(output, result.outfiles['binary.hex']);
}

compile(...process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
});
