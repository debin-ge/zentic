import ExpoModulesCore

public class ZenticTerminalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZenticTerminal")

    View(ZenticTerminalView.self) {
      Events("onCellMetrics")

      Prop("frame") { (view: ZenticTerminalView, frame: TerminalFrameRecord) in view.setFrame(frame) }
      Prop("theme") { (view: ZenticTerminalView, theme: TerminalThemeRecord) in view.setTheme(theme) }
      Prop("fontFamily") { (view: ZenticTerminalView, family: String) in view.setFontFamily(family) }
      Prop("fontSize") { (view: ZenticTerminalView, size: Double) in view.setFontSize(size) }
      Prop("customGlyphs") { (view: ZenticTerminalView, glyphs: [TerminalCustomGlyphRecord]) in
        view.setCustomGlyphs(glyphs)
      }

      OnViewDidUpdateProps { (view: ZenticTerminalView) in view.commit() }
    }
  }
}
