// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {LyricsProvider} from './lyricsProvider.js';
import {SpotifyLyricsProvider} from './spotifyLyricsProvider.js';
import {spotifyTrackId} from './spotifyLyrics.js';

const cancelled = () => new GLib.Error(Gio.io_error_quark(),
    Gio.IOErrorEnum.CANCELLED, 'Lyrics lookup cancelled');
const hasWords = value => value?.kind === 'synced' &&
    value.lines.some(line => Array.isArray(line.words) && line.words.length > 0);

export class LyricsService {
    constructor(spotifyProvider = new SpotifyLyricsProvider(), fallbackProvider = new LyricsProvider()) {
        this._spotify = spotifyProvider;
        this._fallback = fallbackProvider;
        this._destroyed = false;
    }

    async lookup(track, cancellable) {
        this._checkCancelled(cancellable);
        if (spotifyTrackId(track?.spotifyId)) {
            let value;
            try {
                value = await this._spotify.lookup(track, cancellable);
            } catch (error) {
                this._checkCancelled(cancellable);
                if (error.matches?.(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))
                    throw cancelled();
            }
            this._checkCancelled(cancellable);
            if (['synced', 'plain', 'instrumental'].includes(value?.kind)) {
                if (value.kind === 'synced' && !hasWords(value)) {
                    try {
                        const enhanced = await this._fallback.lookup(track, cancellable);
                        this._checkCancelled(cancellable);
                        if (hasWords(enhanced))
                            return {...enhanced, source: 'LRCLIB'};
                    } catch (error) {
                        this._checkCancelled(cancellable);
                        if (error.matches?.(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))
                            throw cancelled();
                        // The primary result survives an optional word-timing failure.
                    }
                }
                return {...value, source: 'Spotify'};
            }
        }
        this._checkCancelled(cancellable);
        const value = await this._fallback.lookup(track, cancellable);
        this._checkCancelled(cancellable);
        return {...value, source: 'LRCLIB'};
    }

    _checkCancelled(cancellable) {
        if (this._destroyed || cancellable?.is_cancelled())
            throw cancelled();
    }

    destroy() {
        this._destroyed = true;
        this._spotify.destroy();
        this._fallback.destroy();
    }
}
