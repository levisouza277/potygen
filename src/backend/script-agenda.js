/* ==========================================================================
   POTYGEN PRO - SCRIPT-AGENDA.JS
   Lógica completa da Agenda Reprodutiva
   - Sincroniza inseminações -> agenda_reprodutiva
   - Calcula data prevista de cio, ultrassom e parto por espécie
   - Calendário mensal com bolinhas de eventos
   - Modais: eventos do dia, verificar cio, ultrassom, agendar ultra, parto
   - Filtra por fazenda ativa (window.PotygenFazenda)
   ========================================================================== */

// ============================================================
// CONFIGURAÇÕES POR ESPÉCIE
// ============================================================
const CONFIG_ESPECIE = {
    Bovino:  { cio: 21, gestacao: 283 },
    Bovinos: { cio: 21, gestacao: 283 },
    Caprino: { cio: 21, gestacao: 150 },
    Caprinos:{ cio: 21, gestacao: 150 },
    Ovino:   { cio: 17, gestacao: 147 },
    Ovinos:  { cio: 17, gestacao: 147 },
};
const DEFAULT_ESPECIE = { cio: 21, gestacao: 283 };

function cfgEspecie(esp) {
    if (!esp) return DEFAULT_ESPECIE;
    return CONFIG_ESPECIE[esp] || CONFIG_ESPECIE[esp.charAt(0).toUpperCase() + esp.slice(1).toLowerCase()] || DEFAULT_ESPECIE;
}

// ============================================================
// ESTADO GLOBAL DA PÁGINA
// ============================================================
const Agenda = {
    usuarioId: null,
    fazendaId: null,
    inseminacoes: [],   // raw inseminações
    agenda: [],         // registros agenda_reprodutiva (1 por inseminação ativa)
    animais: {},        // map id -> animal
    mesAtual: new Date().getMonth(),
    anoAtual:  new Date().getFullYear(),
    diaSelecionado: null,
    contextoAcao: null, // { agendaId, femeaId, codigo, especie }
    opcoes: { cio: null, ultra: null },
};

// ============================================================
// HELPERS
// ============================================================
const $ = (id) => document.getElementById(id);
function showLoading(b){ const el=$('loadingOverlay'); if(el) el.classList.toggle('ativo', !!b); }
function toast(msg){
    const t=$('toast'); if(!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), 2600);
}
function abrirModal(id){ const m=$(id); if(m) { m.style.display = 'flex'; m.classList.add('aberto'); } }
function fecharModal(id){ const m=$(id); if(m) { m.style.display = 'none'; m.classList.remove('aberto'); } }
window.fecharModal = fecharModal;

function addDias(dataStr, dias){
    const d = new Date(dataStr + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0,10);
}
function hojeStr(){ return new Date().toISOString().slice(0,10); }
function fmtBR(dataStr){
    if (!dataStr) return '—';
    const [y,m,d] = dataStr.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
}
function uuid(){
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
        const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
    });
}

// ============================================================
// CARGA DE DADOS
// ============================================================
async function carregarTudo() {
    if (!Agenda.fazendaId) {
        Agenda.inseminacoes = []; Agenda.agenda = []; Agenda.animais = {};
        renderTudo();
        return;
    }
    showLoading(true);
    try {
        // 1. Inseminações da fazenda
        const { data: inse, error: e1 } = await supabaseClient
            .from('inseminacoes')
            .select('*')
            .eq('fazenda_id', Agenda.fazendaId)
            .order('data_inseminacao', { ascending: false });
        if (e1) throw e1;
        Agenda.inseminacoes = inse || [];

        // 2. Animais relacionados (fêmeas)
        const femeaIds = [...new Set(Agenda.inseminacoes.map(i=>i.femea_id).filter(Boolean))];
        if (femeaIds.length) {
            const { data: ani, error: e2 } = await supabaseClient
                .from('animais').select('*').in('id', femeaIds);
            if (e2) throw e2;
            Agenda.animais = {};
            (ani||[]).forEach(a => { Agenda.animais[a.id] = a; });
        } else {
            Agenda.animais = {};
        }

        // 3. Agenda reprodutiva existente
        const insIds = Agenda.inseminacoes.map(i=>i.id);
        if (insIds.length) {
            const { data: ag, error: e3 } = await supabaseClient
                .from('agenda_reprodutiva').select('*').in('inseminacao_id', insIds);
            if (e3) throw e3;
            Agenda.agenda = ag || [];
        } else {
            Agenda.agenda = [];
        }

        // 4. Sincroniza: cria entrada na agenda para cada inseminação que ainda não tem
        await sincronizarAgenda();

        renderTudo();
    } catch (err) {
        console.error('[Agenda] erro ao carregar', err);
        toast('Erro ao carregar agenda');
    } finally {
        showLoading(false);
    }
}

async function sincronizarAgenda() {
    const existentes = new Set(Agenda.agenda.map(a => a.inseminacao_id));
    const pendentes = Agenda.inseminacoes.filter(i => !existentes.has(i.id) && i.femea_id && i.data_inseminacao);
    if (!pendentes.length) return;

    // Insere uma a uma para que uma linha problemática não derrube todas
    // e para se adaptar a colunas opcionais ausentes na tabela.
    for (const ins of pendentes) {
        const animal = Agenda.animais[ins.femea_id];
        const cfg = cfgEspecie(animal?.especie);

        // Payload mínimo + campos opcionais. Removemos quaisquer chaves
        // que a tabela rejeitar (coluna inexistente / enum inválido) e
        // tentamos de novo.
        const payload = {
            id: uuid(),
            femea_id: ins.femea_id,
            inseminacao_id: ins.id,
            data_inseminacao: ins.data_inseminacao,
            data_prevista_cio: addDias(ins.data_inseminacao, cfg.cio),
            status: 'Inseminada',
        };
        // Propaga fazenda/usuario quando a inseminação tiver esses campos
        if (ins.fazenda_id) payload.fazenda_id = ins.fazenda_id;
        else if (Agenda.fazendaId) payload.fazenda_id = Agenda.fazendaId;
        if (ins.usuario_id) payload.usuario_id = ins.usuario_id;
        else if (Agenda.usuarioId) payload.usuario_id = Agenda.usuarioId;

        let attempt = 0;
        let inserted = null;
        while (attempt < 5) {
            const { data, error } = await supabaseClient
                .from('agenda_reprodutiva').insert([payload]).select();
            if (!error) { inserted = (data && data[0]) || payload; break; }

            const msg = (error.message || '') + ' ' + (error.details || '') + ' ' + (error.hint || '');
            console.error('[Agenda] insert falhou', { payload, error });

            // 1) coluna inexistente: "Could not find the 'X' column"
            const colMatch = msg.match(/'([a-z_]+)' column|column "([a-z_]+)" of relation|column ([a-z_]+) does not exist/i);
            const colName = colMatch && (colMatch[1] || colMatch[2] || colMatch[3]);
            if (colName && colName in payload) {
                delete payload[colName];
                attempt++; continue;
            }
            // 2) violação de chave duplicada -> ignora (já existe)
            if (error.code === '23505') { inserted = null; break; }
            // 3) qualquer outro erro: mostra mensagem real e para
            toast('Erro ao sincronizar agenda: ' + (error.message || 'desconhecido'));
            return;
        }
        if (inserted) Agenda.agenda.push(inserted);
    }
}

// ============================================================
// EVENTOS DERIVADOS DO CALENDÁRIO
// Retorna { 'YYYY-MM-DD': [ {tipo, agendaId, femeaId, label} ] }
// ============================================================
function gerarEventos() {
    const eventos = {};
    const push = (data, ev) => {
        if (!data) return;
        const k = data.slice(0,10);
        (eventos[k] = eventos[k] || []).push(ev);
    };

    for (const a of Agenda.agenda) {
        const animal = Agenda.animais[a.femea_id];
        const codigo = animal?.codigo || '—';
        const base = { agendaId: a.id, femeaId: a.femea_id, codigo, especie: animal?.especie };

        if (a.data_inseminacao)
            push(a.data_inseminacao, { ...base, tipo:'ins', label:`Inseminação · ${codigo}` });

        // Cio previsto só se ainda não confirmado nem virou prenhez/aborto
        if (a.data_prevista_cio && a.cio_confirmado === null && !['Prenhe','Vazia','Aborto','Parto'].includes(a.status))
            push(a.data_prevista_cio, { ...base, tipo:'cio', label:`Possível cio · ${codigo}` });

        if (a.data_cio_real)
            push(a.data_cio_real, { ...base, tipo:'cio', label:`Cio confirmado · ${codigo}` });

        if (a.data_ultrassom && a.resultado_prenhez === null)
            push(a.data_ultrassom, { ...base, tipo:'ultrassom', label:`Ultrassom · ${codigo}` });

        if (a.status === 'Prenhe' && a.data_ultrassom)
            push(a.data_ultrassom, { ...base, tipo:'prenhe', label:`Gestação confirmada · ${codigo}` });

        if (a.data_prevista_parto && !a.data_parto_real && a.status !== 'Aborto')
            push(a.data_prevista_parto, { ...base, tipo:'parto', label:`Parto previsto · ${codigo}` });

        if (a.data_parto_real)
            push(a.data_parto_real, { ...base, tipo:'parto', label:`Parto realizado · ${codigo}` });

        if (a.status === 'Aborto' && a.observacoes) {
            // sem campo dedicado; ignora
        }
    }
    return eventos;
}

// ============================================================
// RENDER: CALENDÁRIO
// ============================================================
function renderCalendario() {
    const tbody = $('corpoCalendarioGeral');
    if (!tbody) return;
    const eventos = gerarEventos();
    const ano = Agenda.anoAtual, mes = Agenda.mesAtual;
    $('selectMes').value = mes;
    $('selectAno').value = ano;

    const primeiro = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes+1, 0).getDate();
    const offset = primeiro.getDay();
    const hojeISO = hojeStr();

    let html = '';
    let dia = 1;
    for (let semana = 0; semana < 6; semana++) {
        html += '<tr>';
        for (let col = 0; col < 7; col++) {
            const idx = semana*7 + col;
            if (idx < offset || dia > ultimoDia) {
                html += '<td><div class="dia-card dia-vazio"></div></td>';
            } else {
                const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                const evs = eventos[dataISO] || [];
                const tipos = [...new Set(evs.map(e=>e.tipo))];
                const bolinhas = tipos.map(t=>`<span class="ponto-evento ponto-${t}"></span>`).join('');
                const cls = dataISO === hojeISO ? 'dia-card hoje' : 'dia-card';
                html += `<td><div class="${cls}" data-data="${dataISO}" onclick="abrirEventosDoDia('${dataISO}')">
                    <span class="dia-numero">${dia}</span>
                    <div class="bolinhas-dia">${bolinhas}</div>
                </div></td>`;
                dia++;
            }
        }
        html += '</tr>';
        if (dia > ultimoDia) break;
    }
    tbody.innerHTML = html;
}

// ============================================================
// RENDER: TABELA DE ACOMPANHAMENTO
// ============================================================
function statusBadge(status) {
    const map = {
        'Inseminada':'Realizada',
        'Aguardando Cio':'Agendada',
        'Altas chances de prenhez':'alta_prenhez',
        'Baixas chances de prenhez':'cio',
        'Prenhe':'prenhe',
        'Vazia':'vazia',
        'Parto':'parto',
        'Aborto':'aborto',
    };
    const cls = map[status] || 'Agendada';
    return `<span class="badge-status badge-${cls}">${status}</span>`;
}

function proximoEvento(a) {
    const hoje = hojeStr();
    const candidatos = [];
    if (a.data_prevista_cio && a.cio_confirmado===null && !['Prenhe','Vazia','Aborto','Parto'].includes(a.status))
        candidatos.push({ d:a.data_prevista_cio, l:'Possível cio' });
    if (a.data_ultrassom && a.resultado_prenhez===null)
        candidatos.push({ d:a.data_ultrassom, l:'Ultrassom' });
    if (a.data_prevista_parto && !a.data_parto_real && a.status!=='Aborto')
        candidatos.push({ d:a.data_prevista_parto, l:'Parto' });
    candidatos.sort((x,y)=> x.d.localeCompare(y.d));
    const futuro = candidatos.find(c=>c.d >= hoje) || candidatos[0];
    return futuro ? `${futuro.l} · ${fmtBR(futuro.d)}` : '—';
}

function renderTabela() {
    const tbody = $('tabelaAcompanhamento');
    if (!tbody) return;
    const busca = ($('inputBusca')?.value || '').toLowerCase().trim();

    const linhas = Agenda.agenda
        .slice()
        .sort((a,b)=> (b.data_inseminacao||'').localeCompare(a.data_inseminacao||''))
        .filter(a => {
            if (!busca) return true;
            const an = Agenda.animais[a.femea_id];
            return (an?.codigo||'').toLowerCase().includes(busca) || (an?.nome||'').toLowerCase().includes(busca);
        });

    if (!linhas.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Nenhuma fêmea em acompanhamento. Registre uma inseminação para começar.</td></tr>`;
        return;
    }

    tbody.innerHTML = linhas.map(a => {
        const an = Agenda.animais[a.femea_id] || {};
        return `<tr>
            <td><strong>${an.codigo||'—'}</strong></td>
            <td>${an.nome||'—'}</td>
            <td>${an.especie||'—'}</td>
            <td>${fmtBR(a.data_inseminacao)}</td>
            <td>${statusBadge(a.status||'Inseminada')}</td>
            <td>${proximoEvento(a)}</td>
            <td style="white-space:nowrap;">
                <button class="btn-ver" onclick="acoesAnimal('${a.id}')">Gerenciar</button>
                <button class="btn-ver btn-visualizar" style="background:#2563eb;color:#fff;margin-left:6px;" onclick="visualizarAnimal('${a.femea_id}')">
                    <i class="fa-solid fa-eye"></i> Visualizar
                </button>
            </td>
        </tr>`;
    }).join('');
}

function renderTudo(){ renderCalendario(); renderTabela(); }

// ============================================================
// MODAL: EVENTOS DO DIA
// ============================================================
window.abrirEventosDoDia = function(dataISO) {
    Agenda.diaSelecionado = dataISO;
    const evs = gerarEventos()[dataISO] || [];
    $('modalDiaTitulo').textContent = `Eventos de ${fmtBR(dataISO)}`;
    const ul = $('listaEventosDia');
    if (!evs.length) {
        ul.innerHTML = `<li style="justify-content:center;color:#94a3b8;">Sem eventos neste dia.</li>`;
    } else {
        ul.innerHTML = evs.map(e => `
            <li onclick="executarEvento('${e.tipo}','${e.agendaId}')">
                <span class="ponto-evento ponto-${e.tipo}"></span>
                <div>
                    <div class="ev-label">${e.label}</div>
                    <div class="ev-sub">${tipoLabel(e.tipo)}</div>
                </div>
            </li>
        `).join('');
    }
    abrirModal('modalDia');
};

function tipoLabel(t){
    return ({ins:'Inseminação',cio:'Retorno ao cio',ultrassom:'Ultrassom',
             prenhe:'Gestação',parto:'Parto',aborto:'Aborto'})[t] || t;
}

// ============================================================
// AÇÕES DO ANIMAL / EVENTO
// ============================================================
window.executarEvento = function(tipo, agendaId) {
    fecharModal('modalDia');
    const a = Agenda.agenda.find(x=>x.id===agendaId);
    if (!a) return;
    const an = Agenda.animais[a.femea_id] || {};
    Agenda.contextoAcao = { agendaId, femeaId:a.femea_id, codigo:an.codigo, nome:an.nome, especie:an.especie };

    if (tipo === 'cio') return abrirModalCio();
    if (tipo === 'ultrassom') return abrirModalUltrassom();
    if (tipo === 'parto') return abrirModalParto();
    if (tipo === 'ins' || tipo === 'prenhe') {
        toast(`Animal ${an.codigo||''} — ${a.status||'Inseminada'}`);
    }
};

window.acoesAnimal = function(agendaId){
    const a = Agenda.agenda.find(x=>x.id===agendaId);
    if (!a) return;
    const an = Agenda.animais[a.femea_id] || {};
    Agenda.contextoAcao = { agendaId, femeaId:a.femea_id, codigo:an.codigo, nome:an.nome, especie:an.especie };

    // direciona pela etapa do ciclo
    if (a.status === 'Prenhe' || a.data_prevista_parto) return abrirModalParto();
    if (a.data_ultrassom && a.resultado_prenhez===null) return abrirModalUltrassom();
    if (a.cio_confirmado === null) return abrirModalCio();
    abrirModalUltrassom();
};

// ----- MODAL CIO -----
function abrirModalCio(){
    const c = Agenda.contextoAcao;
    $('modalCioAnimal').textContent = `Fêmea: ${c.codigo||'—'} ${c.nome?'· '+c.nome:''}`;
    Agenda.opcoes.cio = null;
    $('btnCioSim').classList.remove('selecionado');
    $('btnCioNao').classList.remove('selecionado');
    $('blocoUltraCio').style.display = 'none';
    $('inputDataUltraCio').value = '';
    abrirModal('modalCio');
}

window.selecionarOpcao = function(grupo, val){
    Agenda.opcoes[grupo] = val;
    if (grupo === 'cio') {
        $('btnCioSim').classList.toggle('selecionado', val==='sim');
        $('btnCioNao').classList.toggle('selecionado', val==='nao');
        $('blocoUltraCio').style.display = val==='nao' ? 'block' : 'none';
        if (val === 'nao') {
            const c = Agenda.contextoAcao;
            const cfg = cfgEspecie(c.especie);
            // sugere ultrassom 28 dias após inseminação
            const a = Agenda.agenda.find(x=>x.id===c.agendaId);
            if (a?.data_inseminacao) $('inputDataUltraCio').value = addDias(a.data_inseminacao, 28);
        }
    }
    if (grupo === 'ultra') {
        $('btnUltraSim').classList.toggle('selecionado', val==='sim');
        $('btnUltraNao').classList.toggle('selecionado', val==='nao');
    }
};

$('btnConfirmarCio')?.addEventListener('click', async ()=>{
    if (!Agenda.opcoes.cio) return toast('Selecione Sim ou Não');
    const c = Agenda.contextoAcao;
    const a = Agenda.agenda.find(x=>x.id===c.agendaId);
    const cioSim = Agenda.opcoes.cio === 'sim';

    const update = {
        cio_confirmado: cioSim,
        data_cio_real: cioSim ? hojeStr() : null,
        status_cio: cioSim ? 'apresentou' : 'nao_apresentou',
        status: cioSim ? 'Baixas chances de prenhez' : 'Altas chances de prenhez',
    };
    if (!cioSim) {
        const dUltra = $('inputDataUltraCio').value;
        if (dUltra) update.data_ultrassom = dUltra;
    }

    showLoading(true);
    const { error } = await supabaseClient.from('agenda_reprodutiva').update(update).eq('id', a.id);
    showLoading(false);
    if (error) { console.error(error); return toast('Erro ao salvar'); }
    Object.assign(a, update);
    fecharModal('modalCio');
    toast(cioSim ? 'Ciclo encerrado · pode ser inseminada novamente' : 'Marcada como altas chances de prenhez');
    renderTudo();
});

// ----- MODAL ULTRASSOM -----
function abrirModalUltrassom(){
    const c = Agenda.contextoAcao;
    const a = Agenda.agenda.find(x=>x.id===c.agendaId);
    $('modalUltraAnimal').textContent = `Fêmea: ${c.codigo||'—'} ${c.nome?'· '+c.nome:''}`;
    $('inputDataUltrassom').value = a?.data_ultrassom || hojeStr();
    Agenda.opcoes.ultra = null;
    $('btnUltraSim').classList.remove('selecionado');
    $('btnUltraNao').classList.remove('selecionado');
    abrirModal('modalUltrassom');
}

$('btnSalvarUltrassom')?.addEventListener('click', async ()=>{
    if (!Agenda.opcoes.ultra) return toast('Informe o resultado');
    const c = Agenda.contextoAcao;
    const a = Agenda.agenda.find(x=>x.id===c.agendaId);
    const prenhe = Agenda.opcoes.ultra === 'sim';
    const dataUltra = $('inputDataUltrassom').value || hojeStr();
    const cfg = cfgEspecie(c.especie);

    const update = {
        data_ultrassom: dataUltra,
        resultado_prenhez: prenhe,
        status: prenhe ? 'Prenhe' : 'Vazia',
        data_prevista_parto: prenhe ? addDias(a.data_inseminacao, cfg.gestacao) : null,
    };

    showLoading(true);
    const { error } = await supabaseClient.from('agenda_reprodutiva').update(update).eq('id', a.id);
    // também atualiza inseminacao
    if (!error && a.inseminacao_id) {
        await supabaseClient.from('inseminacoes').update({
            resultado_prenhez: prenhe,
            data_diagnostico: dataUltra,
            status: prenhe ? 'Prenhez Confirmada' : 'Falha'
        }).eq('id', a.inseminacao_id);
    }
    showLoading(false);
    if (error) { console.error(error); return toast('Erro ao salvar'); }
    Object.assign(a, update);
    fecharModal('modalUltrassom');
    toast(prenhe ? 'Gestação confirmada · parto agendado' : 'Fêmea vazia · ciclo encerrado');
    renderTudo();
});

// ----- MODAL PARTO -----
function abrirModalParto(){
    const c = Agenda.contextoAcao;
    const a = Agenda.agenda.find(x=>x.id===c.agendaId);
    $('modalPartoAnimal').textContent = `Matriz: ${c.codigo||'—'} ${c.nome?'· '+c.nome:''}`;
    $('inputDataParto').value = a?.data_prevista_parto || hojeStr();
    $('inputQtdCrias').value = 1;
    $('inputObsParto').value = '';
    abrirModal('modalParto');
}

$('btnSalvarParto')?.addEventListener('click', async ()=>{
    const c = Agenda.contextoAcao;
    const a = Agenda.agenda.find(x=>x.id===c.agendaId);
    const dataParto = $('inputDataParto').value;
    const qtd = parseInt($('inputQtdCrias').value)||1;
    const sexo = $('selectSexoCrias').value;
    const obs = $('inputObsParto').value;
    if (!dataParto) return toast('Informe a data do parto');

    const update = {
        data_parto_real: dataParto,
        status: 'Parto',
        observacoes: obs || null,
    };

    showLoading(true);
    const { error } = await supabaseClient.from('agenda_reprodutiva').update(update).eq('id', a.id);
    if (!error) {
        // incrementa qtd_nascimentos na matriz
        const an = Agenda.animais[a.femea_id];
        const novoTotal = (an?.qtd_nascimentos||0) + 1;
        const novoNasc = an?.nascimentos || [];
        novoNasc.push({ data: dataParto, qtd_crias: qtd, sexo, observacoes: obs });
        await supabaseClient.from('animais').update({
            qtd_nascimentos: novoTotal,
            nascimentos: novoNasc,
        }).eq('id', a.femea_id);
    }
    showLoading(false);
    if (error) { console.error(error); return toast('Erro ao registrar parto'); }
    Object.assign(a, update);
    fecharModal('modalParto');
    toast('Parto registrado com sucesso');
    await carregarTudo();
});

// ============================================================
// CONTROLES DO CALENDÁRIO
// ============================================================
function bindCalendario(){
    $('btnMesAnterior')?.addEventListener('click', ()=>{
        Agenda.mesAtual--; if (Agenda.mesAtual<0){Agenda.mesAtual=11; Agenda.anoAtual--;}
        renderCalendario();
    });
    $('btnMesProximo')?.addEventListener('click', ()=>{
        Agenda.mesAtual++; if (Agenda.mesAtual>11){Agenda.mesAtual=0; Agenda.anoAtual++;}
        renderCalendario();
    });
    $('selectMes')?.addEventListener('change', e=>{ Agenda.mesAtual=parseInt(e.target.value); renderCalendario(); });
    $('selectAno')?.addEventListener('change', e=>{ Agenda.anoAtual=parseInt(e.target.value)||Agenda.anoAtual; renderCalendario(); });
    $('inputBusca')?.addEventListener('input', renderTabela);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // espera supabase + sessão
    const { data:{ session } } = await supabaseClient.auth.getSession();
    if (!session) return; // auth.js redireciona
    Agenda.usuarioId = session.user.id;

    bindCalendario();

    // integra com sistema de fazendas
    if (window.PotygenFazendaUI?.inicializar) {
        await window.PotygenFazendaUI.inicializar({
            onFazendaTrocada: async (fz) => {
                Agenda.fazendaId = fz?.id || null;
                await carregarTudo();
            }
        });
    }
    Agenda.fazendaId = window.PotygenFazenda?.getFazendaId?.() || null;
    await carregarTudo();
});

// Escuta evento global de troca de fazenda (caso UI não dispare callback)
document.addEventListener('fazendaTrocada', async (e)=>{
    Agenda.fazendaId = e.detail?.id || null;
    await carregarTudo();
});

// ============================================================
// VISUALIZAR ANIMAL — redireciona para painel_animal.html
// ============================================================
window.visualizarAnimal = function(femeaId) {
    if (!femeaId) { toast('Animal inválido.'); return; }
    window.location.href = `painel_animal.html?id=${encodeURIComponent(femeaId)}`;
};
