(function () {
    const CHATBOT_ID = 'potygen-floating-chat';
    const SAFE_TIMEOUT = 300;
    const ACTIONS = {
        greeting: 'greeting',
        openAnimalRegister: 'openAnimalRegister',
        openFarmRegister: 'openFarmRegister',
        navigateDashboard: 'navigate:dashboard.html',
        navigateGestao: 'navigate:gestao-animais.html',
        navigateAgenda: 'navigate:agenda-reprodutiva.html',
        navigateAnalise: 'navigate:analise-genetica.html',
        navigateControle: 'navigate:controle-economico.html',
        navigateConfiguracoes: 'navigate:configuracoes.html',
        listAnimals: 'listAnimals',
        summary: 'summary',
        general: 'general'
    };

    const state = {
        isOpen: false,
        messages: [],
        isRecording: false,
        recognition: null
    };

    function normalizarTexto(text) {
        return (text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function resolveIntent(text) {
        const t = normalizarTexto(text);

        if (!t) return ACTIONS.general;

        if (/(ol[aá]|oi|bom dia|boa tarde|boa noite|hello|hi)/.test(t)) {
            return ACTIONS.greeting;
        }

        if (/(cadastra|cadastre|cadastrar|registrar).*animal|animal.*(cadastra|cadastre|cadastrar|registrar)/.test(t)) {
            return ACTIONS.openAnimalRegister;
        }

        if (/(cadastra|cadastre|cadastrar|registrar).*fazenda|fazenda.*(cadastra|cadastre|cadastrar|registrar)/.test(t)) {
            return ACTIONS.openFarmRegister;
        }

        if (/(dashboard|painel|resumo|inicio|in[íi]cio|pagina inicial)/.test(t)) {
            return ACTIONS.navigateDashboard;
        }

        if (/(gesta[oã]o.*animal|animais|rebanho|listar.*animal|ver.*animal)/.test(t)) {
            return ACTIONS.navigateGestao;
        }

        if (/(agenda|reprodutiva|insemina[cç][aã]o|inseminacao|cronograma)/.test(t)) {
            return ACTIONS.navigateAgenda;
        }

        if (/(analise|genetica|dna|linhagem|genetico)/.test(t)) {
            return ACTIONS.navigateAnalise;
        }

        if (/(controle.*econom|economico|despesas|financeiro|produção|custos)/.test(t)) {
            return ACTIONS.navigateControle;
        }

        if (/(configurac|perfil|ajustes|conta)/.test(t)) {
            return ACTIONS.navigateConfiguracoes;
        }

        if (/(listar|mostrar|ver).*animais|animais.*(lista|listar|mostrar)/.test(t)) {
            return ACTIONS.listAnimals;
        }

        if (/(resumo|status|como.*estou|situacao|estado)/.test(t)) {
            return ACTIONS.summary;
        }

        return ACTIONS.general;
    }

    function safeGetElement(id) {
        return document.getElementById(id);
    }

    function navigateTo(page) {
        if (!page) return false;
        const finalPath = page.startsWith('http') ? page : `${page}`;
        window.location.href = finalPath;
        return true;
    }

    function openAnimalForm() {
        const form = safeGetElement('modalForm');
        const btnNovoAnimal = safeGetElement('btnNovoAnimal');

        if (btnNovoAnimal) {
            btnNovoAnimal.click();
            return true;
        }

        if (form) {
            form.style.display = 'flex';
            return true;
        }

        navigateTo('gestao-animais.html');
        return true;
    }

    function openFarmForm() {
        if (window.PotygenFazendaUI && typeof window.PotygenFazendaUI.abrirModalCadastrarFazenda === 'function') {
            window.PotygenFazendaUI.abrirModalCadastrarFazenda();
            return true;
        }

        if (typeof abrirModalCadastrarFazenda === 'function') {
            abrirModalCadastrarFazenda();
            return true;
        }

        navigateTo('dashboard.html');
        setTimeout(() => {
            if (window.PotygenFazendaUI && typeof window.PotygenFazendaUI.abrirModalCadastrarFazenda === 'function') {
                window.PotygenFazendaUI.abrirModalCadastrarFazenda();
            }
        }, 400);
        return true;
    }

    function parseAnimalFromText(text) {
        const t = text || '';
        const result = {
            codigo: null,
            nome: null,
            especie: null,
            raca: null,
            sexo: null,
            dataNascimento: null,
            lote: null,
            finalidade: null
        };

        const codigoMatch = t.match(/codigo\s*[:=]?\s*([a-z0-9-]+)/i);
        if (codigoMatch) result.codigo = codigoMatch[1].toUpperCase();

        const nomeMatch = t.match(/nome\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü]+)/i);
        if (nomeMatch) result.nome = nomeMatch[1].trim();

        const especieMap = {
            bovino: 'Bovino',
            boi: 'Bovino',
            vaca: 'Bovino',
            ovino: 'Ovino',
            carneiro: 'Ovino',
            caprino: 'Caprino',
            cabra: 'Caprino',
            cabrito: 'Caprino'
        };

        for (const key in especieMap) {
            if (t.includes(key)) {
                result.especie = especieMap[key];
                break;
            }
        }

        const racaMatch = t.match(/raca\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü-]+)/i);
        if (racaMatch) result.raca = racaMatch[1].trim();

        const sexoMatch = t.match(/sexo\s*[:=]?\s*(macho|femea|fêmea|macho)/i);
        if (sexoMatch) result.sexo = sexoMatch[1].toLowerCase().includes('feme') ? 'Fêmea' : 'Macho';

        const dataMatch = t.match(/data\s*[:=]?\s*(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/i);
        if (dataMatch) {
            const raw = dataMatch[1];
            const normalized = raw.includes('/') ? raw.split(/[/-]/).reverse().join('-') : raw;
            result.dataNascimento = normalized;
        }

        const loteMatch = t.match(/lote\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü-]+)/i);
        if (loteMatch) result.lote = loteMatch[1].trim();

        const finalidadeMatch = t.match(/finalidade\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü-]+)/i);
        if (finalidadeMatch) result.finalidade = finalidadeMatch[1].trim();

        return result;
    }

    function preencherAnimalNoFormulario(payload) {
        const formFields = {
            formCodigo: payload.codigo,
            formNome: payload.nome,
            formEspecie: payload.especie,
            formRaca: payload.raca,
            formSexo: payload.sexo,
            formDataNascimento: payload.dataNascimento,
            formLote: payload.lote,
            formFinalidade: payload.finalidade
        };

        Object.entries(formFields).forEach(([id, value]) => {
            const el = safeGetElement(id);
            if (!el || value === null || value === undefined || value === '') return;
            el.value = value;
            if (typeof el.dispatchEvent === 'function') {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        const buscaRaca = safeGetElement('buscaRaca');
        if (buscaRaca && payload.raca) {
            buscaRaca.value = payload.raca;
        }

        const hiddenRaca = safeGetElement('formRaca');
        if (hiddenRaca && payload.raca) {
            hiddenRaca.value = payload.raca;
        }

        const btnSalvar = safeGetElement('btnSalvar');
        if (btnSalvar) {
            setTimeout(() => btnSalvar.click(), 250);
        }
    }

    function executeQuickAction(text) {
        const intent = resolveIntent(text);

        if (intent === ACTIONS.greeting) {
            return 'Olá! Posso te ajudar a navegar no sistema e até cadastrar animais. Tente: “cadastre um animal”, “abrir dashboard” ou “ir para agenda”.';
        }

        if (intent === ACTIONS.openAnimalRegister) {
            const payload = parseAnimalFromText(text);
            const hasFullData = payload.codigo || payload.nome || payload.especie || payload.raca || payload.sexo || payload.dataNascimento || payload.lote;

            if (hasFullData) {
                navigateTo('gestao-animais.html');
                setTimeout(() => {
                    const btn = safeGetElement('btnNovoAnimal');
                    if (btn) btn.click();
                    setTimeout(() => preencherAnimalNoFormulario(payload), 250);
                }, 350);
                return 'Vou abrir a tela de gestão e preencher os dados do animal que você me mandou.';
            }

            openAnimalForm();
            return 'Claro! Vou abrir o cadastro de animal para você preencher ou me mandar os dados completos.';
        }

        if (intent === ACTIONS.openFarmRegister) {
            openFarmForm();
            return 'Vou abrir o cadastro de fazenda agora.';
        }

        if (intent === ACTIONS.navigateDashboard) {
            navigateTo('dashboard.html');
            return 'Abrindo o dashboard.';
        }

        if (intent === ACTIONS.navigateGestao) {
            navigateTo('gestao-animais.html');
            return 'Abrindo a gestão de animais.';
        }

        if (intent === ACTIONS.navigateAgenda) {
            navigateTo('agenda-reprodutiva.html');
            return 'Abrindo a agenda reprodutiva.';
        }

        if (intent === ACTIONS.navigateAnalise) {
            navigateTo('analise-genetica.html');
            return 'Abrindo a análise genética.';
        }

        if (intent === ACTIONS.navigateControle) {
            navigateTo('controle-economico.html');
            return 'Abrindo o controle econômico.';
        }

        if (intent === ACTIONS.navigateConfiguracoes) {
            navigateTo('configuracoes.html');
            return 'Abrindo as configurações.';
        }

        if (intent === ACTIONS.listAnimals) {
            const list = Array.isArray(window.animais) ? window.animais : [];
            if (!list.length) {
                return 'Ainda não há animais cadastrados na fazenda ativa.';
            }

            const preview = list.slice(0, 5).map((a) => {
                const nome = a.nome || a.codigo || 'Animal';
                const especie = a.especie || '—';
                return `• ${nome} (${especie})`;
            }).join('<br>');

            return `Animais cadastrados:<br>${preview}`;
        }

        if (intent === ACTIONS.summary) {
            const fazenda = window.PotygenFazenda && typeof window.PotygenFazenda.getFazendaNome === 'function'
                ? window.PotygenFazenda.getFazendaNome()
                : null;
            const total = Array.isArray(window.animais) ? window.animais.length : 0;
            return `Status do sistema: ${fazenda ? 'fazenda ativa: ' + fazenda : 'fazenda não selecionada'}.<br>Animais disponíveis: ${total}.`;
        }

        return 'Posso ajudar com navegação e cadastro. Exemplos: “cadastre um animal”, “abrir agenda”, “dashboard”, “cadastrar fazenda”, “listar animais”.';
    }

    function addMessage(role, text) {
        state.messages.push({ role, text });
        const messagesContainer = safeGetElement('potygen-chat-messages');
        if (!messagesContainer) return;

        const item = document.createElement('div');
        item.className = role === 'user' ? 'potygen-chat-message potygen-chat-message-user' : 'potygen-chat-message potygen-chat-message-bot';

        const bubble = document.createElement('div');
        bubble.className = 'potygen-chat-bubble';
        bubble.innerHTML = text;
        item.appendChild(bubble);
        messagesContainer.appendChild(item);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function sendMessage() {
        const input = safeGetElement('potygen-chat-input');
        if (!input) return;

        const value = input.value.trim();
        if (!value) return;

        addMessage('user', value);
        input.value = '';

        const response = executeQuickAction(value);
        setTimeout(() => addMessage('bot', response), 250);
    }

    // Configuração do Reconhecimento de Voz (Web Speech API)
    function setupSpeechRecognition(micBtn, inputEl) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            micBtn.style.display = 'none'; // Oculta o botão se o navegador não der suporte
            console.warn('Web Speech API não suportada neste navegador.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            state.isRecording = true;
            micBtn.classList.add('potygen-mic-recording');
            inputEl.placeholder = 'Ouvindo... Fale agora...';
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            inputEl.value = transcript;
            // Caso deseje enviar a mensagem automaticamente após falar, descomente a linha abaixo:
            // sendMessage();
        };

        recognition.onerror = (event) => {
            console.error('Erro no reconhecimento de voz:', event.error);
            stopRecording();
        };

        recognition.onend = () => {
            stopRecording();
        };

        function stopRecording() {
            state.isRecording = false;
            micBtn.classList.remove('potygen-mic-recording');
            inputEl.placeholder = 'Digite sua solicitação...';
        }

        micBtn.addEventListener('click', () => {
            if (state.isRecording) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });

        state.recognition = recognition;
    }

    function createFloatingChat() {
        if (document.getElementById(CHATBOT_ID)) return;

        const wrapper = document.createElement('div');
        wrapper.id = CHATBOT_ID;
        wrapper.className = 'potygen-floating-chat';
        wrapper.innerHTML = `
            <button class="potygen-chat-toggle" type="button" aria-label="Abrir assistente Potygen">
                <i class="fa-solid fa-headset"></i>
            </button>
            <div class="potygen-chat-panel" aria-live="polite">
                <div class="potygen-chat-header">
                    <div class="potygen-chat-title">
                        <i class="fa-solid fa-leaf"></i>
                        <span>Potygen IA</span>
                    </div>
                    <button type="button" class="potygen-chat-close" aria-label="Fechar chatbot">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div id="potygen-chat-messages" class="potygen-chat-messages">
                    <div class="potygen-chat-message potygen-chat-message-bot">
                        <div class="potygen-chat-bubble">Olá! Posso ajudar a navegar e cadastrar animais no sistema. Tente: “cadastrar animal”, “dashboard”, “agenda” ou “cadastrar fazenda”.</div>
                    </div>
                </div>
                <div class="potygen-chat-compose">
                    <input id="potygen-chat-input" type="text" placeholder="Digite sua solicitação..." maxlength="200" />
                    <button id="potygen-chat-mic" type="button" aria-label="Gravar áudio">
                        <i class="fa-solid fa-microphone"></i>
                    </button>
                    <button id="potygen-chat-submit" type="button" aria-label="Enviar mensagem">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);

        const toggle = wrapper.querySelector('.potygen-chat-toggle');
        const closeBtn = wrapper.querySelector('.potygen-chat-close');
        const panel = wrapper.querySelector('.potygen-chat-panel');
        const input = wrapper.querySelector('#potygen-chat-input');
        const micBtn = wrapper.querySelector('#potygen-chat-mic');
        const submit = wrapper.querySelector('#potygen-chat-submit');

        toggle.addEventListener('click', () => {
            state.isOpen = !state.isOpen;
            panel.classList.toggle('potygen-chat-panel-open', state.isOpen);
            toggle.classList.toggle('potygen-chat-toggle-active', state.isOpen);
            if (state.isOpen) {
                setTimeout(() => input.focus(), 80);
            }
        });

        closeBtn.addEventListener('click', () => {
            state.isOpen = false;
            panel.classList.remove('potygen-chat-panel-open');
            toggle.classList.remove('potygen-chat-toggle-active');
        });

        submit.addEventListener('click', sendMessage);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') sendMessage();
        });

        // Inicializa o recurso do microfone
        setupSpeechRecognition(micBtn, input);
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                createFloatingChat();
            });
            return;
        }

        createFloatingChat();
    }

    init();

    if (typeof window !== 'undefined') {
        window.PotygenChatbot = {
            resolveIntent,
            executeQuickAction,
            openAnimalForm,
            openFarmForm,
            createFloatingChat,
            sendMessage
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            resolveIntent,
            executeQuickAction
        };
    }
})();