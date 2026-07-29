(() => {
  "use strict";

  const KEY = "roadbook-v4-state";
  const CUSTOM_KEY = "roadbook-v4-custom";
  const THEME_KEY = "roadbook-v4-theme";
  const ROUTE = ["Soča-Tal", "Istrien"];
  const baseCamps = Array.isArray(window.ROADBOOK_CAMPSITES) ? window.ROADBOOK_CAMPSITES : [];
  let customCamps = parse(localStorage.getItem(CUSTOM_KEY), []);
  let state = parse(localStorage.getItem(KEY), {});
  let camps = mergeCamps();
  let activeRegion = "Alle";
  let activeStatus = "Alle";
  let searchTerm = "";
  let favoritesOnly = false;
  let currentCampId = null;
  let skipped = new Set();

  const terminal = new Set(["reserviert", "ausgebucht", "warteliste"]);
  const labels = {
    offen: "Noch anrufen", "keine-antwort": "Keine Antwort", rueckruf: "Rückruf",
    warteliste: "Warteliste", reserviert: "Reserviert", ausgebucht: "Ausgebucht"
  };

  function parse(v, fallback){ try{return v ? JSON.parse(v) : fallback}catch{return fallback} }
  function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c])}
  function cs(id){return state[id] || {status:"offen",notes:"",calledAt:"",favorite:false}}
  function mergeCamps(){
    const overrides = new Map(customCamps.map(c=>[c.id,c]));
    return baseCamps.map(c=>overrides.get(c.id)||c).concat(customCamps.filter(c=>!baseCamps.some(b=>b.id===c.id)));
  }
  function letter(c){return c.priorityLetter || (Number(c.priority)>=9?"A":Number(c.priority)>=7?"B":"C")}
  function rank(c){return {A:3,B:2,C:1}[letter(c)]||0}
  function routeRank(c){const i=ROUTE.indexOf(c.region);return i<0?ROUTE.length:i}
  function fresh(c){return cs(c.id).status==="offen"}
  function retry(c){return ["keine-antwort","rueckruf"].includes(cs(c.id).status)}
  function active(c){return fresh(c)||retry(c)}
  function quality(c){
    const realWebsite = c.website && !/google\.com\/search/i.test(c.website);
    if(c.phone && realWebsite) return {key:"verified",icon:"●",text:"Geprüft"};
    if(c.phone || realWebsite) return {key:"partial",icon:"●",text:"Teilweise geprüft"};
    return {key:"check",icon:"●",text:"Noch prüfen"};
  }
  function persist(renderNow=true){
    localStorage.setItem(KEY,JSON.stringify(state));
    localStorage.setItem(CUSTOM_KEY,JSON.stringify(customCamps));
    if(renderNow) render();
  }
  function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),1700)}

  // Die Route entscheidet zuerst. Innerhalb des aktuellen Reiseziels kommen
  // Erstanrufe vor Rückrufen und danach A, B und C.
  function currentDestination(){
    const activeRegions = ROUTE.filter(region=>camps.some(c=>c.region===region && active(c)));
    if(activeRegions.length) return activeRegions[0];
    const other = camps.filter(active).sort((a,b)=>routeRank(a)-routeRank(b))[0];
    return other?.region || null;
  }
  function phase(){
    const destination=currentDestination();
    if(!destination)return "done";
    return camps.some(c=>c.region===destination&&fresh(c))?"fresh":"retry";
  }
  function queue(includeSkipped=false){
    const destination=currentDestination(), p=phase();
    if(!destination||p==="done")return [];
    const list=camps.filter(c=>c.region===destination&&(p==="fresh"?fresh(c):retry(c))).filter(c=>includeSkipped||!skipped.has(c.id));
    return list.sort((a,b)=>{
      if(p==="retry"){
        const ta=Date.parse(cs(a.id).calledAt||0)||0,tb=Date.parse(cs(b.id).calledAt||0)||0;
        if(ta!==tb)return ta-tb;
      }
      return rank(b)-rank(a)||(b.priority||0)-(a.priority||0)||a.name.localeCompare(b.name,"de");
    });
  }
  function current(){
    const destination=currentDestination(),p=phase();
    const found=camps.find(c=>c.id===currentCampId&&c.region===destination&&active(c)&&((p==="fresh"&&fresh(c))||(p==="retry"&&retry(c)))&&!skipped.has(c.id));
    if(found)return found;
    let n=queue()[0];
    if(!n&&queue(true).length){skipped.clear();n=queue()[0]}
    currentCampId=n?.id||null;return n||null;
  }
  function go(page, scroll=true){
    document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id===page));
    document.querySelectorAll(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
    if(scroll)window.scrollTo({top:0,behavior:"smooth"});
  }
  function focusCockpit(){
    go("camping",false);
    requestAnimationFrame(()=>document.getElementById("callCockpit").scrollIntoView({behavior:"smooth",block:"start"}));
  }
  function renderSummary(){
    const f=camps.filter(fresh).length,r=camps.filter(retry).length,res=camps.filter(c=>cs(c.id).status==="reserviert").length;
    const done=camps.filter(c=>terminal.has(cs(c.id).status)).length,total=camps.length;
    document.getElementById("campSummary").innerHTML=`
      <div class="summary-card"><strong>${f}</strong><span>NEUE ANRUFE</span></div>
      <div class="summary-card"><strong>${r}</strong><span>RÜCKRUFE</span></div>
      <div class="summary-card"><strong>${res}</strong><span>RESERVIERT</span></div>`;
    document.getElementById("openCount").textContent=f+r;
    document.getElementById("reservedCount").textContent=res;
    document.getElementById("callProgress").textContent=`${done} / ${total} erledigt`;
    document.getElementById("callBreakdown").textContent=`${f} neu · ${r} Rückrufe`;
    document.getElementById("progressBar").style.width=total?`${done/total*100}%`:"0%";
    const n=current(), destination=currentDestination();
    document.getElementById("nextCampName").textContent=n?n.name:"Telefonrunde geschafft";
    document.getElementById("nextCampMeta").textContent=n?`${destination} zuerst · ${phase()==="fresh"?"Erstanruf":"Rückrufrunde"} · Priorität ${letter(n)}`:"Alle Einträge sind abgeschlossen.";
  }
  function stars(n=0){return "★".repeat(n)+"☆".repeat(Math.max(0,5-n))}
  function renderCockpit(){
    const box=document.getElementById("callCockpit"),c=current();
    if(!c){box.innerHTML='<div class="cockpit-empty"><div class="success-mark">✓</div><h2>Super, Telefonrunde geschafft</h2><p>Aktuell gibt es keinen offenen Kontakt.</p></div>';return}
    const s=cs(c.id),q=quality(c),all=queue(true),idx=Math.max(0,all.findIndex(x=>x.id===c.id));
    const call=c.phone?`<a class="cockpit-call" href="tel:${esc(c.phone)}">☎ Jetzt anrufen</a>`:`<button class="cockpit-call missing" data-edit="${esc(c.id)}">☎ Telefon ergänzen</button>`;
    const web=c.website?`<a class="website-link" href="${esc(c.website)}" target="_blank" rel="noopener">🌐 Website ↗</a>`:'<span class="disabled-link">🌐 Fehlt</span>';
    const maps=c.maps?`<a href="${esc(c.maps)}" target="_blank" rel="noopener">📍 Navigation</a>`:'<span class="disabled-link">📍 Fehlt</span>';
    box.innerHTML=`
      <div class="route-first">📍 Jetzt zuerst: <strong>${esc(c.region)}</strong></div>
      <div class="cockpit-head"><div><span class="eyebrow">${phase()==="fresh"?"NÄCHSTER ANRUF":"RÜCKRUFRUNDE"}</span><div class="priority priority-${letter(c).toLowerCase()}">Priorität ${letter(c)}</div><h2>${esc(c.name)}</h2><p>${esc(c.place)} · ${esc(c.region)}</p></div><div class="camp-number">${idx+1}<small>von ${all.length}</small></div></div>
      <div class="trust-row"><span class="quality ${q.key}">${q.icon} ${q.text}</span><button class="favorite-btn ${s.favorite?"active":""}" id="favoriteCurrent" aria-label="Favorit umschalten">${s.favorite?"★":"☆"}</button></div>
      <div class="cockpit-rating"><span>🚴 ${stars(c.bike)}</span><span>🏊 ${stars(c.water)}</span><span>👨‍👦 ${stars(c.family)}</span></div>
      <p class="note">${esc(c.note||"Keine Zusatznotiz.")}</p>
      <div class="cockpit-links">${call}${web}${maps}</div>
      ${c.website?'<p class="external-hint">Die Website öffnet sich separat. Die Roadbook-App bleibt geöffnet – danach einfach zur App zurückwechseln.</p>':''}
      <label class="quick-note-label">Kurze Notiz<textarea id="quickNote" placeholder="Zum Beispiel: Rückruf ab 18 Uhr">${esc(s.notes)}</textarea></label>
      <div class="result-title">ERGEBNIS DES ANRUFS</div>
      <div class="result-grid"><button class="result reserved" data-result="reserviert">✓ Reserviert</button><button class="result full" data-result="ausgebucht">× Ausgebucht</button><button class="result callback" data-result="rueckruf">↻ Rückruf</button><button class="result wait" data-result="warteliste">≋ Warteliste</button><button class="result noanswer" data-result="keine-antwort">… Nicht erreicht</button><button class="result skip" id="skipCamp">→ Später</button></div>`;
    document.getElementById("favoriteCurrent").onclick=()=>{state[c.id]={...s,favorite:!s.favorite};persist();toast(!s.favorite?"Als Favorit gespeichert":"Favorit entfernt")};
    document.getElementById("quickNote").addEventListener("change",e=>{state[c.id]={...cs(c.id),notes:e.target.value};persist(false)});
    box.querySelectorAll(".website-link").forEach(a=>a.addEventListener("click",()=>toast("Website separat geöffnet – Roadbook bleibt offen")));
    box.querySelectorAll("[data-result]").forEach(b=>b.onclick=()=>{
      const result=b.dataset.result,note=document.getElementById("quickNote").value;
      state[c.id]={...cs(c.id),status:result,notes:note,calledAt:new Date().toISOString()};currentCampId=null;skipped.delete(c.id);persist();
      toast(["keine-antwort","rueckruf"].includes(result)?`${labels[result]} – kommt später wieder`:`${labels[result]} – nächster Platz`);
    });
    document.getElementById("skipCamp").onclick=()=>{skipped.add(c.id);currentCampId=null;render();toast("Für später verschoben")};
    box.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openDialog(c));
  }
  function matches(c){
    const s=cs(c.id),hay=`${c.name} ${c.place} ${c.region} ${c.note||""}`.toLowerCase();
    return (activeRegion==="Alle"||c.region===activeRegion)&&(activeStatus==="Alle"||s.status===activeStatus)&&(!favoritesOnly||s.favorite)&&(!searchTerm||hay.includes(searchTerm));
  }
  function renderList(){
    const list=camps.filter(matches).sort((a,b)=>routeRank(a)-routeRank(b)||rank(b)-rank(a)||a.name.localeCompare(b.name,"de"));
    document.getElementById("campList").innerHTML=list.length?list.map(c=>{
      const s=cs(c.id),q=quality(c);
      return `<article class="camp-card compact"><div class="camp-card__top"><div><div class="camp-label-row"><span class="region">${esc(c.region)}</span><span class="priority-mini priority-${letter(c).toLowerCase()}">${letter(c)}</span></div><h3>${esc(c.name)}</h3><p>${esc(c.place)}</p></div><button class="list-favorite ${s.favorite?"active":""}" data-favorite="${esc(c.id)}">${s.favorite?"★":"☆"}</button></div><div class="card-meta"><span class="quality ${q.key}">${q.icon} ${q.text}</span><span class="status status-${s.status}">${labels[s.status]}</span></div>${s.notes?`<p class="saved-note">${esc(s.notes)}</p>`:""}<div class="compact-actions"><button data-focus="${esc(c.id)}">Im Assistenten öffnen</button><button data-edit="${esc(c.id)}">Bearbeiten</button></div></article>`
    }).join(""):'<article class="panel empty-list"><h3>Keine Treffer</h3><p>Suchbegriff oder Filter ändern.</p></article>';
    document.querySelectorAll("[data-focus]").forEach(b=>b.onclick=()=>{
      const c=camps.find(x=>x.id===b.dataset.focus);if(!c)return;
      if(!active(c)){state[c.id]={...cs(c.id),status:"offen"};persist(false)}
      currentCampId=c.id;skipped.delete(c.id);render();focusCockpit();
    });
    document.querySelectorAll("[data-favorite]").forEach(b=>b.onclick=()=>{const id=b.dataset.favorite;state[id]={...cs(id),favorite:!cs(id).favorite};persist()});
    document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openDialog(camps.find(c=>c.id===b.dataset.edit)));
  }
  function render(){renderSummary();renderCockpit();renderList()}

  function openDialog(c={}){
    const d=document.getElementById("campDialog");
    document.getElementById("campId").value=c.id||"";
    document.getElementById("campName").value=c.name||"";
    document.getElementById("campRegion").value=c.region||"Soča-Tal";
    document.getElementById("campPlace").value=c.place||"";
    document.getElementById("campPriority").value=letter(c)||"B";
    document.getElementById("campPhone").value=c.phone||"";
    document.getElementById("campWebsite").value=c.website||"";
    document.getElementById("campNote").value=c.note||"";
    if(typeof d.showModal==="function")d.showModal();else d.setAttribute("open","");
  }
  function closeDialog(){const d=document.getElementById("campDialog");if(typeof d.close==="function")d.close();else d.removeAttribute("open")}
  document.getElementById("closeCampDialog").addEventListener("click",closeDialog);
  document.getElementById("campDialog").addEventListener("click",e=>{if(e.target===e.currentTarget)closeDialog()});
  document.getElementById("campForm").addEventListener("submit",e=>{
    e.preventDefault();
    const name=document.getElementById("campName").value.trim();
    if(!name){toast("Bitte einen Namen eingeben");return}
    const id=document.getElementById("campId").value||`custom-${Date.now()}`;
    const existing=camps.find(c=>c.id===id)||{};
    const place=document.getElementById("campPlace").value.trim();
    const obj={...existing,id,name,region:document.getElementById("campRegion").value,place,priorityLetter:document.getElementById("campPriority").value,phone:document.getElementById("campPhone").value.trim(),website:document.getElementById("campWebsite").value.trim(),note:document.getElementById("campNote").value.trim(),maps:existing.maps||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name+" "+place)}`,bike:existing.bike||3,water:existing.water||3,family:existing.family||3};
    const i=customCamps.findIndex(c=>c.id===id);
    if(i>=0)customCamps[i]=obj;else customCamps.push(obj);
    camps=mergeCamps();
    closeDialog();persist();toast("Campingplatz gespeichert");
  });

  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>go(b.dataset.page));
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  document.getElementById("addCampBtn").onclick=()=>openDialog();
  document.querySelectorAll("#regionFilter button").forEach(b=>b.onclick=()=>{activeRegion=b.dataset.region;document.querySelectorAll("#regionFilter button").forEach(x=>x.classList.toggle("active",x===b));renderList()});
  document.getElementById("statusFilter").onchange=e=>{activeStatus=e.target.value;renderList()};
  document.getElementById("campSearch").oninput=e=>{searchTerm=e.target.value.trim().toLowerCase();renderList()};
  document.getElementById("favoriteFilter").onclick=e=>{favoritesOnly=!favoritesOnly;e.currentTarget.classList.toggle("active",favoritesOnly);e.currentTarget.setAttribute("aria-pressed",String(favoritesOnly));e.currentTarget.textContent=favoritesOnly?"★ Favoriten":"☆ Nur Favoriten";renderList()};

  document.querySelectorAll("[data-persist]").forEach(el=>{el.checked=!!state[`check:${el.dataset.persist}`];el.onchange=()=>{state[`check:${el.dataset.persist}`]=el.checked;persist(false)}});
  document.getElementById("themeToggle").onclick=()=>{const dark=document.documentElement.classList.toggle("dark");localStorage.setItem(THEME_KEY,dark?"dark":"light")};
  if(localStorage.getItem(THEME_KEY)==="dark")document.documentElement.classList.add("dark");
  document.getElementById("exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify({state,customCamps},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="roadbook-4-3-1-sicherung.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};
  document.getElementById("importFile").onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());state=data.state||data||{};customCamps=data.customCamps||[];camps=mergeCamps();persist();toast("Sicherung importiert")}catch{alert("Die Sicherung konnte nicht gelesen werden.")}};
  document.getElementById("resetBtn").onclick=()=>{if(confirm("Alle lokalen Status, Notizen und Favoriten löschen?")){localStorage.removeItem(KEY);localStorage.removeItem(CUSTOM_KEY);location.reload()}};

  const start=new Date("2026-08-08T00:00:00"),days=Math.ceil((start-new Date())/86400000);
  document.getElementById("countdown").textContent=days>1?`${days} Tage`:days===1?"1 Tag":days===0?"Heute":"gestartet";
  if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});
  render();
})();
