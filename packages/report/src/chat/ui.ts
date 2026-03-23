export const REPORT_CHAT_WIDGET_CSS = `
.report-chat {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 320;
}

.report-chat-toggle,
.report-chat-close,
.report-chat-send,
.report-chat-reset {
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
}

.report-chat-toggle {
  min-width: 180px;
  border-radius: 999px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--bg-card)), var(--bg-secondary));
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.22);
  padding: 0.75rem 0.95rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.report-chat-toggle-label {
  font-weight: 700;
  letter-spacing: 0.01em;
}

.report-chat-toggle-meta {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.report-chat-panel {
  position: absolute;
  right: 0;
  bottom: 4.5rem;
  width: min(420px, calc(100vw - 2rem));
  height: min(620px, calc(100vh - 7rem));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 14%, transparent), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 92%, var(--accent) 8%), var(--bg));
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.4);
}

.report-chat-panel-header {
  padding: 0.95rem 1rem 0.85rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
}

.report-chat-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.report-chat-status,
.report-chat-hint {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.report-chat-header-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.report-chat-close,
.report-chat-reset {
  background: transparent;
  border-radius: 999px;
  min-width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.7rem;
  font-size: 0.8rem;
}

.report-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.report-chat-empty {
  border: 1px dashed var(--border);
  border-radius: 14px;
  padding: 0.95rem 1rem;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-secondary) 85%, transparent);
}

.report-chat-message {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.report-chat-bubble {
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--border);
}

.report-chat-message-user .report-chat-bubble {
  background: color-mix(in srgb, var(--user-bg) 82%, transparent);
  border-color: var(--user-border);
}

.report-chat-message-assistant .report-chat-bubble {
  background: color-mix(in srgb, var(--assistant-bg) 88%, transparent);
}

.report-chat-role {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.report-chat-citations {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.report-chat-citation {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  background: color-mix(in srgb, var(--bg-secondary) 86%, transparent);
}

.report-chat-citation-title,
.report-chat-citation-link {
  font-size: 0.86rem;
  font-weight: 600;
}

.report-chat-citation-link {
  color: var(--accent);
}

.report-chat-citation-meta,
.report-chat-citation-snippet {
  font-size: 0.76rem;
  color: var(--text-muted);
}

.report-chat-error {
  margin: 0 1rem;
  border: 1px solid color-mix(in srgb, var(--danger) 55%, var(--border));
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
  border-radius: 12px;
  padding: 0.7rem 0.8rem;
  font-size: 0.82rem;
}

.report-chat-form {
  border-top: 1px solid var(--border);
  padding: 0.9rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
}

.report-chat-input {
  width: 100%;
  resize: vertical;
  min-height: 84px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  color: var(--text);
  padding: 0.8rem 0.85rem;
  font: inherit;
}

.report-chat-input:disabled {
  opacity: 0.68;
  cursor: not-allowed;
}

.report-chat-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.report-chat-send {
  border-radius: 999px;
  padding: 0.55rem 1rem;
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-card));
}

.report-chat-send:disabled,
.report-chat-reset:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .report-chat {
    right: 0.75rem;
    bottom: 0.75rem;
    left: 0.75rem;
  }

  .report-chat-toggle {
    margin-left: auto;
  }

  .report-chat-panel {
    left: 0;
    right: 0;
    width: auto;
    height: min(72vh, 620px);
  }
}
`

export function renderChatWidgetShell(): string {
  return `<section class="report-chat" id="report-chat-root">
  <button class="report-chat-toggle" id="report-chat-toggle" type="button" aria-expanded="false" aria-controls="report-chat-panel">
    <span class="report-chat-toggle-label">AI Chat</span>
    <span class="report-chat-toggle-meta" id="report-chat-toggle-meta">Local Memory</span>
  </button>
  <div class="report-chat-panel" id="report-chat-panel" hidden>
    <div class="report-chat-panel-header">
      <div>
        <div class="report-chat-title">OpenMnemo Chat</div>
        <div class="report-chat-status" id="report-chat-status">Checking local runtime...</div>
      </div>
      <div class="report-chat-header-actions">
        <button class="report-chat-reset" id="report-chat-reset" type="button">New</button>
        <button class="report-chat-close" id="report-chat-close" type="button" aria-label="Close chat">x</button>
      </div>
    </div>
    <div class="report-chat-messages" id="report-chat-messages">
      <div class="report-chat-empty" id="report-chat-empty">
        Ask about sessions, decisions, constraints, or anything already imported into this MemoryTree.
      </div>
    </div>
    <div class="report-chat-error" id="report-chat-error" hidden></div>
    <form class="report-chat-form" id="report-chat-form">
      <textarea
        class="report-chat-input"
        id="report-chat-input"
        rows="3"
        placeholder="Run openmnemo report serve to enable local AI Chat."
        disabled
      ></textarea>
      <div class="report-chat-actions">
        <span class="report-chat-hint" id="report-chat-hint">SSE local mode</span>
        <button class="report-chat-send" id="report-chat-send" type="submit" disabled>Send</button>
      </div>
    </form>
  </div>
</section>`
}
