/**
 * Navbar Script - Inicializa a interatividade da navbar
 */

function initNavbar() {
    console.log('🔧 navbar-script.js inicializando...');
    
    const toggleBtn = document.getElementById('navToggleBtn');
    const sidebar = document.getElementById('potygen-sidebar');
    const overlay = document.getElementById('navOverlay');
    
    if (!toggleBtn || !sidebar) {
        console.error('❌ Elementos não encontrados:', { toggleBtn: !!toggleBtn, sidebar: !!sidebar });
        return false;
    }
    
    console.log('✅ Elementos encontrados!');
    
    const isDesktop = () => window.innerWidth > 1024;
    
    function openSidebar() {
        sidebar.classList.add('nav-open');
        if (overlay && !isDesktop()) overlay.classList.add('visible');
    }
    
    function closeSidebar() {
        sidebar.classList.remove('nav-open');
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
