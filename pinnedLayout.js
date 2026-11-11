// SPDX-License-Identifier: GPL-2.0-or-later

export function pinnedPosition(area, width, height, corner, margin = 16) {
    const insetX = Math.min(margin, Math.max(0, (area.width - width) / 2));
    const insetY = Math.min(margin, Math.max(0, (area.height - height) / 2));
    return {
        x: Math.round(area.x + (corner.endsWith('right')
            ? Math.max(0, area.width - width - insetX) : insetX)),
        y: Math.round(area.y + (corner.startsWith('bottom')
            ? Math.max(0, area.height - height - insetY) : insetY)),
    };
}
