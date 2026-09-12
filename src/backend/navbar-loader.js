/**
 * Navbar Loader - Carrega o componente navbar.html dinamicamente
 * Este arquivo injeta o HTML da navbar em todas as páginas
 */

function loadNavbar() {
    console.log('🚀 navbar-loader.js inicializado');
    
    // Verifica se o navbar já foi carregado
    if (document.getElementById('potygen-sidebar')) {
        console.log('✅ Navbar já existia no DOM');
        window.navbarLoaded = true;
        setTimeout(() => {
            const event = new CustomEvent('navbarLoaded');
            document.dispatchEvent(event);
        }, 0);
        return;
    }

    // Cria um contenedor para a navbar
    const navContainer = document.createElement('div');
    navContainer.id = 'navbar-container';

    // Insere o contenedor no início do body
    document.body.insertAdjacentElement('afterbegin', navContainer);
    console.log('📦 Contenedor criado e inserido no DOM');

    // Path simples e direto que funciona em tudo
    const navbarPath = '../pages/navbar.html';
    
    console.log('🔗 Tentando carregar navbar de:', navbarPath);
    
    fetch(navbarPath)
        .then(response => {
            console.log('📡 Resposta recebida:', response.status);
            if (!response.ok) {
                console.error('❌ Erro HTTP:', response.status);
                throw new Error(`HTTP ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            console.log('✅ HTML da navbar recebido');
            navContainer.innerHTML = html;

            setTimeout(() => {
                window.navbarLoaded = true;
                const btn = document.getElementById('navToggleBtn');
                console.log('✅ Navbar injetada! Botão encontrado:', !!btn);
                
                const event = new CustomEvent('navbarLoaded');
                document.dispatchEvent(event);
            }, 50);
        })
        .catch(error => {
            console.error('❌ Erro ao carregar navbar:', error);
        });
}

// Executa quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavbar);
} else {
    loadNavbar();
}
