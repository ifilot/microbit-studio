'use strict';

const cppSensorKeys = ['lightLevel', 'temperature', 'X', 'Y', 'Z', 'magneticForceX', 'magneticForceY', 'magneticForceZ'];
const cppButtonIds = {A: 1, B: 2, AB: 3};
let cppSimulationId = 0;

function cppInput() {
    const buttons = (pressedButtons.has('A') ? 1 : 0) | (pressedButtons.has('B') ? 2 : 0) |
        (pressedButtons.has('AB') ? 4 : 0);
    return {buttons, sensors: cppSensorKeys.map(sensorValue)};
}

function updateCppInput() {
    if (cppSimulationId) bridge.cppSimulation({type: 'input', id: cppSimulationId, ...cppInput()});
}

function sendCppEvent(button) {
    if (!cppSimulationId) return;
    const source = button === 'Shake' ? 13 : cppButtonIds[button];
    bridge.cppSimulation({type: 'event', id: cppSimulationId, source, value: source === 13 ? 11 : 3});
}

function showCppSimulationStatus(status = '', problem = '') {
    byId('cpp-status').textContent = status;
    const details = byId('cpp-problems');
    details.hidden = !problem;
    details.querySelector('pre').textContent = problem;
}

function startCppSimulation(id) {
    cppSimulationId = id;
    showCppSimulationStatus(text.cppSimBuilding);
    bridge.cppSimulation({type: 'run', id, source: cppText, font: window.studioMicrobitDisplay.font, ...cppInput()});
}

function stopCppSimulation() {
    if (!cppSimulationId) return;
    bridge.cppSimulation({type: 'stop', id: cppSimulationId});
    cppSimulationId = 0;
    showCppSimulationStatus();
}

function receiveCppSimulation(message) {
    if (editorMode !== 'cpp' || message.id !== cppSimulationId) return;
    switch (message.type) {
    case 'started': showCppSimulationStatus(); break;
    case 'frame':
        for (let i = 0; i < pixels.length; i++) pixels[i] = Boolean(message.bits & (1 << i));
        paint();
        break;
    case 'sensor': {
        const slider = sensorControls.get(cppSensorKeys[message.index]);
        if (slider) {
            slider.parentElement.hidden = false;
            byId('simulation-sensors').hidden = false;
        }
        break;
    }
    case 'shake': byId('shake').hidden = false; break;
    case 'finished':
    case 'error': {
        cppSimulationId = 0;
        setRunning(false);
        if (message.type === 'error') {
            const status = {toolchain: text.cppSimToolchain, build: text.cppSimBuildError,
                runtime: text.cppSimRuntimeError, size: text.cppSimSize}[message.kind] ?? text.cppSimRuntimeError;
            showCppSimulationStatus(status, message.message ?? '');
        }
        break;
    }
    }
}
