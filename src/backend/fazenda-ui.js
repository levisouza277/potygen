/* ==========================================================================
   POTYGEN PRO - FAZENDA-UI.JS
   Camada de UI reutilizável para o sistema de fazendas.
   Gerencia a sidebar, modais de troca e cadastro de fazenda.

   COMO USAR EM QUALQUER PÁGINA:
   1. Inclua os scripts na ordem:
        <script src="database.js"></script>
        <script src="fazenda.js"></script>
        <script src="fazenda-ui.js"></script>
        <script src="script-suapagina.js"></script>

   2. No DOMContentLoaded do script da sua página, chame:
        await PotygenFazendaUI.inicializar({
            onFazendaTrocada: (fazenda) => { /* recarregar dados da página */ 

   /*3. O PotygenFazendaUI.inicializar() já cuida de:
        - Carregar fazendas do usuário
        - Restaurar a fazenda salva na sessão
        - Atualizar a sidebar
        - Abrir modal de cadastro se não houver fazenda
        - Escutar o evento 'fazendaTrocada' para atualizar a UI
    */
   

if (typeof window.abrirModal !== 'function') {
    window.abrirModal = function(id) {
        const modal = document.getElementById(id);
        if (!modal) {
            console.warn('[Modal] Elemento não encontrado:', id);
            return;
        }
        modal.style.display = 'flex';
        modal.classList.add('show', 'active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    };
}

if (typeof window.fecharModal !== 'function') {
    window.fecharModal = function(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.style.display = 'none';
        modal.classList.remove('show', 'active');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal.show, .modal.active, .modal-parentesco[style*="flex"]')) {
            document.body.classList.remove('modal-open');
        }
    };
}

window.PotygenFazendaUI = {

    // Callback opcional por página (ex: recarregar dados do dashboard, animais, etc.)
    _onFazendaTrocada: null,

    // ============================================================
    // INICIALIZAÇÃO — chamado por cada página
    // ============================================================
    async inicializar({ onFazendaTrocada } = {}) {
        if (onFazendaTrocada) this._onFazendaTrocada = onFazendaTrocada;

        if (typeof window.inicializarFazenda !== 'function') {
            console.error('[FazendaUI] fazenda.js não carregado antes de fazenda-ui.js');
            return null;
        }

        const fazendaAtiva = await window.inicializarFazenda();

        if (fazendaAtiva) {
            this.atualizarDisplayFazenda(fazendaAtiva);
        } else {
            const nomeEl = document.getElementById('sidebarFazendaNome');
            const subEl  = document.getElementById('sidebarFazendaSub');
            if (nomeEl) nomeEl.textContent = 'Cadastrar fazenda';
            if (subEl)  subEl.textContent  = 'Clique para começar';
            setTimeout(() => this.abrirModalCadastrarFazenda(), 700);
        }

        // Escuta troca de fazenda (disparado por selecionarFazenda em fazenda.js)
        document.addEventListener('fazendaTrocada', (e) => {
            this.atualizarDisplayFazenda(e.detail);
            if (typeof this._onFazendaTrocada === 'function') {
                this._onFazendaTrocada(e.detail);
            }
        });

        // Escuta ausência de fazenda
        document.addEventListener('semFazenda', () => {
            setTimeout(() => this.abrirModalCadastrarFazenda(), 700);
        });

        // Fecha modais com Escape
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                ['modalTrocarFazenda', 'modalCadastrarFazenda'].forEach(id => fecharModal(id));
            }
        });

        return fazendaAtiva;
    },

    // ============================================================
    // ATUALIZAR DISPLAY NA SIDEBAR
    // ============================================================
    atualizarDisplayFazenda(fazenda) {
        if (!fazenda) return;
        const nomeEl  = document.getElementById('sidebarFazendaNome');
        const badgeEl = document.getElementById('fazendaBadgeNome');
        const farmEl  = document.getElementById('userFarmDisplay');
        if (nomeEl)  nomeEl.textContent  = fazenda.nome || 'Trocar Fazenda';
        if (badgeEl) badgeEl.textContent = fazenda.nome || '—';
        if (farmEl)  farmEl.textContent  =
            [fazenda.tipo_criacao, [fazenda.cidade, fazenda.estado].filter(Boolean).join('/')]
            .filter(Boolean).join(' · ') || '—';
    },

    // ============================================================
    // MODAL TROCAR FAZENDA
    // ============================================================
    abrirModalTrocarFazenda() {
        this._renderizarListaFazendas();
        abrirModal('modalTrocarFazenda');
    },

    _renderizarListaFazendas() {
        const lista   = document.getElementById('fazendasLista');
        if (!lista) return;
        const fazendas = window.PotygenFazenda?.todasFazendas || [];
        const atualId  = window.PotygenFazenda?.getFazendaId();

        if (fazendas.length === 0) {
            lista.innerHTML = `
                <div class="fazendas-lista-vazia">
                    <i class="fa-solid fa-tractor" style="font-size:28px;margin-bottom:8px;opacity:0.3;display:block;"></i>
                    Nenhuma fazenda cadastrada ainda.
                </div>`;
            return;
        }

        lista.innerHTML = fazendas.map(f => `
            <div class="fazenda-item ${f.id === atualId ? 'ativa' : ''}"
                 onclick="PotygenFazendaUI._selecionarFazendaUI('${f.id}')">
                <div class="fi-icon"><i class="fa-solid fa-tractor"></i></div>
                <div class="fi-info">
                    <div class="fi-nome">${f.nome}</div>
                    <div class="fi-sub">${[f.tipo_criacao, [f.cidade, f.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</div>
                </div>
                <i class="fa-solid fa-check fi-check"></i>
            </div>
        `).join('');
    },

    _selecionarFazendaUI(fazendaId) {
        const fazenda = window.PotygenFazenda?.todasFazendas.find(f => f.id === fazendaId);
        if (!fazenda) return;

        // Delega ao fazenda.js (que dispara o evento 'fazendaTrocada')
        if (typeof selecionarFazenda === 'function') {
            selecionarFazenda(fazenda);
        }

        this.atualizarDisplayFazenda(fazenda);
        fecharModal('modalTrocarFazenda');

        if (typeof mostrarToast === 'function') {
            mostrarToast(`Fazenda trocada para: ${fazenda.nome}`);
        }
    },

    // ============================================================
    // MODAL CADASTRAR FAZENDA
    // ============================================================
    async abrirModalCadastrarFazenda() {
        fecharModal('modalTrocarFazenda');

        if (typeof buscarDadosUsuario === 'function') {
            const usuario = await buscarDadosUsuario();
            if (usuario) {
                const propEl = document.getElementById('fzProprietario');
                const cpfEl  = document.getElementById('fzCpf');
                const cidEl  = document.getElementById('fzCidade');
                const estEl  = document.getElementById('fzEstado');
                if (propEl) propEl.value = usuario.nome  || '';
                if (cpfEl)  cpfEl.value  = usuario.cpf   || '';
                if (cidEl && usuario.cidade) cidEl.value = usuario.cidade;
                if (estEl && usuario.estado) estEl.value = usuario.estado;
            }
        }

        abrirModal('modalCadastrarFazenda');
    },

    fecharModalCadastro() {
        fecharModal('modalCadastrarFazenda');
        ['fzNome','fzTipoCriacao','fzArea','fzTelefone','fzCep','fzEndereco','fzCidade','fzDescricao']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        const estEl = document.getElementById('fzEstado');
        if (estEl) estEl.value = '';
    },

    async salvarFazenda() {
        const nome = document.getElementById('fzNome')?.value.trim();
        const tipo = document.getElementById('fzTipoCriacao')?.value;

        if (!nome) { mostrarToast('Informe o nome da fazenda.', 'error'); return; }
        if (!tipo) { mostrarToast('Selecione o tipo de criação.', 'error'); return; }

        const btn = document.getElementById('btnSalvarFazenda');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }

        const dados = {
            nome,
            tipo_criacao: tipo,
            area_hectares: document.getElementById('fzArea')?.value     || null,
            telefone:      document.getElementById('fzTelefone')?.value.trim() || null,
            cep:           document.getElementById('fzCep')?.value.trim()      || null,
            endereco:      document.getElementById('fzEndereco')?.value.trim() || null,
            cidade:        document.getElementById('fzCidade')?.value.trim()   || null,
            estado:        document.getElementById('fzEstado')?.value          || null,
            descricao:     document.getElementById('fzDescricao')?.value.trim()|| null,
        };

        const resultado = await cadastrarFazenda(dados);

        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-tractor"></i> Cadastrar Fazenda'; }

        if (resultado.sucesso) {
            if (typeof mostrarToast === 'function') mostrarToast(`Fazenda "${nome}" cadastrada com sucesso!`);
            this.fecharModalCadastro();
            this.atualizarDisplayFazenda(resultado.fazenda);
            if (typeof this._onFazendaTrocada === 'function') {
                this._onFazendaTrocada(resultado.fazenda);
            }
        } else {
            if (typeof mostrarToast === 'function') mostrarToast('Erro ao cadastrar fazenda: ' + resultado.erro, 'error');
        }
    }
};

// ============================================================
// ATALHOS GLOBAIS (mantém compatibilidade com onclick no HTML)
// ============================================================
function abrirModalTrocarFazenda()    { PotygenFazendaUI.abrirModalTrocarFazenda(); }
function abrirModalCadastrarFazenda() { PotygenFazendaUI.abrirModalCadastrarFazenda(); }
function fecharModalCadastro()        { PotygenFazendaUI.fecharModalCadastro(); }
function salvarFazenda()              { PotygenFazendaUI.salvarFazenda(); }
function trocarFazenda(id)            { PotygenFazendaUI._selecionarFazendaUI(id); }

window.abrirModalTrocarFazenda = abrirModalTrocarFazenda;
window.abrirModalCadastrarFazenda = abrirModalCadastrarFazenda;
window.fecharModalCadastro = fecharModalCadastro;
window.salvarFazenda = salvarFazenda;
window.trocarFazenda = trocarFazenda;