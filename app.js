/* =========================================================
   SISTEMA SAFRA TOMATE 2026 — app.js
   ========================================================= */

/* Logo Wilson (base64, injetado via build) */
const LOGO_SRC="LOGO.png";

/* ---------------- Ícones (line, stroke currentColor) ---------------- */
const IP={
  printer:'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><rect x="6" y="13" width="12" height="8" rx="1"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  dots:'<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  play:'<path d="M7 4v16l13-8z"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  scale:'<path d="M12 3v18M6 21h12M5 7h14l-2-3H7zM5 7l-3 6a3.2 3.2 0 0 0 6 0zM19 7l-3 6a3.2 3.2 0 0 0 6 0z"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>'
};
function ic(n,size){return '<svg viewBox="0 0 24 24" width="'+(size||16)+'" height="'+(size||16)+'">'+IP[n]+'</svg>'}

/* ---------------- Armazenamento ---------------- */
const LS_TRUCKS='safra_tomate_trucks_v1';
const LS_CAD='safra_tomate_cad_v1';
const LS_PROG='safra_tomate_prog_v1';
let trucks=[];
let cad={produtores:[],motoristas:[],placas:[],variedades:[]};
let prog={contrato:'',variedadePrincipal:'',vigenciaInicio:'',vigenciaFim:'',excecoes:[],rocas:[]};
let editingId=null, ctxTargetId=null, regFilter='todos', cadTab='produtores', currentView='chegada', wizStep=1, editingCadIndex=null;

function normStr(s){
  if(!s) return '';
  return s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const SEED_MOTORISTAS = [
  { nome: "Jose Gilson", placa: "BWZ-9B53", tipoCaminhao: "Truck" },
  { nome: "José Antonio Castagne", placa: "BXA-4A94", tipoCaminhao: "Truck" },
  { nome: "Flademir Malacrida", placa: "BWA-3I57", tipoCaminhao: "Truck" },
  { nome: "Lucas de Souza Guedes (Carlos Guedes)", placa: "BTT-4758", tipoCaminhao: "Truck" },
  { nome: "Miguel Alexandre Maturano", placa: "AJF-9446 / BWE-5233", tipoCaminhao: "Carreta" },
  { nome: "Leonor da Silva Quirino (Gustavo)", placa: "GUG-1153 / MCJ-6850", tipoCaminhao: "Carreta" },
  { nome: "Adelson dos Santos Oliveira", placa: "MJQ-1J71 / AYB0H96 / AYB0H97", tipoCaminhao: "Bitrem" },
  { nome: "Paulo Granjeiro", placa: "", tipoCaminhao: "Bitrem" },
  { nome: "Jose Valter Dias", placa: "EJY-3478", tipoCaminhao: "Bitruck" },
  { nome: "Jose Valter Dias (Truck)", placa: "", tipoCaminhao: "Truck" },
  { nome: "Jose Valter Dias (BWR-8948)", placa: "BWR-8948", tipoCaminhao: "Truck" },
  { nome: "Jose Valter Dias (MPY-8B67)", placa: "MPY-8B67", tipoCaminhao: "Truck" },
  { nome: "Jose Valter Dias (GPZ-1D31)", placa: "GPZ-1D31 / FDS-7A60", tipoCaminhao: "Carreta" },
  { nome: "Jose Valter Dias (GVP-9I13)", placa: "GVP-9I13 / ATC2C42", tipoCaminhao: "Bitrem" },
  { nome: "Jose Milton de Oliveira Junior", placa: "BXE-0287 / HQN-9792", tipoCaminhao: "Carreta" },
  { nome: "Jose Milton de Oliveira Junior (junin)", placa: "CZB9H77 / AFF2A43", tipoCaminhao: "Carreta" },
  { nome: "Eudis Vieira", placa: "MMU-3678", tipoCaminhao: "Truck" },
  { nome: "Cristiane Viudes (Leonardo)", placa: "CPF-7706", tipoCaminhao: "Truck" },
  { nome: "Cristiane Viudes (Bruno)", placa: "EJY-1G81", tipoCaminhao: "Bitruck" },
  { nome: "Yasuo Ashidate", placa: "CWZ-4937", tipoCaminhao: "Truck" },
  { nome: "Marcos Antonio Puertas", placa: "BXF-6501", tipoCaminhao: "Truck" },
  { nome: "Paulo Sergio Alves Vilela", placa: "ATK6F66 / ASZ6H80", tipoCaminhao: "Carreta" },
  { nome: "Renato Vilela", placa: "CYN-1C83 / FFL-5F24", tipoCaminhao: "Carreta" },
  { nome: "Sivaldo Alves de Oliveira", placa: "BWK-4635", tipoCaminhao: "Truck" },
  { nome: "Nelson Brazero", placa: "BTT-4C01", tipoCaminhao: "Truck" },
  { nome: "Antonio dos Santos Oliveira", placa: "HRO5305 / AES8789", tipoCaminhao: "Carreta" },
  { nome: "Roseli Peixoto (Valdomiro)", placa: "DWL3B31 / DBL7A89", tipoCaminhao: "Bitrem" },
  { nome: "Eunides Fernandes da Silva de Oliveira", placa: "BFP2G33 / BWY7581", tipoCaminhao: "Carreta" },
  { nome: "Joel Bresqui", placa: "FTS-5D90", tipoCaminhao: "Truck" },
  { nome: "Clecio Aparecido Castagne", placa: "DBC0906 / BTS1754", tipoCaminhao: "Carreta" },
  { nome: "David Alencar de Figueiredo", placa: "CGG-3H11", tipoCaminhao: "Truck" },
  { nome: "Alessandro Inacio Lima", placa: "BJN-7E22", tipoCaminhao: "Truck" },
  { nome: "Odacir Hailton Perina", placa: "BSF-9924", tipoCaminhao: "Truck" },
  { nome: "Josie José Alencar", placa: "DMJ7D33", tipoCaminhao: "Truck" },
  { nome: "Alessandro Trucolo", placa: "NWI-4E09", tipoCaminhao: "Bitruck" },
  { nome: "Alessandro Trucolo ( Sergio Lucas)", placa: "ATC-0B34/", tipoCaminhao: "Carreta" },
  { nome: "Carlos Cesar da Silva", placa: "GXA-3H65 / JYI0779", tipoCaminhao: "Carreta" },
  { nome: "José Wilson Macedo", placa: "MEP-3E95 / CPN-8057", tipoCaminhao: "Carreta" },
  { nome: "José Vicente de Macedo", placa: "EKH-6541 / MIN-3393", tipoCaminhao: "Carreta" },
  { nome: "Gislaine Inacio Camilo ( Valdomiro )", placa: "BXG-1834", tipoCaminhao: "Truck" },
  { nome: "Rodrigo Aparecido de Lima Tarocco", placa: "", tipoCaminhao: "Carreta" },
  { nome: "Alistom Carlos de Brito (Zé Roberto)", placa: "DCY-6473", tipoCaminhao: "Truck" },
  { nome: "Gustavo da Rocha Pinto (Joelcio)", placa: "DBC3I09", tipoCaminhao: "Bitruck" },
  { nome: "Leandro", placa: "CQH-7A91", tipoCaminhao: "Truck" },
  { nome: "Irineu Junior Bonffi", placa: "DVS0309 / AJA9I19 / AJA9I17", tipoCaminhao: "Bitrem" },
  { nome: "Anderson Gustavo", placa: "BTT-8H19", tipoCaminhao: "Truck" },
  { nome: "SERGIO (Arnaldo)", placa: "GAT-4B44 / EWU6C97", tipoCaminhao: "Carreta" },
  { nome: "SERGIO (Vanderlei)", placa: "DTE1366", tipoCaminhao: "Truck" }
];

function seedMotoristas(){
  let changed = false;
  SEED_MOTORISTAS.forEach(m => {
    if(!cad.motoristas.some(x => normStr(x.nome) === normStr(m.nome))){
      cad.motoristas.push({ nome: m.nome, placa: m.placa, tipoCaminhao: m.tipoCaminhao });
      changed = true;
    }
    if(m.placa && !cad.placas.some(x => normStr(x.placa) === normStr(m.placa))){
      cad.placas.push({ placa: m.placa, motorista: m.nome });
      changed = true;
    }
  });
  if(changed) saveCad();
}

const SEED_PRODUTORES = [
  { nome: "WILSON YUDI SAKASHITA", codigo: "4600002015", tipoColheita: "Manual", cidade: "", variedade: "" },
  { nome: "VITOR KENZO TOMITA E OUTRO", codigo: "4600002018", tipoColheita: "Manual", cidade: "", variedade: "" },
  { nome: "GUILHERME MARRAFON FAZ", codigo: "4600001972", tipoColheita: "Mecânica", cidade: "", variedade: "" }
];

function seedProdutores(){
  let changed = false;
  SEED_PRODUTORES.forEach(p => {
    const existing = cad.produtores.find(x => normStr(x.nome) === normStr(p.nome));
    if(!existing){
      cad.produtores.push({ nome: p.nome, codigo: p.codigo, tipoColheita: p.tipoColheita, cidade: p.cidade, variedade: p.variedade });
      changed = true;
    } else {
      if(!existing.codigo && p.codigo) { existing.codigo = p.codigo; changed = true; }
      if(!existing.tipoColheita && p.tipoColheita) { existing.tipoColheita = p.tipoColheita; changed = true; }
    }
  });
  if(changed) saveCad();
}

function showLoading(ms=250, includeOverlay=false){
  const bar=document.getElementById('topLoader');
  const overlay=document.getElementById('loadingOverlay');
  if(bar){bar.classList.remove('loading'); void bar.offsetWidth; bar.classList.add('loading');}
  if(overlay && includeOverlay){overlay.classList.add('show');}
  setTimeout(()=>{
    if(bar){bar.classList.remove('loading');}
    if(overlay){overlay.classList.remove('show');}
  },ms);
}

function generateTruckCode(){
  const letters='ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers='0123456789';
  let code='';
  do{
    const chars=[];
    for(let i=0;i<3;i++) chars.push(numbers[Math.floor(Math.random()*numbers.length)]);
    for(let i=0;i<2;i++) chars.push(letters[Math.floor(Math.random()*letters.length)]);
    for(let i=chars.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [chars[i],chars[j]]=[chars[j],chars[i]];
    }
    code=chars.join('');
  }while(trucks&&trucks.some(t=>t.codigo===code));
  return code;
}

function generateBarcodeSVG(code){
  const code39Map={
    '0':'000110100','1':'100100001','2':'001100001','3':'101100000','4':'000110001',
    '5':'100110000','6':'001110000','7':'000100101','8':'100100100','9':'001100100',
    'A':'100001001','B':'001001001','C':'101001000','D':'000011001','E':'100011000',
    'F':'001011000','G':'000001101','H':'100001100','I':'001001100','J':'000011100',
    'K':'100000011','L':'001000011','M':'101000010','N':'000010011','O':'100010010',
    'P':'001010010','Q':'000000111','R':'100000110','S':'001000110','T':'000010110',
    'U':'110000001','V':'011000001','W':'111000000','X':'010010001','Y':'110010000',
    'Z':'011010000','*':'010010100','-':'010000101','.':'110000100',' ':'011000100'
  };
  const str='*'+String(code).toUpperCase()+'*';
  let curX=10;
  const height=55;
  let svgRects='';
  for(let i=0;i<str.length;i++){
    const char=str[i];
    const pattern=code39Map[char]||code39Map['*'];
    for(let j=0;j<9;j++){
      const isBar=(j%2===0);
      const isWide=(pattern[j]==='1');
      const width=isWide?3:1;
      if(isBar){
        svgRects+='<rect x="'+curX+'" y="0" width="'+width+'" height="'+height+'" fill="#000000"/>';
      }
      curX+=width;
    }
    curX+=1.5;
  }
  const totalWidth=curX+10;
  return '<svg viewBox="0 0 '+totalWidth+' '+height+'" xmlns="http://www.w3.org/2000/svg">'+svgRects+'</svg>';
}

function load(){
  try{trucks=JSON.parse(localStorage.getItem(LS_TRUCKS))||[]}catch(e){trucks=[]}
  try{cad=Object.assign({produtores:[],motoristas:[],placas:[],variedades:[]},JSON.parse(localStorage.getItem(LS_CAD))||{})}catch(e){}
  loadProg();
  let changed=false;
  trucks.forEach(t=>{
    if(!t.codigo){
      t.codigo=generateTruckCode();
      changed=true;
    }
  });
  if(changed) save();
  seedMotoristas();
  seedProdutores();
}
function save(){localStorage.setItem(LS_TRUCKS,JSON.stringify(trucks))}
function saveCad(){localStorage.setItem(LS_CAD,JSON.stringify(cad));fillDatalists()}

/* ================= PROGRAMAÇÃO DO DIA =================
   Informado no 1º turno: a roça, o contrato e a variedade que será moída.
   A variedade principal vale para a maioria dos caminhões; placas
   específicas e roças específicas podem ter variedade própria.

   Precedência ao resolver a variedade de um caminhão:
     1. placa listada nas exceções  (mais específica)
     2. roça do caminhão, se a roça tem variedade própria
     3. variedade principal do dia
   ======================================================= */

function progVazia(){
  return {contrato:'',variedadePrincipal:'',vigenciaInicio:todayISO(),vigenciaFim:'',excecoes:[],rocas:[]};
}

function loadProg(){
  try{prog=Object.assign(progVazia(),JSON.parse(localStorage.getItem(LS_PROG))||{})}catch(e){prog=progVazia()}
  if(!Array.isArray(prog.excecoes))prog.excecoes=[];
  if(!Array.isArray(prog.rocas))prog.rocas=[];
}

function saveProg(){localStorage.setItem(LS_PROG,JSON.stringify(prog));renderProg()}

/* Placas são digitadas com e sem hífen, em maiúscula e minúscula.
   Comparação só sobre letras e números. */
function normPlaca(p){return String(p||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}

/* Vigência. Sem data fim = vale até ser editada ou removida. */
function progVigente(iso){
  const d=iso||todayISO();
  if(!progPreenchida())return false;
  if(prog.vigenciaInicio&&d<prog.vigenciaInicio)return false;
  if(prog.vigenciaFim&&d>prog.vigenciaFim)return false;
  return true;
}

function progPreenchida(){
  return !!(prog.variedadePrincipal||prog.contrato||prog.excecoes.length||prog.rocas.length);
}

/* Quantos dias faltam para vencer. null = sem prazo. */
function progDiasRestantes(){
  if(!prog.vigenciaFim)return null;
  const hoje=new Date(todayISO()+'T00:00:00'), fim=new Date(prog.vigenciaFim+'T00:00:00');
  return Math.round((fim-hoje)/86400000);
}

/* ---- Painel fixo ---- */

function renderProg(){
  const el=document.getElementById('progPanel');
  if(!el)return;

  if(!progPreenchida()){
    el.className='prog vazia';
    el.innerHTML=
      '<div class="prog-empty">'+
        '<div class="prog-empty-txt">'+
          '<b>Nenhuma programação definida</b>'+
          '<span>Informe a variedade do dia, o contrato e as roças no início do 1º turno.</span>'+
        '</div>'+
        '<button class="btn primary" onclick="openProg()">Definir programação</button>'+
      '</div>';
    return;
  }

  const vigente=progVigente();
  const dias=progDiasRestantes();
  el.className='prog'+(vigente?'':' vencida');

  /* Selo de vigência: vencida, últimos dias, ou sem prazo. */
  let selo;
  if(!vigente&&prog.vigenciaFim&&todayISO()>prog.vigenciaFim)
    selo='<span class="prog-selo venc">Vencida em '+fmtDateBR(prog.vigenciaFim)+'</span>';
  else if(!vigente&&prog.vigenciaInicio&&todayISO()<prog.vigenciaInicio)
    selo='<span class="prog-selo fut">Começa em '+fmtDateBR(prog.vigenciaInicio)+'</span>';
  else if(dias===null)
    selo='<span class="prog-selo">Sem prazo</span>';
  else if(dias<=0)
    selo='<span class="prog-selo venc">Último dia</span>';
  else if(dias<=2)
    selo='<span class="prog-selo alerta">Vence em '+dias+' dia'+(dias>1?'s':'')+'</span>';
  else
    selo='<span class="prog-selo">Até '+fmtDateBR(prog.vigenciaFim)+'</span>';

  const rocas=prog.rocas.length
    ? prog.rocas.map(r=>
        '<span class="prog-chip">'+esc(r.nome)+
        (r.variedade?'<i class="prog-chip-v">'+esc(r.variedade)+'</i>':'')+
        '</span>').join('')
    : '<span class="prog-none">nenhuma roça informada</span>';

  const exc=prog.excecoes.length
    ? prog.excecoes.map(e=>
        '<span class="prog-chip placa">'+esc(e.placa)+
        (e.variedade?'<i class="prog-chip-v">'+esc(e.variedade)+'</i>':'')+
        '</span>').join('')
    : '<span class="prog-none">nenhuma — todos seguem a variedade principal</span>';

  el.innerHTML=
    '<div class="prog-head">'+
      '<div class="prog-id">'+
        '<span class="prog-tag">Programação do dia</span>'+
        selo+
      '</div>'+
      '<div class="prog-acoes">'+
        '<button class="btn ghost sm" onclick="openProg()">Editar</button>'+
        '<button class="btn ghost sm danger" onclick="limparProg()">Remover</button>'+
      '</div>'+
    '</div>'+
    '<div class="prog-grid">'+
      '<div class="prog-bloco destaque">'+
        '<span class="prog-lbl">Variedade principal</span>'+
        '<b class="prog-var">'+esc(prog.variedadePrincipal||'—')+'</b>'+
        '<span class="prog-sub">a que a maioria dos caminhões segue</span>'+
      '</div>'+
      '<div class="prog-bloco">'+
        '<span class="prog-lbl">Contrato</span>'+
        '<b class="prog-contrato">'+esc(prog.contrato||'—')+'</b>'+
        '<span class="prog-sub">vigência '+fmtDateBR(prog.vigenciaInicio)+
          (prog.vigenciaFim?' a '+fmtDateBR(prog.vigenciaFim):' em diante')+'</span>'+
      '</div>'+
      '<div class="prog-bloco largo">'+
        '<span class="prog-lbl">Roças do dia<i class="prog-ct">'+prog.rocas.length+'</i></span>'+
        '<div class="prog-chips">'+rocas+'</div>'+
      '</div>'+
      '<div class="prog-bloco largo">'+
        '<span class="prog-lbl">Placas com variedade própria<i class="prog-ct">'+prog.excecoes.length+'</i></span>'+
        '<div class="prog-chips">'+exc+'</div>'+
      '</div>'+
    '</div>';
}

/* ---- Editor ---- */

/* Rascunho: só grava no localStorage quando o operador confirma,
   para que fechar no meio não destrua a programação vigente. */
let progDraft=null;

function openProg(){
  progDraft=JSON.parse(JSON.stringify(prog));
  if(!progDraft.vigenciaInicio)progDraft.vigenciaInicio=todayISO();
  renderProgForm();
  openModal('progModal');
  setTimeout(()=>{const f=document.getElementById('progVar');if(f)f.focus()},60);
}

function renderProgForm(){
  const linhaRoca=(r,i)=>
    '<div class="prog-row">'+
      '<input placeholder="Nome da roça" list="dl_produtores" value="'+esc(r.nome)+'" '+
        'oninput="progDraft.rocas['+i+'].nome=this.value">'+
      '<input placeholder="Variedade desta roça (opcional)" list="dl_variedades" value="'+esc(r.variedade)+'" '+
        'oninput="progDraft.rocas['+i+'].variedade=this.value">'+
      '<button class="btn ghost sm danger" onclick="progDel(\'rocas\','+i+')" aria-label="Remover roça">Remover</button>'+
    '</div>';

  const linhaExc=(e,i)=>
    '<div class="prog-row">'+
      '<input placeholder="Placa" list="dl_placas" value="'+esc(e.placa)+'" '+
        'oninput="progDraft.excecoes['+i+'].placa=this.value">'+
      '<input placeholder="Variedade desta placa" list="dl_variedades" value="'+esc(e.variedade)+'" '+
        'oninput="progDraft.excecoes['+i+'].variedade=this.value">'+
      '<button class="btn ghost sm danger" onclick="progDel(\'excecoes\','+i+')" aria-label="Remover placa">Remover</button>'+
    '</div>';

  document.getElementById('progRocas').innerHTML=
    progDraft.rocas.length?progDraft.rocas.map(linhaRoca).join('')
    :'<p class="prog-hint">Nenhuma roça. Adicione uma ou mais abaixo.</p>';

  document.getElementById('progExc').innerHTML=
    progDraft.excecoes.length?progDraft.excecoes.map(linhaExc).join('')
    :'<p class="prog-hint">Nenhuma. Sem exceções, todos os caminhões seguem a variedade principal.</p>';

  document.getElementById('progVar').value=progDraft.variedadePrincipal||'';
  document.getElementById('progContrato').value=progDraft.contrato||'';
  document.getElementById('progIni').value=progDraft.vigenciaInicio||'';
  document.getElementById('progFim').value=progDraft.vigenciaFim||'';
}

/* Os campos do topo só existem no DOM até o próximo renderProgForm().
   Sem isto, adicionar ou remover uma linha apagaria o que foi digitado
   em variedade, contrato e vigência. */
function progSyncTopo(){
  const g=id=>{const e=document.getElementById(id);return e?e.value:''};
  progDraft.variedadePrincipal=g('progVar');
  progDraft.contrato=g('progContrato');
  progDraft.vigenciaInicio=g('progIni');
  progDraft.vigenciaFim=g('progFim');
}

function progAdd(tipo){
  progSyncTopo();
  progDraft[tipo].push(tipo==='rocas'?{nome:'',variedade:''}:{placa:'',variedade:''});
  renderProgForm();
  /* Foca o campo recém-criado: o operador está adicionando em sequência. */
  const wrap=document.getElementById(tipo==='rocas'?'progRocas':'progExc');
  const ult=wrap.querySelector('.prog-row:last-child .inp');
  if(ult)ult.focus();
}

function progDel(tipo,i){progSyncTopo();progDraft[tipo].splice(i,1);renderProgForm()}

function saveProgForm(){
  progSyncTopo();
  progDraft.variedadePrincipal=progDraft.variedadePrincipal.trim();
  progDraft.contrato=progDraft.contrato.trim();

  if(progDraft.vigenciaFim&&progDraft.vigenciaInicio&&progDraft.vigenciaFim<progDraft.vigenciaInicio){
    toast('A data final é anterior à inicial. Corrija a vigência.','err');
    document.getElementById('progFim').focus();
    return;
  }

  /* Descarta linhas em branco e avisa sobre placa sem variedade, que
     seria uma exceção que não excetua nada. */
  progDraft.rocas=progDraft.rocas.filter(r=>r.nome.trim()).map(r=>({nome:r.nome.trim(),variedade:r.variedade.trim()}));
  /* Placa em maiúscula: é como está no cadastro e na guia. A comparação
     já ignora hífen e caixa, isto é só para a leitura no painel. */
  progDraft.excecoes=progDraft.excecoes.filter(e=>e.placa.trim())
    .map(e=>({placa:e.placa.trim().toUpperCase(),variedade:e.variedade.trim()}));
  const semVar=progDraft.excecoes.filter(e=>!e.variedade.trim());
  if(semVar.length){
    toast('Placa sem variedade: '+semVar.map(e=>e.placa).join(', ')+'. Informe a variedade ou remova a linha.','err');
    return;
  }

  /* Variedades novas entram no cadastro, como já acontece no registro de entrada. */
  let novas=false;
  [progDraft.variedadePrincipal,...progDraft.rocas.map(r=>r.variedade),...progDraft.excecoes.map(e=>e.variedade)]
    .filter(Boolean)
    .forEach(v=>{
      if(!cad.variedades.some(x=>normStr(x.nome)===normStr(v))){cad.variedades.push({nome:v});novas=true}
    });
  if(novas)saveCad();

  prog=progDraft;
  saveProg();
  closeModal('progModal');
  toast('Programação do dia salva.');
}

function limparProg(){
  if(!confirm('Remover a programação do dia? As informações de variedade, contrato e roças serão apagadas.'))return;
  prog=progVazia();
  saveProg();
  toast('Programação removida.');
}

/* Resolve a variedade esperada de um caminhão pela placa e pela roça. */
function variedadeEsperada(placa,roca){
  if(!progVigente())return null;
  const np=normPlaca(placa);
  if(np){
    const ex=prog.excecoes.find(e=>normPlaca(e.placa)===np);
    if(ex&&ex.variedade)return {variedade:ex.variedade,origem:'placa'};
  }
  if(roca){
    const r=prog.rocas.find(x=>normStr(x.nome)===normStr(roca));
    if(r&&r.variedade)return {variedade:r.variedade,origem:'roça'};
  }
  if(prog.variedadePrincipal)return {variedade:prog.variedadePrincipal,origem:'principal'};
  return null;
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

/* ---------------- Utilidades ---------------- */
const pad=n=>String(n).padStart(2,'0');
function toNum(v){if(v===''||v===null||v===undefined)return null;const n=parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n}
function fmtKg(n){return n===null||n===undefined?'—':n.toLocaleString('pt-BR')+' kg'}
function fmtDateBR(iso){if(!iso)return'—';const p=iso.split('-');return p[2]+'/'+p[1]+'/'+p[0]}
function todayISO(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function nowHM(){const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())}
function combine(dateISO,hm){if(!dateISO||!hm)return null;const a=dateISO.split('-').map(Number),b=hm.split(':').map(Number);return new Date(a[0],a[1]-1,a[2],b[0],b[1],0)}
function minutesOfDay(d){return d.getHours()*60+d.getMinutes()}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

/* ---------------- Turnos ---------------- */
function turnoAtual(d){const m=minutesOfDay(d);if(m>=360&&m<=855)return 1;if(m>=856&&m<=1340)return 2;return 3}
function turnoAtribuicao(d){const m=minutesOfDay(d),S1=360,S2=856,S3=1341,TOL=25;
  if(m>S1+TOL&&m<=S2+TOL)return 1;if(m>S2+TOL&&m<=S3+TOL)return 2;return 3}
const TURNO_RANGE={1:'06:00 – 14:15',2:'14:16 – 22:20',3:'22:21 – 05:59'};

/* ---------------- Status ---------------- */
const H12=12*60*60*1000;
function liberaEm(t){const c=combine(t.data,t.horaChegada);if(!c)return null;return new Date(c.getTime()+H12)}
function getStatus(t){
  if(t.horaSaida&&t.pesoTara!=null)return 'moido';
  if(t.moagemManual==='em_moagem')return 'em_moagem';
  if(t.pesoBruto!=null&&t.horaPesoBruto)return 'aguardando_moagem';
  if(t.forcarLiberacao)return 'liberado';
  const rel=liberaEm(t);if(rel&&Date.now()>=rel.getTime())return 'liberado';
  return 'patio';
}
const STATUS_LABEL={patio:'No pátio',liberado:'Liberado 2ª',aguardando_moagem:'Aguard. moagem',em_moagem:'Em moagem',moido:'Moído'};
function stKey(t,s){return (t.pesagemAntecipada&&s!=='moido')?'antecipado':s}
function badge(s,t){
  if(t&&t.pesagemAntecipada&&s!=='moido')return '<span class="badge b-antecipado">Antecipado</span>';
  return '<span class="badge b-'+s+'">'+STATUS_LABEL[s]+'</span>';
}
function countdown(ms){if(ms<=0)return 'liberado';const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);return pad(h)+':'+pad(m)+':'+pad(s)}

/* ---------------- Cálculos ---------------- */
function pesoLiquido(t){if(t.pesoBruto!=null&&t.pesoTara!=null)return t.pesoBruto-t.pesoTara;return null}
function difKg(t){const liq=pesoLiquido(t);if(liq!=null&&t.pesoNF!=null)return t.pesoNF-liq;return null}

/* ---------------- Relógio + contadores ---------------- */
function tick(){
  const d=new Date();
  document.getElementById('clockTime').textContent=pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
  document.getElementById('clockDate').textContent=d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});
  document.getElementById('turnoAtual').textContent=turnoAtual(d)+'º Turno';
  document.querySelectorAll('[data-cd]').forEach(el=>{
    const rel=parseInt(el.getAttribute('data-cd')),ms=rel-Date.now();
    el.textContent=ms<=0?(el.classList.contains('big')?'PRONTO':'liberado'):countdown(ms);
    el.classList.remove('warn','ok');el.classList.add(ms<=0?'ok':(ms<3600000?'warn':'cd'));
  });
  document.querySelectorAll('[data-ring]').forEach(el=>{
    const c=combine(el.dataset.data,el.dataset.hc);if(!c)return;
    const p=Math.max(0,Math.min(100,(Date.now()-c.getTime())/H12*100));el.style.setProperty('--p',p.toFixed(1));
  });
}
setInterval(tick,1000);

/* ---------------- Navegação ---------------- */
const PAGE={chegada:['Planilha de Chegada','Registro de entrada dos caminhões'],patio:['Pátio','Caminhões aguardando 2ª pesagem'],
  moagem:['Moagem','Acompanhamento da moagem'],todos:['Todos os Caminhões','Central de consulta e busca geral de cargas'],painel:['Painel','Indicadores em tempo real'],relatorios:['Relatórios','Análise da operação'],cadastros:['Cadastros','Motoristas, produtores, placas e variedades']};
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  const v=b.dataset.view;currentView=v;
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  document.getElementById('pageTitle').textContent=PAGE[v][0];document.getElementById('pageSub').textContent=PAGE[v][1];
  document.getElementById('sidebar').classList.remove('open');renderView(v);
  staggerRows(v);
});

/* Stagger só na troca de tela — nunca no re-render que acontece a cada
   registro salvo, senão a tabela reanimaria embaixo de quem digita.
   A classe é retirada depois de assentar, para que o próximo render
   (peso gravado, filtro trocado) apareça instantâneo. */
function staggerRows(v){
  if(REDUCED())return;
  const tb=document.querySelectorAll('#view-'+v+' tbody');
  tb.forEach(t=>{
    t.classList.remove('stagger');
    void t.offsetWidth;
    t.classList.add('stagger');
    setTimeout(()=>t.classList.remove('stagger'),520);
  });
}
function goView(v){document.querySelector('.nav button[data-view="'+v+'"]').click()}
function renderView(v){
  showLoading(200, false);
  ({chegada:renderChegada,patio:renderPatio,moagem:renderMoagem,todos:renderTodos,painel:renderPainel,relatorios:renderRelatorios,cadastros:renderCadastros}[v]||(()=>{}))();
}

/* ---------------- Datalists ---------------- */
function fillDatalists(){
  const set=(id,arr)=>{document.getElementById(id).innerHTML=arr.map(v=>'<option value="'+esc(v)+'">').join('')};
  set('dl_motoristas',cad.motoristas.map(m=>m.nome));
  set('dl_produtores',cad.produtores.map(p=>p.nome));
  set('dl_cidades',[...new Set(cad.produtores.map(p=>p.cidade).filter(Boolean))]);
  set('dl_placas',cad.placas.map(p=>p.placa));
  set('dl_variedades',cad.variedades.map(v=>v.nome));
}
function onProdutorPick(){
  const nome=normStr(F('produtor').value);
  if(!nome) return;
  const p=cad.produtores.find(x=>normStr(x.nome)===nome);
  if(p){
    if(p.cidade && !F('cidade').value) F('cidade').value=p.cidade;
    if(p.variedade && !F('variedade').value) F('variedade').value=p.variedade;
    if(p.codigo && F('codigoRoca')) F('codigoRoca').value=p.codigo;
    if(p.tipoColheita && F('tipoColheita')) F('tipoColheita').value=p.tipoColheita;
  }
}
function onMotoristaPick(){
  const nome=normStr(F('motorista').value);
  if(!nome) return;
  const m=cad.motoristas.find(x=>normStr(x.nome)===nome);
  if(m){
    if(m.placa && !F('placaVeiculo').value) F('placaVeiculo').value=m.placa;
    if(m.tipoCaminhao && !F('tipoCaminhao').value) F('tipoCaminhao').value=m.tipoCaminhao;
  }
}

/* =========================================================
   WIZARD — Registrar Entrada (3 passos, emite ao confirmar)
   ========================================================= */
const F=id=>document.getElementById('f_'+id);
const WIZ_REQ={1:[['data','Data'],['numeroChegada','Nº de chegada'],['horaChegada','Hora da chegada'],['pesoChegada','Peso 1ª pesagem'],['responsavel','Responsável']],
  2:[['motorista','Motorista'],['placaVeiculo','Placa'],['tipoCaminhao','Tipo de caminhão'],['gtlId','Número GTL'],['produtor','Produtor']],
  3:[]}; // Removido 'notaFiscal' da obrigação no wizard, tratamos no saveEntry/validatePrint
function nextGtlNumber(){
  const nums = trucks.map(t => parseInt(t.gtlId || t.numeroGuia)).filter(n => !isNaN(n) && n > 0);
  return nums.length ? Math.max(...nums) + 1 : '';
}

function openEntry(){
  editingId=null;wizStep=1;
  ['data','numeroChegada','numeroGuia','motorista','placaVeiculo','produtor','codigoRoca','cidade','gtlId','variedade','tipoCaminhao','horaChegada','pesoChegada','responsavel','tipoEmbalagem','tipoColheita','horaPesoBruto','pesoBruto','pesoMotorista','pesagemAntecipada','obsPesagem','horaSaida','pesoTara','pesoNF','notaFiscal','observacoes'].forEach(k=>{const e=F(k);if(e)e.value=''});
  F('data').value=todayISO();F('horaChegada').value=nowHM();
  
  const nextNum = nextNumeroChegada();
  const nextGtl = nextGtlNumber();
  
  F('numeroChegada').value = nextNum;
  if(F('numeroGuia')) F('numeroGuia').value = nextGtl;
  if(F('gtlId')) F('gtlId').value = nextGtl;
  
  F('tipoEmbalagem').value='Granel';F('tipoColheita').value='Manual';
  
  const fGuia=F('numeroGuia'), fGtl=F('gtlId');
  if(fGuia && fGtl) {
    fGuia.oninput=function(){ fGtl.value=this.value; };
    fGtl.oninput=function(){ fGuia.value=this.value; };
  }
  
  document.querySelectorAll('#entryModal .miss').forEach(e=>e.classList.remove('miss'));
  wizShow(1);openModal('entryModal');setTimeout(()=>F('numeroChegada').focus(),90);
}
function nextNumeroChegada(){
  const nums = trucks.map(t => parseInt(t.numeroChegada)).filter(n => !isNaN(n) && n > 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}
function fillNow(){F('horaChegada').value=nowHM()}
function wizShow(step){
  wizStep=step;
  const fGuia=F('numeroGuia'), fGtl=F('gtlId');
  if(fGuia && fGtl) {
    if(fGuia.value && !fGtl.value) fGtl.value=fGuia.value;
    else if(fGtl.value && !fGuia.value) fGuia.value=fGtl.value;
  }
  document.querySelectorAll('#entryModal .step').forEach(s=>s.classList.toggle('active',+s.dataset.step===step));
  document.querySelectorAll('#stepper .stp').forEach(s=>{const n=+s.dataset.s;s.classList.toggle('active',n===step);s.classList.toggle('done',n<step)});
  document.getElementById('wizBack').style.visibility=step===1?'hidden':'visible';
  document.getElementById('wizNext').innerHTML=step<3?'Continuar':'Confirmar Entrada';
  if(step===3)buildReview();
}
function wizGo(d){const n=wizStep+d;if(n>=1&&n<=3)wizShow(n)}
function validateStep(step){
  let ok=true;
  WIZ_REQ[step].forEach(([k,l])=>{
    const e=F(k);
    if(!e) return;
    e.classList.remove('miss');
    if(!e.value.trim()){
      if(k==='gtlId' && F('numeroGuia') && F('numeroGuia').value.trim()) {
        e.value = F('numeroGuia').value.trim();
      } else {
        e.classList.add('miss');
        ok=false;
      }
    }
  });
  
  if(step === 3) {
    const nf = F('notaFiscal');
    const guia = F('numeroGuia');
    nf.classList.remove('miss');
    if(!nf.value.trim() && !guia.value.trim()) {
      nf.classList.add('miss');
      ok=false;
    }
  }
  
  if(!ok)toast('Preencha os campos obrigatórios destacados.','err');
  return ok;
}
/* =========================================================
   ÁUDIO & ANIMAÇÕES INTERATIVAS (Web Audio API + Voo de Check/Lixeira)
   ========================================================= */
let audioCtx = null;
function getAudioContext(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if(audioCtx.state === 'suspended'){
    audioCtx.resume();
  }
  return audioCtx;
}

function playSuccessSound(){
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Nota 1 (E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);
    
    // Nota 2 (B5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.08);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.5);
  } catch(e) {}
}

function playTrashSound(){
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.28);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  } catch(e) {}
}

function animAddTruck(truckId){
  playSuccessSound();
  
  const overlay = document.createElement('div');
  overlay.className = 'anim-check-overlay';
  overlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
  document.body.appendChild(overlay);
  
  requestAnimationFrame(() => {
    overlay.classList.add('pop-in');
  });
  
  setTimeout(() => {
    const target = document.querySelector(`tr[data-id="${truckId}"]`) || document.querySelector(`.kcard[data-id="${truckId}"]`) || document.querySelector(`.tcard[data-id="${truckId}"]`);
    
    if(target) {
      const rect = target.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2;
      const targetY = rect.top + rect.height / 2;
      
      overlay.style.left = targetX + 'px';
      overlay.style.top = targetY + 'px';
      overlay.style.transform = 'translate(-50%, -50%) scale(0.2)';
      overlay.style.opacity = '0';
      
      setTimeout(() => {
        if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
        
        target.classList.add('row-receive-anim');
        target.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'nearest' });
        /* 320ms = duração da varredura, o mais longo dos dois gestos.
           Era 850ms com pulso de background-color. */
        setTimeout(() => {
          target.classList.remove('row-receive-anim');
        }, 320);
      }, 500);
    } else {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 300);
    }
  }, 450);
}

function animDeleteTruck(truckId, onComplete){
  const target = document.querySelector(`tr[data-id="${truckId}"]`) || document.querySelector(`.tcard[data-id="${truckId}"]`) || document.querySelector(`.kcard[data-id="${truckId}"]`);
  
  playTrashSound();
  
  let trash = document.querySelector('.anim-trash-bin');
  if(!trash){
    trash = document.createElement('div');
    trash.className = 'anim-trash-bin';
    trash.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';
    document.body.appendChild(trash);
  }
  
  trash.classList.add('show');
  trash.classList.add('shake');
  
  if(target){
    const rect = target.getBoundingClientRect();
    const trashRect = trash.getBoundingClientRect();
    const deltaX = (trashRect.left + trashRect.width/2) - (rect.left + rect.width/2);
    const deltaY = (trashRect.top + trashRect.height/2) - (rect.top + rect.height/2);
    
    target.classList.add('row-fly-trash');
    target.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.1) rotate(25deg)`;
    target.style.opacity = '0';
    
    setTimeout(() => {
      trash.classList.remove('shake');
      setTimeout(() => trash.classList.remove('show'), 300);
      if(onComplete) onComplete();
    }, 500);
  } else {
    setTimeout(() => {
      trash.classList.remove('shake');
      trash.classList.remove('show');
      if(onComplete) onComplete();
    }, 300);
  }
}

function wizNext(){if(wizStep<3){if(validateStep(wizStep))wizShow(wizStep+1);return}
  if(!validateStep(1)){wizShow(1);return}if(!validateStep(2)){wizShow(2);return}if(!validateStep(3))return;
  const t=saveEntry();if(t){closeModal('entryModal');animAddTruck(t.id);toast('Entrada registrada com sucesso.');}}
function buildReview(){
  const gtlVal = F('gtlId').value || F('numeroGuia').value || '—';
  const rows=[['Nº Chegada',F('numeroChegada').value],['Motorista',F('motorista').value],['Placa',F('placaVeiculo').value],
    ['Produtor',F('produtor').value],['Cidade',F('cidade').value||'—'],['Tipo',F('tipoCaminhao').value||'—'],
    ['GTL',gtlVal],['Nota Fiscal',F('notaFiscal').value||'—'],['Peso 1ª',(F('pesoChegada').value||'—')+' kg']];
  document.getElementById('entryReview').innerHTML='<h4>Resumo da entrada</h4><div class="rg">'+
    rows.map(r=>'<div class="ri"><span>'+r[0]+'</span><b>'+esc(r[1]||'—')+'</b></div>').join('')+'</div>';
}
function saveEntry(){
  const gtlVal = F('gtlId').value.trim() || F('numeroGuia').value.trim();
  const rec={id:uid(),
    codigo:generateTruckCode(),
    data:F('data').value,numeroChegada:F('numeroChegada').value.trim(),numeroGuia:gtlVal,
    motorista:F('motorista').value.trim(),placaVeiculo:F('placaVeiculo').value.trim().toUpperCase(),
    produtor:F('produtor').value.trim(),cidade:F('cidade').value.trim(),gtlId:gtlVal,
    variedade:F('variedade').value.trim(),tipoCaminhao:F('tipoCaminhao').value,
    horaChegada:F('horaChegada').value,pesoChegada:toNum(F('pesoChegada').value),
    responsavel:F('responsavel').value.trim(),tipoEmbalagem:F('tipoEmbalagem').value,tipoColheita:F('tipoColheita').value,
    horaPesoBruto:'',pesoBruto:null,pesoMotorista:null,pesagemAntecipada:false,obsPesagem:'',
    horaSaida:'',pesoTara:null,pesoNF:toNum(F('pesoNF').value),
    notaFiscal:F('notaFiscal').value.trim(),observacoes:F('observacoes').value.trim(),
    moagemManual:null,createdAt:Date.now()};
  learnCad(rec);trucks.push(rec);save();refreshAll();return rec;
}
function learnCad(rec){
  let ch=false;
  if(rec.motorista&&!cad.motoristas.some(m=>normStr(m.nome)===normStr(rec.motorista))){cad.motoristas.push({nome:rec.motorista,placa:rec.placaVeiculo||''});ch=true}
  if(rec.produtor&&!cad.produtores.some(p=>normStr(p.nome)===normStr(rec.produtor))){cad.produtores.push({nome:rec.produtor,cidade:rec.cidade||'',variedade:rec.variedade||''});ch=true}
  else if(rec.produtor){const p=cad.produtores.find(p=>normStr(p.nome)===normStr(rec.produtor));if(p){if(rec.cidade&&!p.cidade){p.cidade=rec.cidade;ch=true}if(rec.variedade&&!p.variedade){p.variedade=rec.variedade;ch=true}}}
  if(rec.placaVeiculo&&!cad.placas.some(p=>normStr(p.placa)===normStr(rec.placaVeiculo))){cad.placas.push({placa:rec.placaVeiculo,motorista:rec.motorista||''});ch=true}
  if(rec.variedade&&!cad.variedades.some(v=>normStr(v.nome)===normStr(rec.variedade))){cad.variedades.push({nome:rec.variedade});ch=true}
  if(ch)saveCad();
}

/* =========================================================
   EDIT MODAL — edição completa
   ========================================================= */
const EDIT_FIELDS=[
  ['data','Data','date'],['numeroChegada','Nº de Chegada','text'],['numeroGuia','Nº da Guia','text'],
  ['motorista','Motorista','text','dl_motoristas'],['placaVeiculo','Placa','text','dl_placas'],['tipoCaminhao','Tipo de Caminhão','select',['Truck','Bitruck','Carreta','Bitrem']],
  ['produtor','Produtor / Roça','text','dl_produtores'],['cidade','Cidade','text','dl_cidades'],['variedade','Variedade','text','dl_variedades'],
  ['gtlId','Número GTL','text'],['horaChegada','Hora Chegada','time'],['pesoChegada','Peso 1ª (kg)','number'],
  ['responsavel','Responsável','text'],['tipoEmbalagem','Embalagem','select',['Granel','Caixa']],['tipoColheita','Colheita','select',['Manual','Mecânica']],
  ['horaPesoBruto','Hora 2ª Pesagem','time'],['pesoBruto','Peso Bruto (kg)','number'],['pesoMotorista','Peso Motorista (kg)','number'],
  ['horaSaida','Hora Saída','time'],['pesoTara','Peso Tara (kg)','number'],['pesoNF','Peso NF (kg)','number'],
  ['notaFiscal','Nota Fiscal','text'],['observacoes','Observações','textarea']
];
function openEdit(id){
  const t=trucks.find(x=>x.id===id);if(!t)return;editingId=id;
  document.getElementById('editBody').innerHTML=EDIT_FIELDS.map(f=>{
    const val=esc(t[f[0]]==null?'':t[f[0]]);const cls=f[2]==='textarea'?' c3':'';
    let inp;
    if(f[2]==='select')inp='<select id="e_'+f[0]+'">'+f[3].map(o=>'<option'+(t[f[0]]===o?' selected':'')+'>'+o+'</option>').join('')+'</select>';
    else if(f[2]==='textarea')inp='<textarea id="e_'+f[0]+'" rows="2">'+val+'</textarea>';
    else inp='<input id="e_'+f[0]+'" type="'+f[2]+'" value="'+val+'"'+(typeof f[3]==='string'?' list="'+f[3]+'" autocomplete="off"':'')+'>';
    return '<div class="fg'+cls+'"><label>'+f[1]+'</label>'+inp+'</div>';
  }).join('')+'<div class="fg c3"><label><input type="checkbox" id="e_pesagemAntecipada"'+(t.pesagemAntecipada?' checked':'')+'> Pesado antes do horário (12h)</label></div>';
  document.getElementById('editSave').onclick=()=>saveEdit(id);
  document.getElementById('editPrint').onclick=()=>saveEdit(id,true);
  const btnDel=document.getElementById('editDelete');
  if(btnDel) btnDel.onclick=()=>{ closeModal('editModal'); delTruck(id); };
  openModal('editModal');
}
function saveEdit(id,alsoPrint){
  const t=trucks.find(x=>x.id===id);if(!t)return;
  EDIT_FIELDS.forEach(f=>{const e=document.getElementById('e_'+f[0]);if(!e)return;
    t[f[0]]=f[2]==='number'?toNum(e.value):(f[2]==='select'?e.value:(e.value.trim?e.value.trim():e.value));});
  t.pesagemAntecipada=document.getElementById('e_pesagemAntecipada').checked;
  if(t.placaVeiculo)t.placaVeiculo=t.placaVeiculo.toUpperCase();
  learnCad(t);save();refreshAll();
  if(alsoPrint){const miss=validatePrint(t);if(miss.length){toast('Faltam dados p/ emitir: '+miss.join(', '),'err');return}renderPrint(t);doPrint();}
  closeModal('editModal');toast('Registro atualizado.');
}

/* =========================================================
   PLANILHA (Chegada) — edição inline
   ========================================================= */
function setFilter(el){document.querySelectorAll('#regChips .seg').forEach(p=>p.classList.remove('active'));el.classList.add('active');regFilter=el.dataset.flt;renderChegada()}
function edcell(id,field,type,val,hora){
  const blank=(val==null||val==='');
  const disp=blank?'—':(type==='number'?fmtKg(val):esc(val));
  return '<td class="ed r" data-id="'+id+'" data-field="'+field+'" data-type="'+type+'"><span class="edv'+(blank?' blank':'')+'">'+disp+'</span>'+(hora?'<span class="subhr">'+hora+'</span>':'')+'</td>';
}
function renderChegada(){
  const q=normStr(document.getElementById('regSearch').value);
  const dt=document.getElementById('regDate').value;
  const tb=document.querySelector('#regTable tbody');
  let list=trucks.slice().sort((a,b)=>{if(a.data!==b.data)return b.data.localeCompare(a.data);return (b.createdAt||0)-(a.createdAt||0)});
  list=list.filter(t=>{const s=getStatus(t);if(regFilter!=='todos'&&s!==regFilter)return false;if(dt&&t.data!==dt)return false;
    if(q){const blob=normStr([t.numeroChegada,t.motorista,t.placaVeiculo,t.produtor,t.cidade,t.gtlId,t.notaFiscal,t.variedade,t.codigoRoca,t.observacoes].join(' '));if(!blob.includes(q))return false}return true;});
  document.getElementById('regEmpty').hidden=list.length>0;document.getElementById('regTable').style.display=list.length?'':'none';
  tb.innerHTML=list.map(t=>{
    const s=getStatus(t),liq=pesoLiquido(t);
    let situ='—';
    if(s==='patio'){const rel=liberaEm(t);situ=rel?'<span class="cd" data-cd="'+rel.getTime()+'">'+countdown(rel.getTime()-Date.now())+'</span>':'—'}
    else if(s==='liberado')situ='<span style="color:var(--ok);font-weight:700">Pesar agora</span>';
    else if(s==='aguardando_moagem')situ='<button class="linkbtn" onclick="event.stopPropagation();iniciarMoagem(\''+t.id+'\')">Iniciar moagem</button>';
    else if(s==='em_moagem')situ='<span style="color:var(--mill);font-weight:700">Moendo</span>';
    else if(s==='moido')situ='<span class="muted">saiu '+(t.horaSaida||'')+'</span>';
    return '<tr data-id="'+t.id+'" oncontextmenu="showCtx(event,\''+t.id+'\')" onclick="selectRow(\''+t.id+'\')">'+
      '<td><div class="stcell"><span class="dot d-'+stKey(t,s)+'"></span>'+badge(s,t)+'</div></td>'+
      '<td><span class="rownum">'+esc(t.numeroChegada)+'</span></td>'+
      '<td class="tnum">'+fmtDateBR(t.data)+'</td>'+
      '<td class="strong">'+esc(t.motorista)+'</td>'+
      '<td>'+esc(t.placaVeiculo)+'</td>'+
      '<td>'+esc(t.produtor)+'</td>'+
      '<td class="tnum">'+esc(t.gtlId)+'</td>'+
      edcell(t.id,'notaFiscal','text',t.notaFiscal,null)+
      '<td class="tnum">'+(t.horaChegada||'—')+'</td>'+
      '<td class="r">'+fmtKg(t.pesoChegada)+'</td>'+
      edcell(t.id,'pesoBruto','number',t.pesoBruto,t.horaPesoBruto)+
      edcell(t.id,'pesoTara','number',t.pesoTara,t.horaSaida)+
      '<td class="r strong">'+(liq!=null?fmtKg(liq):'—')+'</td>'+
      '<td>'+situ+'</td>'+
      '<td><div class="rowacts">'+
        '<button class="iconbtn" title="Emitir GTL" onclick="event.stopPropagation();imprimirDados(\''+t.id+'\')">'+ic('printer')+'</button>'+
        '<button class="iconbtn" title="Editar" onclick="event.stopPropagation();openEdit(\''+t.id+'\')">'+ic('edit')+'</button>'+
        '<button class="iconbtn danger-btn" title="Excluir" onclick="event.stopPropagation();delTruck(\''+t.id+'\')">'+ic('trash')+'</button>'+
        '<button class="iconbtn" title="Mais" onclick="showCtxBtn(event,\''+t.id+'\')">'+ic('dots')+'</button>'+
      '</div></td></tr>';
  }).join('');
  const st={patio:0,liberado:0,aguardando_moagem:0,em_moagem:0,moido:0};trucks.forEach(t=>st[getStatus(t)]++);
  const liqTot=trucks.filter(t=>getStatus(t)==='moido').reduce((a,t)=>a+(pesoLiquido(t)||0),0);
  document.getElementById('regFoot').innerHTML='<span>Exibindo <b>'+list.length+'</b> de <b>'+trucks.length+' cargas</b></span>'+
    '<span>No pátio: <b style="color:var(--warn)">'+(st.patio+st.liberado)+'</b></span>'+
    '<span>Aguardando moagem: <b style="color:var(--info)">'+st.aguardando_moagem+'</b></span>'+
    '<span>Em moagem: <b style="color:var(--mill)">'+st.em_moagem+'</b></span>'+
    '<span>Moídos: <b style="color:var(--ok)">'+st.moido+'</b></span>'+
    '<span style="margin-left:auto">Total Líquido: <b style="color:var(--brand);font-size:14px">'+fmtKg(liqTot)+'</b></span>';
  updateNavCounts();
}
function selectRow(id){document.querySelectorAll('#regTable tr').forEach(r=>r.classList.toggle('sel',r.dataset.id===id))}
function updateNavCounts(){let p=0,m=0;trucks.forEach(t=>{const s=getStatus(t);if(s==='patio'||s==='liberado')p++;if(s==='em_moagem')m++});
  document.getElementById('navPatio').textContent=p;
  document.getElementById('navMoagem').textContent=m;
  const navT=document.getElementById('navTodos');
  if(navT) navT.textContent=trucks.length;
}

/* =========================================================
   TODOS OS CAMINHÕES — Busca Geral & Histórico
   ========================================================= */
let todosFilter = 'todos';
function setTodosFilter(el){
  document.querySelectorAll('#todosChips .seg').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  todosFilter = el.dataset.flt;
  renderTodos();
}

function fmtWeightSearch(val){
  if(val == null || val === '') return '';
  const num = parseFloat(val);
  if(isNaN(num)) return '';
  return `${num} ${num}kg ${num} kg ${num.toLocaleString('pt-BR')} ${num.toLocaleString('pt-BR')}kg ${num.toLocaleString('pt-BR')} kg`;
}

function renderTodos(){
  const q = normStr(document.getElementById('todosSearch') ? document.getElementById('todosSearch').value : '');
  const tb = document.querySelector('#todosTable tbody');
  if(!tb) return;
  
  let list = trucks.slice().sort((a,b)=>{
    if(a.data !== b.data) return b.data.localeCompare(a.data);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  
  list = list.filter(t => {
    const s = getStatus(t);
    if(todosFilter !== 'todos' && s !== todosFilter) return false;
    
    if(q){
      const liq = pesoLiquido(t);
      const dif = difKg(t);
      const wStr = [
        fmtWeightSearch(t.pesoChegada),
        fmtWeightSearch(t.pesoBruto),
        fmtWeightSearch(t.pesoTara),
        fmtWeightSearch(liq),
        fmtWeightSearch(t.pesoNF),
        fmtWeightSearch(dif)
      ].join(' ');
      
      const stLabel = STATUS_LABEL[s] || '';
      
      const blob = normStr([
        t.codigo || '',
        t.numeroChegada,
        t.motorista,
        t.placaVeiculo,
        t.produtor,
        t.cidade,
        t.gtlId,
        t.numeroGuia,
        t.notaFiscal,
        t.variedade,
        t.codigoRoca,
        t.observacoes,
        t.tipoCaminhao,
        stLabel,
        wStr
      ].join(' '));
      
      if(!blob.includes(q)) return false;
    }
    return true;
  });

  const emptyEl = document.getElementById('todosEmpty');
  const tableEl = document.getElementById('todosTable');
  if(emptyEl) emptyEl.hidden = list.length > 0;
  if(tableEl) tableEl.style.display = list.length ? '' : 'none';

  tb.innerHTML = list.map(t => {
    const s = getStatus(t), liq = pesoLiquido(t);
    return '<tr data-id="'+t.id+'" oncontextmenu="showCtx(event,\''+t.id+'\')">'+
      '<td><div class="stcell"><span class="dot d-'+stKey(t,s)+'"></span>'+badge(s,t)+'</div></td>'+
      '<td><span class="truck-code-badge">'+esc(t.codigo || '—')+'</span></td>'+
      '<td class="tnum">'+fmtDateBR(t.data)+'</td>'+
      '<td><span class="rownum">'+esc(t.numeroChegada)+'</span></td>'+
      '<td class="strong">'+esc(t.motorista)+'</td>'+
      '<td><span class="plate">'+esc(t.placaVeiculo)+'</span></td>'+
      '<td>'+esc(t.produtor)+'</td>'+
      '<td class="tnum">'+esc(t.notaFiscal || '—')+'</td>'+
      '<td class="tnum">'+(t.horaChegada || '—')+'</td>'+
      '<td class="r">'+fmtKg(t.pesoChegada)+'</td>'+
      '<td class="r">'+fmtKg(t.pesoBruto)+'</td>'+
      '<td class="r">'+fmtKg(t.pesoTara)+'</td>'+
      '<td class="r strong">'+(liq != null ? fmtKg(liq) : '—')+'</td>'+
      '<td><div class="rowacts">'+
        '<button class="iconbtn" title="Emitir GTL + Capa" onclick="event.stopPropagation();imprimirDados(\''+t.id+'\')">'+ic('printer')+'</button>'+
        '<button class="iconbtn" title="Editar" onclick="event.stopPropagation();openEdit(\''+t.id+'\')">'+ic('edit')+'</button>'+
        '<button class="iconbtn danger-btn" title="Excluir" onclick="event.stopPropagation();delTruck(\''+t.id+'\')">'+ic('trash')+'</button>'+
      '</div></td></tr>';
  }).join('');

  const countBadge = document.getElementById('todosCountBadge');
  if(countBadge) countBadge.textContent = list.length + (list.length === 1 ? ' carga' : ' cargas');

  const foot = document.getElementById('todosFoot');
  if(foot){
    const liqTot = list.reduce((a,t) => a + (pesoLiquido(t) || 0), 0);
    foot.innerHTML = '<span>Exibindo <b>'+list.length+'</b> de <b>'+trucks.length+' cargas registradas</b></span>'+
      '<span style="margin-left:auto">Total Líquido Selecionado: <b style="color:var(--brand);font-size:14px">'+fmtKg(liqTot)+'</b></span>';
  }
}
/* edição inline */
function beginEdit(td){
  if(td.querySelector('input'))return;
  const id=td.dataset.id,field=td.dataset.field,type=td.dataset.type,t=trucks.find(x=>x.id===id);if(!t)return;
  const cur=t[field]==null?'':t[field];
  td.innerHTML='<input type="'+(type==='number'?'number':'text')+'" value="'+esc(cur)+'">';
  const inp=td.querySelector('input');inp.focus();inp.select();
  let done=false;
  const commit=()=>{if(done)return;done=true;commitCell(id,field,type,inp.value)};
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit()}else if(e.key==='Escape'){done=true;renderChegada()}});
  inp.addEventListener('blur',commit);
}
function commitCell(id,field,type,raw){
  const t=trucks.find(x=>x.id===id);if(!t){renderChegada();return}
  const val=type==='number'?toNum(raw):raw.trim();
  if(field==='pesoBruto'){
    t.pesoBruto=val;
    if(val!=null){if(!t.horaPesoBruto)t.horaPesoBruto=nowHM();const rel=liberaEm(t);if(rel&&Date.now()<rel.getTime()){t.pesagemAntecipada=true;toast('Pesado antes de 12h — marcado como antecipado. Edite p/ justificar.','warn')}}
    else{t.horaPesoBruto='';t.pesagemAntecipada=false}
  }else if(field==='pesoTara'){
    if(val!=null&&t.pesoBruto==null){toast('Registre o Peso Bruto (2ª pesagem) antes da tara.','err');renderChegada();return}
    t.pesoTara=val;if(val!=null){if(!t.horaSaida)t.horaSaida=nowHM();t.moagemManual=null;if(t.pesoNF==null)t.pesoNF=pesoLiquido(t)}else t.horaSaida='';
  }else t[field]=val;
  save();refreshAll();
}
function iniciarMoagem(id){const t=trucks.find(x=>x.id===id);if(!t)return;if(t.pesoBruto==null){toast('Registre a 2ª pesagem antes de iniciar a moagem.','warn');return}t.moagemManual='em_moagem';save();refreshAll();toast('Moagem iniciada.')}
function voltarMoagem(id){const t=trucks.find(x=>x.id===id);if(!t)return;t.moagemManual=null;save();refreshAll();toast('Status revertido para aguardando moagem.')}
function focusEdit(id,field){goView('chegada');setTimeout(()=>{const td=document.querySelector('#regTable td.ed[data-id="'+id+'"][data-field="'+field+'"]');if(td){td.scrollIntoView({block:'center'});beginEdit(td)}},60)}

/* ---------------- Context menu ---------------- */
function ctxItems(id){
  const t=trucks.find(x=>x.id===id),s=getStatus(t);let it=[['printer','Emitir GTL + Capa','imprimirDados(\''+id+'\')']];
  if(s==='patio'||s==='liberado')it.push(['scale','Registrar 2ª pesagem','focusEdit(\''+id+'\',\'pesoBruto\')']);
  if(s==='aguardando_moagem'){it.push(['play','Iniciar moagem','iniciarMoagem(\''+id+'\')']);it.push(['flag','Registrar saída (tara)','focusEdit(\''+id+'\',\'pesoTara\')']);}
  if(s==='em_moagem'){it.push(['undo','Voltar p/ aguardando','voltarMoagem(\''+id+'\')']);it.push(['flag','Registrar saída (tara)','focusEdit(\''+id+'\',\'pesoTara\')']);}
  it.push(['SEP']);it.push(['edit','Editar registro','openEdit(\''+id+'\')']);it.push(['eye','Pré-visualizar','preview(\''+id+'\')']);
  it.push(['SEP']);it.push(['trash','Excluir|danger','delTruck(\''+id+'\')']);return it;
}
function buildCtx(id){document.getElementById('ctxmenu').innerHTML=ctxItems(id).map(x=>{
  if(x[0]==='SEP')return '<div class="sep"></div>';const danger=x[1].includes('|danger');
  return '<button class="'+(danger?'danger':'')+'" onclick="closeCtx();'+x[2]+'">'+ic(x[0])+x[1].replace('|danger','')+'</button>';
}).join('')}
function showCtx(e,id){e.preventDefault();ctxTargetId=id;selectRow(id);buildCtx(id);posCtx(e.clientX,e.clientY)}
function showCtxBtn(e,id){e.stopPropagation();ctxTargetId=id;selectRow(id);buildCtx(id);const r=e.currentTarget.getBoundingClientRect();posCtx(r.right-216,r.bottom+4)}
function posCtx(x,y){const m=document.getElementById('ctxmenu');m.classList.add('open');const w=m.offsetWidth,h=m.offsetHeight;m.style.left=Math.max(8,Math.min(x,innerWidth-w-8))+'px';m.style.top=Math.max(8,Math.min(y,innerHeight-h-8))+'px'}
function closeCtx(){document.getElementById('ctxmenu').classList.remove('open')}
document.addEventListener('click',e=>{if(!e.target.closest('.ctxmenu'))closeCtx()});
document.addEventListener('scroll',closeCtx,true);
function delTruck(id){
  const t=trucks.find(x=>x.id===id);
  if(!t)return;
  if(!confirm('Excluir o registro de '+t.motorista+' (Nº '+t.numeroChegada+')?'))return;
  animDeleteTruck(id,()=>{
    trucks=trucks.filter(x=>x.id!==id);
    save();
    refreshAll();
    toast('Registro excluído.','warn');
  });
}

/* ---------------- PÁTIO ---------------- */
function byLibera(a,b){const ra=liberaEm(a),rb=liberaEm(b);return (ra?ra.getTime():0)-(rb?rb.getTime():0)}
function kpi(icn,cls,k,v,s){return '<div class="kpi"><div class="ic '+cls+'">'+ic(icn,18)+'</div><div class="k">'+k+'</div><div class="v tnum">'+v+'</div><div class="s">'+(s||'&nbsp;')+'</div></div>'}
function renderPatio(){
  const patio=trucks.filter(t=>getStatus(t)!=='moido');
  const liberados=patio.filter(t=>getStatus(t)==='liberado').sort(byLibera);
  const aguard=patio.filter(t=>getStatus(t)==='patio').sort(byLibera);
  const aguardMoagem=patio.filter(t=>getStatus(t)==='aguardando_moagem');
  const emMoagem=patio.filter(t=>getStatus(t)==='em_moagem');
  const antec=trucks.filter(t=>t.pesagemAntecipada&&getStatus(t)!=='moido');

  document.getElementById('patioKpis').innerHTML=
    kpi('scale','i-brand','No pátio (total)',patio.length,'não moídos')+
    kpi('scale','i-ok','Liberados p/ 2ª',liberados.length,'pesar agora')+
    kpi('scale','i-warn','Aguardando 12h',aguard.length,'em contagem')+
    kpi('play','i-info','Aguard. / Em Moagem',(aguardMoagem.length+emMoagem.length),'descarregando')+
    kpi('flag','i-mill','Pesagem antecipada',antec.length,'');

  let html=
    patioSection('Liberados para 2ª pesagem (Pesar agora)','var(--ok)',liberados)+
    patioSection('Aguardando liberação 12h (Em contagem)','var(--warn)',aguard)+
    patioSection('2ª Pesagem concluída — Aguardando moagem','var(--info)',aguardMoagem)+
    patioSection('Em moagem / Descarregando','var(--mill)',emMoagem);

  document.getElementById('patioSections').innerHTML=html||'<div class="panel"><div class="empty">'+ic('scale',30)+'<p>Nenhum caminhão no pátio no momento.</p></div></div>';
}
function patioSection(title,color,list){
  if(!list.length)return '';
  return '<div class="patio-section"><div class="st"><span class="sq" style="background:'+color+'"></span>'+title+'<span class="n">'+list.length+'</span></div><div class="patio-grid">'+list.map(patioCard).join('')+'</div></div>';
}
function forcarPesagem(id){
  const t=trucks.find(x=>x.id===id);
  if(!t)return;
  t.forcarLiberacao=true;
  t.pesagemAntecipada=true;
  save();
  refreshAll();
  toast('2ª pesagem liberada antecipadamente (Nº '+t.numeroChegada+').','warn');
}
function togglePatioCard(cardEl, evt){
  if(evt && evt.target && evt.target.closest('.tcard-details, button, input, select, textarea, a')) return;
  if(cardEl){
    cardEl.classList.toggle('expanded');
  }
}
function patioCard(t){
  const s=getStatus(t), rel=liberaEm(t);
  const chegadaDate=combine(t.data, t.horaChegada);
  const elapsedMs=chegadaDate ? Math.max(0, Date.now() - chegadaDate.getTime()) : 0;
  const totalMs=12*60*60*1000;
  let pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  
  if (s === 'liberado' || s === 'aguardando_moagem' || s === 'em_moagem') pct = 100;
  
  const remainingMs = rel ? Math.max(0, rel.getTime() - Date.now()) : 0;
  const elapsedH = (elapsedMs / (1000 * 60 * 60)).toFixed(1);
  
  let cd = countdown(remainingMs);
  if (s === 'liberado') cd = t.forcarLiberacao ? 'LIBERADO (FORÇADO)' : 'LIBERADO (100%)';
  else if (s === 'aguardando_moagem') cd = '2ª PESAGEM CONCLUÍDA';
  else if (s === 'em_moagem') cd = 'EM MOAGEM / DESCARREGANDO';

  let statusBadge = '<span class="badge b-patio">Aguardando 12h</span>';
  if (s === 'liberado') {
    statusBadge = t.forcarLiberacao 
      ? '<span class="badge b-antecipado">Liberação Forçada</span>' 
      : '<span class="badge b-liberado">Liberado p/ 2ª Pesagem</span>';
  } else if (s === 'aguardando_moagem') {
    statusBadge = '<span class="badge b-info">Aguardando Moagem</span>';
  } else if (s === 'em_moagem') {
    statusBadge = '<span class="badge b-mill">Em Moagem</span>';
  }

  let actionControls = '';
  if (s === 'liberado') {
    actionControls = '<div class="inrow2 inline-weight">'+
      '<input type="number" placeholder="Peso bruto (kg)" id="pb_'+t.id+'" class="inp-weight" onclick="event.stopPropagation()">'+
      '<button class="btn primary sm" onclick="event.stopPropagation(); regBrutoInline(\''+t.id+'\')">Registrar 2ª Pesagem</button>'+
    '</div>';
  } else if (s === 'patio') {
    actionControls = '<button class="btn primary sm btn-force" title="Liberar a 2ª pesagem imediatamente" onclick="event.stopPropagation(); forcarPesagem(\''+t.id+'\')">⚡ Forçar 2ª Pesagem Agora</button>';
  } else if (s === 'aguardando_moagem') {
    actionControls = '<button class="btn primary sm" onclick="event.stopPropagation(); iniciarMoagem(\''+t.id+'\')">▶ Iniciar Moagem</button>';
  } else if (s === 'em_moagem') {
    actionControls = '<button class="btn subtle sm" onclick="event.stopPropagation(); voltarMoagem(\''+t.id+'\')">⟲ Voltar Status</button>';
  }

  return '<div class="tcard card-3d s-'+stKey(t,s)+'" id="card_patio_'+t.id+'" onclick="togglePatioCard(this, event)" oncontextmenu="showCtx(event,\''+t.id+'\')">'+
    /* HEADER E RESUMO DO CARD 3D */
    '<div class="tcard-main">'+
      '<div class="top">'+
        '<div style="min-width:0; flex:1">'+
          '<div class="st-row">'+statusBadge+' <span class="sub-gtl">GTL: <b>'+(esc(t.gtlId)||esc(t.numeroGuia)||'—')+'</b></span></div>'+
          '<div class="nm">'+esc(t.motorista)+'</div>'+
          '<div class="pr">'+esc(t.produtor)+' '+(t.codigoRoca?'<span class="rc-code">('+esc(t.codigoRoca)+')</span>':'')+'</div>'+
        '</div>'+
        '<div class="num-box3d" title="Número da Chegada"><span class="num-lbl">CHEGADA</span><span class="num-val">#'+esc(t.numeroChegada)+'</span></div>'+
      '</div>'+
      
      /* CHIPS DE DADOS RÁPIDOS */
      '<div class="meta-chips">'+
        '<span class="mchip"><b>Código:</b> <span class="truck-code-badge" style="font-size:10.5px; padding:1.5px 6px;">'+esc(t.codigo||'—')+'</span></span>'+
        '<span class="mchip"><b>Placa:</b> '+esc(t.placaVeiculo)+'</span>'+
        '<span class="mchip"><b>Chegada:</b> '+(t.horaChegada||'—')+'</span>'+
        '<span class="mchip"><b>1ª Pesagem:</b> '+fmtKg(t.pesoChegada)+'</span>'+
        (t.pesoBruto != null ? '<span class="mchip"><b>P. Bruto:</b> '+fmtKg(t.pesoBruto)+'</span>' : '')+
        '<span class="mchip"><b>NF:</b> '+(esc(t.notaFiscal)||'—')+'</span>'+
      '</div>'+
      
      /* BARRA DE PROGRESSO VISUAL 12H */
      '<div class="pbar-container">'+
        '<div class="pbar-labels">'+
          '<span class="lbl-left">'+(s !== 'patio' ? '<b>Status:</b> Concluído/Liberado' : '<b>Decorridos:</b> '+elapsedH+'h / 12h ('+Math.round(pct)+'%)')+'</span>'+
          '<span class="lbl-right '+(s !== 'patio' ? 'ok' : 'warn')+'" data-cd="'+(rel?rel.getTime():0)+'">'+cd+'</span>'+
        '</div>'+
        '<div class="pbar-track"><div class="pbar-fill '+(s !== 'patio' ? 'p-ok' : 'p-warn')+'" style="transform:scaleX('+(pct/100)+')"></div></div>'+
      '</div>'+
      
      '<div class="expand-hint"><span>'+ic('chevron', 14)+' Clique para expandir detalhes e ações</span></div>'+
    '</div>'+
    
    /* GAVETA DE DETALHES COMPLETA (EXPANSÍVEL) */
    '<div class="tcard-details" onclick="event.stopPropagation()">'+
      '<div class="details-inner">'+
        '<div class="dgrid">'+
          '<div class="di"><span>Motorista</span><b>'+esc(t.motorista)+'</b></div>'+
          '<div class="di"><span>Placa do Veículo</span><b>'+esc(t.placaVeiculo)+'</b></div>'+
          '<div class="di"><span>Produtor / Roça</span><b>'+esc(t.produtor)+'</b></div>'+
          '<div class="di"><span>Código da Roça</span><b>'+(esc(t.codigoRoca)||'—')+'</b></div>'+
          '<div class="di"><span>Cidade</span><b>'+(esc(t.cidade)||'—')+'</b></div>'+
          '<div class="di"><span>Variedade Tomate</span><b>'+(esc(t.variedade)||'—')+'</b></div>'+
          '<div class="di"><span>GTL / Guia</span><b>'+(esc(t.gtlId)||esc(t.numeroGuia)||'—')+'</b></div>'+
          '<div class="di"><span>Nota Fiscal</span><b>'+(esc(t.notaFiscal)||'—')+'</b></div>'+
          '<div class="di"><span>Peso NF</span><b>'+(t.pesoNF?fmtKg(t.pesoNF):'—')+'</b></div>'+
          '<div class="di"><span>Peso Bruto</span><b>'+(t.pesoBruto?fmtKg(t.pesoBruto):'—')+'</b></div>'+
          '<div class="di"><span>Tipo Caminhão</span><b>'+(esc(t.tipoCaminhao)||'—')+'</b></div>'+
          '<div class="di"><span>Embalagem / Colheita</span><b>'+(esc(t.tipoEmbalagem)||'Granel')+' / '+(esc(t.tipoColheita)||'Mecânica')+'</b></div>'+
          '<div class="di"><span>Portaria (Resp.)</span><b>'+(esc(t.responsavel)||'—')+'</b></div>'+
          '<div class="di c3"><span>Observações</span><b>'+esc(t.observacoes||'Nenhuma observação registrada.')+'</b></div>'+
        '</div>'+
        
        /* BARRA DE AÇÕES DA GAVETA */
        '<div class="patio-actions-bar">'+
          actionControls+
          '<div class="spacer"></div>'+
          '<button class="btn subtle sm" title="Editar Registro Completo" onclick="event.stopPropagation(); openEdit(\''+t.id+'\')">'+ic('edit', 14)+' Editar</button>'+
          '<button class="btn subtle sm" title="Emitir GTL / Capa" onclick="event.stopPropagation(); imprimirDados(\''+t.id+'\')">'+ic('printer', 14)+' GTL</button>'+
          '<button class="btn danger sm" title="Excluir Registro" onclick="event.stopPropagation(); delTruck(\''+t.id+'\')">'+ic('trash', 14)+' Excluir</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';
}
function regBrutoInline(id){const inp=document.getElementById('pb_'+id);const v=toNum(inp?inp.value:null);if(v==null){toast('Informe o peso bruto.','err');if(inp)inp.focus();return}commitCell(id,'pesoBruto','number',inp.value);toast('2ª pesagem registrada.')}

/* ---------------- MOAGEM ---------------- */
function renderMoagem(){
  const cols=[['patio','Pátio / Aguard. 2ª',t=>{const s=getStatus(t);return s==='patio'||s==='liberado'}],
    ['aguardando_moagem','Aguardando Moagem',t=>getStatus(t)==='aguardando_moagem'],
    ['em_moagem','Em Moagem',t=>getStatus(t)==='em_moagem'],
    ['moido','Moído (hoje)',t=>getStatus(t)==='moido'&&t.data===todayISO()]];
  document.getElementById('kanban').innerHTML=cols.map(c=>{const items=trucks.filter(c[2]).sort((a,b)=>(a.horaChegada||'').localeCompare(b.horaChegada||''));
    return '<div class="kcol"><h4>'+c[1]+'<span class="n">'+items.length+'</span></h4>'+(items.map(kcard).join('')||'<div class="kempty">vazio</div>')+'</div>';}).join('');
}
function kcard(t){const s=getStatus(t);let f='';
  if(s==='patio'||s==='liberado'){const rel=liberaEm(t);f=rel?'<div class="kf"><span class="cd" data-cd="'+rel.getTime()+'">'+countdown(rel.getTime()-Date.now())+'</span></div>':''}
  else if(s==='aguardando_moagem')f='<div class="kf">Bruto: '+fmtKg(t.pesoBruto)+'</div>';
  else if(s==='em_moagem')f='<div class="kf" style="color:var(--mill)">processando</div>';
  else if(s==='moido')f='<div class="kf" style="color:var(--ok)">líq: '+fmtKg(pesoLiquido(t))+'</div>';
  return '<div class="kcard k-'+stKey(t,s)+'" oncontextmenu="showCtx(event,\''+t.id+'\')" onclick="showCtxBtn(event,\''+t.id+'\')">'+
    '<div class="kt">#'+esc(t.numeroChegada)+' · '+esc(t.motorista)+'</div><div class="km">'+esc(t.produtor)+' • '+esc(t.placaVeiculo)+'</div>'+f+'</div>';
}

/* ---------------- PAINEL ---------------- */
function getOperationalDate(dateISO, timeHM) {
  if (!dateISO) return todayISO();
  if (!timeHM) return dateISO;
  const d = combine(dateISO, timeHM);
  if (!d) return dateISO;
  const m = minutesOfDay(d);
  if (m < 360) {
    const prev = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    return prev.getFullYear() + '-' + pad(prev.getMonth() + 1) + '-' + pad(prev.getDate());
  }
  return dateISO;
}

function statsFor(targetDate) {
  const selDate = targetDate || todayISO();
  
  const dayTrucks = trucks.filter(t => t.data === selDate);
  const bs = { patio: 0, liberado: 0, aguardando_moagem: 0, em_moagem: 0, moido: 0 };
  trucks.forEach(t => bs[getStatus(t)]++);

  const moidos = trucks.filter(t => {
    if (getStatus(t) !== 'moido') return false;
    const opDate = getOperationalDate(t.data, t.horaSaida);
    return opDate === selDate;
  });

  const tnCount = { 1: 0, 2: 0, 3: 0 };
  const tnKg = { 1: 0, 2: 0, 3: 0 };

  moidos.forEach(t => {
    const d = combine(t.data, t.horaSaida);
    if (d) {
      const shift = turnoAtribuicao(d);
      tnCount[shift]++;
      tnKg[shift] += (pesoLiquido(t) || 0);
    }
  });

  return { targetDate: selDate, dayTrucks, bs, moidos, tnCount, tnKg };
}

function setPainelToday() {
  const dashDate = document.getElementById('dashDate');
  if (dashDate) dashDate.value = todayISO();
  renderPainel();
}

function renderPainel() {
  const dashDateEl = document.getElementById('dashDate');
  let targetDate = dashDateEl ? dashDateEl.value : '';
  if (!targetDate) {
    targetDate = todayISO();
    if (dashDateEl) dashDateEl.value = targetDate;
  }

  const st = statsFor(targetDate);
  const now = new Date();
  const tnow = turnoAtual(now);
  const currentOpDate = getOperationalDate(todayISO(), nowHM());

  const shiftBadge = document.getElementById('dashShiftBadge');
  if (shiftBadge) {
    shiftBadge.textContent = `Turno Atual: ${tnow}º Turno (${TURNO_RANGE[tnow]})`;
  }

  const totMoidoKg = Object.values(st.tnKg).reduce((a, b) => a + b, 0);

  document.getElementById('dashKpis').innerHTML =
    kpi('scale', 'i-brand', 'Cargas (' + fmtDateBR(targetDate) + ')', st.dayTrucks.length, '') +
    kpi('scale', 'i-warn', 'No Pátio (Total)', st.bs.patio + st.bs.liberado, st.bs.liberado + ' liberados') +
    kpi('scale', 'i-ok', 'Liberados 2ª', st.bs.liberado, 'aguardando pesagem') +
    kpi('scale', 'i-info', 'Aguard. Moagem', st.bs.aguardando_moagem, '') +
    kpi('play', 'i-mill', 'Em Moagem', st.bs.em_moagem, 'processando') +
    kpi('flag', 'i-gray', 'Moídos (' + fmtDateBR(targetDate) + ')', st.moidos.length, fmtKg(totMoidoKg));

  document.getElementById('turnosRow').innerHTML = [1, 2, 3].map(n => {
    const isCurrent = (n === tnow && targetDate === currentOpDate);
    const count = st.tnCount[n];
    const kg = st.tnKg[n];
    const ton = (kg / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

    return '<div class="tcol ' + (isCurrent ? 'on' : '') + '">' +
      (isCurrent ? '<div class="now">TURNO ATUAL</div>' : '') +
      '<div class="h"><span class="nm">' + n + 'º Turno</span><span class="rg">' + TURNO_RANGE[n] + '</span></div>' +
      '<div class="big tnum">' + count + ' <span class="tsub">' + (count === 1 ? 'carga' : 'cargas') + '</span></div>' +
      '<div class="weight-box">' +
        '<div><span class="w-lbl">Total Moído:</span></div>' +
        '<div><span class="w-val">' + fmtKg(kg) + '</span> <span class="w-ton">(' + ton + ' t)</span></div>' +
      '</div>' +
      '<div class="sub">Processados no ' + n + 'º turno em ' + fmtDateBR(targetDate) + '</div>' +
      '</div>';
  }).join('');

  const waiting = trucks.filter(t => {
    const s = getStatus(t);
    return s === 'patio' || s === 'liberado';
  }).sort(byLibera);

  document.querySelector('#dashWaitTable tbody').innerHTML = waiting.length ? waiting.map(t => {
    const rel = liberaEm(t), s = getStatus(t);
    return '<tr oncontextmenu="showCtx(event,\'' + t.id + '\')"><td><span class="rownum">' + esc(t.numeroChegada) + '</span></td><td class="strong">' + esc(t.motorista) + '</td><td>' + esc(t.produtor) + '</td><td class="tnum">' + (t.horaChegada || '—') + '</td><td class="r">' + fmtKg(t.pesoChegada) + '</td>' +
      '<td>' + (rel ? '<span class="cd" data-cd="' + rel.getTime() + '">' + countdown(rel.getTime() - Date.now()) + '</span>' : '—') + '</td><td>' + badge(s, t) + '</td></tr>';
  }).join('') : '<tr><td colspan="7" class="empty" style="padding:28px">Nenhum caminhão aguardando 2ª pesagem.</td></tr>';
}

/* ---------------- RELATÓRIOS ---------------- */
function renderRelatorios(){
  const from=document.getElementById('repFrom').value,to=document.getElementById('repTo').value;
  let list=trucks.slice();if(from)list=list.filter(t=>t.data>=from);if(to)list=list.filter(t=>t.data<=to);
  const moidos=list.filter(t=>getStatus(t)==='moido'),tot=moidos.reduce((a,t)=>a+(pesoLiquido(t)||0),0);
  document.getElementById('repKpis').innerHTML=
    kpi('scale','i-brand','Cargas no período',list.length,'')+
    kpi('flag','i-gray','Moídos',moidos.length,'')+
    kpi('scale','i-ok','Peso líquido total',(tot/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' t',tot.toLocaleString('pt-BR')+' kg')+
    kpi('scale','i-info','Média líq/carga',moidos.length?Math.round(tot/moidos.length).toLocaleString('pt-BR')+' kg':'—','');
  const byP={},byPP={};list.forEach(t=>byP[t.produtor]=(byP[t.produtor]||0)+1);moidos.forEach(t=>byPP[t.produtor]=(byPP[t.produtor]||0)+(pesoLiquido(t)||0));
  document.getElementById('repProdutores').innerHTML=barChart(byP,v=>v);
  document.getElementById('repPeso').innerHTML=barChart(byPP,v=>v.toLocaleString('pt-BR')+' kg');
  const tn={1:0,2:0,3:0};moidos.forEach(t=>{const d=combine(t.data,t.horaSaida);if(d)tn[turnoAtribuicao(d)]++});
  document.getElementById('repTurnos').innerHTML=barChart({'1º Turno (06:00–14:15)':tn[1],'2º Turno (14:16–22:20)':tn[2],'3º Turno (22:21–05:59)':tn[3]},v=>v+' cargas');
  const byD={};list.forEach(t=>byD[fmtDateBR(t.data)]=(byD[fmtDateBR(t.data)]||0)+1);document.getElementById('repDias').innerHTML=barChart(byD,v=>v);
}
function barChart(obj,fmt){const e=Object.entries(obj).filter(([k])=>k&&k!=='undefined').sort((a,b)=>b[1]-a[1]).slice(0,12);
  if(!e.length)return '<div class="empty" style="padding:24px">Sem dados no período.</div>';const max=Math.max(...e.map(x=>x[1]))||1;
  return e.map(([k,v])=>'<div class="barrow"><div class="lb" title="'+esc(k)+'">'+esc(k)+'</div><div class="track"><div class="fill" style="width:'+Math.max(5,v/max*100)+'%">'+fmt(v)+'</div></div></div>').join('')}

/* ---------------- CADASTROS ---------------- */
document.querySelectorAll('#cadTabs .seg').forEach(b=>b.onclick=()=>{document.querySelectorAll('#cadTabs .seg').forEach(x=>x.classList.remove('active'));b.classList.add('active');cadTab=b.dataset.cad;editingCadIndex=null;renderCadastros()});
function renderCadastros(){
  const cfg={
    produtores:{title:'Produtor / Roça',f:[['nome','Nome da Roça'],['codigo','Código'],['cidade','Cidade'],['variedade','Variedade padrão'],['tipoColheita','Tipo de Colheita']]},
    motoristas:{title:'Motorista',f:[['nome','Nome'],['placa','Placa habitual'],['tipoCaminhao','Tipo de Caminhão']]},
    placas:{title:'Placa',f:[['placa','Placa'],['motorista','Motorista']]},
    variedades:{title:'Variedade',f:[['nome','Variedade']]}
  }[cadTab];
  
  document.getElementById('cadFormPanel').innerHTML='<div style="font-weight:800;font-size:15px;margin-bottom:12px">Novo '+cfg.title+'</div>'+
    '<div class="cadform" style="grid-template-columns:repeat('+(cfg.f.length+1)+',1fr)">'+
    cfg.f.map(x=>{
      if(x[0]==='tipoCaminhao') {
        return '<div class="fg"><label>'+x[1]+'</label><select id="cad_tipoCaminhao"><option value="">Selecione…</option><option>Truck</option><option>Bitruck</option><option>Carreta</option><option>Bitrem</option></select></div>';
      }
      if(x[0]==='tipoColheita') {
        return '<div class="fg"><label>'+x[1]+'</label><select id="cad_tipoColheita"><option>Manual</option><option>Mecânica</option></select></div>';
      }
      return '<div class="fg"><label>'+x[1]+'</label><input id="cad_'+x[0]+'"></div>';
    }).join('')+
    '<div class="fg"><label>&nbsp;</label><button class="btn primary" onclick="addCad()">Adicionar</button></div></div>';
    
  const rows=cad[cadTab];
  document.getElementById('cadListWrap').innerHTML='<table class="cadtable"><thead><tr>'+
    cfg.f.map(x=>'<th>'+x[1]+'</th>').join('')+'<th style="width:140px;text-align:right">Ações</th></tr></thead><tbody>'+
    (rows.length?rows.map((r,i)=>{
      if(editingCadIndex===i){
        return '<tr class="sel">'+cfg.f.map(x=>{
          if(x[0]==='tipoCaminhao'){
            return '<td><select id="edit_cad_tipoCaminhao" class="inp" style="width:100%"><option value="">Selecione…</option><option'+(r.tipoCaminhao==='Truck'?' selected':'')+'>Truck</option><option'+(r.tipoCaminhao==='Bitruck'?' selected':'')+'>Bitruck</option><option'+(r.tipoCaminhao==='Carreta'?' selected':'')+'>Carreta</option><option'+(r.tipoCaminhao==='Bitrem'?' selected':'')+'>Bitrem</option></select></td>';
          }
          if(x[0]==='tipoColheita'){
            return '<td><select id="edit_cad_tipoColheita" class="inp" style="width:100%"><option'+(r.tipoColheita==='Manual'?' selected':'')+'>Manual</option><option'+(r.tipoColheita==='Mecânica'?' selected':'')+'>Mecânica</option></select></td>';
          }
          return '<td><input id="edit_cad_'+x[0]+'" class="inp" value="'+esc(r[x[0]]||'')+'" style="width:100%"></td>';
        }).join('')+
        '<td style="text-align:right;white-space:nowrap">'+
          '<button class="btn primary sm" onclick="saveCadEdit('+i+')">Salvar</button> '+
          '<button class="btn subtle sm" onclick="cancelCadEdit()">Cancelar</button>'+
        '</td></tr>';
      }
      return '<tr>'+cfg.f.map(x=>'<td>'+esc(r[x[0]]||'')+'</td>').join('')+
        '<td style="text-align:right;white-space:nowrap">'+
          '<button class="btn subtle sm" onclick="editCad('+i+')">Editar</button> '+
          '<button class="btn danger sm" onclick="delCad('+i+')">Excluir</button>'+
        '</td></tr>';
    }).join(''):'<tr><td colspan="'+(cfg.f.length+1)+'" class="empty" style="padding:26px">Nenhum cadastro. Também são aprendidos ao registrar caminhões.</td></tr>')+'</tbody></table>';
}
function addCad(){
  const keys={produtores:['nome','codigo','cidade','variedade','tipoColheita'],motoristas:['nome','placa','tipoCaminhao'],placas:['placa','motorista'],variedades:['nome']}[cadTab];
  const obj={};keys.forEach(k=>obj[k]=(document.getElementById('cad_'+k).value||'').trim());
  if(!obj[keys[0]]){toast('Preencha ao menos: '+keys[0],'err');return}
  if(obj.placa)obj.placa=obj.placa.toUpperCase();
  cad[cadTab].push(obj);saveCad();renderCadastros();toast('Cadastro adicionado com sucesso.')
}
function editCad(i){editingCadIndex=i;renderCadastros()}
function cancelCadEdit(){editingCadIndex=null;renderCadastros()}
function saveCadEdit(i){
  const keys={produtores:['nome','codigo','cidade','variedade','tipoColheita'],motoristas:['nome','placa','tipoCaminhao'],placas:['placa','motorista'],variedades:['nome']}[cadTab];
  const obj=cad[cadTab][i];if(!obj)return;
  keys.forEach(k=>{const el=document.getElementById('edit_cad_'+k);if(el)obj[k]=el.value.trim()});
  if(obj.placa)obj.placa=obj.placa.toUpperCase();
  editingCadIndex=null;saveCad();renderCadastros();toast('Cadastro atualizado com sucesso.')
}
function delCad(i){
  const r=cad[cadTab][i];
  if(!confirm('Excluir '+(r.nome||r.placa||'este item')+'?'))return;
  cad[cadTab].splice(i,1);saveCad();renderCadastros();toast('Cadastro excluído.','warn')
}

/* ---------------- IMPRESSÃO ---------------- */
const REQ_PRINT=[
  ['data','Data'],
  ['numeroChegada','Nº de chegada'],
  ['motorista','Motorista'],
  ['placaVeiculo','Placa'],
  ['produtor','Fornecedor/Roça'],
  ['gtlId','Número GTL'],
  ['horaChegada','Hora da chegada'],
  ['responsavel','Responsável'],
  ['tipoCaminhao','Tipo de caminhão']
];

function validatePrint(t){
  const m = [];
  REQ_PRINT.forEach(([k,l]) => { 
    if(!t[k] && t[k] !== 0) m.push(l); 
  });
  
  if(!t.notaFiscal && !t.numeroGuia) {
    m.push('Nota Fiscal ou Número da Guia');
  }
  
  return m;
}

function imprimirDados(id){
  const t=trucks.find(x=>x.id===id);
  if(!t) return;
  const miss=validatePrint(t);
  
  if(miss.length){
    toast('Faltam dados p/ emitir: '+miss.join(', '),'err');
    openEdit(id);
    return;
  }
  renderPrint(t);
  doPrint();
}

function preview(id){
  const t=trucks.find(x=>x.id===id);
  if(!t) return;
  renderPrint(t);
  document.getElementById('previewBody').innerHTML=document.getElementById('printRoot').innerHTML;
  openModal('previewModal');
}

/* #printRoot é display:none e window.print() NÃO espera o fetch das imagens.
   Sem isto, a primeira impressão depois de abrir o app sai sem o logo da
   Wilson — o preview funciona porque copia o mesmo HTML para um container
   visível, que dá tempo à imagem carregar. Depois, com o PNG em cache,
   volta a funcionar; daí o sintoma parecer intermitente.
   `minMs` segura o diálogo até o modal terminar de fechar (saída de 140ms). */
function whenPrintReady(cb,minMs){
  const root=document.getElementById('printRoot');
  const imgs=root?Array.prototype.slice.call(root.querySelectorAll('img')):[];
  const pend=imgs.filter(i=>!(i.complete&&i.naturalWidth>0));
  const piso=new Promise(res=>setTimeout(res,minMs||0));

  let feito=false;
  const ir=()=>{if(feito)return;feito=true;cb()};
  /* Teto de 3s: imagem quebrada não pode travar a emissão de uma guia. */
  const guarda=setTimeout(ir,3000);

  const carregadas=Promise.all(pend.map(i=>new Promise(res=>{
    i.addEventListener('load',res,{once:true});
    i.addEventListener('error',res,{once:true});
  })));

  Promise.all([carregadas,piso]).then(()=>{clearTimeout(guarda);ir()});
}

function doPrint(){ whenPrintReady(()=>window.print()); }

function renderPrint(t){ document.getElementById('printRoot').innerHTML=gtlHTML(t)+capaHTML(t); }

function gtlHTML(t) {
  // Une a Nota Fiscal com a Guia como sendo a mesma coisa
  const nfGuia = t.notaFiscal || t.numeroGuia || '';
  
  const dp = fmtDateBR(t.data).split('/');
  const dd = dp[0] || '&nbsp;&nbsp;', mm = dp[1] || '&nbsp;&nbsp;', aa = dp[2] || '&nbsp;&nbsp;&nbsp;&nbsp;';
  const colManual = t.tipoColheita === 'Manual';
  const emGranel = t.tipoEmbalagem !== 'Caixa';
  
  const ck = on => '<div class="gtl-ck">' + (on ? 'X' : '&nbsp;') + '</div>';
  const v = val => val ? esc(val) : '';
  
  return `
  <div class="doc-page">
    <table class="gtl-tbl">
      <tr>
        <td style="width:22%; text-align:center; padding:6px;"><img src="${LOGO_SRC}" class="gtl-logo" alt="Wilson"></td>
        <td style="width:53%; text-align:center; font-weight:bold; font-size:14px; line-height:1.2;">SISTEMA DE GESTÃO DA QUALIDADE E<br>SEGURANÇA DE ALIMENTOS</td>
        <td style="width:25%; font-size:11px; padding:6px;">Emissão: 27/06/2011<br>Revisão: 01<br>Atualizado em: 27/07/2023</td>
      </tr>
      <tr>
        <td colspan="2" style="font-size:11px; padding:4px 6px;">Documento: FORMULÁRIO</td>
        <td style="font-size:11px; padding:4px 6px;">Código: FRM/CQ/DIV/013</td>
      </tr>
      <tr>
        <td colspan="2" style="font-size:11px; padding:4px 6px;">Descrição: GUIA DE RECEBIMENTO DE TOMATE IN NATURA</td>
        <td style="font-size:11px; padding:4px 6px;">Página: 1 de 1</td>
      </tr>
    </table>
    
    <table class="gtl-tbl" style="border-top:none;">
      <tr><td colspan="6" class="gtl-sec">PREENCHIMENTO PELA PORTARIA</td></tr>
      <tr class="gtl-row-dash">
        <td class="gtl-lbl b-none" style="width:12%;">Ordem de<br>Chegada:</td>
        <td class="t-center b-dash-r gtl-v-bot" style="width:15%;">${v(t.numeroChegada)}</td>
        <td class="gtl-lbl b-none" style="width:12%;">Número<br>da Guia:</td>
        <td class="t-center b-dash-r gtl-v-bot" style="width:18%;">${v(nfGuia)}</td>
        <td class="gtl-lbl b-none" style="width:8%;">Data:</td>
        <td style="padding:0; width:35%;">
          <div class="gtl-dflex">
            <div class="gtl-dbox">${dd}</div><div class="gtl-dsep">/</div>
            <div class="gtl-dbox">${mm}</div><div class="gtl-dsep">/</div>
            <div class="gtl-dbox b-none">${aa}</div>
          </div>
        </td>
      </tr>
      <tr class="gtl-row-dash">
        <td class="gtl-lbl b-none">Fornecedor:</td>
        <td colspan="3" class="t-center b-dash-r gtl-v-bot">${v(t.produtor)}</td>
        <td class="gtl-lbl b-none">Cidade:</td>
        <td class="t-center gtl-v-bot">${v(t.cidade)}</td>
      </tr>
      <tr class="gtl-row-dash">
        <td class="gtl-lbl b-none">Hora da<br>Chegada:</td>
        <td class="t-center b-dash-r gtl-v-bot">${v(t.horaChegada)}</td>
        <td class="gtl-lbl b-none">Número GTL:</td>
        <td class="t-center b-dash-r gtl-v-bot">${v(t.gtlId)}</td>
        <td colspan="2" style="padding:0;">
           <table class="gtl-inner">
             <tr><td class="gtl-lbl b-none" style="width:65px;">Variedade:</td><td class="t-center gtl-v-bot">${v(t.variedade)}</td></tr>
             <tr><td class="gtl-lbl b-none">Placa:</td><td class="t-center b-none-b gtl-v-bot">${v(t.placaVeiculo)}</td></tr>
           </table>
        </td>
      </tr>
      <tr class="gtl-row-dash">
        <td class="gtl-lbl b-none">Tipo de<br>Embalagem:</td>
        <td colspan="2" class="b-dash-r">
          <div class="gtl-chk-row">${ck(emGranel)}<span>Granel</span> &nbsp;&nbsp;&nbsp; ${ck(!emGranel)}<span>Caixa</span></div>
        </td>
        <td class="gtl-lbl b-none">Tipo de Colheita:</td>
        <td colspan="2">
          <div class="gtl-chk-row">${ck(colManual)}<span>Manual</span> &nbsp;&nbsp;&nbsp; ${ck(!colManual)}<span>Mecânica</span></div>
        </td>
      </tr>
      <tr>
        <td colspan="2" class="gtl-lbl b-none">Nome Responsável pelo<br>Preenchimento (Portaria):</td>
        <td colspan="4"><div class="gtl-sig">${v(t.responsavel)}</div></td>
      </tr>
    </table>

    <table class="gtl-tbl" style="border-top:none;">
      <tr><td colspan="4" class="gtl-sec">ANÁLISE DE CLASSIFICAÇÃO DA AMOSTRA – LAB. CLASSIFICAÇÃO</td></tr>
      <tr>
        <td class="gtl-w25 t-center t-bold">ITEM ANALISADO</td><td class="gtl-w25 t-center t-bold">QUANTIDADE (kg)</td>
        <td class="gtl-w25 t-center t-bold">ITEM ANALISADO</td><td class="gtl-w25 t-center t-bold">QUANTIDADE (kg)</td>
      </tr>
      <tr><td class="t-center" style="padding:6px;">Fruto Bom</td><td></td><td class="t-center">Fruto Mofado</td><td></td></tr>
      <tr><td class="t-center" style="padding:6px;">Fruto Verde</td><td></td><td class="t-center">Fruto com Fundo Preto</td><td></td></tr>
      <tr><td class="t-center" style="padding:6px;">Fruto Desintegrado</td><td></td><td class="t-center">Impurezas (terra, galhos, etc.)</td><td></td></tr>
    </table>
    
    <table class="gtl-tbl" style="border-top:none;">
      <tr>
        <td class="gtl-w33 gtl-lbl-top">Data da<br>Amostragem:</td>
        <td class="gtl-w33 gtl-lbl-top">Hora da<br>Amostragem:</td>
        <td class="gtl-w33 gtl-lbl-top">Total da<br>Amostra (kg):</td>
      </tr>
      <tr>
        <td colspan="3" class="gtl-lbl-top" style="padding-bottom:12px;">Nome Responsável pelo<br>Preenchimento (Lab. Classificação)<div class="gtl-sig"></div></td>
      </tr>
    </table>

    <table class="gtl-tbl" style="border-top:none;">
      <tr><td colspan="4" class="gtl-sec">RESULTADOS DA ANÁLISE FÍSICO-QUÍMICA – LAB. FÍSICO- QUÍMICO</td></tr>
      <tr>
        <td class="gtl-w25 t-center t-bold">Cor Vermelha</td><td class="gtl-w25 t-center t-bold">Cor Amarela</td>
        <td class="gtl-w25 t-center t-bold">Cor Azul</td><td class="gtl-w25 t-center t-bold">°Brix</td>
      </tr>
      <tr>
        <td class="t-center" style="padding:6px;">11,0 à 16,0</td><td class="t-center">9,0 à 15,0</td>
        <td class="t-center">0,0 à 2,0</td><td class="t-center">Mín. 3,5</td>
      </tr>
      <tr><td style="height:35px;"></td><td></td><td></td><td></td></tr>
    </table>
    
    <table class="gtl-tbl" style="border-top:none;">
      <tr>
        <td class="gtl-w50 gtl-lbl-top">Data da Análise:</td><td class="gtl-w50 gtl-lbl-top">Hora da<br>Análise:</td>
      </tr>
      <tr>
        <td colspan="2" class="gtl-lbl-top" style="padding-bottom:12px;">Nome do Analista (Lab. Físico<br>Químico)<div class="gtl-sig"></div></td>
      </tr>
    </table>
    
    <table class="gtl-tbl" style="border-top:none;">
      <tr>
        <td class="gtl-lbl" style="width:12%; border-right:none;">Status:</td>
        <td style="width:38%; border-left:none;">
          <div class="gtl-chk-row" style="justify-content:flex-start;">${ck(false)}<span>APROVADO</span></div>
        </td>
        <td style="width:12%; border-right:none;"></td>
        <td style="width:38%; border-left:none;">
          <div class="gtl-chk-row" style="justify-content:flex-start;">${ck(false)}<span>REPROVADO</span></div>
        </td>
      </tr>
    </table>
  </div>
  `;
}

function capaHTML(t){
  const code = t.codigo || generateTruckCode();
  return '<div class="doc-page capa">'+
    '<div class="chead"><img src="'+LOGO_SRC+'" alt="Wilson"><div class="ct"><div class="t1">RECEBIMENTO DE TOMATE</div><div class="t2">CAPA DE CARGA</div></div></div>'+
    '<div class="cbox"><div class="cl">Nota Fiscal Nº</div><div class="cv">'+esc(t.notaFiscal||'—')+'</div></div>'+
    '<div class="cbox"><div class="cl">Roça / Fornecedor</div><div class="cv">'+esc(t.produtor)+'</div></div>'+
    '<div class="cgrid"><div class="cbox small"><div class="cl">Motorista</div><div class="cv">'+esc(t.motorista)+'</div></div>'+
    '<div class="cbox small"><div class="cl">Placa do Veículo</div><div class="cv">'+esc(t.placaVeiculo)+'</div></div></div>'+
    '<div class="cbox"><div class="cl">Tipo de Caminhão</div><div class="cv">'+esc(t.tipoCaminhao||'—')+'</div></div>'+
    '<div class="cgrid"><div class="cbox small"><div class="cl">Nº Chegada</div><div class="cv">'+esc(t.numeroChegada)+'</div></div>'+
    '<div class="cbox small"><div class="cl">GTL</div><div class="cv">'+esc(t.gtlId)+'</div></div></div>'+
    '<div class="cfoot">Código: <b>'+esc(code)+'</b> &nbsp;·&nbsp; Cidade: '+esc(t.cidade||'—')+' &nbsp;·&nbsp; Variedade: '+esc(t.variedade||'—')+' &nbsp;·&nbsp; Data: '+fmtDateBR(t.data)+' &nbsp;·&nbsp; Chegada: '+(t.horaChegada||'—')+'</div></div>';
}

/* ---------------- EXPORTAÇÃO PDF ESTILIZADA ---------------- */
let currentPdfType = 'chegada';

function openPdfExport(type){
  currentPdfType = type;
  const isChegada = type === 'chegada';
  document.getElementById('exportPdfTitle').textContent = isChegada ? 'Exportar PDF — Ordem de Chegada' : 'Exportar PDF — Relatório Completo de Pesagem';
  document.getElementById('exportPdfSub').textContent = isChegada ? 
    'Gera um relatório de chegada com Data, Nº Chegada, Motorista, Placa e Produtor' : 
    'Gera um relatório completo com Horários, Pesos, Nota Fiscal, Diferenças e Situação';
  document.getElementById('pdfTypeTag').textContent = isChegada ? 'Ordem de Chegada' : 'Pesagem Completa';
  
  const dates = trucks.map(t => t.data).filter(Boolean).sort();
  const minDate = dates.length ? dates[0] : todayISO();
  const maxDate = dates.length ? dates[dates.length - 1] : todayISO();
  
  document.getElementById('pdfFrom').value = minDate;
  document.getElementById('pdfTo').value = maxDate;
  
  renderPdfPreview();
  openModal('exportPdfModal');
}

function getFilteredPdfTrucks(){
  const from = document.getElementById('pdfFrom').value;
  const to = document.getElementById('pdfTo').value;
  let list = trucks.slice();
  if(from) list = list.filter(t => t.data >= from);
  if(to) list = list.filter(t => t.data <= to);
  list.sort((a,b) => {
    if(a.data !== b.data) return a.data.localeCompare(b.data);
    return (parseInt(a.numeroChegada) || 0) - (parseInt(b.numeroChegada) || 0);
  });
  return list;
}

function renderPdfPreview(){
  const list = getFilteredPdfTrucks();
  document.getElementById('pdfCountBadge').textContent = list.length + (list.length === 1 ? ' registro' : ' registros');
  
  const wrap = document.getElementById('pdfPreviewListWrap');
  if(!list.length){
    wrap.innerHTML = '<div class="empty" style="padding:32px;">Nenhum caminhão encontrado no período selecionado.</div>';
    return;
  }
  
  if(currentPdfType === 'chegada'){
    wrap.innerHTML = `
      <table class="cadtable">
        <thead>
          <tr>
            <th style="width:85px;">Data</th>
            <th style="width:70px;">Nº Cheg.</th>
            <th>Motorista</th>
            <th>Placa</th>
            <th>Produtor / Roça</th>
            <th>GTL</th>
            <th>Tipo Caminhão</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(t => `
            <tr>
              <td>${fmtDateBR(t.data)}</td>
              <td><span class="rownum">${esc(t.numeroChegada)}</span></td>
              <td class="strong">${esc(t.motorista)}</td>
              <td><span class="plate">${esc(t.placaVeiculo)}</span></td>
              <td>${esc((t.codigoRoca ? t.codigoRoca + ' - ' : '') + t.produtor)}</td>
              <td>${esc(t.gtlId || t.numeroGuia || '—')}</td>
              <td>${esc(t.tipoCaminhao || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    wrap.innerHTML = `
      <table class="cadtable">
        <thead>
          <tr>
            <th style="width:85px;">Data</th>
            <th style="width:60px;">Nº</th>
            <th>Motorista</th>
            <th>Placa</th>
            <th>Produtor / Roça</th>
            <th>GTL / NF</th>
            <th>H. Chegada</th>
            <th style="text-align:right;">P. Bruto</th>
            <th style="text-align:right;">Tara</th>
            <th style="text-align:right;">P. Líquido</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(t => {
            const liq = pesoLiquido(t);
            const st = getStatus(t);
            return `
              <tr>
                <td>${fmtDateBR(t.data)}</td>
                <td><span class="rownum">${esc(t.numeroChegada)}</span></td>
                <td class="strong">${esc(t.motorista)}</td>
                <td><span class="plate">${esc(t.placaVeiculo)}</span></td>
                <td>${esc(t.produtor)}</td>
                <td>${esc(t.gtlId || t.notaFiscal || '—')}</td>
                <td>${esc(t.horaChegada || '—')}</td>
                <td style="text-align:right;">${fmtKg(t.pesoBruto)}</td>
                <td style="text-align:right;">${fmtKg(t.pesoTara)}</td>
                <td style="text-align:right; font-weight:800;">${fmtKg(liq)}</td>
                <td>${badge(st, t)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }
}

function generatePdfReport(){
  const list = getFilteredPdfTrucks();
  if(!list.length){
    toast('Nenhum registro encontrado no período selecionado.', 'warn');
    return;
  }
  
  showLoading(350);
  const from = fmtDateBR(document.getElementById('pdfFrom').value);
  const to = fmtDateBR(document.getElementById('pdfTo').value);
  const periodoText = from === to ? `Data: ${from}` : `Período: ${from} a ${to}`;
  const nowText = new Date().toLocaleString('pt-BR');
  
  let html = '';
  
  if(currentPdfType === 'chegada'){
    document.body.classList.add('pdf-portrait-mode');
    document.body.classList.remove('pdf-landscape-mode');
    
    html = `
      <div class="pdf-doc">
        <div class="pdf-head">
          <img src="${LOGO_SRC}" alt="Wilson" class="pdf-logo">
          <div class="pdf-title-wrap">
            <h2>ORDEM DE CHEGADA DE CAMINHÕES</h2>
            <div class="pdf-sub">SAFRA TOMATE 2026 — ALIMENTOS WILSON</div>
          </div>
          <div class="pdf-meta-box">
            <div><strong>${periodoText}</strong></div>
            <div>Emissão: ${nowText}</div>
            <div>Total: <strong>${list.length} caminhões</strong></div>
          </div>
        </div>
        
        <table class="pdf-tbl">
          <thead>
            <tr>
              <th style="width:10%;">Data</th>
              <th style="width:10%; text-align:center;">Nº Cheg.</th>
              <th style="width:12%; text-align:center;">H. Chegada</th>
              <th style="width:24%;">Motorista</th>
              <th style="width:14%;">Placa</th>
              <th style="width:20%;">Produtor / Roça</th>
              <th style="width:10%;">Tipo</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((t, idx) => `
              <tr class="${idx % 2 === 1 ? 'zebra' : ''}">
                <td>${fmtDateBR(t.data)}</td>
                <td style="text-align:center; font-weight:bold;">${esc(t.numeroChegada)}</td>
                <td style="text-align:center;">${esc(t.horaChegada || '—')}</td>
                <td style="font-weight:bold;">${esc(t.motorista)}</td>
                <td style="font-weight:bold; letter-spacing:0.5px;">${esc(t.placaVeiculo)}</td>
                <td>${esc((t.codigoRoca ? t.codigoRoca + ' - ' : '') + t.produtor)}</td>
                <td>${esc(t.tipoCaminhao || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="pdf-summary-bar">
          <div><strong>Total de Veículos Registrados:</strong> ${list.length} caminhões</div>
          <div>Relatório gerado pelo Sistema Safra Tomate 2026</div>
        </div>
      </div>
    `;
  } else {
    document.body.classList.add('pdf-landscape-mode');
    document.body.classList.remove('pdf-portrait-mode');
    
    const moidos = list.filter(t => getStatus(t) === 'moido');
    const totLiq = moidos.reduce((acc, t) => acc + (pesoLiquido(t) || 0), 0);
    const mediaLiq = moidos.length ? Math.round(totLiq / moidos.length) : 0;
    
    html = `
      <div class="pdf-doc">
        <div class="pdf-head">
          <img src="${LOGO_SRC}" alt="Wilson" class="pdf-logo">
          <div class="pdf-title-wrap">
            <h2>RELATÓRIO COMPLETO DE PESAGEM E RECEBIMENTO</h2>
            <div class="pdf-sub">SAFRA TOMATE 2026 — ALIMENTOS WILSON</div>
          </div>
          <div class="pdf-meta-box">
            <div><strong>${periodoText}</strong></div>
            <div>Emissão: ${nowText}</div>
            <div>Total: <strong>${list.length} cargas</strong></div>
          </div>
        </div>
        
        <div class="pdf-kpis">
          <div class="pdf-kpi"><span class="l">TOTAL DE CARGAS</span><span class="v">${list.length}</span></div>
          <div class="pdf-kpi"><span class="l">CARGAS CONCLUÍDAS (MOÍDAS)</span><span class="v">${moidos.length}</span></div>
          <div class="pdf-kpi"><span class="l">TOTAL PESO LÍQUIDO</span><span class="v">${(totLiq/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} t</span><span class="s">${totLiq.toLocaleString('pt-BR')} kg</span></div>
          <div class="pdf-kpi"><span class="l">MÉDIA LÍQUIDO / CARGA</span><span class="v">${mediaLiq.toLocaleString('pt-BR')} kg</span></div>
        </div>
        
        <table class="pdf-tbl">
          <thead>
            <tr>
              <th>Data</th>
              <th style="text-align:center;">Nº</th>
              <th>Motorista</th>
              <th>Placa</th>
              <th>Produtor / Roça</th>
              <th>GTL</th>
              <th>Nº NF</th>
              <th>H. Cheg</th>
              <th class="r">1ª Pesag.</th>
              <th>H. Bruto</th>
              <th class="r">P. Bruto</th>
              <th>H. Saída</th>
              <th class="r">P. Tara</th>
              <th class="r">P. Líquido</th>
              <th class="r">P. NF</th>
              <th class="r">Dif (NF-Líq)</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((t, idx) => {
              const liq = pesoLiquido(t);
              const dif = difKg(t);
              const st = getStatus(t);
              const stText = STATUS_LABEL[st] || st;
              return `
                <tr class="${idx % 2 === 1 ? 'zebra' : ''}">
                  <td>${fmtDateBR(t.data)}</td>
                  <td style="text-align:center; font-weight:bold;">${esc(t.numeroChegada)}</td>
                  <td style="font-weight:bold;">${esc(t.motorista)}</td>
                  <td style="font-weight:bold;">${esc(t.placaVeiculo)}</td>
                  <td>${esc((t.codigoRoca ? t.codigoRoca + ' - ' : '') + t.produtor)}</td>
                  <td>${esc(t.gtlId || t.numeroGuia || '—')}</td>
                  <td>${esc(t.notaFiscal || '—')}</td>
                  <td>${esc(t.horaChegada || '—')}</td>
                  <td class="r">${fmtKg(t.pesoChegada)}</td>
                  <td>${esc(t.horaPesoBruto || '—')}</td>
                  <td class="r">${fmtKg(t.pesoBruto)}</td>
                  <td>${esc(t.horaSaida || '—')}</td>
                  <td class="r">${fmtKg(t.pesoTara)}</td>
                  <td class="r" style="font-weight:bold; color:#0f172a;">${fmtKg(liq)}</td>
                  <td class="r">${fmtKg(t.pesoNF)}</td>
                  <td class="r">${dif === null ? '—' : (dif > 0 ? '+' : '') + dif.toLocaleString('pt-BR') + ' kg'}</td>
                  <td><span class="pdf-tag tag-${st}">${esc(stText)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="pdf-footer-bar">
          <div>Alimentos Wilson — Controle de Recebimento de Tomate in Natura 2026</div>
          <div>Documento de Relatório Geral</div>
        </div>
      </div>
    `;
  }
  
  document.getElementById('printRoot').innerHTML = html;
  closeModal('exportPdfModal');
  /* Mesmo problema do doPrint: o setTimeout de 150ms daqui era um chute que
     às vezes ganhava a corrida com o carregamento do logo, às vezes não. */
  whenPrintReady(() => {
    window.print();
    toast('Relatório PDF enviado para impressão/salvamento.');
  }, 160);
}

/* ---------------- XLSX (ZIP puro, STORE) ---------------- */
const CRC_TABLE=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC_TABLE[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function strBytes(s){return new TextEncoder().encode(s)}
function makeZip(files){const enc=[],central=[];let offset=0;const now=new Date();
  const dt=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()/2))&0xFFFF,dd=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate())&0xFFFF;
  files.forEach(f=>{const nb=strBytes(f.name),data=f.data,crc=crc32(data);
    const lo=new Uint8Array(30+nb.length),dv=new DataView(lo.buffer);
    dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint16(10,dt,true);dv.setUint16(12,dd,true);dv.setUint32(14,crc,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true);dv.setUint16(26,nb.length,true);lo.set(nb,30);
    enc.push(lo,data);const ce=new Uint8Array(46+nb.length),cv=new DataView(ce.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(12,dt,true);cv.setUint16(14,dd,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,nb.length,true);cv.setUint32(42,offset,true);ce.set(nb,46);central.push(ce);offset+=lo.length+data.length;});
  const cs=central.reduce((a,c)=>a+c.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,cs,true);ev.setUint32(16,offset,true);
  const all=[...enc,...central,end];let tot=all.reduce((a,x)=>a+x.length,0),out=new Uint8Array(tot),p=0;all.forEach(x=>{out.set(x,p);p+=x.length});return out}
function xmlEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function colName(i){let s='';i++;while(i>0){let m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}
function sheetXml(rows){let x='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((row,ri)=>{x+='<row r="'+(ri+1)+'">';row.forEach((cell,ci)=>{if(cell==null||cell==='')return;const ref=colName(ci)+(ri+1);
    if(typeof cell==='number')x+='<c r="'+ref+'"><v>'+cell+'</v></c>';else if(cell&&cell.n!==undefined)x+='<c r="'+ref+'"><v>'+cell.n+'</v></c>';
    else x+='<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEsc(cell)+'</t></is></c>';});x+='</row>'});
  return x+'</sheetData></worksheet>'}
function buildXlsx(sheets){const files=[];
  files.push({name:'[Content_Types].xml',data:strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>')});
  files.push({name:'_rels/.rels',data:strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')});
  files.push({name:'xl/workbook.xml',data:strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xmlEsc(s.name.slice(0,31))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>')});
  files.push({name:'xl/_rels/workbook.xml.rels',data:strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>')});
  sheets.forEach((s,i)=>files.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:strBytes(sheetXml(s.rows))}));return makeZip(files)}
function downloadBytes(bytes,filename,mime){const blob=new Blob([bytes],{type:mime||'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
const MAIN_HEADERS=['Data da Pesagem','Placa Chegada','Nome do Motorista','Placas do Veículo','GTL - ID','Nome do Produtor','Hora da Chegada','Peso Chegada','Hora Peso Bruto','Peso Bruto','Peso Tara','Peso Motorista','PESO NF','DIF (kG)','Hora da Saída','Nota Fiscal','Observações'];
function mainRow(t){const dif=difKg(t);return [fmtDateBR(t.data),t.numeroChegada,t.motorista,t.placaVeiculo,t.gtlId,t.produtor,t.horaChegada||'',t.pesoChegada!=null?{n:t.pesoChegada}:'',t.horaPesoBruto||'',t.pesoBruto!=null?{n:t.pesoBruto}:'',t.pesoTara!=null?{n:t.pesoTara}:'',t.pesoMotorista!=null?{n:t.pesoMotorista}:'',t.pesoNF!=null?{n:t.pesoNF}:'',dif!=null?{n:dif}:'',t.horaSaida||'',t.notaFiscal||'',t.observacoes||(t.pesagemAntecipada?'PESADO ANTES DO HORÁRIO. '+(t.obsPesagem||''):(t.obsPesagem||''))]}
function exportPrincipal(){if(!trucks.length){toast('Nenhum dado para exportar.','warn');return}
  const months={};trucks.forEach(t=>{const mk=t.data.slice(0,7);(months[mk]=months[mk]||[]).push(t)});const mk=Object.keys(months).sort().pop();
  const days={};months[mk].forEach(t=>{(days[t.data]=days[t.data]||[]).push(t)});
  const sheets=Object.keys(days).sort().map(d=>{const p=d.split('-');const rows=[['ACOMPANHAMENTO DE PESAGEM DE VEÍCULOS (TOMATE)'],[],MAIN_HEADERS];
    days[d].sort((a,b)=>(parseInt(a.numeroChegada)||0)-(parseInt(b.numeroChegada)||0)).forEach(t=>rows.push(mainRow(t)));return {name:p[2]+'.'+p[1]+'.'+p[0],rows}});
  downloadBytes(buildXlsx(sheets),mk+' SAFRA TOMATE.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');toast('Planilha principal ('+mk+') exportada.')}
function exportOrdem(){if(!trucks.length){toast('Nenhum dado para exportar.','warn');return}
  const meses=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'],byM={};
  trucks.forEach(t=>{const m=parseInt(t.data.slice(5,7))-1;(byM[m]=byM[m]||[]).push(t)});
  const sheets=Object.keys(byM).sort((a,b)=>a-b).map(m=>{const rows=[['ORDEM DE CHEGADA'],[],['DATA','Placa chegada','Nome do Motorista','Placas do Veículo','Observações']];
    byM[m].sort((a,b)=>a.data.localeCompare(b.data)||((parseInt(a.numeroChegada)||0)-(parseInt(b.numeroChegada)||0))).forEach(t=>rows.push([fmtDateBR(t.data),t.numeroChegada,t.motorista,t.placaVeiculo,t.observacoes||'']));return {name:meses[m],rows}});
  downloadBytes(buildXlsx(sheets),'ORDEM DE CHEGADA (SAFRA 2026).xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');toast('Ordem de Chegada exportada.')}

/* ---------------- BACKUP / IMPORT ---------------- */
function backupJSON(){downloadBytes(strBytes(JSON.stringify({version:2,exportedAt:new Date().toISOString(),trucks,cad,prog},null,2)),'backup-safra-tomate-'+todayISO()+'.json','application/json');toast('Backup gerado.')}
function importJSON(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();
  r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.trucks)throw 0;if(!confirm('Importar '+d.trucks.length+' registro(s)? Isto substituirá os dados atuais.'))return;
    trucks=d.trucks;cad=Object.assign({produtores:[],motoristas:[],placas:[],variedades:[]},d.cad||{});
    /* Backups v1 não têm programação; preserva a que já está na máquina. */
    if(d.prog){prog=Object.assign(progVazia(),d.prog);saveProg();}
    save();saveCad();refreshAll();toast('Dados importados.');}catch(err){toast('Arquivo inválido.','err')}};
  r.readAsText(file);e.target.value='';}

/* ---------------- UI ---------------- */
/* Preferência de movimento reduzido — consultada, não assumida.
   Reavaliada a cada uso porque o usuário pode mudar no meio do turno. */
const REDUCED=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============ ONDA DE CLIQUE ============
   Cursor em CSS não anima (o browser rasteriza a imagem uma vez), então
   a animação é um elemento posicionado na coordenada do clique.

   Só em elemento interativo: onda ao clicar dentro de um campo de texto
   ou numa área vazia seria ruído, não confirmação. Mesma lista de
   seletores que recebe o cursor de alvo, para os dois não divergirem. */
const CLICAVEL='button,.btn,.seg,.chip,a,summary,td.ed,select,label.switch,[onclick],[role="button"],.x,.menu-toggle,input[type="checkbox"],input[type="radio"]';

/* ============ PONTEIRO MORFÁVEL ============
   A propriedade cursor não transiciona, então o ponteiro é um elemento
   que segue o mouse. Só liga em mouse fino (não em toque) e nunca sob
   movimento reduzido — nos dois casos o cursor nativo continua valendo,
   porque a classe .curjs (que aplica cursor:none) nem chega a entrar. */
function initPonteiro(){
  if(REDUCED())return;
  if(!window.matchMedia('(pointer: fine)').matches)return;

  const el=document.createElement('div');
  el.className='cur';
  el.innerHTML="<svg class='cur-seta' width='28' height='28' viewBox='0 0 28 28'>"+
    "<g stroke-linejoin='round' stroke-linecap='round'>"+
    "<path d='M6 3.6 L6 20.4 L10.6 16.2 L13.5 22.5 L16.5 21 L13.7 14.9 L19.7 14.9 Z' fill='none' stroke='rgba(15,23,42,0.30)' stroke-width='4'/>"+
    "<path d='M6 3.6 L6 20.4 L10.6 16.2 L13.5 22.5 L16.5 21 L13.7 14.9 L19.7 14.9 Z' fill='#0f172a' stroke='#ffffff' stroke-width='1.6'/>"+
    "</g></svg><i class='cur-anel'></i>";
  document.body.appendChild(el);
  document.documentElement.classList.add('curjs');

  let x=0,y=0,pedido=0;
  /* Coalescido em rAF: pointermove dispara dezenas de vezes por quadro
     e escrever transform em cada um seria trabalho jogado fora. */
  const pintar=()=>{pedido=0;el.style.transform='translate3d('+x+'px,'+y+'px,0)'};

  document.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse')return;
    x=e.clientX;y=e.clientY;
    if(!pedido)pedido=requestAnimationFrame(pintar);
    if(!el.classList.contains('ativo'))el.classList.add('ativo');
    const alvo=e.target.closest&&e.target.closest(CLICAVEL);
    el.classList.toggle('alvo',!!alvo);
    /* Sobre campo de texto o I-beam nativo assume e o custom sai de
       cena, senão apareceriam dois ponteiros ao mesmo tempo. */
    const texto=e.target.matches&&e.target.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]),textarea');
    el.classList.toggle('oculto',!!texto);
  },{passive:true});

  /* Saiu da janela: some. Voltou: reaparece. Sem isto o ponteiro fica
     congelado na borda quando o operador vai para outra janela. */
  document.addEventListener('pointerleave',()=>el.classList.remove('ativo'));
  window.addEventListener('blur',()=>el.classList.remove('ativo'));
}
initPonteiro();

document.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;                       /* só botão principal */
  if(REDUCED())return;
  if(!e.target.closest||!e.target.closest(CLICAVEL))return;
  const rip=document.createElement('span');
  rip.className='rip';
  rip.style.left=e.clientX+'px';
  rip.style.top=e.clientY+'px';
  document.body.appendChild(rip);
  /* animationend cobre o caso normal; o timeout garante a remoção se a
     aba perder o foco no meio e o evento nunca chegar. */
  const fim=()=>{if(rip.parentNode)rip.remove()};
  rip.addEventListener('animationend',fim,{once:true});
  setTimeout(fim,600);
},{passive:true});

function openModal(id){document.getElementById(id).classList.add('open')}

/* Saída assimétrica: 140ms só em opacidade, contra 200ms de entrada.
   O que sai deve sair do caminho, não fazer cerimônia. */
function closeModal(id){
  const m=document.getElementById(id);
  if(!m||!m.classList.contains('open'))return;
  if(REDUCED()){m.classList.remove('open','closing');return;}
  m.classList.add('closing');
  setTimeout(()=>m.classList.remove('open','closing'),140);
}
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)closeModal(m.id)}));
let toastT;function toast(msg,type){const el=document.getElementById('toast');el.textContent=msg;el.className='toast show'+(type?' '+type:'');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),type==='err'?5000:3000)}
function refreshAll(){fillDatalists();updateNavCounts();renderProg();renderView(currentView)}

/* ---------------- Init ---------------- */
function seedIfEmpty(){if(cad.produtores.length||cad.motoristas.length)return;
  cad.produtores=[{nome:'ANTONIO CARLOS POZATTO',cidade:'PIRACICABA SP',variedade:''},{nome:'WILSON YUDI SAKASHITA',cidade:'',variedade:''}];
  cad.motoristas=[{nome:'WILSON YUDI SAKASHITA',placa:''}];saveCad()}
function init(){
  showLoading(600, true);
  load();fillDatalists();tick();
  document.getElementById('regDate').value='';document.getElementById('repTo').value=todayISO();
  const p=new Date();p.setDate(p.getDate()-30);document.getElementById('repFrom').value=p.getFullYear()+'-'+pad(p.getMonth()+1)+'-'+pad(p.getDate());
  document.querySelector('#regTable tbody').addEventListener('click',e=>{const td=e.target.closest('td.ed');if(td)beginEdit(td)});
  seedIfEmpty();renderChegada();updateNavCounts();renderProg();
  setInterval(()=>{if(['chegada','patio','moagem','painel'].includes(currentView)&&!document.querySelector('#regTable td.ed input'))renderView(currentView)},30000);
}
init();