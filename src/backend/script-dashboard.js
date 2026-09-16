// ==========================================
// CONTROLE DE MENU MOBILE E UI
// ==========================================
function initializeMenuUI() {
    const sidebar = document.getElementById('sidebar') || document.getElementById('potygen-sidebar') || document.querySelector('.potygen-sidebar');
    const openBtn = document.getElementById('openMenu') || document.getElementById('navToggleBtn');
    const closeBtn = document.getElementById('closeMenu') || document.getElementById('navOverlay');

    if (openBtn && sidebar) {
        openBtn.addEventListener('click', () => { sidebar.classList.add('active'); });
    }
    if (closeBtn && sidebar) {
        closeBtn.addEventListener('click', () => { sidebar.classList.remove('active'); });
    }
    document.addEventListener('click', (e) => {
        if (!sidebar || !openBtn) return;
        if (window.innerWidth <= 850 &&
            sidebar.classList.contains('active') &&
            !sidebar.contains(e.target) &&
            !openBtn.contains(e.target)) {
            sidebar.classList.remove('active');
        }
    });

    renderizarGraficos();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMenuUI);
} else {
    initializeMenuUI();
}

// ==========================================
// CONTROLE DE MODAIS
// ==========================================
function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = 'auto'; }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
        document.body.style.overflow = 'auto';
    }
});

// ==========================================
// UTILITÁRIOS
// ==========================================
function mostrarToast(msg, tipo = 'success') {
    const t = document.getElementById('potyToast');
    if (!t) return;
    t.textContent = msg;
    t.className = `show ${tipo}`;
    setTimeout(() => { t.className = ''; }, 3500);
}

function updateChart(canvasId, type, labels, datasets, extraOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (dashboardCharts[canvasId]) {
        dashboardCharts[canvasId].destroy();
        delete dashboardCharts[canvasId];
    }
    const ctx = canvas.getContext('2d');
    dashboardCharts[canvasId] = new Chart(ctx, {
        type,
        data: { labels, datasets },
        options: Object.assign({
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 8 },
            plugins: { tooltip: { mode: 'index', intersect: false } }
        }, extraOptions)
    });
}

// ==========================================
// GRÁFICOS (CHART.JS) - dados de fallback
// ==========================================
const dashboardCharts = {};
let notificacoesDoDia = 0;

function renderizarGraficos() {
    organizarControlesCabecalhoMobile();
    initializeDashboardFilters();
    setupChartTypeSelection();
    setupDashboardFilterModal();
    setupNotificationButton();
    updateDashboardCharts();
}

function organizarControlesCabecalhoMobile() {
    const container = document.getElementById('dashboardMobileUserControls');
    const originalParent = document.querySelector('.dashboard-page-header > .welcome-actions');
    const controls = document.querySelector('.dashboard-mobile-user-controls .user-profile-with-bell, .dashboard-page-header .user-profile-with-bell');
    if (!container || !controls) return;

    if (!organizarControlesCabecalhoMobile.originalParent) {
        organizarControlesCabecalhoMobile.originalParent = originalParent || controls.parentElement;
        organizarControlesCabecalhoMobile.originalNextSibling = organizarControlesCabecalhoMobile.originalParent?.querySelector('.filter-action-row');
    }

    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const aplicarPosicao = () => {
        if (mobileQuery.matches) {
            if (controls.parentElement !== container) container.appendChild(controls);
            return;
        }

        const originalParent = organizarControlesCabecalhoMobile.originalParent;
        const originalNextSibling = organizarControlesCabecalhoMobile.originalNextSibling;
        if (originalParent && controls.parentElement !== originalParent) {
            originalParent.insertBefore(controls, originalNextSibling && originalNextSibling.parentElement === originalParent ? originalNextSibling : null);
        }
    };

    aplicarPosicao();
    if (!organizarControlesCabecalhoMobile.mediaListenerAdded) {
        mobileQuery.addEventListener('change', aplicarPosicao);
        organizarControlesCabecalhoMobile.mediaListenerAdded = true;
    }
}

function setupNotificationButton() {
    const notificationBell = document.getElementById('notificationBell');
    const popover = document.getElementById('dashboardNotificationPopover');
    if (!notificationBell || !popover) return;

    notificationBell.addEventListener('click', async (event) => {
        event.stopPropagation();
        popover.hidden = !popover.hidden;
        if (!popover.hidden) await carregarNotificacoesDoDia();
    });
    document.getElementById('closeDashboardNotifications')?.addEventListener('click', () => {
        popover.hidden = true;
    });
    document.addEventListener('click', event => {
        if (!popover.hidden && !popover.contains(event.target) && !notificationBell.contains(event.target)) {
            popover.hidden = true;
        }
    });

    const alertasCard = document.getElementById('alertasCard');
    const abrirAlertas = () => {
        if (popover.hidden) {
            popover.hidden = false;
            carregarNotificacoesDoDia();
        } else {
            popover.hidden = true;
        }
    };
    alertasCard?.addEventListener('click', abrirAlertas);
    alertasCard?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            abrirAlertas();
        }
    });
}

function atualizarCardAlertas(total) {
    const card = document.getElementById('statAlertas');
    if (card) {
        card.textContent = Number(total || 0).toLocaleString('pt-BR');
        card.classList.remove('loading');
    }
    const alertasCard = document.getElementById('alertasCard');
    if (alertasCard) alertasCard.setAttribute('aria-label', `${total || 0} alertas para hoje. Abrir alertas`);
}

function dataLocalISO() {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

function formatarDataNotificacao(dataISO) {
    return new Date(`${dataISO}T00:00:00`).toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: '2-digit'
    });
}

async function carregarNotificacoesDoDia() {
    const lista = document.getElementById('dashboardNotificationList');
    const contador = document.getElementById('dashboardNotificationCount');
    const notificationBell = document.getElementById('notificationBell');
    const dataHoje = dataLocalISO();
    const fazendaId = window.PotygenFazenda?.getFazendaId?.();
    const dataEl = document.getElementById('dashboardNotificationDate');
    const linkAgenda = document.getElementById('openTodayAgenda');
    if (dataEl) dataEl.textContent = formatarDataNotificacao(dataHoje);
    if (linkAgenda) linkAgenda.href = `agenda-reprodutiva.html?dia=${dataHoje}`;
    if (!lista) return;
    if (!fazendaId) {
        notificacoesDoDia = 0;
        atualizarCardAlertas(0);
        if (contador) { contador.textContent = '0'; contador.hidden = true; }
        if (notificationBell) notificationBell.setAttribute('aria-label', 'Notificações: nenhuma para hoje');
        lista.innerHTML = '<div class="dashboard-notification-empty">Nenhuma fazenda selecionada.</div>';
        return;
    }

    lista.innerHTML = '<div class="dashboard-notification-empty">Carregando agenda...</div>';
    const { data: eventos, error } = await supabaseClient
        .from('agenda_reprodutiva')
        .select('id, femea_id, data_inseminacao, data_prevista_cio, data_cio_real, data_ultrassom, data_prevista_parto, data_parto_real, status, cio_confirmado, resultado_prenhez')
        .eq('fazenda_id', fazendaId);
    if (error) {
        notificacoesDoDia = 0;
        atualizarCardAlertas(0);
        if (contador) { contador.textContent = '0'; contador.hidden = true; }
        if (notificationBell) notificationBell.setAttribute('aria-label', 'Notificações indisponíveis');
        lista.innerHTML = '<div class="dashboard-notification-empty">Não foi possível carregar a agenda.</div>';
        return;
    }

    const idsAnimais = [...new Set((eventos || []).map(item => item.femea_id).filter(Boolean))];
    let animais = [];
    if (idsAnimais.length) {
        const resposta = await supabaseClient.from('animais').select('id,codigo,nome').in('id', idsAnimais);
        animais = resposta.data || [];
    }
    const animaisMap = Object.fromEntries(animais.map(animal => [animal.id, animal]));
    const itens = [];
    const adicionar = (item, dataEvento, tipo, titulo) => {
        if (dataEvento?.slice(0, 10) === dataHoje) itens.push({ id: item.id, agendaId: item.id, tipo, titulo, animal: animaisMap[item.femea_id] });
    };
    (eventos || []).forEach(item => {
        if (item.data_inseminacao?.slice(0, 10) === dataHoje) adicionar(item, item.data_inseminacao, 'ins', 'Inseminação');
        if (item.data_prevista_cio?.slice(0, 10) === dataHoje && item.cio_confirmado === null && !['Prenhe', 'Vazia', 'Aborto', 'Parto'].includes(item.status)) adicionar(item, item.data_prevista_cio, 'cio', 'Possível cio');
        if (item.data_cio_real?.slice(0, 10) === dataHoje) adicionar(item, item.data_cio_real, 'cio', 'Cio confirmado');
        if (item.data_ultrassom?.slice(0, 10) === dataHoje && item.resultado_prenhez === null) adicionar(item, item.data_ultrassom, 'ultrassom', 'Ultrassom');
        if (item.data_prevista_parto?.slice(0, 10) === dataHoje && !item.data_parto_real && item.status !== 'Aborto') adicionar(item, item.data_prevista_parto, 'parto', 'Parto previsto');
    });

    if (!itens.length) {
        notificacoesDoDia = 0;
        atualizarCardAlertas(0);
        if (contador) { contador.textContent = '0'; contador.hidden = true; }
        if (notificationBell) notificationBell.setAttribute('aria-label', 'Notificações: nenhuma para hoje');
        lista.innerHTML = '<div class="dashboard-notification-empty"><i class="fa-solid fa-calendar-check"></i><span>Nenhum compromisso agendado para hoje.</span></div>';
        return;
    }
    if (contador) {
        contador.textContent = itens.length > 99 ? '99+' : String(itens.length);
        contador.hidden = false;
    }
    notificacoesDoDia = itens.length;
    atualizarCardAlertas(notificacoesDoDia);
    if (notificationBell) notificationBell.setAttribute('aria-label', `Notificações: ${itens.length} para hoje`);
    lista.innerHTML = itens.map(item => {
        const nome = item.animal?.codigo || item.animal?.nome || 'Animal sem identificação';
        return `<button type="button" class="dashboard-notification-item" data-agenda-date="${dataHoje}">
            <span class="dashboard-notification-item-dot notification-dot-${item.tipo}"></span>
            <span><strong>${item.titulo}</strong><small>${nome}</small></span>
            <i class="fa-solid fa-chevron-right"></i>
        </button>`;
    }).join('');
    lista.querySelectorAll('.dashboard-notification-item').forEach(item => {
        item.addEventListener('click', () => { window.location.href = `agenda-reprodutiva.html?dia=${item.dataset.agendaDate}`; });
    });
}

function initializeDashboardFilters() {
    const filterSelect = document.getElementById('dashboardFilter');
    const periodSelect = document.getElementById('dashboardPeriod');
    const viewSelect = document.getElementById('dashboardView');
    if (filterSelect) filterSelect.addEventListener('change', updateDashboardCharts);
    if (periodSelect) periodSelect.addEventListener('change', updateDashboardCharts);
    if (viewSelect) viewSelect.addEventListener('change', updateDashboardCharts);
}

function setupDashboardFilterModal() {
    const modal = document.getElementById('dashboardFiltersModal');
    const openBtn = document.getElementById('openDashboardFilters');
    const closeBtn = document.getElementById('closeDashboardFilters');
    const cancelBtn = document.getElementById('cancelDashboardFilters');
    const applyBtn = document.getElementById('applyDashboardFilters');

    if (openBtn) openBtn.addEventListener('click', () => abrirModal('dashboardFiltersModal'));
    if (closeBtn) closeBtn.addEventListener('click', () => fecharModal('dashboardFiltersModal'));
    if (cancelBtn) cancelBtn.addEventListener('click', () => fecharModal('dashboardFiltersModal'));
    if (applyBtn) applyBtn.addEventListener('click', () => {
        atualizarVisibilidadeGraficos();
        carregarDadosDashboard();
        fecharModal('dashboardFiltersModal');
    });
    if (modal) modal.addEventListener('click', (event) => {
        if (event.target === modal) fecharModal('dashboardFiltersModal');
    });
}

function setupChartTypeSelection() {
    document.querySelectorAll('.chart-checkboxes input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', () => {
            atualizarVisibilidadeGraficos();
            updateDashboardCharts();
        });
    });
    atualizarVisibilidadeGraficos();
}

function atualizarVisibilidadeGraficos() {
    document.querySelectorAll('.chart-card-box[data-chart]').forEach(card => {
        const chartType = card.getAttribute('data-chart');
        const checkbox = document.querySelector(`.chart-checkboxes input[value="${chartType}"]`);
        if (checkbox) card.classList.toggle('hidden', !checkbox.checked);
    });
}

function updateDashboardCharts() {
    // Chamada delegada ao carregarDadosDashboard se Supabase estiver disponível
    if (typeof carregarDadosDashboard === 'function') {
        carregarDadosDashboard();
    }
}

// ============================================================
// SIDEBAR FAZENDA / MODAIS DE FAZENDA
// → Movidos para fazenda-ui.js (reutilizável em todas as páginas)
// ============================================================

// ============================================================
// CARREGAR DADOS DO DASHBOARD (estatísticas + gráficos reais)
// ============================================================
async function carregarDadosDashboard() {
    if (typeof buscarEstatisticasFazenda !== 'function') return;

    atualizarVisibilidadeGraficos();
    const fazendaId = window.PotygenFazenda?.getFazendaId();
    const todasFaz  = document.getElementById('filterFazenda')?.value === 'todas';
    const meses     = parseInt(document.getElementById('dashboardPeriod')?.value || '6');
    const segmento  = document.getElementById('dashboardFilter')?.value || 'Todos';
    const visao     = document.getElementById('dashboardView')?.value || 'geral';

    definirTituloGrafico('line', 'Inseminações realizadas');
    definirTituloGrafico('bar', 'Produção por lote');
    definirTituloGrafico('doughnut', 'Distribuição de espécies');
    definirTituloGrafico('pie', 'Visão de espécies');

    if (visao === 'fazenda') return carregarGraficosPorFazenda();
    if (visao === 'economica') return carregarGraficosEconomicos(fazendaId, todasFaz, meses);
    if (visao === 'animais') {
        definirTituloGrafico('line', 'Histórico de inseminações');
        definirTituloGrafico('bar', 'Animais por espécie');
        definirTituloGrafico('doughnut', 'Distribuição do rebanho');
        definirTituloGrafico('pie', 'Participação por espécie');
    }

    ['statTotalAnimais','statTaxaPrenhez','statInseminacoes','statAlertas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = '—'; el.classList.add('loading'); }
    });

    const stats = await buscarEstatisticasFazenda(fazendaId, todasFaz);
    if (stats) {
        const setCard = (id, val) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = val; el.classList.remove('loading'); }
        };
        setCard('statTotalAnimais', stats.total.toLocaleString('pt-BR'));
        setCard('statTaxaPrenhez', stats.taxaPrenhez + '%');
        setCard('statInseminacoes', stats.inseminacoesMes.toLocaleString('pt-BR'));
        atualizarCardAlertas(notificacoesDoDia);

        const bovinos  = segmento === 'Todos' ? stats.bovinos  : (segmento === 'Bovinos'  ? stats.bovinos  : 0);
        const ovinos   = segmento === 'Todos' ? stats.ovinos   : (segmento === 'Ovinos'   ? stats.ovinos   : 0);
        const caprinos = segmento === 'Todos' ? stats.caprinos : (segmento === 'Caprinos' ? stats.caprinos : 0);

        updateChart('doughnutChart','doughnut',['Bovinos','Ovinos','Caprinos'],
            [{label:'Distribuição',data:[bovinos,ovinos,caprinos],backgroundColor:['#00b34e','#3b82f6','#ff9900'],borderColor:'#ffffff',borderWidth:2}],
            {cutout:'65%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:10}}}});

        updateChart('pieChart','pie',['Bovinos','Ovinos','Caprinos'],
            [{label:'Participação',data:[bovinos,ovinos,caprinos],backgroundColor:['#00b34e','#3b82f6','#ff9900']}],
            {plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:10}}}});

        updateChart('barChart','bar',['Bovinos','Ovinos','Caprinos'],
            [{label:'Animais',data:[bovinos,ovinos,caprinos],backgroundColor:['#00b34e','#3b82f6','#ff9900'],borderRadius:12,maxBarThickness:48}],
            {scales:{y:{beginAtZero:true}},plugins:{legend:{display:false}}});
    }

    if (typeof buscarHistoricoMensal !== 'function') return;
    const historico = await buscarHistoricoMensal(fazendaId, meses, todasFaz);
    if (historico) {
        updateChart('lineChart','line',historico.labels,[
            {label:'Inseminações',data:historico.inseminacoes,borderColor:'#00b34e',backgroundColor:'rgba(0,179,78,0.15)',fill:true,tension:0.35,pointRadius:4,pointBackgroundColor:'#0d8a4f'},
            {label:'Prenhez Confirmada',data:historico.prenhez,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',fill:true,tension:0.35,pointRadius:4,pointBackgroundColor:'#3b82f6'}
        ],{scales:{y:{beginAtZero:true}},plugins:{legend:{display:true,position:'bottom'}}});

        const radarCard = document.querySelector('[data-chart="radar"]');
        if (radarCard && !radarCard.classList.contains('hidden')) {
            updateChart('radarChart','radar',historico.labels,
                [{label:'Inseminações',data:historico.inseminacoes,borderColor:'#8a4fff',backgroundColor:'rgba(138,79,255,0.16)',pointBackgroundColor:'#8a4fff',pointBorderColor:'#fff'}],
                {scales:{r:{beginAtZero:true}},plugins:{legend:{display:false}}});
        }
    }
}

function definirTituloGrafico(tipo, titulo) {
    const card = document.querySelector(`[data-chart="${tipo}"] h3`);
    if (card) card.textContent = titulo;
}

async function obterUsuarioDashboard() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.user?.id || null;
}

async function carregarGraficosPorFazenda() {
    const usuarioId = await obterUsuarioDashboard();
    if (!usuarioId) return;

    const [{ data: fazendas, error: fazendasError }, { data: animais, error: animaisError }] = await Promise.all([
        supabaseClient.from('fazendas').select('id,nome').eq('usuario_id', usuarioId).eq('status', 'ativa').order('created_at'),
        supabaseClient.from('animais').select('fazenda_id,especie').eq('usuario_id', usuarioId)
    ]);
    if (fazendasError || animaisError) {
        mostrarToast('Não foi possível carregar os dados das fazendas.', 'error');
        return;
    }

    const nomes = (fazendas || []).map(f => f.nome);
    const totais = (fazendas || []).map(f => (animais || []).filter(a => a.fazenda_id === f.id).length);
    const especies = ['Bovinos', 'Ovinos', 'Caprinos'];
    const classificacoes = [
        ['bovino', 'bovina'],
        ['ovino', 'ovina'],
        ['caprino', 'caprina']
    ];
    const porEspecie = classificacoes.map(tipos => (animais || []).filter(a => {
        const especie = String(a.especie || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        return tipos.some(tipo => especie === tipo || especie.startsWith(`${tipo} `) || especie.startsWith(`${tipo}-`) || especie.startsWith(tipo.slice(0, -1)));
    }).length);

    definirTituloGrafico('line', 'Animais por fazenda');
    definirTituloGrafico('bar', 'Comparativo de rebanho');
    definirTituloGrafico('doughnut', 'Distribuição total por espécie');
    updateChart('lineChart', 'line', nomes, [{ label: 'Animais', data: totais, borderColor: '#00b34e', backgroundColor: 'rgba(0,179,78,.15)', fill: true, tension: .3 }], { scales: { y: { beginAtZero: true } } });
    updateChart('barChart', 'bar', nomes, [{ label: 'Animais', data: totais, backgroundColor: '#3b82f6', borderRadius: 8 }], { scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } });
    updateChart('doughnutChart', 'doughnut', especies, [{ label: 'Animais', data: porEspecie, backgroundColor: ['#00b34e', '#3b82f6', '#ff9900'] }], { cutout: '62%', plugins: { legend: { position: 'bottom' } } });
    updateChart('pieChart', 'pie', nomes, [{ label: 'Animais', data: totais, backgroundColor: ['#00b34e', '#3b82f6', '#ff9900', '#8a4fff'] }], { plugins: { legend: { position: 'bottom' } } });
    ['radar', 'polarArea', 'bubble', 'scatter'].forEach(tipo => {
        const card = document.querySelector(`[data-chart="${tipo}"]`);
        if (card) card.classList.add('hidden');
    });
}

async function carregarGraficosEconomicos(fazendaId, todasFaz, meses) {
    const usuarioId = await obterUsuarioDashboard();
    if (!usuarioId) return;

    let query = supabaseClient.from('transacoes').select('tipo,valor,data,fazenda_id').eq('usuario_id', usuarioId);
    if (!todasFaz && fazendaId) query = query.eq('fazenda_id', fazendaId);
    const { data: transacoes, error } = await query.order('data', { ascending: true });
    if (error) {
        mostrarToast('Não foi possível carregar a gestão econômica.', 'error');
        return;
    }

    const agora = new Date();
    const labels = [];
    const receitas = [];
    const despesas = [];
    for (let i = meses - 1; i >= 0; i -= 1) {
        const data = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
        const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        labels.push(data.toLocaleDateString('pt-BR', { month: 'short' }));
        const doMes = (transacoes || []).filter(t => String(t.data || '').slice(0, 7) === chave);
        receitas.push(doMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor || 0), 0));
        despesas.push(doMes.filter(t => t.tipo !== 'receita').reduce((s, t) => s + Number(t.valor || 0), 0));
    }

    definirTituloGrafico('line', 'Receitas e despesas');
    definirTituloGrafico('bar', 'Movimentação financeira');
    definirTituloGrafico('doughnut', 'Composição financeira');
    updateChart('lineChart', 'line', labels, [
        { label: 'Receitas', data: receitas, borderColor: '#00b34e', backgroundColor: 'rgba(0,179,78,.12)', fill: true, tension: .3 },
        { label: 'Despesas', data: despesas, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.10)', fill: true, tension: .3 }
    ], { scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } });
    updateChart('barChart', 'bar', labels, [
        { label: 'Receitas', data: receitas, backgroundColor: '#00b34e', borderRadius: 6 },
        { label: 'Despesas', data: despesas, backgroundColor: '#dc2626', borderRadius: 6 }
    ], { scales: { y: { beginAtZero: true } } });
    updateChart('doughnutChart', 'doughnut', ['Receitas', 'Despesas'], [{ label: 'Valor', data: [receitas.reduce((a, b) => a + b, 0), despesas.reduce((a, b) => a + b, 0)], backgroundColor: ['#00b34e', '#dc2626'] }], { cutout: '62%', plugins: { legend: { position: 'bottom' } } });
    ['pie', 'radar', 'polarArea', 'bubble', 'scatter'].forEach(tipo => {
        const card = document.querySelector(`[data-chart="${tipo}"]`);
        if (card) card.classList.add('hidden');
    });
}

// ============================================================
// INICIALIZAÇÃO GLOBAL (fazenda + dashboard)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Só executa lógica Supabase se supabaseClient estiver disponível
    if (typeof supabaseClient === 'undefined') return;

    // Carrega nome do usuário na sidebar
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: usuario } = await supabaseClient
            .from('usuarios').select('nome').eq('id', session.user.id).single();
        if (usuario) {
            const el = document.getElementById('userNameDisplay');
            if (el) el.textContent = usuario.nome;
        }
    }

    // Inicializa o sistema de fazendas via fazenda-ui.js
    // onFazendaTrocada: callback chamado sempre que a fazenda mudar (troca ou cadastro)
    await PotygenFazendaUI.inicializar({
        onFazendaTrocada: () => {
            carregarDadosDashboard();
            carregarNotificacoesDoDia();
        }
    });

    // Carrega dados do dashboard se já houver fazenda ativa
    if (window.PotygenFazenda?.fazendaAtual) {
        carregarDadosDashboard();
        carregarNotificacoesDoDia();
    }

    // Fecha modais específicos do dashboard com Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['dashboardFiltersModal', 'modalNovoAnimal'].forEach(fecharModal);
        }
    });
});