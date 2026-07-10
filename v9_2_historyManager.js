export function initHistoryManager() {
    let textHistory = [];
    let currentHistoryIndex = -1;

    function loadHistory() {
        const savedTextHistory = localStorage.getItem('languageAppTextHistory');
        if (savedTextHistory) {
            textHistory = JSON.parse(savedTextHistory);
            currentHistoryIndex = textHistory.length - 1;
        }
    }

    function saveHistory() {
        localStorage.setItem('languageAppTextHistory', JSON.stringify(textHistory));
    }

    function addToHistory(text, relatedTopics = []) {
        if (typeof text === 'string') {
            textHistory.push({
                text,
                relatedTopics,
                showTopics: false
            });
            currentHistoryIndex = textHistory.length - 1;
            saveHistory();
        }
    }

    function updateRelatedTopics(topics) {
        if (currentHistoryIndex >= 0 && Array.isArray(topics)) {
            textHistory[currentHistoryIndex].relatedTopics = topics;
            textHistory[currentHistoryIndex].showTopics = true;
            saveHistory();
        }
    }

    function toggleTopicsVisibility(index) {
        if (index >= 0 && index < textHistory.length) {
            textHistory[index].showTopics = !textHistory[index].showTopics;
            saveHistory();
        }
    }

    function navigateHistory(direction) {
        const newIndex = currentHistoryIndex + direction;
        if (newIndex >= 0 && newIndex < textHistory.length) {
            currentHistoryIndex = newIndex;
            return textHistory[currentHistoryIndex];
        }
        return null;
    }

    function getCurrentText() {
        return textHistory[currentHistoryIndex]?.text || '';
    }

    function getCurrentHistoryItem() {
        return textHistory[currentHistoryIndex] || null;
    }

    function getCurrentIndex() {
        return currentHistoryIndex;
    }

    function getHistoryLength() {
        return textHistory.length;
    }

    loadHistory();

    return {
        addToHistory,
        updateRelatedTopics,
        toggleTopicsVisibility,
        navigateHistory,
        getCurrentText,
        getCurrentHistoryItem,
        getCurrentIndex,
        getHistoryLength
    };
}