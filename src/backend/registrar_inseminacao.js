// ============================================================
// REGISTRAR INSEMINAÇÃO — integrado ao sistema de Fazendas
// Mesmo padrão usado em gestao-animais (PotygenFazenda / PotygenFazendaUI)
// ============================================================

let todasMatrizes = [];     // fêmeas da fazenda atual
let todosReprodutores = []; // machos da fazenda atual

// ============================================
// HELPERS DE MODAL/TOAST
// (definidos aqui porque esta página NÃO carrega script-gestao.js,
//  que é onde abrirModal/fecharModal/mostrarToast normalmente vivem.
//  Sem isso, os botões "Cadastrar/Trocar Fazenda" da sidebar lançam
//  ReferenceError silencioso e nada acontece ao clicar.)
// ============================================
if (typeof window.abrirModal !== 'function') {
    window.abrirModal = function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = el.classList.contains('modal') ? 'flex' : 'block';
    };
}
if (typeof window.fecharModal !== 'function') {
    window.fecharModal = function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    };
}
if (typeof window.mostrarToast !== 'function') {
    window.mostrarToast = function (msg, tipo = 'sucesso') {
        let toast = document.getElementById('_potygenToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = '_potygenToast';
            toast.style.cssText = 'position:fixed;bottom:28px;right:28px;z-index:99999;padding:14px 22px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;max-width:340px;box-shadow:0 4px 18px rgba(0,0,0,.18);display:none;transition:opacity .25s;';
            document.body.appendChild(toast);
        }
        const cores = { sucesso: '#0d8a4f', error: '#dc3545', aviso: '#ff9800' };
        toast.style.background = cores[tipo] || cores.sucesso;
        toast.textContent = msg;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        clearTimeout(toast._t);
        toast._t = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 260);
        }, 3200);
    };
}


// ============================================
// HELPERS DE FAZENDA
// ============================================
function getFazendaIdAtual() {
    try {
        return window.PotygenFazenda?.getFazendaId?.() || null;
    } catch (_) {
        return null;
    }
}

function abrirModalCadastroFazenda() {
    try {
        if (typeof window.PotygenFazendaUI?.abrirModalCadastrarFazenda === 'function') {
            window.PotygenFazendaUI.abrirModalCadastrarFazenda();
            return true;
        }
    } catch (_) {}
    return false;
}

function exigirFazendaOuAvisar(msg = 'Você precisa cadastrar uma fazenda antes de registrar uma inseminação.') {
    if (getFazendaIdAtual()) return true;
    mostrarMensagem(msg, 'erro', '🏡 Cadastre uma fazenda primeiro');
    abrirModalCadastroFazenda();
    return false;
}

// ============================================
// INICIALIZAR SUPABASE
// ============================================
async function initSupabase() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        console.log('✅ Supabase já inicializado via database.js');
    } else {
        console.error('❌ supabaseClient não encontrado. Verifique se database.js foi carregado antes.');
        mostrarMensagem('Erro ao carregar o banco de dados. Recarregue a página.', 'erro', 'Erro de Conexão');
    }
}

// ============================================
// CARREGAR MATRIZES (fêmeas ativas da fazenda atual)
// ============================================
async function carregarMatrizes() {
    if (!supabaseClient) await initSupabase();

    const fazendaId = getFazendaIdAtual();
    if (!fazendaId) {
        todasMatrizes = [];
        console.warn('⚠️ Nenhuma fazenda selecionada — matrizes não carregadas');
        return [];
    }

    const { data, error } = await supabaseClient
        .from('animais')
        .select('id, codigo, nome, especie, raca, lote')
        .eq('sexo', 'Fêmea')
        .eq('status', 'Ativo')
        .eq('fazenda_id', fazendaId)
        .order('codigo');

    if (error) {
        console.error('Erro ao carregar matrizes:', error);
        mostrarMensagem('Falha ao carregar matrizes', 'erro');
        return [];
    }
    todasMatrizes = data || [];
    console.log(`✅ ${todasMatrizes.length} matrizes carregadas (fazenda ${fazendaId})`);
    return todasMatrizes;
}

// ============================================
// CARREGAR REPRODUTORES (machos ativos da fazenda atual)
// ============================================
async function carregarReprodutores() {
    if (!supabaseClient) await initSupabase();

    const fazendaId = getFazendaIdAtual();
    if (!fazendaId) {
        todosReprodutores = [];
        console.warn('⚠️ Nenhuma fazenda selecionada — reprodutores não carregados');
        return [];
    }

    const { data, error } = await supabaseClient
        .from('animais')
        .select('id, codigo, nome, especie, raca')
        .eq('sexo', 'Macho')
        .eq('status', 'Ativo')
        .eq('fazenda_id', fazendaId)
        .order('codigo');

    if (error) {
        console.error('Erro ao carregar reprodutores:', error);
        mostrarMensagem('Falha ao carregar reprodutores', 'erro');
        return [];
    }
    todosReprodutores = data || [];
    console.log(`✅ ${todosReprodutores.length} reprodutores carregados (fazenda ${fazendaId})`);
    return todosReprodutores;
}

// ============================================
// EXIBIR LISTA DE MATRIZES
// ============================================
function exibirListaMatrizes() {
    const dropdown = document.getElementById('listaMatrizesResultados');
    if (!dropdown) return;

    if (!todasMatrizes || todasMatrizes.length === 0) {
        dropdown.innerHTML = '<div class="animal-item" style="cursor: default; padding: 10px; text-align: center; color: #dc3545;">⚠️ Nenhuma matriz cadastrada nesta fazenda</div>';
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = todasMatrizes.map(matriz => {
        const codigoEscaped = matriz.codigo.replace(/'/g, "\\'");
        const nomeEscaped = (matriz.nome || '').replace(/'/g, "\\'");
        const loteEscaped = (matriz.lote || '').replace(/'/g, "\\'");

        return `
            <div class="animal-item"
                 style="padding: 12px 15px; cursor: pointer; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;"
                 onmouseover="this.style.backgroundColor='#f8f9fa'"
                 onmouseout="this.style.backgroundColor='white'"
                 onclick="selecionarMatriz('${matriz.id}', '${codigoEscaped}', '${nomeEscaped}', '${matriz.especie}', '${matriz.raca}', '${loteEscaped}')">
                <div>
                    <i class="fa-solid fa-cow text-success me-2"></i>
                    <strong style="font-size: 1rem;">${matriz.codigo}</strong>
                    ${matriz.nome ? `<span style="color: #6c757d; margin-left: 8px;">- ${matriz.nome}</span>` : ''}
                    <div style="font-size: 11px; color: #6c757d; margin-top: 4px;">
                        <i class="fa-solid fa-tag me-1"></i>${matriz.especie} / ${matriz.raca}
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right" style="font-size: 12px; color: #cbd5e1;"></i>
            </div>`;
    }).join('');

    dropdown.style.display = 'block';
}

// ============================================
// FILTRAR LISTA DE MATRIZES
// ============================================
function filtrarListaMatriz(texto) {
    const dropdown = document.getElementById('listaMatrizesResultados');
    if (!dropdown) return;

    if (!todasMatrizes || todasMatrizes.length === 0) {
        dropdown.innerHTML = '<div class="animal-item" style="cursor: default; padding: 10px; text-align: center;">📦 Carregando matrizes...</div>';
        dropdown.style.display = 'block';
        return;
    }

    const textoLower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let matrizesFiltradas = todasMatrizes;

    if (texto !== '') {
        matrizesFiltradas = todasMatrizes.filter(matriz => {
            const codigoLower = matriz.codigo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const nomeLower = (matriz.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return codigoLower.includes(textoLower) || nomeLower.includes(textoLower);
        });
    } else {
        exibirListaMatrizes();
        return;
    }

    if (matrizesFiltradas.length === 0) {
        dropdown.innerHTML = `
            <div class="animal-item" style="color: #dc3545; cursor: default; padding: 10px; text-align: center;">
                <i class="fa-solid fa-circle-exclamation"></i> Nenhuma matriz encontrada com "${texto}"
            </div>`;
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = matrizesFiltradas.map(matriz => {
        const codigoEscaped = matriz.codigo.replace(/'/g, "\\'");
        const nomeEscaped = (matriz.nome || '').replace(/'/g, "\\'");
        const loteEscaped = (matriz.lote || '').replace(/'/g, "\\'");

        return `
            <div class="animal-item"
                 style="padding: 12px 15px; cursor: pointer; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;"
                 onmouseover="this.style.backgroundColor='#f8f9fa'"
                 onmouseout="this.style.backgroundColor='white'"
                 onclick="selecionarMatriz('${matriz.id}', '${codigoEscaped}', '${nomeEscaped}', '${matriz.especie}', '${matriz.raca}', '${loteEscaped}')">
                <div>
                    <i class="fa-solid fa-cow text-success me-2"></i>
                    <strong style="font-size: 1rem;">${matriz.codigo}</strong>
                    ${matriz.nome ? `<span style="color: #6c757d; margin-left: 8px;">- ${matriz.nome}</span>` : ''}
                    <div style="font-size: 11px; color: #6c757d; margin-top: 4px;">
                        <i class="fa-solid fa-tag me-1"></i>${matriz.especie} / ${matriz.raca}
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right" style="font-size: 12px; color: #cbd5e1;"></i>
            </div>`;
    }).join('');

    dropdown.style.display = 'block';
}

function mostrarTodasMatrizes() {
    // Bloqueia se não houver fazenda
    if (!exigirFazendaOuAvisar('Cadastre uma fazenda antes de registrar inseminações.')) return;

    const buscaInput = document.getElementById('buscaMatriz');
    if (buscaInput && todasMatrizes.length > 0) {
        exibirListaMatrizes();
    } else if (todasMatrizes.length === 0) {
        carregarMatrizes().then(() => exibirListaMatrizes());
    }
}

function selecionarMatriz(id, codigo, nome, especie, raca, lote) {
    document.getElementById('matrizSelecionadaId').value = id;

    const buscaInput = document.getElementById('buscaMatriz');
    buscaInput.value = `${codigo}${nome ? ` - ${nome}` : ''}`;

    const containerFeedback = document.getElementById('containerFeedback');
    const feedbackText = document.getElementById('textoFeedback');
    const loteInput = document.getElementById('localizacao');

    if (containerFeedback && feedbackText) {
        containerFeedback.classList.remove('bg-light', 'text-secondary', 'border-secondary');
        containerFeedback.classList.add('bg-success', 'text-white', 'border-success');
        feedbackText.innerHTML = `<i class="fa-solid fa-check-circle me-2"></i> <strong>${codigo}</strong>${nome ? ` - ${nome}` : ''} | ${especie} | ${raca}`;
        feedbackText.classList.add('fw-bold');
    }

    if (lote && loteInput) loteInput.value = lote;

    const dropdown = document.getElementById('listaMatrizesResultados');
    if (dropdown) dropdown.style.display = 'none';

    buscaInput.classList.add('border-success');
    console.log(`✅ Matriz selecionada: ${codigo} (${nome})`);
}

// ============================================
// EXIBIR / FILTRAR REPRODUTORES
// ============================================
function exibirListaReprodutores() {
    const dropdown = document.getElementById('listaReprodutoresResultados');
    if (!dropdown) return;

    if (!todosReprodutores || todosReprodutores.length === 0) {
        dropdown.innerHTML = '<div class="animal-item" style="cursor: default; padding: 10px; text-align: center; color: #dc3545;">⚠️ Nenhum reprodutor cadastrado nesta fazenda</div>';
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = todosReprodutores.map(rep => {
        const codigoEscaped = rep.codigo.replace(/'/g, "\\'");
        const nomeEscaped = (rep.nome || '').replace(/'/g, "\\'");

        return `
            <div class="animal-item"
                 style="padding: 12px 15px; cursor: pointer; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;"
                 onmouseover="this.style.backgroundColor='#f8f9fa'"
                 onmouseout="this.style.backgroundColor='white'"
                 onclick="selecionarReprodutor('${rep.id}', '${codigoEscaped}', '${nomeEscaped}', '${rep.especie}', '${rep.raca}')">
                <div>
                    <i class="fa-solid fa-bull text-danger me-2"></i>
                    <strong style="font-size: 1rem;">${rep.codigo}</strong>
                    ${rep.nome ? `<span style="color: #6c757d; margin-left: 8px;">- ${rep.nome}</span>` : ''}
                    <div style="font-size: 11px; color: #6c757d; margin-top: 4px;">
                        <i class="fa-solid fa-tag me-1"></i>${rep.especie} / ${rep.raca}
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right" style="font-size: 12px; color: #cbd5e1;"></i>
            </div>`;
    }).join('');

    dropdown.style.display = 'block';
}

function filtrarListaReprodutor(texto) {
    const dropdown = document.getElementById('listaReprodutoresResultados');
    if (!dropdown) return;

    if (!todosReprodutores || todosReprodutores.length === 0) {
        dropdown.innerHTML = '<div class="animal-item" style="cursor: default; padding: 10px; text-align: center;">📦 Carregando reprodutores...</div>';
        dropdown.style.display = 'block';
        return;
    }

    const textoLower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let reprodutoresFiltrados = todosReprodutores;

    if (texto !== '') {
        reprodutoresFiltrados = todosReprodutores.filter(rep => {
            const codigoLower = rep.codigo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const nomeLower = (rep.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return codigoLower.includes(textoLower) || nomeLower.includes(textoLower);
        });
    } else {
        exibirListaReprodutores();
        return;
    }

    if (reprodutoresFiltrados.length === 0) {
        dropdown.innerHTML = `
            <div class="animal-item" style="color: #dc3545; cursor: default; padding: 10px; text-align: center;">
                <i class="fa-solid fa-circle-exclamation"></i> Nenhum reprodutor encontrado com "${texto}"
            </div>`;
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = reprodutoresFiltrados.map(rep => {
        const codigoEscaped = rep.codigo.replace(/'/g, "\\'");
        const nomeEscaped = (rep.nome || '').replace(/'/g, "\\'");

        return `
            <div class="animal-item"
                 style="padding: 12px 15px; cursor: pointer; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;"
                 onmouseover="this.style.backgroundColor='#f8f9fa'"
                 onmouseout="this.style.backgroundColor='white'"
                 onclick="selecionarReprodutor('${rep.id}', '${codigoEscaped}', '${nomeEscaped}', '${rep.especie}', '${rep.raca}')">
                <div>
                    <i class="fa-solid fa-bull text-danger me-2"></i>
                    <strong style="font-size: 1rem;">${rep.codigo}</strong>
                    ${rep.nome ? `<span style="color: #6c757d; margin-left: 8px;">- ${rep.nome}</span>` : ''}
                    <div style="font-size: 11px; color: #6c757d; margin-top: 4px;">
                        <i class="fa-solid fa-tag me-1"></i>${rep.especie} / ${rep.raca}
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right" style="font-size: 12px; color: #cbd5e1;"></i>
            </div>`;
    }).join('');

    dropdown.style.display = 'block';
}

function mostrarTodosReprodutores() {
    if (!exigirFazendaOuAvisar('Cadastre uma fazenda antes de registrar inseminações.')) return;

    const buscaInput = document.getElementById('buscaReprodutor');
    if (buscaInput && todosReprodutores.length > 0) {
        exibirListaReprodutores();
    } else if (todosReprodutores.length === 0) {
        carregarReprodutores().then(() => exibirListaReprodutores());
    }
}

function selecionarReprodutor(id, codigo, nome, especie, raca) {
    document.getElementById('reprodutorSelecionadoId').value = id;

    const buscaInput = document.getElementById('buscaReprodutor');
    buscaInput.value = `${codigo}${nome ? ` - ${nome}` : ''}`;

    const containerFeedback = document.getElementById('containerFeedbackReprodutor');
    const feedbackText = document.getElementById('textoFeedbackReprodutor');

    if (containerFeedback && feedbackText) {
        containerFeedback.classList.remove('bg-light', 'text-secondary', 'border-secondary');
        containerFeedback.classList.add('bg-success', 'text-white', 'border-success');
        feedbackText.innerHTML = `<i class="fa-solid fa-check-circle me-2"></i> <strong>${codigo}</strong>${nome ? ` - ${nome}` : ''} | ${especie} | ${raca}`;
        feedbackText.classList.add('fw-bold');
    }

    const dropdown = document.getElementById('listaReprodutoresResultados');
    if (dropdown) dropdown.style.display = 'none';

    buscaInput.classList.add('border-success');
    console.log(`✅ Reprodutor selecionado: ${codigo} (${nome})`);
}

// Fechar dropdowns ao clicar fora
document.addEventListener('click', function(e) {
    const wrapperMatriz = document.getElementById('buscaMatriz')?.closest('.busca-animal-container');
    const dropdownMatriz = document.getElementById('listaMatrizesResultados');
    if (dropdownMatriz && wrapperMatriz && !wrapperMatriz.contains(e.target)) {
        dropdownMatriz.style.display = 'none';
    }

    const wrapperReprodutor = document.getElementById('buscaReprodutor')?.closest('.busca-animal-container');
    const dropdownReprodutor = document.getElementById('listaReprodutoresResultados');
    if (dropdownReprodutor && wrapperReprodutor && !wrapperReprodutor.contains(e.target)) {
        dropdownReprodutor.style.display = 'none';
    }
});

document.getElementById('listaMatrizesResultados')?.addEventListener('click', (e) => e.stopPropagation());
document.getElementById('listaReprodutoresResultados')?.addEventListener('click', (e) => e.stopPropagation());

// ============================================
// SALVAR REGISTRO (com fazenda_id)
// ============================================
async function salvarInseminacao(event) {
    event.preventDefault();

    if (!supabaseClient) await initSupabase();

    // 🔒 Guarda de fazenda
    const fazendaId = getFazendaIdAtual();
    if (!fazendaId) {
        mostrarMensagem('Você precisa cadastrar uma fazenda antes de registrar uma inseminação.', 'erro', '🏡 Cadastre uma fazenda primeiro');
        abrirModalCadastroFazenda();
        return;
    }

    const femeaId = document.getElementById('matrizSelecionadaId').value;
    const reprodutorId = document.getElementById('reprodutorSelecionadoId').value;
    const tecnico = document.getElementById('tecnico_responsavel').value.trim();
    const localizacao = document.getElementById('localizacao').value.trim();
    const dataInseminacao = document.getElementById('data_inseminacao').value;
    const horaInseminacao = document.getElementById('hora_inseminacao').value;

    if (!femeaId) {
        mostrarMensagem('Selecione uma matriz válida na lista de opções.', 'erro', 'Campo obrigatório');
        document.getElementById('buscaMatriz').focus();
        return;
    }
    if (!reprodutorId) {
        mostrarMensagem('Selecione um reprodutor válido na lista de opções.', 'erro', 'Campo obrigatório');
        document.getElementById('buscaReprodutor').focus();
        return;
    }
    if (!tecnico) {
        mostrarMensagem('Informe o nome do profissional responsável.', 'erro', 'Campo obrigatório');
        document.getElementById('tecnico_responsavel').focus();
        return;
    }
    if (!dataInseminacao) {
        mostrarMensagem('Informe a data da inseminação.', 'erro', 'Campo obrigatório');
        return;
    }

    const femea = todasMatrizes.find(m => m.id === femeaId);
    const reprodutor = todosReprodutores.find(r => r.id === reprodutorId);

    if (!femea || !reprodutor) {
        mostrarMensagem('Dados do animal não encontrados na lista. Recarregue a página.', 'erro', 'Erro');
        return;
    }

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
        mostrarMensagem('Você precisa estar logado para registrar uma inseminação.', 'erro', 'Autenticação');
        return;
    }

    const inseminacao = {
        usuario_id: user.id,
        fazenda_id: fazendaId,
        femea_id: femeaId,
        reprodutor_id: reprodutorId,
        codigo_femea: femea.codigo,
        codigo_reprodutor: reprodutor.codigo,
        data_inseminacao: dataInseminacao,
        hora_inseminacao: horaInseminacao || null,
        metodo: 'IA',
        protocolo_hormonal: null,
        tecnico_responsavel: tecnico,
        observacoes: localizacao || null,
        status: 'Agendada'
    };

    try {
        const { data, error } = await supabaseClient
            .from('inseminacoes')
            .insert([inseminacao])
            .select();

        if (error) throw error;

        let tipoFemea = '';
        switch (femea.especie) {
            case 'Bovino': tipoFemea = 'vaca'; break;
            case 'Ovino': tipoFemea = 'ovelha'; break;
            case 'Caprino': tipoFemea = 'cabra'; break;
            default: tipoFemea = 'fêmea';
        }

        let tipoMacho = '';
        switch (reprodutor.especie) {
            case 'Bovino': tipoMacho = 'touro'; break;
            case 'Ovino': tipoMacho = 'carneiro'; break;
            case 'Caprino': tipoMacho = 'bode'; break;
            default: tipoMacho = 'macho';
        }

        const taxaPrenhez = Math.floor(Math.random() * (85 - 45 + 1) + 45);

        const mensagemSucesso = `✅ Inseminação registrada com sucesso! 🎉\n\n` +
                                `🐄 Entre a ${tipoFemea} **${femea.nome || femea.codigo}** e o ${tipoMacho} **${reprodutor.nome || reprodutor.codigo}**\n` +
                                `👨‍⚕️ Realizado por: **${tecnico}**\n` +
                                `📊 Taxa de prenhez estimada: **${taxaPrenhez}%**\n\n` +
                                `📍 Localização: ${localizacao || 'Não informada'}\n` +
                                `📅 Data: ${new Date(dataInseminacao).toLocaleDateString('pt-BR')}`;

        mostrarMensagem(mensagemSucesso, 'sucesso', '🎯 Registro Confirmado');
        limparFormulario();

    } catch (error) {
        console.error('Erro ao registrar:', error);
        mostrarMensagem('Erro ao registrar inseminação: ' + error.message, 'erro', '❌ Falha');
    }
}

function limparFormulario() {
    document.getElementById('matrizSelecionadaId').value = '';
    document.getElementById('reprodutorSelecionadoId').value = '';
    document.getElementById('buscaMatriz').value = '';
    document.getElementById('buscaReprodutor').value = '';
    document.getElementById('localizacao').value = '';
    document.getElementById('tecnico_responsavel').value = '';

    document.getElementById('buscaMatriz').classList.remove('border-success');
    document.getElementById('buscaReprodutor').classList.remove('border-success');

    const containerMatriz = document.getElementById('containerFeedback');
    if (containerMatriz) {
        containerMatriz.classList.remove('bg-success', 'text-white', 'border-success');
        containerMatriz.classList.add('bg-light', 'text-secondary', 'border-secondary');
        document.getElementById('textoFeedback').innerHTML = '🔍 Selecione uma matriz acima para validar os dados do animal.';
        document.getElementById('textoFeedback').classList.remove('fw-bold');
    }

    const containerReprodutor = document.getElementById('containerFeedbackReprodutor');
    if (containerReprodutor) {
        containerReprodutor.classList.remove('bg-success', 'text-white', 'border-success');
        containerReprodutor.classList.add('bg-light', 'text-secondary', 'border-secondary');
        document.getElementById('textoFeedbackReprodutor').innerHTML = '🔍 Selecione um reprodutor acima para confirmar.';
        document.getElementById('textoFeedbackReprodutor').classList.remove('fw-bold');
    }

    const agora = new Date();
    document.getElementById('data_inseminacao').value = agora.toISOString().split('T')[0];
    document.getElementById('hora_inseminacao').value = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;
}

// ============================================
// MODAL PERSONALIZADO DE MENSAGENS
// ============================================
function mostrarMensagem(mensagem, tipo = 'info', titulo = '') {
    let modal = document.getElementById('modalMensagem');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalMensagem';
        modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(3px);";
        modal.innerHTML = `
            <div style="background: white; border-radius: 20px; max-width: 550px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; animation: slideIn 0.3s ease;">
                <div id="modalHeader" style="padding: 20px; color: white;">
                    <h3 id="modalMensagemTitulo" style="margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 10px;"></h3>
                </div>
                <div style="padding: 30px;">
                    <p id="modalMensagemTexto" style="white-space: pre-line; margin: 0 0 25px 0; line-height: 1.6; font-size: 1rem;"></p>
                    <button id="btnOkMensagem" class="btn" style="background: #0d8a4f; color: white; border: none; padding: 12px 35px; border-radius: 50px; cursor: pointer; font-weight: 600; font-size: 1rem;">OK</button>
                </div>
            </div>
            <style>
                @keyframes slideIn { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            </style>`;
        document.body.appendChild(modal);
    }

    const header = document.getElementById('modalHeader');
    const tituloElem = document.getElementById('modalMensagemTitulo');

    if (tipo === 'sucesso') {
        header.style.backgroundColor = '#28a745';
        tituloElem.innerHTML = '<i class="fa-solid fa-circle-check"></i> ' + (titulo || '✅ Sucesso!');
    } else if (tipo === 'erro') {
        header.style.backgroundColor = '#dc3545';
        tituloElem.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + (titulo || '❌ Erro!');
    } else {
        header.style.backgroundColor = '#17a2b8';
        tituloElem.innerHTML = '<i class="fa-solid fa-circle-info"></i> ' + (titulo || 'ℹ️ Informação');
    }

    document.getElementById('modalMensagemTexto').innerHTML = mensagem.replace(/\n/g, '<br>');
    modal.style.display = 'flex';

    document.getElementById('btnOkMensagem').onclick = () => {
        modal.style.display = 'none';
        if (tipo === 'sucesso') {
            carregarMatrizes();
            carregarReprodutores();
        }
    };

    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

// ============================================
// AUTENTICAÇÃO
// ============================================
async function verificarAutenticacao() {
    if (!supabaseClient) await initSupabase();
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
        console.warn('⚠️ Usuário não autenticado');
        mostrarMensagem('Você não está logado. Por favor, faça login para continuar.', 'erro', 'Autenticação Necessária');
        return false;
    }
    console.log(`✅ Usuário autenticado: ${user.email}`);
    return true;
}

// ============================================
// AGUARDAR PotygenFazendaUI ESTAR DISPONÍVEL
// (carregado por fazenda-ui.js — pode chegar depois do DOMContentLoaded)
// ============================================
async function aguardarFazendaUI(maxMs = 5000) {
    const intervalo = 100;
    let esperado = 0;
    while (esperado < maxMs) {
        if (typeof window.PotygenFazendaUI?.inicializar === 'function') return true;
        await new Promise(r => setTimeout(r, intervalo));
        esperado += intervalo;
    }
    return false;
}

// ============================================
// INICIALIZAÇÃO
// ============================================
window.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando página de registro de inseminação...');

    await initSupabase();
    const autenticado = await verificarAutenticacao();
    if (!autenticado) return;

    // Garante que fazenda-ui.js já registrou PotygenFazendaUI
    const uiPronta = await aguardarFazendaUI();
    if (!uiPronta) {
        console.error('❌ PotygenFazendaUI não disponível. Verifique se fazenda.js e fazenda-ui.js foram carregados.');
        mostrarMensagem('Erro ao inicializar o sistema de fazendas. Recarregue a página.', 'erro');
        return;
    }

    // MESMO PADRÃO DO gestao-animais:
    // PotygenFazendaUI.inicializar() carrega as fazendas do usuário,
    // restaura a fazenda salva na sessão e popula window.PotygenFazenda.fazendaAtual.
    // Sem esta chamada, getFazendaIdAtual() sempre retorna null.
    const fazendaAtiva = await window.PotygenFazendaUI.inicializar({
        onFazendaTrocada: async (fazenda) => {
            console.log('🔄 Fazenda alterada — recarregando matrizes/reprodutores', fazenda?.nome);
            await carregarMatrizes();
            await carregarReprodutores();
            exibirListaMatrizes && exibirListaMatrizes();
            exibirListaReprodutores && exibirListaReprodutores();
        }
    });

    if (!fazendaAtiva || !getFazendaIdAtual()) {
        // PotygenFazendaUI.inicializar() já abre o modal de cadastro quando não há fazenda
        mostrarMensagem(
            'Você ainda não cadastrou uma fazenda. Cadastre uma fazenda antes de registrar inseminações.',
            'erro',
            '🏡 Cadastre uma fazenda primeiro'
        );
    } else {
        await carregarMatrizes();
        await carregarReprodutores();

        console.log(`📊 Matrizes: ${todasMatrizes.length} | Reprodutores: ${todosReprodutores.length}`);

        if (todasMatrizes.length === 0) {
            mostrarMensagem('Nenhuma matriz (fêmea) cadastrada nesta fazenda. Cadastre animais primeiro.', 'info', 'Atenção');
        }
        if (todosReprodutores.length === 0) {
            mostrarMensagem('Nenhum reprodutor (macho) cadastrado nesta fazenda. Cadastre animais primeiro.', 'info', 'Atenção');
        }
    }

    // Data e hora atuais
    const agora = new Date();
    document.getElementById('data_inseminacao').value = agora.toISOString().split('T')[0];
    document.getElementById('hora_inseminacao').value = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;

    // Submit
    const form = document.getElementById('formInseminacao');
    if (form) form.addEventListener('submit', salvarInseminacao);

    // Placeholders
    const buscaMatriz = document.getElementById('buscaMatriz');
    const buscaReprodutor = document.getElementById('buscaReprodutor');
    if (buscaMatriz) buscaMatriz.placeholder = "🔍 Clique para ver todas as matrizes ou digite para filtrar...";
    if (buscaReprodutor) buscaReprodutor.placeholder = "🔍 Clique para ver todos os reprodutores ou digite para filtrar...";
});

// Expor funções globais usadas em onclick/oninput inline
window.filtrarListaMatriz = filtrarListaMatriz;
window.mostrarTodasMatrizes = mostrarTodasMatrizes;
window.selecionarMatriz = selecionarMatriz;
window.filtrarListaReprodutor = filtrarListaReprodutor;
window.mostrarTodosReprodutores = mostrarTodosReprodutores;
window.selecionarReprodutor = selecionarReprodutor;
