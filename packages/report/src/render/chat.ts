import { renderChatFrontendAdapterScript } from '../chat/frontend-adapter.js'
import { renderChatWidgetShell, REPORT_CHAT_WIDGET_CSS } from '../chat/ui.js'

export function renderChatWidget(): string {
  return [
    renderChatWidgetShell(),
    `<style>${REPORT_CHAT_WIDGET_CSS}</style>`,
    renderChatFrontendAdapterScript({
      healthUrl: '/api/chat/health',
      chatUrl: '/api/chat',
      storagePrefix: 'openmnemo-report-chat',
      basePath: '/',
    }),
  ].join('\n')
}
