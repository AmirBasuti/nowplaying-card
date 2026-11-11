// SPDX-License-Identifier: GPL-2.0-or-later

export function spotifyTrackId(...values) {
    for (const value of values) {
        if (typeof value !== 'string' || value.length > 2048)
            continue;
        const match = value.match(/^(?:spotify:track:|\/com\/spotify\/track\/)?([A-Za-z0-9]{22})$/) ??
            value.match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})(?:[?#][^\s]*)?$/);
        if (match)
            return match[1];
    }
    return null;
}

export function decodeSpotifyLyrics(data) {
    const lyrics = data?.lyrics;
    if (!lyrics || typeof lyrics !== 'object' || Array.isArray(lyrics) ||
        !['LINE_SYNCED', 'UNSYNCED'].includes(lyrics.syncType) ||
        !Array.isArray(lyrics.lines) || lyrics.lines.length > 500)
        throw new Error('Invalid Spotify lyrics response');
    if (lyrics.instrumental === true)
        return {kind: 'instrumental', lines: [], text: ''};
    let characters = 0;
    const lines = lyrics.lines.map(line => {
        if (!line || typeof line.words !== 'string')
            throw new Error('Invalid Spotify lyrics line');
        characters += line.words.length + 1;
        if (characters > 50000)
            throw new Error('Spotify lyrics exceed display limits');
        const text = line.words.trim();
        if (lyrics.syncType === 'UNSYNCED')
            return {text};
        const raw = line.startTimeMs;
        const millis = typeof raw === 'number' ||
            typeof raw === 'string' && /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
        if (!Number.isSafeInteger(millis) || millis < 0 || millis > 86400000)
            throw new Error('Invalid Spotify lyrics timestamp');
        return {at: millis / 1000, text};
    });
    if (!lines.some(line => line.text))
        return {kind: 'missing', lines: [], text: ''};
    if (lyrics.syncType === 'LINE_SYNCED')
        return {kind: 'synced', lines: lines.sort((a, b) => a.at - b.at), text: ''};
    return {kind: 'plain', lines: [], text: lines.map(line => line.text).join('\n').trim()};
}
