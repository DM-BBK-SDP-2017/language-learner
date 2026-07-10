import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuizOptions, buildQuizSentenceFromLibrary, buildVocabularyGuidance, clampQuizOptionCount, mapWithConcurrency, normalizeQuizSentence, parseQuizQuestion, pickListeningVocabulary, pickVocabularyWords, selectEligibleElevenLabsVoices } from './worker.js';

const vocabulary = ['new', 'learning', 'known'].flatMap((mastery) =>
  Array.from({ length: 10 }, (_, index) => ({ word: mastery + index, mastery }))
);

test('selection never exceeds the configured maximum', () => {
  assert.equal(pickVocabularyWords(vocabulary, 4, 50).length, 4);
  assert.equal(pickVocabularyWords(vocabulary, 0, 50).length, 0);
});

test('the midpoint produces a new-learning-known mix', () => {
  const selected = pickVocabularyWords(vocabulary, 8, 50);
  assert.equal(selected.filter((word) => word.startsWith('new')).length, 2);
  assert.equal(selected.filter((word) => word.startsWith('learning')).length, 4);
  assert.equal(selected.filter((word) => word.startsWith('known')).length, 2);
});

test('missing mastery buckets are redistributed without exceeding the maximum', () => {
  const selected = pickVocabularyWords(vocabulary.filter((item) => item.mastery === 'known'), 6, 0);
  assert.equal(selected.length, 6);
  assert.ok(selected.every((word) => word.startsWith('known')));
});

test('listening selection favours new and learning words at the configured percentage', () => {
  const selected = pickListeningVocabulary(vocabulary, 10, 80);
  const preferred = selected.filter((word) => word.startsWith('new') || word.startsWith('learning'));
  assert.equal(selected.length, 10);
  assert.equal(preferred.length, 8);
});

test('listening selection fills from available mastery groups', () => {
  const knownOnly = vocabulary.filter((item) => item.mastery === 'known');
  assert.equal(pickListeningVocabulary(knownOnly, 6, 100).length, 6);
});

test('French listening voices are restricted to the approved premade pool', () => {
  const voices = selectEligibleElevenLabsVoices('French', [
    { voiceId: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger - old label', category: 'premade' },
    { voiceId: 'sKbNSlHXq99bttvf8rRF', name: 'Professional French voice', category: 'professional' },
    { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah - old label', category: 'premade' }
  ]);
  assert.deepEqual(voices, [
    { voiceId: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger' },
    { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' }
  ]);
});

test('concurrency helper never exceeds the configured request limit', async () => {
  let active = 0;
  let maximum = 0;
  const values = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 4, async (value) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return value * 2;
  });
  assert.equal(maximum, 4);
  assert.deepEqual(values, [2, 4, 6, 8, 10, 12, 14, 16]);
});

test('minimise-new guidance supplies all vocabulary and highlights practice words', () => {
  const guidance = buildVocabularyGuidance(
    [{ word: 'bonjour' }, { word: 'fromage' }, { word: 'partir' }],
    ['fromage'],
    'minimise-new'
  );
  assert.match(guidance, /\[KNOWN\] bonjour/);
  assert.match(guidance, /\[PRACTICE\] fromage/);
  assert.match(guidance, /\[KNOWN\] partir/);
  assert.match(guidance, /Minimise unfamiliar vocabulary/);
});

test('more-new guidance asks for unfamiliar level-appropriate vocabulary', () => {
  const guidance = buildVocabularyGuidance([{ word: 'bonjour' }], ['bonjour'], 'more-new');
  assert.match(guidance, /Introduce several useful new vocabulary items/);
  assert.match(guidance, /Practice words: \[PRACTICE\] bonjour/);
  assert.doesNotMatch(guidance, /Complete learner vocabulary/);
});

test('embedded browser script is valid JavaScript', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const startMarker = 'const APP_JS = String.raw`';
  const start = source.indexOf(startMarker) + startMarker.length;
  const end = source.indexOf('\n`;\n\n  function normalizeSettings(row)', start);
  assert.ok(start >= startMarker.length && end > start);
  assert.doesNotThrow(() => new Function(source.slice(start, end)));
});

test('Sentence Radio does not reload the current audio during UI rerenders', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const start = source.indexOf('function renderListeningSentence()');
  const end = source.indexOf('\n  async function loadListeningSentences', start);
  const renderSource = source.slice(start, end);
  assert.match(renderSource, /dataset\.sentenceId !== item\.id/);
  assert.match(renderSource, /listeningAudio\.load\(\)/);
});

test('Sentence Radio only generates batches from the manual action', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /generateListeningBatch\(true\)/);
  assert.doesNotMatch(source, /await generateListeningBatch\(false\)/);
});

test('Sentence Radio uses custom playback controls and keeps auto-play available', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  assert.match(source, /id="playPauseListeningBtn"/);
  assert.match(source, /toggleListeningPlayback/);
  assert.match(source, /id="continuousListeningInput"[^>]*checked[\s\S]*Auto-play/);
  assert.doesNotMatch(source, /<audio id="listeningAudio" controls/);
});

test('Sentence Radio keyboard shortcuts support less, more, and play pause', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const start = source.indexOf("if (state.tab === 'listening'");
  const end = source.indexOf("if (state.tab !== 'flashcards'", start);
  const shortcutSource = source.slice(start, end);
  assert.match(shortcutSource, /ArrowLeft[\s\S]*moveListening\(-1, shouldResume, 'less'\)/);
  assert.match(shortcutSource, /ArrowRight[\s\S]*moveListening\(1, shouldResume, 'more'\)/);
  assert.match(shortcutSource, /ArrowUp[\s\S]*toggleCurrentListeningSentenceVisibility/);
  assert.match(shortcutSource, /ArrowDown[\s\S]*toggleListeningTranslation\(\)/);
  assert.match(shortcutSource, /event\.key === ' '[\s\S]*toggleListeningPlayback\(\)/);
});

test('Sentence Radio persists frequency and displays it in the library', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  assert.match(source, /listening_frequency REAL NOT NULL DEFAULT 1/);
  assert.match(source, /\/frequency/);
  assert.match(source, /function updateListeningFrequency/);
  assert.match(source, /frequency ' \+ formatListeningFrequency\(item\.frequency\)/);
});

test('Sentence Radio selection scores include frequency, recency, and listen count', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const start = source.indexOf('function listeningSelectionScore(item)');
  const end = source.indexOf('\n  function chooseWeightedListeningIndex', start);
  const scoreSource = source.slice(start, end);
  assert.match(scoreSource, /frequency/);
  assert.match(scoreSource, /listenPenalty/);
  assert.match(scoreSource, /newnessBoost/);
  assert.match(scoreSource, /getSentenceAgeHours/);
});

test('Sentence Radio autoplay advances without changing frequency', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const start = source.indexOf('function handleListeningEnded()');
  const end = source.indexOf('\n  async function recordCurrentListeningCompletion', start);
  const endedSource = source.slice(start, end);
  assert.match(endedSource, /moveListening\(1, true\)/);
  assert.doesNotMatch(endedSource, /'more'|'less'/);
});

test('background image polling does not reset the active flashcard session', () => {
  const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const pollStart = source.indexOf('function scheduleImageRefresh()');
  const pollEnd = source.indexOf('\n  async function addContextsToCurrentFlashcard', pollStart);
  const pollingSource = source.slice(pollStart, pollEnd);
  assert.match(pollingSource, /api\('\/api\/vocabulary'\)/);
  assert.doesNotMatch(pollingSource, /loadBootstrap\(\)/);
  assert.doesNotMatch(pollingSource, /refreshFlashcardIfNeeded\(\)/);
});

test('quiz choices include one correct answer and respect the configured count', () => {
  const options = buildQuizOptions('déployer', ['employer', 'déploir', 'déplacer'], ['dresser', 'replier'], 6);
  assert.equal(options.length, 6);
  assert.equal(options.filter((word) => word === 'déployer').length, 1);
  assert.equal(new Set(options.map((word) => word.toLowerCase())).size, 6);
});

test('quiz option count stays within the supported range', () => {
  assert.equal(clampQuizOptionCount(1), 6);
  assert.equal(clampQuizOptionCount(20), 12);
  assert.equal(clampQuizOptionCount(9), 9);
});

test('quiz response parses a target-language cloze sentence and distractors', () => {
  const result = parseQuizQuestion('{"sentence":"Nous devons _____ le projet demain.","distractors":["déplacer","employer"]}');
  assert.equal(result.sentence, 'Nous devons _____ le projet demain.');
  assert.deepEqual(result.distractors, ['déplacer', 'employer']);
});

test('quiz sentences normalize alternate gaps and replace an exposed answer', () => {
  assert.equal(normalizeQuizSentence('Nous devons ______ le projet.', 'déployer'), 'Nous devons _____ le projet.');
  assert.equal(normalizeQuizSentence('Nous devons [GAP] le projet.', 'déployer'), 'Nous devons _____ le projet.');
  assert.equal(normalizeQuizSentence('Nous devons déployer le projet.', 'déployer'), 'Nous devons _____ le projet.');
  assert.equal(normalizeQuizSentence('_____', 'déployer'), '');
});

test('quiz sentence falls back to a saved library context', () => {
  const sentence = buildQuizSentenceFromLibrary({
    word: 'rattacher',
    forms: ['rattaché'],
    examples: ['Ce document est rattaché au dossier principal.'],
    contexts: []
  });
  assert.equal(sentence, 'Ce document est _____ au dossier principal.');
});
