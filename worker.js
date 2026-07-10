const DEFAULT_SETTINGS = {
  id: 'default',
  language: 'Spanish',
  voice: '',
  speed: 1,
  subject: 'Historical Events',
  level: 'A1 (Beginner)',
  vocab_words_count: 3,
  vocabulary_mix: 50,
  quiz_option_count: 8,
  listening_new_learning_percent: 85,
  listening_batch_size: 8,
  listening_playback_speed: 1,
  listening_repetitions: 1,
  listening_gap_seconds: 1.5,
  listening_autoplay_phrase_limit: 10,
  listening_show_sentence: 0,
  listening_random_order: 1,
  new_to_learning_seen_threshold: 3,
  learning_to_known_success_threshold: 5
};

const IMAGE_MODEL = 'gpt-image-1-mini';
const IMAGE_SIZE = '1024x1024';
const IMAGE_QUALITY = 'low';

const LANGUAGE_PREFIX = {
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  English: 'en'
};

const FREE_FRENCH_VOICES = new Map([
  ['CwhRBWXzGAHq8TQ4Fs17', 'Roger'],
  ['EXAVITQu4vr4xnSDxMaL', 'Sarah'],
  ['FGY2WhTYpPnrIDTdsKH5', 'Laura'],
  ['JBFqnCBsd6RMkjVDRZzb', 'George'],
  ['N2lVS1w4EtoT3dr4eOWO', 'Callum'],
  ['SAz9YHcvj6GT2YYXdXww', 'River'],
  ['Xb7hH8MSUJpSbSDYk0k2', 'Alice'],
  ['XrExE9yKIg1WjnnlVkGX', 'Matilda'],
  ['bIHbv24MWmeRgasZH58o', 'Will'],
  ['cgSgspJ2msm6clMCkdW9', 'Jessica'],
  ['cjVigY5qzO86Huf0OWal', 'Eric'],
  ['iP95p4xoKVk53GoZ742B', 'Chris']
]);
const ELEVENLABS_FREE_FLASH_CONCURRENCY = 4;

let schemaReady = null;
let examplesCleanupReady = null;
let notesCleanupReady = null;

export default {
  async fetch(request, env, ctx) {
    try {
      if (!schemaReady) {
        schemaReady = ensureSchema(env);
      }
      await schemaReady;
      if (!examplesCleanupReady) {
        examplesCleanupReady = normalizeExistingExamples(env.DB);
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(examplesCleanupReady.catch(() => {}));
        }
      }
      if (!notesCleanupReady) {
        notesCleanupReady = normalizeExistingVocabularyNotes(env.DB);
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(notesCleanupReady.catch(() => {}));
        }
      }

      const url = new URL(request.url);

      if (url.pathname === '/' && request.method === 'GET') {
        return new Response(await renderPage(env), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store'
          }
        });
      }

      if (url.pathname === '/api/health') {
        return json({ ok: true });
      }

      if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
        const [settings, vocabulary, history] = await Promise.all([
          getSettings(env.DB),
          listVocabulary(env.DB),
          listHistory(env.DB)
        ]);
        return json({ settings, vocabulary, history });
      }

      if (url.pathname === '/api/listening-sentences' && request.method === 'GET') {
        const language = url.searchParams.get('language') || (await getSettings(env.DB)).language;
        const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
        return json({ sentences: await listListeningSentences(env.DB, language, limit) });
      }

      if (url.pathname === '/api/listening-sentences/batch' && request.method === 'POST') {
        const body = await request.json();
        return json(await generateListeningBatch(env, body), 201);
      }

      if (/^\/api\/listening-sentences\/[^/]+\/translation$/.test(url.pathname) && request.method === 'POST') {
        const parts = url.pathname.split('/');
        const id = decodeURIComponent(parts[3] || '');
        return json({ sentence: await translateListeningSentence(env, id) });
      }

      if (/^\/api\/listening-sentences\/[^/]+\/listened$/.test(url.pathname) && request.method === 'POST') {
        const parts = url.pathname.split('/');
        const id = decodeURIComponent(parts[3] || '');
        return json({ listenCount: await recordListeningCompletion(env.DB, id) });
      }

      if (/^\/api\/listening-sentences\/[^/]+$/.test(url.pathname) && request.method === 'DELETE') {
        const id = decodeURIComponent(url.pathname.split('/').pop() || '');
        await deleteListeningSentence(env, id);
        return json({ ok: true });
      }

      if (url.pathname.startsWith('/api/listening-audio/') && request.method === 'GET') {
        const id = decodeURIComponent(url.pathname.split('/').pop() || '');
        return serveListeningAudio(env, id);
      }

      if (url.pathname === '/api/settings') {
        if (request.method === 'GET') {
          return json({ settings: await getSettings(env.DB) });
        }
        if (request.method === 'PUT') {
          const body = await request.json();
          const settings = await saveSettings(env.DB, body);
          return json({ settings });
        }
      }

      if (url.pathname === '/api/vocabulary' && request.method === 'GET') {
        const filter = url.searchParams.get('filter') || 'all';
        const language = url.searchParams.get('language') || '';
        return json({ vocabulary: await listVocabulary(env.DB, { filter, language }) });
      }

      if (url.pathname === '/api/vocabulary' && request.method === 'POST') {
        const body = await request.json();
        const result = await upsertVocabularyWord(env, body);
        return json(result);
      }

      if (url.pathname.startsWith('/api/vocabulary/') && request.method === 'PATCH') {
        const id = decodeURIComponent(url.pathname.split('/').pop());
        const body = await request.json();
        const item = await updateVocabulary(env.DB, id, body);
        return json({ item });
      }

      if (url.pathname.startsWith('/api/vocabulary/') && request.method === 'DELETE') {
        const id = decodeURIComponent(url.pathname.split('/').pop());
        await env.DB.prepare('DELETE FROM vocabulary WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }

      if (url.pathname === '/api/text-vocabulary' && request.method === 'POST') {
        const body = await request.json();
        const result = await addTextToVocabulary(env, body.text || '');
        return json(result);
      }

      if (url.pathname === '/api/translate' && request.method === 'POST') {
        const body = await request.json();
        const result = await generateVocabularyNote(env, body);
        return json(result);
      }

      if (url.pathname === '/api/examples' && request.method === 'POST') {
        const body = await request.json();
        const result = await generateVocabularyExamples(env, body);
        return json(result);
      }

      if (url.pathname === '/api/context' && request.method === 'POST') {
        const body = await request.json();
        const result = await generateVocabularyContext(env, body);
        return json(result);
      }

      if (url.pathname === '/api/image' && request.method === 'POST') {
        const body = await request.json();
        const result = await generateVocabularyImage(env, body, ctx);
        return json(result);
      }

      if (url.pathname.startsWith('/api/image-file/') && request.method === 'GET') {
        const jobId = decodeURIComponent(url.pathname.split('/').pop() || '');
        return serveGeneratedImage(env, jobId);
      }

      if (url.pathname === '/api/generate-text' && request.method === 'POST') {
        const body = await request.json();
        const result = await generateText(env, body.topic || '', body.vocabularyMode || 'more-new');
        const historyItem = await insertHistory(env.DB, result.text);
        return json({ text: result.text, selectedWords: result.selectedWords, historyItem });
      }

      if (url.pathname === '/api/related-topics' && request.method === 'POST') {
        const body = await request.json();
        const topics = await generateRelatedTopics(env, body.text || '');
        return json({ topics });
      }

      if (url.pathname === '/api/quiz-question' && request.method === 'POST') {
        const body = await request.json();
        return json(await generateQuizQuestion(env, body));
      }

      if (url.pathname === '/api/history' && request.method === 'GET') {
        return json({ history: await listHistory(env.DB) });
      }

      if (url.pathname === '/api/history' && request.method === 'POST') {
        const body = await request.json();
        const historyItem = await insertHistory(env.DB, body.text || '', body.relatedTopics || []);
        return json({ historyItem });
      }

      if (url.pathname.startsWith('/api/history/') && request.method === 'PATCH') {
        const id = decodeURIComponent(url.pathname.split('/').pop());
        const body = await request.json();
        const historyItem = await updateHistory(env.DB, id, body);
        return json({ historyItem });
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        Number(error && error.status) || 500
      );
    }
  }
};

async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY CHECK (id = 'default'),
      language TEXT NOT NULL DEFAULT 'Spanish',
      voice TEXT NOT NULL DEFAULT '',
      speed REAL NOT NULL DEFAULT 1,
      subject TEXT NOT NULL DEFAULT 'Historical Events',
      level TEXT NOT NULL DEFAULT 'A1 (Beginner)',
      vocab_words_count INTEGER NOT NULL DEFAULT 3,
      vocabulary_mix INTEGER NOT NULL DEFAULT 50,
      quiz_option_count INTEGER NOT NULL DEFAULT 8,
      listening_new_learning_percent INTEGER NOT NULL DEFAULT 85,
      listening_batch_size INTEGER NOT NULL DEFAULT 8,
      listening_playback_speed REAL NOT NULL DEFAULT 1,
      listening_repetitions INTEGER NOT NULL DEFAULT 1,
      listening_gap_seconds REAL NOT NULL DEFAULT 1.5,
      listening_autoplay_phrase_limit INTEGER NOT NULL DEFAULT 10,
      listening_show_sentence INTEGER NOT NULL DEFAULT 0,
      listening_random_order INTEGER NOT NULL DEFAULT 1,
      new_to_learning_seen_threshold INTEGER NOT NULL DEFAULT 3,
      learning_to_known_success_threshold INTEGER NOT NULL DEFAULT 5,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS vocabulary (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL UNIQUE,
      mastery TEXT NOT NULL DEFAULT 'new',
      occurrences INTEGER NOT NULL DEFAULT 1,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      contexts_json TEXT NOT NULL DEFAULT '[]',
      forms_json TEXT NOT NULL DEFAULT '[]',
      target_language TEXT NOT NULL DEFAULT 'Spanish',
      translation TEXT NOT NULL DEFAULT '',
      listen_count INTEGER NOT NULL DEFAULT 0,
      mnemonic TEXT NOT NULL DEFAULT '',
      image_json TEXT NOT NULL DEFAULT '{}',
      review_seen_count INTEGER NOT NULL DEFAULT 0,
      review_success_count INTEGER NOT NULL DEFAULT 0,
      examples_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS listening_sentences (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      language TEXT NOT NULL,
      text TEXT NOT NULL,
      vocabulary_json TEXT NOT NULL DEFAULT '[]',
      voice_id TEXT NOT NULL,
      voice_name TEXT NOT NULL DEFAULT '',
      translation TEXT NOT NULL DEFAULT '',
      audio_r2_key TEXT NOT NULL,
      audio_content_type TEXT NOT NULL DEFAULT 'audio/mpeg',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS elevenlabs_voice_cache (
      language TEXT PRIMARY KEY,
      voices_json TEXT NOT NULL DEFAULT '[]',
      refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_listening_sentences_language_created_at ON listening_sentences (language, created_at)'
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      related_topics_json TEXT NOT NULL DEFAULT '[]',
      show_topics INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS image_jobs (
      id TEXT PRIMARY KEY,
      vocabulary_id TEXT NOT NULL,
      word TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      prompt_json TEXT NOT NULL DEFAULT '{}',
      prompt_text TEXT NOT NULL DEFAULT '',
      r2_key TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT NOT NULL DEFAULT '',
      finished_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  await env.DB.prepare('INSERT OR IGNORE INTO settings (id) VALUES (\'default\')').run();
  await ensureColumn(env.DB, 'vocabulary', 'examples_json', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(env.DB, 'vocabulary', 'mnemonic', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(env.DB, 'vocabulary', 'image_json', "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn(env.DB, 'vocabulary', 'review_seen_count', "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env.DB, 'vocabulary', 'review_success_count', "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env.DB, 'settings', 'new_to_learning_seen_threshold', 'INTEGER NOT NULL DEFAULT 3');
  await ensureColumn(env.DB, 'settings', 'learning_to_known_success_threshold', 'INTEGER NOT NULL DEFAULT 5');
  await ensureColumn(env.DB, 'settings', 'vocabulary_mix', 'INTEGER NOT NULL DEFAULT 50');
  await ensureColumn(env.DB, 'settings', 'quiz_option_count', 'INTEGER NOT NULL DEFAULT 8');
  await ensureColumn(env.DB, 'settings', 'listening_new_learning_percent', 'INTEGER NOT NULL DEFAULT 85');
  await ensureColumn(env.DB, 'settings', 'listening_batch_size', 'INTEGER NOT NULL DEFAULT 8');
  await ensureColumn(env.DB, 'settings', 'listening_playback_speed', 'REAL NOT NULL DEFAULT 1');
  await ensureColumn(env.DB, 'settings', 'listening_repetitions', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(env.DB, 'settings', 'listening_gap_seconds', 'REAL NOT NULL DEFAULT 1.5');
  await ensureColumn(env.DB, 'settings', 'listening_autoplay_phrase_limit', 'INTEGER NOT NULL DEFAULT 10');
  await ensureColumn(env.DB, 'settings', 'listening_show_sentence', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(env.DB, 'settings', 'listening_random_order', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(env.DB, 'listening_sentences', 'translation', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(env.DB, 'listening_sentences', 'listen_count', 'INTEGER NOT NULL DEFAULT 0');
}

async function ensureColumn(db, table, column, definition) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all();
  const columns = Array.isArray(info.results) ? info.results : [];
  if (!columns.some((row) => row.name === column)) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

async function getSettings(db) {
  const row = await db.prepare('SELECT * FROM settings WHERE id = ?').bind('default').first();
  return row ? normalizeSettings(row) : DEFAULT_SETTINGS;
}

async function saveSettings(db, input) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(await getSettings(db)),
    ...input,
    id: 'default'
  };

  await db
    .prepare(
      `UPDATE settings
       SET language = ?,
           voice = ?,
           speed = ?,
           subject = ?,
           level = ?,
           vocab_words_count = ?,
           vocabulary_mix = ?,
           quiz_option_count = ?,
           listening_new_learning_percent = ?,
           listening_batch_size = ?,
           listening_playback_speed = ?,
           listening_repetitions = ?,
           listening_gap_seconds = ?,
           listening_autoplay_phrase_limit = ?,
           listening_show_sentence = ?,
           listening_random_order = ?,
           new_to_learning_seen_threshold = ?,
           learning_to_known_success_threshold = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 'default'`
    )
    .bind(
      merged.language,
      merged.voice,
      Number(merged.speed) || 1,
      merged.subject,
      merged.level,
      Number(merged.vocab_words_count) || 0,
      clampPercentage(merged.vocabulary_mix),
      clampQuizOptionCount(merged.quiz_option_count),
      clampPercentage(merged.listening_new_learning_percent),
      Math.min(12, Math.max(3, Number(merged.listening_batch_size) || 8)),
      Math.min(2, Math.max(0.5, Number(merged.listening_playback_speed) || 1)),
      Math.min(10, Math.max(1, Number(merged.listening_repetitions) || 1)),
      Math.min(10, Math.max(0, Number(merged.listening_gap_seconds) || 0)),
      Math.min(100, Math.max(1, Number(merged.listening_autoplay_phrase_limit) || 10)),
      merged.listening_show_sentence ? 1 : 0,
      merged.listening_random_order === false || merged.listening_random_order === 0 ? 0 : 1,
      Number(merged.new_to_learning_seen_threshold) || 3,
      Number(merged.learning_to_known_success_threshold) || 5
    )
    .run();

  return merged;
}

async function listVocabulary(db, { filter = 'all', language = '' } = {}) {
  const rows = await db.prepare('SELECT * FROM vocabulary ORDER BY datetime(last_seen) DESC').all();
  return (rows.results || [])
    .map(normalizeVocabulary)
    .filter((item) => {
      const matchesFilter = filter === 'all' || item.mastery === filter;
      const matchesLanguage = !language || item.targetLanguage === language;
      return matchesFilter && matchesLanguage;
    });
}

async function upsertVocabularyWord(env, input) {
  const db = env.DB;
  const targetLanguage = input.targetLanguage || (await getSettings(db)).language || 'Spanish';
  const rawWord = String(input.word || '').trim();

  if (!rawWord) {
    throw new Error('Word is required');
  }

  const isPhrase = Boolean(input.mode === 'phrase' || rawWord.split(/\s+/).length > 1);
  const word = isPhrase ? rawWord.toLowerCase() : await lemmatizeWord(env, rawWord, input.context || rawWord);
  const context = String(input.context || '').trim();
  const now = new Date().toISOString();
  const existing = await db.prepare('SELECT * FROM vocabulary WHERE word = ?').bind(word).first();

  if (existing) {
    const contexts = uniqueStrings([
      ...readJson(existing.contexts_json),
      context
    ]);
    const forms = uniqueStrings([
      ...readJson(existing.forms_json),
      rawWord
    ]);

    await db
      .prepare(
        `UPDATE vocabulary
         SET mastery = ?,
             occurrences = ?,
             last_seen = ?,
             contexts_json = ?,
             forms_json = ?,
             target_language = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(
        existing.mastery || 'new',
        Number(existing.occurrences || 0) + 1,
        now,
        JSON.stringify(contexts.slice(0, 20)),
        JSON.stringify(forms.slice(0, 10)),
        targetLanguage,
        now,
        existing.id
      )
      .run();

    return {
      item: normalizeVocabulary({
      ...existing,
      occurrences: Number(existing.occurrences || 0) + 1,
      last_seen: now,
      contexts_json: JSON.stringify(contexts.slice(0, 20)),
      forms_json: JSON.stringify(forms.slice(0, 10)),
      target_language: targetLanguage
      }),
      created: false
    };
  }

  const item = {
    id: crypto.randomUUID(),
    word,
    mastery: 'new',
    occurrences: 1,
    last_seen: now,
    contexts_json: '[]',
    forms_json: JSON.stringify([rawWord]),
    target_language: targetLanguage,
    translation: '',
    mnemonic: '',
    image_json: '{}',
    review_seen_count: 0,
    review_success_count: 0,
    examples_json: '[]',
    created_at: now,
    updated_at: now
  };

  await db
    .prepare(
      `INSERT INTO vocabulary
       (id, word, mastery, occurrences, last_seen, contexts_json, forms_json, target_language, translation, mnemonic, image_json, review_seen_count, review_success_count, examples_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      item.id,
      item.word,
      item.mastery,
      item.occurrences,
      item.last_seen,
      item.contexts_json,
      item.forms_json,
      item.target_language,
      item.translation,
      item.mnemonic,
      item.image_json,
      item.review_seen_count,
      item.review_success_count,
      item.examples_json,
      item.created_at,
      item.updated_at
    )
    .run();

  return {
    item: normalizeVocabulary(item),
    created: true
  };
}

async function updateVocabulary(db, id, input) {
  const existing = await db.prepare('SELECT * FROM vocabulary WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new Error('Vocabulary item not found');
  }

  const next = {
    mastery: input.mastery || existing.mastery,
    target_language: input.targetLanguage || existing.target_language,
    review_seen_count:
      Number.isFinite(Number(input.review_seen_count))
        ? Number(input.review_seen_count)
        : Number(existing.review_seen_count || 0),
    review_success_count:
      Number.isFinite(Number(input.review_success_count))
        ? Number(input.review_success_count)
        : Number(existing.review_success_count || 0),
    translation:
      typeof input.translation === 'string'
        ? input.translation
        : existing.translation,
    mnemonic:
      typeof input.mnemonic === 'string'
        ? input.mnemonic
        : existing.mnemonic || '',
    examples_json:
      typeof input.examples_json === 'string'
        ? input.examples_json
        : existing.examples_json,
    image_json:
      typeof input.image_json === 'string'
        ? input.image_json
        : existing.image_json || '{}',
    contexts_json:
      typeof input.contexts === 'string'
        ? input.contexts
        : existing.contexts_json,
    forms_json:
      typeof input.forms === 'string'
        ? input.forms
        : existing.forms_json
  };

  await db
    .prepare(
      `UPDATE vocabulary
       SET mastery = ?,
           target_language = ?,
           review_seen_count = ?,
           review_success_count = ?,
           translation = ?,
           mnemonic = ?,
           image_json = ?,
           examples_json = ?,
           contexts_json = ?,
           forms_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      next.mastery,
      next.target_language,
      next.review_seen_count,
      next.review_success_count,
      next.translation,
      next.mnemonic,
      next.image_json,
      next.examples_json,
      next.contexts_json,
      next.forms_json,
      id
    )
    .run();

  return normalizeVocabulary({ ...existing, ...next });
}

async function insertHistory(db, text, relatedTopics = []) {
  const item = {
    id: crypto.randomUUID(),
    text: String(text),
    related_topics_json: JSON.stringify(Array.isArray(relatedTopics) ? relatedTopics : []),
    show_topics: 0,
    created_at: new Date().toISOString()
  };

  await db
    .prepare(
      `INSERT INTO history (id, text, related_topics_json, show_topics, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(item.id, item.text, item.related_topics_json, item.show_topics, item.created_at)
    .run();

  return normalizeHistory(item);
}

async function updateHistory(db, id, input) {
  const existing = await db.prepare('SELECT * FROM history WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new Error('History item not found');
  }

  const relatedTopics =
    Array.isArray(input.relatedTopics) ? input.relatedTopics : readJson(existing.related_topics_json);
  const showTopics =
    typeof input.showTopics === 'boolean' ? (input.showTopics ? 1 : 0) : existing.show_topics;

  await db
    .prepare(
      `UPDATE history
       SET text = ?,
           related_topics_json = ?,
           show_topics = ?
       WHERE id = ?`
    )
    .bind(existing.text, JSON.stringify(relatedTopics), showTopics, id)
    .run();

  return normalizeHistory({
    ...existing,
    related_topics_json: JSON.stringify(relatedTopics),
    show_topics: showTopics
  });
}

async function listHistory(db) {
  const rows = await db.prepare('SELECT * FROM history ORDER BY datetime(created_at) ASC').all();
  return (rows.results || []).map(normalizeHistory);
}

async function listListeningSentences(db, language, limit = 40) {
  const rows = await db.prepare(
    `SELECT id, batch_id, language, text, vocabulary_json, voice_id, voice_name, translation, listen_count, audio_content_type, created_at
     FROM listening_sentences
     WHERE language = ?
     ORDER BY datetime(created_at) ASC, rowid ASC
     LIMIT ?`
  ).bind(language, limit).all();
  return (rows.results || []).map(normalizeListeningSentence);
}

async function recordListeningCompletion(db, id) {
  const result = await db.prepare(
    'UPDATE listening_sentences SET listen_count = listen_count + 1 WHERE id = ?'
  ).bind(id).run();
  if (!result.meta || Number(result.meta.changes) < 1) {
    const error = new Error('Listening sentence not found');
    error.status = 404;
    throw error;
  }
  const row = await db.prepare('SELECT listen_count FROM listening_sentences WHERE id = ?').bind(id).first();
  return Number(row && row.listen_count || 0);
}

async function translateListeningSentence(env, id) {
  const row = await env.DB.prepare(
    'SELECT id, language, text, translation FROM listening_sentences WHERE id = ?'
  ).bind(id).first();
  if (!row) {
    const error = new Error('Listening sentence not found');
    error.status = 404;
    throw error;
  }
  if (String(row.translation || '').trim()) {
    return normalizeListeningSentence(row);
  }
  const translation = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 180,
    messages: [
      {
        role: 'system',
        content: 'Translate the supplied sentence into natural, precise English. Return only the translation with no label or commentary.'
      },
      {
        role: 'user',
        content: 'Translate from ' + row.language + ' to English: ' + JSON.stringify(row.text)
      }
    ]
  });
  await env.DB.prepare(
    'UPDATE listening_sentences SET translation = ? WHERE id = ?'
  ).bind(translation, id).run();
  return normalizeListeningSentence({ ...row, translation });
}

async function deleteListeningSentence(env, id) {
  const row = await env.DB.prepare(
    'SELECT audio_r2_key FROM listening_sentences WHERE id = ?'
  ).bind(id).first();
  if (!row) {
    const error = new Error('Listening sentence not found');
    error.status = 404;
    throw error;
  }
  await env.DB.prepare('DELETE FROM listening_sentences WHERE id = ?').bind(id).run();
  if (row.audio_r2_key) {
    await env.AUDIO_BUCKET.delete(row.audio_r2_key);
  }
}

async function serveListeningAudio(env, id) {
  const row = await env.DB.prepare(
    'SELECT audio_r2_key, audio_content_type FROM listening_sentences WHERE id = ?'
  ).bind(id).first();
  if (!row || !row.audio_r2_key) {
    return new Response('Audio not found', { status: 404 });
  }
  const object = await env.AUDIO_BUCKET.get(row.audio_r2_key);
  if (!object) {
    return new Response('Audio not found', { status: 404 });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', row.audio_content_type || 'audio/mpeg');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('etag', object.httpEtag);
  return new Response(object.body, {
    headers: {
      ...Object.fromEntries(headers)
    }
  });
}

async function generateListeningBatch(env, input = {}) {
  if (!env.ELEVENLABS_API_KEY) {
    const error = new Error('ELEVENLABS_API_KEY is not configured');
    error.status = 503;
    throw error;
  }
  const settings = await getSettings(env.DB);
  const language = String(input.language || settings.language || 'Spanish');
  const count = Math.min(12, Math.max(3, Number(input.count) || Number(settings.listening_batch_size) || 8));
  const vocabulary = await listVocabulary(env.DB, { filter: 'all', language });
  if (!vocabulary.length) {
    const error = new Error('Add some vocabulary for ' + language + ' before generating listening practice.');
    error.status = 400;
    throw error;
  }

  const voices = await getElevenLabsVoices(env, language);
  if (!voices.length) {
    const error = new Error('No ElevenLabs voices are available for ' + language + '.');
    error.status = 502;
    throw error;
  }

  const groups = Array.from({ length: count }, () =>
    pickListeningVocabulary(vocabulary, Math.min(3, vocabulary.length), settings.listening_new_learning_percent)
  );
  const recent = await listListeningSentences(env.DB, language, 30);
  const generated = await generateListeningSentences(env, {
    language,
    level: settings.level,
    groups,
    recent: recent.slice(-12).map((item) => item.text)
  });
  if (generated.length < count) {
    const error = new Error('The sentence generator returned an incomplete batch. Please try again.');
    error.status = 502;
    throw error;
  }

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const uploadedKeys = [];
  let synthesized;
  try {
    synthesized = await mapWithConcurrency(
      generated.slice(0, count),
      ELEVENLABS_FREE_FLASH_CONCURRENCY,
      async (entry, index) => {
      const voice = randomItem(voices);
      const audio = await synthesizeElevenLabsSpeech(env, voice.voiceId, entry.text, language);
      const id = crypto.randomUUID();
      const audioR2Key = 'listening/' + language.toLowerCase() + '/' + batchId + '/' + id + '.mp3';
      await env.AUDIO_BUCKET.put(audioR2Key, audio, {
        httpMetadata: {
          contentType: 'audio/mpeg',
          cacheControl: 'public, max-age=31536000, immutable'
        },
        customMetadata: {
          sentenceId: id,
          voiceId: voice.voiceId
        }
      });
      uploadedKeys.push(audioR2Key);
      return {
        id,
        batchId,
        language,
        text: entry.text,
        translation: entry.translation,
        vocabulary: uniqueStrings(entry.vocabulary.length ? entry.vocabulary : groups[index]),
        voiceId: voice.voiceId,
        voiceName: voice.name,
        audioR2Key,
        audioContentType: 'audio/mpeg',
        createdAt: now
        };
      }
    );

    await env.DB.batch(synthesized.map((item) => env.DB.prepare(
      `INSERT INTO listening_sentences
       (id, batch_id, language, text, vocabulary_json, voice_id, voice_name, translation, listen_count, audio_r2_key, audio_content_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      item.id,
      item.batchId,
      item.language,
      item.text,
      JSON.stringify(item.vocabulary),
      item.voiceId,
      item.voiceName,
      item.translation,
      0,
      item.audioR2Key,
      item.audioContentType,
      item.createdAt
    )));
  } catch (error) {
    if (uploadedKeys.length) {
      await env.AUDIO_BUCKET.delete(uploadedKeys);
    }
    throw error;
  }

  return {
    batchId,
    sentences: synthesized.map((item) => ({
      id: item.id,
      batchId: item.batchId,
      language: item.language,
      text: item.text,
      vocabulary: item.vocabulary,
      voiceId: item.voiceId,
      voiceName: item.voiceName,
      translation: item.translation,
      listenCount: 0,
      audioContentType: item.audioContentType,
      audioUrl: '/api/listening-audio/' + encodeURIComponent(item.id),
      createdAt: item.createdAt
    }))
  };
}

async function generateListeningSentences(env, { language, level, groups, recent }) {
  const response = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 1,
    maxTokens: 1600,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Return only valid JSON shaped as {"sentences":[{"text":"...","translation":"...","vocabulary":["..."]}]}. The text must be in the requested target language and translation must be natural, precise English. Add no commentary.'
      },
      {
        role: 'user',
        content:
          'Write exactly ' + groups.length + ' distinct sentences in ' + language + ' for a ' + level + ' learner. ' +
          'Use the corresponding vocabulary group naturally in each sentence, allowing sensible inflections. Vary tense, speaker, mood, length, and everyday situation. Each sentence must stand alone and should usually be 8 to 18 words. ' +
          'Vocabulary groups: ' + JSON.stringify(groups) + '. Avoid repeating these recent sentences or close paraphrases: ' + JSON.stringify(recent) + '.'
      }
    ]
  });
  try {
    const parsed = JSON.parse(response);
    return (Array.isArray(parsed.sentences) ? parsed.sentences : [])
      .map((item) => ({
        text: String(item && item.text || '').trim(),
        translation: String(item && item.translation || '').trim(),
        vocabulary: uniqueStrings(Array.isArray(item && item.vocabulary) ? item.vocabulary : [])
      }))
      .filter((item) => item.text && item.translation);
  } catch {
    return [];
  }
}

async function getElevenLabsVoices(env, language) {
  const languageCode = LANGUAGE_PREFIX[language] || String(language).slice(0, 2).toLowerCase();
  const cached = await env.DB.prepare(
    'SELECT voices_json, refreshed_at FROM elevenlabs_voice_cache WHERE language = ?'
  ).bind(language).first();
  const cachedVoices = selectEligibleElevenLabsVoices(language, cached ? readJson(cached.voices_json) : []);
  const isFresh = cached && Date.now() - Date.parse(cached.refreshed_at) < 24 * 60 * 60 * 1000;
  if (isFresh && cachedVoices.length) {
    return cachedVoices;
  }

  let data;
  try {
    const response = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false', {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }
    });
    data = await response.json();
    if (!response.ok) {
      throw new Error(data?.detail?.message || data?.detail || 'ElevenLabs voice lookup failed');
    }
  } catch (error) {
    if (cachedVoices.length) return cachedVoices;
    throw error;
  }
  const allVoices = (Array.isArray(data.voices) ? data.voices : []).map((voice) => ({
    voiceId: String(voice.voice_id || ''),
    name: String(voice.name || 'Unnamed voice'),
    category: String(voice.category || ''),
    verifiedLanguages: (Array.isArray(voice.verified_languages) ? voice.verified_languages : [])
      .map((entry) => String(entry.language || '').toLowerCase())
  })).filter((voice) => voice.voiceId);
  const matched = allVoices.filter((voice) => voice.verifiedLanguages.includes(languageCode));
  const voices = selectEligibleElevenLabsVoices(language, matched.length ? matched : allVoices);
  await env.DB.prepare(
    `INSERT INTO elevenlabs_voice_cache (language, voices_json, refreshed_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(language) DO UPDATE SET voices_json = excluded.voices_json, refreshed_at = CURRENT_TIMESTAMP`
  ).bind(language, JSON.stringify(voices)).run();
  return voices;
}

function selectEligibleElevenLabsVoices(language, voices) {
  const source = Array.isArray(voices) ? voices : [];
  if (language === 'French') {
    return source
      .filter((voice) => FREE_FRENCH_VOICES.has(voice.voiceId))
      .map((voice) => ({
        voiceId: voice.voiceId,
        name: FREE_FRENCH_VOICES.get(voice.voiceId)
      }));
  }
  return source
    .filter((voice) => !voice.category || voice.category === 'premade')
    .map(({ voiceId, name }) => ({ voiceId, name }));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length) return [];
  const results = new Array(source.length);
  const limit = Math.max(1, Math.min(source.length, Math.floor(Number(concurrency) || 1)));
  let nextIndex = 0;
  let failure = null;

  async function worker() {
    while (!failure) {
      const index = nextIndex++;
      if (index >= source.length) return;
      try {
        results[index] = await mapper(source[index], index);
      } catch (error) {
        failure = error;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  if (failure) throw failure;
  return results;
}

async function synthesizeElevenLabsSpeech(env, voiceId, text, language) {
  const languageCode = LANGUAGE_PREFIX[language] || String(language).slice(0, 2).toLowerCase();
  const response = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_44100_64',
    {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        language_code: languageCode
      })
    }
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail?.message || detail?.detail || 'ElevenLabs speech generation failed');
  }
  return response.arrayBuffer();
}

function pickListeningVocabulary(items, count, newLearningPercent = 85) {
  const source = Array.isArray(items) ? items : [];
  const target = Math.min(source.length, Math.max(0, Math.floor(Number(count) || 0)));
  const preferred = shuffleArray(source.filter((item) => item.mastery !== 'known'));
  const known = shuffleArray(source.filter((item) => item.mastery === 'known'));
  const preferredCount = Math.min(preferred.length, Math.round(target * clampPercentage(newLearningPercent) / 100));
  const selected = preferred.slice(0, preferredCount);
  const used = new Set(selected.map((item) => item.id || item.word));
  for (const item of known.concat(preferred)) {
    if (selected.length >= target) break;
    const key = item.id || item.word;
    if (!used.has(key)) {
      used.add(key);
      selected.push(item);
    }
  }
  return shuffleArray(selected).slice(0, target).map((item) => item.word);
}

async function generateText(env, topic, vocabularyMode) {
  const settings = await getSettings(env.DB);
  const vocabulary = await listVocabulary(env.DB, {
    filter: 'all',
    language: settings.language
  });
  const history = await listHistory(env.DB);
  const selectedWords = pickVocabularyWords(
    vocabulary,
    Number(settings.vocab_words_count) || 0,
    Number(settings.vocabulary_mix)
  );
  const topicToUse = topic || settings.subject;
  const recentTexts = history
    .slice(-3)
    .map((entry, index) => (index + 1) + '. ' + String(entry.text || '').trim())
    .filter(Boolean)
    .join('\n');
  const vocabHint = buildVocabularyGuidance(vocabulary, selectedWords, vocabularyMode);
  const tone = randomItem([
    'dry, deadpan, and slightly mischievous',
    'warm, intimate, and observant',
    'tense and cinematic, with something at stake',
    'playful and faintly absurd',
    'opinionated and energetic',
    'wistful, sensory, and atmospheric',
    'wry and conversational',
    'brisk, curious, and surprising'
  ]);
  const form = randomItem([
    'a tiny scene with two people speaking',
    'a first-person anecdote',
    'a miniature story with a turn at the end',
    'an overheard conversation',
    'a vivid diary entry',
    'a mock news report that does not take itself too seriously',
    'a strong personal observation rather than an explanation',
    'a scene that begins in the middle of the action'
  ]);
  const texture = randomItem([
    'Include one odd but concrete detail.',
    'Let one sentence be unexpectedly short.',
    'Use a distinctive narrator with an actual point of view.',
    'Include a small misunderstanding or reversal.',
    'Make the final line land like a joke, surprise, or image—not a lesson.',
    'Use physical details and specific objects instead of abstract claims.'
  ]);

  const prompt =
    'Write a short piece in ' +
    settings.language +
    ' about "' +
    topicToUse +
    '" for ' +
    settings.level +
    ' learners. For this piece, the tone is ' + tone + ' and the form is ' + form + '. ' + texture +
    ' Sound like a human writer with a reason for telling this particular piece. Do not default to a balanced educational overview, a worthy moral, or a polished concluding lesson. Avoid generic claims about importance, society, culture, challenges, or the future unless the chosen form truly needs them. Use concrete people, objects, actions, and reactions. Make it markedly different from the recent outputs in voice and rhythm. ' +
    vocabHint +
    ' Aim for 5 to 8 sentences. No heading, preamble, bullet points, or explanation of the chosen style.\n\nRecent texts to avoid echoing:\n' +
    (recentTexts || 'None yet.');

  const text = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 1.05,
    maxTokens: 500,
    messages: [
      {
        role: 'system',
        content: 'Write memorable target-language practice pieces, not textbook filler. Preserve the requested learner level while giving every piece a distinct human voice, scene, and rhythm.'
      },
      { role: 'user', content: prompt }
    ]
  });

  return { text, selectedWords };
}

async function generateRelatedTopics(env, text) {
  const content = String(text || '').trim();
  if (!content) return [];

  const response = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 1,
    maxTokens: 350,
    messages: [
      {
        role: 'system',
        content:
          'Return only a JSON array of 8 short, clickable topic sentences. No markdown, no code fences.'
      },
      {
        role: 'user',
        content:
          'Given this text, create exactly 8 varied prompts for the next short practice piece. Make them feel chosen by a curious, funny human rather than a curriculum committee. Include: 2 genuinely useful or thoughtful continuations; 2 playful, funny, gossipy, or everyday ideas; 2 surprising sideways connections; and 2 off-the-wall prompts that are only faintly related (perhaps through one object, word, mood, or accidental association). Do not make every prompt a worthy issue, historical deep dive, or specific extension of the source. Keep each prompt concise, vivid, and clickable, and vary their sentence shapes. Text: ' +
          JSON.stringify(content)
      }
    ]
  });

  try {
    const parsed = JSON.parse(response);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((topic) => String(topic).trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((topic) => (/[.!?]$/.test(topic) ? topic : topic + '.'));
  } catch {
    return response
      .split('\n')
      .map((line) => line.replace(/^\s*[\d.-]+\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((topic) => (/[.!?]$/.test(topic) ? topic : topic + '.'));
  }
}

async function generateQuizQuestion(env, input = {}) {
  const settings = await getSettings(env.DB);
  const optionCount = clampQuizOptionCount(settings.quiz_option_count);
  const vocabulary = await listVocabulary(env.DB, { filter: 'all', language: settings.language });
  const eligible = vocabulary.filter((item) =>
    item.word && item.translation && item.id !== String(input.excludeId || '')
  );
  const pool = eligible.length ? eligible : vocabulary.filter((item) => item.word && item.translation);
  if (!pool.length) {
    const error = new Error('Add English translations to some vocabulary words before starting a quiz.');
    error.status = 400;
    throw error;
  }

  const answer = randomItem(pool);
  const distractorCount = optionCount - 1;
  const libraryCandidates = shuffleArray(vocabulary)
    .filter((item) => item.id !== answer.id && item.word && item.translation)
    .slice(0, 30)
    .map((item) => ({ word: item.word, meaning: item.translation }));
  const response = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 0.9,
    maxTokens: 500,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Return only valid JSON with this shape: {"sentence":"...","distractors":["..."]}. You create challenging but fair cloze questions for language learners.'
      },
      {
        role: 'user',
        content:
          'The correct ' + settings.language + ' answer is ' + JSON.stringify(answer.word) +
          ', meaning ' + JSON.stringify(answer.translation) + ' in English. Write one natural sentence entirely in ' + settings.language +
          ' that uses the answer exactly once, replacing that occurrence with the exact marker [GAP]. The context must make the answer inferable without translating the sentence for the learner. Naturally include 2 to 4 other words from the supplied library when possible (never force an unnatural sentence). Then generate exactly ' + distractorCount +
          ' distinct wrong choices in ' + settings.language + '. Make them genuinely tricky: prioritize supplied library words that fit the same grammatical slot or have confusable meanings, then use real words with similar spelling or sound. Avoid invented words unless necessary. Do not put the correct answer in the distractors. Library: ' + JSON.stringify(libraryCandidates)
      }
    ]
  });

  const generated = parseQuizQuestion(response, answer.word);
  generated.sentence ||= buildQuizSentenceFromLibrary(answer);
  if (!generated.sentence) {
    const sentenceResponse = await openAIChat(env, {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 140,
      messages: [
        {
          role: 'system',
          content: 'Return only one complete, natural target-language sentence containing the token [GAP] and no commentary.'
        },
        {
          role: 'user',
          content:
            'Write a natural sentence in ' + settings.language + ' for a learner. The missing word is ' + JSON.stringify(answer.word) +
            ', meaning ' + JSON.stringify(answer.translation) + '. Write a full sentence with useful surrounding context, but put [GAP] where that word belongs.'
        }
      ]
    });
    generated.sentence = normalizeQuizSentence(sentenceResponse, answer.word);
  }
  const fallbackWords = shuffleArray(vocabulary)
    .filter((item) => item.id !== answer.id)
    .map((item) => item.word);
  const options = buildQuizOptions(answer.word, generated.distractors, fallbackWords, optionCount);

  return {
    question: {
      id: answer.id,
      translation: answer.translation,
      sentence: generated.sentence || '_____',
      language: settings.language,
      options,
      correctWord: answer.word
    }
  };
}

function parseQuizQuestion(value, correctWord = '') {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text);
    return {
      sentence: normalizeQuizSentence(parsed.sentence, correctWord),
      distractors: Array.isArray(parsed.distractors) ? parsed.distractors.map(String) : []
    };
  } catch {
    return { sentence: '', distractors: parseQuizDistractors(text) };
  }
}

function normalizeQuizSentence(value, correctWord = '') {
  let sentence = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  if (!sentence) return '';
  sentence = sentence.replace(/_{3,}/g, '_____').replace(/\[{1,2}(?:blank|gap)\]{1,2}|<(?:blank|gap)>/gi, '_____');
  if (!sentence.includes('_____') && correctWord) {
    const index = sentence.toLocaleLowerCase().indexOf(String(correctWord).toLocaleLowerCase());
    if (index >= 0) sentence = sentence.slice(0, index) + '_____' + sentence.slice(index + String(correctWord).length);
  }
  return sentence.includes('_____') && sentence.replace(/_/g, '').trim() ? sentence : '';
}

function buildQuizSentenceFromLibrary(item) {
  const candidates = [].concat(item?.examples || [], item?.contexts || []);
  const forms = uniqueStrings([item?.word, ...(item?.forms || [])]).sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    const sentence = String(candidate || '').trim();
    for (const form of forms) {
      const index = sentence.toLocaleLowerCase().indexOf(form.toLocaleLowerCase());
      if (index < 0) continue;
      const cloze = sentence.slice(0, index) + '_____' + sentence.slice(index + form.length);
      if (cloze.replace(/_/g, '').trim().length >= 8) return cloze;
    }
  }
  return '';
}

function parseQuizDistractors(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return text.split('\n').map((line) => line.replace(/^\s*[\d.*-]+\s*/, '').trim()).filter(Boolean);
  }
}

function buildQuizOptions(correctWord, distractors, fallbackWords, count) {
  const targetCount = clampQuizOptionCount(count);
  const correct = String(correctWord || '').trim();
  const seen = new Set([correct.toLocaleLowerCase()]);
  const wrong = [];
  for (const value of [].concat(distractors || [], fallbackWords || [])) {
    const word = String(value || '').trim().replace(/^['"]|['"]$/g, '');
    const key = word.toLocaleLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    wrong.push(word);
    if (wrong.length >= targetCount - 1) break;
  }
  for (const suffix of ['a', 'e', 'i', 'o', 'al', 'ique', 'er', 'ment']) {
    if (wrong.length >= targetCount - 1) break;
    const word = correct + suffix;
    const key = word.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      wrong.push(word);
    }
  }
  return shuffleArray([correct].concat(wrong)).slice(0, targetCount);
}

function clampQuizOptionCount(value) {
  return Math.min(12, Math.max(6, Math.round(Number(value) || 8)));
}

function randomItem(values) {
  const items = Array.isArray(values) ? values : [];
  if (!items.length) return '';
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return items[random[0] % items.length];
}

async function generateVocabularyNote(env, input) {
  const db = env.DB;
  const item = await getVocabularyItem(db, input);
  if (!item) {
    throw new Error('Vocabulary item not found');
  }

  const kind = input.kind === 'mnemonic' ? 'mnemonic' : 'translation';
  const targetLanguage = item.targetLanguage || (await getSettings(db)).language || 'Spanish';
  const contextPool = getCombinedContextPool(item);
  const previousTranslation = String(input.previousTranslation || item.translation || '').trim();
  const previousMnemonic = String(input.previousMnemonic || item.mnemonic || '').trim();

  const prompt =
    kind === 'translation'
      ? buildTranslationPrompt({
          word: item.word,
          targetLanguage,
          contextPool,
          previousTranslation,
          previousMnemonic
        })
      : buildMnemonicPrompt({
          word: item.word,
          targetLanguage,
          contextPool,
          previousTranslation,
          previousMnemonic
        });

  const response = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 0.25,
    maxTokens: kind === 'translation' ? 80 : 100,
    messages: [
      {
        role: 'system',
        content:
          kind === 'translation'
            ? 'You are a language translation assistant. Return only the translation.'
            : 'You write short, useful mnemonics for language learners. Return only the mnemonic.'
      },
      { role: 'user', content: prompt }
    ]
  });

  const value = normalizeOneLineNote(response);
  if (!value) {
    throw new Error('AI did not return a usable ' + kind + '.');
  }

  const patch = kind === 'translation' ? { translation: value } : { mnemonic: value };
  await db
    .prepare(
      kind === 'translation'
        ? 'UPDATE vocabulary SET translation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        : 'UPDATE vocabulary SET mnemonic = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    .bind(value, item.id)
    .run();

  return patch;
}

function normalizeImageData(value) {
  const source = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })()
    : value;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }

  const url = String(source.url || source.thumbnail || source.src || '').trim();
  const status = String(source.status || '').trim();
  const jobId = String(source.jobId || source.job_id || '').trim();
  const prompt = String(source.prompt || source.promptText || '').trim();
  const error = String(source.error || source.lastError || '').trim();
  const provider = String(source.provider || '').trim();
  const r2Key = String(source.r2Key || source.r2_key || '').trim();
  if (!url && !status && !jobId && !prompt && !error && !r2Key) {
    return null;
  }

  return {
    id: String(source.id || '').trim(),
    url,
    status,
    jobId,
    alt: String(source.alt || source.description || '').trim(),
    photographer: String(source.photographer || source.photographer_name || '').trim(),
    photographerUrl: String(source.photographer_url || source.creator_url || '').trim(),
    sourceUrl: String(source.source_url || source.url || '').trim(),
    query: String(source.query || '').trim(),
    prompt,
    error,
    provider,
    r2Key,
    width: Number(source.width || 0),
    height: Number(source.height || 0),
    createdAt: String(source.createdAt || source.created_at || '').trim(),
    updatedAt: String(source.updatedAt || source.updated_at || '').trim()
  };
}

function normalizeImageQuery(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\b[lsjcdmtnqu]$|^\s*[lsjcdmtnqu]\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^to\s+/i, '')
    .trim();
}

function normalizePromptText(value) {
  return String(value || '')
    .replace(/^```(?:text|prompt|markdown)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function buildImagePromptInstruction({ word, meaning, context, previousPrompt }) {
  return [
    '<prompt>',
    'Create a very small thumbnail-style typographic illustration for the French word "[WORD]".',
    '',
    'The image must make the meaning unambiguous: "[WORD]" means "[MEANING / SHORT DEFINITION]".',
    '',
    'Show the single word "[WORD]" in large, bold, very legible lowercase letters, centred on a clean white or very light background. The word itself should visually express the meaning, but it must still be instantly readable at thumbnail size.',
    '',
    'Use a clear visual metaphor for the meaning: [DESCRIBE THE CORE VISUAL IDEA]. Add one simple supporting cue if helpful, such as [OPTIONAL OBJECT / ACTION CUE], but keep the word as the main subject.',
    '',
    'Avoid visual ideas that could be confused with nearby meanings such as [POSSIBLE CONFUSIONS]. Keep the composition simple, graphic, crisp, cheerful, high-contrast, and easy to understand at a glance.',
    '</prompt>',
    '',
    'Fill this template with the details below and return only the finished prompt, with no markdown, JSON, or commentary.',
    'Word: ' + JSON.stringify(word),
    'Meaning / short definition: ' + JSON.stringify(meaning),
    'Context sentence: ' + JSON.stringify(context || ''),
    'Previous prompt: ' + JSON.stringify(previousPrompt || 'None')
  ].join('\n');
}

function buildImagePromptPreview({ word, meaning, context, previousPrompt }) {
  return {
    word,
    meaning,
    context,
    previousPrompt
  };
}

function normalizeImageJob(row) {
  return {
    id: String(row.id || '').trim(),
    vocabularyId: String(row.vocabulary_id || '').trim(),
    word: String(row.word || '').trim(),
    status: String(row.status || 'queued').trim(),
    prompt: normalizePromptText(row.prompt_text || ''),
    promptJson: readJson(row.prompt_json || '{}'),
    r2Key: String(row.r2_key || '').trim(),
    error: String(row.error || '').trim(),
    createdAt: String(row.created_at || '').trim(),
    startedAt: String(row.started_at || '').trim(),
    finishedAt: String(row.finished_at || '').trim(),
    updatedAt: String(row.updated_at || '').trim()
  };
}

function mergeImageState(existingImage, job) {
  const next = Object.assign({}, existingImage || {});
  next.id = job.id;
  next.jobId = job.id;
  next.status = job.status;
  next.prompt = job.prompt || next.prompt || '';
  next.error = job.error || next.error || '';
  next.r2Key = job.r2Key || next.r2Key || '';
  next.updatedAt = job.updatedAt || next.updatedAt || '';
  next.createdAt = job.createdAt || next.createdAt || '';
  if (job.status === 'ready') {
    next.provider = 'openai';
    next.url = '/api/image-file/' + encodeURIComponent(job.id);
    next.sourceUrl = next.url;
    next.photographer = '';
    next.photographerUrl = '';
  } else if (!next.provider) {
    next.provider = existingImage && existingImage.provider ? existingImage.provider : '';
  }
  return next;
}

function buildImagePromptPayload(item, contextHint, previousPrompt) {
  const contexts = getCombinedContextPool(item);
  const meaning = normalizeOneLineNote(item.translation) || normalizeOneLineNote(contextHint) || item.word;
  const context = normalizeOneLineNote(contextHint) || contexts[0] || '';
  return {
    word: item.word,
    meaning,
    context,
    previousPrompt: normalizePromptText(previousPrompt || '')
  };
}

async function generateOpenAIImagePrompt(env, item, contextHint, previousPrompt) {
  const promptData = buildImagePromptPayload(item, contextHint, previousPrompt);
  const response = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 0.55,
    maxTokens: 320,
    messages: [
      {
        role: 'system',
        content:
          'You write a finished image prompt for a text-to-image model. Follow the template precisely, keep it in English, and return only the completed prompt.'
      },
      {
        role: 'user',
        content: buildImagePromptInstruction(promptData)
      }
    ]
  });

  const prompt = normalizePromptText(response);
  if (!prompt) {
    throw new Error('OpenAI did not return a usable image prompt.');
  }
  return prompt;
}

async function openAIImageGenerate(env, prompt) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'OpenAI image generation failed');
  }

  const candidate =
    data?.data?.[0] ||
    data?.output?.[0] ||
    data?.images?.[0] ||
    data?.result?.[0] ||
    null;

  const b64 =
    candidate?.b64_json ||
    candidate?.base64 ||
    candidate?.image_base64 ||
    candidate?.content?.[0]?.b64_json ||
    candidate?.content?.[0]?.base64 ||
    data?.data?.[0]?.b64_json ||
    data?.output?.[0]?.content?.[0]?.b64_json ||
    '';

  let bytes = null;
  if (b64) {
    bytes = Buffer.from(String(b64), 'base64');
  } else {
    const imageUrl = String(candidate?.url || candidate?.image_url || '').trim();
    if (imageUrl) {
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error('OpenAI image download failed: ' + imageResponse.statusText);
      }
      bytes = Buffer.from(await imageResponse.arrayBuffer());
    }
  }

  if (!bytes || !bytes.length) {
    throw new Error('OpenAI did not return image bytes.');
  }

  return {
    bytes,
    revisedPrompt: String(candidate?.revised_prompt || data?.revised_prompt || '').trim(),
    raw: data
  };
}

async function createVocabularyImageJob(env, item, contextHint) {
  const db = env.DB;
  const previousImage = normalizeImageData(item.image || item.image_json || '{}');
  const previousPrompt = previousImage && previousImage.prompt ? previousImage.prompt : '';
  const promptJson = buildImagePromptPayload(item, contextHint, previousPrompt);
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertResult = await db
    .prepare(
      `INSERT INTO image_jobs
       (id, vocabulary_id, word, status, prompt_json, prompt_text, r2_key, error, created_at, started_at, finished_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM image_jobs WHERE datetime(created_at) >= datetime('now', '-1 minute')) < 10`
    )
    .bind(
      jobId,
      item.id,
      item.word,
      'queued',
      JSON.stringify(promptJson),
      '',
      '',
      '',
      now,
      '',
      '',
      now
    )
    .run();

  if (!insertResult.meta || Number(insertResult.meta.changes || 0) === 0) {
    const error = new Error('Image generation is cooling down. Try again in about a minute.');
    error.status = 429;
    throw error;
  }

  const queuedImage = mergeImageState(previousImage, {
    id: jobId,
    status: 'queued',
    prompt: '',
    error: '',
    r2Key: '',
    createdAt: now,
    updatedAt: now
  });

  await db
    .prepare('UPDATE vocabulary SET image_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(JSON.stringify(queuedImage), item.id)
    .run();

  return { jobId, image: queuedImage, promptJson };
}

async function processVocabularyImageJob(env, jobId) {
  const db = env.DB;
  const jobRow = await db.prepare('SELECT * FROM image_jobs WHERE id = ?').bind(jobId).first();
  if (!jobRow) {
    return null;
  }

  const job = normalizeImageJob(jobRow);
  if (!job.id) {
    return null;
  }

  const vocabularyRow = await db.prepare('SELECT * FROM vocabulary WHERE id = ?').bind(job.vocabularyId).first();
  if (!vocabularyRow) {
    await db
      .prepare('UPDATE image_jobs SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind('failed', 'Vocabulary item not found', job.id)
      .run();
    return null;
  }

  const item = normalizeVocabulary(vocabularyRow);
  const previousImage = normalizeImageData(item.image || item.image_json || '{}');
  const promptJson = job.promptJson && typeof job.promptJson === 'object' ? job.promptJson : {};
  let prompt = String(job.prompt || promptJson.generatedPrompt || '').trim();
  if (!prompt) {
    prompt = await generateOpenAIImagePrompt(env, item, String(promptJson.context || ''), String(promptJson.previousPrompt || ''));
    await db
      .prepare(
        `UPDATE image_jobs
         SET status = ?, prompt_text = ?, prompt_json = ?, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        'prompting',
        prompt,
        JSON.stringify({
          ...promptJson,
          generatedPrompt: prompt
        }),
        job.id
      )
      .run();
  }
  if (!prompt) {
    await db
      .prepare('UPDATE image_jobs SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind('failed', 'Image prompt is missing', job.id)
      .run();
    return null;
  }

  await db
    .prepare('UPDATE image_jobs SET status = ?, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind('generating', job.id)
    .run();

  try {
    const generated = await openAIImageGenerate(env, prompt);
    const key = 'vocabulary/' + item.id + '/' + job.id + '.png';
    const imageBytes = generated.bytes instanceof Uint8Array ? generated.bytes : new Uint8Array(generated.bytes);
    await env.IMAGE_BUCKET.put(key, imageBytes, {
      httpMetadata: {
        contentType: 'image/png'
      }
    });

    const readyImage = mergeImageState(previousImage, {
      id: job.id,
      status: 'ready',
      prompt,
      error: '',
      r2Key: key,
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString()
    });
    readyImage.provider = 'openai';
    readyImage.sourceUrl = '/api/image-file/' + encodeURIComponent(job.id);
    readyImage.url = '/api/image-file/' + encodeURIComponent(job.id);
    readyImage.alt = item.word + ' vocabulary illustration';
    readyImage.model = IMAGE_MODEL;
    if (generated.revisedPrompt) {
      readyImage.revisedPrompt = generated.revisedPrompt;
    }

    await db
      .prepare('UPDATE vocabulary SET image_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(JSON.stringify(readyImage), item.id)
      .run();

    await db
      .prepare(
        `UPDATE image_jobs
         SET status = ?, prompt_json = ?, prompt_text = ?, r2_key = ?, error = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        'ready',
        JSON.stringify({
          ...promptJson,
          generatedPrompt: prompt,
          revisedPrompt: generated.revisedPrompt || ''
        }),
        prompt,
        key,
        '',
        job.id
      )
      .run();

    return readyImage;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image generation failed';
    const failedImage = mergeImageState(previousImage, {
      id: job.id,
      status: 'failed',
      prompt,
      error: message,
      r2Key: job.r2Key || '',
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString()
    });
    failedImage.provider = 'openai';
    await db
      .prepare('UPDATE vocabulary SET image_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(JSON.stringify(failedImage), item.id)
      .run();
    await db
      .prepare(
        `UPDATE image_jobs
         SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind('failed', message, job.id)
      .run();
    throw error;
  }
}

function buildTranslationPrompt({ word, targetLanguage, contextPool, previousTranslation, previousMnemonic }) {
  return (
    'Translate this ' +
    targetLanguage +
    ' word or phrase into English. Keep it concise, natural, and different from the previous version if one exists.\n\n' +
    'Word or phrase: ' +
    JSON.stringify(word) +
    '\nPrevious translation: ' +
    JSON.stringify(previousTranslation || 'None') +
    '\nPrevious mnemonic: ' +
    JSON.stringify(previousMnemonic || 'None') +
    '\nSaved contexts:\n' +
    formatPromptList(contextPool) +
    '\n\nReturn only the English translation.'
  );
}

function buildMnemonicPrompt({ word, targetLanguage, contextPool, previousTranslation, previousMnemonic }) {
  return (
    'Write one short mnemonic in ' +
    targetLanguage +
    ' that helps a learner remember the English meaning of this word or phrase. Keep it different from the previous version if one exists.\n\n' +
    'Word or phrase: ' +
    JSON.stringify(word) +
    '\nPrevious translation: ' +
    JSON.stringify(previousTranslation || 'None') +
    '\nPrevious mnemonic: ' +
    JSON.stringify(previousMnemonic || 'None') +
    '\nSaved contexts:\n' +
    formatPromptList(contextPool) +
    '\n\nReturn only the mnemonic.'
  );
}

function normalizeOneLineNote(value) {
  return String(value || '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .map((line) => line.replace(/^(translation|mnemonic|answer)\s*:\s*/i, '').trim())
    .filter(Boolean)[0] || '';
}

function formatPromptList(values) {
  const items = uniqueStrings((values || []).map(normalizeExampleSentence).filter(Boolean));
  if (!items.length) {
    return 'None saved yet.';
  }
  return items.map((item, index) => index + 1 + '. ' + item).join('\n');
}

async function getVocabularyItem(db, input) {
  const id = String(input.id || '').trim();
  if (id) {
    const row = await db.prepare('SELECT * FROM vocabulary WHERE id = ?').bind(id).first();
    if (row) return normalizeVocabulary(row);
  }

  const rawWord = String(input.word || '').trim().toLowerCase();
  if (!rawWord) {
    return null;
  }

  const row = await db.prepare('SELECT * FROM vocabulary WHERE word = ?').bind(rawWord).first();
  return row ? normalizeVocabulary(row) : null;
}

function getCombinedContextPool(item) {
  return uniqueStrings([
    ...(item.contexts || []),
    ...(item.examples || [])
  ].map(normalizeExampleSentence).filter(Boolean)).slice(0, 20);
}

async function generateVocabularyImage(env, input, ctx) {
  const db = env.DB;
  const existing = await getVocabularyItem(db, input);
  if (!existing) {
    throw new Error('Vocabulary item not found');
  }

  const activeJob = await db
    .prepare(
      `SELECT * FROM image_jobs
       WHERE vocabulary_id = ? AND status IN ('queued', 'prompting', 'generating')
       ORDER BY datetime(created_at) DESC
       LIMIT 1`
    )
    .bind(existing.id)
    .first();

  if (activeJob) {
    const image = normalizeImageData(existing.image || existing.image_json || '{}') || {};
    const job = normalizeImageJob(activeJob);
    return {
      queued: true,
      image: mergeImageState(image, job),
      job: {
        id: job.id,
        status: job.status,
        prompt: job.prompt
      }
    };
  }

  const queued = await createVocabularyImageJob(env, existing, input.context || '');
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(processVocabularyImageJob(env, queued.jobId).catch(() => {}));
  } else {
    processVocabularyImageJob(env, queued.jobId).catch(() => {});
  }
  return {
    queued: true,
    image: queued.image,
    job: {
      id: queued.jobId,
      status: 'queued',
      prompt: queued.prompt
    }
  };
}

async function serveGeneratedImage(env, jobId) {
  if (!jobId) {
    return json({ error: 'Job id is required' }, 400);
  }

  const jobRow = await env.DB.prepare('SELECT * FROM image_jobs WHERE id = ?').bind(jobId).first();
  if (!jobRow) {
    return json({ error: 'Image job not found' }, 404);
  }

  const job = normalizeImageJob(jobRow);
  if (job.status !== 'ready' || !job.r2Key) {
    return json({ error: 'Image is not ready yet' }, 409);
  }

  const object = await env.IMAGE_BUCKET.get(job.r2Key);
  if (!object) {
    return json({ error: 'Image file not found' }, 404);
  }

  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType || 'image/png');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}

async function generateVocabularyExamples(env, input) {
  const result = await generateVocabularyContext(env, {
    ...input,
    count: Number(input.count || 5)
  });
  return {
    contexts: result.contexts,
    examples: result.contexts,
    context: result.context
  };
}

async function generateVocabularyContextSentence(env, existing, targetLanguage, contextPool, previousContext) {
  const prompt =
    'Write one new, short context sentence in ' +
    targetLanguage +
    ' that uses the word or phrase "' +
    existing.word +
    '" naturally. Make it different from the saved contexts below and from this previous context if one exists.\n\n' +
    'Previous context: ' +
    JSON.stringify(previousContext || 'None') +
    '\nSaved contexts:\n' +
    formatPromptList(contextPool) +
    '\n\nReturn only the new context sentence.';

  const response = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 0.65,
    maxTokens: 120,
    messages: [
      {
        role: 'system',
        content: 'You generate one useful learner context sentence and return only that sentence.'
      },
      { role: 'user', content: prompt }
    ]
  });

  return normalizeOneLineNote(response);
}

async function generateVocabularyContext(env, input) {
  const db = env.DB;
  const existing = await getVocabularyItem(db, input);
  if (!existing) {
    throw new Error('Vocabulary item not found');
  }

  const targetLanguage = existing.targetLanguage || (await getSettings(db)).language || 'Spanish';
  const count = Math.max(1, Math.min(Number(input.count || 1), 10));
  const contexts = Array.isArray(existing.contexts) ? existing.contexts.slice() : [];
  const generated = [];
  let previousContext = String(input.previousContext || contexts[contexts.length - 1] || '').trim();
  let attempts = 0;

  while (generated.length < count && attempts < count * 4) {
    attempts++;
    const contextPool = getCombinedContextPool({
      ...existing,
      contexts
    });
    const context = await generateVocabularyContextSentence(
      env,
      existing,
      targetLanguage,
      contextPool,
      previousContext
    );
    previousContext = context || previousContext;
    if (!context || contexts.includes(context)) {
      continue;
    }
    contexts.push(context);
    generated.push(context);
  }

  const nextContexts = uniqueStrings(contexts).slice(0, 20);

  await db
    .prepare('UPDATE vocabulary SET contexts_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(JSON.stringify(nextContexts), existing.id)
    .run();

  return {
    context: generated[generated.length - 1] || nextContexts[nextContexts.length - 1] || '',
    contexts: nextContexts,
    examples: nextContexts
  };
}

function parseExampleValues(response) {
  const text = String(response || '').trim();
  if (!text) return [];

  const withoutFence = text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const candidates = [];

  try {
    const parsed = JSON.parse(withoutFence);
    if (Array.isArray(parsed)) {
      return normalizeExampleValues(parsed);
    }
  } catch {}

  const jsonMatch = withoutFence.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return normalizeExampleValues(parsed);
      }
    } catch {}
  }

  for (const line of withoutFence.split('\n')) {
    const cleaned = normalizeExampleSentence(line);
    if (cleaned) candidates.push(cleaned);
  }

  return candidates;
}

function normalizeExampleValues(values) {
  const flattened = [];

  const push = (value) => {
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }

    if (value == null) {
      return;
    }

    if (typeof value === 'string') {
      const parsed = tryParseExampleArray(value);
      if (parsed.length) {
        parsed.forEach(push);
        return;
      }
    }

    const cleaned = normalizeExampleSentence(value);
    if (cleaned) {
      flattened.push(cleaned);
    }
  };

  push(values);
  return uniqueStrings(flattened).slice(0, 20);
}

function tryParseExampleArray(text) {
  const stripped = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  if (!stripped) {
    return [];
  }

  if (stripped.startsWith('[')) {
    try {
      const parsed = JSON.parse(stripped);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const match = stripped.match(/\[[\s\S]*\]/);
  if (!match) {
    return [];
  }

  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeExampleSentence(sentence) {
  let text = String(sentence || '').trim();
  const fence = String.fromCharCode(96, 96, 96);
  if (/^Example:\s*\[/i.test(text) || /^Example:\s*```/i.test(text)) {
    text = text.replace(/^Example:\s*/i, '');
  }
  text = text.replace(/^Example:\s*/i, '');
  text = text.split(fence + 'json').join('');
  text = text.split(fence).join('');
  text = text.replace(/^\s*[\[\(]+\s*/, '');
  text = text.replace(/\s*[\]\)]+\s*$/, '');
  text = text.replace(/^\s*[\d.-]+\s*/, '');
  text = text.replace(/^\s*["']+/, '');
  text = text.replace(/["']+$/, '');
  text = text.replace(/,\s*$/, '');
  return text.trim();
}

async function normalizeExistingExamples(db) {
  const rows = await db
    .prepare("SELECT id, examples_json FROM vocabulary WHERE examples_json IS NOT NULL AND examples_json <> '[]'")
    .all();
  const items = Array.isArray(rows.results) ? rows.results : [];

  for (const row of items) {
    const cleaned = normalizeExampleValues(readJson(row.examples_json));

    await db
      .prepare('UPDATE vocabulary SET examples_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(JSON.stringify(cleaned), row.id)
      .run();
  }
}

async function normalizeExistingVocabularyNotes(db) {
  const rows = await db
    .prepare("SELECT id, translation, mnemonic FROM vocabulary WHERE mnemonic IS NULL OR mnemonic = ''")
    .all();
  const items = Array.isArray(rows.results) ? rows.results : [];

  for (const row of items) {
    const split = splitLegacyTranslationNote(row.translation);
    if (!split.mnemonic) {
      continue;
    }

    await db
      .prepare('UPDATE vocabulary SET translation = ?, mnemonic = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(split.translation, split.mnemonic, row.id)
      .run();
  }
}

function splitLegacyTranslationNote(value) {
  const text = String(value || '').trim();
  if (!text) {
    return { translation: '', mnemonic: '' };
  }

  const markerMatch = text.match(/\n\s*(\*\*)?mnemonic(\*\*)?\s*:/i);
  if (markerMatch && typeof markerMatch.index === 'number') {
    const translation = text.slice(0, markerMatch.index).trim();
    const mnemonic = text
      .slice(markerMatch.index)
      .replace(/\n\s*(\*\*)?mnemonic(\*\*)?\s*:/i, '')
      .trim();
    return {
      translation,
      mnemonic
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      translation: text,
      mnemonic: ''
    };
  }

  return {
    translation: lines[0],
    mnemonic: lines.slice(1).join(' ')
  };
}

async function addTextToVocabulary(env, text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) {
    throw new Error('Text is required');
  }

  const explanation = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 0.5,
    maxTokens: 180,
    messages: [
      {
        role: 'system',
        content:
          'You write short, useful explanations for learners. Explain the phrase in simple English and add a mnemonic if helpful.'
      },
      {
        role: 'user',
        content: 'Explain this phrase for a learner: ' + JSON.stringify(cleaned)
      }
    ]
  });

  const result = await upsertVocabularyWord(env, {
    word: cleaned.toLowerCase(),
    context: explanation,
    targetLanguage: (await getSettings(env.DB)).language,
    mode: 'phrase'
  });
  const item = result.item;
  await Promise.allSettled([
    generateVocabularyNote(env, {
      id: item.id,
      word: item.word,
      kind: 'translation',
      previousTranslation: item.translation || '',
      previousMnemonic: item.mnemonic || ''
    }),
    generateVocabularyNote(env, {
      id: item.id,
      word: item.word,
      kind: 'mnemonic',
      previousTranslation: item.translation || '',
      previousMnemonic: item.mnemonic || ''
    })
  ]);

  const refreshed = await env.DB.prepare('SELECT * FROM vocabulary WHERE id = ?').bind(item.id).first();
  return {
    item: refreshed ? normalizeVocabulary(refreshed) : item,
    created: Boolean(result.created)
  };
}

async function lemmatizeWord(env, word, fullText) {
  const response = await openAIChat(env, {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 24,
    messages: [
      {
        role: 'system',
        content:
          'Return only the base form of the word. For verbs use infinitive/base form. For nouns use singular. No extra text.'
      },
      {
        role: 'user',
        content: 'Word: ' + JSON.stringify(word) + '\nContext: ' + JSON.stringify(fullText)
      }
    ]
  });

  return String(response).trim().toLowerCase() || String(word).trim().toLowerCase();
}

async function openAIChat(env, { model, messages, temperature, maxTokens, responseFormat }) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(responseFormat ? { response_format: responseFormat } : {})
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'OpenAI request failed');
  }

  return String(data?.choices?.[0]?.message?.content || '').trim();
}

async function renderPage(env) {
  const [settings, vocabulary, history] = await Promise.all([
    getSettings(env.DB),
    listVocabulary(env.DB),
    listHistory(env.DB)
  ]);
  const initialState = {
    settings,
    vocabulary,
    history
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Language Atlas</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
  <style>${APP_CSS}</style>
</head>
<body>
  <div class="page-shell">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Cloudflare Worker + D1</p>
        <h1>Language Atlas</h1>
        <p class="lede">Generate practice text, save vocabulary, and drill flashcards with a cleaner workflow and persistent storage.</p>
      </div>
      <div class="hero-meta">
        <button id="openSettingsBtn" class="ghost-btn">Settings</button>
        <div class="chip-row">
          <span class="chip">Text generation</span>
          <span class="chip">Vocabulary</span>
          <span class="chip">Flashcards</span>
          <span class="chip">Quiz</span>
        </div>
      </div>
    </header>

    <main class="workspace">
      <section class="toolbar">
        <button class="tab-btn active" data-tab="text">Text</button>
        <button class="tab-btn" data-tab="vocabulary">Vocabulary</button>
        <button class="tab-btn" data-tab="flashcards">Flashcards</button>
        <button class="tab-btn" data-tab="quiz">Quiz</button>
        <button class="tab-btn" data-tab="listening">Listening</button>
      </section>

      <section id="statusBanner" class="status-banner hidden"></section>

      <section id="textView" class="panel">
        <div class="panel-header">
          <div>
            <h2>Practice text</h2>
            <p>Generate a paragraph, click words to save them, and move through your history.</p>
          </div>
          <div class="panel-actions">
            <input id="topicInput" class="text-input" placeholder="Custom topic, optional" />
            <select id="vocabularyModeSelect" class="select-input" aria-label="Vocabulary approach">
              <option value="more-new">More new vocabulary</option>
              <option value="minimise-new">Minimise new vocabulary</option>
            </select>
            <button id="generateTextBtn" class="primary-btn">New text</button>
          </div>
        </div>

        <div class="nav-row">
          <button id="prevHistoryBtn" class="ghost-btn">Previous</button>
          <span id="historyCounter" class="counter"></span>
          <button id="nextHistoryBtn" class="ghost-btn">Next</button>
          <button id="listenBtn" class="ghost-btn">Listen</button>
        </div>

        <article id="currentTextCard" class="story-card">
          <div id="currentText" class="story-text"></div>
          <div class="story-footer">
            <button id="generateTopicsBtn" class="secondary-btn">Generate related topics</button>
            <div id="topicsList" class="topics-list hidden"></div>
          </div>
        </article>
      </section>

      <section id="vocabularyView" class="panel hidden">
        <div class="panel-header">
          <div>
            <h2>Vocabulary</h2>
            <p>Review what you have saved, adjust mastery, and add whole phrases manually.</p>
          </div>
          <div class="panel-actions">
            <button id="browseImagesBtn" class="secondary-btn">Browse images</button>
            <input id="vocabSearchInput" class="text-input" placeholder="Search vocabulary" />
            <select id="vocabFilter" class="select-input">
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="learning">Learning</option>
              <option value="known">Known</option>
            </select>
          </div>
        </div>

        <div class="composer">
          <textarea id="phraseInput" class="textarea-input" rows="3" placeholder="Paste a phrase to explain and store"></textarea>
          <div class="composer-actions">
            <button id="addPhraseBtn" class="primary-btn">Add phrase</button>
          </div>
        </div>

        <div id="vocabList" class="card-grid">${renderVocabularyCards(vocabulary, settings)}</div>
      </section>

      <section id="flashcardsView" class="panel hidden">
        <div class="panel-header">
          <div>
            <h2>Flashcards</h2>
            <p>Choose a filter, start a session, and use the arrow keys to move quickly.</p>
          </div>
          <div class="panel-actions">
            <select id="flashcardFilter" class="select-input">
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="learning">Learning</option>
              <option value="new-learning">New + Learning</option>
              <option value="known">Known</option>
            </select>
            <select id="flashcardCount" class="select-input">
              <option value="5">5 cards</option>
              <option value="10" selected>10 cards</option>
              <option value="20">20 cards</option>
              <option value="40">40 cards</option>
            </select>
            <button id="startSessionBtn" class="primary-btn">Start session</button>
          </div>
        </div>

        <div id="flashcardState" class="flashcard-state">
          <div class="flashcard-topline">
            <span id="flashcardProgress">0 / 0</span>
            <span id="flashcardStats">Known 0 | Unknown 0</span>
          </div>
          <div class="flashcard-card">
            <h3 id="flashcardWord"></h3>
            <div id="flashcardContextWrap" class="flashcard-context-wrap hidden">
              <p id="flashcardContext" class="flashcard-context"></p>
              <div id="flashcardImage" class="flashcard-image hidden"></div>
            </div>
            <p id="flashcardTranslation" class="translation hidden"></p>
            <div class="flashcard-links">
              <button id="toggleContextBtn" class="link-btn">Show context</button>
              <button id="toggleTranslationBtn" class="link-btn">Show translation</button>
              <button id="moreExamplesBtn" class="link-btn">More contexts</button>
            </div>
          </div>
          <div class="flashcard-actions">
            <button id="knowBtn" class="success-btn">I know this</button>
            <button id="dontKnowBtn" class="danger-btn">Keep learning</button>
          </div>
          <div class="flashcard-bottom">
            <button id="endSessionBtn" class="ghost-btn">End session</button>
          </div>
        </div>

        <div id="flashcardEmpty" class="empty-state">
          <h3>Ready when you are</h3>
          <p>Save some vocabulary first, then start a review session here.</p>
        </div>
      </section>

      <section id="quizView" class="panel hidden">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Sentence challenge</p>
            <h2>Fill the gap</h2>
            <p>Choose the word that completes the target-language sentence. Expect a few convincing decoys.</p>
          </div>
          <button id="newQuizQuestionBtn" class="primary-btn">New question</button>
        </div>
        <div class="quiz-shell">
          <div class="quiz-topline">
            <span id="quizProgress">0 answered</span>
            <span id="quizScore">Score 0</span>
          </div>
          <article class="quiz-card">
            <p id="quizLanguage" class="eyebrow">Complete the sentence</p>
            <h3 id="quizTranslation">Ready for a question?</h3>
            <div id="quizOptions" class="quiz-options"></div>
            <p id="quizFeedback" class="quiz-feedback">Open settings to choose how many answers appear.</p>
          </article>
        </div>
      </section>

      <section id="listeningView" class="panel hidden">
        <div class="panel-header">
          <div>
            <p class="eyebrow">AI listening stream</p>
            <h2>Sentence radio</h2>
            <p>Hear fresh sentences built from your library, with extra attention on words you are still learning.</p>
          </div>
          <div class="panel-actions">
            <button id="openListeningLibraryBtn" class="ghost-btn">Sentence library</button>
            <button id="generateListeningBtn" class="primary-btn">Generate a batch</button>
          </div>
        </div>
        <div class="listening-shell">
          <div class="listening-topline">
            <span id="listeningCounter" class="counter">0 / 0</span>
            <label class="compact-control">Speed
              <select id="listeningSpeedSelect" class="select-input">
                <option value="0.5">0.5×</option>
                <option value="0.75">0.75×</option>
                <option value="1">1×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
            </label>
            <label class="continuous-toggle"><input id="showListeningSentenceInput" type="checkbox" /> Show sentence</label>
            <label class="continuous-toggle"><input id="randomListeningOrderInput" type="checkbox" checked /> Random order</label>
            <label class="continuous-toggle"><input id="continuousListeningInput" type="checkbox" checked /> Auto-play</label>
          </div>
          <article class="listening-card">
            <div class="listening-meta"><p id="listeningVoice" class="eyebrow">Ready to listen</p><span id="listeningCount" class="listening-count"></span></div>
            <h3 id="listeningSentence">Generate your first listening batch.</h3>
            <p id="listeningTranslation" class="listening-translation hidden"></p>
            <p id="listeningWords" class="listening-words"></p>
            <audio id="listeningAudio" preload="auto"></audio>
            <div class="listening-player" aria-label="Sentence radio playback controls">
              <button id="playPauseListeningBtn" class="listening-play-btn" type="button" aria-label="Play sentence">
                <span id="playPauseListeningIcon" aria-hidden="true">▶</span>
                <span id="playPauseListeningLabel">Play</span>
              </button>
              <div class="listening-key-hints" aria-hidden="true">
                <span>← less</span>
                <span>space play/pause</span>
                <span>more →</span>
              </div>
            </div>
            <div class="listening-actions">
              <button id="previousListeningBtn" class="ghost-btn">← Hear less</button>
              <button id="translateListeningBtn" class="secondary-btn">Show translation</button>
              <button id="replayListeningBtn" class="secondary-btn">Replay</button>
              <button id="deleteListeningBtn" class="danger-btn">Delete</button>
              <button id="nextListeningBtn" class="ghost-btn">Hear more →</button>
            </div>
          </article>
          <div id="listeningCheckin" class="listening-checkin hidden" role="status">
            <div>
              <h3>Are you still listening?</h3>
              <p>Autoplay is paused. Continue when you’re ready.</p>
            </div>
            <button id="continueListeningBtn" class="primary-btn">Continue listening</button>
          </div>
          <p id="listeningBufferStatus" class="helper"></p>
        </div>
      </section>
    </main>
  </div>

  <div id="settingsModal" class="modal hidden">
    <div class="modal-card">
      <div class="modal-header">
        <h2>Settings</h2>
        <button id="closeSettingsBtn" class="ghost-btn">Close</button>
      </div>
      <div class="settings-modules">
        <section class="settings-module">
          <div class="settings-module-heading"><p class="eyebrow">General</p><h3>Language profile</h3></div>
          <div class="settings-grid">
            <label>Language<select id="languageSelect" class="select-input"></select></label>
            <label>Level<select id="levelSelect" class="select-input"><option>A1 (Beginner)</option><option>A2 (Elementary)</option><option>B1 (Intermediate)</option><option>B2 (Upper Intermediate)</option><option>C1 (Advanced)</option><option>C2 (Proficiency)</option></select></label>
          </div>
        </section>
        <section class="settings-module">
          <div class="settings-module-heading"><p class="eyebrow">Practice text</p><h3>Generation & browser speech</h3></div>
          <div class="settings-grid">
            <label>Browser voice<select id="voiceSelect" class="select-input"></select></label>
            <label>Browser speech speed<input id="speedInput" type="range" min="0.5" max="2" step="0.1" /><span id="speedLabel" class="helper"></span></label>
            <label>Vocabulary words in text<input id="vocabWordsInput" type="range" min="0" max="10" step="1" /><span id="vocabWordsLabel" class="helper"></span></label>
            <label>Vocabulary mix<input id="vocabularyMixInput" type="range" min="0" max="100" step="5" /><span id="vocabularyMixLabel" class="helper"></span><span class="helper">New focus ↔ Known focus</span></label>
            <label>Default subject<select id="subjectSelect" class="select-input"><option>Historical Events</option><option>Daily Life</option><option>Business</option><option>Travel</option><option>Culture</option><option>Science</option></select></label>
          </div>
        </section>
        <section class="settings-module listening-settings-module">
          <div class="settings-module-heading"><p class="eyebrow">Listening</p><h3>Sentence radio</h3></div>
          <div class="settings-grid">
            <label>New + learning words<input id="listeningMixInput" type="range" min="0" max="100" step="5" /><span id="listeningMixLabel" class="helper"></span></label>
            <label>Batch size<input id="listeningBatchSizeInput" type="range" min="3" max="12" step="1" /><span id="listeningBatchSizeLabel" class="helper"></span></label>
            <label>Playback speed<input id="listeningPlaybackSpeedInput" type="range" min="0.5" max="2" step="0.25" /><span id="listeningPlaybackSpeedLabel" class="helper"></span></label>
            <label>Repetitions per sentence<input id="listeningRepetitionsInput" type="range" min="1" max="10" step="1" /><span id="listeningRepetitionsLabel" class="helper"></span></label>
            <label>Gap between plays<input id="listeningGapInput" type="range" min="0" max="10" step="0.5" /><span id="listeningGapLabel" class="helper"></span></label>
            <label>Autoplay check-in after<input id="listeningAutoplayLimitInput" type="range" min="1" max="50" step="1" /><span id="listeningAutoplayLimitLabel" class="helper"></span></label>
            <label class="checkbox-setting"><input id="listeningShowSentenceSettingInput" type="checkbox" /> Show target sentence by default</label>
          </div>
        </section>
        <section class="settings-module">
          <div class="settings-module-heading"><p class="eyebrow">Review</p><h3>Flashcards & quiz</h3></div>
          <div class="settings-grid">
            <label>New to learning after seen<input id="newToLearningInput" type="range" min="1" max="10" step="1" /><span id="newToLearningLabel" class="helper"></span></label>
            <label>Learning to known after correct<input id="learningToKnownInput" type="range" min="1" max="15" step="1" /><span id="learningToKnownLabel" class="helper"></span></label>
            <label>Quiz answer choices<input id="quizOptionCountInput" type="range" min="6" max="12" step="1" /><span id="quizOptionCountLabel" class="helper"></span></label>
          </div>
        </section>
      </div>
      <div class="modal-actions">
        <button id="saveSettingsBtn" class="primary-btn">Save settings</button>
      </div>
    </div>
  </div>

  <div id="imageBrowserModal" class="modal image-browser-modal hidden" role="dialog" aria-modal="true" aria-labelledby="imageBrowserWord">
    <div class="modal-card image-browser-card">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Image gallery</p>
          <h2 id="imageBrowserWord">Vocabulary images</h2>
        </div>
        <button id="closeImageBrowserBtn" class="icon-btn" aria-label="Close image gallery">×</button>
      </div>
      <div id="imageBrowserStage" class="image-browser-stage"></div>
      <div class="image-browser-controls">
        <button id="previousImageBtn" class="ghost-btn">← Previous</button>
        <span id="imageBrowserCounter" class="counter"></span>
        <button id="nextImageBtn" class="ghost-btn">Next →</button>
      </div>
    </div>
  </div>

  <div id="listeningLibraryModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="listeningLibraryTitle">
    <div class="modal-card listening-library-card">
      <div class="modal-header">
        <div><p class="eyebrow">Sentence radio</p><h2 id="listeningLibraryTitle">Sentence library</h2></div>
        <button id="closeListeningLibraryBtn" class="ghost-btn">Close</button>
      </div>
      <div id="listeningLibraryList" class="listening-library-list"></div>
    </div>
  </div>

  <script>
    window.__INITIAL_STATE__ = ${serializeInitialState(initialState)};
${APP_JS}
  </script>
</body>
</html>`;
}

function renderVocabularyCards(vocabulary, settings) {
  return (Array.isArray(vocabulary) ? vocabulary : []).map((item) => {
    const contexts = getCombinedContextPool(item);
    const forms = Array.isArray(item.forms) ? item.forms : [];
    const image = normalizeImageData(item.image || item.image_json || '{}');
    const imageLabel = image ? 'Refresh image' : 'Add image';
    const imageAlt = image ? escapeHtmlServer(image.alt || item.word) : '';
    return [
      '<details class="card vocab-card" data-id="' + escapeHtmlServer(item.id) + '">',
      '<summary class="vocab-summary">',
      '<div>',
      '<h3 class="card-title">' + escapeHtmlServer(item.word) + '</h3>',
      '<p class="summary-hint">Open for translation, mnemonic, and contexts</p>',
      '</div>',
      '<span class="summary-pill">' + escapeHtmlServer(String(contexts.length || 0)) + ' contexts</span>',
      '</summary>',
      '<div class="vocab-body">',
      '<div class="meta-row">',
      '<span class="chip-mini">Seen ' + escapeHtmlServer(String(item.occurrences || 0)) + ' times</span>',
      '<span class="chip-mini">Last ' + escapeHtmlServer(new Date(item.lastSeen).toLocaleDateString()) + '</span>',
      '<span class="chip-mini">' + escapeHtmlServer(item.targetLanguage || (settings && settings.language) || 'Spanish') + '</span>',
      '</div>',
      forms.length ? '<p class="card-meta">Forms: ' + escapeHtmlServer(forms.join(', ')) + '</p>' : '',
      '<div class="card-actions card-actions-wide">',
      '<select class="select-input mastery-select" data-id="' + escapeHtmlServer(item.id) + '">',
      '<option value="new"' + (item.mastery === 'new' ? ' selected' : '') + '>New</option>',
      '<option value="learning"' + (item.mastery === 'learning' ? ' selected' : '') + '>Learning</option>',
      '<option value="known"' + (item.mastery === 'known' ? ' selected' : '') + '>Known</option>',
      '</select>',
      '<button class="secondary-btn save-translation-btn" data-id="' + escapeHtmlServer(item.id) + '">Refresh translation</button>',
      '<button class="secondary-btn save-mnemonic-btn" data-id="' + escapeHtmlServer(item.id) + '">Refresh mnemonic</button>',
      '<button class="secondary-btn generate-contexts-btn" data-id="' + escapeHtmlServer(item.id) + '">More contexts</button>',
      '<button class="secondary-btn generate-image-btn" data-id="' + escapeHtmlServer(item.id) + '">' + escapeHtmlServer(imageLabel) + '</button>',
      '<button class="ghost-btn target-language-btn" data-id="' + escapeHtmlServer(item.id) + '">Use settings language</button>',
      '<button class="ghost-btn delete-word-btn" data-id="' + escapeHtmlServer(item.id) + '">Delete</button>',
      '</div>',
      '<div class="image-block">',
      image ? (
        (image.url ? '<a class="image-link" href="' + escapeHtmlServer(image.sourceUrl || image.url) + '" target="_blank" rel="noreferrer noopener">' +
        '<img class="image-thumb" src="' + escapeHtmlServer(image.url) + '" alt="' + imageAlt + '" loading="lazy" />' +
        '</a>' : '<div class="image-empty">' + escapeHtmlServer(image.status === 'queued' ? 'Image queued' : image.status === 'generating' ? 'Generating image…' : image.status === 'failed' ? 'Image failed' : 'No image yet') + '</div>') +
        (image.status && image.status !== 'ready' ? '<p class="image-status">Status: ' + escapeHtmlServer(image.status) + '</p>' : '') +
        '<p class="image-credit">' +
        (image.provider === 'openai'
          ? 'Generated with OpenAI'
          : image.photographer
            ? 'Photo by ' + escapeHtmlServer(image.photographer)
            : 'Image') +
        (image.photographerUrl ? ' on <a href="' + escapeHtmlServer(image.photographerUrl) + '" target="_blank" rel="noreferrer noopener">source</a>' : '') +
        '</p>'
      ) : '<div class="image-empty">No image yet</div>',
      '</div>',
      '<div class="tile-grid">',
      '<section class="note-block">',
      '<div class="note-head"><h4>Translation</h4></div>',
      '<p class="note-body">' + escapeHtmlServer(item.translation || 'None saved') + '</p>',
      '</section>',
      '<section class="note-block">',
      '<div class="note-head"><h4>Mnemonic</h4></div>',
      '<p class="note-body">' + escapeHtmlServer(item.mnemonic || 'None saved') + '</p>',
      '</section>',
      '</div>',
      contexts.length ? '<div class="context-grid">' + contexts.map((sentence) => {
        const cleanSentence = normalizeExampleSentence(sentence);
        return cleanSentence ? '<article class="context-tile">' + escapeHtmlServer(cleanSentence) + '</article>' : '';
      }).join('') + '</div>' : '',
      '</div>',
      '</details>'
    ].join('');
  }).join('');
}

function serializeInitialState(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtmlServer(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const APP_CSS = `
:root {
  color-scheme: light;
  --bg: #f4efe7;
  --bg-2: #e9f2ff;
  --panel: rgba(255, 255, 255, 0.72);
  --panel-strong: rgba(255, 255, 255, 0.92);
  --border: rgba(31, 41, 55, 0.12);
  --text: #172033;
  --muted: #5d6b85;
  --accent: #2457ff;
  --accent-2: #ff9d45;
  --success: #1f8a61;
  --danger: #d94a4a;
  --shadow: 0 25px 60px rgba(24, 39, 75, 0.14);
}

* { box-sizing: border-box; }
html, body { min-height: 100%; }
body {
  margin: 0;
  color: var(--text);
  font-family: 'Space Grotesk', system-ui, sans-serif;
  background:
    radial-gradient(circle at top left, rgba(36, 87, 255, 0.16), transparent 28%),
    radial-gradient(circle at top right, rgba(255, 157, 69, 0.20), transparent 24%),
    linear-gradient(180deg, var(--bg), var(--bg-2));
}

.page-shell {
  max-width: 1260px;
  margin: 0 auto;
  padding: 28px 18px 48px;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255,255,255,0.90), rgba(255,255,255,0.66));
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.74rem;
  color: var(--muted);
}

h1, h2, h3 { font-family: 'Fraunces', Georgia, serif; margin: 0; }
h1 { font-size: clamp(2.4rem, 5vw, 4.6rem); line-height: 0.95; }
.lede { max-width: 58ch; color: var(--muted); font-size: 1.05rem; line-height: 1.7; margin: 14px 0 0; }

.hero-meta { display: flex; flex-direction: column; gap: 14px; align-items: end; }
.chip-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: end; }
.chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.75);
  border: 1px solid var(--border);
  font-size: 0.9rem;
}

.workspace { margin-top: 24px; display: grid; gap: 18px; }
.toolbar {
  display: inline-flex;
  gap: 8px;
  padding: 8px;
  border-radius: 20px;
  background: rgba(255,255,255,0.65);
  border: 1px solid var(--border);
  box-shadow: 0 14px 30px rgba(24, 39, 75, 0.08);
}

.tab-btn, .primary-btn, .secondary-btn, .success-btn, .danger-btn, .ghost-btn {
  border: 0;
  border-radius: 16px;
  padding: 12px 16px;
  font: inherit;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;
}
.tab-btn:hover, .primary-btn:hover, .secondary-btn:hover, .success-btn:hover, .danger-btn:hover, .ghost-btn:hover { transform: translateY(-1px); }
.tab-btn {
  background: transparent;
  color: var(--muted);
  padding-inline: 18px;
}
.tab-btn.active {
  background: #ffffff;
  color: var(--text);
  box-shadow: 0 10px 24px rgba(24, 39, 75, 0.12);
}

.primary-btn { background: linear-gradient(135deg, var(--accent), #5c79ff); color: #fff; box-shadow: 0 14px 28px rgba(36, 87, 255, 0.25); }
.secondary-btn { background: #fff; border: 1px solid var(--border); color: var(--text); }
.success-btn { background: linear-gradient(135deg, #1f8a61, #30b47f); color: #fff; }
.danger-btn { background: linear-gradient(135deg, #d94a4a, #f06a6a); color: #fff; }
.ghost-btn, .link-btn {
  background: rgba(255,255,255,0.8);
  border: 1px solid var(--border);
  color: var(--text);
}
.link-btn { padding: 0; border: 0; background: transparent; color: var(--accent); }

.panel, .modal-card, .story-card, .flashcard-card, .composer, .card, .empty-state {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 24px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}
.card { overflow: hidden; }
.panel { padding: 22px; }
.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
  margin-bottom: 18px;
}
.panel-header p, .helper, .empty-state p, .card-meta, .counter, .story-footer, .status-banner { color: var(--muted); }
.panel-actions, .nav-row, .composer-actions, .flashcard-actions, .flashcard-links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.nav-row {
  justify-content: space-between;
  margin: 10px 0 18px;
}
.counter { min-width: 110px; text-align: center; }

.text-input, .select-input, .textarea-input {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(31, 41, 55, 0.14);
  background: rgba(255,255,255,0.82);
  color: var(--text);
  padding: 12px 14px;
  font: inherit;
}
.textarea-input { resize: vertical; min-height: 96px; }

.story-card {
  padding: 24px;
  min-height: 360px;
}
.story-text {
  font-size: 1.12rem;
  line-height: 1.95;
  letter-spacing: 0.01em;
}
.story-word {
  cursor: text;
  display: inline;
  margin: 0 1px;
  padding: 0 2px;
  border-radius: 6px;
  transition: background 0.16s ease, transform 0.16s ease;
  user-select: text;
  -webkit-user-select: text;
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}
.story-word:hover {
  background: rgba(36, 87, 255, 0.10);
  transform: translateY(-1px);
}
.story-word:focus-visible {
  outline: 2px solid rgba(36, 87, 255, 0.6);
  outline-offset: 2px;
}
.story-word.vocab {
  background: rgba(255, 157, 69, 0.18);
}
.story-word.selected {
  background: rgba(36, 87, 255, 0.22);
  box-shadow: inset 0 -0.5em 0 rgba(36, 87, 255, 0.12);
}
.story-footer {
  margin-top: 22px;
  display: grid;
  gap: 14px;
}
.topics-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  counter-reset: topic-choice;
}
.topic-item {
  counter-increment: topic-choice;
  width: 100%;
  text-align: left;
  padding: 18px 18px 18px 54px;
  min-height: 84px;
  position: relative;
  border-radius: 20px;
  border: 1px solid rgba(36, 87, 255, 0.14);
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(237,243,255,.86));
  box-shadow: 0 9px 22px rgba(45,64,110,.08);
  color: var(--text);
  font: 600 1.04rem/1.45 'Space Grotesk', sans-serif;
  cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
.topic-item::before {
  content: counter(topic-choice);
  position: absolute;
  left: 16px;
  top: 17px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent), #7a63ef);
  color: white;
  font-size: .78rem;
}
.topic-item:hover {
  transform: translateY(-2px);
  border-color: rgba(36,87,255,.32);
  box-shadow: 0 15px 30px rgba(45,64,110,.14);
}

.composer { padding: 16px; margin-bottom: 18px; }
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 18px;
  align-items: start;
}
.vocab-card {
  --mastery-accent: #ff8b5c;
  --mastery-soft: rgba(255, 139, 92, 0.13);
  padding: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 92% 8%, var(--mastery-soft), transparent 36%),
    linear-gradient(145deg, rgba(255,255,255,0.98), rgba(246,248,255,0.9));
  border-color: color-mix(in srgb, var(--mastery-accent) 32%, transparent);
  border-top: 4px solid var(--mastery-accent);
  box-shadow: 0 12px 30px rgba(45, 64, 110, 0.10);
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
}
.vocab-card.mastery-learning { --mastery-accent: #7257e8; --mastery-soft: rgba(114, 87, 232, .13); }
.vocab-card.mastery-known { --mastery-accent: #20a477; --mastery-soft: rgba(32, 164, 119, .13); }
.vocab-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 20px 42px rgba(45, 64, 110, 0.17);
}
.vocab-card[open] {
  grid-column: span 2;
  transform: none;
  box-shadow: 0 22px 54px rgba(45, 64, 110, 0.16);
}
.vocab-card > summary {
  list-style: none;
  display: flex;
  justify-content: stretch;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  padding: 15px 16px;
  text-align: left;
}
.vocab-card > summary::-webkit-details-marker { display: none; }
.vocab-card[open] > summary {
  border-bottom: 1px solid rgba(31, 41, 55, 0.08);
  background: linear-gradient(90deg, var(--mastery-soft), rgba(255,255,255,.5));
}
.summary-hint {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.summary-pill {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--mastery-soft);
  color: var(--mastery-accent);
  white-space: nowrap;
  font-size: .78rem;
  font-weight: 700;
}
.vocab-hero-summary {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 22px;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 13px;
  row-gap: 5px;
  width: 100%;
}
.vocab-hero-summary::after {
  content: '›';
  grid-column: 3;
  grid-row: 1 / 3;
  font-size: 1.7rem;
  color: var(--mastery-accent);
  transition: transform .2s ease;
}
.vocab-card[open] .vocab-hero-summary::after { transform: rotate(90deg); }
.summary-image {
  grid-column: 1;
  grid-row: 1 / 3;
  width: 72px;
  aspect-ratio: 1;
  border-radius: 18px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #eef3ff, #fff7ec);
  border: 1px solid rgba(36, 87, 255, 0.14);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--mastery-accent) 20%, transparent);
  color: var(--muted);
  font-size: 0.82rem;
}
.summary-image img { width: 100%; height: 100%; object-fit: cover; }
.vocab-hero-summary .card-title { grid-column: 2; grid-row: 1; align-self: end; margin: 0; }
.summary-meta { grid-column: 2; grid-row: 2; display: flex; align-items: center; gap: 8px; min-width: 0; }
.summary-meta .summary-hint { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vocab-body {
  display: grid;
  gap: 12px;
  padding: 14px 16px 16px;
}
.card-actions-wide {
  justify-content: flex-start;
  align-items: center;
}
.card-actions-wide .mastery-select { width: auto; min-width: 130px; margin-right: auto; }
.vocab-overview {
  display: grid;
  grid-template-columns: minmax(150px, .65fr) minmax(0, 1.35fr);
  gap: 12px;
  align-items: stretch;
}
.tile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.context-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.context-tile {
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(247,249,255,.78));
  box-shadow: 0 7px 18px rgba(45,64,110,.06);
  line-height: 1.55;
}
.card-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}
.card-title {
  font-size: 1.3rem;
  margin: 0 0 6px;
}
.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: end;
}
.image-block {
  display: grid;
  gap: 8px;
  width: 100%;
  justify-self: center;
  text-align: center;
}
.image-link {
  display: block;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.72);
}
.image-thumb {
  display: block;
  width: 100%;
  max-height: 155px;
  aspect-ratio: 1;
  object-fit: contain;
  background: rgba(255,255,255,0.9);
}
.image-credit, .image-empty {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}
.image-status {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.image-empty {
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px dashed var(--border);
  background: rgba(255,255,255,0.54);
}
.note-grid {
  display: grid;
  gap: 12px;
}
.note-block {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(248,249,255,.82));
  box-shadow: 0 8px 20px rgba(45,64,110,.06);
}
.note-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}
.note-head h4 {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
}
.icon-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid rgba(36, 87, 255, 0.15);
  background: rgba(255,255,255,0.88);
  color: var(--accent);
  font: 700 1.1rem/1 inherit;
  cursor: pointer;
  display: inline-grid;
  place-items: center;
  transition: transform .16s ease, box-shadow .16s ease;
}
.icon-btn:hover { transform: rotate(8deg) translateY(-1px); box-shadow: 0 8px 20px rgba(36,87,255,.14); }
.context-section { display: grid; gap: 10px; }
.context-section .note-head { margin: 0; }
.image-browser-modal { padding: 20px; }
.image-browser-card { width: min(760px, 100%); }
.image-browser-stage { min-height: 440px; display: grid; place-items: center; text-align: center; }
.image-browser-stage img { max-width: 100%; max-height: 58vh; border-radius: 24px; box-shadow: 0 24px 60px rgba(23,32,51,.22); }
.image-browser-stage p { color: var(--muted); }
.image-browser-controls { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.note-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: end;
}
.note-body {
  margin: 0;
  line-height: 1.7;
}
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  font-size: 0.92rem;
  color: var(--muted);
}
.chip-mini {
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(255,255,255,0.8);
  border: 1px solid var(--border);
}

.flashcard-state {
  display: grid;
  gap: 16px;
}
.flashcard-topline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
}
.flashcard-card {
  padding: 28px;
  min-height: 280px;
  display: grid;
  gap: 16px;
  place-items: center;
  text-align: center;
}
.flashcard-context-wrap {
  display: grid;
  gap: 14px;
  width: min(100%, 520px);
  justify-items: center;
}
.flashcard-context {
  margin: 0;
  cursor: pointer;
  user-select: text;
  line-height: 1.7;
}
.flashcard-image {
  width: min(220px, 100%);
}
.flashcard-image-link {
  display: block;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.92);
}
.flashcard-image-thumb {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: rgba(255,255,255,0.96);
}
.flashcard-card h3 {
  font-size: clamp(2rem, 5vw, 3.6rem);
  line-height: 1;
}
.translation {
  color: var(--accent);
  font-size: 1.05rem;
  line-height: 1.8;
}
.flashcard-actions {
  justify-content: space-between;
}
.flashcard-actions > button { flex: 1; }
.flashcard-bottom { text-align: center; }

.quiz-shell {
  width: min(820px, 100%);
  margin: 10px auto 0;
  display: grid;
  gap: 12px;
}
.quiz-topline {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-weight: 700;
}
.quiz-card {
  position: relative;
  overflow: hidden;
  padding: clamp(24px, 5vw, 48px);
  border: 1px solid rgba(114,87,232,.18);
  border-radius: 30px;
  background:
    radial-gradient(circle at 90% 5%, rgba(255,157,69,.18), transparent 35%),
    radial-gradient(circle at 8% 92%, rgba(114,87,232,.14), transparent 38%),
    rgba(255,255,255,.88);
  box-shadow: 0 24px 60px rgba(45,64,110,.14);
  text-align: center;
}
.quiz-card h3 {
  margin: 8px 0 28px;
  font: 700 clamp(1.55rem, 3.6vw, 2.55rem)/1.3 'Fraunces', serif;
  color: var(--text);
}
.quiz-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.quiz-option {
  min-height: 64px;
  padding: 14px 18px;
  border: 1px solid rgba(36,87,255,.15);
  border-radius: 18px;
  background: rgba(255,255,255,.94);
  color: var(--text);
  font: 700 1.08rem/1.3 'Space Grotesk', sans-serif;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(45,64,110,.07);
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
}
.quiz-option:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--accent); box-shadow: 0 13px 28px rgba(45,64,110,.13); }
.quiz-option.correct { color: #126b4c; border-color: #30b47f; background: rgba(48,180,127,.13); }
.quiz-option.wrong { color: #a12d2d; border-color: #f06a6a; background: rgba(240,106,106,.12); }
.quiz-option:disabled { cursor: default; }
.quiz-feedback { min-height: 24px; margin: 20px 0 0; color: var(--muted); font-weight: 600; }
.quiz-feedback.success { color: var(--success); }
.quiz-feedback.error { color: var(--danger); }

.listening-shell { display: grid; gap: 16px; }
.listening-topline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}
.listening-actions {
  width: min(680px, 100%);
  display: grid;
  grid-template-columns: repeat(5, minmax(0, auto));
  justify-content: center;
  gap: 10px;
}
.continuous-toggle { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.compact-control { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.compact-control .select-input { width: auto; min-width: 86px; padding: 8px 10px; }
.listening-card {
  padding: clamp(22px, 4vw, 46px);
  min-height: 330px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(255,255,255,.92), rgba(238,242,255,.78));
  box-shadow: var(--shadow);
}
.listening-card h3 {
  width: min(100%, 34ch);
  overflow-wrap: anywhere;
  font-size: clamp(1.45rem, 4vw, 2.7rem);
  line-height: 1.35;
}
.listening-meta { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; }
.listening-meta .eyebrow { margin: 0; }
.listening-count { color: var(--muted); font-size: .78rem; }
.listening-card .story-word { cursor: pointer; }
.listening-card audio { display: none; }
.listening-player {
  width: min(560px, 100%);
  display: grid;
  justify-items: center;
  gap: 10px;
}
.listening-play-btn {
  width: min(250px, 100%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: 999px;
  padding: 16px 24px;
  font: inherit;
  font-weight: 800;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, var(--accent), #6f8cff);
  box-shadow: 0 18px 36px rgba(36, 87, 255, 0.27);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.listening-play-btn:hover { transform: translateY(-1px); box-shadow: 0 22px 40px rgba(36, 87, 255, 0.32); }
.listening-play-btn:disabled { cursor: not-allowed; opacity: .55; transform: none; box-shadow: none; }
.listening-key-hints {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: .78rem;
}
.listening-key-hints span {
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(255,255,255,.72);
  border: 1px solid var(--border);
}
.listening-words { min-height: 24px; margin: 0; color: var(--accent); font-weight: 600; }
.listening-translation { max-width: 52ch; margin: 0; color: var(--muted); font-size: 1.05rem; line-height: 1.6; }
.listening-checkin {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px;
  border-radius: 20px;
  border: 1px solid rgba(36,87,255,.22);
  background: rgba(238,242,255,.92);
}
.listening-checkin p { margin: 5px 0 0; color: var(--muted); }
.listening-library-card { width: min(920px, 100%); }
.listening-library-list { display: grid; gap: 10px; margin-top: 18px; }
.listening-library-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(255,255,255,.7);
}
.listening-library-item p { margin: 4px 0 0; color: var(--muted); }
.listening-library-meta { font-size: .78rem; }

.empty-state {
  display: grid;
  place-items: center;
  padding: 56px 24px;
  text-align: center;
}
.modal {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.44);
  display: grid;
  place-items: center;
  padding: 18px;
}
.modal-card {
  width: min(760px, 100%);
  max-height: min(900px, calc(100vh - 36px));
  overflow-y: auto;
  padding: 22px;
  background: var(--panel-strong);
}
.modal-header, .modal-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 18px 0;
}
.settings-grid label {
  display: grid;
  gap: 8px;
}
.settings-grid .checkbox-setting { display: flex; align-items: center; align-self: center; }
.settings-modules { display: grid; gap: 16px; margin: 18px 0; }
.settings-module {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: rgba(255,255,255,.58);
}
.settings-module .settings-grid { margin: 16px 0 0; }
.settings-module-heading .eyebrow { margin-bottom: 5px; }
.listening-settings-module { background: linear-gradient(145deg, rgba(238,242,255,.9), rgba(255,255,255,.66)); }

.status-banner {
  position: fixed;
  z-index: 100;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: min(420px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.78);
  box-shadow: 0 18px 48px rgba(23,32,51,.18);
  backdrop-filter: blur(18px);
  pointer-events: none;
  animation: status-in .18s ease-out;
}
@keyframes status-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
.status-banner.success { color: var(--success); }
.status-banner.error { color: var(--danger); }

.hidden { display: none !important; }

@media (max-width: 860px) {
  .hero, .panel-header, .card-head, .nav-row, .flashcard-actions, .modal-header, .modal-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .page-shell {
    padding: 0 0 36px;
  }
  .panel {
    padding: 16px;
  }
  .story-card {
    padding: 16px;
  }
  .vocab-card > summary {
    padding: 16px;
  }
  .vocab-body {
    padding: 16px;
  }
  .tile-grid {
    grid-template-columns: 1fr;
  }
  .vocab-overview {
    grid-template-columns: minmax(135px, .55fr) minmax(0, 1.45fr);
  }
  .image-block {
    width: 100%;
  }
  .card-actions-wide {
    justify-content: stretch;
  }
  .card-actions-wide > button,
  .card-actions-wide > select {
    width: 100%;
  }
  .context-grid {
    grid-template-columns: 1fr;
  }
  .hero-meta { align-items: start; }
  .settings-grid { grid-template-columns: 1fr; }
  .flashcard-actions > button { width: 100%; }
  .listening-topline { justify-content: stretch; }
  .listening-topline > * { flex: 1 1 140px; }
  .listening-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
  .listening-actions > button { min-width: 0; padding-inline: 12px; }
  .listening-actions #previousListeningBtn { order: 1; }
  .listening-actions #nextListeningBtn { order: 2; }
  .listening-actions #translateListeningBtn { order: 3; }
  .listening-actions #replayListeningBtn { order: 4; }
  .listening-actions #deleteListeningBtn { order: 5; }
  .listening-actions #translateListeningBtn { grid-column: span 2; }
  .listening-checkin { align-items: stretch; flex-direction: column; }
}
@media (max-width: 620px) {
  .quiz-options { grid-template-columns: 1fr; }
  .topics-list { grid-template-columns: 1fr; }
  .card-grid { grid-template-columns: 1fr; }
  .vocab-card[open] { grid-column: span 1; }
  .vocab-overview { grid-template-columns: 1fr; }
  .image-block { width: min(190px, 100%); }
  .context-grid { grid-template-columns: 1fr; }
  .card-actions-wide .mastery-select { width: 100%; margin-right: 0; }
}
`;

const APP_JS = String.raw`
(async function () {
  function cleanExampleSentence(sentence) {
    let text = String(sentence || '').trim();
    const fence = String.fromCharCode(96, 96, 96);
    if (text.toLowerCase().startsWith('example: [') || text.toLowerCase().startsWith('example: ' + fence)) {
      text = text.replace(/^Example:\s*/i, '');
    }
    text = text.replace(/^Example:\s*/i, '');
    text = text.split(fence + 'json').join('');
    text = text.split(fence).join('');
    text = text.replace(/^\s*[\[\(]+\s*/, '');
    text = text.replace(/\s*[\]\)]+\s*$/, '');
    text = text.replace(/^\s*[\d.-]+\s*/, '');
    text = text.replace(/^\s*["']+/, '');
    text = text.replace(/["']+$/, '');
    text = text.replace(/,\s*$/, '');
    return text.trim();
  }

  const state = {
    settings: null,
    vocabulary: [],
    history: [],
    historyIndex: -1,
    tab: 'text',
    vocabFilter: 'all',
    vocabSearch: '',
    flashcardFilter: 'all',
    flashcardCount: 10,
    flashcards: [],
    flashcardIndex: 0,
    flashcardStats: { known: 0, unknown: 0 },
    flashcardTranslationVisible: false,
    flashcardContextVisible: false,
    flashcardContextIndex: -1,
    flashcardContextPool: [],
    flashcardExposureLoggedForId: '',
    flashcardActiveId: '',
    ignoreNextTextClick: false,
    voices: [],
    selectedStoryWord: null,
    imageRefreshTimer: 0,
    openVocabularyIds: new Set(),
    imageBrowserIndex: 0,
    quizQuestion: null,
    quizAnswered: false,
    quizScore: 0,
    quizTotal: 0,
    quizPreviousId: '',
    listeningSentences: [],
    listeningIndex: -1,
    listeningGenerating: false,
    listeningLoaded: false,
    listeningRepetition: 0,
    listeningAutoplayCount: 0,
    listeningGapTimer: 0,
    listeningTranslationVisible: false
  };

  const CACHE_KEY = 'language-learner-state-v1';

  const els = {
    statusBanner: byId('statusBanner'),
    textView: byId('textView'),
    vocabularyView: byId('vocabularyView'),
    flashcardsView: byId('flashcardsView'),
    quizView: byId('quizView'),
    listeningView: byId('listeningView'),
    tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
    generateTextBtn: byId('generateTextBtn'),
    topicInput: byId('topicInput'),
    vocabularyModeSelect: byId('vocabularyModeSelect'),
    currentText: byId('currentText'),
    historyCounter: byId('historyCounter'),
    prevHistoryBtn: byId('prevHistoryBtn'),
    nextHistoryBtn: byId('nextHistoryBtn'),
    listenBtn: byId('listenBtn'),
    generateTopicsBtn: byId('generateTopicsBtn'),
    topicsList: byId('topicsList'),
    vocabList: byId('vocabList'),
    browseImagesBtn: byId('browseImagesBtn'),
    vocabSearchInput: byId('vocabSearchInput'),
    vocabFilter: byId('vocabFilter'),
    phraseInput: byId('phraseInput'),
    addPhraseBtn: byId('addPhraseBtn'),
    flashcardFilter: byId('flashcardFilter'),
    flashcardCount: byId('flashcardCount'),
    startSessionBtn: byId('startSessionBtn'),
    flashcardState: byId('flashcardState'),
    flashcardEmpty: byId('flashcardEmpty'),
    flashcardProgress: byId('flashcardProgress'),
    flashcardStats: byId('flashcardStats'),
    flashcardWord: byId('flashcardWord'),
    flashcardContext: byId('flashcardContext'),
    flashcardContextWrap: byId('flashcardContextWrap'),
    flashcardImage: byId('flashcardImage'),
    flashcardTranslation: byId('flashcardTranslation'),
    toggleContextBtn: byId('toggleContextBtn'),
    toggleTranslationBtn: byId('toggleTranslationBtn'),
    moreExamplesBtn: byId('moreExamplesBtn'),
    knowBtn: byId('knowBtn'),
    dontKnowBtn: byId('dontKnowBtn'),
    endSessionBtn: byId('endSessionBtn'),
    newQuizQuestionBtn: byId('newQuizQuestionBtn'),
    quizTranslation: byId('quizTranslation'),
    quizLanguage: byId('quizLanguage'),
    quizOptions: byId('quizOptions'),
    quizFeedback: byId('quizFeedback'),
    quizProgress: byId('quizProgress'),
    quizScore: byId('quizScore'),
    generateListeningBtn: byId('generateListeningBtn'),
    listeningCounter: byId('listeningCounter'),
    listeningVoice: byId('listeningVoice'),
    listeningCount: byId('listeningCount'),
    listeningSentence: byId('listeningSentence'),
    listeningTranslation: byId('listeningTranslation'),
    translateListeningBtn: byId('translateListeningBtn'),
    listeningWords: byId('listeningWords'),
    listeningAudio: byId('listeningAudio'),
    playPauseListeningBtn: byId('playPauseListeningBtn'),
    playPauseListeningIcon: byId('playPauseListeningIcon'),
    playPauseListeningLabel: byId('playPauseListeningLabel'),
    previousListeningBtn: byId('previousListeningBtn'),
    replayListeningBtn: byId('replayListeningBtn'),
    nextListeningBtn: byId('nextListeningBtn'),
    continuousListeningInput: byId('continuousListeningInput'),
    randomListeningOrderInput: byId('randomListeningOrderInput'),
    showListeningSentenceInput: byId('showListeningSentenceInput'),
    listeningSpeedSelect: byId('listeningSpeedSelect'),
    listeningCheckin: byId('listeningCheckin'),
    continueListeningBtn: byId('continueListeningBtn'),
    deleteListeningBtn: byId('deleteListeningBtn'),
    listeningBufferStatus: byId('listeningBufferStatus'),
    openListeningLibraryBtn: byId('openListeningLibraryBtn'),
    listeningLibraryModal: byId('listeningLibraryModal'),
    closeListeningLibraryBtn: byId('closeListeningLibraryBtn'),
    listeningLibraryList: byId('listeningLibraryList'),
    openSettingsBtn: byId('openSettingsBtn'),
    settingsModal: byId('settingsModal'),
    closeSettingsBtn: byId('closeSettingsBtn'),
    saveSettingsBtn: byId('saveSettingsBtn'),
    languageSelect: byId('languageSelect'),
    voiceSelect: byId('voiceSelect'),
    speedInput: byId('speedInput'),
    speedLabel: byId('speedLabel'),
    vocabWordsInput: byId('vocabWordsInput'),
    vocabWordsLabel: byId('vocabWordsLabel'),
    vocabularyMixInput: byId('vocabularyMixInput'),
    vocabularyMixLabel: byId('vocabularyMixLabel'),
    quizOptionCountInput: byId('quizOptionCountInput'),
    quizOptionCountLabel: byId('quizOptionCountLabel'),
    listeningMixInput: byId('listeningMixInput'),
    listeningMixLabel: byId('listeningMixLabel'),
    listeningBatchSizeInput: byId('listeningBatchSizeInput'),
    listeningBatchSizeLabel: byId('listeningBatchSizeLabel'),
    listeningPlaybackSpeedInput: byId('listeningPlaybackSpeedInput'),
    listeningPlaybackSpeedLabel: byId('listeningPlaybackSpeedLabel'),
    listeningRepetitionsInput: byId('listeningRepetitionsInput'),
    listeningRepetitionsLabel: byId('listeningRepetitionsLabel'),
    listeningGapInput: byId('listeningGapInput'),
    listeningGapLabel: byId('listeningGapLabel'),
    listeningAutoplayLimitInput: byId('listeningAutoplayLimitInput'),
    listeningAutoplayLimitLabel: byId('listeningAutoplayLimitLabel'),
    listeningShowSentenceSettingInput: byId('listeningShowSentenceSettingInput'),
    newToLearningInput: byId('newToLearningInput'),
    newToLearningLabel: byId('newToLearningLabel'),
    learningToKnownInput: byId('learningToKnownInput'),
    learningToKnownLabel: byId('learningToKnownLabel'),
    subjectSelect: byId('subjectSelect'),
    levelSelect: byId('levelSelect'),
    imageBrowserModal: byId('imageBrowserModal'),
    closeImageBrowserBtn: byId('closeImageBrowserBtn'),
    imageBrowserStage: byId('imageBrowserStage'),
    imageBrowserWord: byId('imageBrowserWord'),
    imageBrowserCounter: byId('imageBrowserCounter'),
    previousImageBtn: byId('previousImageBtn'),
    nextImageBtn: byId('nextImageBtn')
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showStatus(message, type) {
    els.statusBanner.textContent = message;
    els.statusBanner.className = 'status-banner ' + (type || '');
    els.statusBanner.classList.remove('hidden');
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(function () {
      els.statusBanner.classList.add('hidden');
    }, 2400);
  }

  function persistState() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        settings: state.settings,
        vocabulary: state.vocabulary,
        history: state.history
      }));
    } catch {}
  }

  function restoreCachedState() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      return {
        settings: normalizeSettings(cached.settings || {}),
        vocabulary: Array.isArray(cached.vocabulary) ? cached.vocabulary : [],
        history: Array.isArray(cached.history) ? cached.history : []
      };
    } catch {
      return null;
    }
  }

  function api(path, options) {
    return fetch(path, Object.assign(
      {
        headers: { 'content-type': 'application/json' }
      },
      options || {}
    )).then(async function (response) {
      const data = await response.json().catch(function () { return null; });
      if (!response.ok) {
        throw new Error((data && data.error) || 'Request failed');
      }
      return data;
    });
  }

  function normalizeSettings(settings) {
    return {
      id: 'default',
      language: settings.language || 'Spanish',
      voice: settings.voice || '',
      speed: Number(settings.speed || 1),
      subject: settings.subject || 'Historical Events',
      level: settings.level || 'A1 (Beginner)',
      vocab_words_count: Number(settings.vocab_words_count ?? 3),
      vocabulary_mix: clampPercentage(settings.vocabulary_mix ?? 50),
      quiz_option_count: Math.min(12, Math.max(6, Number(settings.quiz_option_count || 8))),
      listening_new_learning_percent: clampPercentage(settings.listening_new_learning_percent ?? 85),
      listening_batch_size: Math.min(12, Math.max(3, Number(settings.listening_batch_size || 8))),
      listening_playback_speed: Math.min(2, Math.max(0.5, Number(settings.listening_playback_speed || 1))),
      listening_repetitions: Math.min(10, Math.max(1, Number(settings.listening_repetitions || 1))),
      listening_gap_seconds: Math.min(10, Math.max(0, Number(settings.listening_gap_seconds) || 0)),
      listening_autoplay_phrase_limit: Math.min(100, Math.max(1, Number(settings.listening_autoplay_phrase_limit || 10))),
      listening_show_sentence: Boolean(settings.listening_show_sentence),
      listening_random_order: settings.listening_random_order !== false && Number(settings.listening_random_order) !== 0,
      new_to_learning_seen_threshold: Number(settings.new_to_learning_seen_threshold || 3),
      learning_to_known_success_threshold: Number(settings.learning_to_known_success_threshold || 5)
    };
  }

  function clampPercentage(value) {
    return Math.min(100, Math.max(0, Number(value) || 0));
  }

  function vocabularyMixLabel(value) {
    const mix = clampPercentage(value);
    const newPercent = Math.round((100 - mix) / 2);
    const knownPercent = Math.round(mix / 2);
    return newPercent + '% new · 50% learning · ' + knownPercent + '% known';
  }

  function toLowerClean(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }

  function tokenize(text) {
    return String(text || '').split(/(\s+)/);
  }

  function normalizeSelectedText(value) {
    return String(value || '')
      .trim()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .trim();
  }

  function getSelectionTextWithin(element) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return '';
    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return '';
    return normalizeSelectedText(selection.toString());
  }

  function clearCurrentSelection() {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }

  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .filter(Boolean)
      .map(function (value) {
        return String(value).trim();
      })
      .filter(Boolean)));
  }

  function normalizeImageData(value) {
    var source = value;
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch (error) {
        source = null;
      }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return null;
    }
    var url = String(source.url || source.thumbnail || source.src || '').trim();
    var status = String(source.status || '').trim();
    var jobId = String(source.jobId || source.job_id || '').trim();
    var prompt = String(source.prompt || source.promptText || '').trim();
    var error = String(source.error || source.lastError || '').trim();
    var provider = String(source.provider || '').trim();
    var r2Key = String(source.r2Key || source.r2_key || '').trim();
    if (!url && !status && !jobId && !prompt && !error && !r2Key) {
      return null;
    }
    return {
      id: String(source.id || '').trim(),
      url: url,
      status: status,
      jobId: jobId,
      alt: String(source.alt || source.description || '').trim(),
      photographer: String(source.photographer || source.photographer_name || '').trim(),
      photographerUrl: String(source.photographerUrl || source.photographer_url || source.creator_url || '').trim(),
      sourceUrl: String(source.sourceUrl || source.source_url || source.url || '').trim(),
      query: String(source.query || '').trim(),
      prompt: prompt,
      error: error,
      provider: provider,
      r2Key: r2Key,
      width: Number(source.width || 0),
      height: Number(source.height || 0),
      createdAt: String(source.createdAt || source.created_at || '').trim(),
      updatedAt: String(source.updatedAt || source.updated_at || '').trim()
    };
  }

  function getCombinedContextPool(item) {
    const contexts = Array.isArray(item && item.contexts) ? item.contexts : [];
    const examples = Array.isArray(item && item.examples) ? item.examples : [];
    return uniqueStrings([].concat(contexts, examples).map(function (entry) {
      return cleanExampleSentence(entry);
    }).filter(Boolean));
  }

  function renderText() {
    const item = state.history[state.historyIndex];
    if (!item) {
      els.currentText.innerHTML = '<p class="card-meta">Generate your first text to begin.</p>';
      els.historyCounter.textContent = '0 / 0';
      els.topicsList.classList.add('hidden');
      return;
    }

    const vocabWords = new Set(state.vocabulary.map(function (row) { return row.word; }));
    els.currentText.dataset.full = item.text;
    els.currentText.innerHTML = tokenize(item.text).map(function (token) {
      if (/^\s+$/.test(token)) {
        return token;
      }
      var clean = toLowerClean(token);
      var classes = ['story-word'];
      if (clean && vocabWords.has(clean)) {
        classes.push('vocab');
      }
      if (state.selectedStoryWord && clean === state.selectedStoryWord.word) {
        classes.push('selected');
      }
      return '<span class="' + classes.join(' ') + '" role="button" tabindex="0" aria-label="Add ' + escapeHtml(clean || token) + ' to vocabulary" data-word="' + escapeHtml(clean) + '">' + escapeHtml(token) + '</span>';
    }).join('');

    els.historyCounter.textContent = (state.historyIndex + 1) + ' / ' + state.history.length;

    if (item.related_topics_json && item.related_topics_json.length) {
      var topics = item.related_topics_json;
      els.topicsList.innerHTML = topics.map(function (topic) {
        return '<button class="topic-item" data-topic="' + escapeHtml(topic) + '">' + escapeHtml(topic) + '</button>';
      }).join('');
      els.topicsList.classList.remove('hidden');
    } else {
      els.topicsList.innerHTML = '';
      els.topicsList.classList.add('hidden');
    }

    els.prevHistoryBtn.disabled = state.historyIndex <= 0;
    els.nextHistoryBtn.disabled = state.historyIndex >= state.history.length - 1;
  }

  function renderVocabulary() {
    els.vocabList.querySelectorAll('details.vocab-card[open]').forEach(function (card) {
      state.openVocabularyIds.add(card.dataset.id);
    });
    const filter = state.vocabFilter;
    const search = state.vocabSearch.trim().toLowerCase();
    const items = state.vocabulary.filter(function (item) {
      const matchesFilter = filter === 'all' || item.mastery === filter;
      const matchesSearch =
        !search ||
        item.word.toLowerCase().includes(search) ||
        (item.translation || '').toLowerCase().includes(search) ||
        (item.mnemonic || '').toLowerCase().includes(search) ||
        getCombinedContextPool(item).some(function (entry) {
          return entry.toLowerCase().includes(search);
        });
      return matchesFilter && matchesSearch;
    });

    if (!items.length) {
      els.vocabList.innerHTML = '<div class="empty-state"><h3>No vocabulary yet</h3><p>Click words in generated text or add a phrase manually.</p></div>';
      return;
    }

    els.vocabList.innerHTML = items.map(function (item) {
      var contexts = getCombinedContextPool(item);
      var forms = item.forms || [];
      var image = normalizeImageData(item.image || item.image_json || '{}');
      var imageAlt = image ? escapeHtml(image.alt || item.word) : '';
      var isOpen = state.openVocabularyIds.has(item.id);
      return [
        '<details class="card vocab-card mastery-' + escapeHtml(item.mastery || 'new') + '" data-id="' + escapeHtml(item.id) + '"' + (isOpen ? ' open' : '') + '>',
        '<summary class="vocab-summary">',
        '<div class="vocab-hero-summary">',
        '<div class="summary-image">',
        image && image.url ? '<img src="' + escapeHtml(image.url) + '" alt="' + imageAlt + '" loading="lazy" />' : escapeHtml(image && image.status === 'failed' ? 'Image failed' : image && image.status ? 'Image ' + image.status : 'No image'),
        '</div>',
        '<h3 class="card-title">' + escapeHtml(item.word) + '</h3>',
        '<div class="summary-meta"><span class="summary-pill">' + escapeHtml(item.mastery || 'new') + '</span><p class="summary-hint">' + escapeHtml(String(contexts.length || 0)) + ' contexts</p></div>',
        '</div>',
        '</summary>',
        '<div class="vocab-body">',
        '<div class="meta-row">',
        '<span class="chip-mini">Seen ' + escapeHtml(String(item.occurrences || 0)) + ' times</span>',
        '<span class="chip-mini">Last ' + escapeHtml(new Date(item.lastSeen).toLocaleDateString()) + '</span>',
        '<span class="chip-mini">' + escapeHtml(item.targetLanguage || state.settings.language) + '</span>',
        '</div>',
        forms.length ? '<p class="card-meta">Forms: ' + escapeHtml(forms.join(', ')) + '</p>' : '',
        '<div class="card-actions card-actions-wide">',
        '<select class="select-input mastery-select" data-id="' + escapeHtml(item.id) + '">',
        '<option value="new"' + (item.mastery === 'new' ? ' selected' : '') + '>New</option>',
        '<option value="learning"' + (item.mastery === 'learning' ? ' selected' : '') + '>Learning</option>',
        '<option value="known"' + (item.mastery === 'known' ? ' selected' : '') + '>Known</option>',
        '</select>',
        '<button class="ghost-btn target-language-btn" data-id="' + escapeHtml(item.id) + '">Use settings language</button>',
        '<button class="ghost-btn delete-word-btn" data-id="' + escapeHtml(item.id) + '">Delete</button>',
        '</div>',
      '<div class="vocab-overview">',
      '<div class="image-block">',
      '<div class="note-head"><h4>Visual</h4><button class="icon-btn generate-image-btn" data-id="' + escapeHtml(item.id) + '" aria-label="Refresh image" title="Refresh image">↻</button></div>',
      image ? (
        (image.url ? '<a class="image-link" href="' + escapeHtml(image.sourceUrl || image.url) + '" target="_blank" rel="noreferrer noopener">' +
        '<img class="image-thumb" src="' + escapeHtml(image.url) + '" alt="' + imageAlt + '" loading="lazy" />' +
        '</a>' : '<div class="image-empty">' + escapeHtml(image.status === 'queued' ? 'Image queued' : image.status === 'generating' ? 'Generating image…' : image.status === 'failed' ? 'Image failed' : 'No image yet') + '</div>') +
        (image.status && image.status !== 'ready' ? '<p class="image-status">Status: ' + escapeHtml(image.status) + '</p>' : '') +
        '<p class="image-credit">' +
        (image.provider === 'openai'
          ? 'Generated with OpenAI'
          : image.photographer
            ? 'Photo by ' + escapeHtml(image.photographer)
            : 'Image') +
        (image.photographerUrl ? ' on <a href="' + escapeHtml(image.photographerUrl) + '" target="_blank" rel="noreferrer noopener">source</a>' : '') +
        '</p>'
      ) : '<div class="image-empty">No image yet</div>',
      '</div>',
        '<div class="tile-grid">',
        '<section class="note-block">',
        '<div class="note-head"><h4>Translation</h4><button class="icon-btn save-translation-btn" data-id="' + escapeHtml(item.id) + '" aria-label="Refresh translation" title="Refresh translation">↻</button></div>',
        '<p class="note-body">' + escapeHtml(item.translation || 'None saved') + '</p>',
        '</section>',
        '<section class="note-block">',
        '<div class="note-head"><h4>Mnemonic</h4><button class="icon-btn save-mnemonic-btn" data-id="' + escapeHtml(item.id) + '" aria-label="Refresh mnemonic" title="Refresh mnemonic">↻</button></div>',
        '<p class="note-body">' + escapeHtml(item.mnemonic || 'None saved') + '</p>',
        '</section>',
        '</div>',
        '</div>',
        '<section class="context-section"><div class="note-head"><h4>Contexts</h4><button class="icon-btn generate-contexts-btn" data-id="' + escapeHtml(item.id) + '" aria-label="Generate more contexts" title="Generate more contexts">＋</button></div>',
        contexts.length ? '<div class="context-grid">' + contexts.map(function (sentence) {
          var cleanSentence = cleanExampleSentence(sentence);
          return cleanSentence ? '<article class="context-tile">' + escapeHtml(cleanSentence) + '</article>' : '';
        }).join('') + '</div>' : '<p class="card-meta">No contexts yet.</p>',
        '</section>',
        '</div>',
        '</details>'
      ].join('');
    }).join('');
  }

  function renderFlashcardState() {
    if (!state.flashcards.length) {
      els.flashcardState.classList.add('hidden');
      els.flashcardEmpty.classList.remove('hidden');
      return;
    }

    els.flashcardState.classList.remove('hidden');
    els.flashcardEmpty.classList.add('hidden');

    const current = state.flashcards[state.flashcardIndex];
    if (!current) {
      els.flashcardWord.textContent = '';
      els.flashcardContext.textContent = '';
      els.flashcardContextWrap.classList.add('hidden');
      els.flashcardImage.classList.add('hidden');
      els.flashcardImage.innerHTML = '';
      els.flashcardTranslation.textContent = '';
      els.flashcardProgress.textContent = '0 / 0';
      els.flashcardStats.textContent = 'Known 0 | Unknown 0';
      return;
    }

    if (state.flashcardActiveId !== current.id) {
      state.flashcardActiveId = current.id;
      state.flashcardContextIndex = -1;
      state.flashcardContextVisible = false;
      state.flashcardContextPool = getCombinedContextPool(current);
    }

    if (state.flashcardExposureLoggedForId !== current.id) {
      state.flashcardExposureLoggedForId = current.id;
      trackFlashcardExposure(current);
    }

    els.flashcardWord.textContent = current.word;
    const contextPool = state.flashcardContextPool.length ? state.flashcardContextPool : getCombinedContextPool(current);
    const visibleContext = state.flashcardContextVisible && state.flashcardContextIndex >= 0
      ? contextPool[state.flashcardContextIndex] || ''
      : '';
    els.flashcardContext.textContent = visibleContext || 'No context available';
    const contextVisible = Boolean(state.flashcardContextVisible);
    els.flashcardContextWrap.classList.toggle('hidden', !contextVisible);
    const image = normalizeImageData(current.image || current.image_json || '{}');
    if (contextVisible && image && image.url) {
      els.flashcardImage.classList.remove('hidden');
      els.flashcardImage.innerHTML =
        '<a class="flashcard-image-link" href="' + escapeHtml(image.sourceUrl || image.url) + '" target="_blank" rel="noreferrer noopener">' +
        '<img class="flashcard-image-thumb" src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt || current.word) + '" loading="lazy" />' +
        '</a>';
    } else {
      els.flashcardImage.classList.add('hidden');
      els.flashcardImage.innerHTML = '';
    }
    els.flashcardTranslation.textContent = current.translation || '';
    els.flashcardTranslation.classList.add('hidden');
    els.toggleContextBtn.textContent = contextVisible
      ? (state.flashcardContextIndex >= contextPool.length - 1 ? 'Generate new context' : 'Next context')
      : 'Show context';
    els.toggleTranslationBtn.textContent = 'Show translation';
    els.moreExamplesBtn.textContent = 'More contexts';
    state.flashcardTranslationVisible = false;

    els.flashcardProgress.textContent = 'Card ' + (state.flashcardIndex + 1) + ' / ' + state.flashcards.length;
    els.flashcardStats.textContent = 'Known ' + state.flashcardStats.known + ' | Unknown ' + state.flashcardStats.unknown;
  }

  function pickFlashcards() {
    const filter = state.flashcardFilter;
    const language = String(state.settings.language || '').toLowerCase();
    const items = state.vocabulary.filter(function (item) {
      const matchesFilter =
        filter === 'all' ||
        item.mastery === filter ||
        (filter === 'new-learning' && (item.mastery === 'new' || item.mastery === 'learning'));
      const targetLanguage = String(item.targetLanguage || '').toLowerCase();
      const matchesLanguage = !targetLanguage || !language || targetLanguage === language;
      return matchesFilter && matchesLanguage;
    });

    const targetCount = Math.max(1, Number(state.flashcardCount) || 10);
    const buckets = {
      new: [],
      learning: [],
      known: []
    };

    items.forEach(function (item) {
      const mastery = item.mastery === 'learning' ? 'learning' : item.mastery === 'known' ? 'known' : 'new';
      buckets[mastery].push(item);
    });

    const selected = [];
    const addUnique = function (item) {
      if (!item) return;
      if (selected.some(function (entry) { return entry.id === item.id; })) return;
      selected.push(item);
    };

    if (filter === 'known') {
      shuffle(buckets.known).forEach(addUnique);
    } else if (filter === 'new') {
      shuffle(buckets.new).forEach(addUnique);
    } else if (filter === 'learning') {
      shuffle(buckets.learning).forEach(addUnique);
    } else {
      shuffle([].concat(buckets.new, buckets.learning)).forEach(addUnique);
      if (selected.length < targetCount) {
        shuffle(buckets.known).forEach(addUnique);
      }
    }

    return selected.slice(0, targetCount);
  }

  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function renderQuizQuestion() {
    const question = state.quizQuestion;
    els.quizProgress.textContent = state.quizTotal + (state.quizTotal === 1 ? ' answered' : ' answered');
    els.quizScore.textContent = 'Score ' + state.quizScore;
    if (!question) return;
    els.quizLanguage.textContent = 'Complete this ' + question.language + ' sentence';
    els.quizTranslation.textContent = question.sentence;
    els.quizOptions.innerHTML = question.options.map(function (word) {
      return '<button class="quiz-option" data-word="' + escapeHtml(word) + '">' + escapeHtml(word) + '</button>';
    }).join('');
    els.quizFeedback.className = 'quiz-feedback';
    els.quizFeedback.textContent = 'Choose the word that fits the meaning and grammar of the gap.';
  }

  async function loadQuizQuestion() {
    setLoading(els.newQuizQuestionBtn, true, 'Building choices...');
    try {
      const data = await api('/api/quiz-question', {
        method: 'POST',
        body: JSON.stringify({ excludeId: state.quizPreviousId })
      });
      state.quizQuestion = data.question;
      state.quizPreviousId = data.question.id;
      state.quizAnswered = false;
      renderQuizQuestion();
    } catch (error) {
      els.quizFeedback.className = 'quiz-feedback error';
      els.quizFeedback.textContent = error.message;
    } finally {
      setLoading(els.newQuizQuestionBtn, false, 'New question');
    }
  }

  function answerQuiz(word) {
    if (!state.quizQuestion || state.quizAnswered) return;
    state.quizAnswered = true;
    state.quizTotal++;
    const isCorrect = word === state.quizQuestion.correctWord;
    if (isCorrect) state.quizScore++;
    els.quizOptions.querySelectorAll('.quiz-option').forEach(function (button) {
      button.disabled = true;
      if (button.dataset.word === state.quizQuestion.correctWord) button.classList.add('correct');
      else if (button.dataset.word === word) button.classList.add('wrong');
    });
    els.quizProgress.textContent = state.quizTotal + ' answered';
    els.quizScore.textContent = 'Score ' + state.quizScore;
    els.quizFeedback.className = 'quiz-feedback ' + (isCorrect ? 'success' : 'error');
    els.quizFeedback.textContent = isCorrect
      ? 'Correct — nicely spotted.'
      : 'Not quite. The answer was “' + state.quizQuestion.correctWord + '”.';
  }

  function renderListeningSentence() {
    const item = state.listeningSentences[state.listeningIndex];
    const hasItem = Boolean(item);
    els.listeningCounter.textContent = hasItem
      ? (state.listeningIndex + 1) + ' / ' + state.listeningSentences.length
      : '0 / 0';
    els.previousListeningBtn.disabled = !hasItem || state.listeningIndex <= 0;
    els.nextListeningBtn.disabled = !hasItem || state.listeningIndex >= state.listeningSentences.length - 1;
    els.playPauseListeningBtn.disabled = !hasItem;
    els.replayListeningBtn.disabled = !hasItem;
    els.deleteListeningBtn.disabled = !hasItem;
    els.showListeningSentenceInput.checked = Boolean(state.settings.listening_show_sentence);
    els.randomListeningOrderInput.checked = Boolean(state.settings.listening_random_order);
    if (!hasItem) {
      els.listeningVoice.textContent = 'Ready to listen';
      els.listeningCount.textContent = '';
      els.listeningSentence.textContent = 'Generate your first listening batch.';
      els.listeningSentence.classList.toggle('hidden', !state.settings.listening_show_sentence);
      els.listeningTranslation.textContent = '';
      els.listeningTranslation.classList.add('hidden');
      els.translateListeningBtn.disabled = true;
      els.listeningWords.textContent = '';
      if (els.listeningAudio.dataset.sentenceId) {
        els.listeningAudio.removeAttribute('src');
        delete els.listeningAudio.dataset.sentenceId;
        els.listeningAudio.load();
      }
      syncListeningPlayButton();
      return;
    }
    els.listeningVoice.textContent = item.voiceName ? 'Voice: ' + item.voiceName : item.language;
    els.listeningCount.textContent = 'Listened ' + Number(item.listenCount || 0) + (Number(item.listenCount || 0) === 1 ? ' time' : ' times');
    const vocabWords = new Set(state.vocabulary.map(function (row) { return row.word; }));
    els.listeningSentence.dataset.full = item.text;
    els.listeningSentence.innerHTML = tokenize(item.text).map(function (token) {
      if (/^\s+$/.test(token)) return token;
      const clean = toLowerClean(token);
      const classes = ['story-word'];
      if (clean && vocabWords.has(clean)) classes.push('vocab');
      return '<span class="' + classes.join(' ') + '" role="button" tabindex="0" data-word="' + escapeHtml(clean) + '">' + escapeHtml(token) + '</span>';
    }).join('');
    els.listeningSentence.classList.toggle('hidden', !state.settings.listening_show_sentence);
    els.translateListeningBtn.disabled = false;
    els.translateListeningBtn.textContent = state.listeningTranslationVisible ? 'Hide translation' : 'Show translation';
    els.listeningTranslation.textContent = item.translation || '';
    els.listeningTranslation.classList.toggle('hidden', !state.listeningTranslationVisible || !item.translation);
    els.listeningWords.textContent = item.vocabulary && item.vocabulary.length
      ? 'Library words: ' + item.vocabulary.join(' · ')
      : '';
    if (els.listeningAudio.dataset.sentenceId !== item.id) {
      els.listeningAudio.src = item.audioUrl || '/api/listening-audio/' + encodeURIComponent(item.id);
      els.listeningAudio.dataset.sentenceId = item.id;
      els.listeningAudio.load();
    }
    els.listeningAudio.defaultPlaybackRate = Number(state.settings.listening_playback_speed || 1);
    els.listeningAudio.playbackRate = Number(state.settings.listening_playback_speed || 1);
    els.listeningSpeedSelect.value = String(state.settings.listening_playback_speed || 1);
    syncListeningPlayButton();
  }

  function syncListeningPlayButton() {
    const hasItem = state.listeningIndex >= 0 && Boolean(state.listeningSentences[state.listeningIndex]);
    const isPlaying = hasItem && !els.listeningAudio.paused && !els.listeningAudio.ended;
    els.playPauseListeningBtn.disabled = !hasItem;
    els.playPauseListeningBtn.setAttribute('aria-label', isPlaying ? 'Pause sentence' : 'Play sentence');
    els.playPauseListeningIcon.textContent = isPlaying ? '⏸' : '▶';
    els.playPauseListeningLabel.textContent = isPlaying ? 'Pause' : 'Play';
  }

  async function loadListeningSentences() {
    if (state.listeningLoaded) return;
    state.listeningLoaded = true;
    els.listeningBufferStatus.textContent = 'Loading saved sentences…';
    try {
      const data = await api('/api/listening-sentences?language=' + encodeURIComponent(state.settings.language) + '&limit=5000');
      state.listeningSentences = Array.isArray(data.sentences) ? data.sentences : [];
      if (state.settings.listening_random_order) state.listeningSentences = shuffle(state.listeningSentences);
      state.listeningIndex = state.listeningSentences.length ? 0 : -1;
      renderListeningSentence();
      els.listeningBufferStatus.textContent = state.listeningSentences.length
        ? state.listeningSentences.length + ' saved sentences available.'
        : 'No saved sentences yet. Generate a batch when you are ready.';
    } catch (error) {
      state.listeningLoaded = false;
      els.listeningBufferStatus.textContent = error.message;
      showStatus(error.message, 'error');
    }
  }

  async function generateListeningBatch(background) {
    if (state.listeningGenerating) return;
    state.listeningGenerating = true;
    setLoading(els.generateListeningBtn, true, 'Generating…');
    els.listeningBufferStatus.textContent = 'Writing, translating, and voicing a fresh batch…';
    try {
      const data = await api('/api/listening-sentences/batch', {
        method: 'POST',
        body: JSON.stringify({
          language: state.settings.language,
          count: state.settings.listening_batch_size
        })
      });
      const incoming = Array.isArray(data.sentences) ? data.sentences : [];
      const existingIds = new Set(state.listeningSentences.map(function (item) { return item.id; }));
      (state.settings.listening_random_order ? shuffle(incoming) : incoming).forEach(function (item) {
        if (!existingIds.has(item.id)) state.listeningSentences.push(item);
      });
      if (state.listeningIndex < 0 && state.listeningSentences.length) state.listeningIndex = 0;
      renderListeningSentence();
      els.listeningBufferStatus.textContent = incoming.length + ' new sentences are ready.';
      showStatus('Listening batch ready.', 'success');
    } catch (error) {
      els.listeningBufferStatus.textContent = error.message;
      showStatus(error.message, 'error');
    } finally {
      state.listeningGenerating = false;
      setLoading(els.generateListeningBtn, false, 'Generate a batch');
    }
  }

  function moveListening(direction, autoplay) {
    window.clearTimeout(state.listeningGapTimer);
    const next = state.listeningIndex + direction;
    if (next < 0 || next >= state.listeningSentences.length) return;
    state.listeningIndex = next;
    state.listeningRepetition = 0;
    state.listeningTranslationVisible = false;
    renderListeningSentence();
    if (autoplay) {
      playCurrentListening();
    }
  }

  function playCurrentListening() {
    if (state.listeningIndex < 0) return;
    els.listeningAudio.playbackRate = Number(state.settings.listening_playback_speed || 1);
    const promise = els.listeningAudio.play();
    syncListeningPlayButton();
    if (promise && typeof promise.catch === 'function') {
      promise.then(syncListeningPlayButton).catch(function () { syncListeningPlayButton(); });
    }
  }

  function toggleListeningPlayback() {
    if (state.listeningIndex < 0) return;
    window.clearTimeout(state.listeningGapTimer);
    if (els.listeningAudio.paused || els.listeningAudio.ended) {
      playCurrentListening();
      return;
    }
    els.listeningAudio.pause();
    syncListeningPlayButton();
  }

  function afterListeningGap(callback) {
    window.clearTimeout(state.listeningGapTimer);
    state.listeningGapTimer = window.setTimeout(
      callback,
      Number(state.settings.listening_gap_seconds || 0) * 1000
    );
  }

  function handleListeningEnded() {
    recordCurrentListeningCompletion();
    const repetitions = Number(state.settings.listening_repetitions || 1);
    if (state.listeningRepetition + 1 < repetitions) {
      state.listeningRepetition++;
      afterListeningGap(function () {
        els.listeningAudio.currentTime = 0;
        playCurrentListening();
      });
      return;
    }

    state.listeningRepetition = 0;
    syncListeningPlayButton();
    if (!els.continuousListeningInput.checked) return;
    state.listeningAutoplayCount++;
    if (state.listeningAutoplayCount >= Number(state.settings.listening_autoplay_phrase_limit || 10)) {
      els.listeningCheckin.classList.remove('hidden');
      return;
    }
    afterListeningGap(function () { moveListening(1, true); });
    syncListeningPlayButton();
  }

  async function recordCurrentListeningCompletion() {
    const item = state.listeningSentences[state.listeningIndex];
    if (!item) return;
    item.listenCount = Number(item.listenCount || 0) + 1;
    els.listeningCount.textContent = 'Listened ' + item.listenCount + (item.listenCount === 1 ? ' time' : ' times');
    try {
      const data = await api('/api/listening-sentences/' + encodeURIComponent(item.id) + '/listened', {
        method: 'POST',
        body: '{}'
      });
      item.listenCount = Number(data.listenCount || item.listenCount);
      if (state.listeningSentences[state.listeningIndex] === item) renderListeningSentence();
      if (!els.listeningLibraryModal.classList.contains('hidden')) renderListeningLibrary();
    } catch (error) {
      console.warn('Could not persist listening count:', error);
    }
  }

  async function updateListeningPlaybackSpeed(value) {
    const speed = Math.min(2, Math.max(0.5, Number(value) || 1));
    state.settings.listening_playback_speed = speed;
    els.listeningAudio.defaultPlaybackRate = speed;
    els.listeningAudio.playbackRate = speed;
    els.listeningSpeedSelect.value = String(speed);
    els.listeningPlaybackSpeedInput.value = String(speed);
    els.listeningPlaybackSpeedLabel.textContent = speed.toFixed(2).replace(/0$/, '') + '×';
    persistState();
    try {
      const data = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(state.settings)
      });
      state.settings = normalizeSettings(data.settings);
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  async function updateListeningSentenceVisibility(visible) {
    state.settings.listening_show_sentence = Boolean(visible);
    els.showListeningSentenceInput.checked = state.settings.listening_show_sentence;
    els.listeningShowSentenceSettingInput.checked = state.settings.listening_show_sentence;
    renderListeningSentence();
    persistState();
    try {
      const data = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(state.settings)
      });
      state.settings = normalizeSettings(data.settings);
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  async function updateListeningRandomOrder(enabled) {
    const current = state.listeningSentences[state.listeningIndex];
    state.settings.listening_random_order = Boolean(enabled);
    if (state.settings.listening_random_order) {
      state.listeningSentences = shuffle(state.listeningSentences);
    } else {
      state.listeningSentences.sort(function (a, b) {
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      });
    }
    state.listeningIndex = current
      ? state.listeningSentences.findIndex(function (item) { return item.id === current.id; })
      : (state.listeningSentences.length ? 0 : -1);
    els.randomListeningOrderInput.checked = state.settings.listening_random_order;
    renderListeningSentence();
    persistState();
    try {
      const data = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(state.settings)
      });
      state.settings = normalizeSettings(data.settings);
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  function renderListeningLibrary() {
    if (!state.listeningSentences.length) {
      els.listeningLibraryList.innerHTML = '<div class="empty-state"><h3>No sentences yet</h3><p>Generate a batch from Sentence Radio.</p></div>';
      return;
    }
    els.listeningLibraryList.innerHTML = state.listeningSentences.map(function (item) {
      return '<article class="listening-library-item">' +
        '<div><strong>' + escapeHtml(item.text) + '</strong>' +
        '<p>' + escapeHtml(item.translation || 'Translation not cached yet') + '</p>' +
        '<p class="listening-library-meta">' + escapeHtml(item.voiceName || item.language) + ' · listened ' + Number(item.listenCount || 0) + ' times</p></div>' +
        '<button class="ghost-btn select-listening-sentence-btn" data-id="' + escapeHtml(item.id) + '">Select</button>' +
        '</article>';
    }).join('');
  }

  function openListeningLibrary() {
    renderListeningLibrary();
    els.listeningLibraryModal.classList.remove('hidden');
  }

  function closeListeningLibrary() {
    els.listeningLibraryModal.classList.add('hidden');
  }

  async function deleteCurrentListeningSentence() {
    const item = state.listeningSentences[state.listeningIndex];
    if (!item) return;
    const shouldResume = !els.listeningAudio.paused && !els.listeningAudio.ended;
    els.listeningAudio.pause();
    setLoading(els.deleteListeningBtn, true, 'Deleting…');
    try {
      await api('/api/listening-sentences/' + encodeURIComponent(item.id), { method: 'DELETE' });
      state.listeningSentences.splice(state.listeningIndex, 1);
      state.listeningIndex = state.listeningSentences.length
        ? Math.min(state.listeningIndex, state.listeningSentences.length - 1)
        : -1;
      state.listeningTranslationVisible = false;
      renderListeningSentence();
      if (shouldResume && state.listeningIndex >= 0) playCurrentListening();
      showStatus('Sentence and audio deleted.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
      renderListeningSentence();
    } finally {
      setLoading(els.deleteListeningBtn, false, 'Delete');
    }
  }

  async function toggleListeningTranslation() {
    const item = state.listeningSentences[state.listeningIndex];
    if (!item) return;
    if (state.listeningTranslationVisible) {
      state.listeningTranslationVisible = false;
      renderListeningSentence();
      return;
    }
    if (!item.translation) {
      setLoading(els.translateListeningBtn, true, 'Translating…');
      try {
        const data = await api('/api/listening-sentences/' + encodeURIComponent(item.id) + '/translation', {
          method: 'POST',
          body: '{}'
        });
        item.translation = data.sentence && data.sentence.translation || '';
      } catch (error) {
        showStatus(error.message, 'error');
        return;
      } finally {
        setLoading(els.translateListeningBtn, false, 'Show translation');
      }
    }
    state.listeningTranslationVisible = true;
    renderListeningSentence();
  }

  function setTab(tab) {
    state.tab = tab;
    els.tabButtons.forEach(function (button) {
      button.classList.toggle('active', button.dataset.tab === tab);
    });
    els.textView.classList.toggle('hidden', tab !== 'text');
    els.vocabularyView.classList.toggle('hidden', tab !== 'vocabulary');
    els.flashcardsView.classList.toggle('hidden', tab !== 'flashcards');
    els.quizView.classList.toggle('hidden', tab !== 'quiz');
    els.listeningView.classList.toggle('hidden', tab !== 'listening');
    if (tab === 'vocabulary') {
      renderVocabulary();
    } else if (tab === 'text') {
      renderText();
    } else if (tab === 'flashcards') {
      renderFlashcardState();
    } else if (tab === 'quiz' && !state.quizQuestion) {
      loadQuizQuestion();
    } else if (tab === 'listening') {
      loadListeningSentences();
    }
  }

  function populateSettingsForm() {
    const languages = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'English'];
    els.languageSelect.innerHTML = languages.map(function (language) {
      return '<option value="' + language + '">' + language + '</option>';
    }).join('');
    els.languageSelect.value = state.settings.language;
    els.voiceSelect.innerHTML = '<option value="">Default voice</option>';
    state.voices.forEach(function (voice) {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = voice.name + ' (' + voice.lang + ')';
      els.voiceSelect.appendChild(option);
    });
    els.voiceSelect.value = state.settings.voice || '';
    els.speedInput.value = String(state.settings.speed);
    els.speedLabel.textContent = state.settings.speed.toFixed(1) + 'x';
    els.vocabWordsInput.value = String(state.settings.vocab_words_count);
    els.vocabWordsLabel.textContent = String(state.settings.vocab_words_count) + ' words';
    els.vocabularyMixInput.value = String(state.settings.vocabulary_mix);
    els.vocabularyMixLabel.textContent = vocabularyMixLabel(state.settings.vocabulary_mix);
    els.quizOptionCountInput.value = String(state.settings.quiz_option_count);
    els.quizOptionCountLabel.textContent = String(state.settings.quiz_option_count) + ' choices';
    els.listeningMixInput.value = String(state.settings.listening_new_learning_percent);
    els.listeningMixLabel.textContent = String(state.settings.listening_new_learning_percent) + '% from new + learning';
    els.listeningBatchSizeInput.value = String(state.settings.listening_batch_size);
    els.listeningBatchSizeLabel.textContent = String(state.settings.listening_batch_size) + ' sentences';
    els.listeningPlaybackSpeedInput.value = String(state.settings.listening_playback_speed);
    els.listeningPlaybackSpeedLabel.textContent = Number(state.settings.listening_playback_speed).toFixed(2).replace(/0$/, '') + '×';
    els.listeningSpeedSelect.value = String(state.settings.listening_playback_speed);
    els.listeningRepetitionsInput.value = String(state.settings.listening_repetitions);
    els.listeningRepetitionsLabel.textContent = String(state.settings.listening_repetitions) + (state.settings.listening_repetitions === 1 ? ' play' : ' plays');
    els.listeningGapInput.value = String(state.settings.listening_gap_seconds);
    els.listeningGapLabel.textContent = String(state.settings.listening_gap_seconds) + ' seconds';
    els.listeningAutoplayLimitInput.value = String(state.settings.listening_autoplay_phrase_limit);
    els.listeningAutoplayLimitLabel.textContent = String(state.settings.listening_autoplay_phrase_limit) + ' phrases';
    els.listeningShowSentenceSettingInput.checked = Boolean(state.settings.listening_show_sentence);
    els.newToLearningInput.value = String(state.settings.new_to_learning_seen_threshold);
    els.newToLearningLabel.textContent = String(state.settings.new_to_learning_seen_threshold) + ' sees';
    els.learningToKnownInput.value = String(state.settings.learning_to_known_success_threshold);
    els.learningToKnownLabel.textContent = String(state.settings.learning_to_known_success_threshold) + ' correct';
    els.subjectSelect.value = state.settings.subject;
    els.levelSelect.value = state.settings.level;
  }

  function refreshVoices() {
    state.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (els.settingsModal && !els.settingsModal.classList.contains('hidden')) {
      populateSettingsForm();
    }
  }

  function speakCurrentText() {
    const item = state.history[state.historyIndex];
    if (!item || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(item.text);
    const selected = state.voices.find(function (voice) { return voice.voiceURI === state.settings.voice; });
    if (selected) {
      utterance.voice = selected;
    }
    utterance.rate = Number(state.settings.speed || 1);
    window.speechSynthesis.speak(utterance);
  }

  async function loadBootstrap() {
    const initialState = window.__INITIAL_STATE__;
    if (initialState && Array.isArray(initialState.vocabulary)) {
      state.settings = normalizeSettings(initialState.settings || {});
      state.vocabulary = initialState.vocabulary;
      state.history = Array.isArray(initialState.history) ? initialState.history : [];
      state.historyIndex = state.history.length ? state.history.length - 1 : -1;
      persistState();
      delete window.__INITIAL_STATE__;
      populateSettingsForm();
      renderText();
      renderVocabulary();
      refreshFlashcardIfNeeded();
      if (hasPendingImageJobs()) {
        scheduleImageRefresh();
      }
      return;
    }
    try {
      const data = await api('/api/bootstrap');
      state.settings = normalizeSettings(data.settings || {});
      state.vocabulary = Array.isArray(data.vocabulary) ? data.vocabulary : [];
      state.history = Array.isArray(data.history) ? data.history : [];
      state.historyIndex = state.history.length ? state.history.length - 1 : -1;
      persistState();
    } catch (error) {
      console.warn('Bootstrap failed, falling back to separate endpoints:', error);
      try {
        const [settingsData, vocabularyData, historyData] = await Promise.all([
          api('/api/settings'),
          api('/api/vocabulary'),
          api('/api/history')
        ]);
        state.settings = normalizeSettings(settingsData.settings || {});
        state.vocabulary = Array.isArray(vocabularyData.vocabulary) ? vocabularyData.vocabulary : [];
        state.history = Array.isArray(historyData.history) ? historyData.history : [];
        state.historyIndex = state.history.length ? state.history.length - 1 : -1;
        persistState();
      } catch (fallbackError) {
        const cached = restoreCachedState();
        if (cached) {
          state.settings = cached.settings;
          state.vocabulary = cached.vocabulary;
          state.history = cached.history;
          state.historyIndex = state.history.length ? state.history.length - 1 : -1;
          showStatus('Loaded cached vocabulary while the network catches up.', 'error');
        } else {
          throw fallbackError;
        }
      }
    }
    populateSettingsForm();
    renderText();
    renderVocabulary();
    refreshFlashcardIfNeeded();
    if (hasPendingImageJobs()) {
      scheduleImageRefresh();
    }
  }

  async function generateText() {
    setLoading(els.generateTextBtn, true, 'Generating...');
    try {
      const data = await api('/api/generate-text', {
        method: 'POST',
        body: JSON.stringify({
          topic: els.topicInput.value.trim(),
          vocabularyMode: els.vocabularyModeSelect.value
        })
      });
      state.history.push(Object.assign({ related_topics_json: [] }, data.historyItem));
      state.historyIndex = state.history.length - 1;
      els.topicInput.value = '';
      renderText();
      showStatus('Text generated and saved to history.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setLoading(els.generateTextBtn, false, 'New text');
    }
  }

  async function generateTopics() {
    const item = state.history[state.historyIndex];
    if (!item) return;
    setLoading(els.generateTopicsBtn, true, 'Generating...');
    try {
      const data = await api('/api/related-topics', {
        method: 'POST',
        body: JSON.stringify({ text: item.text })
      });
      item.related_topics_json = data.topics || [];
      await api('/api/history/' + encodeURIComponent(item.id), {
        method: 'PATCH',
        body: JSON.stringify({ relatedTopics: item.related_topics_json, showTopics: true })
      });
      renderText();
      showStatus('Related topics ready.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setLoading(els.generateTopicsBtn, false, 'Generate related topics');
    }
  }

  async function addPhrase() {
    const phrase = els.phraseInput.value.trim();
    if (!phrase) {
      showStatus('Enter a phrase first.', 'error');
      return;
    }
    setLoading(els.addPhraseBtn, true, 'Adding...');
    try {
      const data = await api('/api/text-vocabulary', {
        method: 'POST',
        body: JSON.stringify({ text: phrase })
      });
      state.vocabulary.unshift(data.item);
      persistState();
      renderVocabulary();
      els.phraseInput.value = '';
      showStatus('Phrase saved to D1.', 'success');
      if (data.created) {
        generateImageForItem(data.item.id, data.item.contexts && data.item.contexts[0], true);
      }
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setLoading(els.addPhraseBtn, false, 'Add phrase');
    }
  }

  async function saveWord(word, context) {
    try {
      const normalizedWord = normalizeSelectedText(word);
      if (!normalizedWord) {
        return;
      }
      const data = await api('/api/vocabulary', {
        method: 'POST',
        body: JSON.stringify({
          word: normalizedWord,
          context: context,
          targetLanguage: state.settings.language,
          mode: normalizedWord.split(/\s+/).length > 1 ? 'phrase' : 'token'
        })
      });
      const existingIndex = state.vocabulary.findIndex(function (item) { return item.id === data.item.id; });
      const savedItem = data.item;
      if (existingIndex >= 0) {
        state.vocabulary[existingIndex] = savedItem;
      } else {
        state.vocabulary.unshift(savedItem);
      }
      persistState();
      state.selectedStoryWord = { word: toLowerClean(normalizedWord), context: context };
      try {
        if (data.created) {
          const generatedContexts = await generateContextsForItem(savedItem.id, 3);
          savedItem.contexts = generatedContexts || savedItem.contexts || [];
          const currentIndex = state.vocabulary.findIndex(function (item) { return item.id === savedItem.id; });
          if (currentIndex >= 0) {
            state.vocabulary[currentIndex].contexts = savedItem.contexts;
          }
          generateImageForItem(savedItem.id, context, true);
        }
        await Promise.allSettled([
          generateTranslationForItem(savedItem.id),
          generateMnemonicForItem(savedItem.id)
        ]);
      } catch (noteError) {
        console.warn('Note generation failed:', noteError);
      }
      renderVocabulary();
      renderText();
      showStatus('Saved "' + normalizedWord + '" to vocabulary.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  async function generateTranslationForItem(itemId) {
    const item = state.vocabulary.find(function (row) { return row.id === itemId; });
    if (!item) return null;
    const previousTranslation = item.translation || '';
    const previousMnemonic = item.mnemonic || '';
    const data = await api('/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        id: item.id,
        word: item.word,
        kind: 'translation',
        previousTranslation: previousTranslation,
        previousMnemonic: previousMnemonic,
        targetLanguage: item.targetLanguage || state.settings.language
      })
    });
    item.translation = data.translation;
    await updateVocabularyItem(item.id, { translation: data.translation });
    return data.translation;
  }

  async function refreshTranslationForItem(itemId) {
    const item = state.vocabulary.find(function (row) { return row.id === itemId; });
    if (!item) return;
    try {
      const translation = await generateTranslationForItem(item.id);
      item.translation = translation;
      renderVocabulary();
      showStatus('Translation updated.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  async function generateMnemonicForItem(itemId) {
    const item = state.vocabulary.find(function (row) { return row.id === itemId; });
    if (!item) return null;
    const previousTranslation = item.translation || '';
    const previousMnemonic = item.mnemonic || '';
    const data = await api('/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        id: item.id,
        word: item.word,
        kind: 'mnemonic',
        previousTranslation: previousTranslation,
        previousMnemonic: previousMnemonic,
        targetLanguage: item.targetLanguage || state.settings.language
      })
    });
    item.mnemonic = data.mnemonic;
    await updateVocabularyItem(item.id, { mnemonic: data.mnemonic });
    return data.mnemonic;
  }

  async function refreshMnemonicForItem(itemId) {
    const item = state.vocabulary.find(function (row) { return row.id === itemId; });
    if (!item) return;
    try {
      const mnemonic = await generateMnemonicForItem(item.id);
      item.mnemonic = mnemonic;
      renderVocabulary();
      showStatus('Mnemonic updated.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  async function generateContextsForItem(itemId, count) {
    const item = state.vocabulary.find(function (row) { return row.id === itemId; });
    if (!item) return;
    try {
      const data = await api('/api/context', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          count: Math.max(1, Number(count || 5))
        })
      });
      item.contexts = uniqueStrings((data.contexts || data.examples || []).map(cleanExampleSentence).filter(Boolean));
      await updateVocabularyItem(item.id, { contexts_json: JSON.stringify(item.contexts) });
      renderVocabulary();
      showStatus('More contexts generated.', 'success');
      return item.contexts;
    } catch (error) {
      showStatus(error.message, 'error');
      return [];
    }
  }

  async function generateImageForItem(itemId, contextHint, silent) {
    const item = state.vocabulary.find(function (row) { return row.id === itemId; });
    if (!item) return;
    try {
      const data = await api('/api/image', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          context: contextHint || (item.contexts && item.contexts[0]) || ''
        })
      });
      item.image = data.image || item.image || null;
      const index = state.vocabulary.findIndex(function (row) { return row.id === item.id; });
      if (index >= 0) {
        state.vocabulary[index].image = item.image;
      }
      persistState();
      renderVocabulary();
      if (data.queued) {
        if (!silent) showStatus('Image generation queued in the background.', 'success');
        scheduleImageRefresh();
      } else {
        if (!silent) showStatus('Image updated.', 'success');
      }
      return item.image;
    } catch (error) {
      if (!silent) showStatus(error.message, 'error');
      else console.warn('Automatic image generation skipped:', error.message);
      return null;
    }
  }

  function imageBrowserItems() {
    return state.vocabulary.filter(function (item) {
      const image = normalizeImageData(item.image || item.image_json || '{}');
      return Boolean(image && image.status === 'ready' && image.url);
    });
  }

  function renderImageBrowser() {
    const items = imageBrowserItems();
    if (!items.length) {
      els.imageBrowserWord.textContent = 'Vocabulary images';
      els.imageBrowserStage.innerHTML = '<div class="empty-state"><h3>No images yet</h3><p>Images appear here as words finish generating.</p></div>';
      els.imageBrowserCounter.textContent = '0 / 0';
      els.previousImageBtn.disabled = true;
      els.nextImageBtn.disabled = true;
      return;
    }
    state.imageBrowserIndex = (state.imageBrowserIndex + items.length) % items.length;
    const item = items[state.imageBrowserIndex];
    const image = normalizeImageData(item.image || item.image_json || '{}');
    els.imageBrowserWord.textContent = item.word;
    els.imageBrowserStage.innerHTML = '<div><img src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt || item.word) + '" /><p>' + escapeHtml(item.translation || item.word) + '</p></div>';
    els.imageBrowserCounter.textContent = (state.imageBrowserIndex + 1) + ' / ' + items.length;
    els.previousImageBtn.disabled = items.length < 2;
    els.nextImageBtn.disabled = items.length < 2;
  }

  function openImageBrowser() {
    state.imageBrowserIndex = 0;
    renderImageBrowser();
    els.imageBrowserModal.classList.remove('hidden');
  }

  function closeImageBrowser() {
    els.imageBrowserModal.classList.add('hidden');
  }

  function moveImageBrowser(direction) {
    state.imageBrowserIndex += direction;
    renderImageBrowser();
  }

  async function updateVocabularyItem(id, patch) {
    const data = await api('/api/vocabulary/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    const index = state.vocabulary.findIndex(function (item) { return item.id === id; });
    if (index >= 0) {
      state.vocabulary[index] = data.item;
    }
    persistState();
    renderVocabulary();
  }

  async function trackFlashcardExposure(item) {
    if (!item || state.flashcardExposureLoggedForId !== item.id) {
      return;
    }
    const nextSeen = Number(item.reviewSeenCount || 0) + 1;
    const patch = {
      review_seen_count: nextSeen
    };
    if (item.mastery === 'new' && nextSeen >= Number(state.settings.new_to_learning_seen_threshold || 3)) {
      patch.mastery = 'learning';
    }
    try {
      const data = await updateVocabularyItem(item.id, patch);
      if (data && data.item) {
        Object.assign(item, data.item);
      }
    } catch (error) {
      console.warn('Failed to track flashcard exposure:', error);
    }
  }

  function hasPendingImageJobs() {
    return state.vocabulary.some(function (item) {
      const image = normalizeImageData(item.image || item.image_json || '{}');
      return Boolean(image && (image.status === 'queued' || image.status === 'prompting' || image.status === 'generating'));
    });
  }

  function scheduleImageRefresh() {
    if (state.imageRefreshTimer) {
      return;
    }
    state.imageRefreshTimer = window.setTimeout(async function () {
      state.imageRefreshTimer = 0;
      if (!hasPendingImageJobs()) {
        return;
      }
      try {
        const data = await api('/api/vocabulary');
        const refreshedVocabulary = Array.isArray(data.vocabulary) ? data.vocabulary : [];
        const refreshedById = new Map(refreshedVocabulary.map(function (item) {
          return [item.id, item];
        }));
        state.vocabulary = refreshedVocabulary;
        state.flashcards = state.flashcards.map(function (card) {
          return Object.assign({}, card, refreshedById.get(card.id) || {});
        });
        persistState();
        renderVocabulary();
        if (!els.imageBrowserModal.classList.contains('hidden')) {
          renderImageBrowser();
        }
      } catch (error) {
        console.warn('Image refresh poll failed:', error);
      }
      if (hasPendingImageJobs()) {
        scheduleImageRefresh();
      }
    }, 12000);
  }

  async function addContextsToCurrentFlashcard() {
    const current = state.flashcards[state.flashcardIndex];
    if (!current) return;
    try {
      const data = await api('/api/context', {
        method: 'POST',
        body: JSON.stringify({
          id: current.id,
          count: 1,
          previousContext: state.flashcardContextPool[state.flashcardContextPool.length - 1] || ''
        })
      });
      const contexts = uniqueStrings((data.contexts || data.examples || []).map(cleanExampleSentence).filter(Boolean));
      current.contexts = contexts;
      const index = state.vocabulary.findIndex(function (item) { return item.id === current.id; });
      if (index >= 0) {
        state.vocabulary[index].contexts = contexts;
      }
      state.flashcardContextPool = getCombinedContextPool(current);
      await updateVocabularyItem(current.id, { contexts_json: JSON.stringify(contexts) });
      persistState();
      renderVocabulary();
      renderFlashcardState();
      showStatus('More contexts added to the vocabulary library.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  async function advanceFlashcardContext() {
    if (!state.flashcards.length) return;
    const current = state.flashcards[state.flashcardIndex];
    if (!current) return;
    const pool = state.flashcardContextPool.length ? state.flashcardContextPool : getCombinedContextPool(current);

    if (!pool.length) {
      const button = els.toggleContextBtn;
      setLoading(button, true, 'Generating...');
      try {
        const data = await api('/api/context', {
          method: 'POST',
          body: JSON.stringify({
            id: current.id,
            previousContext: ''
          })
        });
        current.contexts = Array.isArray(data.contexts) ? data.contexts : current.contexts;
        state.flashcardContextPool = getCombinedContextPool(current);
        const insertedContext = data.context || state.flashcardContextPool[0] || 'No context available';
        state.flashcardContextIndex = Math.max(0, state.flashcardContextPool.indexOf(insertedContext));
        state.flashcardContextVisible = true;
        const index = state.vocabulary.findIndex(function (item) { return item.id === current.id; });
      if (index >= 0) {
        state.vocabulary[index] = Object.assign({}, state.vocabulary[index], {
          contexts: current.contexts
        });
      }
      persistState();
      els.flashcardContext.textContent = insertedContext;
        renderVocabulary();
        renderFlashcardState();
        showStatus('New context added to the library.', 'success');
      } catch (error) {
        showStatus(error.message, 'error');
      } finally {
        button.disabled = false;
        delete button.dataset.label;
        button.textContent = state.flashcardContextVisible
          ? (state.flashcardContextIndex >= state.flashcardContextPool.length - 1 ? 'Generate new context' : 'Next context')
          : 'Show context';
      }
      return;
    }

    if (!state.flashcardContextVisible) {
      state.flashcardContextVisible = true;
      state.flashcardContextIndex = 0;
      state.flashcardContextPool = pool;
      els.flashcardContext.textContent = pool[0] || 'No context available';
      renderFlashcardState();
      return;
    }

    const nextIndex = state.flashcardContextIndex + 1;
    if (nextIndex < pool.length) {
      state.flashcardContextIndex = nextIndex;
      els.flashcardContext.textContent = pool[nextIndex] || 'No context available';
      renderFlashcardState();
      return;
    }

    const button = els.toggleContextBtn;
    setLoading(button, true, 'Generating...');
    try {
      const data = await api('/api/context', {
        method: 'POST',
        body: JSON.stringify({
          id: current.id,
          previousContext: pool[pool.length - 1] || ''
        })
      });
      current.contexts = Array.isArray(data.contexts) ? data.contexts : current.contexts;
      state.flashcardContextPool = getCombinedContextPool(current);
      const insertedContext = data.context || state.flashcardContextPool[state.flashcardContextPool.length - 1] || '';
      state.flashcardContextIndex = Math.max(0, state.flashcardContextPool.indexOf(insertedContext));
      state.flashcardContextVisible = true;
      const index = state.vocabulary.findIndex(function (item) { return item.id === current.id; });
      if (index >= 0) {
        state.vocabulary[index] = Object.assign({}, state.vocabulary[index], {
          contexts: current.contexts
        });
      }
      persistState();
      els.flashcardContext.textContent = insertedContext || 'No context available';
      renderVocabulary();
      renderFlashcardState();
      showStatus('New context added to the library.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      button.disabled = false;
      delete button.dataset.label;
      button.textContent = state.flashcardContextVisible
        ? (state.flashcardContextIndex >= state.flashcardContextPool.length - 1 ? 'Generate new context' : 'Next context')
        : 'Show context';
    }
  }

  async function deleteVocabularyItem(id) {
    await api('/api/vocabulary/' + encodeURIComponent(id), { method: 'DELETE' });
    state.vocabulary = state.vocabulary.filter(function (item) { return item.id !== id; });
    persistState();
    renderVocabulary();
  }

  async function saveSettings() {
    const previousLanguage = state.settings.language;
    const next = {
      language: els.languageSelect.value,
      voice: els.voiceSelect.value,
      speed: Number(els.speedInput.value),
      subject: els.subjectSelect.value,
      level: els.levelSelect.value,
      vocab_words_count: Number(els.vocabWordsInput.value),
      vocabulary_mix: Number(els.vocabularyMixInput.value),
      quiz_option_count: Number(els.quizOptionCountInput.value),
      listening_new_learning_percent: Number(els.listeningMixInput.value),
      listening_batch_size: Number(els.listeningBatchSizeInput.value),
      listening_playback_speed: Number(els.listeningPlaybackSpeedInput.value),
      listening_repetitions: Number(els.listeningRepetitionsInput.value),
      listening_gap_seconds: Number(els.listeningGapInput.value),
      listening_autoplay_phrase_limit: Number(els.listeningAutoplayLimitInput.value),
      listening_show_sentence: els.listeningShowSentenceSettingInput.checked,
      new_to_learning_seen_threshold: Number(els.newToLearningInput.value),
      learning_to_known_success_threshold: Number(els.learningToKnownInput.value)
    };
    const data = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(next)
    });
    state.settings = normalizeSettings(data.settings);
    state.listeningAutoplayCount = 0;
    state.listeningRepetition = 0;
    els.listeningCheckin.classList.add('hidden');
    els.listeningAudio.playbackRate = state.settings.listening_playback_speed;
    if (previousLanguage !== state.settings.language) {
      state.listeningLoaded = false;
      state.listeningSentences = [];
      state.listeningIndex = -1;
      renderListeningSentence();
    }
    persistState();
    populateSettingsForm();
    els.settingsModal.classList.add('hidden');
    renderVocabulary();
    showStatus('Settings saved.', 'success');
  }

  function setLoading(button, isLoading, label) {
    button.disabled = isLoading;
    button.dataset.label = button.dataset.label || button.textContent;
    button.textContent = isLoading ? label : button.dataset.label;
  }

  function refreshFlashcardIfNeeded() {
    state.flashcards = [];
    state.flashcardIndex = 0;
    state.flashcardStats = { known: 0, unknown: 0 };
    state.flashcardActiveId = '';
    state.flashcardExposureLoggedForId = '';
    state.flashcardContextIndex = -1;
    state.flashcardContextVisible = false;
    state.flashcardContextPool = [];
    els.flashcardFilter.value = state.flashcardFilter;
    els.flashcardCount.value = String(state.flashcardCount);
    els.flashcardState.classList.add('hidden');
    els.flashcardEmpty.classList.remove('hidden');
    renderFlashcardState();
  }

  function startSession() {
    state.flashcardFilter = els.flashcardFilter.value;
    state.flashcardCount = Number(els.flashcardCount.value || 10);
    state.flashcards = pickFlashcards();
    state.flashcardIndex = 0;
    state.flashcardStats = { known: 0, unknown: 0 };
    state.flashcardActiveId = '';
    state.flashcardExposureLoggedForId = '';
    state.flashcardContextIndex = -1;
    state.flashcardContextVisible = false;
    state.flashcardContextPool = [];
    renderFlashcardState();
  }

  function showNextFlashcard() {
    if (state.flashcardIndex < state.flashcards.length - 1) {
      state.flashcardIndex++;
      state.flashcardActiveId = '';
      renderFlashcardState();
    } else {
      showStatus('Flashcard session complete.', 'success');
      state.flashcards = [];
      renderFlashcardState();
    }
  }

  async function markFlashcardKnown() {
    const current = state.flashcards[state.flashcardIndex];
    if (!current) return;
    const nextSuccess = Number(current.reviewSuccessCount || 0) + 1;
    const patch = {
      review_success_count: nextSuccess
    };
    if (
      current.mastery === 'learning' &&
      nextSuccess >= Number(state.settings.learning_to_known_success_threshold || 5)
    ) {
      patch.mastery = 'known';
    } else if (current.mastery === 'new' && Number(current.reviewSeenCount || 0) >= Number(state.settings.new_to_learning_seen_threshold || 3)) {
      patch.mastery = 'learning';
    }
    const data = await updateVocabularyItem(current.id, patch);
    if (data && data.item) {
      state.flashcards[state.flashcardIndex] = data.item;
    }
    state.flashcardStats.known++;
    showNextFlashcard();
  }

  async function markFlashcardUnknown() {
    const current = state.flashcards[state.flashcardIndex];
    if (!current) return;
    const nextMastery = current.mastery === 'known' ? 'learning' : current.mastery === 'learning' ? 'new' : 'new';
    const data = await updateVocabularyItem(current.id, {
      mastery: nextMastery
    });
    if (data && data.item) {
      state.flashcards[state.flashcardIndex] = data.item;
    }
    state.flashcardStats.unknown++;
    showNextFlashcard();
  }

  function bindEvents() {
    els.tabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setTab(button.dataset.tab);
      });
    });

    els.generateTextBtn.addEventListener('click', generateText);
    els.topicInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        generateText();
      }
    });
    els.prevHistoryBtn.addEventListener('click', function () {
      if (state.historyIndex > 0) {
        state.historyIndex--;
        renderText();
      }
    });
    els.nextHistoryBtn.addEventListener('click', function () {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        renderText();
      }
    });
    els.listenBtn.addEventListener('click', speakCurrentText);
    els.generateTopicsBtn.addEventListener('click', generateTopics);
    els.addPhraseBtn.addEventListener('click', addPhrase);
    els.vocabSearchInput.addEventListener('input', function () {
      state.vocabSearch = els.vocabSearchInput.value;
      renderVocabulary();
    });
    els.vocabFilter.addEventListener('change', function () {
      state.vocabFilter = els.vocabFilter.value;
      renderVocabulary();
    });
    els.startSessionBtn.addEventListener('click', startSession);
    els.knowBtn.addEventListener('click', markFlashcardKnown);
    els.dontKnowBtn.addEventListener('click', markFlashcardUnknown);
    els.toggleContextBtn.addEventListener('click', advanceFlashcardContext);
    els.flashcardContext.addEventListener('click', advanceFlashcardContext);
    els.moreExamplesBtn.addEventListener('click', advanceFlashcardContext);
    els.toggleTranslationBtn.addEventListener('click', async function () {
      const current = state.flashcards[state.flashcardIndex];
      if (!current) return;
      if (!current.translation) {
        const data = await api('/api/translate', {
          method: 'POST',
          body: JSON.stringify({
            id: current.id,
            word: current.word,
            kind: 'translation',
            previousTranslation: current.translation || '',
            previousMnemonic: current.mnemonic || '',
            targetLanguage: current.targetLanguage || state.settings.language
          })
        });
        current.translation = data.translation;
        els.flashcardTranslation.textContent = data.translation;
      }
      els.flashcardTranslation.classList.toggle('hidden');
      els.toggleTranslationBtn.textContent = els.flashcardTranslation.classList.contains('hidden') ? 'Show translation' : 'Hide translation';
    });
    els.endSessionBtn.addEventListener('click', function () {
      state.flashcards = [];
      renderFlashcardState();
      showStatus('Flashcard session ended.', 'success');
    });
    els.openSettingsBtn.addEventListener('click', function () {
      populateSettingsForm();
      els.settingsModal.classList.remove('hidden');
    });
    els.closeSettingsBtn.addEventListener('click', function () {
      els.settingsModal.classList.add('hidden');
    });
    els.settingsModal.addEventListener('click', function (event) {
      if (event.target === els.settingsModal) {
        els.settingsModal.classList.add('hidden');
      }
    });
    els.speedInput.addEventListener('input', function () {
      els.speedLabel.textContent = Number(els.speedInput.value).toFixed(1) + 'x';
    });
    els.vocabWordsInput.addEventListener('input', function () {
      els.vocabWordsLabel.textContent = String(els.vocabWordsInput.value) + ' words';
    });
    els.vocabularyMixInput.addEventListener('input', function () {
      els.vocabularyMixLabel.textContent = vocabularyMixLabel(els.vocabularyMixInput.value);
    });
    els.quizOptionCountInput.addEventListener('input', function () {
      els.quizOptionCountLabel.textContent = String(els.quizOptionCountInput.value) + ' choices';
    });
    els.listeningMixInput.addEventListener('input', function () {
      els.listeningMixLabel.textContent = String(els.listeningMixInput.value) + '% from new + learning';
    });
    els.listeningBatchSizeInput.addEventListener('input', function () {
      els.listeningBatchSizeLabel.textContent = String(els.listeningBatchSizeInput.value) + ' sentences';
    });
    els.listeningPlaybackSpeedInput.addEventListener('input', function () {
      const speed = Number(els.listeningPlaybackSpeedInput.value);
      els.listeningPlaybackSpeedLabel.textContent = speed.toFixed(2).replace(/0$/, '') + '×';
    });
    els.listeningRepetitionsInput.addEventListener('input', function () {
      const count = Number(els.listeningRepetitionsInput.value);
      els.listeningRepetitionsLabel.textContent = String(count) + (count === 1 ? ' play' : ' plays');
    });
    els.listeningGapInput.addEventListener('input', function () {
      els.listeningGapLabel.textContent = String(els.listeningGapInput.value) + ' seconds';
    });
    els.listeningAutoplayLimitInput.addEventListener('input', function () {
      els.listeningAutoplayLimitLabel.textContent = String(els.listeningAutoplayLimitInput.value) + ' phrases';
    });
    els.listeningShowSentenceSettingInput.addEventListener('change', function () {
      els.showListeningSentenceInput.checked = els.listeningShowSentenceSettingInput.checked;
    });
    els.newToLearningInput.addEventListener('input', function () {
      els.newToLearningLabel.textContent = String(els.newToLearningInput.value) + ' sees';
    });
    els.learningToKnownInput.addEventListener('input', function () {
      els.learningToKnownLabel.textContent = String(els.learningToKnownInput.value) + ' correct';
    });
    els.saveSettingsBtn.addEventListener('click', saveSettings);
    els.newQuizQuestionBtn.addEventListener('click', loadQuizQuestion);
    els.quizOptions.addEventListener('click', function (event) {
      const option = event.target.closest('.quiz-option');
      if (option) answerQuiz(option.dataset.word);
    });
    els.generateListeningBtn.addEventListener('click', function () { generateListeningBatch(false); });
    els.previousListeningBtn.addEventListener('click', function () {
      moveListening(-1, !els.listeningAudio.paused && !els.listeningAudio.ended);
    });
    els.nextListeningBtn.addEventListener('click', function () {
      moveListening(1, !els.listeningAudio.paused && !els.listeningAudio.ended);
    });
    els.playPauseListeningBtn.addEventListener('click', toggleListeningPlayback);
    els.replayListeningBtn.addEventListener('click', function () {
      if (state.listeningIndex < 0) return;
      window.clearTimeout(state.listeningGapTimer);
      state.listeningRepetition = 0;
      els.listeningAudio.currentTime = 0;
      playCurrentListening();
    });
    els.translateListeningBtn.addEventListener('click', toggleListeningTranslation);
    els.deleteListeningBtn.addEventListener('click', deleteCurrentListeningSentence);
    els.showListeningSentenceInput.addEventListener('change', function () {
      updateListeningSentenceVisibility(els.showListeningSentenceInput.checked);
    });
    els.randomListeningOrderInput.addEventListener('change', function () {
      updateListeningRandomOrder(els.randomListeningOrderInput.checked);
    });
    els.openListeningLibraryBtn.addEventListener('click', openListeningLibrary);
    els.closeListeningLibraryBtn.addEventListener('click', closeListeningLibrary);
    els.listeningLibraryModal.addEventListener('click', function (event) {
      if (event.target === els.listeningLibraryModal) closeListeningLibrary();
    });
    els.listeningLibraryList.addEventListener('click', function (event) {
      const button = event.target.closest('.select-listening-sentence-btn');
      if (!button) return;
      const shouldResume = !els.listeningAudio.paused && !els.listeningAudio.ended;
      const index = state.listeningSentences.findIndex(function (item) { return item.id === button.dataset.id; });
      if (index < 0) return;
      state.listeningIndex = index;
      state.listeningRepetition = 0;
      state.listeningTranslationVisible = false;
      renderListeningSentence();
      closeListeningLibrary();
      if (shouldResume) playCurrentListening();
    });
    els.listeningSentence.addEventListener('click', async function (event) {
      const target = event.target.closest('.story-word');
      if (!target || !target.dataset.word) return;
      const item = state.listeningSentences[state.listeningIndex];
      if (!item) return;
      await saveWord(target.dataset.word, item.text);
      renderListeningSentence();
    });
    els.listeningSentence.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target.closest('.story-word');
      if (!target || !target.dataset.word) return;
      event.preventDefault();
      target.click();
    });
    els.listeningAudio.addEventListener('ended', handleListeningEnded);
    els.listeningAudio.addEventListener('play', syncListeningPlayButton);
    els.listeningAudio.addEventListener('pause', syncListeningPlayButton);
    els.listeningSpeedSelect.addEventListener('change', function () {
      updateListeningPlaybackSpeed(els.listeningSpeedSelect.value);
    });
    els.continuousListeningInput.addEventListener('change', function () {
      if (!els.continuousListeningInput.checked) {
        window.clearTimeout(state.listeningGapTimer);
        els.listeningCheckin.classList.add('hidden');
        state.listeningAutoplayCount = 0;
      }
    });
    els.continueListeningBtn.addEventListener('click', function () {
      state.listeningAutoplayCount = 0;
      els.listeningCheckin.classList.add('hidden');
      afterListeningGap(function () { moveListening(1, true); });
    });

    els.currentText.addEventListener('mouseup', function () {
      const selectedText = getSelectionTextWithin(els.currentText);
      if (!selectedText) return;
      const fullText = els.currentText.dataset.full || '';
      state.selectedStoryWord = { word: toLowerClean(selectedText), context: extractContext(fullText, selectedText) };
      state.ignoreNextTextClick = true;
      window.setTimeout(function () {
        state.ignoreNextTextClick = false;
      }, 0);
      clearCurrentSelection();
      saveWord(selectedText, state.selectedStoryWord.context);
    });

    els.currentText.addEventListener('click', function (event) {
      if (state.ignoreNextTextClick) return;
      if (getSelectionTextWithin(els.currentText)) return;
      const target = event.target.closest('.story-word');
      if (!target) return;
      const word = target.dataset.word;
      const fullText = els.currentText.dataset.full || '';
      if (!word) return;
      state.selectedStoryWord = { word: word, context: extractContext(fullText, word) };
      renderText();
      saveWord(word, state.selectedStoryWord.context);
    });

    els.topicsList.addEventListener('click', function (event) {
      const target = event.target.closest('.topic-item');
      if (!target) return;
      generateTextFromTopic(target.dataset.topic || '');
    });

    els.vocabList.addEventListener('click', function (event) {
      const card = event.target.closest('.card');
      if (!card) return;
      const id = card.dataset.id;
      if (event.target.classList.contains('delete-word-btn')) {
        deleteVocabularyItem(id);
      } else if (event.target.classList.contains('save-translation-btn')) {
        refreshTranslationForItem(id);
      } else if (event.target.classList.contains('save-mnemonic-btn')) {
        refreshMnemonicForItem(id);
      } else if (event.target.classList.contains('generate-contexts-btn')) {
        generateContextsForItem(id, 5);
      } else if (event.target.classList.contains('generate-image-btn')) {
        const item = state.vocabulary.find(function (row) { return row.id === id; });
        generateImageForItem(id, item && item.contexts && item.contexts[0]);
      } else if (event.target.classList.contains('target-language-btn')) {
        const item = state.vocabulary.find(function (row) { return row.id === id; });
        if (item) {
          updateVocabularyItem(id, { targetLanguage: state.settings.language });
        }
      }
    });

    els.vocabList.addEventListener('change', function (event) {
      const select = event.target.closest('.mastery-select');
      if (!select) return;
      updateVocabularyItem(select.dataset.id, { mastery: select.value });
    });

    els.vocabList.addEventListener('toggle', function (event) {
      const card = event.target.closest('details.vocab-card');
      if (!card) return;
      if (card.open) state.openVocabularyIds.add(card.dataset.id);
      else state.openVocabularyIds.delete(card.dataset.id);
    }, true);

    els.browseImagesBtn.addEventListener('click', openImageBrowser);
    els.closeImageBrowserBtn.addEventListener('click', closeImageBrowser);
    els.previousImageBtn.addEventListener('click', function () { moveImageBrowser(-1); });
    els.nextImageBtn.addEventListener('click', function () { moveImageBrowser(1); });
    els.imageBrowserModal.addEventListener('click', function (event) {
      if (event.target === els.imageBrowserModal) closeImageBrowser();
    });

    document.addEventListener('keydown', function (event) {
      if (!els.imageBrowserModal.classList.contains('hidden')) {
        if (event.key === 'ArrowLeft') moveImageBrowser(-1);
        else if (event.key === 'ArrowRight') moveImageBrowser(1);
        else if (event.key === 'Escape') closeImageBrowser();
        return;
      }
      if (!els.listeningLibraryModal.classList.contains('hidden')) {
        if (event.key === 'Escape') closeListeningLibrary();
        return;
      }
      if (state.tab === 'listening' && els.listeningCheckin.classList.contains('hidden')) {
        const tagName = String(event.target && event.target.tagName || '').toLowerCase();
        if (!['input', 'select', 'button', 'audio', 'textarea'].includes(tagName)) {
          const shouldResume = !els.listeningAudio.paused && !els.listeningAudio.ended;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            moveListening(-1, shouldResume);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            moveListening(1, shouldResume);
          } else if (event.key === ' ') {
            event.preventDefault();
            toggleListeningPlayback();
          }
        }
        return;
      }
      if (state.tab !== 'flashcards' || !state.flashcards.length) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        markFlashcardKnown();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        markFlashcardUnknown();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        advanceFlashcardContext();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        els.toggleTranslationBtn.click();
      }
    });

    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    }
  }

  async function generateTextFromTopic(topic) {
    els.topicInput.value = topic;
    await generateText();
  }

  function extractContext(fullText, word) {
    const source = String(fullText || '');
    const lowerSource = source.toLowerCase();
    const needle = String(word || '').toLowerCase();
    const index = lowerSource.indexOf(needle);
    if (index < 0) return source;

    let start = index;
    while (start > 0) {
      const ch = source[start - 1];
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        break;
      }
      start--;
    }

    while (start < source.length && /\s/.test(source[start])) {
      start++;
    }

    let end = index + needle.length;
    while (end < source.length) {
      const ch = source[end];
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        end++;
        break;
      }
      end++;
    }

    return source.slice(start, end).trim();
  }

  bindEvents();
  refreshVoices();
  await loadBootstrap();
  setTab('text');
})();
`;

  function normalizeSettings(row) {
    return {
      id: 'default',
      language: row.language || DEFAULT_SETTINGS.language,
      voice: row.voice || DEFAULT_SETTINGS.voice,
      speed: Number(row.speed || DEFAULT_SETTINGS.speed),
      subject: row.subject || DEFAULT_SETTINGS.subject,
      level: row.level || DEFAULT_SETTINGS.level,
      vocab_words_count: Number(row.vocab_words_count ?? DEFAULT_SETTINGS.vocab_words_count),
      vocabulary_mix: clampPercentage(row.vocabulary_mix ?? DEFAULT_SETTINGS.vocabulary_mix),
      quiz_option_count: clampQuizOptionCount(row.quiz_option_count ?? DEFAULT_SETTINGS.quiz_option_count),
      listening_new_learning_percent: clampPercentage(row.listening_new_learning_percent ?? DEFAULT_SETTINGS.listening_new_learning_percent),
      listening_batch_size: Math.min(12, Math.max(3, Number(row.listening_batch_size || DEFAULT_SETTINGS.listening_batch_size))),
      listening_playback_speed: Math.min(2, Math.max(0.5, Number(row.listening_playback_speed || DEFAULT_SETTINGS.listening_playback_speed))),
      listening_repetitions: Math.min(10, Math.max(1, Number(row.listening_repetitions || DEFAULT_SETTINGS.listening_repetitions))),
      listening_gap_seconds: Math.min(10, Math.max(0, Number(row.listening_gap_seconds) || 0)),
      listening_autoplay_phrase_limit: Math.min(100, Math.max(1, Number(row.listening_autoplay_phrase_limit || DEFAULT_SETTINGS.listening_autoplay_phrase_limit))),
      listening_show_sentence: Boolean(row.listening_show_sentence),
      listening_random_order: row.listening_random_order === undefined ? true : Boolean(row.listening_random_order),
      new_to_learning_seen_threshold: Number(row.new_to_learning_seen_threshold || DEFAULT_SETTINGS.new_to_learning_seen_threshold),
      learning_to_known_success_threshold: Number(row.learning_to_known_success_threshold || DEFAULT_SETTINGS.learning_to_known_success_threshold)
    };
  }

function normalizeVocabulary(row) {
  const legacyNotes = splitLegacyTranslationNote(row.translation || '');
  const mnemonic = row.mnemonic || row.mnemonic_text || legacyNotes.mnemonic || '';
  const translation = row.translation_text || (mnemonic ? row.translation || '' : legacyNotes.translation) || row.translation || '';
  return {
    id: row.id,
    word: row.word,
    mastery: row.mastery || 'new',
    occurrences: Number(row.occurrences || 0),
    lastSeen: row.last_seen || row.lastSeen || new Date().toISOString(),
    reviewSeenCount: Number(row.review_seen_count || row.reviewSeenCount || 0),
    reviewSuccessCount: Number(row.review_success_count || row.reviewSuccessCount || 0),
    contexts: readJson(row.contexts_json || row.contexts || '[]'),
    forms: readJson(row.forms_json || row.forms || '[]'),
    targetLanguage: row.target_language || row.targetLanguage || 'Spanish',
    translation: translation,
    mnemonic: mnemonic,
    image: normalizeImageData(row.image_json || row.image || '{}'),
    examples: normalizeExampleValues(readJson(row.examples_json || row.examples || '[]'))
  };
}

function normalizeHistory(row) {
  return {
    id: row.id,
    text: row.text,
    related_topics_json: readJson(row.related_topics_json || row.relatedTopics || '[]'),
    show_topics: Boolean(row.show_topics || row.showTopics)
  };
}

function normalizeListeningSentence(row) {
  return {
    id: row.id,
    batchId: row.batch_id || row.batchId || '',
    language: row.language || '',
    text: row.text || '',
    vocabulary: readJson(row.vocabulary_json || row.vocabulary || '[]'),
    voiceId: row.voice_id || row.voiceId || '',
    voiceName: row.voice_name || row.voiceName || '',
    translation: row.translation || '',
    listenCount: Number(row.listen_count || row.listenCount || 0),
    audioContentType: row.audio_content_type || row.audioContentType || 'audio/mpeg',
    audioUrl: '/api/listening-audio/' + encodeURIComponent(row.id),
    createdAt: row.created_at || row.createdAt || ''
  };
}

function readJson(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function shuffleArray(values) {
  const copy = Array.isArray(values) ? values.slice() : [];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function clampPercentage(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function buildVocabularyGuidance(items, selectedWords, mode) {
  const practiceWords = uniqueStrings(Array.isArray(selectedWords) ? selectedWords : []);
  const practiceLookup = new Set(practiceWords.map((word) => word.toLocaleLowerCase()));
  const practiceHint = practiceWords.length
    ? 'The words explicitly marked [PRACTICE] are the words to practise; include every one naturally, or a close inflected variant. Practice words: ' + practiceWords.map((word) => '[PRACTICE] ' + word).join(', ') + '.'
    : 'No specific practice words were selected for this piece.';

  if (mode !== 'minimise-new') {
    return practiceHint + ' Introduce several useful new vocabulary items that are not in the learner vocabulary, while keeping them appropriate for the requested level. Do not define or label the new words in the output.';
  }

  const vocabulary = uniqueStrings((Array.isArray(items) ? items : []).map((item) => item && item.word))
    .map((word) => (practiceLookup.has(word.toLocaleLowerCase()) ? '[PRACTICE] ' : '[KNOWN] ') + word)
    .join('\n');

  return practiceHint +
    ' Minimise unfamiliar vocabulary: prefer words from the complete learner vocabulary below wherever natural. Use new content words only when needed for grammar, clarity, the topic, or natural phrasing. Do not print the [PRACTICE] or [KNOWN] labels in the output.\n\n' +
    'Complete learner vocabulary:\n' + (vocabulary || '(empty)');
}

function pickVocabularyWords(items, count, mix = DEFAULT_SETTINGS.vocabulary_mix) {
  const targetCount = Math.max(0, Math.floor(Number(count) || 0));
  if (!targetCount) {
    return [];
  }

  const buckets = {
    new: [],
    learning: [],
    known: []
  };

  for (const item of Array.isArray(items) ? items : []) {
    const mastery = item.mastery === 'learning' ? 'learning' : item.mastery === 'known' ? 'known' : 'new';
    buckets[mastery].push(item);
  }

  const normalizedMix = clampPercentage(mix);
  const weights = {
    new: (100 - normalizedMix) / 2,
    learning: 50,
    known: normalizedMix / 2
  };
  const masteryOrder = ['new', 'learning', 'known'];
  const availableCount = masteryOrder.reduce((total, mastery) => total + buckets[mastery].length, 0);
  const limit = Math.min(targetCount, availableCount);
  const quotas = {};
  const remainders = [];

  masteryOrder.forEach((mastery) => {
    const exact = limit * weights[mastery] / 100;
    quotas[mastery] = Math.min(buckets[mastery].length, Math.floor(exact));
    remainders.push({ mastery, remainder: exact - Math.floor(exact) });
  });

  let allocated = masteryOrder.reduce((total, mastery) => total + quotas[mastery], 0);
  remainders.sort((a, b) => b.remainder - a.remainder);
  while (allocated < limit) {
    const candidate = remainders.find(({ mastery }) => quotas[mastery] < buckets[mastery].length);
    if (!candidate) break;
    quotas[candidate.mastery]++;
    allocated++;
    candidate.remainder = -1;
    if (remainders.every((entry) => entry.remainder < 0) && allocated < limit) {
      remainders.forEach((entry) => { entry.remainder = weights[entry.mastery]; });
      remainders.sort((a, b) => b.remainder - a.remainder);
    }
  }

  const selected = masteryOrder.flatMap((mastery) =>
    shuffleArray(buckets[mastery]).slice(0, quotas[mastery])
  );
  return shuffleArray(selected).slice(0, limit).map((item) => item.word);
}

export { buildQuizOptions, buildQuizSentenceFromLibrary, buildVocabularyGuidance, clampPercentage, clampQuizOptionCount, mapWithConcurrency, normalizeQuizSentence, parseQuizQuestion, pickListeningVocabulary, pickVocabularyWords, selectEligibleElevenLabsVoices };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
