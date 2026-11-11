import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeLyrics} from '../lyrics.js';
import * as timing from '../wordTiming.js';

const lyricsfile = `version: '1.0'
metadata:
  title: Example
  artist: Example
lines:
- text: 'من می‌روم 👋'
  start_ms: 1000
  end_ms: 4000
  words:
  - text: 'من '
    start_ms: 1000
    end_ms: 1300
  - text: 'می‌روم '
    start_ms: 1400
  - text: '👋'
    start_ms: 2500
`;
const legacy = {syncedLyrics: '[00:09]Legacy line', plainLyrics: 'Legacy line'};

test('uses genuine Lyricsfile word cues and exact UTF-8 ranges for Persian joining', () => {
    assert.deepEqual(decodeLyrics({...legacy, lyricsfile}), {
        kind: 'synced', text: '', lines: [{at: 1, end: 4, text: 'من می‌روم 👋', words: [
            {at: 1, end: 1.3, startByte: 0, endByte: 5},
            {at: 1.4, startByte: 5, endByte: 19},
            {at: 2.5, startByte: 19, endByte: 23},
        ]}],
    });
});

test('does not treat the availability flag or ordinary line timing as word timing', () => {
    const withoutWords = lyricsfile.slice(0, lyricsfile.indexOf('  words:'));
    for (const data of [{...legacy, hasWordSync: true},
        {...legacy, hasWordSync: true, lyricsfile: withoutWords}])
        assert.deepEqual(decodeLyrics(data), {kind: 'synced', text: '',
            lines: [{at: 9, text: 'Legacy line'}]});
});

test('falls back to usable legacy lyrics for unsupported or unsafe word documents', () => {
    for (const value of [lyricsfile.replace("'1.0'", "'9.0'"),
        lyricsfile.replace('من می‌روم 👋', 'Different full text'),
        lyricsfile.replace('start_ms: 1400', 'start_ms: -1'),
        lyricsfile.replace('end_ms: 1300', 'end_ms: 900'),
        lyricsfile.replace('start_ms: 1000', 'start_ms: 1000\n  start_ms: 1001'),
        lyricsfile.replace('title: Example', 'title: !custom Example'),
        lyricsfile.replace('title: Example\n  artist: Example',
            'title: &anchor Example\n  artist: *anchor'),
        'nested: '.repeat(40) + 'value', 'x'.repeat(600000)])
        assert.deepEqual(decodeLyrics({...legacy, lyricsfile: value}), {
            kind: 'synced', text: '', lines: [{at: 9, text: 'Legacy line'}],
        });
});

test('accepts intentional overlapping cue starts without inventing word ends', () => {
    const value = lyricsfile.replace('start_ms: 1400', 'start_ms: 1000');
    const line = decodeLyrics({lyricsfile: value}).lines[0];
    assert.equal(line.words[1].at, 1);
    assert.equal('end' in line.words[1], false);
});

test('rejects word segments that split a Unicode surrogate pair into invalid byte ranges', () => {
    const document = JSON.stringify({version: '1.0', metadata: {title: 'Example', artist: 'Example'},
        lines: [{text: '👋', start_ms: 0, words: [
            {text: '\uD83D', start_ms: 0}, {text: '\uDC4B', start_ms: 100},
        ]}]});
    assert.deepEqual(decodeLyrics({...legacy, lyricsfile: document}), {
        kind: 'synced', text: '', lines: [{at: 9, text: 'Legacy line'}],
    });
});

test('starts and orders a cue from its earliest genuine word without shifting provider ends', () => {
    const document = JSON.stringify({version: '1.0', metadata: {title: 'Example', artist: 'Example'},
        lines: [
            {text: 'Later', start_ms: 750, words: [{text: 'Later', start_ms: 750}]},
            {text: 'Early', start_ms: 1000, end_ms: 2000,
                words: [{text: 'Early', start_ms: 500, end_ms: 1500}]},
        ]});
    assert.deepEqual(decodeLyrics({lyricsfile: document}).lines, [
        {at: 0.5, end: 2, text: 'Early', words: [
            {at: 0.5, end: 1.5, startByte: 0, endByte: 5},
        ]},
        {at: 0.75, text: 'Later', words: [{at: 0.75, startByte: 0, endByte: 5}]},
    ]);
});

test('bounds word counts and line counts before returning display data', () => {
    const tooManyWords = `version: '1.0'\nmetadata: {title: Example, artist: Example}\nlines:\n` +
        `- text: '${'x'.repeat(10001)}'\n  start_ms: 0\n  words:\n` +
        '  - {text: x, start_ms: 0}\n'.repeat(10001);
    assert.deepEqual(decodeLyrics({...legacy, lyricsfile: tooManyWords}).lines,
        [{at: 9, text: 'Legacy line'}]);
    const tooManyLines = lyricsfile + '- {text: x, start_ms: 0}\n'.repeat(500);
    assert.deepEqual(decodeLyrics({...legacy, lyricsfile: tooManyLines}).lines,
        [{at: 9, text: 'Legacy line'}]);
});

test('fades actual word starts and recalculates after seeking backwards', () => {
    const line = {at: 0, text: 'A B', words: [
        {at: 0, end: 0.01, startByte: 0, endByte: 2},
        {at: 0.16, startByte: 2, endByte: 3},
    ]};
    assert.deepEqual(timing.wordHighlights?.(line, 0.08), [
        {startByte: 0, endByte: 2, progress: 0.5},
        {startByte: 2, endByte: 3, progress: 0},
    ]);
    assert.deepEqual(timing.wordHighlights(line, 1), [
        {startByte: 0, endByte: 2, progress: 1},
        {startByte: 2, endByte: 3, progress: 1},
    ]);
    assert.deepEqual(timing.wordHighlights(line, -1), [
        {startByte: 0, endByte: 2, progress: 0},
        {startByte: 2, endByte: 3, progress: 0},
    ]);
});

test('never estimates word progress for line-only lyrics or invalid positions', () => {
    for (const [line, at] of [[{at: 1, text: 'Whole line'}, 1.5],
        [null, 1], [{words: [{at: 1, startByte: 0, endByte: 5}]}, NaN]])
        assert.deepEqual(timing.wordHighlights?.(line, at), []);
});
