
const STORE="roadbook-v3-state";
const CUSTOM="roadbook-v3-custom";
let base=[], camps=[], region="Alle";
let state=JSON.parse(localStorage.getItem(STORE)||"{}");
let custom=JSON.parse(localStorage.getItem(CUSTOM)||"[]");

const statusNames={offen:"Noch anrufen","keine-antwort":"Keine Antwort",rueckruf:"Rückruf",warteliste:"Warteliste",reserviert:"Reserviert",ausgebucht:"Ausgebucht"};
const esc=s=>(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function toast(s){const t=document.querySelector("#toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),900)}
function save(){localStorage.setItem(STORE,JSON.stringify(state));localStorage.setItem(CUSTOM,JSON.stringify(custom));render()}
function st(id){return state[id]||{status:"offen",notes:"",callback:"",price:"",calledAt:""}}
function updateState(id,key,value){state[id]={...st(id),[key]:value};if(key==="status"&&value!=="offen"&&!st(id).calledAt)state[id].calledAt=new Date().toISOString();save()}
function stars(n){return "★".repeat(n)+"☆".repeat(5-n)}
function phoneHref(phone){return phone?"tel:"+phone.replace(/[^\d+]/g,""):"#"}
function nextOpen(){return camps.filter(c=>st(c.id).status==="offen").sort((a,b)=>b.priority-a.priority)[0]}

async function init(){
  base=await fetch("data/campsites.json").then(r=>r.json());
  camps=[...base,...custom];bind();render();countdown();
}
function bind(){
 document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
 document.querySelector("#homeNext").onclick=()=>showPage("camping");
 document.querySelectorAll("[data-region]").forEach(b=>b.onclick=()=>{region=b.dataset.region;document.querySelectorAll("[data-region]").forEach(x=>x.classList.toggle("active",x===b));renderList()});
 document.querySelector("#statusFilter").onchange=renderList;
 document.querySelector("#callNext").onclick=()=>{const n=nextOpen();if(!n)return toast("Keine offenen Plätze");document.querySelector(`[data-card="${n.id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});toast(n.name)};
 document.querySelector("#addBtn").onclick=()=>openDialog();
 document.querySelector("#saveCamp").onclick=e=>{e.preventDefault();saveDialog()};
 document.querySelectorAll("[data-save]").forEach(x=>{x.checked=!!state["_form_"+x.id];x.onchange=()=>{state["_form_"+x.id]=x.checked;save()}});
 document.querySelector("#exportBtn").onclick=exportData;
 document.querySelector("#importFile").onchange=importData;
 document.querySelector("#resetBtn").onclick=()=>{if(confirm("Alle Status, Notizen und eigenen Plätze löschen?")){localStorage.removeItem(STORE);localStorage.removeItem(CUSTOM);location.reload()}};
}
function showPage(id){
 document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===id));
 document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
 window.scrollTo({top:0,behavior:"smooth"});
}
function render(){
 camps=[...base,...custom];
 renderSummary();renderList();
 const n=nextOpen();
 document.querySelector("#nextName").textContent=n?n.name:"Alle Plätze bearbeitet";
 document.querySelector("#nextPlace").textContent=n?`${n.region} · ${n.place}`:"Keine offenen Einträge";
}
function renderSummary(){
 const values=camps.map(c=>st(c.id).status), total=camps.length;
 const called=values.filter(x=>x!=="offen").length, booked=values.filter(x=>x==="reserviert").length, open=values.filter(x=>x==="offen").length;
 document.querySelector("#summary").innerHTML=`<div class="sum"><strong>${open}</strong><span>OFFEN</span></div><div class="sum"><strong>${values.filter(x=>["rueckruf","warteliste"].includes(x)).length}</strong><span>NACHFASSEN</span></div><div class="sum"><strong>${booked}</strong><span>RESERVIERT</span></div>`;
 document.querySelector("#calledMetric").textContent=`${called} / ${total}`;
 document.querySelector("#bookedMetric").textContent=booked;
 document.querySelector("#openHero").textContent=open;
 document.querySelector("#callBar").style.width=(total?called/total*100:0)+"%";
}
function renderList(){
 const filter=document.querySelector("#statusFilter")?.value||"Alle";
 const list=camps.filter(c=>(region==="Alle"||c.region===region)&&(filter==="Alle"||st(c.id).status===filter))
 .sort((a,b)=>{const order={reserviert:5,ausgebucht:4,warteliste:3,rueckruf:2,"keine-antwort":1,offen:0};return order[st(a.id).status]-order[st(b.id).status]||b.priority-a.priority});
 document.querySelector("#campList").innerHTML=list.length?list.map(card).join(""):`<article class="card"><p class="muted">Keine passenden Plätze.</p></article>`;
 document.querySelectorAll("[data-status]").forEach(x=>x.onchange=()=>updateState(x.dataset.status,"status",x.value));
 document.querySelectorAll("[data-notes]").forEach(x=>x.onchange=()=>updateState(x.dataset.notes,"notes",x.value));
 document.querySelectorAll("[data-callback]").forEach(x=>x.onchange=()=>updateState(x.dataset.callback,"callback",x.value));
 document.querySelectorAll("[data-price]").forEach(x=>x.onchange=()=>updateState(x.dataset.price,"price",x.value));
 document.querySelectorAll("[data-edit]").forEach(x=>x.onclick=()=>openDialog(camps.find(c=>c.id===x.dataset.edit)));
 document.querySelectorAll("[data-delete]").forEach(x=>x.onclick=()=>{if(confirm("Eigenen Campingplatz löschen?")){custom=custom.filter(c=>c.id!==x.dataset.delete);delete state[x.dataset.delete];save()}});
}
function card(c){
 const s=st(c.id), phone=c.phone?`<a class="call" href="${phoneHref(c.phone)}">☎ Anrufen</a>`:`<button onclick="openDialog(camps.find(x=>x.id==='${c.id}'))">☎ Ergänzen</button>`;
 return `<article class="camp-card" data-card="${c.id}">
 <div class="camp-top"><div><div class="region">${esc(c.region)}</div><h3>${esc(c.name)}</h3><div class="muted">${esc(c.place)}</div></div><span class="status status-${s.status}">${statusNames[s.status]}</span></div>
 <div class="rating">🚴 ${stars(c.bike||3)} · 🏊 ${stars(c.water||3)} · 👦 ${stars(c.family||3)}</div>
 <p class="muted">${esc(c.note)}</p>
 <div class="contact">${phone}<a href="${c.website}" target="_blank">🌐 Website</a><a href="${c.maps}" target="_blank">📍 Karte</a></div>
 <select data-status="${c.id}">${Object.entries(statusNames).map(([v,n])=>`<option value="${v}" ${s.status===v?"selected":""}>${n}</option>`).join("")}</select>
 <div class="callback"><input type="datetime-local" data-callback="${c.id}" value="${s.callback||""}" title="Rückrufzeit"><input type="number" data-price="${c.id}" value="${s.price||""}" placeholder="Preis in €"></div>
 <textarea data-notes="${c.id}" placeholder="Gespräch, Ansprechpartner, Zeitraum, Bedingungen">${esc(s.notes)}</textarea>
 <div class="tiny-actions"><button data-edit="${c.id}">Bearbeiten</button>${c.custom?`<button data-delete="${c.id}">Löschen</button>`:""}</div>
 </article>`;
}
function openDialog(c){
 document.querySelector("#editId").value=c?.id||"";
 document.querySelector("#fName").value=c?.name||"";
 document.querySelector("#fRegion").value=c?.region||"Soča-Tal";
 document.querySelector("#fPlace").value=c?.place||"";
 document.querySelector("#fPhone").value=c?.phoneDisplay==="Telefon ergänzen"?"":(c?.phoneDisplay||"");
 document.querySelector("#fWebsite").value=c?.website||"";
 document.querySelector("#fNote").value=c?.note||"";
 document.querySelector("#campDialog").showModal();
}
function saveDialog(){
 const id=document.querySelector("#editId").value;
 const obj={id:id||"custom-"+Date.now(),region:document.querySelector("#fRegion").value,name:document.querySelector("#fName").value.trim(),place:document.querySelector("#fPlace").value.trim(),phone:document.querySelector("#fPhone").value.trim(),phoneDisplay:document.querySelector("#fPhone").value.trim()||"Telefon ergänzen",email:"",website:document.querySelector("#fWebsite").value.trim()||"#",maps:"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(document.querySelector("#fName").value+" "+document.querySelector("#fPlace").value),bike:3,water:3,family:3,priority:6,note:document.querySelector("#fNote").value.trim(),custom:true};
 if(!obj.name)return;
 const ix=custom.findIndex(x=>x.id===obj.id);
 if(ix>=0)custom[ix]=obj;else if(id){const baseIx=base.findIndex(x=>x.id===id);if(baseIx>=0){base[baseIx]={...base[baseIx],...obj,custom:false}}}else custom.push(obj);
 document.querySelector("#campDialog").close();save();toast("Campingplatz gespeichert");
}
function exportData(){
 const blob=new Blob([JSON.stringify({state,custom},null,2)],{type:"application/json"}),a=document.createElement("a");
 a.href=URL.createObjectURL(blob);a.download="roadbook-camping-sicherung.json";a.click();URL.revokeObjectURL(a.href);
}
async function importData(e){
 try{const x=JSON.parse(await e.target.files[0].text());state=x.state||{};custom=x.custom||[];save();toast("Importiert")}catch{alert("Datei konnte nicht gelesen werden.")}
}
function countdown(){
 const d=Math.ceil((new Date("2026-08-08T08:00:00")-new Date())/86400000);
 document.querySelector("#countdown").textContent=d>0?d+" Tage":"Los geht’s";
}
window.openDialog=openDialog;
init();
