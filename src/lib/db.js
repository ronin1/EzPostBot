const API_BASE = '/api/history';

/** Save a request/response record */
export async function saveRequest(record) {
  try {
    await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
  } catch (err) {
    console.error('Failed to save request to history:', err);
  }
}

/** Query requests with filters, pagination, and sorting */
export async function queryRequests({ methodFilter, urlFilter, statusMin, statusMax, page = 1, pageSize = 20, sortDir = 'DESC' } = {}) {
  try {
    const params = new URLSearchParams();
    if (methodFilter) params.set('method', methodFilter);
    if (urlFilter) params.set('url', urlFilter);
    if (statusMin != null && statusMin !== '') params.set('statusMin', statusMin);
    if (statusMax != null && statusMax !== '') params.set('statusMax', statusMax);
    params.set('page', page);
    params.set('pageSize', pageSize);
    params.set('sortDir', sortDir);

    const res = await fetch(`${API_BASE}?${params}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to query history:', err);
    return { rows: [], total: 0 };
  }
}

/** Delete a single request by id */
export async function deleteRequest(id) {
  try {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to delete request:', err);
  }
}

/** Delete all requests */
export async function clearAllRequests() {
  try {
    await fetch(API_BASE, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}
