import type { ThemeConfig } from 'antd';
import { color, font, radius } from './tokens';

// Ant Design 6 theme. Prefer changing tokens here over overriding CSS in components.
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: color.brand,
    colorLink: color.brandStrong,
    colorText: color.ink,
    colorTextSecondary: color.muted,
    colorTextTertiary: color.faint,
    colorBorder: color.border,
    colorBorderSecondary: color.divider,
    colorBgLayout: color.canvas,
    colorBgContainer: color.surface,
    colorError: color.danger,
    colorSuccess: color.brand,
    fontFamily: font.ui,
    fontSize: 14,
    borderRadius: radius.md,
    borderRadiusLG: radius.lg,
    controlHeight: 38,
    boxShadow: 'none',
  },
  components: {
    Button: {
      controlHeight: 38,
      contentFontSize: 13.5,
      fontWeight: 400,
      primaryShadow: 'none',
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
