'use strict';

let monacoLoading;

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

function createCodeEditor(monaco, container, language, label, value) {
    return monaco.editor.create(container, {
        value, language, ariaLabel: label,
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
    });
}

let cppEditor;
let cppText = '';
let cppReportTimer;

function applyCppProject(source) {
    clearTimeout(cppReportTimer);
    cppText = source ?? '';
    if (source === undefined) return;
    const generation = projectGeneration;
    showEditorMode('cpp');
    setSimulatorAvailable(true);
    showCppSimulationStatus();
    loadMonaco().then(monaco => {
        if (generation !== projectGeneration) return;
        if (cppEditor) {
            const previous = cppEditor.getModel();
            cppEditor.setModel(monaco.editor.createModel(cppText, 'cpp'));
            previous.dispose();
        } else {
            cppEditor = createCodeEditor(monaco, byId('cpp-editor'), 'cpp', 'C++', cppText);
            cppEditor.onDidChangeModelContent(() => {
                if (editorMode !== 'cpp') return;
                cppText = cppEditor.getValue();
                clearTimeout(cppReportTimer);
                cppReportTimer = setTimeout(report, 250);
            });
        }
        cppEditor.focus();
    }).catch(error => {
        console.error(String(error));
        if (generation === projectGeneration)
            byId('cpp-status').textContent = text.cppEditorFailed;
    });
}
