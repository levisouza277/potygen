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
