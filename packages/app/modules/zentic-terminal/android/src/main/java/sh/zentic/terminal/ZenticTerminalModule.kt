package sh.zentic.terminal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZenticTerminalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZenticTerminal")

    View(ZenticTerminalView::class) {
      Events("onCellMetrics")

      Prop("frame") { view: ZenticTerminalView, frame: TerminalFrameRecord -> view.setFrame(frame) }
      Prop("theme") { view: ZenticTerminalView, theme: TerminalThemeRecord -> view.setTheme(theme) }
      Prop("fontFamily") { view: ZenticTerminalView, family: String -> view.setFontFamily(family) }
      Prop("fontSize") { view: ZenticTerminalView, size: Double -> view.setFontSize(size) }
      Prop("customGlyphs") { view: ZenticTerminalView, glyphs: List<TerminalCustomGlyphRecord> ->
        view.setCustomGlyphs(glyphs)
      }

      OnViewDidUpdateProps { view: ZenticTerminalView -> view.commit() }
    }
  }
}
