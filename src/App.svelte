<script>
  let url = $state('https://jsonplaceholder.typicode.com/posts/1');
  let method = $state('GET');
  let body = $state('');
  let headers = $state([]);
  let response = $state(null);
  let responseStatus = $state(null);
  let responseHeaders = $state('');
  let loading = $state(false);
  let error = $state(null);
  let activeTab = $state('body');

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

  async function sendRequest() {
    if (!url.trim()) {
      error = 'Please enter a URL';
      return;
    }

    loading = true;
    error = null;
    response = null;
    responseStatus = null;
    responseHeaders = '';

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

    try {
      const res = await fetch(url, opts);
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
    } catch (err) {
      error = `Request failed: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      sendRequest();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<main>
  <div class="app-header">
    <h1>API Client</h1>
    <p class="subtitle">Test API endpoints directly from your browser</p>
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

  <!-- Response Section -->
  {#if error}
    <div class="section">
      <div class="error-box">{error}</div>
    </div>
  {/if}

  {#if responseStatus}
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
    border-radius: 8px;
    font-size: 0.85rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
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

    kbd {
      background: #eee;
      border-color: #ccc;
    }
  }
</style>
