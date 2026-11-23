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
      pos: Number(x.minimo) || 0
    };
  }
  // saca las órdenes de la lista de materia prima para que no se vean como materiales
  function extraer(){
    if(!Array.isArray(S.mp) || S.mp === ultimoMp) return;
    const esta = x => x.categoria === CAT || esOT(x.material);
    if(S.mp.length){ S.ot = S.mp.filter(esta).map(parse); otListo = true; }
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

  async function guardar(promesas, ok){
    S.pend++; estado();
    try{ await Promise.all(promesas); if(ok) toast(ok); }
    catch(e){ toast('Error: ' + (e.message||e)); ultimoMp = null; S.pend--; estado(); return cargar(true); }
    S.pend--; estado();
  }
  // deja la cola de maquila numerada 1, 2, 3… según el orden dado
  function numerar(cola){
    const ps = [];
    cola.forEach((o,k) => { if(o.pos !== k+1){ o.pos = k+1; ps.push(llamar('mpFijarMinimo', o.id, k+1)); } });
    return ps;
  }

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
          <select class="ot-est">${ESTADOS.map(([t],i)=>`<option value="${i}" ${i===o.estado?'selected':''}>${t}</option>`).join('')}</select>
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
        o.estado = nuevo;
        const ps = [llamar('mpAjustar', o.id, nuevo, true, `OT ${o.num}: ${ESTADOS[antes][0]} → ${ESTADOS[nuevo][0]}`)];
        if(o.tipo==='maquila') ps.push(...numerar(colaMaquila()));
        vLista();
        guardar(ps, `Orden N° ${o.num}: ${ESTADOS[nuevo][0]}`);
      };
      card.querySelectorAll('.ot-mv').forEach(b => b.onclick = () => {
        const c = colaMaquila(), i = c.indexOf(o), j = i + Number(b.dataset.d);
        if(i < 0 || j < 0 || j >= c.length) return;
        [c[i], c[j]] = [c[j], c[i]];
        const ps = numerar(c);
        vLista();
        guardar(ps, `Orden N° ${o.num} ahora es la #${j+1} de maquila`);
      });
    });
  }

  // ---------- vista: nueva orden ----------
  function vNueva(){
    header(cabecera('Nueva orden de trabajo'));
    if(!otListo){ $('#app').innerHTML = '<div class="empty">Cargando…</div>'; return; }
    formPintado = true;
    const cola = colaMaquila();
    let tipo = 'maquila';
    $('#app').innerHTML = CSS + `<div class="ot-form">
      <div class="ot-tip"><button data-t="maquila" class="on">🏭 Maquila</button><button data-t="higher">👢 Higher</button></div>
      <div class="ot-2">
        <label><small>N° de orden</small><input id="otNum" inputmode="numeric" value="${proximoNum()}"></label>
        <label><small>Pares</small><input id="otPares" inputmode="numeric" placeholder="Ej: 50"></label>
      </div>
      <label><small id="otCliT">Cliente de la maquila</small><input id="otCli" placeholder="Ej: nombre del cliente"></label>
      <label><small>Descripción (modelo, colores, tallas…)</small><textarea id="otDesc" placeholder="Ej: Botín Urban rojo, tallas 36 a 42"></textarea></label>
      <div class="ot-2">
        <label><small>Fecha de entrega</small><input id="otFecha" type="date"></label>
        <label id="otPosL"><small>Prioridad en maquila</small><select id="otPos">
          ${cola.map((o,i)=>`<option value="${i+1}">#${i+1} (antes de la N° ${o.num})</option>`).join('')}
          <option value="${cola.length+1}" selected>#${cola.length+1} (al final de la cola)</option>
        </select></label>
      </div>
      <button class="btn" id="otCrear">Crear orden de trabajo</button>
    </div>`;
    document.querySelectorAll('.ot-tip button').forEach(b => b.onclick = () => {
      tipo = b.dataset.t;
      document.querySelectorAll('.ot-tip button').forEach(x => x.classList.toggle('on', x === b));
      $('#otPosL').style.visibility = tipo==='maquila' ? '' : 'hidden';
      $('#otCliT').textContent = tipo==='maquila' ? 'Cliente de la maquila' : 'Cliente (opcional)';
    });
    $('#otCrear').onclick = async () => {
      const num = parseInt($('#otNum').value, 10);
      const cli = limpio($('#otCli').value), desc = limpio($('#otDesc').value);
      const pares = parseInt($('#otPares').value, 10) || 0, fecha = $('#otFecha').value || '';
      if(!num || num < 1) return toast('Escribe un número de orden válido');
      if(S.ot.some(o => o.num === num)) return toast(`Ya existe la orden N° ${num}`);
      if(tipo==='maquila' && !cli) return toast('Escribe el cliente de la maquila');
      const b = $('#otCrear'); b.disabled = true; b.textContent = 'Guardando…';
      const pos = tipo==='maquila' ? Number($('#otPos').value) : 0;
      const nombre = `OT ${num} | ${tipo==='maquila'?'M':'H'} | ${cli} | ${desc} | ${pares} | ${fecha}`;
      S.pend++; estado();
      try{
        await llamar('mpAgregar', nombre, CAT, 'orden', 0, pos);
        if(tipo==='maquila'){
          // corre las que quedan después de la nueva
          const c = colaMaquila(); const ps = [];
          c.forEach((o,k) => { const nueva = k+1 >= pos ? k+2 : k+1; if(o.pos !== nueva){ o.pos = nueva; ps.push(llamar('mpFijarMinimo', o.id, nueva)); } });
          await Promise.all(ps);
        }
        toast(`Orden de trabajo N° ${num} creada`);
        S.pend--; estado(); S.vista = 'otLista'; formPintado = false; ultimoMp = null;
        await cargar();
      }catch(e){
        S.pend--; estado(); toast('Error: ' + (e.message||e));
        b.disabled = false; b.textContent = 'Crear orden de trabajo';
      }
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
