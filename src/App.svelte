<script>
  import { saveRequest } from './lib/db.js';
  import HistoryDrawer from './lib/HistoryDrawer.svelte';

  let url = $state(localStorage.getItem('url') ?? `${window.location.origin}/api/echo`);
  let method = $state(localStorage.getItem('method') || 'GET');
  let body = $state(localStorage.getItem('body') ?? '');
  let bodyType = $state(localStorage.getItem('bodyType') || 'json');
  let formFields = $state(JSON.parse(localStorage.getItem('formFields') || '[]'));
  let selectedFiles = $state([]);
  let fileFieldName = $state(localStorage.getItem('fileFieldName') ?? 'file');
  let fileInputEl = $state(null);
  let headers = $state(JSON.parse(localStorage.getItem('headers') || '[]'));
  let queryParams = $state(JSON.parse(localStorage.getItem('queryParams') || '[]'));
  let response = $state(null);
  let responseStatus = $state(null);
  let responseHeaders = $state('');
  let loading = $state(false);
  let liveElapsed = $state(0);
  let requestStartMs = $state(0);
  $effect(() => {
    if (!loading) return;
    const t = requestStartMs;
    const id = setInterval(() => { liveElapsed = Math.round(performance.now() - t); }, 50);
    return () => clearInterval(id);
  });
  let errorDebug = $state(null);
  let activeTab = $state('body');
  let responseDuration = $state(null);
  let serverSide = $state(localStorage.getItem('serverSide') === 'true');
  let copiedPanel = $state(null);
  let copiedBody = $state(false);
  let showHeaders = $state(localStorage.getItem('showHeaders') !== 'false');
  let showQueryParams = $state(localStorage.getItem('showQueryParams') !== 'false');
  let showRequestBody = $state(localStorage.getItem('showRequestBody') !== 'false');
  let showResponse = $state(localStorage.getItem('showResponse') !== 'false');
  let showCurl = $state(localStorage.getItem('showCurl') !== 'false');
  let jsonAssist = $state(localStorage.getItem('jsonAssist') !== 'false');
  let bodyTextarea = $state(null);
  let globalFontSize = $state(parseFloat(localStorage.getItem('globalFontSize')) || 0.8);
  $effect(() => { localStorage.setItem('globalFontSize', String(globalFontSize)); });
  $effect(() => { localStorage.setItem('method', method); });
  $effect(() => { localStorage.setItem('bodyType', bodyType); });
  $effect(() => { localStorage.setItem('serverSide', String(serverSide)); });
  $effect(() => { localStorage.setItem('showHeaders', String(showHeaders)); });
  $effect(() => { localStorage.setItem('showQueryParams', String(showQueryParams)); });
  $effect(() => { localStorage.setItem('showRequestBody', String(showRequestBody)); });
  $effect(() => { localStorage.setItem('showResponse', String(showResponse)); });
  $effect(() => { localStorage.setItem('showCurl', String(showCurl)); });
  $effect(() => { localStorage.setItem('jsonAssist', String(jsonAssist)); });
  $effect(() => { localStorage.setItem('url', url); });
  $effect(() => { localStorage.setItem('body', body); });
  $effect(() => { localStorage.setItem('headers', JSON.stringify(headers)); });
  $effect(() => { localStorage.setItem('queryParams', JSON.stringify(queryParams)); });
  $effect(() => { localStorage.setItem('formFields', JSON.stringify(formFields)); });
  $effect(() => { localStorage.setItem('fileFieldName', fileFieldName); });
  const FONT_DEFAULT = 0.8;
  const FONT_STEP = 0.04;
  const FONT_MIN = FONT_DEFAULT - 10 * FONT_STEP;
  const FONT_MAX = FONT_DEFAULT + 10 * FONT_STEP;

  const CLOSE_PAIRS = { '{': '}', '[': ']', '"': '"' };

  function handleBodyKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      formatJson();
      return;
    }

    if (!jsonAssist || !bodyTextarea) return;
    const ta = bodyTextarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;

    if (e.key === 'Tab') {
      e.preventDefault();
      const indent = '  ';
      document.execCommand('insertText', false, indent);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const before = val.slice(0, start);
      const after = val.slice(end);
      const lineStart = before.lastIndexOf('\n') + 1;
      const currentLine = before.slice(lineStart);
      const baseIndent = currentLine.match(/^(\s*)/)[1];
      const lastChar = before.trimEnd().slice(-1);
      const nextChar = after.trimStart()[0] || '';

      let insert;
      if ((lastChar === '{' || lastChar === '[') && (nextChar === '}' || nextChar === ']')) {
        insert = `\n${baseIndent}  \n${baseIndent}`;
        document.execCommand('insertText', false, insert);
        ta.selectionStart = ta.selectionEnd = start + 1 + baseIndent.length + 2;
      } else if (lastChar === '{' || lastChar === '[') {
        insert = `\n${baseIndent}  `;
        document.execCommand('insertText', false, insert);
      } else {
        insert = `\n${baseIndent}`;
        document.execCommand('insertText', false, insert);
      }
      return;
    }

    const closer = CLOSE_PAIRS[e.key];
    if (closer) {
      if (e.key === '"') {
        const charBefore = start > 0 ? val[start - 1] : '';
        if (charBefore === '\\') return;
        if (val[start] === '"' && start === end) {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = start + 1;
          return;
        }
      }
      if (e.key !== '"' || start === end || val[start] !== '"') {
        e.preventDefault();
        document.execCommand('insertText', false, e.key + closer);
        ta.selectionStart = ta.selectionEnd = start + 1;
      }
      return;
    }

    if ((e.key === '}' || e.key === ']' || (e.key === '"' && val[start] === '"')) && val[start] === e.key && start === end) {
      e.preventDefault();
      ta.selectionStart = ta.selectionEnd = start + 1;
      return;
    }

    if (e.key === 'Backspace' && start === end && start > 0) {
      const ch = val[start - 1];
      const nxt = val[start];
      if ((ch === '{' && nxt === '}') || (ch === '[' && nxt === ']') || (ch === '"' && nxt === '"')) {
        e.preventDefault();
        ta.selectionStart = start - 1;
        ta.selectionEnd = start + 1;
        document.execCommand('insertText', false, '');
      }
    }
  }

  function formatJson() {
    try {
      body = JSON.stringify(JSON.parse(body), null, 2);
    } catch {}
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(body);
      copiedBody = true;
      setTimeout(() => { copiedBody = false; }, 1500);
    } catch {}
  }

  async function copyPanelText(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      copiedPanel = id;
      setTimeout(() => { if (copiedPanel === id) copiedPanel = null; }, 1500);
    } catch {}
  }

  function parseCurl(input) {
    const text = input.trim().replace(/\\\n\s*/g, ' ');
    if (!/^curl\s/i.test(text)) return null;

    const tokens = [];
    let i = 4; // skip "curl"
    while (i < text.length) {
      while (i < text.length && text[i] === ' ') i++;
      if (i >= text.length) break;
      let token = '';
      if (text[i] === "'" || text[i] === '"') {
        const q = text[i++];
        while (i < text.length && text[i] !== q) {
          if (text[i] === '\\' && q === '"') { i++; token += text[i] || ''; }
          else token += text[i];
          i++;
        }
        i++; // skip closing quote
      } else {
        while (i < text.length && text[i] !== ' ') { token += text[i]; i++; }
      }
      tokens.push(token);
    }

    let parsedMethod = null;
    let parsedUrl = '';
    const parsedHeaders = [];
    let parsedData = null;
    let isFormUrlEncoded = false;
    let isFormMultipart = false;
    const formParts = [];

    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      if (tok === '-X' || tok === '--request') { parsedMethod = tokens[++t]?.toUpperCase(); }
      else if (tok === '-H' || tok === '--header') { parsedHeaders.push(tokens[++t]); }
      else if (tok === '-d' || tok === '--data' || tok === '--data-raw' || tok === '--data-binary') { parsedData = tokens[++t]; }
      else if (tok === '--data-urlencode') { isFormUrlEncoded = true; formParts.push(tokens[++t]); }
      else if (tok === '-F' || tok === '--form') { isFormMultipart = true; formParts.push(tokens[++t]); }
      else if (!tok.startsWith('-') && !parsedUrl) { parsedUrl = tok; }
    }

    if (!parsedMethod) {
      parsedMethod = (parsedData || isFormUrlEncoded || isFormMultipart) ? 'POST' : 'GET';
    }

    return { method: parsedMethod, url: parsedUrl, headers: parsedHeaders, data: parsedData, isFormUrlEncoded, isFormMultipart, formParts };
  }

  let importStatus = $state(null);
  async function importCurl() {
    try {
      const clip = await navigator.clipboard.readText();
      const parsed = parseCurl(clip);
      if (!parsed) {
        importStatus = 'invalid';
        setTimeout(() => { if (importStatus === 'invalid') importStatus = null; }, 2000);
        return;
      }

      method = parsed.method;
      try {
        const u = new URL(parsed.url);
        u.search = '';
        url = u.toString();
        queryParams = [];
        for (const [k, v] of new URL(parsed.url).searchParams.entries()) {
          queryParams = [...queryParams, { key: k, value: v }];
        }
      } catch {
        url = parsed.url;
        queryParams = [];
      }

      headers = [];
      let detectedCt = '';
      for (const h of parsed.headers) {
        const idx = h.indexOf(':');
        if (idx < 0) continue;
        const key = h.slice(0, idx).trim();
        const val = h.slice(idx + 1).trim();
        if (key.toLowerCase() === 'content-type') { detectedCt = val; continue; }
        headers = [...headers, { key, value: val }];
      }

      formFields = [];
      selectedFiles = [];
      body = '';

      if (parsed.isFormMultipart) {
        bodyType = 'form';
        formFields = parsed.formParts.filter(p => !p.includes('=@')).map(p => {
          const idx = p.indexOf('=');
          return { key: p.slice(0, idx), value: p.slice(idx + 1) };
        });
      } else if (parsed.isFormUrlEncoded || detectedCt.includes('application/x-www-form-urlencoded')) {
        bodyType = 'form';
        const src = parsed.isFormUrlEncoded ? parsed.formParts.join('&') : (parsed.data || '');
        formFields = src.split('&').filter(Boolean).map(pair => {
          const idx = pair.indexOf('=');
          return idx >= 0
            ? { key: decodeURIComponent(pair.slice(0, idx)), value: decodeURIComponent(pair.slice(idx + 1)) }
            : { key: decodeURIComponent(pair), value: '' };
        });
      } else if (parsed.data) {
        bodyType = 'json';
        body = parsed.data;
      } else {
        bodyType = 'json';
        body = '';
      }

      importStatus = 'ok';
      setTimeout(() => { if (importStatus === 'ok') importStatus = null; }, 1500);
    } catch {
      importStatus = 'error';
      setTimeout(() => { if (importStatus === 'error') importStatus = null; }, 2000);
    }
  }

  const JWT_RE = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/i;

  function isJwt(value) {
    return JWT_RE.test(value.trim());
  }

  function decodeJwt(value) {
    const m = value.trim().match(JWT_RE);
    if (!m) return null;
    const parts = m[1].split('.');
    const b64decode = (s) => {
      const padded = s.replace(/-/g, '+').replace(/_/g, '/');
      try { return JSON.parse(atob(padded)); } catch { return null; }
    };
    const header = b64decode(parts[0]);
    const payload = b64decode(parts[1]);
    const signature = parts[2] || '';

    let expiry = null;
    let isExpired = false;
    if (payload?.exp) {
      expiry = new Date(payload.exp * 1000);
      isExpired = expiry < new Date();
    }
    let issuedAt = payload?.iat ? new Date(payload.iat * 1000) : null;
    let notBefore = payload?.nbf ? new Date(payload.nbf * 1000) : null;

    return { header, payload, signature, rawToken: m[1], expiry, isExpired, issuedAt, notBefore };
  }

  let jwtModal = $state(null);
  let jwtVerifyStatus = $state(null);
  let copiedJwtSection = $state(null);

  async function copyJwtSection(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      copiedJwtSection = id;
      setTimeout(() => { if (copiedJwtSection === id) copiedJwtSection = null; }, 1500);
    } catch {}
  } // null | 'loading' | 'valid' | 'invalid' | 'error:message'

  function openJwtModal(value) {
    jwtModal = decodeJwt(value);
    jwtVerifyStatus = null;
  }

  function closeJwtModal() {
    jwtModal = null;
    jwtVerifyStatus = null;
  }

  const ALG_MAP = {
    RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    RS384: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
    RS512: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    ES256: { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' },
    ES384: { name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-384' },
    ES512: { name: 'ECDSA', namedCurve: 'P-521', hash: 'SHA-512' },
  };

  function b64urlToUint8(s) {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(padded);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  async function fetchJwks(issuer) {
    const base = issuer.replace(/\/+$/, '');
    const urls = [
      `${base}/.well-known/jwks.json`,
      `${base}/.well-known/openid-configuration`,
    ];

    // Try direct fetch first, then server-side proxy
    for (const jwksUrl of [urls[0]]) {
      try {
        let res = await fetch(jwksUrl);
        if (!res.ok) {
          res = await fetch(`/api/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: jwksUrl, method: 'GET', headers: {} }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.body) return JSON.parse(data.body);
          }
        } else {
          return await res.json();
        }
      } catch { /* try next */ }
    }

    // Try OIDC discovery
    try {
      let res = await fetch(urls[1]);
      if (!res.ok) {
        res = await fetch(`/api/proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urls[1], method: 'GET', headers: {} }),
        });
      }
      const config = res.ok ? await res.json() : JSON.parse((await res.json()).body);
      if (config.jwks_uri) {
        let jwksRes = await fetch(config.jwks_uri);
        if (!jwksRes.ok) {
          jwksRes = await fetch(`/api/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: config.jwks_uri, method: 'GET', headers: {} }),
          });
          if (jwksRes.ok) {
            const data = await jwksRes.json();
            if (data.body) return JSON.parse(data.body);
          }
        } else {
          return await jwksRes.json();
        }
      }
    } catch { /* fall through */ }

    return null;
  }

  async function importKey(jwk, alg) {
    const algInfo = ALG_MAP[alg];
    if (!algInfo) throw new Error(`Unsupported algorithm: ${alg}`);

    const importAlg = alg.startsWith('ES')
      ? { name: algInfo.name, namedCurve: algInfo.namedCurve }
      : { name: algInfo.name, hash: algInfo.hash };

    return crypto.subtle.importKey('jwk', jwk, importAlg, false, ['verify']);
  }

  async function verifyJwt() {
    if (!jwtModal) return;
    jwtVerifyStatus = 'loading';

    try {
      const { header, payload, rawToken } = jwtModal;
      const alg = header?.alg;

      if (!ALG_MAP[alg]) {
        jwtVerifyStatus = `error:Algorithm "${alg}" not supported for browser verification`;
        return;
      }

      const iss = payload?.iss;
      if (!iss) {
        jwtVerifyStatus = 'error:No "iss" claim found in token';
        return;
      }

      const jwks = await fetchJwks(iss);
      if (!jwks?.keys?.length) {
        jwtVerifyStatus = 'error:Could not fetch JWKS from issuer';
        return;
      }

      const kid = header?.kid;
      let key = kid ? jwks.keys.find(k => k.kid === kid) : jwks.keys[0];
      if (!key) {
        jwtVerifyStatus = `error:No matching key found for kid "${kid}"`;
        return;
      }

      const cryptoKey = await importKey(key, alg);
      const parts = rawToken.split('.');
      const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      let sigBytes = b64urlToUint8(parts[2]);

      // ECDSA signatures from JWTs are in raw r||s format already
      const verifyAlg = alg.startsWith('ES')
        ? { name: ALG_MAP[alg].name, hash: ALG_MAP[alg].hash }
        : { name: ALG_MAP[alg].name };

      const valid = await crypto.subtle.verify(verifyAlg, cryptoKey, sigBytes, signedData);
      jwtVerifyStatus = valid ? 'valid' : 'invalid';
    } catch (err) {
      jwtVerifyStatus = `error:${err.message}`;
    }
  }

  let drawerOpen = $state(localStorage.getItem('drawerOpen') === 'true');
  $effect(() => { localStorage.setItem('drawerOpen', String(drawerOpen)); });
  let drawerRef = $state(null);
  let headerRowEl = $state(null);
  let keyColWidth = $state(parseInt(localStorage.getItem('keyColWidth')) || 180);
  $effect(() => { localStorage.setItem('keyColWidth', String(keyColWidth)); });
  let keyColDragging = $state(false);

  function startKeyColResize(e) {
    e.preventDefault();
    keyColDragging = true;
    const startX = e.clientX;
    const startW = keyColWidth;
    function onMove(ev) {
      keyColWidth = Math.max(80, Math.min(400, startW + ev.clientX - startX));
    }
    function onUp() {
      keyColDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  let showTitle = $state(true);
  $effect(() => {
    if (!headerRowEl) return;
    const ro = new ResizeObserver(([entry]) => {
      showTitle = entry.contentRect.width > 420;
    });
    ro.observe(headerRowEl);
    return () => ro.disconnect();
  });

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
  let drawerWidth = $state(parseInt(localStorage.getItem('drawerWidth')) || getDefaultDrawerWidth());
  $effect(() => { localStorage.setItem('drawerWidth', String(drawerWidth)); });
  let isResizing = $state(false);

  function toggleHistoryDrawer() {
    if (!drawerOpen) {
      drawerOpen = true;
      return;
    }
    drawerOpen = false;
  }

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const showBody = $derived(method === 'POST' || method === 'PUT' || method === 'PATCH');
  const allowFile = $derived(method === 'POST' || method === 'PUT');

  $effect(() => {
    if (!allowFile && bodyType === 'file') {
      bodyType = 'json';
    }
  });

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

  function addFormField() {
    formFields = [...formFields, { key: '', value: '' }];
  }

  function removeFormField(index) {
    formFields = formFields.filter((_, i) => i !== index);
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

  const curlCommand = $derived.by(() => {
    const reqUrl = buildRequestUrl(url);
    const parts = ['curl'];
    if (method !== 'GET') parts.push(`-X ${method}`);

    const shellEsc = (s) => `'${s.replace(/'/g, "'\\''")}'`;
    parts.push(shellEsc(reqUrl));

    for (const h of headers) {
      if (h.key.trim()) {
        parts.push(`-H ${shellEsc(`${h.key.trim()}: ${h.value}`)}`);
      }
    }

    if (showBody) {
      if (bodyType === 'json' && body.trim()) {
        parts.push(`-H ${shellEsc('Content-Type: application/json')}`);
        parts.push(`-d ${shellEsc(body)}`);
      } else if (bodyType === 'form') {
        const active = formFields.filter(f => f.key.trim());
        if (active.length > 0) {
          for (const f of active) {
            parts.push(`--data-urlencode ${shellEsc(`${f.key.trim()}=${f.value || ''}`)}`);
          }
        }
      } else if (bodyType === 'file' && selectedFiles.length > 0) {
        const name = fileFieldName.trim() || 'file';
        for (const f of selectedFiles) {
          parts.push(`-F ${shellEsc(`${name}=@${f.name}`)}`);
        }
      }
    }

    return parts.join(' \\\n  ');
  });

  const curlCommandMasked = $derived(
    curlCommand.replace(/(-H\s+(['"]))(Authorization:\s*)(.*?)(\2)/gi, '$1$3••••••••$5')
  );

  let curlHovered = $state(false);

  let themeMode = $state(localStorage.getItem('theme') || 'auto');

  function getEffectiveDark() {
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  let isDarkMode = $state(getEffectiveDark());

  $effect(() => {
    const mode = themeMode;
    localStorage.setItem('theme', mode);
    isDarkMode = getEffectiveDark();
    const html = document.documentElement;
    html.classList.toggle('light', !isDarkMode);
    html.classList.toggle('dark', isDarkMode);
  });

  function cycleTheme() {
    const osIsDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (themeMode === 'auto') themeMode = osIsDark ? 'light' : 'dark';
    else themeMode = 'auto';
  }

  function getThemeIcon(mode) {
    if (mode === 'light') return '○';
    if (mode === 'dark') return '●';
    return '◐';
  }

  function getMethodColor(m) {
    if (isDarkMode) {
      const colors = {
        GET: '#8ccfff', POST: '#80eebc', PUT: '#ffc86a',
        PATCH: '#85f5de', DELETE: '#ff8080', HEAD: '#c880ff', OPTIONS: '#6aaaf0',
      };
      return colors[m] || '#8ccfff';
    }
    const colors = {
      GET: '#1a5a9e', POST: '#0e6e3e', PUT: '#9a6000',
      PATCH: '#0e6e52', DELETE: '#aa1515', HEAD: '#5208a0', OPTIONS: '#063870',
    };
    return colors[m] || '#1a5a9e';
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
      if (opts.body instanceof FormData) {
        lines.push('Content-Type: multipart/form-data (boundary set by browser)');
        for (const [key, val] of opts.body.entries()) {
          if (val instanceof File) {
            lines.push(`  ${key}: [File] ${val.name} (${formatFileSize(val.size)}, ${val.type || 'unknown type'})`);
          } else {
            lines.push(`  ${key}: ${val}`);
          }
        }
      } else {
        lines.push(opts.body);
      }
    }
    return lines.join('\n');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    requestStartMs = performance.now();
    liveElapsed = 0;
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

    let isFileUpload = false;
    if (showBody) {
      if (bodyType === 'file') {
        if (selectedFiles.length > 0) {
          isFileUpload = true;
          const fd = new FormData();
          const name = fileFieldName.trim() || 'file';
          for (const f of selectedFiles) {
            fd.append(name, f);
          }
          opts.body = fd;
        }
      } else if (bodyType === 'form') {
        const activeFields = formFields.filter(f => f.key.trim());
        if (activeFields.length > 0) {
          opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/x-www-form-urlencoded';
          const params = new URLSearchParams();
          for (const f of activeFields) {
            params.append(f.key.trim(), f.value || '');
          }
          opts.body = params.toString();
        }
      } else if (body.trim()) {
        opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
        opts.body = body;
      }
    }

    const requestUrl = buildRequestUrl(url);
    const requestDebug = buildRequestDebug(requestUrl, opts);
    const allHeaders = isFileUpload
      ? { ...opts.headers, 'Content-Type': 'multipart/form-data' }
      : opts.headers;
    const requestHeadersStr = Object.keys(allHeaders).length > 0
      ? Object.entries(allHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')
      : '';
    const requestBodyStr = isFileUpload
      ? selectedFiles.map(f => `[File] ${f.name} (${formatFileSize(f.size)})`).join(', ')
      : (opts.body || '');
    const startTime = performance.now();

    if (serverSide && !isFileUpload) {
      await sendServerSide(requestUrl, opts, requestDebug, requestHeadersStr, requestBodyStr);
    } else {
      await sendClientSide(requestUrl, opts, requestDebug, requestHeadersStr, requestBodyStr, startTime);
    }

    loading = false;
    showResponse = true;
  }

  async function sendServerSide(requestUrl, opts, requestDebug, requestHeadersStr, requestBodyStr) {
    try {
      const proxyPayload = {
        url: requestUrl,
        method: opts.method,
        headers: opts.headers,
        body: typeof opts.body === 'string' ? opts.body : undefined,
      };
      const proxyRes = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload),
      });
      const data = await proxyRes.json();
      const durationMs = data.durationMs || 0;
      responseDuration = durationMs;

      if (data.error) {
        const diagText = `${data.error}\n\n(Server-side request — no CORS involved)`;
        activeTab = 'rawResponse';
        errorDebug = {
          message: data.error,
          request: requestDebug,
          preflight: '',
          rawResponse: data.error,
          diagnosis: diagText,
        };
        await saveRequest({
          timestamp: new Date().toISOString(), method, url: requestUrl,
          requestHeaders: requestHeadersStr, requestBody: requestBodyStr,
          responseStatus: null, responseStatusText: null,
          responseHeaders: null, responseBody: null,
          error: data.error, durationMs,
          diagnosis: diagText, preflight: null,
          serverSide: true,
        });
        drawerRef?.refresh();
        return;
      }

      const respHeaderLines = Object.entries(data.headers || {}).map(([k, v]) => `${k}: ${v}`);
      responseHeaders = respHeaderLines.join('\n');
      const isOk = data.status >= 200 && data.status < 300;

      responseStatus = { code: data.status, text: data.statusText, ok: isOk };

      const ct = (data.headers?.['content-type'] || '');
      if (ct.includes('application/json') && data.body) {
        try { response = JSON.stringify(JSON.parse(data.body), null, 2); }
        catch { response = data.body; }
      } else {
        response = data.body || '';
      }

      if (!isOk) {
        const diagText = `HTTP error ${data.status} ${data.statusText}\n\n(Server-side request — no CORS involved)\nCheck the Response tab for full details.`;
        activeTab = 'rawResponse';
        errorDebug = {
          message: `HTTP ${data.status} ${data.statusText}`,
          request: requestDebug,
          preflight: '',
          rawResponse: `--- Response Status ---\n${data.status} ${data.statusText}\n\n--- Response Headers ---\n${responseHeaders}\n\n--- Response Body ---\n${response || '(empty)'}`,
          diagnosis: diagText,
        };
        await saveRequest({
          timestamp: new Date().toISOString(), method, url: requestUrl,
          requestHeaders: requestHeadersStr, requestBody: requestBodyStr,
          responseStatus: data.status, responseStatusText: data.statusText,
          responseHeaders, responseBody: response,
          error: `HTTP ${data.status} ${data.statusText}`, durationMs,
          diagnosis: diagText, preflight: '',
          serverSide: true,
        });
      } else {
        await saveRequest({
          timestamp: new Date().toISOString(), method, url: requestUrl,
          requestHeaders: requestHeadersStr, requestBody: requestBodyStr,
          responseStatus: data.status, responseStatusText: data.statusText,
          responseHeaders, responseBody: response,
          error: null, durationMs, diagnosis: null, preflight: null,
          serverSide: true,
        });
      }
      drawerRef?.refresh();
    } catch (err) {
      responseDuration = 0;
      errorDebug = {
        message: `Proxy error: ${err.message}`,
        request: requestDebug,
        preflight: '',
        rawResponse: `Proxy error: ${err.message}`,
        diagnosis: 'Failed to reach the local proxy server.\nMake sure the backend is running.',
      };
    }
  }

  async function sendClientSide(requestUrl, opts, requestDebug, requestHeadersStr, requestBodyStr, startTime) {
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
          requestBody: requestBodyStr,
          responseStatus: res.status,
          responseStatusText: res.statusText,
          responseHeaders,
          responseBody: response,
          error: `HTTP ${res.status} ${res.statusText}`,
          durationMs,
          diagnosis: diagText,
          preflight: '',
          serverSide: false,
        });
      } else {
        await saveRequest({
          timestamp: new Date().toISOString(),
          method,
          url: requestUrl,
          requestHeaders: requestHeadersStr,
          requestBody: requestBodyStr,
          responseStatus: res.status,
          responseStatusText: res.statusText,
          responseHeaders,
          responseBody: response,
          error: null,
          durationMs,
          diagnosis: null,
          preflight: null,
          serverSide: false,
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
        requestBody: requestBodyStr,
        responseStatus: null,
        responseStatusText: null,
        responseHeaders: null,
        responseBody: null,
        error: `${err.name}: ${err.message}`,
        durationMs,
        diagnosis: diagText,
        preflight: preflightDebug || null,
        serverSide: false,
      });
      drawerRef?.refresh();
    }
  }

  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      sendRequest();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Escape') {
      e.preventDefault();
      body = '';
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
      e.preventDefault();
      toggleHistoryDrawer();
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

    const reqBody = row.request_body || '';
    const contentType = headers.find(h => h.key.toLowerCase() === 'content-type');
    const ctValue = contentType?.value || '';
    if (ctValue.includes('multipart/form-data') || reqBody.startsWith('[File]')) {
      bodyType = 'file';
      body = '';
      formFields = [];
      selectedFiles = [];
      fileFieldName = 'file';
    } else if (ctValue.includes('application/x-www-form-urlencoded') && reqBody) {
      bodyType = 'form';
      body = '';
      selectedFiles = [];
      formFields = reqBody.split('&').filter(Boolean).map((pair) => {
        const [k, ...rest] = pair.split('=');
        return {
          key: decodeURIComponent(k || ''),
          value: decodeURIComponent(rest.join('=') || ''),
        };
      });
    } else {
      bodyType = 'json';
      body = reqBody;
      formFields = [];
      selectedFiles = [];
    }
    serverSide = !!row.server_side;
    headers = headers.filter(h => h.key.toLowerCase() !== 'content-type');

    showResponse = false;
    errorDebug = null;
    response = null;
    responseStatus = null;
    responseHeaders = '';
    responseDuration = null;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app-layout" class:resizing={isResizing} class:light-theme={!isDarkMode}>
  {#if drawerOpen}
    <div class="drawer-pane" style="width: {drawerWidth}px; min-width: {MIN_DRAWER}px">
      <HistoryDrawer bind:this={drawerRef} bind:open={drawerOpen} onReplay={handleReplay} darkMode={isDarkMode} globalFontSize={globalFontSize} />
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
          <div class="app-header-row" bind:this={headerRowEl}>
            <button class="history-toggle" onclick={toggleHistoryDrawer} title={`Request History (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+H)`}>
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
            {#if showTitle}
              <h1><span style="font-size: 1.75rem; vertical-align: -0.15em">👾</span> EzPostBot</h1>
            {/if}
            <span class="top-controls">
              <label class="toggle-label top-toggle" title="Send request from the backend server, bypassing CORS preflight and browser restrictions">
                <span class="toggle-switch" class:active={serverSide}>
                  <input type="checkbox" bind:checked={serverSide} />
                  <span class="toggle-track"><span class="toggle-thumb"></span></span>
                </span>
                <span class="toggle-text">Server-side</span>
              </label>
              <span class="global-font-controls">
                <button class="global-font-btn" disabled={globalFontSize <= FONT_MIN} onclick={() => { globalFontSize = +(globalFontSize - FONT_STEP).toFixed(2); }} title="Decrease text size">A−</button>
                <button class="global-font-btn" disabled={Math.abs(globalFontSize - FONT_DEFAULT) < 0.01} onclick={() => { globalFontSize = FONT_DEFAULT; }} title="Reset text size">A</button>
                <button class="global-font-btn" disabled={globalFontSize >= FONT_MAX} onclick={() => { globalFontSize = +(globalFontSize + FONT_STEP).toFixed(2); }} title="Increase text size">A+</button>
              </span>
              <button class="theme-toggle" onclick={cycleTheme} title={`Theme: ${themeMode}`}>
                <span class="theme-icon">{getThemeIcon(themeMode)}</span>
                <span class="theme-label">{themeMode === 'auto' ? 'Auto' : themeMode === 'light' ? 'Light' : 'Dark'}</span>
              </button>
            </span>
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
              style="font-size: {globalFontSize}rem"
            />
            {#if querySuffix}
              <span class="url-query-preview" title={querySuffix}>{querySuffix}</span>
            {/if}
          </div>
          <button class="send-btn" onclick={sendRequest} disabled={loading}>
            {#if loading}
              <span class="spinner"></span> {liveElapsed < 1000 ? `${liveElapsed}ms` : `${(liveElapsed / 1000).toFixed(1)}s`}
            {:else}
              Send
            {/if}
          </button>
        </div>

        <!-- Headers Section -->
        <div class="section">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="section-header" class:collapsible={headers.length > 0} onclick={() => { if (headers.length > 0) showHeaders = !showHeaders; }} onkeydown={() => {}}>
            <span class="section-title" class:collapsed={!showHeaders && headers.length > 0}>
              <span class="collapse-arrow">{headers.length > 0 ? (showHeaders ? '▾' : '▸') : '▾'}</span> Headers
              {#if !showHeaders && headers.length > 0}<span class="badge">{headers.length}</span>{/if}
            </span>
            {#if showHeaders}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <button class="add-header-btn" onclick={(e) => { e.stopPropagation(); addHeader(); }}>
                + Add Header
              </button>
            {/if}
          </div>
          {#if showHeaders && headers.length > 0}
            <div class="headers-list">
              {#each headers as header, i}
                <div class="header-row">
                  <input
                    type="text"
                    bind:value={header.key}
                    placeholder="Header name"
                    class="header-input key-input"
                    style="width: {keyColWidth}px"
                  />
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="key-col-resize" onmousedown={startKeyColResize}></div>
                  <span class="value-input-wrap">
                    <input
                      type="text"
                      bind:value={header.value}
                      placeholder="Value"
                      class="header-input value-input"
                      class:secret={header.key.trim().toLowerCase() === 'authorization'}
                      class:has-jwt-btn={header.key.trim().toLowerCase() === 'authorization' && isJwt(header.value)}
                    />
                    {#if header.key.trim().toLowerCase() === 'authorization' && isJwt(header.value)}
                      <button class="jwt-badge" onclick={() => openJwtModal(header.value)} title="Decode JWT token">🔑 JWT</button>
                    {/if}
                  </span>
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
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="section-header" class:collapsible={queryParams.length > 0} onclick={() => { if (queryParams.length > 0) showQueryParams = !showQueryParams; }} onkeydown={() => {}}>
            <span class="section-title" class:collapsed={!showQueryParams && queryParams.length > 0}>
              <span class="collapse-arrow">{queryParams.length > 0 ? (showQueryParams ? '▾' : '▸') : '▾'}</span> Query Params
              {#if !showQueryParams && queryParams.length > 0}<span class="badge">{queryParams.length}</span>{/if}
            </span>
            {#if showQueryParams}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <button class="add-header-btn" onclick={(e) => { e.stopPropagation(); addQueryParam(); }}>
                + Add Param
              </button>
            {/if}
          </div>
          {#if showQueryParams && queryParams.length > 0}
            <div class="headers-list">
              {#each queryParams as param, i}
                <div class="header-row">
                  <input
                    type="text"
                    bind:value={param.key}
                    placeholder="Param name"
                    class="header-input key-input"
                    style="width: {keyColWidth}px"
                  />
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="key-col-resize" onmousedown={startKeyColResize}></div>
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
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="section-header collapsible" onclick={() => showRequestBody = !showRequestBody} onkeydown={() => {}}>
              <span class="section-title" class:collapsed={!showRequestBody}>
                <span class="collapse-arrow">{showRequestBody ? '▾' : '▸'}</span> Request Body
              </span>
              {#if showRequestBody}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <select bind:value={bodyType} class="body-type-select" onclick={(e) => e.stopPropagation()}>
                <option value="json">JSON</option>
                <option value="form">Form</option>
                {#if allowFile}
                  <option value="file">File</option>
                {/if}
              </select>
              {/if}
            </div>
            {#if showRequestBody}
            {#if bodyType === 'json'}
              <textarea
                bind:this={bodyTextarea}
                bind:value={body}
                onkeydown={handleBodyKeydown}
                placeholder={'{"key": "value"}'}
                class="body-input"
                class:mono-assist={jsonAssist}
                rows="6"
                spellcheck="false"
                style="font-size: {globalFontSize}rem"
              ></textarea>
              <div class="body-actions">
                <button class="body-action-btn" onclick={formatJson} title="Format JSON">
                  <span class="body-action-icon">{'{}'}</span> Format <kbd class="btn-kbd">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+F</kbd>
                </button>
                <button class="body-action-btn" onclick={copyBody} title="Copy body">
                  <span class="body-action-icon">{copiedBody ? '✓' : '⧉'}</span> {copiedBody ? 'Copied' : 'Copy'}
                </button>
                <button class="body-action-btn" onclick={() => { body = ''; }} title="Clear body">
                  <span class="body-action-icon">✕</span> Clear <kbd class="btn-kbd">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Esc</kbd>
                </button>
                <span class="body-right-controls">
                  <span class="hint inline-hint">
                    Press <kbd>{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}</kbd>+<kbd>Enter</kbd> to send
                  </span>
                  <label class="assist-toggle" title="Auto-close brackets, quotes, and smart indentation">
                    <span class="toggle-switch small" class:active={jsonAssist}>
                      <input type="checkbox" bind:checked={jsonAssist} />
                      <span class="toggle-track"><span class="toggle-thumb"></span></span>
                    </span>
                    <span class="assist-label">Smart Edit</span>
                  </label>
                </span>
              </div>
            {:else if bodyType === 'form'}
              <div class="headers-list">
                {#each formFields as field, i}
                  <div class="header-row">
                    <input
                      type="text"
                      bind:value={field.key}
                      placeholder="Field name"
                      class="header-input key-input"
                      style="width: {keyColWidth}px"
                    />
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="key-col-resize" onmousedown={startKeyColResize}></div>
                    <input
                      type="text"
                      bind:value={field.value}
                      placeholder="Value"
                      class="header-input value-input"
                    />
                    <button class="remove-btn" onclick={() => removeFormField(i)} title="Remove field">
                      &times;
                    </button>
                  </div>
                {/each}
              </div>
              <div class="form-actions">
                <button class="add-header-btn add-field-btn" onclick={addFormField}>
                  + Add Field
                </button>
                {#if formFields.length > 0}
                  <button class="body-action-btn" onclick={() => { formFields = []; }}>
                    <span class="body-action-icon">✕</span> Clear
                  </button>
                {/if}
              </div>
            {:else}
              <div class="file-upload-section">
                <div class="file-field-row">
                  <label class="file-field-label">Field name</label>
                  <input
                    type="text"
                    bind:value={fileFieldName}
                    placeholder="file"
                    class="header-input file-field-name"
                  />
                </div>
                <div
                  class="file-dropzone"
                  role="button"
                  tabindex="0"
                  onclick={() => fileInputEl?.click()}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputEl?.click(); }}
                >
                  <input
                    bind:this={fileInputEl}
                    type="file"
                    multiple
                    class="file-hidden-input"
                    onchange={(e) => { selectedFiles = [...e.target.files]; }}
                  />
                  {#if selectedFiles.length > 0}
                    <div class="file-list">
                      {#each selectedFiles as f, i}
                        <div class="file-item">
                          <span class="file-icon">📄</span>
                          <span class="file-name">{f.name}</span>
                          <span class="file-size">{formatFileSize(f.size)}</span>
                          <button
                            class="remove-btn file-remove-btn"
                            onclick={(e) => { e.stopPropagation(); selectedFiles = selectedFiles.filter((_, idx) => idx !== i); }}
                            title="Remove file"
                          >&times;</button>
                        </div>
                      {/each}
                    </div>
                    <span class="file-hint">Click to replace files</span>
                  {:else}
                    <span class="file-placeholder">Click to select files</span>
                  {/if}
                </div>
                {#if selectedFiles.length > 0}
                  <button class="body-action-btn file-clear-btn" onclick={() => { selectedFiles = []; fileFieldName = 'file'; }}>
                    <span class="body-action-icon">✕</span> Clear
                  </button>
                {/if}
              </div>
            {/if}
            {/if}
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
                  <pre class="debug-body" style="font-size: {globalFontSize}rem">{errorDebug.rawResponse || '(no response)'}</pre>
                  <button class="response-copy-btn" onclick={() => copyPanelText(errorDebug.rawResponse || '', 'dbg-response')} title="Copy">
                    {copiedPanel === 'dbg-response' ? '✓' : '⧉'}
                  </button>
                </div>
              {:else if activeTab === 'diagnosis'}
                <div class="response-pre-wrapper">
                  <pre class="debug-body" style="font-size: {globalFontSize}rem">{errorDebug.diagnosis || '(no diagnosis available)'}</pre>
                  <button class="response-copy-btn" onclick={() => copyPanelText(errorDebug.diagnosis || '', 'dbg-diagnosis')} title="Copy">
                    {copiedPanel === 'dbg-diagnosis' ? '✓' : '⧉'}
                  </button>
                </div>
              {:else if activeTab === 'request'}
                <div class="response-pre-wrapper">
                  <pre class="debug-body" style="font-size: {globalFontSize}rem">{errorDebug.request || '(no request info)'}</pre>
                  <button class="response-copy-btn" onclick={() => copyPanelText(errorDebug.request || '', 'dbg-request')} title="Copy">
                    {copiedPanel === 'dbg-request' ? '✓' : '⧉'}
                  </button>
                </div>
              {:else if activeTab === 'preflight'}
                <div class="response-pre-wrapper">
                  <pre class="debug-body" style="font-size: {globalFontSize}rem">{errorDebug.preflight}</pre>
                  <button class="response-copy-btn" onclick={() => copyPanelText(errorDebug.preflight || '', 'dbg-preflight')} title="Copy">
                    {copiedPanel === 'dbg-preflight' ? '✓' : '⧉'}
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Success Response Section -->
        {#if responseStatus && !errorDebug}
          <div class="section">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="section-header collapsible" onclick={() => showResponse = !showResponse} onkeydown={() => {}}>
              <span class="section-title" class:collapsed={!showResponse}>
                <span class="collapse-arrow">{showResponse ? '▾' : '▸'}</span> Response
              </span>
              <span class="response-status-group">
                {#if responseDuration !== null}
                  <span class="response-duration">{responseDuration}ms</span>
                {/if}
                <span class="status-badge" class:status-ok={responseStatus.ok} class:status-err={!responseStatus.ok}>
                  {responseStatus.code} {responseStatus.text}
                </span>
              </span>
            </div>

            {#if showResponse}
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
                <pre class="response-body" style="font-size: {globalFontSize}rem">{response || '(empty response)'}</pre>
                <button class="response-copy-btn" onclick={() => copyPanelText(response || '', 'body')} title="Copy">
                  {copiedPanel === 'body' ? '✓' : '⧉'}
                </button>
              </div>
            {:else}
              <div class="response-pre-wrapper">
                <pre class="response-body" style="font-size: {globalFontSize}rem">{responseHeaders || '(no headers)'}</pre>
                <button class="response-copy-btn" onclick={() => copyPanelText(responseHeaders || '', 'headers')} title="Copy">
                  {copiedPanel === 'headers' ? '✓' : '⧉'}
                </button>
              </div>
            {/if}
            {/if}
          </div>
        {/if}

        <div class="section">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="section-header collapsible" onclick={() => showCurl = !showCurl} onkeydown={() => {}}>
            <span class="section-title" class:collapsed={!showCurl}>
              <span class="collapse-arrow">{showCurl ? '▾' : '▸'}</span> cURL Command
            </span>
            <button class="curl-import-btn" onclick={(e) => { e.stopPropagation(); importCurl(); }} title="Import cURL command from clipboard">
              {#if importStatus === 'ok'}✓ Imported{:else if importStatus === 'invalid'}✕ Not a curl command{:else if importStatus === 'error'}✕ Clipboard error{:else}📋 Import Paste Buffer{/if}
            </button>
          </div>
          {#if showCurl}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="response-pre-wrapper" onmouseenter={() => curlHovered = true} onmouseleave={() => curlHovered = false}>
              <pre class="curl-output" style="font-size: {globalFontSize}rem">{curlHovered ? curlCommand : curlCommandMasked}</pre>
              <button class="response-copy-btn" onclick={() => copyPanelText(curlCommand, 'curl')} title="Copy cURL command">
                {copiedPanel === 'curl' ? '✓' : '⧉'}
              </button>
            </div>
          {/if}
        </div>

      </div>
    </div>
  </main>

  {#if jwtModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="jwt-overlay" onclick={closeJwtModal} onkeydown={() => {}}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="jwt-modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
        <div class="jwt-modal-header">
          <span class="jwt-modal-title">🔑 JWT Token</span>
          <span class="jwt-expiry-badge" class:expired={jwtModal.isExpired} class:valid={!jwtModal.isExpired && jwtModal.expiry}>
            {#if jwtModal.expiry}
              {jwtModal.isExpired ? '✕ Expired' : '✓ Not Expired'}
            {:else}
              No expiry claim
            {/if}
          </span>
          <button class="jwt-close-btn" onclick={closeJwtModal}>✕</button>
        </div>

        <div class="jwt-section">
          <div class="jwt-section-label">Header <span class="jwt-alg">{jwtModal.header?.alg || '?'} · {jwtModal.header?.typ || '?'}</span></div>
          <div class="jwt-pre-wrapper">
            <pre class="jwt-pre" style="font-size: {globalFontSize}rem">{jwtModal.header ? JSON.stringify(jwtModal.header, null, 2) : '(unable to decode)'}</pre>
            <button class="jwt-copy-btn" onclick={() => copyJwtSection(JSON.stringify(jwtModal.header, null, 2), 'header')} title="Copy">
              {copiedJwtSection === 'header' ? '✓' : '⧉'}
            </button>
          </div>
        </div>

        <div class="jwt-section">
          <div class="jwt-section-label">Payload</div>
          <div class="jwt-pre-wrapper">
            <pre class="jwt-pre jwt-payload" style="font-size: {globalFontSize}rem">{jwtModal.payload ? JSON.stringify(jwtModal.payload, null, 2) : '(unable to decode)'}</pre>
            <button class="jwt-copy-btn" onclick={() => copyJwtSection(JSON.stringify(jwtModal.payload, null, 2), 'payload')} title="Copy">
              {copiedJwtSection === 'payload' ? '✓' : '⧉'}
            </button>
          </div>
          {#if jwtModal.issuedAt || jwtModal.expiry || jwtModal.notBefore}
            <div class="jwt-timestamps">
              {#if jwtModal.issuedAt}<div><strong>Issued:</strong> {jwtModal.issuedAt.toLocaleString()}</div>{/if}
              {#if jwtModal.notBefore}<div><strong>Not Before:</strong> {jwtModal.notBefore.toLocaleString()}</div>{/if}
              {#if jwtModal.expiry}<div><strong>Expires:</strong> {jwtModal.expiry.toLocaleString()}</div>{/if}
            </div>
          {/if}
        </div>

        <div class="jwt-section">
          <div class="jwt-section-label">Signature</div>
          <div class="jwt-pre-wrapper">
            <pre class="jwt-pre jwt-sig" style="font-size: {globalFontSize}rem">{jwtModal.signature || '(empty)'}</pre>
            <button class="jwt-copy-btn" onclick={() => copyJwtSection(jwtModal.signature || '', 'sig')} title="Copy">
              {copiedJwtSection === 'sig' ? '✓' : '⧉'}
            </button>
          </div>
          <div class="jwt-verify-row">
            {#if jwtModal.payload?.iss && ALG_MAP[jwtModal.header?.alg]}
              <button class="jwt-verify-btn" onclick={verifyJwt} disabled={jwtVerifyStatus === 'loading'}>
                {#if jwtVerifyStatus === 'loading'}
                  <span class="spinner"></span> Verifying…
                {:else}
                  🔐 Verify Signature
                {/if}
              </button>
            {:else if !jwtModal.payload?.iss}
              <span class="jwt-verify-note">No "iss" claim — cannot auto-fetch JWKS</span>
            {:else}
              <span class="jwt-verify-note">Algorithm "{jwtModal.header?.alg}" not supported for browser verification</span>
            {/if}
            {#if jwtVerifyStatus === 'valid'}
              <span class="jwt-verify-result valid">✓ Signature Valid</span>
            {:else if jwtVerifyStatus === 'invalid'}
              <span class="jwt-verify-result invalid">✕ Signature Invalid</span>
            {:else if jwtVerifyStatus?.startsWith('error:')}
              <span class="jwt-verify-result error">{jwtVerifyStatus.slice(6)}</span>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Layout */
  .app-layout {
    display: flex;
    height: 100vh;
    width: 100%;
    overflow: hidden;
    box-sizing: border-box;
    border: 1px solid #32324a;
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
    padding: 0.75rem 1rem 1rem;
  }

  /* Header */
  .app-header {
    margin-bottom: 0.6rem;
  }

  .app-header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
  }

  .app-header h1 {
    font-size: 1.125rem;
    margin: 0 0 0.15rem 0;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }


  .history-toggle {
    background: #2e2e4d;
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

  .top-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    flex-shrink: 0;
  }

  .global-font-controls {
    display: flex;
    gap: 0.2rem;
  }

  .global-font-btn {
    background: #2e2e4d;
    border: 1px solid #3a3a4a;
    color: #aaa;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.3rem 0.5rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'SF Mono', 'Fira Code', monospace;
    line-height: 1;
  }

  .global-font-btn:hover:not(:disabled) {
    border-color: #646cff;
    color: #fff;
  }

  .global-font-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .theme-toggle {
    background: #2e2e4d;
    border: 1px solid #3a3a4a;
    color: #aaa;
    padding: 0.3rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .theme-toggle:hover {
    border-color: #646cff;
    color: #fff;
  }

  .theme-icon {
    font-size: 0.85rem;
    line-height: 1;
  }

  .theme-label {
    text-transform: capitalize;
  }

  /* Request bar */
  .request-bar {
    display: flex;
    gap: 0;
    border: 2px solid #3a3a4a;
    border-radius: 10px;
    overflow: hidden;
    background: #2e2e4d;
    margin-bottom: 1.25rem;
  }

  .method-select {
    background: #2a2a46;
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
    min-width: 90px;
    justify-content: center;
    font-variant-numeric: tabular-nums;
  }

  .send-btn:hover:not(:disabled) {
    background: #535bf2;
  }

  .send-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    user-select: none;
  }

  .toggle-switch {
    position: relative;
    display: inline-block;
  }

  .toggle-switch input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    display: block;
    width: 32px;
    height: 18px;
    background: #3a3a4a;
    border-radius: 9px;
    position: relative;
    transition: background 0.2s;
  }

  .toggle-switch.active .toggle-track {
    background: #646cff;
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: #ccc;
    border-radius: 50%;
    transition: transform 0.2s, background 0.2s;
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(14px);
    background: #fff;
  }

  .toggle-text {
    font-size: 0.75rem;
    color: #888;
    font-weight: 500;
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
    margin-bottom: 0.6rem;
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
    gap: 0.15rem;
    align-items: center;
  }

  .header-input {
    background: #2e2e4d;
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
    flex: none;
    min-width: 0;
  }

  .key-col-resize {
    width: 4px;
    align-self: stretch;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .key-col-resize:hover {
    background: #646cff;
  }

  .value-input {
    flex: 1;
    min-width: 0;
  }

  .value-input.secret {
    -webkit-text-security: disc;
    text-security: disc;
  }

  .value-input.secret:focus,
  .value-input.secret:hover {
    -webkit-text-security: none;
    text-security: none;
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
    background: #2e2e4d;
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

  .body-type-select {
    background: #2e2e4d;
    border: 1px solid #3a3a4a;
    color: #ccc;
    padding: 0.25rem 0.5rem;
    font-size: 0.72rem;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
    border-radius: 5px;
    cursor: pointer;
    outline: none;
    appearance: auto;
  }

  .body-type-select:focus {
    border-color: #646cff;
  }

  .body-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }

  .body-action-btn {
    background: transparent;
    color: #888;
    border: 1px solid #3a3a4a;
    padding: 0.25rem 0.55rem;
    font-size: 0.7rem;
    font-weight: 500;
    font-family: 'SF Mono', 'Fira Code', monospace;
    border-radius: 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    transition: all 0.15s;
  }

  .body-action-btn:hover {
    color: #ccc;
    border-color: #646cff;
    background: rgba(100, 108, 255, 0.08);
  }

  .body-action-icon {
    font-size: 0.75rem;
  }

  .btn-kbd {
    font-size: 0.6rem;
    opacity: 0.7;
    margin-left: 0.15rem;
  }

  .assist-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    user-select: none;
  }

  .assist-label {
    font-size: 0.7rem;
    color: #888;
    font-weight: 500;
  }

  .body-right-controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-left: auto;
  }


  .toggle-switch.small .toggle-track {
    width: 26px;
    height: 15px;
    border-radius: 8px;
  }

  .toggle-switch.small .toggle-thumb {
    width: 11px;
    height: 11px;
    top: 2px;
    left: 2px;
  }

  .toggle-switch.small.active .toggle-thumb {
    transform: translateX(11px);
  }

  .add-field-btn {
    margin-top: 0;
  }

  .form-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }

  .file-clear-btn {
    margin-top: 0.4rem;
    align-self: flex-start;
  }

  .file-upload-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-field-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .file-field-label {
    font-size: 0.72rem;
    color: #888;
    white-space: nowrap;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .file-field-name {
    max-width: 180px;
  }

  .file-dropzone {
    border: 2px dashed #3a3a4a;
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    background: #2a2a46;
    min-height: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .file-dropzone:hover {
    border-color: #646cff;
    background: rgba(100, 108, 255, 0.05);
  }

  .file-hidden-input {
    display: none;
  }

  .file-placeholder {
    color: #666;
    font-size: 0.8rem;
  }

  .file-hint {
    color: #555;
    font-size: 0.7rem;
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #2e2e4d;
    border: 1px solid #3a3a4a;
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    font-size: 0.78rem;
  }

  .file-icon {
    font-size: 0.9rem;
    flex-shrink: 0;
  }

  .file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #ccc;
  }

  .file-size {
    font-size: 0.7rem;
    color: #7a7a8e;
    white-space: nowrap;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .file-remove-btn {
    width: 22px;
    height: 22px;
    font-size: 0.9rem;
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
    background: #2e2e4d;
    padding: 0.85rem;
    margin: 0;
    font-size: 0.75rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    height: 350px;
    min-height: 80px;
    max-height: 80vh;
    overflow-y: auto;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: #ccc;
    resize: vertical;
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

  .light-theme .status-ok {
    background: rgba(30, 140, 80, 0.15);
    color: #1a7a45;
  }

  .light-theme .status-err {
    background: rgba(200, 30, 30, 0.15);
    color: #b91c1c;
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
    background: #3a3a60;
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
    z-index: 5;
    padding: 0;
    line-height: 1;
    pointer-events: auto;
  }

  .response-pre-wrapper:hover .response-copy-btn {
    opacity: 1;
  }

  .response-copy-btn:hover {
    color: #fff;
    border-color: #646cff;
    background: #40406d;
  }


  .response-body {
    background: #2e2e4d;
    border: 1px solid #3a3a4a;
    border-top: none;
    border-radius: 0 0 8px 8px;
    padding: 0.85rem;
    margin: 0;
    font-size: 0.75rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    height: 350px;
    min-height: 80px;
    max-height: 80vh;
    overflow-y: auto;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    resize: vertical;
  }

  .collapsible {
    cursor: pointer;
    user-select: none;
  }

  .collapse-arrow {
    font-size: 1.5rem;
    display: inline-block;
    width: 1.2rem;
    line-height: 1;
    vertical-align: middle;
  }

  .section-title.collapsed {
    opacity: 0.5;
  }

  .curl-import-btn {
    background: transparent;
    border: 1px solid #3a3a4a;
    color: #aaa;
    font-size: 0.65rem;
    font-weight: 500;
    padding: 0.15rem 0.5rem;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s;
    margin-left: auto;
    white-space: nowrap;
  }

  .curl-import-btn:hover {
    border-color: #646cff;
    color: #fff;
  }

  .curl-output {
    background: #2e2e4d;
    border: 1px solid #3a3a4a;
    border-radius: 8px;
    padding: 0.85rem;
    margin: 0;
    font-size: 0.75rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: #b0b0c0;
  }

  /* Hint */
  .hint {
    font-size: 0.65rem;
    color: #9090a8;
  }

  .inline-hint {
    margin: 0;
    padding: 0;
    margin-right: 0.4rem;
    white-space: nowrap;
  }

  kbd {
    background: #404060;
    border: 1px solid #5a5a70;
    border-radius: 4px;
    padding: 0.1rem 0.3rem;
    font-size: 0.65rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #d0d0e0;
  }

  /* Light mode overrides */
  .light-theme .request-bar {
    background: #ececf4;
    border-color: #a0a0b4;
  }

  .light-theme .method-select {
    background: #dadaea;
    border-right-color: #a0a0b4;
    color: inherit;
  }

  .light-theme .url-input::placeholder {
    color: #888;
  }

  .light-theme .url-query-preview {
    color: #7a7a90;
  }

  .light-theme .header-input,
  .light-theme .body-input {
    background: #ececf4;
    border-color: #a0a0b4;
    color: #1a1a2a;
  }

  .light-theme .response-body {
    background: #e8e8f2;
    border-color: #a0a0b4;
    color: #111;
  }

  .light-theme .curl-import-btn {
    border-color: #a0a0b4;
    color: #444;
  }

  .light-theme .curl-import-btn:hover {
    border-color: #646cff;
    color: #111;
  }

  .light-theme .curl-output {
    background: #e8e8f2;
    border-color: #a0a0b4;
    color: #111;
  }

  .light-theme .response-copy-btn {
    background: #ccccd8;
    border-color: #999;
    color: #333;
  }

  .light-theme .response-copy-btn:hover {
    background: #c0c0d0;
    border-color: #646cff;
    color: #111;
  }

  .light-theme .body-type-select {
    background: #dadaea;
    border-color: #a0a0b4;
    color: #2a2a3a;
  }

  .light-theme .body-action-btn {
    border-color: #a0a0b4;
    color: #333;
    background: #dadaea;
  }

  .light-theme .body-action-btn:hover {
    color: #111;
    background: #d0d0e0;
  }

  .light-theme .toggle-track {
    background: #a0a0b4;
  }

  .light-theme .toggle-thumb {
    background: #fff;
  }

  .light-theme .toggle-text {
    color: #333;
  }

  .light-theme .file-dropzone {
    background: #e2e2ee;
    border-color: #a0a0b4;
  }

  .light-theme .file-dropzone:hover {
    background: rgba(100, 108, 255, 0.07);
    border-color: #646cff;
  }

  .light-theme .file-item {
    background: #dadaea;
    border-color: #a0a0b4;
  }

  .light-theme .file-name {
    color: #2a2a3a;
  }

  .light-theme .response-tabs {
    border-bottom-color: #a0a0b4;
  }

  .light-theme .response-body {
    border-color: #a0a0b4;
  }

  .light-theme .badge {
    background: #c8c8d6;
  }

  .light-theme .error-box {
    background: rgba(249, 62, 62, 0.07);
  }

  .light-theme .debug-panel {
    border-color: #f93e3e55;
  }

  .light-theme .debug-tabs {
    border-bottom-color: #a0a0b4;
    background: rgba(249, 62, 62, 0.04);
  }

  .light-theme .debug-body {
    background: #e8e8f2;
    color: #111;
  }

  .light-theme kbd {
    background: #d0d0dc;
    border-color: #a0a0b4;
    color: #444;
  }

  .light-theme .history-toggle {
    background: #dadaea;
    border-color: #a0a0b4;
    color: #333;
  }

  .light-theme .history-toggle:hover {
    color: #111;
    background: #ccccda;
  }

  .light-theme .global-font-btn {
    background: #dadaea;
    border-color: #a0a0b4;
    color: #333;
  }

  .light-theme .global-font-btn:hover:not(:disabled) {
    border-color: #646cff;
    color: #111;
    background: #ccccda;
  }

  .light-theme .theme-toggle {
    background: #dadaea;
    border-color: #a0a0b4;
    color: #333;
  }

  .light-theme .theme-toggle:hover {
    color: #111;
    background: #ccccda;
  }

  .app-layout.light-theme {
    border-color: #a0a0b4;
  }

  .light-theme .resize-handle:hover,
  .light-theme.resizing .resize-handle {
    background: rgba(100, 108, 255, 0.12);
  }


  .light-theme .resize-grip {
    background: #999;
  }

  .light-theme .hint {
    color: #666;
  }

  .light-theme .section-title {
    color: #444;
  }

  .light-theme .badge {
    color: #333;
  }

  /* JWT */
  .value-input-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }

  .value-input-wrap .value-input {
    flex: 1;
    width: 100%;
  }

  .value-input.has-jwt-btn {
    padding-right: 4.2rem;
  }

  .jwt-badge {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    background: #646cff;
    color: #fff;
    border: none;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 0.03em;
    transition: background 0.15s;
    line-height: 1;
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  .jwt-badge:hover {
    background: #535bf2;
  }

  .jwt-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .jwt-modal {
    background: #1e1e38;
    border: 1px solid #3a3a5a;
    border-radius: 12px;
    padding: 1.25rem;
    width: 85vw;
    max-width: 900px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }

  .jwt-modal-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .jwt-modal-title {
    font-size: 1rem;
    font-weight: 700;
    color: #ddd;
  }

  .jwt-expiry-badge {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 5px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .jwt-expiry-badge.valid {
    background: rgba(73, 204, 144, 0.15);
    color: #49cc90;
  }

  .jwt-expiry-badge.expired {
    background: rgba(249, 62, 62, 0.15);
    color: #f93e3e;
  }

  .jwt-close-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid #3a3a5a;
    color: #888;
    font-size: 0.85rem;
    padding: 0.15rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .jwt-close-btn:hover {
    border-color: #f93e3e;
    color: #f93e3e;
  }

  .jwt-section {
    margin-bottom: 0.8rem;
  }

  .jwt-pre-wrapper {
    position: relative;
  }

  .jwt-pre-wrapper .jwt-copy-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: #3a3a5a;
    border: 1px solid #4a4a6a;
    color: #aaa;
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s;
    line-height: 1;
  }

  .jwt-pre-wrapper:hover .jwt-copy-btn {
    opacity: 1;
  }

  .jwt-pre-wrapper .jwt-copy-btn:hover {
    background: #4a4a6a;
    color: #fff;
  }

  .jwt-section-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 0.3rem;
    letter-spacing: 0.04em;
  }

  .jwt-alg {
    font-weight: 500;
    color: #646cff;
    text-transform: none;
  }

  .jwt-pre {
    background: #2a2a4a;
    border: 1px solid #3a3a5a;
    border-radius: 8px;
    padding: 0.7rem;
    margin: 0;
    font-size: 0.72rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-x: auto;
    color: #ccc;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .jwt-timestamps {
    font-size: 0.65rem;
    color: #999;
    margin-top: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .jwt-sig {
    color: #888;
    font-size: 0.65rem;
  }

  .jwt-verify-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }

  .jwt-verify-btn {
    background: #646cff;
    color: #fff;
    border: none;
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .jwt-verify-btn:hover:not(:disabled) {
    background: #535bf2;
  }

  .jwt-verify-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .jwt-verify-note {
    font-size: 0.6rem;
    color: #666;
    font-style: italic;
  }

  .jwt-verify-result {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 5px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .jwt-verify-result.valid {
    background: rgba(73, 204, 144, 0.15);
    color: #49cc90;
  }

  .jwt-verify-result.invalid {
    background: rgba(249, 62, 62, 0.15);
    color: #f93e3e;
  }

  .jwt-verify-result.error {
    background: rgba(255, 180, 50, 0.15);
    color: #e0a030;
    font-weight: 500;
    font-size: 0.6rem;
  }

  /* JWT light mode */
  .light-theme .jwt-modal {
    background: #f0f0f8;
    border-color: #a0a0b4;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  }

  .light-theme .jwt-modal-title {
    color: #222;
  }

  .light-theme .jwt-close-btn {
    border-color: #a0a0b4;
    color: #666;
  }

  .light-theme .jwt-close-btn:hover {
    border-color: #f93e3e;
    color: #f93e3e;
  }

  .light-theme .jwt-section-label {
    color: #555;
  }

  .light-theme .jwt-pre {
    background: #e2e2ee;
    border-color: #a0a0b4;
    color: #222;
  }

  .light-theme .jwt-copy-btn {
    background: #ccccd8;
    border-color: #a0a0b4;
    color: #444;
  }

  .light-theme .jwt-copy-btn:hover {
    background: #b8b8c8;
    color: #111;
  }

  .light-theme .jwt-timestamps {
    color: #555;
  }

  .light-theme .jwt-sig {
    color: #666;
  }

  .light-theme .jwt-verify-note {
    color: #888;
  }

  .light-theme .jwt-verify-result.valid {
    background: rgba(30, 140, 80, 0.15);
    color: #1a7a45;
  }

  .light-theme .jwt-verify-result.invalid {
    background: rgba(200, 30, 30, 0.15);
    color: #b91c1c;
  }

  .light-theme .jwt-verify-result.error {
    background: rgba(200, 140, 20, 0.15);
    color: #9a6c10;
  }

  .light-theme .jwt-expiry-badge.valid {
    background: rgba(30, 140, 80, 0.15);
    color: #1a7a45;
  }

  .light-theme .jwt-expiry-badge.expired {
    background: rgba(200, 30, 30, 0.15);
    color: #b91c1c;
  }
</style>
