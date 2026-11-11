// Keep each lyric as one shaped string; never split joined scripts into letters.
export function lyricsDirection(text) {
    for (const character of text) {
        if (!/\p{Letter}/u.test(character))
            continue;
        return /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(character) ? 'rtl' : 'ltr';
    }
    return 'ltr';
}

export function lyricsEmphasis(index, active, light = false) {
    const distance = active < 0 ? Infinity : Math.abs(index - active);
    const level = Math.min(3, distance);
    const colors = light
        ? [[28, 31, 42], [100, 108, 128], [125, 133, 151], [155, 160, 175]]
        : [[255, 248, 235], [177, 184, 201], [145, 154, 177], [105, 114, 138]];
    return {
        opacity: [255, 245, 240, 225][level],
        scale: distance === 0 ? 1 : 0.84,
        color: colors[level],
        blur: distance === 1 || distance === 2 ? 1 : 0,
    };
}
