<script>
  import { saveRequest } from './lib/db.js';
  import HistoryDrawer from './lib/HistoryDrawer.svelte';

  let url = $state('https://io.dev.clarityrcm.com/api/peripheral/health');
  let method = $state('GET');
  let body = $state('');
  let headers = $state([]);
  let response = $state(null);
  let responseStatus = $state(null);
  let responseHeaders = $state('');
  let loading = $state(false);
  let errorDebug = $state(null);
  let activeTab = $state('body');
  let drawerOpen = $state(false);
  let drawerRef = $state(null);

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const showBody = $derived(method === 'POST' || method === 'PUT' || method === 'PATCH');

  function addHeader() {
    headers = [...headers, { key: '', value: '' }];
  }

  function removeHeader(index) {
    headers = headers.filter((_, i) => i !== index);
  }

  function getMethodColor(m) {
    const colors = {
      GET: '#61affe',
      POST: '#49cc90',
      PUT: '#fca130',
      PATCH: '#50e3c2',
      DELETE: '#f93e3e',
      HEAD: '#9012fe',
      OPTIONS: '#0d5aa7',
    };
    return colors[m] || '#61affe';
  }

  /** Build a snapshot of the outgoing request for debug display */
  function buildRequestDebug(requestUrl, opts) {
    const lines = [];
    lines.push(`${opts.method} ${requestUrl}`);
    lines.push('');
    lines.push('--- Request Headers ---');
    const h = opts.headers || {};
    const keys = Object.keys(h);
    if (keys.length === 0) {
      lines.push('(none)');
    } else {
      for (const k of keys) {
        lines.push(`${k}: ${h[k]}`);
      }
    }
    if (opts.body) {
      lines.push('');
      lines.push('--- Request Body ---');
      lines.push(opts.body);
    }
    return lines.join('\n');
  }

  /** Try a manual OPTIONS preflight and return debug info */
  async function probePreflight(requestUrl, opts) {
    const lines = [];
    lines.push('--- Preflight Probe (OPTIONS) ---');
    lines.push(`OPTIONS ${requestUrl}`);
    lines.push('');
    try {
      // Use no-cors first to see if the server is reachable at all
      const probe = await fetch(requestUrl, {
        method: 'OPTIONS',
        mode: 'cors',
        headers: opts.headers || {},
      });
      lines.push(`Status: ${probe.status} ${probe.statusText}`);
      lines.push('');
      lines.push('--- Preflight Response Headers ---');
      let hasHeaders = false;
      probe.headers.forEach((value, key) => {
        lines.push(`${key}: ${value}`);
        hasHeaders = true;
      });
      if (!hasHeaders) {
        lines.push('(no headers exposed — browser may be blocking them)');
      }

      // Check for critical CORS headers
      lines.push('');
      lines.push('--- CORS Header Analysis ---');
      const acao = probe.headers.get('access-control-allow-origin');
      const acam = probe.headers.get('access-control-allow-methods');
      const acah = probe.headers.get('access-control-allow-headers');
      lines.push(`Access-Control-Allow-Origin: ${acao || '(missing)'}`);
      lines.push(`Access-Control-Allow-Methods: ${acam || '(missing)'}`);
      lines.push(`Access-Control-Allow-Headers: ${acah || '(missing)'}`);

      if (!acao) {
        lines.push('');
        lines.push('⚠ Server did not return Access-Control-Allow-Origin.');
        lines.push('  The browser will block the response.');
      }
    } catch (probeErr) {
      lines.push(`Preflight probe also failed: ${probeErr.name}: ${probeErr.message}`);
      lines.push('');
      lines.push('This usually means:');
      lines.push('  • The server is unreachable (DNS, network, firewall)');
      lines.push('  • The server does not respond to OPTIONS requests');
      lines.push('  • A browser extension is interfering');
    }
    return lines.join('\n');
  }

  async function sendRequest() {
    if (!url.trim()) {
      errorDebug = { message: 'Please enter a URL', request: '', preflight: '', response: '' };
      return;
    }

    loading = true;
    errorDebug = null;
    response = null;
    responseStatus = null;
    responseHeaders = '';
    activeTab = 'body';

    const opts = {
      method,
      mode: 'cors',
      headers: {},
    };

    // Add custom headers
    for (const h of headers) {
      if (h.key.trim()) {
        opts.headers[h.key.trim()] = h.value;
      }
    }

    // Add body for methods that support it
    if (showBody && body.trim()) {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      opts.body = body;
    }

    const requestDebug = buildRequestDebug(url, opts);
    const requestHeadersStr = Object.keys(opts.headers).length > 0
      ? Object.entries(opts.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
      : '';
    const startTime = performance.now();

    try {
      const res = await fetch(url, opts);
      const durationMs = Math.round(performance.now() - startTime);

      responseStatus = {
        code: res.status,
        text: res.statusText,
        ok: res.ok,
      };

      // Collect response headers
      const headerLines = [];
      res.headers.forEach((value, key) => {
        headerLines.push(`${key}: ${value}`);
      });
      responseHeaders = headerLines.join('\n');

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        response = JSON.stringify(json, null, 2);
      } else {
        response = await res.text();
      }

      // Save to database
      await saveRequest({
        timestamp: new Date().toISOString(),
        method,
        url,
        requestHeaders: requestHeadersStr,
        requestBody: opts.body || '',
        responseStatus: res.status,
        responseStatusText: res.statusText,
        responseHeaders,
        responseBody: response,
        error: null,
        durationMs,
      });
      drawerRef?.refresh();

      // If HTTP error (4xx/5xx), also populate errorDebug with full info
      if (!res.ok) {
        activeTab = 'response';
        errorDebug = {
          message: `HTTP ${res.status} ${res.statusText}`,
          request: requestDebug,
          preflight: '',
          response: `--- Response Status ---\n${res.status} ${res.statusText}\n\n--- Response Headers ---\n${responseHeaders}\n\n--- Response Body ---\n${response || '(empty)'}`,
        };
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);

      // Network / CORS / TypeError — fetch threw entirely
      let preflightDebug = '';
      const isCorsLikely = err instanceof TypeError;

      if (isCorsLikely) {
        preflightDebug = await probePreflight(url, opts);
      }

      const diagLines = [];
      diagLines.push(`${err.name}: ${err.message}`);
      if (isCorsLikely) {
        diagLines.push('');
        diagLines.push('Likely causes:');
        diagLines.push('  1. CORS: Server does not include the required Access-Control-Allow-* headers');
        diagLines.push('  2. Network: Server is unreachable (DNS failure, timeout, refused connection)');
        diagLines.push('  3. Mixed content: HTTPS page requesting HTTP resource');
        diagLines.push('  4. Certificate: SSL/TLS certificate error on the target server');
        diagLines.push('');
        diagLines.push('Check the browser DevTools Console & Network tab for more details.');
      }

      // Save error to database
      await saveRequest({
        timestamp: new Date().toISOString(),
        method,
        url,
        requestHeaders: requestHeadersStr,
        requestBody: opts.body || '',
        responseStatus: null,
        responseStatusText: null,
        responseHeaders: null,
        responseBody: null,
        error: `${err.name}: ${err.message}`,
        durationMs,
      });
      drawerRef?.refresh();

      activeTab = preflightDebug ? 'preflight' : 'request';
      errorDebug = {
        message: `${err.name}: ${err.message}`,
        request: requestDebug,
        preflight: preflightDebug,
        response: diagLines.join('\n'),
      };
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      sendRequest();
    }
  }

  function handleReplay(row) {
    method = row.method;
    url = row.url;
    if (row.request_headers) {
      headers = row.request_headers.split('\n').filter(Boolean).map((line) => {
        const idx = line.indexOf(':');
        return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
      });
    } else {
      headers = [];
    }
    body = row.request_body || '';
    drawerOpen = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<HistoryDrawer bind:this={drawerRef} bind:open={drawerOpen} onReplay={handleReplay} />

<main>
  <div class="app-header">
    <div class="app-header-row">
      <button class="history-toggle" onclick={() => drawerOpen = !drawerOpen} title="Request History">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        History
      </button>
      <div>
        <h1>API Client</h1>
        <p class="subtitle">Test API endpoints directly from your browser</p>
      </div>
    </div>
  </div>

  <div class="request-bar">
    <select bind:value={method} class="method-select" style="color: {getMethodColor(method)}">
      {#each methods as m}
        <option value={m} style="color: {getMethodColor(m)}">{m}</option>
      {/each}
    </select>
    <input
      type="text"
      bind:value={url}
      placeholder="Enter request URL..."
      class="url-input"
    />
    <button class="send-btn" onclick={sendRequest} disabled={loading}>
      {#if loading}
        <span class="spinner"></span> Sending...
      {:else}
        Send
      {/if}
    </button>
  </div>

  <!-- Headers Section -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Headers</span>
      <button class="add-header-btn" onclick={addHeader}>
        + Add Header
      </button>
    </div>
    {#if headers.length > 0}
      <div class="headers-list">
        {#each headers as header, i}
          <div class="header-row">
            <input
              type="text"
              bind:value={header.key}
              placeholder="Header name"
              class="header-input key-input"
            />
            <input
              type="text"
              bind:value={header.value}
              placeholder="Value"
              class="header-input value-input"
            />
            <button class="remove-btn" onclick={() => removeHeader(i)} title="Remove header">
              &times;
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Body Section (conditional) -->
  {#if showBody}
    <div class="section">
      <div class="section-header">
        <span class="section-title">Request Body <span class="badge">JSON</span></span>
      </div>
      <textarea
        bind:value={body}
        placeholder={'{"key": "value"}'}
        class="body-input"
        rows="6"
      ></textarea>
    </div>
  {/if}

  <!-- Error Debug Panel -->
  {#if errorDebug}
    <div class="section">
      <div class="error-box">
        <div class="error-title">{errorDebug.message}</div>
      </div>
      <div class="debug-panel">
        <div class="debug-tabs">
          <button class="debug-tab" class:active={activeTab === 'request'} onclick={() => activeTab = 'request'}>
            Request
          </button>
          {#if errorDebug.preflight}
            <button class="debug-tab" class:active={activeTab === 'preflight'} onclick={() => activeTab = 'preflight'}>
              Preflight
            </button>
          {/if}
          <button class="debug-tab" class:active={activeTab === 'response'} onclick={() => activeTab = 'response'}>
            Response / Diagnosis
          </button>
        </div>
        {#if activeTab === 'request'}
          <pre class="debug-body">{errorDebug.request || '(no request info)'}</pre>
        {:else if activeTab === 'preflight'}
          <pre class="debug-body">{errorDebug.preflight}</pre>
        {:else}
          <pre class="debug-body">{errorDebug.response || '(no response)'}</pre>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Success Response Section -->
  {#if responseStatus && !errorDebug}
    <div class="section">
      <div class="section-header">
        <span class="section-title">Response</span>
        <span class="status-badge" class:status-ok={responseStatus.ok} class:status-err={!responseStatus.ok}>
          {responseStatus.code} {responseStatus.text}
        </span>
      </div>

      <div class="response-tabs">
        <button
          class="tab-btn"
          class:active={activeTab === 'body'}
          onclick={() => activeTab = 'body'}
        >Body</button>
        <button
          class="tab-btn"
          class:active={activeTab === 'headers'}
          onclick={() => activeTab = 'headers'}
        >Headers</button>
      </div>

      {#if activeTab === 'body'}
        <pre class="response-body">{response || '(empty response)'}</pre>
      {:else}
        <pre class="response-body">{responseHeaders || '(no headers)'}</pre>
      {/if}
    </div>
  {/if}

  <div class="hint">
    Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to send request
  </div>
</main>

<style>
  main {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .app-header {
    margin-bottom: 2rem;
  }

  .app-header-row {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .app-header h1 {
    font-size: 1.75rem;
    margin: 0 0 0.25rem 0;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .subtitle {
    margin: 0;
    color: #888;
    font-size: 0.9rem;
  }

  .history-toggle {
    background: #1a1a2e;
    border: 1px solid #333;
    color: #aaa;
    padding: 0.45rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: all 0.2s;
    white-space: nowrap;
    margin-top: 0.25rem;
  }

  .history-toggle:hover {
    border-color: #646cff;
    color: #fff;
  }

  /* Request bar */
  .request-bar {
    display: flex;
    gap: 0;
    border: 2px solid #333;
    border-radius: 10px;
    overflow: hidden;
    background: #1a1a2e;
    margin-bottom: 1.5rem;
  }

  .method-select {
    background: #16162a;
    border: none;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
    cursor: pointer;
    border-right: 2px solid #333;
    outline: none;
    min-width: 100px;
    appearance: auto;
  }

  .url-input {
    flex: 1;
    background: transparent;
    border: none;
    padding: 0.75rem 1rem;
    font-size: 0.95rem;
    color: inherit;
    font-family: 'SF Mono', 'Fira Code', monospace;
    outline: none;
  }

  .url-input::placeholder {
    color: #555;
  }

  .send-btn {
    background: #646cff;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    border-radius: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .send-btn:hover:not(:disabled) {
    background: #535bf2;
  }

  .send-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Sections */
  .section {
    margin-bottom: 1.25rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .section-title {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #aaa;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge {
    font-size: 0.65rem;
    background: #333;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  /* Headers */
  .add-header-btn {
    background: transparent;
    color: #646cff;
    border: 1px dashed #646cff;
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .add-header-btn:hover {
    background: rgba(100, 108, 255, 0.1);
  }

  .headers-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .header-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .header-input {
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 0.55rem 0.75rem;
    font-size: 0.85rem;
    color: inherit;
    font-family: 'SF Mono', 'Fira Code', monospace;
    outline: none;
    transition: border-color 0.2s;
  }

  .header-input:focus {
    border-color: #646cff;
  }

  .key-input {
    flex: 2;
  }

  .value-input {
    flex: 3;
  }

  .remove-btn {
    background: transparent;
    color: #f93e3e;
    border: 1px solid #f93e3e33;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    background: rgba(249, 62, 62, 0.15);
    border-color: #f93e3e;
  }

  /* Body input */
  .body-input {
    width: 100%;
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    color: inherit;
    font-family: 'SF Mono', 'Fira Code', monospace;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .body-input:focus {
    border-color: #646cff;
  }

  /* Error */
  .error-box {
    background: rgba(249, 62, 62, 0.1);
    border: 1px solid #f93e3e44;
    color: #f93e3e;
    padding: 0.75rem 1rem;
    border-radius: 8px 8px 0 0;
    font-size: 0.85rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .error-title {
    font-weight: 600;
  }

  .debug-panel {
    border: 1px solid #f93e3e44;
    border-top: none;
    border-radius: 0 0 8px 8px;
    overflow: hidden;
  }

  .debug-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #333;
    background: rgba(249, 62, 62, 0.04);
  }

  .debug-tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    font-weight: 500;
    color: #888;
    cursor: pointer;
    transition: all 0.2s;
    border-radius: 0;
  }

  .debug-tab:hover {
    color: #ccc;
  }

  .debug-tab.active {
    color: #f93e3e;
    border-bottom-color: #f93e3e;
  }

  .debug-body {
    background: #1a1a2e;
    padding: 1rem;
    margin: 0;
    font-size: 0.78rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: #ccc;
  }

  /* Response */
  .status-badge {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .status-ok {
    background: rgba(73, 204, 144, 0.15);
    color: #49cc90;
  }

  .status-err {
    background: rgba(249, 62, 62, 0.15);
    color: #f93e3e;
  }

  .response-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 0;
    border-bottom: 1px solid #333;
  }

  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    font-weight: 500;
    color: #888;
    cursor: pointer;
    transition: all 0.2s;
    border-radius: 0;
  }

  .tab-btn:hover {
    color: #ccc;
  }

  .tab-btn.active {
    color: #646cff;
    border-bottom-color: #646cff;
  }

  .response-body {
    background: #1a1a2e;
    border: 1px solid #333;
    border-top: none;
    border-radius: 0 0 8px 8px;
    padding: 1rem;
    margin: 0;
    font-size: 0.8rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Hint */
  .hint {
    text-align: center;
    font-size: 0.75rem;
    color: #555;
    margin-top: 2rem;
  }

  kbd {
    background: #2a2a3e;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
    font-size: 0.7rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  /* Light mode overrides */
  @media (prefers-color-scheme: light) {
    .request-bar {
      background: #f5f5fa;
      border-color: #ddd;
    }

    .method-select {
      background: #eeeef5;
      border-right-color: #ddd;
    }

    .url-input::placeholder {
      color: #aaa;
    }

    .header-input,
    .body-input,
    .response-body {
      background: #f5f5fa;
      border-color: #ddd;
    }

    .response-tabs {
      border-bottom-color: #ddd;
    }

    .response-body {
      border-color: #ddd;
    }

    .badge {
      background: #e0e0e8;
    }

    .error-box {
      background: rgba(249, 62, 62, 0.05);
    }

    .debug-panel {
      border-color: #f93e3e33;
    }

    .debug-tabs {
      border-bottom-color: #ddd;
      background: rgba(249, 62, 62, 0.03);
    }

    .debug-body {
      background: #f5f5fa;
      color: #333;
    }

    kbd {
      background: #eee;
      border-color: #ccc;
    }

    .history-toggle {
      background: #f0f0f5;
      border-color: #ddd;
      color: #555;
    }
  }
</style>
