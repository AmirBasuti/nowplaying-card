// SPDX-License-Identifier: GPL-2.0-or-later

import {decodeWordLyrics} from './wordTiming.js';

export function parseLrc(text) {
    if (typeof text !== 'string')
        return [];
    const lines = [];
    let renderedCharacters = 0;
    for (const raw of text.split(/\r?\n/)) {
        const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        if (!stamps.length)
            continue;
        const last = stamps[stamps.length - 1];
        const content = raw.slice(last.index + last[0].length).trim();
        for (const stamp of stamps) {
            const seconds = Number(stamp[2]);
            if (seconds >= 60)
                continue;
            renderedCharacters += content.length;
            if (lines.length >= 500 || renderedCharacters > 50000)
                throw new Error('Expanded lyrics exceed display limits');
            const fraction = stamp[3] ? Number(stamp[3]) / 10 ** stamp[3].length : 0;
            lines.push({at: Number(stamp[1]) * 60 + seconds + fraction, text: content});
        }
    }
    return lines.sort((a, b) => a.at - b.at);
}

export function activeLineIndex(lines, positionSeconds) {
    let low = 0;
    let high = lines.length - 1;
    let active = -1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (lines[middle].at <= positionSeconds) {
            active = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return active;
}

export function decodeLyrics(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !['instrumental', 'plainLyrics', 'syncedLyrics', 'lyricsfile'].some(key => key in data))
        throw new Error('Invalid lyrics response');
    if (data.instrumental === true)
        return {kind: 'instrumental', lines: [], text: ''};
    const wordLyrics = decodeWordLyrics(data.lyricsfile);
    if (wordLyrics)
        return wordLyrics;
    const plain = typeof data.plainLyrics === 'string' ? data.plainLyrics.trim() : '';
    const synced = typeof data.syncedLyrics === 'string' ? data.syncedLyrics : '';
    if (plain.length > 50000 || synced.length > 200000)
        throw new Error('Lyrics response too large');
    const lines = parseLrc(synced);
    if (lines.some(line => line.text))
        return {kind: 'synced', lines, text: ''};
    if (plain)
        return {kind: 'plain', text: plain, lines: []};
    return {kind: 'missing', text: '', lines: []};
}

export function lyricsTrack(title, artists, album, lengthUs, spotifyId = null) {
    const artist = Array.isArray(artists)
        ? artists.find(value => typeof value === 'string' && value.trim()) : null;
    if (typeof title !== 'string' || !title.trim() || !artist)
        return null;
    const params = {track_name: title.trim(), artist_name: artist.trim()};
    if (typeof album === 'string' && album.trim())
        params.album_name = album.trim();
    if (typeof lengthUs === 'number' && Number.isFinite(lengthUs) && lengthUs > 0)
        params.duration = String(Math.round(lengthUs / 1000000));
    const track = {key: JSON.stringify(params), params};
    if (typeof spotifyId === 'string' && /^[A-Za-z0-9]{22}$/.test(spotifyId)) {
        track.spotifyId = spotifyId;
        track.key += `:${spotifyId}`;
    }
    return track;
}

export function retryDelaySeconds(header, nowMs = Date.now()) {
    if (typeof header !== 'string' || !header.trim())
        return 60;
    if (/^\d+$/.test(header.trim()))
        return Math.max(1, Number(header));
    const date = Date.parse(header);
    return Number.isFinite(date) ? Math.max(1, Math.ceil((date - nowMs) / 1000)) : 60;
}
