(function () {
  'use strict';

  var RATE = 10 / 60;

  var DASH_URL = 'http://127.0.0.1:18790';
  var RETRY_INTERVAL_MS = 5 * 1000;

  var IS_PUBLIC_HOST = (function () {
    var h = location.hostname;
    return h !== 'localhost' && h !== '127.0.0.1' && h !== '';
  })();

  var DB_NAME    = 'krateroi-library';
  var DB_VERSION = 1;
  var DB_STORE   = 'audios';

  /* ── UTILS ── */
  function formatCLP(n) {
    return '$' + new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  function computeCost(s) { return s * RATE; }
  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
  }
  function formatDuration(s) {
    if (!isFinite(s)) return '--:--';
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  function fmtElapsed(ms) {
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return [h, m, s].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ── UPLOAD MODULE ── */
  var uploadUrl = null, uploadDuration = NaN, uploadItemId = null, uploadFile = null;

  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('fileInput');
  var uploadPreview = document.getElementById('uploadPreview');
  var uploadAudio = document.getElementById('uploadAudio');

  function handleFile(f) {
    if (!f) return;
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    uploadUrl = URL.createObjectURL(f);
    uploadFile = f; uploadDuration = NaN;
    uploadItemId = 'up-' + f.name + '-' + f.size + '-' + f.lastModified;
    document.getElementById('fileName').textContent = f.name;
    document.getElementById('fileMeta').textContent = formatBytes(f.size) + ' · --:--';
    uploadAudio.src = uploadUrl;
    uploadPreview.classList.remove('hidden');
    document.getElementById('uploadCostText').textContent = '--:-- · $0,00';
  }

  uploadAudio.addEventListener('loadedmetadata', function () {
    uploadDuration = uploadAudio.duration;
    if (uploadFile) document.getElementById('fileMeta').textContent = formatBytes(uploadFile.size) + ' · ' + formatDuration(uploadDuration);
    document.getElementById('uploadCostText').textContent = formatDuration(uploadDuration) + ' · ' + formatCLP(computeCost(uploadDuration));
    if (uploadFile && isFinite(uploadDuration) && uploadDuration > 0) {
      libraryAutoSave({
        id: uploadItemId,
        name: uploadFile.name,
        size: uploadFile.size,
        mime: uploadFile.type || 'audio/unknown',
        duration: uploadDuration,
        source: 'upload',
        blob: uploadFile,
      });
    }
  });

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', function (e) { e.preventDefault(); dropzone.classList.remove('dragover'); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', function (e) { handleFile(e.target.files && e.target.files[0]); });

  document.getElementById('clearFile').addEventListener('click', function () {
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    uploadUrl = null; uploadFile = null; uploadDuration = NaN; uploadItemId = null;
    uploadAudio.removeAttribute('src'); uploadAudio.load();
    fileInput.value = '';
    uploadPreview.classList.add('hidden');
  });

  /* ── RECORD MODULE ── */
  var recRecorder = null, recChunks = [], recStream = null;
  var recStartTs = 0, recTick = null, recRecording = false;
  var recPreviewUrl = null, recDuration = NaN, recItemId = null, recItemName = null;

  var recBtn = document.getElementById('recBtn');
  var ping = document.getElementById('ping');
  var micIcon = document.getElementById('micIcon');
  var stopIcon = document.getElementById('stopIcon');

  function setRecording(on) {
    recRecording = on;
    recBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    recBtn.setAttribute('aria-label', on ? 'Detener grabación' : 'Grabar audio');
    document.getElementById('recLabel').textContent = on ? 'Detener' : 'Grabar';
    micIcon.classList.toggle('hidden', on);
    stopIcon.classList.toggle('hidden', !on);
    ping.classList.toggle('hidden', !on);
  }

  recBtn.addEventListener('click', function () { recRecording ? stopRec() : startRec(); });

  async function startRec() {
    document.getElementById('recDenied').classList.add('hidden');
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recRecorder = new MediaRecorder(recStream);
      recChunks = [];
      recRecorder.ondataavailable = function (e) { if (e.data.size > 0) recChunks.push(e.data); };
      recRecorder.onstop = function () {
        var type = recRecorder.mimeType || 'audio/webm';
        var blob = new Blob(recChunks, { type: type });
        var url = URL.createObjectURL(blob);
        if (recPreviewUrl) URL.revokeObjectURL(recPreviewUrl);
        recPreviewUrl = url;
        var ext = type.indexOf('webm') !== -1 ? 'webm' : type.indexOf('wav') !== -1 ? 'wav' : 'webm';
        var iso = new Date().toISOString();
        var name = 'krateroi-recording-' + iso.replace(/[:.]/g, '-') + '.' + ext;
        recItemId = 'rec-' + iso; recItemName = name;
        recDuration = (Date.now() - recStartTs) / 1000;
        var a = document.createElement('a'); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        document.getElementById('recAudio').src = url;
        document.getElementById('recFileName').textContent = name;
        document.getElementById('recCostText').textContent = formatDuration(recDuration) + ' · ' + formatCLP(computeCost(recDuration));
        document.getElementById('recPreview').classList.remove('hidden');
        if (recStream) { recStream.getTracks().forEach(function (t) { t.stop(); }); recStream = null; }
        if (isFinite(recDuration) && recDuration > 0) {
          libraryAutoSave({
            id: recItemId,
            name: name,
            size: blob.size,
            mime: type,
            duration: recDuration,
            source: 'record',
            blob: blob,
          });
        }
      };
      recRecorder.start();
      recStartTs = Date.now();
      document.getElementById('recTimer').textContent = '00:00:00';
      recTick = window.setInterval(function () { document.getElementById('recTimer').textContent = fmtElapsed(Date.now() - recStartTs); }, 100);
      setRecording(true);
    } catch (err) {
      document.getElementById('recDenied').classList.remove('hidden');
    }
  }

  function stopRec() {
    if (recTick) { window.clearInterval(recTick); recTick = null; }
    if (recRecorder) recRecorder.stop();
    setRecording(false);
  }

  /* ── CARPETA (IndexedDB-backed library + payment) ── */

  var SESSION_ID    = sessionStorage.getItem('krateroi.session.id');
  var SESSION_START = parseInt(sessionStorage.getItem('krateroi.session.start') || '0', 10);
  if (!SESSION_ID) {
    SESSION_ID = 's-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    SESSION_START = Date.now();
    sessionStorage.setItem('krateroi.session.id', SESSION_ID);
    sessionStorage.setItem('krateroi.session.start', String(SESSION_START));
  }

  var _dbPromise = null;
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          var os = db.createObjectStore(DB_STORE, { keyPath: 'id' });
          os.createIndex('sessionId', 'sessionId', { unique: false });
          os.createIndex('addedAt',   'addedAt',   { unique: false });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
    return _dbPromise;
  }
  function txStore(mode) {
    return openDB().then(function (db) {
      return db.transaction(DB_STORE, mode).objectStore(DB_STORE);
    });
  }
  function libPut(item) {
    return txStore('readwrite').then(function (st) {
      return new Promise(function (res, rej) {
        var r = st.put(item); r.onsuccess = function () { res(); }; r.onerror = function (e) { rej(e.target.error); };
      });
    });
  }
  function libGetAll() {
    return txStore('readonly').then(function (st) {
      return new Promise(function (res, rej) {
        var r = st.getAll(); r.onsuccess = function () { res(r.result || []); }; r.onerror = function (e) { rej(e.target.error); };
      });
    });
  }
  function libDelete(id) {
    return txStore('readwrite').then(function (st) {
      return new Promise(function (res, rej) {
        var r = st.delete(id); r.onsuccess = function () { res(); }; r.onerror = function (e) { rej(e.target.error); };
      });
    });
  }

  var libCache = [];
  var libSelected = {};

  function inferFormat(name, mime) {
    var dot = (name || '').lastIndexOf('.');
    if (dot !== -1 && dot < name.length - 1) {
      var ext = name.slice(dot + 1).toLowerCase();
      if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
    }
    if (mime) {
      var slash = mime.indexOf('/');
      if (slash !== -1) return mime.slice(slash + 1).toLowerCase().split(';')[0];
    }
    return 'bin';
  }

  function libraryAutoSave(meta) {
    if (!meta || !meta.id || !meta.blob) return;
    var existing = libCache.find(function (x) { return x.id === meta.id; });
    var item = {
      id:           meta.id,
      sessionId:    (existing && existing.sessionId) || SESSION_ID,
      sessionStart: (existing && existing.sessionStart) || SESSION_START,
      name:         meta.name,
      size:         meta.size,
      mime:         meta.mime || 'application/octet-stream',
      format:       inferFormat(meta.name, meta.mime),
      duration:     meta.duration,
      cost:         computeCost(meta.duration),
      source:       meta.source || 'upload',
      addedAt:      (existing && existing.addedAt) || Date.now(),
      blob:         meta.blob,
      paidAt:        existing ? existing.paidAt        : null,
      pendingUpload: existing ? existing.pendingUpload : false,
      uploadedAt:    existing ? existing.uploadedAt    : null,
      uploadError:   existing ? existing.uploadError   : null,
    };
    libPut(item).then(function () {
      var idx = libCache.findIndex(function (x) { return x.id === item.id; });
      if (idx !== -1) libCache[idx] = item; else libCache.push(item);
      renderLibrary();
    }).catch(function (err) {
      console.warn('[krateroi] libPut failed:', err);
    });
  }

  function libUpdate(id, patch) {
    var idx = libCache.findIndex(function (x) { return x.id === id; });
    if (idx === -1) return Promise.resolve();
    var merged = Object.assign({}, libCache[idx], patch);
    libCache[idx] = merged;
    return libPut(merged);
  }

  /* ── Render ── */

  function formatSessionTitle(ts) {
    return new Date(ts).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' });
  }

  function statusBadges(item) {
    var out = '';
    if (item.paidAt)       out += '<span class="lib-badge paid">Pagado</span>';
    if (item.uploadedAt)   out += '<span class="lib-badge ok">Enviado</span>';
    else if (item.pendingUpload) out += '<span class="lib-badge pending">En cola</span>';
    return out;
  }

  function renderLibrary() {
    var meta = document.getElementById('libraryMeta');
    var emptyEl = document.getElementById('libraryEmpty');
    var listEl  = document.getElementById('libraryList');

    var sessions = {};
    libCache.forEach(function (it) {
      var sid = it.sessionId || ('legacy-' + (it.sessionStart || 0));
      if (!sessions[sid]) sessions[sid] = { id: sid, start: it.sessionStart || it.addedAt, items: [] };
      sessions[sid].items.push(it);
      if ((it.sessionStart || it.addedAt) < sessions[sid].start) sessions[sid].start = it.sessionStart || it.addedAt;
    });
    var sessionList = Object.keys(sessions).map(function (k) { return sessions[k]; });
    sessionList.sort(function (a, b) { return b.start - a.start; });
    sessionList.forEach(function (s) { s.items.sort(function (a, b) { return a.addedAt - b.addedAt; }); });

    var totalAudios = libCache.length;
    meta.textContent = totalAudios + ' audio' + (totalAudios === 1 ? '' : 's') +
                       ' · ' + sessionList.length + ' sesion' + (sessionList.length === 1 ? '' : 'es');

    if (totalAudios === 0) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      listEl.innerHTML = '';
    } else {
      emptyEl.classList.add('hidden');
      listEl.classList.remove('hidden');
      listEl.innerHTML = sessionList.map(function (s) {
        var sessionTotal = s.items.reduce(function (a, i) { return a + i.cost; }, 0);
        var head = '<div class="lib-session-head">' +
                     '<span class="lib-session-title">Sesión · ' + escapeHtml(formatSessionTitle(s.start)) + '</span>' +
                     '<span class="lib-session-sub">' + s.items.length + ' audio' + (s.items.length === 1 ? '' : 's') +
                       ' · ' + escapeHtml(formatCLP(sessionTotal)) + '</span>' +
                   '</div>';
        var rows = s.items.map(function (i) {
          var sel = libSelected[i.id] ? ' selected' : '';
          return '<div class="lib-item' + sel + '" data-id="' + escapeHtml(i.id) + '" role="button" tabindex="0" aria-pressed="' + (libSelected[i.id] ? 'true' : 'false') + '">' +
                   '<span class="lib-checkbox" aria-hidden="true"></span>' +
                   '<span class="lib-name">' + escapeHtml(i.name) + statusBadges(i) + '</span>' +
                   '<span class="lib-size">' + escapeHtml(formatBytes(i.size)) + '</span>' +
                   '<span class="lib-price">' + escapeHtml(formatCLP(i.cost)) + '</span>' +
                   '<span class="lib-format">' + escapeHtml(i.format) + '</span>' +
                   '<button class="lib-del" type="button" data-del="' + escapeHtml(i.id) + '" aria-label="Eliminar">×</button>' +
                 '</div>';
        }).join('');
        return '<div class="lib-session" data-session-id="' + escapeHtml(s.id) + '">' + head + rows + '</div>';
      }).join('');

      listEl.querySelectorAll('.lib-item').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          if (ev.target && ev.target.classList && ev.target.classList.contains('lib-del')) return;
          toggleSelect(el.dataset.id, el);
        });
        el.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleSelect(el.dataset.id, el); }
        });
      });
      listEl.querySelectorAll('.lib-del').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var id = btn.dataset.del;
          if (!id) return;
          if (!confirm('¿Eliminar este audio de la carpeta?')) return;
          libDelete(id).then(function () {
            libCache = libCache.filter(function (x) { return x.id !== id; });
            delete libSelected[id];
            renderLibrary();
          });
        });
      });
    }

    refreshLibPayBar();
  }

  function toggleSelect(id, el) {
    if (libSelected[id]) { delete libSelected[id]; el.classList.remove('selected'); el.setAttribute('aria-pressed', 'false'); }
    else                 { libSelected[id] = true;  el.classList.add('selected');    el.setAttribute('aria-pressed', 'true');  }
    refreshLibPayBar();
  }

  function refreshLibPayBar() {
    var selectedItems = libCache.filter(function (i) { return libSelected[i.id]; });
    var total = selectedItems.reduce(function (s, i) { return s + i.cost; }, 0);
    var amount = formatCLP(total);
    document.getElementById('libPayAmount').textContent = amount;
    var sub = document.getElementById('libPaySub');
    sub.classList.remove('ok', 'err');
    sub.textContent = selectedItems.length + ' audio' + (selectedItems.length === 1 ? '' : 's') + ' seleccionado' + (selectedItems.length === 1 ? '' : 's');
    var btn = document.getElementById('libPayBtn');
    btn.textContent = 'Pagar: ' + amount;
    btn.disabled = selectedItems.length === 0;
  }

  /* ── Receipt ── */

  function openReceipt(items) {
    if (!items.length) return;
    var total = items.reduce(function (s, i) { return s + i.cost; }, 0);
    var docNo = 'KR-' + Date.now();
    var dt = new Date().toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'medium' });
    var rows = items.map(function (i) {
      return '<tr><td>' + escapeHtml(i.name) + '</td><td class="mono">' + formatDuration(i.duration) + '</td><td class="mono right">' + formatCLP(i.cost) + '</td></tr>';
    }).join('');
    var html = '<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Boleta ' + docNo + '<\/title>' +
      "<style>@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@900&family=Inter+Tight:wght@400;800&family=JetBrains+Mono:wght@400&display=swap');" +
      "*{box-sizing:border-box}body{margin:0;padding:48px;background:#fff;color:#000;font-family:'Inter Tight',system-ui,sans-serif;position:relative}" +
      "h1{font-family:'Fraunces',serif;font-weight:900;font-size:48px;letter-spacing:-0.04em;margin:0}" +
      ".meta{margin-top:24px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase}" +
      "table{width:100%;border-collapse:collapse;margin-top:32px;border-top:1px solid #000;border-bottom:1px solid #000}" +
      "th,td{padding:12px 8px;text-align:left;border-bottom:1px solid #000;font-size:13px}tr:last-child td{border-bottom:none}" +
      "th{font-size:10px;text-transform:uppercase;letter-spacing:.3em;font-weight:800}" +
      ".mono{font-family:'JetBrains Mono',monospace;font-size:12px}.right{text-align:right}" +
      ".total{margin-top:24px;display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #000;padding-top:16px}" +
      ".total span:first-child{font-size:10px;text-transform:uppercase;letter-spacing:.4em}" +
      ".total span:last-child{font-family:'JetBrains Mono',monospace;font-size:20px}" +
      ".note{margin-top:16px;font-size:11px;text-transform:uppercase;letter-spacing:.2em;opacity:.7}" +
      ".stamp{position:absolute;top:120px;right:60px;border:2px solid #000;padding:12px 28px;font-family:'Fraunces',serif;font-weight:900;font-size:36px;letter-spacing:.1em;transform:rotate(-14deg);opacity:.85}" +
      "button{margin-top:32px;border:1px solid #000;background:#fff;color:#000;padding:12px 24px;font-family:'Inter Tight',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.3em;cursor:pointer}" +
      "button:hover{background:#000;color:#fff}@media print{button{display:none}}<\/style><\/head><body>" +
      '<h1>KRATEROI<\/h1><div class="stamp">Pagado<\/div>' +
      '<div class="meta">Boleta &middot; ' + docNo + '<br/>' + dt + '<\/div>' +
      '<table><thead><tr><th>Audio<\/th><th>Duración<\/th><th class="right">Costo<\/th><\/tr><\/thead><tbody>' + rows + '<\/tbody><\/table>' +
      '<div class="note">Tarifa aplicada: $10 CLP por minuto (calculado por segundo)<\/div>' +
      '<div class="total"><span>Total cobrado<\/span><span>' + formatCLP(total) + '<\/span><\/div>' +
      '<button onclick="window.print()">Imprimir<\/button><\/body><\/html>';
    var w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  }

  /* ── Connection status + retry ── */

  function setConnStatus(state, text) {
    var el = document.getElementById('libConnStatus');
    if (!el) return;
    el.classList.remove('ok', 'bad', 'pending');
    if (state) el.classList.add(state);
    el.textContent = text;
  }

  // Returns a resolved Promise<false> immediately when on a public host,
  // avoiding any loopback request that the browser would block anyway.
  function probeDashboard() {
    if (IS_PUBLIC_HOST) return Promise.resolve(false);
    return fetch(DASH_URL + '/info', { method: 'GET', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (j) {
        var pending = libCache.filter(function (i) { return i.pendingUpload && !i.uploadedAt; }).length;
        var label = j && j.dashboard_open === false
          ? 'Servidor en escucha (dashboard cerrado)'
          : 'Conectado al dashboard';
        if (pending > 0) label += ' · ' + pending + ' por enviar';
        setConnStatus('ok', label);
        return true;
      })
      .catch(function () {
        var pending = libCache.filter(function (i) { return i.pendingUpload && !i.uploadedAt; }).length;
        var label = 'Sin conexión — abre el dashboard o ejecuta queue_server.py';
        if (pending > 0) label += ' · ' + pending + ' en cola';
        setConnStatus('bad', label);
        return false;
      });
  }

  function uploadOne(item) {
    var fd = new FormData();
    var file = new File([item.blob], item.name,
                        { type: item.mime || (item.blob && item.blob.type) || 'application/octet-stream' });
    fd.append('file', file);
    fd.append('curso',   'Krateroi');
    fd.append('carrera', 'Web');
    return fetch(DASH_URL + '/upload', { method: 'POST', body: fd })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; })
          .then(function (j) {
            if (!r.ok || !j.ok) throw new Error(j && j.error ? j.error : ('HTTP ' + r.status));
            return j;
          });
      });
  }

  var _retryInFlight = false;
  function retryPendingUploads() {
    if (IS_PUBLIC_HOST) return Promise.resolve();
    if (_retryInFlight) return Promise.resolve();
    var pending = libCache.filter(function (i) { return i.pendingUpload && !i.uploadedAt; });
    if (!pending.length) return Promise.resolve();
    _retryInFlight = true;
    setConnStatus('pending', 'Enviando ' + pending.length + ' audio' + (pending.length === 1 ? '' : 's') + '…');

    var p = Promise.resolve();
    var sent = 0, failed = 0, lastErr = '';
    pending.forEach(function (item) {
      p = p.then(function () {
        return uploadOne(item)
          .then(function () {
            sent++;
            return libUpdate(item.id, { pendingUpload: false, uploadedAt: Date.now(), uploadError: null });
          })
          .catch(function (err) {
            failed++;
            lastErr = err.message;
            return libUpdate(item.id, { uploadError: err.message });
          });
      });
    });
    return p.then(function () {
      _retryInFlight = false;
      renderLibrary();
      if (failed === 0) {
        setConnStatus('ok', sent + ' audio' + (sent === 1 ? '' : 's') + ' enviado' + (sent === 1 ? '' : 's'));
      } else if (sent > 0) {
        setConnStatus('pending', sent + ' enviado(s) · ' + failed + ' aún en cola');
      } else {
        setConnStatus('bad', 'Sin conexión (' + lastErr + ') — reintentando');
      }
    });
  }

  document.getElementById('libPayBtn').addEventListener('click', function () {
    var selectedItems = libCache.filter(function (i) { return libSelected[i.id]; });
    if (!selectedItems.length) return;

    var btn = document.getElementById('libPayBtn');
    btn.disabled = true;
    var originalLabel = btn.textContent;
    btn.textContent = 'Procesando…';

    var newlyPaid = selectedItems.filter(function (i) { return !i.paidAt; });
    var ts = Date.now();

    var ops = selectedItems.map(function (i) {
      var patch = {};
      if (!i.paidAt)     patch.paidAt = ts;
      if (!i.uploadedAt) { patch.pendingUpload = true; patch.uploadError = null; }
      return Object.keys(patch).length ? libUpdate(i.id, patch) : Promise.resolve();
    });

    Promise.all(ops).then(function () {
      if (newlyPaid.length) openReceipt(newlyPaid);
      libSelected = {};
      renderLibrary();
      return retryPendingUploads();
    }).then(function () {
      btn.disabled = false;
      btn.textContent = originalLabel;
      refreshLibPayBar();
    });
  });

  document.getElementById('libRetryBtn').addEventListener('click', function () {
    if (IS_PUBLIC_HOST) return; // no-op on public host
    probeDashboard().then(function (online) {
      if (online) retryPendingUploads();
    });
  });

  /* ── INIT ── */

  function migrate(item) {
    if (typeof item.pendingUpload === 'undefined') item.pendingUpload = false;
    if (typeof item.uploadedAt === 'undefined') item.uploadedAt = null;
    if (typeof item.paidAt === 'undefined')     item.paidAt = null;
    return item;
  }

  // When running on a public host the dashboard is unreachable by design.
  // Show a static informational status instead of attempting (and failing)
  // any network request to the loopback address.
  if (IS_PUBLIC_HOST) {
    setConnStatus('bad', 'Dashboard no disponible en hosting público — usa la app desde localhost');
  } else {
    setConnStatus('pending', 'Comprobando conexión…');
  }

  libGetAll().then(function (items) {
    libCache = (items || []).map(migrate);
    renderLibrary();
    if (!IS_PUBLIC_HOST) {
      return probeDashboard().then(function (online) {
        if (online) retryPendingUploads();
      });
    }
  }).catch(function (err) {
    console.warn('[krateroi] failed to load library:', err);
  });

  // Periodic pump — only runs when connected to localhost.
  if (!IS_PUBLIC_HOST) {
    window.setInterval(function () {
      if (document.hidden) return;
      probeDashboard().then(function (online) {
        if (online) retryPendingUploads();
      });
    }, RETRY_INTERVAL_MS);

    function flushNow() {
      probeDashboard().then(function (online) {
        if (online) retryPendingUploads();
      });
    }
    window.addEventListener('focus', flushNow);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) flushNow();
    });
  }
})();
