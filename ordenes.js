/* =====================================================================
   ÓRDENES DE TRABAJO  (cuadro "Órdenes de trabajo" del inicio)
   Entra con el PIN de Jefes (2026) o el del Administrador.
   - Cada orden tiene número, tipo (Maquila / Higher), cliente,
     descripción, pares, fecha de entrega y estado.
   - Las órdenes de MAQUILA van primero y en una cola con prioridad
     (1, 2, 3…) que se puede reordenar con ↑ ↓.
   Se guardan en la misma hoja de Google como materiales ocultos de la
   categoría "Ordenes de trabajo":
     material = "OT 123 | M | Cliente | Descripción | 50 | 2026-12-05"
     cantidad = estado (0 = Pendiente … 7 = Anulada)
     mínimo   = posición en la cola de maquila
   ===================================================================== */
(function(){
  const CAT = 'Ordenes de trabajo';
  const ESTADOS = [
    ['Pendiente',          '#8E8E93'],
    ['En corte',           '#1E5BD8'],
    ['En guarnición',      '#7B3FB8'],
    ['En montaje',         '#F07A1A'],
    ['En terminado',       '#F5B300'],
    ['Lista para entregar','#22C55E'],
    ['Entregada',          '#2E8B57'],
    ['Anulada',            '#555555']
  ];
  const CERRADA = 6; // desde "Entregada" en adelante ya no está activa
  const esOT = n => /^OT\s*\d+\s*\|/.test(String(n||''));
  const limpio = s => String(s||'').replace(/\|/g,'/').replace(/\s+/g,' ').trim();

  S.ot = []; let ultimoMp = null, otListo = false, formPintado = false;

  function parse(x){
    const p = String(x.material).split('|').map(s=>s.trim());
    return {
      id: x.id,
      num: parseInt(String(p[0]).replace(/\D/g,''),10) || 0,
      tipo: p[1] === 'M' ? 'maquila' : 'higher',
      cliente: p[2] || '',
      desc: p[3] || '',
      pares: Number(p[4]) || 0,
      entrega: /^\d{4}-\d{2}-\d{2}$/.test(p[5]||'') ? p[5] : '',
      estado: Math.max(0, Math.min(ESTADOS.length-1, Math.round(Number(x.cantidad)||0))),
      pos: Number(x.minimo) || 0,
      faltan: (p.find(v => /^F:/.test(v)) || 'F:').slice(2).split(',').filter(Boolean).map(t => { const [id,q] = t.split('*'); return { id, q: Number(q)||0 }; }).filter(c => c.id && c.q),
      consumo: /^C:/.test(p[6]||'') ? p[6].slice(2).split(',').map(t => { const [id,q] = t.split('*'); return { id, q: Number(q)||0 }; }).filter(c => c.id && c.q) : []
    };
  }
  // saca las órdenes de la lista de materia prima para que no se vean como materiales
  function extraer(){
    if(!Array.isArray(S.mp) || S.mp === ultimoMp) return;
    const esta = x => x.categoria === CAT || esOT(x.material);
    // solo reemplaza la lista cuando llegan datos frescos con órdenes (otras partes de la app filtran S.mp y dejan un arreglo sin ellas)
    const ots = S.mp.filter(esta);
    if(ots.length){ S.ot = ots.map(parse); otListo = true; }
    else if(S.mp.length && !otListo){ S.ot = []; otListo = true; }
    S.mp = S.mp.filter(x => !esta(x));
    ultimoMp = S.mp;
  }

  // los cambios de estado no deben salir en "Movimientos" de materia prima
  const llamarOrig = window.llamar;
  window.llamar = async function(accion, ...args){
    const r = await llamarOrig(accion, ...args);
    if(accion === 'mpMovimientos' && Array.isArray(r)) return r.filter(m => !esOT(m.material));
    return r;
  };

  // ---------- navegación ----------
  const pintarNavPrev = window.pintarNav;
  window.pintarNav = function(){
    if(S.sec !== 'ot') return pintarNavPrev();
    const items = [['otLista','🛠️','Órdenes'],['otMovs','🕑','Historial'],['otNueva','＋','Nueva orden']];
    $('#nav').innerHTML = items.map(([v,i,t])=>`<button data-v="${v}" class="${S.vista===v?'on':''}"><i>${i}</i>${t}</button>`).join('');
    document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{ S.vista=b.dataset.v; formPintado=false; render(); scrollTo(0,0); });
  };

  const renderPrev = window.render;
  window.render = function(){
    extraer();
    if(S.sec !== 'ot'){ formPintado = false; return renderPrev(); }
    if(!['otLista','otMovs','otNueva'].includes(S.vista)) S.vista = 'otLista';
    pintarNav();
    if(S.vista === 'otNueva'){ if(!formPintado) vNueva(); return; }
    formPintado = false;
    if(S.vista === 'otMovs') return vMovs();
    return vLista();
  };

  // ---------- utilidades ----------
  const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  function infoEntrega(o){
    if(!o.entrega) return { txt:'Sin fecha de entrega', cls:'' };
    const [y,m,d] = o.entrega.split('-').map(Number);
    const f = new Date(y, m-1, d), h = new Date(); h.setHours(0,0,0,0);
    const dias = Math.round((f - h) / 864e5);
    const fecha = `${d} ${MESES[m-1]}`;
    if(o.estado >= CERRADA) return { txt:`Entrega ${fecha}`, cls:'' };
    if(dias < 0)  return { txt:`Entrega ${fecha} · atrasada ${-dias} día${dias===-1?'':'s'}`, cls:'tarde' };
    if(dias === 0) return { txt:`Entrega HOY (${fecha})`, cls:'hoy' };
    if(dias <= 3) return { txt:`Entrega ${fecha} · faltan ${dias} día${dias===1?'':'s'}`, cls:'hoy' };
    return { txt:`Entrega ${fecha} · faltan ${dias} días`, cls:'' };
  }
  const activas = () => S.ot.filter(o => o.estado < CERRADA);
  const porFecha = (a,b) => (a.entrega||'9999').localeCompare(b.entrega||'9999') || a.num - b.num;
  const colaMaquila = () => activas().filter(o => o.tipo==='maquila').sort((a,b) => (a.pos||9999) - (b.pos||9999) || porFecha(a,b));
  const higherActivas = () => activas().filter(o => o.tipo!=='maquila').sort(porFecha);
  const cerradas = () => S.ot.filter(o => o.estado >= CERRADA).sort((a,b) => b.num - a.num);
  const proximoNum = () => S.ot.reduce((m,o) => Math.max(m, o.num), 0) + 1;

  // guarda en el servidor en UNA sola llamada; la pantalla ya se actualizó antes (instantáneo)
  async function enviar(op, ok, alFallar){
    if(ok) toast(ok);
    S.pend++; estado();
    try{
      const r = await llamar('mpOrden', op);
      Object.entries((r && r.cantidades) || {}).forEach(([id, c]) => { const x = (S.mp||[]).find(y => y.id === id); if(x) x.cantidad = c; });
      S.pend--; estado();
      return r;
    }catch(e){
      S.pend--; estado();
      alert('No se guardó en el servidor: ' + (e.message||e) + (alFallar ? '\n\n' + alFallar : ''));
      ultimoMp = null; cargar(true);
      throw e;
    }
  }
  // deja la cola de maquila numerada 1, 2, 3… según el orden dado (devuelve los cambios para el servidor)
  function numerar(cola){
    const ms = [];
    cola.forEach((o,k) => { if(o.pos !== k+1){ o.pos = k+1; if(!o.tmp) ms.push({ id:o.id, minimo:k+1 }); } });
    return ms;
  }
  const moverLocal = (ajustes) => ajustes.forEach(a => { const x = (S.mp||[]).find(y => y.id === a.id); if(x) x.cantidad = Math.round((x.cantidad + a.delta)*1000)/1000; });

  // ---------- vista: lista ----------
  const CSS = `<style>
    .ot-sec{display:flex;align-items:center;gap:8px;margin:20px 2px 10px;font-size:17px;font-weight:700}
    .ot-sec small{background:var(--card2);color:var(--sub);font-size:12px;padding:2px 9px;border-radius:999px;font-weight:600}
    .ot-sec .ot-ayuda{font-size:12px;color:var(--sub);font-weight:400}
    .ot-list{display:flex;flex-direction:column;gap:10px}
    .ot-card{display:flex;gap:12px;background:var(--card);border:1px solid var(--line);border-left:5px solid var(--ec);border-radius:14px;padding:12px}
    .ot-card.maq{border-color:var(--acc);border-left-color:var(--ec)}
    .ot-pos{flex:none;width:38px;height:38px;border-radius:12px;background:var(--acc);color:#111;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center}
    .ot-pos.h{background:var(--card2);color:var(--sub);font-size:14px}
    .ot-b{flex:1;min-width:0}
    .ot-t{font-weight:700;font-size:15px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .ot-tipo{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;background:rgba(245,179,0,.15);color:var(--acc);text-transform:uppercase;letter-spacing:.04em}
    .ot-tipo.h{background:var(--card2);color:var(--sub)}
    .ot-s{color:var(--sub);font-size:12.5px;margin:3px 0}
    .ot-s .tarde{color:#ff8a80;font-weight:700}.ot-s .hoy{color:var(--acc);font-weight:700}
    .ot-d{font-size:13px;margin:2px 0 8px;white-space:pre-wrap}
    .ot-acc{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .ot-est{background:var(--card2);color:var(--txt);border:1px solid var(--ec);border-radius:10px;padding:8px 10px;font-size:14px;font-weight:600;min-width:180px}
    .ot-mv{width:40px;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--card2);color:var(--txt);font-size:18px;cursor:pointer}
    .ot-mv:disabled{opacity:.3;cursor:default}
    .ot-badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;color:#fff;background:var(--ec)}
    .ot-cerr summary{cursor:pointer;color:var(--sub);margin:22px 2px 10px;font-weight:600}
    .ot-form{display:flex;flex-direction:column;gap:10px;max-width:560px}
    .ot-form label small{display:block;color:var(--sub);font-size:12px;margin:0 0 4px 2px}
    .ot-form textarea{width:100%;background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:12px;padding:11px 12px;font-size:16px;outline:none;min-height:80px;font-family:inherit;box-sizing:border-box}
    .ot-form select{width:100%;background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:12px;padding:11px 12px;font-size:16px}
    .ot-tip{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .ot-tip button{border:1px solid var(--line);background:var(--card2);color:var(--txt);border-radius:12px;padding:12px;font-weight:700;font-size:14px;cursor:pointer}
    .ot-tip button.on{background:var(--acc);color:#111;border-color:var(--acc)}
    .ot-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .ot-tallas{display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:6px}
    .ot-tallas input{text-align:center;padding:9px 4px}
    .ot-mat-t{font-weight:700;margin:8px 2px 4px}
    .ot-mat-t .ot-ayuda{font-size:12px;color:var(--sub);font-weight:400}
    .ot-cols{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .ot-mlist{display:flex;flex-direction:column;gap:6px}
    .ot-ml{display:grid;grid-template-columns:1fr auto;gap:2px 10px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:9px 12px;font-size:14px}
    .ot-ml b{text-align:right}.ot-ml small{grid-column:1/-1;color:var(--sub);font-size:12px}
    .ot-ml.mal{border-color:#ff8a80}.ot-ml.mal small{color:#ff8a80;font-weight:700}
  </style>`;

  function tarjeta(o, pos, total){
    const [nom, col] = ESTADOS[o.estado], e = infoEntrega(o), maq = o.tipo==='maquila';
    return `<div class="ot-card ${maq && o.estado<CERRADA?'maq':''}" style="--ec:${col}" data-id="${esc(o.id)}">
      ${pos ? `<div class="ot-pos">${pos}</div>` : `<div class="ot-pos h">${maq?'M':'H'}</div>`}
      <div class="ot-b">
        <div class="ot-t">Orden de trabajo N° ${o.num} <span class="ot-tipo ${maq?'':'h'}">${maq?'Maquila':'Higher'}</span>
          ${o.estado>=CERRADA?`<span class="ot-badge">${nom}</span>`:''}</div>
        <div class="ot-s">${o.cliente?esc(o.cliente)+' · ':''}${o.pares?fmt(o.pares)+' pares · ':''}<span class="${e.cls}">${e.txt}</span></div>
        ${o.desc?`<div class="ot-d">${esc(o.desc)}</div>`:''}
        <div class="ot-acc">
          <select class="ot-est" ${o.tmp?'disabled title="Guardando…"':''}>${ESTADOS.map(([t],i)=>`<option value="${i}" ${i===o.estado?'selected':''}>${t}</option>`).join('')}</select>
          ${pos?`<button class="ot-mv" data-d="-1" ${pos===1?'disabled':''} title="Subir prioridad">↑</button><button class="ot-mv" data-d="1" ${pos===total?'disabled':''} title="Bajar prioridad">↓</button>`:''}
        </div>
      </div></div>`;
  }

  function vLista(){
    header(cabecera('Órdenes de trabajo'));
    if(!otListo){ $('#app').innerHTML = '<div class="empty">Cargando…</div>'; return; }
    const cola = colaMaquila(), hig = higherActivas(), cer = cerradas();
    const atrasadas = activas().filter(o => infoEntrega(o).cls === 'tarde').length;
    $('#app').innerHTML = CSS + `
      <div class="stats">
        <div class="stat"><b>${activas().length}</b><span>órdenes activas</span></div>
        <div class="stat"><b>${cola.length}</b><span>de maquila en cola</span></div>
        <div class="stat"><b class="${atrasadas?'warn':''}">${atrasadas}</b><span>atrasadas</span></div>
      </div>
      <div class="ot-sec">🏭 Maquila · prioridad <small>${cola.length}</small></div>
      ${cola.length ? `<div class="ot-list">${cola.map((o,i)=>tarjeta(o, i+1, cola.length)).join('')}</div>`
        : '<div class="empty" style="padding:18px 0">No hay órdenes de maquila activas</div>'}
      <div class="ot-sec">👢 Órdenes Higher <small>${hig.length}</small> <span class="ot-ayuda">por fecha de entrega</span></div>
      ${hig.length ? `<div class="ot-list">${hig.map(o=>tarjeta(o)).join('')}</div>`
        : '<div class="empty" style="padding:18px 0">No hay órdenes Higher activas</div>'}
      ${cer.length ? `<details class="ot-cerr"><summary>✅ Entregadas y anuladas (${cer.length})</summary>
        <div class="ot-list">${cer.slice(0,40).map(o=>tarjeta(o)).join('')}</div></details>` : ''}
      ${!S.ot.length ? '<div class="empty">Aún no hay órdenes de trabajo.<br>Toca <b>＋ Nueva orden</b> abajo para crear la primera.</div>' : ''}
    `;
    document.querySelectorAll('.ot-card').forEach(card => {
      const o = S.ot.find(x => x.id === card.dataset.id); if(!o) return;
      const sel = card.querySelector('.ot-est');
      if(sel) sel.onchange = () => {
        const nuevo = Number(sel.value), antes = o.estado; if(nuevo === antes) return;
        const ANUL = ESTADOS.length - 1;
        let ajustes = [], extra = '';
        if(o.consumo.length && (nuevo === ANUL) !== (antes === ANUL)){
          const devolver = nuevo === ANUL;
          if(!confirm(devolver ? `¿Anular la orden N° ${o.num}? La materia prima que se descontó vuelve a bodega.` : `¿Reactivar la orden N° ${o.num}? Se vuelve a descontar su materia prima.`)){ sel.value = antes; return; }
          ajustes = o.consumo.map(c => ({ id:c.id, delta: devolver ? c.q : -c.q }));
          extra = devolver ? ' · materia prima devuelta' : ' · materia prima descontada';
        }
        o.estado = nuevo;
        const minimos = o.tipo==='maquila' ? numerar(colaMaquila()) : [];
        moverLocal(ajustes);
        vLista();
        enviar({ nota:`OT ${o.num}: ${ESTADOS[antes][0]} → ${ESTADOS[nuevo][0]}`, fijar:[{ id:o.id, cantidad:nuevo }], minimos, ajustes },
          `Orden N° ${o.num}: ${ESTADOS[nuevo][0]}${extra}`).catch(()=>{});
      };
      card.querySelectorAll('.ot-mv').forEach(b => b.onclick = () => {
        const c = colaMaquila(), i = c.indexOf(o), j = i + Number(b.dataset.d);
        if(i < 0 || j < 0 || j >= c.length) return;
        [c[i], c[j]] = [c[j], c[i]];
        const minimos = numerar(c);
        vLista();
        enviar({ nota:`OT ${o.num}: prioridad #${j+1}`, minimos }, `Orden N° ${o.num} ahora es la #${j+1} de maquila`).catch(()=>{});
      });
    });
  }


  /* ---------- RECETAS: lo que lleva cada modelo ----------
     Banana, HGR, insignia, canillera, cauchos…: 2 unidades por par.
     Caucho garra: 1 derecho + 1 izquierdo por par.
     Suelas y Slider Race: 1 par por par.
     Pequeña = tallas 34 a 39 · Grande = tallas 40 a 46.            */
  const grande = t => t >= 40;
  const PIEZAS = {
    banana:     { n:'Banana',                      cat:t=>grande(t)?'Banana grande':'Banana pequeña', color:true, q:2 },
    hgr:        { n:'HGR redonda',                 cat:t=>grande(t)?'HGR redonda grande':'HGR redonda pequeña', color:true, q:2 },
    insignia:   { n:'Insignia de aventura',        cat:t=>grande(t)?'Insignia de aventura grande':'Insignia de aventura pequeña', color:true, q:2 },
    correa:     { n:'Caucho correa superficial',   cat:()=>'Caucho correa superficial', color:true, q:2 },
    punta:      { n:'Caucho punta correa Touring', cat:()=>'Caucho punta correa Touring', color:true, q:2 },
    canillera:  { n:'Canillera',                   cat:()=>'Canillera', mat:t=>grande(t)?/grande/i:/peque/i, q:2 },
    pantorrilla:{ n:'Caucho pantorrilla Touring',  cat:()=>'Caucho pantorrilla Touring', mat:t=>grande(t)?/grande/i:/peque/i, q:2 },
    talon:      { n:'Caucho talón Urban y Touring',cat:()=>'Caucho talón Urban y Touring', mat:t=>grande(t)?/grande/i:/peque/i, q:2 },
    adventure:  { n:'Caucho Adventure',            cat:()=>'Caucho Adventure', q:2 },
    garraPG:    { n:'Caucho garra',                cat:t=>grande(t)?'Caucho garra grande':'Caucho garra pequeña', lados:true },
    garra:      { n:'Caucho garra estándar',       cat:()=>'Caucho garra', lados:true },
    slider:     { n:'Slider Race',                 cat:()=>'Slider Race', q:1 }
  };
  const RANGO_TOURING = t => t<=36?'35-36':t<=38?'37-38':t<=40?'39-40':t<=42?'41-42':t<=44?'43-44':'45-46';
  const SUELAS = {
    'Touring':      t => ['Suela para modelos Touring', `Suela para modelos Touring talla ${RANGO_TOURING(t)}`],
    'Trump':        t => ['Suela Trump',  `Suela Trump talla ${t===40?39:t}`],
    'Militar':      t => ['Suela militar',`Suela militar talla ${t===40?39:t}`],
    '2289':         t => ['Suela 2289',   `Suela 2289 talla ${t}`],
    'Sprint Brazil':t => ['Suela Sprint Brazil', `Suela Sprint Brazil talla ${t}`]
  };
  const TOURING = ['banana','canillera','adventure','correa','garraPG','pantorrilla','punta','talon','hgr','insignia'];
  const URBAN   = ['banana','garra','punta','insignia'];
  const FUERZA = ['Trump','Militar'];
  const RECETAS = {
    'Bota Touring Race':      { suelas:['Touring'], piezas:TOURING },
    'Bota Race':              { suelas:['Touring'], piezas:[...TOURING, 'slider'] },
    'Bota Race White':        { suelas:['Touring'], piezas:TOURING },
    'Bota Touring Force':     { suelas:FUERZA,      piezas:TOURING },
    'Botín Urban':            { suelas:['Touring'], piezas:URBAN },
    'Botín Urban Go':         { suelas:['Touring'], piezas:URBAN },
    'Botín Urban Force':      { suelas:FUERZA,      piezas:URBAN },
    'Bota Fusión':            { suelas:['2289','Sprint Brazil'], piezas:['correa','garra'] },
    'Bota Fusión Force':      { suelas:FUERZA,      piezas:['correa','garra'] },
    'Botín Force':            { suelas:['2289','Sprint Brazil'], piezas:[] },
    'Botín Force Industrial': { suelas:FUERZA,      piezas:[] }
  };
  const TALLAS = [34,35,36,37,38,39,40,41,42,43,44,45,46];

  const norm = s => slug(s).replace(/-/g,' ');
  const enCat = c => S.mp.filter(x => norm(x.categoria) === norm(c));
  const buscar = (c, nombre) => S.mp.find(x => norm(x.material) === norm(nombre) && (!c || norm(x.categoria) === norm(c))) || S.mp.find(x => norm(x.material) === norm(nombre));
  // "color" de un material = lo que sigue al nombre común del grupo (ej. "roja", "en blanco y rojo")
  function etiqueta(x){
    const hermanos = enCat(x.categoria).map(y => y.material);
    if(hermanos.length < 2) return x.material;
    let p = hermanos.reduce((a,b) => { let i=0; while(i<a.length && i<b.length && a[i].toLowerCase()===b[i].toLowerCase()) i++; return a.slice(0,i); });
    p = p.slice(0, p.lastIndexOf(' ')+1);
    return x.material.slice(p.length).trim() || x.material;
  }
  const raiz = s => norm(s).split(' ').map(w => w.replace(/[aoe]$/,'')).join(' ');
  function sugerir(opciones, colorBota, modelo, clave){
    const c = raiz(colorBota);
    if(/white/i.test(modelo) && clave==='insignia'){
      const w = opciones.find(o => raiz(o) === raiz('en blanco y '+colorBota)) || opciones.find(o => raiz(o) === raiz('en blanco '+colorBota)) || opciones.find(o => norm(o) === 'en blanco');
      if(w) return w;
    }
    return opciones.find(o => raiz(o) === c)
      || (/celest/.test(c) && opciones.find(o => raiz(o) === 'azul clar'))
      || opciones.find(o => raiz(o) === c.split(' ')[0])
      || opciones.find(o => raiz(o) === 'en '+c)
      || opciones.find(o => raiz(o) === raiz('en blanco y '+colorBota))
      || '';
  }

  // nombre completo para mostrar (ej. "Caucho garra grande · Derecho")
  const nombreMat = x => norm(x.material).includes(norm(x.categoria)) || /^(suela|caucho|banana|hgr|insignia|canillera|slider)/i.test(x.material) ? x.material : `${x.categoria} · ${x.material}`;
  // calcula la lista de materiales a sacar
  function calcular(modelo, suela, tallas, colores){
    const r = RECETAS[modelo]; if(!r) return [];
    const lineas = new Map();
    const sumar = (clave, nombre, x, q, extra) => {
      const k = x ? x.id : 'falta:'+clave+':'+nombre;
      const l = lineas.get(k) || { clave, nombre, x, q:0, ...extra };
      l.q += q; lineas.set(k, l);
    };
    Object.entries(tallas).forEach(([ts, pares]) => {
      const t = Number(ts); if(!pares) return;
      const [cs, ns] = SUELAS[suela](t);
      sumar('suela', ns, buscar(cs, ns), pares);
      r.piezas.forEach(k => {
        const p = PIEZAS[k], cat = p.cat(t), xs = enCat(cat);
        if(p.lados){
          ['derecho','izquierdo'].forEach(l => { const x = xs.find(y => new RegExp(l,'i').test(y.material)); sumar(k, `${cat} ${l}`, x, pares); });
        } else if(p.color){
          const col = colores[k] || '';
          const x = col ? xs.find(y => norm(etiqueta(y)) === norm(col)) : null;
          sumar(k, col ? `${cat} ${col}` : `${cat} (elige color)`, x, pares * p.q, { sinColor: !col });
        } else {
          const x = p.mat ? xs.find(y => p.mat(t).test(y.material)) : xs[0];
          sumar(k, x ? x.material : cat, x, pares * p.q);
        }
      });
    });
    return [...lineas.values()];
  }
  // colores disponibles para una pieza (une grande y pequeña)
  function opcionesColor(k){
    const p = PIEZAS[k], s = new Set();
    [34,46].forEach(t => enCat(p.cat(t)).forEach(x => s.add(etiqueta(x))));
    return [...s].sort((a,b) => a.localeCompare(b,'es'));
  }
  let coloresBota = null;
  async function cargarColores(){
    if(coloresBota) return coloresBota;
    try{
      const r = await llamarOrig('obtenerInventario'); const g = {};
      (r.filas||[]).forEach(f => { (g[f.modelo] = g[f.modelo] || new Set()).add(f.color); });
      coloresBota = Object.fromEntries(Object.entries(g).map(([m,s]) => [m, [...s]]));
    }catch(e){ coloresBota = {}; }
    return coloresBota;
  }

  // ---------- vista: nueva orden ----------
  function vNueva(){
    header(cabecera('Nueva orden de trabajo'));
    if(!otListo){ $('#app').innerHTML = '<div class="empty">Cargando…</div>'; return; }
    formPintado = true;
    const cola = colaMaquila();
    let tipo = 'maquila';
    const R = { modelo:'', color:'', suela:'', tallas:{}, colores:{} };
    $('#app').innerHTML = CSS + `<div class="ot-form">
      <div class="ot-tip"><button data-t="maquila" class="on">🏭 Maquila</button><button data-t="higher">👢 Higher</button></div>
      <label><small>Modelo (para sacar la materia prima)</small><select id="otMod">
        <option value="">— Sin modelo (orden libre, no descuenta) —</option>
        ${Object.keys(RECETAS).map(m=>`<option>${esc(m)}</option>`).join('')}
      </select></label>
      <div id="otRec"></div>
      <div class="ot-2">
        <label><small>N° de orden</small><input id="otNum" inputmode="numeric" value="${proximoNum()}"></label>
        <label><small>Pares</small><input id="otPares" inputmode="numeric" placeholder="Ej: 50"></label>
      </div>
      <label><small id="otCliT">Cliente de la maquila</small><input id="otCli" placeholder="Ej: nombre del cliente"></label>
      <label><small id="otDescT">Descripción (modelo, colores, tallas…)</small><textarea id="otDesc" placeholder="Ej: Botín Urban rojo, tallas 36 a 42"></textarea></label>
      <div class="ot-2">
        <label><small>Fecha de entrega</small><input id="otFecha" type="date"></label>
        <label id="otPosL"><small>Prioridad en maquila</small><select id="otPos">
          ${cola.map((o,i)=>`<option value="${i+1}">#${i+1} (antes de la N° ${o.num})</option>`).join('')}
          <option value="${cola.length+1}" selected>#${cola.length+1} (al final de la cola)</option>
        </select></label>
      </div>
      <div id="otMat"></div>
      <button class="btn" id="otCrear">Crear orden de trabajo</button>
    </div>`;
    document.querySelectorAll('.ot-tip button').forEach(b => b.onclick = () => {
      tipo = b.dataset.t;
      document.querySelectorAll('.ot-tip button').forEach(x => x.classList.toggle('on', x === b));
      $('#otPosL').style.visibility = tipo==='maquila' ? '' : 'hidden';
      $('#otCliT').textContent = tipo==='maquila' ? 'Cliente de la maquila' : 'Cliente (opcional)';
    });

    const totalPares = () => Object.values(R.tallas).reduce((a,b)=>a+b,0);
    const resumenTallas = () => Object.entries(R.tallas).filter(([,p])=>p).map(([t,p])=>`T${t}×${p}`).join(', ');

    async function pintarRec(){
      const box = $('#otRec');
      if(!R.modelo){ box.innerHTML=''; $('#otMat').innerHTML=''; $('#otPares').readOnly=false; $('#otDescT').textContent='Descripción (modelo, colores, tallas…)'; return; }
      const rec = RECETAS[R.modelo];
      box.innerHTML = '<div class="empty" style="padding:8px 0">Cargando colores…</div>';
      const cols = (await cargarColores())[R.modelo] || [];
      if(!R.suela || !rec.suelas.includes(R.suela)) R.suela = rec.suelas[0];
      box.innerHTML = `
        <div class="ot-2">
          <label><small>Color de la bota</small><select id="otCol">
            <option value="">— Elige —</option>${cols.map(c=>`<option ${c===R.color?'selected':''}>${esc(c)}</option>`).join('')}
          </select></label>
          <label><small>Suela</small><select id="otSue" ${rec.suelas.length<2?'disabled':''}>${rec.suelas.map(s=>`<option ${s===R.suela?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
        </div>
        <label><small>Pares por talla</small></label>
        <div class="ot-tallas">${TALLAS.map(t=>`<label><small>T${t}</small><input data-t="${t}" inputmode="numeric" value="${R.tallas[t]||''}" placeholder="0"></label>`).join('')}</div>`;
      $('#otPares').readOnly = true;
      $('#otDescT').textContent = 'Notas adicionales (opcional)';
      $('#otCol').onchange = e => { R.color = e.target.value; R.colores = {}; pintarMat(); };
      $('#otSue').onchange = e => { R.suela = e.target.value; pintarMat(); };
      box.querySelectorAll('.ot-tallas input').forEach(i => i.oninput = () => {
        const v = parseInt(i.value,10); R.tallas[i.dataset.t] = v>0 ? v : 0; pintarMat();
      });
      pintarMat();
    }

    function pintarMat(){
      const box = $('#otMat'); if(!R.modelo){ box.innerHTML=''; return; }
      $('#otPares').value = totalPares() || '';
      const rec = RECETAS[R.modelo];
      const conColor = rec.piezas.filter(k => PIEZAS[k].color);
      conColor.forEach(k => { if(R.colores[k] === undefined) R.colores[k] = sugerir(opcionesColor(k), R.color, R.modelo, k); });
      if(!totalPares()){ box.innerHTML = '<div class="ot-mat-t">Escribe los pares por talla para ver qué hay que sacar de bodega.</div>'; return; }
      const lineas = calcular(R.modelo, R.suela, R.tallas, R.colores);
      const fila = l => {
        const hay = l.x ? l.x.cantidad : null, falta = !l.x, poco = l.x && l.x.cantidad < l.q;
        return `<div class="ot-ml ${falta||poco?'mal':''}"><span>${esc(l.x ? nombreMat(l.x) : l.nombre)}</span>
          <b>${fmt(l.q)} ${esc(l.x ? l.x.unidad : '')}</b>
          <small>${falta ? (l.sinColor ? 'Elige el color arriba' : 'No existe en materia prima') : `hay ${fmt(hay)}${poco?' · NO alcanza':''}`}</small></div>`;
      };
      box.innerHTML = `<div class="ot-mat-t">📋 Materia prima para esta orden <span class="ot-ayuda">se descuenta al crear la orden</span></div>
        ${conColor.length ? `<div class="ot-cols">${conColor.map(k=>{ const ops = opcionesColor(k);
          return `<label><small>${esc(PIEZAS[k].n)}</small><select data-k="${k}"><option value="">— Elige color —</option>${ops.map(o=>`<option ${norm(o)===norm(R.colores[k])?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`; }).join('')}</div>` : ''}
        <div class="ot-mlist">${lineas.map(fila).join('')}</div>`;
      box.querySelectorAll('.ot-cols select').forEach(s => s.onchange = () => { R.colores[s.dataset.k] = s.value; pintarMat(); });
      box._lineas = lineas;
    }
    $('#otMod').onchange = e => { R.modelo = e.target.value; R.color=''; R.colores={}; R.tallas={}; pintarRec(); };

    $('#otCrear').onclick = async () => {
      const num = parseInt($('#otNum').value, 10);
      const cli = limpio($('#otCli').value);
      let desc = limpio($('#otDesc').value);
      let pares = parseInt($('#otPares').value, 10) || 0;
      const fecha = $('#otFecha').value || '';
      if(!num || num < 1) return toast('Escribe un número de orden válido');
      if(S.ot.some(o => o.num === num)) return toast(`Ya existe la orden N° ${num}`);
      if(tipo==='maquila' && !cli) return toast('Escribe el cliente de la maquila');
      let lineas = [];
      if(R.modelo){
        if(!R.color) return toast('Elige el color de la bota');
        if(!totalPares()) return toast('Escribe los pares por talla');
        lineas = calcular(R.modelo, R.suela, R.tallas, R.colores);
        if(lineas.some(l => l.sinColor)) return toast('Falta elegir el color de alguna marquilla');
        const faltan = lineas.filter(l => !l.x), poco = lineas.filter(l => l.x && l.x.cantidad < l.q);
        if(faltan.length || poco.length){
          const msg = [...faltan.map(l=>`• ${l.nombre}: no existe en materia prima`), ...poco.map(l=>`• ${nombreMat(l.x)}: necesitas ${fmt(l.q)}, hay ${fmt(l.x.cantidad)}`)].join('\n');
          if(!confirm(`Ojo, falta materia prima:\n\n${msg}\n\n¿Crear la orden igual? Lo que falta queda en negativo y pasa solo a Materia prima → Pedido → Pedido materia prima urgentes.`)) return;
        }
        pares = totalPares();
        desc = limpio(`${R.modelo} ${R.color} · suela ${R.suela} · ${resumenTallas()}${desc ? ' · '+desc : ''}`);
      }
      const pos = tipo==='maquila' ? Number($('#otPos').value) : 0;
      // materia prima: se descuenta todo (si no alcanza queda en negativo y pasa al Pedido urgente)
      const ajustes = lineas.filter(l => l.x).map(l => ({ id:l.x.id, delta:-l.q }));
      const faltaron = lineas.filter(l => l.x && l.q > Math.max(0, l.x.cantidad)).map(l => `${l.x.id}*${l.q - Math.max(0, l.x.cantidad)}`);
      const consumo = ajustes.length ? ' | C:' + ajustes.map(a => `${a.id}*${-a.delta}`).join(',') : '';
      const faltanTxt = faltaron.length ? ' | F:' + faltaron.join(',') : '';
      const nombre = `OT ${num} | ${tipo==='maquila'?'M':'H'} | ${cli} | ${desc} | ${pares} | ${fecha}${consumo}${faltanTxt}`;
      // corre las de maquila que quedan después de la nueva
      const minimos = [];
      if(tipo==='maquila') colaMaquila().forEach((o,k) => { const nueva = k+1 >= pos ? k+2 : k+1; if(o.pos !== nueva){ o.pos = nueva; if(!o.tmp) minimos.push({ id:o.id, minimo:nueva }); } });
      // pantalla al instante
      const local = parse({ id:'tmp-'+num, material:nombre, cantidad:0, minimo:pos }); local.tmp = true;
      S.ot.push(local);
      moverLocal(ajustes);
      S.vista = 'otLista'; formPintado = false; render(); scrollTo(0,0);
      // servidor en segundo plano, una sola llamada
      enviar({ nota:`OT ${num} · ${R.modelo ? R.modelo+' '+R.color : 'creada'}`, crear:{ material:nombre, categoria:CAT, unidad:'orden', cantidad:0, minimo:pos }, ajustes, minimos },
        ajustes.length ? `Orden N° ${num} creada y materia prima descontada` : `Orden de trabajo N° ${num} creada`,
        `La orden N° ${num} no quedó guardada. Vuelve a crearla.`)
        .then(r => { if(r && r.id){ local.id = r.id; } local.tmp = false; if(S.sec==='ot' && S.vista==='otLista') vLista(); })
        .catch(() => { S.ot = S.ot.filter(o => o !== local); if(S.sec==='ot' && S.vista==='otLista') vLista(); });
    };
  }

  // ---------- vista: historial ----------
  async function vMovs(){
    header(cabecera('Historial de órdenes'));
    $('#app').innerHTML = '<div class="empty">Cargando…</div>';
    try{
      const ms = (await llamarOrig('mpMovimientos', 300)).filter(m => esOT(m.material));
      if(S.vista !== 'otMovs' || S.sec !== 'ot') return;
      $('#app').innerHTML = ms.length ? ms.map(m => {
        const n = String(m.material).match(/^OT\s*(\d+)/);
        return `<div class="item mov" style="cursor:default"><div style="flex:1">
          <div class="n">Orden de trabajo N° ${n?n[1]:''}</div>
          <div class="s">${esc(m.fecha)} · ${esc(m.nota || ESTADOS[Math.round(m.despues)||0]?.[0] || '')}${m.rol?' · '+esc(NOMBRE_ROL[m.rol]||m.rol):''}</div></div></div>`;
      }).join('') : '<div class="empty">Aún no hay cambios de estado</div>';
    }catch(e){ $('#app').innerHTML = '<div class="empty">No se pudo cargar el historial</div>'; }
  }

  // si la app ya pintó antes de cargar este archivo, repintar
  if(PIN && S.sec === 'ot'){ try{ pintarNav(); }catch(e){} }
  else if(PIN && Array.isArray(S.mp) && S.mp.length){ try{ render(); }catch(e){} }
})();
