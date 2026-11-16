import { requireNativeView } from "expo";
import { useCallback, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import type {
  ZenticTerminalCellMetrics,
  ZenticTerminalFrame,
  ZenticTerminalTheme,
} from "./contract";
import { encodeTerminalCustomGlyphs, type ZenticTerminalCustomGlyph } from "./custom-glyphs";
import { encodeTerminalFrame, type NativeZenticTerminalFrame } from "./frame-encoding";

export * from "./contract";

export interface ZenticTerminalViewProps {
  frame: ZenticTerminalFrame;
  theme: ZenticTerminalTheme;
  fontFamily: string;
  /** Font size in points after the system font scale is applied. */
  fontSize: number;
  onCellMetrics?: (metrics: ZenticTerminalCellMetrics) => void;
  style?: StyleProp<ViewStyle>;
}

interface NativeZenticTerminalViewProps extends Omit<
  ZenticTerminalViewProps,
  "frame" | "onCellMetrics"
> {
  frame: NativeZenticTerminalFrame;
  customGlyphs: ZenticTerminalCustomGlyph[];
  onCellMetrics?: (event: { nativeEvent: ZenticTerminalCellMetrics }) => void;
}

const NativeZenticTerminalView = requireNativeView<NativeZenticTerminalViewProps>("ZenticTerminal");
const CUSTOM_GLYPHS = encodeTerminalCustomGlyphs();

export function ZenticTerminalView({ frame, onCellMetrics, ...props }: ZenticTerminalViewProps) {
  const nativeFrame = useMemo(() => encodeTerminalFrame(frame), [frame]);
  const handleCellMetrics = useCallback(
    (event: { nativeEvent: ZenticTerminalCellMetrics }) => onCellMetrics?.(event.nativeEvent),
    [onCellMetrics],
  );
  return (
    <NativeZenticTerminalView
      {...props}
      frame={nativeFrame}
      customGlyphs={CUSTOM_GLYPHS}
      onCellMetrics={handleCellMetrics}
    />
  );
}
