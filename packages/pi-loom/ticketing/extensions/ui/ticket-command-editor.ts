import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import { Key, matchesKey } from "@mariozechner/pi-tui";

export class TicketCommandEditor extends CustomEditor {
  readonly #onTicketCommand: () => void;

  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, onTicketCommand: () => void) {
    super(tui, theme, keybindings);
    this.#onTicketCommand = onTicketCommand;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
      const autocompleteVisible =
        (this as unknown as { isShowingAutocomplete?: () => boolean }).isShowingAutocomplete?.() ?? false;
      const text = (this.getExpandedText?.() ?? this.getText()).trim();
      if (!autocompleteVisible && (text === "/ticket" || text.startsWith("/ticket "))) {
        this.addToHistory?.(text);
        this.setText("");
        this.#onTicketCommand();
        return;
      }
    }

    super.handleInput(data);
  }
}
