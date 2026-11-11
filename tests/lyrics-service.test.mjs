import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const fixture = fileURLToPath(new URL('./lyrics-service.gjs.js', import.meta.url));
for (const [scenario, description] of [
    ['words', 'prefers real LRCLIB word timing over Spotify line timing'],
    ['preserve', 'preserves Spotify when optional LRCLIB timing is unavailable'],
    ['direct', 'keeps normal LRCLIB fallback for missing primary lyrics'],
    ['primary', 'keeps Spotify words, plain lyrics and instrumental results primary'],
    ['cancel', 'propagates cancellation during the supplemental lookup'],
]) {
    test(description, () => {
        assert.equal(execFileSync('gjs', ['-m', fixture, scenario],
            {encoding: 'utf8', timeout: 10000}).trim(), 'passed');
    });
}
