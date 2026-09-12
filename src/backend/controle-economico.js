// =========================================================
// controle-economico.js — Potygen Pro
// =========================================================
// Integrado ao sistema de fazendas:
//   - Cada fazenda do mesmo usuário tem seu próprio controle econômico.
//   - Transações e produção são SEMPRE filtradas pela fazenda ativa.
//   - Relatórios PDF / CSV exibem cabeçalho com nome, CPF e localização.
//   - Produção permite vincular um animal (opcional). O PDF de produção
//     ganha uma seção "Produção por Animal" quando há vínculos.
//
// Depende de:
//   - database.js  (supabaseClient)
//   - auth.js      (verificarLogin)
// =========================================================

const CATEGORIAS = {
  receita: ['Venda de Animais','Venda de Leite','Venda de Lã / Fibra','Subsídios / Incentivos','Outros'],
  despesa: ['Alimentação Animal','Vacinas','Medicamentos / Veterinário','Mão de Obra','Equipamentos','Infraestrutura','Combustível / Transporte','Outros'],
};

const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Estado ──
let todasTransacoes  = [];
let finTipoFiltro    = 'todos';
let filtroDataInicio = null;
let filtroDataFim    = null;
let termoBusca       = '';
let uidAtual         = null;
let fazendaAtivaId   = null;          // ← fazenda atualmente selecionada
let animaisFazenda   = [];            // ← animais da fazenda ativa (p/ select de produção)

// Dados da fazenda/produtor (carregados do banco)
let fazendaInfo = { id:null, nome:'Fazenda', cidade:'', estado:'', endereco:'', cpf:'' };

// =========================================================
// HELPERS DE FAZENDA ATIVA
// =========================================================
function lerFazendaAtivaIdLocal() {
  // Tenta várias chaves usadas pelo sistema
  const keys = ['fazendaAtivaId','fazenda_ativa_id','fazendaAtiva','fazendaId','fazenda_id','currentFazendaId'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v && v !== 'null' && v !== 'undefined') return v;
  }
  return null;
}

function salvarFazendaAtivaIdLocal(id) {
  if (!id) return;
  localStorage.setItem('fazendaAtivaId', id);
}

// =========================================================
// INIT
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.replace('../pages/index.html');
    return;
  }
  uidAtual = session.user.id;

  // Integra com o sistema global de fazendas (sidebar + modais de troca/cadastro)
  if (window.PotygenFazendaUI && typeof window.PotygenFazendaUI.inicializar === 'function') {
    try {
      await window.PotygenFazendaUI.inicializar({
        onFazendaTrocada: async (faz) => {
          if (!faz) return;
          fazendaAtivaId = faz.id;
          salvarFazendaAtivaIdLocal(faz.id);
          await carregarDadosFazenda();
          await carregarAnimaisFazenda();
          exibirBadgeFazenda();
          await carregarTransacoes();
          try { await carregarProducao(); } catch(_) {}
        }
      });
      const idPF = window.PotygenFazenda?.getFazendaId?.();
      if (idPF) { fazendaAtivaId = idPF; salvarFazendaAtivaIdLocal(idPF); }
    } catch (e) { console.warn('FazendaUI init falhou:', e); }
  }

  // Resolve a fazenda ativa (fallback)
  if (!fazendaAtivaId) await resolverFazendaAtiva();

  // Carrega dados da fazenda + CPF do produtor
  await carregarDadosFazenda();

  // Carrega animais da fazenda (para vincular na produção)
  await carregarAnimaisFazenda();

  // Selects de ano
  const anoAtual = new Date().getFullYear();
  ['finAno','prodAno'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    for (let a = anoAtual; a >= anoAtual - 5; a--) {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = a;
      sel.appendChild(opt);
    }
  });

  const mesAtual = new Date().getMonth() + 1;
  const semAtual = mesAtual <= 6 ? 1 : 2;
  ['finMes','prodMes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = mesAtual; });
  ['finSemestre','prodSemestre'].forEach(id => { const el = document.getElementById(id); if (el) el.value = semAtual; });

  ['finMes','finSemestre','finAno'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => aplicarFiltroFin());
  });
  ['prodMes','prodSemestre','prodAno'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => carregarProducao());
  });

  const agora = new Date();
  document.getElementById('dataTransacao').value = agora.toISOString().split('T')[0];
  document.getElementById('horaTransacao').value = agora.toTimeString().slice(0, 5);

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('aberto'); });
  });

  exibirBadgeFazenda();
  await carregarTransacoes();
});

// =========================================================
// RESOLVER QUAL É A FAZENDA ATIVA
// =========================================================
async function resolverFazendaAtiva() {
  let id = lerFazendaAtivaIdLocal();

  // Busca fazendas do usuário p/ validar / fallback
  const { data: lista } = await supabaseClient
    .from('fazendas')
    .select('id, nome, cidade, estado, endereco')
    .eq('usuario_id', uidAtual)
    .order('created_at', { ascending: true });

  const minhasFazendas = lista || [];

  if (id && !minhasFazendas.some(f => f.id === id)) id = null; // id inválido p/ esse usuário
  if (!id && minhasFazendas.length) id = minhasFazendas[0].id; // fallback: primeira fazenda

  fazendaAtivaId = id;
  if (id) salvarFazendaAtivaIdLocal(id);
}

async function carregarDadosFazenda() {
  if (!uidAtual || !fazendaAtivaId) {
    fazendaInfo = { id:null, nome:'Fazenda', cidade:'', estado:'', endereco:'', cpf:'' };
    return;
  }

  const { data: faz } = await supabaseClient
    .from('fazendas')
    .select('id, nome, cidade, estado, endereco')
    .eq('id', fazendaAtivaId)
    .eq('usuario_id', uidAtual)
    .maybeSingle();

  const { data: usr } = await supabaseClient
    .from('usuarios')
    .select('cpf')
    .eq('id', uidAtual)
    .maybeSingle();

  fazendaInfo = {
    id:        faz?.id || null,
    nome:      faz?.nome || 'Fazenda',
    cidade:    faz?.cidade || '',
    estado:    faz?.estado || '',
    endereco:  faz?.endereco || '',
    cpf:       usr?.cpf || '',
  };
}

async function carregarAnimaisFazenda() {
  animaisFazenda = [];
  if (!uidAtual || !fazendaAtivaId) return;
  const { data } = await supabaseClient
    .from('animais')
    .select('id, codigo, nome, especie')
    .eq('usuario_id', uidAtual)
    .eq('fazenda_id', fazendaAtivaId)
    .order('codigo', { ascending: true });
  animaisFazenda = data || [];
}

function exibirBadgeFazenda() {
  // Mostra o nome da fazenda ativa logo abaixo do título, se possível
  const sub = document.querySelector('.page-sub');
  if (sub && fazendaInfo.nome) {
    sub.innerHTML = `Gerenciando: <strong style="color:#0d8a4f">${escHtml(fazendaInfo.nome)}</strong>` +
      (fazendaInfo.cidade ? ` — ${escHtml([fazendaInfo.cidade, fazendaInfo.estado].filter(Boolean).join(' - '))}` : '');
  }
}

function localizacaoFazendaTexto() {
  const partes = [];
  if (fazendaInfo.endereco) partes.push(fazendaInfo.endereco);
  const cidEst = [fazendaInfo.cidade, fazendaInfo.estado].filter(Boolean).join(' - ');
  if (cidEst) partes.push(cidEst);
  return partes.join(' — ');
}

// =========================================================
// PERÍODO (helper compartilhado)
// =========================================================
function calcPeriodo(tipo, mes, sem, ano) {
  if (tipo === 'todos') return { inicio: null, fim: null, label: 'Todos os períodos' };
  if (tipo === 'mes') {
    return {
      inicio: `${ano}-${String(mes).padStart(2,'0')}-01`,
      fim:    new Date(ano, mes, 0).toISOString().split('T')[0],
      label:  `${MESES_NOMES[mes-1]} de ${ano}`,
    };
  }
  if (tipo === 'semestre') {
    return sem === 1
      ? { inicio:`${ano}-01-01`, fim:`${ano}-06-30`, label:`1º Semestre de ${ano}` }
      : { inicio:`${ano}-07-01`, fim:`${ano}-12-31`, label:`2º Semestre de ${ano}` };
  }
  return { inicio:`${ano}-01-01`, fim:`${ano}-12-31`, label:`Ano ${ano}` };
}

function toggleSelectsPeriodo(tipo, idMes, idSemestre, idAno) {
  document.getElementById(idMes).style.display      = tipo === 'mes'      ? '' : 'none';
  document.getElementById(idSemestre).style.display = tipo === 'semestre' ? '' : 'none';
  document.getElementById(idAno).style.display      = (tipo === 'mes' || tipo === 'semestre' || tipo === 'ano') ? '' : 'none';
}

// =========================================================
// CARREGAR TRANSAÇÕES — SEMPRE FILTRA POR fazenda_id
// =========================================================
async function carregarTransacoes() {
  if (!uidAtual) return;

  let query = supabaseClient
    .from('transacoes')
    .select('*')
    .eq('usuario_id', uidAtual)
    .order('data', { ascending: false })
    .order('hora', { ascending: false });

  if (fazendaAtivaId) query = query.eq('fazenda_id', fazendaAtivaId);

  if (filtroDataInicio) query = query.gte('data', filtroDataInicio);
  if (filtroDataFim)    query = query.lte('data', filtroDataFim);

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao carregar:', error);
    alert('Erro ao carregar transações.');
    return;
  }

  todasTransacoes = (data || []).filter(t =>
    t.usuario_id === uidAtual &&
    (!fazendaAtivaId || t.fazenda_id === fazendaAtivaId)
  );
  renderizarTudo();
}

// =========================================================
// RENDERIZAÇÃO
// =========================================================
function renderizarTudo() {
  const lista = filtrarLista();
  renderResumo(lista);
  renderTabela(lista);
}

function filtrarLista() {
  if (!termoBusca) return todasTransacoes;
  const t = termoBusca.toLowerCase();
  return todasTransacoes.filter(tx =>
    (tx.descricao || '').toLowerCase().includes(t) ||
    (tx.categoria || '').toLowerCase().includes(t) ||
    (tx.tipo      || '').toLowerCase().includes(t)
  );
}

function renderResumo(lista) {
  const receitas = lista.filter(t => t.tipo === 'receita');
  const despesas = lista.filter(t => t.tipo === 'despesa');
  const totalR   = receitas.reduce((s, t) => s + +t.valor, 0);
  const totalD   = despesas.reduce((s, t) => s + +t.valor, 0);
  const saldo    = totalR - totalD;

  document.getElementById('totalReceitas').textContent = fmtM(totalR);
  document.getElementById('totalDespesas').textContent = fmtM(totalD);
  document.getElementById('totalSaldo').textContent    = fmtM(Math.abs(saldo));
  document.getElementById('qtdReceitas').textContent   = `${receitas.length} transaç${receitas.length === 1 ? 'ão' : 'ões'}`;
  document.getElementById('qtdDespesas').textContent   = `${despesas.length} transaç${despesas.length === 1 ? 'ão' : 'ões'}`;
  document.getElementById('badgeTotal').textContent    = lista.length;

  const elV = document.getElementById('totalSaldo');
  const elI = document.getElementById('iconeSaldo');
  if (saldo >= 0) {
    elV.className = 'resumo-valor green';
    elI.className = 'resumo-icon green';
    elI.innerHTML = '<i class="fa-solid fa-dollar-sign"></i>';
  } else {
    elV.className = 'resumo-valor red';
    elI.className = 'resumo-icon red';
    elI.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
  }
}

function renderTabela(lista) {
  const tbody = document.getElementById('tbodyTransacoes');
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">
      <i class="fa-solid fa-inbox" style="font-size:28px;color:#e2e8f0;display:block;margin-bottom:8px;"></i>
      Nenhuma transação encontrada.
    </td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map(tx => {
    const r   = tx.tipo === 'receita';
    const cls = r ? 'receita' : 'despesa';
    return `<tr>
      <td><span class="tipo-badge ${cls}">
        <i class="fa-solid ${r ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
        ${r ? 'Receita' : 'Despesa'}
      </span></td>
      <td>
        <strong>${escHtml(tx.descricao || '—')}</strong>
        ${tx.observacoes ? `<br><small style="color:#94a3b8">${escHtml(tx.observacoes)}</small>` : ''}
      </td>
      <td>${escHtml(tx.categoria || '—')}</td>
      <td>${fmtD(tx.data)}${tx.hora ? ` <span style="color:#94a3b8;font-size:12px">às ${tx.hora.slice(0,5)}</span>` : ''}</td>
      <td>${tx.quantidade || 1}</td>
      <td class="valor-${cls}">${r ? '+' : '-'} ${fmtM(tx.valor)}</td>
      <td>
        <div class="acoes-tabela">
          <button class="btn-acao editar"  title="Editar"  onclick="editarTransacao('${tx.id}')"><i class="fa-solid fa-pencil"></i></button>
          <button class="btn-acao excluir" title="Excluir" onclick="excluirTransacao('${tx.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// =========================================================
// FILTROS DE PERÍODO — FINANCEIRO
// =========================================================
function setFinTipo(tipo) {
  finTipoFiltro = tipo;
  ['Todos','Mes','Semestre','Ano'].forEach(t =>
    document.getElementById('finTipo'+t).classList.toggle('active', t.toLowerCase() === tipo));
  toggleSelectsPeriodo(tipo, 'finMes', 'finSemestre', 'finAno');
  aplicarFiltroFin();
}

function aplicarFiltroFin() {
  const ano = parseInt(document.getElementById('finAno').value) || new Date().getFullYear();
  const mes = parseInt(document.getElementById('finMes').value) || 1;
  const sem = parseInt(document.getElementById('finSemestre').value) || 1;
  const { inicio, fim, label } = calcPeriodo(finTipoFiltro, mes, sem, ano);

  filtroDataInicio = inicio;
  filtroDataFim    = fim;

  const chip = document.getElementById('finPeriodoChip');
  if (finTipoFiltro === 'todos') {
    chip.style.display = 'none';
  } else {
    document.getElementById('finPeriodoLabel').textContent = label;
    chip.style.display = 'inline-flex';
  }
  carregarTransacoes();
}

function filtrarTabela() {
  termoBusca = document.getElementById('inputBusca').value.trim();
  renderizarTudo();
}

function trocarMainTab(aba) {
  document.getElementById('tabFinanceiro').classList.toggle('active', aba === 'financeiro');
  document.getElementById('tabProducao').classList.toggle('active', aba === 'producao');
  document.getElementById('painelFinanceiro').style.display = aba === 'financeiro' ? '' : 'none';
  document.getElementById('painelProducao').style.display   = aba === 'producao'   ? '' : 'none';
  if (aba === 'producao') carregarProducao();
}

// =========================================================
// MODAL NOVA TRANSAÇÃO
// =========================================================
function abrirNovaTransacao() {
  if (!fazendaAtivaId) { alert('Cadastre / selecione uma fazenda antes de registrar transações.'); return; }
  document.getElementById('editandoId').value        = '';
  document.getElementById('modalTitulo').textContent = 'Nova Transação';
  document.getElementById('descricao').value         = '';
  document.getElementById('quantidade').value        = '1';
  document.getElementById('precoUnitario').value     = '';
  document.getElementById('valorTotal').value        = 'R$ 0,00';
  document.getElementById('observacoes').value       = '';
  const agora = new Date();
  document.getElementById('dataTransacao').value = agora.toISOString().split('T')[0];
  document.getElementById('horaTransacao').value = agora.toTimeString().slice(0, 5);
  setTipo('receita');
  abrirModal('modalTransacao');
}

function setTipo(tipo) {
  document.getElementById('tipoTransacao').value = tipo;
  document.getElementById('btnReceita').className = 'tipo-btn' + (tipo === 'receita' ? ' active receita-ativo' : '');
  document.getElementById('btnDespesa').className = 'tipo-btn' + (tipo === 'despesa' ? ' active despesa-ativo' : '');
  const sel   = document.getElementById('categoria');
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione uma categoria</option>';
  CATEGORIAS[tipo].forEach(cat => {
    const o = document.createElement('option');
    o.value = cat; o.textContent = cat;
    if (cat === atual) o.selected = true;
    sel.appendChild(o);
  });
}

function calcularTotal() {
  const qtd   = parseFloat(document.getElementById('quantidade').value)    || 0;
  const preco = parseFloat(document.getElementById('precoUnitario').value) || 0;
  document.getElementById('valorTotal').value = fmtM(qtd * preco);
}

// =========================================================
// SALVAR TRANSAÇÃO
// =========================================================
async function salvarTransacao() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    alert('Sessão expirada. Faça login novamente.');
    window.location.replace('../pages/index.html');
    return;
  }
  uidAtual = session.user.id;

  if (!fazendaAtivaId) { alert('Nenhuma fazenda ativa. Selecione uma fazenda.'); return; }

  const tipo      = document.getElementById('tipoTransacao').value;
  const editId    = document.getElementById('editandoId').value;
  const categoria = document.getElementById('categoria').value;
  const data      = document.getElementById('dataTransacao').value;
  const hora      = document.getElementById('horaTransacao').value;
  const descricao = document.getElementById('descricao').value.trim().substring(0, 200);
  const qtd       = Math.max(1, Math.min(999999, parseFloat(document.getElementById('quantidade').value) || 1));
  const preco     = Math.max(0, Math.min(99999999, parseFloat(document.getElementById('precoUnitario').value) || 0));
  const obs       = document.getElementById('observacoes').value.trim().substring(0, 500);

  if (!['receita','despesa'].includes(tipo))               { alert('Tipo inválido.'); return; }
  if (!categoria || !CATEGORIAS[tipo].includes(categoria)) { alert('Selecione uma categoria válida.'); return; }
  if (!data)                                               { alert('Informe a data.'); return; }
  if (!descricao)                                          { alert('Preencha a descrição.'); return; }
  if (!preco)                                              { alert('Informe o preço unitário.'); return; }

  if (editId) {
    const existente = todasTransacoes.find(t => t.id === editId);
    if (!existente || existente.usuario_id !== uidAtual) {
      alert('Sem permissão para editar este registro.'); return;
    }
  }

  const payload = {
    tipo, descricao, categoria, data,
    hora: hora || null,
    quantidade: qtd,
    preco_unitario: preco,
    usuario_id: uidAtual,
    fazenda_id: fazendaAtivaId,
    ...(obs && { observacoes: obs }),
  };

  let error;
  if (editId) {
    ({ error } = await supabaseClient
      .from('transacoes')
      .update(payload)
      .eq('id', editId)
      .eq('usuario_id', uidAtual));
  } else {
    ({ error } = await supabaseClient
      .from('transacoes')
      .insert(payload));
  }

  if (error) {
    console.error(error);
    alert('Erro ao salvar: ' + error.message);
    return;
  }

  fecharModal('modalTransacao');
  await carregarTransacoes();
}

// =========================================================
// EDITAR / EXCLUIR TRANSAÇÃO
// =========================================================
function editarTransacao(id) {
  const tx = todasTransacoes.find(t => t.id === id && t.usuario_id === uidAtual);
  if (!tx) { alert('Sem permissão.'); return; }

  document.getElementById('editandoId').value        = id;
  document.getElementById('modalTitulo').textContent = 'Editar Transação';
  setTipo(tx.tipo);
  document.getElementById('categoria').value     = tx.categoria    || '';
  document.getElementById('dataTransacao').value = tx.data         || '';
  document.getElementById('horaTransacao').value = (tx.hora || '').slice(0, 5);
  document.getElementById('descricao').value     = tx.descricao    || '';
  document.getElementById('quantidade').value    = tx.quantidade   || 1;
  document.getElementById('precoUnitario').value = tx.preco_unitario || '';
  document.getElementById('observacoes').value   = tx.observacoes  || '';
  calcularTotal();
  abrirModal('modalTransacao');
}

async function excluirTransacao(id) {
  const tx = todasTransacoes.find(t => t.id === id && t.usuario_id === uidAtual);
  if (!tx) { alert('Sem permissão.'); return; }
  if (!confirm('Tem certeza que deseja excluir esta transação?')) return;

  const { error } = await supabaseClient
    .from('transacoes')
    .delete()
    .eq('id', id)
    .eq('usuario_id', uidAtual);

  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  await carregarTransacoes();
}

// =========================================================
// PDF — FINANCEIRO
// =========================================================
function selecionarOpcaoPDF(radio) {
  const grupo = radio.closest('.opcoes-pdf');
  grupo.querySelectorAll('.opcao-pdf').forEach(el => el.classList.remove('active'));
  radio.closest('.opcao-pdf').classList.add('active');
}

function periodoCorteRelatorio(periodo) {
  const hoje = new Date();
  let dataCorte, labelPeriodo;
  if (periodo === 'mensal') {
    dataCorte = new Date(hoje); dataCorte.setDate(hoje.getDate() - 30);
    labelPeriodo = 'MENSAL';
  } else if (periodo === 'semestral') {
    dataCorte = new Date(hoje); dataCorte.setMonth(hoje.getMonth() - 6);
    labelPeriodo = 'SEMESTRAL';
  } else {
    dataCorte = new Date(hoje); dataCorte.setFullYear(hoje.getFullYear() - 1);
    labelPeriodo = 'ANUAL';
  }
  return { dataCorte, labelPeriodo, hoje };
}

function _cabecalhoPDF(doc, PW, titulo) {
  const VERDE = [13, 138, 79];
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, PW, 50, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('POTYGEN - Sistema de Gestão', 14, 12);

  // Nome da fazenda — destaque
  doc.setFont('helvetica','bold'); doc.setFontSize(12);
  doc.text(fazendaInfo.nome || 'Fazenda', 14, 22);

  // CPF do produtor
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
  if (fazendaInfo.cpf) doc.text(`CPF: ${fazendaInfo.cpf}`, 14, 29);

  // Localização (endereço + cidade/estado)
  const loc = localizacaoFazendaTexto();
  if (loc) doc.text(`Localização: ${loc}`, 14, 35);

  const agora = new Date();
  doc.setFontSize(9);
  doc.text(`Gerado em: ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR')}`,
           PW-14, 35, {align:'right'});
}

async function gerarPDF() {
  if (!uidAtual) return;
  if (!fazendaAtivaId) { alert('Nenhuma fazenda ativa.'); return; }

  const periodo = document.querySelector('input[name="periodoRelatorio"]:checked').value;
  const { dataCorte, labelPeriodo, hoje } = periodoCorteRelatorio(periodo);

  const { data: lista, error } = await supabaseClient
    .from('transacoes')
    .select('*')
    .eq('usuario_id', uidAtual)
    .eq('fazenda_id', fazendaAtivaId)
    .gte('data', dataCorte.toISOString().split('T')[0])
    .order('data', { ascending: false })
    .order('hora', { ascending: false });

  if (error) { alert('Erro ao gerar PDF.'); return; }

  const listaSegura = (lista || []).filter(t => t.usuario_id === uidAtual && t.fazenda_id === fazendaAtivaId);
  const receitas    = listaSegura.filter(t => t.tipo === 'receita');
  const despesas    = listaSegura.filter(t => t.tipo === 'despesa');
  const totalR      = receitas.reduce((s,t) => s + +t.valor, 0);
  const totalD      = despesas.reduce((s,t) => s + +t.valor, 0);
  const saldo       = totalR - totalD;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW  = 210;
  let y     = 0;

  const VERDE  = [13, 138, 79];
  const ESCURO = [30, 30, 30];
  const MEDIO  = [100, 116, 139];
  const BORDA  = [226, 232, 240];

  _cabecalhoPDF(doc, PW, 'Relatório Financeiro');
  y = 60;

  doc.setTextColor(...ESCURO);
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.text(`Relatório Financeiro ${labelPeriodo}`, 14, y);
  y += 10;

  doc.setFillColor(248,250,252);
  doc.setDrawColor(...BORDA);
  doc.roundedRect(14, y, PW-28, 36, 3, 3, 'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(10);
  doc.setTextColor(...VERDE);
  doc.text('Resumo Financeiro', 20, y+9);
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
  doc.setTextColor(...MEDIO);
  doc.text('Total de Receitas:', 20, y+18);
  doc.text('Total de Despesas:', 20, y+25);
  doc.text('Saldo:', 20, y+32);
  doc.setFont('helvetica','bold');
  doc.setTextColor(...ESCURO);
  doc.text(fmtM(totalR), 90, y+18);
  doc.text(fmtM(totalD), 90, y+25);
  doc.setTextColor(...(saldo >= 0 ? VERDE : [220,38,38]));
  doc.text(fmtM(Math.abs(saldo)), 90, y+32);
  y += 46;

  doc.setTextColor(...ESCURO);
  doc.setFont('helvetica','bold'); doc.setFontSize(12);
  doc.text('Transações Detalhadas', 14, y);
  y += 8;

  listaSegura.forEach((tx, i) => {
    const isR  = tx.tipo === 'receita';
    const altH = tx.observacoes ? 34 : 28;

    if (y + altH > 272) {
      _rodape(doc, PW, MEDIO);
      doc.addPage();
      y = 20;
    }

    doc.setFillColor(...(isR ? [240,253,246] : [255,241,242]));
    doc.setDrawColor(...(isR ? [187,247,208] : [254,202,202]));
    doc.roundedRect(14, y, PW-28, altH, 2, 2, 'FD');

    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.setTextColor(...(isR ? VERDE : [220,38,38]));
    doc.text(`${i+1}. ${tx.tipo.toUpperCase()}`, 20, y+7);

    doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    doc.setTextColor(...MEDIO);
    const dtHr = tx.hora ? `${fmtD(tx.data)} às ${tx.hora.slice(0,5)}` : fmtD(tx.data);
    doc.text(`Data: ${dtHr}`, 20, y+13);
    doc.text(`Descrição: ${tx.descricao || '—'}`, 20, y+19);
    doc.text(`Categoria: ${tx.categoria || '—'}`, 20, y+24);

    const qtd   = tx.quantidade    || 1;
    const preco = tx.preco_unitario || tx.valor;
    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.setTextColor(...ESCURO);
    doc.text(`Qtd: ${qtd} × ${fmtM(preco)} = ${fmtM(tx.valor)}`, PW-18, y+13, {align:'right'});

    if (tx.observacoes) {
      doc.setFont('helvetica','italic'); doc.setFontSize(8);
      doc.setTextColor(...MEDIO);
      doc.text(`Obs: ${tx.observacoes}`, 20, y+30);
    }

    y += altH + 4;
  });

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    _rodape(doc, PW, MEDIO, p, total);
  }

  doc.save(`relatorio-financeiro-${slugFazenda()}-${labelPeriodo.toLowerCase()}-${hoje.toISOString().split('T')[0]}.pdf`);
  fecharModal('modalPDF');
}

function _rodape(doc, PW, cor, p, total) {
  doc.setDrawColor(226,232,240);
  doc.line(14, 286, PW-14, 286);
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.setTextColor(...cor);
  if (p && total) doc.text(`Página ${p} de ${total}`, PW/2, 291, {align:'center'});
  doc.text(`Sistema Potygen - ${fazendaInfo.nome || 'Fazenda'}`, PW/2, 296, {align:'center'});
}

// =========================================================
// HELPERS
// =========================================================
function abrirModal(id)  {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('aberto');
  el.style.display = 'flex';
}
function fecharModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('aberto');
  if (el.classList.contains('modal-backdrop')) el.style.display = 'none';
  else el.style.display = '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtM(v) {
  return parseFloat(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
function fmtD(d) {
  if (!d) return '—';
  const [a,m,dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}

// =========================================================
// EXPORTAÇÃO CSV
// =========================================================
function csvCell(v) {
  const s = (v == null ? '' : String(v));
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function baixarCSV(nomeArquivo, linhas) {
  const csv = linhas.map(r => r.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function slugFazenda() {
  return (fazendaInfo.nome || 'fazenda')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'fazenda';
}

async function exportarCSVTransacoes() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { alert('Sessão expirada.'); window.location.replace('../pages/index.html'); return; }
  uidAtual = session.user.id;
  if (!fazendaAtivaId) { alert('Nenhuma fazenda ativa.'); return; }

  const { data, error } = await supabaseClient
    .from('transacoes')
    .select('*')
    .eq('usuario_id', uidAtual)
    .eq('fazenda_id', fazendaAtivaId)
    .order('data', { ascending: false })
    .order('hora', { ascending: false });

  if (error) { alert('Erro ao exportar: ' + error.message); return; }

  const lista = (data || []).filter(t => t.usuario_id === uidAtual && t.fazenda_id === fazendaAtivaId);
  if (!lista.length) { alert('Não há transações para exportar.'); return; }

  const loc = localizacaoFazendaTexto();
  const cab = ['Tipo','Descrição','Categoria','Data','Hora','Quantidade','Preço Unitário','Valor Total','Observações'];
  const linhas = [
    [`Fazenda: ${fazendaInfo.nome}`],
    [`CPF: ${fazendaInfo.cpf || '—'}`],
    [`Localização: ${loc || '—'}`],
    [],
    cab,
    ...lista.map(t => [
      t.tipo === 'receita' ? 'Receita' : 'Despesa',
      t.descricao || '',
      t.categoria || '',
      fmtD(t.data),
      (t.hora || '').slice(0,5),
      t.quantidade ?? 1,
      Number(t.preco_unitario || 0).toFixed(2).replace('.', ','),
      Number(t.valor || 0).toFixed(2).replace('.', ','),
      t.observacoes || '',
    ]),
  ];

  baixarCSV(`transacoes-${slugFazenda()}-${new Date().toISOString().split('T')[0]}.csv`, linhas);
}

async function exportarCSVProducao() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { alert('Sessão expirada.'); window.location.replace('../pages/index.html'); return; }
  uidAtual = session.user.id;
  if (!fazendaAtivaId) { alert('Nenhuma fazenda ativa.'); return; }

  const { data, error } = await supabaseClient
    .from('producao')
    .select('*, animal:animal_id(codigo,nome)')
    .eq('usuario_id', uidAtual)
    .eq('fazenda_id', fazendaAtivaId)
    .order('data', { ascending: false })
    .order('hora', { ascending: false });

  if (error) { alert('Erro ao exportar: ' + error.message); return; }

  const lista = (data || []).filter(p => p.usuario_id === uidAtual && p.fazenda_id === fazendaAtivaId);
  if (!lista.length) { alert('Não há registros de produção para exportar.'); return; }

  const loc = localizacaoFazendaTexto();
  const cab = ['Produto','Espécie','Animal','Data','Hora','Quantidade','Unidade','Qualidade','Valor','Origem','Destino','Lote','Temperatura','Observações'];
  const linhas = [
    [`Fazenda: ${fazendaInfo.nome}`],
    [`CPF: ${fazendaInfo.cpf || '—'}`],
    [`Localização: ${loc || '—'}`],
    [],
    cab,
    ...lista.map(p => [
      PROD_LABELS[p.produto] || p.produto,
      ESP_LABELS[p.especie] || p.especie,
      p.animal ? `${p.animal.codigo || ''}${p.animal.nome ? ' - '+p.animal.nome : ''}` : '',
      fmtD(p.data),
      (p.hora || '').slice(0,5),
      String(p.quantidade ?? '').replace('.', ','),
      p.unidade || '',
      p.qualidade || '',
      Number(p.valor || 0).toFixed(2).replace('.', ','),
      p.origem || '',
      p.destino || '',
      p.lote || '',
      p.temperatura != null ? String(p.temperatura).replace('.', ',') : '',
      p.observacoes || '',
    ]),
  ];

  baixarCSV(`producao-${slugFazenda()}-${new Date().toISOString().split('T')[0]}.csv`, linhas);
}

// =========================================================
// =========== CONTROLE DE PRODUÇÃO ========================
// =========================================================
const PROD_UNIDADES = { leite: 'Litros', carne: 'Kg', couro: 'Unidades', la: 'Kg' };
const PROD_LABELS   = { leite: 'Leite', carne: 'Carne', couro: 'Couro', la: 'Lã' };
const ESP_LABELS    = { bovino: 'Bovino', ovino: 'Ovino', caprino: 'Caprino' };

let producoes      = [];
let prodTipoFiltro = 'todos';
let termoBuscaProd = '';

function setProdTipo(tipo) {
  prodTipoFiltro = tipo;
  ['Todos','Mes','Semestre','Ano'].forEach(t =>
    document.getElementById('prodTipo'+t).classList.toggle('active', t.toLowerCase() === tipo));
  toggleSelectsPeriodo(tipo, 'prodMes', 'prodSemestre', 'prodAno');
  carregarProducao();
}

function periodoProducao() {
  const ano = parseInt(document.getElementById('prodAno').value) || new Date().getFullYear();
  const mes = parseInt(document.getElementById('prodMes').value) || 1;
  const sem = parseInt(document.getElementById('prodSemestre').value) || 1;
  return calcPeriodo(prodTipoFiltro, mes, sem, ano);
}

async function carregarProducao() {
  if (!uidAtual) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    uidAtual = session.user.id;
  }

  const { inicio, fim, label } = periodoProducao();
  document.getElementById('prodPeriodoLabelTabela').textContent = label;
  const chip = document.getElementById('prodPeriodoChip');
  if (prodTipoFiltro === 'todos') {
    chip.style.display = 'none';
  } else {
    document.getElementById('prodPeriodoLabel').textContent = label;
    chip.style.display = 'inline-flex';
  }

  let query = supabaseClient
    .from('producao')
    .select('*, animal:animal_id(codigo,nome)')
    .eq('usuario_id', uidAtual)
    .order('data', { ascending: false })
    .order('hora', { ascending: false });

  if (fazendaAtivaId) query = query.eq('fazenda_id', fazendaAtivaId);

  if (inicio) query = query.gte('data', inicio);
  if (fim)    query = query.lte('data', fim);

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao carregar produção:', error);
    alert('Erro ao carregar produção: ' + error.message);
    return;
  }

  producoes = (data || []).filter(p =>
    p.usuario_id === uidAtual &&
    (!fazendaAtivaId || p.fazenda_id === fazendaAtivaId)
  );
  renderProducao();
}

function filtrarProducao() {
  termoBuscaProd = document.getElementById('inputBuscaProducao').value.trim();
  renderProducao();
}

function listaProducaoFiltrada() {
  if (!termoBuscaProd) return producoes;
  const t = termoBuscaProd.toLowerCase();
  return producoes.filter(p =>
    (PROD_LABELS[p.produto] || p.produto || '').toLowerCase().includes(t) ||
    (ESP_LABELS[p.especie] || p.especie || '').toLowerCase().includes(t) ||
    (p.origem  || '').toLowerCase().includes(t) ||
    (p.destino || '').toLowerCase().includes(t) ||
    (p.lote    || '').toLowerCase().includes(t) ||
    (p.animal && (p.animal.codigo || '').toLowerCase().includes(t)) ||
    (p.animal && (p.animal.nome || '').toLowerCase().includes(t))
  );
}

function renderProducao() {
  const lista = listaProducaoFiltrada();

  const tipos = ['leite','carne','couro','la'];
  const ids   = { leite:'Leite', carne:'Carne', couro:'Couro', la:'La' };
  tipos.forEach(t => {
    const sub = lista.filter(p => p.produto === t);
    const qtd = sub.reduce((s,p) => s + (+p.quantidade || 0), 0);
    const val = sub.reduce((s,p) => s + (+p.valor || 0), 0);
    const un  = t === 'leite' ? 'L' : (t === 'couro' ? 'Un' : 'Kg');
    document.getElementById(`prodQtd${ids[t]}`).textContent = `${formatNum(qtd)} ${un}`;
    document.getElementById(`prodVal${ids[t]}`).textContent = fmtM(val);
    document.getElementById(`prodCnt${ids[t]}`).textContent = `${sub.length} registro(s)`;
  });

  ['bovino','ovino','caprino'].forEach(e => {
    const sub = lista.filter(p => p.especie === e);
    const val = sub.reduce((s,p) => s + (+p.valor || 0), 0);
    const cap = e.charAt(0).toUpperCase() + e.slice(1);
    document.getElementById(`espVal${cap}`).textContent = fmtM(val);
    document.getElementById(`espCnt${cap}`).textContent = `${sub.length} registro(s) no período`;
  });

  document.getElementById('prodBadgeTotal').textContent = lista.length;
  const tbody = document.getElementById('tbodyProducao');
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-row">
      <i class="fa-solid fa-inbox" style="font-size:28px;color:#e2e8f0;display:block;margin-bottom:8px;"></i>
      Nenhum registro de produção no período.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => {
    const un = p.unidade || PROD_UNIDADES[p.produto] || '';
    const origem  = p.origem  ? `De: ${escHtml(p.origem)}`   : '';
    const destino = p.destino ? `Para: ${escHtml(p.destino)}`: '';
    const animal  = p.animal ? `${escHtml(p.animal.codigo || '')}${p.animal.nome ? ' - '+escHtml(p.animal.nome) : ''}` : '—';
    return `<tr>
      <td><span class="prod-mini-badge ${p.produto}">${PROD_LABELS[p.produto] || p.produto}</span></td>
      <td><span class="prod-mini-badge ${p.especie}">${ESP_LABELS[p.especie] || p.especie}</span></td>
      <td>${animal}</td>
      <td>${fmtD(p.data)}<br><small style="color:#94a3b8"><i class="fa-regular fa-clock"></i> ${(p.hora||'').slice(0,5)}</small></td>
      <td><strong>${formatNum(p.quantidade)} ${un}</strong>${p.temperatura != null ? `<br><small style="color:#94a3b8">${p.temperatura}°C</small>` : ''}</td>
      <td><span class="qualidade-circle">${escHtml(p.qualidade || '-')}</span></td>
      <td>${origem}${origem && destino ? '<br>' : ''}${destino || (origem ? '' : '—')}</td>
      <td>${escHtml(p.lote || '—')}</td>
      <td class="valor-receita">${fmtM(p.valor)}</td>
      <td>
        <div class="acoes-tabela">
          <button class="btn-acao excluir" title="Excluir" onclick="excluirProducao('${p.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function formatNum(n) {
  const v = parseFloat(n || 0);
  if (Number.isInteger(v)) return v.toLocaleString('pt-BR');
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

// =========================================================
// MODAL NOVA PRODUÇÃO
// =========================================================
function abrirNovaProducao() {
  if (!fazendaAtivaId) { alert('Cadastre / selecione uma fazenda antes de registrar produção.'); return; }
  document.getElementById('editandoProducaoId').value = '';
  document.getElementById('modalProducaoTitulo').textContent = 'Registrar Produção';
  const agora = new Date();
  document.getElementById('prodData').value = agora.toISOString().split('T')[0];
  document.getElementById('prodHora').value = agora.toTimeString().slice(0,5);
  document.getElementById('prodQuantidade').value = '';
  document.getElementById('prodValor').value      = '';
  document.getElementById('prodOrigem').value     = '';
  document.getElementById('prodDestino').value    = '';
  document.getElementById('prodLote').value       = '';
  document.getElementById('prodTemperatura').value = '';
  document.getElementById('prodObs').value        = '';
  document.getElementById('prodQualidade').value  = 'A';
  setProdProduto('leite');
  setProdEspecie('bovino');
  popularSelectAnimais();
  abrirModal('modalProducao');
}

function popularSelectAnimais() {
  const sel = document.getElementById('prodAnimal');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Nenhum (produção geral) —</option>';
  // Filtra pela espécie atual se possível
  const espAtual = document.getElementById('prodEspecie')?.value || '';
  const lista = espAtual
    ? animaisFazenda.filter(a => (a.especie || '').toLowerCase() === espAtual)
    : animaisFazenda;
  lista.forEach(a => {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = `${a.codigo || ''}${a.nome ? ' - '+a.nome : ''}`;
    sel.appendChild(o);
  });
}

function setProdProduto(tipo) {
  document.getElementById('prodProduto').value = tipo;
  document.querySelectorAll('.prod-tipo-selector .prod-pick').forEach(b => {
    b.classList.toggle('active', b.dataset.tipo === tipo);
  });
  document.getElementById('prodUnidade').value = PROD_UNIDADES[tipo] || 'Litros';
}

function setProdEspecie(esp) {
  document.getElementById('prodEspecie').value = esp;
  document.querySelectorAll('.prod-especie-selector .prod-pick').forEach(b => {
    b.classList.toggle('active', b.dataset.esp === esp);
  });
  popularSelectAnimais();
}

async function salvarProducao() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { alert('Sessão expirada.'); window.location.replace('../pages/index.html'); return; }
  uidAtual = session.user.id;
  if (!fazendaAtivaId) { alert('Nenhuma fazenda ativa.'); return; }

  const produto    = document.getElementById('prodProduto').value;
  const especie    = document.getElementById('prodEspecie').value;
  const data       = document.getElementById('prodData').value;
  const hora       = document.getElementById('prodHora').value;
  const quantidade = parseFloat(document.getElementById('prodQuantidade').value);
  const unidade    = document.getElementById('prodUnidade').value;
  const qualidade  = document.getElementById('prodQualidade').value;
  const valor      = parseFloat(document.getElementById('prodValor').value) || 0;
  const origem     = document.getElementById('prodOrigem').value.trim().substring(0,120);
  const destino    = document.getElementById('prodDestino').value.trim().substring(0,120);
  const lote       = document.getElementById('prodLote').value.trim().substring(0,60);
  const tempStr    = document.getElementById('prodTemperatura').value;
  const temperatura = tempStr === '' ? null : parseFloat(tempStr);
  const observacoes = document.getElementById('prodObs').value.trim().substring(0,500);
  const animalSel   = document.getElementById('prodAnimal');
  const animalId    = animalSel && animalSel.value ? animalSel.value : null;

  if (!produto)             { alert('Selecione o tipo de produção.'); return; }
  if (!especie)             { alert('Selecione a espécie.'); return; }
  if (!data)                { alert('Informe a data.'); return; }
  if (!quantidade || quantidade <= 0) { alert('Informe uma quantidade válida.'); return; }

  const payload = {
    usuario_id: uidAtual,
    fazenda_id: fazendaAtivaId,
    animal_id:  animalId,
    produto, especie, data,
    hora: hora || null,
    quantidade, unidade, qualidade, valor,
    origem: origem || null,
    destino: destino || null,
    lote: lote || null,
    temperatura,
    observacoes: observacoes || null,
  };

  const { error } = await supabaseClient.from('producao').insert(payload);
  if (error) { alert('Erro ao salvar: ' + error.message); return; }

  fecharModal('modalProducao');
  await carregarProducao();
}

async function excluirProducao(id) {
  if (!confirm('Excluir este registro de produção?')) return;
  const { error } = await supabaseClient
    .from('producao').delete().eq('id', id).eq('usuario_id', uidAtual);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  await carregarProducao();
}

// =========================================================
// PDF — PRODUÇÃO (com seção "Produção por Animal")
// =========================================================
async function gerarPDFProducao() {
  if (!uidAtual) return;
  if (!fazendaAtivaId) { alert('Nenhuma fazenda ativa.'); return; }

  const periodo = document.querySelector('input[name="periodoRelatorioProd"]:checked').value;
  const { dataCorte, labelPeriodo, hoje } = periodoCorteRelatorio(periodo);

  const { data: lista, error } = await supabaseClient
    .from('producao')
    .select('*, animal:animal_id(codigo,nome)')
    .eq('usuario_id', uidAtual)
    .eq('fazenda_id', fazendaAtivaId)
    .gte('data', dataCorte.toISOString().split('T')[0])
    .order('data', { ascending: false })
    .order('hora', { ascending: false });

  if (error) { alert('Erro ao gerar PDF.'); return; }

  const listaSegura = (lista || []).filter(p => p.usuario_id === uidAtual && p.fazenda_id === fazendaAtivaId);
  const valorTotal  = listaSegura.reduce((s,p) => s + (+p.valor || 0), 0);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW  = 210;
  let y     = 0;

  const VERDE  = [13, 138, 79];
  const ESCURO = [30, 30, 30];
  const MEDIO  = [100, 116, 139];
  const BORDA  = [226, 232, 240];

  _cabecalhoPDF(doc, PW, 'Relatório de Produção');
  y = 60;

  doc.setTextColor(...ESCURO);
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.text(`Relatório de Produção ${labelPeriodo}`, 14, y);
  y += 10;

  // Resumo por produto
  const tipos = ['leite','carne','couro','la'];
  doc.setFillColor(248,250,252);
  doc.setDrawColor(...BORDA);
  doc.roundedRect(14, y, PW-28, 50, 3, 3, 'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(10);
  doc.setTextColor(...VERDE);
  doc.text('Resumo da Produção', 20, y+9);
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
  let ry = y + 18;
  tipos.forEach(t => {
    const sub = listaSegura.filter(p => p.produto === t);
    const qtd = sub.reduce((s,p) => s + (+p.quantidade || 0), 0);
    const val = sub.reduce((s,p) => s + (+p.valor || 0), 0);
    const un  = PROD_UNIDADES[t] || '';
    doc.setTextColor(...MEDIO);
    doc.text(`${PROD_LABELS[t]}:`, 20, ry);
    doc.setFont('helvetica','bold'); doc.setTextColor(...ESCURO);
    doc.text(`${formatNum(qtd)} ${un}`, 70, ry);
    doc.text(fmtM(val), 140, ry);
    doc.setFont('helvetica','normal');
    ry += 7;
  });
  doc.setFont('helvetica','bold'); doc.setTextColor(...VERDE);
  doc.text('Valor total estimado:', 20, ry);
  doc.text(fmtM(valorTotal), 140, ry);
  y += 60;

  // ===== Produção por Animal (se houver vínculos) =====
  const porAnimal = listaSegura.filter(p => p.animal_id);
  if (porAnimal.length) {
    if (y > 240) { _rodape(doc, PW, MEDIO); doc.addPage(); y = 20; }
    doc.setTextColor(...ESCURO);
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Produção por Animal', 14, y);
    y += 8;

    // Agrupa por animal_id
    const grupos = {};
    porAnimal.forEach(p => {
      const key = p.animal_id;
      if (!grupos[key]) {
        const rotulo = p.animal
          ? `${p.animal.codigo || ''}${p.animal.nome ? ' - '+p.animal.nome : ''}`
          : 'Animal';
        grupos[key] = { rotulo, registros: [], totalVal: 0, porProduto: {} };
      }
      grupos[key].registros.push(p);
      grupos[key].totalVal += (+p.valor || 0);
      const pkey = p.produto;
      if (!grupos[key].porProduto[pkey]) grupos[key].porProduto[pkey] = { qtd: 0, un: p.unidade || PROD_UNIDADES[pkey] || '' };
      grupos[key].porProduto[pkey].qtd += (+p.quantidade || 0);
    });

    Object.values(grupos).forEach(g => {
      const linhasProd = Object.entries(g.porProduto);
      const altH = 16 + linhasProd.length * 6;
      if (y + altH > 272) { _rodape(doc, PW, MEDIO); doc.addPage(); y = 20; }

      doc.setFillColor(240,253,246);
      doc.setDrawColor(187,247,208);
      doc.roundedRect(14, y, PW-28, altH, 2, 2, 'FD');

      doc.setFont('helvetica','bold'); doc.setFontSize(10);
      doc.setTextColor(...VERDE);
      doc.text(`Animal: ${g.rotulo}`, 20, y+8);

      doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.setTextColor(...ESCURO);
      doc.text(`Total: ${fmtM(g.totalVal)}  |  ${g.registros.length} registro(s)`, PW-18, y+8, {align:'right'});

      doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.setTextColor(...MEDIO);
      let ly = y + 14;
      linhasProd.forEach(([prod, info]) => {
        doc.text(`• ${PROD_LABELS[prod] || prod}: ${formatNum(info.qtd)} ${info.un}`, 22, ly);
        ly += 6;
      });

      y += altH + 4;
    });
    y += 4;
  }

  // Registros detalhados
  if (y > 250) { _rodape(doc, PW, MEDIO); doc.addPage(); y = 20; }
  doc.setTextColor(...ESCURO);
  doc.setFont('helvetica','bold'); doc.setFontSize(12);
  doc.text('Registros Detalhados', 14, y);
  y += 8;

  listaSegura.forEach((p, i) => {
    const altH = p.observacoes ? 38 : 32;
    if (y + altH > 272) {
      _rodape(doc, PW, MEDIO);
      doc.addPage();
      y = 20;
    }

    doc.setFillColor(240,253,246);
    doc.setDrawColor(187,247,208);
    doc.roundedRect(14, y, PW-28, altH, 2, 2, 'FD');

    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.setTextColor(...VERDE);
    doc.text(`${i+1}. ${(PROD_LABELS[p.produto] || p.produto).toUpperCase()} — ${ESP_LABELS[p.especie] || p.especie}`, 20, y+7);

    doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    doc.setTextColor(...MEDIO);
    const dtHr = p.hora ? `${fmtD(p.data)} às ${p.hora.slice(0,5)}` : fmtD(p.data);
    const un   = p.unidade || PROD_UNIDADES[p.produto] || '';
    doc.text(`Data: ${dtHr}`, 20, y+13);
    doc.text(`Quantidade: ${formatNum(p.quantidade)} ${un}   |   Qualidade: ${p.qualidade || '—'}`, 20, y+19);
    const rota = [p.origem ? `De: ${p.origem}` : '', p.destino ? `Para: ${p.destino}` : ''].filter(Boolean).join('  ');
    doc.text(`${rota || 'Origem/Destino: —'}${p.lote ? `   |   Lote: ${p.lote}` : ''}`, 20, y+24);
    if (p.animal) {
      doc.text(`Animal: ${p.animal.codigo || ''}${p.animal.nome ? ' - '+p.animal.nome : ''}`, 20, y+29);
    }

    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.setTextColor(...ESCURO);
    doc.text(fmtM(p.valor), PW-18, y+13, {align:'right'});

    if (p.observacoes) {
      doc.setFont('helvetica','italic'); doc.setFontSize(8);
      doc.setTextColor(...MEDIO);
      doc.text(`Obs: ${p.observacoes}`, 20, y + (p.animal ? 34 : 30));
    }

    y += altH + 4;
  });

  const total = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    _rodape(doc, PW, MEDIO, pg, total);
  }

  doc.save(`relatorio-producao-${slugFazenda()}-${labelPeriodo.toLowerCase()}-${hoje.toISOString().split('T')[0]}.pdf`);
  fecharModal('modalPDFProd');
}
