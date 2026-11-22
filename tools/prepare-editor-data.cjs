'use strict';

const {copyFileSync, mkdirSync, readFileSync, writeFileSync} = require('node:fs');
const {dirname, join} = require('node:path');

const [upstream, destination] = process.argv.slice(2);
const read = file => readFileSync(join(upstream, file), 'utf8');
const lessonsDirectory = join(destination, 'lessons');
mkdirSync(lessonsDirectory, {recursive: true});

// The paths occurring in the upstream Markdown are preserved beneath /lessons/.
const tutorialCards = ['tutorials', 'tutorials-v2'].flatMap(page => {
    const cards = JSON.parse(read(`docs/${page}.md`).match(/```codecard\s*([\s\S]*?)```/)[1]);
    return cards.filter(card => card.cardType === 'tutorial');
});
const covers = Object.fromEntries(tutorialCards.map(card => [card.url.split('/').pop(), card.imageUrl.slice(1)]));
covers['light-level-meter'] = 'static/mb/projects/light-level-meter.png';

function copyArtwork(relative) {
    const output = join(lessonsDirectory, relative);
    mkdirSync(dirname(output), {recursive: true});
    copyFileSync(join(upstream, 'docs', relative), output);
}

const artwork = {};
for (const [id, cover] of Object.entries(covers)) {
    copyArtwork(cover);
    const markdown = read(`docs/projects/${id}.md`);
    artwork[id] = [];
    for (const [, relative] of markdown.matchAll(/!\[[^\]]*\]\(\/(static\/mb\/projects\/[a-z0-9/._-]+)\)/g)) {
        if (relative !== cover) copyArtwork(relative);
        artwork[id].push(relative);
    }
}
writeFileSync(join(lessonsDirectory, 'catalog.js'),
    'window.studioLessonArtwork = ' + JSON.stringify(artwork, null, 2) + ';\n');
writeFileSync(join(lessonsDirectory, 'lesson-covers.js'),
    'window.studioLessonCovers = ' + JSON.stringify(covers, null, 2) + ';\n');

const iconSource = read('libs/core/icons.ts');
const iconResources = JSON.parse(read('libs/core/icons.jres'));
const iconNames = new Map(Array.from(iconSource.matchAll(
    /\/\/% block="([^"]+)"\s+\/\/% jres=icons\.(\w+)\s+(\w+)/g),
([, title, id, key]) => [key, {title, image: iconResources[id]?.icon}]));
const icons = {};
for (const [, key, pixels] of iconSource.matchAll(
    /case IconNames\.(\w+): return images\.createImage\(`([.#\s]+)`\)/g)) {
    const metadata = iconNames.get(key);
    const pattern = pixels.replace(/\s/g, '');
    if (metadata?.image && pattern.length === 25)
        icons[key] = {...metadata, pattern};
}
if (!icons.Heart || !icons.Happy || !icons.Sad)
    throw Error('Expected the upstream Heart, Happy and Sad assets.');

const ledSource = read('sim/state/ledmatrix.ts');
const font = Array.from(ledSource.match(/export const FONT_DATA = \[([^\]]+)\]/)[1]
    .matchAll(/0x[\da-f]+/gi), ([value]) => Number(value));
if (font.length < 95 * 5 || font.length % 5)
    throw Error('Unexpected upstream LED font format.');

writeFileSync(join(lessonsDirectory, 'microbit-display.js'),
    'window.studioMicrobitDisplay = ' + JSON.stringify({icons, font}) + ';\n');
writeFileSync(join(destination, 'licenses', 'MakeCode-MicroPython-icon-LICENSE.txt'),
    iconSource.match(/^\/\*\n([\s\S]*?)\n\*\//)[1] + '\n');
