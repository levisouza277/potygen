(function initializeSavedTheme() {
    try {
        const isCadastroPage = window.location.pathname.endsWith('/cadastro.html');
        if (isCadastroPage) return;

        const isDark = localStorage.getItem('potygen_theme') === 'dark';
        if (isDark) document.documentElement.classList.add('dark-theme');
    } catch (_) {
        // localStorage pode estar indisponível em navegação privada restritiva.
    }
})();
