async function obterSessaoEstavel(tentativas = 4) {
    for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) return session;
        if (tentativa < tentativas - 1) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }
    return null;
}

async function verificarLogin() {
    const session = await obterSessaoEstavel();

    if (!session) {
        window.location.replace('../../index.html');
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
                '../../index.html'
            );

        }

    }
);