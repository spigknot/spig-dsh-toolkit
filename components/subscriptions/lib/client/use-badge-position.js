import { useLayoutEffect, useState } from 'react';
/** Position the portal above its trigger, constrained to the viewport. */
export function badgePosition(anchor, panel, viewport, gap, margin) {
    const clamp = (value, max) => Math.max(margin, Math.min(value, Math.max(margin, max)));
    const above = anchor.top - gap - panel.height;
    const preferredTop = above >= margin ? above : anchor.bottom + gap;
    return {
        left: clamp(anchor.left, viewport.width - margin - panel.width),
        top: clamp(preferredTop, viewport.height - margin - panel.height),
    };
}
/** Measure before paint and follow scroll, viewport and content size changes. */
export function useBadgePosition(open, anchorRef, panelRef, gap, margin) {
    const [position, setPosition] = useState(null);
    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }
        const anchor = anchorRef.current;
        const panel = panelRef.current;
        if (anchor === null || panel === null)
            return;
        const place = () => {
            const next = badgePosition(anchor.getBoundingClientRect(), panel.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, gap, margin);
            setPosition(previous => previous?.left === next.left && previous.top === next.top ? previous : next);
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
        observer?.observe(anchor);
        observer?.observe(panel);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
            observer?.disconnect();
        };
    }, [open, anchorRef, panelRef, gap, margin]);
    return position;
}
