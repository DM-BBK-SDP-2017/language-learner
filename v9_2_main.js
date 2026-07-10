import { initSettings, loadSettings } from './settings.js';
import { initTextGenerator } from './textGenerator.js';
import { initSpeechManager } from './speechManager.js';
import { initVocabularyManager } from './vocabularyManager.js';
import { initHistoryManager } from './historyManager.js';
import { initFlashcardManager } from './flashcardManager.js';
import { initUI } from './uiManager.js';

document.addEventListener('DOMContentLoaded', async () => {
    const settings = await loadSettings();
    const speechManager = initSpeechManager(settings);
    const vocabularyManager = initVocabularyManager();
    const historyManager = initHistoryManager();
    const textGenerator = initTextGenerator(settings, vocabularyManager);
    const flashcardManager = initFlashcardManager(vocabularyManager);
    
    initUI(settings, speechManager, vocabularyManager, historyManager, textGenerator, flashcardManager);
    initSettings(settings, speechManager);
});