(function () {
    const CHATBOT_ID = 'potygen-floating-chat';
    const SAFE_TIMEOUT = 300;

    const ACTIONS = {
        greeting: 'greeting',
        openAnimalRegister: 'openAnimalRegister',
        openFarmRegister: 'openFarmRegister',
        navigateDashboard: 'navigate:dashboard.html',
        navigateGestao: 'navigate:gestao-animais.html',
        navigateInsemination: 'navigate:registrar_inseminacao.html',
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
        recognition: null,
        animalRegistration: null
    };

    // ============================================================
    // NORMALIZAÇÃO
    // ============================================================

    function normalizarTexto(text) {
        return (text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ============================================================
    // RESOLVER INTENÇÃO
    // ============================================================

    function resolveIntent(text) {
        const t = normalizarTexto(text);

        if (!t) return ACTIONS.general;

        if (/(ola|oi|bom dia|boa tarde|boa noite|hello|hi)/.test(t)) {
            return ACTIONS.greeting;
        }

       if (
    /(cadastra|cadastre|cadastrar|registrar).*animal|animal.*(cadastra|cadastre|cadastrar|registrar)/.test(t)
) {
    return ACTIONS.openAnimalRegister;
}

if (
    /(cadastra|cadastre|cadastrar|registrar).*fazenda|fazenda.*(cadastra|cadastre|cadastrar|registrar)/.test(t)
) {
    return ACTIONS.openFarmRegister;
}

        if (
            /(dashboard|painel|resumo|inicio|pagina inicial)/.test(t)
        ) {
            return ACTIONS.navigateDashboard;
        }

        if (
            /(gestao.*animal|animais|rebanho|listar.*animal|ver.*animal)/.test(t)
        ) {
            return ACTIONS.navigateGestao;
        }

        // ========================================================
        // INSEMINAÇÃO
        // Esta regra precisa vir antes da regra da agenda.
        // ========================================================

        if (
            /(pagina|abrir|ir|entrar|acessar|registrar|registro|nova|novo)?\s*inseminacao/.test(t) ||
            /inseminacao\s*(pagina|abrir|ir|entrar|acessar|registrar|registro|nova|novo)?/.test(t)
        ) {
            return ACTIONS.navigateInsemination;
        }

        if (/(agenda|reprodutiva|cronograma)/.test(t)) {
            return ACTIONS.navigateAgenda;
        }

        if (
            /(analise|genetica|dna|linhagem|genetico)/.test(t)
        ) {
            return ACTIONS.navigateAnalise;
        }

        if (
            /(controle.*econom|economico|despesas|financeiro|producao|custos)/.test(t)
        ) {
            return ACTIONS.navigateControle;
        }

        if (
            /(configurac|perfil|ajustes|conta)/.test(t)
        ) {
            return ACTIONS.navigateConfiguracoes;
        }

        if (
    /(listar|mostrar|ver).*animais|animais.*(lista|listar|mostrar)/.test(t)
) {
    return ACTIONS.listAnimals;
}

        if (
            /(resumo|status|como.*estou|situacao|estado)/.test(t)
        ) {
            return ACTIONS.summary;
        }

        return ACTIONS.general;
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function safeGetElement(id) {
        return document.getElementById(id);
    }

    function navigateTo(page) {
        if (!page) return false;

        const finalPath = page.startsWith('http')
            ? page
            : `${page}`;

        window.location.href = finalPath;
        return true;
    }

    function resetChat() {
        state.animalRegistration = null;
        state.messages = [];

        const messagesContainer = safeGetElement('potygen-chat-messages');

        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        const mensagemBoasVindas = `
            Conversa reiniciada! Como posso te ajudar agora?<br><br>
            <strong>💡 Dica:</strong> Se errar alguma palavra, basta digitar
            <strong>**</strong> antes do texto correto (Ex.: <i>**Nelore</i>).
        `;

        addMessage('bot', mensagemBoasVindas);
    }

    // ============================================================
    // ABRIR FORMULÁRIO DE ANIMAL
    // ============================================================

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

    // ============================================================
    // ABRIR FORMULÁRIO DE FAZENDA
    // ============================================================

    function openFarmForm() {
        if (
            window.PotygenFazendaUI &&
            typeof window.PotygenFazendaUI.abrirModalCadastrarFazenda === 'function'
        ) {
            window.PotygenFazendaUI.abrirModalCadastrarFazenda();
            return true;
        }

        if (typeof abrirModalCadastrarFazenda === 'function') {
            abrirModalCadastrarFazenda();
            return true;
        }

        navigateTo('dashboard.html');

        setTimeout(() => {
            if (
                window.PotygenFazendaUI &&
                typeof window.PotygenFazendaUI.abrirModalCadastrarFazenda === 'function'
            ) {
                window.PotygenFazendaUI.abrirModalCadastrarFazenda();
            }
        }, 400);

        return true;
    }

    // ============================================================
    // CADASTRO CONVERSACIONAL DE ANIMAL
    // ============================================================

    const ANIMAL_REGISTRATION_STEPS = [
        { key: 'codigo', label: 'Código de Identificação' },
        { key: 'nome', label: 'Nome' },
        { key: 'especie', label: 'Espécie' },
        { key: 'raca', label: 'Raça' },
        { key: 'pelagem', label: 'Pelagem' }, // <-- NOVO CAMPO
        { key: 'grauSangue', label: 'Grau de Sangue' },
        { key: 'dataNascimento', label: 'Data de Nascimento' },
        { key: 'pesoNascer', label: 'Peso ao Nascer (kg)' },
        { key: 'pesoAtual', label: 'Peso Atual (kg)' },
        { key: 'sexo', label: 'Sexo' },
        { key: 'lote', label: 'Lote' },
        { key: 'finalidade', label: 'Finalidade' }
    ];

    function iniciarCadastroConversacional(payload = {}) {
        state.animalRegistration = {
            data: { ...payload },
            stepIndex: 0
        };

        while (
            state.animalRegistration.stepIndex <
                ANIMAL_REGISTRATION_STEPS.length &&
            state.animalRegistration.data[
                ANIMAL_REGISTRATION_STEPS[
                    state.animalRegistration.stepIndex
                ].key
            ]
        ) {
            state.animalRegistration.stepIndex++;
        }

        if (
            state.animalRegistration.stepIndex >=
            ANIMAL_REGISTRATION_STEPS.length
        ) {
            finalizarCadastroConversacional();

            return 'Pronto! Vou abrir o cadastro com os dados preenchidos para você revisar.';
        }

        const passo =
            ANIMAL_REGISTRATION_STEPS[
                state.animalRegistration.stepIndex
            ];

        return `
            Vamos cadastrar o animal passo a passo.<br><br>
            <strong>📌 Aviso importante:</strong> lembre-se de preencher
            o <strong>número de descendentes</strong> e o
            <strong>histórico de doenças</strong> diretamente no formulário.<br><br>
            Qual é o <strong>${passo.label}</strong>?
        `;
    }

    function cancelarCadastroConversacional() {
        state.animalRegistration = null;

        return 'Cadastro de animal cancelado. Posso continuar com outras funções do sistema.';
    }

    // ============================================================
    // CONVERSÃO DOS DADOS
    // ============================================================

    function normalizarValorCadastro(key, value) {
        const raw = (value || '').trim();
        const t = normalizarTexto(raw);

        // --------------------------------------------------------
        // CÓDIGO
        // --------------------------------------------------------

        if (key === 'codigo') {
            const match =
                raw.match(/[a-z0-9][a-z0-9-]*/i);

            return match
                ? match[0].toUpperCase()
                : null;
        }

        // --------------------------------------------------------
        // ESPÉCIE
        // --------------------------------------------------------

        if (key === 'especie') {
            if (
                /(bovino|boi|vaca|bezerro|novilha)/.test(t)
            ) {
                return 'Bovino';
            }

            if (
                /(ovino|ovelha|carneiro|borrega)/.test(t)
            ) {
                return 'Ovino';
            }

            if (
                /(caprino|cabra|cabrito|bode)/.test(t)
            ) {
                return 'Caprino';
            }

            return null;
        }
        // --------------------------------------------------------
        // PESOS
        // --------------------------------------------------------
        if (key === 'pesoNascer' || key === 'pesoAtual') {
            const numero = raw.replace(',', '.').replace(/[^0-9.]/g, '');
            return numero ? parseFloat(numero) : null;
        }

        // --------------------------------------------------------
        // RAÇA
        // --------------------------------------------------------

        if (key === 'raca') {
            return raw || null;
        }

        // --------------------------------------------------------
        // GRAU DE SANGUE
        // --------------------------------------------------------

        if (key === 'grauSangue') {
            if (
                /(puro de origem|(^| )po($| ))/.test(t)
            ) {
                return 'Puro de Origem (PO)';
            }

            if (
                /(puro por cruza|(^| )pc($| ))/.test(t)
            ) {
                return 'Puro por Cruza (PC)';
            }

            if (
                /(cruzamento f1|(^| )f1($| ))/.test(t)
            ) {
                return 'Cruzamento F1';
            }

            if (
                /3\s*\/\s*4|tres quartos|tr[eê]s quartos/.test(t)
            ) {
                return '3/4 (Três Quartos)';
            }

            if (
                /(^| )5\s*\/\s*8($| )/.test(t)
            ) {
                return '5/8';
            }

            if (
                /(^| )7\s*\/\s*8($| )/.test(t)
            ) {
                return '7/8';
            }

            if (
                /(^| )15\s*\/\s*16($| )/.test(t)
            ) {
                return '15/16';
            }

            if (
                /(srd|sem raca definida)/.test(t)
            ) {
                return 'SRD (Sem Raça Definida)';
            }

            return null;
        }

        // --------------------------------------------------------
        // DATA
        // --------------------------------------------------------

        if (key === 'dataNascimento') {
            const match =
                raw.match(
                    /\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4}/
                );

            if (!match) {
                return null;
            }

            const data = match[0];

            const iso =
                data.includes('-') &&
                data.indexOf('-') === 4
                    ? data
                    : data
                        .split(/[/-]/)
                        .reverse()
                        .join('-');

            const dt =
                new Date(`${iso}T00:00:00`);

            if (
                Number.isNaN(dt.getTime())
            ) {
                return null;
            }

            return iso;
        }

        // --------------------------------------------------------
        // SEXO
        // --------------------------------------------------------

       if (key === 'sexo') {
            if (
                /(femea|f[êe]mea|vaca|ovelha|cabra)/.test(t)
            ) {
                return 'Fêmea';
            }

            if (
                /(macho|boi|touro|carneiro|bode)/.test(t)
            ) {
                return 'Macho';
            }

            return null;
        }

        // --------------------------------------------------------
        // FINALIDADE (Mapeando para o texto exato do Select)
        // --------------------------------------------------------
        if (key === 'finalidade') {
            const texto = raw.toLowerCase();
            if (texto.includes('corte') || texto.includes('carne')) return 'Corte (Carne)';
            if (texto.includes('dupla') || texto.includes('aptidão') || texto.includes('aptidao')) return 'Dupla Aptidão';
            if (texto.includes('leite')) return 'Leite';
            if (texto.includes('couro')) return 'Couro';
            if (texto.includes('lã') || texto.includes('la')) return 'Lã';
            if (texto.includes('melhoramento') || texto.includes('genético') || texto.includes('genetico')) return 'Melhoramento Genético';
            return raw; // Caso ele digite algo diferente
        }

        return raw || null;
    }

    // ============================================================
    // PRÓXIMO PASSO
    // ============================================================

    function obterProximoPassoCadastro() {
        if (!state.animalRegistration) {
            return null;
        }

        while (
            state.animalRegistration.stepIndex <
                ANIMAL_REGISTRATION_STEPS.length &&
            state.animalRegistration.data[
                ANIMAL_REGISTRATION_STEPS[
                    state.animalRegistration.stepIndex
                ].key
            ]
        ) {
            state.animalRegistration.stepIndex++;
        }

        return (
            state.animalRegistration.stepIndex <
            ANIMAL_REGISTRATION_STEPS.length
        )
            ? ANIMAL_REGISTRATION_STEPS[
                state.animalRegistration.stepIndex
            ]
            : null;
    }

    // ============================================================
    // FINALIZAR CADASTRO CONVERSACIONAL
    // ============================================================

    function finalizarCadastroConversacional() {
    const cadastro = state.animalRegistration?.data;
    if (!cadastro) return;

    try {
        sessionStorage.setItem(
            'potygen_pending_animal',
            JSON.stringify(cadastro)
        );

        sessionStorage.setItem(
            'potygen_open_animal_form',
            '1'
        );

    } catch (error) {
        console.error(
            'Não foi possível guardar o cadastro pendente:',
            error
        );
    }

    state.animalRegistration = null;

    window.location.href = 'gestao-animais.html';
}

    // ============================================================
    // PROCESSAR RESPOSTA
    // ============================================================

    function processarRespostaCadastroAnimal(value) {
        const cadastro =
            state.animalRegistration;

        if (!cadastro) {
            return null;
        }

        const lower =
            normalizarTexto(value);

        if (
            /^(cancelar|cancela|parar|sair|desistir)$/.test(lower)
        ) {
            return cancelarCadastroConversacional();
        }

        const passo =
            obterProximoPassoCadastro();

        if (!passo) {
            finalizarCadastroConversacional();

            return 'Pronto! Vou abrir o cadastro para você revisar e finalizar.';
        }

        const convertido =
            normalizarValorCadastro(
                passo.key,
                value
            );

        if (!convertido) {
            const exemplos = {
                codigo: 'Ex.: BR001234',
                especie:
                    'Bovino, Ovino ou Caprino',
                raca:
                    'Ex.: Nelore',
                grauSangue:
                    'Ex.: PO, PC, F1, 3/4, 5/8, 7/8, 15/16 ou SRD',
                dataNascimento:
                    'Ex.: 15/08/2024',
                sexo:
                    'Macho ou Fêmea'
            };

            return `
                Não consegui identificar esse dado.<br>
                Digite o <strong>${passo.label}</strong>.<br>
                <small>${exemplos[passo.key]}</small>
            `;
        }

        cadastro.data[passo.key] =
            convertido;

        cadastro.stepIndex++;

        const proximo =
            obterProximoPassoCadastro();

        if (!proximo) {
            finalizarCadastroConversacional();

            return `
                ✅ Dados obrigatórios preenchidos.
                Vou abrir a Gestão de Animais com o cadastro
                pronto para revisão.<br><br>

                <strong>📌 Aviso importante:</strong><br>
                Preencha o <strong>número de descendentes</strong> e o
                <strong>histórico de doenças</strong> diretamente na tela.<br><br>

                <strong>
                    Confira os dados e clique em
                    “Cadastrar Animal”
                </strong>
                para salvar.
            `;
        }

        let pergunta = `qual é o <strong>${proximo.label}</strong>?`;

        // Se o próximo passo for a finalidade, personalizamos as opções com base na espécie já salva
        if (proximo.key === 'finalidade') {
            const especieEscolhida = (cadastro.data.especie || '').toLowerCase();
            let opcoes = '';
            
            if (especieEscolhida.includes('bovino')) {
                opcoes = 'Corte, Leite, Dupla Aptidão ou Melhoramento Genético';
            } else if (especieEscolhida.includes('ovino')) {
                opcoes = 'Corte, Lã, Leite, Couro ou Dupla Aptidão';
            } else if (especieEscolhida.includes('caprino')) {
                opcoes = 'Corte, Leite, Couro ou Dupla Aptidão';
            } else {
                opcoes = 'Corte, Leite, Couro, etc.';
            }
            
            pergunta = `qual é a sua <strong>Finalidade</strong>?<br><small style="color: #666;">(Opções para ${cadastro.data.especie}: ${opcoes})</small>`;
        }

        return `
            Perfeito!<br>
            Agora, ${pergunta}
        `;
    }

    // ============================================================
    // INTERPRETAR DADOS EM UMA ÚNICA FRASE
    // ============================================================

    function parseAnimalFromText(text) {
        const t = text || '';

        const result = {
            codigo: null,
            nome: null,
            especie: null,
            raca: null,
            sexo: null,
            dataNascimento: null,
            grauSangue: null,
            lote: null,
            finalidade: null
        };

        // --------------------------------------------------------
        // CÓDIGO
        // --------------------------------------------------------

        const codigoMatch =
            t.match(
                /codigo\s*[:=]?\s*([a-z0-9-]+)/i
            );

        if (codigoMatch) {
            result.codigo =
                codigoMatch[1].toUpperCase();
        }

        // --------------------------------------------------------
        // NOME
        // --------------------------------------------------------

        const nomeMatch =
            t.match(
                /nome\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü]+)/i
            );

        if (nomeMatch) {
            result.nome =
                nomeMatch[1].trim();
        }

        // --------------------------------------------------------
        // ESPÉCIE
        // --------------------------------------------------------

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

        for (
            const key in especieMap
        ) {
            if (t.includes(key)) {
                result.especie =
                    especieMap[key];

                break;
            }
        }

        // --------------------------------------------------------
        // RAÇA
        // --------------------------------------------------------

        const racaMatch =
            t.match(
                /raca\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü-]+)/i
            );

        if (racaMatch) {
            result.raca =
                racaMatch[1].trim();
        }
        // --------------------------------------------------------
        // PELAGEM
        // --------------------------------------------------------

        const pelagemMatch =
            t.match(
                /pelagem\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü-]+)/i
            );

        if (pelagemMatch) {
            result.pelagem =
                pelagemMatch[1].trim();
        }
        // --------------------------------------------------------
        // SEXO
        // --------------------------------------------------------

        const sexoMatch =
            t.match(
                /sexo\s*[:=]?\s*(macho|femea|fêmea)/i
            );

        if (sexoMatch) {
            result.sexo =
                sexoMatch[1]
                    .toLowerCase()
                    .includes('feme')
                    ? 'Fêmea'
                    : 'Macho';
        }

        // --------------------------------------------------------
        // DATA
        // --------------------------------------------------------

        const dataMatch =
            t.match(
                /data\s*[:=]?\s*(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/i
            );

        if (dataMatch) {
            const raw =
                dataMatch[1];

            const normalized =
                raw.includes('/') ||
                (
                    raw.includes('-') &&
                    raw.indexOf('-') !== 4
                )
                    ? raw
                        .split(/[/-]/)
                        .reverse()
                        .join('-')
                    : raw;

            result.dataNascimento =
                normalized;
        }

        // --------------------------------------------------------
        // GRAU DE SANGUE
        // --------------------------------------------------------

        const grauMatch =
            t.match(
                /(?:grau\s*de\s*sangue|grau)\s*[:=]?\s*(po|pc|f1|3\s*\/\s*4|5\s*\/\s*8|7\s*\/\s*8|15\s*\/\s*16|srd|puro de origem|puro por cruza|cruzamento f1|sem raca definida)/i
            );

        if (grauMatch) {
            result.grauSangue =
                normalizarValorCadastro(
                    'grauSangue',
                    grauMatch[1]
                );
        }

        // --------------------------------------------------------
        // LOTE
        // --------------------------------------------------------

        const loteMatch =
            t.match(
                /lote\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü-]+)/i
            );

        if (loteMatch) {
            result.lote =
                loteMatch[1].trim();
        }

        // --------------------------------------------------------
        // FINALIDADE
        // --------------------------------------------------------

        const finalidadeMatch =
            t.match(
                /finalidade\s*[:=]?\s*([a-z0-9\sçãõéíóúâêôàü-]+)/i
            );

        if (finalidadeMatch) {
            result.finalidade =
                finalidadeMatch[1].trim();
        }

        return result;
    }

    // ============================================================
    // PREENCHER FORMULÁRIO
    // ============================================================

    function preencherAnimalNoFormulario(payload) {
        const formFields = {
            formCodigo: payload.codigo,
            formNome: payload.nome,
            formEspecie: payload.especie,
            formRaca: payload.raca,
            formPelagem: payload.pelagem, // <-- Mapeamento da pelagem
            formGrauSangue: payload.grauSangue,
            formSexo: payload.sexo,
            formDataNascimento: payload.dataNascimento,
            formPesoNascer: payload.pesoNascer,
            formPesoAtual: payload.pesoAtual,
            formLote: payload.lote,
            formFinalidade: payload.finalidade // Já normalizado!
        };

        Object.entries(formFields)
            .forEach(
                ([id, value]) => {
                    const el =
                        safeGetElement(id);

                    if (
                        !el ||
                        value === null ||
                        value === undefined ||
                        value === ''
                    ) {
                        return;
                    }

                    el.value = value;

                    if (
                        typeof el.dispatchEvent ===
                        'function'
                    ) {
                        el.dispatchEvent(
                            new Event(
                                'input',
                                {
                                    bubbles: true
                                }
                            )
                        );

                        el.dispatchEvent(
                            new Event(
                                'change',
                                {
                                    bubbles: true
                                }
                            )
                        );
                    }
                }
            );

        // --------------------------------------------------------
        // RAÇA
        // --------------------------------------------------------

        const buscaRaca =
            safeGetElement(
                'buscaRaca'
            );

        if (
            buscaRaca &&
            payload.raca
        ) {
            buscaRaca.value =
                payload.raca;
        }

        const hiddenRaca =
            safeGetElement(
                'formRaca'
            );

        if (
            hiddenRaca &&
            payload.raca
        ) {
            hiddenRaca.value =
                payload.raca;
        }

        // NÃO salvar automaticamente.
        // O usuário deve revisar o formulário.
    }

    // ============================================================
    // EXECUTAR AÇÃO
    // ============================================================

    function executeQuickAction(text) {
        const intent =
            resolveIntent(text);

        // --------------------------------------------------------
        // SAUDAÇÃO
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.greeting
        ) {
            return `
                Olá! Posso te ajudar a navegar
                no sistema e até cadastrar animais.

                Tente:
                “cadastre um animal”,
                “abrir dashboard”,
                “ir para agenda” ou
                “abrir inseminação”.

                <br><br>
                <strong>💡 Dica:</strong> o <strong>número de descendentes</strong>
                e o <strong>histórico de doenças</strong> devem ser preenchidos
                diretamente no formulário final.
            `;
        }

        // --------------------------------------------------------
        // CADASTRO DE ANIMAL
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.openAnimalRegister
        ) {
            const payload =
                parseAnimalFromText(text);

            const hasAnyData =
                Object.values(payload)
                    .some(
                        value =>
                            value !== null &&
                            value !== undefined &&
                            value !== ''
                    );

           if (hasAnyData) {
            const obrigatorios = [
                'codigo',
                'especie',
                'raca',
                'grauSangue',
                'dataNascimento',
                'sexo'
            ];

            const hasAllRequired =
                obrigatorios.every(
                    key => payload[key]
                );

            if (hasAllRequired) {
                try {
                    sessionStorage.setItem(
                        'potygen_pending_animal',
                        JSON.stringify(payload)
                    );
                    
                    // ---> ADICIONADO: Avisa a página gestao-animais.html que o modal DEVE ser aberto
                    sessionStorage.setItem(
                        'potygen_open_animal_form',
                        '1'
                    );

                } catch (error) {
                    console.error(
                        'Erro ao guardar cadastro pendente:',
                        error
                    );
                }

                navigateTo(
                    'gestao-animais.html'
                );

                return `
                    Vou abrir a Gestão de Animais
                    com os dados preenchidos para
                    você revisar.

                    O cadastro não será salvo
                    automaticamente.
                `;
            }

            return iniciarCadastroConversacional(
                payload
            );
        }

        return iniciarCadastroConversacional();
    }

    // --------------------------------------------------------
    // CADASTRO DE FAZENDA
    // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.openFarmRegister
        ) {
            openFarmForm();

            return 'Vou abrir o cadastro de fazenda agora.';
        }

        // --------------------------------------------------------
        // DASHBOARD
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.navigateDashboard
        ) {
            navigateTo(
                'dashboard.html'
            );

            return 'Abrindo o dashboard.';
        }

        // --------------------------------------------------------
        // GESTÃO DE ANIMAIS
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.navigateGestao
        ) {
            navigateTo(
                'gestao-animais.html'
            );

            return 'Abrindo a gestão de animais.';
        }

        // --------------------------------------------------------
        // REGISTRAR INSEMINAÇÃO
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.navigateInsemination
        ) {
            navigateTo(
                'registrar_inseminacao.html'
            );

            return 'Abrindo a página de registrar inseminação.';
        }

        // --------------------------------------------------------
        // AGENDA
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.navigateAgenda
        ) {
            navigateTo(
                'agenda-reprodutiva.html'
            );

            return 'Abrindo a agenda reprodutiva.';
        }

        // --------------------------------------------------------
        // ANÁLISE GENÉTICA
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.navigateAnalise
        ) {
            navigateTo(
                'analise-genetica.html'
            );

            return 'Abrindo a análise genética.';
        }

        // --------------------------------------------------------
        // CONTROLE ECONÔMICO
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.navigateControle
        ) {
            navigateTo(
                'controle-economico.html'
            );

            return 'Abrindo o controle econômico.';
        }

        // --------------------------------------------------------
        // CONFIGURAÇÕES
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.navigateConfiguracoes
        ) {
            navigateTo(
                'configuracoes.html'
            );

            return 'Abrindo as configurações.';
        }

        // --------------------------------------------------------
        // LISTAR ANIMAIS
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.listAnimals
        ) {
            const list =
                Array.isArray(
                    window.animais
                )
                    ? window.animais
                    : [];

            if (!list.length) {
                return 'Ainda não há animais cadastrados na fazenda ativa.';
            }

            const preview =
                list
                    .slice(0, 5)
                    .map(
                        (a) => {
                            const nome =
                                a.nome ||
                                a.codigo ||
                                'Animal';

                            const especie =
                                a.especie ||
                                '—';

                            return `
                                • ${nome} (${especie})
                            `;
                        }
                    )
                    .join('<br>');

            return `
                Animais cadastrados:<br>
                ${preview}
            `;
        }

        // --------------------------------------------------------
        // RESUMO
        // --------------------------------------------------------

        if (
            intent ===
            ACTIONS.summary
        ) {
            const fazenda =
                window.PotygenFazenda &&
                typeof window.PotygenFazenda
                    .getFazendaNome ===
                    'function'
                    ? window.PotygenFazenda
                        .getFazendaNome()
                    : null;

            const total =
                Array.isArray(
                    window.animais
                )
                    ? window.animais.length
                    : 0;

            return `
                Status do sistema:
                ${
                    fazenda
                        ? 'fazenda ativa: ' +
                          fazenda
                        : 'fazenda não selecionada'
                }.
                <br>
                Animais disponíveis:
                ${total}.
            `;
        }

        // --------------------------------------------------------
        // PADRÃO
        // --------------------------------------------------------

        return `
            Posso ajudar com navegação e cadastro.

            Exemplos:
            “cadastre um animal”,
            “abrir agenda”,
            “abrir inseminação”,
            “dashboard”,
            “cadastrar fazenda”,
            “listar animais”.
        `;
    }

    // ============================================================
    // MENSAGENS
    // ============================================================

    function addMessage(role, text) {
        state.messages.push({
            role,
            text
        });

        const messagesContainer =
            safeGetElement(
                'potygen-chat-messages'
            );

        if (!messagesContainer) {
            return;
        }

        const item =
            document.createElement(
                'div'
            );

        item.className =
            role === 'user'
                ? 'potygen-chat-message potygen-chat-message-user'
                : 'potygen-chat-message potygen-chat-message-bot';

        const bubble =
            document.createElement(
                'div'
            );

        bubble.className =
            'potygen-chat-bubble';

        bubble.innerHTML =
            text;

        item.appendChild(
            bubble
        );

        messagesContainer.appendChild(
            item
        );

        messagesContainer.scrollTop =
            messagesContainer.scrollHeight;
    }

    // ============================================================
    // ENVIAR MENSAGEM
    // ============================================================

    function sendMessage() {
        const input =
            safeGetElement(
                'potygen-chat-input'
            );

        if (!input) {
            return;
        }

        const value =
            input.value.trim();

        if (!value) {
            return;
        }

        let textoProcessado = value;

        if (value.startsWith('**')) {
            textoProcessado = value.substring(2).trim();

            if (!textoProcessado) {
                return;
            }

            addMessage(
                'user',
                `✏️ <i>Corrigindo para: ${textoProcessado}</i>`
            );
        } else {
            addMessage(
                'user',
                value
            );
        }

        input.value = '';

        const response =
            state.animalRegistration
                ? processarRespostaCadastroAnimal(
                    textoProcessado
                )
                : executeQuickAction(
                    textoProcessado
                );

        setTimeout(
            () => {
                addMessage(
                    'bot',
                    response
                );
            },
            250
        );
    }

    // ============================================================
    // MICROFONE / WEB SPEECH API
    // ============================================================

    function setupSpeechRecognition(
        micBtn,
        inputEl
    ) {
        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            micBtn.style.display =
                'none';

            console.warn(
                'Web Speech API não suportada neste navegador.'
            );

            return;
        }

        const recognition =
            new SpeechRecognition();

        recognition.lang =
            'pt-BR';

        recognition.continuous =
            false;

        recognition.interimResults =
            false;

        recognition.onstart =
            () => {
                state.isRecording =
                    true;

                micBtn.classList.add(
                    'potygen-mic-recording'
                );

                inputEl.placeholder =
                    'Ouvindo... Fale agora...';
            };

        recognition.onresult =
            (event) => {
                const transcript =
                    event.results[0][0]
                        .transcript;

                inputEl.value =
                    transcript;

                sendMessage();
            };

        recognition.onerror =
            (event) => {
                console.error(
                    'Erro no reconhecimento de voz:',
                    event.error
                );

                stopRecording();
            };

        recognition.onend =
            () => {
                stopRecording();
            };

        function stopRecording() {
            state.isRecording =
                false;

            micBtn.classList.remove(
                'potygen-mic-recording'
            );

            inputEl.placeholder =
                'Digite sua solicitação...';
        }

        micBtn.addEventListener(
            'click',
            () => {
                if (state.isRecording) {
                    recognition.stop();
                } else {
                    recognition.start();
                }
            }
        );

        state.recognition =
            recognition;
    }

    // ============================================================
    // CRIAR CHAT FLUTUANTE
    // ============================================================

    function createFloatingChat() {
        if (
            document.getElementById(
                CHATBOT_ID
            )
        ) {
            return;
        }

        const wrapper =
            document.createElement(
                'div'
            );

        wrapper.id =
            CHATBOT_ID;

        wrapper.className =
            'potygen-floating-chat';

        wrapper.innerHTML = `
            <button
                class="potygen-chat-toggle"
                type="button"
                aria-label="Abrir assistente Potygen"
            >
                <i class="fa-solid fa-headset"></i>
            </button>

            <div
                class="potygen-chat-panel"
                aria-live="polite"
            >
                <div class="potygen-chat-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button
                            type="button"
                            id="potygen-chat-reset"
                            class="potygen-chat-reset"
                            aria-label="Reiniciar conversa"
                            title="Reiniciar / Mudar de assunto"
                        >
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>

                        <div class="potygen-chat-title">
                            <i class="fa-solid fa-leaf"></i>
                            <span>Potygen IA</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        class="potygen-chat-close"
                        aria-label="Fechar chatbot"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>

                </div>

                <div
                    id="potygen-chat-messages"
                    class="potygen-chat-messages"
                >
                    <div
                        class="potygen-chat-message potygen-chat-message-bot"
                    >
                        <div class="potygen-chat-bubble">
                            Olá! Posso ajudar a navegar
                            e cadastrar animais no sistema.
                            Tente: “cadastrar animal”,
                            “dashboard”, “agenda” ou
                            “cadastrar fazenda”.<br><br>

                        </div>
                    </div>
                </div>

                <div class="potygen-chat-compose">

                    <input
                        id="potygen-chat-input"
                        type="text"
                        placeholder="Digite sua solicitação..."
                        maxlength="200"
                    />

                    <button
                        id="potygen-chat-mic"
                        type="button"
                        aria-label="Gravar áudio"
                    >
                        <i class="fa-solid fa-microphone"></i>
                    </button>

                    <button
                        id="potygen-chat-submit"
                        type="button"
                        aria-label="Enviar mensagem"
                    >
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>

                </div>
            </div>
        `;

        document.body.appendChild(
            wrapper
        );

        const toggle =
            wrapper.querySelector(
                '.potygen-chat-toggle'
            );

        const closeBtn =
            wrapper.querySelector(
                '.potygen-chat-close'
            );

        const resetBtn =
            wrapper.querySelector(
                '#potygen-chat-reset'
            );

        const panel =
            wrapper.querySelector(
                '.potygen-chat-panel'
            );

        const input =
            wrapper.querySelector(
                '#potygen-chat-input'
            );

        const micBtn =
            wrapper.querySelector(
                '#potygen-chat-mic'
            );

        const submit =
            wrapper.querySelector(
                '#potygen-chat-submit'
            );

        resetBtn.addEventListener(
            'click',
            resetChat
        );

        // --------------------------------------------------------
        // ABRIR / FECHAR
        // --------------------------------------------------------

        toggle.addEventListener(
            'click',
            () => {
                state.isOpen =
                    !state.isOpen;

                panel.classList.toggle(
                    'potygen-chat-panel-open',
                    state.isOpen
                );

                toggle.classList.toggle(
                    'potygen-chat-toggle-active',
                    state.isOpen
                );

                if (state.isOpen) {
                    setTimeout(
                        () =>
                            input.focus(),
                        80
                    );
                }
            }
        );

        closeBtn.addEventListener(
            'click',
            () => {
                state.isOpen =
                    false;

                panel.classList.remove(
                    'potygen-chat-panel-open'
                );

                toggle.classList.remove(
                    'potygen-chat-toggle-active'
                );
            }
        );

        // --------------------------------------------------------
        // ENVIAR
        // --------------------------------------------------------

        submit.addEventListener(
            'click',
            sendMessage
        );

        input.addEventListener(
            'keydown',
            (event) => {
                if (event.key === 'Enter') {
                    sendMessage();
                }
            }
        );

        // --------------------------------------------------------
        // MICROFONE
        // Erro no reconhecimento não impede
        // o restante do chatbot de funcionar.
        // --------------------------------------------------------

        try {
            setupSpeechRecognition(
                micBtn,
                input
            );
        } catch (error) {
            console.error(
                'Erro ao inicializar o microfone do Potygen IA:',
                error
            );
        }
    }

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================

    function init() {
        const iniciar = () => {
            try {
                createFloatingChat();
            } catch (error) {
                console.error(
                    'Erro ao inicializar o Potygen IA:',
                    error
                );
            }
        };

        if (
            document.readyState ===
            'loading'
        ) {
            document.addEventListener(
                'DOMContentLoaded',
                iniciar,
                {
                    once: true
                }
            );

            return;
        }

        iniciar();
    }

    init();

    // ============================================================
    // API GLOBAL
    // ============================================================

    if (
        typeof window !==
        'undefined'
    ) {
        window.PotygenChatbot = {
            resolveIntent,
            executeQuickAction,
            openAnimalForm,
            openFarmForm,
            iniciarCadastroConversacional,
            cancelarCadastroConversacional,
            resetChat,
            createFloatingChat,
            sendMessage
        };
    }

    // ============================================================
    // NODE / TESTES
    // ============================================================

    if (
        typeof module !==
        'undefined' &&
        module.exports
    ) {
        module.exports = {
            resolveIntent,
            executeQuickAction
        };
    }

})();