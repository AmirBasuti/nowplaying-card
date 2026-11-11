// SPDX-License-Identifier: GPL-2.0-or-later

import {load, JSON_SCHEMA} from './vendor/js-yaml.mjs';

const encoder = new TextEncoder();
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validTime = value => Number.isSafeInteger(value) && value >= 0 && value <= 86400000;

// Fade from each real start cue. The animation duration is presentation only;
// it does not invent a word end when the provider supplies none.
export function wordHighlights(line, positionSeconds) {
    if (!Array.isArray(line?.words) || !Number.isFinite(positionSeconds))
        return [];
    return line.words.map(({at, startByte, endByte}) => ({startByte, endByte,
        progress: Math.max(0, Math.min(1, (positionSeconds - at) / 0.16))}));
}

// Lyricsfile is an optional enhancement. Invalid or unsupported documents leave
// the provider's legacy line/plain lyrics available to the caller.
export function decodeWordLyrics(document) {
    if (typeof document !== 'string' || document.length > 512000 ||
        encoder.encode(document).length > 512000)
        return null;
    try {
        const data = load(document, {schema: JSON_SCHEMA, maxDepth: 16, maxAliases: 0});
        if (!isRecord(data) || data.version !== '1.0' || !isRecord(data.metadata) ||
            data.metadata.instrumental === true ||
            data.metadata.offset_ms !== undefined && data.metadata.offset_ms !== 0 ||
            !Array.isArray(data.lines) || data.lines.length > 500)
            return null;
        const lines = [];
        let characters = 0;
        let wordCount = 0;
        let hasWords = false;
        for (const line of data.lines) {
            if (!isRecord(line) || typeof line.text !== 'string' ||
                !validTime(line.start_ms) ||
                line.end_ms !== undefined && (!validTime(line.end_ms) || line.end_ms < line.start_ms))
                return null;
            characters += line.text.length + 1;
            if (characters > 50000)
                return null;
            const cue = {at: line.start_ms / 1000, text: line.text};
            if (line.end_ms !== undefined)
                cue.end = line.end_ms / 1000;
            if (line.words !== undefined) {
                if (!Array.isArray(line.words) || (wordCount += line.words.length) > 10000)
                    return null;
                const words = [];
                const parts = [];
                const lineBytes = encoder.encode(line.text);
                let byteOffset = 0;
                for (const word of line.words) {
                    if (!isRecord(word) || typeof word.text !== 'string' ||
                        !validTime(word.start_ms) || word.end_ms !== undefined &&
                        (!validTime(word.end_ms) || word.end_ms < word.start_ms))
                        return null;
                    const wordBytes = encoder.encode(word.text);
                    const endByte = byteOffset + wordBytes.length;
                    // Every segment must match a whole UTF-8 slice. Encoding
                    // separately split surrogate pairs would insert replacements.
                    if (endByte > lineBytes.length || wordBytes.some((byte, index) =>
                        byte !== lineBytes[byteOffset + index]))
                        return null;
                    const segment = {at: word.start_ms / 1000, startByte: byteOffset, endByte};
                    if (word.end_ms !== undefined)
                        segment.end = word.end_ms / 1000;
                    if (endByte > byteOffset)
                        words.push(segment);
                    parts.push(word.text);
                    byteOffset = endByte;
                }
                if (line.words.length &&
                    (parts.join('') !== line.text || byteOffset !== lineBytes.length))
                    return null;
                if (words.length) {
                    cue.words = words;
                    cue.at = words.reduce((earliest, word) => Math.min(earliest, word.at), cue.at);
                    hasWords = true;
                }
            }
            lines.push(cue);
        }
        return hasWords && lines.some(line => line.text) ?
            {kind: 'synced', lines: lines.sort((a, b) => a.at - b.at), text: ''} : null;
    } catch {
        return null;
    }
}
