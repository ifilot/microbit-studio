'use strict';

const {readFileSync} = require('node:fs');
const {join} = require('node:path');

/** Libraries every Microbit Studio program can use. The data logger is added when a program needs it. */
const baseDependencies = {core: '*', radio: '*', microphone: '*'};

/**
 * Returns whether a TypeScript or MakeCode Python program uses the data logger, which needs its own build.
 * A false match only adds the package.
 * @param {string} source Program source.
 */
function usesDatalogger(source) {
    return /\bdatalogger\s*\./.test(source);
}

/**
 * Prepares PXT compile options for a single-file program using only bundled packages.
 * @param {object} pxt Loaded PXT namespace.
 * @param {string} assets Directory with the bundled PXT files.
 * @param {string} source TypeScript for main.ts.
 * @param {{datalogger?: boolean}} options Set datalogger to include the data logger package.
 * @returns {Promise<object>} Compile options with isNative set.
 */
async function compileOptions(pxt, assets, source, {datalogger = usesDatalogger(source)} = {}) {
    const dependencies = {...baseDependencies, ...(datalogger ? {datalogger: '*'} : {})};
    const files = {
        'pxt.json': JSON.stringify({name: 'microbit-studio', binaryonly: true, dependencies, files: ['main.ts']}),
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
    return pkg.getCompileOptionsAsync(targetOptions);
}

/**
 * Formats a PXT diagnostic message, which may be a chain of nested messages.
 * @param {object} ts Loaded TypeScript namespace.
 * @param {object} diagnostic PXT or TypeScript diagnostic.
 */
function diagnosticText(ts, diagnostic) {
    return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

/** Converts a zero-based character offset to a zero-based line and column. */
function position(source, offset) {
    const before = source.slice(0, Math.max(0, offset));
    const line = (before.match(/\n/g) ?? []).length;
    return {line, column: offset - (before.lastIndexOf('\n') + 1)};
}

/**
 * Maps a TypeScript diagnostic in converted Python back to the Python source.
 * @param {object} ts Loaded TypeScript namespace.
 * @param {object} diagnostic Diagnostic with a start offset in the converted TypeScript.
 * @param {string} python Python source.
 * @param {object[]} sourceMap Mapping returned by pythonToTypeScript().
 * @returns {{line: number, column: number, endLine: number, endColumn: number, message: string}}
 *          Zero-based positions in the Python source.
 */
function pythonDiagnostic(ts, diagnostic, python, sourceMap) {
    const entry = sourceMap?.find(item => item.ts.startPos <= diagnostic.start && diagnostic.start < item.ts.endPos);
    const start = position(python, entry ? entry.py.startPos : 0);
    const end = position(python, entry ? entry.py.endPos : 0);
    return {line: start.line, column: start.column, endLine: end.line, endColumn: end.column,
        message: diagnosticText(ts, diagnostic)};
}

/**
 * Converts MakeCode Python to TypeScript.
 * @param {object} ts Loaded TypeScript namespace, with the Python converter loaded.
 * @param {object} options Compile options. Their API information is computed once and reused.
 * @param {string} python MakeCode Python source for main.py.
 * @returns {{source?: string, sourceMap?: object[], diagnostics: object[]}}
 *          TypeScript and its mapping to Python, or diagnostics for main.py.
 */
function pythonToTypeScript(ts, options, python) {
    if (!options.apisInfo) {
        options.fileSystem['main.ts'] = '';
        options.apisInfo = ts.pxtc.getApiInfo(ts.pxtc.getTSProgram(options), options.jres);
    }
    // The converter adds files to the shared options. Restore them so repeated calls do not accumulate.
    const sourceFiles = options.sourceFiles.slice();
    options.fileSystem['main.py'] = python;
    options.sourceFiles.push('main.py');
    const previous = options.target.preferredEditor;
    options.target.preferredEditor = 'pyprj';
    try {
        const result = ts.pxtc.transpile.pyToTs(options);
        const errors = result.diagnostics.filter(item => item.category === ts.pxtc.DiagnosticCategory.Error);
        return errors.length ? {diagnostics: errors}
            : {source: result.outfiles['main.ts'], sourceMap: result.sourceMap, diagnostics: []};
    } finally {
        options.target.preferredEditor = previous;
        options.sourceFiles.splice(0, options.sourceFiles.length, ...sourceFiles);
        delete options.fileSystem['main.py'];
    }
}

module.exports = {compileOptions, diagnosticText, pythonDiagnostic, pythonToTypeScript, usesDatalogger};
