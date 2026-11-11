// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import {decodeLyrics, retryDelaySeconds} from './lyrics.js';

const cache = new Map();
let blockedUntil = 0;
const CACHE_LIMIT = 50;

export class LyricsProvider {
    constructor(baseUrl = 'https://lrclib.net') {
        this._baseUrl = baseUrl;
        this._session = new Soup.Session({
            timeout: 12,
            user_agent: 'NowPlayingCardPinned/1.1 (https://github.com/epogonii/nowplaying-card)',
        });
    }

    async lookup(track, cancellable) {
        const cacheKey = `${this._baseUrl}:${track.key}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            cache.delete(cacheKey);
            cache.set(cacheKey, cached);
            return cached.value;
        }
        if (Date.now() < blockedUntil)
            return {kind: 'rate-limited'};
        const query = Object.entries(track.params)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
        const message = Soup.Message.new('GET', `${this._baseUrl}/api/get?${query}`);
        const bytes = await new Promise((resolve, reject) => {
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT,
                cancellable, (session, result) => {
                    try {
                        resolve(session.send_and_read_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                });
        });
        // The enum-typed get_status() can throw for HTTP codes absent from
        // an older libsoup enum (including 429). This property is a guint.
        const status = message.status_code;
        if (status === 429) {
            blockedUntil = Date.now() + 1000 * retryDelaySeconds(
                message.get_response_headers().get_one('Retry-After'));
            return {kind: 'rate-limited'};
        }
        let value;
        if (status === 404) {
            value = {kind: 'missing', lines: [], text: ''};
        } else {
            if (status !== 200 || bytes.get_size() > 1024 * 1024)
                throw new Error(`Lyrics request failed (${status})`);
            value = decodeLyrics(JSON.parse(new TextDecoder().decode(bytes.get_data())));
        }
        cache.set(cacheKey, {value, expires: Date.now() +
            (value.kind === 'missing' ? 10 * 60 * 1000 : 24 * 60 * 60 * 1000)});
        while (cache.size > CACHE_LIMIT)
            cache.delete(cache.keys().next().value);
        return value;
    }

    destroy() {
        this._session.abort();
    }
}
