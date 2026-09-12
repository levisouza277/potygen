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

function renderizarGraficos() {
    initializeDashboardFilters();
    setupChartTypeSelection();
    setupDashboardFilterModal();
    setupNotificationButton();
    updateDashboardCharts();
}

function setupNotificationButton() {
    const notificationBell = document.getElementById('notificationBell');
    if (!notificationBell) return;
    notificationBell.addEventListener('click', () => {
        console.log('Notificações clicadas');
    });
}

function initializeDashboardFilters() {
    const filterSelect = document.getElementById('dashboardFilter');
    const periodSelect = document.getElementById('dashboardPeriod');
    if (filterSelect) filterSelect.addEventListener('change', updateDashboardCharts);
    if (periodSelect) periodSelect.addEventListener('change', updateDashboardCharts);
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

    const fazendaId = window.PotygenFazenda?.getFazendaId();
    const todasFaz  = document.getElementById('filterFazenda')?.value === 'todas';
    const meses     = parseInt(document.getElementById('dashboardPeriod')?.value || '6');
    const segmento  = document.getElementById('dashboardFilter')?.value || 'Todos';

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
        setCard('statAlertas', stats.alertas.toLocaleString('pt-BR'));

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
        onFazendaTrocada: () => carregarDadosDashboard()
    });

    // Carrega dados do dashboard se já houver fazenda ativa
    if (window.PotygenFazenda?.fazendaAtual) {
        carregarDadosDashboard();
    }

    // Fecha modais específicos do dashboard com Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['dashboardFiltersModal', 'modalNovoAnimal'].forEach(fecharModal);
        }
    });
});