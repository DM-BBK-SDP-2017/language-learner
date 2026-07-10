export function initSpeechManager(settings) {
    let currentUtterance = null;
    let availableVoices = [];

    function updateVoices() {
        const voices = speechSynthesis.getVoices();
        availableVoices = voices.filter(voice => 
            voice.lang.startsWith(
                settings.language === 'Spanish' ? 'es' : 
                settings.language === 'French' ? 'fr' : 
                settings.language === 'German' ? 'de' : 'en'
            )
        );

        const voiceSelect = document.getElementById('voice');
        voiceSelect.innerHTML = availableVoices.map(voice => 
            `<option value="${voice.voiceURI}">${voice.name}</option>`
        ).join('');

        if (availableVoices.length > 0) {
            voiceSelect.value = settings.voice || availableVoices[0].voiceURI;
        }
    }

    function speak(text) {
        if (currentUtterance) {
            speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        const selectedVoice = availableVoices.find(voice => voice.voiceURI === settings.voice);
        
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            console.error('Selected voice not available');
        }
        
        utterance.rate = settings.speed;
        utterance.onend = () => {
            currentUtterance = null;
        };
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
        };

        currentUtterance = utterance;
        speechSynthesis.speak(utterance);
    }

    function stop() {
        if (currentUtterance) {
            speechSynthesis.cancel();
            currentUtterance = null;
        }
    }

    speechSynthesis.onvoiceschanged = updateVoices;

    return { speak, stop, updateVoices };
}