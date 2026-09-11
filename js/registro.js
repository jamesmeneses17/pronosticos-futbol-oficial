const API_URL = 'http://localhost:3000/api/pronosticos';

document.addEventListener('DOMContentLoaded', () => {
  const btnGuardar = document.getElementById('btn-guardar-pronostico');
  const msgEl = document.getElementById('reg-msg');

  if (btnGuardar) {
    btnGuardar.addEventListener('click', () => window.guardarPronostico(false));
  }

  const btnAnalizarHistorico = document.getElementById('btn-analizar-historico');
  if (btnAnalizarHistorico) {
    btnAnalizarHistorico.addEventListener('click', () => window.analizarHistorialPronosticos());
  }

  // Escuchar cuando se cambie a la pestaña de registro para recargar la tabla
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.dataset.tab === 'registro') {
        cargarPronosticos();
        // Intentar autocompletar local, visitante, competicion desde el tab de datos
        autocompletarDatos();
      }
    });
  });

  // Cargar tabla inicial si estamos en esa pestaña
  const activeTab = document.querySelector('.nav-btn.active');
  if (activeTab && activeTab.dataset.tab === 'registro') {
    cargarPronosticos();
  }
});

function autocompletarDatos() {
  const localVal = document.getElementById('in-local')?.value || '';
  const visitanteVal = document.getElementById('in-visitante')?.value || '';
  const compVal = document.getElementById('in-competicion')?.value || '';

  const regLocal = document.getElementById('reg-local');
  const regVisitante = document.getElementById('reg-visitante');
  const regComp = document.getElementById('reg-competicion');

  if (regLocal && !regLocal.value) regLocal.value = localVal;
  if (regVisitante && !regVisitante.value) regVisitante.value = visitanteVal;
  if (regComp && !regComp.value) regComp.value = compVal;
}

window.guardarPronostico = async function(silencioso = false) {
  const local = document.getElementById('reg-local').value.trim();
  const visitante = document.getElementById('reg-visitante').value.trim();
  const competicion = document.getElementById('reg-competicion').value.trim();
  const gemini_pred = document.getElementById('reg-gemini').value.trim();
  const chatgpt_pred = document.getElementById('reg-chatgpt').value.trim();
  const claude_pred = document.getElementById('reg-claude').value.trim();
  const msgEl = document.getElementById('reg-msg');

  if (!local || !visitante) {
    if (!silencioso) mostrarMensaje(msgEl, 'Error: Local y Visitante son obligatorios.', 'error');
    return;
  }

  const payload = { local, visitante, competicion, gemini_pred, chatgpt_pred, claude_pred };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      if (!silencioso) {
        mostrarMensaje(msgEl, 'Pronóstico guardado correctamente.', 'success');
        limpiarFormulario();
      }
      cargarPronosticos();
    } else {
      if (!silencioso) {
        const err = await res.json();
        mostrarMensaje(msgEl, 'Error: ' + (err.error || 'Error desconocido'), 'error');
      }
    }
  } catch (error) {
    console.error(error);
    if (!silencioso) mostrarMensaje(msgEl, 'Error de conexión. ¿Está el servidor encendido?', 'error');
  }
}

async function cargarPronosticos() {
  const tbody = document.getElementById('tbody-registro');
  if (!tbody) return;

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Error en red');
    const data = await res.json();

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay pronósticos registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach((p, index) => {
      const tr = document.createElement('tr');
      const date = new Date(p.created_at).toLocaleString();
      let resCol = '';
      if (p.resultado_final) {
        resCol = `<strong>${p.resultado_final}</strong>`;
      } else {
        resCol = `
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <input type="text" id="res-${p.id}" placeholder="Ej: 2-1" style="width:70px; padding:0.2rem; font-size:0.8rem;">
            <button class="btn btn-small" onclick="guardarResultadoFinal(${p.id})" style="padding:0.2rem 0.5rem; font-size:0.8rem;">OK</button>
          </div>
        `;
      }

      // Lógica para la columna Análisis Histórico
      const predsRow = [p.gemini_pred, p.chatgpt_pred, p.claude_pred]
        .filter(Boolean)
        .map(t => t.replace(/\(\d+%\)/g, '').split(',').map(s => s.trim()))
        .flat()
        .filter(Boolean);

      const uniquePreds = [...new Set(predsRow.map(s => s.toLowerCase()))];
      
      // Helper para extraer el mayor porcentaje de las 3 IAs para una predicción en el partido actual
      const getHighestPct = (textArr, sub) => {
         let maxPct = 0;
         textArr.forEach(text => {
             if (text && text.toLowerCase().includes(sub)) {
                 const m = text.match(/\((\d+(?:\.\d+)?)%\)/);
                 if (m) {
                     const pct = parseFloat(m[1]);
                     if (pct > maxPct) maxPct = pct;
                 }
             }
         });
         return maxPct;
      };

      let analysisHTML = '';
      uniquePreds.forEach(sub => {
        let aciertos = 0, fallos = 0;
        const matchesFallados = [];
        const fallosPcts = [];
        
        const currentPct = getHighestPct([p.gemini_pred, p.chatgpt_pred, p.claude_pred], sub);

        const historicalData = data.slice(index + 1); // Solo datos más antiguos
        historicalData.forEach(row => {
            const checkIA = (pred, hit) => {
                 if (pred && pred.toLowerCase().includes(sub)) {
                    if (hit === 'yes') aciertos++;
                    else if (hit === 'no') {
                        fallos++;
                        
                        const m = pred.match(/\((\d+(?:\.\d+)?)%\)/);
                        if (m) fallosPcts.push(parseFloat(m[1]));

                        const matchName = `${row.local} vs ${row.visitante}`;
                        if (!matchesFallados.find(m => m.partido === matchName)) {
                            matchesFallados.push({
                                partido: matchName,
                                fecha: new Date(row.created_at).toLocaleDateString(),
                                marcador: row.resultado_final || 'Sin registrar',
                                pronostico: pred
                            });
                        }
                    }
                 }
            };
            checkIA(row.gemini_pred, row.gemini_hit);
            checkIA(row.chatgpt_pred, row.chatgpt_hit);
            checkIA(row.claude_pred, row.claude_hit);
        });
        
        let color = 'var(--c-text-muted)';
        if (aciertos > 0 && fallos === 0) color = 'var(--c-success)';
        else if (fallos > aciertos) color = 'var(--c-danger)';
        else if (aciertos > 0) color = 'inherit';

        const originalName = predsRow.find(s => s.toLowerCase() === sub) || sub;
        
        let errorEl = `${fallos}❌`;
        if (fallos > 0) {
            const dataStr = encodeURIComponent(JSON.stringify(matchesFallados));
            const maxFalloPct = fallosPcts.length > 0 ? Math.max(...fallosPcts) : 0;
            errorEl = `<span style="cursor:pointer; text-decoration:underline;" onclick="window.mostrarModalFallos('${dataStr}', '${originalName}', ${currentPct}, ${maxFalloPct})">${fallos}❌</span>`;
        }

        analysisHTML += `<div style="font-size:0.8rem; margin-bottom:4px; border-bottom:1px solid var(--border-subtle); padding-bottom:4px;">
            <strong>${originalName}</strong>: <span style="color:${color}">${aciertos}✅ ${errorEl}</span>
        </div>`;
      });

      const rawPreds = [p.gemini_pred, p.chatgpt_pred, p.claude_pred].filter(Boolean);
      if (rawPreds.length === 3 && uniquePreds.length === 1) {
          analysisHTML = `<div style="font-size:0.8rem; font-weight:bold; color:var(--c-success); margin-bottom:4px; padding: 2px 4px; background: rgba(0,255,0,0.1); border-radius: 4px; display: inline-block;">⭐ Consenso 3/3</div>` + analysisHTML;
      }

      tr.innerHTML = `
        <td>${date}</td>
        <td><strong>${p.local}</strong> vs <strong>${p.visitante}</strong><br><small>${p.competicion}</small></td>
        <td>${renderIa(p.id, 'gemini', p.gemini_pred, p.gemini_hit)}</td>
        <td>${renderIa(p.id, 'chatgpt', p.chatgpt_pred, p.chatgpt_hit)}</td>
        <td>${renderIa(p.id, 'claude', p.claude_pred, p.claude_hit)}</td>
        <td>${analysisHTML}</td>
        <td>${resCol}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--c-danger);">Error de conexión con la base de datos. Asegúrate de ejecutar `node server.js`</td></tr>';
  }
}

function limpiarFormulario() {
  document.getElementById('reg-gemini').value = '';
  document.getElementById('reg-chatgpt').value = '';
  document.getElementById('reg-claude').value = '';
}

function mostrarMensaje(el, msg, tipo) {
  if (!el) return;
  el.textContent = msg;
  el.style.color = tipo === 'error' ? 'var(--c-danger)' : 'var(--c-success)';
  setTimeout(() => {
    el.textContent = '';
  }, 4000);
}

window.guardarResultadoFinal = async function(id) {
  const input = document.getElementById('res-' + id);
  if (!input) return;
  const resultado = input.value.trim();
  if (!resultado) {
    alert('Ingresa un resultado válido (ej: 2-1, Empate, Gana Local)');
    return;
  }
  
  try {
    const res = await fetch(API_URL + '/' + id + '/resultado', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ resultado })
    });
    
    if (res.ok) {
      cargarPronosticos();
    } else {
      alert('Error al guardar el resultado.');
    }
  } catch (e) {
    console.error(e);
    alert('Error de conexión.');
  }
}

function renderIa(id, ia, pred, hit) {
  if (!pred) return '';
  let color = hit === 'yes' ? 'var(--ok)' : hit === 'no' ? 'var(--error)' : 'inherit';
  
  let checkOpacity = hit === 'yes' ? '1' : hit ? '0.3' : '0.5';
  let crossOpacity = hit === 'no' ? '1' : hit ? '0.3' : '0.5';
  
  let checkBtn = `<button title="Acertó" onclick="marcarHit(${id}, '${ia}', 'yes')" style="border:none;background:none;cursor:pointer;font-size:1.3rem;opacity:${checkOpacity};transition:0.2s;">✅</button>`;
  let crossBtn = `<button title="Falló" onclick="marcarHit(${id}, '${ia}', 'no')" style="border:none;background:none;cursor:pointer;font-size:1.3rem;opacity:${crossOpacity};transition:0.2s;">❌</button>`;
  
  return `
    <div style="color: ${color}; font-weight: ${hit ? '600' : 'normal'}; transition:0.2s;">
      ${pred}
      <div style="margin-top:0.4rem; display:flex; gap:0.5rem; align-items:center;">
        ${checkBtn} ${crossBtn}
      </div>
    </div>
  `;
}

window.marcarHit = async function(id, ia, hit) {
  try {
    await fetch(API_URL + '/' + id + '/hit', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ia, hit })
    });
    cargarPronosticos();
  } catch (e) {
    console.error(e);
  }
}

window.analizarHistorialPronosticos = async function() {
  const gemini_pred = document.getElementById('reg-gemini').value.trim();
  const chatgpt_pred = document.getElementById('reg-chatgpt').value.trim();
  const claude_pred = document.getElementById('reg-claude').value.trim();
  const msgEl = document.getElementById('reg-msg');
  const container = document.getElementById('reg-analisis-historico');
  const resultadosDiv = document.getElementById('reg-analisis-resultados');

  if (!gemini_pred && !chatgpt_pred && !claude_pred) {
    mostrarMensaje(msgEl, 'Ingresa al menos un pronóstico para analizar.', 'error');
    return;
  }

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Error al obtener historial');
    const data = await res.json();
    
    container.style.display = 'block';
    resultadosDiv.innerHTML = '';
    
    const predicciones = [
      { ia: 'Gemini', texto: gemini_pred },
      { ia: 'ChatGPT', texto: chatgpt_pred },
      { ia: 'Claude', texto: claude_pred }
    ].filter(p => p.texto !== '');

    // Para evitar duplicados en el análisis si varias IAs predicen lo mismo
    const prediccionesUnicas = new Set();

    predicciones.forEach(p => {
      // Limpiar texto: quitar porcentajes (ej. (92%)), y separar por comas
      const subPreds = p.texto.replace(/\(\d+%\)/g, '').split(',').map(s => s.trim()).filter(s => s !== '');
      
      subPreds.forEach(sub => {
        if (prediccionesUnicas.has(sub.toLowerCase())) return;
        prediccionesUnicas.add(sub.toLowerCase());

        let aciertos = 0;
        let fallos = 0;
        
        data.forEach(row => {
           // Chequeamos si este substring fue pronosticado y resuelto en el pasado
           const checkIA = (pred, hit) => {
             if (pred && pred.toLowerCase().includes(sub.toLowerCase())) {
                if (hit === 'yes') aciertos++;
                else if (hit === 'no') fallos++;
             }
           };
           checkIA(row.gemini_pred, row.gemini_hit);
           checkIA(row.chatgpt_pred, row.chatgpt_hit);
           checkIA(row.claude_pred, row.claude_hit);
        });
        
        const total = aciertos + fallos;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '1rem';
        
        if (total === 0) {
          card.innerHTML = `<h4 style="margin-bottom:0.5rem; color:var(--c-text-muted);">${sub}</h4>
                            <p class="muted" style="font-size:0.9rem;">No hay datos históricos suficientes para este mercado.</p>`;
        } else {
          const hitRate = (aciertos / total) * 100;
          let icon = '';
          let color = '';
          let alertMsg = '';
          
          if (hitRate >= 70) {
            icon = '✅';
            color = 'var(--ok)';
            alertMsg = 'Alta fiabilidad histórica.';
          } else if (hitRate <= 45) {
            icon = '⚠️';
            color = 'var(--error)';
            alertMsg = 'Precaución: suele fallar frecuentemente.';
          } else {
            icon = 'ℹ️';
            color = 'inherit';
            alertMsg = 'Rendimiento mixto.';
          }
          
          card.innerHTML = `
            <h4 style="margin-bottom:0.5rem;">${sub} ${icon}</h4>
            <div style="font-size: 1.5rem; font-weight: 600; color: ${color}; margin-bottom: 0.5rem;">${hitRate.toFixed(1)}%</div>
            <p style="font-size: 0.9rem; margin-bottom: 0.5rem;">${aciertos} aciertos, ${fallos} fallos</p>
            <p style="font-size: 0.85rem; color: var(--c-text-muted);">${alertMsg}</p>
          `;
        }
        resultadosDiv.appendChild(card);
      });
    });
    
    mostrarMensaje(msgEl, 'Análisis histórico completado.', 'success');
  } catch (error) {
    console.error(error);
    mostrarMensaje(msgEl, 'Error al analizar el historial.', 'error');
  }
}

window.mostrarModalFallos = function(dataStr, title, currentPct, maxFalloPct) {
    const data = JSON.parse(decodeURIComponent(dataStr));
    document.getElementById('fallos-modal-title').textContent = 'Fallos: ' + title;
    const body = document.getElementById('fallos-modal-body');
    body.innerHTML = '';
    
    if (currentPct > 0 && maxFalloPct > 0) {
        if (currentPct > maxFalloPct) {
            body.innerHTML += `<div style="padding:var(--space-md); margin-bottom:var(--space-md); background:var(--ok-bg); border:1px solid var(--ok-border); color:var(--ok); border-radius:var(--radius-md); font-size:var(--text-sm);">
                💡 <strong>Consejo:</strong> El porcentaje actual (${currentPct}%) es mayor al máximo porcentaje con el que ha fallado históricamente (${maxFalloPct}%). Es un escenario con más margen.
            </div>`;
        } else {
            body.innerHTML += `<div style="padding:var(--space-md); margin-bottom:var(--space-md); background:var(--error-bg); border:1px solid var(--error-border); color:var(--error); border-radius:var(--radius-md); font-size:var(--text-sm);">
                💡 <strong>Riesgo Elevado:</strong> El porcentaje actual (${currentPct}%) es igual o menor al máximo porcentaje con el que ha fallado históricamente (${maxFalloPct}%).
            </div>`;
        }
    }

    data.forEach(item => {
        body.innerHTML += `
            <div class="modal-item">
                <div class="modal-item-title">${item.partido} <span style="font-weight:normal; font-size:0.8em; color:var(--text-muted);">(${item.fecha})</span></div>
                <div class="modal-item-desc"><strong>Marcador final:</strong> ${item.marcador}</div>
                <div class="modal-item-desc"><strong>Pronóstico exacto:</strong> ${item.pronostico}</div>
            </div>
        `;
    });
    
    document.getElementById('fallos-modal').classList.add('active');
}
