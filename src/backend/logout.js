function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');

    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', async () => {
        const confirmar = confirm('Deseja sair da conta?');

        if (!confirmar) return;

        localStorage.removeItem('potygen_lembrar_me');
        sessionStorage.removeItem('sessao_temporaria');

        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            console.error(error);
            alert('Erro ao sair.');
            return;
        }

        window.location.href = '../pages/index.html';
    });
}

// Aguarda a navbar ser carregada dinamicamente
document.addEventListener('navbarLoaded', setupLogout);

// Fallback para DOMContentLoaded (para compatibilidade)
document.addEventListener('DOMContentLoaded', setupLogout);