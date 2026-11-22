'use strict';

function* displayFrames(font, text, scroll = true) {
    const rows = [...text].map(character => {
        const at = (character.charCodeAt(0) - 32) * 5;
        return at >= 0 && at + 5 <= font.length ? font.slice(at, at + 5) : [0, 0, 0, 0, 0];
    });
    const count = scroll ? Math.max(1, (rows.length - 1) * 6 + 1) : 1;
    for (let offset = 0; offset < count; offset++) {
        let bits = 0;
        for (let i = 0; i < 25; i++) {
            const x = offset + i % 5;
            const col = x % 6;
            const row = rows[Math.floor(x / 6)]?.[Math.floor(i / 5)] ?? 0;
            if (col < 5 && (row & (1 << (4 - col)))) bits |= 1 << i;
        }
        yield bits;
    }
}

if (typeof module === 'object') module.exports = displayFrames;
