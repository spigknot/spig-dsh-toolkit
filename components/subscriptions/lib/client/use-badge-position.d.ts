import type { RefObject } from 'react';
/** Position the portal above its trigger, constrained to the viewport. */
export declare function badgePosition(anchor: Pick<DOMRect, 'left' | 'top' | 'bottom'>, panel: Pick<DOMRect, 'width' | 'height'>, viewport: {
    width: number;
    height: number;
}, gap: number, margin: number): {
    left: number;
    top: number;
};
/** Measure before paint and follow scroll, viewport and content size changes. */
export declare function useBadgePosition(open: boolean, anchorRef: RefObject<HTMLElement>, panelRef: RefObject<HTMLElement>, gap: number, margin: number): {
    left: number;
    top: number;
} | null;
