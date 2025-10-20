// /pages/markt/view.js
import { makeStorage } from '../../core/services/storage/index.js';

function h(tag, attrs = {}, children = []){
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  });
  children.forEach(c => el.appendChild(c));
  return el;
}

export async function mountMarktPage(root){
  root.setAttribute('data-page','markt');
  const storage = makeStorage();

  const hero = h('section', { class:'markt-hero' }, [
    h('h1', { text:'Marktplaats (preview)' }),
    h('p', { class:'muted', text:'We tonen hier records uit de (optionele) tabel "listings". Bestaat de tabel nog niet, dan zie je een lege staat.' }),
    h('div', { class:'markt-actions' }, [
      h('button', { class:'btn', id:'btn-refresh', text:'Vernieuwen' }),
    ])
  ]);
  const listWrap = h('section', { id:'market-list' });
  root.innerHTML = '';
  root.appendChild(hero);
  root.appendChild(listWrap);

  async function render(){
    listWrap.innerHTML = '';
    const items = await storage.listListings().catch(() => []);
    if (!items || !items.length){
      listWrap.appendChild(h('div', { class:'empty', text:'Nog geen listings gevonden.' }));
      return;
    }
    items.forEach(it => {
      const card = h('article', { class:'listing' }, [
        h('div', { class:'row' }, [ h('strong', { text: it.title || '—' }) ]),
        h('div', { class:'muted', text: it.description || 'Geen omschrijving' }),
        h('div', { class:'muted', text: `Type: ${it.type || '—'} · Status: ${it.status || '—'}` }),
      ]);
      listWrap.appendChild(card);
    });
  }

  document.getElementById('btn-refresh').addEventListener('click', render);
  await render();
}
