<script>
  import { queryRequests, deleteRequest, clearAllRequests } from './db.js';

  let { open = $bindable(false), onReplay = () => {} } = $props();

  // Filters
  let filterMethods = $state([]);
  let filterUrl = $state('');
  let filterStatusMin = $state('');
  let filterStatusMax = $state('');
  let sortDir = $state('DESC');

  // Pagination
  let page = $state(1);
  let pageSize = $state(20);
  const ITEM_HEIGHT = 32; // approx height of one collapsed row in px
  const MIN_PAGE_SIZE = 5;

  // Container measurement
  let resultsEl = $state(null);

  $effect(() => {
    if (!resultsEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        const computed = Math.max(MIN_PAGE_SIZE, Math.floor(h / ITEM_HEIGHT));
        if (computed !== pageSize) {
          pageSize = computed;
        }
      }
    });
    observer.observe(resultsEl);
    return () => observer.disconnect();
  });

  // Data
  let rows = $state([]);
  let total = $state(0);
  let expandedId = $state(null);

  const allMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  function toggleMethod(m) {
    if (filterMethods.includes(m)) {
      filterMethods = filterMethods.filter(x => x !== m);
    } else {
      filterMethods = [...filterMethods, m];
    }
    page = 1;
  }

  // Reset to page 1 when pageSize changes (browser resize)
  let prevPageSize = pageSize;
  $effect(() => {
    if (pageSize !== prevPageSize) {
      prevPageSize = pageSize;
      page = 1;
    }
  });

  $effect(() => {
    filterMethods; filterUrl; filterStatusMin; filterStatusMax; page; pageSize; sortDir; open;
    refresh();
  });

  export async function refresh() {
    const result = await queryRequests({
      methodFilter: filterMethods.length > 0 ? filterMethods : undefined,
      urlFilter: filterUrl || undefined,
      statusMin: filterStatusMin || undefined,
      statusMax: filterStatusMax || undefined,
      page,
      pageSize,
      sortDir,
    });
    rows = result.rows;
    total = result.total;
  }

  let totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  async function handleDelete(id) {
    await deleteRequest(id);
    if (expandedId === id) expandedId = null;
    await refresh();
  }

  async function handleClearAll() {
    if (confirm('Delete all request history?')) {
      await clearAllRequests();
      page = 1;
      expandedId = null;
      await refresh();
    }
  }

  function toggleExpand(id) {
    expandedId = expandedId === id ? null : id;
  }

  async function resetFilters() {
    filterMethods = [];
    filterUrl = '';
    filterStatusMin = '';
    filterStatusMax = '';
    page = 1;
    sortDir = 'DESC';
    await refresh();
  }

  const isDarkMode = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

  function getMethodColor(m) {
    if (isDarkMode) {
      const colors = {
        GET: '#8ccfff', POST: '#80eebc', PUT: '#ffc86a',
        PATCH: '#85f5de', DELETE: '#ff8080', HEAD: '#c880ff', OPTIONS: '#6aaaf0',
      };
      return colors[m] || '#aaa';
    }
    const colors = {
      GET: '#1a5a9e', POST: '#0e6e3e', PUT: '#9a6000',
      PATCH: '#0e6e52', DELETE: '#aa1515', HEAD: '#5208a0', OPTIONS: '#063870',
    };
    return colors[m] || '#555';
  }

  function getStatusColor(code) {
    if (!code) return '#888';
    if (code < 300) return '#49cc90';
    if (code < 400) return '#fca130';
    return '#f93e3e';
  }

  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return ts;
    }
  }

  function truncateUrl(u) {
    return u || '';
  }

  function buildStoredRequestText(row) {
    const lines = [];
    lines.push(`${row.method || 'GET'} ${row.url || ''}`);
    lines.push('');
    lines.push('--- Request Headers ---');
    if (row.request_headers) {
      lines.push(row.request_headers);
    } else {
      lines.push('(none)');
    }

    if (row.request_body) {
      lines.push('');
      lines.push('--- Request Body ---');
      lines.push(row.request_body);
    }

    return lines.join('\n');
  }

  // Per-item active tab for expanded details
  let itemTab = $state({});
  function getItemTab(id) {
    return itemTab[id] || 'response';
  }
  function setItemTab(id, tab) {
    itemTab = { ...itemTab, [id]: tab };
  }

  let copiedId = $state(null);
  async function copyText(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => { if (copiedId === id) copiedId = null; }, 1500);
    } catch {}
  }
</script>

<div class="panel">
  <div class="panel-header">
    <h2>History</h2>
    <button class="close-btn" onclick={() => open = false} title="Hide history">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="11 17 6 12 11 7"/>
        <polyline points="18 17 13 12 18 7"/>
      </svg>
    </button>
  </div>

  <!-- Filters -->
  <div class="filters">
    <div class="filter-group">
      <span class="filter-label">Request Methods</span>
      <div class="method-chips">
        {#each allMethods as m}
        <button
          class="method-chip"
          class:selected={filterMethods.includes(m)}
          style="--method-color: {getMethodColor(m)}"
          onclick={() => toggleMethod(m)}
        >{m}</button>
        {/each}
      </div>
    </div>
    <div class="filter-group">
      <span class="filter-label">Response Codes</span>
      <div class="status-range">
        <input
          type="number"
          bind:value={filterStatusMin}
          placeholder="Min"
          class="filter-input status-input"
          min="100"
          max="599"
        />
        <span class="range-sep">-</span>
        <input
          type="number"
          bind:value={filterStatusMax}
          placeholder="Max"
          class="filter-input status-input"
          min="100"
          max="599"
        />
      </div>
    </div>
    <div class="filter-group">
      <span class="filter-label">URL</span>
      <input
        type="text"
        bind:value={filterUrl}
        placeholder="Filter URL..."
        class="filter-input"
      />
    </div>
    <div class="filter-actions">
      <button class="sort-btn" onclick={() => sortDir = sortDir === 'DESC' ? 'ASC' : 'DESC'} title="Toggle sort order">
        {sortDir === 'DESC' ? 'Newest first' : 'Oldest first'}
      </button>
      <button class="reset-btn" onclick={resetFilters}>Reset Filters</button>
    </div>
  </div>

  <!-- Results -->
  <div class="results" bind:this={resultsEl}>
    {#if rows.length === 0}
      <div class="empty">No requests found</div>
    {/if}
    {#each rows as row (row.id)}
      <div class="history-item">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="item-summary" onclick={() => toggleExpand(row.id)} onkeydown={() => {}}>
          <span class="item-method" style="color: {getMethodColor(row.method)}">{row.method}</span>
          <span class="item-url" title={row.url}>{truncateUrl(row.url)}</span>
          <span class="item-status" style="color: {getStatusColor(row.response_status)}">
            {row.response_status || 'ERR'}
          </span>
          <span class="item-time">{formatTime(row.timestamp)}</span>
          <button class="item-delete" onclick={(e) => { e.stopPropagation(); handleDelete(row.id); }} title="Delete">
            &times;
          </button>
        </div>
        {#if expandedId === row.id}
          <div class="item-details">
            {#if row.duration_ms != null}
              <div class="detail-row"><strong>Duration:</strong> {row.duration_ms}ms</div>
            {/if}

            <div class="detail-tabs">
              <button class="detail-tab" class:active={getItemTab(row.id) === 'response'} onclick={() => setItemTab(row.id, 'response')}>
                Response
              </button>
              {#if row.diagnosis}
                <button class="detail-tab" class:active={getItemTab(row.id) === 'diagnosis'} onclick={() => setItemTab(row.id, 'diagnosis')}>
                  Diagnosis
                </button>
              {/if}
              <button class="detail-tab" class:active={getItemTab(row.id) === 'request'} onclick={() => setItemTab(row.id, 'request')}>
                Request
              </button>
              {#if row.preflight}
                <button class="detail-tab" class:active={getItemTab(row.id) === 'preflight'} onclick={() => setItemTab(row.id, 'preflight')}>
                  Preflight
                </button>
              {/if}
            </div>

            {#if getItemTab(row.id) === 'response'}
              <!-- Response tab: status, headers, body, error -->
              {#if row.error}
                <div class="detail-section">
                  <div class="detail-label error-label">Error</div>
                  <div class="pre-wrapper">
                    <button class="copy-btn" onclick={() => copyText(row.error, `err-${row.id}`)} title="Copy">
                      {copiedId === `err-${row.id}` ? '✓' : '⧉'}
                    </button>
                    <pre class="detail-pre error-pre">{row.error}</pre>
                  </div>
                </div>
              {/if}
              {#if row.response_headers}
                <div class="detail-section">
                  <div class="detail-label">Response Headers</div>
                  <div class="pre-wrapper">
                    <button class="copy-btn" onclick={() => copyText(row.response_headers, `resh-${row.id}`)} title="Copy">
                      {copiedId === `resh-${row.id}` ? '✓' : '⧉'}
                    </button>
                    <pre class="detail-pre">{row.response_headers}</pre>
                  </div>
                </div>
              {/if}
              {#if row.response_body}
                <div class="detail-section">
                  <div class="detail-label">Response Body</div>
                  <div class="pre-wrapper">
                    <button class="copy-btn" onclick={() => copyText(row.response_body, `resb-${row.id}`)} title="Copy">
                      {copiedId === `resb-${row.id}` ? '✓' : '⧉'}
                    </button>
                    <pre class="detail-pre">{row.response_body}</pre>
                  </div>
                </div>
              {/if}
              {#if !row.error && !row.response_headers && !row.response_body}
                <div class="detail-section"><span class="detail-empty">(no response data)</span></div>
              {/if}
            {:else if getItemTab(row.id) === 'diagnosis'}
              <div class="detail-section">
                <div class="pre-wrapper">
                  <button class="copy-btn" onclick={() => copyText(row.diagnosis, `diag-${row.id}`)} title="Copy">
                    {copiedId === `diag-${row.id}` ? '✓' : '⧉'}
                  </button>
                  <pre class="detail-pre">{row.diagnosis}</pre>
                </div>
              </div>
            {:else if getItemTab(row.id) === 'request'}
              <div class="detail-section">
                <div class="pre-wrapper">
                  <button class="copy-btn" onclick={() => copyText(buildStoredRequestText(row), `req-${row.id}`)} title="Copy">
                    {copiedId === `req-${row.id}` ? '✓' : '⧉'}
                  </button>
                  <pre class="detail-pre">{buildStoredRequestText(row)}</pre>
                </div>
              </div>
            {:else if getItemTab(row.id) === 'preflight'}
              <div class="detail-section">
                <div class="pre-wrapper">
                  <button class="copy-btn" onclick={() => copyText(row.preflight, `pf-${row.id}`)} title="Copy">
                    {copiedId === `pf-${row.id}` ? '✓' : '⧉'}
                  </button>
                  <pre class="detail-pre">{row.preflight}</pre>
                </div>
              </div>
            {/if}

            <button class="replay-btn" onclick={() => onReplay(row)}>
              Replay Request
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Pagination & Clear -->
  <div class="panel-footer">
    <div class="pagination">
      <button class="page-btn" disabled={page <= 1} onclick={() => page--}>&laquo;</button>
      <span class="page-info">{page}/{totalPages} ({total})</span>
      <button class="page-btn" disabled={page >= totalPages} onclick={() => page++}>&raquo;</button>
    </div>
    <button class="clear-all-btn" onclick={handleClearAll} disabled={total === 0}>
      Clear All
    </button>
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: #191928;
    border-right: 1px solid #32324a;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #32324a;
    flex-shrink: 0;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .close-btn {
    background: transparent;
    border: 1px solid #3a3a4a;
    color: #888;
    width: 28px;
    height: 28px;
    cursor: pointer;
    padding: 0;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .close-btn:hover {
    color: #fff;
    border-color: #646cff;
  }

  /* Filters */
  .filters {
    padding: 0.6rem 1rem;
    border-bottom: 1px solid #32324a;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .method-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .method-chip {
    background: transparent;
    border: 1px solid #3a3a4a;
    color: var(--method-color, #888);
    padding: 0.2rem 0.45rem;
    font-size: 0.65rem;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    opacity: 0.5;
  }

  .method-chip:hover {
    opacity: 0.8;
    border-color: var(--method-color, #888);
  }

  .method-chip.selected {
    opacity: 1;
    background: color-mix(in srgb, var(--method-color) 15%, transparent);
    border-color: var(--method-color, #888);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .filter-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
  }

  .filter-input {
    background: #2e2e4d;
    border: 1px solid #3a3a4a;
    border-radius: 5px;
    padding: 0.35rem 0.5rem;
    font-size: 0.75rem;
    color: inherit;
    outline: none;
    font-family: 'SF Mono', 'Fira Code', monospace;
    width: 100%;
    box-sizing: border-box;
  }

  .filter-input:focus {
    border-color: #646cff;
  }

  .status-range {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
  }

  .status-input {
    width: 100%;
  }

  .range-sep {
    color: #555;
    font-size: 0.75rem;
  }

  .filter-actions {
    display: flex;
    gap: 0.4rem;
  }

  .sort-btn, .reset-btn {
    background: transparent;
    border: 1px solid #4a4a5a;
    color: #aaa;
    padding: 0.25rem 0.5rem;
    font-size: 0.68rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .sort-btn:hover, .reset-btn:hover {
    border-color: #646cff;
    color: #fff;
  }

  /* Results */
  .results {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0;
  }

  .empty {
    text-align: center;
    color: #555;
    padding: 2rem;
    font-size: 0.8rem;
  }

  .history-item {
    border-bottom: 1px solid #26263a;
  }

  .item-summary {
    display: grid;
    grid-template-columns: 50px minmax(0, 1fr) auto auto 24px;
    gap: 0.35rem;
    align-items: center;
    padding: 0.45rem 1rem;
    cursor: pointer;
    transition: background 0.15s;
    font-size: 0.73rem;
  }

  .item-summary:hover {
    background: rgba(100, 108, 255, 0.06);
  }

  .item-method {
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.68rem;
  }

  .item-url {
    color: #ccc;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.68rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-status {
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.68rem;
    text-align: right;
  }

  .item-time {
    color: #666;
    font-size: 0.63rem;
    white-space: nowrap;
  }

  .item-delete {
    background: transparent;
    border: none;
    color: #666;
    font-size: 1rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    border-radius: 0;
    transition: color 0.2s;
  }

  .item-delete:hover {
    color: #f93e3e;
  }

  /* Expanded details */
  .detail-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #32324a;
    margin-bottom: 0.4rem;
  }

  .detail-tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #888;
    padding: 0.3rem 0.6rem;
    font-size: 0.65rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .detail-tab:hover {
    color: #ccc;
  }

  .detail-tab.active {
    color: #646cff;
    border-bottom-color: #646cff;
  }

  .detail-empty {
    color: #555;
    font-size: 0.7rem;
    font-style: italic;
  }

  .item-details {
    padding: 0.4rem 1rem 0.6rem;
    background: rgba(32, 32, 56, 0.5);
    border-top: 1px solid #32324a;
  }

  .detail-row {
    font-size: 0.7rem;
    color: #aaa;
    margin-bottom: 0.35rem;
  }

  .detail-section {
    margin-bottom: 0.4rem;
  }

  .detail-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
    margin-bottom: 0.15rem;
  }

  .error-label {
    color: #f93e3e;
  }

  .pre-wrapper {
    position: relative;
  }

  .copy-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    background: #242440;
    border: 1px solid #3a3a4a;
    color: #888;
    width: 24px;
    height: 24px;
    font-size: 0.75rem;
    border-radius: 4px;
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

  .pre-wrapper:hover .copy-btn {
    opacity: 1;
  }

  .copy-btn:hover {
    color: #fff;
    border-color: #646cff;
    background: #2c2c4a;
  }

  .detail-pre {
    background: #2a2a46;
    border: 1px solid #32324a;
    border-radius: 4px;
    padding: 0.4rem;
    margin: 0;
    font-size: 0.65rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    min-height: 40px;
    max-height: 500px;
    height: 120px;
    overflow-y: auto;
    resize: vertical;
    white-space: pre-wrap;
    word-break: break-word;
    color: #bbb;
    line-height: 1.4;
  }

  .error-pre {
    color: #f93e3e;
    border-color: #f93e3e33;
  }

  .replay-btn {
    background: transparent;
    border: 1px dashed #646cff;
    color: #646cff;
    padding: 0.25rem 0.6rem;
    font-size: 0.7rem;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 0.35rem;
    transition: all 0.2s;
  }

  .replay-btn:hover {
    background: rgba(100, 108, 255, 0.1);
  }

  /* Footer */
  .panel-footer {
    border-top: 1px solid #32324a;
    padding: 0.6rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .page-btn {
    background: transparent;
    border: 1px solid #4a4a5a;
    color: #aaa;
    padding: 0.2rem 0.45rem;
    font-size: 0.68rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .page-btn:hover:not(:disabled) {
    border-color: #646cff;
    color: #fff;
  }

  .page-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .page-info {
    font-size: 0.68rem;
    color: #888;
  }

  .clear-all-btn {
    background: transparent;
    border: 1px solid #f93e3e44;
    color: #f93e3e;
    padding: 0.25rem 0.6rem;
    font-size: 0.68rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-all-btn:hover:not(:disabled) {
    background: rgba(249, 62, 62, 0.1);
    border-color: #f93e3e;
  }

  .clear-all-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* Light mode */
  @media (prefers-color-scheme: light) {
    .panel {
      background: #e2e2ee;
      border-right-color: #a0a0b4;
    }

    .panel-header {
      border-bottom-color: #a0a0b4;
    }

    .close-btn {
      border-color: #a0a0b4;
      color: #555;
    }

    .close-btn:hover {
      color: #111;
    }

    .filters {
      border-bottom-color: #a0a0b4;
    }

    .filter-label {
      color: #555;
    }

    .filter-input {
      background: #dadaea;
      border-color: #a0a0b4;
      color: #2a2a3a;
    }

    .method-chip {
      border-color: #a0a0b4;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.5);
    }

    .method-chip.selected {
      background: color-mix(in srgb, var(--method-color) 20%, white);
    }

    .item-method {
      background: #6a6a80;
      color: #fff !important;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      filter: none;
    }

    .item-status {
      background: #6a6a80;
      color: #fff !important;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      filter: none;
    }

    .sort-btn, .reset-btn {
      border-color: #a0a0b4;
      color: #444;
      background: #dadaea;
    }

    .sort-btn:hover, .reset-btn:hover {
      border-color: #646cff;
      color: #111;
      background: #d0d0e0;
    }

    .clear-all-btn {
      border-color: #f93e3e88;
    }

    .history-item {
      border-bottom-color: #a0a0b4;
    }

    .item-summary:hover {
      background: rgba(100, 108, 255, 0.06);
    }

    .item-url {
      color: #2a2a3a;
    }

    .item-details {
      background: rgba(200, 200, 220, 0.4);
      border-top-color: #a0a0b4;
    }

    .detail-tabs {
      border-bottom-color: #a0a0b4;
    }

    .detail-tab {
      color: #444;
    }

    .detail-tab:hover {
      color: #111;
    }

    .detail-pre {
      background: #dadaea;
      border-color: #a0a0b4;
      color: #2a2a3a;
    }

    .copy-btn {
      background: #ccccd8;
      border-color: #999;
      color: #333;
    }

    .copy-btn:hover {
      background: #c0c0d0;
      color: #111;
    }

    .panel-footer {
      border-top-color: #a0a0b4;
    }
  }
</style>
