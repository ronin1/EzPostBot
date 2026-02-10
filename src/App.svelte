<script>
  import { saveRequest } from './lib/db.js';
  import HistoryDrawer from './lib/HistoryDrawer.svelte';

  let url = $state('https://io.dev.clarityrcm.com/api/peripheral/health');
  let method = $state('GET');
  let body = $state('');
  let headers = $state([]);
  let queryParams = $state([]);
  let response = $state(null);
  let responseStatus = $state(null);
  let responseHeaders = $state('');
  let loading = $state(false);
  let errorDebug = $state(null);
  let activeTab = $state('body');
  let responseDuration = $state(null);
  let copiedPanel = $state(null);

  async function copyPanelText(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      copiedPanel = id;
      setTimeout(() => { if (copiedPanel === id) copiedPanel = null; }, 1500);
    } catch {}
  }

  let drawerOpen = $state(false);
  let drawerRef = $state(null);

  const MIN_DRAWER = 260;
  const DEFAULT_DRAWER_RATIO = 0.42;
  const MAX_DRAWER_RATIO = 0.7;

  function getDefaultDrawerWidth() {
    const viewport = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const target = Math.floor(viewport * DEFAULT_DRAWER_RATIO);
    const maxAllowed = Math.floor(viewport * MAX_DRAWER_RATIO);
    return Math.min(maxAllowed, Math.max(MIN_DRAWER, target));
  }

  // Resize state
  let drawerWidth = $state(getDefaultDrawerWidth());
  let isResizing = $state(false);

  function toggleHistoryDrawer() {
    if (!drawerOpen) {
      drawerWidth = getDefaultDrawerWidth();
      drawerOpen = true;
      return;
    }
    drawerOpen = false;
  }

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const showBody = $derived(method === 'POST' || method === 'PUT' || method === 'PATCH');

  function startResize(e) {
    e.preventDefault();
    isResizing = true;

    function onMouseMove(e) {
      const maxWidth = window.innerWidth * MAX_DRAWER_RATIO;
      drawerWidth = Math.min(maxWidth, Math.max(MIN_DRAWER, e.clientX));
    }

    function onMouseUp() {
      isResizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function addHeader() {
    headers = [...headers, { key: '', value: '' }];
  }

  function removeHeader(index) {
    headers = headers.filter((_, i) => i !== index);
  }

  function addQueryParam() {
    queryParams = [...queryParams, { key: '', value: '' }];
  }

  function removeQueryParam(index) {
    queryParams = queryParams.filter((_, i) => i !== index);
  }

  const activeQueryParams = $derived(
    queryParams.filter((q) => q.key.trim())
  );

  const querySuffix = $derived.by(() => {
    if (activeQueryParams.length === 0) return '';
    const encoded = activeQueryParams
      .map((q) => `${encodeURIComponent(q.key.trim())}=${encodeURIComponent(q.value || '')}`)
      .join('&');
    return encoded ? `${url.includes('?') ? '&' : '?'}${encoded}` : '';
  });

  function buildRequestUrl(baseUrl) {
    if (!querySuffix) return baseUrl;
    try {
      const parsed = new URL(baseUrl);
      for (const q of activeQueryParams) {
        parsed.searchParams.append(q.key.trim(), q.value || '');
      }
      return parsed.toString();
    } catch {
      return `${baseUrl}${querySuffix}`;
    }
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
        lines.push('Warning: Server did not return Access-Control-Allow-Origin.');
        lines.push('  The browser will block the response.');
      }
    } catch (probeErr) {
      lines.push(`Preflight probe also failed: ${probeErr.name}: ${probeErr.message}`);
      lines.push('');
      lines.push('This usually means:');
      lines.push('  - The server is unreachable (DNS, network, firewall)');
      lines.push('  - The server does not respond to OPTIONS requests');
      lines.push('  - A browser extension is interfering');
    }
    return lines.join('\n');
  }

  async function sendRequest() {
    if (!url.trim()) {
      errorDebug = { message: 'Please enter a URL', request: '', preflight: '', rawResponse: '', diagnosis: '' };
      return;
    }

    loading = true;
    errorDebug = null;
    response = null;
    responseStatus = null;
    responseHeaders = '';
    activeTab = 'body';
    responseDuration = null;

    const opts = {
      method,
      mode: 'cors',
      headers: {},
    };

    for (const h of headers) {
      if (h.key.trim()) {
        opts.headers[h.key.trim()] = h.value;
      }
    }

    if (showBody && body.trim()) {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      opts.body = body;
    }

    const requestUrl = buildRequestUrl(url);
    const requestDebug = buildRequestDebug(requestUrl, opts);
    const requestHeadersStr = Object.keys(opts.headers).length > 0
      ? Object.entries(opts.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
      : '';
    const startTime = performance.now();

    try {
      const res = await fetch(requestUrl, opts);
      const durationMs = Math.round(performance.now() - startTime);
      responseDuration = durationMs;

      responseStatus = {
        code: res.status,
        text: res.statusText,
        ok: res.ok,
      };

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

      if (!res.ok) {
        const diagText = `HTTP error ${res.status} ${res.statusText}\n\nThe server returned a non-successful status code.\nCheck the Response tab for full details.`;
        activeTab = 'rawResponse';
        errorDebug = {
          message: `HTTP ${res.status} ${res.statusText}`,
          request: requestDebug,
          preflight: '',
          rawResponse: `--- Response Status ---\n${res.status} ${res.statusText}\n\n--- Response Headers ---\n${responseHeaders}\n\n--- Response Body ---\n${response || '(empty)'}`,
          diagnosis: diagText,
        };
        await saveRequest({
          timestamp: new Date().toISOString(),
          method,
          url: requestUrl,
          requestHeaders: requestHeadersStr,
          requestBody: opts.body || '',
          responseStatus: res.status,
          responseStatusText: res.statusText,
          responseHeaders,
          responseBody: response,
          error: `HTTP ${res.status} ${res.statusText}`,
          durationMs,
          diagnosis: diagText,
          preflight: '',
        });
      } else {
        await saveRequest({
          timestamp: new Date().toISOString(),
          method,
          url: requestUrl,
          requestHeaders: requestHeadersStr,
          requestBody: opts.body || '',
          responseStatus: res.status,
          responseStatusText: res.statusText,
          responseHeaders,
          responseBody: response,
          error: null,
          durationMs,
          diagnosis: null,
          preflight: null,
        });
      }
      drawerRef?.refresh();
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      responseDuration = durationMs;
      let preflightDebug = '';
      const isCorsLikely = err instanceof TypeError;

      if (isCorsLikely) {
        preflightDebug = await probePreflight(requestUrl, opts);
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

      const diagText = diagLines.join('\n');

      activeTab = preflightDebug ? 'preflight' : 'rawResponse';
      errorDebug = {
        message: `${err.name}: ${err.message}`,
        request: requestDebug,
        preflight: preflightDebug,
        rawResponse: `${err.name}: ${err.message}`,
        diagnosis: diagText,
      };

      await saveRequest({
        timestamp: new Date().toISOString(),
        method,
        url: requestUrl,
        requestHeaders: requestHeadersStr,
        requestBody: opts.body || '',
        responseStatus: null,
        responseStatusText: null,
        responseHeaders: null,
        responseBody: null,
        error: `${err.name}: ${err.message}`,
        durationMs,
        diagnosis: diagText,
        preflight: preflightDebug || null,
      });
      drawerRef?.refresh();
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
    try {
      const parsed = new URL(row.url);
      parsed.search = '';
      url = parsed.toString();
      queryParams = [];
      for (const [key, value] of new URL(row.url).searchParams.entries()) {
        queryParams = [...queryParams, { key, value }];
      }
    } catch {
      const idx = row.url.indexOf('?');
      if (idx >= 0) {
        url = row.url.slice(0, idx);
        const qs = row.url.slice(idx + 1);
        queryParams = qs
          .split('&')
          .filter(Boolean)
          .map((pair) => {
            const [k, ...rest] = pair.split('=');
            return {
              key: decodeURIComponent(k || ''),
              value: decodeURIComponent(rest.join('=') || ''),
            };
          });
      } else {
        url = row.url;
        queryParams = [];
      }
    }
    if (row.request_headers) {
      headers = row.request_headers.split('\n').filter(Boolean).map((line) => {
        const idx = line.indexOf(':');
        return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
      });
    } else {
      headers = [];
    }
    body = row.request_body || '';
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app-layout" class:resizing={isResizing}>
  {#if drawerOpen}
    <div class="drawer-pane" style="width: {drawerWidth}px; min-width: {MIN_DRAWER}px">
      <HistoryDrawer bind:this={drawerRef} bind:open={drawerOpen} onReplay={handleReplay} />
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle" onmousedown={startResize}>
      <div class="resize-grip"></div>
    </div>
  {/if}

  <main class="main-pane">
    <div class="main-scroll">
      <div class="main-content">
        <div class="app-header">
          <div class="app-header-row">
            <button class="history-toggle" onclick={toggleHistoryDrawer} title="Request History">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                {#if drawerOpen}
                  <polyline points="11 17 6 12 11 7"/>
                  <polyline points="18 17 13 12 18 7"/>
                {:else}
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                {/if}
              </svg>
              {drawerOpen ? 'Hide' : 'History'}
            </button>
            <div>
              <h1>👾 PostBot</h1>
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
          <div class="url-input-wrap">
            <input
              type="text"
              bind:value={url}
              placeholder="Enter request URL..."
              class="url-input"
            />
            {#if querySuffix}
              <span class="url-query-preview" title={querySuffix}>{querySuffix}</span>
            {/if}
          </div>
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

        <!-- Query Params Section -->
        <div class="section">
          <div class="section-header">
            <span class="section-title">Query Params</span>
            <button class="add-header-btn" onclick={addQueryParam}>
              + Add Param
            </button>
          </div>
          {#if queryParams.length > 0}
            <div class="headers-list">
              {#each queryParams as param, i}
                <div class="header-row">
                  <input
                    type="text"
                    bind:value={param.key}
                    placeholder="Param name"
                    class="header-input key-input"
                  />
                  <input
                    type="text"
                    bind:value={param.value}
                    placeholder="Value"
                    class="header-input value-input"
                  />
                  <button class="remove-btn" onclick={() => removeQueryParam(i)} title="Remove query param">
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
                <button class="debug-tab" class:active={activeTab === 'rawResponse'} onclick={() => activeTab = 'rawResponse'}>
                  Response
                </button>
                <button class="debug-tab" class:active={activeTab === 'diagnosis'} onclick={() => activeTab = 'diagnosis'}>
                  Diagnosis
                </button>
                <button class="debug-tab" class:active={activeTab === 'request'} onclick={() => activeTab = 'request'}>
                  Request
                </button>
                {#if errorDebug.preflight}
                  <button class="debug-tab" class:active={activeTab === 'preflight'} onclick={() => activeTab = 'preflight'}>
                    Preflight
                  </button>
                {/if}
              </div>
              {#if activeTab === 'rawResponse'}
                <div class="response-pre-wrapper">
                  <button class="response-copy-btn" onclick={() => copyPanelText(errorDebug.rawResponse || '', 'dbg-response')} title="Copy">
                    {copiedPanel === 'dbg-response' ? '✓' : '⧉'}
                  </button>
                  <pre class="debug-body">{errorDebug.rawResponse || '(no response)'}</pre>
                </div>
              {:else if activeTab === 'diagnosis'}
                <div class="response-pre-wrapper">
                  <button class="response-copy-btn" onclick={() => copyPanelText(errorDebug.diagnosis || '', 'dbg-diagnosis')} title="Copy">
                    {copiedPanel === 'dbg-diagnosis' ? '✓' : '⧉'}
                  </button>
                  <pre class="debug-body">{errorDebug.diagnosis || '(no diagnosis available)'}</pre>
                </div>
              {:else if activeTab === 'request'}
                <div class="response-pre-wrapper">
                  <button class="response-copy-btn" onclick={() => copyPanelText(errorDebug.request || '', 'dbg-request')} title="Copy">
                    {copiedPanel === 'dbg-request' ? '✓' : '⧉'}
                  </button>
                  <pre class="debug-body">{errorDebug.request || '(no request info)'}</pre>
                </div>
              {:else if activeTab === 'preflight'}
                <div class="response-pre-wrapper">
                  <button class="response-copy-btn" onclick={() => copyPanelText(errorDebug.preflight || '', 'dbg-preflight')} title="Copy">
                    {copiedPanel === 'dbg-preflight' ? '✓' : '⧉'}
                  </button>
                  <pre class="debug-body">{errorDebug.preflight}</pre>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Success Response Section -->
        {#if responseStatus && !errorDebug}
          <div class="section">
            <div class="section-header">
              <span class="section-title">Response</span>
              <span class="response-status-group">
                {#if responseDuration !== null}
                  <span class="response-duration">{responseDuration}ms</span>
                {/if}
                <span class="status-badge" class:status-ok={responseStatus.ok} class:status-err={!responseStatus.ok}>
                  {responseStatus.code} {responseStatus.text}
                </span>
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
              <div class="response-pre-wrapper">
                <button class="response-copy-btn" onclick={() => copyPanelText(response || '', 'body')} title="Copy">
                  {copiedPanel === 'body' ? '✓' : '⧉'}
                </button>
                <pre class="response-body">{response || '(empty response)'}</pre>
              </div>
            {:else}
              <div class="response-pre-wrapper">
                <button class="response-copy-btn" onclick={() => copyPanelText(responseHeaders || '', 'headers')} title="Copy">
                  {copiedPanel === 'headers' ? '✓' : '⧉'}
                </button>
                <pre class="response-body">{responseHeaders || '(no headers)'}</pre>
              </div>
            {/if}
          </div>
        {/if}

        <div class="hint">
          Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to send request
        </div>
      </div>
    </div>
  </main>
</div>

<style>
  /* Layout */
  .app-layout {
    display: flex;
    height: 100vh;
    width: 100%;
    overflow: hidden;
  }

  .app-layout.resizing {
    cursor: col-resize;
    user-select: none;
  }

  .drawer-pane {
    flex-shrink: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
  }

  .resize-handle {
    width: 6px;
    cursor: col-resize;
    background: transparent;
    position: relative;
    flex-shrink: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .resize-handle:hover,
  .resizing .resize-handle {
    background: rgba(100, 108, 255, 0.15);
  }

  .resize-grip {
    width: 2px;
    height: 32px;
    background: #4a4a5a;
    border-radius: 1px;
    transition: background 0.15s;
  }

  .resize-handle:hover .resize-grip,
  .resizing .resize-grip {
    background: #646cff;
  }

  .main-pane {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .main-scroll {
    height: 100%;
    overflow-y: auto;
  }

  .main-content {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem 2rem 2rem;
  }

  /* Header */
  .app-header {
    margin-bottom: 1.5rem;
  }

  .app-header-row {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .app-header h1 {
    font-size: 1.5rem;
    margin: 0 0 0.15rem 0;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .subtitle {
    margin: 0;
    color: #888;
    font-size: 0.85rem;
  }

  .history-toggle {
    background: #202038;
    border: 1px solid #3a3a4a;
    color: #aaa;
    padding: 0.4rem 0.7rem;
    font-size: 0.78rem;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    transition: all 0.2s;
    white-space: nowrap;
    margin-top: 0.15rem;
  }

  .history-toggle:hover {
    border-color: #646cff;
    color: #fff;
  }

  /* Request bar */
  .request-bar {
    display: flex;
    gap: 0;
    border: 2px solid #3a3a4a;
    border-radius: 10px;
    overflow: hidden;
    background: #202038;
    margin-bottom: 1.25rem;
  }

  .method-select {
    background: #1c1c32;
    border: none;
    padding: 0.65rem 0.85rem;
    font-size: 0.85rem;
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
    cursor: pointer;
    border-right: 2px solid #3a3a4a;
    outline: none;
    min-width: 90px;
    appearance: auto;
  }

  .url-input {
    flex: 1;
    background: transparent;
    border: none;
    padding: 0.45rem 0.85rem 0.1rem;
    font-size: 0.9rem;
    color: inherit;
    font-family: 'SF Mono', 'Fira Code', monospace;
    outline: none;
    min-width: 0;
  }

  .url-input-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    padding: 0.25rem 0;
  }

  .url-query-preview {
    display: block;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.75rem;
    color: #7a7a8e;
    padding: 0 0.85rem 0.3rem;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    line-height: 1.25;
    max-height: 4.2em;
    overflow-y: auto;
  }

  .url-input::placeholder {
    color: #555;
  }

  .send-btn {
    background: #646cff;
    color: white;
    border: none;
    padding: 0.65rem 1.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    border-radius: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
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
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #aaa;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge {
    font-size: 0.6rem;
    background: #3a3a4a;
    padding: 0.12rem 0.35rem;
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
    padding: 0.3rem 0.65rem;
    font-size: 0.75rem;
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
    gap: 0.4rem;
  }

  .header-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .header-input {
    background: #202038;
    border: 1px solid #3a3a4a;
    border-radius: 6px;
    padding: 0.5rem 0.65rem;
    font-size: 0.8rem;
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
    min-width: 0;
  }

  .value-input {
    flex: 3;
    min-width: 0;
  }

  .remove-btn {
    background: transparent;
    color: #f93e3e;
    border: 1px solid #f93e3e33;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1.1rem;
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
    background: #202038;
    border: 1px solid #3a3a4a;
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    font-size: 0.8rem;
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
    padding: 0.65rem 0.85rem;
    border-radius: 8px 8px 0 0;
    font-size: 0.8rem;
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
    border-bottom: 1px solid #3a3a4a;
    background: rgba(249, 62, 62, 0.04);
  }

  .debug-tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.45rem 0.85rem;
    font-size: 0.75rem;
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
    background: #202038;
    padding: 0.85rem;
    margin: 0;
    font-size: 0.75rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    max-height: 350px;
    overflow-y: auto;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: #ccc;
  }

  /* Response */
  .status-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
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

  .response-status-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .response-duration {
    font-size: 0.7rem;
    color: #8a8a9a;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .response-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 0;
    border-bottom: 1px solid #3a3a4a;
  }

  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.45rem 0.85rem;
    font-size: 0.75rem;
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

  .response-pre-wrapper {
    position: relative;
  }

  .response-copy-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: #2c2c4a;
    border: 1px solid #4a4a5a;
    color: #888;
    width: 28px;
    height: 28px;
    font-size: 0.85rem;
    border-radius: 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s, border-color 0.15s;
    z-index: 2;
    padding: 0;
    line-height: 1;
  }

  .response-pre-wrapper:hover .response-copy-btn {
    opacity: 1;
  }

  .response-copy-btn:hover {
    color: #fff;
    border-color: #646cff;
    background: #323258;
  }

  .response-body {
    background: #202038;
    border: 1px solid #3a3a4a;
    border-top: none;
    border-radius: 0 0 8px 8px;
    padding: 0.85rem;
    margin: 0;
    font-size: 0.75rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    max-height: 350px;
    overflow-y: auto;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Hint */
  .hint {
    text-align: center;
    font-size: 0.7rem;
    color: #555;
    margin-top: 1.5rem;
    padding-bottom: 1rem;
  }

  kbd {
    background: #32324a;
    border: 1px solid #4a4a5a;
    border-radius: 4px;
    padding: 0.1rem 0.3rem;
    font-size: 0.65rem;
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

    .url-query-preview {
      color: #9a9aab;
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

    .resize-handle:hover,
    .resizing .resize-handle {
      background: rgba(100, 108, 255, 0.1);
    }

    .resize-grip {
      background: #ccc;
    }
  }
</style>
