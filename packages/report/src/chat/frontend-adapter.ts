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
  var providerModeEl = document.getElementById('report-chat-provider-mode');
  var modelEl = document.getElementById('report-chat-model');
  var baseUrlEl = document.getElementById('report-chat-base-url');
  var apiKeyEl = document.getElementById('report-chat-api-key');
  var configNoteEl = document.getElementById('report-chat-config-note');

  if (!toggle || !closeBtn || !resetBtn || !panel || !statusEl || !toggleMetaEl || !messagesEl || !emptyEl || !errorEl || !form || !input || !sendBtn || !hintEl || !providerModeEl || !modelEl || !baseUrlEl || !apiKeyEl || !configNoteEl) {
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

  function createDefaultChatConfig() {
    return {
      mode: 'server_default',
      baseUrl: '',
      apiKey: '',
      model: '',
    };
  }

  function normalizeProjectKey(scope) {
    return (scope && typeof scope.project === 'string' && scope.project.trim()) ? scope.project.trim() : 'default';
  }

  function getSessionStorageKey(projectKey) {
    return config.storagePrefix + ':' + projectKey;
  }

  function getConfigStorageKey(projectKey) {
    return config.storagePrefix + ':config:' + projectKey;
  }

  function getApiKeyStorageKey(projectKey) {
    return config.storagePrefix + ':api-key:' + projectKey;
  }

  function normalizeStoredMessages(messages) {
    return messages.filter(function(entry) {
      return entry
        && typeof entry === 'object'
        && (entry.role === 'user' || entry.role === 'assistant')
        && typeof entry.content === 'string';
    }).map(function(entry) {
      return {
        role: entry.role,
        content: entry.content,
        citations: Array.isArray(entry.citations) ? entry.citations : [],
        failed: entry.failed === true,
      };
    });
  }

  function buildPersistableMessages(messages) {
    return normalizeStoredMessages(messages).filter(function(entry) {
      return Boolean(entry.content.trim()) || entry.citations.length > 0;
    });
  }

  function loadSessionApiKey(projectKey) {
    try {
      return sessionStorage.getItem(getApiKeyStorageKey(projectKey)) || '';
    } catch (_error) {
      return '';
    }
  }

  function loadPersistedSession(projectKey) {
    try {
      var raw = localStorage.getItem(getSessionStorageKey(projectKey));
      if (!raw) return createSession();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return createSession();
      if (!Array.isArray(parsed.messages)) return createSession(typeof parsed.id === 'string' ? parsed.id : undefined);
      return {
        id: typeof parsed.id === 'string' ? parsed.id : createSessionId(),
        updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : nowIso(),
        messages: normalizeStoredMessages(parsed.messages),
      };
    } catch (_error) {
      return createSession();
    }
  }

  function loadPersistedChatConfig(projectKey) {
    var defaults = createDefaultChatConfig();
    try {
      var raw = localStorage.getItem(getConfigStorageKey(projectKey));
      if (!raw) return defaults;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      return {
        mode: parsed.mode === 'openai_compatible' ? 'openai_compatible' : 'server_default',
        baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
        apiKey: loadSessionApiKey(projectKey),
        model: typeof parsed.model === 'string' ? parsed.model : '',
      };
    } catch (_error) {
      return defaults;
    }
  }

  var state = {
    enabled: false,
    serverReady: false,
    sending: false,
    basePath: config.basePath || '/',
    projectKey: 'default',
    scope: {},
    session: loadPersistedSession('default'),
    chatConfig: loadPersistedChatConfig('default'),
    runtime: {
      provider: 'anthropic',
      model: '',
      reason: '',
      requestConfigSupported: false,
      supportedProviders: [],
    },
  };

  function saveSession() {
    try {
      state.session.updated_at = nowIso();
      localStorage.setItem(getSessionStorageKey(state.projectKey), JSON.stringify({
        id: state.session.id,
        updated_at: state.session.updated_at,
        messages: buildPersistableMessages(state.session.messages),
      }));
    } catch (_error) {
      // Ignore localStorage failures.
    }
  }

  function saveChatConfig() {
    try {
      localStorage.setItem(getConfigStorageKey(state.projectKey), JSON.stringify({
        mode: state.chatConfig.mode,
        baseUrl: state.chatConfig.baseUrl,
        model: state.chatConfig.model,
      }));
      if (state.chatConfig.apiKey) {
        sessionStorage.setItem(getApiKeyStorageKey(state.projectKey), state.chatConfig.apiKey);
      } else {
        sessionStorage.removeItem(getApiKeyStorageKey(state.projectKey));
      }
    } catch (_error) {
      // Ignore storage failures.
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

  function updateStatus(text, meta) {
    statusEl.textContent = text;
    toggleMetaEl.textContent = meta || 'Local Memory';
  }

  function updateHint(text) {
    hintEl.textContent = text;
  }

  function updateConfigNote(text) {
    configNoteEl.textContent = text;
  }

  function clearMessages() {
    messagesEl.innerHTML = '';
  }

  function showEmptyState() {
    clearMessages();
    messagesEl.appendChild(emptyEl);
  }

  function isRelayMode() {
    return state.chatConfig.mode === 'openai_compatible';
  }

  function getTrimmedRelayConfig() {
    return {
      baseUrl: state.chatConfig.baseUrl.trim(),
      apiKey: state.chatConfig.apiKey.trim(),
      model: state.chatConfig.model.trim(),
    };
  }

  function hasRelayConfig() {
    var relayConfig = getTrimmedRelayConfig();
    return Boolean(relayConfig.baseUrl && relayConfig.apiKey && relayConfig.model);
  }

  function canUsePageConfig() {
    return state.enabled && state.runtime.requestConfigSupported;
  }

  function canCompose() {
    if (state.sending) return false;
    if (isRelayMode()) return canUsePageConfig() && hasRelayConfig();
    return state.serverReady;
  }

  function getModeLabel() {
    return isRelayMode() ? 'OpenAI-compatible relay' : 'Server default';
  }

  function getReadyHint() {
    if (state.scope.project) return 'Project: ' + state.scope.project + ' | ' + getModeLabel();
    return getModeLabel();
  }

  function getComposerPlaceholder() {
    if (!state.enabled) {
      return 'Run openmnemo report serve to enable AI Chat.';
    }

    if (isRelayMode()) {
      if (!canUsePageConfig()) {
        return 'This local report server does not support page-level relay settings.';
      }
      if (!hasRelayConfig()) {
        return 'Fill Base URL, API Key, and Model above.';
      }
      return 'Ask about imported sessions, decisions, or context...';
    }

    if (state.serverReady) {
      return 'Ask about imported sessions, decisions, or context...';
    }

    if (state.runtime.reason === 'missing_api_key') {
      return 'Switch Connection to OpenAI-Compatible and fill your relay settings above.';
    }

    return 'Run openmnemo report serve to enable local AI Chat.';
  }

  function setComposerState() {
    var relayMode = isRelayMode();
    var relayInputsEnabled = relayMode && canUsePageConfig() && !state.sending;
    input.disabled = !canCompose();
    sendBtn.disabled = !canCompose();
    resetBtn.disabled = state.sending;
    providerModeEl.disabled = state.sending;
    modelEl.disabled = !relayInputsEnabled;
    baseUrlEl.disabled = !relayInputsEnabled;
    apiKeyEl.disabled = !relayInputsEnabled;
    input.placeholder = getComposerPlaceholder();
  }

  function buildStatusSnapshot() {
    if (!state.enabled) {
      if (state.runtime.reason === 'static_report') {
        return {
          text: 'This page is in static mode. AI Chat activates in openmnemo report serve.',
          meta: 'Static Report',
        };
      }

      if (state.runtime.reason === 'repo_root_not_found') {
        return {
          text: 'AI Chat is unavailable because this server could not infer the repository root.',
          meta: 'Unavailable',
        };
      }

      return {
        text: 'Run openmnemo report serve to enable local AI Chat.',
        meta: 'Local Memory',
      };
    }

    if (isRelayMode()) {
      if (!canUsePageConfig()) {
        return {
          text: 'This local report server does not accept page-level relay settings yet.',
          meta: 'Unsupported',
        };
      }

      if (!hasRelayConfig()) {
        return {
          text: 'Fill Base URL, API Key, and Model to use your OpenAI-compatible relay.',
          meta: 'Config Needed',
        };
      }

      var relayConfig = getTrimmedRelayConfig();
      return {
        text: state.scope.project
          ? ('Ready via page relay for project ' + state.scope.project + '.')
          : 'Ready via page relay.',
        meta: relayConfig.model || 'Relay',
      };
    }

    if (state.serverReady) {
      return {
        text: state.scope.project
          ? ('Ready for project ' + state.scope.project + '.')
          : 'Ready for local memory chat.',
        meta: state.runtime.model || state.runtime.provider || 'Local Memory',
      };
    }

    if (state.runtime.reason === 'missing_api_key') {
      return {
        text: 'Server default provider is not configured.',
        meta: 'Config Needed',
      };
    }

    return {
      text: 'AI Chat is unavailable in this report session.',
      meta: 'Unavailable',
    };
  }

  function buildConfigNote() {
    if (!state.enabled) {
      return 'Base URL and model are saved locally in this browser. API key stays only in the current tab, and this page still needs openmnemo report serve as the local chat gateway.';
    }

    if (isRelayMode()) {
      if (!canUsePageConfig()) {
        return 'This server build does not support page-provided relay settings. Update openmnemo and retry.';
      }
      return 'Base URL and model are saved locally for this project. API key stays only in the current tab and is sent only to your local openmnemo report server.';
    }

    if (state.serverReady) {
      return 'Using the server default provider. Switch Connection to OpenAI-Compatible if you want page-local relay settings.';
    }

    if (state.runtime.reason === 'missing_api_key') {
      return 'Server default is missing credentials. Switch Connection to OpenAI-Compatible and fill your relay settings here.';
    }

    return 'Page-level relay config is available once the local report server is reachable.';
  }

  function syncRuntimeUi() {
    var status = buildStatusSnapshot();
    updateStatus(status.text, status.meta);
    updateHint(state.sending ? 'Streaming answer...' : getReadyHint());
    updateConfigNote(buildConfigNote());
    setComposerState();
  }

  function syncConfigInputs() {
    providerModeEl.value = state.chatConfig.mode;
    modelEl.value = state.chatConfig.model || '';
    baseUrlEl.value = state.chatConfig.baseUrl || '';
    apiKeyEl.value = state.chatConfig.apiKey || '';
  }

  function persistChatConfigFromInputs() {
    state.chatConfig = {
      mode: providerModeEl.value === 'openai_compatible' ? 'openai_compatible' : 'server_default',
      model: modelEl.value || '',
      baseUrl: baseUrlEl.value || '',
      apiKey: apiKeyEl.value || '',
    };
    saveChatConfig();
    syncRuntimeUi();
  }

  function resolveHref(href) {
    if (!href) return '';
    if (
      href.startsWith('http://')
      || href.startsWith('https://')
      || href.startsWith('//')
    ) return href;
    if (href.charAt(0) === '/') return href;

    var basePath = state.basePath || '/';
    if (!basePath.endsWith('/')) basePath += '/';
    return basePath + (href.charAt(0) === '/' ? href.slice(1) : href);
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
    showError('');
    syncRuntimeUi();
  }

  function switchProjectScope(scope) {
    var nextScope = scope || {};
    var nextProjectKey = normalizeProjectKey(nextScope);
    var sameProject = nextProjectKey === state.projectKey;

    state.scope = nextScope;
    if (sameProject) {
      syncRuntimeUi();
      return;
    }

    state.projectKey = nextProjectKey;
    state.session = loadPersistedSession(state.projectKey);
    state.chatConfig = loadPersistedChatConfig(state.projectKey);
    syncConfigInputs();
    renderSession();
    syncRuntimeUi();
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

  function buildRequestMessages() {
    return state.session.messages
      .filter(function(entry) {
        if (entry.role !== 'user' && entry.role !== 'assistant') return false;
        if (entry.failed === true) return false;
        return Boolean(typeof entry.content === 'string' && entry.content.trim());
      })
      .map(function(entry) {
        return { role: entry.role, content: entry.content };
      });
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
      state.enabled = false;
      state.serverReady = false;
      state.runtime = {
        provider: 'static',
        model: '',
        reason: 'static_report',
        requestConfigSupported: false,
        supportedProviders: [],
      };
      syncRuntimeUi();
      return;
    }

    try {
      var response = await fetch(config.healthUrl, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('health_failed');
      var payload = await response.json();
      state.enabled = Boolean(payload.enabled);
      state.serverReady = Boolean(payload.ready);
      state.basePath = (typeof payload.base_path === 'string' && payload.base_path) ? payload.base_path : state.basePath;
      state.runtime = {
        provider: typeof payload.provider === 'string' ? payload.provider : 'anthropic',
        model: typeof payload.model === 'string' ? payload.model : '',
        reason: typeof payload.reason === 'string' ? payload.reason : '',
        requestConfigSupported: Boolean(payload.request_provider_config_supported),
        supportedProviders: Array.isArray(payload.supported_providers) ? payload.supported_providers : [],
      };
      switchProjectScope(payload.scope || {});
    } catch (_error) {
      state.enabled = false;
      state.serverReady = false;
      state.runtime = {
        provider: 'static',
        model: '',
        reason: 'static_report',
        requestConfigSupported: false,
        supportedProviders: [],
      };
      syncRuntimeUi();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canCompose() || state.sending) return;

    var text = input.value.trim();
    if (!text) return;

    showError('');
    input.value = '';
    state.sending = true;
    syncRuntimeUi();

    var userEntry = { role: 'user', content: text };
    state.session.messages.push(userEntry);
    var assistantEntry = { role: 'assistant', content: '', citations: [], failed: false };
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
      var requestBody = {
        session_id: state.session.id,
        messages: buildRequestMessages(),
        scope: state.scope,
        options: {
          stream: true,
          max_context_hits: 8,
        },
      };

      if (isRelayMode()) {
        var relayConfig = getTrimmedRelayConfig();
        requestBody.provider = {
          kind: 'openai_compatible',
          base_url: relayConfig.baseUrl,
          api_key: relayConfig.apiKey,
          model: relayConfig.model,
        };
      }

      var response = await fetch(config.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
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
      assistantEntry.failed = false;
      saveSession();
    } catch (error) {
      assistantEntry.failed = true;
      assistantEntry.content = assistantText || 'Request failed. See error below.';
      if (assistantView && assistantView.bubble) assistantView.bubble.textContent = assistantEntry.content;
      saveSession();
      showError(error instanceof Error ? error.message : 'Unknown chat error.');
    } finally {
      state.sending = false;
      syncRuntimeUi();
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

  providerModeEl.addEventListener('change', function() {
    if (providerModeEl.value === 'openai_compatible' && !modelEl.value.trim()) {
      modelEl.value = 'gpt-4o-mini';
    }
    persistChatConfigFromInputs();
  });

  [modelEl, baseUrlEl, apiKeyEl].forEach(function(element) {
    element.addEventListener('input', persistChatConfigFromInputs);
  });

  form.addEventListener('submit', handleSubmit);
  input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sendBtn.disabled) form.requestSubmit();
    }
  });

  syncConfigInputs();
  renderSession();
  syncRuntimeUi();
  void loadHealth();
})();
</script>`
}
