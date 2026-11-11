import test from 'node:test';
import assert from 'node:assert/strict';
import {lyricsDirection, lyricsEmphasis} from '../lyricsPresentation.js';

test('uses the first strong letter for Persian, mixed text and Latin lines', () => {
    assert.equal(lyricsDirection('♪ ۱۲۳ «می‌خوانم، برای تو»'), 'rtl');
    assert.equal(lyricsDirection('♪ 123 — a new day'), 'ltr');
    assert.equal(lyricsDirection('تو و Spotify'), 'rtl');
    assert.equal(lyricsDirection('Spotify و تو'), 'ltr');
    assert.equal(lyricsDirection('  ۱۲۳ 🎵 '), 'ltr');
});

test('provides readable surrounding cues with gentle emphasis and a bounded gradient', () => {
    assert.deepEqual(lyricsEmphasis(5, 5), {opacity: 255, scale: 1, color: [255, 248, 235], blur: 0});
    assert.deepEqual(lyricsEmphasis(4, 5), {opacity: 245, scale: 0.84, color: [177, 184, 201], blur: 1});
    assert.deepEqual(lyricsEmphasis(6, 5), lyricsEmphasis(4, 5));
    assert.deepEqual(lyricsEmphasis(3, 5), {opacity: 240, scale: 0.84, color: [145, 154, 177], blur: 1});
    assert.deepEqual(lyricsEmphasis(0, 5), {opacity: 225, scale: 0.84, color: [105, 114, 138], blur: 0});
    assert.deepEqual(lyricsEmphasis(0, -1), lyricsEmphasis(0, 5));
});

test('keeps strong foreground contrast on a light theme too', () => {
    const active = lyricsEmphasis(5, 5, true);
    const neighbor = lyricsEmphasis(4, 5, true);
    assert.deepEqual(active.color, [28, 31, 42]);
    assert.ok(active.color[0] < neighbor.color[0] - 60);
    assert.equal(active.blur, 0);
});
