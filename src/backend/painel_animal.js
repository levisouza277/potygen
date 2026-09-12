// ============================================================
// SUPABASE CLIENT
// ============================================================

const db = (typeof supabaseClient !== 'undefined' && supabaseClient)
    ? supabaseClient
    : supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// ESTADO
// ============================================================
let animalId = null;
let animalData = null;
let agendaRegistros = [];     // linhas de agenda_reprodutiva
let inseminacoesRaw = [];     // linhas brutas de inseminacoes (fallback / sync)
let usuarioId = null;
let fazendaIdAtiva = null;
let anoAtual, mesAtual;

// ============================================================
// UTILITÁRIOS
// ============================================================
function mostrarLoading(v){ const el = document.getElementById('loadingOverlay'); if (el) el.classList.toggle('ativo', v); }
function toast(msg, tipo='ok'){
    const el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg;
    el.style.background = tipo==='erro' ? '#dc2626' : '#1e293b';
    el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'), 3500);
}
window.abrirModal  = function(id){ const m=document.getElementById(id); if(m) m.classList.add('aberto'); };
window.fecharModal = function(id){ const m=document.getElementById(id); if(m) m.classList.remove('aberto'); };

function getParam(p){ return new URLSearchParams(window.location.search).get(p); }
function formatarData(iso){ if(!iso) return '—'; const [a,m,d] = iso.split('T')[0].split('-'); return `${d}/${m}/${a}`; }
function dataHoje(){ return new Date().toISOString().split('T')[0]; }
function addDias(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; }
function uuid(){
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
        const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
    });
}

function gestacaoPorEspecie(especie){
    if(!especie) return 283;
    const s = especie.toLowerCase();
    if(s.includes('caprino')||s.includes('cabra')) return 150;
    if(s.includes('ovino')||s.includes('ovelha')) return 147;
    return 283;
}
function cioPorEspecie(especie){
    if(!especie) return 21;
    const s = especie.toLowerCase();
    if(s.includes('ovino')||s.includes('ovelha')) return 17;
    return 21;
}
function meses(){ return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; }

// Normaliza status para casar tanto "prenhe" quanto "Prenhe"
function statusNorm(s){ return (s||'').toString().trim().toLowerCase(); }

function tagStatus(status){
    const s = statusNorm(status);
    const m = {
        inseminada:'tag-inseminada',
        prenhe:'tag-prenhe',
        vazia:'tag-vazia',
        parto:'tag-parto',
        cio:'tag-cio',
        alta_prenhez:'tag-alta_prenhez',
        'altas chances de prenhez':'tag-alta_prenhez',
        'baixas chances de prenhez':'tag-cio',
        aborto:'tag-aborto'
    };
    const labels = {
        inseminada:'Inseminada',
        prenhe:'Prenhe ✅',
        vazia:'Vazia',
        parto:'Parto Registrado',
        cio:'Retorno ao Cio',
        alta_prenhez:'Alta Chance Prenhez',
        'altas chances de prenhez':'Alta Chance Prenhez',
        'baixas chances de prenhez':'Baixa Chance Prenhez',
        aborto:'Aborto'
    };
    const cls = m[s] || 'tag-vazia';
    const lbl = labels[s] || status || '—';
    return `<span class="tag-status ${cls}" id="animalStatusTag">${lbl}</span>`;
}

window.mudarTab = function(nome){
    const nomes = ['inseminacoes','ultrassons','partos','abortos'];
    document.querySelectorAll('.tab-btn').forEach((b,i)=> b.classList.toggle('ativo', nomes[i]===nome));
    document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('ativo'));
    document.getElementById('tab'+nome.charAt(0).toUpperCase()+nome.slice(1)).classList.add('ativo');
};

// Helper para abrir o painel a partir de qualquer página (ex: agenda)
window.visualizarAnimal = window.visualizarAnimal || function(femeaId){
    if (!femeaId) return;
    window.location.href = `painel_animal.html?id=${femeaId}`;
};

// ============================================================
// CARREGAR ANIMAL (com validação de fazenda)
// ============================================================
async function carregarAnimal(){
    mostrarLoading(true);
    try {
        const { data: animal, error } = await db
            .from('animais').select('*').eq('id', animalId).maybeSingle();
        if (error) throw error;
        if (!animal){
            toast('Animal não encontrado.', 'erro');
            setTimeout(()=> window.location.href = 'agenda-reprodutiva.html', 1500);
            return;
        }
        if (fazendaIdAtiva && animal.fazenda_id && animal.fazenda_id !== fazendaIdAtiva){
            toast('Este animal não pertence à fazenda ativa.', 'erro');
            setTimeout(()=> window.location.href = 'agenda-reprodutiva.html', 1800);
            return;
        }
        animalData = animal;
        renderizarPerfil(animal);
    } catch(e){
        console.error(e);
        toast('Erro ao carregar animal: ' + e.message, 'erro');
    } finally { mostrarLoading(false); }
}

// ============================================================
// CARREGAR AGENDA + INSEMINAÇÕES (com sincronização sob demanda)
// ============================================================
async function carregarAgenda(){
    try {
        // 1) inseminações brutas do animal
        const { data: ins, error: errIns } = await db
            .from('inseminacoes')
            .select('*')
            .eq('femea_id', animalId)
            .order('data_inseminacao', { ascending: false });
        if (errIns) throw errIns;
        inseminacoesRaw = ins || [];

        // 2) agenda_reprodutiva já existente
        let q = db.from('agenda_reprodutiva').select('*').eq('femea_id', animalId);
        if (fazendaIdAtiva) q = q.eq('fazenda_id', fazendaIdAtiva);
        const { data: ag, error: errAg } = await q.order('data_inseminacao', { ascending: false });
        if (errAg && errAg.code !== '42P01') throw errAg; // 42P01 = tabela inexistente (tolerar)
        agendaRegistros = ag || [];

        // 3) sincroniza inseminações que ainda não viraram agenda
        await sincronizarAgendaParaAnimal();

        // 4) re-lê agenda atualizada
        if (!errAg) {
            const { data: ag2 } = await q.order('data_inseminacao', { ascending: false });
            agendaRegistros = ag2 || agendaRegistros;
        }

        renderizarHistorico();
        montarCalendario(anoAtual, mesAtual);

        // status mais recente
        const tag = document.getElementById('animalStatusTag');
        if (tag) {
            const ult = agendaRegistros[0] || inseminacoesRaw[0];
            tag.outerHTML = tagStatus(ult?.status || 'Inseminada');
        }
    } catch(e){
        console.error('[Agenda]', e);
        toast('Erro ao carregar agenda: ' + e.message, 'erro');
    }
}

async function sincronizarAgendaParaAnimal(){
    if (!inseminacoesRaw.length) return;
    const existentes = new Set(agendaRegistros.map(a => a.inseminacao_id).filter(Boolean));
    const pendentes = inseminacoesRaw.filter(i => !existentes.has(i.id) && i.data_inseminacao);
    if (!pendentes.length) return;

    for (const ins of pendentes) {
        const cio = cioPorEspecie(animalData?.especie);
        const payload = {
            id: uuid(),
            femea_id: ins.femea_id,
            inseminacao_id: ins.id,
            data_inseminacao: ins.data_inseminacao,
            data_prevista_cio: addDias(ins.data_inseminacao, cio),
            status: 'Inseminada',
        };
        if (ins.fazenda_id) payload.fazenda_id = ins.fazenda_id;
        else if (fazendaIdAtiva) payload.fazenda_id = fazendaIdAtiva;
        if (ins.usuario_id) payload.usuario_id = ins.usuario_id;
        else if (usuarioId) payload.usuario_id = usuarioId;

        let attempt = 0;
        while (attempt < 5) {
            const { error } = await db.from('agenda_reprodutiva').insert([payload]);
            if (!error) break;
            const msg = `${error.message||''} ${error.details||''} ${error.hint||''}`;
            const colMatch = msg.match(/'([a-z_]+)' column|column "([a-z_]+)" of relation|column ([a-z_]+) does not exist/i);
            const colName = colMatch && (colMatch[1] || colMatch[2] || colMatch[3]);
            if (colName && colName in payload){ delete payload[colName]; attempt++; continue; }
            if (error.code === '23505') break;
            console.warn('[sync] não foi possível inserir agenda:', error);
            break;
        }
    }
}

// ============================================================
// RENDERIZAR PERFIL
// ============================================================
function renderizarPerfil(a){
    document.getElementById('pageTitulo').textContent = a.nome || `Animal #${a.codigo||''}`;
    document.getElementById('animalNome').textContent = a.nome || (a.codigo ? `#${a.codigo}` : '—');
    const codigo = a.codigo || '—';
    document.getElementById('animalBrinco').textContent = `Brinco: #${codigo}`;

    const av = document.getElementById('avatarAnimal');
    const esp = (a.especie||'').toLowerCase();
    let icone = 'fa-cow';
    if(esp.includes('caprino')||esp.includes('cabra')) icone = 'fa-otter';
    if(esp.includes('ovino')||esp.includes('ovelha'))  icone = 'fa-piggy-bank';
    if (av) av.innerHTML = `<i class="fa-solid ${icone}"></i>`;

    const isMacho = statusNorm(a.sexo) === 'macho';
    const campos = [
        ['Espécie',      a.especie],
        ['Raça',         a.raca],
        ['Grau sangue',  a.grau_sangue],
        ['Nascimento',   formatarData(a.data_nascimento)],
        ['Sexo',         a.sexo || (isMacho ? 'Macho' : 'Fêmea')],
        ['Peso atual',   a.peso_atual ? `${a.peso_atual} kg` : '—'],
        ['ECC',          a.ecc ?? a.ecc_macho ?? '—'],
        ['Finalidade',   a.finalidade],
        ['Categoria',    a.categoria_reprodutiva],
        ['Lote',         a.lote],
        ['Mãe',          isMacho ? a.mae_macho : a.mae],
        ['Pai',          isMacho ? a.pai_macho : a.pai],
    ];

    if (isMacho) {
        campos.push(['Qtd. Descendentes', a.qtd_descendentes ?? 0]);
    } else {
        campos.push(['Qtd. Nascimentos', a.qtd_nascimentos ?? 0]);
        const totalCrias = Array.isArray(a.nascimentos)
            ? a.nascimentos.reduce((s,n)=> s + (parseInt(n?.qtd)||0), 0)
            : 0;
        campos.push(['Total de crias', totalCrias]);
        if (a.historico_aborto) campos.push(['Histórico de aborto', 'Sim']);
    }

    document.getElementById('infoBasica').innerHTML = campos
        .filter(([,v]) => v !== undefined && v !== null && v !== '')
        .map(([l,v])=>`
            <div class="info-row">
                <span class="info-label">${l}</span>
                <span class="info-valor">${v}</span>
            </div>`).join('');
}

// ============================================================
// HISTÓRICO
// ============================================================
function renderizarHistorico(){
    // INSEMINAÇÕES — preferir agenda; se vazia, usar inseminacoesRaw
    const fonteIns = agendaRegistros.length ? agendaRegistros : inseminacoesRaw.map(i=>({
        data_inseminacao: i.data_inseminacao,
        status: i.status,
        data_prevista_cio: addDias(i.data_inseminacao, cioPorEspecie(animalData?.especie)),
    }));
    const listaIns = document.getElementById('listaInseminacoes');
    const ins = fonteIns.filter(r=>r.data_inseminacao);
    listaIns.innerHTML = ins.length === 0
        ? `<div class="empty-state"><i class="fa-solid fa-syringe"></i>Nenhuma inseminação registrada.</div>`
        : ins.map(r=>`<li>
            <div class="tl-icone tl-ins"><i class="fa-solid fa-syringe"></i></div>
            <div>
                <div class="tl-label">${formatarData(r.data_inseminacao)}</div>
                <div class="tl-sub">Status: ${r.status||'—'} • Cio previsto: ${formatarData(r.data_prevista_cio)}</div>
            </div>
        </li>`).join('');

    // ULTRASSONS
    const listaU = document.getElementById('listaUltrassons');
    const u = agendaRegistros.filter(r=>r.data_ultrassom);
    listaU.innerHTML = u.length === 0
        ? `<div class="empty-state"><i class="fa-solid fa-stethoscope"></i>Nenhum ultrassom registrado.</div>`
        : u.map(r=>`<li>
            <div class="tl-icone tl-ultra"><i class="fa-solid fa-stethoscope"></i></div>
            <div>
                <div class="tl-label">${formatarData(r.data_ultrassom)}</div>
                <div class="tl-sub">Resultado: ${r.resultado_prenhez===true?'Prenhe ✅':r.resultado_prenhez===false?'Vazia ❌':'Pendente'}</div>
            </div>
        </li>`).join('');

    // PARTOS — usa agenda + jsonb animais.nascimentos
    const listaP = document.getElementById('listaPartos');
    const partosAgenda = agendaRegistros.filter(r=>r.data_parto_real).map(r=>({
        data: r.data_parto_real,
        previsto: r.data_prevista_parto,
        obs: r.observacoes,
    }));
    const partosJsonb = Array.isArray(animalData?.nascimentos) ? animalData.nascimentos.map(n=>({
        data: n.data, previsto: null,
        obs: `${n.qtd||1} cria(s) — Sexo: ${n.sexo||'—'} — Raça: ${n.raca||'—'}. ${n.obs||''}`.trim(),
    })) : [];
    const partos = [...partosAgenda, ...partosJsonb]
        .filter((p,i,arr)=> arr.findIndex(x=>x.data===p.data) === i)
        .sort((a,b)=> (b.data||'').localeCompare(a.data||''));

    listaP.innerHTML = partos.length === 0
        ? `<div class="empty-state"><i class="fa-solid fa-baby"></i>Nenhum parto registrado.</div>`
        : partos.map(r=>`<li>
            <div class="tl-icone tl-parto"><i class="fa-solid fa-baby"></i></div>
            <div>
                <div class="tl-label">Parto em ${formatarData(r.data)}</div>
                <div class="tl-sub">${r.previsto?`Previsto: ${formatarData(r.previsto)} • `:''}Obs: ${r.obs||'—'}</div>
            </div>
        </li>`).join('');

    // ABORTOS
    const listaA = document.getElementById('listaAbortos');
    const ab = agendaRegistros.filter(r=> statusNorm(r.status)==='aborto');
    listaA.innerHTML = ab.length === 0
        ? `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i>Nenhum aborto registrado.</div>`
        : ab.map(r=>`<li>
            <div class="tl-icone tl-aborto"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div>
                <div class="tl-label">Aborto registrado</div>
                <div class="tl-sub">${r.observacoes||'Sem observações'}</div>
            </div>
        </li>`).join('');
}

// ============================================================
// CALENDÁRIO INDIVIDUAL
// ============================================================
function atualizarCalLabel(){ document.getElementById('calMesLabel').textContent = `${meses()[mesAtual]} ${anoAtual}`; }

function montarCalendario(ano, mes){
    atualizarCalLabel();
    const corpo = document.getElementById('corpoCalendario');
    corpo.innerHTML = '';
    const hoje = dataHoje();

    const mapa = new Map();
    const add = (d, tipo) => { if(!d) return; const k=d.slice(0,10); if(!mapa.has(k)) mapa.set(k,[]); mapa.get(k).push(tipo); };

    agendaRegistros.forEach(r=>{
        const s = statusNorm(r.status);
        if(r.data_inseminacao) add(r.data_inseminacao, 'ins');
        if(r.data_prevista_cio && s==='inseminada') add(r.data_prevista_cio, 'cio');
        if(r.data_cio_real) add(r.data_cio_real, 'cio');
        if(r.data_ultrassom) add(r.data_ultrassom, 'ultrassom');
        if(r.data_prevista_parto && (s==='prenhe'||s==='parto'||s==='alta_prenhez'||s==='altas chances de prenhez'))
            add(r.data_prevista_parto, 'parto');
        if(r.data_parto_real) add(r.data_parto_real, 'parto');
        if(s==='aborto') add(r.data_inseminacao, 'aborto');
    });
    // Plotar nascimentos do jsonb também
    (animalData?.nascimentos || []).forEach(n => n?.data && add(n.data, 'parto'));

    const primDia = new Date(ano, mes, 1).getDay();
    const totalDias = new Date(ano, mes+1, 0).getDate();
    let linha = document.createElement('tr');
    let col = 0;

    for(let i=0;i<primDia;i++){ linha.innerHTML += `<td><div class="dia-vazio"></div></td>`; col++; }
    for(let dia=1; dia<=totalDias; dia++){
        if(col===7){ corpo.appendChild(linha); linha=document.createElement('tr'); col=0; }
        const ds = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const tipos = [...new Set(mapa.get(ds) || [])];
        const bolinhas = '<div class="bolinhas">' + tipos.map(t=>`<span class="ponto-evento ponto-${t}"></span>`).join('') + '</div>';
        const td = document.createElement('td');
        const div = document.createElement('div');
        div.className = 'dia-card' + (ds===hoje?' hoje':'');
        div.innerHTML = `<span class="dia-num">${dia}</span>${bolinhas}`;
        td.appendChild(div);
        linha.appendChild(td);
        col++;
    }
    while(col<7){ linha.innerHTML += `<td><div class="dia-vazio"></div></td>`; col++; }
    corpo.appendChild(linha);
}

// ============================================================
// AÇÕES
// ============================================================
function cicloAtivo(){
    return agendaRegistros.find(r=>{
        const s=statusNorm(r.status);
        return s!=='aborto' && s!=='parto' && s!=='vazia';
    }) || agendaRegistros[0];
}

// ULTRASSOM
document.getElementById('btnSalvarUltrassom').addEventListener('click', async ()=>{
    const data = document.getElementById('ultraData').value;
    const resultado = document.getElementById('ultraResultado').value;
    if(!data){ toast('Informe a data!', 'erro'); return; }
    const reg = cicloAtivo();
    if(!reg){ toast('Nenhum ciclo ativo. Registre uma inseminação primeiro.', 'erro'); return; }
    mostrarLoading(true);
    try {
        const upd = { data_ultrassom: data };
        if(resultado === 'prenhe'){
            const dataParto = addDias(reg.data_inseminacao, gestacaoPorEspecie(animalData?.especie));
            upd.resultado_prenhez = true;
            upd.status = 'Prenhe';
            upd.data_prevista_parto = dataParto;
            toast(`Prenhe! Parto previsto em ${formatarData(dataParto)}.`);
        } else if(resultado === 'vazia'){
            upd.resultado_prenhez = false;
            upd.status = 'Vazia';
            upd.data_prevista_parto = null;
            toast('Fêmea vazia. Ciclo encerrado.');
        } else {
            upd.status = 'Altas chances de prenhez';
            toast('Ultrassom agendado!');
        }
        const { error } = await db.from('agenda_reprodutiva').update(upd).eq('id', reg.id);
        if (error) throw error;
        // Espelha em inseminacoes (status/diagnóstico) quando aplicável
        if (reg.inseminacao_id && (resultado === 'prenhe' || resultado === 'vazia')) {
            await db.from('inseminacoes').update({
                data_diagnostico: data,
                resultado_prenhez: resultado === 'prenhe',
                status: resultado === 'prenhe' ? 'Prenhez Confirmada' : 'Falha',
            }).eq('id', reg.inseminacao_id);
        }
        fecharModal('modalUltrassom');
        await carregarAgenda();
    } catch(e){ toast('Erro: ' + e.message, 'erro'); } finally { mostrarLoading(false); }
});

// EDITAR CIO
document.getElementById('btnSalvarCio').addEventListener('click', async ()=>{
    const previsto = document.getElementById('cioPrevisto').value;
    const real = document.getElementById('cioReal').value;
    const reg = cicloAtivo();
    if(!reg){ toast('Nenhum ciclo encontrado.', 'erro'); return; }
    mostrarLoading(true);
    try {
        const upd = {};
        if(previsto) upd.data_prevista_cio = previsto;
        if(real){ upd.data_cio_real = real; upd.cio_confirmado = true; upd.status_cio = 'retornou'; }
        const { error } = await db.from('agenda_reprodutiva').update(upd).eq('id', reg.id);
        if (error) throw error;
        toast('Dados do cio atualizados!');
        fecharModal('modalEditarCio');
        await carregarAgenda();
    } catch(e){ toast('Erro: ' + e.message, 'erro'); } finally { mostrarLoading(false); }
});

// EDITAR PARTO
document.getElementById('btnSalvarParto').addEventListener('click', async ()=>{
    const previsto = document.getElementById('partoPrevisto').value;
    const real = document.getElementById('partoReal').value;
    const obs = document.getElementById('partoObs').value;
    const reg = cicloAtivo();
    if(!reg){ toast('Nenhum ciclo encontrado.', 'erro'); return; }
    mostrarLoading(true);
    try {
        const upd = {};
        if(previsto) upd.data_prevista_parto = previsto;
        if(real){ upd.data_parto_real = real; upd.status = 'Parto'; }
        if(obs) upd.observacoes = obs;
        const { error } = await db.from('agenda_reprodutiva').update(upd).eq('id', reg.id);
        if (error) throw error;

        if(real){
            await registrarNascimentoNoAnimal({
                data: real, qtd: 1, sexo: '', raca: '', obs: obs || ''
            });
        }
        toast('Parto atualizado com sucesso!');
        fecharModal('modalEditarParto');
        await Promise.all([carregarAnimal(), carregarAgenda()]);
    } catch(e){ toast('Erro: ' + e.message, 'erro'); } finally { mostrarLoading(false); }
});

// ABORTO
document.getElementById('btnSalvarAborto').addEventListener('click', async ()=>{
    const data = document.getElementById('abortoData').value;
    const causa = document.getElementById('abortoCausa').value;
    const reprodutor = document.getElementById('abortoReprodutor').value;
    const obs = document.getElementById('abortoObs').value;
    if(!data){ toast('Informe a data!', 'erro'); return; }
    const reg = cicloAtivo();
    if(!reg){ toast('Nenhum ciclo encontrado.', 'erro'); return; }
    mostrarLoading(true);
    try {
        const { error } = await db.from('agenda_reprodutiva').update({
            status: 'Aborto',
            data_prevista_parto: null,
            data_parto_real: null,
            observacoes: `Aborto em ${data}. Causa: ${causa||'—'}. Reprodutor: ${reprodutor||'—'}. ${obs||''}`
        }).eq('id', reg.id);
        if (error) throw error;

        // Marca historico_aborto no animal
        await db.from('animais').update({ historico_aborto: true }).eq('id', animalId);

        toast('Aborto registrado.');
        fecharModal('modalRegistrarAborto');
        await Promise.all([carregarAnimal(), carregarAgenda()]);
    } catch(e){ toast('Erro: ' + e.message, 'erro'); } finally { mostrarLoading(false); }
});

// NASCIMENTO
document.getElementById('btnSalvarNascimento').addEventListener('click', async ()=>{
    const data = document.getElementById('nascData').value;
    const qtd = parseInt(document.getElementById('nascQtd').value)||1;
    const sexo = document.getElementById('nascSexo').value;
    const raca = document.getElementById('nascRaca').value;
    const obs = document.getElementById('nascObs').value;
    if(!data){ toast('Informe a data!', 'erro'); return; }
    const reg = cicloAtivo();
    mostrarLoading(true);
    try {
        if (reg) {
            const { error } = await db.from('agenda_reprodutiva').update({
                data_parto_real: data,
                status: 'Parto',
                observacoes: `${qtd} cria(s) — Sexo: ${sexo||'—'} — Raça: ${raca||'—'}. ${obs||''}`
            }).eq('id', reg.id);
            if (error) throw error;
        }

        await registrarNascimentoNoAnimal({ data, qtd, sexo, raca, obs });

        toast(`Nascimento registrado! ${qtd} cria(s).`);
        fecharModal('modalRegistrarNascimento');
        await Promise.all([carregarAnimal(), carregarAgenda()]);
    } catch(e){ toast('Erro: ' + e.message, 'erro'); } finally { mostrarLoading(false); }
});

async function registrarNascimentoNoAnimal({ data, qtd, sexo, raca, obs }){
    const isMacho = statusNorm(animalData?.sexo) === 'macho';
    const colArr = isMacho ? 'descendentes' : 'nascimentos';
    const colCnt = isMacho ? 'qtd_descendentes' : 'qtd_nascimentos';

    const { data: a, error: errSel } = await db.from('animais')
        .select(`${colArr}, ${colCnt}`).eq('id', animalId).single();
    if (errSel) throw errSel;

    const arr = Array.isArray(a?.[colArr]) ? a[colArr] : [];
    arr.push({ data, qtd, sexo, raca, obs, criado_em: new Date().toISOString() });
    const novoCount = (a?.[colCnt] || 0) + 1;

    const upd = {};
    upd[colArr] = arr;
    upd[colCnt] = novoCount;

    const { error: errUpd } = await db.from('animais').update(upd).eq('id', animalId);
    if (errUpd) throw errUpd;
}

// ============================================================
// NAVEGAÇÃO CALENDÁRIO
// ============================================================
document.getElementById('btnMesAnt').addEventListener('click', ()=>{
    if(mesAtual===0){ mesAtual=11; anoAtual--; } else mesAtual--;
    montarCalendario(anoAtual, mesAtual);
});
document.getElementById('btnMesProx').addEventListener('click', ()=>{
    if(mesAtual===11){ mesAtual=0; anoAtual++; } else mesAtual++;
    montarCalendario(anoAtual, mesAtual);
});

// Fechar modais ao clicar fora
document.querySelectorAll('.modal-overlay').forEach(m=>{
    m.addEventListener('click', e=>{ if(e.target===m) m.classList.remove('aberto'); });
});

// ============================================================
// INICIALIZAÇÃO — integra com PotygenFazenda
// ============================================================
function atualizarBadgeFazenda(){
    const nomeEl = document.getElementById('fazendaBadgeNome');
    if (!nomeEl) return;
    const f = window.PotygenFazenda?.todasFazendas?.find?.(x=>x.id===fazendaIdAtiva)
           || window.PotygenFazenda?.fazendaAtual;
    nomeEl.textContent = f?.nome || '—';
}

document.addEventListener('DOMContentLoaded', async ()=>{
    animalId = getParam('id');
    console.log('[painel_animal] id da URL =', animalId);
    if(!animalId){
        toast('Nenhum animal selecionado.', 'erro');
        setTimeout(()=> window.location.href = 'agenda-reprodutiva.html', 1500);
        return;
    }

    const hoje = new Date();
    anoAtual = hoje.getFullYear();
    mesAtual = hoje.getMonth();

    // Sessão
    try {
        const { data: { session } } = await db.auth.getSession();
        console.log('[painel_animal] sessão =', !!session, session?.user?.id);
        if (!session){
            toast('Sessão expirada. Faça login.', 'erro');
            setTimeout(()=> window.location.href = '../pages/index.html', 1500);
            return;
        }
        usuarioId = session.user.id;
    } catch(e){ console.error('[auth]', e); }

    // Fazendas — restaura do sessionStorage se PotygenFazenda já estiver populado
    if (typeof window.inicializarFazenda === 'function'){
        try {
            const ativa = await window.inicializarFazenda();
            fazendaIdAtiva = ativa?.id || window.PotygenFazenda?.getFazendaId?.() || null;
        } catch(e){ console.error('[fazenda]', e); }
    } else {
        // Fallback: lê direto do sessionStorage
        const saved = sessionStorage.getItem('fazenda_atual_id')
                   || sessionStorage.getItem('fazendaAtualId')
                   || localStorage.getItem('fazenda_atual_id');
        if (saved) fazendaIdAtiva = saved;
    }
    console.log('[painel_animal] fazendaIdAtiva =', fazendaIdAtiva);
    atualizarBadgeFazenda();

    if (!fazendaIdAtiva){
        // Em vez de redirecionar (o que esconde o erro real),
        // segue sem filtrar por fazenda — a validação posterior
        // em carregarAnimal() ainda protege contra dados de outra fazenda.
        console.warn('[painel_animal] Sem fazenda ativa — seguindo sem filtro de fazenda');
        toast('Nenhuma fazenda ativa detectada — exibindo animal sem filtro.', 'erro');
    }

    // Pré-preencher datas
    ['abortoData','nascData','ultraData','partoReal'].forEach(id=>{
        const el = document.getElementById(id); if (el && !el.value) el.value = dataHoje();
    });

    await carregarAnimal();
    await carregarAgenda();

    // Se trocar fazenda em outra aba, volta para a agenda
    document.addEventListener('fazendaTrocada', (e)=>{
        const novaId = e.detail?.id;
        if (novaId && novaId !== fazendaIdAtiva){
            window.location.href = 'agenda-reprodutiva.html';
        }
    });
});
