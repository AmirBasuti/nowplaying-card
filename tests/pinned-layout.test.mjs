import assert from 'node:assert/strict';
import test from 'node:test';
import {pinnedPosition} from '../pinnedLayout.js';

const area = {x: 0, y: 32, width: 1920, height: 1048};
test('top right leaves the requested margin inside the work area', () => {
    assert.deepEqual(pinnedPosition(area, 450, 180, 'top-right', 16), {x: 1454, y: 48});
});
test('top left follows the work area origin', () => {
    assert.deepEqual(pinnedPosition(area, 450, 180, 'top-left', 16), {x: 16, y: 48});
});
test('bottom right remains above the bottom work area edge', () => {
    assert.deepEqual(pinnedPosition(area, 450, 180, 'bottom-right', 16), {x: 1454, y: 884});
});
test('bottom left remains inside the work area', () => {
    assert.deepEqual(pinnedPosition(area, 450, 180, 'bottom-left', 16), {x: 16, y: 884});
});
test('a monitor left of the primary display keeps its own coordinates', () => {
    assert.deepEqual(pinnedPosition({x: -1280, y: 0, width: 1280, height: 720}, 450, 180, 'top-right', 16), {x: -466, y: 16});
});
test('an oversized card is anchored at the visible work area origin', () => {
    assert.deepEqual(pinnedPosition({x: 100, y: 50, width: 320, height: 200}, 450, 300, 'bottom-right', 16), {x: 100, y: 50});
});
