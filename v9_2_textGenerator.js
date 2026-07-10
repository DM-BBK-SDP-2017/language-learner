



export function initTextGenerator(settings, vocabularyManager) {
    async function generateText(customTopic) {
        const selectedVocabWords = vocabularyManager.selectVocabularyWords(settings.vocabWordsCount);
        const topic = customTopic || settings.subject;
        
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${'REPLACE_WITH_SERVER_SIDE_SECRET'}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{
                        role: "system",
                        content: `You are a language learning assistant. Generate a paragraph in ${settings.language} about "${topic}" suitable for ${settings.level} level learners. ${
                            selectedVocabWords.length > 0 
                            ? `Try to naturally incorporate these words: ${selectedVocabWords.join(', ')}`
                            : ''
                        }`
                    }],
                    max_tokens: 500
                })
            });

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error generating text:', error);
            throw new Error('Failed to generate text. Please try again.');
        }
    }

    async function generateRelatedTopics(text) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${'REPLACE_WITH_SERVER_SIDE_SECRET'}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{
                        role: "system",
                        content: "You are a helpful assistant that generates related topics. Return the response as a JSON array of strings, where each string is a natural, complete sentence that could be clicked to generate new content. No markdown, just the JSON array"
                    }, {
                        role: "user",
                        content: `Given this text: "${text}", generate 10 topics. Include a mix of closely related topics that expand on elements in the text, some that are more loosely connected and 1-2 that are so loosely connected they are practically unrelated. Return as a JSON array where each topic is a clear, natural sentence.`
                    }],
                    max_tokens: 400,
                    temperature: 0.8
                })
            });

            const data = await response.json();
            let topics;
            try {
                topics = JSON.parse(data.choices[0].message.content);
            } catch (e) {
                console.error('Failed to parse JSON response:', e);
                // Fallback: extract lines and format them
                topics = data.choices[0].message.content
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => line
                        .replace(/^\d+\.\s*/, '') // Remove any numbering
                        .replace(/^[-•]\s*/, '') // Remove any bullet points
                        .trim())
                    .slice(0, 10);
            }

            // Ensure all topics are properly formatted sentences
            return topics.map(topic => {
                let formattedTopic = topic.trim();
                if (!formattedTopic.endsWith('.')) {
                    formattedTopic += '.';
                }
                return formattedTopic;
            });
        } catch (error) {
            console.error('Error generating related topics:', error);
            throw new Error('Failed to generate related topics. Please try again.');
        }
    }

    return { generateText, generateRelatedTopics };
}