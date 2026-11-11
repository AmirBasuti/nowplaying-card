// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Secret from 'gi://Secret';
import Soup from 'gi://Soup?version=3.0';
import {retryDelaySeconds} from './lyrics.js';
import {decodeSpotifyLyrics, spotifyTrackId} from './spotifyLyrics.js';

const ENDPOINTS = Object.freeze({
    serverTime: 'https://open.spotify.com/api/server-time',
    secret: 'https://raw.githubusercontent.com/xyloflake/spot-secrets-go/main/secrets/secretDict.json',
    token: 'https://open.spotify.com/api/token',
    lyrics: 'https://spclient.wg.spotify.com/color-lyrics/v2/track/',
});
const CACHE_LIMIT = 50;
const missing = () => ({kind: 'missing', lines: [], text: '', source: 'Spotify'});
const cancelled = () => new GLib.Error(Gio.io_error_quark(),
    Gio.IOErrorEnum.CANCELLED, 'Lyrics lookup cancelled');

function readCredential(cancellable) {
    const schema = new Secret.Schema('org.gnome.shell.extensions.nowplaying-pinned.Spotify',
        Secret.SchemaFlags.NONE, {account: Secret.SchemaAttributeType.STRING});
    return new Promise((resolve, reject) => {
        Secret.password_lookup(schema, {account: 'spotify-sp-dc'}, cancellable,
            (_source, result) => {
                try {
                    resolve(Secret.password_lookup_finish(result));
                } catch {
                    reject(new Error('Spotify login unavailable'));
                }
            });
    });
}

function fixtureEndpoints(endpoints, credentialReader) {
    if (!endpoints)
        return ENDPOINTS;
    // Overrides are only for a local fake-auth fixture. A real keyring cookie
    // must never be sent to an overridden destination.
    if (typeof credentialReader !== 'function')
        throw new Error('Spotify fixture requires a credential reader');
    const result = {};
    for (const key of Object.keys(ENDPOINTS)) {
        const url = endpoints[key];
        if (typeof url !== 'string' || url.length > 2048)
            throw new Error('Invalid Spotify fixture endpoint');
        const uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
        if (uri.get_scheme() !== 'http' || uri.get_host() !== '127.0.0.1' ||
            uri.get_port() < 1 || uri.get_port() > 65535 || uri.get_userinfo() ||
            uri.get_query() || uri.get_fragment())
            throw new Error('Spotify fixture endpoints must be local');
        result[key] = url;
    }
    return result;
}

function totp(data, serverTime) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).length > 1000 || !Number.isSafeInteger(serverTime) ||
        serverTime < 0 || serverTime > 1000000000000)
        throw new Error('Spotify authentication unavailable');
    const versions = Object.keys(data).filter(key => /^\d{1,6}$/.test(key))
        .sort((a, b) => Number(b) - Number(a));
    const version = versions[0];
    const values = data[version];
    if (!Array.isArray(values) || !values.length || values.length > 128 ||
        !values.every(value => Number.isInteger(value) && value >= 0 && value <= 255))
        throw new Error('Spotify authentication unavailable');
    const key = new TextEncoder().encode(values.map((value, index) =>
        String(value ^ (index % 33 + 9))).join(''));
    const counter = Math.floor(serverTime / 30);
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, Math.floor(counter / 0x100000000), false);
    view.setUint32(4, counter % 0x100000000, false);
    const hmac = GLib.Hmac.new(GLib.ChecksumType.SHA1, key);
    hmac.update(bytes);
    const digest = hmac.get_string().match(/../g).map(hex => parseInt(hex, 16));
    const offset = digest[19] & 15;
    const value = (digest[offset] & 127) * 0x1000000 +
        digest[offset + 1] * 0x10000 + digest[offset + 2] * 0x100 + digest[offset + 3];
    return {code: String(value % 1000000).padStart(6, '0'), version};
}

export class SpotifyLyricsProvider {
    constructor(options = {}) {
        this._endpoints = fixtureEndpoints(options.endpoints, options.credentialReader);
        this._credentialReader = options.credentialReader ?? readCredential;
        this._now = options.now ?? Date.now;
        this._timeoutMs = Math.max(1, Math.min(12000, options.timeoutMs ?? 12000));
        this._session = new Soup.Session({timeout: 12, user_agent: 'Mozilla/5.0',
            max_conns: 4, max_conns_per_host: 2});
        this._cache = new Map();
        this._operations = new Set();
        this._token = null;
        this._blockedUntil = 0;
        this._authRetryAt = 0;
        this._destroyed = false;
    }

    async lookup(track, cancellable = null) {
        if (this._destroyed || cancellable?.is_cancelled())
            throw cancelled();
        const id = spotifyTrackId(track?.spotifyId);
        if (!id)
            return missing();
        const cached = this._cache.get(id);
        if (cached?.expires > this._now()) {
            this._cache.delete(id);
            this._cache.set(id, cached);
            return cached.value;
        }
        if (this._now() < this._blockedUntil)
            return {kind: 'rate-limited', source: 'Spotify'};
        if (this._now() < this._authRetryAt)
            return missing();

        const operation = new Gio.Cancellable();
        this._operations.add(operation);
        const callerId = cancellable?.connect(() => operation.cancel()) ?? 0;
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._timeoutMs, () => {
            timeoutId = 0;
            operation.cancel();
            return GLib.SOURCE_REMOVE;
        });
        try {
            const token = await this._getToken(operation);
            const response = await this._request(
                `${this._endpoints.lyrics}${id}?format=json&market=from_token`,
                {'Authorization': `Bearer ${token}`, 'App-platform': 'WebPlayer'},
                operation, 1024 * 1024);
            if (operation.is_cancelled())
                throw cancelled();
            if (response.status === 429)
                return {kind: 'rate-limited', source: 'Spotify'};
            if (response.status === 401 || response.status === 403) {
                this._token = null;
                this._authRetryAt = this._now() + 60000;
                return missing();
            }
            const value = response.status === 200 ?
                {...decodeSpotifyLyrics(response.data), source: 'Spotify'} : missing();
            this._remember(id, value, response.status !== 200 && response.status !== 404 ?
                30000 : value.kind === 'missing' ? 600000 : 86400000);
            return value;
        } catch {
            if (this._destroyed || cancellable?.is_cancelled())
                throw cancelled();
            if (this._now() < this._blockedUntil)
                return {kind: 'rate-limited', source: 'Spotify'};
            // Network, schema and deadline failures are optional-source failures.
            // Never expose an underlying error which might contain request data.
            return missing();
        } finally {
            if (timeoutId)
                GLib.Source.remove(timeoutId);
            if (callerId)
                cancellable.disconnect(callerId);
            this._operations.delete(operation);
        }
    }

    _remember(id, value, ttl) {
        this._cache.delete(id);
        this._cache.set(id, {value, expires: this._now() + ttl});
        while (this._cache.size > CACHE_LIMIT)
            this._cache.delete(this._cache.keys().next().value);
    }

    async _getToken(cancellable) {
        if (this._token?.expires > this._now() + 30000)
            return this._token.value;
        try {
            const cookie = await this._credentialReader(cancellable);
            if (typeof cookie !== 'string' ||
                !/^[A-Za-z0-9._~+/%=-]{1,4096}$/.test(cookie))
                throw new Error('Spotify login unavailable');
            const time = await this._request(this._endpoints.serverTime, {}, cancellable, 4096);
            if (time.status !== 200)
                throw new Error('Spotify authentication unavailable');
            const secret = await this._request(this._endpoints.secret, {}, cancellable, 65536);
            if (secret.status !== 200)
                throw new Error('Spotify authentication unavailable');
            const auth = totp(secret.data, time.data?.serverTime);
            const query = `reason=transport&productType=web-player&totp=${auth.code}` +
                `&totpVer=${auth.version}&ts=${Math.floor(this._now() / 1000)}`;
            const response = await this._request(`${this._endpoints.token}?${query}`,
                {'Cookie': `sp_dc=${cookie}`, 'Referer': 'https://open.spotify.com/',
                    'App-platform': 'WebPlayer'}, cancellable, 32768);
            const data = response.data;
            if (response.status !== 200 || data?.isAnonymous !== false ||
                typeof data.accessToken !== 'string' ||
                !/^[A-Za-z0-9._~+/=-]{1,16384}$/.test(data.accessToken) ||
                !Number.isSafeInteger(data.accessTokenExpirationTimestampMs) ||
                data.accessTokenExpirationTimestampMs <= this._now() ||
                data.accessTokenExpirationTimestampMs > this._now() + 86400000)
                throw new Error('Spotify authentication unavailable');
            if (cancellable.is_cancelled())
                throw cancelled();
            this._token = {value: data.accessToken, expires: data.accessTokenExpirationTimestampMs};
            return this._token.value;
        } catch {
            if (!cancellable.is_cancelled())
                this._authRetryAt = this._now() + 60000;
            throw new Error('Spotify authentication unavailable');
        }
    }

    async _request(url, headers, cancellable, limit) {
        const message = Soup.Message.new('GET', url);
        message.set_flags(Soup.MessageFlags.NO_REDIRECT);
        const requestHeaders = message.get_request_headers();
        requestHeaders.replace('Accept', 'application/json');
        for (const [key, value] of Object.entries(headers))
            requestHeaders.replace(key, value);
        const stream = await new Promise((resolve, reject) => {
            this._session.send_async(message, GLib.PRIORITY_DEFAULT, cancellable,
                (session, result) => {
                    try {
                        resolve(session.send_finish(result));
                    } catch {
                        reject(new Error('Spotify request unavailable'));
                    }
                });
        });
        try {
            // status_code is a guint; get_status() can reject enum-less 429.
            const status = message.status_code;
            const responseHeaders = message.get_response_headers();
            if (status === 429) {
                const delay = retryDelaySeconds(responseHeaders.get_one('Retry-After'), this._now());
                this._blockedUntil = this._now() +
                    1000 * (Number.isFinite(delay) ? Math.min(86400, delay) : 60);
            }
            if (status !== 200)
                return {status};
            if (responseHeaders.get_content_length() > limit)
                throw new Error('Spotify response exceeds limits');
            const chunks = [];
            let size = 0;
            for (;;) {
                const bytes = await new Promise((resolve, reject) => {
                    stream.read_bytes_async(16384, GLib.PRIORITY_DEFAULT, cancellable,
                        (source, result) => {
                            try {
                                resolve(source.read_bytes_finish(result));
                            } catch {
                                reject(new Error('Spotify response unavailable'));
                            }
                        });
                });
                const data = bytes.get_data();
                if (!data.length)
                    break;
                size += data.length;
                if (size > limit)
                    throw new Error('Spotify response exceeds limits');
                chunks.push(data);
            }
            const data = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
                data.set(chunk, offset);
                offset += chunk.length;
            }
            return {status, data: JSON.parse(new TextDecoder().decode(data))};
        } finally {
            stream.close(null);
        }
    }

    destroy() {
        this._destroyed = true;
        for (const operation of this._operations)
            operation.cancel();
        this._session.abort();
        this._token = null;
        this._cache.clear();
    }
}
