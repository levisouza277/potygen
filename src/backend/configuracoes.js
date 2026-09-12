// ============================================
// CONFIGURAÇÕES — integrado ao Supabase + Sistema de Fazendas
// ============================================
//
// Requer (carregados na página antes deste script):
//   - @supabase/supabase-js
//   - database.js  (cria supabaseClient)
//   - auth.js      (verifica sessão e logout)
//   - fazenda.js   (PotygenFazenda + funções globais)
//   - fazenda-ui.js (PotygenFazendaUI + modais)
//
// OBS sobre EXCLUSÃO DE CONTA:
//   Com a chave anon do cliente NÃO é possível apagar a linha de auth.users.
//   A função abaixo chama uma RPC SECURITY DEFINER chamada `excluir_minha_conta`
//   que deve existir no banco. SQL sugerido:
//
//     create or replace function public.excluir_minha_conta()
//     returns void
//     language plpgsql
//     security definer
//     set search_path = public
//     as $$
//     begin
//       if auth.uid() is null then
//         raise exception 'Não autenticado';
//       end if;
//       delete from auth.users where id = auth.uid();
//       -- a cascade FK em public.usuarios remove o perfil
//     end;
//     $$;
//     revoke all on function public.excluir_minha_conta() from public;
//     grant execute on function public.excluir_minha_conta() to authenticated;
//
//   Se a RPC não existir, fazemos fallback removendo apenas a linha de
//   public.usuarios e deslogando (a conta auth fica órfã).

// ============================================
// TOAST
// ============================================
function mostrarToast(mensagem, tipo = 'success') {
    const toast = document.getElementById('toast');
    const toastBox = document.getElementById('toast-box');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = mensagem;
    if (toastBox) {
        toastBox.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-blue-600');
        if (tipo === 'error') toastBox.classList.add('bg-red-600');
        else if (tipo === 'info') toastBox.classList.add('bg-blue-600');
        else toastBox.classList.add('bg-emerald-600');
    }
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.transform = 'translateY(-100px)';
        toast.style.opacity = '0';
    }, 3000);
}

// ============================================
// MODAIS GENÉRICOS (usados por fazenda-ui.js também)
// ============================================
function abrirModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.style.display = 'flex';
        m.classList.add('aberto');
    }
}
function fecharModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.style.display = 'none';
        m.classList.remove('aberto');
    }
}

// ============================================
// ABAS
// ============================================
function switchTab(tabName) {
    const panelInfo = document.getElementById('panel-info');
    const panelSecurity = document.getElementById('panel-security');
    const tabInfo = document.getElementById('tab-info');
    const tabSecurity = document.getElementById('tab-security');

    const activeClasses = ['border-emerald-600', 'text-emerald-600', 'bg-emerald-50'];
    const inactiveClasses = ['border-gray-200', 'text-gray-700', 'bg-white'];

    if (tabName === 'info') {
        panelInfo.classList.remove('hidden');
        panelSecurity.classList.add('hidden');
        tabInfo.classList.remove(...inactiveClasses);
        tabInfo.classList.add(...activeClasses);
        tabSecurity.classList.remove(...activeClasses);
        tabSecurity.classList.add(...inactiveClasses);
    } else {
        panelInfo.classList.add('hidden');
        panelSecurity.classList.remove('hidden');
        tabSecurity.classList.remove(...inactiveClasses);
        tabSecurity.classList.add(...activeClasses);
        tabInfo.classList.remove(...activeClasses);
        tabInfo.classList.add(...inactiveClasses);
    }
}

// ============================================
// CARREGAR DADOS DO USUÁRIO
// ============================================
async function carregarDadosUsuario() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        // Email vem da sessão auth
        const emailLabel = document.getElementById('emailAtualLabel');
        if (emailLabel) emailLabel.textContent = session.user.email || '—';

        // Restante vem da tabela usuarios
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error) {
            console.error('Erro ao carregar usuário:', error);
            return;
        }
        if (!data) return;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('infNome', data.nome);
        set('infTipoUsuario', data.tipo_usuario);
        set('infTelefone', data.telefone);
        set('infCpf', data.cpf);
        set('infPropriedade', data.propriedade);
        set('infCidade', data.cidade);
        set('infEstado', data.estado);
    } catch (err) {
        console.error('Erro inesperado:', err);
    }
}

// ============================================
// SALVAR INFORMAÇÕES PESSOAIS
// ============================================
async function salvarInformacoes(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Sessão expirada');

        const payload = {
            nome:        document.getElementById('infNome').value.trim(),
            telefone:    document.getElementById('infTelefone').value.trim() || null,
            propriedade: document.getElementById('infPropriedade').value.trim() || null,
            cidade:      document.getElementById('infCidade').value.trim() || null,
            estado:      document.getElementById('infEstado').value || null,
            updated_at:  new Date().toISOString(),
        };

        const { error } = await supabaseClient
            .from('usuarios')
            .update(payload)
            .eq('id', session.user.id);

        if (error) throw error;
        mostrarToast('Informações atualizadas com sucesso!');
    } catch (err) {
        console.error(err);
        mostrarToast('Erro ao salvar: ' + (err.message || err), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar Informações'; }
    }
}

// ============================================
// ALTERAR E-MAIL
// ============================================
async function alterarEmail(event) {
    event.preventDefault();
    const novo = document.getElementById('secNovoEmail').value.trim();
    const conf = document.getElementById('secConfirmaEmail').value.trim();

    if (novo !== conf) {
        mostrarToast('Os e-mails não coincidem.', 'error');
        return;
    }

    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Alterando...'; }

    try {
        const { error } = await supabaseClient.auth.updateUser({ email: novo });
        if (error) throw error;
        mostrarToast('Confirmação enviada para o novo e-mail. Verifique a caixa de entrada.', 'info');
        document.getElementById('secNovoEmail').value = '';
        document.getElementById('secConfirmaEmail').value = '';
    } catch (err) {
        mostrarToast('Erro ao alterar e-mail: ' + (err.message || err), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Alterar E-mail'; }
    }
}

// ============================================
// ALTERAR SENHA
// ============================================
async function alterarSenha(event) {
    event.preventDefault();
    const nova = document.getElementById('secNovaSenha').value;
    const conf = document.getElementById('secConfirmaSenha').value;

    if (nova.length < 8) { mostrarToast('A nova senha deve ter ao menos 8 caracteres.', 'error'); return; }
    if (nova !== conf)   { mostrarToast('As senhas não coincidem.', 'error'); return; }

    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Alterando...'; }

    try {
        const { error } = await supabaseClient.auth.updateUser({ password: nova });
        if (error) throw error;
        mostrarToast('Senha alterada com sucesso!');
        document.getElementById('secNovaSenha').value = '';
        document.getElementById('secConfirmaSenha').value = '';
    } catch (err) {
        mostrarToast('Erro ao alterar senha: ' + (err.message || err), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Alterar Senha'; }
    }
}

// ============================================
// EXCLUIR CONTA
// ============================================
function abrirModalExcluirConta() {
    abrirModal('modalExcluirConta');
}

async function confirmarExcluirConta() {
    const btn = document.getElementById('btnConfirmarExcluir');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excluindo...'; }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Sessão expirada');

        // Tenta via RPC (deleta auth.users + cascata)
        const { error: rpcError } = await supabaseClient.rpc('excluir_minha_conta');

        if (rpcError) {
            console.warn('RPC excluir_minha_conta falhou, usando fallback:', rpcError);
            // Fallback: remove apenas o perfil em public.usuarios
            const { error: delError } = await supabaseClient
                .from('usuarios')
                .delete()
                .eq('id', session.user.id);
            if (delError) throw delError;
        }

        // Limpa storage local e desloga
        localStorage.removeItem('potygen_lembrar_me');
        sessionStorage.clear();
        await supabaseClient.auth.signOut();
        // onAuthStateChange em auth.js redireciona para login
        mostrarToast('Conta excluída. Redirecionando...');
        setTimeout(() => { window.location.replace('../pages/index.html'); }, 1200);
    } catch (err) {
        console.error(err);
        mostrarToast('Erro ao excluir conta: ' + (err.message || err), 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Sim, excluir minha conta'; }
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    switchTab('info');

    // Aguarda navbar (sistema de fazendas usa elementos da sidebar)
    const iniciarFazendas = async () => {
        if (typeof PotygenFazendaUI !== 'undefined') {
            await PotygenFazendaUI.inicializar({
                onFazendaTrocada: (fazenda) => {
                    console.log('Fazenda trocada:', fazenda?.nome);
                }
            });
        }
    };

    if (window.navbarLoaded) {
        iniciarFazendas();
    } else {
        document.addEventListener('navbarLoaded', iniciarFazendas, { once: true });
    }

    // Carrega dados do usuário
    await carregarDadosUsuario();

    // Re-renderiza ícones (após inserções dinâmicas)
    if (typeof lucide !== 'undefined') lucide.createIcons();
});
