const API_URL = 'http://localhost:3000/api/pronosticos';

document.addEventListener('DOMContentLoaded', () => {
  const btnGuardar = document.getElementById('btn-guardar-pronostico');
  const msgEl = document.getElementById('reg-msg');

  if (btnGuardar) {
    btnGuardar.addEventListener('click', () => window.guardarPronostico(false));
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
    data.forEach(p => {
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

      tr.innerHTML = `
        <td>${date}</td>
        <td><strong>${p.local}</strong> vs <strong>${p.visitante}</strong><br><small>${p.competicion}</small></td>
        <td>${renderIa(p.id, 'gemini', p.gemini_pred, p.gemini_hit)}</td>
        <td>${renderIa(p.id, 'chatgpt', p.chatgpt_pred, p.chatgpt_hit)}</td>
        <td>${renderIa(p.id, 'claude', p.claude_pred, p.claude_hit)}</td>
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
