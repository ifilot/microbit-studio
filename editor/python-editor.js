'use strict';

// MakeCode Python editing next to the Blocks workspace.
//
// The Blockly workspace always holds the last version of the program that works as blocks. While
// Python is shown, each edit is converted back to blocks after a short pause. When that works, the
// workspace and simulator follow the Python code. When it does not, the problems are marked and the
// simulator pauses, but the Python code can still be compiled and sent to the micro:bit.
//
// Loose and disabled blocks are not part of the program, so they have no Python form. They are kept
// while the Python code is unchanged, and dropped once an edit is converted back to blocks.

let editorMode = 'blocks';
/** Current Python source while editing Python, also before Monaco has loaded. */
let pythonText = '';
/** Python generated from the blocks when Python was opened, and the blocks it came from. */
let pythonBaseline = null;
let pythonOriginalBlocks = null;
/** Python source the workspace currently matches, or null if the latest code does not work as blocks. */
let pythonMatchedSource = null;
let pythonBusy = false;
let monacoEditor = null;
let monacoLoading = null;
let pythonCheckTimer;
let pythonReportTimer;
/** Increases with each Python edit and check, so replies for older code are ignored. */
let pythonRevision = 0;
/** Increases when a project is loaded, so a switch that was waiting does not overwrite it. */
let projectGeneration = 0;
let ignorePythonEdits = false;
// Start request numbers at random so replies meant for an earlier page are not mistaken for new ones.
let conversionId = Math.floor(Math.random() * 1e9);
const conversions = new Map();
const conversionTimeout = 60000;

/**
 * Asks the app's language service to convert a program.
 * @param {'python'|'blocks'} operation "python" converts TypeScript to Python, "blocks" converts Python to MakeCode Blocks.
 * @param {string} source Program to convert.
 * @returns {Promise<object>} Reply with ok, and python, xml, error, or diagnostics.
 */
function requestConversion(operation, source) {
    const id = ++conversionId;
    return new Promise(resolve => {
        const timer = setTimeout(() => finishConversion(id, {ok: false, error: 'timeout'}), conversionTimeout);
        conversions.set(id, reply => {
            clearTimeout(timer);
            resolve(reply);
        });
        bridge.convert(id, operation, source);
    });
}

function finishConversion(id, reply) {
    const resolve = conversions.get(id);
    conversions.delete(id);
    resolve?.(reply);
}

function loadMonaco() {
    monacoLoading ??= new Promise((resolve, reject) => {
        // Monaco's helper worker runs from the same local origin as the page.
        self.MonacoEnvironment = {getWorkerUrl: () => '/monaco/vs/base/worker/workerMain.js'};
        const loader = document.createElement('script');
        loader.src = '/monaco/vs/loader.js';
        loader.onerror = () => reject(Error('Monaco could not be loaded'));
        loader.onload = () => {
            require.config({paths: {vs: '/monaco/vs'}});
            const messages = {ja: 'vs/nls.messages.ja', zh: 'vs/nls.messages.zh-cn'}[language];
            const editorModule = () => require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
            if (messages) require([messages], editorModule, editorModule);
            else editorModule();
        };
        document.head.append(loader);
    });
    return monacoLoading;
}

async function pythonEditor() {
    const monaco = await loadMonaco();
    if (monacoEditor) return monacoEditor;
    monacoEditor = monaco.editor.create(byId('python-editor'), {
        value: pythonText,
        language: 'python',
        theme: 'vs',
        automaticLayout: true,
        minimap: {enabled: false},
        fontSize: 15,
        lineHeight: 22,
        tabSize: 4,
        insertSpaces: true,
        detectIndentation: false,
        scrollBeyondLastLine: false,
        fixedOverflowWidgets: true,
        wordBasedSuggestions: 'currentDocument',
        ariaLabel: 'Python',
    });
    monacoEditor.onDidChangeModelContent(() => {
        if (!ignorePythonEdits) pythonEdited();
    });
    return monacoEditor;
}

/** Replaces the Python editor's text without treating it as an edit. */
function setPythonText(editor, source) {
    pythonText = source;
    if (editor.getValue() === source) return;
    ignorePythonEdits = true;
    try {
        editor.setValue(source);
    } finally {
        ignorePythonEdits = false;
    }
}

function setPythonBusy(message) {
    pythonBusy = Boolean(message);
    byId('python-progress').textContent = message ?? '';
    // aria-disabled keeps keyboard focus on the switch while a conversion runs.
    for (const id of ['mode-blocks', 'mode-python']) byId(id).setAttribute('aria-disabled', String(pythonBusy));
}

function showEditorMode(mode) {
    editorMode = mode;
    const python = mode === 'python';
    document.querySelector('.workspace-panel').dataset.mode = mode;
    for (const [id, checked] of [['mode-blocks', !python], ['mode-python', python]]) {
        byId(id).setAttribute('aria-checked', String(checked));
        byId(id).tabIndex = checked ? 0 : -1;
    }
    if (!python) {
        showPythonProblems([]);
        if (workspace) Blockly.svgResize(workspace);
    }
}

/**
 * Updates the simulator controls for Python code without a confirmed block form.
 * @returns {boolean} Whether availability changed.
 */
function setSimulatorAvailable(available) {
    const notice = byId('simulator-notice');
    if (notice.hidden === available) return false;
    notice.textContent = available ? '' : text.simulatorPython;
    notice.hidden = available;
    byId('run-simulator').disabled = !available;
    byId('restart').disabled = !available;
    if (!available) stop();
    return true;
}

/** Restarts a running simulator with the current blocks. A stopped simulator stays stopped. */
function refreshSimulator() {
    if (setSimulatorAvailable(true) || running) restart();
}

function showPythonProblems(diagnostics) {
    const panel = byId('python-problems');
    panel.replaceChildren(...diagnostics.slice(0, 20).map(item => {
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.textContent = text.pythonProblemLine.replace('%1', () => item.line + 1).replace('%2', () => item.message);
        entry.onclick = () => {
            const position = {lineNumber: item.line + 1, column: Math.max(1, item.column + 1)};
            monacoEditor?.revealPositionInCenter(position);
            monacoEditor?.setPosition(position);
            monacoEditor?.focus();
        };
        return entry;
    }));
    panel.hidden = !diagnostics.length;
    if (!pythonBusy) byId('python-progress').textContent = diagnostics.length ? text.pythonHasErrors : '';
    if (!monacoEditor) return;
    window.monaco.editor.setModelMarkers(monacoEditor.getModel(), 'microbit', diagnostics.map(item => {
        const startColumn = Math.max(1, item.column + 1);
        const endLine = Math.max(item.line, item.endLine ?? item.line);
        return {
            severity: window.monaco.MarkerSeverity.Error, message: item.message,
            startLineNumber: item.line + 1, startColumn, endLineNumber: endLine + 1,
            endColumn: Math.max(endLine > item.line ? 1 : startColumn + 1, (item.endColumn ?? 0) + 1),
        };
    }));
}

/**
 * Converts the Python code to blocks and, when that works, updates the workspace and simulator.
 * @param {string} source Python code.
 * @param {{opened?: boolean}} options Set opened when checking a project that was just opened.
 * @returns {Promise<{ok: boolean, stale?: boolean, reason?: string}>}
 */
async function checkPython(source, {opened = false} = {}) {
    const revision = ++pythonRevision;
    const generation = projectGeneration;
    const accept = () => {
        pythonMatchedSource = source;
        showPythonProblems([]);
        refreshSimulator();
        // Refreshing the saved workspace from its Python source leaves the project clean.
        if (opened) unmodifiedProject = JSON.stringify(snapshot());
        report();
        return {ok: true};
    };
    // Code that is back to what the blocks produced restores those blocks, layout included.
    if (source === pythonBaseline && pythonOriginalBlocks && replaceWorkspace(pythonOriginalBlocks))
        return accept();
    const reply = await requestConversion('blocks', source);
    if (revision !== pythonRevision || generation !== projectGeneration || editorMode !== 'python')
        return {ok: false, stale: true};
    if (!reply.ok) {
        pythonMatchedSource = null;
        showPythonProblems(reply.diagnostics ?? []);
        setSimulatorAvailable(false);
        return {ok: false, reason: reply.diagnostics?.length ? text.pythonHasErrors : text.pythonCheckFailed};
    }
    showPythonProblems([]);
    let project;
    try {
        project = reply.xml && importMakeCodeBlocks(reply.xml);
    } catch (error) {
        console.info('Python code has no block form: ' + error.message);
    }
    if (!project || !replaceWorkspace(project.workspace)) {
        pythonMatchedSource = null;
        setSimulatorAvailable(false);
        return {ok: false, reason: text.pythonUnsupported};
    }
    return accept();
}

function pythonEdited() {
    pythonText = monacoEditor.getValue();
    pythonMatchedSource = null;
    // Replies still on their way describe older code.
    ++pythonRevision;
    clearTimeout(pythonCheckTimer);
    pythonCheckTimer = setTimeout(() => checkPython(pythonText), 700);
    clearTimeout(pythonReportTimer);
    pythonReportTimer = setTimeout(report, 250);
}

/** Switches from Blocks to Python, converting the current blocks. */
async function showPython() {
    if (editorMode === 'python' || pythonBusy || lessonStep >= 0) return;
    const generation = projectGeneration;
    setPythonBusy(text.pythonOpening);
    try {
        // Blocks can still change while the conversion runs. Convert again until they settle.
        for (let attempt = 0; attempt < 3; attempt++) {
            const source = readableSource(readProgram(workspace));
            const [reply, editor] = await Promise.all([requestConversion('python', source), pythonEditor()]);
            if (generation !== projectGeneration) return;
            if (!reply.ok) break;
            if (source !== readableSource(readProgram(workspace))) continue;
            pythonOriginalBlocks = Blockly.serialization.workspaces.save(workspace);
            pythonBaseline = reply.python;
            pythonMatchedSource = reply.python;
            setPythonText(editor, reply.python);
            showEditorMode('python');
            editor.focus();
            report();
            return;
        }
    } catch (error) {
        console.error(String(error));
    } finally {
        if (generation === projectGeneration) setPythonBusy(null);
    }
    if (generation === projectGeneration) byId('python-progress').textContent = text.pythonConvertFailed;
}

/**
 * Switches from Python back to Blocks, asking first if recent changes cannot be kept as blocks.
 * @returns {Promise<boolean>} Whether Blocks is shown afterwards.
 */
async function showBlocks() {
    if (editorMode === 'blocks') return true;
    if (pythonBusy) return false;
    const generation = projectGeneration;
    clearTimeout(pythonCheckTimer);
    setPythonBusy(text.pythonChecking);
    try {
        const result = pythonText === pythonMatchedSource && pythonText !== pythonBaseline
            ? {ok: true} : await checkPython(pythonText);
        if (generation !== projectGeneration || result.stale) return false;
        if (!result.ok) {
            const answer = await askDiscardPython(result.reason);
            if (generation !== projectGeneration) return false;
            if (answer !== 'discard') {
                monacoEditor?.focus();
                return false;
            }
        }
        pythonBaseline = null;
        pythonOriginalBlocks = null;
        pythonMatchedSource = null;
        pythonText = '';
        showEditorMode('blocks');
        if (setSimulatorAvailable(true)) restart();
        report();
        return true;
    } finally {
        if (generation === projectGeneration) setPythonBusy(null);
    }
}

function askDiscardPython(reason) {
    const dialog = byId('python-dialog');
    byId('python-dialog-reason').textContent = reason ?? '';
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), {once: true}));
}

/**
 * Applies the editor mode stored in a project that was just loaded into the workspace.
 * @param {object|null} project Project data. Python projects have editor "python" and a python string.
 */
function applyProjectEditor(project) {
    clearTimeout(pythonCheckTimer);
    clearTimeout(pythonReportTimer);
    const generation = ++projectGeneration;
    const revision = ++pythonRevision;
    setPythonBusy(null);
    pythonBaseline = null;
    pythonOriginalBlocks = null;
    pythonMatchedSource = null;
    const dialog = byId('python-dialog');
    if (dialog.open) dialog.close('stay');
    if (project?.editor !== 'python') {
        pythonText = '';
        if (editorMode === 'python') showEditorMode('blocks');
        setSimulatorAvailable(true);
        return;
    }
    pythonText = project.python;
    showEditorMode('python');
    setSimulatorAvailable(false);
    showPythonProblems([]);
    pythonEditor().then(editor => {
        if (generation !== projectGeneration || editorMode !== 'python') return;
        setPythonText(editor, pythonText);
        if (revision === pythonRevision) return checkPython(pythonText, {opened: true});
    }).catch(error => console.error(String(error)));
}

/** Project fields that keep the Python code with the blocks. Tutorials always use Blocks. */
function pythonSnapshot() {
    return editorMode === 'python' && lessonStep < 0 ? {editor: 'python', python: pythonText} : {};
}

/** Program the app compiles: the Python code while it is shown, otherwise the blocks. */
function buildInput() {
    return editorMode === 'python' ? {file: 'main.py', source: pythonText}
        : {file: 'main.ts', source: programSource(readProgram(workspace))};
}

function undoPython(redo) {
    monacoEditor?.trigger('studio', redo ? 'redo' : 'undo', null);
}

function initializePythonEditor() {
    const group = byId('editor-mode');
    group.setAttribute('aria-label', text.editorMode);
    byId('mode-blocks').onclick = showBlocks;
    byId('mode-python').onclick = showPython;
    // Arrow keys move between the two choices, as in other radio groups.
    group.onkeydown = event => {
        const target = {ArrowLeft: 'mode-blocks', ArrowUp: 'mode-blocks',
            ArrowRight: 'mode-python', ArrowDown: 'mode-python'}[event.key];
        if (!target) return;
        event.preventDefault();
        byId(target).focus();
        byId(target).click();
    };
    showEditorMode('blocks');
}
