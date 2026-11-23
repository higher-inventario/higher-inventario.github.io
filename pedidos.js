/* =====================================================================
   PEDIDOS DE MARQUILLAS  (Materia prima → pestaña "Pedido")
   Solo Administrador y Jefes. Arma el pedido con todas las marquillas
   que están por debajo del mínimo y descarga el PDF en el formato
   "PEDIDO MARQUILLAS" con número consecutivo.
   El consecutivo se guarda en la hoja como un material oculto:
   "Consecutivo pedidos marquillas" (categoría "Sistema").
   ===================================================================== */
(function(){
  // ---------- fotos nuevas de materia prima (carpeta fotos/mp) ----------
  ['caucho-street-rojo','caucho-street-blanco','caucho-street-negro','caucho-street-gris','caucho-street-neon',
   'caucho-talon-street-blanco','caucho-talon-street-negro','caucho-talon-street-gris','caucho-talon-street-neon'
  ].forEach(k => FOTOS_MP.add(k));

  const CONSEC_NOMBRE = 'Consecutivo pedidos marquillas';
  const CONSEC_CAT = 'Sistema';
  const PRIMER_PEDIDO = 6;            // si aún no existe el consecutivo, el primero sale con este número
  let consec = null;                  // registro del consecutivo (se saca de S.mp para que no se vea)
  let pintado = false;                // evita borrar lo que se está editando cuando la app se refresca sola

  // ---------- número de molde por grupo (entrega de moldes Juan David Zuluaga) ----------
  const MOLDE = {
    'caucho kids canilla':'3', 'caucho kids talon':'4',
    'banana grande':'5', 'banana pequena':'5',
    'caucho punta correa touring':'6',
    'insignia de aventura grande':'7', 'insignia de aventura pequena':'8',
    'caucho correa superficial':'9',
    'hgr redonda grande':'10', 'hgr redonda pequena':'10',
    'caucho street':'11', 'caucho talon street':'11'
  };
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();

  // ---------- memoria local de lo que se edita (molde / descripción) ----------
  const MEM_KEY = 'pedidoMarquillasMem';
  const leerMem = () => { try{ return JSON.parse(localStorage.getItem(MEM_KEY)||'{}'); }catch(e){ return {}; } };
  const guardarMem = m => { try{ localStorage.setItem(MEM_KEY, JSON.stringify(m)); }catch(e){} };

  const esMarquilla = x => !/^suela/i.test(x.categoria||'') && x.categoria !== CONSEC_CAT;
  const faltantes = () => (S.mp||[]).filter(x => esMarquilla(x) && Number(x.cantidad) < Number(x.minimo));

  function colorTxt(c){
    let u = String(c||'').toUpperCase();
    if(/^NE[OÓ]N$/.test(u)) u = 'VERDE NEÓN';
    if(/^EN NE[OÓ]N$/.test(u)) u = 'EN VERDE NEÓN';
    return u;
  }
  function descripcion(x){
    const cat = norm(x.categoria);
    const c = nombreCorto(x);
    const cn = norm(c);
    if(/^(grande|pequena|pequeno)$/.test(cn)) return 'SEGÚN MUESTRA';
    if(/^en /.test(cn)) return colorTxt(c);
    if(/insignia|hgr redonda/.test(cat)){
      if(/^negr/.test(cn)) return 'FONDO NEGRO LETRAS EN NEGRO';
      if(/^blanc/.test(cn)) return 'FONDO BLANCO LETRAS GRISES';
      return 'FONDO NEGRO LETRAS BLANCAS CON LA G EN ' + colorTxt(c);
    }
    if(/punta correa/.test(cat)){
      if(/^negr/.test(cn)) return 'TODO EN NEGRO';
      if(/^blanc/.test(cn)) return 'FONDO BLANCO RAYAS GRISES';
      return 'FONDO NEGRO RAYAS EN ' + colorTxt(c);
    }
    if(/^negr/.test(cn)) return 'TODO EN NEGRO';
    if(/banana|kids canilla|adventure/.test(cat)) return 'TODO EN ' + colorTxt(c);
    return 'FONDO NEGRO DETALLE ' + colorTxt(c);
  }
  function tamano(x){
    const t = norm(x.categoria + ' ' + x.material);
    if(/grande/.test(t)) return 'GRANDE';
    if(/pequen/.test(t)) return 'PEQUEÑO';
    return 'N/A';
  }
  function filasPedido(){
    const mem = leerMem();
    return faltantes().map(x => {
      const m = mem[x.id] || {};
      return {
        id: x.id, x,
        molde: m.molde ?? (MOLDE[norm(x.categoria)] || ''),
        color: m.color ?? descripcion(x),
        tam: tamano(x),
        pares: Math.max(12, Math.ceil((Number(x.minimo) - Number(x.cantidad)) / 2)),
        foto: fotoMp(x.material)
      };
    }).sort((a,b) => (Number(a.molde)||99) - (Number(b.molde)||99) || a.x.categoria.localeCompare(b.x.categoria) || a.x.material.localeCompare(b.x.material));
  }

  // ---------- integración con la app ----------
  function sacarConsecutivo(){
    if(!Array.isArray(S.mp)) return;
    const c = S.mp.find(x => x.material === CONSEC_NOMBRE);
    if(c) consec = c;
    S.mp = S.mp.filter(x => x.categoria !== CONSEC_CAT);
  }
  const proximoNumero = () => consec ? Math.round(Number(consec.cantidad)||0) + 1 : PRIMER_PEDIDO;

  const pintarNavOriginal = window.pintarNav;
  window.pintarNav = function(){
    pintarNavOriginal();
    if(S.sec !== 'mp' || !veAmbas()) return;
    const nav = document.getElementById('nav');
    const b = document.createElement('button');
    b.dataset.v = 'mpPedido';
    b.className = S.vista === 'mpPedido' ? 'on' : '';
    b.innerHTML = '<i>🧾</i>Pedido';
    const agregar = nav.querySelector('[data-v="mpNuevo"]');
    nav.insertBefore(b, agregar || null);
    b.onclick = () => { S.vista = 'mpPedido'; pintado = false; render(); scrollTo(0,0); };
  };

  const renderOriginal = window.render;
  window.render = function(){
    sacarConsecutivo();
    if(S.vista === 'mpPedido'){
      if(S.sec !== 'mp' || !veAmbas()){ S.vista = S.sec === 'mp' ? 'mpLista' : 'modelos'; pintado = false; return renderOriginal(); }
      pintarNav();
      if(!pintado) vMpPedido();
      return;
    }
    pintado = false;
    return renderOriginal();
  };

  // ---------- vista ----------
  function vMpPedido(){
    header(cabecera('Pedido de marquillas'));
    const fs = filasPedido();
    if(!S.mp || !S.mp.length){ $('#app').innerHTML = '<div class="empty">Cargando…</div>'; return; }
    pintado = true;
    const n = proximoNumero();
    $('#app').innerHTML = `
      <style>
        .ped-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:6px 0 14px}
        .ped-top label{color:var(--sub);font-size:13px}
        .ped-top input{width:90px;font-size:18px;font-weight:700;text-align:center}
        .ped-list{display:flex;flex-direction:column;gap:10px}
        .ped-row{display:grid;grid-template-columns:28px 64px 1fr;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px}
        .ped-row.off{opacity:.45}
        .ped-row img{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:10px}
        .ped-row .nf{width:64px;height:64px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--sub);background:var(--card2);border-radius:10px}
        .ped-row .t{font-weight:700}
        .ped-row .s{color:var(--sub);font-size:12px;margin:2px 0 6px}
        .ped-campos{display:grid;grid-template-columns:70px 1fr 90px;gap:6px}
        .ped-campos input{padding:8px 10px;font-size:13px;min-width:0}
        .ped-campos small{display:block;color:var(--sub);font-size:11px;margin-bottom:2px}
        .ped-chk{width:22px;height:22px;accent-color:var(--acc)}
        @media (max-width:560px){ .ped-campos{grid-template-columns:60px 1fr} .ped-campos .pp{grid-column:1 / -1} }
      </style>
      <div class="ped-top">
        <label>Pedido N°</label><input id="pedNum" inputmode="numeric" value="${n}">
        <span style="color:var(--sub);font-size:13px">${fs.length} marquilla${fs.length===1?'':'s'} por debajo del mínimo</span>
      </div>
      ${fs.length ? `<div class="ped-list">${fs.map((f,i)=>`
        <div class="ped-row" data-id="${esc(f.id)}">
          <input type="checkbox" class="ped-chk" checked>
          ${f.foto ? `<img src="${f.foto}" alt="${esc(f.x.material)}">` : '<span class="nf">Sin foto</span>'}
          <div>
            <div class="t">${esc(f.x.material)}</div>
            <div class="s">${Number(f.x.cantidad)<0 ? `<b style="color:#ff8a80">Faltan ${fmt(-f.x.cantidad)} ${esc(f.x.unidad||'')} para órdenes</b> · ` : `Hay ${fmt(f.x.cantidad)} · `}mínimo ${fmt(f.x.minimo)} ${esc(f.x.unidad||'')} · ${f.tam}</div>
            <div class="ped-campos">
              <label><small>Molde</small><input class="ped-molde" value="${esc(f.molde)}"></label>
              <label><small>Color</small><input class="ped-color" value="${esc(f.color)}"></label>
              <label class="pp"><small>Pares</small><input class="ped-pares" inputmode="numeric" value="${f.pares}"></label>
            </div>
          </div>
        </div>`).join('')}</div>
        <button class="btn" id="pedGen" style="margin-top:16px">Generar pedido de marquillas (PDF)</button>`
      : '<div class="empty">Todas las marquillas están por encima del mínimo 🎉</div>'}
    `;
    document.querySelectorAll('.ped-row').forEach(r => {
      const chk = r.querySelector('.ped-chk');
      chk.onchange = () => r.classList.toggle('off', !chk.checked);
      ['ped-molde','ped-color'].forEach(cl => r.querySelector('.'+cl).onchange = () => {
        const mem = leerMem(); const id = r.dataset.id; mem[id] = mem[id] || {};
        mem[id][cl === 'ped-molde' ? 'molde' : 'color'] = r.querySelector('.'+cl).value.trim();
        guardarMem(mem);
      });
    });
    const g = $('#pedGen'); if(g) g.onclick = () => generar(fs);
  }

  // ---------- PDF ----------
  let jspdfListo = null;
  function cargarJsPDF(){
    if(window.jspdf) return Promise.resolve();
    if(jspdfListo) return jspdfListo;
    jspdfListo = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = ok; s.onerror = () => { jspdfListo = null; mal(new Error('No se pudo cargar el generador de PDF (revisa la conexión)')); };
      document.head.appendChild(s);
    });
    return jspdfListo;
  }
  async function fotoJpeg(src){
    if(!src) return null;
    try{
      const blob = await fetch(src).then(r => { if(!r.ok) throw 0; return r.blob(); });
      const bmp = await createImageBitmap(blob);
      const lado = 360, cv = document.createElement('canvas'); cv.width = cv.height = lado;
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0,0,lado,lado);
      const k = Math.min(lado/bmp.width, lado/bmp.height), w = bmp.width*k, h = bmp.height*k;
      cx.drawImage(bmp, (lado-w)/2, (lado-h)/2, w, h);
      return cv.toDataURL('image/jpeg', 0.85);
    }catch(e){ return null; }
  }
  function fechaLarga(d){
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `Bogotá, ${meses[d.getMonth()]} ${d.getDate()} del ${d.getFullYear()}`;
  }

  async function generar(fsBase){
    const btn = $('#pedGen');
    const n = parseInt($('#pedNum').value, 10);
    if(!n || n < 1){ toast('Escribe un número de pedido válido'); return; }
    const filas = [];
    document.querySelectorAll('.ped-row').forEach(r => {
      if(!r.querySelector('.ped-chk').checked) return;
      const f = fsBase.find(x => x.id === r.dataset.id); if(!f) return;
      filas.push({ ...f,
        molde: r.querySelector('.ped-molde').value.trim(),
        color: r.querySelector('.ped-color').value.trim().toUpperCase(),
        pares: parseInt(r.querySelector('.ped-pares').value, 10) || 0 });
    });
    if(!filas.length){ toast('Selecciona al menos una marquilla'); return; }
    btn.disabled = true; btn.textContent = 'Generando PDF…';
    try{
      await cargarJsPDF();
      const fotos = await Promise.all(filas.map(f => fotoJpeg(f.foto)));
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'letter' });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      const cols = [ ['PEDIDO #',62], ['NUMERO DE MOLDE',120], ['COLOR',190], ['TAMAÑO',120], ['FOTO',140], ['CANTIDAD',120] ];
      const anchoTabla = cols.reduce((a,c)=>a+c[1],0);
      const x0 = (W - anchoTabla) / 2, altoCab = 34, altoFila = 104, abajo = H - 36;
      const rojo = [255,0,0];
      let y;
      const xs = []; cols.reduce((x,c)=>{ xs.push(x); return x+c[1]; }, x0);

      const cabecera = (primera) => {
        y = 40;
        if(primera){
          doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(0);
          doc.text(fechaLarga(new Date()), x0, y);
          doc.setFont('helvetica','bold'); doc.setFontSize(14);
          doc.text(`PEDIDO DE MARQUILLAS N° ${n}`, x0, y + 22);
          y += 40;
        }
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...rojo);
        cols.forEach(([t,w],i) => {
          if(i>0){ doc.setDrawColor(0); doc.setLineWidth(1); doc.rect(xs[i], y, w, altoCab); }
          doc.text(t, xs[i] + w/2, i===0 ? y + altoCab - 6 : y + altoCab/2 + 3.5, { align:'center' });
        });
        y += altoCab;
      };
      cabecera(true);
      filas.forEach((f,i) => {
        if(y + altoFila > abajo){ doc.addPage(); cabecera(false); }
        doc.setDrawColor(0); doc.setLineWidth(1);
        cols.forEach(([,w],k) => doc.rect(xs[k], y, w, altoFila));
        const mid = y + altoFila/2;
        const celda = (k, txt, color) => {
          doc.setTextColor(...(color||[0,0,0]));
          const lineas = doc.splitTextToSize(String(txt||''), cols[k][1] - 14);
          const h = lineas.length * 12;
          doc.text(lineas, xs[k] + cols[k][1]/2, mid - h/2 + 9, { align:'center' });
        };
        doc.setFont('helvetica','normal'); doc.setFontSize(10);
        celda(0, String(i+1), rojo);
        celda(1, f.molde || '');
        celda(2, f.color);
        celda(3, f.tam);
        celda(5, `${f.pares} PARES`);
        if(fotos[i]){ const lado = altoFila - 10; doc.addImage(fotos[i], 'JPEG', xs[4] + (cols[4][1]-lado)/2, y + 5, lado, lado); }
        y += altoFila;
      });
      doc.save(`PEDIDO MARQUILLAS N${n}.pdf`);

      // guardar el consecutivo en la hoja
      try{
        if(consec){ const r = await llamar('mpAjustar', consec.id, n, true, `Pedido de marquillas N° ${n} (${filas.length} refs.)`); consec.cantidad = r && r.cantidad != null ? r.cantidad : n; }
        else { await llamar('mpAgregar', CONSEC_NOMBRE, CONSEC_CAT, 'unidades', n, 0); consec = { material: CONSEC_NOMBRE, cantidad: n }; cargar(true); }
        toast(`Pedido N° ${n} generado`);
        $('#pedNum').value = n + 1;
      }catch(e){
        toast(`PDF descargado, pero no se guardó el consecutivo: ${e.message||e}`);
      }
    }catch(e){ toast('Error: ' + (e.message||e)); }
    finally{ if(btn){ btn.disabled = false; btn.textContent = 'Generar pedido de marquillas (PDF)'; } }
  }

  // si la app ya pintó antes de cargar este archivo, repintar para que aparezca la pestaña
  if(typeof PIN !== 'undefined' && PIN && Array.isArray(S.mp) && S.mp.length) { try{ render(); }catch(e){} }
})();
