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
  let pageSize = 20;

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

  $effect(() => {
    filterMethods; filterUrl; filterStatusMin; filterStatusMax; page; sortDir; open;
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

  function getMethodColor(m) {
    const colors = {
      GET: '#61affe', POST: '#49cc90', PUT: '#fca130',
      PATCH: '#50e3c2', DELETE: '#f93e3e', HEAD: '#9012fe', OPTIONS: '#0d5aa7',
    };
    return colors[m] || '#888';
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

  function truncateUrl(u, max = 45) {
    if (!u) return '';
    return u.length > max ? u.slice(0, max) + '...' : u;
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
  <div class="results">
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
            {#if row.request_headers}
              <div class="detail-section">
                <div class="detail-label">Request Headers</div>
                <pre class="detail-pre">{row.request_headers}</pre>
              </div>
            {/if}
            {#if row.request_body}
              <div class="detail-section">
                <div class="detail-label">Request Body</div>
                <pre class="detail-pre">{row.request_body}</pre>
              </div>
            {/if}
            {#if row.response_headers}
              <div class="detail-section">
                <div class="detail-label">Response Headers</div>
                <pre class="detail-pre">{row.response_headers}</pre>
              </div>
            {/if}
            {#if row.response_body}
              <div class="detail-section">
                <div class="detail-label">Response Body</div>
                <pre class="detail-pre">{row.response_body}</pre>
              </div>
            {/if}
            {#if row.error}
              <div class="detail-section">
                <div class="detail-label error-label">Error</div>
                <pre class="detail-pre error-pre">{row.error}</pre>
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
    background: #12121f;
    border-right: 1px solid #2a2a3e;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #2a2a3e;
    flex-shrink: 0;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .close-btn {
    background: transparent;
    border: 1px solid #333;
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
    border-bottom: 1px solid #2a2a3e;
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
    border: 1px solid #333;
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
    background: #1a1a2e;
    border: 1px solid #333;
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
    border: 1px solid #444;
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
    border-bottom: 1px solid #1e1e32;
  }

  .item-summary {
    display: grid;
    grid-template-columns: 50px 1fr auto auto 24px;
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
  .item-details {
    padding: 0.4rem 1rem 0.6rem;
    background: rgba(26, 26, 46, 0.5);
    border-top: 1px solid #2a2a3e;
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

  .detail-pre {
    background: #16162a;
    border: 1px solid #2a2a3e;
    border-radius: 4px;
    padding: 0.4rem;
    margin: 0;
    font-size: 0.65rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    max-height: 120px;
    overflow-y: auto;
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
    border-top: 1px solid #2a2a3e;
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
    border: 1px solid #444;
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
      background: #fafafe;
      border-right-color: #ddd;
    }

    .panel-header {
      border-bottom-color: #ddd;
    }

    .close-btn {
      border-color: #ddd;
    }

    .filters {
      border-bottom-color: #ddd;
    }

    .filter-input {
      background: #f0f0f5;
      border-color: #ddd;
    }

    .method-chip {
      border-color: #ddd;
    }

    .history-item {
      border-bottom-color: #eee;
    }

    .item-summary:hover {
      background: rgba(100, 108, 255, 0.04);
    }

    .item-url {
      color: #333;
    }

    .item-details {
      background: rgba(240, 240, 250, 0.5);
      border-top-color: #eee;
    }

    .detail-pre {
      background: #f0f0f5;
      border-color: #ddd;
      color: #444;
    }

    .panel-footer {
      border-top-color: #ddd;
    }
  }
</style>
