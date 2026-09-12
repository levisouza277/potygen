// ============================================
// ESTADO LOCAL (cache em memória)
// ============================================
// OBS: supabaseClient é inicializado em database.js
let animais = [];

// ============================================
// HELPERS GLOBAIS (usados por fazenda-ui.js)
// ============================================

/**
 * Abre um modal pelo id. Suporta tanto modais com classe .modal
 * (display:flex) quanto os modais de fazenda com classe .modal-backdrop
 * (display:block).
 */
function abrirModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = el.classList.contains('modal') ? 'flex' : 'block';
}

/**
 * Fecha um modal pelo id.
 */
function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

/**
 * Exibe uma notificação toast temporária.
 * @param {string} msg  - Mensagem a exibir
 * @param {string} tipo - 'sucesso' | 'error' | 'aviso' (padrão: 'sucesso')
 */
function mostrarToast(msg, tipo = 'sucesso') {
    let toast = document.getElementById('_potygenToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = '_potygenToast';
        toast.style.cssText = `
            position: fixed; bottom: 28px; right: 28px; z-index: 99999;
            padding: 14px 22px; border-radius: 10px; font-size: 14px;
            font-weight: 600; color: #fff; max-width: 340px;
            box-shadow: 0 4px 18px rgba(0,0,0,.18);
            display: none; transition: opacity .25s;
        `;
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
}

// ============================================
// BANCO DE DOENÇAS POR ESPÉCIE E SEXO
// ============================================
const bancoDoencas = {
    'Bovino': {
        'Macho': [
            'Brucelose bovina (mal de casco/touro caído)',
            'Tricomonose (Tritrichomonas foetus - cio repetido)',
            'Campilobacteriose genital (vibrião - cio sujo)',
            'Leptospirose (urina de rato)',
            'Mycoplasma bovis (inflamação reprodutiva)',
            'Ureaplasma spp.',
            'Tristeza parasitária bovina (babesiose/anaplasmose)',
            'Verminoses'
        ],
        'Fêmea': [
            'Brucelose (aborto contagioso)',
            'Leptospirose',
            'Campilobacteriose genital bovina',
            'Tricomonose',
            'IBR (rinotraqueíte - resfriado bovino reprodutivo)',
            'BVD (diarreia viral bovina)',
            'Neosporose (principal causa de aborto no Brasil)',
            'Endometrite/metrite pós-parto',
            'Infecção uterina subclínica',
            'Cetose',
            'Hipocalcemia',
            'Tristeza parasitária',
            'Verminoses'
        ]
    },
    'Ovino': {
        'Macho': [
            'Brucella ovis (epididimite ovina)',
            'Actinobacillus seminis',
            'Histophilus somni',
            'Salmonella enterica',
            'Corynebacterium pseudotuberculosis',
            'Maedi-visna',
            'Vírus da língua azul',
            'Toxoplasmose (impacto indireto via ambiente)',
            'Pasteurelose (fraqueza geral)'
        ],
        'Fêmea': [
            'Toxoplasmose (aborto das ovelhas)',
            'Brucella ovis (indireto)',
            'Maedi-visna',
            'Clostridioses (enterotoxemia - doença do excesso de ração)',
            'Pododermatite (podridão dos cascos)',
            'Verminoses',
            'Hipocalcemia',
            'Cetose'
        ]
    },
    'Caprino': {
        'Macho': [
            'CAEV (artrite encefalite caprina)',
            'Brucelose (B. melitensis)',
            'Clamidiose (Chlamydophila abortus)',
            'Febre Q (Coxiella burnetii)',
            'Linfadenite caseosa',
            'Mycoplasma agalactiae',
            'Toxoplasmose (importante no sistema extensivo)'
        ],
        'Fêmea': [
            'CAEV',
            'Brucelose',
            'Clamidiose (abortos enzoóticos)',
            'Toxoplasmose (principal causa de aborto em cabras no Nordeste)',
            'Febre Q',
            'Linfadenite caseosa',
            'Enterotoxemia',
            'Verminoses',
            'Cetose'
        ]
    }
};

// ============================================
// FUNÇÕES DE BANCO DE DADOS (SUPABASE)
// ============================================

/**
 * Carrega todos os animais do usuário logado, junto com suas
 * doenças e abortos das tabelas relacionais.
 */
async function carregarAnimais() {
    try {
        mostrarLoading(true);

        // Obtém fazenda ativa (se o módulo fazenda.js estiver carregado)
        const fazendaId = window.PotygenFazenda?.getFazendaId?.() || null;

        let query = supabaseClient
            .from('animais')
            .select('*')
            .order('created_at', { ascending: false });

        // Filtra por fazenda se houver uma selecionada
        if (fazendaId) {
            query = query.eq('fazenda_id', fazendaId);
        }

        const { data: animaisBase, error } = await query;
        if (error) throw error;

        // Tenta buscar doenças e abortos separadamente (tabelas podem não existir ainda)
        let doencasMap = {};
        let abortosMap = {};

        if (animaisBase && animaisBase.length > 0) {
            const ids = animaisBase.map(a => a.id);

            try {
                const { data: doencasData } = await supabaseClient
                    .from('doencas_animais')
                    .select('*')
                    .in('animal_id', ids);
                if (doencasData) {
                    doencasData.forEach(d => {
                        if (!doencasMap[d.animal_id]) doencasMap[d.animal_id] = [];
                        doencasMap[d.animal_id].push(d);
                    });
                }
            } catch (e) {
                console.warn('Tabela doencas_animais não encontrada, ignorando:', e.message);
            }

            try {
                const { data: abortosData } = await supabaseClient
                    .from('abortos_animais')
                    .select('*')
                    .in('animal_id', ids);
                if (abortosData) {
                    abortosData.forEach(ab => {
                        if (!abortosMap[ab.animal_id]) abortosMap[ab.animal_id] = [];
                        abortosMap[ab.animal_id].push(ab);
                    });
                }
            } catch (e) {
                console.warn('Tabela abortos_animais não encontrada, ignorando:', e.message);
            }
        }

        // Normaliza os dados
        animais = (animaisBase || []).map(a => ({
            ...a,
            doencas: (doencasMap[a.id] || []).map(d => ({
                id: d.id,
                nome: d.nome_doenca,
                dataDiagnostico: d.data_diagnostico,
                tratou: d.tratou,
                dataTratamento: d.data_tratamento,
                tipoTratamento: d.tipo_tratamento,
                observacoesTratamento: d.observacoes
            })),
            abortos: (abortosMap[a.id] || []).map(ab => ({
                id: ab.id,
                data: ab.data_aborto,
                diasGestacao: ab.idade_gestacional_dias,
                causa: ab.causa_suspeita,
                observacoes: ab.observacoes
            })),
            nascimentos: a.nascimentos || [],
            descendentes: a.descendentes || []
        }));

        renderizarTabela();
        atualizarDatalists();
    } catch (err) {
        console.error('Erro ao carregar animais:', err);
        mostrarMensagem('Erro ao carregar animais do banco de dados: ' + err.message, 'erro');
    } finally {
        mostrarLoading(false);
    }
}

/**
 * Salva ou atualiza um animal no Supabase.
 * Trata doenças e abortos nas tabelas relacionais.
 */
async function salvarAnimalDB(animalData) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    
    if (sessionError || !session) {
        console.error('Erro de autenticação:', sessionError);
        mostrarMensagem('Sessão expirada. Faça login novamente.', 'erro');
        setTimeout(() => {
            window.location.href = '../pages/index.html';
        }, 2000);
        return;
    }
    const usuarioId = session.user.id;
    const isEditing = window.animalEmEdicao;

    // Payload principal para a tabela animais
    const payload = {
        usuario_id: usuarioId,
        fazenda_id: window.PotygenFazenda?.getFazendaId?.() || null,
        codigo: animalData.codigo,
        nome: animalData.nome || null,
        especie: animalData.especie,
        raca: animalData.raca,
        grau_sangue: animalData.grauSangue || null,
        pelagem: animalData.pelagem || null,
        data_nascimento: animalData.dataNascimento || null,
        peso_nascer: animalData.pesoNascer || null,
        peso_atual: animalData.pesoAtual || null,
        sexo: animalData.sexo,
        finalidade: animalData.finalidade || null,
        lote: animalData.lote || null,
        observacoes: animalData.observacoes || null,
        // Campos de fêmea
        categoria_reprodutiva: animalData.categoriaReprodutiva || null,
        ecc: animalData.ecc || null,
        // Genealogia (texto livre - pai_id/mae_id requerem uuid, usamos campos de texto)
        mae: animalData.mae || null,
        pai: animalData.pai || null,
        historico_aborto: animalData.historicoAborto || false,
        qtd_nascimentos: animalData.qtdNascimentos || 0,
        nascimentos: animalData.nascimentos || [],
        // Campos de macho
        tipo_reprodutor: animalData.tipoReprodutor || null,
        exame_andrologico: animalData.exameAndrologicoDia || false,
        ecc_macho: animalData.eccMacho || null,
        mae_macho: animalData.maeMacho || null,
        pai_macho: animalData.paiMacho || null,
        laboratorio: animalData.laboratorio || null,
        qtd_descendentes: animalData.qtdDescendentes || 0,
        descendentes: animalData.descendentes || []
    };

    try {
        mostrarLoading(true);
        let animalId;

        if (isEditing) {
            const { data, error } = await supabaseClient
                .from('animais')
                .update(payload)
                .eq('id', isEditing)
                .eq('usuario_id', usuarioId)
                .select()
                .single();
            if (error) throw error;
            animalId = isEditing;

            // Apaga e reinsere doenças e abortos ao editar
            await supabaseClient.from('doencas_animais').delete().eq('animal_id', animalId);
            await supabaseClient.from('abortos_animais').delete().eq('animal_id', animalId);
        } else {
            const { data, error } = await supabaseClient
                .from('animais')
                .insert(payload)
                .select()
                .single();
            if (error) throw error;
            animalId = data.id;
        }

        // Insere doenças na tabela relacional doencas_animais (se a tabela existir)
        const doencas = animalData.doencas || [];
        if (doencas.length > 0) {
            try {
                const doencasPayload = doencas.map(d => ({
                    animal_id: animalId,
                    nome_doenca: d.nome,
                    data_diagnostico: d.dataDiagnostico || null,
                    tratou: d.tratou || false,
                    data_tratamento: d.dataTratamento || null,
                    tipo_tratamento: d.tipoTratamento || null,
                    observacoes: d.observacoesTratamento || null
                }));
                const { error: errDoencas } = await supabaseClient
                    .from('doencas_animais')
                    .insert(doencasPayload);
                if (errDoencas) console.warn('Aviso ao salvar doenças:', errDoencas.message);
            } catch (e) {
                console.warn('Tabela doencas_animais indisponível:', e.message);
            }
        }

        // Insere abortos na tabela relacional abortos_animais (se a tabela existir)
        const abortos = animalData.abortos || [];
        if (abortos.length > 0) {
            try {
                const abortosPayload = abortos.map(ab => ({
                    animal_id: animalId,
                    data_aborto: ab.data || null,
                    idade_gestacional_dias: ab.diasGestacao ? parseInt(ab.diasGestacao) : null,
                    causa_suspeita: ab.macho || ab.causa || null,
                    observacoes: ab.observacoes || null
                }));
                const { error: errAbortos } = await supabaseClient
                    .from('abortos_animais')
                    .insert(abortosPayload);
                if (errAbortos) console.warn('Aviso ao salvar abortos:', errAbortos.message);
            } catch (e) {
                console.warn('Tabela abortos_animais indisponível:', e.message);
            }
        }

        window.animalEmEdicao = null;
        mostrarMensagem(isEditing ? 'Animal atualizado com sucesso!' : 'Animal cadastrado com sucesso!', 'sucesso');
        fecharModalCadastroAnimal();
        await carregarAnimais(); // Recarrega para refletir dados das sub-tabelas

    } catch (err) {
        console.error('Erro ao salvar animal:', err);
        if (err.message.includes('row-level security')) {
            mostrarMensagem('Erro de permissão. Faça logout e login novamente.', 'erro');
        } else {
            mostrarMensagem('Erro ao salvar: ' + (err.message || 'Verifique os dados e tente novamente.'), 'erro');
        }
    } finally {
        mostrarLoading(false);
    }
}

async function deletarAnimalDB(id) {
    try {
        mostrarLoading(true);
        // ON DELETE CASCADE apaga doencas_animais e abortos_animais automaticamente
        const { error } = await supabaseClient
            .from('animais')
            .delete()
            .eq('id', id);

        if (error) throw error;

        animais = animais.filter(a => a.id !== id);
        renderizarTabela();
        atualizarDatalists();
        mostrarMensagem('Animal excluído com sucesso!', 'sucesso');
    } catch (err) {
        console.error('Erro ao deletar animal:', err);
        mostrarMensagem('Erro ao excluir: ' + err.message, 'erro');
    } finally {
        mostrarLoading(false);
    }
}

// ============================================
// LOADING INDICATOR
// ============================================
function mostrarLoading(show) {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.35);
            display: flex; align-items: center; justify-content: center;
            z-index: 9999; backdrop-filter: blur(2px);
        `;
        overlay.innerHTML = `
            <div style="background:#fff; border-radius:16px; padding:32px 40px; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,0.18);">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:32px; color:#0d8a4f; margin-bottom:12px; display:block;"></i>
                <p style="margin:0; color:#1e293b; font-weight:600;">Aguarde...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = show ? 'flex' : 'none';
}

// ============================================
// FUNÇÃO PRINCIPAL - SALVAR ANIMAL (coleta form)
// ============================================
function salvarAnimal() {
    // Defesa: impede salvar se não houver fazenda
    const _fazendaId = window.PotygenFazenda?.getFazendaId?.() || null;
    if (!_fazendaId) {
        if (typeof mostrarMensagem === 'function') {
            mostrarMensagem(
                'Cadastre uma fazenda antes de cadastrar um animal.',
                'aviso',
                'Nenhuma fazenda cadastrada'
            );
        } else {
            alert('Cadastre uma fazenda antes de cadastrar um animal.');
        }
        if (typeof fecharModalCadastroAnimal === 'function') fecharModalCadastroAnimal();
        return;
    }

    const isEditing = window.animalEmEdicao;

    const animal = {
        id: isEditing || null,
        codigo: document.getElementById('formCodigo').value.trim(),
        nome: document.getElementById('formNome').value.trim() || '',
        especie: document.getElementById('formEspecie').value,
        raca: document.getElementById('formRaca').value,
        grauSangue: document.getElementById('formGrauSangue').value,
        pelagem: document.getElementById('formPelagem').value.trim(),
        dataNascimento: document.getElementById('formDataNascimento').value,
        pesoNascer: parseFloat(document.getElementById('formPesoNascer').value) || 0,
        pesoAtual: parseFloat(document.getElementById('formPesoAtual').value) || 0,
        sexo: document.getElementById('formSexo').value,
        finalidade: document.getElementById('formFinalidade').value,
        lote: document.getElementById('formLote').value.trim(),
        observacoes: document.getElementById('formObs').value.trim(),
        doencas: []
    };

    // Validar campos obrigatórios
    if (!animal.codigo || !animal.especie || !animal.raca || !animal.sexo || !animal.dataNascimento) {
        mostrarMensagem('Por favor, preencha todos os campos obrigatórios (*)', 'aviso');
        return;
    }

    // Campos específicos por sexo
    if (animal.sexo === 'Fêmea') {
        animal.categoriaReprodutiva = document.getElementById('formCategoriaFemea').value;
        animal.ecc = parseFloat(document.getElementById('formECC').value) || null;
        animal.mae = document.getElementById('formMae').value.trim() || null;
        animal.historicoAborto = document.getElementById('formHistoricoAborto').value === 'sim';

        if (animal.historicoAborto) {
            animal.qtdAbortos = parseInt(document.getElementById('formQtdAbortos').value) || 0;
            const abortosDetalhes = [];
            for (let i = 1; i <= animal.qtdAbortos; i++) {
                const data = document.getElementById(`abortoData_${i}`)?.value;
                const macho = document.getElementById(`abortoMacho_${i}`)?.value;
                const dias = document.getElementById(`abortoDias_${i}`)?.value;
                const obs = document.getElementById(`abortoObs_${i}`)?.value;
                if (data || macho) {
                    abortosDetalhes.push({
                        numero: i,
                        data: data || null,
                        macho: macho || null,
                        diasGestacao: dias ? parseInt(dias) : null,
                        observacoes: obs || null
                    });
                }
            }
            animal.abortos = abortosDetalhes;
        } else {
            animal.abortos = [];
        }

        animal.doencas = coletarDoencas();

        const temCrias = document.getElementById('formTemCrias')?.value;
        if (temCrias === 'sim') {
            const qtdNascimentos = parseInt(document.getElementById('formQtdNascimentos').value) || 0;
            const nascimentos = [];
            for (let i = 1; i <= qtdNascimentos; i++) {
                const data = document.getElementById(`nascimentoData_${i}`)?.value;
                if (data) {
                    nascimentos.push({
                        numero: i,
                        data: data,
                        sexo: document.getElementById(`nascimentoSexo_${i}`)?.value || null,
                        pai: document.getElementById(`nascimentoPai_${i}`)?.value || null,
                        peso: parseFloat(document.getElementById(`nascimentoPeso_${i}`)?.value) || null,
                        observacoes: document.getElementById(`nascimentoObs_${i}`)?.value || null
                    });
                }
            }
            animal.nascimentos = nascimentos;
            animal.qtdNascimentos = qtdNascimentos;
        } else {
            animal.nascimentos = [];
            animal.qtdNascimentos = 0;
        }

    } else if (animal.sexo === 'Macho') {
        animal.tipoReprodutor = document.getElementById('formTipoMacho')?.value || null;
        animal.exameAndrologicoDia = document.getElementById('formExameAndrologico')?.value === 'sim';
        animal.eccMacho = document.getElementById('formECCMacho')?.value || null;
        animal.maeMacho = document.getElementById('formMaeMacho')?.value.trim() || null;
        animal.paiMacho = document.getElementById('formPaiMacho')?.value.trim() || null;
        animal.laboratorio = document.getElementById('formLaboratorio')?.value.trim() || null;

        const temDescendentes = document.getElementById('formTemDescendentes')?.value;
        if (temDescendentes === 'sim') {
            const qtdDescendentes = parseInt(document.getElementById('formQtdDescendentes')?.value) || 0;
            animal.qtdDescendentes = qtdDescendentes;
            const descendentes = [];
            for (let i = 1; i <= qtdDescendentes; i++) {
                const nomeDescendente = document.getElementById(`descendenteNome_${i}`)?.value;
                if (nomeDescendente) {
                    descendentes.push({
                        numero: i,
                        nome: nomeDescendente,
                        sexo: document.getElementById(`descendenteSexo_${i}`)?.value || null,
                        mae: document.getElementById(`descendenteMae_${i}`)?.value || null,
                        dataNascimento: document.getElementById(`descendenteData_${i}`)?.value || null,
                        pesoNascer: parseFloat(document.getElementById(`descendentePeso_${i}`)?.value) || null,
                        observacoes: document.getElementById(`descendenteObs_${i}`)?.value || null
                    });
                }
            }
            animal.descendentes = descendentes;
        } else {
            animal.qtdDescendentes = 0;
            animal.descendentes = [];
        }

        animal.doencas = coletarDoencasMacho?.() || [];
    }

    // Envia para o Supabase
    salvarAnimalDB(animal);
}

function deletarAnimal(id) {
    mostrarConfirmacao(
        'Tem certeza que deseja excluir este animal? Esta ação não pode ser desfeita!',
        () => deletarAnimalDB(id),
        () => console.log('Exclusão cancelada')
    );
}

// ============================================
// RENDERIZAÇÃO DA TABELA
// ============================================
function renderizarTabela() {
    const tbody = document.getElementById('tabelaAnimais');
    if (!tbody) return;

    if (animais.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">Nenhum animal cadastrado</td></tr>';
        return;
    }

    tbody.innerHTML = animais.map(animal => {
        const idade = calcularIdade(animal.data_nascimento || animal.dataNascimento);
        const nome = animal.nome || 'Sem nome';
        const codigo = animal.codigo || '';
        const raca = animal.raca || '-';
        const especie = animal.especie || '-';
        const pesoAtual = animal.peso_atual ?? animal.pesoAtual ?? 0;
        const sexo = animal.sexo || 'N/A';
        const finalidade = animal.finalidade || '—';
        const lote = animal.lote || '—';
        const pelagem = animal.pelagem || '—';

        return `
            <tr>
                <td><strong>${nome}</strong><br><small>${codigo}</small></td>
                <td>${raca} - ${especie}</td>
                <td>${idade}</td>
                <td>${pesoAtual} kg</td>
                <td>${sexo}</td>
                <td>${finalidade}</td>
                <td>${lote}</td>
                <td>${pelagem}</td>
                <td class="action-buttons">
                    <button class="action-btn action-view" onclick="visualizarAnimal('${animal.id}')">
                        <i class="fa-solid fa-eye"></i> Ver características
                    </button>
                    <button class="action-btn action-edit" onclick="editarAnimal('${animal.id}')">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                    <button class="action-btn action-delete" onclick="deletarAnimal('${animal.id}')">
                        <i class="fa-solid fa-trash"></i> Excluir
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderizarTabelaFiltrada(lista) {
    const tbody = document.getElementById('tabelaAnimais');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">Nenhum animal encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(animal => {
        const idade = calcularIdade(animal.data_nascimento || animal.dataNascimento);
        const pesoAtual = animal.peso_atual ?? animal.pesoAtual ?? 0;

        return `
            <tr>
                <td><strong>${animal.nome || 'Sem nome'}</strong><br><small>${animal.codigo}</small></td>
                <td>${animal.raca} - ${animal.especie}</td>
                <td>${idade}</td>
                <td>${pesoAtual} kg</td>
                <td>${animal.sexo === 'Fêmea' ? 'Fêmea' : 'Macho'}</td>
                <td>${animal.finalidade || '—'}</td>
                <td>${animal.lote || '—'}</td>
                <td>${animal.pelagem || '—'}</td>
                <td class="action-buttons">
                    <button class="action-btn action-view" onclick="visualizarAnimal('${animal.id}')">
                        <i class="fa-solid fa-eye"></i> Ver características
                    </button>
                    <button class="action-btn action-edit" onclick="editarAnimal('${animal.id}')">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                    <button class="action-btn action-delete" onclick="deletarAnimal('${animal.id}')">
                        <i class="fa-solid fa-trash"></i> Excluir
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// DATALISTS (mãe/pai)
// ============================================
function atualizarDatalists() {
    const matrizes = animais.filter(a => a.sexo === 'Fêmea');
    const reprodutores = animais.filter(a => a.sexo === 'Macho');

    ['listaMatrizes', 'listaMatrizesMacho'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '';
            matrizes.forEach(m => {
                const opt = document.createElement('option');
                opt.value = `${m.codigo} - ${m.nome || 'Sem nome'}`;
                el.appendChild(opt);
            });
        }
    });

    ['listaReprodutores', 'listaReprodutoresMacho'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '';
            reprodutores.forEach(r => {
                const opt = document.createElement('option');
                opt.value = `${r.codigo} - ${r.nome || 'Sem nome'}`;
                el.appendChild(opt);
            });
        }
    });
}

// ============================================
// CALCULAR IDADE
// ============================================
function calcularIdade(dataNascimento) {
    if (!dataNascimento) return 'N/A';
    const nasc = new Date(dataNascimento);
    const hoje = new Date();
    const idadeMeses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());

    if (idadeMeses < 12) return `${idadeMeses} meses`;
    const anos = Math.floor(idadeMeses / 12);
    const meses = idadeMeses % 12;
    return meses > 0 ? `${anos} anos e ${meses} meses` : `${anos} anos`;
}

function calcularIdadeAnimal() {
    const dataInput = document.getElementById('formDataNascimento');
    const idadeDiv = document.getElementById('idadeAnimalPreview');
    if (!dataInput || !dataInput.value) { if (idadeDiv) idadeDiv.innerHTML = ''; return; }

    const dataNasc = new Date(dataInput.value);
    const hoje = new Date();
    if (isNaN(dataNasc.getTime())) { idadeDiv.innerHTML = '⚠️ Data inválida'; return; }

    const diffMeses = (hoje.getFullYear() - dataNasc.getFullYear()) * 12 + (hoje.getMonth() - dataNasc.getMonth());
    let idadeTexto = '';
    if (diffMeses < 0) idadeTexto = '⚠️ Data futura';
    else if (diffMeses < 1) { const d = Math.floor((hoje - dataNasc) / 86400000); idadeTexto = `${d} dias`; }
    else if (diffMeses < 12) idadeTexto = `${diffMeses} meses`;
    else { const a = Math.floor(diffMeses / 12), m = diffMeses % 12; idadeTexto = m > 0 ? `${a} anos e ${m} meses` : `${a} anos`; }

    idadeDiv.innerHTML = `<i class="fa-solid fa-calendar"></i> Idade atual: ${idadeTexto}`;
}

function calcularIdadeCria(numero) {
    const dataInput = document.getElementById(`nascimentoData_${numero}`);
    const idadeDiv = document.getElementById(`idadeCria_${numero}`);
    if (!dataInput || !dataInput.value) { if (idadeDiv) idadeDiv.innerHTML = ''; return; }

    const dataNasc = new Date(dataInput.value);
    const hoje = new Date();
    const diffMeses = (hoje.getFullYear() - dataNasc.getFullYear()) * 12 + (hoje.getMonth() - dataNasc.getMonth());

    if (diffMeses < 0) idadeDiv.innerHTML = '⚠️ Data futura';
    else if (diffMeses < 1) { const d = Math.floor((hoje - dataNasc) / 86400000); idadeDiv.innerHTML = `📅 Idade atual: ${d} dias`; }
    else if (diffMeses < 12) idadeDiv.innerHTML = `📅 Idade atual: ${diffMeses} meses`;
    else { const a = Math.floor(diffMeses / 12), m = diffMeses % 12; idadeDiv.innerHTML = m > 0 ? `📅 Idade atual: ${a} anos e ${m} meses` : `📅 Idade atual: ${a} anos`; }
}

// ============================================
// VISUALIZAR ANIMAL
// ============================================
function visualizarAnimal(id) {
    const animal = animais.find(a => String(a.id) === String(id));
    if (!animal) {
        if (typeof mostrarMensagem === 'function') mostrarMensagem('Animal não encontrado!', 'erro');
        else if (typeof mostrarToast === 'function') mostrarToast('Animal não encontrado!', 'error');
        return;
    }

    const setText = (elId, val) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = (val === null || val === undefined || val === '') ? '-' : val;
    };
    const setHTML = (elId, html) => {
        const el = document.getElementById(elId);
        if (el) el.innerHTML = html;
    };
    const setDisplay = (elId, display) => {
        const el = document.getElementById(elId);
        if (el) el.style.display = display;
    };

    const dataNasc = animal.data_nascimento || animal.dataNascimento;
    const pesoAtual = animal.peso_atual ?? animal.pesoAtual ?? 0;

    setText('viewCodigo', animal.codigo);
    setText('viewNome', animal.nome);
    setText('viewEspecie', animal.especie);
    setText('viewRaca', animal.raca);
    setText('viewPelagem', animal.pelagem);
    setText('viewLote', animal.lote);
    setText('viewFinalidade', animal.finalidade);
    setText('viewGrauSangue', animal.grau_sangue || animal.grauSangue);
    setText('viewPeso', pesoAtual ? `${pesoAtual} kg` : '-');
    setText('viewIdade', calcularIdade(dataNasc));
    setText('viewStatus', animal.sexo);

    setDisplay('viewFemeaInfo', 'none');
    setDisplay('viewMachoInfo', 'none');
    setDisplay('viewNascimentosContainer', 'none');
    setDisplay('viewDescendentesContainer', 'none');

    const viewAbortosContainerExistente = document.getElementById('viewAbortosContainer');
    if (viewAbortosContainerExistente) viewAbortosContainerExistente.style.display = 'none';

    if (animal.sexo === 'Fêmea') {
        setDisplay('viewFemeaInfo', 'block');
        setText('viewCategoria', animal.categoria_reprodutiva || animal.categoriaReprodutiva);
        setText('viewECC', animal.ecc);
        setText('viewQtdCrias', animal.qtd_nascimentos ?? animal.qtdNascimentos ?? '0');
        setText('viewMae', animal.mae);
        setText('viewPai', animal.pai);

        const abortos = animal.abortos || [];
        setText('viewAborto', abortos.length > 0 ? `Sim (${abortos.length})` : 'Não');

        const femeaInfo = document.getElementById('viewFemeaInfo');
        if (femeaInfo) {
            let viewAbortosContainer = document.getElementById('viewAbortosContainer');
            if (!viewAbortosContainer) {
                viewAbortosContainer = document.createElement('div');
                viewAbortosContainer.id = 'viewAbortosContainer';
                viewAbortosContainer.className = 'info-block';
                const nascimentosBlock = document.getElementById('viewNascimentosContainer');
                if (nascimentosBlock) femeaInfo.insertBefore(viewAbortosContainer, nascimentosBlock);
                else femeaInfo.appendChild(viewAbortosContainer);
            }

            if (abortos.length > 0) {
                viewAbortosContainer.style.display = 'block';
                viewAbortosContainer.innerHTML = `
                    <p class="block-title"><i class="fa-solid fa-triangle-exclamation" style="color:#dc3545;"></i> Histórico de Abortos</p>
                    <div>
                        ${abortos.map((ab, i) => `
                            <div style="padding:8px;border-bottom:1px solid #e2e8f0;">
                                <strong>Aborto #${i + 1}</strong>
                                ${ab.data ? '<br>📅 Data: ' + ab.data : ''}
                                ${ab.diasGestacao ? '<br>🗓️ Dias de gestação: ' + ab.diasGestacao : ''}
                                ${(ab.causa || ab.macho) ? '<br>🔍 Causa/Reprodutor: ' + (ab.causa || ab.macho) : ''}
                                ${ab.observacoes ? '<br>📝 Obs: ' + ab.observacoes : ''}
                            </div>`).join('')}
                    </div>`;
            } else {
                viewAbortosContainer.style.display = 'none';
            }
        }

        const nascimentos = animal.nascimentos || [];
        if (nascimentos.length > 0) {
            setDisplay('viewNascimentosContainer', 'block');
            setHTML('viewListaNascimentos', nascimentos.map(n => `
                <div style="padding: 8px; border-bottom: 1px solid #e2e8f0;">
                    <strong>${n.numero}ª cria:</strong> ${n.data || 'Data não registrada'}
                    ${n.sexo ? `- ${n.sexo}` : ''}
                    ${n.pai ? `<br>👨 Pai: ${n.pai}` : ''}
                    ${n.peso ? `<br>⚖️ Peso: ${n.peso} kg` : ''}
                </div>`).join(''));
        }
    }

    if (animal.sexo === 'Macho') {
        setDisplay('viewMachoInfo', 'block');
        const tipoMap = { local: 'Reprodutor Local', laboratorio: 'Reprodutor de Laboratório', rufiao: 'Rufião', castrado: 'Castrado', ativo: 'Reprodutor Ativo' };
        const tipoReprodutor = animal.tipo_reprodutor || animal.tipoReprodutor;
        setText('viewTipoMacho', tipoMap[tipoReprodutor] || tipoReprodutor);
        setText('viewExameAndrologico', (animal.exame_andrologico || animal.exame_andrologico_dia || animal.exameAndrologicoDia) ? 'Sim - Apto' : 'Não ou Vencido');
        setText('viewECCMacho', animal.ecc_macho || animal.eccMacho);
        setText('viewQtdDescendentes', animal.qtd_descendentes ?? animal.qtdDescendentes ?? '0');
        setText('viewMaeMacho', animal.mae_macho || animal.maeMacho);
        setText('viewPaiMacho', animal.pai_macho || animal.paiMacho);
        setText('viewLaboratorio', animal.laboratorio);

        const descendentes = animal.descendentes || [];
        if (descendentes.length > 0) {
            setDisplay('viewDescendentesContainer', 'block');
            setHTML('viewListaDescendentes', descendentes.map(d => `
                <div style="padding: 8px; border-bottom: 1px solid #e2e8f0;">
                    <strong>${d.nome || `Descendente #${d.numero || '-'}`}</strong>
                    ${d.sexo ? `<br>🧬 Sexo: ${d.sexo}` : ''}
                    ${d.mae ? `<br>🐄 Mãe: ${d.mae}` : ''}
                    ${d.dataNascimento ? `<br>📅 Nascimento: ${d.dataNascimento}` : ''}
                </div>`).join(''));
        }
    }

    const doencas = animal.doencas || [];
    setHTML('viewListaDoencas', doencas.length > 0
        ? doencas.map(d => `
            <div style="padding: 8px; border-bottom: 1px solid #e2e8f0;">
                <strong>${d.nome}</strong>
                ${d.dataDiagnostico ? `<br>📅 Diagnóstico: ${d.dataDiagnostico}` : ''}
                ${d.tratou ? `<br>✅ Tratado em: ${d.dataTratamento || 'Data não registrada'}` : '<br>⚠️ Não tratado'}
                ${d.tipoTratamento ? `<br>💊 Tratamento: ${d.tipoTratamento}` : ''}
            </div>`).join('')
        : '<p style="color: #64748b;">Nenhuma doença registrada</p>');

    const modalVisualizar = document.getElementById('modalVisualizar');
    if (modalVisualizar) modalVisualizar.style.display = 'flex';
}

window.visualizarAnimal = visualizarAnimal;

// ============================================
// EDITAR ANIMAL
// ============================================
window.editarAnimal = function(id) {
    const animal = animais.find(a => String(a.id) === String(id));
    if (!animal) { mostrarMensagem('Animal não encontrado!', 'erro'); return; }

    const modalForm = document.getElementById('modalForm');
    const modalTitle = document.getElementById('modalTitle');
    const btnSalvar = document.getElementById('btnSalvar');

    modalTitle.innerText = 'Editar Animal';
    btnSalvar.innerText = 'Salvar Alterações';

    if (typeof limparFormulario === 'function') limparFormulario();

    // Dados básicos
    document.getElementById('formCodigo').value = animal.codigo || '';
    document.getElementById('formNome').value = animal.nome || '';
    document.getElementById('formEspecie').value = animal.especie || '';
    document.getElementById('buscaRaca').value = animal.raca || '';
    document.getElementById('formRaca').value = animal.raca || '';
    document.getElementById('formGrauSangue').value = animal.grau_sangue || animal.grauSangue || '';
    document.getElementById('formPelagem').value = animal.pelagem || '';
    document.getElementById('formDataNascimento').value = animal.data_nascimento || animal.dataNascimento || '';
    document.getElementById('formPesoNascer').value = animal.peso_nascer ?? animal.pesoNascer ?? '';
    document.getElementById('formPesoAtual').value = animal.peso_atual ?? animal.pesoAtual ?? '';
    document.getElementById('formSexo').value = animal.sexo || '';
    document.getElementById('formFinalidade').value = animal.finalidade || '';
    document.getElementById('formLote').value = animal.lote || '';
    document.getElementById('formObs').value = animal.observacoes || '';

    if (animal.data_nascimento || animal.dataNascimento) calcularIdadeAnimal();

    // Dispara change na espécie ANTES de preencher finalidade e raça,
    // para que atualizarFinalidadePorEspecie() popule as options primeiro.
    // Depois re-aplica os valores salvos por cima.
    const especieSelect = document.getElementById('formEspecie');
    const sexoSelect = document.getElementById('formSexo');
    if (especieSelect) especieSelect.dispatchEvent(new Event('change'));

    // Re-aplica raça e finalidade (o dispatchEvent acima os teria limpado)
    document.getElementById('buscaRaca').value = animal.raca || '';
    document.getElementById('formRaca').value = animal.raca || '';
    if (animal.raca) mostrarBadgeRacaSelecionada(animal.raca);
    document.getElementById('formFinalidade').value = animal.finalidade || '';

    toggleCamposPorSexo();
    if (sexoSelect) sexoSelect.dispatchEvent(new Event('change'));

    if (animal.sexo === 'Fêmea') {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('formCategoriaFemea', animal.categoria_reprodutiva || animal.categoriaReprodutiva);
        set('formECC', animal.ecc);
        set('formMae', animal.mae);
        set('formPai', animal.pai);

        // Histórico de aborto baseado nos registros da tabela relacional
        const abortos = animal.abortos || [];
        const temAborto = abortos.length > 0;
        set('formHistoricoAborto', temAborto ? 'sim' : 'nao');
        if (temAborto) {
            toggleCamposAborto();
            set('formQtdAbortos', abortos.length);
            setTimeout(() => {
                gerarCamposAborto();
                setTimeout(() => {
                    abortos.forEach((ab, i) => {
                        const n = i + 1;
                        const f = (s, v) => { const el = document.getElementById(s); if (el) el.value = v || ''; };
                        f(`abortoData_${n}`, ab.data);
                        f(`abortoMacho_${n}`, ab.causa || ab.macho);
                        f(`abortoDias_${n}`, ab.diasGestacao);
                        f(`abortoObs_${n}`, ab.observacoes);
                    });
                }, 150);
            }, 100);
        }

        const nascimentos = animal.nascimentos || [];
        const qtdCrias = nascimentos.length || animal.qtd_nascimentos || animal.qtdNascimentos || 0;
        const temCriasSelect = document.getElementById('formTemCrias');
        if (temCriasSelect) { temCriasSelect.value = qtdCrias > 0 ? 'sim' : 'nao'; if (typeof toggleCamposCrias === 'function') toggleCamposCrias(); }
        set('formQtdNascimentos', qtdCrias);

        if (qtdCrias > 0) {
            setTimeout(() => {
                gerarCamposNascimentos();
                setTimeout(() => {
                    nascimentos.forEach(n => {
                        const f = (s, v) => { const el = document.getElementById(s); if (el) el.value = v || ''; };
                        f(`nascimentoData_${n.numero}`, n.data);
                        f(`nascimentoSexo_${n.numero}`, n.sexo);
                        f(`nascimentoPai_${n.numero}`, n.pai);
                        f(`nascimentoPeso_${n.numero}`, n.peso);
                        f(`nascimentoObs_${n.numero}`, n.observacoes);
                    });
                }, 100);
            }, 100);
        }

        // Pré-selecionar doenças registradas
        const doencas = animal.doencas || [];
        if (doencas.length > 0) {
            setTimeout(() => {
                doencas.forEach(d => {
                    const cb = document.querySelector(`.doenca-checkbox[value="${d.nome.replace(/"/g, '&quot;')}"]`);
                    if (cb) {
                        cb.checked = true;
                        const id = d.nome.replace(/[^a-zA-Z0-9]/g, '_');
                        toggleDoencaDetalhes(cb, id);
                        setTimeout(() => {
                            const f = (s, v) => { const el = document.getElementById(s); if (el) el.value = v || ''; };
                            f(`dataDoenca_${id}`, d.dataDiagnostico);
                            f(`tratouDoenca_${id}`, d.tratou ? 'sim' : 'nao');
                            if (d.tratou) {
                                const sel = document.getElementById(`tratouDoenca_${id}`);
                                if (sel) toggleTratamentoCampos(sel, id);
                                f(`dataTratamento_${id}`, d.dataTratamento);
                                f(`tipoTratamento_${id}`, d.tipoTratamento);
                                f(`obsTratamento_${id}`, d.observacoesTratamento);
                            }
                        }, 100);
                    }
                });
            }, 200);
        }
    }

    if (animal.sexo === 'Macho') {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('formTipoMacho', animal.tipo_reprodutor || animal.tipoReprodutor);
        set('formExameAndrologico', (animal.exame_andrologico || animal.exame_andrologico_dia || animal.exameAndrologicoDia) ? 'sim' : 'nao');
        set('formECCMacho', animal.ecc_macho || animal.eccMacho);
        set('formMaeMacho', animal.mae_macho || animal.maeMacho);
        set('formPaiMacho', animal.pai_macho || animal.paiMacho);
        set('formLaboratorio', animal.laboratorio);

        const campoLab = document.getElementById('campoLaboratorio');
        if (campoLab) campoLab.style.display = (animal.tipo_reprodutor || animal.tipoReprodutor) === 'laboratorio' ? 'block' : 'none';

        const descendentes = animal.descendentes || [];
        const qtdDesc = descendentes.length || animal.qtd_descendentes || animal.qtdDescendentes || 0;
        const temDescSelect = document.getElementById('formTemDescendentes');
        if (temDescSelect) { temDescSelect.value = qtdDesc > 0 ? 'sim' : 'nao'; if (typeof toggleCamposDescendentes === 'function') toggleCamposDescendentes(); }
        set('formQtdDescendentes', qtdDesc);

        if (qtdDesc > 0) {
            setTimeout(() => {
                gerarCamposDescendentes();
                setTimeout(() => {
                    descendentes.forEach(d => {
                        const f = (s, v) => { const el = document.getElementById(s); if (el) el.value = v || ''; };
                        f(`descendenteNome_${d.numero}`, d.nome);
                        f(`descendenteSexo_${d.numero}`, d.sexo);
                        f(`descendenteMae_${d.numero}`, d.mae);
                        f(`descendenteData_${d.numero}`, d.dataNascimento);
                        f(`descendentePeso_${d.numero}`, d.pesoNascer);
                        f(`descendenteObs_${d.numero}`, d.observacoes);
                    });
                }, 100);
            }, 100);
        }

        // Pré-selecionar doenças do macho
        const doencas = animal.doencas || [];
        if (doencas.length > 0) {
            setTimeout(() => {
                doencas.forEach(d => {
                    const cb = document.querySelector(`.doenca-checkbox-macho[value="${d.nome.replace(/"/g, '&quot;')}"]`);
                    if (cb) {
                        cb.checked = true;
                        const id = 'macho_' + d.nome.replace(/[^a-zA-Z0-9]/g, '_');
                        toggleDoencaDetalhesMacho(cb, id);
                        setTimeout(() => {
                            const f = (s, v) => { const el = document.getElementById(s); if (el) el.value = v || ''; };
                            f(`dataDoencaMacho_${id}`, d.dataDiagnostico);
                            f(`tratouDoencaMacho_${id}`, d.tratou ? 'sim' : 'nao');
                            if (d.tratou) {
                                const sel = document.getElementById(`tratouDoencaMacho_${id}`);
                                if (sel) toggleTratamentoCamposMacho(sel, id);
                                f(`dataTratamentoMacho_${id}`, d.dataTratamento);
                                f(`tipoTratamentoMacho_${id}`, d.tipoTratamento);
                                f(`obsTratamentoMacho_${id}`, d.observacoesTratamento);
                            }
                        }, 100);
                    }
                });
            }, 200);
        }
    }

    window.animalEmEdicao = animal.id;
    if (modalForm) modalForm.style.display = 'flex';
};

// ============================================
// FECHAR MODAL
// ============================================
function fecharModalCadastroAnimal() {
    document.getElementById('modalForm').style.display = 'none';
    ['formCodigo','formNome','formEspecie','formRaca','formSexo'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const cf = document.getElementById('camposFemea'); if (cf) cf.style.display = 'none';
    const cm = document.getElementById('camposMacho'); if (cm) cm.style.display = 'none';
    if (typeof limparRacaSelecionada === 'function') limparRacaSelecionada();
}

function limparFormulario() {
    const inputs = document.getElementById('modalForm').querySelectorAll('input, select, textarea');
    inputs.forEach(input => input.value = '');
}

// ============================================
// CAMPOS DINÂMICOS
// ============================================

function toggleCamposPorSexo() {
    const sexo = document.getElementById('formSexo').value;
    const camposFemea = document.getElementById('camposFemea');
    const camposMacho = document.getElementById('camposMacho');
    const especie = document.getElementById('formEspecie').value;
    const sexoNorm = sexo ? sexo.trim().toLowerCase() : '';

    if (sexoNorm === 'fêmea' || sexoNorm === 'femea') {
        if (camposFemea) camposFemea.style.display = 'block';
        if (camposMacho) camposMacho.style.display = 'none';
        if (especie) atualizarListaDoencas();
    } else if (sexoNorm === 'macho') {
        if (camposFemea) camposFemea.style.display = 'none';
        if (camposMacho) camposMacho.style.display = 'block';
        if (especie) atualizarListaDoencasMacho();
    } else {
        if (camposFemea) camposFemea.style.display = 'none';
        if (camposMacho) camposMacho.style.display = 'none';
    }
}

function toggleCamposAborto() {
    const temAborto = document.getElementById('formHistoricoAborto').value;
    const subCampos = document.getElementById('subCamposAborto');
    if (temAborto === 'sim') {
        subCampos.style.display = 'block';
        gerarCamposAborto();
    } else {
        subCampos.style.display = 'none';
        document.getElementById('formQtdAbortos').value = 0;
        document.getElementById('listaAbortosContainer').innerHTML = '';
    }
}

function gerarCamposAborto() {
    const qtd = parseInt(document.getElementById('formQtdAbortos').value) || 0;
    const container = document.getElementById('listaAbortosContainer');
    if (qtd === 0) { container.innerHTML = '<p style="color:#64748b;font-size:13px;">Nenhum aborto registrado</p>'; return; }

    let html = '<div style="margin-top:15px;"><label style="font-weight:600;margin-bottom:10px;display:block;">Detalhes de cada aborto:</label>';
    for (let i = 1; i <= qtd; i++) {
        html += `
            <div class="sub-block" style="margin-bottom:15px;border-left-color:#dc3545;">
                <h4 style="color:#dc3545;">Aborto #${i}</h4>
                <div class="form-grid">
                    <div class="input-group"><label>Data do Aborto</label><input type="date" id="abortoData_${i}"></div>
                    <div class="input-group"><label>Reprodutor / Causa Suspeita</label><input type="text" id="abortoMacho_${i}" placeholder="Ex: Neosporose / Nome do touro" list="listaReprodutores"></div>
                </div>
                <div class="form-grid">
                    <div class="input-group"><label>Dias de Gestação</label><input type="number" id="abortoDias_${i}" min="0" max="300" placeholder="Ex: 120"></div>
                    <div class="input-group"><label>Observações</label><input type="text" id="abortoObs_${i}" placeholder="Detalhes adicionais..."></div>
                </div>
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function gerarCamposNascimentos() {
    const qtd = parseInt(document.getElementById('formQtdNascimentos').value) || 0;
    const container = document.getElementById('listaNascimentosContainer');
    if (qtd === 0) { container.innerHTML = '<p style="color:#64748b;font-size:13px;">Nenhuma cria registrada</p>'; return; }

    let html = '<div style="margin-top:15px;"><label style="font-weight:600;">Detalhes de cada cria:</label>';
    for (let i = 1; i <= qtd; i++) {
        html += `
            <div class="sub-block" style="margin-bottom:15px;">
                <h4>🐄 Cria #${i}</h4>
                <div class="form-grid">
                    <div class="input-group"><label>Data do Nascimento</label><input type="date" id="nascimentoData_${i}" onchange="calcularIdadeCria(${i})"><div id="idadeCria_${i}" class="help-text" style="color:#0d8a4f;"></div></div>
                    <div class="input-group"><label>Gênero da Cria</label><select id="nascimentoSexo_${i}"><option value="">Selecione...</option><option>Macho</option><option>Fêmea</option></select></div>
                </div>
                <div class="form-grid">
                    <div class="input-group"><label>Nome do Reprodutor (Pai)</label><input type="text" id="nascimentoPai_${i}" placeholder="Código/Nome" list="listaReprodutores"></div>
                    <div class="input-group"><label>Peso ao Nascer (kg)</label><input type="number" id="nascimentoPeso_${i}" step="0.1" placeholder="0.0"></div>
                </div>
                <div class="input-group"><label>Observações</label><input type="text" id="nascimentoObs_${i}" placeholder="Ex: Parto normal, gêmeos..."></div>
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function gerarCamposDescendentes() {
    const qtd = parseInt(document.getElementById('formQtdDescendentes').value) || 0;
    const container = document.getElementById('listaDescendentesContainer');
    if (qtd === 0) { container.innerHTML = '<p style="color:#64748b;font-size:13px;">Nenhum descendente registrado</p>'; return; }

    let html = '<div style="margin-top:15px;"><label style="font-weight:600;margin-bottom:10px;display:block;">📋 Informações dos Descendentes:</label>';
    for (let i = 1; i <= qtd; i++) {
        html += `
            <div class="sub-block" style="margin-bottom:15px;border-left:3px solid #0d8a4f;">
                <h4>🐄 Descendente #${i}</h4>
                <div class="form-grid">
                    <div class="input-group"><label>Nome/ID do Descendente</label><input type="text" id="descendenteNome_${i}" placeholder="Ex: BR2024-01"></div>
                    <div class="input-group"><label>Sexo</label><select id="descendenteSexo_${i}"><option value="">Selecione...</option><option>Macho</option><option>Fêmea</option></select></div>
                </div>
                <div class="form-grid">
                    <div class="input-group"><label>🐄 Nome da Mãe</label><input type="text" id="descendenteMae_${i}" placeholder="Código/Nome da mãe" list="listaMatrizes"></div>
                    <div class="input-group"><label>Data de Nascimento</label><input type="date" id="descendenteData_${i}"></div>
                </div>
                <div class="form-grid">
                    <div class="input-group"><label>Peso ao Nascer (kg)</label><input type="number" id="descendentePeso_${i}" step="0.1" placeholder="0.0"></div>
                    <div class="input-group"><label>Observações</label><input type="text" id="descendenteObs_${i}" placeholder="Ex: Gêmeos..."></div>
                </div>
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function toggleCamposCrias() {
    const temCrias = document.getElementById('formTemCrias').value;
    const camposQtd = document.getElementById('camposQuantidadeCrias');
    if (temCrias === 'sim') {
        camposQtd.style.display = 'block';
        const qtd = document.getElementById('formQtdNascimentos').value;
        if (qtd && parseInt(qtd) > 0) gerarCamposNascimentos();
    } else {
        camposQtd.style.display = 'none';
        document.getElementById('formQtdNascimentos').value = 0;
        document.getElementById('listaNascimentosContainer').innerHTML = '';
    }
}

function toggleCamposDescendentes() {
    const temDesc = document.getElementById('formTemDescendentes').value;
    const camposQtd = document.getElementById('camposQuantidadeDescendentes');
    if (temDesc === 'sim') {
        camposQtd.style.display = 'block';
        const qtd = document.getElementById('formQtdDescendentes').value;
        if (qtd && parseInt(qtd) > 0) gerarCamposDescendentes();
    } else {
        camposQtd.style.display = 'none';
        document.getElementById('formQtdDescendentes').value = 0;
        document.getElementById('listaDescendentesContainer').innerHTML = '';
    }
}

function toggleCamposReprodutor() {
    const tipo = document.getElementById('formTipoMacho').value;
    const campo = document.getElementById('campoLaboratorio');
    if (campo) {
        campo.style.display = tipo === 'laboratorio' ? 'block' : 'none';
        if (tipo !== 'laboratorio') document.getElementById('formLaboratorio').value = '';
    }
}

function toggleCamposNascimentosPorCategoria() {
    const categoria = document.getElementById('formCategoriaFemea').value;
    const subCampos = document.getElementById('subCamposNascimentos');
    if (!subCampos) return;
    if (categoria === 'primipara' || categoria === 'multipara') {
        subCampos.style.display = 'block';
        gerarCamposNascimentos();
    } else {
        subCampos.style.display = 'none';
        document.getElementById('listaNascimentosContainer').innerHTML = '';
    }
}

// ============================================
// DOENÇAS
// ============================================
function atualizarListaDoencas() {
    const especie = document.getElementById('formEspecie').value;
    const container = document.getElementById('listaDoencasContainer');
    if (!container) return;
    if (!especie) { container.innerHTML = '<p style="color:#64748b;font-size:13px;">Selecione espécie e sexo primeiro</p>'; return; }

    const doencas = bancoDoencas[especie]?.['Fêmea'] || [];
    if (doencas.length === 0) { container.innerHTML = '<p style="color:#64748b;font-size:13px;">Nenhuma doença cadastrada</p>'; return; }

    let html = '<div class="section-title" style="margin-top:10px;">Doenças Registradas</div><div class="form-grid" style="flex-direction:column;gap:15px;">';
    doencas.forEach(doenca => {
        const id = doenca.replace(/[^a-zA-Z0-9]/g, '_');
        html += `<div class="doenca-card" style="background:#f8fafc;border-radius:12px;padding:15px;border:1px solid #e2e8f0;">
            <label style="display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer;margin-bottom:10px;">
                <input type="checkbox" value="${doenca.replace(/"/g, '&quot;')}" class="doenca-checkbox" onchange="toggleDoencaDetalhes(this,'${id}')">
                ${doenca}
            </label>
            <div id="detalhes_${id}" style="display:none;margin-top:15px;padding-top:15px;border-top:1px solid #e2e8f0;">
                <div class="form-grid">
                    <div class="input-group"><label>Data do Diagnóstico</label><input type="date" id="dataDoenca_${id}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"></div>
                    <div class="input-group"><label>Já tratou?</label><select id="tratouDoenca_${id}" onchange="toggleTratamentoCampos(this,'${id}')" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"><option value="">Selecione...</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
                </div>
                <div id="tratamentoCampos_${id}" style="display:none;">
                    <div class="form-grid">
                        <div class="input-group"><label>Data do Tratamento</label><input type="date" id="dataTratamento_${id}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"></div>
                        <div class="input-group"><label>Tipo de Tratamento</label><input type="text" id="tipoTratamento_${id}" placeholder="Ex: Antibiótico..." style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"></div>
                    </div>
                    <div class="input-group"><label>Observações</label><textarea id="obsTratamento_${id}" rows="2" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"></textarea></div>
                </div>
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function atualizarListaDoencasMacho() {
    const especie = document.getElementById('formEspecie').value;
    const container = document.getElementById('listaDoencasContainerMacho');
    if (!container) return;
    if (!especie) { container.innerHTML = '<p style="color:#64748b;font-size:13px;">Selecione a espécie primeiro</p>'; return; }

    const doencas = bancoDoencas[especie]?.['Macho'] || [];
    if (doencas.length === 0) { container.innerHTML = '<p style="color:#64748b;font-size:13px;">Nenhuma doença cadastrada</p>'; return; }

    let html = '<div class="section-title" style="margin-top:10px;">Doenças Registradas (Macho)</div><div class="form-grid" style="flex-direction:column;gap:15px;">';
    doencas.forEach(doenca => {
        const id = 'macho_' + doenca.replace(/[^a-zA-Z0-9]/g, '_');
        html += `<div class="doenca-card" style="background:#f8fafc;border-radius:12px;padding:15px;border:1px solid #e2e8f0;">
            <label style="display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer;margin-bottom:10px;">
                <input type="checkbox" value="${doenca.replace(/"/g, '&quot;')}" class="doenca-checkbox-macho" onchange="toggleDoencaDetalhesMacho(this,'${id}')">
                ${doenca}
            </label>
            <div id="detalhes_${id}" style="display:none;margin-top:15px;padding-top:15px;border-top:1px solid #e2e8f0;">
                <div class="form-grid">
                    <div class="input-group"><label>Data do Diagnóstico</label><input type="date" id="dataDoencaMacho_${id}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"></div>
                    <div class="input-group"><label>Já tratou?</label><select id="tratouDoencaMacho_${id}" onchange="toggleTratamentoCamposMacho(this,'${id}')" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"><option value="">Selecione...</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
                </div>
                <div id="tratamentoCamposMacho_${id}" style="display:none;">
                    <div class="form-grid">
                        <div class="input-group"><label>Data do Tratamento</label><input type="date" id="dataTratamentoMacho_${id}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"></div>
                        <div class="input-group"><label>Tipo de Tratamento</label><input type="text" id="tipoTratamentoMacho_${id}" placeholder="Ex: Antibiótico..." style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"></div>
                    </div>
                    <div class="input-group"><label>Observações</label><textarea id="obsTratamentoMacho_${id}" rows="2" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"></textarea></div>
                </div>
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function toggleDoencaDetalhes(checkbox, id) {
    const el = document.getElementById(`detalhes_${id}`);
    if (el) el.style.display = checkbox.checked ? 'block' : 'none';
}
function toggleDoencaDetalhesMacho(checkbox, id) {
    const el = document.getElementById(`detalhes_${id}`);
    if (el) el.style.display = checkbox.checked ? 'block' : 'none';
}
function toggleTratamentoCampos(select, id) {
    const el = document.getElementById(`tratamentoCampos_${id}`);
    if (el) el.style.display = select.value === 'sim' ? 'block' : 'none';
}
function toggleTratamentoCamposMacho(select, id) {
    const el = document.getElementById(`tratamentoCamposMacho_${id}`);
    if (el) el.style.display = select.value === 'sim' ? 'block' : 'none';
}

function coletarDoencas() {
    const doencas = [];
    const especie = document.getElementById('formEspecie').value;
    if (!especie) return [];
    (bancoDoencas[especie]?.['Fêmea'] || []).forEach(doenca => {
        const id = doenca.replace(/[^a-zA-Z0-9]/g, '_');
        const cb = document.querySelector(`.doenca-checkbox[value="${doenca.replace(/"/g, '&quot;')}"]`);
        if (cb && cb.checked) {
            doencas.push({
                nome: doenca,
                dataDiagnostico: document.getElementById(`dataDoenca_${id}`)?.value || null,
                tratou: document.getElementById(`tratouDoenca_${id}`)?.value === 'sim',
                dataTratamento: document.getElementById(`dataTratamento_${id}`)?.value || null,
                tipoTratamento: document.getElementById(`tipoTratamento_${id}`)?.value || null,
                observacoesTratamento: document.getElementById(`obsTratamento_${id}`)?.value || null
            });
        }
    });
    return doencas;
}

function coletarDoencasMacho() {
    const doencas = [];
    const especie = document.getElementById('formEspecie').value;
    if (!especie) return [];
    (bancoDoencas[especie]?.['Macho'] || []).forEach(doenca => {
        const id = 'macho_' + doenca.replace(/[^a-zA-Z0-9]/g, '_');
        const cb = document.querySelector(`.doenca-checkbox-macho[value="${doenca.replace(/"/g, '&quot;')}"]`);
        if (cb && cb.checked) {
            doencas.push({
                nome: doenca,
                dataDiagnostico: document.getElementById(`dataDoencaMacho_${id}`)?.value || null,
                tratou: document.getElementById(`tratouDoencaMacho_${id}`)?.value === 'sim',
                dataTratamento: document.getElementById(`dataTratamentoMacho_${id}`)?.value || null,
                tipoTratamento: document.getElementById(`tipoTratamentoMacho_${id}`)?.value || null,
                observacoesTratamento: document.getElementById(`obsTratamentoMacho_${id}`)?.value || null
            });
        }
    });
    return doencas;
}

// ============================================
// SISTEMA DE RAÇAS
// ============================================
const racasPreDefinidas = {
    'Bovino': ['Nelore','Angus','Hereford','Gir','Brahman','Guzerá','Tabapuã','Senepol','Caracu','Holandês','Jersey','Girolando','Sindi','Bonsmara','Brangus','Braford','Canchim','Santa Gertrudes','Limousin','Charolês','Devon','Red Angus','Wagyu','Guerande','Normanda','Pardo Suíço','Lavínia'],
    'Ovino': ['Dorper','Santa Inês','Suffolk','Hampshire Down','Morada Nova','Bergamácia','Crioulo','Texel','Somalis Brasileira','Ile de France','Rabo Largo','Lacaune','Katahdin','White Dorper','Corriedale','Merino','Pantaneiro'],
    'Caprino': ['Boer','Saanen','Anglo-Nubiana','Parda Alpina','Toggenburg','Moxotó','Canindé','Marota','Repartida','Azul','Gurguéia','Bhuj','Kalahari Red']
};

function filtrarListaRacas(texto) {
    const especie = document.getElementById('formEspecie').value;
    const dropdown = document.getElementById('listaRacasResultados');
    const buscaInput = document.getElementById('buscaRaca');
    if (!especie) { if (dropdown) dropdown.style.display = 'none'; if (buscaInput) { buscaInput.placeholder = 'Selecione a espécie primeiro'; buscaInput.disabled = true; } return; }
    if (buscaInput) buscaInput.disabled = false;
    const todas = racasPreDefinidas[especie] || [];
    const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtradas = texto === '' ? todas : todas.filter(r => r.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(t));
    if (filtradas.length === 0) { dropdown.innerHTML = `<div class="raca-item" style="color:#dc3545;cursor:default;"><i class="fa-solid fa-circle-exclamation"></i> Nenhuma raça encontrada</div>`; dropdown.style.display = 'block'; return; }
    dropdown.innerHTML = filtradas.map(r => `<div class="raca-item" onclick="selecionarRaca('${r.replace(/'/g, "\\'")}')"><i class="fa-solid fa-paw" style="color:#0d8a4f;margin-right:8px;"></i>${r}</div>`).join('');
    dropdown.style.display = 'block';
}

function mostrarTodasRacas() {
    const especie = document.getElementById('formEspecie').value;
    const buscaInput = document.getElementById('buscaRaca');
    if (especie && buscaInput) filtrarListaRacas(buscaInput.value);
}

function selecionarRaca(raca) {
    const h = document.getElementById('formRaca'); if (h) h.value = raca;
    const b = document.getElementById('buscaRaca'); if (b) b.value = raca;
    const d = document.getElementById('listaRacasResultados'); if (d) d.style.display = 'none';
    mostrarBadgeRacaSelecionada(raca);
}

function mostrarBadgeRacaSelecionada(raca) {
    let badge = document.getElementById('racaSelecionadaBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'racaSelecionadaBadge';
        badge.className = 'raca-selecionada-badge';
        const container = document.querySelector('.raca-busca-container');
        if (container && container.parentNode) container.parentNode.insertBefore(badge, container.nextSibling);
    }
    badge.innerHTML = `<i class="fa-solid fa-check-circle"></i> Raça selecionada: ${raca}`;
    badge.style.display = 'block';
}

function limparRacaSelecionada() {
    const h = document.getElementById('formRaca'); if (h) h.value = '';
    const b = document.getElementById('buscaRaca'); if (b) b.value = '';
    const badge = document.getElementById('racaSelecionadaBadge'); if (badge) badge.style.display = 'none';
}

function atualizarRacasPorEspecie() {
    const especie = document.getElementById('formEspecie').value;
    const buscaInput = document.getElementById('buscaRaca');
    const dropdown = document.getElementById('listaRacasResultados');
    limparRacaSelecionada();
    if (!especie) {
        if (buscaInput) { buscaInput.placeholder = 'Selecione a espécie primeiro'; buscaInput.disabled = true; buscaInput.value = ''; }
        if (dropdown) dropdown.style.display = 'none';
    } else {
        if (buscaInput) { buscaInput.placeholder = 'Digite para buscar raça...'; buscaInput.disabled = false; buscaInput.value = ''; buscaInput.focus(); }
        filtrarListaRacas('');
    }
}

function atualizarFinalidadePorEspecie() {
    const especie = document.getElementById('formEspecie').value;
    const select = document.getElementById('formFinalidade');
    const finalidades = {
        'Bovino': ['Corte','Leite','Dupla Aptidão','Melhoramento Genético'],
        'Ovino': ['Corte','Lã','Leite','Couro','Dupla Aptidão'],
        'Caprino': ['Corte (Carne)','Leite','Couro','Dupla Aptidão']
    };
    select.innerHTML = '<option value="">Selecione uma finalidade...</option>';
    if (finalidades[especie]) {
        finalidades[especie].forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = f;
            select.appendChild(opt);
        });
    } else {
        select.innerHTML = '<option value="">Selecione uma espécie primeiro</option>';
    }
}

function buscarCriasPorPai() {
    const paiNome = document.getElementById('formPaiMacho')?.value;
    const container = document.getElementById('listaCriasMachoContainer');
    if (!container) return;
    if (!paiNome) { container.innerHTML = '<p style="color:#64748b;font-size:13px;">Digite o nome/código do pai para buscar suas crias</p>'; return; }
    const crias = animais.filter(a => {
        const p = a.pai || a.pai_macho || a.paiMacho;
        return p && p.includes(paiNome);
    });
    if (crias.length > 0) {
        let html = '<div class="sub-block"><h4>🐄 Crias/Descendentes Registrados</h4><div style="max-height:200px;overflow-y:auto;">';
        crias.forEach(c => {
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #e2e8f0;"><div><strong>${c.codigo}</strong> - ${c.nome || 'Sem nome'}<span style="color:#64748b;font-size:12px;margin-left:10px;">${calcularIdade(c.data_nascimento||c.dataNascimento)}</span></div><span style="background:#e2e8f0;padding:2px 8px;border-radius:20px;font-size:11px;">${c.sexo}</span></div>`;
        });
        html += '</div></div>';
        container.innerHTML = html;
    } else {
        container.innerHTML = '<p style="color:#64748b;font-size:13px;">Nenhuma cria encontrada para este pai</p>';
    }
}

// ============================================
// MODAIS DE MENSAGEM E CONFIRMAÇÃO
// ============================================
function mostrarMensagem(mensagem, tipo = 'info', titulo = '') {
    let modal = document.getElementById('modalMensagem');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalMensagem';
        modal.className = 'modal-confirmacao';
        modal.style.display = 'none';
        modal.innerHTML = `<div class="modal-confirmacao-content"><div class="modal-confirmacao-header" id="modalMensagemHeader"><i class="fa-solid fa-circle-info" style="font-size:24px;" id="modalMensagemIcone"></i><h3 id="modalMensagemTitulo">Atenção</h3></div><div class="modal-confirmacao-body"><p id="modalMensagemTexto">Mensagem aqui</p></div><div class="modal-confirmacao-footer" id="modalMensagemFooter"><button class="btn-confirmar-ok" id="btnOkMensagem"><i class="fa-solid fa-check"></i> OK</button></div></div>`;
        document.body.appendChild(modal);
    }
    const icone = document.getElementById('modalMensagemIcone');
    const tituloEl = document.getElementById('modalMensagemTitulo');
    const textoEl = document.getElementById('modalMensagemTexto');
    const header = document.getElementById('modalMensagemHeader');
    if (tipo === 'sucesso') { icone.className = 'fa-solid fa-check-circle'; icone.style.color = '#0d8a4f'; tituloEl.textContent = titulo || 'Sucesso!'; header.className = 'modal-confirmacao-header sucesso'; }
    else if (tipo === 'erro') { icone.className = 'fa-solid fa-circle-exclamation'; icone.style.color = '#dc3545'; tituloEl.textContent = titulo || 'Erro!'; header.className = 'modal-confirmacao-header erro'; }
    else if (tipo === 'aviso') { icone.className = 'fa-solid fa-triangle-exclamation'; icone.style.color = '#ff9800'; tituloEl.textContent = titulo || 'Atenção'; header.className = 'modal-confirmacao-header aviso'; }
    else { icone.className = 'fa-solid fa-circle-info'; icone.style.color = '#0d8a4f'; tituloEl.textContent = titulo || 'Informação'; header.className = 'modal-confirmacao-header'; }
    textoEl.textContent = mensagem;
    modal.style.display = 'flex';
    const btnOk = document.getElementById('btnOkMensagem');
    const close = () => { modal.style.display = 'none'; btnOk.removeEventListener('click', close); };
    btnOk.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
}

function mostrarConfirmacao(mensagem, onConfirm, onCancel) {
    let modal = document.getElementById('modalConfirmacao');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalConfirmacao';
        modal.className = 'modal-confirmacao';
        modal.style.display = 'none';
        modal.innerHTML = `<div class="modal-confirmacao-content"><div class="modal-confirmacao-header"><i class="fa-solid fa-triangle-exclamation" style="color:#dc3545;font-size:24px;"></i><h3>Confirmar Exclusão</h3></div><div class="modal-confirmacao-body"><p id="confirmacaoMensagem">Tem certeza?</p><p style="color:#64748b;font-size:14px;margin-top:8px;">Esta ação não pode ser desfeita!</p></div><div class="modal-confirmacao-footer"><button class="btn-confirmar-cancelar" id="btnCancelarExclusao"><i class="fa-solid fa-times"></i> Cancelar</button><button class="btn-confirmar-excluir" id="btnConfirmarExclusao"><i class="fa-solid fa-trash"></i> Sim, Excluir</button></div></div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('confirmacaoMensagem').textContent = mensagem;
    modal.style.display = 'flex';
    const btnC = document.getElementById('btnConfirmarExclusao').cloneNode(true);
    const btnX = document.getElementById('btnCancelarExclusao').cloneNode(true);
    document.getElementById('btnConfirmarExclusao').replaceWith(btnC);
    document.getElementById('btnCancelarExclusao').replaceWith(btnX);
    btnC.addEventListener('click', () => { modal.style.display = 'none'; if (onConfirm) onConfirm(); });
    btnX.addEventListener('click', () => { modal.style.display = 'none'; if (onCancel) onCancel(); });
    modal.addEventListener('click', e => { if (e.target === modal) { modal.style.display = 'none'; if (onCancel) onCancel(); } });
}

// ============================================
// BADGE DE FAZENDA NO HEADER
// ============================================

function atualizarBadgeFazendaHeader(fazenda) {
    const badge = document.getElementById('headerFazendaBadge');
    if (!badge) return;
    const textSpan = badge.querySelector('span');
    if (textSpan) textSpan.textContent = fazenda ? fazenda.nome : 'Nenhuma fazenda';
}

// ============================================
// INICIALIZAÇÃO DO DOM
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializa o sistema de fazendas via PotygenFazendaUI.
    // Isso carrega as fazendas, restaura a sessão, atualiza a sidebar
    // e abre o modal de cadastro se o usuário ainda não tiver fazenda.
    const fazendaAtiva = await PotygenFazendaUI.inicializar({
        onFazendaTrocada: (fazenda) => {
            // Recarrega os animais sempre que a fazenda mudar
            atualizarBadgeFazendaHeader(fazenda);
            carregarAnimais();
        }
    });

    // Atualiza badge do header com a fazenda inicial
    atualizarBadgeFazendaHeader(fazendaAtiva);

    // Carregar animais do Supabase ao iniciar
    carregarAnimais();

    // Fechar dropdown de raça ao clicar fora
    document.addEventListener('click', function(e) {
        const container = document.querySelector('.raca-busca-container');
        const dropdown = document.getElementById('listaRacasResultados');
        if (container && !container.contains(e.target) && dropdown) dropdown.style.display = 'none';
    });

    // Botão novo animal
    document.getElementById('btnNovoAnimal').addEventListener('click', () => {
        // Bloqueia cadastro se não houver fazenda selecionada
        const fazendaId = window.PotygenFazenda?.getFazendaId?.() || null;
        if (!fazendaId) {
            if (typeof mostrarMensagem === 'function') {
                mostrarMensagem(
                    'Você precisa cadastrar uma fazenda antes de cadastrar um animal. Clique no nome da fazenda na barra lateral para criar uma agora.',
                    'aviso',
                    'Nenhuma fazenda cadastrada'
                );
            } else {
                alert('Você precisa cadastrar uma fazenda antes de cadastrar um animal.');
            }
            // Abre o modal de cadastro de fazenda, se disponível
            if (window.PotygenFazendaUI?.abrirModalCadastrarFazenda) {
                setTimeout(() => window.PotygenFazendaUI.abrirModalCadastrarFazenda(), 400);
            }
            return;
        }

        window.animalEmEdicao = null;
        limparFormulario();
        document.getElementById('modalTitle').innerText = 'Cadastrar Novo Animal';
        document.getElementById('btnSalvar').innerText = 'Cadastrar Animal';
        document.getElementById('modalForm').style.display = 'flex';
    });

    // Botão salvar
    document.getElementById('btnSalvar').addEventListener('click', salvarAnimal);

    // Fechar modais
    document.querySelectorAll('.close, .btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalForm').style.display = 'none';
            document.getElementById('modalVisualizar').style.display = 'none';
        });
    });
    window.addEventListener('click', e => {
        if (e.target.className === 'modal') {
            document.getElementById('modalForm').style.display = 'none';
            document.getElementById('modalVisualizar').style.display = 'none';
        }
    });

    // Eventos do formulário
    document.getElementById('formEspecie').addEventListener('change', function() {
        atualizarFinalidadePorEspecie();
        atualizarRacasPorEspecie();
        const sexo = document.getElementById('formSexo').value;
        if (sexo === 'Fêmea') atualizarListaDoencas();
        else if (sexo === 'Macho') atualizarListaDoencasMacho();
    });

    document.getElementById('formSexo').addEventListener('change', function() {
        toggleCamposPorSexo();
        const especie = document.getElementById('formEspecie').value;
        if (especie) {
            if (this.value === 'Fêmea') atualizarListaDoencas();
            else if (this.value === 'Macho') atualizarListaDoencasMacho();
        }
    });

    document.getElementById('formCategoriaFemea').addEventListener('change', toggleCamposNascimentosPorCategoria);
    document.getElementById('formQtdNascimentos').addEventListener('input', gerarCamposNascimentos);
    document.getElementById('formHistoricoAborto').addEventListener('change', toggleCamposAborto);
    document.getElementById('formQtdAbortos').addEventListener('input', gerarCamposAborto);
    document.getElementById('formQtdDescendentes').addEventListener('input', gerarCamposDescendentes);
    document.getElementById('formPaiMacho')?.addEventListener('input', buscarCriasPorPai);

    // Filtros
    let especieSelecionada = 'todas';
    const dropdownBtn = document.getElementById('dropdownBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const selectedEspecieText = document.getElementById('selectedEspecie');

    if (dropdownBtn && dropdownMenu) {
        dropdownBtn.addEventListener('click', e => {
            e.stopPropagation();
            dropdownMenu.style.display = dropdownMenu.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', () => { dropdownMenu.style.display = 'none'; });
        document.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', function() {
                document.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
                this.classList.add('selected');
                selectedEspecieText.textContent = this.textContent;
                especieSelecionada = this.getAttribute('data-value');
                executarFiltroGeral();
            });
        }); 
    }

    document.getElementById('busca').addEventListener('input', executarFiltroGeral);

    function executarFiltroGeral() {
        const termo = document.getElementById('busca').value.toLowerCase();
        const filtrados = animais.filter(a => {
            const textoValido = (a.codigo||'').toLowerCase().includes(termo) ||
                ((a.nome||'').toLowerCase().includes(termo)) ||
                ((a.lote||'').toLowerCase().includes(termo)) ||
                ((a.pelagem||'').toLowerCase().includes(termo)) ||
                ((a.finalidade||'').toLowerCase().includes(termo)) ||
                ((a.raca||'').toLowerCase().includes(termo));
            const especieValida = especieSelecionada === 'todas' || a.especie === especieSelecionada;
            return textoValido && especieValida;
        });
        renderizarTabelaFiltrada(filtrados);
    }
});
