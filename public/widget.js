(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.__AgentDeskInitialized) return;
  window.__AgentDeskInitialized = true;

  // 1. Locate configuration and host environment
  const currentScript =
    document.currentScript ||
    document.querySelector('script[data-business-id]');

  if (!currentScript) {
    console.warn('[AgentDesk] Script tag with data-business-id attribute not found.');
    return;
  }

  const businessId = currentScript.getAttribute('data-business-id');
  if (!businessId) {
    console.error('[AgentDesk] Missing data-business-id attribute on script tag.');
    return;
  }

  // Derive base API host from script tag URL
  let apiHost = '';
  try {
    const scriptSrc = currentScript.getAttribute('src') || '';
    if (scriptSrc.startsWith('http://') || scriptSrc.startsWith('https://')) {
      const parsedUrl = new URL(scriptSrc);
      apiHost = parsedUrl.origin;
    }
  } catch (e) {
    apiHost = '';
  }

  // Fallback to current window origin if same host or relative
  if (!apiHost) {
    apiHost = window.location.origin;
  }

  // 2. Visitor and Conversation State Persistence
  // Storage is optional: browsers may deny it in embedded/private contexts.
  // Keep the widget usable for this page lifetime when persistence is unavailable.
  const VISITOR_KEY = 'agentdesk_visitor_' + businessId;
  const CONV_KEY = 'agentdesk_conv_' + businessId;
  const volatileStorage = Object.create(null);

  function readStoredValue(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) volatileStorage[key] = value;
      return value === null ? volatileStorage[key] || null : value;
    } catch (_) {
      return volatileStorage[key] || null;
    }
  }

  function writeStoredValue(key, value) {
    volatileStorage[key] = value;
    try { window.localStorage.setItem(key, value); } catch (_) { /* In-memory session fallback. */ }
  }

  function getVisitorId() {
    let vid = readStoredValue(VISITOR_KEY);
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      writeStoredValue(VISITOR_KEY, vid);
    }
    return vid;
  }

  function getStoredConversationId() {
    return readStoredValue(CONV_KEY);
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function setStoredConversationId(id) {
    if (id) {
      writeStoredValue(CONV_KEY, id);
    }
  }

  // 3. Default Configuration
  let config = {
    primary_color: '#2563eb',
    text_color: '#ffffff',
    welcome_message: 'Hello! How can I help you today?',
    bot_name: 'Support Bot',
    bot_avatar_url: null,
    position: 'bottom-right',
    show_branding: true,
    auto_open_delay_ms: null,
    placeholder_text: 'Type a message...',
    offline_message: 'We are unavailable. Please contact this business directly.',
  };

  let isOpen = false;
  let isSending = false;
  let messages = [];
  let pendingMessage = null;

  function normalizeRemoteConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return config;
    const colorPattern = /^#[0-9a-f]{3}(?:[0-9a-f]{3}|[0-9a-f]{5})?$/i;
    const next = { ...config };
    for (const key of ['primary_color', 'text_color']) {
      if (typeof value[key] === 'string' && colorPattern.test(value[key])) next[key] = value[key].toLowerCase();
    }
    const limits = { bot_name: 60, welcome_message: 500, placeholder_text: 80, offline_message: 300 };
    for (const [key, max] of Object.entries(limits)) {
      if (typeof value[key] === 'string' && value[key].trim() && value[key].length <= max) next[key] = value[key].trim();
    }
    if (value.position === 'bottom-left' || value.position === 'bottom-right') next.position = value.position;
    if (typeof value.show_branding === 'boolean') next.show_branding = value.show_branding;
    if (value.auto_open_delay_ms === null || (Number.isInteger(value.auto_open_delay_ms) && value.auto_open_delay_ms >= 0 && value.auto_open_delay_ms <= 30000)) next.auto_open_delay_ms = value.auto_open_delay_ms;
    if (value.bot_avatar_url === null || value.bot_avatar_url === '') next.bot_avatar_url = null;
    else if (typeof value.bot_avatar_url === 'string' && value.bot_avatar_url.length <= 2048) {
      try {
        const avatar = new URL(value.bot_avatar_url);
        if (avatar.protocol === 'https:' && !avatar.username && !avatar.password) next.bot_avatar_url = avatar.toString();
      } catch (_) { /* Keep safe default avatar. */ }
    }
    return next;
  }

  // SVG Icons
  const ICONS = {
    chat: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
    close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    send: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
    bot: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8.01" y2="16"></line><line x1="16" y1="16" x2="16.01" y2="16"></line></svg>`,
  };

  // 4. Styles Injection
  function injectStyles() {
    if (document.getElementById('agentdesk-styles')) return;

    const isLeft = config.position === 'bottom-left';
    const primary = config.primary_color;
    const textOnPrimary = config.text_color;

    const styleEl = document.createElement('style');
    styleEl.id = 'agentdesk-styles';
    styleEl.textContent = `
      #agentdesk-root {
        position: fixed;
        bottom: 24px;
        ${isLeft ? 'left: 24px;' : 'right: 24px;'}
        z-index: 2147483640;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.45;
        color: #1f2937;
        box-sizing: border-box;
      }
      #agentdesk-root * {
        box-sizing: border-box;
      }

      /* Floating Launcher Button */
      .agentdesk-launcher {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: ${primary};
        color: ${textOnPrimary};
        border: none;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.12);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
        outline: none;
      }
      .agentdesk-launcher:hover {
        transform: scale(1.06);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.24);
      }
      .agentdesk-launcher:active {
        transform: scale(0.96);
      }

      /* Chat Window Box */
      .agentdesk-window {
        position: absolute;
        bottom: 74px;
        ${isLeft ? 'left: 0;' : 'right: 0;'}
        width: 380px;
        max-width: calc(100vw - 32px);
        height: 580px;
        max-height: calc(100vh - 110px);
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.08);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(0, 0, 0, 0.08);
        opacity: 0;
        pointer-events: none;
        transform: translateY(16px) scale(0.96);
        transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .agentdesk-window.agentdesk-open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0) scale(1);
      }

      /* Chat Header */
      .agentdesk-header {
        background-color: ${primary};
        color: ${textOnPrimary};
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .agentdesk-header-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .agentdesk-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
      }
      .agentdesk-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .agentdesk-title-group {
        display: flex;
        flex-direction: column;
      }
      .agentdesk-title {
        font-weight: 600;
        font-size: 15px;
        line-height: 1.2;
      }
      .agentdesk-status {
        font-size: 12px;
        opacity: 0.85;
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 2px;
      }
      .agentdesk-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background-color: #22c55e;
        display: inline-block;
      }
      .agentdesk-close-btn {
        background: transparent;
        border: none;
        color: ${textOnPrimary};
        cursor: pointer;
        padding: 6px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.85;
        transition: opacity 0.15s ease, background 0.15s ease;
      }
      .agentdesk-close-btn:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.15);
      }

      /* Messages Area */
      .agentdesk-messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background-color: #f9fafb;
        scroll-behavior: smooth;
      }
      .agentdesk-bubble {
        max-width: 82%;
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 14px;
        line-height: 1.45;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .agentdesk-bubble-assistant {
        align-self: flex-start;
        background-color: #ffffff;
        color: #1f2937;
        border: 1px solid #e5e7eb;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }
      .agentdesk-bubble-user {
        align-self: flex-end;
        background-color: ${primary};
        color: ${textOnPrimary};
        border-bottom-right-radius: 4px;
      }
      .agentdesk-bubble-system {
        align-self: center;
        background: transparent;
        color: #6b7280;
        font-size: 12px;
        font-style: italic;
        padding: 4px 8px;
      }
      .agentdesk-retry { margin-left: 8px; padding: 3px 8px; border: 1px solid #d1d5db; border-radius: 12px; background: #fff; color: #374151; cursor: pointer; }

      /* Typing Indicator */
      .agentdesk-typing {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 8px 12px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        width: fit-content;
        align-self: flex-start;
      }
      .agentdesk-typing span {
        width: 6px;
        height: 6px;
        background-color: #9ca3af;
        border-radius: 50%;
        animation: agentdesk-bounce 1.3s infinite ease-in-out;
      }
      .agentdesk-typing span:nth-child(2) { animation-delay: 0.2s; }
      .agentdesk-typing span:nth-child(3) { animation-delay: 0.4s; }

      @keyframes agentdesk-bounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-5px); }
      }

      /* Footer Input Area */
      .agentdesk-footer {
        padding: 12px;
        background-color: #ffffff;
        border-top: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .agentdesk-escalate { align-self: center; border: 0; background: transparent; color: #4f46e5; font-size: 11px; text-decoration: underline; cursor: pointer; }
      .agentdesk-escalate:disabled { color: #9ca3af; cursor: not-allowed; }
      .agentdesk-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .agentdesk-privacy {
        color: #6b7280;
        font-size: 10px;
        line-height: 1.4;
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .agentdesk-privacy input { margin: 1px 0 0; }
      .agentdesk-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #d1d5db;
        border-radius: 20px;
        outline: none;
        font-size: 14px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        background: #ffffff;
        color: #1f2937;
      }
      .agentdesk-input:focus {
        border-color: ${primary};
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
      }
      .agentdesk-send-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background-color: ${primary};
        color: ${textOnPrimary};
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.15s ease, opacity 0.15s ease;
        flex-shrink: 0;
      }
      .agentdesk-send-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .agentdesk-send-btn:not(:disabled):hover {
        transform: scale(1.05);
      }

      /* Branding */
      .agentdesk-branding {
        text-align: center;
        font-size: 11px;
        color: #9ca3af;
      }
      .agentdesk-branding a {
        color: #6b7280;
        text-decoration: none;
        font-weight: 500;
      }
      .agentdesk-branding a:hover {
        text-decoration: underline;
      }

      /* Responsive Mobile Adjustments */
      @media (max-width: 480px) {
        #agentdesk-root {
          bottom: 16px;
          ${isLeft ? 'left: 16px;' : 'right: 16px;'}
        }
        .agentdesk-window {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          max-width: 100vw;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
          border: none;
        }
      }
    `;

    document.head.appendChild(styleEl);
  }

  // 5. DOM Initialization
  let rootEl, windowEl, launcherEl, messagesEl, inputEl, sendBtnEl, escalateBtnEl;

  function renderWidget() {
    injectStyles();

    rootEl = document.createElement('div');
    rootEl.id = 'agentdesk-root';

    // Launcher button
    launcherEl = document.createElement('button');
    launcherEl.className = 'agentdesk-launcher';
    launcherEl.setAttribute('aria-label', 'Open support chat');
    launcherEl.innerHTML = ICONS.chat;
    launcherEl.onclick = toggleChat;

    // Chat Window
    windowEl = document.createElement('div');
    windowEl.className = 'agentdesk-window';

    const create = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const header = create('div', 'agentdesk-header');
    const info = create('div', 'agentdesk-header-info');
    const avatar = create('div', 'agentdesk-avatar');
    if (config.bot_avatar_url) {
      const image = create('img');
      image.src = config.bot_avatar_url;
      image.alt = config.bot_name;
      image.referrerPolicy = 'no-referrer';
      avatar.appendChild(image);
    } else avatar.innerHTML = ICONS.bot;
    const titleGroup = create('div', 'agentdesk-title-group');
    titleGroup.appendChild(create('span', 'agentdesk-title', config.bot_name));
    const status = create('span', 'agentdesk-status');
    status.appendChild(create('span', 'agentdesk-status-dot'));
    status.appendChild(document.createTextNode('Support chat'));
    titleGroup.appendChild(status);
    info.append(avatar, titleGroup);
    const close = create('button', 'agentdesk-close-btn');
    close.type = 'button'; close.setAttribute('aria-label', 'Close chat'); close.innerHTML = ICONS.close;
    header.append(info, close);
    const messageArea = create('div', 'agentdesk-messages');
    messageArea.setAttribute('role', 'log'); messageArea.setAttribute('aria-live', 'polite');
    const footer = create('div', 'agentdesk-footer');
    const privacy = create('label', 'agentdesk-privacy');
    privacy.id = 'agentdesk-privacy-note';
    const consent = create('input', 'agentdesk-privacy-consent'); consent.type = 'checkbox';
    privacy.append(consent, document.createTextNode('If AI is enabled, messages may be processed by the configured AI provider. Avoid sharing sensitive information.'));
    const form = create('form', 'agentdesk-input-row');
    const input = create('input', 'agentdesk-input'); input.type = 'text'; input.maxLength = 2000;
    input.placeholder = config.placeholder_text; input.setAttribute('aria-describedby', privacy.id);
    const send = create('button', 'agentdesk-send-btn'); send.type = 'submit'; send.setAttribute('aria-label', 'Send message'); send.disabled = true; send.innerHTML = ICONS.send;
    form.append(input, send);
    escalateBtnEl = create('button', 'agentdesk-escalate', 'Ask the business to follow up');
    escalateBtnEl.type = 'button';
    escalateBtnEl.disabled = !getStoredConversationId();
    escalateBtnEl.setAttribute('aria-label', 'Ask the business to follow up in this conversation');
    escalateBtnEl.onclick = requestHumanFollowUp;
    footer.append(privacy, form, escalateBtnEl);
    if (config.show_branding) {
      const branding = create('div', 'agentdesk-branding', 'Powered by ');
      const link = create('a', '', 'AgentDesk'); link.href = 'https://agentdesk.ai'; link.target = '_blank'; link.rel = 'noopener noreferrer';
      branding.appendChild(link); footer.appendChild(branding);
    }
    windowEl.append(header, messageArea, footer);

    rootEl.appendChild(windowEl);
    rootEl.appendChild(launcherEl);
    document.body.appendChild(rootEl);

    // Bind Elements
    messagesEl = windowEl.querySelector('.agentdesk-messages');
    inputEl = windowEl.querySelector('.agentdesk-input');
    sendBtnEl = windowEl.querySelector('.agentdesk-send-btn');
    const consentEl = windowEl.querySelector('.agentdesk-privacy-consent');
    consentEl.onchange = function () { sendBtnEl.disabled = !consentEl.checked || isSending; };
    const closeBtn = windowEl.querySelector('.agentdesk-close-btn');

    closeBtn.onclick = toggleChat;

    form.onsubmit = function (e) {
      e.preventDefault();
      handleSendMessage();
    };

    // Load or initialize messages
    if (config.welcome_message) {
      messages = [
        {
          role: 'assistant',
          content: config.welcome_message,
        },
      ];
    }

    renderMessages();

    // Auto open if configured
    if (config.auto_open_delay_ms && config.auto_open_delay_ms > 0) {
      setTimeout(() => {
        if (!isOpen) openChat();
      }, config.auto_open_delay_ms);
    }
  }

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.replaceChildren();

    messages.forEach((msg) => {
      const bubble = document.createElement('div');
      bubble.className = `agentdesk-bubble agentdesk-bubble-${msg.role}`;
      bubble.textContent = msg.content;
      if (msg.retryable && msg.clientMessageId) {
        const retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'agentdesk-retry'; retry.textContent = 'Retry';
        retry.setAttribute('aria-label', 'Retry sending your message');
        retry.onclick = () => handleSendMessage({ content: msg.pendingText, clientMessageId: msg.clientMessageId });
        bubble.appendChild(retry);
      }
      messagesEl.appendChild(bubble);
      if (msg.role === 'assistant' && Array.isArray(msg.sources) && msg.sources.length) {
        const citations = document.createElement('div');
        citations.className = 'agentdesk-citations';
        citations.style.cssText = 'align-self:flex-start;font-size:11px;line-height:1.5;color:#6b7280;margin:-6px 0 4px;';
        citations.textContent = 'Sources: ';
        msg.sources.slice(0, 3).forEach((source, index) => {
          try {
            const url = new URL(source.url);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
            if (index) citations.appendChild(document.createTextNode(' · '));
            const link = document.createElement('a');
            link.href = url.toString(); link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.textContent = typeof source.title === 'string' ? source.title.slice(0, 80) : url.hostname;
            link.style.cssText = 'color:#4f46e5;text-decoration:underline;';
            citations.appendChild(link);
          } catch { /* Ignore malformed source references. */ }
        });
        if (citations.childNodes.length > 1) messagesEl.appendChild(citations);
      }
    });

    scrollToBottom();
  }

  function scrollToBottom() {
    if (!messagesEl) return;
    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 10);
  }

  function showTypingIndicator() {
    const typing = document.createElement('div');
    typing.id = 'agentdesk-typing-indicator';
    typing.className = 'agentdesk-typing';
    typing.innerHTML = `<span></span><span></span><span></span>`;
    messagesEl.appendChild(typing);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    const typing = document.getElementById('agentdesk-typing-indicator');
    if (typing) typing.remove();
  }

  function openChat() {
    isOpen = true;
    windowEl.classList.add('agentdesk-open');
    launcherEl.innerHTML = ICONS.close;
    setTimeout(() => {
      if (inputEl) inputEl.focus();
    }, 150);
  }

  function closeChat() {
    isOpen = false;
    windowEl.classList.remove('agentdesk-open');
    launcherEl.innerHTML = ICONS.chat;
  }

  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  async function requestHumanFollowUp() {
    const conversationId = getStoredConversationId();
    if (!conversationId || !escalateBtnEl || escalateBtnEl.disabled) return;
    escalateBtnEl.disabled = true;
    try {
      const response = await fetch(`${apiHost}/api/widget/escalate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ business_id: businessId, conversation_id: conversationId, visitor_id: getVisitorId() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : config.offline_message);
      messages.push({ role: 'system', content: data.message || 'Your request is recorded for the business to review in AgentDesk.' });
      escalateBtnEl.textContent = 'Request recorded';
      renderMessages();
    } catch (error) {
      messages.push({ role: 'system', content: error instanceof Error ? error.message : config.offline_message });
      escalateBtnEl.disabled = false;
      renderMessages();
    }
  }

  // 6. Send Message Logic
  async function handleSendMessage(retryItem) {
    if (isSending || !inputEl) return;
    const consentEl = windowEl.querySelector('.agentdesk-privacy-consent');
    if (!consentEl || !consentEl.checked) return;
    const text = (retryItem && retryItem.content) || inputEl.value.trim();
    if (!text) return;

    const clientMessageId = retryItem?.clientMessageId || newId();
    let conversationId = getStoredConversationId();
    if (!conversationId) { conversationId = newId(); setStoredConversationId(conversationId); }
    if (escalateBtnEl) escalateBtnEl.disabled = true;
    pendingMessage = { content: text, clientMessageId, conversationId };
    if (!retryItem) {
      inputEl.value = '';
      messages.push({ role: 'user', content: text, clientMessageId });
    }
    isSending = true;
    sendBtnEl.disabled = true;
    renderMessages();

    showTypingIndicator();

    const visitorId = getVisitorId();
    try {
      const res = await fetch(`${apiHost}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          business_id: businessId,
          conversation_id: conversationId,
          client_message_id: clientMessageId,
          visitor_id: visitorId,
          message: text,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data.conversation_id) {
        setStoredConversationId(data.conversation_id);
        if (escalateBtnEl) escalateBtnEl.disabled = false;
      }
      hideTypingIndicator();
      if (!res.ok) {
        const failure = new Error(typeof data.error === 'string' ? data.error : config.offline_message);
        failure.payload = data;
        throw failure;
      }
      messages = messages.filter((msg) => !(msg.role === 'system' && msg.clientMessageId === clientMessageId));
      pendingMessage = null;

      if (data.message && data.message.content) {
        messages.push({
          role: 'assistant',
          content: data.message.content,
          sources: Array.isArray(data.sources) ? data.sources : [],
        });
      } else {
        messages.push({
          role: 'assistant',
          content: "I'm sorry, I couldn't process that response. Please try again.",
        });
      }
    } catch (err) {
      console.warn('[AgentDesk] Chat request failed.');
      hideTypingIndicator();
      const payload = err && err.payload;
      if (payload && payload.conversation_id) {
        setStoredConversationId(payload.conversation_id);
        if (escalateBtnEl) escalateBtnEl.disabled = false;
      }
      messages.push({
        role: 'system',
        content: err instanceof Error ? err.message : (config.offline_message || 'Sorry, we are having trouble connecting. Please try again soon.'),
        retryable: payload?.retryable !== false,
        clientMessageId,
        pendingText: pendingMessage?.content || text,
      });
    } finally {
      isSending = false;
      const consentEl = windowEl.querySelector('.agentdesk-privacy-consent');
      sendBtnEl.disabled = !consentEl || !consentEl.checked;
      renderMessages();
      if (inputEl) inputEl.focus();
    }
  }

  // 7. Fetch remote widget configuration
  async function init() {
    try {
      const res = await fetch(`${apiHost}/api/widget/${businessId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.config) {
          config = normalizeRemoteConfig(data.config);
        }
      }
    } catch (e) {
      console.warn('[AgentDesk] Failed to load remote widget config, using defaults.');
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderWidget);
    } else {
      renderWidget();
    }
  }

  init();
})();
