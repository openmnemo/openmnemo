export interface ChatFrontendAdapterConfig {
  healthUrl: string
  chatUrl: string
  storagePrefix: string
  basePath: string
}

function jsonLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function renderChatFrontendAdapterScript(config: ChatFrontendAdapterConfig): string {
  return `<script>
(function() {
  var config = ${jsonLiteral(config)};
  var root = document.getElementById('report-chat-root');
  if (!root) return;

  var toggle = document.getElementById('report-chat-toggle');
  var closeBtn = document.getElementById('report-chat-close');
  var resetBtn = document.getElementById('report-chat-reset');
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

  if (!toggle || !closeBtn || !resetBtn || !panel || !statusEl || !toggleMetaEl || !messagesEl || !emptyEl || !errorEl || !form || !input || !sendBtn || !hintEl) {
    return;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createSessionId() {
    return 'chat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function createSession(sessionId) {
    return {
      id: sessionId || createSessionId(),
      updated_at: nowIso(),
      messages: [],
    };
  }

  function normalizeProjectKey(scope) {
    return (scope && typeof scope.project === 'string' && scope.project.trim()) ? scope.project.trim() : 'default';
  }

  function getStorageKey(projectKey) {
    return config.storagePrefix + ':' + projectKey;
  }

  function loadPersistedSession(projectKey) {
    try {
      var raw = localStorage.getItem(getStorageKey(projectKey));
      if (!raw) return createSession();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return createSession();
      if (!Array.isArray(parsed.messages)) return createSession(typeof parsed.id === 'string' ? parsed.id : undefined);
      return {
        id: typeof parsed.id === 'string' ? parsed.id : createSessionId(),
        updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : nowIso(),
        messages: parsed.messages.filter(function(entry) {
          return entry && typeof entry === 'object' && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string';
        }).map(function(entry) {
          return {
            role: entry.role,
            content: entry.content,
            citations: Array.isArray(entry.citations) ? entry.citations : [],
          };
        }),
      };
    } catch (_error) {
      return createSession();
    }
  }

  var state = {
    enabled: false,
    ready: false,
    sending: false,
    basePath: config.basePath || '/',
    projectKey: 'default',
    scope: {},
    session: createSession(),
  };

  function saveSession() {
    try {
      state.session.updated_at = nowIso();
      localStorage.setItem(getStorageKey(state.projectKey), JSON.stringify(state.session));
    } catch (_error) {
      // Ignore localStorage failures.
    }
  }

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
    resetBtn.disabled = state.sending;
    if (placeholder) input.placeholder = placeholder;
  }

  function updateStatus(text, meta) {
    statusEl.textContent = text;
    toggleMetaEl.textContent = meta || 'Local Memory';
  }

  function updateHint(text) {
    hintEl.textContent = text;
  }

  function clearMessages() {
    messagesEl.innerHTML = '';
  }

  function showEmptyState() {
    clearMessages();
    messagesEl.appendChild(emptyEl);
  }

  function resolveHref(href) {
    if (!href) return '';
    if (/^(https?:)?\/\//i.test(href)) return href;
    if (href.charAt(0) === '/') return href;

    var basePath = state.basePath || '/';
    if (!basePath.endsWith('/')) basePath += '/';
    return basePath + href.replace(/^\//, '');
  }

  function renderCitation(target, citation) {
    if (!target) return;
    var item = document.createElement('div');
    item.className = 'report-chat-citation';

    var href = resolveHref(citation.href || '');
    if (href) {
      var link = document.createElement('a');
      link.className = 'report-chat-citation-link';
      link.href = href;
      link.textContent = citation.title || citation.id || citation.kind || 'citation';
      item.appendChild(link);
    } else {
      var title = document.createElement('div');
      title.className = 'report-chat-citation-title';
      title.textContent = citation.title || citation.id || citation.kind || 'citation';
      item.appendChild(title);
    }

    var meta = document.createElement('div');
    meta.className = 'report-chat-citation-meta';
    var metaParts = [];
    if (citation.kind) metaParts.push(citation.kind);
    if (citation.session_title) metaParts.push(citation.session_title);
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
  }

  function createMessageElement(entry) {
    var wrapper = document.createElement('div');
    wrapper.className = 'report-chat-message report-chat-message-' + entry.role;

    var label = document.createElement('div');
    label.className = 'report-chat-role';
    label.textContent = entry.role === 'user' ? 'You' : 'Assistant';

    var bubble = document.createElement('div');
    bubble.className = 'report-chat-bubble';
    bubble.textContent = entry.content || '';

    wrapper.appendChild(label);
    wrapper.appendChild(bubble);

    var citations = null;
    if (entry.role === 'assistant') {
      citations = document.createElement('div');
      citations.className = 'report-chat-citations';
      (Array.isArray(entry.citations) ? entry.citations : []).forEach(function(citation) {
        renderCitation(citations, citation);
      });
      wrapper.appendChild(citations);
    }

    messagesEl.appendChild(wrapper);
    return { bubble: bubble, citations: citations };
  }

  function renderSession() {
    if (!state.session.messages.length) {
      showEmptyState();
      return;
    }

    clearMessages();
    state.session.messages.forEach(function(entry) {
      createMessageElement(entry);
    });
    scrollMessages();
  }

  function resetSession() {
    state.session = createSession();
    saveSession();
    renderSession();
    updateHint(state.scope.project ? ('Project scope: ' + state.scope.project) : 'SSE local mode');
    showError('');
  }

  function switchProjectScope(scope) {
    var nextScope = scope || {};
    var nextProjectKey = normalizeProjectKey(nextScope);
    var sameProject = nextProjectKey === state.projectKey;

    state.scope = nextScope;
    if (sameProject && state.session.messages.length > 0) {
      updateHint(state.scope.project ? ('Project scope: ' + state.scope.project) : 'SSE local mode');
      return;
    }

    state.projectKey = nextProjectKey;
    state.session = loadPersistedSession(state.projectKey);
    renderSession();
    updateHint(state.scope.project ? ('Project scope: ' + state.scope.project) : 'SSE local mode');
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
      var response = await fetch(config.healthUrl, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('health_failed');
      var payload = await response.json();
      state.enabled = Boolean(payload.enabled);
      state.basePath = (typeof payload.base_path === 'string' && payload.base_path) ? payload.base_path : state.basePath;
      switchProjectScope(payload.scope || {});

      if (payload.ready) {
        updateStatus(
          state.scope.project ? ('Ready for project ' + state.scope.project + '.') : 'Ready for local memory chat.',
          payload.model || 'Anthropic'
        );
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
    updateHint('Streaming answer...');

    var userEntry = { role: 'user', content: text };
    state.session.messages.push(userEntry);
    var assistantEntry = { role: 'assistant', content: '', citations: [] };
    state.session.messages.push(assistantEntry);
    saveSession();
    renderSession();

    var assistantText = '';
    var doneReceived = false;
    var assistantView = null;
    var messageViews = messagesEl.querySelectorAll('.report-chat-message');
    if (messageViews.length > 0) {
      var lastNode = messageViews[messageViews.length - 1];
      assistantView = {
        bubble: lastNode.querySelector('.report-chat-bubble'),
        citations: lastNode.querySelector('.report-chat-citations'),
      };
    }

    try {
      var response = await fetch(config.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          session_id: state.session.id,
          messages: state.session.messages
            .filter(function(entry) { return entry.role === 'user' || entry.role === 'assistant'; })
            .map(function(entry) { return { role: entry.role, content: entry.content }; }),
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
        if (eventName === 'meta') {
          if (payload.scope) switchProjectScope(payload.scope);
          if (payload.session_id) state.session.id = payload.session_id;
          return;
        }

        if (eventName === 'delta') {
          assistantText += payload.text || '';
          assistantEntry.content = assistantText;
          if (assistantView && assistantView.bubble) assistantView.bubble.textContent = assistantText;
          scrollMessages();
          return;
        }

        if (eventName === 'citation') {
          assistantEntry.citations.push(payload);
          if (assistantView && assistantView.citations) renderCitation(assistantView.citations, payload);
          scrollMessages();
          return;
        }

        if (eventName === 'error') {
          throw new Error(payload.message || 'Streaming failed.');
        }

        if (eventName === 'done') {
          doneReceived = true;
          if (!assistantText && payload.text) {
            assistantText = payload.text;
            assistantEntry.content = assistantText;
            if (assistantView && assistantView.bubble) assistantView.bubble.textContent = assistantText;
          }
        }
      });

      if (!doneReceived && !assistantText) {
        throw new Error('The chat stream ended without a response.');
      }

      assistantEntry.content = assistantText || '(empty response)';
      saveSession();
      updateHint(state.scope.project ? ('Project scope: ' + state.scope.project) : 'SSE local mode');
    } catch (error) {
      assistantEntry.content = assistantText || 'Unable to complete this request.';
      if (assistantView && assistantView.bubble) assistantView.bubble.textContent = assistantEntry.content;
      saveSession();
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

  resetBtn.addEventListener('click', function() {
    resetSession();
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
