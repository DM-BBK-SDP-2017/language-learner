export function initFlashcardManager(vocabularyManager) {
    let currentFlashcards = [];
    let currentIndex = 0;
    let sessionStats = {
        known: 0,
        unknown: 0,
        total: 0
    };
    const MAX_CARDS = 20;
    
    function isWordInTargetLanguage(word, targetLanguage) {
        // Check if the word has a specified target language
        if (word.targetLanguage) {
            return word.targetLanguage === targetLanguage;
        }
        
        // Default to true if no target language specified
        return true;
    }

    function loadFlashcards(filter = 'all') {
        // Get the user's selected language from settings
        const userSettings = JSON.parse(localStorage.getItem('languageAppSettings') || '{}');
        const targetLanguage = userSettings.language || 'Spanish';
        
        // Get vocabulary filtered by the specified mastery level and language
        let vocabulary = vocabularyManager.getFilteredVocabularyByLanguage(filter, targetLanguage);
        
        if (vocabulary.length === 0) {
            return false;
        }
        
        // Apply spaced repetition algorithm to order cards
        currentFlashcards = applySpacedRepetition(vocabulary);
        
        // Limit to MAX_CARDS and randomize the order
        currentFlashcards = currentFlashcards.slice(0, MAX_CARDS)
                                            .sort(() => Math.random() - 0.5);
        
        currentIndex = 0;
        
        // Reset session stats
        sessionStats = {
            known: 0,
            unknown: 0,
            total: currentFlashcards.length
        };
        
        return true;
    }

    function applySpacedRepetition(vocabulary) {
        // Calculate a score for each word based on mastery level, number of occurrences, and last seen date
        const scoredVocabulary = vocabulary.map(word => {
            // Calculate days since last seen
            const daysSinceLastSeen = (new Date() - new Date(word.lastSeen)) / (1000 * 60 * 60 * 24);
            
            // Base weights for each mastery level
            const masteryWeight = word.mastery === 'new' ? 10 : 
                                 word.mastery === 'learning' ? 5 : 
                                 word.mastery === 'known' ? 1 : 10;
            
            // Calculate occurrence factor (less occurrences = higher weight)
            const occurrenceFactor = 1 / (word.occurrences || 1);
            
            // Calculate recency factor (more days since last seen = higher weight)
            const recencyFactor = Math.min(daysSinceLastSeen, 30) / 30; // Cap at 30 days
            
            // Calculate final review score
            const reviewScore = masteryWeight * 0.5 + 
                              occurrenceFactor * 3 + 
                              recencyFactor * 5;
                              
            return {
                ...word,
                reviewScore
            };
        });
        
        // Sort by review score (higher score = higher priority)
        scoredVocabulary.sort((a, b) => b.reviewScore - a.reviewScore);
        
        // Take the top 70% strictly by algorithm, and shuffle the rest
        const splitIndex = Math.floor(scoredVocabulary.length * 0.7);
        const topGroup = scoredVocabulary.slice(0, splitIndex);
        const bottomGroup = scoredVocabulary.slice(splitIndex).sort(() => Math.random() - 0.5);
        
        return [...topGroup, ...bottomGroup];
    }
    
    function getCurrentFlashcard() {
        if (currentFlashcards.length === 0 || currentIndex >= currentFlashcards.length) {
            return null;
        }
        return currentFlashcards[currentIndex];
    }
    
    function markAsKnown() {
        if (!getCurrentFlashcard()) return null;
        
        const currentWord = currentFlashcards[currentIndex];
        
        // Update the mastery level
        if (currentWord.mastery === 'new') {
            vocabularyManager.updateMastery(currentWord.word, 'learning');
        } else if (currentWord.mastery === 'learning') {
            vocabularyManager.updateMastery(currentWord.word, 'known');
        }
        
        // Update session stats
        sessionStats.known++;
        
        // Move to the next card
        currentIndex++;
        
        return getCurrentFlashcard();
    }
    
    function markAsUnknown() {
        if (!getCurrentFlashcard()) return null;
        
        const currentWord = currentFlashcards[currentIndex];
        
        // If the word is marked as 'learning' or 'known', downgrade it
        if (currentWord.mastery === 'known') {
            vocabularyManager.updateMastery(currentWord.word, 'learning');
        } else if (currentWord.mastery === 'learning') {
            vocabularyManager.updateMastery(currentWord.word, 'new');
        }
        
        // Update session stats
        sessionStats.unknown++;
        
        // Move to the next card
        currentIndex++;
        
        return getCurrentFlashcard();
    }
    
    function getProgress() {
        return {
            current: currentIndex + 1,
            total: currentFlashcards.length,
            known: sessionStats.known,
            unknown: sessionStats.unknown,
            remaining: currentFlashcards.length - currentIndex
        };
    }
    
    function resetSession() {
        currentFlashcards = [];
        currentIndex = 0;
        sessionStats = {
            known: 0,
            unknown: 0,
            total: 0
        };
    }

    function importCSV(csvContent) {
        try {
            // Split CSV into lines
            const lines = csvContent.trim().split(/\r?\n/);
            
            // Process each line
            const importedWords = [];
            for (const line of lines) {
                // Split by comma, but handle quoted values (for context that might contain commas)
                const parts = line.match(/(?:^|,)(?:"([^"]*)"|([^,]*))/g)
                                 .map(part => part.replace(/^,/, '').replace(/^"|"$/g, ''));
                
                if (parts.length >= 2) {
                    const word = parts[0].trim();
                    const context = parts[1].trim();
                    
                    if (word) {
                        // Check if word already exists
                        const existingWordIndex = vocabularyManager.getFilteredVocabulary('all')
                                                 .findIndex(item => item.word === word);
                        
                        if (existingWordIndex === -1) {
                            // Add as new word if it doesn't exist
                            vocabularyManager.addWord(word, context);
                            importedWords.push(word);
                        }
                    }
                }
            }
            
            return {
                success: true,
                count: importedWords.length,
                words: importedWords
            };
        } catch (error) {
            console.error('Error importing CSV:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async function getTranslation(word) {
        try {
            // Check if we already have this translation in localStorage
            const savedTranslations = JSON.parse(localStorage.getItem('savedTranslations') || '{}');
            if (savedTranslations[word]) {
                return savedTranslations[word];
            }
            
            // Get the word's context if available
            const wordData = vocabularyManager.getFilteredVocabulary('all')
                                           .find(item => item.word === word);
            const context = wordData?.contexts?.[0] || '';
            
            // Get the user's selected language from settings (defaulting to Spanish if not set)
            const userSettings = JSON.parse(localStorage.getItem('languageAppSettings') || '{}');
            const targetLanguage = wordData?.targetLanguage || userSettings.language || 'Spanish';

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${'REPLACE_WITH_SERVER_SIDE_SECRET'}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{
                        role: "system",
                        content: `You are a translation assistant. Translate the phrase from ${targetLanguage} to English. If context is provided, use it to provide the most accurate translation and then return the word in a NEW context of fully contained, cohesive sentence suitable for A1-B1 level language learners. Provide a mnemonic to help remember the word IN THE TARGET LANGUAGE.`
                    }, {
                        role: "user",
                        content: context ? 
                            `Translate this ${targetLanguage} phrase to English: "${word}"\nContext: "${context}"` : 
                            `Translate this ${targetLanguage} phrase to English: "${word}"`
                    }],
                    temperature: 0.1,
                    max_tokens: 100
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            const translation = data.choices[0].message.content.trim();
            
            // Save the translation to localStorage
            savedTranslations[word] = translation;
            localStorage.setItem('savedTranslations', JSON.stringify(savedTranslations));
            
            return translation;
        } catch (error) {
            console.error('Error getting translation:', error);
            return null;
        }
    }

    async function addTextToVocabulary(text) {
        try {
            // Get user's selected language
            const userSettings = JSON.parse(localStorage.getItem('languageAppSettings') || '{}');
            const targetLanguage = userSettings.language || 'Spanish';
            
            // Always treat input as a complete phrase, regardless of word count
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${'REPLACE_WITH_SERVER_SIDE_SECRET'}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{
                        role: "system",
                        content: `You are a language assistant for ${targetLanguage}. Give an example of this word/phrase in a natural context suitable for A2-B2 language learners. Include any cultural context if relevant. If possible, make it a mnemonic to help remember the word but only in the target language.`
                    }, {
                        role: "user",
                        content: `Explain this ${targetLanguage} phrase: "${text}"`
                    }],
                    temperature: 0.7,
                    max_tokens: 100
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            const explanation = data.choices[0].message.content.trim();
            
            // Add the phrase with target language specified
            vocabularyManager.addWordWithLanguage(text.toLowerCase(), explanation, targetLanguage);
            
            return {
                success: true,
                count: 1,
                words: [text]
            };
        } catch (error) {
            console.error('Error adding text to vocabulary:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    return {
        loadFlashcards,
        getCurrentFlashcard,
        markAsKnown,
        markAsUnknown,
        getProgress,
        resetSession,
        importCSV,
        getTranslation,
        addTextToVocabulary
    };
} 