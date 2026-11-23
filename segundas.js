/* =====================================================================
   SEGUNDAS  (Bodega → cuadro "Segundas")
   Modelos de segunda: "Urban segunda" y "Race segunda", tallas 34 a 46,
   un solo color ("Surtido"). No salen en la lista principal de modelos
   ni en "Bajo stock"; se ven entrando al cuadro Segundas.
   ===================================================================== */
(function(){
  const SEGUNDAS = ['Urban segunda', 'Race segunda'];
  const COLOR = 'Surtido';
  const TALLA_MAX = 46;
  const esSeg = m => /\bsegunda$/i.test(String(m||'').trim());

  FOTO_MODELO['urban-segunda'] = 'jpg';
  FOTO_MODELO['race-segunda'] = 'jpg';

  // las segundas van de la 34 a la 44: van de la 34 a la 46 (las que crea la hoja)
  let ultimo = null;
  function limpiar(){
    if(!Array.isArray(S.filas) || S.filas === ultimo) return;
    S.filas = S.filas.filter(f => !(esSeg(f.modelo) && Number(f.talla) > TALLA_MAX));
    ultimo = S.filas;
  }
  const todasLasFilas = () => S.__todas || S.filas;

  function modelosSeg(){
    const m = new Map();
    todasLasFilas().filter(f => esSeg(f.modelo)).forEach(f => {
      if(!m.has(f.modelo)) m.set(f.modelo, { modelo:f.modelo, pares:0 });
      m.get(f.modelo).pares += f.pares;
    });
    return SEGUNDAS.map(n => m.get(n)).filter(Boolean).concat([...m.values()].filter(x => !SEGUNDAS.includes(x.modelo)));
  }

  // la lista principal de modelos no muestra las segundas
  const modelosOrig = window.modelos;
  window.modelos = function(){ return modelosOrig().filter(m => !esSeg(m.modelo)); };

  // el total de bodega y el "bajo mínimo" no cuentan las segundas
  const vModelosOrig = window.vModelos;
  window.vModelos = function(){
    const todas = S.filas; S.__todas = todas; S.filas = todas.filter(f => !esSeg(f.modelo));
    try{ vModelosOrig(); } finally { S.filas = todas; S.__todas = null; ultimo = S.filas; }
  };
  const vAlertasOrig = window.vAlertas;
  window.vAlertas = function(){
    const todas = S.filas; S.filas = todas.filter(f => !esSeg(f.modelo));
    try{ vAlertasOrig(); } finally { S.filas = todas; ultimo = S.filas; }
  };

  const CSS = `<style id="segCss">
    .ph.seg{background:linear-gradient(140deg,#2a2a2e,#0b0b0c)}
    .ph.seg::before{content:"";position:absolute;inset:0;background:url(logo.png) center/140% no-repeat;opacity:.06;transform:rotate(-12deg)}
    .ph.seg img{width:68%;height:auto;mix-blend-mode:normal;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5));position:relative}
    .card.segc{border-color:var(--acc)}
    .seg-aviso{grid-column:1/-1;color:var(--sub);text-align:center;padding:30px 10px;font-size:14px}
  </style>`;
  if(!document.getElementById('segCss')) document.head.insertAdjacentHTML('beforeend', CSS);

  // cuadro "Segundas" al inicio de la lista de modelos
  const pintarListaOrig = window.pintarLista;
  window.pintarLista = function(){
    pintarListaOrig();
    const lista = document.getElementById('lista');
    if(!lista || lista.querySelector('.tbus')) return;          // búsqueda por talla: se deja igual
    const q = slug(S.q);
    if(q && !'segundas'.includes(q) && !modelosSeg().some(m => slug(m.modelo).includes(q))) return;
    const ms = modelosSeg(), pares = ms.reduce((a,m) => a + m.pares, 0);
    const vacio = lista.querySelector('.empty'); if(vacio) vacio.remove();
    lista.insertAdjacentHTML('afterbegin', `
      <div class="card segc" id="cardSegundas">
        <div class="ph seg"><img src="logo.png" alt="HGR"><span class="badge">${fmt(pares)}</span></div>
        <div class="info"><div class="n">Segundas</div>
        <div class="s">${ms.length} ${ms.length===1?'modelo':'modelos'} · tallas 34 a 46</div></div>
      </div>`);
    document.getElementById('cardSegundas').onclick = () => { S.vista = 'segundas'; render(); scrollTo(0,0); };
  };

  // ---------- vista Segundas ----------
  let creando = false, intentoCrear = false;
  async function crearFaltantes(){
    const faltan = SEGUNDAS.filter(n => !todasLasFilas().some(f => f.modelo === n));
    if(!faltan.length || creando || intentoCrear) return;
    creando = true; intentoCrear = true;
    try{
      for(const n of faltan) await llamar('agregarModelo', n, COLOR, '');
      toast('Segundas creadas: tallas 34 a 46');
      ultimo = null; await cargar();
    }catch(e){ toast('No se pudieron crear las segundas: ' + (e.message||e)); }
    finally{ creando = false; if(S.vista === 'segundas') render(); }
  }

  function vSegundas(){
    header(`<button class="back" id="atras">‹ Modelos</button>` + cabecera('Segundas'));
    $('#atras').onclick = () => { S.vista = 'modelos'; render(); scrollTo(0,0); };
    if(!S.filas.length){ $('#app').innerHTML = '<div class="empty">Cargando…</div>'; return; }
    const ms = modelosSeg();
    const faltan = SEGUNDAS.some(n => !ms.some(m => m.modelo === n));
    $('#app').innerHTML = `<div class="cat">${ms.map(m => `
      <div class="card" data-m="${esc(m.modelo)}">
        <div class="ph">${img(foto(m.modelo), m.modelo)}<span class="badge ${m.pares===0?'low':''}">${fmt(m.pares)}</span></div>
        <div class="info"><div class="n">${esc(m.modelo)}</div><div class="s">Tallas 34 a 46 · cualquier color</div></div>
      </div>`).join('')}
      ${faltan ? `<div class="seg-aviso">${creando ? 'Creando las segundas…'
        : intentoCrear ? 'No se pudieron crear desde este perfil. Entra con Bodega o Administrador y abre Segundas para crearlas.' : 'Creando las segundas…'}</div>` : ''}
    </div>`;
    document.querySelectorAll('#app .card').forEach(el => el.onclick = () => {
      S.modelo = el.dataset.m; S.color = null; S.vista = 'detalle'; render(); scrollTo(0,0);
    });
    if(faltan) crearFaltantes();
  }

  // en el detalle de una segunda, "atrás" vuelve a Segundas
  const vDetalleOrig = window.vDetalle;
  window.vDetalle = function(){
    vDetalleOrig();
    if(!esSeg(S.modelo)) return;
    const a = document.getElementById('atras');
    if(a){ a.textContent = '‹ Segundas'; a.onclick = () => { S.vista = 'segundas'; render(); scrollTo(0,0); }; }
  };

  const pintarNavPrev = window.pintarNav;
  window.pintarNav = function(){
    pintarNavPrev();
    if(S.vista === 'segundas'){ const b = document.querySelector('#nav [data-v="modelos"]'); if(b) b.classList.add('on'); }
  };

  const renderPrev = window.render;
  window.render = function(){
    limpiar();
    if(S.vista === 'segundas'){
      if(S.sec !== 'bodega'){ S.vista = 'modelos'; return renderPrev(); }
      pintarNav(); return vSegundas();
    }
    return renderPrev();
  };

  if(PIN && S.sec === 'bodega' && S.filas.length){ try{ render(); }catch(e){} }
})();
