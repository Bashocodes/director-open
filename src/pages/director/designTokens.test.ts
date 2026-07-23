import { describe, expect, it } from 'vitest';
import { designTokens, directorTokenVariables } from './designTokens';

describe('Director design tokens', () => {
  it('exposes a stable token scale', () => {
    expect(designTokens).toMatchInlineSnapshot(`
      {
        "layout": {
          "chatRail": "52px",
          "drawerWidth": "340px",
          "timelineHeight": "194px",
        },
        "radius": {
          "1": "8px",
          "2": "10px",
          "3": "14px",
          "4": "18px",
          "5": "24px",
          "pill": "999px",
        },
        "space": {
          "1": "4px",
          "2": "8px",
          "3": "12px",
          "4": "16px",
          "5": "20px",
          "6": "24px",
          "7": "32px",
        },
        "type": {
          "base": "14px",
          "display": "24px",
          "displayLg": "30px",
          "eyebrow": "11px",
          "lg": "20px",
          "md": "16px",
          "sm": "13px",
          "xs": "12px",
        },
        "z": {
          "base": "1",
          "canvasOverlay": "5",
          "chrome": "20",
          "drawer": "90",
          "drawerBackdrop": "80",
          "fullscreen": "500",
          "panel": "40",
          "popover": "140",
          "rail": "26",
          "renderDetails": "150",
        },
      }
    `);
  });

  it('never emits a readable-text step below 11px', () => {
    const px = Object.values(designTokens.type).map((value) => Number.parseFloat(value));
    expect(Math.min(...px)).toBeGreaterThanOrEqual(11);
  });

  it('flattens to prefixed CSS custom properties', () => {
    const vars = directorTokenVariables();
    expect(vars['--ds-text-base']).toBe('14px');
    expect(vars['--ds-space-4']).toBe('16px');
    expect(vars['--ds-z-drawer']).toBe('90');
    expect(vars['--ds-chat-rail']).toBe('52px');
    expect(Object.keys(vars).every((key) => key.startsWith('--ds-'))).toBe(true);
  });

  it('orders the z-index scale so overlays sit above chrome', () => {
    const { z } = designTokens;
    expect(Number(z.chrome)).toBeLessThan(Number(z.drawer));
    expect(Number(z.drawerBackdrop)).toBeLessThan(Number(z.drawer));
    expect(Number(z.drawer)).toBeLessThan(Number(z.popover));
    expect(Number(z.popover)).toBeLessThan(Number(z.fullscreen));
  });
});
