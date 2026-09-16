/**
 * Navbar Script - Inicializa a interatividade da navbar
 */

function initNavbar() {
    console.log('🔧 navbar-script.js inicializando...');
    
    const toggleBtn = document.getElementById('navToggleBtn');
    const sidebar = document.getElementById('potygen-sidebar');
    const overlay = document.getElementById('navOverlay');
    const themeToggle = document.getElementById('themeToggleBtn');
    const navLogo = document.getElementById('navLogo');
    const mobileDashboardMenu = document.getElementById('dashboardMobileMenu');
    
    if (!toggleBtn || !sidebar) {
        console.error('❌ Elementos não encontrados:', { toggleBtn: !!toggleBtn, sidebar: !!sidebar });
        return false;
    }

    function applyTheme(isDark) {
        document.documentElement.classList.toggle('dark-theme', isDark);
        document.body.classList.toggle('dark-theme', isDark);

        if (navLogo) {
            navLogo.src = isDark ? '../assets/logo2.png' : '../assets/logo.png';
        }

        const mobileDashboardLogo = document.getElementById('mobileDashboardLogo');
        if (mobileDashboardLogo) {
            mobileDashboardLogo.src = isDark ? '../assets/logo02.jpeg' : '../assets/logo01.jpeg';
        }

        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            const label = themeToggle.querySelector('span');
            themeToggle.setAttribute('aria-pressed', String(isDark));
            themeToggle.setAttribute('aria-label', isDark ? 'Ativar tema claro' : 'Ativar tema escuro');
            if (icon) {
                icon.classList.toggle('fa-moon', !isDark);
                icon.classList.toggle('fa-sun', isDark);
            }
            if (label) label.textContent = isDark ? 'Modo claro' : 'Modo escuro';
        }
    }

    const savedTheme = localStorage.getItem('potygen_theme');
    applyTheme(savedTheme === 'dark');

    themeToggle?.addEventListener('click', () => {
        const isDark = !document.documentElement.classList.contains('dark-theme');
        localStorage.setItem('potygen_theme', isDark ? 'dark' : 'light');
        applyTheme(isDark);
    });
    
    console.log('✅ Elementos encontrados!');

    const carregarPerfilCabecalho = async () => {
        if (typeof supabaseClient === 'undefined') return false;
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return false;
        const { data: usuario } = await supabaseClient
            .from('usuarios')
            .select('nome')
            .eq('id', session.user.id)
            .maybeSingle();
        if (!usuario?.nome) return false;
        document.querySelectorAll('#userNameDisplay').forEach(element => { element.textContent = usuario.nome; });
        return true;
    };

    (async () => {
        for (let tentativa = 0; tentativa < 4; tentativa += 1) {
            if (await carregarPerfilCabecalho()) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    })();

    initSharedNotifications();
    
    const isDesktop = () => window.innerWidth > 1024;
    let lockedScrollY = 0;

    function lockPageScroll() {
        if (isDesktop()) return;
        lockedScrollY = window.scrollY;
        document.body.classList.add('nav-locked');
        document.body.style.top = `-${lockedScrollY}px`;
    }

    function unlockPageScroll() {
        if (isDesktop() || !document.body.classList.contains('nav-locked')) return;
        document.body.classList.remove('nav-locked');
        document.body.style.top = '';
        window.scrollTo(0, lockedScrollY);
    }
    
    function openSidebar() {
        sidebar.classList.add('nav-open');
        lockPageScroll();
        if (overlay && !isDesktop()) overlay.classList.add('visible');
    }
    
    function closeSidebar() {
        sidebar.classList.remove('nav-open');
        unlockPageScroll();
        if (overlay) overlay.classList.remove('visible');
    }
    
    function toggleSidebar() {
        sidebar.classList.contains('nav-open') ? closeSidebar() : openSidebar();
    }
    
    closeSidebar();
    
    // Botão toggle
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
    });
    mobileDashboardMenu?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
    });
    console.log('✅ Event listener do botão configurado');
    
    // Overlay
    if (overlay) {
        overlay.addEventListener('click', () => {
            if (!isDesktop()) closeSidebar();
        });
    }
    
    // Nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (!isDesktop()) setTimeout(closeSidebar, 150);
        });
    });
    
    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
        if (!isDesktop() && sidebar.classList.contains('nav-open') && 
            !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
            closeSidebar();
        }
    });

    // Nav items - Configuração de clique e identificação automática da página ativa
    const currentPath = window.location.pathname.split('/').pop();
    
    document.querySelectorAll('.potygen-nav .nav-item').forEach(item => {
        const itemHref = item.getAttribute('href');
        
        // Se o href do link for igual ao arquivo atual, adiciona a classe active
        if (itemHref === currentPath) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
        
        item.addEventListener('click', () => {
            if (!isDesktop()) setTimeout(closeSidebar, 150);
        });
    });
    
    window.potygenNavbarReady = true;
    console.log('✅ Navbar inicializada com sucesso!');
    return true;
}

function initSharedNotifications() {
    const bell = document.getElementById('notificationBell');
    if (!bell || document.getElementById('dashboardNotificationPopover')) return;

    const wrapper = bell.closest('.user-profile-with-bell');
    if (!wrapper) return;

    const oldDot = bell.querySelector('.bell-dot');
    if (oldDot) {
        oldDot.outerHTML = '<span class="bell-count" id="dashboardNotificationCount" hidden>0</span>';
    }

    const popover = document.createElement('div');
    popover.className = 'dashboard-notification-popover';
    popover.hidden = true;
    popover.innerHTML = `
        <div class="dashboard-notification-header">
            <div>
                <strong>Agenda de hoje</strong>
                <span id="dashboardNotificationDate"></span>
            </div>
            <button type="button" id="closeDashboardNotifications" aria-label="Fechar notificações">&times;</button>
        </div>
        <div class="dashboard-notification-list" id="dashboardNotificationList">
            <div class="dashboard-notification-empty">Carregando agenda...</div>
        </div>
        <a class="dashboard-notification-agenda" id="openTodayAgenda" href="agenda-reprodutiva.html">
            <i class="fa-solid fa-calendar-days"></i> Ver agenda do dia
        </a>`;
    wrapper.appendChild(popover);

    const close = () => { popover.hidden = true; };
    const toggle = async event => {
        event.stopPropagation();
        popover.hidden = !popover.hidden;
        if (!popover.hidden) await loadSharedNotifications();
    };
    bell.addEventListener('click', toggle);
    popover.querySelector('#closeDashboardNotifications').addEventListener('click', close);
    document.addEventListener('click', event => {
        if (!popover.hidden && !popover.contains(event.target) && !bell.contains(event.target)) close();
    });
    document.addEventListener('fazendaTrocada', loadSharedNotifications);
    document.addEventListener('fazendaInicializada', loadSharedNotifications);
    document.addEventListener('semFazenda', () => {
        const counter = bell.querySelector('#dashboardNotificationCount');
        if (counter) { counter.textContent = '0'; counter.hidden = true; }
        bell.setAttribute('aria-label', 'Notificações: nenhuma para hoje');
    });

    async function loadSharedNotifications(attempt = 0) {
        const list = popover.querySelector('#dashboardNotificationList');
        const counter = bell.querySelector('#dashboardNotificationCount');
        const today = new Date();
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        popover.querySelector('#dashboardNotificationDate').textContent = today.toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: '2-digit'
        });
        popover.querySelector('#openTodayAgenda').href = `agenda-reprodutiva.html?dia=${date}`;

        if (typeof supabaseClient === 'undefined') {
            const counter = bell.querySelector('#dashboardNotificationCount');
            if (counter) { counter.textContent = '0'; counter.hidden = true; }
            list.innerHTML = '<div class="dashboard-notification-empty">Notificações indisponíveis.</div>';
            return;
        }

        const farmId = window.PotygenFazenda?.getFazendaId?.();
        if (!farmId) {
            const counter = bell.querySelector('#dashboardNotificationCount');
            if (counter) { counter.textContent = '0'; counter.hidden = true; }
            list.innerHTML = '<div class="dashboard-notification-empty">Nenhuma fazenda selecionada.</div>';
            if (attempt < 20) setTimeout(() => loadSharedNotifications(attempt + 1), 250);
            return;
        }

        list.innerHTML = '<div class="dashboard-notification-empty">Carregando agenda...</div>';
        const { data, error } = await supabaseClient
            .from('agenda_reprodutiva')
            .select('femea_id, data_inseminacao, data_prevista_cio, data_cio_real, data_ultrassom, data_prevista_parto, data_parto_real, status, cio_confirmado, resultado_prenhez')
            .eq('fazenda_id', farmId);
        if (error) {
            const counter = bell.querySelector('#dashboardNotificationCount');
            if (counter) { counter.textContent = '0'; counter.hidden = true; }
            list.innerHTML = '<div class="dashboard-notification-empty">Não foi possível carregar a agenda.</div>';
            return;
        }

        const animalIds = [...new Set((data || []).map(item => item.femea_id).filter(Boolean))];
        let animals = [];
        if (animalIds.length) {
            const response = await supabaseClient.from('animais').select('id,codigo,nome').in('id', animalIds);
            animals = response.data || [];
        }
        const animalMap = Object.fromEntries(animals.map(animal => [animal.id, animal]));
        const items = [];
        (data || []).forEach(item => {
            const add = (field, type, title) => {
                if (item[field]?.slice(0, 10) === date) items.push({ type, title, animal: animalMap[item.femea_id] });
            };
            add('data_inseminacao', 'ins', 'Inseminação');
            if (item.cio_confirmado === null && !['Prenhe', 'Vazia', 'Aborto', 'Parto'].includes(item.status)) add('data_prevista_cio', 'cio', 'Possível cio');
            add('data_cio_real', 'cio', 'Cio confirmado');
            if (item.resultado_prenhez === null) add('data_ultrassom', 'ultrassom', 'Ultrassom');
            if (!item.data_parto_real && item.status !== 'Aborto') add('data_prevista_parto', 'parto', 'Parto previsto');
        });

        if (counter) {
            counter.textContent = items.length > 99 ? '99+' : String(items.length);
            counter.hidden = !items.length;
        }
        bell.setAttribute('aria-label', items.length ? `Notificações: ${items.length} para hoje` : 'Notificações: nenhuma para hoje');
        list.innerHTML = items.length
            ? items.map(item => {
                const name = item.animal?.codigo || item.animal?.nome || 'Animal sem identificação';
                return `<button type="button" class="dashboard-notification-item" data-agenda-date="${date}">
                    <span class="dashboard-notification-item-dot notification-dot-${item.type}"></span>
                    <span><strong>${item.title}</strong><small>${name}</small></span>
                    <i class="fa-solid fa-chevron-right"></i>
                </button>`;
            }).join('')
            : '<div class="dashboard-notification-empty"><i class="fa-solid fa-calendar-check"></i><span>Nenhum compromisso agendado para hoje.</span></div>';
        list.querySelectorAll('.dashboard-notification-item').forEach(item => {
            item.addEventListener('click', () => { window.location.href = `agenda-reprodutiva.html?dia=${item.dataset.agendaDate}`; });
        });
    }

    loadSharedNotifications();
}

// Aguarda navbar ser carregada
if (window.navbarLoaded) {
    initNavbar();
} else {
    document.addEventListener('navbarLoaded', initNavbar);
}

// Fallback
document.addEventListener('DOMContentLoaded', () => {
    if (!window.potygenNavbarReady && document.getElementById('potygen-sidebar')) {
        initNavbar();
    }
});
