function formatPhone(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCpf(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

const telefoneInput = document.getElementById('telefone');
const cpfInput = document.getElementById('cpf');
telefoneInput?.addEventListener('input', () => {
    telefoneInput.value = formatPhone(telefoneInput.value);
});
cpfInput?.addEventListener('input', () => {
    cpfInput.value = formatCpf(cpfInput.value);
});

document.querySelectorAll('.eye-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
        const input = document.getElementById(toggle.dataset.target);
        const icon = toggle.querySelector('i');
        const showing = input.type === 'password';
        input.type = showing ? 'text' : 'password';
        toggle.setAttribute('aria-label', showing ? 'Esconder senha' : 'Mostrar senha');
        icon.classList.toggle('fa-eye', !showing);
        icon.classList.toggle('fa-eye-slash', showing);
        icon.classList.toggle('fa-regular', !showing);
        icon.classList.toggle('fa-solid', showing);
    });
});

const cidadeInput = document.getElementById('cidade');
const estadoInput = document.getElementById('estado');
const cidadeSugestoes = document.getElementById('cidadeSugestoes');
let cidades = [];
let cidadesCarregadas = false;

function normalizarTexto(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function atualizarSugestoes() {
    const busca = normalizarTexto(cidadeInput.value.trim());
    const filtradas = cidades
        .filter((cidade) => normalizarTexto(cidade.nome).startsWith(busca))
        .slice(0, 10);
    cidadeSugestoes.replaceChildren(...filtradas.map((cidade) => {
        const option = document.createElement('option');
        option.value = cidade.nome;
        return option;
    }));
}

async function carregarCidades() {
    if (cidadesCarregadas) return;
    const estado = estadoInput.value;
    const endpoint = estado
        ? `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estado}/municipios`
        : 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
    try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Não foi possível carregar as cidades.');
        cidades = await response.json();
        cidadesCarregadas = true;
        atualizarSugestoes();
    } catch (error) {
        console.warn('Sugestões de cidade indisponíveis:', error);
    }
}

cidadeInput?.addEventListener('focus', carregarCidades);
cidadeInput?.addEventListener('input', async () => {
    await carregarCidades();
    atualizarSugestoes();
});
estadoInput?.addEventListener('change', () => {
    cidades = [];
    cidadesCarregadas = false;
    cidadeSugestoes.replaceChildren();
});

const cadastroForm = document.getElementById('cadastroForm');
if (cadastroForm) {
    cadastroForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const email = document.getElementById('email').value.toLowerCase();
        const senha = document.getElementById('senha').value;
        const confirma = document.getElementById('confirmaSenha').value;
        const nome = document.getElementById('nome').value;
        const telefone = document.getElementById('telefone').value;
        const cpf = document.getElementById('cpf').value;
        const propriedade = document.getElementById('propriedade').value;
        const cidade = document.getElementById('cidade').value;
        const estado = document.getElementById('estado').value;
        const botao = document.querySelector('.btn-submit');
        let valid = true;

        if (!email.endsWith('@gmail.com')) {
            document.getElementById('emailError').style.display = 'block';
            valid = false;
        } else {
            document.getElementById('emailError').style.display = 'none';
        }

        if (senha !== confirma) {
            document.getElementById('senhaError').style.display = 'block';
            valid = false;
        } else {
            document.getElementById('senhaError').style.display = 'none';
        }

        if (!valid) return;

        botao.innerHTML = 'Criando conta...';

        const perfilPendente = {
            email,
            nome,
            telefone,
            cpf,
            propriedade,
            cidade,
            estado,
            tipo_usuario: 'produtor'
        };
        localStorage.setItem('potygen_perfil_pendente', JSON.stringify(perfilPendente));

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: senha,
            options: {
                data: {
                    nome,
                    telefone,
                    cpf,
                    propriedade,
                    cidade,
                    estado,
                    tipo_usuario: 'produtor'
                }
            }
        });

        if (error) {
            alert('Erro: ' + error.message);
            console.log(error);
            botao.innerHTML = 'Criar Minha Conta';
            return;
        }

        const usuario = data.user;

        if (data.session) {
            const { error: erroBanco } = await supabaseClient
                .from('usuarios')
                .upsert({
                    id: usuario.id,
                    nome,
                    email,
                    telefone,
                    cpf,
                    propriedade,
                    cidade,
                    estado,
                    tipo_usuario: 'produtor'
                }, { onConflict: 'id' });
            if (erroBanco) {
                alert('A conta foi criada, mas não foi possível salvar o perfil: ' + erroBanco.message);
                console.error(erroBanco);
                botao.innerHTML = 'Criar Minha Conta';
                return;
            }
            localStorage.removeItem('potygen_perfil_pendente');
        }

        alert(data.session
            ? 'Conta criada com sucesso!'
            : 'Conta criada! Verifique seu e-mail para confirmar o cadastro e depois faça login.');
        console.log(usuario);

        if (data.session) {
            sessionStorage.setItem('sessao_temporaria', 'true');
        }

        window.location.href = '../../index.html';

    });
}