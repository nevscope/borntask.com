import { theme, type ThemeConfig } from 'antd';
import { palette, type ThemeMode } from './palettes';
import { font, radius } from './tokens';

export function antdThemeFor(mode: ThemeMode): ThemeConfig {
  const c = palette(mode).color;
  return {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: c.brandFill,
      colorLink: c.brandText,
      colorText: c.ink,
      colorTextSecondary: c.muted,
      colorTextTertiary: c.faint,
      colorBorder: c.border,
      colorBorderSecondary: c.divider,
      colorBgLayout: c.canvas,
      colorBgContainer: c.surface,
      colorBgElevated: c.raised,
      colorFillTertiary: c.chip,
      colorBgMask: c.overlay,
      colorError: c.danger,
      colorSuccess: c.brand,
      colorWarning: c.warning,
      fontFamily: font.ui,
      fontSize: 14,
      borderRadius: radius.md,
      borderRadiusLG: radius.lg,
      controlHeight: 38,
      boxShadow: 'none',
      boxShadowSecondary: c.shadow,
    },
    components: {
      Button: {
        controlHeight: 38,
        contentFontSize: 13.5,
        fontWeight: 400,
        primaryShadow: 'none',
        colorPrimary: c.brandFill,
        colorPrimaryHover: c.brand,
        colorPrimaryActive: c.brandText,
      },
      Input: {
        controlHeight: 38,
        paddingInline: 12,
      },
      Select: {
        controlHeight: 38,
      },
      Form: {
        verticalLabelPadding: '0 0 6px',
        labelFontSize: 13,
      },
      Modal: {
        borderRadiusLG: radius.xl,
      },
      Segmented: {
        trackPadding: 3,
        controlHeight: 36,
        fontSize: 13,
        borderRadius: radius.md,
      },
    },
  };
}
