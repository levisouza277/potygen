/* =========================================================================
   POTYGEN PRO — script-analise.js
   Motor de Predição Reprodutiva (brain.js + Embrapa + Open-Meteo + Supabase)
   =========================================================================
   Dependências carregadas no HTML (em ordem):
     - https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
     - https://cdn.jsdelivr.net/npm/brain.js@2.0.0-beta.23/dist/browser.min.js
   ========================================================================= */

/* ---------- 1) SUPABASE ----------
   O cliente já é criado em database.js como `const supabaseClient`.
   Aqui apenas garantimos que ele esteja exposto em window para os demais módulos. */
if (typeof supabaseClient !== 'undefined' && !window.supabaseClient) {
    window.supabaseClient = supabaseClient;
}

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
        document.body.classList.remove('modal-open');
    };
}

/* ---------- 2) ESTADO GLOBAL ---------- */
let todosAnimaisFemeas = [];
let todosAnimaisMachos = [];
let femeaSelecionada = null;   // objeto completo da tabela animais
let machoSelecionado = null;
let fazendaSelecionada = null; // {id, cidade, estado, latitude, longitude}
let climaAtual = null;         // {temperatura, umidade, itu, dataHora}
let coefF = 0;                 // Wright F em %
let netReady = false;
let net = null;

/* ---------- 3) DATASETS CIENTÍFICOS ---------- */
const finalidadesPorEspecie = {
    Bovino:  ['Corte', 'Leite', 'Dupla Aptidão', 'Melhoramento Genético'],
    Ovino:   ['Corte', 'Lã', 'Leite', 'Couro', 'Dupla Aptidão'],
    Caprino: ['Corte (Carne)', 'Leite', 'Couro', 'Dupla Aptidão']
};

const FAIXA_TERMICA = {
    Bovino:  { min: 20, max: 32, perdaPorGrauAcima: 1.5, limiteSuperior: 32 },
    Caprino: { min: 18, max: 28, perdaPorGrauAcima: 2.0, limiteSuperior: 30 },
    Ovino:   { min: 15, max: 25, perdaPorGrauAcima: 3.5, limiteSuperior: 28 }
};

const PESOS_FATORES = {
    Bovino:  { ecc:25, idade:15, peso:10, abortos:15, filhos:5, doencas:20, temperatura:10 },
    Ovino:   { ecc:30, idade:15, peso:10, abortos:10, filhos:5, doencas:15, temperatura:15 },
    Caprino: { ecc:30, idade:15, peso:10, abortos:10, filhos:5, doencas:20, temperatura:10 }
};

/* Dataset de raças (Embrapa + ABCZ + SciELO) */
const RACAS_DATASET = [
    {"raça":"Nelore","espécie":"Bovino","corte":95,"leite":10,"lã":0,"couro":85,"dupla_aptidão":25,"melhoramento_genético":95,"adaptação_semiárido":95,"resistência_calor":95,"resistência_seca":90,"ecc_ideal":3.25,"peso_ideal":420,"impacto_ecc":-20,"impacto_idade":-3,"impacto_peso":-5,"impacto_abortos":-20},
    {"raça":"Angus","espécie":"Bovino","corte":95,"leite":15,"lã":0,"couro":70,"dupla_aptidão":20,"melhoramento_genético":90,"adaptação_semiárido":35,"resistência_calor":30,"resistência_seca":30,"ecc_ideal":3.5,"peso_ideal":480,"impacto_ecc":-25,"impacto_idade":-5,"impacto_peso":-7,"impacto_abortos":-25},
    {"raça":"Hereford","espécie":"Bovino","corte":92,"leite":15,"lã":0,"couro":75,"dupla_aptidão":25,"melhoramento_genético":85,"adaptação_semiárido":35,"resistência_calor":35,"resistência_seca":35,"ecc_ideal":3.5,"peso_ideal":470,"impacto_ecc":-25,"impacto_idade":-5,"impacto_peso":-6,"impacto_abortos":-25},
    {"raça":"Gir","espécie":"Bovino","corte":40,"leite":85,"lã":0,"couro":80,"dupla_aptidão":60,"melhoramento_genético":90,"adaptação_semiárido":92,"resistência_calor":95,"resistência_seca":85,"ecc_ideal":3.0,"peso_ideal":410,"impacto_ecc":-18,"impacto_idade":-2,"impacto_peso":-4,"impacto_abortos":-18},
    {"raça":"Brahman","espécie":"Bovino","corte":90,"leite":15,"lã":0,"couro":85,"dupla_aptidão":30,"melhoramento_genético":88,"adaptação_semiárido":90,"resistência_calor":92,"resistência_seca":88,"ecc_ideal":3.25,"peso_ideal":450,"impacto_ecc":-20,"impacto_idade":-3,"impacto_peso":-5,"impacto_abortos":-20},
    {"raça":"Guzerá","espécie":"Bovino","corte":85,"leite":70,"lã":0,"couro":85,"dupla_aptidão":90,"melhoramento_genético":92,"adaptação_semiárido":96,"resistência_calor":96,"resistência_seca":95,"ecc_ideal":3.25,"peso_ideal":430,"impacto_ecc":-18,"impacto_idade":-2,"impacto_peso":-4,"impacto_abortos":-18},
    {"raça":"Tabapuã","espécie":"Bovino","corte":90,"leite":20,"lã":0,"couro":85,"dupla_aptidão":35,"melhoramento_genético":90,"adaptação_semiárido":90,"resistência_calor":92,"resistência_seca":85,"ecc_ideal":3.25,"peso_ideal":440,"impacto_ecc":-20,"impacto_idade":-3,"impacto_peso":-5,"impacto_abortos":-20},
    {"raça":"Senepol","espécie":"Bovino","corte":88,"leite":20,"lã":0,"couro":80,"dupla_aptidão":40,"melhoramento_genético":85,"adaptação_semiárido":82,"resistência_calor":85,"resistência_seca":75,"ecc_ideal":3.25,"peso_ideal":420,"impacto_ecc":-20,"impacto_idade":-3,"impacto_peso":-5,"impacto_abortos":-22},
    {"raça":"Caracu","espécie":"Bovino","corte":80,"leite":55,"lã":0,"couro":85,"dupla_aptidão":80,"melhoramento_genético":80,"adaptação_semiárido":85,"resistência_calor":85,"resistência_seca":80,"ecc_ideal":3.0,"peso_ideal":440,"impacto_ecc":-18,"impacto_idade":-3,"impacto_peso":-4,"impacto_abortos":-20},
    {"raça":"Holandês","espécie":"Bovino","corte":20,"leite":98,"lã":0,"couro":65,"dupla_aptidão":30,"melhoramento_genético":90,"adaptação_semiárido":20,"resistência_calor":15,"resistência_seca":15,"ecc_ideal":3.0,"peso_ideal":500,"impacto_ecc":-30,"impacto_idade":-6,"impacto_peso":-8,"impacto_abortos":-30},
    {"raça":"Jersey","espécie":"Bovino","corte":15,"leite":90,"lã":0,"couro":60,"dupla_aptidão":25,"melhoramento_genético":85,"adaptação_semiárido":45,"resistência_calor":45,"resistência_seca":35,"ecc_ideal":3.0,"peso_ideal":360,"impacto_ecc":-25,"impacto_idade":-4,"impacto_peso":-5,"impacto_abortos":-25},
    {"raça":"Girolando","espécie":"Bovino","corte":40,"leite":85,"lã":0,"couro":75,"dupla_aptidão":65,"melhoramento_genético":88,"adaptação_semiárido":75,"resistência_calor":75,"resistência_seca":65,"ecc_ideal":3.0,"peso_ideal":450,"impacto_ecc":-22,"impacto_idade":-4,"impacto_peso":-5,"impacto_abortos":-24},
    {"raça":"Sindi","espécie":"Bovino","corte":75,"leite":75,"lã":0,"couro":85,"dupla_aptidão":98,"melhoramento_genético":90,"adaptação_semiárido":98,"resistência_calor":98,"resistência_seca":98,"ecc_ideal":3.0,"peso_ideal":360,"impacto_ecc":-15,"impacto_idade":-2,"impacto_peso":-3,"impacto_abortos":-15},
    {"raça":"Bonsmara","espécie":"Bovino","corte":88,"leite":30,"lã":0,"couro":80,"dupla_aptidão":45,"melhoramento_genético":82,"adaptação_semiárido":78,"resistência_calor":80,"resistência_seca":70,"ecc_ideal":3.25,"peso_ideal":440,"impacto_ecc":-20,"impacto_idade":-4,"impacto_peso":-5,"impacto_abortos":-22},
    {"raça":"Brangus","espécie":"Bovino","corte":92,"leite":20,"lã":0,"couro":80,"dupla_aptidão":35,"melhoramento_genético":88,"adaptação_semiárido":70,"resistência_calor":72,"resistência_seca":60,"ecc_ideal":3.5,"peso_ideal":460,"impacto_ecc":-22,"impacto_idade":-4,"impacto_peso":-6,"impacto_abortos":-24},
    {"raça":"Braford","espécie":"Bovino","corte":90,"leite":20,"lã":0,"couro":80,"dupla_aptidão":35,"melhoramento_genético":85,"adaptação_semiárido":68,"resistência_calor":70,"resistência_seca":58,"ecc_ideal":3.5,"peso_ideal":460,"impacto_ecc":-22,"impacto_idade":-4,"impacto_peso":-6,"impacto_abortos":-24},
    {"raça":"Canchim","espécie":"Bovino","corte":90,"leite":15,"lã":0,"couro":80,"dupla_aptidão":30,"melhoramento_genético":85,"adaptação_semiárido":76,"resistência_calor":80,"resistência_seca":70,"ecc_ideal":3.25,"peso_ideal":450,"impacto_ecc":-20,"impacto_idade":-3,"impacto_peso":-5,"impacto_abortos":-20},
    {"raça":"Santa Gertrudis","espécie":"Bovino","corte":88,"leite":35,"lã":0,"couro":80,"dupla_aptidão":50,"melhoramento_genético":80,"adaptação_semiárido":78,"resistência_calor":82,"resistência_seca":72,"ecc_ideal":3.25,"peso_ideal":460,"impacto_ecc":-20,"impacto_idade":-4,"impacto_peso":-5,"impacto_abortos":-22},
    {"raça":"Limousin","espécie":"Bovino","corte":93,"leite":10,"lã":0,"couro":75,"dupla_aptidão":20,"melhoramento_genético":85,"adaptação_semiárido":30,"resistência_calor":30,"resistência_seca":25,"ecc_ideal":3.5,"peso_ideal":490,"impacto_ecc":-26,"impacto_idade":-5,"impacto_peso":-7,"impacto_abortos":-26},
    {"raça":"Charolês","espécie":"Bovino","corte":94,"leite":12,"lã":0,"couro":70,"dupla_aptidão":20,"melhoramento_genético":86,"adaptação_semiárido":25,"resistência_calor":25,"resistência_seca":20,"ecc_ideal":3.5,"peso_ideal":510,"impacto_ecc":-28,"impacto_idade":-6,"impacto_peso":-8,"impacto_abortos":-28},
    {"raça":"Devon","espécie":"Bovino","corte":88,"leite":20,"lã":0,"couro":75,"dupla_aptidão":30,"melhoramento_genético":80,"adaptação_semiárido":32,"resistência_calor":30,"resistência_seca":30,"ecc_ideal":3.5,"peso_ideal":460,"impacto_ecc":-25,"impacto_idade":-5,"impacto_peso":-6,"impacto_abortos":-25},
    {"raça":"Red Angus","espécie":"Bovino","corte":94,"leite":15,"lã":0,"couro":70,"dupla_aptidão":20,"melhoramento_genético":90,"adaptação_semiárido":38,"resistência_calor":38,"resistência_seca":32,"ecc_ideal":3.5,"peso_ideal":475,"impacto_ecc":-25,"impacto_idade":-5,"impacto_peso":-6,"impacto_abortos":-25},
    {"raça":"Wagyu","espécie":"Bovino","corte":98,"leite":10,"lã":0,"couro":65,"dupla_aptidão":15,"melhoramento_genético":95,"adaptação_semiárido":40,"resistência_calor":40,"resistência_seca":35,"ecc_ideal":3.5,"peso_ideal":440,"impacto_ecc":-24,"impacto_idade":-4,"impacto_peso":-6,"impacto_abortos":-22},
    {"raça":"Normanda","espécie":"Bovino","corte":65,"leite":70,"lã":0,"couro":75,"dupla_aptidão":85,"melhoramento_genético":75,"adaptação_semiárido":45,"resistência_calor":40,"resistência_seca":40,"ecc_ideal":3.25,"peso_ideal":480,"impacto_ecc":-24,"impacto_idade":-5,"impacto_peso":-6,"impacto_abortos":-24},
    {"raça":"Pardo Suíço","espécie":"Bovino","corte":60,"leite":80,"lã":0,"couro":80,"dupla_aptidão":85,"melhoramento_genético":82,"adaptação_semiárido":65,"resistência_calor":65,"resistência_seca":55,"ecc_ideal":3.25,"peso_ideal":470,"impacto_ecc":-22,"impacto_idade":-4,"impacto_peso":-5,"impacto_abortos":-22},

    {"raça":"Dorper","espécie":"Ovino","corte":95,"leite":15,"lã":0,"couro":80,"dupla_aptidão":30,"melhoramento_genético":0,"adaptação_semiárido":75,"resistência_calor":78,"resistência_seca":70,"ecc_ideal":3.0,"peso_ideal":45,"impacto_ecc":-18,"impacto_idade":-5,"impacto_peso":-4,"impacto_abortos":-25},
    {"raça":"Santa Inês","espécie":"Ovino","corte":85,"leite":20,"lã":0,"couro":95,"dupla_aptidão":55,"melhoramento_genético":0,"adaptação_semiárido":95,"resistência_calor":95,"resistência_seca":90,"ecc_ideal":3.0,"peso_ideal":42,"impacto_ecc":-15,"impacto_idade":-4,"impacto_peso":-3,"impacto_abortos":-20},
    {"raça":"Suffolk","espécie":"Ovino","corte":92,"leite":10,"lã":40,"couro":65,"dupla_aptidão":20,"melhoramento_genético":0,"adaptação_semiárido":30,"resistência_calor":25,"resistência_seca":25,"ecc_ideal":3.25,"peso_ideal":55,"impacto_ecc":-25,"impacto_idade":-7,"impacto_peso":-6,"impacto_abortos":-28},
    {"raça":"Hampshire Down","espécie":"Ovino","corte":90,"leite":12,"lã":45,"couro":65,"dupla_aptidão":20,"melhoramento_genético":0,"adaptação_semiárido":30,"resistência_calor":25,"resistência_seca":25,"ecc_ideal":3.25,"peso_ideal":52,"impacto_ecc":-25,"impacto_idade":-7,"impacto_peso":-6,"impacto_abortos":-28},
    {"raça":"Morada Nova","espécie":"Ovino","corte":70,"leite":25,"lã":0,"couro":100,"dupla_aptidão":65,"melhoramento_genético":0,"adaptação_semiárido":100,"resistência_calor":100,"resistência_seca":100,"ecc_ideal":2.75,"peso_ideal":32,"impacto_ecc":-12,"impacto_idade":-3,"impacto_peso":-2,"impacto_abortos":-15},
    {"raça":"Bergamácia","espécie":"Ovino","corte":65,"leite":65,"lã":25,"couro":75,"dupla_aptidão":75,"melhoramento_genético":0,"adaptação_semiárido":65,"resistência_calor":65,"resistência_seca":60,"ecc_ideal":3.0,"peso_ideal":48,"impacto_ecc":-20,"impacto_idade":-5,"impacto_peso":-5,"impacto_abortos":-22},
    {"raça":"Crioulo","espécie":"Ovino","corte":60,"leite":20,"lã":50,"couro":80,"dupla_aptidão":55,"melhoramento_genético":0,"adaptação_semiárido":60,"resistência_calor":60,"resistência_seca":65,"ecc_ideal":2.75,"peso_ideal":35,"impacto_ecc":-15,"impacto_idade":-4,"impacto_peso":-3,"impacto_abortos":-18},
    {"raça":"Texel","espécie":"Ovino","corte":96,"leite":10,"lã":40,"couro":70,"dupla_aptidão":20,"melhoramento_genético":0,"adaptação_semiárido":25,"resistência_calor":20,"resistência_seca":20,"ecc_ideal":3.25,"peso_ideal":52,"impacto_ecc":-26,"impacto_idade":-7,"impacto_peso":-6,"impacto_abortos":-28},
    {"raça":"Somalis Brasileira","espécie":"Ovino","corte":75,"leite":15,"lã":0,"couro":95,"dupla_aptidão":50,"melhoramento_genético":0,"adaptação_semiárido":98,"resistência_calor":98,"resistência_seca":100,"ecc_ideal":3.0,"peso_ideal":34,"impacto_ecc":-12,"impacto_idade":-3,"impacto_peso":-3,"impacto_abortos":-15},
    {"raça":"Ile de France","espécie":"Ovino","corte":94,"leite":15,"lã":45,"couro":70,"dupla_aptidão":25,"melhoramento_genético":0,"adaptação_semiárido":32,"resistência_calor":30,"resistência_seca":25,"ecc_ideal":3.5,"peso_ideal":54,"impacto_ecc":-25,"impacto_idade":-6,"impacto_peso":-6,"impacto_abortos":-26},
    {"raça":"Rabo Largo","espécie":"Ovino","corte":72,"leite":20,"lã":0,"couro":92,"dupla_aptidão":60,"melhoramento_genético":0,"adaptação_semiárido":96,"resistência_calor":96,"resistência_seca":98,"ecc_ideal":3.0,"peso_ideal":38,"impacto_ecc":-14,"impacto_idade":-3,"impacto_peso":-3,"impacto_abortos":-16},
    {"raça":"Lacaune","espécie":"Ovino","corte":30,"leite":95,"lã":20,"couro":60,"dupla_aptidão":40,"melhoramento_genético":0,"adaptação_semiárido":20,"resistência_calor":15,"resistência_seca":15,"ecc_ideal":3.0,"peso_ideal":48,"impacto_ecc":-26,"impacto_idade":-6,"impacto_peso":-6,"impacto_abortos":-28},
    {"raça":"Katahdin","espécie":"Ovino","corte":82,"leite":20,"lã":0,"couro":85,"dupla_aptidão":45,"melhoramento_genético":0,"adaptação_semiárido":80,"resistência_calor":82,"resistência_seca":75,"ecc_ideal":3.0,"peso_ideal":44,"impacto_ecc":-16,"impacto_idade":-4,"impacto_peso":-4,"impacto_abortos":-20},
    {"raça":"White Dorper","espécie":"Ovino","corte":95,"leite":15,"lã":0,"couro":80,"dupla_aptidão":30,"melhoramento_genético":0,"adaptação_semiárido":76,"resistência_calor":80,"resistência_seca":72,"ecc_ideal":3.25,"peso_ideal":46,"impacto_ecc":-18,"impacto_idade":-5,"impacto_peso":-4,"impacto_abortos":-25},
    {"raça":"Corriedale","espécie":"Ovino","corte":65,"leite":20,"lã":80,"couro":70,"dupla_aptidão":80,"melhoramento_genético":0,"adaptação_semiárido":25,"resistência_calor":20,"resistência_seca":20,"ecc_ideal":3.25,"peso_ideal":48,"impacto_ecc":-25,"impacto_idade":-6,"impacto_peso":-5,"impacto_abortos":-26},
    {"raça":"Merino","espécie":"Ovino","corte":50,"leite":15,"lã":98,"couro":70,"dupla_aptidão":60,"melhoramento_genético":0,"adaptação_semiárido":25,"resistência_calor":20,"resistência_seca":25,"ecc_ideal":3.25,"peso_ideal":46,"impacto_ecc":-25,"impacto_idade":-6,"impacto_peso":-5,"impacto_abortos":-25},
    {"raça":"Pantaneiro","espécie":"Ovino","corte":62,"leite":20,"lã":30,"couro":80,"dupla_aptidão":60,"melhoramento_genético":0,"adaptação_semiárido":55,"resistência_calor":60,"resistência_seca":50,"ecc_ideal":2.75,"peso_ideal":36,"impacto_ecc":-16,"impacto_idade":-4,"impacto_peso":-4,"impacto_abortos":-18},

    {"raça":"Boer","espécie":"Caprino","corte":98,"leite":15,"lã":0,"couro":85,"dupla_aptidão":30,"melhoramento_genético":0,"adaptação_semiárido":76,"resistência_calor":80,"resistência_seca":70,"ecc_ideal":3.25,"peso_ideal":44,"impacto_ecc":-18,"impacto_idade":-4,"impacto_peso":-4,"impacto_abortos":-22},
    {"raça":"Saanen","espécie":"Caprino","corte":20,"leite":98,"lã":0,"couro":65,"dupla_aptidão":35,"melhoramento_genético":0,"adaptação_semiárido":30,"resistência_calor":25,"resistência_seca":20,"ecc_ideal":2.75,"peso_ideal":46,"impacto_ecc":-25,"impacto_idade":-6,"impacto_peso":-6,"impacto_abortos":-26},
    {"raça":"Anglo-Nubiana","espécie":"Caprino","corte":75,"leite":75,"lã":0,"couro":88,"dupla_aptidão":95,"melhoramento_genético":0,"adaptação_semiárido":86,"resistência_calor":88,"resistência_seca":80,"ecc_ideal":3.0,"peso_ideal":42,"impacto_ecc":-15,"impacto_idade":-4,"impacto_peso":-3,"impacto_abortos":-20},
    {"raça":"Parda Alpina","espécie":"Caprino","corte":35,"leite":85,"lã":0,"couro":70,"dupla_aptidão":50,"melhoramento_genético":0,"adaptação_semiárido":40,"resistência_calor":40,"resistência_seca":35,"ecc_ideal":2.75,"peso_ideal":44,"impacto_ecc":-22,"impacto_idade":-5,"impacto_peso":-5,"impacto_abortos":-24},
    {"raça":"Toggenburg","espécie":"Caprino","corte":30,"leite":82,"lã":0,"couro":70,"dupla_aptidão":45,"melhoramento_genético":0,"adaptação_semiárido":35,"resistência_calor":35,"resistência_seca":30,"ecc_ideal":2.75,"peso_ideal":44,"impacto_ecc":-24,"impacto_idade":-6,"impacto_peso":-5,"impacto_abortos":-25},
    {"raça":"Moxotó","espécie":"Caprino","corte":65,"leite":35,"lã":0,"couro":100,"dupla_aptidão":70,"melhoramento_genético":0,"adaptação_semiárido":100,"resistência_calor":100,"resistência_seca":100,"ecc_ideal":2.75,"peso_ideal":30,"impacto_ecc":-10,"impacto_idade":-2,"impacto_peso":-2,"impacto_abortos":-12},
    {"raça":"Canindé","espécie":"Caprino","corte":65,"leite":40,"lã":0,"couro":98,"dupla_aptidão":72,"melhoramento_genético":0,"adaptação_semiárido":98,"resistência_calor":98,"resistência_seca":98,"ecc_ideal":2.75,"peso_ideal":31,"impacto_ecc":-10,"impacto_idade":-2,"impacto_peso":-2,"impacto_abortos":-12},
    {"raça":"Marota","espécie":"Caprino","corte":60,"leite":42,"lã":0,"couro":95,"dupla_aptidão":70,"melhoramento_genético":0,"adaptação_semiárido":98,"resistência_calor":100,"resistência_seca":96,"ecc_ideal":2.5,"peso_ideal":29,"impacto_ecc":-10,"impacto_idade":-2,"impacto_peso":-2,"impacto_abortos":-14},
    {"raça":"Repartida","espécie":"Caprino","corte":68,"leite":30,"lã":0,"couro":98,"dupla_aptidão":68,"melhoramento_genético":0,"adaptação_semiárido":100,"resistência_calor":98,"resistência_seca":100,"ecc_ideal":2.75,"peso_ideal":32,"impacto_ecc":-11,"impacto_idade":-2,"impacto_peso":-2,"impacto_abortos":-12},
    {"raça":"Azul","espécie":"Caprino","corte":62,"leite":35,"lã":0,"couro":95,"dupla_aptidão":65,"melhoramento_genético":0,"adaptação_semiárido":95,"resistência_calor":96,"resistência_seca":95,"ecc_ideal":2.75,"peso_ideal":30,"impacto_ecc":-12,"impacto_idade":-3,"impacto_peso":-2,"impacto_abortos":-14},
    {"raça":"Gurguéia","espécie":"Caprino","corte":64,"leite":38,"lã":0,"couro":96,"dupla_aptidão":68,"melhoramento_genético":0,"adaptação_semiárido":96,"resistência_calor":96,"resistência_seca":96,"ecc_ideal":2.75,"peso_ideal":32,"impacto_ecc":-12,"impacto_idade":-3,"impacto_peso":-2,"impacto_abortos":-14},
    {"raça":"Bhuj","espécie":"Caprino","corte":70,"leite":55,"lã":0,"couro":80,"dupla_aptidão":80,"melhoramento_genético":0,"adaptação_semiárido":82,"resistência_calor":85,"resistência_seca":80,"ecc_ideal":3.0,"peso_ideal":38,"impacto_ecc":-14,"impacto_idade":-4,"impacto_peso":-3,"impacto_abortos":-18},
    {"raça":"Kalahari Red","espécie":"Caprino","corte":95,"leite":15,"lã":0,"couro":85,"dupla_aptidão":30,"melhoramento_genético":0,"adaptação_semiárido":78,"resistência_calor":82,"resistência_seca":75,"ecc_ideal":3.25,"peso_ideal":43,"impacto_ecc":-18,"impacto_idade":-4,"impacto_peso":-4,"impacto_abortos":-22}
];

function buscarRaca(raca, especie) {
    if (!raca) return null;
    const r = RACAS_DATASET.find(x =>
        x["raça"].toLowerCase() === String(raca).toLowerCase() &&
        x["espécie"] === especie
    );
    return r || null;
}

/* =========================================================================
   4) FINALIDADES E TÍTULO DINÂMICO
   ========================================================================= */
function atualizarFinalidadesPorEspecie() {
    const especie = document.getElementById('txtEspecie').value;
    const selectFinalidade = document.getElementById('txtFinalidade');
    selectFinalidade.innerHTML = '';
    (finalidadesPorEspecie[especie] || []).forEach(f => {
        const opt = document.createElement('option');
        opt.value = f; opt.textContent = f;
        selectFinalidade.appendChild(opt);
    });
}

function atualizarTituloEficacia(finalidade) {
    const el = document.getElementById('lblTituloEficacia');
    if (!el) return;
    el.textContent = finalidade
        ? `Taxa de Eficácia para ${finalidade}`
        : 'Taxa de Eficácia para a Finalidade Selecionada';
}

/* =========================================================================
   5) OPEN-METEO + GEOCODIFICAÇÃO POR FAZENDA
   ========================================================================= */
async function geocodificarFazenda(fazenda) {
    if (!fazenda) return null;
    if (fazenda.latitude && fazenda.longitude) {
        return { lat: parseFloat(fazenda.latitude), lon: parseFloat(fazenda.longitude) };
    }
    // Fallback: Crateús-CE
    const cidade = (fazenda.cidade || 'Crateús').trim();
    const estado = (fazenda.estado || 'CE').trim();
    if (cidade.toLowerCase() === 'crateús' || cidade.toLowerCase() === 'crateus') {
        return { lat: -5.17, lon: -40.67 };
    }
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&country=BR&count=1&language=pt`;
        const r = await fetch(url);
        const j = await r.json();
        if (j.results && j.results.length) {
            return { lat: j.results[0].latitude, lon: j.results[0].longitude };
        }
    } catch (e) { console.warn('Geocodificação falhou:', e); }
    return { lat: -5.17, lon: -40.67 };
}

/**
 * Busca o clima exato (data/hora selecionadas) no Open-Meteo.
 * Para datas passadas/atual usa archive; para data futura usa forecast.
 */
async function buscarClimaOpenMeteo(lat, lon, dataIso, horaHHMM) {
    const horaIdx = parseInt(horaHHMM.split(':')[0], 10);
    const alvo = new Date(`${dataIso}T${horaHHMM}:00`);
    const agora = new Date();
    const ehFuturo = alvo.getTime() > agora.getTime() - 24*3600*1000;

    const baseHourly = 'temperature_2m,relative_humidity_2m';
    let url;
    if (ehFuturo) {
        url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${baseHourly}&start_date=${dataIso}&end_date=${dataIso}&timezone=auto`;
    } else {
        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=${baseHourly}&start_date=${dataIso}&end_date=${dataIso}&timezone=auto`;
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
    const j = await r.json();
    const temps = j.hourly?.temperature_2m || [];
    const ums   = j.hourly?.relative_humidity_2m || [];
    if (!temps.length) throw new Error('Open-Meteo sem dados horários');

    const idx = Math.max(0, Math.min(temps.length - 1, horaIdx));
    const temperatura = temps[idx];
    const umidade = ums[idx];
    const itu = 0.8 * temperatura + (umidade / 100) * (temperatura - 14.3) + 46.4;
    return {
        temperatura: Math.round(temperatura * 10) / 10,
        umidade: Math.round(umidade),
        itu: Math.round(itu * 10) / 10,
        dataHora: alvo.toISOString()
    };
}

/* Atualização do painel central de clima (dependente da fazenda selecionada). */
async function atualizarClimaPorDataHora() {
    const data = document.getElementById('dataInseminacao').value;
    const hora = document.getElementById('horaManejo').value;
    const especie = document.getElementById('txtEspecie').value;

    if (!data || !hora) {
        document.getElementById('lblTemperatura').innerHTML = '--°C';
        document.getElementById('lblUmidade').innerHTML = '--%';
        document.getElementById('lblITU').innerHTML = '--';
        document.getElementById('lblStatusTermico').innerHTML = 'Informe data/hora';
        document.getElementById('recomendacaoClima').innerHTML = '<i class="fa-regular fa-clock"></i> <span>Informe a data e a hora para avaliar a adequação térmica.</span>';
        return;
    }
    if (!fazendaSelecionada) {
        document.getElementById('recomendacaoClima').innerHTML = '<i class="fa-solid fa-location-dot"></i> <span>Selecione a matriz para localizar a fazenda e buscar o clima real.</span>';
        return;
    }

    try {
        const coords = await geocodificarFazenda(fazendaSelecionada);
        const clima = await buscarClimaOpenMeteo(coords.lat, coords.lon, data, hora);
        climaAtual = clima;
        // Atualiza os elementos do card clima
        document.getElementById('lblTemperatura').innerHTML = `${clima.temperatura}°C`;
        document.getElementById('lblUmidade').innerHTML = `${clima.umidade}%`;
        document.getElementById('lblITU').innerHTML = clima.itu;

        let status = 'Conforto térmico';
        if (clima.itu >= 89) status = 'Estresse severo';
        else if (clima.itu >= 79) status = 'Estresse moderado';
        else if (clima.itu >= 72) status = 'Estresse leve';
        document.getElementById('lblStatusTermico').innerHTML = status;
        document.getElementById('lblAtualizacao').innerHTML = new Date().toLocaleString('pt-BR');

        atualizarRecomendacaoClimatica(especie, clima);
    } catch (e) {
        console.error(e);
        document.getElementById('recomendacaoClima').innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>Erro ao obter clima: ${e.message}</span>`;
    }
}
function atualizarRecomendacaoClimatica(especie, clima) {
    especie = especie || document.getElementById('txtEspecie').value;
    if (!clima) {
        const t = document.getElementById('tempEstimada').innerHTML;
        const i = document.getElementById('ituEstimado').innerHTML;
        if (t === '--' || i === '--') return;
        clima = { temperatura: parseFloat(t), itu: parseFloat(i), umidade: null };
    }
    const faixa = FAIXA_TERMICA[especie];
    const finalidade = document.getElementById('txtFinalidade').value || '—';
    let msg;
    if (clima.temperatura >= faixa.min && clima.temperatura <= faixa.max) {
        msg = `✅ ${clima.temperatura}°C dentro da faixa ideal para ${especie} (${faixa.min}–${faixa.max}°C). Finalidade: <strong>${finalidade}</strong>.`;
    } else if (clima.temperatura > faixa.limiteSuperior) {
        const perda = Math.round((clima.temperatura - faixa.limiteSuperior) * faixa.perdaPorGrauAcima);
        msg = `🌡️ ${clima.temperatura}°C ACIMA do ideal para ${especie}. ⚠️ Perda estimada de ~${perda}% na taxa de prenhez por estresse térmico. Finalidade: <strong>${finalidade}</strong>.`;
    } else {
        msg = `❄️ ${clima.temperatura}°C abaixo da faixa ideal para ${especie}. Avalie horário mais quente.`;
    }
    if (clima.itu > 78) msg += ` <strong>ITU ${clima.itu}</strong>: estresse térmico forte — sombra e ventilação obrigatórias.`;
    document.getElementById('recomendacaoClima').innerHTML = `<i class="fa-solid fa-temperature-high"></i> ${msg}`;
}

/* =========================================================================
   6) ÁRVORE GENEALÓGICA + COEFICIENTE F DE WRIGHT
   ========================================================================= */
const _animalCache = new Map();
async function buscarAnimalPorId(id) {
    if (!id) return null;
    if (_animalCache.has(id)) return _animalCache.get(id);
    const { data, error } = await supabaseClient
        .from('animais')
        .select('id, pai_id, mae_id')
        .eq('id', id)
        .maybeSingle();
    if (error) { console.warn('animal', id, error); return null; }
    _animalCache.set(id, data);
    return data;
}

/**
 * Retorna um Map<ancestralId, [distância em gerações desde o indivíduo]>
 * Sobe até `profundidade` gerações (4 = bisavós).
 */
async function montarAncestrais(animalId, profundidade = 4) {
    const ancestrais = new Map();
    async function dfs(id, gen) {
        if (!id || gen > profundidade) return;
        const a = await buscarAnimalPorId(id);
        if (!a) return;
        if (a.pai_id) {
            const arr = ancestrais.get(a.pai_id) || [];
            arr.push(gen + 1); ancestrais.set(a.pai_id, arr);
            await dfs(a.pai_id, gen + 1);
        }
        if (a.mae_id) {
            const arr = ancestrais.get(a.mae_id) || [];
            arr.push(gen + 1); ancestrais.set(a.mae_id, arr);
            await dfs(a.mae_id, gen + 1);
        }
    }
    await dfs(animalId, 0);
    return ancestrais;
}

/**
 * Coeficiente F de Wright (simplificado, sem F dos próprios ancestrais).
 * F = Σ (1/2)^(n1+n2+1) para cada ancestral comum,
 *     onde n1, n2 = nº de gerações entre cada pai e o ancestral comum.
 */
async function calcularCoeficienteWright(femeaId, machoId) {
    if (!femeaId || !machoId) return 0;
    // Acasalamento direto (pai com filha / mãe com filho)
    if (String(femeaId) === String(machoId)) return 25;

    // Verifica linha direta: macho é pai/mãe da fêmea?
    const femea = await buscarAnimalPorId(femeaId);
    const macho = await buscarAnimalPorId(machoId);
    if (femea && (String(femea.pai_id) === String(machoId) || String(femea.mae_id) === String(machoId))) return 25;
    if (macho && (String(macho.pai_id) === String(femeaId) || String(macho.mae_id) === String(femeaId))) return 25;

    const ancFemea = await montarAncestrais(femeaId, 4);
    const ancMacho = await montarAncestrais(machoId, 4);

    let F = 0;
    for (const [ancId, gensFemea] of ancFemea.entries()) {
        if (!ancMacho.has(ancId)) continue;
        const gensMacho = ancMacho.get(ancId);
        for (const n1 of gensFemea) {
            for (const n2 of gensMacho) {
                F += Math.pow(0.5, n1 + n2 + 1);
            }
        }
    }
    return Math.round(F * 1000) / 10; // em %
}

async function verificarConsanguinidadeAutomatica() {
    const femeaId = document.getElementById('femeaSelecionadaId').value;
    const machoId = document.getElementById('machoSelecionadoId').value;
    const campo = document.getElementById('consanguinidade');
    if (!femeaId || !machoId) {
        campo.value = '';
        coefF = 0;
        return;
    }
    campo.value = 'Calculando...';
    try {
        coefF = await calcularCoeficienteWright(femeaId, machoId);
        campo.value = coefF > 0
            ? `${coefF}% (Wright — ancestrais comuns)`
            : `0% (sem parentesco detectado na árvore)`;
        campo.style.backgroundColor = coefF >= 12.5 ? '#fee2e2' : '#e6f7ec';
    } catch (e) {
        console.error('Wright:', e);
        campo.value = '— (erro no cálculo)';
        coefF = 0;
    }
}

function aplicarValorConsanguinidade(valor, origem = 'informado manualmente') {
    valor = Number(valor);
    if (!Number.isFinite(valor)) return;
    coefF = valor;
    const campo = document.getElementById('consanguinidade');
    if (campo) {
        campo.value = `${valor}% (${origem})`;
        campo.style.backgroundColor = valor >= 12.5 ? '#fee2e2' : '#fff3e0';
    }
}

function abrirModalParentesco() {
    const modal = document.getElementById('modalParentesco');
    if (modal) {
        abrirModal('modalParentesco');
        return;
    }
    const opcao = prompt(
        "Selecione o grau de parentesco:\n\n" +
        "1 - Não aparentados (0%)\n" +
        "2 - Pai-filha / Mãe-filho (25%)\n" +
        "3 - Irmãos completos (25%)\n" +
        "4 - Meio-irmãos (12,5%)\n" +
        "5 - Avô-neta (12,5%)\n" +
        "6 - Primos (6,25%)\n" +
        "7 - Outro (digitar valor %)"
    );
    if (!opcao) return;
    const mapa = {"1":0,"2":25,"3":25,"4":12.5,"5":12.5,"6":6.25};
    let valor = mapa[opcao];
    if (opcao === "7") {
        const v = prompt("Digite o valor do F em % (ex: 15.2)");
        valor = parseFloat((v || '').replace(',', '.'));
        if (isNaN(valor)) return;
    }
    if (valor === undefined) return;
    aplicarValorConsanguinidade(valor);
}

function fecharModalParentesco() {
    fecharModal('modalParentesco');
}

function aplicarParentescoManual() {
    const valor = parseFloat((document.getElementById('selGrauParentesco')?.value || '0').replace(',', '.'));
    aplicarValorConsanguinidade(valor, 'informado manualmente');
    fecharModalParentesco();
}

window.abrirModalParentesco = abrirModalParentesco;
window.fecharModalParentesco = fecharModalParentesco;
window.aplicarParentescoManual = aplicarParentescoManual;

/* =========================================================================
   7) REDE NEURAL — brain.js
   ========================================================================= */
function normalizarEntrada(e) {
    // Mapeia tudo para [0..1]
    return {
        ecc:           Math.min(1, Math.max(0, (e.ecc || 0) / 5)),
        idade:         Math.min(1, Math.max(0, (e.idade || 0) / 15)),
        peso_norm:     Math.min(1, Math.max(0, (e.peso_norm || 0))),         // peso / peso_ideal_da_raca, já normalizado
        itu:           Math.min(1, Math.max(0, (e.itu || 0) / 100)),
        temp:          Math.min(1, Math.max(0, ((e.temp || 0) + 5) / 50)),    // -5..45 -> 0..1
        consang:       Math.min(1, Math.max(0, (e.consang || 0) / 100)),
        abortos:       Math.min(1, Math.max(0, (e.abortos || 0) / 5)),
        paridade:      Math.min(1, Math.max(0, (e.paridade || 0) / 10)),
        adapt_calor:   Math.min(1, Math.max(0, (e.adapt_calor || 0) / 100)),
        adapt_semi:    Math.min(1, Math.max(0, (e.adapt_semi || 0) / 100)),
        especie_bov:   e.especie === 'Bovino' ? 1 : 0,
        especie_ovi:   e.especie === 'Ovino' ? 1 : 0,
        especie_cap:   e.especie === 'Caprino' ? 1 : 0
    };
}

function gerarDatasetTreinamento() {
    // ~150 cenários sintéticos baseados nas regras Embrapa
    const especies = ['Bovino', 'Ovino', 'Caprino'];
    const eccIdeal = { Bovino: 3.25, Ovino: 2.85, Caprino: 2.85 };
    const dataset = [];

    for (let i = 0; i < 150; i++) {
        const esp = especies[i % 3];
        const ecc = +(1.5 + Math.random() * 3).toFixed(2);
        const idade = +(1 + Math.random() * 12).toFixed(1);
        const peso_norm = +(0.6 + Math.random() * 0.7).toFixed(2);
        const temp = +(12 + Math.random() * 28).toFixed(1);
        const umid = 40 + Math.random() * 50;
        const itu = +(0.8 * temp + (umid/100) * (temp - 14.3) + 46.4).toFixed(1);
        const consang = +(Math.random() * 35).toFixed(1);
        const abortos = Math.floor(Math.random() * 4);
        const paridade = Math.floor(Math.random() * 9);
        const adapt_calor = Math.round(20 + Math.random() * 80);
        const adapt_semi = Math.round(20 + Math.random() * 80);

        // ---- Regras Embrapa ----
        let prenhez = esp === 'Bovino' ? 80 : (esp === 'Ovino' ? 85 : 87);

        // ECC
        const deltaEcc = Math.abs(ecc - eccIdeal[esp]);
        prenhez -= deltaEcc * 12;

        // Paridade
        if (paridade === 0) prenhez -= esp === 'Bovino' ? 7 : 5;
        else if (paridade === 1) prenhez -= esp === 'Bovino' ? 15 : 12;
        else if (paridade >= 2 && paridade <= 5) prenhez += 3;
        else if (paridade > 5) prenhez -= 10;

        // Estresse térmico
        const f = FAIXA_TERMICA[esp];
        if (temp > f.limiteSuperior) prenhez -= (temp - f.limiteSuperior) * f.perdaPorGrauAcima;
        if (itu > 78) prenhez -= (itu - 78) * 0.8;

        // Abortos
        prenhez -= abortos * 12;

        // Consanguinidade
        if (consang >= 25) prenhez -= 22;
        else if (consang >= 12.5) prenhez -= 12;
        else if (consang >= 6.25) prenhez -= 5;

        // Adaptação
        prenhez += (adapt_calor - 60) * 0.08;
        prenhez += (adapt_semi - 60) * 0.05;

        // Peso fora do ideal
        if (peso_norm < 0.8 || peso_norm > 1.2) prenhez -= 6;

        // Ruído
        prenhez += (Math.random() - 0.5) * 4;

        const target = Math.min(0.98, Math.max(0.05, prenhez / 100));

        dataset.push({
            input: normalizarEntrada({
                ecc, idade, peso_norm, itu, temp,
                consang, abortos, paridade,
                adapt_calor, adapt_semi, especie: esp
            }),
            output: { prenhez: target }
        });
    }
    return dataset;
}

async function treinarRedeNeural() {
    try {
        net = new brain.NeuralNetwork({ hiddenLayers: [6, 6] });
        const data = gerarDatasetTreinamento();
        await net.trainAsync(data, {
            iterations: 1500,
            errorThresh: 0.01,
            learningRate: 0.05,
            log: false
        });
        netReady = true;
        const s = document.getElementById('iaStatus');
        const t = document.getElementById('iaStatusText');
        if (s && t) { s.classList.add('ready'); t.textContent = 'Rede neural treinada e pronta.'; }
    } catch (e) {
        console.error('Treino brain.js:', e);
        const t = document.getElementById('iaStatusText');
        if (t) t.textContent = 'Falha ao treinar rede neural (' + e.message + ')';
    }
}

/* =========================================================================
   8) CARREGAR ANIMAIS + SELEÇÃO
   ========================================================================= */
async function carregarAnimais() {
    try {
        const fazendaId = window.PotygenFazenda?.getFazendaId?.() || fazendaSelecionada?.id || null;
        let query = supabaseClient
            .from('animais')
            .select('id, usuario_id, codigo, nome, sexo, especie, raca, peso_atual, finalidade, ecc, data_nascimento, historico_aborto, qtd_nascimentos, pai_id, mae_id, fazenda_id')
            .order('codigo', { ascending: true });

        if (fazendaId) query = query.eq('fazenda_id', fazendaId);

        const { data, error } = await query;
        if (error) throw error;
        const animais = (data || []).map(a => ({ ...a, brinco: a.codigo || a.brinco || a.nome || String(a.id).slice(0, 8) }));
        todosAnimaisFemeas = animais.filter(a => ['f', 'femea', 'fêmea', 'female'].includes(String(a.sexo || '').toLowerCase()));
        todosAnimaisMachos = animais.filter(a => ['m', 'macho', 'male'].includes(String(a.sexo || '').toLowerCase()));
    } catch (e) {
        console.error('Erro ao carregar animais:', e);
        mostrarToast('Erro ao carregar animais da fazenda. Verifique se a coluna é codigo e se a fazenda está selecionada.', true);
    }
}

function getEspecieSelecionada() {
    const el = document.getElementById('txtEspecie');
    return (el && el.value ? String(el.value) : '').trim().toLowerCase();
}
function filtrarPorEspecie(lista) {
    const esp = getEspecieSelecionada();
    if (!esp) return lista;
    return lista.filter(a => String(a.especie || '').trim().toLowerCase() === esp);
}
function mostrarTodasFemeas() { renderizarDropdownFemeas(filtrarPorEspecie(todosAnimaisFemeas)); document.getElementById('listaFemeasResultados').classList.add('show'); }
function mostrarTodosMachos() { renderizarDropdownMachos(filtrarPorEspecie(todosAnimaisMachos)); document.getElementById('listaMachosResultados').classList.add('show'); }
function filtrarListaFemea(termo) {
    const t = (termo || '').toLowerCase();
    const base = filtrarPorEspecie(todosAnimaisFemeas);
    const arr = t ? base.filter(a => (a.brinco||'').toLowerCase().includes(t) || (a.nome||'').toLowerCase().includes(t)) : base;
    renderizarDropdownFemeas(arr);
    document.getElementById('listaFemeasResultados').classList.add('show');
}
function filtrarListaMacho(termo) {
    const t = (termo || '').toLowerCase();
    const base = filtrarPorEspecie(todosAnimaisMachos);
    const arr = t ? base.filter(a => (a.brinco||'').toLowerCase().includes(t) || (a.nome||'').toLowerCase().includes(t)) : base;
    renderizarDropdownMachos(arr);
    document.getElementById('listaMachosResultados').classList.add('show');
}
// Ao trocar de espécie, limpa seleção atual e fecha dropdowns
document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('txtEspecie');
    if (!sel) return;
    sel.addEventListener('change', () => {
        ['buscaFemea','buscaMacho','femeaSelecionadaId','machoSelecionadoId'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        ['containerFeedbackFemea','containerFeedbackMacho'].forEach(id => {
            const el = document.getElementById(id); if (el) el.classList.remove('ativo');
        });
        ['listaFemeasResultados','listaMachosResultados'].forEach(id => {
            const el = document.getElementById(id); if (el) el.classList.remove('show');
        });
        femeaSelecionada = null; machoSelecionado = null;
    });
});
function renderizarDropdownFemeas(arr) {
    const c = document.getElementById('listaFemeasResultados');
    if (!arr.length) { c.innerHTML = '<div class="animal-item"><small>Nenhuma fêmea encontrada</small></div>'; return; }
    c.innerHTML = arr.map(a => `<div class="animal-item" onclick="selecionarFemea('${a.id}')"><strong>${a.brinco}</strong> - ${a.nome || 'Sem nome'}<small>Raça: ${a.raca || 'N/I'}</small></div>`).join('');
}
function renderizarDropdownMachos(arr) {
    const c = document.getElementById('listaMachosResultados');
    if (!arr.length) { c.innerHTML = '<div class="animal-item"><small>Nenhum macho encontrado</small></div>'; return; }
    c.innerHTML = arr.map(a => `<div class="animal-item" onclick="selecionarMacho('${a.id}')"><strong>${a.brinco}</strong> - ${a.nome || 'Sem nome'}<small>Raça: ${a.raca || 'N/I'}</small></div>`).join('');
}

async function buscarFazenda(fazendaId) {
    if (!fazendaId) return null;
    const { data, error } = await supabaseClient
        .from('fazendas')
        .select('id, nome, cidade, estado, cep, endereco, latitude, longitude')
        .eq('id', fazendaId)
        .maybeSingle();
    if (error) { console.warn('fazenda', error); return null; }
    return data;
}

async function selecionarFemea(id) {
    const a = todosAnimaisFemeas.find(x => String(x.id) === String(id));
    if (!a) return;
    femeaSelecionada = a;
    document.getElementById('femeaSelecionadaId').value = a.id;
    document.getElementById('buscaFemea').value = `${a.brinco} - ${a.nome || ''}`;
    document.getElementById('containerFeedbackFemea').classList.add('ativo');
    document.getElementById('textoFeedbackFemea').innerHTML =
        `<strong>${a.brinco}</strong> - ${a.nome || 'Sem nome'} • Raça: ${a.raca || 'N/I'} • ECC: ${a.ecc ?? '—'} • Peso: ${a.peso_atual ?? '—'} kg • Partos: ${a.qtd_nascimentos ?? 0} • Abortos: ${a.historico_aborto ?? 0}`;
    document.getElementById('listaFemeasResultados').classList.remove('show');

    fazendaSelecionada = await buscarFazenda(a.fazenda_id);
    if (fazendaSelecionada) {
        const lbl = document.getElementById('lblLocalizacaoUsuario');
        if (lbl) lbl.textContent = `${fazendaSelecionada.nome || 'Fazenda'} — ${fazendaSelecionada.cidade || ''}/${fazendaSelecionada.estado || ''}`;
    }
    await verificarConsanguinidadeAutomatica();
    await atualizarClimaPorDataHora();
    await carregarClimaReal(); // refresh do card 2
}

async function selecionarMacho(id) {
    const a = todosAnimaisMachos.find(x => String(x.id) === String(id));
    if (!a) return;
    machoSelecionado = a;
    document.getElementById('machoSelecionadoId').value = a.id;
    document.getElementById('buscaMacho').value = `${a.brinco} - ${a.nome || ''}`;
    document.getElementById('containerFeedbackMacho').classList.add('ativo');
    document.getElementById('textoFeedbackMacho').innerHTML =
        `<strong>${a.brinco}</strong> - ${a.nome || 'Sem nome'} • Raça: ${a.raca || 'N/I'} • ECC: ${a.ecc ?? '—'} • Peso: ${a.peso_atual ?? '—'} kg`;
    document.getElementById('listaMachosResultados').classList.remove('show');
    await verificarConsanguinidadeAutomatica();
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.busca-animal-container')) {
        document.querySelectorAll('.lista-animais-dropdown').forEach(d => d.classList.remove('show'));
    }
});

/* =========================================================================
   9) PREDIÇÃO IA + GRAVAÇÃO NO HISTÓRICO
   ========================================================================= */
function calcularIdadeAnos(dataNasc) {
    if (!dataNasc) return 4;
    const d = new Date(dataNasc);
    return Math.max(0, (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function eficaciaParaFinalidade(racaInfo, finalidade) {
    if (!racaInfo) return 60;
    const map = {
        'Corte': 'corte', 'Corte (Carne)': 'corte',
        'Leite': 'leite', 'Lã': 'lã', 'Couro': 'couro',
        'Dupla Aptidão': 'dupla_aptidão',
        'Melhoramento Genético': 'melhoramento_genético'
    };
    const k = map[finalidade];
    return k && racaInfo[k] !== undefined ? racaInfo[k] : 60;
}

function numeroSeguro(valor, padrao = 0) {
    if (valor === true) return 1;
    if (valor === false || valor === null || valor === undefined || valor === '') return padrao;
    const n = Number(String(valor).replace(',', '.'));
    return Number.isFinite(n) ? n : padrao;
}

function calcularPrenhezTecnica(entrada, racaInfo) {
    const especie = entrada.especie || 'Bovino';
    const faixa = FAIXA_TERMICA[especie] || FAIXA_TERMICA.Bovino;
    const eccIdeal = racaInfo?.ecc_ideal || { Bovino: 3.25, Ovino: 3.0, Caprino: 2.85 }[especie] || 3;
    let prenhez = especie === 'Bovino' ? 80 : (especie === 'Ovino' ? 85 : 87);

    prenhez -= Math.abs(entrada.ecc - eccIdeal) * 12;
    if (entrada.paridade === 0) prenhez -= especie === 'Bovino' ? 7 : 5;
    else if (entrada.paridade === 1) prenhez -= especie === 'Bovino' ? 15 : 12;
    else if (entrada.paridade >= 2 && entrada.paridade <= 5) prenhez += 3;
    else if (entrada.paridade > 5) prenhez -= 10;

    if (entrada.temp > faixa.limiteSuperior) prenhez -= (entrada.temp - faixa.limiteSuperior) * faixa.perdaPorGrauAcima;
    if (entrada.itu > 78) prenhez -= (entrada.itu - 78) * 0.8;
    prenhez -= entrada.abortos * 12;

    if (entrada.consang >= 25) prenhez -= 22;
    else if (entrada.consang >= 12.5) prenhez -= 12;
    else if (entrada.consang >= 6.25) prenhez -= 5;

    prenhez += (entrada.adapt_calor - 60) * 0.08;
    prenhez += (entrada.adapt_semi - 60) * 0.05;
    if (entrada.peso_norm < 0.8 || entrada.peso_norm > 1.2) prenhez -= 6;
    if (entrada.idade < 1.2) prenhez -= 8;
    if (entrada.idade > 10) prenhez -= (entrada.idade - 10) * 2;

    return Math.round(Math.min(98, Math.max(5, prenhez)));
}

window.executarPredicaoIA = async function () {
    if (!femeaSelecionada || !machoSelecionado) { alert('Selecione matriz e reprodutor.'); return; }
    const finalidade = document.getElementById('txtFinalidade').value;
    const data = document.getElementById('dataInseminacao').value;
    const hora = document.getElementById('horaManejo').value;
    if (!finalidade) { alert('Selecione a finalidade zootécnica.'); return; }
    if (!data || !hora) { alert('Informe data e hora.'); return; }
    await atualizarClimaPorDataHora();
    if (!climaAtual) await carregarClimaReal();
    if (!climaAtual) { alert('Não foi possível carregar o clima da fazenda.'); return; }

    const especie = femeaSelecionada.especie || document.getElementById('txtEspecie').value;
    const racaInfo = buscarRaca(femeaSelecionada.raca, especie);
    const pesoIdeal = racaInfo?.peso_ideal || femeaSelecionada.peso_atual || 1;
    const peso_norm = (femeaSelecionada.peso_atual || pesoIdeal) / pesoIdeal;

    const entradaBruta = {
        ecc: numeroSeguro(femeaSelecionada.ecc, 3),
        idade: calcularIdadeAnos(femeaSelecionada.data_nascimento),
        peso_norm,
        itu: numeroSeguro(climaAtual.itu, 72),
        temp: numeroSeguro(climaAtual.temperatura, 26),
        consang: numeroSeguro(coefF, 0),
        abortos: numeroSeguro(femeaSelecionada.historico_aborto, 0),
        paridade: numeroSeguro(femeaSelecionada.qtd_nascimentos, 0),
        adapt_calor: racaInfo?.resistência_calor || 60,
        adapt_semi: racaInfo?.adaptação_semiárido || 60,
        especie
    };

    const prenhezTecnica = calcularPrenhezTecnica(entradaBruta, racaInfo);
    let prenhezIA = prenhezTecnica;
    if (netReady && net && typeof net.run === 'function') {
        const saida = net.run(normalizarEntrada(entradaBruta));
        prenhezIA = Math.round((saida.prenhez || 0) * 100);
    }
    let prenhez = Math.round((prenhezTecnica * 0.7) + (prenhezIA * 0.3));
    prenhez = Math.min(98, Math.max(5, prenhez));

    const eficacia = Math.round(eficaciaParaFinalidade(racaInfo, finalidade));

    // ----- UI: cores dinâmicas -----
    const lblScore = document.getElementById('lblScore');
    const lblBarra = document.getElementById('lblBarra');
    lblScore.innerText = `${prenhez}%`;
    lblScore.classList.remove('text-red-600', 'text-green-600');
    lblBarra.classList.remove('bar-red', 'bar-green');
    if (prenhez < 60) {
        lblScore.classList.add('text-red-600');
        lblBarra.classList.add('bar-red');
    } else {
        lblScore.classList.add('text-green-600');
        lblBarra.classList.add('bar-green');
    }
    lblBarra.style.width = `${prenhez}%`;

    atualizarTituloEficacia(finalidade);
    document.getElementById('lblEficacia').innerText = `${eficacia}%`;
    document.getElementById('lblBarraEficacia').style.width = `${eficacia}%`;
    document.getElementById('painelResultado').style.display = 'block';

    document.getElementById('lblMelhorAnimal').innerHTML =
        `Animal <strong>${femeaSelecionada.brinco}</strong> (${femeaSelecionada.raca}) cruzado com <strong>${machoSelecionado.brinco}</strong> (${machoSelecionado.raca}) — ` +
        `Clima: ${climaAtual.temperatura}°C / ITU ${climaAtual.itu} • F=${coefF}% • Finalidade ${finalidade}.`;
    document.getElementById('lblDetalheGenetico').innerHTML =
        `ECC ${entradaBruta.ecc} • Idade ${entradaBruta.idade.toFixed(1)} anos • Peso ${femeaSelecionada.peso_atual || '—'} kg • ` +
        `Paridade ${entradaBruta.paridade} • Abortos ${entradaBruta.abortos} • Adapt. calor ${entradaBruta.adapt_calor} • Base técnica ${prenhezTecnica}%${netReady ? ` • IA calibrada ${prenhezIA}%` : ''}.`;
    const detalheBox = document.getElementById('lblDetalheGeneticoBox');
    if (detalheBox) detalheBox.style.display = 'flex';

    // ----- Persistência -----
    try {
        const { error } = await supabaseClient.from('analises_geneticas').insert({
            usuario_id: femeaSelecionada.usuario_id,
            animal_id: femeaSelecionada.id,
            fazenda_id: femeaSelecionada.fazenda_id,
            data_hora_clima: climaAtual.dataHora,
            temperatura_momento: climaAtual.temperatura,
            itu_momento: climaAtual.itu,
            ecc_momento: femeaSelecionada.ecc,
            peso_momento: femeaSelecionada.peso_atual,
            grau_consanguinidade: coefF,
            taxa_prenhez_estimada: prenhez,
            eficacia_finalidade: eficacia,
            finalidade_selecionada: finalidade
        });
        if (error) throw error;
        mostrarToast('Análise salva com sucesso no histórico!');
    } catch (e) {
        console.error('INSERT analises_geneticas:', e);
        mostrarToast('Análise calculada, mas houve erro ao salvar no histórico.', true);
    }
};

/* =========================================================================
   10) BIOCLIMATOLOGIA REAL-TIME (card 2)
   ========================================================================= */
async function carregarClimaReal() {
    try {
        const coords = fazendaSelecionada
            ? await geocodificarFazenda(fazendaSelecionada)
            : { lat: -5.17, lon: -40.67 };
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const t = j.current.temperature_2m;
        const u = j.current.relative_humidity_2m;
        const itu = Math.round((0.8 * t + (u/100) * (t - 14.3) + 46.4) * 10) / 10;
        climaAtual = {
            temperatura: Math.round(t * 10) / 10,
            umidade: Math.round(u),
            itu,
            dataHora: new Date().toISOString()
        };

        document.getElementById('lblTemperatura').innerText = `${t}°C`;
        document.getElementById('lblUmidade').innerText = `${u}%`;
        document.getElementById('lblITU').innerText = itu;

        let status = 'Conforto térmico';
        if (itu >= 89) status = 'Estresse severo';
        else if (itu >= 79) status = 'Estresse moderado';
        else if (itu >= 72) status = 'Estresse leve';
        document.getElementById('lblStatusTermico').innerText = status;
        document.getElementById('lblAtualizacao').innerText = new Date().toLocaleString('pt-BR');
    } catch (e) {
        console.error('Open-Meteo:', e);
        document.getElementById('lblStatusTermico').innerText = 'Erro ao carregar clima';
    }
}

/* =========================================================================
   11) TOAST
   ========================================================================= */
function mostrarToast(texto, erro = false) {
    const el = document.getElementById('potyToast');
    const tx = document.getElementById('potyToastText');
    if (!el || !tx) return;
    tx.textContent = texto;
    el.classList.toggle('error', !!erro);
    el.classList.add('visible');
    clearTimeout(window.__potyToastTimer);
    window.__potyToastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}

/* =========================================================================
   12) BOOTSTRAP
   ========================================================================= */
document.addEventListener('DOMContentLoaded', async () => {
    atualizarFinalidadesPorEspecie();
    document.getElementById('txtFinalidade').addEventListener('change', (e) => atualizarTituloEficacia(e.target.value));

    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('dataInseminacao').value = hoje;
    document.getElementById('horaManejo').value = '10:00';

    // Treina rede em paralelo
    treinarRedeNeural();

    // 1) Inicializa o sistema de fazendas (carrega lista, restaura a salva,
    //    atualiza sidebar e abre modal de cadastro apenas se NÃO houver fazenda).
    //    Quando o usuário trocar de fazenda, recarregamos animais e clima.
    if (window.PotygenFazendaUI && typeof window.PotygenFazendaUI.inicializar === 'function') {
        fazendaSelecionada = await window.PotygenFazendaUI.inicializar({
            onFazendaTrocada: async (fazenda) => {
                fazendaSelecionada = fazenda || null;
                climaAtual = null;
                // Reset de seleção ao trocar de fazenda
                femeaSelecionada = null;
                machoSelecionado = null;
                const fIn = document.getElementById('buscaFemea');
                const mIn = document.getElementById('buscaMacho');
                if (fIn) fIn.value = '';
                if (mIn) mIn.value = '';
                const fId = document.getElementById('femeaSelecionadaId');
                const mId = document.getElementById('machoSelecionadoId');
                if (fId) fId.value = '';
                if (mId) mId.value = '';
                document.getElementById('containerFeedbackFemea')?.classList.remove('ativo');
                document.getElementById('containerFeedbackMacho')?.classList.remove('ativo');
                document.getElementById('painelResultado').style.display = 'none';
                await carregarAnimais();
                await carregarClimaReal();
            }
        });
        if (fazendaSelecionada) {
            const lbl = document.getElementById('lblLocalizacaoUsuario');
            if (lbl) lbl.textContent = `${fazendaSelecionada.nome || 'Fazenda'} — ${fazendaSelecionada.cidade || ''}/${fazendaSelecionada.estado || ''}`;
        }
    } else {
        console.warn('[Análise Genética] PotygenFazendaUI não disponível — verifique se fazenda.js e fazenda-ui.js foram incluídos no HTML antes de script-analise.js');
    }

    // 2) Carrega animais filtrados pela fazenda atual e o clima
    await carregarAnimais();
    await carregarClimaReal();
});