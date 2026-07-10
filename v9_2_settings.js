let settings = {
    language: 'Spanish',
    voice: '',
    speed: 1,
    subject: 'Historical Events',
    level: 'A1 (Beginner)',
    vocabWordsCount: 3
};

export function loadSettings() {
    const savedSettings = localStorage.getItem('languageAppSettings');
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
    }
    return settings;
}

export function initSettings(settings, speechManager) {
    const settingsHTML = `
        <div id="settingsModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full hidden">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3 text-center">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">Settings</h3>
                    <div class="mt-2 px-7 py-3">
                        <div class="mb-4">
                            <label for="language" class="block text-sm font-medium text-gray-700">Language</label>
                            <select id="language" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                                <option value="Italian">Italian</option>
                                <option value="Spanish">Spanish</option>
                                <option value="French">French</option>
                                <option value="German">German</option>
                                <option value="English">English</option>
                            </select>
                        </div>
                        <div class="mb-4">
                            <label for="voice" class="block text-sm font-medium text-gray-700">Voice</label>
                            <select id="voice" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                            </select>
                        </div>
                        <div class="mb-4">
                            <label for="speed" class="block text-sm font-medium text-gray-700">Speech Speed</label>
                            <input type="range" id="speed" min="0.5" max="2" step="0.1" value="1" class="mt-1 block w-full">
                            <span id="speedValue" class="text-sm text-gray-500">1.0x</span>
                        </div>
                        <div class="mb-4">
                            <label for="vocabWordsCount" class="block text-sm font-medium text-gray-700">Vocabulary Words to Include</label>
                            <input type="range" id="vocabWordsCount" min="0" max="10" step="1" value="3" class="mt-1 block w-full">
                            <span id="vocabWordsValue" class="text-sm text-gray-500">3 words</span>
                        </div>
                        <div class="mb-4">
                            <label for="subject" class="block text-sm font-medium text-gray-700">Default Subject</label>
                            <select id="subject" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                                <option value="Historical Events">Historical Events</option>
                                <option value="Daily Life">Daily Life</option>
                                <option value="Business">Business</option>
                                <option value="Travel">Travel</option>
                            </select>
                        </div>
                        <div class="mb-4">
                            <label for="level" class="block text-sm font-medium text-gray-700">Level</label>
                            <select id="level" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                                <option value="A1 (Beginner)">A1 (Beginner)</option>
                                <option value="A2 (Elementary)">A2 (Elementary)</option>
                                <option value="B1 (Intermediate)">B1 (Intermediate)</option>
                                <option value="B2 (Upper Intermediate)">B2 (Upper Intermediate)</option>
                                <option value="C1 (Advanced)">C1 (Advanced)</option>
                                <option value="C2 (Proficiency)">C2 (Proficiency)</option>
                            </select>
                        </div>
                    </div>
                    <div class="items-center px-4 py-3">
                        <button id="saveSettingsBtn" class="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300">
                            Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', settingsHTML);

    const settingsModal = document.getElementById('settingsModal');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const languageSelect = document.getElementById('language');
    const voiceSelect = document.getElementById('voice');
    const speedSlider = document.getElementById('speed');
    const speedValue = document.getElementById('speedValue');
    const vocabWordsCountSlider = document.getElementById('vocabWordsCount');
    const vocabWordsValue = document.getElementById('vocabWordsValue');
    const subjectSelect = document.getElementById('subject');
    const levelSelect = document.getElementById('level');

    function updateSettingsUI() {
        languageSelect.value = settings.language;
        speedSlider.value = settings.speed;
        speedValue.textContent = `${settings.speed.toFixed(1)}x`;
        vocabWordsCountSlider.value = settings.vocabWordsCount;
        vocabWordsValue.textContent = `${settings.vocabWordsCount} words`;
        subjectSelect.value = settings.subject;
        levelSelect.value = settings.level;
        speechManager.updateVoices();
    }

    function saveSettings() {
        settings.language = languageSelect.value;
        settings.voice = voiceSelect.value;
        settings.speed = parseFloat(speedSlider.value);
        settings.vocabWordsCount = parseInt(vocabWordsCountSlider.value);
        settings.subject = subjectSelect.value;
        settings.level = levelSelect.value;
        settingsModal.classList.add('hidden');
        localStorage.setItem('languageAppSettings', JSON.stringify(settings));
        speechManager.updateVoices();
    }

    saveSettingsBtn.addEventListener('click', saveSettings);
    speedSlider.addEventListener('input', () => {
        const speed = parseFloat(speedSlider.value);
        speedValue.textContent = `${speed.toFixed(1)}x`;
    });
    vocabWordsCountSlider.addEventListener('input', () => {
        const count = parseInt(vocabWordsCountSlider.value);
        vocabWordsValue.textContent = `${count} words`;
    });

    updateSettingsUI();

    return settings;
}