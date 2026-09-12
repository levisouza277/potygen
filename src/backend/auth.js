(async () => {

    const lembrarMe =
        localStorage.getItem(
            'potygen_lembrar_me'
        );

    const sessaoTemporaria =
        sessionStorage.getItem(
            'sessao_temporaria'
        );

    if (
        lembrarMe !== 'true' &&
        !sessaoTemporaria
    ) {

        await supabaseClient.auth.signOut();

    }

})();

async function verificarLogin() {

    const {
        data: { session }
    } = await supabaseClient.auth.getSession();

    if (!session) {

        window.location.replace(
            '../pages/index.html'
        );

        return false;
    }

    return true;
}

// Verifica automaticamente ao abrir a página
document.addEventListener(
    'DOMContentLoaded',
    async () => {

        await verificarLogin();

    }
);

// Monitora logout
supabaseClient.auth.onAuthStateChange(
    (event, session) => {

        console.log('Evento:', event);

        if (event === 'SIGNED_OUT') {

            window.location.replace(
                '../pages/index.html'
            );

        }

    }
);