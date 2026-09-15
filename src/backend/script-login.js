const eyeToggle = document.querySelector('.eye-toggle');
if (eyeToggle) {
    eyeToggle.addEventListener('click', function () {
        const senhaInput = document.getElementById('senha');
        const icon = this.querySelector('i');
        
        if (senhaInput.type === 'password') {
            senhaInput.type = 'text';
            icon.classList.replace('fa-regular', 'fa-solid');
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            senhaInput.type = 'password';
            icon.classList.replace('fa-solid', 'fa-regular');
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
}

(async () => {

    const {
        data: { session }
    } = await supabaseClient.auth.getSession();

    if (session) {

        window.location.href =
            'src/pages/dashboard.html';

    }

})();

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('email').value.toLowerCase();
        const senha = document.getElementById('senha').value;
        const lembrarMe = document.getElementById('lembrarMe').checked;
        const errorSpan = document.getElementById('emailError');
        const botao = document.querySelector('.btn-submit');

        // Validação simples de e-mail @gmail.com
        if (!email.endsWith('@gmail.com')) {
            errorSpan.style.display = 'block';
            return;
        }

        errorSpan.style.display = 'none';
        const textoOriginal = botao.innerHTML;
        botao.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Entrando...';
        botao.disabled = true;

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: senha
            });

            if (error) {
                alert('Erro ao entrar: ' + error.message);
                botao.innerHTML = textoOriginal;
                botao.disabled = false;
                return;
            }

            // =====================================
            // LEMBRAR-ME
            // =====================================

            if (lembrarMe) {

                localStorage.setItem(
                    'potygen_lembrar_me',
                    'true'
                );

            } else {

                localStorage.removeItem(
                    'potygen_lembrar_me'
                );

                sessionStorage.setItem(
                    'sessao_temporaria',
                    'true'
                );

            }
            console.log('Sucesso:', data);

            let perfil = data.user.user_metadata;
            if (!perfil?.nome) {
                try {
                    const perfilSalvo = JSON.parse(localStorage.getItem('potygen_perfil_pendente'));
                    if (perfilSalvo?.email === data.user.email) perfil = perfilSalvo;
                } catch (erroLeitura) {
                    console.warn('Perfil pendente inválido:', erroLeitura);
                }
            }

            if (perfil?.nome) {
                const { error: erroPerfil } = await supabaseClient
                    .from('usuarios')
                    .upsert({
                        id: data.user.id,
                        nome: perfil.nome,
                        email: data.user.email,
                        telefone: perfil.telefone,
                        cpf: perfil.cpf,
                        propriedade: perfil.propriedade,
                        cidade: perfil.cidade,
                        estado: perfil.estado,
                        tipo_usuario: perfil.tipo_usuario || 'produtor'
                    }, { onConflict: 'id' });

                if (erroPerfil) {
                    console.error('Erro ao salvar perfil:', erroPerfil);
                    alert('Login realizado, mas não foi possível carregar o perfil: ' + erroPerfil.message);
                    return;
                }

                localStorage.removeItem('potygen_perfil_pendente');
            }

            window.location.href = 'src/pages/dashboard.html';

        } catch (err) {
            console.error('Erro inesperado:', err);
            botao.innerHTML = textoOriginal;
            botao.disabled = false;
        }
    });
}
const esqueciSenha =
    document.getElementById(
        'esqueciSenha'
    );

esqueciSenha.addEventListener(
    'click',
    async (e) => {

        e.preventDefault();

        const email =
            document.getElementById('email')
            .value
            .trim()
            .toLowerCase();

        if (!email) {
            alert('Digite seu e-mail primeiro.');
            return;
        }

        const { error } =
            await supabaseClient.auth
            .resetPasswordForEmail(
                email,
                {
                    redirectTo: new URL(
                        'src/pages/esqueceusenha.html',
                        window.location.origin + '/'
                    ).href
                }
            );

        if (error) {
            alert('Erro: ' + error.message);
            return;
        }

        alert('Link enviado para seu e-mail.');
    }
);