/* ==========================================================================
   POTYGEN PRO - FAZENDA.JS
   Gerencia seleção, troca e cadastro de fazendas vinculadas ao usuário.
   Integrado ao fluxo de autenticação (auth.js).
   ========================================================================== */

// ============================================================
// ESTADO GLOBAL DA FAZENDA
// ============================================================

window.PotygenFazenda = {
    fazendaAtual: null,        // objeto da fazenda selecionada
    todasFazendas: [],         // lista de fazendas do usuário
    modoFiltro: 'fazenda',     // 'fazenda' | 'todas'

    getFazendaId() {
        return this.fazendaAtual?.id || null;
    },

    getFazendaNome() {
        return this.fazendaAtual?.nome || 'Nenhuma fazenda';
    },

    getTipoCriacao() {
        return this.fazendaAtual?.tipo_criacao || '';
    },

    getCidadeEstado() {
        const f = this.fazendaAtual;
        if (!f) return '';
        return [f.cidade, f.estado].filter(Boolean).join('/');
    }
};

// ============================================================
// CARREGAR FAZENDAS DO USUÁRIO
// ============================================================

async function carregarFazendasDoUsuario() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return [];

        const { data, error } = await supabaseClient
            .from('fazendas')
            .select('*')
            .eq('usuario_id', session.user.id)
            .eq('status', 'ativa')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Erro ao carregar fazendas:', error);
            return [];
        }

        window.PotygenFazenda.todasFazendas = data || [];
        return data || [];
    } catch (err) {
        console.error('Erro inesperado ao carregar fazendas:', err);
        return [];
    }
}

// ============================================================
// SELECIONAR / TROCAR FAZENDA
// ============================================================

function selecionarFazenda(fazenda) {
    window.PotygenFazenda.fazendaAtual = fazenda;
    window.PotygenFazenda.modoFiltro = 'fazenda';

    // Persiste no sessionStorage
    sessionStorage.setItem('fazenda_atual_id', fazenda.id);
    sessionStorage.setItem('fazenda_atual_json', JSON.stringify(fazenda));

    // Dispara evento para outras partes da página reagirem
    document.dispatchEvent(new CustomEvent('fazendaTrocada', { detail: fazenda }));
}

function restaurarFazendaSalva(fazendas) {
    const idSalvo = sessionStorage.getItem('fazenda_atual_id');

    if (idSalvo) {
        const encontrada = fazendas.find(f => f.id === idSalvo);
        if (encontrada) {
            window.PotygenFazenda.fazendaAtual = encontrada;
            return encontrada;
        }
    }

    // Padrão: primeira fazenda
    if (fazendas.length > 0) {
        window.PotygenFazenda.fazendaAtual = fazendas[0];
        sessionStorage.setItem('fazenda_atual_id', fazendas[0].id);
        return fazendas[0];
    }

    return null;
}

// ============================================================
// CADASTRAR NOVA FAZENDA
// ============================================================

async function cadastrarFazenda(dados) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Usuário não autenticado');

        const payload = {
            usuario_id: session.user.id,
            nome: dados.nome,
            tipo_criacao: dados.tipo_criacao,
            area_hectares: dados.area_hectares || null,
            telefone: dados.telefone || null,
            cep: dados.cep || null,
            endereco: dados.endereco || null,
            cidade: dados.cidade || null,
            estado: dados.estado || null,
            descricao: dados.descricao || null,
            status: 'ativa'
        };

        const { data, error } = await supabaseClient
            .from('fazendas')
            .insert([payload])
            .select()
            .single();

        if (error) throw error;

        // Adiciona à lista local e seleciona automaticamente
        window.PotygenFazenda.todasFazendas.push(data);
        selecionarFazenda(data);

        return { sucesso: true, fazenda: data };
    } catch (err) {
        console.error('Erro ao cadastrar fazenda:', err);
        return { sucesso: false, erro: err.message };
    }
}

// ============================================================
// BUSCAR DADOS DO USUÁRIO (nome/cpf para preencher modal)
// ============================================================

async function buscarDadosUsuario() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return null;

        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('nome, cpf, cidade, estado')
            .eq('id', session.user.id)
            .single();

        if (error) return null;
        return data;
    } catch {
        return null;
    }
}

// ============================================================
// VERIFICAR SE USUÁRIO TEM FAZENDA (usado no auth flow)
// ============================================================

async function verificarFazendaObrigatoria() {
    const fazendas = await carregarFazendasDoUsuario();

    if (fazendas.length === 0) {
        // Sem fazenda: abre modal de cadastro automaticamente
        document.dispatchEvent(new CustomEvent('semFazenda'));
        return false;
    }

    restaurarFazendaSalva(fazendas);
    return true;
}

// ============================================================
// ESTATÍSTICAS DA FAZENDA (para o dashboard)
// ============================================================

async function buscarEstatisticasFazenda(fazendaId, todasFazendas = false) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return null;

        let query = supabaseClient
            .from('animais')
            .select('id, especie, status, created_at, fazenda_id')
            .eq('usuario_id', session.user.id);

        if (!todasFazendas && fazendaId) {
            query = query.eq('fazenda_id', fazendaId);
        }

        const { data: animais, error } = await query;
        if (error) throw error;

        // Contagens por espécie
        const bovinos = animais.filter(a => a.especie?.toLowerCase().includes('bovin')).length;
        const ovinos  = animais.filter(a => a.especie?.toLowerCase().includes('ovin')).length;
        const caprinos = animais.filter(a => a.especie?.toLowerCase().includes('caprin')).length;
        const total = animais.length;

        // Inseminações do mês
        const inicioMes = new Date();
        inicioMes.setDate(1);
        inicioMes.setHours(0, 0, 0, 0);

        let queryInsem = supabaseClient
            .from('inseminacoes')
            .select('id, status, data_inseminacao, resultado_prenhez, femea_id')
            .eq('usuario_id', session.user.id)
            .gte('data_inseminacao', inicioMes.toISOString().split('T')[0]);

        if (!todasFazendas && fazendaId) {
            // Filtra inseminações pelos animais da fazenda
            const idsFemeas = animais.map(a => a.id);
            if (idsFemeas.length > 0) {
                queryInsem = queryInsem.in('femea_id', idsFemeas);
            }
        }

        const { data: inseminacoes } = await queryInsem;
        const totalInsem = inseminacoes?.length || 0;

        // Taxa de prenhez (inseminações com resultado positivo)
        let queryPrenhez = supabaseClient
            .from('inseminacoes')
            .select('id, resultado_prenhez')
            .eq('usuario_id', session.user.id)
            .not('resultado_prenhez', 'is', null);

        if (!todasFazendas && fazendaId) {
            const idsFemeas = animais.map(a => a.id);
            if (idsFemeas.length > 0) {
                queryPrenhez = queryPrenhez.in('femea_id', idsFemeas);
            }
        }

        const { data: diagnosticos } = await queryPrenhez;
        const totalDiag = diagnosticos?.length || 0;
        const positivosDiag = diagnosticos?.filter(d => d.resultado_prenhez === true).length || 0;
        const taxaPrenhez = totalDiag > 0 ? Math.round((positivosDiag / totalDiag) * 100) : 0;

        // Alertas (inseminações agendadas passadas)
        const hoje = new Date().toISOString().split('T')[0];
        let queryAlertas = supabaseClient
            .from('inseminacoes')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('status', 'Agendada')
            .lt('data_inseminacao', hoje);

        const { data: alertas } = await queryAlertas;
        const totalAlertas = alertas?.length || 0;

        return {
            total,
            bovinos,
            ovinos,
            caprinos,
            inseminacoesMes: totalInsem,
            taxaPrenhez,
            alertas: totalAlertas,
            percentBovinos: total > 0 ? Math.round((bovinos / total) * 100) : 0,
            percentOvinos: total > 0 ? Math.round((ovinos / total) * 100) : 0,
            percentCaprinos: total > 0 ? Math.round((caprinos / total) * 100) : 0,
        };
    } catch (err) {
        console.error('Erro ao buscar estatísticas:', err);
        return null;
    }
}

// ============================================================
// HISTÓRICO MENSAL (gráfico de linha - inseminações)
// ============================================================

async function buscarHistoricoMensal(fazendaId, meses = 6, todasFazendas = false) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return null;

        // Calcular data de início
        const dataInicio = new Date();
        dataInicio.setMonth(dataInicio.getMonth() - meses + 1);
        dataInicio.setDate(1);
        const dataInicioStr = dataInicio.toISOString().split('T')[0];

        // Buscar animais da fazenda para filtrar inseminações
        let idsAnimais = null;
        if (!todasFazendas && fazendaId) {
            const { data: animais } = await supabaseClient
                .from('animais')
                .select('id')
                .eq('usuario_id', session.user.id)
                .eq('fazenda_id', fazendaId);

            idsAnimais = animais?.map(a => a.id) || [];
        }

        let queryInsem = supabaseClient
            .from('inseminacoes')
            .select('data_inseminacao, status, resultado_prenhez')
            .eq('usuario_id', session.user.id)
            .gte('data_inseminacao', dataInicioStr)
            .order('data_inseminacao', { ascending: true });

        if (idsAnimais && idsAnimais.length > 0) {
            queryInsem = queryInsem.in('femea_id', idsAnimais);
        } else if (idsAnimais && idsAnimais.length === 0) {
            // Nenhum animal nessa fazenda
            return gerarHistoricoVazio(meses);
        }

        const { data: inseminacoes, error } = await queryInsem;
        if (error) throw error;

        // Agrupar por mês
        const mesesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        const labels = [];
        const totalInsem = [];
        const prenhez = [];

        for (let i = meses - 1; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const mes = d.getMonth();
            const ano = d.getFullYear();
            labels.push(mesesNomes[mes]);

            const doMes = (inseminacoes || []).filter(ins => {
                const dt = new Date(ins.data_inseminacao);
                return dt.getMonth() === mes && dt.getFullYear() === ano;
            });

            totalInsem.push(doMes.length);
            prenhez.push(doMes.filter(ins => ins.resultado_prenhez === true).length);
        }

        return { labels, inseminacoes: totalInsem, prenhez };
    } catch (err) {
        console.error('Erro ao buscar histórico:', err);
        return gerarHistoricoVazio(meses);
    }
}

function gerarHistoricoVazio(meses) {
    const mesesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const labels = [];
    for (let i = meses - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        labels.push(mesesNomes[d.getMonth()]);
    }
    return {
        labels,
        inseminacoes: new Array(meses).fill(0),
        prenhez: new Array(meses).fill(0)
    };
}

// ============================================================
// INICIALIZAR (chamado pelo auth.js após login verificado)
// ============================================================

window.inicializarFazenda = async function() {
    const fazendas = await carregarFazendasDoUsuario();
    const fazendaAtiva = restaurarFazendaSalva(fazendas);

    if (!fazendaAtiva && fazendas.length === 0) {
        document.dispatchEvent(new CustomEvent('semFazenda'));
    }

    return fazendaAtiva;
};