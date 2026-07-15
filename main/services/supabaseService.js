// =============================================================================
// main/services/supabaseService.js — خدمة المزامنة السحابية (Supabase)
// - Write path: every SQLite write attempts an immediate Supabase upsert.
//     success -> stamp checks.synced_at; fail -> the caller already queued it.
// - Queue processor: node-cron every 5 minutes drains sync_queue FIFO,
//   retrying each item up to 3 times; after 3 fails -> status='failed' + tray note.
// - Conflict resolution: last-write-wins by updated_at (only upsert if newer).
// Uses the anon key only. All failures are swallowed so the UI never crashes.
// =============================================================================

const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const imageService = require('./imageService');

// Electron 32 bundles Node 20, which has no global WebSocket. @supabase/realtime-js
// needs one at construction, so polyfill it with `ws`. We don't use realtime.
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    globalThis.WebSocket = require('ws');
  } catch {
    /* ws not installed — realtime stays unavailable, REST still works */
  }
}

let client = null;
let cronTask = null;

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function getClient() {
  if (!isConfigured()) return null;
  if (!client) {
    try {
      client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 1 } },
      });
    } catch (err) {
      console.warn('[supabase] client init failed:', err.message);
      return null;
    }
  }
  return client;
}

async function isOnline() {
  const c = getClient();
  if (!c) return false;
  try {
    // Lightweight HEAD-ish query; a network error means offline.
    const { error } = await c.from('settings').select('key', { count: 'exact', head: true });
    return !error;
  } catch {
    return false;
  }
}

// Best-effort single upsert used on the write path.
async function tryUpsert(table, record) {
  const c = getClient();
  if (!c) return { ok: false, offline: true };
  try {
    const payload = normalizeForCloud(table, record);
    const { error } = await c.from(table).upsert(payload, { onConflict: primaryKey(table) });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function primaryKey(table) {
  if (table === 'settings') return 'key';
  return 'id';
}

// SQLite stores booleans as 0/1; Postgres wants true/false.
// Also strip JOIN-computed columns that don't exist in the cloud table.
function normalizeForCloud(table, record) {
  const r = { ...record };
  if (table === 'checks') {
    r.is_deleted = !!r.is_deleted;
    delete r.bank_name_ar;
    delete r.bank_name_en;
  }
  if (table === 'templates') {
    r.is_default = !!r.is_default;
    delete r.fields; // fields are in template_fields, not templates
  }
  if (table === 'template_fields') {
    r.visible = !!r.visible;
  }
  if (table === 'print_history') {
    r.crossed = !!r.crossed;
  }
  if (table === 'banks') {
    // print_template is a JSON string — keep as-is
  }
  return r;
}

// Drain the sync_queue FIFO. Returns a summary.
async function drainQueue(ctx) {
  const { db } = ctx;
  const database = db.getDb();
  const c = getClient();
  if (!c) return { drained: 0, failed: 0, offline: true };

  const online = await isOnline();
  if (!online) return { drained: 0, failed: 0, offline: true };

  const items = database
    .prepare(`SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 200`)
    .all();

  let drained = 0;
  let failed = 0;

  for (const item of items) {
    let payload;
    try {
      payload = JSON.parse(item.payload || '{}');
    } catch {
      payload = {};
    }

    // Conflict resolution: only upsert when local is newer than cloud.
    let shouldWrite = true;
    if (item.operation === 'upsert' && payload.updated_at && item.table_name !== 'settings') {
      try {
        const { data: cloudRows } = await c
          .from(item.table_name)
          .select('updated_at')
          .eq(primaryKey(item.table_name), item.record_id)
          .limit(1);
        const cloud = cloudRows && cloudRows[0];
        if (cloud && cloud.updated_at && new Date(cloud.updated_at) > new Date(payload.updated_at)) {
          shouldWrite = false; // cloud is newer -> skip (last-write-wins)
        }
      } catch {
        // ignore — proceed to write
      }
    }

    let ok = true;
    let errMsg = null;
    if (shouldWrite) {
      try {
        if (item.operation === 'delete') {
          const { error } = await c
            .from(item.table_name)
            .delete()
            .eq(primaryKey(item.table_name), item.record_id);
          if (error) throw new Error(error.message);
        } else {
          // إذا كان السجل يحتوي على مسار صورة، ارفع الصورة أولاً
          if (payload.image_path) {
            await imageService.uploadToSupabase(payload.image_path, c);
          }

          const { error } = await c
            .from(item.table_name)
            .upsert(normalizeForCloud(item.table_name, payload), {
              onConflict: primaryKey(item.table_name),
            });
          if (error) throw new Error(error.message);
        }
      } catch (err) {
        ok = false;
        errMsg = err.message;
      }
    }

    if (ok) {
      database.prepare('DELETE FROM sync_queue WHERE id = ?').run(item.id);
      if (item.table_name === 'checks') {
        database.prepare('UPDATE checks SET synced_at = ? WHERE id = ?').run(db.nowISO(), item.record_id);
      }
      drained += 1;
    } else {
      const attempts = item.attempts + 1;
      if (attempts >= 3) {
        database
          .prepare(`UPDATE sync_queue SET status='failed', attempts=?, last_error=?, updated_at=? WHERE id=?`)
          .run(attempts, errMsg, db.nowISO(), item.id);
        failed += 1;
        notifyFailure(ctx, errMsg);
      } else {
        database
          .prepare(`UPDATE sync_queue SET attempts=?, last_error=?, updated_at=? WHERE id=?`)
          .run(attempts, errMsg, db.nowISO(), item.id);
      }
    }
  }

  if (drained > 0) {
    db.setSetting('last_sync_at', db.nowISO());
    db.audit('sync', 'completed', null, { drained, failed });
  }
  return { drained, failed, offline: false };
}

function notifyFailure(ctx, message) {
  try {
    const win = ctx.getMainWindow && ctx.getMainWindow();
    if (win) win.webContents.send('sync:error', { message });
  } catch {
    /* ignore */
  }
}

// Reconnect detection — polls every 30s; on transition offline→online, drain immediately.
let _wasOnline = false;
let _reconnectTimer = null;

async function startReconnectWatcher(ctx) {
  if (_reconnectTimer) return;
  _reconnectTimer = setInterval(async () => {
    const now = await isOnline();
    if (now && !_wasOnline) {
      console.log('[supabase] connection restored — draining/pulling...');
      drainQueue(ctx)
        .then(() => pullSync(ctx))
        .catch(() => {});
    }
    _wasOnline = now;
  }, 30_000); // every 30 seconds
}

function startQueueProcessor(ctx) {
  if (!isConfigured()) {
    console.warn('[supabase] not configured — sync disabled');
    return;
  }
  if (cronTask) return;
  // Every 5 minutes (offline-first: drain and pull are silent no-ops when offline).
  cronTask = cron.schedule('*/5 * * * *', () => {
    drainQueue(ctx)
      .then(() => pullSync(ctx))
      .catch((err) => console.error('[supabase] sync failed:', err.message));
  });
  // Kick once shortly after startup (attempt immediate sync if online).
  setTimeout(() => {
    drainQueue(ctx)
      .then(() => pullSync(ctx))
      .catch(() => {});
  }, 5000);
  // Watch for reconnect events and drain/pull immediately on reconnect.
  startReconnectWatcher(ctx);
}

// -----------------------------------------------------------------------------
// Two-Way Sync: Pull changes from Supabase to SQLite
// -----------------------------------------------------------------------------
async function pullSync(ctx) {
  const { db } = ctx;
  const database = db.getDb();
  const c = getClient();
  if (!c) return { pulled: 0, offline: true };

  const online = await isOnline();
  if (!online) return { pulled: 0, offline: true };

  const lastPull = db.getSetting('last_pull_sync_at') || '2000-01-01T00:00:00.000Z';
  const newPullTime = db.nowISO();
  let pulled = 0;

  const tables = [
    { name: 'settings', pk: 'key' },
    { name: 'banks', pk: 'id' },
    { name: 'templates', pk: 'id' },
    { name: 'checks', pk: 'id' },
    { name: 'incoming_checks', pk: 'id' }
  ];

  let updatedTemplateIds = [];

  for (const t of tables) {
    try {
      const { data, error } = await c
        .from(t.name)
        .select('*')
        .gt('updated_at', lastPull)
        .order('updated_at', { ascending: true });

      if (error || !data || data.length === 0) continue;

      database.transaction(() => {
        for (const row of data) {
          if (t.name === 'templates') updatedTemplateIds.push(row.id);
          
          if (row.image_path) {
            // نُحمل الصورة في الخلفية لتسريع عملية الكتابة بقاعدة البيانات
            imageService.downloadFromSupabase(row.image_path, c).catch(e => console.error(e));
          }

          const cols = Object.keys(row);
          const vals = Object.values(row);
          const placeholders = cols.map(() => '?').join(',');
          const updates = cols.map(c => `${c}=excluded.${c}`).join(',');

          // Boolean conversion for SQLite (1 or 0)
          const cleanVals = vals.map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v);

          database.prepare(
            `INSERT INTO ${t.name} (${cols.join(',')}) VALUES (${placeholders})
             ON CONFLICT(${t.pk}) DO UPDATE SET ${updates}`
          ).run(...cleanVals);
          
          pulled++;
        }
      })();
    } catch (err) {
      console.error(`[supabase] pullSync error on ${t.name}:`, err.message);
    }
  }

  // Pull template_fields for updated templates
  if (updatedTemplateIds.length > 0) {
    try {
      const { data, error } = await c
        .from('template_fields')
        .select('*')
        .in('template_id', updatedTemplateIds);

      if (!error && data && data.length > 0) {
        database.transaction(() => {
          for (const tid of updatedTemplateIds) {
             database.prepare('DELETE FROM template_fields WHERE template_id = ?').run(tid);
          }
          for (const row of data) {
            const cols = Object.keys(row);
            const vals = Object.values(row);
            const placeholders = cols.map(() => '?').join(',');
            
            const cleanVals = vals.map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v);
            database.prepare(
              `INSERT INTO template_fields (${cols.join(',')}) VALUES (${placeholders})`
            ).run(...cleanVals);
            pulled++;
          }
        })();
      }
    } catch (err) {
      console.error('[supabase] pullSync error on template_fields:', err.message);
    }
  }

  if (pulled > 0) {
    db.setSetting('last_pull_sync_at', newPullTime);
    db.audit('sync', 'imported', null, { pulled });
    const win = ctx.getMainWindow && ctx.getMainWindow();
    if (win) win.webContents.send('sync:pulled', { pulled });
  } else {
    db.setSetting('last_pull_sync_at', newPullTime);
  }

  return { pulled, offline: false };
}


module.exports = {
  isConfigured,
  isOnline,
  getClient,
  tryUpsert,
  drainQueue,
  pullSync,
  startQueueProcessor,
};
