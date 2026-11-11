import assert from 'node:assert/strict';
import test from 'node:test';
import {spotifyTrackId, decodeSpotifyLyrics} from '../spotifyLyrics.js';

const id = '4uLU6hMCjMI75M1A2tKUQC';

test('extracts exact Spotify track identities from MPRIS and Web Player values', () => {
    for (const value of [id, `spotify:track:${id}`, `/com/spotify/track/${id}`,
        `https://open.spotify.com/track/${id}?si=example`,
        `https://open.spotify.com/intl-fa/track/${id}`])
        assert.equal(spotifyTrackId(value), id);
    assert.equal(spotifyTrackId(null, 'spotify:episode:invalid', `spotify:track:${id}`), id);
});

test('rejects unrelated URLs, partial IDs, excessive input and non-track identities', () => {
    for (const value of [undefined, {}, 42, `${id}A`, id.slice(1),
        `spotify:episode:${id}`, `https://example.com/track/${id}`,
        `https://open.spotify.com.evil/track/${id}`,
        `https://open.spotify.com/track/${id}/extra`,
        `text spotify:track:${id}`, 'x'.repeat(10000)])
        assert.equal(spotifyTrackId(value), null);
});

test('decodes millisecond cues in seconds and preserves Persian joining and blank cues', () => {
    assert.deepEqual(decodeSpotifyLyrics({lyrics: {syncType: 'LINE_SYNCED', lines: [
        {startTimeMs: '3500', words: 'من می\u200cروم', syllables: [], endTimeMs: '0'},
        {startTimeMs: '1250', words: 'Example line', syllables: [], endTimeMs: '0'},
        {startTimeMs: '4000', words: '', syllables: [], endTimeMs: '0'},
    ]}}), {kind: 'synced', lines: [
        {at: 1.25, text: 'Example line'}, {at: 3.5, text: 'من می\u200cروم'},
        {at: 4, text: ''},
    ], text: ''});
});

test('returns plain unsynced lyrics, missing empty lyrics, and explicit instrumental tracks', () => {
    assert.deepEqual(decodeSpotifyLyrics({lyrics: {syncType: 'UNSYNCED', lines: [
        {startTimeMs: '0', words: 'آزمایش'}, {startTimeMs: '0', words: 'Second line'},
    ]}}), {kind: 'plain', lines: [], text: 'آزمایش\nSecond line'});
    assert.equal(decodeSpotifyLyrics({lyrics: {syncType: 'LINE_SYNCED', lines: []}}).kind, 'missing');
    assert.equal(decodeSpotifyLyrics({lyrics: {
        syncType: 'UNSYNCED', lines: [], instrumental: true,
    }}).kind, 'instrumental');
});

test('rejects malformed lyrics and unsafe cues instead of returning a partial song', () => {
    for (const data of [null, [], {}, {lyrics: {}},
        {lyrics: {syncType: 'WORD_SYNCED', lines: []}},
        {lyrics: {syncType: 'LINE_SYNCED', lines: [{startTimeMs: '-1', words: 'x'}]}},
        {lyrics: {syncType: 'LINE_SYNCED', lines: [{startTimeMs: '', words: 'x'}]}},
        {lyrics: {syncType: 'LINE_SYNCED', lines: [{startTimeMs: 'NaN', words: 'x'}]}},
        {lyrics: {syncType: 'LINE_SYNCED', lines: [{startTimeMs: '1e9', words: 'x'}]}},
        {lyrics: {syncType: 'LINE_SYNCED', lines: [{startTimeMs: '0', words: {}}]}}])
        assert.throws(() => decodeSpotifyLyrics(data), /Spotify lyrics/);
});

test('bounds Spotify line count and aggregate display text', () => {
    assert.throws(() => decodeSpotifyLyrics({lyrics: {syncType: 'LINE_SYNCED',
        lines: Array.from({length: 501}, () => ({startTimeMs: '0', words: 'x'}))}}));
    assert.throws(() => decodeSpotifyLyrics({lyrics: {syncType: 'UNSYNCED',
        lines: [{words: 'x'.repeat(50001)}]}}));
});
