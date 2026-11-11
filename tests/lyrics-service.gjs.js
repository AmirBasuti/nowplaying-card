import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {LyricsService} from '../lyricsService.js';

const track = {spotifyId: 'A'.repeat(22), key: 'example',
    params: {track_name: 'Example', artist_name: 'Example', duration: '100'}};
const synced = {kind: 'synced', text: '', lines: [{at: 1, text: 'Original'}]};
const words = {kind: 'synced', text: '', lines: [{at: 1, text: 'Timed words', words: [
    {at: 1, startByte: 0, endByte: 6}, {at: 1.5, startByte: 6, endByte: 11},
]}]};
const missing = {kind: 'missing', text: '', lines: []};
const equal = (actual, expected, message) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(message + ': ' + JSON.stringify(actual));
};
const provider = lookup => ({lookup, destroy() {}});

async function resolve(spotify, fallback, cancellable = null, identity = track) {
    const service = new LyricsService(provider(spotify), provider(fallback));
    try {
        return await service.lookup(identity, cancellable);
    } finally {
        service.destroy();
    }
}

switch (ARGV[0]) {
case 'words':
    equal(await resolve(async () => synced, async () => words),
        {...words, source: 'LRCLIB'}, 'Genuine word cues should improve Spotify line timing');
    break;
case 'preserve':
    for (const fallback of [synced, {kind: 'plain', text: 'Plain', lines: []},
        missing, {kind: 'rate-limited'}])
        equal(await resolve(async () => synced, async () => fallback),
            {...synced, source: 'Spotify'}, 'A line/plain/missing result should preserve Spotify');
    equal(await resolve(async () => synced, async () => { throw new Error('Network unavailable'); }),
        {...synced, source: 'Spotify'}, 'An optional lookup failure should preserve Spotify');
    break;
case 'direct':
    equal(await resolve(async () => missing, async () => words),
        {...words, source: 'LRCLIB'}, 'Missing Spotify lyrics should use direct word fallback');
    equal(await resolve(async () => missing, async () => synced, null, {...track, spotifyId: null}),
        {...synced, source: 'LRCLIB'}, 'Non-Spotify tracks should use normal direct fallback');
    break;
case 'primary': {
    let supplementalLookups = 0;
    for (const value of [words, {kind: 'plain', lines: [], text: 'Original plain'},
        {kind: 'instrumental', lines: [], text: ''}])
        equal(await resolve(async () => value, async () => {
            supplementalLookups++;
            return words;
        }), {...value, source: 'Spotify'}, 'Usable primary lyrics should stay primary');
    equal(supplementalLookups, 0, 'No supplemental request is needed for existing words/plain/instrumental');
    break;
}
case 'cancel': {
    for (const withToken of [true, false]) {
        const cancellable = withToken ? new Gio.Cancellable() : null;
        let result = 'resolved';
        try {
            await resolve(async () => synced, async () => {
                cancellable?.cancel();
                throw new GLib.Error(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED, 'Cancelled');
            }, cancellable);
        } catch (error) {
            result = error.matches?.(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED) ? 'cancelled' : 'other';
        }
        equal(result, 'cancelled', 'Supplemental lookup cancellation must remain cancellation');
    }
    break;
}
default:
    throw new Error('Unknown fixture case');
}
print('passed');
