export function initVocabularyManager() {
    let vocabulary = [];

    function loadVocabulary() {
        const savedVocabulary = localStorage.getItem('languageAppVocabulary');
        if (savedVocabulary) {
            vocabulary = JSON.parse(savedVocabulary);
            vocabulary.forEach(word => {
                word.lastSeen = new Date(word.lastSeen);
                // Convert forms array to Set when loading if needed
                if (Array.isArray(word.forms)) {
                    word.forms = new Set(word.forms);
                }
            });
        }
    }

    function saveVocabulary() {
        // Convert Sets to Arrays for JSON storage
        const vocabularyToSave = vocabulary.map(word => ({
            ...word,
            forms: Array.from(word.forms || new Set())
        }));
        localStorage.setItem('languageAppVocabulary', JSON.stringify(vocabularyToSave));
    }

    async function getLemmatizedWord(word, fullText) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${'REPLACE_WITH_SERVER_SIDE_SECRET'}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [{
                        role: "system",
                        content: "You are a linguistic assistant. Return only the base form (lemma) of the word. For verbs, return the infinitive. For nouns, return singular. For adjectives, return the basic form."
                    }, {
                        role: "user",
                        content: `Word: "${word}"\nFull context: "${fullText}"\nPlease return only the base form of the word, nothing else.`
                    }],
                    temperature: 0.1,
                    max_tokens: 20
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error getting lemmatized word:', error);
            return word; // Return original word if API call fails
        }
    }

    function extractContext(word, fullText, windowSize = 100) {
        const wordIndex = fullText.toLowerCase().indexOf(word.toLowerCase());
        if (wordIndex === -1) return word;

        const startIndex = Math.max(0, wordIndex - windowSize);
        const endIndex = Math.min(fullText.length, wordIndex + word.length + windowSize);
        
        // Find sentence boundaries
        let context = fullText.slice(startIndex, endIndex);
        
        // Try to start at the beginning of a sentence
        const sentenceStarters = ['. ', '! ', '? ', '\n'];
        for (const starter of sentenceStarters) {
            const firstIndex = context.indexOf(starter);
            if (firstIndex !== -1 && firstIndex < wordIndex - startIndex) {
                context = context.slice(firstIndex + starter.length);
            }
        }
        
        // Try to end at the end of a sentence
        const sentenceEnders = ['. ', '! ', '? '];
        for (const ender of sentenceEnders) {
            const lastIndex = context.lastIndexOf(ender);
            if (lastIndex !== -1 && lastIndex > wordIndex - startIndex) {
                context = context.slice(0, lastIndex + 1);
                break;
            }
        }

        return context.trim();
    }

    async function addWord(word, fullText) {
        const lemmatizedWord = await getLemmatizedWord(word, fullText);
        const context = extractContext(word, fullText);
        
        // Get user's selected language from settings
        const userSettings = JSON.parse(localStorage.getItem('languageAppSettings') || '{}');
        const targetLanguage = userSettings.language || 'Spanish';
        
        const existingWord = vocabulary.find(v => v.word === lemmatizedWord);
        
        if (existingWord) {
            existingWord.occurrences++;
            existingWord.lastSeen = new Date();
            existingWord.contexts.unshift(context);
            if (existingWord.contexts.length > 3) {
                existingWord.contexts.pop();
            }
            existingWord.forms = existingWord.forms || new Set();
            existingWord.forms.add(word);
            // Ensure target language is set
            if (!existingWord.targetLanguage) {
                existingWord.targetLanguage = targetLanguage;
            }
        } else {
            vocabulary.push({
                word: lemmatizedWord,
                mastery: 'new',
                occurrences: 1,
                lastSeen: new Date(),
                contexts: [context],
                forms: new Set([word]),
                targetLanguage: targetLanguage
            });
        }
        
        saveVocabulary();
        return lemmatizedWord;
    }

    function addWordWithLanguage(word, context, targetLanguage) {
        const existingWord = vocabulary.find(v => v.word === word);
        
        if (existingWord) {
            existingWord.occurrences++;
            existingWord.lastSeen = new Date();
            existingWord.contexts.unshift(context);
            if (existingWord.contexts.length > 3) {
                existingWord.contexts.pop();
            }
            existingWord.targetLanguage = targetLanguage;
        } else {
            vocabulary.push({
                word: word,
                mastery: 'new',
                occurrences: 1,
                lastSeen: new Date(),
                contexts: [context],
                forms: new Set([word]),
                targetLanguage: targetLanguage
            });
        }
        
        saveVocabulary();
        return word;
    }

    function updateTranslation(word, newTranslation) {
        // Update the saved translation in localStorage
        const savedTranslations = JSON.parse(localStorage.getItem('savedTranslations') || '{}');
        savedTranslations[word] = newTranslation;
        localStorage.setItem('savedTranslations', JSON.stringify(savedTranslations));
    }

    function updateLanguage(word, newLanguage) {
        const vocabularyItem = vocabulary.find(v => v.word === word);
        if (vocabularyItem) {
            vocabularyItem.targetLanguage = newLanguage;
            saveVocabulary();
        }
    }

    function updateMastery(word, newMastery) {
        const vocabularyItem = vocabulary.find(v => v.word === word);
        if (vocabularyItem) {
            vocabularyItem.mastery = newMastery;
            saveVocabulary();
        }
    }

    function deleteWord(word) {
        // Directly filter by the word string - regardless of spaces or composition
        vocabulary = vocabulary.filter(v => v.word !== word);
        
        // Also remove from saved translations if it exists
        try {
            const savedTranslations = JSON.parse(localStorage.getItem('savedTranslations') || '{}');
            if (savedTranslations[word]) {
                delete savedTranslations[word];
                localStorage.setItem('savedTranslations', JSON.stringify(savedTranslations));
            }
        } catch (error) {
            console.error('Error removing translation:', error);
        }
        
        saveVocabulary();
    }

    function getFilteredVocabulary(filter) {
        return vocabulary.filter(word => 
            filter === 'all' || word.mastery === filter
        ).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    }

    function getFilteredVocabularyByLanguage(filter, targetLanguage) {
        if (!targetLanguage) {
            return getFilteredVocabulary(filter);
        }
        
        return vocabulary.filter(word => 
            (filter === 'all' || word.mastery === filter) &&
            (!word.targetLanguage || word.targetLanguage === targetLanguage)
        ).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    }

    function selectVocabularyWords(count) {
        if (vocabulary.length === 0) return [];
        
        const scoredWords = vocabulary.map(word => {
            const daysSinceLastSeen = (new Date() - word.lastSeen) / (1000 * 60 * 60 * 24);
            const masteryScore = word.mastery === 'new' ? 3 : word.mastery === 'learning' ? 2 : 1;
            
            return {
                word: word.word,
                score: (daysSinceLastSeen * 0.3) +
                       (1 / word.occurrences * 0.4) +
                       (masteryScore * 0.3)
            };
        });

        return scoredWords
            .sort((a, b) => b.score - a.score)
            .slice(0, count)
            .map(w => w.word);
    }

    loadVocabulary();

    return {
        addWord,
        addWordWithLanguage,
        updateMastery,
        updateTranslation,
        updateLanguage,
        deleteWord,
        getFilteredVocabulary,
        getFilteredVocabularyByLanguage,
        selectVocabularyWords
    };
}