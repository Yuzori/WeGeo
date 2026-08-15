(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))o(t);new MutationObserver(t=>{for(const n of t)if(n.type==="childList")for(const a of n.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&o(a)}).observe(document,{childList:!0,subtree:!0});function r(t){const n={};return t.integrity&&(n.integrity=t.integrity),t.referrerPolicy&&(n.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?n.credentials="include":t.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function o(t){if(t.ep)return;t.ep=!0;const n=r(t);fetch(t.href,n)}})();const w={API_KEY:"AIzaSyC-BsIG81-HD3LpGc0F3TM2O_ymGLOX50Q",API_URL:"https://places.googleapis.com/v1/places:searchText"},C=["Restaurants","Coiffeurs","Plombiers","Électriciens","Avocats","Dentistes","Agents Immobiliers","Salles de Sport","Garages Auto","Fleuristes","Boulangeries","Opticiens","Cliniques Vétérinaires","Hôtels","Instituts de Beauté","Experts Comptables","Architectes","Maçons","Paysagistes","Photographes","Traiteurs","Menuisiers"],k=["Paris","Marseille","Lyon","Toulouse","Nice","Nantes","Montpellier","Strasbourg","Bordeaux","Lille","Rennes","Reims","Saint-Étienne","Toulon","Le Havre","Grenoble","Dijon","Angers","Villeurbanne","Saint-Denis","Nîmes","Clermont-Ferrand","Le Mans","Aix-en-Provence","Brest","Tours","Amiens","Limoges","Annecy","Perpignan"],s={results:[],favorites:JSON.parse(localStorage.getItem("prospectos_favorites"))||[],history:JSON.parse(localStorage.getItem("prospectos_history"))||[],done:JSON.parse(localStorage.getItem("prospectos_done"))||[],pendingDeleteAction:null};document.addEventListener("DOMContentLoaded",()=>{var o;lucide.createIcons();const e=document.getElementById("input-activity");e&&C.sort().forEach(t=>{const n=document.createElement("option");n.value=t,n.textContent=t,e.appendChild(n)});const i=document.getElementById("cities-list");i&&k.sort().forEach(t=>{const n=document.createElement("option");n.value=t,i.appendChild(n)});const r=document.getElementById("btn-search");r?(console.log("Search button found, attaching listener"),r.addEventListener("click",()=>{console.log("Search button clicked"),S()})):console.error("CRITICAL: Search button not found in DOM"),(o=document.querySelector('.icon-btn[title="Paramètres"]'))==null||o.addEventListener("click",()=>{console.log("Opening settings"),document.getElementById("modal-settings").classList.remove("hidden")}),document.querySelectorAll(".close-modal, #btn-cancel-confirm").forEach(t=>{t.addEventListener("click",()=>{const n=t.dataset.target||t.closest(".modal").id;document.getElementById(n).classList.add("hidden")})}),document.getElementById("btn-yes-confirm").addEventListener("click",z),j()});async function S(e=null){console.log("handleSearch triggered",{overrideQuery:e});let i=document.getElementById("input-activity").value,r=document.getElementById("input-location").value.trim();if(console.log("Values:",{activity:i,location:r}),e){const t=e.split(" à ");if(t.length===2){i=t[0],r=t[1];const n=document.getElementById("input-activity");[...n.options].some(a=>a.value===i)&&(n.value=i),document.getElementById("input-location").value=r}}if(!i||!r){c("Veuillez choisir une niche et une ville.");return}P("search-view");const o=document.getElementById("results-container");o.innerHTML='<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4rem; height: 300px;"><div class="spinner"></div><p style="color:var(--text-muted); font-size:1.1rem; margin-top:1rem;">Recherche "Sans Site" prioritaire...</p></div>';try{const t=await $(i,r);let n=t.places?t.places.map(a=>M(a)):[];n=n.sort(()=>Math.random()-.5),n.sort((a,u)=>u.score-a.score),s.results=n,N(`${i} à ${r}`),y()}catch(t){console.error("Search failed:",t),o.innerHTML=`
        <div class="empty-state">
            <i data-lucide="alert-triangle" class="empty-icon" style="color:var(--danger)"></i>
            <p>Erreur: ${t.message}</p>
        </div>
    `,lucide.createIcons()}}async function $(e,i){var t;const r=`${e} in ${i}`,o=await fetch(w.API_URL,{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":w.API_KEY,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber,places.types,places.businessStatus"},body:JSON.stringify({textQuery:r,maxResultCount:50})});if(!o.ok){const n=await o.json();throw new Error(((t=n.error)==null?void 0:t.message)||"API Error")}return await o.json()}function M(e){var t;let r=0,o="none";if(!e.websiteUri)r+=40;else{const n=e.websiteUri.toLowerCase();n.includes("facebook")||n.includes("instagram")||n.includes("planity")||n.includes("ubereats")||n.includes("treatwell")?(r+=25,o="platform"):o="website"}return(!e.rating||e.rating<4)&&(r+=20),(!e.userRatingCount||e.userRatingCount<10)&&(r+=20),e.userRatingCount>100&&(r-=10),e.internationalPhoneNumber||(r+=10),r=Math.max(0,Math.min(100,r)),{id:e.id,name:((t=e.displayName)==null?void 0:t.text)||"Nom inconnu",address:e.formattedAddress||"Adresse inconnue",rating:e.rating||"N/A",reviews:e.userRatingCount||0,website:e.websiteUri||null,websiteType:o,phone:e.internationalPhoneNumber||null,score:r,contacted:!1}}function h(e,i=0,r="search"){let o="score-low";e.score>=70?o="score-high":e.score>=40&&(o="score-med");const t=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.name+" "+e.address)}`;let n='<span style="color:var(--text-muted)">Pas de site web</span>',a='<span class="chip" style="color:var(--danger); background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.2)">Pas de site</span>';if(e.websiteType==="website")n=`<a href="${e.website}" target="_blank" style="color:var(--primary); text-decoration:none; border-bottom:1px solid rgba(139, 92, 246, 0.3)">Site Web</a>`,a="";else if(e.websiteType==="platform"){let d="Plateforme tierce";e.website.includes("instagram")&&(d="Instagram"),e.website.includes("facebook")&&(d="Facebook"),e.website.includes("planity")&&(d="Planity"),e.website.includes("ubereats")&&(d="UberEats"),n=`<a href="${e.website}" target="_blank" style="color:var(--warning); text-decoration:none; border-bottom:1px solid rgba(245, 158, 11, 0.3)">${d}</a>`,a=`<span class="chip" style="color:var(--warning); background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.2)">${d}</span>`,n=`<a href="${e.website}" target="_blank" style="color:var(--warning); text-decoration:none; border-bottom:1px solid rgba(245, 158, 11, 0.3)">${d}</a>`,a=`<span class="chip" style="color:var(--warning); background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.2)">${d}</span>`}e.contacted,e.contacted;let u="";e.reviews<10&&(u=`<span class="chip" style="color:var(--warning); background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.2)">Peu d'avis</span>`);const T=e.phone?`<a href="tel:${e.phone.replace(/\s/g,"")}" style="color:var(--text-muted); text-decoration:none; transition:0.2s;" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'">${e.phone}</a>`:"Non renseigné",q=O(e.id)?"fill-current":"";let v="";const g=`
        <button class="action-btn" title="Exporter Sheet" onclick="copyToClipboard('${e.id}')">
            <i data-lucide="sheet"></i>
        </button>`,f=`
        <button class="action-btn" title="Voir fiche" onclick="window.open('${t}', '_blank')">
            <i data-lucide="eye"></i>
        </button>`;if(r==="search"){const d=`
        <button class="action-btn" title="Favoris" onclick="toggleFavorite('${e.id}')">
            <i data-lucide="bookmark" class="${q}"></i>
        </button>`;v=g+f+d}else if(r==="favorites"){const d=`
        <button class="action-btn" title="Supprimer" style="color:var(--danger); border-color:var(--danger);" onclick="deleteFavorite('${e.id}')">
            <i data-lucide="trash-2"></i>
        </button>`,A=`
        <button class="action-btn" title="Marquer comme fait" style="color:var(--accent); border-color:var(--accent);" onclick="toggleDone('${e.id}')">
            <i data-lucide="check"></i>
        </button>`;v=d+A+g+f}else r==="done"&&(v=`
        <button class="action-btn" title="Remettre en favoris" onclick="toggleDone('${e.id}')">
            <i data-lucide="rotate-ccw"></i>
        </button>`+g+f);return`
      <div class="card-badge">
        <span class="score-indicator ${o}">${e.score}</span>
      </div>
      <div class="card-header">
        <div>
            <h3 class="card-title">${e.name}</h3>
            <div class="info-row" style="color:var(--warning)">
                <i data-lucide="star" style="fill:var(--warning); color:var(--warning)"></i>
                <span>${e.rating} (${e.reviews} avis)</span>
            </div>
        </div>
      </div>

      <a href="${t}" target="_blank" class="info-row" style="text-decoration:none; transition:0.2s; cursor:pointer;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--text-muted)'">
        <i data-lucide="map-pin"></i>
        <span>${e.address}</span>
      </a>
      
      <div class="info-row">
        <i data-lucide="globe"></i>
        ${n}
      </div>

      <div class="info-row">
        <i data-lucide="phone"></i>
        <span>${T}</span>
      </div>

      <div class="chips-container">
        ${a}
        ${u}
      </div>

      <div class="card-actions">
        ${v}
      </div>
    `}window.deleteFavorite=function(e){toggleFavorite(e)};window.toggleContacted=function(e){const i=s.results.find(r=>r.id===e)||s.favorites.find(r=>r.id===e);i&&(i.contacted=!i.contacted,s.results.length>0&&y(),s.favorites.length>0&&document.getElementById("favorites-view").classList.contains("active")&&p(),l())};function y(){const e=document.getElementById("results-container");e.innerHTML="";const i=s.results.filter(r=>!(s.favorites.some(o=>o.id===r.id)||s.done.some(o=>o.id===r.id)));if(B(i.length,i.filter(r=>r.websiteType==="none").length,i.filter(r=>r.score>=50).length),i.length===0){e.innerHTML=`
        <div class="empty-state">
            <i data-lucide="search-code" class="empty-icon" style="color:var(--primary); width:80px; height:80px; margin-bottom:1.5rem;"></i>
            <h3 style="margin-bottom:0.5rem; font-size:1.5rem;">Trouvez vos prochains clients</h3>
            <p style="max-width:400px; margin:0 auto;">Lancez une recherche ci-dessus.</p>
        </div>`,lucide.createIcons();return}i.forEach((r,o)=>{const t=document.createElement("div");t.className="prospect-card fade-in",t.style.animationDelay=`${Math.min(o*.03,1)}s`,t.innerHTML=h(r,o),e.appendChild(t)}),lucide.createIcons()}function B(e,i,r){const o=document.querySelector(".filters-bar");if(!o)return;let t=o.querySelector(".summary-stats");t||(t=document.createElement("div"),t.className="summary-stats",o.appendChild(t)),t.innerHTML=`
        <div class="stat-item">
            <strong>${e}</strong>
            <span>Résultats</span>
        </div>
        <div class="stat-item">
            <strong style="color:var(--danger)">${i}</strong>
            <span>Sans site</span>
        </div>
        <div class="stat-item">
            <strong style="color:var(--accent)">${r}</strong>
            <span>Top Score</span>
        </div>
    `}window.openPitchModal=async function(e){const i=s.results.find(a=>a.id===e)||s.favorites.find(a=>a.id===e);if(!i)return;const r=document.getElementById("modal-pitch"),o=document.getElementById("pitch-loader"),t=document.getElementById("pitch-output");r.classList.remove("hidden"),t.classList.add("hidden"),o.classList.remove("hidden"),t.innerHTML="",await new Promise(a=>setTimeout(a,2e3));const n=E(i);o.classList.add("hidden"),t.classList.remove("hidden"),t.innerHTML=n,t.classList.add("fade-in"),lucide.createIcons()};function E(e){var n;const i=e.websiteType==="none"||e.websiteType==="platform",r=((n=document.getElementById("input-activity"))==null?void 0:n.value)||"votre activité";let o="";i?o=`
            <div style="margin-bottom:2rem; border-left:4px solid var(--danger); padding-left:1.5rem;">
                 <h3 style="color:var(--danger); margin-bottom:1rem;">🎯 STRATÉGIE : VISIBILITÉ (Pas de site)</h3>
                 
                 <div style="margin-bottom:1.5rem;">
                    <strong style="color:var(--text-main); display:block; margin-bottom:0.5rem;">L'Accroche :</strong>
                    <p style="font-style:italic; color:var(--text-muted); line-height:1.6;">"Bonjour ${e.name}, c'est (Ton Prénom). Je vous appelle car j'ai cherché vos services sur Google ce matin et je ne vous ai pas trouvé, alors que vos concurrents sont très bien placés. Vous avez 30 secondes pour qu'on change ça ?"</p>
                 </div>

                 <div style="margin-bottom:1.5rem;">
                    <strong style="color:var(--text-main); display:block; margin-bottom:0.5rem;">Le Constat :</strong>
                    <p style="font-style:italic; color:var(--text-muted); line-height:1.6;">"Aujourd'hui, 80% des clients vérifient une entreprise sur le web avant d'appeler. Sans site, vous donnez littéralement vos clients à la concurrence. C'est dommage parce que votre réputation sur Google est excellente."</p>
                 </div>

                 <div style="margin-bottom:1.5rem;">
                    <strong style="color:var(--text-main); display:block; margin-bottom:0.5rem;">L'Offre Irrésistible :</strong>
                    <p style="font-style:italic; color:var(--text-muted); line-height:1.6;">"Écoutez, je ne vais pas vous demander d'investir des milliers d'euros sans preuve. Je vous propose de créer une maquette visuelle complète de ce que serait votre futur site pro. Je vous montre ça jeudi ou vendredi. Si vous adorez, on travaille ensemble. Sinon, on s'arrête là. Est-ce que ça vous aiderait d'y voir plus clair ?"</p>
                 </div>
            </div>
        `:o=`
            <div style="margin-bottom:2rem; border-left:4px solid var(--warning); padding-left:1.5rem;">
                 <h3 style="color:var(--warning); margin-bottom:1rem;">🎯 STRATÉGIE : MODERNISATION (Site Obsolète)</h3>
                 
                 <div style="margin-bottom:1.5rem;">
                    <strong style="color:var(--text-main); display:block; margin-bottom:0.5rem;">L'Accroche :</strong>
                    <p style="font-style:italic; color:var(--text-muted); line-height:1.6;">"Bonjour ${e.name}, c'est (Ton Prénom). Je suis tombé sur votre site internet en cherchant ${r}. Je vous appelle parce que j'ai relevé deux points techniques qui bloquent vos clients sur mobile. Je vous dérange ou vous avez une minute ?"</p>
                 </div>

                 <div style="margin-bottom:1.5rem;">
                    <strong style="color:var(--text-main); display:block; margin-bottom:0.5rem;">Le Constat :</strong>
                    <p style="font-style:italic; color:var(--text-muted); line-height:1.6;">"Votre site actuel ne rend pas justice à la qualité de votre travail. Il n'est plus aux standards actuels. Aujourd'hui, un client qui arrive sur un site lent repart en moins de 3 secondes. Vous payez pour un site qui vous fait perdre de l'argent."</p>
                 </div>

                 <div style="margin-bottom:1.5rem;">
                    <strong style="color:var(--text-main); display:block; margin-bottom:0.5rem;">L'Offre Irrésistible :</strong>
                    <p style="font-style:italic; color:var(--text-muted); line-height:1.6;">"Au lieu de vous faire un long discours, je préfère vous montrer le potentiel de votre marque. Je vais réaliser une version moderne et optimisée de votre page d'accueil (une maquette). C'est gratuit et ça vous permet de comparer avec l'existant. On se cale un créneau pour que je vous présente ça ?"</p>
                 </div>
            </div>
        `;const t=`
        <div style="margin-top:2rem; background:rgba(255,255,255,0.03); padding:1.5rem; border-radius:12px;">
            <h4 style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1.5rem; font-size:1.1rem; color:var(--primary);">
                <i data-lucide="shield-question"></i> Réponses aux Objections (FAQ)
            </h4>
            
            <div style="display:grid; gap:1rem;">
                <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"Ça ne m'intéresse pas."</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "Je comprends tout à fait. C'est juste que je vois que vous avez ${e.reviews} avis positifs google, mais pas de site pour convertir ces gens en clients. C'est dommage de laisser cet argent sur la table, non ?"
                    </div>
                </details>
                
                <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"C'est trop cher."</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "Justement, je ne vous ai pas encore donné de prix ! Et surtout, je vous propose de voir la maquette GRATUITEMENT avant de décider quoi que ce soit. Vous ne prenez aucun risque."
                    </div>
                </details>

                 <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"J'ai déjà quelqu'un / J'ai un neveu qui s'en occupe."</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "Super ! Mais est-ce que votre neveu vous apporte des clients tous les mois ? Mon métier c'est pas juste de faire des jolis sites, c'est de remplir votre agenda. Laissez-moi juste vous montrer la différence avec une maquette pro."
                    </div>
                </details>

                <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"Envoyez-moi un mail."</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "Je peux le faire, mais un mail va finir à la poubelle. Je préfère passer 15min à vous montrer du concret (la maquette). C'est beaucoup plus parlant. Disons mardi 11h ?"
                    </div>
                </details>

                 <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"Je n'ai pas le temps."</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "Je me doute que vous êtes débordé, c'est bon signe ! C'est pour ça que je veux être rapide. 30 secondes pour vous expliquer comment on peut automatiser votre prise de rdv grâce au site. Ça vous fera gagner du temps."
                    </div>
                </details>

                <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"On verra plus tard / Rappelez dans 6 mois."</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "Pas de souci. Mais dans 6 mois, vos concurrents auront pris encore plus d'avance. Google n'attend pas. La maquette ne vous engage à rien, pourquoi ne pas juste jeter un œil maintenant ?"
                    </div>
                </details>

                 <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"Je ne crois pas au site web, le bouche à oreille suffit."</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "Le bouche à oreille c'est génial. Mais le premier réflexe de quelqu'un à qui on vous recommande, c'est de taper votre nom sur Google. S'il ne trouve rien, il doute. Le site sert à RASSURER votre bouche à oreille."
                    </div>
                </details>

                <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"Combien ça coûte ?" (Dès le début)</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "C'est comme pour une voiture, ça dépend des options ! Mais je ne veux pas parler d'argent tant que je ne sais pas si je peux vous aider. Regardons d'abord la maquette, et si ça vous plaît, on trouvera un arrangement."
                    </div>
                </details>

                 <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"Je suis engagé ailleurs."</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "D'accord. Est-ce que vous êtes 100% satisfait des résultats ? Si oui, gardez-les. Si vous pensez qu'on peut faire mieux, ça ne coûte rien de comparer avec ma maquette."
                    </div>
                </details>
                
                 <details style="background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
                    <summary style="padding:1rem; cursor:pointer; font-weight:600;">"Comment vous m'avez trouvé ?"</summary>
                    <div style="padding:1rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05);">
                        "Comme vos clients : sur Google ! J'ai tapé '${r} à ${e.address.split(",")[1]||"votre ville"}' et j'ai vu que vous étiez invisible/mal référencé. C'est pour ça que je vous appelle."
                    </div>
                </details>
            </div>
        </div>
    `;return o+t}window.copyToClipboard=function(e){const i=s.results.find(t=>t.id===e)||s.favorites.find(t=>t.id===e);if(!i)return;const r=t=>(t||"").toString().replace(/[\r\n\t]/g," ").trim(),o=`${r(i.name)}	${r(i.address)}	${r(i.phone)}	${r(i.website)}`;navigator.clipboard.writeText(o).then(()=>{c("Copié ! Prêt pour Google Sheets.")}).catch(t=>{console.error(t),c("Erreur de copie")})};function c(e){const i=Date.now();if(i-m.lastToast<1500)return;m.lastToast=i,l();const r=document.getElementById("toast-container");if(r.children.length>=3)return;const o=document.createElement("div");o.className="toast",o.innerHTML=`<i data-lucide="check-circle" style="color:var(--accent)"></i> <span>${e}</span><div class="toast-progress"></div>`,r.appendChild(o),lucide.createIcons(),setTimeout(()=>{o.classList.add("fade-out"),setTimeout(()=>o.remove(),400)},3e3)}function I(e){s.pendingDeleteAction=e;const i=document.getElementById("modal-confirm"),r=document.getElementById("confirm-message");e==="favorites"?r.innerText="Voulez-vous vraiment supprimer TOUS vos favoris ?":e==="history"&&(r.innerText="Voulez-vous vraiment effacer TOUT l'historique ?"),i.classList.remove("hidden")}function z(){s.pendingDeleteAction==="favorites"?(s.favorites=[],localStorage.setItem("prospectos_favorites",JSON.stringify([])),p(),c("Tous les favoris ont été supprimés.")):s.pendingDeleteAction==="history"?(s.history=[],localStorage.setItem("prospectos_history",JSON.stringify([])),L(),c("Historique effacé.")):s.pendingDeleteAction==="done"&&(s.done=[],localStorage.setItem("prospectos_done",JSON.stringify([])),b(),c("Liste 'Fait' vidée.")),document.getElementById("modal-confirm").classList.add("hidden")}function j(){const e=document.getElementById("mobile-menu-btn"),i=document.querySelector(".sidebar");e&&i&&e.addEventListener("click",()=>{i.classList.toggle("active")})}window.switchView=function(e){const i=document.querySelector(".sidebar");i&&i.classList.contains("active")&&i.classList.remove("active"),document.querySelectorAll(".nav-item").forEach(t=>t.classList.remove("active"));const r=Array.from(document.querySelectorAll(".nav-item")).find(t=>{var n;return(n=t.getAttribute("onclick"))==null?void 0:n.includes(e)});r&&r.classList.add("active"),document.querySelectorAll(".view").forEach(t=>t.classList.add("hidden"));const o=document.getElementById(e);o&&(o.classList.remove("hidden"),e==="favorites-view"&&p(),e==="history-view"&&L(),e==="done-view"&&b(),e==="prospecting-view"&&renderProspectingView())};function P(e){document.querySelectorAll(".nav-item").forEach(o=>o.classList.remove("active"));const i="nav-"+e.replace("-view",""),r=document.getElementById(i);r&&r.classList.add("active"),document.querySelectorAll(".view").forEach(o=>o.classList.add("hidden")),document.getElementById(e).classList.remove("hidden")}function p(){const e=document.getElementById("favorites-view");if(s.favorites.length===0)e.innerHTML=`
            <div class="empty-state">
                <i data-lucide="bookmark" class="empty-icon"></i>
                <p>Aucun favori enregistré.</p>
            </div>`;else{e.innerHTML=`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2>Vos Favoris</h2>
                <button class="action-btn" style="color:var(--danger); border-color:var(--danger);" onclick="window.confirmDeleteFavs()">
                    <i data-lucide="trash-2"></i> Tout supprimer
                </button>
            </div>
            <div class="results-grid" id="favorites-grid"></div>`;const i=e.querySelector("#favorites-grid");s.favorites.forEach((r,o)=>{const t=document.createElement("div");t.className="prospect-card",t.innerHTML=h(r,o,"favorites"),i.appendChild(t)})}lucide.createIcons()}function L(){const e=document.getElementById("history-view");if(s.history.length===0)e.innerHTML=`
            <div class="empty-state">
                <i data-lucide="history" class="empty-icon"></i>
                <p>Aucun historique.</p>
            </div>`;else{e.innerHTML=`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2>Historique de Recherche</h2>
                <button class="action-btn" style="color:var(--danger); border-color:var(--danger);" onclick="window.confirmDeleteHistory()">
                    <i data-lucide="trash-2"></i> Tout effacer
                </button>
            </div>
            <div class="results-grid" style="grid-template-columns:1fr;" id="history-grid"></div>`;const i=e.querySelector("#history-grid");s.history.forEach(r=>{const o=document.createElement("div");o.style.borderRadius="0.75rem",o.style.display="flex",o.style.justifyContent="space-between",o.style.cursor="pointer",o.style.transition="background 0.2s",o.onmouseover=()=>o.style.background="rgba(255,255,255,0.08)",o.onmouseout=()=>o.style.background="rgba(255,255,255,0.05)",o.onclick=()=>S(r.query);const t=new Date(r.date).toLocaleDateString()+" "+new Date(r.date).toLocaleTimeString();o.innerHTML=`
                <div style="display:flex; align-items:center; gap:1rem;">
                    <i data-lucide="rotate-ccw" style="color:var(--primary)"></i>
                    <span style="font-weight:600;">${r.query}</span>
                </div>
                <span style="color:var(--text-muted); font-size:0.8rem;">${t}</span>`,i.appendChild(o)})}lucide.createIcons()}function b(){const i=document.getElementById("done-view").querySelector("#done-grid");i.innerHTML="",s.done.length===0?i.innerHTML=`
            <div class="empty-state" style="grid-column: 1/-1;">
                <i data-lucide="check-circle" class="empty-icon" style="color:var(--accent)"></i>
                <p>Aucun prospect traité pour le moment.</p>
            </div>`:s.done.forEach((r,o)=>{const t=document.createElement("div");t.className="prospect-card",t.style.opacity="0.7",t.innerHTML=h(r,o,"done"),i.appendChild(t)}),lucide.createIcons()}window.toggleDone=function(e){if(s.done.some(o=>o.id===e)){const o=s.done.find(t=>t.id===e);s.done=s.done.filter(t=>t.id!==e),s.favorites.some(t=>t.id===e)||s.favorites.unshift(o),c("Remis dans les Favoris")}else{const o=s.favorites.find(t=>t.id===e)||s.results.find(t=>t.id===e);if(!o)return;s.favorites=s.favorites.filter(t=>t.id!==e),s.done.unshift(o),c("Marqué comme Fait ✅")}localStorage.setItem("prospectos_favorites",JSON.stringify(s.favorites)),localStorage.setItem("prospectos_done",JSON.stringify(s.done));const r=document.querySelector(".view:not(.hidden)");r.id==="favorites-view"&&p(),r.id==="done-view"&&b(),l()};window.confirmDeleteDone=function(){s.pendingDeleteAction="done";const e=document.getElementById("modal-confirm"),i=document.getElementById("confirm-message");i.innerText="Voulez-vous vraiment effacer la liste des prospects traités ?",e.classList.remove("hidden")};function N(e){s.history.length>0&&s.history[0].query===e||(s.history.unshift({query:e,date:new Date().toISOString()}),s.history.length>20&&s.history.pop(),s.history.length>20&&s.history.pop(),localStorage.setItem("prospectos_history",JSON.stringify(s.history)))}function O(e){return s.favorites.some(i=>i.id===e)}const m={sound:!0,lastToast:0};window.toggleSetting=function(e){if(e==="sound"){const i=document.getElementById("setting-sound");m.sound=i.checked,m.sound?(l(),c("🔊 Effets sonores activés")):c("🔇 Effets sonores désactivés")}else e==="expertMode"&&c("Mode Expert : Activé")};function l(){if(!m.sound)return;const e=new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3");e.volume=.2,e.play().catch(()=>{})}window.updateExportFormat=function(){const e=document.getElementById("setting-export-fmt").value;c(`Format d'export : ${e.toUpperCase()}`)};window.confirmResetApp=function(){confirm("ATTENTION: Cela va effacer toutes les données (Favoris, Historique, Cache). Continuer ?")&&(localStorage.clear(),location.reload())};window.toggleFavorite=function(e){const i=s.favorites.findIndex(o=>o.id===e);if(i>=0)s.favorites.splice(i,1),c("Retiré des favoris");else{const o=s.results.find(t=>t.id===e);o&&(s.favorites.push(o),c("Ajouté aux favoris"))}localStorage.setItem("prospectos_favorites",JSON.stringify(s.favorites)),!document.getElementById("search-view").classList.contains("hidden")?y():p()};window.confirmDeleteFavs=function(){I("favorites")};window.confirmDeleteHistory=function(){I("history")};class D{constructor(){this.canvas=document.getElementById("particles-canvas"),this.canvas&&(this.ctx=this.canvas.getContext("2d"),this.particles=[],this.active=!1,this.theme="default",window.addEventListener("resize",()=>this.resize()),this.resize(),this.animate())}resize(){this.canvas.width=window.innerWidth,this.canvas.height=window.innerHeight}setTheme(i){if(this.theme=i,this.particles=[],this.active=i==="sakura"||i==="ocean",this.active)for(let r=0;r<50;r++)this.particles.push(this.createParticle());else this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height)}createParticle(){return{x:Math.random()*this.canvas.width,y:Math.random()*this.canvas.height,size:Math.random()*3+1,speedY:Math.random()*1+.5,speedX:Math.random()*1-.5,opacity:Math.random()*.5+.1}}animate(){if(!this.active){requestAnimationFrame(()=>this.animate());return}this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height),this.particles.forEach(i=>{i.y+=i.speedY,i.x+=i.speedX,i.y>this.canvas.height&&(i.y=0),i.x>this.canvas.width&&(i.x=0),i.x<0&&(i.x=this.canvas.width),this.ctx.beginPath(),this.ctx.arc(i.x,i.y,i.size,0,Math.PI*2),this.theme==="sakura"?this.ctx.fillStyle=`rgba(255, 183, 197, ${i.opacity})`:this.theme==="ocean"&&(this.ctx.fillStyle=`rgba(100, 255, 255, ${i.opacity})`),this.ctx.fill()}),requestAnimationFrame(()=>this.animate())}}const R=new D;window.setTheme=function(e){document.documentElement.setAttribute("data-theme",e),localStorage.setItem("prospectos_theme",e),R.setTheme(e),c(`Thème appliqué : ${e.charAt(0).toUpperCase()+e.slice(1)}`)};window.renderProspectingView=function(){const e=document.getElementById("prospecting-view"),i=s.favorites.map(o=>`<option value="${o.id}">${o.name}</option>`).join("");e.innerHTML=`
        <div class="glass-panel" style="padding:2.5rem; max-width:900px; margin:2rem auto; border-radius:1rem;">
            <div style="text-align:center; margin-bottom:3rem;">
                <div style="background:var(--primary-glow); width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 1rem;">
                    <i data-lucide="graduation-cap" style="width:32px; height:32px; color:white;"></i>
                </div>
                <h2 style="font-size:2rem; margin-bottom:0.5rem;">Centre de Formation</h2>
                <p style="color:var(--text-muted);">Générez des scripts de vente sur-mesure pour vos prospects favoris.</p>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:2rem; margin-bottom:3rem;">
                <div style="background:rgba(255,255,255,0.03); padding:1.5rem; border-radius:1rem; border:1px solid var(--border-subtle);">
                    <h3 style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem; font-size:1.1rem;">
                        <span style="background:var(--primary); color:white; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">1</span>
                        Choisissez une Cible
                    </h3>
                    <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Sélectionnez un prospect que vous avez ajouté en favoris.</p>
                    <div class="input-group">
                        <i data-lucide="user" class="input-icon"></i>
                        <select id="prospect-select" style="width:100%;">
                            <option value="" disabled selected>Choisir un prospect...</option>
                            ${i}
                        </select>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.03); padding:1.5rem; border-radius:1rem; border:1px solid var(--border-subtle);">
                     <h3 style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem; font-size:1.1rem;">
                        <span style="background:var(--primary); color:white; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">2</span>
                        Lancez l'IA
                    </h3>
                    <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Notre IA va analyser le profil (Site, Avis, Activité) pour créer le script parfait.</p>
                    <button id="btn-generate-training" class="primary-btn" style="width:100%; height: 43px; justify-content:center; padding:1.25rem 2rem; min-height:60px; font-size:1.1rem; border-radius:8px; font-weight:600;">
                        <i data-lucide="zap" style="width:22px; height:22px;"></i> Générer le Script
                    </button>
                </div>
            </div>

            <div id="training-content" class="hidden fade-in">
                 <div class="divider"></div>
                 <div id="script-container" style="background:#1e1e24; padding:2rem; border-radius:1rem; border:1px solid var(--border-subtle); margin-top:2rem;"></div>
            </div>
        </div>
    `;const r=document.getElementById("prospect-select");r&&r.addEventListener("change",()=>l()),document.getElementById("btn-generate-training").onclick=()=>{const o=document.getElementById("prospect-select").value,t=s.favorites.find(u=>u.id===o);if(!t){c("Veuillez d'abord choisir un prospect favori"),l();return}const n=document.getElementById("script-container");document.getElementById("training-content").classList.remove("hidden"),n.innerHTML=`<div style="text-align:center; padding:2rem;"><div class="spinner"></div><p style="margin-top:1rem; color:var(--text-muted);">Rédaction du script pour ${t.name}...</p></div>`,l(),setTimeout(()=>{n.innerHTML=E(t),lucide.createIcons(),l()},1500)},lucide.createIcons()};const x=localStorage.getItem("prospectos_theme");x&&window.setTheme(x);
