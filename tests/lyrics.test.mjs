import assert from 'node:assert/strict';

test('Spotify track identity distinguishes equal titles without changing LRCLIB parameters', () => {
    const first = lyricsTrack('Same title', ['Artist'], 'Album', 100000000, 'A'.repeat(22));
    const second = lyricsTrack('Same title', ['Artist'], 'Album', 100000000, 'B'.repeat(22));
    assert.notEqual(first.key, second.key);
    assert.equal(first.spotifyId, 'A'.repeat(22));
    assert.deepEqual(first.params, second.params);
    assert.equal(lyricsTrack('Title', ['Artist'], '', 100000000, 'invalid').spotifyId, undefined);
});
import test from 'node:test';
import {parseLrc, activeLineIndex, decodeLyrics, lyricsTrack, retryDelaySeconds} from '../lyrics.js';

test('parses and orders timed lines without losing non-Latin text', () => {
    assert.deepEqual(parseLrc('[ar:Test]\n[00:03.50]خط دوم\n[00:01.25]First test line'), [
        {at: 1.25, text: 'First test line'}, {at: 3.5, text: 'خط دوم'},
    ]);
});
test('repeated timestamps repeat a line and blank cues remain valid', () => {
    assert.deepEqual(parseLrc('[00:02][00:05.12]Test chorus\n[00:07.000]'), [
        {at: 2, text: 'Test chorus'}, {at: 5.12, text: 'Test chorus'}, {at: 7, text: ''},
    ]);
});
test('ignores malformed timestamps and rejects seconds outside a minute', () => {
    assert.deepEqual(parseLrc('[bad]No\n[00:99]No\n[01:02.3]Yes'), [{at: 62.3, text: 'Yes'}]);
});
test('finds the active line at boundaries and after seeking backwards', () => {
    const lines = [{at: 2, text: 'A'}, {at: 5, text: 'B'}, {at: 8, text: ''}];
    assert.equal(activeLineIndex(lines, 1.99), -1);
    assert.equal(activeLineIndex(lines, 2), 0);
    assert.equal(activeLineIndex(lines, 7), 1);
    assert.equal(activeLineIndex(lines, 8), 2);
    assert.equal(activeLineIndex(lines, 3), 0);
    assert.equal(activeLineIndex([], 10), -1);
});
test('prefers usable timed lyrics and otherwise falls back to plain text', () => {
    assert.equal(decodeLyrics({syncedLyrics: '[00:01]Test line', plainLyrics: 'Plain', instrumental: false}).kind, 'synced');
    assert.deepEqual(decodeLyrics({syncedLyrics: 'invalid', plainLyrics: 'آزمایش\nSecond line', instrumental: false}),
        {kind: 'plain', text: 'آزمایش\nSecond line', lines: []});
});
test('distinguishes instrumental, missing, and malformed responses', () => {
    assert.equal(decodeLyrics({instrumental: true}).kind, 'instrumental');
    assert.equal(decodeLyrics({instrumental: false, plainLyrics: null, syncedLyrics: null}).kind, 'missing');
    assert.throws(() => decodeLyrics('<html>error</html>'));
    assert.throws(() => decodeLyrics({unexpected: true}));
});
test('track identity changes with artist and duration and ignores absent metadata', () => {
    const a = lyricsTrack('Test Song', ['Test Artist', 'Guest'], 'Test Album', 123456789);
    assert.deepEqual(a.params, {track_name: 'Test Song', artist_name: 'Test Artist', album_name: 'Test Album', duration: '123'});
    assert.notEqual(a.key, lyricsTrack('Test Song', ['Other Artist'], 'Test Album', 123456789).key);
    assert.notEqual(a.key, lyricsTrack('Test Song', ['Test Artist'], 'Test Album', 200000000).key);
    assert.equal(lyricsTrack('', ['Artist'], '', 0), null);
    assert.equal(lyricsTrack('Song', [], '', 0), null);
});
test('honors Retry-After seconds or HTTP dates and has a safe fallback', () => {
    assert.equal(retryDelaySeconds('120', 0), 120);
    assert.equal(retryDelaySeconds('Thu, 01 Jan 1970 00:02:00 GMT', 0), 120);
    assert.equal(retryDelaySeconds('invalid', 0), 60);
    assert.equal(retryDelaySeconds(null, 0), 60);
});

test('rejects timestamp expansion before it can create thousands of actors', () => {
    assert.throws(() => decodeLyrics({instrumental: false,
        syncedLyrics: '[00:01]'.repeat(14000) + 'x'.repeat(100000), plainLyrics: null}));
});

test('bounds the aggregate text expanded by repeated timestamps', () => {
    assert.throws(() => decodeLyrics({instrumental: false,
        syncedLyrics: '[00:01]'.repeat(400) + 'x'.repeat(1000), plainLyrics: null}));
});

test('bounds line count even when each repeated line is short', () => {
    assert.throws(() => decodeLyrics({instrumental: false,
        syncedLyrics: '[00:01]'.repeat(600) + 'short', plainLyrics: null}));
});
