export function renderChatWidget(): string {
  return `
<section class="report-chat" id="report-chat-root">
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
      <button class="report-chat-close" id="report-chat-close" type="button" aria-label="Close chat">x</button>
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
</section>
<style>
.report-chat {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 320;
}

.report-chat-toggle,
.report-chat-close,
.report-chat-send {
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

.report-chat-close {
  background: transparent;
  border-radius: 999px;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.report-chat-citation-title {
  font-size: 0.86rem;
  font-weight: 600;
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

.report-chat-send:disabled {
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
</style>
<script>
(function() {
  var root = document.getElementById('report-chat-root');
  if (!root) return;

  var toggle = document.getElementById('report-chat-toggle');
  var closeBtn = document.getElementById('report-chat-close');
  var panel = document.getElementById('report-chat-panel');
  var statusEl = document.getElementById('report-chat-status');
  var toggleMetaEl = document.getElementById('report-chat-toggle-meta');
  var messagesEl = document.getElementById('report-chat-messages');
  var emptyEl = document.getElementById('report-chat-empty');
  var errorEl = document.getElementById('report-chat-error');
  var form = document.getElementById('report-chat-form');
  var input = document.getElementById('report-chat-input');
  var sendBtn = document.getElementById('report-chat-send');
  var hintEl = document.getElementById('report-chat-hint');

  if (!toggle || !closeBtn || !panel || !statusEl || !toggleMetaEl || !messagesEl || !emptyEl || !errorEl || !form || !input || !sendBtn || !hintEl) {
    return;
  }

  var state = {
    enabled: false,
    ready: false,
    sending: false,
    history: [],
    scope: {},
  };

  function setPanelOpen(open) {
    if (open) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function scrollMessages() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showError(message) {
    if (!message) {
      errorEl.setAttribute('hidden', '');
      errorEl.textContent = '';
      return;
    }
    errorEl.removeAttribute('hidden');
    errorEl.textContent = message;
  }

  function setComposerEnabled(enabled, placeholder) {
    state.ready = enabled;
    input.disabled = !enabled || state.sending;
    sendBtn.disabled = !enabled || state.sending;
    if (placeholder) input.placeholder = placeholder;
  }

  function updateStatus(text, meta) {
    statusEl.textContent = text;
    toggleMetaEl.textContent = meta || 'Local Memory';
  }

  function hideEmpty() {
    if (emptyEl.parentNode) emptyEl.parentNode.removeChild(emptyEl);
  }

  function createMessage(role, text) {
    hideEmpty();
    var wrapper = document.createElement('div');
    wrapper.className = 'report-chat-message report-chat-message-' + role;

    var label = document.createElement('div');
    label.className = 'report-chat-role';
    label.textContent = role === 'user' ? 'You' : 'Assistant';

    var bubble = document.createElement('div');
    bubble.className = 'report-chat-bubble';
    bubble.textContent = text || '';

    wrapper.appendChild(label);
    wrapper.appendChild(bubble);

    var citations = null;
    if (role === 'assistant') {
      citations = document.createElement('div');
      citations.className = 'report-chat-citations';
      wrapper.appendChild(citations);
    }

    messagesEl.appendChild(wrapper);
    scrollMessages();
    return { bubble: bubble, citations: citations };
  }

  function renderCitation(target, citation) {
    if (!target) return;
    var item = document.createElement('div');
    item.className = 'report-chat-citation';

    var title = document.createElement('div');
    title.className = 'report-chat-citation-title';
    title.textContent = citation.title || citation.id || citation.kind || 'citation';
    item.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'report-chat-citation-meta';
    var metaParts = [];
    if (citation.kind) metaParts.push(citation.kind);
    if (citation.session_id) metaParts.push(citation.session_id);
    if (citation.started_at) metaParts.push(citation.started_at);
    meta.textContent = metaParts.join(' | ');
    item.appendChild(meta);

    if (citation.snippet) {
      var snippet = document.createElement('div');
      snippet.className = 'report-chat-citation-snippet';
      snippet.textContent = citation.snippet;
      item.appendChild(snippet);
    }

    target.appendChild(item);
    scrollMessages();
  }

  function parseSseChunk(buffer, onEvent) {
    var separatorIndex = buffer.indexOf('\\n\\n');
    while (separatorIndex !== -1) {
      var rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf('\\n\\n');
      if (!rawEvent.trim()) continue;

      var eventName = 'message';
      var dataLines = [];
      rawEvent.split(/\\r?\\n/).forEach(function(line) {
        if (line.indexOf('event:') === 0) {
          eventName = line.slice(6).trim();
          return;
        }
        if (line.indexOf('data:') === 0) {
          dataLines.push(line.slice(5).trim());
        }
      });

      var payload = {};
      if (dataLines.length > 0) {
        try {
          payload = JSON.parse(dataLines.join('\\n'));
        } catch (_error) {
          payload = { raw: dataLines.join('\\n') };
        }
      }

      onEvent(eventName, payload);
    }

    return buffer;
  }

  async function consumeSse(stream, onEvent) {
    if (!stream) throw new Error('Streaming body is unavailable.');
    var reader = stream.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      buffer = parseSseChunk(buffer, onEvent);
    }
    buffer += decoder.decode();
    parseSseChunk(buffer, onEvent);
  }

  async function loadHealth() {
    if (window.location.protocol === 'file:') {
      updateStatus('Open this report with openmnemo report serve to enable local AI Chat.', 'Static Report');
      setComposerEnabled(false, 'Run openmnemo report serve to enable local AI Chat.');
      return;
    }

    try {
      var response = await fetch('/api/chat/health', { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('health_failed');
      var payload = await response.json();
      state.enabled = Boolean(payload.enabled);
      state.scope = payload.scope || {};

      if (payload.ready) {
        updateStatus(
          state.scope.project ? ('Ready for project ' + state.scope.project + '.') : 'Ready for local memory chat.',
          payload.model || 'Anthropic'
        );
        hintEl.textContent = 'Project scope' + (state.scope.project ? ': ' + state.scope.project : '');
        setComposerEnabled(true, 'Ask about imported sessions, decisions, or context...');
        return;
      }

      if (payload.reason === 'missing_api_key') {
        updateStatus('ANTHROPIC_API_KEY is missing for this local server.', 'Config Needed');
        setComposerEnabled(false, 'Set ANTHROPIC_API_KEY before starting openmnemo report serve.');
        return;
      }

      updateStatus('AI Chat is unavailable in this report session.', 'Unavailable');
      setComposerEnabled(false, 'Run openmnemo report serve to enable local AI Chat.');
    } catch (_error) {
      updateStatus('This page is in static mode. AI Chat activates in openmnemo report serve.', 'Static Report');
      setComposerEnabled(false, 'Run openmnemo report serve to enable local AI Chat.');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!state.ready || state.sending) return;

    var text = input.value.trim();
    if (!text) return;

    showError('');
    input.value = '';
    state.sending = true;
    setComposerEnabled(true, 'Waiting for response...');
    hintEl.textContent = 'Streaming answer...';

    createMessage('user', text);
    var assistantMessage = createMessage('assistant', '');
    var assistantText = '';
    var doneReceived = false;

    try {
      var response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          messages: state.history.concat([{ role: 'user', content: text }]),
          options: {
            stream: true,
            max_context_hits: 8,
          },
        }),
      });

      if (!response.ok) {
        var errorMessage = 'Chat request failed.';
        try {
          var errorPayload = await response.json();
          errorMessage = errorPayload.error || errorPayload.message || errorMessage;
        } catch (_error) {
          // ignore parse failure
        }
        throw new Error(errorMessage);
      }

      await consumeSse(response.body, function(eventName, payload) {
        if (eventName === 'meta' && payload.scope) {
          state.scope = payload.scope;
          if (payload.scope.project) hintEl.textContent = 'Project scope: ' + payload.scope.project;
          return;
        }

        if (eventName === 'delta') {
          assistantText += payload.text || '';
          assistantMessage.bubble.textContent = assistantText;
          scrollMessages();
          return;
        }

        if (eventName === 'citation') {
          renderCitation(assistantMessage.citations, payload);
          return;
        }

        if (eventName === 'error') {
          throw new Error(payload.message || 'Streaming failed.');
        }

        if (eventName === 'done') {
          doneReceived = true;
          if (!assistantText && payload.text) {
            assistantText = payload.text;
            assistantMessage.bubble.textContent = assistantText;
          }
        }
      });

      if (!doneReceived && !assistantText) {
        throw new Error('The chat stream ended without a response.');
      }

      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'assistant', content: assistantText || '(empty response)' });
      hintEl.textContent = state.scope.project ? ('Project scope: ' + state.scope.project) : 'SSE local mode';
    } catch (error) {
      assistantMessage.bubble.textContent = assistantText || 'Unable to complete this request.';
      showError(error instanceof Error ? error.message : 'Unknown chat error.');
    } finally {
      state.sending = false;
      setComposerEnabled(state.ready, 'Ask about imported sessions, decisions, or context...');
      scrollMessages();
    }
  }

  toggle.addEventListener('click', function() {
    setPanelOpen(panel.hasAttribute('hidden'));
  });

  closeBtn.addEventListener('click', function() {
    setPanelOpen(false);
  });

  form.addEventListener('submit', handleSubmit);
  input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sendBtn.disabled) form.requestSubmit();
    }
  });

  void loadHealth();
})();
</script>`
}
