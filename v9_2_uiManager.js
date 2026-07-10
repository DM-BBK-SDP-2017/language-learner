export function initUI(settings, speechManager, vocabularyManager, historyManager, textGenerator, flashcardManager) {
    const appHTML = `
        <div class="flex justify-between items-center mb-6" id="mainNavigation">
            <div class="space-x-2">
                <button id="generateBtn" class="bg-blue-500 text-white px-4 py-2 rounded w-32">New Text</button>
                <input type="text" id="customTopic" placeholder="Custom topic (optional)" class="border rounded px-3 py-2 w-64">
                <button id="vocabularyBtn" class="bg-green-500 text-white px-4 py-2 rounded">Vocabulary</button>
                <button id="flashcardBtn" class="bg-yellow-500 text-white px-4 py-2 rounded">Flashcards</button>
            </div>
            <button id="settingsBtn" class="border border-gray-300 p-2 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>
            </button>
        </div>

        <div id="secondaryNavigation" class="mb-4 hidden">
            <button id="backToTextBtn" class="bg-gray-200 text-gray-700 px-4 py-2 rounded flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="m15 18-6-6 6-6"></path></svg>
                Back to Text
            </button>
        </div>

        <div id="textCard" class="mt-6 bg-white rounded-lg shadow-md">
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <div class="flex items-center gap-2">
                        <button id="prevBtn" class="border border-gray-300 p-2 rounded disabled:opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m15 18-6-6 6-6"></path></svg>
                        </button>
                        <span id="historyIndex" class="text-sm text-gray-500"></span>
                        <button id="nextBtn" class="border border-gray-300 p-2 rounded disabled:opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m9 18 6-6-6-6"></path></svg>
                        </button>
                    </div>

                    <button id="listenBtn" class="flex items-center gap-2 text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                        Listen
                    </button>
                </div>

                <div id="textContent" class="prose prose-lg"></div>

                <div id="relatedTopicsSection" class="mt-6">
                    <button id="generateRelatedBtn" class="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
                        Generate Related Topics
                    </button>
                    <div id="relatedTopicsList" class="mt-4 space-y-2 hidden"></div>
                </div>
            </div>
        </div>

        <div id="vocabularyCard" class="mt-6 bg-white rounded-lg shadow-md hidden">
            <div class="p-6">
                <h2 class="text-xl font-semibold mb-4">Vocabulary List</h2>
                
                <!-- Add text input section -->
                <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h3 class="text-lg font-medium mb-2">Add Text to Vocabulary</h3>
                    <p class="text-sm text-gray-600 mb-3">
                        Paste or type text below. Each phrase will be added to your vocabulary with an AI-generated explanation.
                    </p>
                    <textarea id="textInput" rows="3" class="w-full border rounded p-2 mb-2" 
                              placeholder="Paste or type text here..."></textarea>
                    <button id="addTextBtn" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                        Add to Vocabulary
                    </button>
                    <div id="textInputFeedback" class="mt-2 p-2 rounded hidden"></div>
                </div>

                <div class="flex space-x-2 mb-4">
                    <button class="vocab-filter px-3 py-1 rounded bg-blue-500 text-white" data-filter="all">All</button>
                    <button class="vocab-filter px-3 py-1 rounded bg-gray-200" data-filter="new">New</button>
                    <button class="vocab-filter px-3 py-1 rounded bg-gray-200" data-filter="learning">Learning</button>
                    <button class="vocab-filter px-3 py-1 rounded bg-gray-200" data-filter="known">Known</button>
                </div>
                <div id="vocabularyList" class="space-y-4"></div>
            </div>
        </div>

        <div id="flashcardCard" class="mt-6 bg-white rounded-lg shadow-md hidden">
            <div class="p-6">
                <h2 class="text-xl font-semibold mb-4">Flashcards</h2>
                <div class="flex space-x-2 mb-4">
                    <button class="flashcard-filter px-3 py-1 rounded bg-blue-500 text-white" data-filter="all">All</button>
                    <button class="flashcard-filter px-3 py-1 rounded bg-gray-200" data-filter="new">New</button>
                    <button class="flashcard-filter px-3 py-1 rounded bg-gray-200" data-filter="learning">Learning</button>
                    <button class="flashcard-filter px-3 py-1 rounded bg-gray-200" data-filter="known">Known</button>
                </div>
                
                <div id="flashcardStartScreen" class="text-center py-10">
                    <p class="mb-6 text-gray-600">Start a new flashcard session to review your vocabulary.</p>
                    <button id="startFlashcardsBtn" class="bg-yellow-500 text-white px-6 py-2 rounded hover:bg-yellow-600">Start Session</button>
                    
                    <div class="mt-4 text-xs text-gray-500 bg-gray-50 p-3 rounded">
                        <p class="mb-1"><strong>Spaced Repetition System:</strong></p>
                        <p>Words are shown based on how well you know them. Less familiar words appear more frequently.</p>
                        <p>The algorithm prioritizes words based on:</p>
                        <ul class="list-disc pl-5 text-left mt-1">
                            <li>Mastery level (new → learning → known)</li>
                            <li>How recently you've seen the word</li>
                            <li>How many times you've encountered it</li>
                        </ul>
                    </div>
                    
                    <div class="mt-8 border-t pt-6">
                        <h3 class="text-lg font-medium mb-3">Import Vocabulary</h3>
                        <p class="text-sm text-gray-600 mb-4">
                            Import words from CSV format. Each line should be in the format:<br>
                            <code class="bg-gray-100 px-2 py-1 rounded text-xs">word,context</code>
                        </p>
                        <textarea id="csvImport" rows="5" class="w-full border rounded p-2 text-sm font-mono" 
                          placeholder="palabra,La palabra significa 'word' en inglés."></textarea>
                        <div class="flex justify-between mt-2">
                            <button id="csvImportBtn" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                                Import Words
                            </button>
                            <button id="csvImportExample" class="text-blue-500 text-sm underline">
                                Show Example
                            </button>
                        </div>
                        <div id="importFeedback" class="mt-3 p-3 rounded hidden"></div>
                    </div>
                </div>
                
                <div id="flashcardContent" class="hidden">
                    <div class="flex justify-between text-sm text-gray-500 mb-2">
                        <span id="flashcardProgress">Card 0/0</span>
                        <span id="flashcardStats">Known: 0 | Unknown: 0</span>
                    </div>
                    
                    <div id="flashcardDisplay" class="border rounded-lg p-8 min-h-[200px] mb-4 flex flex-col items-center">
                        <div class="text-2xl font-bold mb-4" id="flashcardWord"></div>
                        <div class="text-gray-600 hidden mb-4" id="flashcardContext"></div>
                        <div class="text-blue-600 hidden mb-4" id="flashcardTranslation"></div>
                        <div class="flex gap-2">
                            <button id="showContextBtn" class="text-blue-500 text-sm underline">Show context</button>
                            <button id="showTranslationBtn" class="text-blue-500 text-sm underline">Show translation</button>
                        </div>
                    </div>
                    
                    <div class="flex justify-between gap-4">
                        <button id="knownBtn" class="flex-1 bg-green-500 text-white px-4 py-3 rounded hover:bg-green-600 transition-colors">
                            I know this <span class="keyboard-shortcut">←</span>
                        </button>
                        <button id="unknownBtn" class="flex-1 bg-red-500 text-white px-4 py-3 rounded hover:bg-red-600 transition-colors">
                            I don't know <span class="keyboard-shortcut">→</span>
                        </button>
                    </div>
                    
                    <div class="mt-6 text-center">
                        <button id="endSessionBtn" class="text-gray-500 underline">End Session</button>
                        <div class="text-xs text-gray-400 mt-2">Press <span class="keyboard-shortcut">↑</span> to toggle context, <span class="keyboard-shortcut">↓</span> to show translation</div>
                    </div>
                </div>
                
                <div id="flashcardEndScreen" class="text-center py-10 hidden">
                    <h3 class="text-xl font-semibold mb-4">Session Complete!</h3>
                    <div id="endSessionStats" class="mb-6"></div>
                    <button id="newFlashcardSessionBtn" class="bg-yellow-500 text-white px-6 py-2 rounded hover:bg-yellow-600">New Session</button>
                </div>
            </div>
        </div>
    `;

    const appContainer = document.getElementById('app');
    appContainer.innerHTML = appHTML;

    const generateBtn = document.getElementById('generateBtn');
    const customTopic = document.getElementById('customTopic');
    const vocabularyBtn = document.getElementById('vocabularyBtn');
    const flashcardBtn = document.getElementById('flashcardBtn');
    const textCard = document.getElementById('textCard');
    const vocabularyCard = document.getElementById('vocabularyCard');
    const flashcardCard = document.getElementById('flashcardCard');
    const textContent = document.getElementById('textContent');
    const vocabularyList = document.getElementById('vocabularyList');
    const historyIndexSpan = document.getElementById('historyIndex');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const listenBtn = document.getElementById('listenBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    function updateTextDisplay() {
        const currentItem = historyManager.getCurrentHistoryItem();
        if (!currentItem || !currentItem.text) {
            textContent.innerHTML = '';
            const generateRelatedBtn = document.getElementById('generateRelatedBtn');
            const relatedTopicsList = document.getElementById('relatedTopicsList');
            if (generateRelatedBtn) generateRelatedBtn.style.display = 'none';
            if (relatedTopicsList) relatedTopicsList.classList.add('hidden');
            return;
        }

        const words = currentItem.text.split(' ');
        textContent.innerHTML = words.map(word => {
            const cleanWord = word.toLowerCase().replace(/[.,!?]/g, '');
            const isVocabWord = vocabularyManager.getFilteredVocabulary('all').some(v => v.word === cleanWord);
            return `<span class="word ${isVocabWord ? 'vocab-word' : ''}">${word}</span>`;
        }).join(' ');

        historyIndexSpan.textContent = `${historyManager.getCurrentIndex() + 1} / ${historyManager.getHistoryLength()}`;
        prevBtn.disabled = historyManager.getCurrentIndex() <= 0;
        nextBtn.disabled = historyManager.getCurrentIndex() >= historyManager.getHistoryLength() - 1;

        // Update related topics section
        const generateRelatedBtn = document.getElementById('generateRelatedBtn');
        const relatedTopicsList = document.getElementById('relatedTopicsList');
        
        if (currentItem.relatedTopics && currentItem.relatedTopics.length > 0) {
            generateRelatedBtn.style.display = 'none';
            if (currentItem.showTopics) {
                relatedTopicsList.classList.remove('hidden');
                relatedTopicsList.innerHTML = currentItem.relatedTopics.map(topic => `
                    <button class="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded transition-colors related-topic-btn flex items-center group">
                        <span class="flex-grow">${topic}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                `).join('');
            } else {
                relatedTopicsList.classList.add('hidden');
            }
        } else {
            generateRelatedBtn.style.display = 'block';
            relatedTopicsList.classList.add('hidden');
        }

        // Add word click handlers
        document.querySelectorAll('.word').forEach(wordElement => {
            wordElement.addEventListener('click', () => {
                const word = wordElement.textContent.toLowerCase().replace(/[.,!?]/g, '');
                const context = getWordContext(wordElement);
                vocabularyManager.addWord(word, context);
            });
        });
    }

    function getWordContext(wordElement) {
        const words = Array.from(textContent.querySelectorAll('.word'));
        const wordIndex = words.indexOf(wordElement);
        const contextSize = 3;
        
        const startIndex = Math.max(0, wordIndex - contextSize);
        const endIndex = Math.min(words.length - 1, wordIndex + contextSize);
        
        return words.slice(startIndex, endIndex + 1)
            .map(w => w.textContent)
            .join(' ');
    }

    function renderVocabulary(filter) {
        const filteredVocabulary = vocabularyManager.getFilteredVocabulary(filter);
        const savedTranslations = JSON.parse(localStorage.getItem('savedTranslations') || '{}');
        
        // Get available language options
        const userSettings = JSON.parse(localStorage.getItem('languageAppSettings') || '{}');
        const languages = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Japanese', 'Chinese', 'Korean'];
        
        vocabularyList.innerHTML = filteredVocabulary.map(word => {
            const translation = savedTranslations[word.word] || '';
            
            return `
                <div class="bg-white p-4 rounded-lg shadow">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">${word.word}</h3>
                        <div>
                            <select class="border rounded px-2 py-1 mr-2" onchange="updateMastery('${word.word}', this.value)">
                                <option value="new" ${word.mastery === 'new' ? 'selected' : ''}>New</option>
                                <option value="learning" ${word.mastery === 'learning' ? 'selected' : ''}>Learning</option>
                                <option value="known" ${word.mastery === 'known' ? 'selected' : ''}>Known</option>
                            </select>
                            <button onclick="deleteWord('${word.word.replace(/'/g, "\\'")}')" class="text-red-500">Delete</button>
                        </div>
                    </div>
                    
                    <div class="mt-2 border-t pt-2">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-sm font-medium text-gray-700">Language:</label>
                            <select class="border rounded px-2 py-1" onchange="updateLanguage('${word.word.replace(/'/g, "\\'")}', this.value)">
                                ${languages.map(lang => 
                                    `<option value="${lang}" ${(word.targetLanguage || userSettings.language || 'Spanish') === lang ? 'selected' : ''}>${lang}</option>`
                                ).join('')}
                            </select>
                        </div>
                        
                        <div class="mb-2">
                            <label class="text-sm font-medium text-gray-700">Translation:</label>
                            <div class="flex items-center">
                                <input type="text" class="border rounded px-2 py-1 flex-grow" id="translation-${word.word.replace(/\s+/g, '-')}" 
                                    value="${translation}" placeholder="No translation saved">
                                <button onclick="saveTranslation('${word.word.replace(/'/g, "\\'")}', document.getElementById('translation-${word.word.replace(/\s+/g, '-')}').value)" 
                                    class="ml-2 text-blue-500 text-sm">Save</button>
                            </div>
                        </div>
                    </div>
                    
                    <p class="text-sm text-gray-600 mt-1">
                        Seen ${word.occurrences} times · Last: ${new Date(word.lastSeen).toLocaleDateString()}
                    </p>
                    ${word.contexts.map(context => `
                        <p class="text-sm text-gray-700 mt-2">
                            Context: "${context}"
                        </p>
                    `).join('')}
                </div>
            `;
        }).join('');
    }

    async function handleGenerateRelatedTopics() {
        const generateRelatedBtn = document.getElementById('generateRelatedBtn');
        generateRelatedBtn.disabled = true;
        generateRelatedBtn.textContent = 'Generating...';

        try {
            const currentText = historyManager.getCurrentText();
            const topics = await textGenerator.generateRelatedTopics(currentText);
            historyManager.updateRelatedTopics(topics);
            updateTextDisplay();
        } catch (error) {
            console.error('Error generating related topics:', error);
            alert('Error generating related topics. Please try again.');
        } finally {
            generateRelatedBtn.disabled = false;
            generateRelatedBtn.textContent = 'Generate Related Topics';
        }
    }

    async function handleRelatedTopicClick(topic) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';

        try {
            const newText = await textGenerator.generateText(topic);
            historyManager.addToHistory(newText);
            updateTextDisplay();
        } catch (error) {
            console.error('Error generating text:', error);
            alert('Error generating text. Please try again.');
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'New Text';
        }
    }

    // Event Listeners
    generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';

        try {
            const newText = await textGenerator.generateText(customTopic.value.trim());
            historyManager.addToHistory(newText);
            updateTextDisplay();
            customTopic.value = '';
        } catch (error) {
            console.error('Error generating text:', error);
            alert('Error generating text. Please try again.');
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'New Text';
        }
    });

    vocabularyBtn.addEventListener('click', () => {
        if (vocabularyCard.classList.contains('hidden')) {
            textCard.classList.add('hidden');
            flashcardCard.classList.add('hidden');
            vocabularyCard.classList.remove('hidden');
            renderVocabulary('all');
            toggleNavigationElements(false);
        } else {
            textCard.classList.remove('hidden');
            vocabularyCard.classList.add('hidden');
            toggleNavigationElements(true);
        }
    });

    flashcardBtn.addEventListener('click', () => {
        if (flashcardCard.classList.contains('hidden')) {
            textCard.classList.add('hidden');
            vocabularyCard.classList.add('hidden');
            flashcardCard.classList.remove('hidden');
            toggleNavigationElements(false);
        } else {
            textCard.classList.remove('hidden');
            flashcardCard.classList.add('hidden');
            toggleNavigationElements(true);
        }
    });

    prevBtn.addEventListener('click', () => {
        const prevText = historyManager.navigateHistory(-1);
        if (prevText) updateTextDisplay();
    });

    nextBtn.addEventListener('click', () => {
        const nextText = historyManager.navigateHistory(1);
        if (nextText) updateTextDisplay();
    });

    listenBtn.addEventListener('click', () => {
        const currentText = historyManager.getCurrentText();
        if (currentText) {
            speechManager.speak(currentText);
        }
    });

    settingsBtn.addEventListener('click', () => {
        const settingsModal = document.getElementById('settingsModal');
        settingsModal.classList.remove('hidden');
    });

    document.querySelectorAll('.vocab-filter').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.vocab-filter').forEach(btn => 
                btn.classList.remove('bg-blue-500', 'text-white'));
            button.classList.add('bg-blue-500', 'text-white');
            renderVocabulary(button.dataset.filter);
        });
    });

    document.addEventListener('click', (e) => {
        const button = e.target.closest('.related-topic-btn');
        if (button) {
            // Find the text span within the button (excluding the "Generate" text)
            const textSpan = button.querySelector('span:first-child');
            if (textSpan) {
                handleRelatedTopicClick(textSpan.textContent.trim());
            }
        }
    });

    document.getElementById('generateRelatedBtn')?.addEventListener('click', handleGenerateRelatedTopics);

    // Global handlers for vocabulary management
    window.updateMastery = (word, newMastery) => {
        vocabularyManager.updateMastery(word, newMastery);
        renderVocabulary('all');
    };

    window.deleteWord = (word) => {
        if (confirm(`Are you sure you want to delete "${word}"?`)) {
            vocabularyManager.deleteWord(word);
            renderVocabulary('all');
        }
    };

    window.updateLanguage = (word, newLanguage) => {
        vocabularyManager.updateLanguage(word, newLanguage);
        renderVocabulary('all');
    };

    window.saveTranslation = (word, translation) => {
        vocabularyManager.updateTranslation(word, translation);
        showFeedback('Translation saved', 'success');
    };

    // Add flashcard functionality
    const startFlashcardsBtn = document.getElementById('startFlashcardsBtn');
    const flashcardStartScreen = document.getElementById('flashcardStartScreen');
    const flashcardContent = document.getElementById('flashcardContent');
    const flashcardEndScreen = document.getElementById('flashcardEndScreen');
    const flashcardWord = document.getElementById('flashcardWord');
    const flashcardContext = document.getElementById('flashcardContext');
    const showContextBtn = document.getElementById('showContextBtn');
    const knownBtn = document.getElementById('knownBtn');
    const unknownBtn = document.getElementById('unknownBtn');
    const endSessionBtn = document.getElementById('endSessionBtn');
    const newFlashcardSessionBtn = document.getElementById('newFlashcardSessionBtn');
    const flashcardProgress = document.getElementById('flashcardProgress');
    const flashcardStats = document.getElementById('flashcardStats');
    const endSessionStats = document.getElementById('endSessionStats');
    const csvImportBtn = document.getElementById('csvImportBtn');
    const csvImportExample = document.getElementById('csvImportExample');
    const csvImportTextarea = document.getElementById('csvImport');
    const importFeedback = document.getElementById('importFeedback');

    function updateFlashcardDisplay() {
        const currentCard = flashcardManager.getCurrentFlashcard();
        if (!currentCard) {
            showFlashcardEndScreen();
            return;
        }

        flashcardWord.textContent = currentCard.word;
        flashcardContext.textContent = currentCard.contexts[0] || 'No context available';
        flashcardContext.classList.add('hidden');
        
        // Reset translation display when moving to a new card
        flashcardTranslation.textContent = '';
        flashcardTranslation.classList.add('hidden');
        showTranslationBtn.textContent = 'Show translation';
        showTranslationBtn.disabled = false;
        
        const progress = flashcardManager.getProgress();
        flashcardProgress.textContent = `Card ${progress.current}/${progress.total}`;
        flashcardStats.textContent = `Known: ${progress.known} | Unknown: ${progress.unknown}`;
    }

    function showFlashcardStartScreen() {
        flashcardStartScreen.classList.remove('hidden');
        flashcardContent.classList.add('hidden');
        flashcardEndScreen.classList.add('hidden');
    }

    function showFlashcardContent() {
        flashcardStartScreen.classList.add('hidden');
        flashcardContent.classList.remove('hidden');
        flashcardEndScreen.classList.add('hidden');
        updateFlashcardDisplay();
    }

    function showFlashcardEndScreen() {
        const progress = flashcardManager.getProgress();
        
        flashcardStartScreen.classList.add('hidden');
        flashcardContent.classList.add('hidden');
        flashcardEndScreen.classList.remove('hidden');
        
        endSessionStats.innerHTML = `
            <p>Known words: <span class="font-semibold text-green-600">${progress.known}</span></p>
            <p>Unknown words: <span class="font-semibold text-red-600">${progress.unknown}</span></p>
            <p>Total cards reviewed: <span class="font-semibold">${progress.known + progress.unknown}</span></p>
        `;
    }

    function startFlashcardSession() {
        // Get the currently selected filter
        const activeFilter = document.querySelector('.flashcard-filter.bg-blue-500').dataset.filter;
        
        // Get the user's selected language from settings
        const userSettings = JSON.parse(localStorage.getItem('languageAppSettings') || '{}');
        const targetLanguage = userSettings.language || 'Spanish';
        
        if (flashcardManager.loadFlashcards(activeFilter)) {
            showFlashcardContent();
        } else {
            alert(`No vocabulary words found with filter: ${activeFilter}`);
        }
    }

    // Flashcard event listeners
    document.querySelectorAll('.flashcard-filter').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.flashcard-filter').forEach(btn => 
                btn.classList.remove('bg-blue-500', 'text-white'));
            button.classList.add('bg-blue-500', 'text-white');
        });
    });

    startFlashcardsBtn.addEventListener('click', startFlashcardSession);
    newFlashcardSessionBtn.addEventListener('click', startFlashcardSession);

    knownBtn.addEventListener('click', () => {
        flashcardManager.markAsKnown();
        updateFlashcardDisplay();
    });

    unknownBtn.addEventListener('click', () => {
        flashcardManager.markAsUnknown();
        updateFlashcardDisplay();
    });

    showContextBtn.addEventListener('click', () => {
        flashcardContext.classList.toggle('hidden');
        showContextBtn.textContent = flashcardContext.classList.contains('hidden') ? 
            'Show context' : 'Hide context';
    });

    endSessionBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to end this flashcard session?')) {
            flashcardManager.resetSession();
            showFlashcardStartScreen();
        }
    });

    // Add keyboard event listener for flashcards
    document.addEventListener('keydown', (e) => {
        // Only process keyboard shortcuts when flashcard content is visible
        if (flashcardContent.classList.contains('hidden')) return;
        
        if (e.key === 'ArrowLeft') {
            // Left arrow for "I know this"
            knownBtn.classList.add('flashcard-btn-highlight');
            setTimeout(() => knownBtn.classList.remove('flashcard-btn-highlight'), 300);
            knownBtn.click();
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            // Right arrow for "I don't know"
            unknownBtn.classList.add('flashcard-btn-highlight');
            setTimeout(() => unknownBtn.classList.remove('flashcard-btn-highlight'), 300);
            unknownBtn.click();
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            // Up arrow to toggle context
            showContextBtn.classList.add('flashcard-btn-highlight');
            setTimeout(() => showContextBtn.classList.remove('flashcard-btn-highlight'), 300);
            showContextBtn.click();
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            // Down arrow to show translation
            showTranslationBtn.classList.add('flashcard-btn-highlight');
            setTimeout(() => showTranslationBtn.classList.remove('flashcard-btn-highlight'), 300);
            showTranslationBtn.click();
            e.preventDefault();
        }
    });

    // CSV Import functionality
    csvImportBtn.addEventListener('click', () => {
        const csvContent = csvImportTextarea.value.trim();
        if (!csvContent) {
            showImportFeedback('Please enter CSV content to import.', 'warning');
            return;
        }

        const result = flashcardManager.importCSV(csvContent);
        
        if (result.success) {
            if (result.count > 0) {
                showImportFeedback(`Successfully imported ${result.count} words.`, 'success');
                csvImportTextarea.value = ''; // Clear the textarea
            } else {
                showImportFeedback('No new words were imported. They may already exist in your vocabulary.', 'info');
            }
        } else {
            showImportFeedback(`Import failed: ${result.error}`, 'error');
        }
    });

    csvImportExample.addEventListener('click', () => {
        const exampleCSV = 
`palabra,La palabra significa 'word' en inglés.
casa,Vivo en una casa grande.
tiempo,No tengo tiempo para estudiar hoy.
hola,"Hola, ¿cómo estás?"`;
        
        csvImportTextarea.value = exampleCSV;
    });

    function showImportFeedback(message, type) {
        // Types: success, error, warning, info
        const bgColors = {
            success: 'bg-green-100 text-green-800',
            error: 'bg-red-100 text-red-800',
            warning: 'bg-yellow-100 text-yellow-800',
            info: 'bg-blue-100 text-blue-800'
        };
        
        importFeedback.className = `mt-3 p-3 rounded ${bgColors[type] || 'bg-gray-100'}`;
        importFeedback.textContent = message;
        importFeedback.classList.remove('hidden');
        
        // Hide the message after 5 seconds
        setTimeout(() => {
            importFeedback.classList.add('hidden');
        }, 5000);
    }

    // Add new event listeners and handlers
    const textInput = document.getElementById('textInput');
    const addTextBtn = document.getElementById('addTextBtn');
    const textInputFeedback = document.getElementById('textInputFeedback');
    const showTranslationBtn = document.getElementById('showTranslationBtn');
    const flashcardTranslation = document.getElementById('flashcardTranslation');

    // Text input handler
    addTextBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) {
            showFeedback('Please enter some text to add to vocabulary.', 'warning');
            return;
        }

        addTextBtn.disabled = true;
        addTextBtn.textContent = 'Adding...';

        try {
            const result = await flashcardManager.addTextToVocabulary(text);
            if (result.success) {
                showFeedback(`Successfully added ${result.count} new words to your vocabulary.`, 'success');
                textInput.value = '';
                renderVocabulary('all');
            } else {
                showFeedback(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            showFeedback('An error occurred while adding words.', 'error');
        } finally {
            addTextBtn.disabled = false;
            addTextBtn.textContent = 'Add Words';
        }
    });

    // Translation button handler
    showTranslationBtn.addEventListener('click', async () => {
        const currentCard = flashcardManager.getCurrentFlashcard();
        if (!currentCard) return;

        showTranslationBtn.disabled = true;
        showTranslationBtn.textContent = 'Loading...';

        try {
            const translation = await flashcardManager.getTranslation(currentCard.word);
            if (translation) {
                flashcardTranslation.textContent = translation;
                flashcardTranslation.classList.remove('hidden');
            } else {
                showFeedback('Could not load translation.', 'error');
            }
        } catch (error) {
            showFeedback('Error loading translation.', 'error');
        } finally {
            showTranslationBtn.disabled = false;
            showTranslationBtn.textContent = 'Show translation';
        }
    });

    function showFeedback(message, type) {
        const bgColors = {
            success: 'bg-green-100 text-green-800',
            error: 'bg-red-100 text-red-800',
            warning: 'bg-yellow-100 text-yellow-800',
            info: 'bg-blue-100 text-blue-800'
        };
        
        textInputFeedback.className = `mt-2 p-2 rounded ${bgColors[type] || 'bg-gray-100'}`;
        textInputFeedback.textContent = message;
        textInputFeedback.classList.remove('hidden');
        
        setTimeout(() => {
            textInputFeedback.classList.add('hidden');
        }, 5000);
    }

    // Custom topic event listener for pressing enter
    customTopic.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            generateBtn.click();
        }
    });

    // Add event listener for the back button
    const backToTextBtn = document.getElementById('backToTextBtn');
    backToTextBtn.addEventListener('click', () => {
        textCard.classList.remove('hidden');
        vocabularyCard.classList.add('hidden');
        flashcardCard.classList.add('hidden');
        toggleNavigationElements(true);
    });

    // Show/hide navigation elements based on current view
    function toggleNavigationElements(isMainView) {
        const generateBtn = document.getElementById('generateBtn');
        const customTopic = document.getElementById('customTopic');
        const secondaryNavigation = document.getElementById('secondaryNavigation');
        
        if (isMainView) {
            generateBtn.classList.remove('hidden');
            customTopic.classList.remove('hidden');
            secondaryNavigation.classList.add('hidden');
        } else {
            generateBtn.classList.add('hidden');
            customTopic.classList.add('hidden');
            secondaryNavigation.classList.remove('hidden');
        }
    }

    // Initialize the display
    updateTextDisplay();
}